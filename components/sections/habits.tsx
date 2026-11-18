"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { Plus, Trash2 } from "lucide-react";
import { useData } from "@/components/data";
import { Field, Page, PageHeader, Section, Sheet, Tick } from "@/components/ui";
import { addDays, fmtDay, fromMinutes, minutes, parseDate, startOfWeek, today, WD_SHORT } from "@/lib/dates";
import { cx } from "@/lib/format";
import type { Habit, HabitLog } from "@/lib/types";
import { sec } from "@/lib/motion";

/** Sleep times live on a night axis from 20:00 to 12:00 the next day. */
const AXIS_START = 20 * 60;
const AXIS_LEN = 16 * 60;
const toAxis = (t: string) => {
  let m = minutes(t) - AXIS_START;
  if (m < 0) m += 1440;
  return Math.max(0, Math.min(AXIS_LEN, m));
};
const duration = (a: string, b: string) => {
  let d = minutes(b) - minutes(a);
  if (d <= 0) d += 1440;
  return d;
};
const hm = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;

export default function HabitsPage() {
  const { store, insert } = useData();
  const [adding, setAdding] = useState(false);
  const habits = [...store.habits].sort((a, b) => a.sort - b.sort);
  return (
    <Page>
      <PageHeader eyebrow="Habits" title="Body clock">
        <button className="btn btn-line" onClick={() => setAdding(true)}>
          <Plus size={15} /> Habit
        </button>
      </PageHeader>
      {habits.map((h) =>
        h.kind === "sleep" ? <Sleep key={h.id} h={h} /> : h.kind === "exercise" ? <Exercise key={h.id} h={h} /> : <Custom key={h.id} h={h} />,
      )}
      <Sheet open={adding} onClose={() => setAdding(false)} title="New habit">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const name = String(f.get("name") || "").trim();
            if (!name) return;
            insert("habits", {
              name,
              kind: "custom",
              color: "#C0703A",
              target_bedtime: null,
              target_wake: null,
              weekly_target: Number(f.get("target")) || 7,
              sort: store.habits.length,
            });
            setAdding(false);
          }}
        >
          <Field label="Name">
            <input name="name" className="field" placeholder="French practice" autoFocus />
          </Field>
          <Field label="Days per week">
            <input name="target" type="number" min={1} max={7} defaultValue={5} className="field num" />
          </Field>
          <button className="btn btn-primary w-full justify-center">Add habit</button>
        </form>
      </Sheet>
    </Page>
  );
}

