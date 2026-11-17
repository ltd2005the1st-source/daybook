"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useData } from "./data";
import { useMarkLesson } from "./register";
import { Dot, Field, Sheet, Tick } from "./ui";
import { fmtDay, fromMinutes, minutes, WD_SHORT, weekday } from "@/lib/dates";
import { cx } from "@/lib/format";
import type { Occurrence } from "@/lib/teaching";
import type { CalEvent } from "@/lib/types";

const COLORS = ["#4A51AC", "#A2645F", "#6B6B6B", "#3F8250", "#C0703A", "#8E4A63", "#2B8A8A", "#5B86E5"];
const KINDS: CalEvent["kind"][] = ["focus", "routine", "personal", "work", "other"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function EventSheet({
  open,
  eventId,
  occurrenceDate,
  defaultStart,
  onClose,
}: {
  open: boolean;
  eventId: string | null;
  occurrenceDate: string;
  defaultStart?: string;
  onClose: () => void;
}) {
  const { store, insert, update, remove } = useData();
  const existing = eventId ? store.events.find((e) => e.id === eventId) ?? null : null;
  const blank = (): Omit<CalEvent, "id"> => ({
    title: "",
    date: occurrenceDate,
    start_time: defaultStart ?? "09:00",
    end_time: fromMinutes(minutes(defaultStart ?? "09:00") + 60),
    days: [],
    until: null,
    color: COLORS[0],
    kind: "personal",
    remind_before: [10],
    notes: null,
    skip_dates: [],
  });
  const [draft, setDraft] = useState<Omit<CalEvent, "id">>(blank);
  useEffect(() => {
    if (open) setDraft(existing ? { ...existing } : blank());
  }, [open, eventId, occurrenceDate, defaultStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<CalEvent>) => setDraft((d) => ({ ...d, ...p }));
  const allDay = draft.start_time === null;
  const repeats = draft.days.length > 0;

  function save() {
    if (!draft.title.trim()) return;
    const row = { ...draft, title: draft.title.trim() };
    if (existing) update("events", existing.id, row);
    else insert("events", row);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={existing ? "Edit event" : "New event"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          autoFocus={!existing}
          className="field !text-[18px] !font-semibold !border-transparent !px-0 mb-2"
          placeholder="Event name"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
        />
        <div className="grid grid-cols-3 gap-2">
          <Field label="Date">
            <input type="date" className="field num" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Starts">
            <input type="time" className="field num" disabled={allDay} value={draft.start_time ?? ""} onChange={(e) => set({ start_time: e.target.value })} />
          </Field>
          <Field label="Ends">
            <input type="time" className="field num" disabled={allDay} value={draft.end_time ?? ""} onChange={(e) => set({ end_time: e.target.value })} />
          </Field>
        </div>
        <label className="mb-3 flex items-center gap-2 text-[13.5px]">
          <Tick checked={allDay} onChange={() => set(allDay ? { start_time: "09:00", end_time: "10:00" } : { start_time: null, end_time: null })} /> All day
        </label>

        <Field label="Repeats on">
          <div className="flex flex-wrap gap-1.5">
            {WEEK.map((d) => {
              const on = draft.days.includes(d);
              return (
                <button
                  type="button"
                  key={d}
                  onClick={() => set({ days: on ? draft.days.filter((x) => x !== d) : [...draft.days, d] })}
                  className={cx("rounded-md border px-2.5 py-1 text-[13px]", on ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:bg-hover")}
                >
                  {WD_SHORT[d]}
                </button>
              );
            })}
            <button type="button" className="text-[12.5px] text-muted underline underline-offset-2 ml-1" onClick={() => set({ days: repeats ? [] : [0, 1, 2, 3, 4, 5, 6] })}>
              {repeats ? "Doesn’t repeat" : "Every day"}
            </button>
          </div>
        </Field>
        {repeats && (
          <Field label="Until (optional)">
            <input type="date" className="field num" value={draft.until ?? ""} onChange={(e) => set({ until: e.target.value || null })} />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select className="field" value={draft.kind} onChange={(e) => set({ kind: e.target.value as CalEvent["kind"] })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Remind me (min before)">
            <input
              className="field num"
              placeholder="10, 40"
              value={draft.remind_before.join(", ")}
              onChange={(e) =>
                set({
                  remind_before: e.target.value
                    .split(",")
                    .map((x) => parseInt(x.trim(), 10))
                    .filter((n) => !Number.isNaN(n) && n >= 0),
                })
              }
            />
          </Field>
        </div>
        <Field label="Color">
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={c}
                onClick={() => set({ color: c })}
                className={cx("h-7 w-7 rounded-full ring-offset-2 ring-offset-surface", draft.color === c && "ring-2 ring-ink")}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <Field label="Notes">
          <textarea className="field min-h-[70px]" value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value || null })} />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {existing ? (
            <div className="flex gap-1">
              {repeats && (
                <button
                  type="button"
                  className="btn btn-ghost text-pen"
                  onClick={() => {
                    update("events", existing.id, { skip_dates: [...(existing.skip_dates ?? []), occurrenceDate] });
                    onClose();
                  }}
                >
                  Skip {fmtDay(occurrenceDate)}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost text-pen"
                onClick={() => {
                  remove("events", existing.id);
                  onClose();
                }}
              >
                <Trash2 size={15} /> {repeats ? "Delete series" : "Delete"}
              </button>
            </div>
          ) : (
            <span />
          )}
          <button className="btn btn-primary">{existing ? "Save" : "Add to calendar"}</button>
        </div>
      </form>
    </Sheet>
  );
}

export function LessonSheet({ occ, onClose }: { occ: Occurrence | null; onClose: () => void }) {
  const { store, update } = useData();
  const mark = useMarkLesson();
  const s = occ?.studentId ? store.students.find((x) => x.id === occ.studentId) : undefined;
  const hw = s ? store.homework.filter((h) => h.student_id === s.id && h.status === "open") : [];
  const current = occ && s ? store.lessons.find((l) => l.student_id === s.id && l.date === occ.date)?.status ?? "planned" : "planned";

  return (
    <Sheet
      open={!!occ}
      onClose={onClose}
      title={
        occ && s ? (
          <span className="flex items-center gap-2">
            <Dot color={s.color} size={10} /> {occ.kind === "check" ? `Check ${s.name}’s homework` : `${s.name}`}
          </span>
        ) : (
          ""
        )
      }
    >
      {occ && s && (
        <div>
          <p className="mb-4 text-[13.5px] text-ink-2">
            {fmtDay(occ.date, { weekday: true })} · <span className="num">{occ.start}–{occ.end}</span>
          </p>
          {occ.kind === "lesson" && (
            <div className="mb-5 grid grid-cols-2 gap-2">
              {(
                [
                  ["taught", "Taught"],
                  ["missed_owe", "Missed, owe makeup"],
                  ["cancelled", "Cancelled"],
                  [null, "Clear"],
                ] as const
              ).map(([st, label]) => (
                <button
                  key={label}
                  onClick={() => {
                    mark(s.id, occ.date, st);
                    onClose();
                  }}
                  className={cx(
                    "btn justify-center border py-2",
                    (st ?? "planned") === current ? "border-ink bg-ink text-bg" : "border-line hover:bg-hover",
                    st === "missed_owe" && current !== "missed_owe" && "text-pen",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="label mb-1.5">Homework waiting to be checked</div>
          {hw.length === 0 && <p className="text-[13.5px] text-muted">Nothing open.</p>}
          {hw.map((h) => (
            <div key={h.id} className="flex items-start gap-2.5 py-1.5">
              <Tick checked={false} color="var(--pen)" label="Checked" onChange={() => update("homework", h.id, { status: "checked", checked_on: occ.date })} />
              <span className="text-[14px]">{h.title}</span>
            </div>
          ))}
          <p className="mt-4 text-[12px] text-muted">
            Weekday {WD_SHORT[weekday(occ.date)]}. Edit the weekly time or homework rules from the Teaching page.
          </p>
        </div>
      )}
    </Sheet>
  );
}
