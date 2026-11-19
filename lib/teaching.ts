import { addDays, daysInMonth, minutes, parseDate, startOfWeek, weekday } from "./dates";
import type { CalEvent, Homework, Lesson, Store, Student, Task } from "./types";

export type DayMark = "taught" | "missed_owe" | "cancelled" | "planned" | "none";

/**
 * Classes are ordinary calendar events linked to a student (event.student_id).
 * Whether a class was taught, missed or cancelled is kept per student and date in `lessons`.
 */
export function classSeries(store: Pick<Store, "events">, studentId: string): CalEvent[] {
  return store.events
    .filter((e) => e.student_id === studentId)
    .sort((a, b) => (a.days[0] ?? 9) - (b.days[0] ?? 9) || (a.start_time ?? "").localeCompare(b.start_time ?? ""));
}

export function lessonRow(store: Pick<Store, "lessons">, studentId: string, date: string): Lesson | undefined {
  return store.lessons.find((l) => l.student_id === studentId && l.date === date);
}

export function hasClassOn(store: Pick<Store, "events">, studentId: string, date: string): boolean {
  return eventsOn(store, date).some((o) => o.studentId === studentId);
}

export function markFor(store: Pick<Store, "lessons" | "events">, studentId: string, date: string): DayMark {
  const row = lessonRow(store, studentId, date);
  if (row && !(row.status === "cancelled" && row.note?.startsWith("Moved to"))) return row.status;
  return hasClassOn(store, studentId, date) ? "planned" : "none";
}

/** Notes for one repeat: its own, or the ones shared by every repeat. */
export const noteFor = (e: CalEvent, date: string): string | null => e.occurrence_notes?.[date] ?? e.notes ?? null;

export const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);

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
  store: Pick<Store, "lessons" | "events">,
  studentId: string,
  month: string,
  from: string,
): string[] {
  return daysInMonth(month).filter((d) => d >= from && markFor(store, studentId, d) === "planned");
}

export type Occurrence = {
  key: string;
  kind: "lesson" | "check" | "event" | "task";
  title: string;
  date: string;
  start: string | null;
  end: string | null;
  color: string;
  studentId?: string;
  event?: CalEvent;
  status?: DayMark;
  done?: boolean;
  forDate?: string; // checks: the class they're for
  taskId?: string;
};

