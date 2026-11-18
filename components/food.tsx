"use client";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Plus, Trash2 } from "lucide-react";
import { useData } from "./data";
import { Field, Sheet } from "./ui";
import { daysInMonth, fmtDay, MONTHS, monthOf, today } from "@/lib/dates";
import { cx, parseAmount, vnd } from "@/lib/format";
import type { Store, Transaction } from "@/lib/types";
import { sec } from "@/lib/motion";

/**
 * Food & drinks is logged as one amount per day and read in three 10-day periods
 * (1–10, 11–20, 21–end), like the three rows in the spending sheet. Each day is an
 * ordinary Necessity expense, so it still counts in the month's totals.
 */
export const FOOD_TITLE = "Food & drinks";
export const FOOD_CATEGORY = "Necessity";
const EASE = [0.65, 0, 0.35, 1] as const;

export const isFood = (t: Pick<Transaction, "kind" | "title">) => t.kind === "expense" && t.title === FOOD_TITLE;

export function periodsOf(month: string) {
  const days = daysInMonth(month);
  return [days.slice(0, 10), days.slice(10, 20), days.slice(20)];
}

const periodLabel = (days: string[]) => {
  const m = MONTHS[Number(days[0].slice(5, 7)) - 1].slice(0, 3);
  return `${Number(days[0].slice(8))}–${Number(days[days.length - 1].slice(8))} ${m}`;
};

export function foodByDay(store: Pick<Store, "transactions">, month: string) {
  const m = new Map<string, number>();
  for (const t of store.transactions) if (isFood(t) && t.date.startsWith(month)) m.set(t.date, (m.get(t.date) ?? 0) + t.amount);
  return m;
}

/** Adds to a day's food total (or sets it), keeping one row per day. Returns an undo. */
export function useFoodLog() {
  const { storeRef, insert, update, remove } = useData();
  return (date: string, amount: number, mode: "add" | "set") => {
    const rows = storeRef.current.transactions.filter((t) => isFood(t) && t.date === date);
    const before = rows.reduce((n, t) => n + t.amount, 0);
    const after = mode === "add" ? before + amount : amount;
    const snapshot = rows.map((r) => ({ ...r }));
    const [first, ...rest] = rows;
    let created: string | null = null;
    if (after <= 0) rows.forEach((r) => remove("transactions", r.id, { silent: true }));
    else if (first) {
      update("transactions", first.id, { amount: after });
      rest.forEach((r) => remove("transactions", r.id, { silent: true })); // fold any extras into one row
    } else {
      created = insert("transactions", { kind: "expense", title: FOOD_TITLE, category: FOOD_CATEGORY, amount: after, date, recurring: false, note: null }).id;
    }
    const undo = () => {
      if (created) remove("transactions", created, { silent: true });
      for (const r of snapshot) {
        if (storeRef.current.transactions.some((t) => t.id === r.id)) update("transactions", r.id, { amount: r.amount });
        else {
          const { id: _id, created_at: _c, ...row } = r;
          insert("transactions", row);
        }
      }
    };
    return { before, after, undo };
  };
}

