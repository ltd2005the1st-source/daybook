"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useData } from "./data";
import { MilestoneBar } from "./milestone-bar";
import { Field, Sheet, Tick } from "./ui";
import { today } from "@/lib/dates";
import { cx } from "@/lib/format";
import { describeTask, duplicateTask } from "@/lib/dupes";
import type { Task } from "@/lib/types";

/** Edit a task: name, when it's due, the time it shows on the calendar, list, milestones and notes. */
export function TaskSheet({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const { store, update, remove, insert, toast } = useData();
  const [ms, setMs] = useState("");
  const items = task ? store.milestones.filter((m) => m.task_id === task.id).sort((a, b) => a.sort - b.sort) : [];
  return (
    <Sheet open={!!task} onClose={onClose} title="Task" width={520}>
      {task && (
        <div key={task.id}>
          <input
            className="field !text-[18px] !font-semibold !border-transparent !px-0 mb-2"
            defaultValue={task.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v || v === task.title) return;
              const dup = duplicateTask(store, v, task.id);
              if (dup) {
                toast(describeTask(dup) + " Name not changed.");
                e.target.value = task.title;
                return;
              }
              update("tasks", task.id, { title: v });
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due">
              <input type="date" className="field num" value={task.due_on ?? ""} onChange={(e) => update("tasks", task.id, { due_on: e.target.value || null })} />
            </Field>
            <Field label="Time (shows on your calendar)">
              <input
                type="time"
                className="field num"
                value={task.due_time ?? ""}
                onChange={(e) => update("tasks", task.id, { due_time: e.target.value || null, due_on: task.due_on ?? today() })}
              />
            </Field>
            <Field label="List">
              <input className="field" list="lists" defaultValue={task.list} onBlur={(e) => update("tasks", task.id, { list: e.target.value || "Personal" })} />
              <datalist id="lists">
                {Array.from(new Set(["Personal", "Work", ...store.tasks.map((x) => x.list)])).map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </Field>
          </div>
          <div className="mb-4 flex flex-wrap gap-4 text-[13.5px]">
            <label className="flex items-center gap-2">
              <Tick checked={task.priority} color="var(--pen)" onChange={() => update("tasks", task.id, { priority: !task.priority })} /> Flagged
            </label>
            <label className="flex items-center gap-2">
              <Tick checked={task.horizon === "long"} onChange={() => update("tasks", task.id, { horizon: task.horizon === "long" ? "now" : "long" })} /> Long-term goal
            </label>
          </div>

          <div className="label mb-2">Milestones</div>
          {items.length > 0 && (
            <div className="mb-3">
              <MilestoneBar items={items} color="var(--accent)" />
            </div>
          )}
          <ul className="mb-2">
            {items.map((m) => (
              <li key={m.id} className="group flex items-center gap-2.5 py-1.5">
                <Tick checked={m.done} size={16} color="var(--accent)" onChange={() => update("milestones", m.id, { done: !m.done })} />
                <input
                  className={cx("flex-1 bg-transparent text-[14px] outline-none", m.done && "text-muted line-through")}
                  defaultValue={m.title}
                  onBlur={(e) => e.target.value.trim() && update("milestones", m.id, { title: e.target.value.trim() })}
                />
                <button aria-label="Remove milestone" className="opacity-0 group-hover:opacity-100 text-muted hover:text-pen" onClick={() => remove("milestones", m.id, { silent: true })}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!ms.trim()) return;
              insert("milestones", { task_id: task.id, title: ms.trim(), done: false, sort: items.length });
              setMs("");
            }}
          >
            <input className="field" placeholder="Add a milestone" value={ms} onChange={(e) => setMs(e.target.value)} />
            <button className="btn btn-line">Add</button>
          </form>

          <Field label="Notes">
            <textarea className="field min-h-[80px]" defaultValue={task.notes ?? ""} onBlur={(e) => update("tasks", task.id, { notes: e.target.value || null })} />
          </Field>
          <div className="flex justify-between">
            <button
              className="btn btn-ghost text-pen"
              onClick={() => {
                remove("tasks", task.id);
                onClose();
              }}
            >
              <Trash2 size={15} /> Delete
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
