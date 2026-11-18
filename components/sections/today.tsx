"use client";
import { virtualFixed } from "@/lib/fixed";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Strike, TASK_ENTER, TASK_EXIT, useCompleteTask } from "@/components/complete";
import { CheckRow, CheckSheet } from "@/components/checks";
import { useData } from "@/components/data";
import { MilestoneBar } from "@/components/milestone-bar";
import { QuickAdd } from "@/components/money";
import { useMarkLesson } from "@/components/register";
import { Dot, Page, Section, Tick } from "@/components/ui";
import { addDays, fmtDay, minutes, MONTHS, monthOf, parseDate, startOfWeek, today, WD_LONG } from "@/lib/dates";
import { cx, vnd } from "@/lib/format";
import { agendaOn, checkTasksOn, makeupsOwed, taughtIn, type Occurrence } from "@/lib/teaching";
import type { Task } from "@/lib/types";
import { sec } from "@/lib/motion";

function DueTask({ task, today: t }: { task: Task; today: string }) {
  const { store } = useData();
  const c = useCompleteTask(task);
  const ms = store.milestones.filter((m) => m.task_id === task.id).sort((a, b) => a.sort - b.sort);
  return (
    <motion.div {...TASK_ENTER} exit={TASK_EXIT} className="overflow-hidden">
      <div className="flex items-start gap-2.5 py-1.5">
      <Tick round checked={c.checked} color="var(--accent)" label="Complete" onChange={c.toggle} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-snug">
          <Strike on={c.checked} animate={c.completing}>{task.title}</Strike>
          {task.due_on && task.due_on < t && <span className="ml-2 text-[12px] text-pen">since {fmtDay(task.due_on)}</span>}
        </div>
        {ms.length > 0 && (
          <div className="mt-1 max-w-[260px]">
            <MilestoneBar items={ms} color="var(--accent)" />
          </div>
        )}
      </div>
      </div>
    </motion.div>
  );
}

