"use client";
import { motion } from "motion/react";
import type { Milestone } from "@/lib/types";
import { sec } from "@/lib/motion";

/** A progress bar where each milestone is a station along the line. */
export function MilestoneBar({ items, color = "var(--ink)" }: { items: Milestone[]; color?: string }) {
  const n = items.length;
  if (!n) return null;
  const done = items.filter((m) => m.done).length;
  const pct = done / n;
  return (
    <div className="relative h-4 w-full" aria-label={`${done} of ${n} milestones done`}>
      <div className="absolute inset-x-[7px] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-hover" />
      <motion.div
        className="absolute left-[7px] top-1/2 h-[3px] -translate-y-1/2 rounded-full"
        style={{ background: color }}
        initial={false}
        animate={{ width: `calc((100% - 14px) * ${pct})` }}
        transition={{ duration: sec(0.6), ease: [0.65, 0, 0.35, 1] }}
      />
      {items.map((m, i) => {
        const left = `calc(7px + (100% - 14px) * ${(i + 1) / n} - 5px)`;
        return (
          <motion.span
            key={m.id}
            title={m.title}
            className="absolute top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full border-2"
            style={{ left, borderColor: m.done ? color : "var(--line-strong)", background: m.done ? color : "var(--surface)" }}
            initial={false}
            animate={{ scale: m.done ? [1.5, 1] : 1 }}
            transition={{ duration: sec(0.3) }}
          />
        );
      })}
    </div>
  );
}