/** Classes on a date, with how each went. Cancelled and missed ones are kept so they can be shown struck out. */
export function lessonsOn(store: Pick<Store, "events" | "lessons" | "students">, date: string): Occurrence[] {
  const out: Occurrence[] = [];
  const classes = eventsOn(store, date).filter((o) => o.studentId);
  for (const o of classes) {
    const st = store.students.find((x) => x.id === o.studentId);
    if (!st || !st.active) continue;
    out.push({ ...o, status: markFor(store, st.id, date) });
  }
  // A class marked on the register with nothing on the calendar that day (an extra session).
  for (const row of store.lessons) {
    if (row.date !== date || row.status === "planned" || classes.some((o) => o.studentId === row.student_id)) continue;
    if (row.status === "cancelled" && row.note?.startsWith("Moved to")) continue;
    const st = store.students.find((x) => x.id === row.student_id);
    if (!st || !st.active) continue;
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
  return out;
}

/** Homework checks are tasks, by default at 22:30 the night before each class. Each one can be moved. */
export const CHECK_TIME = "22:30";
export const checkTime = (st: Student) => st.check_time || CHECK_TIME;
export const checkOffset = (st: Student) => (typeof st.check_offset === "number" ? st.check_offset : 1);

export type CheckTask = {
  key: string;
  student: Student;
  date: string; // the day you check
  time: string; // when
  classDate: string; // the class it is for
  row: Task | undefined; // saved once you tick it, move it or change just this one
  contents: string | null;
  done: boolean;
  homework: Homework[];
  /** Later checks for the same student folded into this one by mergeChecks. */
  also?: CheckTask[];
};

/** A check's own text if you changed just this one, otherwise the student's usual text. */
export const checkContents = (st: Student, row: Task | undefined) => (row && row.notes != null ? row.notes : st.check_note ?? null);

export const checkFor = (t: Task) => t.check_for ?? (t.due_on ? addDays(t.due_on, 1) : null);

export function checkRow(store: Pick<Store, "tasks">, studentId: string, classDate: string): Task | undefined {
  return store.tasks.find((t) => t.student_id === studentId && checkFor(t) === classDate);
}

function classAhead(store: Store, studentId: string, classDate: string) {
  return lessonsOn(store, classDate).some((o) => o.studentId === studentId && (o.status === "planned" || o.status === "taught"));
}

function makeCheck(store: Store, st: Student, classDate: string, row: Task | undefined): CheckTask {
  return {
    key: `check:${st.id}:${classDate}`,
    student: st,
    date: row?.due_on ?? addDays(classDate, -checkOffset(st)),
    time: row?.due_time ?? checkTime(st),
    classDate,
    row,
    contents: checkContents(st, row),
    done: !!row?.done,
    homework: store.homework.filter((h) => h.student_id === st.id && h.status === "open"),
  };
}

export function checkTasksOn(store: Store, date: string): CheckTask[] {
  const out: CheckTask[] = [];
  for (const st of store.students) {
    if (!st.active) continue;
    // Checks saved on this day (ticked, moved or changed)
    for (const t of store.tasks) {
      if (t.student_id !== st.id || t.due_on !== date) continue;
      const cd = checkFor(t);
      if (cd && (t.done || classAhead(store, st.id, cd))) out.push(makeCheck(store, st, cd, t));
    }
    // The usual check for a class coming up
    const cd = addDays(date, checkOffset(st));
    if (classAhead(store, st.id, cd) && !checkRow(store, st.id, cd)) out.push(makeCheck(store, st, cd, undefined));
  }
  return out.sort((a, b) => minutes(a.time) - minutes(b.time));
}

/** Check tasks from `from` for `days` days. */
export function checkTasksBetween(store: Store, from: string, days: number): CheckTask[] {
  return Array.from({ length: days }, (_, i) => checkTasksOn(store, addDays(from, i))).flat();
}

/** Check tasks from `from` to the end of its week (Sunday). */
export function checkTasksThisWeek(store: Store, from: string): CheckTask[] {
  return checkTasksBetween(store, from, daysBetween(from, addDays(startOfWeek(from), 6)) + 1);
}

/**
 * One item per student: the soonest check carries the later ones in `also`,
 * so "Check Weekend Class" shows once with every class it covers.
 */
export function mergeChecks(checks: CheckTask[]): CheckTask[] {
  const byStudent = new Map<string, CheckTask>();
  const out: CheckTask[] = [];
  [...checks]
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .forEach((c) => {
      const first = byStudent.get(c.student.id);
      if (first) first.also!.push(c);
      else {
        const head = { ...c, also: [] };
        byStudent.set(c.student.id, head);
        out.push(head);
      }
    });
  return out;
}

/** Checks as calendar items: slim blocks at their time. */
export function checksOn(store: Store, date: string): Occurrence[] {
  return checkTasksOn(store, date).map((c) => ({
    key: c.key,
    kind: "check" as const,
    title: `Check ${c.student.name}`,
    date,
    start: c.time,
    end: c.time,
    color: c.student.color,
    studentId: c.student.id,
    done: c.done,
    forDate: c.classDate,
  }));
}

/** Your own tasks that have a time: they sit on the calendar as slim bars. */
export function tasksOn(store: Pick<Store, "tasks">, date: string): Occurrence[] {
  return store.tasks
    .filter((t) => !t.student_id && t.due_on === date && t.due_time)
    .map((t) => ({
      key: `task:${t.id}`,
      kind: "task" as const,
      title: t.title,
      date,
      start: t.due_time,
      end: t.due_time,
      color: "var(--ink-2)",
      done: t.done,
      taskId: t.id,
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
      kind: (e.student_id ? "lesson" : "event") as Occurrence["kind"],
      title: e.title,
      date,
      start: e.start_time,
      end: e.end_time,
      color: e.color,
      event: e,
      studentId: e.student_id ?? undefined,
    }));
}

export function agendaOn(store: Store, date: string): Occurrence[] {
  const plain = eventsOn(store, date).filter((o) => !o.studentId);
  return [...plain, ...lessonsOn(store, date), ...checksOn(store, date), ...tasksOn(store, date)].sort(
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
