"use client";
import { HomeworkEditor, Switch } from "./checks";
import { useEffect, useState } from "react";
import { Copy, Trash2 } from "lucide-react";
import { useData } from "./data";
import { useMarkLesson } from "./register";
import { ColorPicker } from "./color-picker";
import { EVENT_COLORS } from "@/lib/colors";
import { describeEvent, duplicateEvent } from "@/lib/dupes";
import { Dot, Field, MinutesInput, Sheet, Tick } from "./ui";
import { fmtDay, fromMinutes, minutes, WD_SHORT } from "@/lib/dates";
import { cx } from "@/lib/format";
import { lessonRow, noteFor, type Occurrence } from "@/lib/teaching";
import { DEFAULT_REMIND, type CalEvent, type LessonStatus } from "@/lib/types";

const KINDS: CalEvent["kind"][] = [
  "class",
  "focus",
  "routine",
  "personal",
  "work",
  "other",
];
const WEEK = [1, 2, 3, 4, 5, 6, 0];

const STATUS: [LessonStatus | null, string][] = [
  ["taught", "Taught"],
  ["missed_owe", "Missed"],
  ["cancelled", "Cancelled"],
  [null, "Not yet"],
];

export function EventSheet({
  open,
  eventId,
  occurrenceDate,
  defaultStart,
  defaultEnd,
  onClose,
  onCopy,
}: {
  open: boolean;
  eventId: string | null;
  occurrenceDate: string;
  defaultStart?: string;
  defaultEnd?: string;
  onClose: () => void;
  onCopy?: (e: CalEvent, date: string) => void;
}) {
  const { store, insert, update, remove } = useData();
  const mark = useMarkLesson();
  const existing = eventId
    ? (store.events.find((e) => e.id === eventId) ?? null)
    : null;
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
    student_id: null,
    occurrence_notes: {},
  });
  const [draft, setDraft] = useState<Omit<CalEvent, "id">>(blank);
  const [note, setNote] = useState("");
  const [sync, setSync] = useState(true);
  useEffect(() => {
    if (!open) return;
    setDraft(existing ? { ...existing } : blank());
    setNote(existing ? (noteFor(existing, occurrenceDate) ?? "") : "");
    // On unless this repeat already has notes of its own.
    setSync(
      !(
        existing?.occurrence_notes &&
        occurrenceDate in existing.occurrence_notes
      ),
    );
  }, [open, eventId, occurrenceDate, defaultStart, defaultEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<CalEvent>) => setDraft((d) => ({ ...d, ...p }));
  const allDay = draft.start_time === null;
  const repeats = draft.days.length > 0;
  const student = draft.student_id
    ? store.students.find((x) => x.id === draft.student_id)
    : undefined;
  const students = store.students.filter(
    (x) => x.active || x.id === draft.student_id,
  );
  const status = existing?.student_id
    ? (lessonRow(store, existing.student_id, occurrenceDate)?.status ?? null)
    : null;

  const clash = draft.title.trim()
    ? duplicateEvent(
        store,
        { ...draft, title: draft.title.trim() },
        existing?.id,
      )
    : undefined;

  function save() {
    if (!draft.title.trim() || clash) return;
    const text = note.trim() ? note.trim() : null;
    const row: Omit<CalEvent, "id"> = { ...draft, title: draft.title.trim() };
    if (!repeats || sync) {
      // The same notes on every repeat; repeats that had their own follow along again.
      row.notes = text;
      row.occurrence_notes = {};
    } else {
      row.occurrence_notes = {
        ...(draft.occurrence_notes ?? {}),
        [occurrenceDate]: text ?? "",
      };
    }
    if (existing) update("events", existing.id, row);
    else insert("events", row);
    onClose();
  }

  const pickStudent = (id: string) => {
    const st = store.students.find((x) => x.id === id);
    if (!st)
      return set({
        student_id: null,
        kind: draft.kind === "class" ? "personal" : draft.kind,
      });
    const autoTitle = !draft.title.trim() || draft.title.startsWith("Teach ");
    set({
      student_id: st.id,
      kind: "class",
      color: st.color,
      ...(autoTitle ? { title: `Teach ${st.name}` } : {}),
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        existing
          ? existing.student_id
            ? "Edit class"
            : "Edit event"
          : "New event"
      }
      width={880}
    >
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
          <p
            role="alert"
            className="mb-3 -mt-1 rounded-md bg-pen-soft px-2.5 py-1.5 text-[13px] text-pen"
          >
            {describeEvent(clash)} Change the name or the time to add it.
          </p>
        )}

        {/* Two columns on a computer so everything fits without scrolling: when and how on the left, notes and homework on the right. */}
        <div className="md:grid md:grid-cols-2 md:gap-x-7">
          <div className="min-w-0">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Date">
                <input
                  type="date"
                  className="field num"
                  value={draft.date}
                  onChange={(e) => set({ date: e.target.value })}
                />
              </Field>
              <Field label="Starts">
                <input
                  type="time"
                  className="field num"
                  disabled={allDay}
                  value={draft.start_time ?? ""}
                  onChange={(e) => set({ start_time: e.target.value })}
                />
              </Field>
              <Field label="Ends">
                <input
                  type="time"
                  className="field num"
                  disabled={allDay}
                  value={draft.end_time ?? ""}
                  onChange={(e) => set({ end_time: e.target.value })}
                />
              </Field>
            </div>
            <label className="mb-3 flex items-center gap-2 text-[13.5px]">
              <Tick
                checked={allDay}
                onChange={() =>
                  set(
                    allDay
                      ? { start_time: "09:00", end_time: "10:00" }
                      : { start_time: null, end_time: null },
                  )
                }
              />{" "}
              All day
            </label>

            <Field label="Repeats on">
              <div className="flex flex-wrap gap-1.5">
                {WEEK.map((d) => {
                  const on = draft.days.includes(d);
                  return (
                    <button
                      type="button"
                      key={d}
                      onClick={() =>
                        set({
                          days: on
                            ? draft.days.filter((x) => x !== d)
                            : [...draft.days, d],
                        })
                      }
                      className={cx(
                        "rounded-md border px-2.5 py-1 text-[13px]",
                        on
                          ? "border-ink bg-ink text-bg"
                          : "border-line text-ink-2 hover:bg-hover",
                      )}
                    >
                      {WD_SHORT[d]}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="text-[12.5px] text-muted underline underline-offset-2 ml-1"
                  onClick={() =>
                    set({ days: repeats ? [] : [0, 1, 2, 3, 4, 5, 6] })
                  }
                >
                  {repeats ? "Doesn’t repeat" : "Every day"}
                </button>
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Class with">
                <select
                  className="field"
                  value={draft.student_id ?? ""}
                  onChange={(e) => pickStudent(e.target.value)}
                >
                  <option value="">Not a class</option>
                  {students.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Type">
                <select
                  className="field"
                  value={draft.kind}
                  onChange={(e) =>
                    set({ kind: e.target.value as CalEvent["kind"] })
                  }
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k[0].toUpperCase() + k.slice(1)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Remind me (min before)">
                <MinutesInput
                  value={draft.remind_before}
                  onChange={(v) => set({ remind_before: v })}
                />
              </Field>
              {repeats ? (
                <Field label="Until (optional)">
                  <input
                    type="date"
                    className="field num"
                    value={draft.until ?? ""}
                    onChange={(e) => set({ until: e.target.value || null })}
                  />
                </Field>
              ) : (
                <span />
              )}
            </div>
            <Field label="Color">
              <ColorPicker
                value={draft.color}
                onChange={(c) => set({ color: c })}
              />
            </Field>
          </div>

          <div className="min-w-0 flex flex-col">
        {existing?.student_id && (
              <div className="mb-4 rounded-lg border border-line p-3">
                <div className="label mb-2">
                  This class, {fmtDay(occurrenceDate, { weekday: true })}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {STATUS.map(([st, label]) => (
                    <button
                      type="button"
                      key={label}
                      onClick={() =>
                        mark(existing.student_id!, occurrenceDate, st)
                      }
                      className={cx(
                        "btn justify-center border px-1 py-1.5 text-[13px] transition-colors duration-200",
                        st === status
                          ? "border-ink bg-ink text-bg"
                          : "border-line hover:bg-hover",
                        st === "missed_owe" &&
                          status !== "missed_owe" &&
                          "text-pen",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

                <Field label="Notes" className="!flex flex-1 flex-col">
              <textarea
                className="field min-h-[90px] flex-1 md:min-h-[150px]"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {repeats && existing && (
              <div className="-mt-2 mb-4">
                <label className="flex cursor-pointer items-center justify-between gap-3 text-[13.5px]">
                  <span>Sync notes across all repeats</span>
                  <Switch
                    on={sync}
                    onChange={setSync}
                    label="Sync notes across all repeats"
                  />
                </label>
                <p className="mt-0.5 text-[12px] text-muted">
                  {sync
                    ? "These notes show on every repeat."
                    : `These notes are only for ${fmtDay(occurrenceDate, { weekday: true })}.`}
                </p>
              </div>
            )}

            {student && existing && (
              <div className="mb-5">
                <HomeworkEditor studentId={student.id} name={student.name} />
              </div>
            )}
          </div>
        </div>

        {/* Actions stay in view at the bottom, even when the sheet has to scroll on a phone. */}
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 flex flex-wrap items-center justify-between gap-2 border-t border-line material px-5 py-3">
          {existing ? (
            <div className="flex flex-wrap gap-1">
              {onCopy && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onCopy(existing, occurrenceDate)}
                >
                  <Copy size={15} /> Copy
                </button>
              )}
              {repeats && (
                <button
                  type="button"
                  className="btn btn-ghost text-pen"
                  onClick={() => {
                    update("events", existing.id, {
                      skip_dates: [
                        ...(existing.skip_dates ?? []),
                        occurrenceDate,
                      ],
                    });
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
          <button
            className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={!!clash}
          >
            {existing ? "Save" : "Add to calendar"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function LessonSheet({
  occ,
  onClose,
}: {
  occ: Occurrence | null;
  onClose: () => void;
}) {
  const { store, update } = useData();
  const mark = useMarkLesson();
  const s = occ?.studentId
    ? store.students.find((x) => x.id === occ.studentId)
    : undefined;
  const current =
    occ && s
      ? (store.lessons.find((l) => l.student_id === s.id && l.date === occ.date)
          ?.status ?? "planned")
      : "planned";

  return (
    <Sheet
      open={!!occ}
      onClose={onClose}
      title={
        occ && s ? (
          <span className="flex items-center gap-2">
            <Dot color={s.color} size={10} />{" "}
            {occ.kind === "check" ? `Check ${s.name}’s homework` : `${s.name}`}
          </span>
        ) : (
          ""
        )
      }
    >
      {occ && s && (
        <div>
          <p className="mb-4 text-[13.5px] text-ink-2">
            {fmtDay(occ.date, { weekday: true })} ·{" "}
            <span className="num">
              {occ.start}–{occ.end}
            </span>
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
                    (st ?? "planned") === current
                      ? "border-ink bg-ink text-bg"
                      : "border-line hover:bg-hover",
                    st === "missed_owe" &&
                      current !== "missed_owe" &&
                      "text-pen",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <HomeworkEditor studentId={s.id} name={s.name} />
          <div className="label mb-1.5 mt-5">Colour for {s.name}</div>
          <ColorPicker
            value={s.color}
            onChange={(c) => update("students", s.id, { color: c })}
            size={24}
          />
          <p className="mt-4 text-[12px] text-muted">
            Drag the block on the calendar to move it, or drag its bottom edge
            to change the length. Homework rules live on the Teaching page.
          </p>
        </div>
      )}
    </Sheet>
  );
}
