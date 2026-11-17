"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Flag, Plus, Trash2 } from "lucide-react";
import { useData } from "@/components/data";
import { MilestoneBar } from "@/components/milestone-bar";
import { Strike, TASK_ENTER, TASK_EXIT, useCompleteTask } from "@/components/complete";
import { Field, Page, PageHeader, Section, Segmented, Sheet, Tick } from "@/components/ui";
import { addDays, relDay, today, weekday } from "@/lib/dates";
import { cx } from "@/lib/format";
import { describeTask, duplicateTask } from "@/lib/dupes";
import type { Task } from "@/lib/types";

/** A time at the end of the text: "3pm", "9:30am", "15:00", "15h", "15h30", optionally after "at". */
function takeTime(s: string): [string, string | null] {
  const m = s.match(/\s+(?:at\s+|lúc\s+)?(\d{1,2})(?:[:h.](\d{2}))?\s*(am|pm|h)?$/i);
  if (!m) return [s, null];
  const hasMarker = m[2] !== undefined || m[3] !== undefined || /\s(at|lúc)\s/i.test(m[0]);
  if (!hasMarker) return [s, null]; // a bare number is part of the title ("Read chapter 2")
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return [s, null];
  return [s.slice(0, m.index), `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`];
}

/** "Read chapter 2 tomorrow 3pm !" → due tomorrow at 15:00, flagged. */
function parseQuick(input: string): { title: string; due: string | null; time: string | null; priority: boolean } {
  let s = input.trim();
  let priority = false;
  let due: string | null = null;
  let time: string | null = null;
  if (/\s!$/.test(s) || s.endsWith("!")) {
    priority = true;
    s = s.replace(/\s*!$/, "");
  }
  [s, time] = takeTime(s);
  const t = today();
  const words: [RegExp, () => string][] = [
    [/\s+(today|tod)$/i, () => t],
    [/\s+(tomorrow|tmr|tmrw)$/i, () => addDays(t, 1)],
    [/\s+next week$/i, () => addDays(t, 7)],
  ];
  for (const [re, f] of words) {
    if (re.test(s)) {
      due = f();
      s = s.replace(re, "");
    }
  }
  const wd = s.match(/\s+(mon|tue|wed|thu|fri|sat|sun)$/i);
  if (wd) {
    const target = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(wd[1].toLowerCase());
    let d = addDays(t, 1);
    while (weekday(d) !== target) d = addDays(d, 1);
    due = d;
    s = s.replace(wd[0], "");
  }
  if (!time) [s, time] = takeTime(s);
  return { title: s.trim(), due: due ?? (time ? t : null), time, priority };
}

