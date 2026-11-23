"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useData } from "./data";
import { Segmented, Tick } from "./ui";
import { addDays, today } from "@/lib/dates";
import { cx, parseAmount, vnd } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/types";

export const CAT_COLORS: Record<string, string> = {
  Necessity: "#5B6FB5",
  Pleasure: "#B5689A",
  Transport: "#C0903A",
  Work: "#3F8A6E",
  Other: "#8A877E",
};

export function QuickAdd({ compact }: { compact?: boolean }) {
  const { insert, toast } = useData();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState<string>("Necessity");
  const [date, setDate] = useState(today());
  const [recurring, setRecurring] = useState(false);
  const parsed = parseAmount(amount);

  return (
    <form
      className={cx("card mb-8 p-3 md:p-4", compact && "mb-0")}
      onSubmit={(e) => {
        e.preventDefault();
        if (!parsed || !title.trim()) return;
        insert("transactions", {
          kind,
          amount: parsed,
          title: title.trim(),
          category: cat,
          date,
          recurring,
          note: null,
        });
        toast(`${kind === "income" ? "Income" : "Expense"} logged: ${title.trim()} ${vnd(parsed)}`);
        setAmount("");
        setTitle("");
        setRecurring(false);
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v);
            setCat(v === "income" ? "Contract" : "Necessity");
          }}
          options={[
            { value: "expense", label: "Spent" },
            { value: "income", label: "Received" },
          ]}
        />
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous day" className="btn btn-ghost px-1.5" onClick={() => setDate(addDays(date || today(), -1))}>
            <ChevronLeft size={17} />
          </button>
          <input type="date" className="field !w-auto num text-[13px] !py-1" value={date} onChange={(e) => setDate(e.target.value || today())} aria-label="Day" />
          <button type="button" aria-label="Next day" className="btn btn-ghost px-1.5" onClick={() => setDate(addDays(date || today(), 1))}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="relative md:w-44">
          <input
            className="field num !text-[18px] !py-2 font-semibold"
            inputMode="decimal"
            placeholder="200k"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Amount"
          />
          {parsed && amount && <span className="num pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted">{vnd(parsed, { compact: true })}</span>}
        </div>
        <input className="field !py-2" placeholder={kind === "expense" ? "What was it? e.g. Grab home" : "From? e.g. 2nd contract"} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Description" />
        <button className="btn btn-primary justify-center !py-2">
          <Plus size={15} /> Log
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {(kind === "expense" ? [...EXPENSE_CATEGORIES] : ["Contract", "Tutoring", "Gift", "Other"]).map((c) => (
          <button
            type="button"
            key={c}
            onClick={() => setCat(c)}
            className={cx(
              "rounded-xl border px-2.5 py-0.5 text-[12.5px] transition-colors",
              cat === c ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:bg-hover",
            )}
          >
            {c}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-[12.5px] text-ink-2">
          <Tick size={15} checked={recurring} onChange={() => setRecurring(!recurring)} /> Monthly
        </label>
      </div>
    </form>
  );
}

