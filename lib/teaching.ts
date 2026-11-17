import { addDays, daysInMonth, minutes, weekday } from "./dates";
import type { CalEvent, Homework, Lesson, Slot, Store, Student, Task } from "./types";

export type DayMark = "taught" | "missed_owe" | "cancelled" | "planned" | "none";

export function slotsOf(store: Pick<Store, "slots">, studentId: string): Slot[] {
  return store.slots
    .filter((s) => s.student_id === studentId)
    .sort((a, b) => a.weekday - b.weekday || minutes(a.start_time) - minutes(b.start_time));
}

export function lessonRow(store: Pick<Store, "lessons">, studentId: string, date: string): Lesson | undefined {
  return store.lessons.find((l) => l.student_id === studentId && l.date === date);
}

export function markFor(store: Pick<Store, "lessons" | "slots">, studentId: string, date: string): DayMark {
  const row = lessonRow(store, studentId, date);
  if (row) return row.status;
  return store.slots.some((s) => s.student_id === studentId && s.weekday === weekday(date)) ? "planned" : "none";
}

export function isSlotDay(store: Pick<Store, "slots">, studentId: string, date: string): boolean {
  return store.slots.some((s) => s.student_id === studentId && s.weekday === weekday(date));
}

/** Makeup sessions left ("cần bù"). You keep this number yourself; the app never changes it. */
export function makeupsOwed(_store: unknown, s: Student): number {
  return Math.max(0, s.makeup_baseline ?? 0);
}

export function taughtIn(store: Pick<Store, "lessons">, studentId: string, month: string): Lesson[] {
  return store.lessons
    .filter((l) => l.student_id === studentId && l.status === "taught" && l.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function plannedRemaining(
  store: Pick<Store, "lessons" | "slots">,
  studentId: string,
  month: string,
  from: string,
): string[] {
  return daysInMonth(month).filter((d) => d >= from && markFor(store, studentId, d) === "planned");
}

export type Occurrence = {
  key: string;
  kind: "lesson" | "check" | "event";
  title: string;
  date: string;
  start: string | null;
  end: string | null;
  color: string;
  studentId?: string;
  slotId?: string;
  event?: CalEvent;
  status?: DayMark;
  tentative?: boolean;
  done?: boolean;
};

/** Lessons on a given date (from weekly slots plus extra lessons). Cancelled/missed ones are kept so they can be shown struck out. */
export function lessonsOn(store: Store, date: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const st of store.students) {
    if (!st.active) continue;
    const row = lessonRow(store, st.id, date);
    const slots = store.slots.filter((s) => s.student_id === st.id && s.weekday === weekday(date));
    if (row?.status === "cancelled" && row.note?.startsWith("Moved to")) continue;
    for (const sl of slots) {
      out.push({
        key: `lesson:${st.id}:${date}:${sl.start_time}`,
        kind: "lesson",
        title: `Teach ${st.name}`,
        date,
        start: row?.start_time ?? sl.start_time,
        end: row?.end_time ?? sl.end_time,
        color: st.color,
        studentId: st.id,
        slotId: sl.id,
        status: row?.status ?? "planned",
        tentative: sl.tentative,
      });
    }
    if (!slots.length && row) {
      out.push({
        key: `lesson:${st.id}:${date}:extra`,
        kind: "lesson",
        title: `Teach ${st.name}${row.status === "taught" ? " (extra)" : ""}`,
        date,
        start: row.start_time,
        end: row.end_time,
        color: st.color,
        studentId: st.id,
        status: row.status,
      });
    }
  }
  return out;
}

/** Homework checks are tasks at 22:30 the night before each class. */
export const CHECK_TIME = "22:30";

export type CheckTask = {
  key: string;
  student: Student;
  date: string; // the night you check
  classDate: string; // the class it is for
  row: Task | undefined; // saved once you tick it or change this one
  contents: string | null;
  done: boolean;
  homework: Homework[];
};

/** A check's own text if you changed just this one, otherwise the student's usual text. */
export const checkContents = (st: Student, row: Task | undefined) => (row && row.notes != null ? row.notes : st.check_note ?? null);

export function checkTasksOn(store: Store, date: string): CheckTask[] {
  const out: CheckTask[] = [];
  const classDate = addDays(date, 1);
  for (const st of store.students) {
    if (!st.active) continue;
    const row = store.tasks.find((t) => t.student_id === st.id && t.due_on === date);
    const hasClass = lessonsOn(store, classDate).some(
      (o) => o.studentId === st.id && (o.status === "planned" || o.status === "taught"),
    );
    if (!hasClass && !row?.done) continue;
    out.push({
      key: `check:${st.id}:${date}`,
      student: st,
      date,
      classDate,
      row,
      contents: checkContents(st, row),
      done: !!row?.done,
      homework: store.homework.filter((h) => h.student_id === st.id && h.status === "open"),
    });
  }
  return out;
}

/** Check tasks from `from` for `days` nights. */
export function checkTasksBetween(store: Store, from: string, days: number): CheckTask[] {
  return Array.from({ length: days }, (_, i) => checkTasksOn(store, addDays(from, i))).flat();
}

/** Checks as calendar items: a line at 22:30, not a block. */
export function checksOn(store: Store, date: string): Occurrence[] {
  return checkTasksOn(store, date).map((c) => ({
    key: c.key,
    kind: "check" as const,
    title: `Check ${c.student.name}`,
    date,
    start: CHECK_TIME,
    end: CHECK_TIME,
    color: c.student.color,
    studentId: c.student.id,
    done: c.done,
  }));
}

export function eventsOn(store: Pick<Store, "events">, date: string): Occurrence[] {
  const wd = weekday(date);
  return store.events
    .filter((e) => {
      if (e.skip_dates?.includes(date)) return false;
      if (!e.days?.length) return e.date === date;
      return date >= e.date && (!e.until || date <= e.until) && e.days.includes(wd);
    })
    .map((e) => ({
      key: `event:${e.id}:${date}`,
      kind: "event" as const,
      title: e.title,
      date,
      start: e.start_time,
      end: e.end_time,
      color: e.color,
      event: e,
    }));
}

export function agendaOn(store: Store, date: string): Occurrence[] {
  return [...eventsOn(store, date), ...lessonsOn(store, date), ...checksOn(store, date)].sort(
    (a, b) => (a.start ? minutes(a.start) : -1) - (b.start ? minutes(b.start) : -1),
  );
}

export function nextLesson(store: Store, studentId: string, from: string, horizon = 14): Occurrence | undefined {
  for (let i = 0; i <= horizon; i++) {
    const d = addDays(from, i);
    const hit = lessonsOn(store, d).find((o) => o.studentId === studentId && o.status === "planned");
    if (hit) return hit;
  }
  return undefined;
}
