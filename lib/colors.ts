/** Google Calendar's event colours, so the palette feels familiar. */
export const EVENT_COLORS: { name: string; hex: string }[] = [
  { name: "Tomato", hex: "#D50000" },
  { name: "Flamingo", hex: "#E67C73" },
  { name: "Tangerine", hex: "#F4511E" },
  { name: "Banana", hex: "#F6BF26" },
  { name: "Sage", hex: "#33B679" },
  { name: "Basil", hex: "#0B8043" },
  { name: "Peacock", hex: "#039BE5" },
  { name: "Blueberry", hex: "#3F51B5" },
  { name: "Lavender", hex: "#7986CB" },
  { name: "Grape", hex: "#8E24AA" },
  { name: "Graphite", hex: "#616161" },
];

/** White text on dark colours, dark text on light ones (Banana, for example). */
export function textOn(hex: string): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return "white";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.45 ? "#1f1f1f" : "white";
}