export function FoodSection({ month }: { month: string }) {
  const { store, toast } = useData();
  const log = useFoodLog();
  const t = today();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(t);
  const [editDay, setEditDay] = useState<string | null>(null);
  const parsed = parseAmount(amount);

  const byDay = useMemo(() => foodByDay(store, month), [store, month]);
  const periods = periodsOf(month);
  const totals = periods.map((p) => p.reduce((n, d) => n + (byDay.get(d) ?? 0), 0));
  const monthTotal = totals.reduce((a, b) => a + b, 0);
  const maxDay = Math.max(1, ...byDay.values());
  const current = monthOf(t) === month ? periods.findIndex((p) => p.includes(t)) : -1;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed) return;
    const r = log(date, parsed, "add");
    toast(
      r.before ? `Food & drinks, ${fmtDay(date)}: ${vnd(r.before)} → ${vnd(r.after)}` : `Food & drinks, ${fmtDay(date)}: ${vnd(r.after)}`,
      r.undo,
    );
    setAmount("");
  }

  return (
    <section className="card mb-8 p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-[18px] font-semibold">Food &amp; drinks</h2>
        <span className="text-[12.5px] text-muted">
          This month <span className="num font-semibold text-ink">{vnd(monthTotal)}</span>
        </span>
      </div>

      <form onSubmit={submit} className="mb-4 flex flex-wrap gap-2">
        <input
          className="field num min-w-0 flex-1 basis-[140px] !text-[16px]"
          inputMode="decimal"
          placeholder="What you spent that day, e.g. 85k"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Food and drinks amount"
        />
        <input type="date" className="field num w-auto" value={date} onChange={(e) => setDate(e.target.value || t)} aria-label="Day" />
        <button className="btn btn-primary" disabled={!parsed}>
          <Plus size={15} /> Add
        </button>
      </form>

      <div className="grid grid-cols-3 gap-2">
        {periods.map((days, i) => (
          <div
            key={i}
            className={cx("rounded-lg border px-2.5 pb-2 pt-2.5 transition-colors duration-300", i === current ? "border-accent/50 bg-accent-soft" : "border-line")}
          >
            <div className="label !text-[10.5px]">{periodLabel(days)}</div>
            <div className="num mt-0.5 text-[15px] md:text-[19px] font-semibold leading-tight">{vnd(totals[i], { compact: true })}</div>
            {/* One bar per day; tap a day to change it */}
            <div className="mt-2 flex h-12 items-end gap-[3px]">
              {days.map((d) => {
                const v = byDay.get(d) ?? 0;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEditDay(d)}
                    title={`${fmtDay(d, { weekday: true })}: ${vnd(v)}`}
                    aria-label={`${fmtDay(d, { weekday: true })}, ${vnd(v)}`}
                    className="group relative flex h-full flex-1 items-end"
                  >
                    <motion.span
                      className={cx("block w-full rounded-[2px]", d === t ? "bg-pen" : "bg-[#5B6FB5] group-hover:brightness-110")}
                      initial={false}
                      animate={{ height: v ? `${Math.max(8, (v / maxDay) * 100)}%` : "2px" }}
                      transition={{ duration: sec(0.4), ease: EASE }}
                      style={{ opacity: v ? 1 : 0.25 }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted">Each amount adds to that day. Tap a day’s bar to change or clear it. Counted under Necessity.</p>

      <DaySheet date={editDay} amount={editDay ? byDay.get(editDay) ?? 0 : 0} onClose={() => setEditDay(null)} />
    </section>
  );
}

function DaySheet({ date, amount, onClose }: { date: string | null; amount: number; onClose: () => void }) {
  const { store, toast } = useData();
  const log = useFoodLog();
  const [text, setText] = useState("");
  const notes = date ? store.transactions.filter((t) => isFood(t) && t.date === date && t.note).map((t) => t.note) : [];
  const parsed = text.trim() === "" ? null : parseAmount(text);

  return (
    <Sheet open={!!date} onClose={onClose} title={date ? `Food & drinks · ${fmtDay(date, { weekday: true })}` : ""}>
      {date && (
        <form
          key={date}
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed === null) return;
            const r = log(date, parsed, "set");
            toast(`Food & drinks, ${fmtDay(date)}: ${vnd(r.after)}`, r.undo);
            setText("");
            onClose();
          }}
        >
          <Field label="Spent that day">
            <input
              autoFocus
              className="field num !text-[18px]"
              inputMode="decimal"
              placeholder={amount ? vnd(amount) : "e.g. 85k"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          {notes.length > 0 && <p className="mb-3 text-[12.5px] text-muted">Note: {notes.join(", ")}</p>}
          <div className="flex items-center justify-between gap-2">
            {amount > 0 ? (
              <button
                type="button"
                className="btn btn-ghost text-pen"
                onClick={() => {
                  const r = log(date, 0, "set");
                  toast(`Cleared food & drinks for ${fmtDay(date)}`, r.undo);
                  onClose();
                }}
              >
                <Trash2 size={15} /> Clear day
              </button>
            ) : (
              <span />
            )}
            <button className="btn btn-primary" disabled={parsed === null}>
              Save
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
