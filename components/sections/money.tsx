"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Repeat, Trash2 } from "lucide-react";
import { useData } from "@/components/data";
import { Field, Page, PageHeader, Section, Segmented, Sheet, Tick } from "@/components/ui";
import { fmtMonth, monthOf, relDay, shiftMonth, today } from "@/lib/dates";
import { cx, parseAmount, vnd } from "@/lib/format";
import { taughtIn } from "@/lib/teaching";
import { EXPENSE_CATEGORIES, type Debt, type Transaction } from "@/lib/types";
import { CAT_COLORS, QuickAdd } from "@/components/money";
import { FoodSection, isFood } from "@/components/food";
import { CountUp, Grow } from "@/components/reveal";
import { fixedFor } from "@/lib/fixed";
import { FixedCard } from "@/components/fixed";
import { Money } from "@/components/rolling";


export default function MoneyPage() {
  const { store, update, remove } = useData();
  const [month, setMonth] = useState(monthOf(today()));
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [debtOpen, setDebtOpen] = useState<Debt | "new" | null>(null);

  const txs = useMemo(
    () => store.transactions.filter((t) => t.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || (b.created_at ?? "").localeCompare(a.created_at ?? "")),
    [store.transactions, month],
  );
  const teaching = store.students.reduce((n, s) => n + taughtIn(store, s.id, month).length * s.rate, 0);
  const manualIncome = txs.filter((t) => t.kind === "income").reduce((n, t) => n + t.amount, 0);
  const income = teaching + manualIncome;
  // Monthly fixed expenses with no row of their own this month still count.
  const fixed = useMemo(() => fixedFor(store.transactions, month), [store.transactions, month]);
  const expenses = [...txs.filter((t) => t.kind === "expense"), ...fixed.filter((f) => !f.real)];
  const spent = expenses.reduce((n, t) => n + t.amount, 0);
  const fixedTotal = fixed.reduce((n, f) => n + f.amount, 0);
  const byCat = EXPENSE_CATEGORIES.map((c) => ({
    c,
    v: expenses.filter((t) => t.category === c).reduce((n, t) => n + t.amount, 0),
  }));
  const other = expenses.filter((t) => !(EXPENSE_CATEGORIES as readonly string[]).includes(t.category)).reduce((n, t) => n + t.amount, 0);
  if (other) byCat[byCat.length - 1].v += other;
  const maxCat = Math.max(1, ...byCat.map((x) => x.v));

  // Daily food & drinks and monthly fixed expenses have their own sections, so the entry list stays readable.
  const listed = useMemo(() => {
    const shown = new Set(fixed.map((f) => f.real?.id));
    return txs.filter((t) => !isFood(t) && !shown.has(t.id));
  }, [txs, fixed]);
  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of listed) m.set(t.date, [...(m.get(t.date) ?? []), t]);
    return [...m.entries()];
  }, [listed]);

  const receivables = store.debts.filter((d) => d.direction === "receivable" && !d.settled);
  const payables = store.debts.filter((d) => d.direction === "payable" && !d.settled);
  const unpaid = store.receipts.filter((r) => r.status === "issued");

  return (
    <Page wide>
      <PageHeader eyebrow="Money" title={fmtMonth(month)}>
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" className="btn btn-ghost px-1.5" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={17} />
          </button>
          <button className="btn btn-ghost" onClick={() => setMonth(monthOf(today()))}>
            This month
          </button>
          <button aria-label="Next month" className="btn btn-ghost px-1.5" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight size={17} />
          </button>
        </div>
      </PageHeader>

      {/* The month as one ledger line */}
      <div className="mb-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
        {[
          { l: "Came in", v: income, sub: teaching ? <><Money value={teaching} compact /> from teaching</> : undefined },
          { l: "Went out", v: -spent, sub: fixedTotal ? <><Money value={fixedTotal} compact /> monthly fixed</> : undefined },
          { l: "Kept", v: income - spent, strong: true },
        ].map((x) => (
          <div key={x.l} data-reveal="up" className="bg-surface px-3 py-3 md:px-5 md:py-4">
            <div className="label">{x.l}</div>
            <div className={cx("num mt-1 text-[17px] md:text-[26px] font-semibold leading-tight", x.strong && (x.v >= 0 ? "text-good" : "text-pen"))}>
              <Money value={x.v} />
            </div>
            {x.sub && <div className="mt-0.5 text-[11.5px] text-muted">{x.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <QuickAdd />
          <FixedCard month={month} className="lg:hidden" />
          <FoodSection month={month} />

          <Section title="Where it went">
            <div className="flex flex-col gap-2">
              {byCat.map(({ c, v }, bi) => (
                <div key={c} className="grid grid-cols-[92px_1fr_auto] items-center gap-3 text-[13.5px]">
                  <span className="text-ink-2">{c}</span>
                  <div className="h-5 rounded bg-hover overflow-hidden">
                    <Grow className="h-full rounded" style={{ background: CAT_COLORS[c] }} to={`${(v / maxCat) * 100}%`} delay={bi * 0.07} />
                  </div>
                  <Money value={v} className="num w-[92px] text-right" />
                </div>
              ))}
            </div>
          </Section>

          <Section title={<>Entries · <CountUp value={listed.length} /></>}>
            {groups.length === 0 && <p className="text-[13.5px] text-muted">Nothing logged in {fmtMonth(month)} yet.</p>}
            {groups.map(([date, items]) => (
              <div key={date} className="mb-3">
                <div className="sticky top-[52px] md:top-0 z-[1] bg-bg/90 backdrop-blur px-3 py-1 text-[12px] font-semibold text-muted">{relDay(date)}</div>
                {items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setEdit(t)}
                    className="row group flex w-full items-center gap-3 px-3 py-2 text-left"
                  >
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: t.kind === "income" ? "var(--good)" : CAT_COLORS[t.category] ?? CAT_COLORS.Other }} />
                    <span className="min-w-0 flex-1 truncate text-[14px]">
                      {t.title}
                      {t.recurring && <Repeat size={12} className="ml-1.5 inline text-muted" />}
                      {t.note && <span className="ml-2 text-[12px] text-muted">{t.note}</span>}
                    </span>
                    <span className="hidden text-[12px] text-muted md:inline">{t.category}</span>
                    <span className={cx("num w-[104px] text-right text-[14px]", t.kind === "income" && "text-good")}>
                      {vnd(t.kind === "income" ? t.amount : -t.amount, { sign: t.kind === "income" })}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </Section>
        </div>

        <aside>
          <FixedCard month={month} className="hidden lg:block" />

          <Section
            title="Owed to you"
            action={
              <button className="btn btn-ghost px-1.5 py-0.5 text-[12.5px]" onClick={() => setDebtOpen("new")}>
                <Plus size={14} /> Add
              </button>
            }
          >
            {unpaid.map((r) => {
              const s = store.students.find((x) => x.id === r.student_id);
              return (
                <Link key={r.id} href={`/teaching/receipts/${r.id}`} className="row flex items-center justify-between gap-2 border-b border-line py-2 text-[13.5px] hover:bg-hover">
                  <span>
                    {s?.name} <span className="text-muted">· {fmtMonth(r.month)} receipt</span>
                  </span>
                  <span className="num">{vnd(r.amount)}</span>
                </Link>
              );
            })}
            {receivables.map((d) => (
              <DebtRow key={d.id} d={d} onEdit={() => setDebtOpen(d)} onSettle={() => update("debts", d.id, { settled: true })} />
            ))}
            {!unpaid.length && !receivables.length && <p className="text-[13.5px] text-muted">Nobody owes you anything.</p>}
            <div className="mt-2 flex justify-between text-[13px] font-semibold">
              <span>Total</span>
              <Money value={unpaid.reduce((n, r) => n + r.amount, 0) + receivables.reduce((n, d) => n + d.amount, 0)} className="num" />
            </div>
          </Section>

          <Section title="You owe">
            {payables.map((d) => (
              <DebtRow key={d.id} d={d} onEdit={() => setDebtOpen(d)} onSettle={() => update("debts", d.id, { settled: true })} />
            ))}
            {!payables.length && <p className="text-[13.5px] text-muted">All clear.</p>}
          </Section>
        </aside>
      </div>

      <TxSheet tx={edit} onClose={() => setEdit(null)} onDelete={(id) => remove("transactions", id)} />
      <DebtSheet debt={debtOpen} onClose={() => setDebtOpen(null)} />
    </Page>
  );
}

function DebtRow({ d, onEdit, onSettle }: { d: Debt; onEdit: () => void; onSettle: () => void }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line py-2 text-[13.5px]">
      <Tick checked={false} size={16} round label="Settled" onChange={onSettle} />
      <button onClick={onEdit} className="min-w-0 flex-1 truncate text-left hover:underline underline-offset-2">
        {d.person} {d.note && <span className="text-muted">· {d.note}</span>}
      </button>
      <span className="num">{vnd(d.amount)}</span>
    </div>
  );
}

function TxSheet({ tx, onClose, onDelete }: { tx: Transaction | null; onClose: () => void; onDelete: (id: string) => void }) {
  const { update, storeRef } = useData();
  const t = tx ? storeRef.current.transactions.find((x) => x.id === tx.id) ?? tx : null;
  return (
    <Sheet open={!!t} onClose={onClose} title="Edit entry">
      {t && (
        <div>
          <Field label="Description">
            <input className="field" defaultValue={t.title} onBlur={(e) => update("transactions", t.id, { title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₫)">
              <input
                className="field num"
                defaultValue={t.amount.toLocaleString("en-US")}
                onBlur={(e) => {
                  const v = parseAmount(e.target.value);
                  if (v) update("transactions", t.id, { amount: v });
                }}
              />
            </Field>
            <Field label="Date">
              <input type="date" className="field num" defaultValue={t.date} onChange={(e) => update("transactions", t.id, { date: e.target.value })} />
            </Field>
          </div>
          <Field label="Category">
            <input className="field" list="cats" defaultValue={t.category} onBlur={(e) => update("transactions", t.id, { category: e.target.value })} />
            <datalist id="cats">
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Note">
            <input className="field" defaultValue={t.note ?? ""} onBlur={(e) => update("transactions", t.id, { note: e.target.value || null })} />
          </Field>
          <label className="mb-4 flex items-center gap-2 text-[13.5px]">
            <Tick checked={t.recurring} onChange={() => update("transactions", t.id, { recurring: !t.recurring })} /> Repeats monthly
          </label>
          <div className="flex justify-between">
            <button
              className="btn btn-ghost text-pen"
              onClick={() => {
                onDelete(t.id);
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

function DebtSheet({ debt, onClose }: { debt: Debt | "new" | null; onClose: () => void }) {
  const { insert, update, remove } = useData();
  const isNew = debt === "new";
  const d = debt && debt !== "new" ? debt : null;
  const [direction, setDirection] = useState<"receivable" | "payable">("receivable");
  return (
    <Sheet open={!!debt} onClose={onClose} title={isNew ? "New debt" : "Edit debt"}>
      {debt && (
        <form
          key={d?.id ?? "new"}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const row = {
              person: String(f.get("person") || "").trim(),
              amount: parseAmount(String(f.get("amount") || "")) ?? 0,
              note: String(f.get("note") || "") || null,
              due_on: String(f.get("due") || "") || null,
            };
            if (!row.person || !row.amount) return;
            if (d) update("debts", d.id, row);
            else insert("debts", { ...row, direction, settled: false, student_id: null });
            onClose();
          }}
        >
          {isNew && (
            <Segmented
              className="mb-3"
              value={direction}
              onChange={setDirection}
              options={[
                { value: "receivable", label: "They owe me" },
                { value: "payable", label: "I owe them" },
              ]}
            />
          )}
          <Field label="Person">
            <input name="person" className="field" defaultValue={d?.person} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <input name="amount" className="field num" defaultValue={d ? d.amount.toLocaleString("en-US") : ""} placeholder="500k" />
            </Field>
            <Field label="Due">
              <input name="due" type="date" className="field num" defaultValue={d?.due_on ?? ""} />
            </Field>
          </div>
          <Field label="Note">
            <input name="note" className="field" defaultValue={d?.note ?? ""} />
          </Field>
          <div className="flex justify-between">
            {d ? (
              <button
                type="button"
                className="btn btn-ghost text-pen"
                onClick={() => {
                  remove("debts", d.id);
                  onClose();
                }}
              >
                <Trash2 size={15} /> Delete
              </button>
            ) : (
              <span />
            )}
            <button className="btn btn-primary">Save</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
