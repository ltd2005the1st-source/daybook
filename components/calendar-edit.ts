"use client";
import { useData } from "./data";
import { useCheckActions } from "./checks";
import { fmtDay, weekday } from "@/lib/dates";
import { describeEvent, duplicateEvent } from "@/lib/dupes";
import { checkTasksOn, lessonRow, noteFor, type Occurrence } from "@/lib/teaching";
import type { CalEvent, Store, TableName, Tables } from "@/lib/types";

export type Target = { date: string; start: string; end: string };
export type Scope = "one" | "all";

/** Repeating events (classes too) and homework checks ask whether a move applies to this one or to all of them. */
export function needsScope(o: Occurrence): boolean {
  if (o.event) return !!o.event.days?.length;
  return o.kind === "check";
}

const span = (t: Target) => `${t.start}–${t.end === "00:00" ? "24:00" : t.end}`;

/** A one-off copy of one repeat of an event, for "this one only" changes and for pasting. */
export function copyOf(e: CalEvent, date: string, to: Partial<CalEvent> = {}): Partial<CalEvent> {
  return {
    title: e.title,
    date,
    start_time: e.start_time,
    end_time: e.end_time,
    days: [],
    until: null,
    color: e.color,
    kind: e.kind,
    remind_before: e.remind_before,
    notes: noteFor(e, date),
    skip_dates: [],
    student_id: e.student_id ?? null,
    occurrence_notes: {},
    ...to,
  };
}

/**
 * Applies a drag on the calendar to the data underneath it, with one undo for the whole change.
 * Returns false (and explains why) when the move can't be made.
 */
export function useCalendarEdits() {
  const { storeRef, insert, update, remove, toast } = useData();
  const checks = useCheckActions();

  return (o: Occurrence, to: Target, scope: Scope): boolean => {
    const store: Store = storeRef.current;

    if (o.kind === "check") {
      const c = checkTasksOn(store, o.date).find((x) => x.key === o.key);
      if (!c) return false;
      checks.move(c, { date: to.date, time: to.start }, scope);
      return true;
    }

    if (o.kind === "task" && o.taskId) {
      const t = store.tasks.find((x) => x.id === o.taskId);
      if (!t) return false;
      const prev = { due_on: t.due_on, due_time: t.due_time };
      update("tasks", t.id, { due_on: to.date, due_time: to.start });
      toast(`${t.title}: ${fmtDay(to.date, { weekday: true })}, ${to.start}`, () => update("tasks", t.id, prev));
      return true;
    }

    const undo: (() => void)[] = [];
    const upd = <T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>) => {
      const row = (store[t] as Tables[T][]).find((r) => r.id === id) as Record<string, unknown> | undefined;
      const prev = Object.fromEntries(Object.keys(patch).map((k) => [k, row?.[k] ?? null])) as Partial<Tables[T]>;
      update(t, id, patch);
      undo.push(() => update(t, id, prev));
    };
    const ins = <T extends TableName>(t: T, row: Partial<Tables[T]>) => {
      const r = insert(t, row);
      undo.push(() => remove(t, r.id, { silent: true }));
      return r;
    };
    if (!o.event) return false;
    const moved = to.date !== o.date;
    let msg = !moved ? `${o.title}: ${span(to)}` : `Moved ${o.title} to ${fmtDay(to.date, { weekday: true })}, ${span(to)}`;

    const e = store.events.find((x) => x.id === o.event!.id) ?? o.event;
    const repeating = e.days.length > 0;
    // Don't let a move land the event on top of a copy of itself.
    const delta = weekday(to.date) - weekday(o.date);
    const after =
      !repeating || scope === "one"
        ? { ...e, date: to.date, days: [], until: null, skip_dates: [], start_time: to.start, end_time: to.end }
        : { ...e, start_time: to.start, end_time: to.end, days: e.days.map((d) => (d + delta + 7) % 7) };
    const clash = duplicateEvent(store, after, e.id);
    if (clash) {
      toast(`${describeEvent(clash)} Not moved.`);
      return false;
    }
    if (!repeating) {
      upd("events", e.id, { date: to.date, start_time: to.start, end_time: to.end });
    } else if (scope === "all") {
      upd("events", e.id, {
        start_time: to.start,
        end_time: to.end,
        ...(delta ? { days: e.days.map((d) => (d + delta + 7) % 7) } : {}),
      });
      msg += " (every time)";
    } else {
      upd("events", e.id, { skip_dates: [...(e.skip_dates ?? []), o.date] });
      ins("events", copyOf(e, to.date, { start_time: to.start, end_time: to.end, notes: noteFor(e, o.date) }));
      msg += " (this time only)";
    }

    // A class marked taught or missed keeps its mark when it moves to another day.
    if (e.student_id && moved && (!repeating || scope === "one")) {
      const row = lessonRow(store, e.student_id, o.date);
      if (row && !lessonRow(store, e.student_id, to.date)) upd("lessons", row.id, { date: to.date });
    }

    toast(msg, () => undo.reverse().forEach((f) => f()));
    return true;
  };
}
