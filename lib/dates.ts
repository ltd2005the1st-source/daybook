// Date helpers that work on local wall-clock strings. The app is built around
// Vietnam time (UTC+7, no daylight saving), so server code uses vnNow().

export const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function today(): string {
  return toISODate(new Date());
}

export function weekday(s: string): number {
  return parseDate(s).getDay();
}

export function monthOf(s: string): string {
  return s.slice(0, 7);
}

export function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${pad(i + 1)}`);
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function startOfWeek(s: string): string {
  // Weeks start on Monday, like your calendar.
  const wd = weekday(s);
  return addDays(s, wd === 0 ? -6 : 1 - wd);
}

export function minutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(n: number): string {
  const v = ((n % 1440) + 1440) % 1440;
  return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;
}

export const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function fmtDay(s: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const d = parseDate(s);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  const wd = opts.weekday ? `${WD_SHORT[d.getDay()]}, ` : "";
  return wd + base + (opts.year ? ` ${d.getFullYear()}` : "");
}

export function fmtMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Current wall-clock time in Vietnam, regardless of server time zone. */
export function vnNow(): { date: string; time: string; minutes: number } {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const date = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return { date, time: fromMinutes(mins), minutes: mins };
}

export function relDay(s: string, ref = today()): string {
  if (s === ref) return "Today";
  if (s === addDays(ref, 1)) return "Tomorrow";
  if (s === addDays(ref, -1)) return "Yesterday";
  return fmtDay(s, { weekday: true });
}