function greeting(h: number) {
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function TodayPage() {
  const { store, update, isEmpty, loadSeed, online } = useData();
  const mark = useMarkLesson();
  const t = today();
  const [now, setNow] = useState<Date | null>(null);
  const [name, setName] = useState("");
  useEffect(() => {
    setNow(new Date());
    try {
      setName(localStorage.getItem("daybook.name") ?? "");
    } catch {}
    const i = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(i);
  }, []);
  const nowMin = now ? now.getHours() * 60 + now.getMinutes() : 0;

  const agenda = agendaOn(store, t);
  const tomorrow = agendaOn(store, addDays(t, 1)).filter((o) => o.kind === "lesson");
  const checks = agenda.filter((o) => o.kind === "check");
  const [openCheck, setOpenCheck] = useState<{ studentId: string; date: string } | null>(null);
  const checkTasks = checkTasksOn(store, t).filter((c) => !c.done);
  const tasks = store.tasks.filter((x) => !x.done && !x.student_id && x.due_on && x.due_on <= t).sort((a, b) => Number(b.priority) - Number(a.priority));
  const month = monthOf(t);
  const spent =
    store.transactions.filter((x) => x.kind === "expense" && x.date.startsWith(month)).reduce((n, x) => n + x.amount, 0) +
    virtualFixed(store.transactions, month).reduce((n, f) => n + f.amount, 0);
  const earned =
    store.students.reduce((n, s) => n + taughtIn(store, s.id, month).length * s.rate, 0) +
    store.transactions.filter((x) => x.kind === "income" && x.date.startsWith(month)).reduce((n, x) => n + x.amount, 0);
  const owed = store.students.filter((s) => s.active).map((s) => ({ s, n: makeupsOwed(store, s) })).filter((x) => x.n > 0);

  const sleep = store.habits.find((h) => h.kind === "sleep");
  const exercise = store.habits.find((h) => h.kind === "exercise");
  const sleptLogged = sleep && store.habit_logs.some((l) => l.habit_id === sleep.id && l.date === t);
  const ws = startOfWeek(t);
  const exDays = exercise ? new Set(store.habit_logs.filter((l) => l.habit_id === exercise.id && l.date >= ws && l.date <= t).map((l) => l.date)).size : 0;

  const d = parseDate(t);

  if (isEmpty && online) {
    return (
      <Page>
        <div className="mx-auto mt-10 max-w-md text-center rise">
          <h1 className="display text-[32px] font-semibold">Your daybook is empty</h1>
          <p className="mt-2 text-ink-2">
            Load the starter data from your Google Sheet, calendar and Any.do: five students with their rates, November’s sessions and expenses, debts, routines and tasks.
          </p>
          <button className="btn btn-primary mt-5 px-4 py-2" onClick={loadSeed}>
            Load my starter data
          </button>
        </div>
      </Page>
    );
  }

  return (
    <Page wide>
      <header className="mb-8 md:mb-10">
        <div className="label mb-1.5">
          {WD_LONG[d.getDay()]}, {d.getDate()} {MONTHS[d.getMonth()]}
        </div>
        <h1 className="display text-[34px] md:text-[46px] font-semibold leading-[1.02]">
          {now ? greeting(now.getHours()) : "Hello"}
          {name ? `, ${name}` : ""}.
        </h1>
        <p className="mt-2 max-w-[640px] text-[15px] text-ink-2">
          {summaryLine(agenda, checks.filter((c) => !c.done).length, tasks.length, nowMin)}
        </p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Timeline */}
        <div>
          <Section title="Today" action={<Link href="/calendar" className="text-[12.5px] text-muted hover:text-ink">Calendar →</Link>}>
            <ol className="relative">
              {agenda.length === 0 && <li className="text-[13.5px] text-muted">Nothing scheduled.</li>}
              {agenda.map((o, i) => {
                const s = o.start ? minutes(o.start) : 0;
                const e = o.end ? minutes(o.end) : s;
                const live = now && nowMin >= s && nowMin < (e <= s ? 1440 : e);
                const past = now && nowMin >= (e <= s ? 1440 : e);
                return (
                  <motion.li
                    key={o.key}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: past ? 0.45 : 1, x: 0 }}
                    transition={{ delay: sec(i * 0.03) }}
                    className="relative grid grid-cols-[52px_14px_1fr] items-start gap-2 py-1.5"
                  >
                    {/* Time, dot and name share one 22px line (4px down, matching the name's padding) so they sit level. The dot sits 5px left so the highlighted row (which bleeds 10px left) never touches it. */}
                    <span className={cx("num pt-1 text-[13px] leading-[22px]", live ? "font-semibold text-pen" : "text-muted")}>{o.start ?? "all day"}</span>
                    <span className="relative mt-1 flex h-[22px] -translate-x-[5px] items-center justify-center">
                      <span className={cx("h-2.5 w-2.5 rounded-full", o.kind === "check" && "ring-2 ring-offset-0")} style={{ background: o.kind === "check" ? "var(--surface)" : o.color, ["--tw-ring-color" as string]: o.color }} />
                      {live && <span className="absolute h-4 w-4 animate-ping rounded-full opacity-30" style={{ background: o.color }} />}
                    </span>
                    <div className={cx("row min-w-0 py-1", live && "bg-hover")}>
                      <div className="flex items-center gap-2">
                        <span className={cx("text-[14.5px] font-medium leading-[22px]", (o.status === "cancelled" || o.status === "missed_owe" || o.done) && "line-through text-muted")}>
                          {o.title}
                        </span>
                        {live && <span className="rounded bg-pen px-1.5 text-[10.5px] font-bold uppercase tracking-wide text-white">Now</span>}
                      </div>
                      <div className="text-[12px] text-muted">
                        <span className="num">{o.kind !== "check" && o.kind !== "task" && o.start && o.end ? `${o.start}–${o.end}` : ""}</span>
                        {o.kind === "check" && o.studentId && <HwCount studentId={o.studentId} />}
                      </div>
                      {o.kind === "lesson" && o.studentId && (o.status === "planned" || o.status === "taught") && (
                        <label className="mt-1 inline-flex items-center gap-2 text-[12.5px] text-ink-2">
                          <Tick size={15} checked={o.status === "taught"} color={o.color} onChange={() => mark(o.studentId!, t, o.status === "taught" ? null : "taught")} />
                          {o.status === "taught" ? "Taught" : "Mark as taught"}
                        </label>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
            {tomorrow.length > 0 && (
              <p className="mt-3 border-t border-line pt-2 text-[12.5px] text-muted">
                Tomorrow: {tomorrow.map((o) => `${o.title.replace("Teach ", "")} ${o.start}`).join(" · ")}
              </p>
            )}
          </Section>
        </div>

        <div>
          <Section title="Due today" action={<Link href="/tasks" className="text-[12.5px] text-muted hover:text-ink">All tasks →</Link>}>
            {tasks.length + checkTasks.length === 0 && <p className="text-[13.5px] text-muted">Nothing due. Nice.</p>}
            <div className="row-list flex flex-col overflow-x-clip">
              <AnimatePresence initial={false}>
                {tasks.slice(0, 8).map((x) => (
                  <DueTask key={x.id} task={x} today={t} />
                ))}
                {checkTasks.map((c) => (
                  <CheckRow key={c.key} c={c} compact onOpen={() => setOpenCheck({ studentId: c.student.id, date: c.date })} />
                ))}
              </AnimatePresence>
              {tasks.length > 8 && <Link href="/tasks" className="text-[12.5px] text-muted">+{tasks.length - 8} more</Link>}
            </div>
          </Section>

          {(owed.length > 0 || checks.length > 0) && (
            <Section title="Teaching">
              {owed.length > 0 && (
                <p className="text-[13.5px] text-ink-2">
                  Makeups left:{" "}
                  {owed.map(({ s, n }, i) => (
                    <span key={s.id}>
                      <Dot color={s.color} className="mx-1" />
                      {s.name} <span className="num font-semibold text-pen">{n}</span>
                      {i < owed.length - 1 ? "," : ""}
                    </span>
                  ))}
                </p>
              )}
              <Link href="/teaching" className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
                Open the register <ArrowRight size={13} />
              </Link>
            </Section>
          )}

          <Section title="Body">
            <div className="grid grid-cols-2 gap-2">
              <Link href="/habits" className="rounded-lg border border-line p-3 hover:bg-hover">
                <div className="label">Sleep</div>
                <div className="mt-1 text-[14px]">{sleptLogged ? "Logged ✓" : "Log last night"}</div>
                <div className="text-[12px] text-muted">Bed by {sleep?.target_bedtime ?? "–"}</div>
              </Link>
              <Link href="/habits" className="rounded-lg border border-line p-3 hover:bg-hover">
                <div className="label">Exercise</div>
                <div className="num mt-1 text-[14px]">
                  {exDays}/{exercise?.weekly_target ?? 4} this week
                </div>
                <div className="mt-1.5 flex gap-1">
                  {Array.from({ length: exercise?.weekly_target ?? 4 }, (_, i) => (
                    <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < exDays ? exercise?.color : "var(--hover)" }} />
                  ))}
                </div>
              </Link>
            </div>
          </Section>

          <Section title={`Money · ${MONTHS[d.getMonth()]}`} action={<Link href="/money" className="text-[12.5px] text-muted hover:text-ink">Ledger →</Link>}>
            <p className="mb-3 text-[13.5px] text-ink-2">
              In <span className="num font-semibold text-ink">{vnd(earned)}</span> · out <span className="num font-semibold text-ink">{vnd(spent)}</span> · kept{" "}
              <span className={cx("num font-semibold", earned - spent >= 0 ? "text-good" : "text-pen")}>{vnd(earned - spent)}</span>
            </p>
            <QuickAdd compact />
          </Section>
        </div>
      </div>
      <CheckSheet at={openCheck} onClose={() => setOpenCheck(null)} />
    </Page>
  );
}

function HwCount({ studentId }: { studentId: string }) {
  const { store } = useData();
  const n = store.homework.filter((h) => h.student_id === studentId && h.status === "open").length;
  return <span className={cx(n > 0 && "text-pen")}>{n ? `${n} to check` : "nothing logged"}</span>;
}

function summaryLine(agenda: Occurrence[], checks: number, tasks: number, nowMin: number): string {
  const lessons = agenda.filter((o) => o.kind === "lesson" && o.status !== "cancelled" && o.status !== "missed_owe");
  const upcoming = lessons.filter((o) => o.start && minutes(o.start) > nowMin);
  const parts: string[] = [];
  if (lessons.length === 0) parts.push("No classes today");
  else if (upcoming.length) parts.push(`${upcoming.length} ${upcoming.length === 1 ? "class" : "classes"} still ahead, next is ${upcoming[0].title.replace("Teach ", "")} at ${upcoming[0].start}`);
  else parts.push(lessons.length === 1 ? "Today’s class is over" : `All ${lessons.length} classes are over`);
  if (checks) parts.push(`${checks} homework ${checks === 1 ? "check" : "checks"} tonight`);
  parts.push(tasks ? `${tasks} ${tasks === 1 ? "task" : "tasks"} due` : "no tasks due");
  return parts.join(", ") + ".";
}
