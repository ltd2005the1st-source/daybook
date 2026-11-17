"use client";
import { HomeworkEditor } from "./checks";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useData } from "./data";
import { useMarkLesson } from "./register";
import { ColorPicker } from "./color-picker";
import { EVENT_COLORS } from "@/lib/colors";
import { describeEvent, duplicateEvent } from "@/lib/dupes";
import { Dot, Field, MinutesInput, Sheet, Tick } from "./ui";
import { fmtDay, fromMinutes, minutes, WD_SHORT, weekday } from "@/lib/dates";
import { cx } from "@/lib/format";
import type { Occurrence } from "@/lib/teaching";
import { DEFAULT_REMIND, type CalEvent } from "@/lib/types";

const KINDS: CalEvent["kind"][] = ["focus", "routine", "personal", "work", "other"];
const WEEK = [1, 2, 3, 4, 5, 6, 0];

export function EventSheet({
  open,
  eventId,
  occurrenceDate,
  defaultStart,
  defaultEnd,
  onClose,
}: {
  open: boolean;
  eventId: string | null;
  occurrenceDate: string;
  defaultStart?: string;
  defaultEnd?: string;
  onClose: () => void;
}) {
  const { store, insert, update, remove } = useData();
  const existing = eventId ? store.events.find((e) => e.id === eventId) ?? null : null;
  const blank = (): Omit<CalEvent, "id"> => ({
    title: "",
    date: occurrenceDate,
    start_time: defaultStart ?? "09:00",
    end_time: defaultEnd ?? fromMinutes(minutes(defaultStart ?? "09:00") + 60),
    days: [],
    until: null,
    color: EVENT_COLORS[7].hex,
    kind: "personal",
    remind_before: [...DEFAULT_REMIND],
    notes: null,
    skip_dates: [],
  });
  const [draft, setDraft] = useState<Omit<CalEvent, "id">>(blank);
  useEffect(() => {
    if (open) setDraft(existing ? { ...existing } : blank());
  }, [open, eventId, occurrenceDate, defaultStart, defaultEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<CalEvent>) => setDraft((d) => ({ ...d, ...p }));
  const allDay = draft.start_time === null;
  const repeats = draft.days.length > 0;

  const clash = draft.title.trim() ? duplicateEvent(store, { ...draft, title: draft.title.trim() }, existing?.id) : undefined;

  function save() {
    if (!draft.title.trim() || clash) return;
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
        {clash && (
          <p role="alert" className="mb-3 -mt-1 rounded-md bg-pen-soft px-2.5 py-1.5 text-[13px] text-pen">
            {describeEvent(clash)} Change the name or the time to add it.
          </p>
        )}
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
            <MinutesInput value={draft.remind_before} onChange={(v) => set({ remind_before: v })} />
          </Field>
        </div>
        <Field label="Color">
          <ColorPicker value={draft.color} onChange={(c) => set({ color: c })} />
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
          <button className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed" disabled={!!clash}>
            {existing ? "Save" : "Add to calendar"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function LessonSheet({ occ, onClose }: { occ: Occurrence | null; onClose: () => void }) {
  const { store, update } = useData();
  const mark = useMarkLesson();
  const s = occ?.studentId ? store.students.find((x) => x.id === occ.studentId) : undefined;
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
                  ["missed_owe", "Missed"],
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
          <HomeworkEditor studentId={s.id} name={s.name} />
          <div className="label mb-1.5 mt-5">Colour for {s.name}</div>
          <ColorPicker value={s.color} onChange={(c) => update("students", s.id, { color: c })} size={24} />
          <p className="mt-4 text-[12px] text-muted">
            Drag the block on the calendar to move it, or drag its bottom edge to change the length. Homework rules live on the Teaching page.
          </p>
        </div>
      )}
    </Sheet>
  );
}
