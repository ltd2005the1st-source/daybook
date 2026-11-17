// Starter data taken from your Google Sheet, calendar and Any.do (November 2026).
import { uid } from "./format";
import type { Store, Student } from "./types";

const AVAIL_SLOTS = ["07:00-09:00", "09:00-11:00", "14:00-16:00", "17:30-19:30", "20:00-22:00"];
const avail = (rows: number[][]): Record<string, number[]> =>
  Object.fromEntries(AVAIL_SLOTS.map((k, i) => [k, rows[i]]));

export function buildSeed(): Store {
  const now = new Date().toISOString();
  const student = (p: Partial<Student> & Pick<Student, "name" | "color" | "rate">, sort: number): Student => ({
    id: uid(),
    created_at: now,
    kind: "student",
    members: [],
    makeup_baseline: 0,
    active: true,
    check_mode: "night_before",
    check_time: "22:30",
    check_days: [],
    check_minutes: 60,
    remind_before: 30,
    availability: null,
    note: null,
    sort,
    ...p,
  });

  // Weekdays: 0 Sun, 1 Mon ... 6 Sat. Availability rows follow your xlsx sheets.
  const weekend = student(
    {
      name: "leWeekend",
      kind: "class",
      members: ["Khánh", "Hân", "Nhật", "Trí"],
      color: "#5B86E5",
      rate: 600_000,
      note: "IELTS Weekend Class",
    },
    0,
  );
  const linh = student(
    {
      name: "Tống Linh",
      color: "#3F8250",
      rate: 350_000,
      makeup_baseline: 1,
      availability: avail([[], [], [], [], [3, 5]]),
    },
    1,
  );
  const an = student(
    {
      name: "Khánh An",
      color: "#525A80",
      rate: 400_000,
      makeup_baseline: 1,
      availability: avail([[6, 0], [], [2, 3, 5, 6, 0], [3, 5], [3, 5, 6]]),
    },
    2,
  );
  const han = student(
    {
      name: "Bảo Hân",
      color: "#9A6FB0",
      rate: 400_000,
      makeup_baseline: 2,
      availability: avail([[0], [], [4, 5, 0], [3, 4], [2, 3]]),
    },
    3,
  );
  const bach = student(
    {
      name: "Bách",
      color: "#8A3FB0",
      rate: 400_000,
      availability: avail([[6, 0], [6, 0], [6, 0], [0], [2, 4, 5, 0]]),
    },
    4,
  );
  const students = [weekend, linh, an, han, bach];

  const slot = (s: Student, weekday: number, start: string, end: string, tentative = false) => ({
    id: uid(),
    created_at: now,
    student_id: s.id,
    weekday,
    start_time: start,
    end_time: end,
    tentative,
  });
  const slots = [
    slot(weekend, 6, "20:30", "22:30"),
    slot(weekend, 0, "09:00", "11:00"),
    slot(linh, 3, "20:30", "22:30"),
    slot(linh, 5, "20:30", "22:30"),
    slot(an, 3, "18:30", "20:30"),
    slot(an, 5, "18:30", "20:30"),
    slot(han, 2, "20:30", "22:30"),
    slot(han, 4, "14:00", "16:00"),
    slot(bach, 4, "20:30", "22:30"),
    slot(bach, 6, "09:00", "11:00", true),
  ];

  const taught = (s: Student, days: number[]) =>
    days.map((d) => ({
      id: uid(),
      created_at: now,
      student_id: s.id,
      date: `2026-11-${String(d).padStart(2, "0")}`,
      status: "taught" as const,
      start_time: null,
      end_time: null,
      note: null,
    }));
  const lessons = [
    ...taught(weekend, [1, 7, 8, 14, 15]),
    ...taught(linh, [4, 11]),
    ...taught(an, [1, 4, 6, 11]),
    ...taught(han, [5, 10, 12]),
    ...taught(bach, [5, 8, 12, 14]),
  ];

  const homework = [
    {
      id: uid(),
      created_at: now,
      student_id: an.id,
      title: "2 problem–solution essays",
      note: null,
      assigned_on: "2026-11-06",
      status: "open" as const,
      checked_on: null,
    },
    {
      id: uid(),
      created_at: now,
      student_id: an.id,
      title: "1 advantages & disadvantages essay",
      note: null,
      assigned_on: "2026-11-06",
      status: "open" as const,
      checked_on: null,
    },
  ];

  const tx = (
    kind: "income" | "expense",
    title: string,
    amount: number,
    day: number,
    category: string,
    recurring = false,
    note: string | null = null,
  ) => ({
    id: uid(),
    created_at: now,
    kind,
    title,
    amount,
    date: `2026-11-${String(day).padStart(2, "0")}`,
    category,
    recurring,
    note,
  });
  const transactions = [
    tx("income", "2nd contract", 8_000_000, 12, "Contract"),
    tx("expense", "Food & drinks", 725_000, 10, "Necessity", false, "1–10 Nov"),
    tx("expense", "Food & drinks", 420_000, 17, "Necessity", false, "11–20 Nov"),
    tx("expense", "Claude package", 570_000, 2, "Necessity", true),
    tx("expense", "Spotify subscription", 60_000, 4, "Pleasure", true),
    tx("expense", "D159V mobile data package", 160_000, 12, "Necessity", true),
    tx("expense", "Google AI package", 140_000, 23, "Necessity", true),
    tx("expense", "Movie night (with popcorn)", 250_000, 1, "Pleasure"),
    tx("expense", "Rides to and from home", 360_000, 2, "Transport"),
    tx("expense", "Dinner with family (drinks on me)", 700_000, 3, "Pleasure"),
    tx("expense", "New keyboard", 690_000, 4, "Work"),
    tx("expense", "New mouse", 790_000, 4, "Work"),
    tx("expense", "Groceries", 500_000, 4, "Necessity"),
    tx("expense", "Gas", 80_000, 8, "Transport"),
    tx("expense", "Groceries", 560_000, 10, "Necessity"),
    tx("expense", "Netlify subscription", 240_000, 11, "Other", true),
    tx("expense", "Food for the kids", 160_000, 12, "Other"),
    tx("expense", "Simping", 200_000, 12, "Pleasure"),
    tx("expense", "Mobile data (surge)", 800_000, 13, "Necessity"),
    tx("expense", "Claude 2nd package", 600_000, 13, "Other"),
    tx("expense", "Groceries", 365_000, 14, "Necessity"),
    tx("expense", "Unaccounted spending buffer", 500_000, 1, "Other", false, "Whole month"),
  ];

  const debt = (direction: "receivable" | "payable", person: string, amount: number, note: string | null, student_id: string | null = null) => ({
    id: uid(),
    created_at: now,
    direction,
    person,
    amount,
    note,
    due_on: null,
    settled: false,
    student_id,
  });
  const debts = [
    debt("receivable", "Biên", 2_460_000, "Debt"),
    debt("receivable", "Huy", 320_000, "Debt"),
    debt("receivable", "Tống Linh", 4_900_000, "Tuition for Sep + Oct", linh.id),
  ];

  const ev = (
    title: string,
    start: string,
    end: string,
    days: number[],
    color: string,
    kind: "focus" | "routine" | "personal",
  ) => ({
    id: uid(),
    created_at: now,
    title,
    date: "2026-11-02",
    start_time: start,
    end_time: end,
    days,
    until: null,
    color,
    kind,
    remind_before: [],
    notes: null,
    skip_dates: [],
  });
  const ALL = [0, 1, 2, 3, 4, 5, 6];
  const events = [
    ev("Morning Routine", "07:00", "08:00", ALL, "#A2645F", "routine"),
    ev("Rest & Play", "11:30", "13:00", ALL, "#6B6B6B", "routine"),
    ev("Focus Session", "14:00", "17:00", [1, 2, 3, 5, 6], "#4A51AC", "focus"),
    ev("Focus Session", "16:00", "17:00", [4, 0], "#4A51AC", "focus"),
    ev("Focus Session", "17:30", "20:30", [4], "#4A51AC", "focus"),
    ev("Prep", "19:30", "20:30", [6], "#8E4A63", "personal"),
  ];

  const task = (title: string, sort: number, extra: Partial<Store["tasks"][number]> = {}) => ({
    id: uid(),
    created_at: now,
    title,
    notes: null,
    list: "Personal",
    due_on: "2026-11-17",
    priority: false,
    horizon: "now" as const,
    done: false,
    done_at: null,
    sort,
    ...extra,
  });
  const tasks = [
    task("Hỏi dlinh ng cái BHYT", 0),
    task("Tìm cách sửa icon pdf", 1),
    task("Làm danh sách cuộc thi để ĐK", 2),
    task("Check tài liệu Python", 3),
    task("French", 4, { horizon: "long", due_on: null }),
    task("Đọc tài liệu Nurturing B2B", 5),
    task("Học Chapter 1 LOG", 6),
    task("Nhắc DL xử lý BHYT", 7),
  ];

  const habits = [
    {
      id: uid(),
      created_at: now,
      name: "Sleep",
      kind: "sleep" as const,
      color: "#4A51AC",
      target_bedtime: "23:45",
      target_wake: "07:00",
      weekly_target: null,
      sort: 0,
    },
    {
      id: uid(),
      created_at: now,
      name: "Exercise",
      kind: "exercise" as const,
      color: "#3F8250",
      target_bedtime: null,
      target_wake: null,
      weekly_target: 4,
      sort: 1,
    },
  ];

  return {
    transactions,
    debts,
    students,
    slots,
    lessons,
    homework,
    receipts: [],
    events,
    tasks,
    milestones: [],
    habits,
    habit_logs: [],
    chat_messages: [],
  };
}
