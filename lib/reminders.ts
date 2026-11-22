import { addDays, fromMinutes, minutes } from "./dates";
import { checkTasksOn, eventsOn, lessonsOn, markFor, noteFor } from "./teaching";
import { DEFAULT_REMIND, type Store } from "./types";

export type Reminder = { key: string; at: number; title: string; body: string; url: string };

/**
 * Everything that should notify on `date`, as minutes after midnight (Vietnam time).
 * The cron sends any reminder whose time has passed within the last window
 * and that has not been sent before (deduplicated by key).
 */
export function remindersFor(store: Store, date: string): Reminder[] {
  const out: Reminder[] = [];

  // Homework checks: one reminder at each check time, listing everyone due then
  const checks = checkTasksOn(store, date).filter((c) => !c.done);
  for (const time of [...new Set(checks.map((c) => c.time))]) {
    const group = checks.filter((c) => c.time === time);
    const one = group.length === 1;
    out.push({
      key: `check:${date}:${time}:${group.map((c) => c.student.id).sort().join(",")}`,
      at: minutes(time),
      title: one ? `Check ${group[0].student.name}’s homework` : `Check homework: ${group.map((c) => c.student.name).join(", ")}`,
      body: group
        .map((c) => {
          const lines = [c.contents?.trim(), ...c.homework.map((h) => `• ${h.title}`)].filter(Boolean);
          const text = lines.length ? lines.join("\n") : "Nothing logged yet.";
          return one ? text : `${c.student.name}: ${text.replace(/\n/g, "; ")}`;
        })
        .join("\n"),
      url: "/calendar",
    });
  }

  // Tasks with a time
  for (const t of store.tasks) {
    if (t.done || t.student_id || t.due_on !== date || !t.due_time) continue;
    for (const r of DEFAULT_REMIND) {
      out.push({
        key: `task:${t.id}:${date}:${t.due_time}:${r}`,
        at: minutes(t.due_time) - r,
        title: t.title,
        body: `${t.due_time}\n${r ? `Due in ${r} minutes` : "Due now"}`,
        url: "/tasks",
      });
    }
  }

  // Calendar events with reminders
  for (const e of eventsOn(store, date)) {
    if (!e.start || !e.event) continue;
    // A cancelled or missed class doesn't remind you.
    if (e.studentId && markFor(store, e.studentId, date) !== "planned") continue;
    const note = noteFor(e.event, date);
    for (const r of e.event.remind_before?.length ? e.event.remind_before : DEFAULT_REMIND) {
      // Like a calendar alert: the time range first, then when it starts.
      const range = e.end ? `${e.start} – ${e.end === "00:00" ? "24:00" : e.end}` : e.start;
      const when = `${range}\n${r === 0 ? "Starting now" : `Starts in ${r} minutes`}`;
      out.push({
        key: `event:${e.event.id}:${date}:${e.start}:${r}`,
        at: minutes(e.start) - r,
        title: e.title,
        body: note ? `${when}\n${note}` : when,
        url: "/calendar",
      });
    }
  }

  // Wind-down before the target bedtime
  const sleep = store.habits.find((h) => h.kind === "sleep" && h.target_bedtime);
  if (sleep?.target_bedtime) {
    out.push({
      key: `bed:${date}`,
      at: minutes(sleep.target_bedtime) - 30,
      title: "Wind down",
      body: `Lights out at ${sleep.target_bedtime} keeps you on schedule for ${sleep.target_wake ?? "the morning"}.`,
      url: "/habits",
    });
  }

  // Morning brief at 8:15: classes today, unfinished tasks and homework checks. Always sent, even on an empty day.
  const classes = lessonsOn(store, date).filter((o) => o.status === "planned" || o.status === "taught");
  const open = store.tasks.filter((t) => !t.done && !t.student_id);
  const overdue = open.filter((t) => t.due_on && t.due_on < date);
  const today = open.filter((t) => t.due_on === date);
  const undated = open.filter((t) => !t.due_on);
  const tonight = checkTasksOn(store, date).filter((c) => !c.done);
  const list = (ts: { title: string }[]) => ts.slice(0, 4).map((t) => `• ${t.title}`).join("\n") + (ts.length > 4 ? `\n• +${ts.length - 4} more` : "");
  const lines: string[] = [];
  lines.push(
    classes.length
      ? `Classes (${classes.length}): ${[...classes].sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "")).map((c) => `${c.title.replace("Teach ", "")}${c.start ? ` ${c.start}` : ""}`).join(", ")}`
      : "No classes today",
  );
  if (today.length) lines.push(`Due today (${today.length}):\n${list(today)}`);
  if (overdue.length) lines.push(`Overdue (${overdue.length}):\n${list(overdue)}`);
  if (undated.length) lines.push(`${undated.length} more unfinished task${undated.length === 1 ? "" : "s"} without a date`);
  if (tonight.length) lines.push(`Homework to check tonight: ${tonight.map((c) => c.student.name).join(", ")}`);
  out.push({ key: `brief:${date}`, at: 8 * 60 + 15, title: "Good morning · today", body: lines.join("\n"), url: "/" });

  return out.map((r) => ({ ...r, at: ((r.at % 1440) + 1440) % 1440 }));
}

export const fmtAt = (m: number) => fromMinutes(m);

/**
 * Reminders from `fromDate` (Vietnam date) over `days` days as absolute times, for the Android app,
 * which schedules them on the phone itself. Only ones still ahead of `now` are returned.
 */
export function upcomingReminders(store: Store, fromDate: string, days = 2, now = Date.now()) {
  const out: { key: string; when: number; title: string; body: string; url: string }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(fromDate, i);
    const midnight = Date.parse(`${date}T00:00:00+07:00`);
    for (const r of remindersFor(store, date)) {
      const when = midnight + r.at * 60_000;
      if (when > now) out.push({ key: r.key, when, title: r.title, body: r.body, url: r.url });
    }
  }
  return out.sort((a, b) => a.when - b.when);
}
