"use client";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useData } from "./data";
import { Strike, TASK_ENTER, TASK_EXIT, useCompleteTask } from "./complete";
import { Dot, Sheet, Tick } from "./ui";
import { addDays, fmtDay, relDay, today } from "@/lib/dates";
import { cx } from "@/lib/format";
import { checkFor, checkOffset, checkRow, checkTasksOn, checkTime, daysBetween, type CheckTask } from "@/lib/teaching";
import type { Task } from "@/lib/types";
import { sec } from "@/lib/motion";

/**
 * Homework checks are tasks, at 22:30 the night before each class unless you move them. They exist on
 * their own (nothing is stored) until you tick one, move it or change just its text; then a task row
 * linked to the student and the class keeps it.
 */
export function useCheckActions() {
  const { storeRef, insert, update, toast } = useData();

  const rowOf = (studentId: string, classDate: string) => checkRow(storeRef.current, studentId, classDate);

  type Patch = Partial<Pick<Task, "done" | "done_at" | "notes" | "due_on" | "due_time">>;
  const ensure = (c: Pick<CheckTask, "student" | "date" | "time" | "classDate">, patch: Patch) => {
    const row = rowOf(c.student.id, c.classDate);
    if (row) {
      update("tasks", row.id, patch);
      return;
    }
    insert("tasks", {
      title: `Check ${c.student.name}`,
      notes: null,
      list: "Teaching",
      due_on: c.date,
      due_time: c.time,
      priority: false,
      horizon: "now",
      done: false,
      done_at: null,
      sort: 0,
      student_id: c.student.id,
      check_for: c.classDate,
      ...patch,
    });
  };

  /** Moves one check, or every check for this student from this class on. */
  const move = (c: CheckTask, to: { date: string; time: string }, scope: "one" | "all") => {
    const name = c.student.name;
    if (scope === "one") {
      const before = c.row ? { due_on: c.row.due_on, due_time: c.row.due_time } : null;
      ensure(c, { due_on: to.date, due_time: to.time });
      toast(`Check ${name}: ${fmtDay(to.date, { weekday: true })}, ${to.time} (this one only)`, () => {
        const row = rowOf(c.student.id, c.classDate);
        if (!row) return;
        update("tasks", row.id, before ?? { due_on: c.date, due_time: c.time });
      });
      return;
    }
    const offset = Math.min(6, Math.max(0, daysBetween(to.date, c.classDate)));
    const prevStudent = { check_time: checkTime(c.student), check_offset: checkOffset(c.student) };
    const rows = storeRef.current.tasks.filter((t) => t.student_id === c.student.id && !t.done && (checkFor(t) ?? "") >= c.classDate);
    const prevRows = rows.map((t) => [t.id, { due_on: t.due_on, due_time: t.due_time }] as const);
    update("students", c.student.id, { check_time: to.time, check_offset: offset });
    rows.forEach((t) => update("tasks", t.id, { due_on: addDays(checkFor(t)!, -offset), due_time: to.time }));
    toast(
      `Every check for ${name}: ${offset === 0 ? "the day of class" : offset === 1 ? "the day before class" : `${offset} days before class`} at ${to.time}`,
      () => {
        update("students", c.student.id, prevStudent);
        prevRows.forEach(([id, p]) => update("tasks", id, p));
      },
    );
  };

  const setDone = (c: Pick<CheckTask, "student" | "date" | "time" | "classDate">, done: boolean) =>
    ensure(c, { done, done_at: done ? new Date().toISOString() : null });

  /** Changes what to check, for this night only or for every night. */
  const setContents = (c: CheckTask, text: string, scope: "one" | "all") => {
    const value = text.trim() ? text.trim() : null;
    const name = c.student.name;
    if (scope === "one") {
      const before = c.row ? c.row.notes : undefined;
      ensure(c, { notes: value ?? "" });
      toast(`Changed ${name}’s check for ${fmtDay(c.date)} only`, () => {
        const row = rowOf(c.student.id, c.classDate);
        if (row) update("tasks", row.id, { notes: before ?? null });
      });
      return;
    }
    const prevNote = c.student.check_note ?? null;
    // Nights you changed on their own from here on follow the new text again.
    const overridden = storeRef.current.tasks.filter(
      (t) => t.student_id === c.student.id && !t.done && t.due_on && t.due_on >= c.date && t.notes != null,
    );
    const prev = overridden.map((t) => [t.id, t.notes] as const);
    update("students", c.student.id, { check_note: value });
    overridden.forEach((t) => update("tasks", t.id, { notes: null }));
    toast(`Changed every check for ${name}`, () => {
      update("students", c.student.id, { check_note: prevNote });
      prev.forEach(([id, notes]) => update("tasks", id, { notes }));
    });
  };

  return { setDone, setContents, move };
}

