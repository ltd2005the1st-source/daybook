"use client";
import { useEffect, useRef, useState } from "react";
import { useData } from "./data";
import { cx } from "@/lib/format";
import type { Task } from "@/lib/types";

/** How long a finished task stays on screen (ticked and crossed out) before it leaves the list. */
export const COMPLETE_HOLD_MS = 750;

/**
 * Ticking a task: the tick fills blue and draws its check, the title is crossed out,
 * then the task is saved as done and slides out of the list.
 */
export function useCompleteTask(task: Task) {
  const { update, toast } = useData();
  const [completing, setCompleting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = () => {
    update("tasks", task.id, { done: true, done_at: new Date().toISOString() });
    toast(`Done: ${task.title}`, () => update("tasks", task.id, { done: false, done_at: null }));
  };

  const toggle = () => {
    if (task.done) {
      update("tasks", task.id, { done: false, done_at: null });
      return;
    }
    if (completing) {
      // Second tap before it leaves: take it back.
      if (timer.current) clearTimeout(timer.current);
      setCompleting(false);
      return;
    }
    setCompleting(true);
    timer.current = setTimeout(commit, COMPLETE_HOLD_MS);
  };

  return { checked: task.done || completing, completing, toggle };
}

/** Text with a line drawn through it from left to right. */
export function Strike({ on, animate, children, className }: { on: boolean; animate?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("strike", on && "strike-on", on && !animate && "strike-static", className)}>{children}</span>
  );
}
