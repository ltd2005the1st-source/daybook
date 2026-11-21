"use client";
import { useSyncExternalStore } from "react";
import { ONLINE, supabase } from "@/lib/supabase";
import { uid } from "@/lib/format";

/**
 * My Notebook's notes. Online they live in the `notes` table (supabase/notebook.sql), synced in real
 * time like everything else. Until that table exists, or with no Supabase at all, they are kept in
 * this browser; once the table appears, notes written in the meantime are moved up automatically.
 *
 * Kept apart from the main data store on purpose: a database that hasn't had the notebook SQL yet
 * must not break loading, backups or the tester copy.
 */
export type Note = {
  id: string;
  created_at: string;
  updated_at: string;
  title: string;
  body: string;
  flair: string | null;
  flair_color: string | null;
};

export type NotebookState = { notes: Note[]; mode: "loading" | "online" | "device"; saving: boolean };

const LOCAL_KEY = "daybook.notebook.v1";

let state: NotebookState = { notes: [], mode: "loading", saving: false };
const listeners = new Set<() => void>();
let started = false;
let toastFn: (t: string) => void = () => {};

function emit(next: Partial<NotebookState>) {
  state = { ...state, ...next };
  if (state.mode === "device") writeLocal(state.notes);
  listeners.forEach((f) => f());
}

function readLocal(): Note[] | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as Note[]) : null;
  } catch {
    return null;
  }
}
function writeLocal(notes: Note[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(notes));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

const missingTable = (e: { code?: string; message: string }) =>
  e.code === "42P01" || e.code === "PGRST205" || /could not find the table|does not exist|schema cache/i.test(e.message);

/** Edits not yet confirmed by the server, per note, overlaid on anything fetched meanwhile. */
const pending = new Map<string, Partial<Note>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Map<string, Promise<void>>();

const overlay = (n: Note): Note => (pending.has(n.id) ? { ...n, ...pending.get(n.id) } : n);

async function fetchAll() {
  if (!ONLINE) return;
  const sb = supabase();
  const { data: auth } = await sb.auth.getSession();
  if (!auth.session) return;
  const { data, error } = await sb.from("notes").select("*").order("updated_at", { ascending: false }).limit(2000);
  if (error) {
    if (missingTable(error)) {
      if (state.mode !== "device") emit({ mode: "device", notes: readLocal() ?? [] });
      return;
    }
    console.error("notes", error.message);
    return;
  }
  let rows = ((data ?? []) as Note[]).map(overlay);
  // Bring up anything written on this device while the table didn't exist yet.
  const local = readLocal();
  if (local?.length) {
    const have = new Set(rows.map((r) => r.id));
    const up = local.filter((n) => !have.has(n.id));
    if (up.length) {
      const { error: upErr } = await sb.from("notes").upsert(up, { onConflict: "id", ignoreDuplicates: true });
      if (upErr) {
        toastFn(`Couldn't move your notes online: ${upErr.message}`);
        return;
      }
      rows = [...up, ...rows];
    }
  }
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {}
  emit({ mode: "online", notes: rows });
}

function start() {
  if (started) return;
  started = true;
  if (!ONLINE) {
    let notes = readLocal();
    if (!notes) notes = starterNotes();
    state = { ...state, mode: "device", notes };
    writeLocal(notes);
    return;
  }
  const sb = supabase();
  fetchAll();
  sb.channel("daybook-notes")
    .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, (p) => {
      if (state.mode !== "online") return;
      if (p.eventType === "DELETE") {
        const id = (p.old as { id: string }).id;
        emit({ notes: state.notes.filter((n) => n.id !== id) });
        return;
      }
      const row = overlay(p.new as Note);
      const i = state.notes.findIndex((n) => n.id === row.id);
      emit({ notes: i === -1 ? [row, ...state.notes] : state.notes.map((n) => (n.id === row.id ? row : n)) });
    })
    .subscribe();
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") emit({ notes: [], mode: "loading" });
    if (event === "SIGNED_IN") setTimeout(fetchAll, 0);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fetchAll();
    else flushAll();
  });
  window.addEventListener("pagehide", flushAll);
}

function subscribe(f: () => void) {
  listeners.add(f);
  start();
  return () => listeners.delete(f);
}

export function useNotebook(toast: (t: string) => void): NotebookState {
  toastFn = toast;
  return useSyncExternalStore(subscribe, () => state, () => state);
}

