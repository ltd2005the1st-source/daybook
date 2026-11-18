"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Flag, Plus } from "lucide-react";
import { CheckRow, CheckSheet } from "@/components/checks";
import { useData } from "@/components/data";
import { TaskSheet } from "@/components/task-sheet";
import { MilestoneBar } from "@/components/milestone-bar";
import { Strike, TASK_ENTER, TASK_EXIT, useCompleteTask } from "@/components/complete";
import { Page, PageHeader, Section, Segmented, Tick } from "@/components/ui";
import { addDays, relDay, today, weekday } from "@/lib/dates";
import { cx } from "@/lib/format";
import { describeTask, duplicateTask } from "@/lib/dupes";
import { checkTasksBetween, type CheckTask } from "@/lib/teaching";
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

  const [openCheck, setOpenCheck] = useState<{ studentId: string; date: string } | null>(null);
  const checks = checkTasksBetween(store, t, 8).filter((c) => !c.done);
  const lists = useMemo(
    () => ["All", ...Array.from(new Set(["Personal", "Work", ...store.tasks.map((x) => x.list), ...(checks.length ? ["Teaching"] : [])]))],
    [store.tasks, checks.length],
  );
  const visible = store.tasks.filter((x) => list === "All" || x.list === list);
  // Homework checks come from the timetable; saved ones are listed through it too.
  const open = visible.filter((x) => !x.done && !x.student_id);
  const shownChecks = list === "All" || list === "Teaching" ? checks : [];
  const groups: { title: string; items: Task[]; checks?: CheckTask[]; tone?: string }[] = [
    { title: "Overdue", items: open.filter((x) => x.due_on && x.due_on < t), tone: "text-pen" },
    { title: "Today", items: open.filter((x) => x.due_on === t), checks: shownChecks.filter((c) => c.date === t) },
    {
      title: "Next 7 days",
      items: open.filter((x) => x.due_on && x.due_on > t && x.due_on <= addDays(t, 7)),
      checks: shownChecks.filter((c) => c.date > t),
    },
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
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1 focus-within:border-ink-2">
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
          g.items.length + (g.checks?.length ?? 0) > 0 && (
            <Section key={g.title} title={<span className={g.tone}>{g.title} · {g.items.length + (g.checks?.length ?? 0)}</span>}>
              <div className="row-list flex flex-col overflow-x-clip">
                <AnimatePresence initial={false}>
                  {g.items
                    .sort((a, b) => Number(b.priority) - Number(a.priority) || a.sort - b.sort)
                    .map((task) => (
                      <TaskRow key={task.id} task={task} onOpen={() => setOpenId(task.id)} />
                    ))}
                  {g.checks?.map((c) => (
                    <CheckRow key={c.key} c={c} onOpen={() => setOpenCheck({ studentId: c.student.id, date: c.date })} />
                  ))}
                </AnimatePresence>
              </div>
            </Section>
          ),
      )}
      {open.length + shownChecks.length === 0 && <p className="mb-8 text-[14px] text-muted">Nothing open. Enjoy it, or add the next thing above.</p>}

      {done.length > 0 && (
        <div>
          <button onClick={() => setShowDone(!showDone)} className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-ink">
            <ChevronDown size={15} className={cx("transition-transform", !showDone && "-rotate-90")} /> Done · {done.length}
          </button>
          {showDone && (
            <AnimatePresence initial={false}>
              {done.slice(0, 50).map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onOpen={() => (task.student_id && task.due_on ? setOpenCheck({ studentId: task.student_id, date: task.due_on }) : setOpenId(task.id))}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      )}

      <TaskSheet task={openTask} onClose={() => setOpenId(null)} />
      <CheckSheet at={openCheck} onClose={() => setOpenCheck(null)} />
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
      className="row group cursor-pointer overflow-hidden hover:bg-hover"
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
