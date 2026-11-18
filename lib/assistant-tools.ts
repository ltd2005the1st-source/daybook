// Tool definitions for the Haiku assistant. The server route sends them to Claude; the browser
// runs them (lib/assistant-exec.ts) against your data, so the same code works in local and synced
// mode and row-level security always applies.
import type Anthropic from "@anthropic-ai/sdk";

const date = { type: "string", description: "YYYY-MM-DD" } as const;
const time = { type: "string", description: "HH:MM, 24-hour Vietnam time" } as const;

export const READ_TABLES = ["transactions", "debts", "students", "lessons", "homework", "receipts", "events", "tasks", "milestones", "habits", "habit_logs", "music"] as const;
export const DELETE_TABLES = ["transactions", "debts", "lessons", "homework", "events", "tasks", "milestones", "habit_logs"] as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_overview",
    description:
      "Summary for one month: money in and out (teaching income from the register, logged income, spending by category including monthly fixed expenses and Food & drinks), teaching sessions and earnings per student, makeups left (a number the user keeps by hand), unpaid receipts and debts, open homework, tasks due soon, habit progress. Call this first for most questions.",
    input_schema: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM. Defaults to the current month." } },
      additionalProperties: false,
    },
  },
  {
    name: "agenda",
    description:
      "Everything on a run of days: events, classes (with taught/missed/cancelled/planned status), homework checks (with done and what to check) and timed tasks.",
    input_schema: {
      type: "object",
      properties: { from: date, days: { type: "integer", description: "Number of days, default 1, max 14" } },
      required: ["from"],
      additionalProperties: false,
    },
  },
  {
    name: "list_records",
    description: "List raw rows from one table, optionally filtered by date range and a text search. Use for details get_overview and agenda don't give.",
    input_schema: {
      type: "object",
      properties: {
        table: { type: "string", enum: [...READ_TABLES] },
        from: date,
        to: date,
        search: { type: "string", description: "Case- and accent-insensitive match on any text field" },
        limit: { type: "integer", description: "Default 40, max 200" },
      },
      required: ["table"],
      additionalProperties: false,
    },
  },
  {
    name: "log_transaction",
    description:
      "Log money spent or received. Amounts are whole VND (\"200k\" = 200000, \"1.5tr\" = 1500000). Don't use this for food and drinks (use log_food) or for teaching income (that comes from the register).",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["expense", "income"] },
        amount: { type: "integer" },
        title: { type: "string", description: "Short description as the user would write it, e.g. 'Grab home'" },
        category: {
          type: "string",
          description: "For expenses one of Necessity, Pleasure, Transport, Work, Other. For income a source such as Contract.",
        },
        date,
        monthly_fixed: { type: "boolean", description: "True for a subscription or bill charged every month (it then counts every month until stopped)" },
        note: { type: "string" },
      },
      required: ["kind", "amount", "title", "category"],
      additionalProperties: false,
    },
  },
  {
    name: "log_food",
    description: "Food & drinks spending, kept as one total per day. mode 'add' adds to the day's total (default), 'set' replaces it.",
    input_schema: {
      type: "object",
      properties: { amount: { type: "integer" }, date, mode: { type: "string", enum: ["add", "set"] } },
      required: ["amount"],
      additionalProperties: false,
    },
  },
  {
    name: "mark_lesson",
    description:
      "Record what happened to a class on a date: taught, missed_owe (the student missed it), cancelled, or clear (back to just planned). This never changes the makeups-left number; the user keeps that by hand.",
    input_schema: {
      type: "object",
      properties: {
        student: { type: "string", description: "Student or class name, e.g. 'Khánh An' or 'leWeekend'" },
        date,
        status: { type: "string", enum: ["taught", "missed_owe", "cancelled", "clear"] },
      },
      required: ["student", "date", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "log_homework",
    description: "Record homework given to a student so it shows up in their next check.",
    input_schema: {
      type: "object",
      properties: { student: { type: "string" }, title: { type: "string" }, assigned_on: date, note: { type: "string" } },
      required: ["student", "title"],
      additionalProperties: false,
    },
  },
  {
    name: "check_homework",
    description:
      "Mark a student's homework check as done for the class on or after a date (ticks the check task), and optionally mark their open homework items as checked.",
    input_schema: {
      type: "object",
      properties: {
        student: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD of the check (usually tonight). Defaults to today." },
        homework_checked: { type: "boolean", description: "Also mark all of the student's open homework items as checked" },
      },
      required: ["student"],
      additionalProperties: false,
    },
  },
  {
    name: "add_task",
    description: "Create a task, optionally with a time (it then gets reminders) and milestones that drive its progress bar.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        due_on: date,
        due_time: time,
        list: { type: "string", description: "Personal or Work, default Personal" },
        priority: { type: "boolean" },
        long_term: { type: "boolean", description: "A long-term goal rather than a to-do" },
        milestones: { type: "array", items: { type: "string" } },
        notes: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "update_task",
    description: "Complete or reopen a task, change its date or time, or tick or add milestones. Find it by id or by title text.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title_search: { type: "string" },
        done: { type: "boolean" },
        due_on: date,
        due_time: time,
        complete_milestones: { type: "array", items: { type: "string" }, description: "Milestone titles (or parts of them) to tick" },
        add_milestones: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  },
  {
    name: "add_event",
    description: "Put an event on the calendar. Use days for weekly repeats (0 = Sunday … 6 = Saturday). Leave times out for an all-day event.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        date,
        start_time: time,
        end_time: time,
        days: { type: "array", items: { type: "integer" } },
        kind: { type: "string", enum: ["focus", "routine", "personal", "work", "other"] },
        notes: { type: "string" },
      },
      required: ["title", "date"],
      additionalProperties: false,
    },
  },
  {
    name: "log_habit",
    description: "Log sleep (slept_at and woke_at; date = the morning you woke up), exercise (activity and minutes), or tick a custom habit.",
    input_schema: {
      type: "object",
      properties: {
        habit: { type: "string", description: "'sleep', 'exercise', or a custom habit name" },
        date,
        slept_at: time,
        woke_at: time,
        minutes: { type: "integer" },
        activity: { type: "string" },
      },
      required: ["habit"],
      additionalProperties: false,
    },
  },
  {
    name: "add_debt",
    description: "Record money someone owes the user (receivable) or the user owes someone (payable), or settle an open one by person name.",
    input_schema: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["receivable", "payable"] },
        person: { type: "string" },
        amount: { type: "integer" },
        note: { type: "string" },
        settle: { type: "boolean", description: "True to mark this person's open debt as settled instead of adding one" },
      },
      required: ["person"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_record",
    description: "Delete one row by id. Only when the user clearly asks to delete or undo something. Look the id up first.",
    input_schema: {
      type: "object",
      properties: { table: { type: "string", enum: [...DELETE_TABLES] }, id: { type: "string" } },
      required: ["table", "id"],
      additionalProperties: false,
    },
  },
];