export default function TasksPage() {
  const { store, insert, toast } = useData();
  const [list, setList] = useState("All");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const t = today();

  const lists = useMemo(() => ["All", ...Array.from(new Set(["Personal", "Work", ...store.tasks.map((x) => x.list)]))], [store.tasks]);
  const visible = store.tasks.filter((x) => list === "All" || x.list === list);
  const open = visible.filter((x) => !x.done);
  const groups: { title: string; items: Task[]; tone?: string }[] = [
    { title: "Overdue", items: open.filter((x) => x.due_on && x.due_on < t), tone: "text-pen" },
    { title: "Today", items: open.filter((x) => x.due_on === t) },
    { title: "Next 7 days", items: open.filter((x) => x.due_on && x.due_on > t && x.due_on <= addDays(t, 7)) },
    { title: "Later", items: open.filter((x) => x.due_on && x.due_on > addDays(t, 7)) },
    { title: "No date", items: open.filter((x) => !x.due_on && x.horizon !== "long") },
    { title: "Long-term goals", items: open.filter((x) => !x.due_on && x.horizon === "long") },
  ];
  const done = visible.filter((x) => x.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const openTask = store.tasks.find((x) => x.id === openId) ?? null;
  const preview = q ? parseQuick(q) : null;

  return (
    <Page>
      <PageHeader eyebrow="Tasks" title="What’s next">
        <Segmented value={list} onChange={setList} options={lists.map((l) => ({ value: l, label: l }))} />
      </PageHeader>

      <form
        className="mb-8"
        onSubmit={(e) => {
          e.preventDefault();
          const p = parseQuick(q);
          if (!p.title) return;
          const dup = duplicateTask(store, p.title);
          if (dup) {
            toast(describeTask(dup) + " Not added again.");
            return;
          }
          insert("tasks", {
            title: p.title,
            notes: null,
            list: list === "All" ? "Personal" : list,
            due_on: p.due ?? t,
            due_time: p.time,
            priority: p.priority,
            horizon: "now",
            done: false,
            done_at: null,
            sort: store.tasks.length,
          });
          setQ("");
        }}
      >
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1 focus-within:border-accent">
          <Plus size={17} className="text-muted" />
          <input
            className="flex-1 bg-transparent py-2 text-[15px] outline-none focus-visible:outline-none placeholder:text-muted"
            placeholder="Add a task. Try “Học Chapter 2 tomorrow !”"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {preview && preview.title && (
            <span className="hidden md:inline text-[12px] text-muted">
              {relDay(preview.due ?? t)}
              {preview.time && ` at ${preview.time}`}
              {preview.priority && " · flagged"}
            </span>
          )}
        </div>
      </form>

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <Section key={g.title} title={<span className={g.tone}>{g.title} · {g.items.length}</span>}>
              <div className="-mx-2 flex flex-col overflow-x-clip px-2">
                <AnimatePresence initial={false}>
                  {g.items
                    .sort((a, b) => Number(b.priority) - Number(a.priority) || a.sort - b.sort)
                    .map((task) => (
                      <TaskRow key={task.id} task={task} onOpen={() => setOpenId(task.id)} />
                    ))}
                </AnimatePresence>
              </div>
            </Section>
          ),
      )}
      {open.length === 0 && <p className="mb-8 text-[14px] text-muted">Nothing open. Enjoy it, or add the next thing above.</p>}

      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone(!showDone)} className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-ink">
            <ChevronDown size={15} className={cx("transition-transform", !showDone && "-rotate-90")} /> Done · {done.length}
          </button>
          {showDone && (
            <AnimatePresence initial={false}>
              {done.slice(0, 50).map((task) => (
                <TaskRow key={task.id} task={task} onOpen={() => setOpenId(task.id)} />
              ))}
            </AnimatePresence>
          )}
        </div>
      )}

      <TaskSheet task={openTask} onClose={() => setOpenId(null)} />
    </Page>
  );
}

