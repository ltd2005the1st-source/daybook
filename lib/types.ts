// Shared data model. Every table row has id, user_id (online mode) and created_at.
// Times are local Vietnam wall-clock strings ("HH:MM"), dates are "YYYY-MM-DD".

export type Base = { id: string; user_id?: string; created_at?: string };

export const EXPENSE_CATEGORIES = ["Necessity", "Pleasure", "Transport", "Work", "Other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type Transaction = Base & {
  kind: "income" | "expense";
  amount: number; // VND, whole number
  title: string;
  category: string; // expense category or income source
  date: string;
  recurring: boolean; // repeats monthly
  note: string | null;
};

export type Debt = Base & {
  direction: "receivable" | "payable";
  person: string;
  amount: number;
  note: string | null;
  due_on: string | null;
  settled: boolean;
  student_id: string | null;
};

export type Student = Base & {
  name: string;
  kind: "student" | "class";
  members: string[]; // for classes
  color: string;
  rate: number; // VND per session
  makeup_baseline: number; // makeups owed before tracking started
  active: boolean;
  check_note: string | null; // what to check every time (each night can be changed on its own)
  check_mode: "night_before" | "fixed"; // no longer used: checks are always the night before
  check_time: string; // when the homework check block starts
  check_days: number[]; // weekdays for fixed mode (0 = Sunday)
  check_minutes: number; // how long the check block is
  remind_before: number[]; // push reminders this many minutes before the check
  availability: Record<string, number[]> | null; // slot label -> weekdays free
  note: string | null;
  sort: number;
};

export type Slot = Base & {
  student_id: string;
  weekday: number; // 0 = Sunday
  start_time: string;
  end_time: string;
  tentative: boolean;
};

/** "planned" is only stored for a single class moved to a new time or day. */
export type LessonStatus = "taught" | "missed_owe" | "cancelled" | "planned";

/** Every event, class, homework check and timed task reminds you this many minutes before. */
export const DEFAULT_REMIND = [40, 20];
export type Lesson = Base & {
  student_id: string;
  date: string;
  status: LessonStatus;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
};

export type Homework = Base & {
  student_id: string;
  title: string;
  note: string | null;
  assigned_on: string;
  status: "open" | "checked";
  checked_on: string | null;
};

export type Receipt = Base & {
  student_id: string;
  month: string; // YYYY-MM
  sessions: number;
  rate: number;
  adjustments: number;
  amount: number;
  status: "issued" | "paid";
  paid_on: string | null;
  dates: string[];
  note: string | null;
};

export type CalEvent = Base & {
  title: string;
  date: string; // first occurrence
  start_time: string | null; // null = all day
  end_time: string | null;
  days: number[]; // weekly repeat days; empty = one-off
  until: string | null;
  color: string;
  kind: "focus" | "routine" | "personal" | "work" | "other";
  remind_before: number[]; // minutes
  notes: string | null;
  skip_dates: string[];
};

export type Task = Base & {
  title: string;
  notes: string | null;
  list: string;
  due_on: string | null;
  due_time: string | null; // "HH:MM"; tasks with a time get reminders
  priority: boolean;
  horizon: "now" | "soon" | "long";
  done: boolean;
  done_at: string | null;
  sort: number;
  student_id?: string | null; // set on homework-check tasks
};

export type Milestone = Base & {
  task_id: string;
  title: string;
  done: boolean;
  sort: number;
};

export type Habit = Base & {
  name: string;
  kind: "sleep" | "exercise" | "custom";
  color: string;
  target_bedtime: string | null;
  target_wake: string | null;
  weekly_target: number | null;
  sort: number;
};

export type HabitLog = Base & {
  habit_id: string;
  date: string; // the morning you woke up, or the day you exercised
  slept_at: string | null;
  woke_at: string | null;
  minutes: number | null;
  activity: string | null;
  note: string | null;
};

export type Tables = {
  transactions: Transaction;
  debts: Debt;
  students: Student;
  slots: Slot;
  lessons: Lesson;
  homework: Homework;
  receipts: Receipt;
  events: CalEvent;
  tasks: Task;
  milestones: Milestone;
  habits: Habit;
  habit_logs: HabitLog;
  music: MusicItem;
};

/** A Spotify playlist, album or song saved to play inside the app. */
export type MusicItem = Base & {
  title: string;
  kind: "playlist" | "album" | "track" | "artist" | "episode" | "show";
  spotify_id: string;
  image: string | null;
  sort: number;
};

export type TableName = keyof Tables;
export const TABLES: TableName[] = [
  "transactions",
  "debts",
  "students",
  "slots",
  "lessons",
  "homework",
  "receipts",
  "events",
  "tasks",
  "milestones",
  "habits",
  "habit_logs",
  "music",
];

export type Store = { [K in TableName]: Tables[K][] };
