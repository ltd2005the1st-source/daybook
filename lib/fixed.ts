import type { Transaction } from "./types";

/**
 * Monthly fixed expenses (subscriptions, phone plan, ...). No extra table: a fixed
 * expense is a run of expense rows with the same title where at least one row is
 * marked `recurring`. For a given month:
 *  - a row in that month is the month's charge (real);
 *  - otherwise the latest row before the month carries on if it is still recurring
 *    (virtual: counted in the totals, nothing written to the database);
 *  - a row with `recurring` off is the last month it is charged.
 * Changing an amount "from this month on" writes a row in that month, so earlier
 * months keep their old amount.
 */
export type FixedItem = {
  key: string;
  title: string;
  amount: number;
  category: string;
  date: string; // the day it is charged in this month
  real: Transaction | null; // the row for this month, if one exists
  source: Transaction; // the row the item is read from (real row or the one carried over)
  rows: Transaction[]; // every row of this fixed expense, oldest first
};

const FOOD = "Food & drinks";
export const fixedKey = (title: string) => title.trim().toLowerCase().replace(/\s+/g, " ");

function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** The same day of the month, moved back when the month is shorter (31st -> 30th). */
export function dayIn(month: string, day: number) {
  return `${month}-${String(Math.min(Math.max(1, day), lastDay(month))).padStart(2, "0")}`;
}

function series(txs: Transaction[]) {
  const m = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.kind !== "expense" || t.title === FOOD) continue;
    const k = fixedKey(t.title);
    m.set(k, [...(m.get(k) ?? []), t]);
  }
  for (const [k, rows] of m) {
    if (!rows.some((r) => r.recurring)) m.delete(k);
    else rows.sort((a, b) => a.date.localeCompare(b.date) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  }
  return m;
}

export function fixedFor(txs: Transaction[], month: string): FixedItem[] {
  const out: FixedItem[] = [];
  for (const [key, rows] of series(txs)) {
    const inMonth = rows.filter((r) => r.date.startsWith(month));
    const before = rows.filter((r) => r.date < `${month}-01`);
    const prev = before[before.length - 1];
    const real = inMonth.find((r) => r.recurring) ?? (prev?.recurring ? inMonth[0] : undefined) ?? null;
    if (real) {
      out.push({ key, title: real.title, amount: real.amount, category: real.category, date: real.date, real, source: real, rows });
    } else if (prev?.recurring) {
      out.push({ key, title: prev.title, amount: prev.amount, category: prev.category, date: dayIn(month, Number(prev.date.slice(8))), real: null, source: prev, rows });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Fixed expenses counted this month that have no row of their own. */
export const virtualFixed = (txs: Transaction[], month: string) => fixedFor(txs, month).filter((f) => !f.real);
