"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useData } from "@/components/data";
import { Dot, Page, PageHeader, Section, Tick } from "@/components/ui";
import { fmtDay, fmtMonth, monthOf, shiftMonth, today } from "@/lib/dates";
import { cx, parseAmount, vnd } from "@/lib/format";
import { plannedRemaining, taughtIn } from "@/lib/teaching";
import { Money } from "@/components/rolling";

export default function ReceiptsPage() {
  const { store, insert, update, remove } = useData();
  const [month, setMonth] = useState(monthOf(today()));
  const [withPlanned, setWithPlanned] = useState<Record<string, boolean>>({});
  const [adj, setAdj] = useState<Record<string, string>>({});
  const students = store.students.filter((s) => s.active).sort((a, b) => a.sort - b.sort);
  const t = today();

  const receipts = store.receipts
    .filter((r) => r.month === month)
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const older = store.receipts.filter((r) => r.month !== month && r.status === "issued");

  return (
    <Page wide>
      <Link href="/teaching" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Register
      </Link>
      <PageHeader eyebrow="Teaching" title="Monthly receipts">
        <div className="flex items-center gap-1">
          <button aria-label="Previous month" className="btn btn-ghost px-1.5" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={17} />
          </button>
          <span className="min-w-[128px] text-center text-[14px] font-medium">{fmtMonth(month)}</span>
          <button aria-label="Next month" className="btn btn-ghost px-1.5" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight size={17} />
          </button>
        </div>
      </PageHeader>

      <Section title={`Ready to bill for ${fmtMonth(month)}`}>
        <div className="card divide-y divide-border">
          {students.map((s) => {
            const taught = taughtIn(store, s.id, month).map((l) => l.date);
            const planned = plannedRemaining(store, s.id, month, t > `${month}-31` ? "9999" : t < `${month}-01` ? `${month}-01` : t);
            const inc = withPlanned[s.id] ?? false;
            const dates = inc ? [...taught, ...planned] : taught;
            const a = parseAmount(adj[s.id] ?? "0") ?? 0;
            const sign = (adj[s.id] ?? "").trim().startsWith("-") ? -1 : 1;
            const adjustment = sign * a;
            const total = dates.length * s.rate + adjustment;
            const existing = receipts.find((r) => r.student_id === s.id);
            return (
              <div key={s.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <Dot color={s.color} size={10} className="mt-1.5" />
                  <div className="min-w-0">
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-[12.5px] text-muted-foreground">
                      {taught.length} taught × {vnd(s.rate)}
                      {planned.length > 0 && (
                        <label className="ml-2 inline-flex items-center gap-1.5 align-middle">
                          <Tick size={14} checked={inc} onChange={() => setWithPlanned({ ...withPlanned, [s.id]: !inc })} />
                          add {planned.length} still scheduled (prepaid)
                        </label>
                      )}
                    </div>
                  </div>
                </div>
                <input
                  className="field num md:!w-36"
                  placeholder="± adjustment"
                  value={adj[s.id] ?? ""}
                  onChange={(e) => setAdj({ ...adj, [s.id]: e.target.value })}
                />
                <div className="num w-32 text-right text-[16px] font-semibold"><Money value={total} /></div>
                {existing ? (
                  <Link href={`/teaching/receipts/${existing.id}`} className="btn btn-line w-28 justify-center">
                    Open
                  </Link>
                ) : (
                  <button
                    disabled={!dates.length}
                    className={cx("btn btn-primary w-28 justify-center", !dates.length && "opacity-40")}
                    onClick={() =>
                      insert("receipts", {
                        student_id: s.id,
                        month,
                        sessions: dates.length,
                        rate: s.rate,
                        adjustments: adjustment,
                        amount: total,
                        status: "issued",
                        paid_on: null,
                        dates,
                        note: null,
                      })
                    }
                  >
                    Make receipt
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Issued receipts">
        {[...receipts, ...older].length === 0 ? (
          <p className="text-[13.5px] text-muted-foreground">None yet for {fmtMonth(month)}.</p>
        ) : (
          <div className="flex flex-col">
            {[...receipts, ...older].map((r) => {
              const s = store.students.find((x) => x.id === r.student_id);
              return (
                <div key={r.id} className="flex items-center gap-3 border-b border-border py-2.5">
                  <Dot color={s?.color ?? "var(--muted-foreground)"} />
                  <Link href={`/teaching/receipts/${r.id}`} className="min-w-0 flex-1 hover:underline underline-offset-2">
                    {s?.name ?? "Removed student"} <span className="text-muted-foreground">· {fmtMonth(r.month)}</span>
                  </Link>
                  <span className="num text-[13.5px]">{vnd(r.amount)}</span>
                  <button
                    onClick={() => update("receipts", r.id, r.status === "paid" ? { status: "issued", paid_on: null } : { status: "paid", paid_on: today() })}
                    className={cx(
                      "rounded-xl px-2.5 py-0.5 text-[12px] font-semibold",
                      r.status === "paid" ? "bg-success/12 text-success-foreground" : "bg-destructive/10 text-destructive-foreground",
                    )}
                  >
                    {r.status === "paid" ? `Paid ${r.paid_on ? fmtDay(r.paid_on) : ""}` : "Unpaid"}
                  </button>
                  <button className="text-[12px] text-muted-foreground hover:text-destructive-foreground" onClick={() => remove("receipts", r.id)}>
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </Page>
  );
}
