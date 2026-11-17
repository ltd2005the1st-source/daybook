import { weekday } from "./dates";
import { uid } from "./format";
import type { CalEvent, Store } from "./types";

/**
 * Older daybooks kept weekly class times in `slots`, and a moved class as extra rows in `lessons`.
 * Classes are now ordinary repeating events linked to a student. This turns the old shape into the
 * new one (the Supabase SQL in supabase/schema.sql does the same for synced data).
 */
export function migrateClasses(store: Store): Store {
  if (!store.slots?.length) return store;
  const now = new Date().toISOString();
  const events: CalEvent[] = [...store.events];
  let lessons = [...store.lessons];

  for (const st of store.students) {
    if (events.some((e) => e.student_id === st.id)) continue;
    const mine = store.slots.filter((s) => s.student_id === st.id);
    const firstLesson = lessons.filter((l) => l.student_id === st.id).map((l) => l.date).sort()[0];
    const from = firstLesson && firstLesson < "2026-11-01" ? firstLesson : "2026-11-01";
    const groups = new Map<string, typeof mine>();
    for (const sl of mine) {
      const k = `${sl.start_time}|${sl.end_time}|${sl.tentative}`;
      groups.set(k, [...(groups.get(k) ?? []), sl]);
    }
    for (const g of groups.values()) {
      events.push({
        id: uid(),
        created_at: now,
        title: `Teach ${st.name}${g[0].tentative ? " (pending)" : ""}`,
        date: from,
        start_time: g[0].start_time,
        end_time: g[0].end_time,
        days: [...new Set(g.map((x) => x.weekday))].sort(),
        until: null,
        color: st.color,
        kind: "class",
        remind_before: [40, 20],
        notes: null,
        skip_dates: [],
        student_id: st.id,
        occurrence_notes: {},
      });
    }
  }

  const seriesOn = (sid: string, date: string) =>
    events.find((e) => e.student_id === sid && e.days.length && date >= e.date && e.days.includes(weekday(date)));

  const keep = [];
  for (const l of lessons) {
    const moved = l.status === "cancelled" && l.note?.startsWith("Moved to");
    const timed = !!(l.start_time || l.end_time);
    if (!moved && !timed && l.status !== "planned") {
      keep.push(l);
      continue;
    }
    const series = seriesOn(l.student_id, l.date);
    if (series && !series.skip_dates.includes(l.date)) series.skip_dates = [...series.skip_dates, l.date];
    if (!moved && (timed || l.status === "planned") && l.start_time) {
      const st = store.students.find((s) => s.id === l.student_id);
      events.push({
        id: uid(),
        created_at: now,
        title: series?.title ?? `Teach ${st?.name ?? ""}`,
        date: l.date,
        start_time: l.start_time,
        end_time: l.end_time,
        days: [],
        until: null,
        color: series?.color ?? st?.color ?? "#4A51AC",
        kind: "class",
        remind_before: [40, 20],
        notes: null,
        skip_dates: [],
        student_id: l.student_id,
        occurrence_notes: {},
      });
    }
    if (!moved && l.status !== "planned") keep.push({ ...l, start_time: null, end_time: null });
  }
  lessons = keep;
  return { ...store, events, lessons, slots: [] };
}