function Sleep({ h }: { h: Habit }) {
  const { store, insert, update, remove } = useData();
  const t = today();
  const logs = store.habit_logs.filter((l) => l.habit_id === h.id);
  const lastNight = logs.find((l) => l.date === t);
  const [slept, setSlept] = useState(h.target_bedtime ?? "23:45");
  const [woke, setWoke] = useState(h.target_wake ?? "07:00");
  const nights = Array.from({ length: 14 }, (_, i) => addDays(t, i - 13));
  const recent = nights.map((d) => logs.find((l) => l.date === d)).filter((l): l is HabitLog => !!l?.slept_at && !!l?.woke_at);

  const tb = h.target_bedtime ?? "23:45";
  const tw = h.target_wake ?? "07:00";
  const avgDur = recent.length ? recent.reduce((n, l) => n + duration(l.slept_at!, l.woke_at!), 0) / recent.length : 0;
  const bedOffsets = recent.map((l) => toAxis(l.slept_at!) - toAxis(tb));
  const onTarget = bedOffsets.filter((o) => Math.abs(o) <= 30).length;
  const spread = bedOffsets.length > 1 ? Math.sqrt(bedOffsets.reduce((n, o) => n + (o - bedOffsets.reduce((a, b) => a + b, 0) / bedOffsets.length) ** 2, 0) / bedOffsets.length) : 0;

  const W = 100 / 14;
  const ticks = ["22:00", "00:00", "02:00", "04:00", "06:00", "08:00", "10:00"];

  return (
    <Section title={<span className="flex items-center gap-2">Sleep <span className="font-normal text-muted">· aim for {tb} to {tw}</span></span>}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        {/* Night chart: one column per night, the bar is the time asleep */}
        <div className="card p-3">
          <div className="relative h-[230px]">
            {/* target band */}
            <div
              className="absolute inset-x-8 rounded bg-accent-soft"
              style={{ top: `${(toAxis(tb) / AXIS_LEN) * 100}%`, height: `${((toAxis(tw) - toAxis(tb)) / AXIS_LEN) * 100}%` }}
            />
            {ticks.map((tk) => (
              <div key={tk} className="absolute left-0 right-0 flex items-center gap-2" style={{ top: `${(toAxis(tk) / AXIS_LEN) * 100}%` }}>
                <span className="num w-8 -translate-y-1/2 text-[10px] text-muted">{tk}</span>
                <span className="h-px flex-1 -translate-y-1/2 bg-line" />
              </div>
            ))}
            <div className="absolute inset-y-0 left-8 right-0">
              {nights.map((d, i) => {
                const l = logs.find((x) => x.date === d);
                const has = l?.slept_at && l?.woke_at;
                const top = has ? toAxis(l!.slept_at!) : 0;
                const bottom = has ? toAxis(l!.woke_at!) : 0;
                const good = has && Math.abs(top - toAxis(tb)) <= 30;
                return (
                  <div key={d} className="absolute inset-y-0" style={{ left: `${i * W}%`, width: `${W}%` }}>
                    {has && (
                      <motion.div
                        title={`${fmtDay(d)}: ${l!.slept_at} → ${l!.woke_at}`}
                        className="absolute left-1/2 w-[58%] -translate-x-1/2 rounded-full"
                        style={{ background: good ? h.color : "var(--pen)", top: `${(top / AXIS_LEN) * 100}%` }}
                        initial={{ height: 0 }}
                        animate={{ height: `${(Math.max(8, bottom - top) / AXIS_LEN) * 100}%` }}
                        transition={{ duration: sec(0.6), ease: [0.65, 0, 0.35, 1], delay: sec(i * 0.02) }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="ml-8 grid" style={{ gridTemplateColumns: "repeat(14, 1fr)" }}>
            {nights.map((d) => (
              <span key={d} className={cx("text-center text-[10px]", d === t ? "font-semibold text-ink" : "text-muted")}>
                {WD_SHORT[parseDate(d).getDay()][0]}
                <br />
                {parseDate(d).getDate()}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Avg sleep" value={recent.length ? hm(avgDur) : "–"} />
            <Stat label="On time" value={`${onTarget}/${recent.length || 0}`} />
            <Stat label="Drift" value={recent.length > 1 ? `±${Math.round(spread)}m` : "–"} />
          </div>
          <div className="card p-3">
            <div className="label mb-2">{lastNight ? "Last night (logged)" : "Log last night"}</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fell asleep" className="!mb-2">
                <input type="time" className="field num" value={lastNight?.slept_at ?? slept} onChange={(e) => (lastNight ? update("habit_logs", lastNight.id, { slept_at: e.target.value }) : setSlept(e.target.value))} />
              </Field>
              <Field label="Woke up" className="!mb-2">
                <input type="time" className="field num" value={lastNight?.woke_at ?? woke} onChange={(e) => (lastNight ? update("habit_logs", lastNight.id, { woke_at: e.target.value }) : setWoke(e.target.value))} />
              </Field>
            </div>
            {lastNight ? (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-ink-2">{hm(duration(lastNight.slept_at!, lastNight.woke_at!))} asleep</span>
                <button className="text-muted hover:text-pen" onClick={() => remove("habit_logs", lastNight.id)}>
                  Remove
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary w-full justify-center"
                onClick={() => insert("habit_logs", { habit_id: h.id, date: t, slept_at: slept, woke_at: woke, minutes: duration(slept, woke), activity: null, note: null })}
              >
                Save · {hm(duration(slept, woke))}
              </button>
            )}
          </div>
          <details className="mt-3 text-[13px]">
            <summary className="cursor-pointer text-muted">Change target</summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Bedtime">
                <input type="time" className="field num" value={tb} onChange={(e) => update("habits", h.id, { target_bedtime: e.target.value })} />
              </Field>
              <Field label="Wake">
                <input type="time" className="field num" value={tw} onChange={(e) => update("habits", h.id, { target_wake: e.target.value })} />
              </Field>
            </div>
            <p className="text-[12px] text-muted">
              That is {hm(duration(tb, tw))} in bed. You get a wind-down reminder 30 minutes before {tb} ({fromMinutes(minutes(tb) - 30)}).
            </p>
          </details>
        </div>
      </div>
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-hover px-2 py-2">
      <div className="num text-[16px] font-semibold">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function WeekGrid({ h, logs, weeks = 12 }: { h: Habit; logs: HabitLog[]; weeks?: number }) {
  const t = today();
  const start = addDays(startOfWeek(t), -7 * (weeks - 1));
  return (
    <div className="flex gap-[3px] overflow-x-auto">
      {Array.from({ length: weeks }, (_, w) => (
        <div key={w} className="flex flex-col gap-[3px]">
          {Array.from({ length: 7 }, (_, d) => {
            const day = addDays(start, w * 7 + d);
            const hit = logs.filter((l) => l.date === day);
            const mins = hit.reduce((n, l) => n + (l.minutes ?? 30), 0);
            return (
              <span
                key={d}
                title={`${fmtDay(day, { weekday: true })}${hit.length ? ` · ${hit.map((l) => l.activity ?? "done").join(", ")}` : ""}`}
                className={cx("h-[14px] w-[14px] rounded-[3px]", day > t && "opacity-30")}
                style={{ background: hit.length ? `color-mix(in oklab, ${h.color} ${Math.min(100, 45 + mins)}%, var(--surface))` : "var(--hover)" }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function weekStats(logs: HabitLog[], target: number) {
  const t = today();
  const ws = startOfWeek(t);
  const thisWeek = new Set(logs.filter((l) => l.date >= ws && l.date <= t).map((l) => l.date)).size;
  let streak = 0;
  for (let w = 1; w < 52; w++) {
    const s = addDays(ws, -7 * w);
    const e = addDays(s, 6);
    const n = new Set(logs.filter((l) => l.date >= s && l.date <= e).map((l) => l.date)).size;
    if (n >= target) streak++;
    else break;
  }
  if (thisWeek >= target) streak++;
  return { thisWeek, streak };
}

function Exercise({ h }: { h: Habit }) {
  const { store, insert, remove, update } = useData();
  const logs = store.habit_logs.filter((l) => l.habit_id === h.id).sort((a, b) => b.date.localeCompare(a.date));
  const target = h.weekly_target ?? 4;
  const { thisWeek, streak } = weekStats(logs, target);
  const [activity, setActivity] = useState("Run");
  const [mins, setMins] = useState("30");
  const [date, setDate] = useState(today());
  return (
    <Section title={<span>Exercise <span className="font-normal text-muted">· {target} days a week</span></span>}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <div className="mb-3 flex items-end gap-3">
            <div className="display text-[44px] font-semibold leading-none">
              {thisWeek}
              <span className="text-[22px] text-muted">/{target}</span>
            </div>
            <div className="pb-1 text-[13px] text-ink-2">
              this week
              <br />
              {streak > 0 ? `${streak}-week streak` : "Hit the target to start a streak"}
            </div>
          </div>
          <div className="mb-4 flex gap-1.5">
            {Array.from({ length: target }, (_, i) => (
              <motion.span
                key={i}
                className="h-2 flex-1 rounded-full"
                initial={false}
                animate={{ background: i < thisWeek ? h.color : "var(--hover)" }}
              />
            ))}
          </div>
          <WeekGrid h={h} logs={logs} />
          <ul className="mt-4">
            {logs.slice(0, 6).map((l) => (
              <li key={l.id} className="group flex items-center gap-3 border-b border-line py-1.5 text-[13.5px]">
                <span className="w-24 text-muted">{fmtDay(l.date, { weekday: true })}</span>
                <span className="flex-1">{l.activity}</span>
                <span className="num text-ink-2">{l.minutes}m</span>
                <button aria-label="Delete" className="opacity-0 group-hover:opacity-100 text-muted hover:text-pen" onClick={() => remove("habit_logs", l.id)}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <form
          className="card h-fit p-3"
          onSubmit={(e) => {
            e.preventDefault();
            insert("habit_logs", { habit_id: h.id, date, slept_at: null, woke_at: null, minutes: +mins || 30, activity: activity || "Workout", note: null });
          }}
        >
          <div className="label mb-2">Log a workout</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {["Run", "Gym", "Walk", "Cycling", "Badminton", "Stretch"].map((a) => (
              <button
                type="button"
                key={a}
                onClick={() => setActivity(a)}
                className={cx("rounded-full border px-2.5 py-0.5 text-[12.5px]", activity === a ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:bg-hover")}
              >
                {a}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Minutes" className="!mb-2">
              <input className="field num" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} />
            </Field>
            <Field label="Day" className="!mb-2">
              <input type="date" className="field num" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <button className="btn btn-primary w-full justify-center">Log {activity.toLowerCase()}</button>
          <label className="mt-3 flex items-center justify-between text-[12.5px] text-muted">
            Weekly target
            <input type="number" min={1} max={7} className="field num !w-16 !py-0.5" value={target} onChange={(e) => update("habits", h.id, { weekly_target: +e.target.value })} />
          </label>
        </form>
      </div>
    </Section>
  );
}

function Custom({ h }: { h: Habit }) {
  const { store, insert, remove } = useData();
  const t = today();
  const logs = store.habit_logs.filter((l) => l.habit_id === h.id);
  const todayLog = logs.find((l) => l.date === t);
  const { thisWeek, streak } = weekStats(logs, h.weekly_target ?? 7);
  return (
    <Section
      title={h.name}
      action={
        <button className="text-[12px] text-muted hover:text-pen" onClick={() => remove("habits", h.id)}>
          Remove habit
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2.5 text-[14px]">
          <Tick
            checked={!!todayLog}
            color={h.color}
            size={22}
            onChange={() =>
              todayLog
                ? remove("habit_logs", todayLog.id, { silent: true })
                : insert("habit_logs", { habit_id: h.id, date: t, slept_at: null, woke_at: null, minutes: null, activity: null, note: null })
            }
          />
          Done today
        </label>
        <span className="text-[13px] text-ink-2">
          {thisWeek}/{h.weekly_target ?? 7} this week{streak > 0 && ` · ${streak}-week streak`}
        </span>
        <WeekGrid h={h} logs={logs} weeks={8} />
      </div>
    </Section>
  );
}
