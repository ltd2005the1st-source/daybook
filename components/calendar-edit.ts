"use client";
import { useData } from "./data";
import { fmtDay, minutes, weekday } from "@/lib/dates";
import { lessonRow, lessonsOn, type Occurrence } from "@/lib/teaching";
import type { Store, TableName, Tables } from "@/lib/types";

export type Target = { date: string; start: string; end: string };
export type Scope = "one" | "all";

/** Repeating events and weekly classes ask whether a move applies to this one or to every week. */
export function needsScope(o: Occurrence): boolean {
  if (o.kind === "event") return !!o.event?.days?.length;
  if (o.kind === "lesson") return !!o.slotId;
  return false;
}

const span = (t: Target) => `${t.start}–${t.end === "00:00" ? "24:00" : t.end}`;

/**
 * Applies a drag on the calendar to the data underneath it, with one undo for the whole change.
 * Returns false (and explains why) when the move can't be made.
 */
export function useCalendarEdits() {
  const { storeRef, insert, update, remove, toast } = useData();

  return (o: Occurrence, to: Target, scope: Scope): boolean => {
    const store: Store = storeRef.current;
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
    const moved = to.date !== o.date;
    const timeOnly = !moved;
    let msg = timeOnly ? `${o.title}: ${span(to)}` : `Moved ${o.title} to ${fmtDay(to.date, { weekday: true })}, ${span(to)}`;

    if (o.kind === "event" && o.event) {
      const e = store.events.find((x) => x.id === o.event!.id) ?? o.event;
      const repeating = e.days.length > 0;
      if (!repeating) {
        upd("events", e.id, { date: to.date, start_time: to.start, end_time: to.end });
      } else if (scope === "all") {
        const delta = weekday(to.date) - weekday(o.date);
        upd("events", e.id, {
          start_time: to.start,
          end_time: to.end,
          ...(delta ? { days: e.days.map((d) => (d + delta + 7) % 7) } : {}),
        });
        msg += " (every time)";
      } else {
        upd("events", e.id, { skip_dates: [...(e.skip_dates ?? []), o.date] });
        ins("events", {
          title: e.title,
          date: to.date,
          start_time: to.start,
          end_time: to.end,
          days: [],
          until: null,
          color: e.color,
          kind: e.kind,
          remind_before: e.remind_before,
          notes: e.notes,
          skip_dates: [],
        });
        msg += " (this time only)";
      }
    } else if (o.kind === "lesson" && o.studentId) {
      const sid = o.studentId;
      const row = lessonRow(store, sid, o.date);
      if (scope === "all" && o.slotId) {
        upd("slots", o.slotId, { weekday: weekday(to.date), start_time: to.start, end_time: to.end });
        // A one-off time on this date would hide the new weekly time, so drop it.
        if (row && (row.start_time || row.end_time)) upd("lessons", row.id, { start_time: null, end_time: null });
        msg = `${o.title} is now every ${fmtDay(to.date, { weekday: true }).split(",")[0]}, ${span(to)}`;
      } else if (!moved) {
        if (row) upd("lessons", row.id, { start_time: to.start, end_time: to.end });
        else ins("lessons", { student_id: sid, date: o.date, status: "planned", start_time: to.start, end_time: to.end, note: null });
        if (o.slotId) msg += " (this class only)";
      } else {
        const clash = lessonsOn(store, to.date).some((x) => x.studentId === sid && x.status !== "cancelled");
        const there = lessonRow(store, sid, to.date);
        const marker = there?.status === "cancelled" && there.note?.startsWith("Moved to") ? there : undefined;
        if (clash || (there && !marker)) {
          toast(`${o.title.replace("Teach ", "")} already has a class on ${fmtDay(to.date, { weekday: true })}.`);
          return false;
        }
        if (marker) {
          // Moving a class back to its usual day: clear the "moved" mark first.
          remove("lessons", marker.id, { silent: true });
          const { id: _id, ...rest } = marker;
          undo.push(() => insert("lessons", rest));
        }
        if (row) upd("lessons", row.id, { date: to.date, start_time: to.start, end_time: to.end });
        else ins("lessons", { student_id: sid, date: to.date, status: "planned", start_time: to.start, end_time: to.end, note: null });
        // A weekly class leaves a "moved" mark on its usual day so the register stays honest.
        if (o.slotId) {
          ins("lessons", { student_id: sid, date: o.date, status: "cancelled", start_time: null, end_time: null, note: `Moved to ${to.date}` });
          msg += " (this class only)";
        }
      }
    } else if (o.kind === "check" && o.studentId) {
      const st = store.students.find((x) => x.id === o.studentId);
      if (!st) return false;
      const len = Math.max(15, (minutes(to.end) || 1440) - minutes(to.start));
      const patch: Partial<Tables["students"]> = { check_time: to.start, check_minutes: len };
      if (moved && st.check_mode === "fixed") {
        patch.check_days = [...new Set(st.check_days.map((d) => (d === weekday(o.date) ? weekday(to.date) : d)))];
      }
      upd("students", st.id, patch);
      msg = `Homework checks for ${st.name}: ${span(to)}`;
      if (moved && st.check_mode !== "fixed") msg += ". They stay the night before class, so only the time changed.";
    } else {
      return false;
    }

    toast(msg, () => undo.reverse().forEach((f) => f()));
    return true;
  };
}