export const SYSTEM = `You are the assistant inside Daybook, a personal dashboard for one person in Vietnam: a part-time English (IELTS) teacher and insurance agent. Daybook tracks money in VND (including monthly fixed bills and a daily Food & drinks total), students and their weekly classes (classes are calendar events), a teaching register, homework checks the night before each class, a calendar, tasks with milestones, and sleep and exercise habits.

How to work:
- Use the tools to read and change data. Never invent numbers; read them. For most questions call get_overview or agenda first.
- When the user tells you something happened ("spent 200k on grab", "taught Bách today", "Hân didn't come", "ăn trưa 60k"), log it right away with the matching tool, then confirm in one short line with the key numbers.
- Amounts: "k" means thousand, "tr" or "m" means million. Store whole VND.
- Students are matched by name without accents, so "khanh an" finds Khánh An. leWeekend is a group class (Khánh, Hân, Nhật, Trí). Hằng and Hân are different people.
- Teaching income is computed from taught classes on the register; never log it as a transaction.
- Use "missed_owe" for a class the student missed. Makeups left ("cần bù") are counted by the user by hand: report the number when asked, but never change it or work it out yourself.
- The user may write in Vietnamese or English. Reply in English unless they write fully in Vietnamese. Keep Vietnamese names and task titles exactly as written.
- Be brief and concrete. Format money like 1,250,000₫. Use a short list only when listing several items. No headings.
- Only delete when explicitly asked. If a request is ambiguous (two students match), ask one short question.
- Resolve "today", "tonight", "yesterday", "last Friday" and similar against the current time given below.`;

export function nowLine(now: { date: string; time: string; weekday: string }): string {
  return `Right now it is ${now.weekday} ${now.date}, ${now.time} (Vietnam, UTC+7).`;
}