function setSaving() {
  const saving = timers.size > 0 || inflight.size > 0;
  if (saving !== state.saving) emit({ saving });
}

/** Sends a note's waiting edits now, one write per note at a time. */
function flush(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  if (state.mode !== "online") return setSaving();
  const prev = inflight.get(id) ?? Promise.resolve();
  const run = prev.then(async () => {
    const patch = pending.get(id);
    if (!patch) return;
    const { error } = await supabase().from("notes").update(patch).eq("id", id);
    if (error) {
      toastFn(`Couldn't save the note: ${error.message}`);
      return;
    }
    // Only forget what was sent; newer typing stays pending for the next write.
    const now = pending.get(id);
    if (now && Object.entries(patch).every(([k, v]) => now[k as keyof Note] === v)) pending.delete(id);
  });
  inflight.set(id, run);
  run.finally(() => {
    if (inflight.get(id) === run) inflight.delete(id);
    setSaving();
  });
  setSaving();
}

export function flushAll() {
  for (const id of [...timers.keys()]) flush(id);
}

export function createNote(seed: Partial<Note> = {}): Note {
  const now = new Date().toISOString();
  const note: Note = { id: uid(), created_at: now, updated_at: now, title: "", body: "", flair: null, flair_color: null, ...seed };
  emit({ notes: [note, ...state.notes] });
  if (state.mode === "online") {
    supabase()
      .from("notes")
      .insert(note)
      .then(({ error }) => error && toastFn(`Couldn't save the note: ${error.message}`));
  }
  return note;
}

/** Changes a note on screen at once and saves it shortly after typing pauses. */
export function editNote(id: string, patch: Partial<Note>, now = false) {
  const full = { ...patch, updated_at: new Date().toISOString() };
  emit({ notes: state.notes.map((n) => (n.id === id ? { ...n, ...full } : n)) });
  if (state.mode !== "online") return;
  pending.set(id, { ...(pending.get(id) ?? {}), ...full });
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => flush(id), 700),
  );
  setSaving();
  if (now) flush(id);
}

export function deleteNote(id: string): Note | undefined {
  const victim = state.notes.find((n) => n.id === id);
  clearTimeout(timers.get(id));
  timers.delete(id);
  pending.delete(id);
  emit({ notes: state.notes.filter((n) => n.id !== id) });
  if (state.mode === "online") {
    supabase()
      .from("notes")
      .delete()
      .eq("id", id)
      .then(({ error }) => error && toastFn(`Couldn't delete the note: ${error.message}`));
  }
  setSaving();
  return victim;
}

export function restoreNote(note: Note) {
  if (state.notes.some((n) => n.id === note.id)) return;
  emit({ notes: [note, ...state.notes] });
  if (state.mode === "online") {
    supabase()
      .from("notes")
      .insert(note)
      .then(({ error }) => error && toastFn(`Couldn't bring the note back: ${error.message}`));
  }
}

/** A few notes so the preview (no database) doesn't open on an empty notebook. */
function starterNotes(): Note[] {
  const at = (daysAgo: number, h: number, m: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const mk = (title: string, body: string, flair: string | null, color: string | null, when: string): Note => ({
    id: uid(),
    created_at: when,
    updated_at: when,
    title,
    body,
    flair,
    flair_color: color,
  });
  return [
    mk("Lesson ideas for next week", "Warm-up: two truths and a lie with past tense.\nTask 2 practice: opinion essays, plan in 5 minutes.\nVocabulary: environment topic, 12 words.", "Teaching", "#039BE5", at(0, 9, 12)),
    mk("Client follow-ups", "Call back about the family plan on Monday.\nSend the brochure for the education saving plan.", "Insurance", "#F4511E", at(2, 18, 40)),
    mk("Books to read", "Atomic Habits\nThe Psychology of Money\nNorwegian Wood", "Personal", "#8E24AA", at(6, 22, 5)),
  ];
}

/** Every note, for the backup file. */
export const notebookSnapshot = (): Note[] => state.notes;

/** Adds back notes from a backup that aren't here yet. Returns how many. */
export function restoreNotes(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  const have = new Set(state.notes.map((n) => n.id));
  const add = list.filter((n): n is Note => !!n && typeof n === "object" && typeof n.id === "string" && typeof n.title === "string" && !have.has(n.id));
  add.forEach(restoreNote);
  return add.length;
}
