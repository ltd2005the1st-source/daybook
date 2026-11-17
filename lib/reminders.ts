import { fromMinutes, minutes } from "./dates";
import { checksOn, eventsOn, lessonsOn } from "./teaching";
import type { Store } from "./types";

export type Reminder = { key: string; at: number; title: string; body: string; url: string };

/**
 * Everything that should notify on `date`, as minutes after midnight (Vietnam time).
 * The cron sends any reminder whose time has passed within the last window
 * and that has not been sent before (deduplicated by key).
 */
export function remindersFor(store: Store, date: string): Reminder[] {
  const out: Reminder[] = [];

  // Homework checks (night before class, or fixed days)
  for (const c of checksOn(store, date)) {
    const st = store.students.find((s) => s.id === c.studentId);
    if (!st || !c.start) continue;
    const open = store.homework.filter((h) => h.student_id === st.id && h.status === "open");
    out.push({
      key: `check:${st.id}:${date}`,
      at: minutes(c.start) - (st.remind_before ?? 30),
      title: `Check ${st.name}’s homework at ${c.start}`,
      body: open.length ? open.map((h) => `• ${h.title}`).join("\n") : "No homework logged yet. Log what you assigned.",
      url: "/teaching",
    });
  }

  // Calendar events with reminders
  for (const e of eventsOn(store, date)) {
    if (!e.start || !e.event) continue;
    for (const r of e.event.remind_before ?? []) {
      out.push({
        key: `event:${e.event.id}:${date}:${r}`,
        at: minutes(e.start) - r,
        title: e.title,
        body: r === 0 ? `Starting now (${e.start}–${e.end ?? ""})` : `In ${r} minutes, ${e.start}–${e.end ?? ""}`,
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

  // Morning brief
  const classes = lessonsOn(store, date).filter((o) => o.status === "planned");
  const due = store.tasks.filter((t) => !t.done && t.due_on && t.due_on <= date);
  if (classes.length || due.length) {
    out.push({
      key: `brief:${date}`,
      at: 7 * 60 + 30,
      title: "Today",
      body: [
        classes.length ? `Classes: ${classes.map((c) => `${c.title.replace("Teach ", "")} ${c.start}`).join(", ")}` : "No classes",
        due.length ? `${due.length} task${due.length === 1 ? "" : "s"} due` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      url: "/",
    });
  }

  return out.map((r) => ({ ...r, at: ((r.at % 1440) + 1440) % 1440 }));
}

export const fmtAt = (m: number) => fromMinutes(m);
