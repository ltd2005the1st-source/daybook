"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useData } from "./data";
import { ConfirmButton, Field, Sheet, Tick, Segmented, Dot } from "./ui";
import { WD_SHORT, fmtDay, minutes, today } from "@/lib/dates";
import { cx, parseAmount, vnd } from "@/lib/format";
import { classSeries, nextLesson } from "@/lib/teaching";
import type { Student } from "@/lib/types";

export const STUDENT_COLORS = ["#5B86E5", "#3F8250", "#525A80", "#9A6FB0", "#8A3FB0", "#C0703A", "#2B8A8A", "#B04A6A", "#7A7A2E"];
const BANDS = ["07:00-09:00", "09:00-11:00", "14:00-16:00", "17:30-19:30", "20:00-22:00"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function StudentSheet({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const [tab, setTab] = useState<"homework" | "schedule" | "profile">("homework");
  useEffect(() => {
    if (student) setTab("homework");
  }, [student?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet open={!!student} onClose={onClose} title={student ? <span className="flex items-center gap-2"><Dot color={student.color} size={10} />{student.name}</span> : ""} width={560}>
      {student && (
        <>
          <Segmented
            className="mb-4"
            value={tab}
            onChange={setTab}
            options={[
              { value: "homework", label: "Homework" },
              { value: "schedule", label: "Schedule" },
              { value: "profile", label: "Profile & rate" },
            ]}
          />
          {tab === "homework" && <HomeworkTab s={student} />}
          {tab === "schedule" && <ScheduleTab s={student} />}
          {tab === "profile" && <ProfileTab s={student} onDeleted={onClose} />}
        </>
      )}
    </Sheet>
  );
}

function HomeworkTab({ s }: { s: Student }) {
  const { store, insert, update, remove } = useData();
  const [title, setTitle] = useState("");
  const items = store.homework.filter((h) => h.student_id === s.id).sort((a, b) => (a.status === b.status ? b.assigned_on.localeCompare(a.assigned_on) : a.status === "open" ? -1 : 1));
  const nl = nextLesson(store, s.id, today());
  return (
    <div>
      <p className="text-[13.5px] text-ink-2 mb-3">
        {nl ? (
          <>
            Next class <b>{fmtDay(nl.date, { weekday: true })}</b> at <span className="num">{nl.start}</span>.{" "}
          </>
        ) : null}
        <>A homework check comes up before each class (22:30 the night before, unless you move it).</>
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          insert("homework", { student_id: s.id, title: title.trim(), note: null, assigned_on: today(), status: "open", checked_on: null });
          setTitle("");
        }}
        className="flex gap-2 mb-4"
      >
        <input className="field" placeholder="Assigned today, e.g. 2 problem–solution essays" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn btn-primary">
          <Plus size={15} /> Log
        </button>
      </form>
      <ul className="flex flex-col">
        {items.map((h) => (
          <li key={h.id} className="group flex items-start gap-3 border-b border-line py-2.5">
            <Tick
              checked={h.status === "checked"}
              color="var(--pen)"
              label="Checked"
              onChange={() =>
                update("homework", h.id, h.status === "open" ? { status: "checked", checked_on: today() } : { status: "open", checked_on: null })
              }
            />
            <div className="min-w-0 flex-1">
              <div className={cx("text-[14px]", h.status === "checked" && "text-muted line-through decoration-pen/60")}>{h.title}</div>
              <div className="text-[12px] text-muted">
                Assigned {fmtDay(h.assigned_on)}
                {h.checked_on && ` · checked ${fmtDay(h.checked_on)}`}
              </div>
            </div>
            <button aria-label="Delete" onClick={() => remove("homework", h.id)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-pen">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {!items.length && <li className="text-[13.5px] text-muted py-2">No homework logged yet.</li>}
      </ul>
    </div>
  );
}

function ScheduleTab({ s }: { s: Student }) {
  const { store, insert, update, remove } = useData();
  const series = classSeries(store, s.id).filter((e) => e.days.length && (!e.until || e.until >= today()));
  const [wd, setWd] = useState(6);
  const [start, setStart] = useState("20:30");
  const [end, setEnd] = useState("22:30");

  // Your own busy times: other classes and events (not focus blocks), per weekday.
  const busy = (day: number, band: string) => {
    const [a, b] = band.split("-").map(minutes);
    const overl = (x: string | null, y: string | null) => x && y && minutes(x) < b && minutes(y) > a;
    return store.events.some((e) => e.student_id !== s.id && e.days.includes(day) && e.kind !== "focus" && overl(e.start_time, e.end_time));
  };

  return (
    <div>
      <div className="label mb-2">Weekly classes</div>
      <ul className="mb-3">
        {series.map((e) => (
          <li key={e.id} className="flex items-center gap-3 border-b border-line py-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color }} />
            <span className="text-[13px] font-semibold">{WEEK.filter((d) => e.days.includes(d)).map((d) => WD_SHORT[d]).join(", ")}</span>
            <span className="num text-[13px]">
              {e.start_time}–{e.end_time}
            </span>
            <button aria-label="Remove these classes" onClick={() => remove("events", e.id)} className="ml-auto text-muted hover:text-pen">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {series.length === 0 && <li className="py-2 text-[13px] text-muted">No weekly classes yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2 mb-2"
        onSubmit={(e) => {
          e.preventDefault();
          insert("events", {
            title: `Teach ${s.name}`,
            date: today(),
            start_time: start,
            end_time: end,
            days: [wd],
            until: null,
            color: s.color,
            kind: "class",
            remind_before: [40, 20],
            notes: null,
            skip_dates: [],
            student_id: s.id,
            occurrence_notes: {},
          });
        }}
      >
        <select className="field !w-auto" value={wd} onChange={(e) => setWd(+e.target.value)}>
          {WEEK.map((d) => (
            <option key={d} value={d}>
              {WD_SHORT[d]}
            </option>
          ))}
        </select>
        <input type="time" className="field !w-auto num" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="time" className="field !w-auto num" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button className="btn btn-line">
          <Plus size={15} /> Add weekly class
        </button>
      </form>
      <p className="mb-6 text-[12px] text-muted">Classes are events on your calendar. Open one there to change its days, time, colour or notes, or to move a single class.</p>

      <div className="label mb-1">Free slots</div>
      <p className="text-[12.5px] text-muted mb-2">
        Tap to mark when {s.kind === "class" ? "the class" : s.name} can study. Green means you are free too.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[3px] text-[12px]">
          <thead>
            <tr>
              <th />
              {WEEK.map((d) => (
                <th key={d} className="font-medium text-muted">
                  {WD_SHORT[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BANDS.map((band) => (
              <tr key={band}>
                <td className="num pr-1 text-muted whitespace-nowrap">{band.replace("-", "–")}</td>
                {WEEK.map((d) => {
                  const free = s.availability?.[band]?.includes(d) ?? false;
                  const meBusy = busy(d, band);
                  return (
                    <td key={d}>
                      <button
                        onClick={() => {
                          const cur = { ...(s.availability ?? {}) };
                          const list = new Set(cur[band] ?? []);
                          if (list.has(d)) list.delete(d);
                          else list.add(d);
                          cur[band] = [...list];
                          update("students", s.id, { availability: cur });
                        }}
                        className={cx(
                          "h-8 w-full min-w-9 rounded-md border text-[11px] transition-colors",
                          free && !meBusy && "bg-good-soft border-good/40 text-good font-semibold",
                          free && meBusy && "bg-hover border-line text-muted line-through",
                          !free && "border-line hover:bg-hover",
                        )}
                        title={meBusy ? "You already have something here" : undefined}
                      >
                        {free ? (meBusy ? "busy" : "free") : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProfileTab({ s, onDeleted }: { s: Student; onDeleted: () => void }) {
  const { store, update, remove } = useData();
  const [rate, setRate] = useState(String(s.rate));
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Name" className="col-span-2">
          <input className="field" value={s.name} onChange={(e) => update("students", s.id, { name: e.target.value })} />
        </Field>
        <Field label="Rate per session (₫)">
          <input
            className="field num"
            inputMode="numeric"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onBlur={() => {
              const v = parseAmount(rate);
              if (v !== null) update("students", s.id, { rate: v });
              setRate(String(v ?? s.rate));
            }}
          />
          <span className="text-[12px] text-muted">{vnd(s.rate)} per session</span>
        </Field>
        <Field label="Makeups left (cần bù)">
          <MakeupStepper s={s} />
          <span className="text-[12px] text-muted">You keep this count. The app never changes it.</span>
        </Field>
      </div>
      {s.kind === "class" && (
        <Field label="Class members (comma separated)">
          <input
            className="field"
            defaultValue={s.members.join(", ")}
            onBlur={(e) => update("students", s.id, { members: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
          />
        </Field>
      )}
      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {STUDENT_COLORS.map((c) => (
            <button
              key={c}
              aria-label={c}
              onClick={() => {
                // Classes that still use the old colour follow the new one.
                store.events.filter((e) => e.student_id === s.id && e.color === s.color).forEach((e) => update("events", e.id, { color: c }));
                update("students", s.id, { color: c });
              }}
              className={cx("h-7 w-7 rounded-full ring-offset-2 ring-offset-surface", s.color === c && "ring-2 ring-ink")}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>

      <div className="label mt-5 mb-2">What to check every time</div>
      <textarea
        key={s.id}
        className="field min-h-[80px] text-[14px]"
        placeholder="e.g. Workbook pages, vocabulary notebook"
        defaultValue={s.check_note ?? ""}
        onBlur={(e) => {
          const v = e.target.value.trim() || null;
          if (v !== (s.check_note ?? null)) update("students", s.id, { check_note: v });
        }}
      />
      <p className="mb-3 mt-1 text-[12px] text-muted">
        Shown on every homework check for {s.name} and in its reminder. To change one night only, tap that check on the Calendar or under Checks on Teaching.
      </p>

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        <label className="flex items-center gap-2 text-[13.5px]">
          <Tick checked={s.active} onChange={() => update("students", s.id, { active: !s.active })} /> Active (shows on calendar and reminders)
        </label>
        <ConfirmButton
          className="btn btn-ghost text-pen"
          confirmLabel={`Delete ${s.name} for good?`}
          onConfirm={() => {
            remove("students", s.id);
            onDeleted();
          }}
        >
          <Trash2 size={15} /> Delete
        </ConfirmButton>
      </div>
    </div>
  );
}

export function MakeupStepper({ s, compact }: { s: Student; compact?: boolean }) {
  const { update } = useData();
  const n = Math.max(0, s.makeup_baseline ?? 0);
  const set = (v: number) => update("students", s.id, { makeup_baseline: Math.max(0, v) });
  return (
    <div className={cx("inline-flex items-center rounded-md border border-line", compact && "text-[12px]")} onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label="One fewer makeup" className={cx("text-ink-2 hover:bg-hover", compact ? "px-1.5 py-0" : "px-2.5 py-1")} onClick={() => set(n - 1)}>
        −
      </button>
      <span className={cx("num text-center font-semibold", compact ? "w-5" : "w-8", n > 0 && "text-pen")}>{n}</span>
      <button type="button" aria-label="One more makeup" className={cx("text-ink-2 hover:bg-hover", compact ? "px-1.5 py-0" : "px-2.5 py-1")} onClick={() => set(n + 1)}>
        +
      </button>
    </div>
  );
}
