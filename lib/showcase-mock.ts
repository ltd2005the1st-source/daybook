import { randomUUID } from "node:crypto";
import { admin } from "./pin-auth";
import { addDays, vnNow } from "./dates";

/**
 * Extra demo data added on top of the tester's copy so the showcase looks like a busy person:
 * a long list of open tasks (some overdue, some with milestones) and steady, healthy exercise and
 * sleep habits over the last eight weeks. Only ever written to the tester account.
 */

type Row = Record<string, unknown>;

// A small fixed-seed random so every refresh makes the same-looking showcase.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const TASKS: { title: string; list: string; due?: number; time?: string; priority?: boolean; horizon?: "now" | "soon" | "long"; notes?: string; steps?: string[] }[] = [
  { title: "Mark IELTS Writing Task 2 essays (8 scripts)", list: "Teaching", due: -1, priority: true, notes: "Band scores + one rewrite paragraph each." },
  { title: "Prepare speaking Part 2 cue cards for weekend group", list: "Teaching", due: 2, time: "17:00" },
  { title: "Write monthly progress reports for parents", list: "Teaching", due: 5, steps: ["Khánh An", "Bảo Hân", "Bách", "Tống Linh", "leWeekend group"] },
  { title: "Build a vocabulary quiz on environment topic", list: "Teaching", due: 3 },
  { title: "Print reading passages for Thursday", list: "Teaching", due: 1, time: "12:00" },
  { title: "Record feedback video on pronunciation", list: "Teaching", horizon: "soon" },
  { title: "Call back Mr. Phong about health insurance quote", list: "Insurance", due: 0, time: "10:00", priority: true },
  { title: "Send policy comparison to Ms. Lan", list: "Insurance", due: -2, priority: true },
  { title: "Follow up 5 leads from last week's seminar", list: "Insurance", due: 1, steps: ["Anh Tuấn", "Chị Mai", "Anh Dũng", "Chị Hương", "Anh Quân"] },
  { title: "Renewal reminder for the Nguyễn family policy", list: "Insurance", due: 4 },
  { title: "Finish compliance training module 3", list: "Insurance", due: 6, time: "21:00" },
  { title: "Update client spreadsheet", list: "Insurance", horizon: "soon" },
  { title: "Pay electricity and internet bills", list: "Personal", due: 0, priority: true },
  { title: "Book dentist appointment", list: "Personal", due: -3 },
  { title: "Renew motorbike insurance", list: "Personal", due: 7 },
  { title: "Clean up laptop desktop and back up photos", list: "Personal", horizon: "soon" },
  { title: "Buy birthday gift for Mom", list: "Personal", due: 9, steps: ["Pick a gift", "Order", "Wrap"] },
  { title: "Grocery run: eggs, oats, chicken, vegetables", list: "Personal", due: 1 },
  { title: "Plan a weekend trip to Đà Lạt", list: "Personal", horizon: "long", steps: ["Pick dates", "Book bus", "Book homestay", "Make a list of cafés"] },
  { title: "Read 'Atomic Habits' (chapters 6–10)", list: "Personal", horizon: "soon" },
  { title: "Learn basic video editing for teaching clips", list: "Personal", horizon: "long" },
  { title: "Sign up for a half marathon", list: "Personal", horizon: "long", priority: true },
  { title: "Reply to the language centre about the summer course", list: "Teaching", due: -1 },
  { title: "Draft a new lesson plan template", list: "Teaching", horizon: "long" },
];

const ACTIVITIES = ["Run", "Gym", "Run", "Swim", "Yoga", "Cycling", "Gym", "Badminton"];

export async function addShowcaseMock(uid: string) {
  const sb = admin();
  const t = vnNow().date;
  const rand = rng(20261118);

  // Tasks + milestones
  const tasks: Row[] = [];
  const steps: Row[] = [];
  TASKS.forEach((x, i) => {
    const id = randomUUID();
    tasks.push({
      id,
      user_id: uid,
      title: x.title,
      notes: x.notes ?? null,
      list: x.list,
      due_on: x.due === undefined ? null : addDays(t, x.due),
      due_time: x.time ?? null,
      priority: !!x.priority,
      horizon: x.horizon ?? "now",
      done: false,
      done_at: null,
      sort: 1000 + i,
    });
    x.steps?.forEach((s, j) => steps.push({ user_id: uid, task_id: id, title: s, done: j < Math.floor(x.steps!.length / 3), sort: j }));
  });
  // Skip any that clash with a copied open task of the same title.
  const { data: have } = await sb.from("tasks").select("title").eq("user_id", uid).eq("done", false);
  const taken = new Set((have ?? []).map((r) => String(r.title).trim().toLowerCase()));
  const fresh = tasks.filter((r) => !taken.has(String(r.title).toLowerCase()));
  const freshIds = new Set(fresh.map((r) => r.id));
  if (fresh.length) await must(sb.from("tasks").insert(fresh), "mock tasks");
  const freshSteps = steps.filter((s) => freshIds.has(s.task_id));
  if (freshSteps.length) await must(sb.from("milestones").insert(freshSteps), "mock milestones");

  // Habits: make sure there is an exercise and a sleep habit.
  const { data: habits } = await sb.from("habits").select("*").eq("user_id", uid);
  const list = (habits ?? []) as Row[];
  const ensure = async (kind: "exercise" | "sleep", fields: Row) => {
    const found = list.find((h) => h.kind === kind);
    if (found) {
      if (kind === "exercise" && !found.weekly_target) await sb.from("habits").update({ weekly_target: 4 }).eq("id", found.id);
      return String(found.id);
    }
    const id = randomUUID();
    await must(sb.from("habits").insert({ id, user_id: uid, kind, sort: list.length, ...fields }), `mock ${kind} habit`);
    list.push({ id, kind });
    return id;
  };
  const exercise = await ensure("exercise", { name: "Exercise", color: "#3F8250", weekly_target: 4 });
  const sleep = await ensure("sleep", { name: "Sleep", color: "#5B86E5", target_bedtime: "23:00", target_wake: "06:30" });

  const { data: oldLogs } = await sb.from("habit_logs").select("habit_id,date").eq("user_id", uid).in("habit_id", [exercise, sleep]);
  const logged = new Set((oldLogs ?? []).map((l) => `${l.habit_id}:${l.date}`));
  const logs: Row[] = [];
  const hhmm = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
  for (let d = 56; d >= 0; d--) {
    const date = addDays(t, -d);
    // Exercise about 5 days a week, 30–75 minutes.
    if (rand() < 0.72 && !logged.has(`${exercise}:${date}`))
      logs.push({ user_id: uid, habit_id: exercise, date, minutes: 30 + Math.round(rand() * 9) * 5, activity: ACTIVITIES[Math.floor(rand() * ACTIVITIES.length)], slept_at: null, woke_at: null, note: null });
    // Sleep 7–8 hours, in bed around 22:45–23:30.
    if (!logged.has(`${sleep}:${date}`)) {
      const bed = 22 * 60 + 45 + Math.round(rand() * 9) * 5;
      const dur = 7 * 60 + Math.round(rand() * 12) * 5;
      logs.push({ user_id: uid, habit_id: sleep, date, slept_at: hhmm(bed), woke_at: hhmm(bed + dur), minutes: null, activity: null, note: null });
    }
  }
  if (logs.length) await must(sb.from("habit_logs").insert(logs), "mock habit logs");
  return { tasks: fresh.length, milestones: freshSteps.length, habit_logs: logs.length };
}

async function must(p: PromiseLike<{ error: { message: string } | null }>, what: string) {
  const { error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
}