const nightLabel = (date: string) => {
  const r = relDay(date);
  return r === "Today" || r === "Tomorrow" ? r : fmtDay(date, { weekday: true });
};

/** A check in a task list: tick it, or tap it to see and change what to check. */
export function CheckRow({ c, onOpen, compact }: { c: CheckTask; onOpen: () => void; compact?: boolean }) {
  const { setDone } = useCheckActions();
  const task = { id: c.key, title: `Check ${c.student.name}`, done: c.done };
  const done = useCompleteTask(task, (v) => setDone(c, v));
  const note = c.contents?.split("\n").filter(Boolean).join(" · ");
  return (
    <motion.div
      {...TASK_ENTER}
      exit={TASK_EXIT}
      className="row group cursor-pointer overflow-hidden hover:bg-hover"
      onClick={onOpen}
    >
      <div className={cx("flex items-start gap-3", compact ? "py-1.5" : "py-2.5")}>
        <div className="pt-[1px]" onClick={(e) => e.stopPropagation()}>
          <Tick checked={done.checked} round label="Complete" color="var(--accent)" onChange={done.toggle} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={cx("leading-snug", compact ? "text-[14px]" : "text-[14.5px]")}>
            <Dot color={c.student.color} size={8} className="mr-1.5 -mt-0.5" />
            <Strike on={done.checked} animate={done.completing}>
              {task.title}
            </Strike>
          </div>
          {note && <div className="mt-0.5 truncate text-[12.5px] text-ink-2">{note}</div>}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
            <span>
              {nightLabel(c.date)} · <span className="num">{c.time}</span>
            </span>
            <span>class {relDay(c.classDate).toLowerCase()}</span>
            {c.homework.length > 0 && <span className="text-pen">{c.homework.length} homework open</span>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** One night's check: tick it, change what to check (this one or all of them), tick off homework. */
export function CheckSheet({ at, onClose }: { at: { studentId: string; date: string; forDate?: string } | null; onClose: () => void }) {
  const { store } = useData();
  const { setDone, setContents } = useCheckActions();
  const c = at ? checkTasksOn(store, at.date).find((x) => x.student.id === at.studentId && (!at.forDate || x.classDate === at.forDate)) : undefined;
  const [text, setText] = useState("");
  const ownText = !!c?.row && c.row.notes != null;
  const [sync, setSync] = useState(true);
  const key = at ? `${at.studentId}:${at.date}` : "";
  useEffect(() => {
    setText(c?.contents ?? "");
    // On unless this night already has its own text.
    setSync(!ownText);
    // Only reset when a different check opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const changed = !!c && (text.trim() !== (c.contents ?? "").trim() || sync === ownText);
  const close = () => onClose();
  const save = () => {
    if (c) setContents(c, text, sync ? "all" : "one");
    close();
  };

  return (
    <Sheet
      open={!!at && !!c}
      onClose={close}
      title={
        c ? (
          <span className="flex items-center gap-2">
            <Dot color={c.student.color} size={10} /> Check {c.student.name}
          </span>
        ) : (
          ""
        )
      }
    >
      {c && (
        <div key={key}>
          <p className="mb-4 text-[13.5px] text-ink-2">
            {nightLabel(c.date)}, <span className="num">{c.time}</span> · for the class {relDay(c.classDate).toLowerCase()} (
            {fmtDay(c.classDate, { weekday: true })})
          </p>

          <label className="mb-4 flex items-center gap-2.5 text-[14px]">
            <Tick round checked={c.done} color="var(--accent)" label="Done" onChange={() => setDone(c, !c.done)} />
            {c.done ? "Done" : "Mark as done"}
          </label>

          <div className="label mb-1.5">What to check</div>
          <textarea
            className="field mb-1 min-h-[96px] text-[14.5px] leading-relaxed"
            placeholder={`e.g. Unit 5 workbook, vocabulary notebook`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <label className="mb-1 mt-2 flex cursor-pointer items-center justify-between gap-3 text-[13.5px]">
            <span>Sync across all of {c.student.name}’s checks</span>
            <Switch on={sync} onChange={setSync} label="Sync across all checks" />
          </label>
          <p className="mb-4 text-[12px] text-muted">
            {sync
              ? `What you type here shows on every check for ${c.student.name}.`
              : `Only the check on ${fmtDay(c.date, { weekday: true })} changes. The others keep their text.`}{" "}
            It’s also what the reminder says.
          </p>

          {changed && (
            <div className="mb-5 flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setText(c.contents ?? "");
                  setSync(!ownText);
                }}
              >
                Undo changes
              </button>
              <button className="btn btn-primary" onClick={save}>
                {sync ? "Save for all checks" : "Save for this one"}
              </button>
            </div>
          )}

          <HomeworkEditor studentId={c.student.id} name={c.student.name} />
        </div>
      )}
    </Sheet>
  );
}

/** The student's open homework, edited in place: tick it off, rename it, remove it, or add more. */
export function HomeworkEditor({ studentId, name }: { studentId: string; name: string }) {
  const { store, insert, update, remove } = useData();
  const [draft, setDraft] = useState("");
  const items = store.homework
    .filter((h) => h.student_id === studentId && h.status === "open")
    .sort((a, b) => a.assigned_on.localeCompare(b.assigned_on) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    insert("homework", { student_id: studentId, title: v, note: null, assigned_on: today(), status: "open", checked_on: null });
    setDraft("");
  };
  return (
    <div>
      <div className="label mb-1.5">Homework to check</div>
      <div className="flex flex-col overflow-x-clip">
        <AnimatePresence initial={false}>
          {items.map((h) => (
            <motion.div key={h.id} {...TASK_ENTER} exit={TASK_EXIT} className="overflow-hidden">
              <div className="group flex items-center gap-2.5 py-1">
                <Tick checked={false} color="var(--pen)" label="Checked" onChange={() => update("homework", h.id, { status: "checked", checked_on: today() })} />
                <input
                  aria-label="Homework"
                  className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[14px] outline-none transition-colors duration-200 hover:border-line focus:border-ink-2"
                  defaultValue={h.title}
                  onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (!v) e.target.value = h.title;
                    else if (v !== h.title) update("homework", h.id, { title: v });
                  }}
                />
                <button
                  type="button"
                  aria-label={`Remove ${h.title}`}
                  className="rounded-md p-1 text-muted opacity-60 transition-opacity duration-200 hover:text-pen group-hover:opacity-100"
                  onClick={() => remove("homework", h.id)}
                >
                  <X size={15} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <form
        className="mt-1 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Plus size={16} className="ml-[3px] shrink-0 text-muted" />
        <input
          className="field flex-1 !py-1.5 text-[14px]"
          placeholder={items.length ? "Add more homework" : `Add homework for ${name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {draft.trim() && <button className="btn btn-line">Add</button>}
      </form>
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-300", on ? "bg-accent" : "bg-line-strong")}
    >
      <motion.span
        className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow-sm"
        initial={false}
        animate={{ x: on ? 16 : 0 }}
        transition={{ duration: sec(0.25), ease: [0.65, 0, 0.35, 1] }}
      />
    </button>
  );
}
