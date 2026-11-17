import { addDays, monthOf, startOfWeek, today } from "./dates";
import { fold, vnd } from "./format";
import { agendaOn, lessonRow, makeupsOwed, taughtIn } from "./teaching";
import { EXPENSE_CATEGORIES, type LessonStatus, type Store, type TableName, type Tables } from "./types";

export type ToolCtx = {
  get: () => Store;
  insert: <T extends TableName>(t: T, row: Partial<Tables[T]>) => Tables[T];
  update: <T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>) => void;
  remove: <T extends TableName>(t: T, id: string, opts?: { silent?: boolean }) => void;
};

export type ToolOutcome = { result: unknown; action?: string; error?: boolean };

type Input = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : undefined);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const arr = <T>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);

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
  const teaching = store.students.map((st) => {
    const taught = taughtIn(store, st.id, month);
    return {
      name: st.name,
      kind: st.kind,
      rate: st.rate,
      sessions_taught: taught.length,
      dates: taught.map((l) => l.date),
      earned: taught.length * st.rate,
      makeups_left_noted_by_user: makeupsOwed(store, st),
      open_homework: store.homework.filter((h) => h.student_id === st.id && h.status === "open").map((h) => h.title),
      active: st.active,
    };
  });
  const teachingTotal = teaching.reduce((a, b) => a + b.earned, 0);
  const manualIncome = tx.filter((t) => t.kind === "income").reduce((a, t) => a + t.amount, 0);
  const spent = tx.filter((t) => t.kind === "expense").reduce((a, t) => a + t.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const t of tx.filter((x) => x.kind === "expense")) byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
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
      biggest_expenses: [...tx.filter((x) => x.kind === "expense")].sort((a, b) => b.amount - a.amount).slice(0, 5).map((x) => ({ title: x.title, amount: x.amount, date: x.date })),
    },
    teaching,
    unpaid_receipts: store.receipts.filter((r) => r.status === "issued").map((r) => ({ id: r.id, student: store.students.find((x) => x.id === r.student_id)?.name, month: r.month, amount: r.amount })),
    debts_open: store.debts.filter((d) => !d.settled).map((d) => ({ id: d.id, direction: d.direction, person: d.person, amount: d.amount, note: d.note })),
    tasks_due: store.tasks.filter((x) => !x.done && x.due_on && x.due_on <= addDays(t0, 7)).map((x) => {
      const ms = store.milestones.filter((m) => m.task_id === x.id);
      return { id: x.id, title: x.title, due_on: x.due_on, milestones: ms.length ? `${ms.filter((m) => m.done).length}/${ms.length}` : undefined };
    }),
    long_term_goals: store.tasks.filter((x) => !x.done && x.horizon === "long").map((x) => x.title),
    habits: store.habits.map((h) => {
      const logs = store.habit_logs.filter((l) => l.habit_id === h.id);
      return {
        name: h.name,
        kind: h.kind,
        target: h.kind === "sleep" ? `${h.target_bedtime}–${h.target_wake}` : `${h.weekly_target}/week`,
        this_week: new Set(logs.filter((l) => l.date >= ws).map((l) => l.date)).size,
        last_7_logs: logs.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map((l) => ({ date: l.date, slept_at: l.slept_at, woke_at: l.woke_at, minutes: l.minutes, activity: l.activity })),
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

    case "list_records": {
      const table = s(input.table) as TableName;
      if (!table || !(table in store)) return { result: "Unknown table", error: true };
      let rows = store[table] as unknown as Record<string, unknown>[];
      const from = s(input.from);
      const to = s(input.to);
      const dateKey = ["transactions", "lessons", "habit_logs"].includes(table) ? "date" : table === "homework" ? "assigned_on" : table === "tasks" ? "due_on" : table === "events" ? "date" : null;
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

    case "agenda": {
      const from = s(input.from) ?? t0;
      const days = Math.min(14, Math.max(1, n(input.days) ?? 1));
      const out = Array.from({ length: days }, (_, i) => {
        const d = addDays(from, i);
        return {
          date: d,
          items: agendaOn(store, d).map((o) => ({ kind: o.kind, title: o.title, start: o.start, end: o.end, status: o.status })),
        };
      });
      return { result: out };
    }

    case "log_transaction": {
      const amount = n(input.amount);
      const title = s(input.title);
      const kind = s(input.kind) === "income" ? "income" : "expense";
      if (!amount || amount <= 0 || !title) return { result: "amount and title are required", error: true };
      let category = s(input.category) ?? "Other";
      if (kind === "expense") {
        const match = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === category.toLowerCase());
        category = match ?? "Other";
      }
      const row = ctx.insert("transactions", {
        kind,
        amount: Math.round(amount),
        title,
        category,
        date: s(input.date) ?? t0,
        recurring: input.recurring === true,
        note: s(input.note) ?? null,
      });
      return { result: { ok: true, id: row.id }, action: `Logged ${kind === "income" ? "income" : "expense"}: ${title} ${vnd(amount)} (${category})` };
    }

    case "mark_lesson": {
      const f = findStudent(store, s(input.student));
      if (!f.student) return { result: f.error, error: true };
      const date = s(input.date) ?? t0;
      const status = s(input.status) as LessonStatus | "clear" | undefined;
      const row = lessonRow(store, f.student.id, date);
      if (status === "clear") {
        if (row) ctx.remove("lessons", row.id, { silent: true });
        return { result: { ok: true }, action: `Cleared ${f.student.name} on ${date}` };
      }
      if (status !== "taught" && status !== "missed_owe" && status !== "cancelled") return { result: "bad status", error: true };
      const patch = { status, start_time: s(input.start_time) ?? row?.start_time ?? null, end_time: s(input.end_time) ?? row?.end_time ?? null };
      if (row) ctx.update("lessons", row.id, patch);
      else ctx.insert("lessons", { student_id: f.student.id, date, note: null, ...patch });
      const label = { taught: "taught", missed_owe: "missed", cancelled: "cancelled" }[status];
      return {
        result: { ok: true },
        action: `${f.student.name} on ${date}: ${label}`,
      };
    }

    case "log_homework": {
      const f = findStudent(store, s(input.student));
      if (!f.student) return { result: f.error, error: true };
      const title = s(input.title);
      if (!title) return { result: "title required", error: true };
      ctx.insert("homework", { student_id: f.student.id, title, note: s(input.note) ?? null, assigned_on: s(input.assigned_on) ?? t0, status: "open", checked_on: null });
      return { result: { ok: true }, action: `Homework for ${f.student.name}: ${title}` };
    }

    case "check_homework": {
      const id = s(input.id);
      if (id) {
        const h = store.homework.find((x) => x.id === id);
        if (!h) return { result: "No homework with that id", error: true };
        ctx.update("homework", id, { status: "checked", checked_on: t0 });
        return { result: { ok: true }, action: `Checked: ${h.title}` };
      }
      const f = findStudent(store, s(input.student));
      if (!f.student) return { result: f.error, error: true };
      const open = store.homework.filter((h) => h.student_id === f.student!.id && h.status === "open");
      open.forEach((h) => ctx.update("homework", h.id, { status: "checked", checked_on: t0 }));
      return { result: { ok: true, checked: open.map((h) => h.title) }, action: `Checked ${open.length} homework for ${f.student.name}` };
    }

    case "add_task": {
      const title = s(input.title);
      if (!title) return { result: "title required", error: true };
      const long = input.long_term === true;
      const task = ctx.insert("tasks", {
        title,
        notes: s(input.notes) ?? null,
        list: s(input.list) ?? "Personal",
        due_on: s(input.due_on) ?? (long ? null : t0),
        priority: input.priority === true,
        horizon: long ? "long" : "now",
        done: false,
        done_at: null,
        sort: store.tasks.length,
      });
      const ms = arr<string>(input.milestones);
      ms.forEach((m, i) => ctx.insert("milestones", { task_id: task.id, title: m, done: false, sort: i }));
      return { result: { ok: true, id: task.id }, action: `Task: ${title}${ms.length ? ` with ${ms.length} milestones` : ""}` };
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
      const changes: string[] = [];
      if (typeof input.done === "boolean") {
        ctx.update("tasks", task.id, { done: input.done, done_at: input.done ? new Date().toISOString() : null });
        changes.push(input.done ? "done" : "reopened");
      }
      if (s(input.due_on)) {
        ctx.update("tasks", task.id, { due_on: s(input.due_on)! });
        changes.push(`due ${input.due_on}`);
      }
      const ms = store.milestones.filter((m) => m.task_id === task!.id);
      for (const q of arr<string>(input.complete_milestones)) {
        const m = ms.find((x) => fold(x.title).includes(fold(q)));
        if (m) {
          ctx.update("milestones", m.id, { done: true });
          changes.push(`ticked “${m.title}”`);
        }
      }
      arr<string>(input.add_milestones).forEach((m, i) => {
        ctx.insert("milestones", { task_id: task!.id, title: m, done: false, sort: ms.length + i });
        changes.push(`added “${m}”`);
      });
      const after = ctx.get().milestones.filter((m) => m.task_id === task!.id);
      return {
        result: { ok: true, milestones: `${after.filter((m) => m.done).length}/${after.length}` },
        action: `${task.title}: ${changes.join(", ") || "no change"}`,
      };
    }

    case "add_event": {
      const title = s(input.title);
      if (!title) return { result: "title required", error: true };
      ctx.insert("events", {
        title,
        date: s(input.date) ?? t0,
        start_time: s(input.start_time) ?? null,
        end_time: s(input.end_time) ?? null,
        days: arr<number>(input.days),
        until: null,
        color: "#4A51AC",
        kind: (s(input.kind) as "personal") ?? "personal",
        remind_before: arr<number>(input.remind_before).length ? arr<number>(input.remind_before) : [10],
        notes: s(input.notes) ?? null,
        skip_dates: [],
      });
      return { result: { ok: true }, action: `Event: ${title} ${input.date ?? t0} ${input.start_time ?? ""}` };
    }

    case "log_habit": {
      const q = fold(s(input.habit) ?? "");
      const h = store.habits.find((x) => x.kind === q || fold(x.name) === q) ?? store.habits.find((x) => fold(x.name).includes(q));
      if (!h) return { result: `No habit "${input.habit}". Habits: ${store.habits.map((x) => x.name).join(", ")}`, error: true };
      const date = s(input.date) ?? t0;
      if (h.kind === "sleep") {
        const existing = store.habit_logs.find((l) => l.habit_id === h.id && l.date === date);
        const patch = { slept_at: s(input.slept_at) ?? existing?.slept_at ?? null, woke_at: s(input.woke_at) ?? existing?.woke_at ?? null };
        if (existing) ctx.update("habit_logs", existing.id, patch);
        else ctx.insert("habit_logs", { habit_id: h.id, date, minutes: null, activity: null, note: null, ...patch });
        return { result: { ok: true }, action: `Sleep ${date}: ${patch.slept_at ?? "?"} → ${patch.woke_at ?? "?"}` };
      }
      ctx.insert("habit_logs", { habit_id: h.id, date, slept_at: null, woke_at: null, minutes: n(input.minutes) ?? null, activity: s(input.activity) ?? null, note: null });
      return { result: { ok: true }, action: `${h.name} ${date}${input.activity ? `: ${input.activity}` : ""}${input.minutes ? ` ${input.minutes}m` : ""}` };
    }

    case "add_debt": {
      const person = s(input.person);
      if (!person) return { result: "person required", error: true };
      if (input.settle === true) {
        const d = store.debts.find((x) => !x.settled && fold(x.person) === fold(person));
        if (!d) return { result: "No open debt for that person", error: true };
        ctx.update("debts", d.id, { settled: true });
        return { result: { ok: true }, action: `Settled ${person} (${vnd(d.amount)})` };
      }
      const amount = n(input.amount);
      if (!amount) return { result: "amount required", error: true };
      const direction = s(input.direction) === "payable" ? "payable" : "receivable";
      ctx.insert("debts", { direction, person, amount, note: s(input.note) ?? null, due_on: null, settled: false, student_id: null });
      return { result: { ok: true }, action: `${direction === "receivable" ? `${person} owes you` : `You owe ${person}`} ${vnd(amount)}` };
    }

    case "delete_record": {
      const table = s(input.table) as TableName;
      const id = s(input.id);
      const row = table && id ? (store[table] as { id: string }[]).find((r) => r.id === id) : undefined;
      if (!row) return { result: "Not found", error: true };
      ctx.remove(table, id!);
      return { result: { ok: true }, action: `Deleted a ${table.replace(/s$/, "")}` };
    }
  }
  return { result: `Unknown tool ${name}`, error: true };
}
