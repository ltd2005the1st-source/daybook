// Runs the assistant's tool calls in the browser, against the same store the app uses.
import { addDays, monthOf, startOfWeek, today } from "./dates";
import { fold, vnd } from "./format";
import { virtualFixed } from "./fixed";
import { agendaOn, checkContents, checkRow, checkTasksBetween, lessonRow, makeupsOwed, noteFor, taughtIn } from "./teaching";
import { describeEvent, describeTask, duplicateEvent, duplicateTask } from "./dupes";
import { EVENT_COLORS } from "./colors";
import { DEFAULT_REMIND, EXPENSE_CATEGORIES, type CalEvent, type Store, type TableName, type Tables } from "./types";
import { DELETE_TABLES, READ_TABLES } from "./assistant-tools";

export type ToolCtx = {
  get: () => Store;
  insert: <T extends TableName>(t: T, row: Partial<Tables[T]>) => Tables[T];
  update: <T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>) => void;
  remove: <T extends TableName>(t: T, id: string, opts?: { silent?: boolean }) => void;
};

export type ToolOutcome = { result: unknown; action?: string; error?: boolean };

const FOOD_TITLE = "Food & drinks";
type Input = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
const isDate = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: string | undefined) => !!v && /^\d{2}:\d{2}$/.test(v);

function findStudent(store: Store, name: string | undefined) {
  if (!name) return { error: "Name a student or class." };
  const q = fold(name);
  const exact = store.students.filter((x) => fold(x.name) === q);
  if (exact.length === 1) return { student: exact[0] };
  const hits = store.students.filter((x) => fold(x.name).includes(q) || q.includes(fold(x.name)) || x.members.some((m) => fold(m) === q));
  if (hits.length === 1) return { student: hits[0] };
  if (!hits.length) return { error: `No student matches "${name}". Students: ${store.students.map((x) => x.name).join(", ")}` };
  return { error: `"${name}" matches several: ${hits.map((x) => x.name).join(", ")}. Ask which one.` };
}

function overview(store: Store, month: string) {
  const tx = store.transactions.filter((t) => t.date.startsWith(month));
  const teaching = store.students
    .filter((st) => st.active)
    .map((st) => {
      const taught = taughtIn(store, st.id, month);
      return {
        name: st.name,
        kind: st.kind,
        members: st.members.length ? st.members : undefined,
        rate: st.rate,
        sessions_taught: taught.length,
        dates: taught.map((l) => l.date),
        earned: taught.length * st.rate,
        makeups_left_kept_by_user: makeupsOwed(store, st),
        open_homework: store.homework.filter((h) => h.student_id === st.id && h.status === "open").map((h) => h.title),
      };
    });
  const teachingTotal = teaching.reduce((a, b) => a + b.earned, 0);
  const manualIncome = tx.filter((t) => t.kind === "income").reduce((a, t) => a + t.amount, 0);
  // Monthly fixed expenses with no row this month still count, like on the Money page.
  const expenses = [
    ...tx.filter((t) => t.kind === "expense").map((t) => ({ title: t.title, amount: t.amount, category: t.category, date: t.date })),
    ...virtualFixed(store.transactions, month).map((f) => ({ title: f.title, amount: f.amount, category: f.category, date: f.date })),
  ];
  const spent = expenses.reduce((a, t) => a + t.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const t of expenses) byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
  const food = expenses.filter((t) => t.title === FOOD_TITLE).reduce((a, t) => a + t.amount, 0);
  const t0 = today();
  const ws = startOfWeek(t0);
  return {
    month,
    money: {
      income_total: teachingTotal + manualIncome,
      income_from_teaching: teachingTotal,
      income_logged: manualIncome,
      spent,
      kept: teachingTotal + manualIncome - spent,
      spent_by_category: byCategory,
      food_and_drinks: food,
      monthly_fixed: virtualFixed(store.transactions, month).length + tx.filter((t) => t.recurring).length,
      biggest_expenses: [...expenses].filter((x) => x.title !== FOOD_TITLE).sort((a, b) => b.amount - a.amount).slice(0, 6),
    },
    teaching,
    unpaid_receipts: store.receipts
      .filter((r) => r.status === "issued")
      .map((r) => ({ id: r.id, student: store.students.find((x) => x.id === r.student_id)?.name, month: r.month, amount: r.amount })),
    debts_open: store.debts.filter((d) => !d.settled).map((d) => ({ id: d.id, direction: d.direction, person: d.person, amount: d.amount, note: d.note })),
    tasks_due_within_7_days: store.tasks
      .filter((x) => !x.done && !x.student_id && x.due_on && x.due_on <= addDays(t0, 7))
      .map((x) => {
        const ms = store.milestones.filter((m) => m.task_id === x.id);
        return { id: x.id, title: x.title, due_on: x.due_on, due_time: x.due_time ?? undefined, milestones: ms.length ? `${ms.filter((m) => m.done).length}/${ms.length}` : undefined };
      }),
    long_term_goals: store.tasks.filter((x) => !x.done && x.horizon === "long").map((x) => x.title),
    habits: store.habits.map((h) => {
      const logs = store.habit_logs.filter((l) => l.habit_id === h.id);
      return {
        name: h.name,
        kind: h.kind,
        target: h.kind === "sleep" ? `${h.target_bedtime}–${h.target_wake}` : `${h.weekly_target}/week`,
        days_logged_this_week: new Set(logs.filter((l) => l.date >= ws).map((l) => l.date)).size,
        last_7_logs: [...logs]
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 7)
          .map((l) => ({ date: l.date, slept_at: l.slept_at, woke_at: l.woke_at, minutes: l.minutes, activity: l.activity })),
      };
    }),
  };
}