function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { store } = useData();
  const ms = store.milestones.filter((m) => m.task_id === task.id).sort((a, b) => a.sort - b.sort);
  const done = ms.filter((m) => m.done).length;
  const t = today();
  const c = useCompleteTask(task);
  return (
    <motion.div
      {...TASK_ENTER}
      exit={TASK_EXIT}
      className="group -mx-2 cursor-pointer overflow-hidden rounded-md px-2 hover:bg-hover"
      onClick={onOpen}
    >
      <div className="flex items-start gap-3 py-2.5">
        <div className="pt-[1px]">
          <Tick checked={c.checked} round label="Complete" color="var(--accent)" onChange={c.toggle} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] leading-snug">
            {task.priority && <Flag size={13} className="mr-1.5 inline -mt-0.5 text-pen" fill="currentColor" />}
            <Strike on={c.checked} animate={c.completing}>{task.title}</Strike>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            {task.due_on && <span className={cx(task.due_on < t && !task.done && "text-pen")}>{relDay(task.due_on)}{task.due_time && ` · ${task.due_time}`}</span>}
            <span>{task.list}</span>
            {ms.length > 0 && (
              <span className="num">
                {done}/{ms.length} milestones
              </span>
            )}
          </div>
          {ms.length > 0 && (
            <div className="mt-1.5 max-w-[360px]">
              <MilestoneBar items={ms} color={task.done ? "var(--muted)" : "var(--accent)"} />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { store, update, remove, insert, toast } = useData();
  const [ms, setMs] = useState("");
  const items = task ? store.milestones.filter((m) => m.task_id === task.id).sort((a, b) => a.sort - b.sort) : [];
  return (
    <Sheet open={!!task} onClose={onClose} title="Task" width={520}>
      {task && (
        <div key={task.id}>
          <input
            className="field !text-[18px] !font-semibold !border-transparent !px-0 mb-2"
            defaultValue={task.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v || v === task.title) return;
              const dup = duplicateTask(store, v, task.id);
              if (dup) {
                toast(describeTask(dup) + " Name not changed.");
                e.target.value = task.title;
                return;
              }
              update("tasks", task.id, { title: v });
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due">
              <input type="date" className="field num" value={task.due_on ?? ""} onChange={(e) => update("tasks", task.id, { due_on: e.target.value || null })} />
            </Field>
            <Field label="At (reminds 40 and 20 min before)">
              <input
                type="time"
                className="field num"
                value={task.due_time ?? ""}
                onChange={(e) => update("tasks", task.id, { due_time: e.target.value || null, due_on: task.due_on ?? today() })}
              />
            </Field>
            <Field label="List">
              <input className="field" list="lists" defaultValue={task.list} onBlur={(e) => update("tasks", task.id, { list: e.target.value || "Personal" })} />
              <datalist id="lists">
                {Array.from(new Set(["Personal", "Work", ...store.tasks.map((x) => x.list)])).map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </Field>
          </div>
          <div className="mb-4 flex flex-wrap gap-4 text-[13.5px]">
            <label className="flex items-center gap-2">
              <Tick checked={task.priority} color="var(--pen)" onChange={() => update("tasks", task.id, { priority: !task.priority })} /> Flagged
            </label>
            <label className="flex items-center gap-2">
              <Tick checked={task.horizon === "long"} onChange={() => update("tasks", task.id, { horizon: task.horizon === "long" ? "now" : "long" })} /> Long-term goal
            </label>
          </div>

          <div className="label mb-2">Milestones</div>
          {items.length > 0 && (
            <div className="mb-3">
              <MilestoneBar items={items} color="var(--accent)" />
            </div>
          )}
          <ul className="mb-2">
            {items.map((m) => (
              <li key={m.id} className="group flex items-center gap-2.5 py-1.5">
                <Tick checked={m.done} size={16} color="var(--accent)" onChange={() => update("milestones", m.id, { done: !m.done })} />
                <input
                  className={cx("flex-1 bg-transparent text-[14px] outline-none", m.done && "text-muted line-through")}
                  defaultValue={m.title}
                  onBlur={(e) => e.target.value.trim() && update("milestones", m.id, { title: e.target.value.trim() })}
                />
                <button aria-label="Remove milestone" className="opacity-0 group-hover:opacity-100 text-muted hover:text-pen" onClick={() => remove("milestones", m.id, { silent: true })}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ms.trim()) return;
              insert("milestones", { task_id: task.id, title: ms.trim(), done: false, sort: items.length });
              setMs("");
            }}
          >
            <input className="field" placeholder="Add a milestone" value={ms} onChange={(e) => setMs(e.target.value)} />
            <button className="btn btn-line">Add</button>
          </form>

          <Field label="Notes">
            <textarea className="field min-h-[80px]" defaultValue={task.notes ?? ""} onBlur={(e) => update("tasks", task.id, { notes: e.target.value || null })} />
          </Field>
          <div className="flex justify-between">
            <button
              className="btn btn-ghost text-pen"
              onClick={() => {
                remove("tasks", task.id);
                onClose();
              }}
            >
              <Trash2 size={15} /> Delete
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
