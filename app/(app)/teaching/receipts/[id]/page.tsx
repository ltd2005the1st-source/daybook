"use client";
import Link from "next/link";
import { use } from "react";
import { ArrowLeft, Copy, Printer } from "lucide-react";
import { useData } from "@/components/data";
import { Page } from "@/components/ui";
import { fmtDay, fmtMonth } from "@/lib/dates";
import { vnd } from "@/lib/format";

export default function ReceiptView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { store, update, toast } = useData();
  const r = store.receipts.find((x) => x.id === id);
  if (!r) {
    return (
      <Page>
        <p className="text-muted">This receipt no longer exists.</p>
      </Page>
    );
  }
  const s = store.students.find((x) => x.id === r.student_id);
  const number = `DB-${r.month.replace("-", "")}-${(s?.name ?? "X").replace(/\s+/g, "").slice(0, 3).toUpperCase()}`;
  const text = [
    `Tuition receipt · ${fmtMonth(r.month)}`,
    `${s?.name ?? ""}${s?.kind === "class" ? ` (${s.members.join(", ")})` : ""}`,
    `Sessions: ${r.sessions} × ${vnd(r.rate)}`,
    ...(r.adjustments ? [`Adjustment: ${vnd(r.adjustments, { sign: true })}`] : []),
    `Total: ${vnd(r.amount)}`,
    `Dates: ${r.dates.map((d) => fmtDay(d)).join(", ")}`,
  ].join("\n");

  return (
    <Page>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-2">
        <Link href="/teaching/receipts" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
          <ArrowLeft size={14} /> Receipts
        </Link>
        <div className="flex gap-2">
          <button
            className="btn btn-line"
            onClick={() => {
              navigator.clipboard?.writeText(text);
              toast("Copied, ready to paste into Zalo or Messenger");
            }}
          >
            <Copy size={15} /> Copy as text
          </button>
          <button className="btn btn-line" onClick={() => window.print()}>
            <Printer size={15} /> Print or save PDF
          </button>
          <button
            className="btn btn-primary"
            onClick={() => update("receipts", r.id, r.status === "paid" ? { status: "issued", paid_on: null } : { status: "paid", paid_on: new Date().toISOString().slice(0, 10) })}
          >
            {r.status === "paid" ? "Mark unpaid" : "Mark paid"}
          </button>
        </div>
      </div>

      {/* The slip */}
      <article className="mx-auto max-w-[520px] bg-surface text-ink shadow-pop rise relative" style={{ borderRadius: 4 }}>
        <div className="h-2 rounded-t" style={{ background: s?.color ?? "var(--ink)" }} />
        <div className="px-8 pt-7 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="label">Tuition receipt</div>
              <h1 className="display mt-1 text-[30px] font-semibold leading-none">{fmtMonth(r.month)}</h1>
            </div>
            <div className="text-right">
              <div className="num text-[12px] text-muted">{number}</div>
              <div
                className="mt-2 inline-block -rotate-6 rounded border-2 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider"
                style={{
                  borderColor: r.status === "paid" ? "var(--good)" : "var(--pen)",
                  color: r.status === "paid" ? "var(--good)" : "var(--pen)",
                }}
              >
                {r.status === "paid" ? "Paid" : "Due"}
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-line pt-4">
            <div className="label mb-1">Billed to</div>
            <div className="text-[17px] font-semibold">{s?.name}</div>
            {s?.kind === "class" && <div className="text-[13px] text-ink-2">{s.members.join(" · ")}</div>}
          </div>

          <div className="mt-5 ruled" style={{ backgroundPositionY: 6 }}>
            <div className="label mb-1">Sessions</div>
            <div className="flex flex-wrap gap-x-4 gap-y-0 text-[14px] leading-8">
              {r.dates.map((d) => (
                <span key={d} className="num">
                  {fmtDay(d, { weekday: true })}
                </span>
              ))}
            </div>
          </div>

          <table className="mt-5 w-full text-[14px]">
            <tbody>
              <tr className="border-b border-line">
                <td className="py-2">
                  {r.sessions} sessions × <span className="num">{vnd(r.rate)}</span>
                </td>
                <td className="num py-2 text-right">{vnd(r.sessions * r.rate)}</td>
              </tr>
              {r.adjustments !== 0 && (
                <tr className="border-b border-line">
                  <td className="py-2">Adjustment</td>
                  <td className="num py-2 text-right">{vnd(r.adjustments, { sign: true })}</td>
                </tr>
              )}
              <tr>
                <td className="pt-3 font-semibold">Total</td>
                <td className="num pt-3 text-right text-[22px] font-semibold">{vnd(r.amount)}</td>
              </tr>
            </tbody>
          </table>
          {r.paid_on && <p className="mt-3 text-[12.5px] text-good">Received {fmtDay(r.paid_on, { year: true })}. Thank you!</p>}
        </div>
        {/* perforated edge */}
        <div
          className="h-3"
          style={{
            background: "radial-gradient(circle at 6px 0, transparent 5px, var(--surface) 5.5px) 0 0/12px 12px repeat-x",
            transform: "translateY(100%)",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      </article>
    </Page>
  );
}
