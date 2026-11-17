// Tool definitions shared by the chat API route (sent to Claude) and the
// browser (which runs them against your data, so the same code works in
// local mode and synced mode, and row-level security always applies).
import type Anthropic from "@anthropic-ai/sdk";

const date = { type: "string", description: "YYYY-MM-DD" } as const;
const time = { type: "string", description: "HH:MM, 24-hour Vietnam time" } as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_overview",
    description:
      "Summary for one month: money in/out by category, teaching sessions and earnings per student, makeups left (a number the user keeps by hand), unpaid receipts and debts, open homework, tasks due, habit progress. Call this first for most questions.",
    input_schema: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM. Defaults to the current month." } },
      additionalProperties: false,
    },
  },
  {
    name: "list_records",
    description:
      "List raw rows from one table, optionally filtered by date range and a text search. Tables: transactions, debts, students, slots, lessons, homework, receipts, events, tasks, milestones, habits, habit_logs.",
    input_schema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          enum: ["transactions", "debts", "students", "slots", "lessons", "homework", "receipts", "events", "tasks", "milestones", "habits", "habit_logs"],
        },
        from: date,
        to: date,
        search: { type: "string", description: "Case- and accent-insensitive text match on any text field" },
        limit: { type: "integer", description: "Default 40, max 200" },
      },
      required: ["table"],
      additionalProperties: false,
    },
  },
  {
    name: "agenda",
    description: "Everything scheduled on a range of days: events, classes (with taught/missed status) and homework check blocks.",
    input_schema: {
      type: "object",
      properties: { from: date, days: { type: "integer", description: "Number of days, default 1, max 14" } },
      required: ["from"],
      additionalProperties: false,
    },
  },
  {
    name: "log_transaction",
    description: "Log money spent or received. Amounts are whole VND (\"200k\" = 200000, \"1.5tr\" = 1500000).",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["expense", "income"] },
        amount: { type: "integer" },
        title: { type: "string", description: "Short English description, e.g. 'Grab home'" },
        category: {
          type: "string",
          description: "For expenses one of Necessity, Pleasure, Transport, Work, Other. For income a source such as Contract or Tutoring.",
        },
        date,
        recurring: { type: "boolean", description: "True if it repeats monthly (subscriptions)" },
        note: { type: "string" },
      },
      required: ["kind", "amount", "title", "category"],
      additionalProperties: false,
    },
  },
  {
    name: "mark_lesson",
    description:
      "Record what happened to a class on a date: taught, missed_owe (the student missed it), cancelled, or clear (remove the record). This never changes the makeup count; the user keeps that number themselves.",
    input_schema: {
      type: "object",
      properties: {
        student: { type: "string", description: "Student or class name, e.g. 'Khánh An' or 'leWeekend'" },
        date,
        status: { type: "string", enum: ["taught", "missed_owe", "cancelled", "clear"] },
        start_time: time,
        end_time: time,
      },
      required: ["student", "date", "status"],
      additionalProperties: false,
    },
  },
  {
    name: "log_homework",
    description: "Record homework assigned to a student so it shows up in the next check.",
    input_schema: {
      type: "object",
      properties: { student: { type: "string" }, title: { type: "string" }, assigned_on: date, note: { type: "string" } },
      required: ["student", "title"],
      additionalProperties: false,
    },
  },
  {
    name: "check_homework",
    description: "Mark homework as checked. Give an id, or a student to check all their open homework.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, student: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "add_task",
    description: "Create a task, optionally with milestones that drive its progress bar.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        due_on: date,
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
    description: "Complete or reopen a task, change its due date, or tick/add milestones. Find the task by id or by title text.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title_search: { type: "string" },
        done: { type: "boolean" },
        due_on: date,
        complete_milestones: { type: "array", items: { type: "string" }, description: "Milestone titles (or parts of them) to tick" },
        add_milestones: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  },
  {
    name: "add_event",
    description: "Put an event on the calendar. Use days for weekly repeats (0 = Sunday … 6 = Saturday).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        date,
        start_time: time,
        end_time: time,
        days: { type: "array", items: { type: "integer" } },
        remind_before: { type: "array", items: { type: "integer" }, description: "Minutes before, e.g. [10]" },
        kind: { type: "string", enum: ["focus", "routine", "personal", "work", "other"] },
        notes: { type: "string" },
      },
      required: ["title", "date"],
      additionalProperties: false,
    },
  },
  {
    name: "log_habit",
    description: "Log sleep (slept_at and woke_at, date = the morning you woke up) or exercise (activity and minutes) or tick a custom habit.",
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
    description: "Record money someone owes you (receivable) or you owe someone (payable), or settle an existing one by person name.",
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
    description: "Delete one row by id. Only use when the user clearly asks to delete or undo something. Look up the id first.",
    input_schema: {
      type: "object",
      properties: {
        table: {
          type: "string",
          enum: ["transactions", "debts", "lessons", "homework", "receipts", "events", "tasks", "milestones", "habit_logs"],
        },
        id: { type: "string" },
      },
      required: ["table", "id"],
      additionalProperties: false,
    },
  },
];

export const SYSTEM = `You are the assistant inside Daybook, a personal dashboard for one person: a part-time English (IELTS) teacher in Vietnam who tracks money in VND, students and classes, homework checks, a calendar, tasks with milestones, and sleep and exercise habits.

How to work:
- Use the tools to read and change data. Never invent numbers; read them. For most questions call get_overview first.
- When the user tells you something happened ("spent 200k on grab", "taught Bách today", "Hân didn't come"), log it right away with the matching tool, then confirm in one short line with the key numbers.
- Amounts: "k" means thousand, "tr" or "m" means million. Store whole VND.
- Students are matched by name without accents, so "khanh an" finds Khánh An. leWeekend is a group class (Khánh, Hân, Nhật, Trí).
- Use "missed_owe" for a class the student missed. The number of makeups left is kept by the user by hand: report it when asked, but never change it or compute it yourself.
- The user may write in Vietnamese or English. Reply in English unless they write fully in Vietnamese. Keep Vietnamese names and task titles exactly as written.
- Be brief and concrete. Format money like 1,250,000₫. Use short lists only when listing several items.
- Only delete when explicitly asked. If a request is ambiguous (two students match), ask one short question.
- Resolve "today", "yesterday", "last Friday" and similar against the current time given below.`;

export function nowLine(now: { date: string; time: string; weekday: string }): string {
  return `Right now it is ${now.weekday} ${now.date}, ${now.time} (Vietnam, UTC+7).`;
}
