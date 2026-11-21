import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { admin, allUsers, pinPassword, usernameOf } from "./pin-auth";
import { TABLES, type TableName } from "./types";
import { addShowcaseMock } from "./showcase-mock";

/**
 * The public showcase account: username "tester", PIN 0000. It holds an independent snapshot of the
 * owner's dashboard (new row ids, so edits in either account never touch the other).
 * Push subscriptions, sent-notification marks and PIN secrets are never copied.
 */

export const SHOWCASE_USERNAME = "tester";
export const SHOWCASE_PIN = "0000";
/** Bump when the showcase contents change, so the owner's next visit rebuilds it once. */
export const SHOWCASE_VERSION = 3;

export const isShowcase = (u: User | null | undefined) => !!u && (u.app_metadata?.showcase === true || usernameOf(u) === SHOWCASE_USERNAME);

/** The real owner: the oldest account that isn't the showcase. */
export async function ownerOf(users?: User[]): Promise<User | null> {
  const list = (users ?? (await allUsers())).filter((u) => !isShowcase(u));
  list.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return list[0] ?? null;
}

// Columns that point at another copied row, and the table that row lives in.
const LINKS: Partial<Record<TableName, Record<string, TableName>>> = {
  debts: { student_id: "students" },
  slots: { student_id: "students" },
  lessons: { student_id: "students" },
  homework: { student_id: "students" },
  receipts: { student_id: "students" },
  events: { student_id: "students" },
  tasks: { student_id: "students" },
  milestones: { task_id: "tasks" },
  habit_logs: { habit_id: "habits" },
};
// Tables whose link column is NOT NULL.
const REQUIRED: TableName[] = ["slots", "lessons", "homework", "receipts", "milestones", "habit_logs"];
// Parents before children, children deleted first.
const ORDER: TableName[] = ["students", "habits", "tasks", ...TABLES.filter((t) => !["students", "habits", "tasks"].includes(t))];

type Row = Record<string, unknown> & { id: string };

async function rowsOf(table: TableName, uid: string): Promise<Row[]> {
  const sb = admin();
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select("*").eq("user_id", uid).order("id").range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

async function ensureShowcaseUser(users: User[]): Promise<User> {
  const sb = admin();
  let user = users.find(isShowcase) ?? null;
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email: `${SHOWCASE_USERNAME}@daybook.invalid`,
      email_confirm: true,
      password: randomUUID() + randomUUID(),
      app_metadata: { username: SHOWCASE_USERNAME, showcase: true },
    });
    if (error || !data.user) throw new Error(error?.message ?? "Could not create the tester account.");
    user = data.user;
  }
  // Always (re)set the known PIN and clear any lock, so the showcase stays easy to open.
  const { data, error } = await sb.auth.admin.updateUserById(user.id, {
    password: pinPassword(user.id, SHOWCASE_PIN),
    app_metadata: { ...user.app_metadata, username: SHOWCASE_USERNAME, showcase: true, showcase_version: SHOWCASE_VERSION, pin_fails: 0, pin_locked_until: null },
  });
  if (error || !data.user) throw new Error(error?.message ?? "Could not set the tester PIN.");
  return data.user;
}

/** Replaces everything in the tester account with a fresh copy of the owner's data. Returns row counts. */
export async function refreshShowcase(ownerId: string): Promise<Record<string, number>> {
  const sb = admin();
  const users = await allUsers();
  const tester = await ensureShowcaseUser(users);
  if (tester.id === ownerId) throw new Error("The owner can't be the showcase account.");

  // Clear the tester's old snapshot (children first) and anything it may have subscribed to.
  for (const t of [...ORDER].reverse()) {
    const { error } = await sb.from(t).delete().eq("user_id", tester.id);
    if (error) throw new Error(`clear ${t}: ${error.message}`);
  }
  await sb.from("push_subscriptions").delete().eq("user_id", tester.id);
  await sb.from("notifications_sent").delete().eq("user_id", tester.id);

  const ids: Partial<Record<TableName, Map<string, string>>> = {};
  const counts: Record<string, number> = {};
  for (const t of ORDER) {
    const src = await rowsOf(t, ownerId);
    const map = new Map<string, string>();
    ids[t] = map;
    const copies = src.map((r) => {
      const id = randomUUID();
      map.set(r.id, id);
      const c: Row = { ...r, id, user_id: tester.id };
      for (const [col, parent] of Object.entries(LINKS[t] ?? {})) {
        const old = r[col] as string | null | undefined;
        if (old) c[col] = ids[parent]?.get(old) ?? null;
      }
      return c;
    });
    // A child whose required parent wasn't copied would fail the insert; drop it instead.
    const required = REQUIRED.includes(t) ? Object.keys(LINKS[t] ?? {}) : [];
    const ok = copies.filter((c) => required.every((col) => c[col]));
    for (let i = 0; i < ok.length; i += 500) {
      const { error } = await sb.from(t).insert(ok.slice(i, i + 500));
      if (error) throw new Error(`copy ${t}: ${error.message}`);
    }
    counts[t] = ok.length;
  }
  const mock = await addShowcaseMock(tester.id);
  const notes = await addShowcaseNotes(tester.id);
  return { ...counts, mock_tasks: mock.tasks, mock_milestones: mock.milestones, mock_habit_logs: mock.habit_logs, mock_notes: notes };
}

/**
 * My Notebook for the tester: a few made-up notes, never the owner's own (those are private).
 * Skipped quietly if the notes table hasn't been created yet.
 */
async function addShowcaseNotes(testerId: string): Promise<number> {
  const sb = admin();
  const { error: clearErr } = await sb.from("notes").delete().eq("user_id", testerId);
  if (clearErr) return 0;
  const ago = (days: number, h: number) => new Date(Date.now() - days * 864e5 - h * 36e5).toISOString();
  const rows = [
    { title: "Lesson ideas for next week", body: "Warm-up: two truths and a lie with past tense.\nTask 2 practice: opinion essays, plan in 5 minutes.\nVocabulary: environment topic, 12 words.", flair: "Teaching", flair_color: "#039BE5", at: ago(0, 2) },
    { title: "Client follow-ups", body: "Call back about the family plan on Monday.\nSend the brochure for the education saving plan.", flair: "Insurance", flair_color: "#F4511E", at: ago(2, 5) },
    { title: "Weekend plan", body: "Morning run, then coffee and planning the week.\nCall home on Sunday evening.", flair: "Personal", flair_color: "#8E24AA", at: ago(4, 1) },
    { title: "Books to read", body: "Atomic Habits\nThe Psychology of Money\nNorwegian Wood", flair: "Personal", flair_color: "#8E24AA", at: ago(9, 3) },
  ].map(({ at, ...r }) => ({ ...r, id: randomUUID(), user_id: testerId, created_at: at, updated_at: at }));
  const { error } = await sb.from("notes").insert(rows);
  return error ? 0 : rows.length;
}
