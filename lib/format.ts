export function vnd(n: number, opts: { sign?: boolean; compact?: boolean } = {}): string {
  const abs = Math.abs(Math.round(n));
  let body: string;
  if (opts.compact && abs >= 1_000_000) {
    body = `${(abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}M`;
  } else if (opts.compact && abs >= 1_000) {
    body = `${Math.round(abs / 1_000)}k`;
  } else {
    body = abs.toLocaleString("en-US");
  }
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}${body}₫`;
}

/** Accepts "200k", "1.5m", "1,200,000", "350" (treated as thousands when < 1000). */
export function parseAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[,\s₫đ]/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m|tr|triệu)?$/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  const unit = m[2];
  if (unit === "k") v *= 1_000;
  else if (unit === "m" || unit === "tr" || unit === "triệu") v *= 1_000_000;
  else if (v < 1000) v *= 1_000;
  return Math.round(v);
}

export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
