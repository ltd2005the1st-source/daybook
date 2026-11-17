import { addDays, fmtDay, minutes, weekday } from "./dates";
import { eventsOn } from "./teaching";
import type { CalEvent, Store, Task } from "./types";

/** Titles "look the same" when they match ignoring case, extra spaces and trailing punctuation. Accents still count. */
export function sameTitle(a: string, b: string): boolean {
  const n = (s: string) => s.normalize("NFC").toLocaleLowerCase("vi").replace(/\s+/g, " ").replace(/[.!?,;:\s]+$/, "").trim();
  return n(a) === n(b);
}

/** An open task with the same title. Done tasks don't count, so you can do the same thing again later. */
export function duplicateTask(store: Pick<Store, "tasks">, title: string, exceptId?: string): Task | undefined {
  return store.tasks.find((t) => t.id !== exceptId && !t.done && sameTitle(t.title, title));
}

export function describeTask(t: Task): string {
  return `“${t.title}” is already on your list${t.due_on ? ` (due ${fmtDay(t.due_on, { weekday: true })}${t.due_time ? ` ${t.due_time}` : ""})` : ""}.`;
}

type EventShape = Pick<CalEvent, "title" | "date" | "start_time" | "end_time" | "days" | "until" | "skip_dates">;

function span(e: { start_time: string | null; end_time: string | null }): [number, number] | null {
  if (!e.start_time) return null; // all day
  const s = minutes(e.start_time);
  let en = e.end_time ? minutes(e.end_time) : s + 60;
  if (en <= s) en = 24 * 60;
  return [s, en];
}

/** Dates the event happens on in its first two weeks, enough to catch a clash with anything weekly. */
function sampleDates(e: EventShape): string[] {
  if (!e.days.length) return [e.date];
  const out: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(e.date, i);
    if (e.until && d > e.until) break;
    if (e.days.includes(weekday(d)) && !e.skip_dates?.includes(d)) out.push(d);
  }
  return out;
}

/**
 * Another event with the same title at an overlapping time on the same day (or both all day).
 * Returns the clash so the app can say where it is.
 */
export function duplicateEvent(store: Pick<Store, "events">, e: EventShape, exceptId?: string): { date: string; other: CalEvent } | undefined {
  const mine = span(e);
  for (const d of sampleDates(e)) {
    for (const o of eventsOn(store, d)) {
      if (!o.event || o.event.id === exceptId || !sameTitle(o.event.title, e.title)) continue;
      const theirs = span(o.event);
      if (!mine || !theirs) {
        if (!mine && !theirs) return { date: d, other: o.event };
        continue;
      }
      if (mine[0] < theirs[1] && theirs[0] < mine[1]) return { date: d, other: o.event };
    }
  }
  return undefined;
}

export function describeEvent(c: { date: string; other: CalEvent }): string {
  const t = c.other.start_time ? `${c.other.start_time}–${c.other.end_time ?? ""}` : "all day";
  return `“${c.other.title}” is already on your calendar on ${fmtDay(c.date, { weekday: true })}, ${t}.`;
}
