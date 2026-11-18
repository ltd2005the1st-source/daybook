"use client";
import { useState } from "react";
import { Plus, Repeat, Trash2 } from "lucide-react";
import { useData } from "./data";
import { Field, Section, Sheet } from "./ui";
import { CAT_COLORS } from "./money";
import { fmtMonth, monthOf, shiftMonth, today } from "@/lib/dates";
import { cx, parseAmount, vnd } from "@/lib/format";
import { dayIn, fixedFor, fixedKey, type FixedItem } from "@/lib/fixed";
import { EXPENSE_CATEGORIES, type Transaction } from "@/lib/types";
import { Money } from "@/components/rolling";

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
};

/** Monthly fixed expenses: listed with their day and amount, counted in Went out every month. */
export function FixedCard({ month, className }: { month: string; className?: string }) {
  const { store } = useData();
  const items = fixedFor(store.transactions, month);
  const [open, setOpen] = useState<FixedItem | "new" | null>(null);
  const total = items.reduce((n, f) => n + f.amount, 0);
  const t = today();

  return (
    <Section
      title="Monthly fixed"
      className={className}
      action={
        <button className="btn btn-ghost px-1.5 py-0.5 text-[12.5px]" onClick={() => setOpen("new")}>
          <Plus size={14} /> Add
        </button>
      }
    >
      {items.length === 0 && <p className="text-[13.5px] text-muted">Subscriptions and bills you pay every month. Add one and it counts in every month from then on.</p>}
      <div>
        {items.map((f) => {
          const upcoming = !f.real && f.date > t;
          return (
            <div key={f.key} className="border-b border-line py-px">
              <button onClick={() => setOpen(f)} className="row flex w-full items-center gap-2.5 py-[7px] text-left text-[13.5px] hover:bg-hover">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: CAT_COLORS[f.category] ?? CAT_COLORS.Other }} />
                <span className="min-w-0 flex-1 truncate">
                  {f.title}{" "}
                  <span className="text-muted">· {ordinal(Number(f.date.slice(8)))}
                  </span>
                </span>
                <span className={cx("num", upcoming && "text-ink-2")}>{vnd(f.amount)}</span>
              </button>
            </div>
          );
        })}
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex justify-between text-[13px] font-semibold">
          <span>Total a month</span>
          <Money value={total} className="num" />
        </div>
      )}
      <FixedSheet item={open} month={month} onClose={() => setOpen(null)} />
    </Section>
  );
}

function FixedSheet({ item, month, onClose }: { item: FixedItem | "new" | null; month: string; onClose: () => void }) {
  const { store, insert, update, remove, toast } = useData();
  const f = item && item !== "new" ? item : null;
  const [cat, setCat] = useState<string>("Necessity");
  const [key, setKey] = useState<string | null>(null);
  // Reset the category picker whenever a different item opens.
  const openKey = item === "new" ? "new" : (f?.key ?? null);
  if (openKey !== key) {
    setKey(openKey);
    setCat(f?.category ?? "Necessity");
  }

  const save = (title: string, amount: number, day: number) => {
    const date = dayIn(month, day);
    if (!f) {
      const k = fixedKey(title);
      if (fixedFor(store.transactions, month).some((x) => x.key === k)) {
        toast(`${title} is already in Monthly fixed`);
        return false;
      }
      insert("transactions", { kind: "expense", title, amount, category: cat, date, recurring: true, note: null });
      toast(`Added to Monthly fixed: ${title} ${vnd(amount)}`);
      return true;
    }
    // A new name applies to every month, so the months stay one fixed expense.
    if (title !== f.title) for (const r of f.rows) update("transactions", r.id, { title });
    const changed = amount !== f.amount || cat !== f.category || date !== f.date;
    if (!changed) return true;
    // Amount, category and day change from this month on; earlier months keep theirs.
    if (f.real) update("transactions", f.real.id, { amount, category: cat, date, recurring: true });
    else insert("transactions", { kind: "expense", title, amount, category: cat, date, recurring: true, note: null });
    for (const r of f.rows) if (r.date >= `${shiftMonth(month, 1)}-01` && r.recurring) update("transactions", r.id, { amount, category: cat });
    return true;
  };

  const stop = () => {
    if (!f) return;
    // This month is the last one charged; later months drop it.
    if (f.real) update("transactions", f.real.id, { recurring: false });
    else insert("transactions", { kind: "expense", title: f.title, amount: f.amount, category: f.category, date: f.date, recurring: false, note: null });
    for (const r of f.rows) if (r.date >= `${shiftMonth(month, 1)}-01`) remove("transactions", r.id, { silent: true });
    toast(`${f.title} stops after ${fmtMonth(month)}`);
    onClose();
  };

  const removeAll = () => {
    if (!f) return;
    const snapshot: Transaction[] = f.rows.map((r) => ({ ...r }));
    for (const r of f.rows) remove("transactions", r.id, { silent: true });
    toast(`Removed ${f.title} from every month`, () => {
      for (const r of snapshot) insert("transactions", r);
    });
    onClose();
  };

  return (
    <Sheet open={!!item} onClose={onClose} title={f ? "Monthly fixed expense" : "New monthly expense"}>
      {item && (
        <form
          key={openKey ?? ""}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") || "").trim();
            const amount = parseAmount(String(fd.get("amount") || ""));
            const day = Number(fd.get("day")) || 1;
            if (!title || !amount) return;
            if (save(title, amount, day)) onClose();
          }}
        >
          <Field label="What is it">
            <input name="title" className="field" defaultValue={f?.title ?? ""} placeholder="e.g. Claude subscription" autoFocus={!f} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount a month">
              <input name="amount" className="field num" inputMode="decimal" defaultValue={f ? f.amount.toLocaleString("en-US") : ""} placeholder="500k" />
            </Field>
            <Field label="Day of the month">
              <input
                name="day"
                type="number"
                min={1}
                max={31}
                className="field num"
                defaultValue={f ? Number(f.source.date.slice(8)) : Number(month === monthOf(today()) ? today().slice(8) : 1)}
              />
            </Field>
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCat(c)}
                className={cx(
                  "rounded-full border px-2.5 py-0.5 text-[12.5px] transition-colors",
                  cat === c ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:bg-hover",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="mb-4 flex items-start gap-1.5 text-[12.5px] text-muted">
            <Repeat size={13} className="mt-0.5 shrink-0" />
            {f ? `Changes apply from ${fmtMonth(month)} on. Earlier months keep what they were.` : `Counted in Went out every month from ${fmtMonth(month)}.`}
          </p>
          {f && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" className="btn btn-line text-[13px]" onClick={stop}>
                Stop after {fmtMonth(month).split(" ")[0]}
              </button>
              <button type="button" className="btn btn-ghost text-[13px] text-pen" onClick={removeAll}>
                <Trash2 size={14} /> Remove from every month
              </button>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary">{f ? "Save" : "Add"}</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