export function runTool(name: string, input: Input, ctx: ToolCtx): ToolOutcome {
  const store = ctx.get();
  const t0 = today();
  switch (name) {
    case "get_overview":
      return { result: overview(store, s(input.month) ?? monthOf(t0)) };

    case "agenda": {
      const from = isDate(s(input.from)) ? s(input.from)! : t0;
      const days = Math.min(14, Math.max(1, n(input.days) ?? 1));
      const checks = checkTasksBetween(store, from, days);
      return {
        result: Array.from({ length: days }, (_, i) => {
          const d = addDays(from, i);
          return {
            date: d,
            items: agendaOn(store, d).map((o) => ({
              kind: o.kind === "lesson" ? "class" : o.kind,
              title: o.title,
              start: o.start ?? "all day",
              end: o.end ?? undefined,
              status: o.status,
              done: o.done,
              notes: o.event ? noteFor(o.event, d) ?? undefined : undefined,
              what_to_check: o.kind === "check" ? checks.find((c) => c.key === o.key)?.contents ?? undefined : undefined,
              for_class_on: o.forDate,
            })),
          };
        }),
      };
    }

    case "list_records": {
      const table = s(input.table) as (typeof READ_TABLES)[number];
      if (!table || !READ_TABLES.includes(table)) return { result: "Unknown table", error: true };
      let rows = store[table] as unknown as Record<string, unknown>[];
      const from = s(input.from);
      const to = s(input.to);
      const dateKey = ({ transactions: "date", lessons: "date", habit_logs: "date", events: "date", homework: "assigned_on", tasks: "due_on" } as Record<string, string>)[table];
      if (dateKey && from) rows = rows.filter((r) => String(r[dateKey] ?? "") >= from);
      if (dateKey && to) rows = rows.filter((r) => String(r[dateKey] ?? "") <= to);
      const q = s(input.search);
      if (q) rows = rows.filter((r) => Object.values(r).some((v) => typeof v === "string" && fold(v).includes(fold(q))));
      const limit = Math.min(200, n(input.limit) ?? 40);
      const names = Object.fromEntries(store.students.map((x) => [x.id, x.name]));
      const out = rows.slice(-limit).map((r) => {
        const { user_id: _u, created_at: _c, ...rest } = r;
        return r.student_id ? { ...rest, student: names[r.student_id as string] } : rest;
      });
      return { result: { count: rows.length, rows: out } };
    }

    case "log_transaction": {
      const amount = n(input.amount);
      const title = s(input.title);
      const kind = s(input.kind) === "income" ? "income" : "expense";
      if (!amount || amount <= 0 || !title) return { result: "amount and title are required", error: true };
      let category = s(input.category) ?? "Other";
      if (kind === "expense") category = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === category.toLowerCase()) ?? "Other";
      const date = isDate(s(input.date)) ? s(input.date)! : t0;
      const row = ctx.insert("transactions", {
        kind,
        amount: Math.round(amount),
        title,
        category,
        date,
        recurring: input.monthly_fixed === true,
        note: s(input.note) ?? null,
      });
      return {
        result: { ok: true, id: row.id },
        action: `${kind === "income" ? "Income" : "Spent"}: ${title} ${vnd(amount)} (${category})${input.monthly_fixed === true ? ", every month" : ""}`,
      };
    }

    case "log_food": {
      const amount = n(input.amount);
      if (amount == null || amount < 0) return { result: "amount required", error: true };
      const date = isDate(s(input.date)) ? s(input.date)! : t0;
      const rows = store.transactions.filter((t) => t.kind === "expense" && t.title === FOOD_TITLE && t.date === date);
      const before = rows.reduce((a, t) => a + t.amount, 0);
      const after = s(input.mode) === "set" ? Math.round(amount) : before + Math.round(amount);
      const [first, ...rest] = rows;
      if (after <= 0) rows.forEach((r) => ctx.remove("transactions", r.id, { silent: true }));
      else if (first) {
        ctx.update("transactions", first.id, { amount: after });
        rest.forEach((r) => ctx.remove("transactions", r.id, { silent: true }));
      } else ctx.insert("transactions", { kind: "expense", title: FOOD_TITLE, category: "Necessity", amount: after, date, recurring: false, note: null });
      return { result: { ok: true, day_total: after }, action: `Food & drinks ${date}: ${before ? `${vnd(before)} → ` : ""}${vnd(after)}` };
    }

    case "mark_lesson": {
      const f = findStudent(store, s(input.student));
      if (!f.student) return { result: f.error, error: true };
      const date = isDate(s(input.date)) ? s(input.date)! : t0;
      const status = s(input.status);
      const row = lessonRow(store, f.student.id, date);
      if (status === "clear") {
        if (row) ctx.remove("lessons", row.id, { silent: true });
        return { result: { ok: true }, action: `${f.student.name} ${date}: back to planned` };
      }
      if (status !== "taught" && status !== "missed_owe" && status !== "cancelled") return { result: "bad status", error: true };
      if (row) ctx.update("lessons", row.id, { status });
      else ctx.insert("lessons", { student_id: f.student.id, date, status, start_time: null, end_time: null, note: null });
      const label = { taught: "taught", missed_owe: "missed", cancelled: "cancelled" }[status];
      return { result: { ok: true }, action: `${f.student.name} ${date}: ${label}` };
    }

    case "log_homework": {
      const f = findStudent(store, s(input.student));
      if (!f.student) return { result: f.error, error: true };
      const title = s(input.title);
      if (!title) return { result: "title required", error: true };
      ctx.insert("homework", { student_id: f.student.id, title, note: s(input.note) ?? null, assigned_on: isDate(s(input.assigned_on)) ? s(input.assigned_on)! : t0, status: "open", checked_on: null });
      return { result: { ok: true }, action: `Homework for ${f.student.name}: ${title}` };
    }

    case "check_homework": {
      const f = findStudent(store, s(input.student));
      if (!f.student) return { result: f.error, error: true };
      const st = f.student;
      const from = isDate(s(input.date)) ? s(input.date)! : t0;
      // The first check for this student from that day on (usually tonight's).
      const c = checkTasksBetween(store, from, 8).find((x) => x.student.id === st.id && !x.done);
      const done: string[] = [];
      if (c) {
        const row = checkRow(store, st.id, c.classDate);
        const patch = { done: true, done_at: new Date().toISOString() };
        if (row) ctx.update("tasks", row.id, patch);
        else
          ctx.insert("tasks", {
            title: `Check ${st.name}`,
            notes: null,
            list: "Teaching",
            due_on: c.date,
            due_time: c.time,
            priority: false,
            horizon: "now",
            sort: 0,
            student_id: st.id,
            check_for: c.classDate,
            ...patch,
          });
        done.push(`check for the ${c.classDate} class ticked`);
      }
      if (input.homework_checked === true) {
        const open = store.homework.filter((h) => h.student_id === st.id && h.status === "open");
        open.forEach((h) => ctx.update("homework", h.id, { status: "checked", checked_on: t0 }));
        if (open.length) done.push(`${open.length} homework checked`);
      }
      if (!done.length) return { result: `No open check for ${st.name} in the next week.`, error: true };
      return { result: { ok: true, what_to_check: c ? checkContents(st, c.row) : undefined }, action: `${st.name}: ${done.join(", ")}` };
    }

    case "add_task": {
      const title = s(input.title);
      if (!title) return { result: "title required", error: true };
      const dup = duplicateTask(store, title);
      if (dup) return { result: `${describeTask(dup)} Not added again (id ${dup.id}).`, error: true };
      const long = input.long_term === true;
      const task = ctx.insert("tasks", {
        title,
        notes: s(input.notes) ?? null,
        list: s(input.list) ?? "Personal",
        due_on: isDate(s(input.due_on)) ? s(input.due_on)! : long ? null : t0,
        due_time: isTime(s(input.due_time)) ? s(input.due_time)! : null,
        priority: input.priority === true,
        horizon: long ? "long" : "now",
        done: false,
        done_at: null,
        sort: store.tasks.length,
      });
      const ms = arr<string>(input.milestones).filter((m) => typeof m === "string" && m.trim());
      ms.forEach((m, i) => ctx.insert("milestones", { task_id: task.id, title: m, done: false, sort: i }));
      return {
        result: { ok: true, id: task.id },
        action: `Task: ${title}${task.due_time ? ` at ${task.due_time}` : ""}${ms.length ? ` with ${ms.length} milestones` : ""}`,
      };
    }

    case "update_task": {
      let task = s(input.id) ? store.tasks.find((x) => x.id === input.id) : undefined;
      if (!task && s(input.title_search)) {
        const q = fold(s(input.title_search)!);
        const hits = store.tasks.filter((x) => fold(x.title).includes(q));
        if (hits.length > 1) {
          const open = hits.filter((x) => !x.done);
          if (open.length === 1) task = open[0];
          else return { result: `Several tasks match: ${hits.map((x) => `${x.title} (${x.id})`).join("; ")}`, error: true };
        } else task = hits[0];
      }
      if (!task) return { result: "Task not found", error: true };
      const id = task.id;
      const changes: string[] = [];
      const patch: Partial<Tables["tasks"]> = {};
      if (typeof input.done === "boolean") {
        patch.done = input.done;
        patch.done_at = input.done ? new Date().toISOString() : null;
        changes.push(input.done ? "done" : "reopened");
      }
      if (isDate(s(input.due_on))) {
        patch.due_on = s(input.due_on)!;
        changes.push(`due ${patch.due_on}`);
      }
      if (isTime(s(input.due_time))) {
        patch.due_time = s(input.due_time)!;
        changes.push(`at ${patch.due_time}`);
      }
      if (Object.keys(patch).length) ctx.update("tasks", id, patch);
      const ms = store.milestones.filter((m) => m.task_id === id);
      for (const q of arr<string>(input.complete_milestones)) {
        const m = ms.find((x) => fold(x.title).includes(fold(String(q))));
        if (m) {
          ctx.update("milestones", m.id, { done: true });
          changes.push(`ticked “${m.title}”`);
        }
      }
      arr<string>(input.add_milestones).forEach((m, i) => {
        ctx.insert("milestones", { task_id: id, title: String(m), done: false, sort: ms.length + i });
        changes.push(`added “${m}”`);
      });
      const after = ctx.get().milestones.filter((m) => m.task_id === id);
      return {
        result: { ok: true, milestones: after.length ? `${after.filter((m) => m.done).length}/${after.length}` : undefined },
        action: `${task.title}: ${changes.join(", ") || "no change"}`,
      };
    }

    case "add_event": {
      const title = s(input.title);
      if (!title) return { result: "title required", error: true };
      const start = isTime(s(input.start_time)) ? s(input.start_time)! : null;
      const row: Partial<CalEvent> = {
        title,
        date: isDate(s(input.date)) ? s(input.date)! : t0,
        start_time: start,
        end_time: start ? (isTime(s(input.end_time)) ? s(input.end_time)! : null) : null,
        days: arr<number>(input.days).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        until: null,
        color: EVENT_COLORS[7].hex,
        kind: (["focus", "routine", "personal", "work", "other"].includes(String(input.kind)) ? input.kind : "personal") as CalEvent["kind"],
        remind_before: DEFAULT_REMIND,
        notes: s(input.notes) ?? null,
        skip_dates: [],
      };
      if (start && !row.end_time) {
        const [h, m] = start.split(":").map(Number);
        row.end_time = `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      }
      const clash = duplicateEvent(store, row as CalEvent);
      if (clash) return { result: `${describeEvent(clash)} Not added again.`, error: true };
      ctx.insert("events", row);
      return { result: { ok: true }, action: `Event: ${title}, ${row.date}${start ? ` ${start}–${row.end_time}` : ", all day"}${row.days!.length ? ", weekly" : ""}` };
    }

    case "log_habit": {
      const q = fold(s(input.habit) ?? "");
      const h = store.habits.find((x) => x.kind === q || fold(x.name) === q) ?? (q ? store.habits.find((x) => fold(x.name).includes(q)) : undefined);
      if (!h) return { result: `No habit "${input.habit}". Habits: ${store.habits.map((x) => x.name).join(", ")}`, error: true };
      const date = isDate(s(input.date)) ? s(input.date)! : t0;
      if (h.kind === "sleep") {
        const existing = store.habit_logs.find((l) => l.habit_id === h.id && l.date === date);
        const patch = { slept_at: s(input.slept_at) ?? existing?.slept_at ?? null, woke_at: s(input.woke_at) ?? existing?.woke_at ?? null };
        if (existing) ctx.update("habit_logs", existing.id, patch);
        else ctx.insert("habit_logs", { habit_id: h.id, date, minutes: null, activity: null, note: null, ...patch });
        return { result: { ok: true }, action: `Sleep ${date}: ${patch.slept_at ?? "?"} → ${patch.woke_at ?? "?"}` };
      }
      ctx.insert("habit_logs", { habit_id: h.id, date, slept_at: null, woke_at: null, minutes: n(input.minutes) ?? null, activity: s(input.activity) ?? null, note: null });
      return { result: { ok: true }, action: `${h.name} ${date}${input.activity ? `: ${input.activity}` : ""}${input.minutes ? ` ${input.minutes} min` : ""}` };
    }

    case "add_debt": {
      const person = s(input.person);
      if (!person) return { result: "person required", error: true };
      if (input.settle === true) {
        const d = store.debts.find((x) => !x.settled && fold(x.person) === fold(person));
        if (!d) return { result: "No open debt for that person", error: true };
        ctx.update("debts", d.id, { settled: true });
        return { result: { ok: true }, action: `Settled ${d.person} (${vnd(d.amount)})` };
      }
      const amount = n(input.amount);
      if (!amount) return { result: "amount required", error: true };
      const direction = s(input.direction) === "payable" ? "payable" : "receivable";
      ctx.insert("debts", { direction, person, amount, note: s(input.note) ?? null, due_on: null, settled: false, student_id: null });
      return { result: { ok: true }, action: `${direction === "receivable" ? `${person} owes you` : `You owe ${person}`} ${vnd(amount)}` };
    }

    case "delete_record": {
      const table = s(input.table) as (typeof DELETE_TABLES)[number];
      const id = s(input.id);
      if (!table || !DELETE_TABLES.includes(table) || !id) return { result: "Not found", error: true };
      const row = (store[table] as { id: string }[]).find((r) => r.id === id);
      if (!row) return { result: "Not found", error: true };
      ctx.remove(table, id, { silent: true });
      const label = (row as { title?: string; person?: string }).title ?? (row as { person?: string }).person ?? table.replace(/s$/, "");
      return { result: { ok: true }, action: `Deleted: ${label}` };
    }
  }
  return { result: `Unknown tool ${name}`, error: true };
}
