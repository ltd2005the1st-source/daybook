"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckSquare, CornerDownLeft } from "lucide-react";
import { useData } from "./data";
import { NAV } from "./nav";
import { today } from "@/lib/dates";
import { cx, fold } from "@/lib/format";

type Item = { id: string; label: string; hint?: string; icon: React.ComponentType<{ size?: number }>; run: () => void };

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { insert, store, toast } = useData();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => ref.current?.focus(), 30);
    }
  }, [open]);

  const go = (href: string) => () => {
    router.push(href);
    onClose();
  };
  const nav: Item[] = [
    ...NAV.map((n) => ({ id: n.href, label: n.label, hint: "Go to", icon: n.icon, run: go(n.href) })),
    { id: "/teaching/receipts", label: "Receipts", hint: "Go to", icon: NAV[3].icon, run: go("/teaching/receipts") },
    { id: "/settings", label: "Settings", hint: "Go to", icon: NAV[0].icon, run: go("/settings") },
    ...store.students.map((s) => ({ id: `s${s.id}`, label: s.name, hint: "Student", icon: NAV[3].icon, run: go("/teaching") })),
  ];
  const filtered = q ? nav.filter((n) => fold(n.label).includes(fold(q))) : nav.slice(0, 8);
  const items: Item[] = q
    ? [
        ...filtered,
        {
          id: "task",
          label: `Add task: “${q}”`,
          icon: CheckSquare,
          run: () => {
            insert("tasks", { title: q, notes: null, list: "Personal", due_on: today(), due_time: null, priority: false, horizon: "now", done: false, done_at: null, sort: store.tasks.length });
            toast(`Task added: ${q}`);
            onClose();
          },
        },
      ]
    : filtered;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[14vh]">
          <motion.div className="absolute inset-0 bg-black/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
            className="relative w-full max-w-[540px] overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
          >
            <input
              ref={ref}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setI(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setI((x) => Math.min(items.length - 1, x + 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setI((x) => Math.max(0, x - 1));
                }
                if (e.key === "Enter") items[i]?.run();
              }}
              placeholder="Go somewhere or add a task"
              className="w-full border-b border-line bg-transparent px-4 py-3.5 text-[16px] outline-none focus-visible:outline-none placeholder:text-muted"
            />
            <ul className="max-h-[50vh] overflow-y-auto p-1.5">
              {items.map((it, k) => (
                <li key={it.id}>
                  <button
                    onMouseEnter={() => setI(k)}
                    onClick={it.run}
                    className={cx("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[14px]", k === i && "bg-hover")}
                  >
                    <it.icon size={16} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.hint && <span className="text-[12px] text-muted">{it.hint}</span>}
                    {k === i && <CornerDownLeft size={13} className="text-muted" />}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
