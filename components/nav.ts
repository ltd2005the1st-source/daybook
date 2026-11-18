import { CalendarDays, CheckSquare, GraduationCap, HeartPulse, Music2, SunMedium, Wallet } from "lucide-react";

/*
 * The dashboard is one long page. Each menu item is a section on it: `id` is the section's
 * element id and its #hash; `path` is the old page address, which still works and lands on the
 * section. `href` is what links point at.
 */
export const NAV = [
  { id: "today", path: "/", href: "/", label: "Today", icon: SunMedium },
  { id: "calendar", path: "/calendar", href: "/#calendar", label: "Calendar", icon: CalendarDays },
  { id: "tasks", path: "/tasks", href: "/#tasks", label: "Tasks", icon: CheckSquare },
  { id: "teaching", path: "/teaching", href: "/#teaching", label: "Teaching", icon: GraduationCap },
  { id: "money", path: "/money", href: "/#money", label: "Money", icon: Wallet },
  { id: "habits", path: "/habits", href: "/#habits", label: "Habits", icon: HeartPulse },
  { id: "music", path: "/music", href: "/#music", label: "Music", icon: Music2 },
];

export type SectionId = (typeof NAV)[number]["id"];

/** Which section a link points at ("/calendar", "/#calendar", "#calendar", "/"), or null for other pages. */
export function sectionOf(href: string | null | undefined): string | null {
  if (href == null) return null;
  const h = href.trim();
  const hash = h.match(/^\/?#([\w-]+)$/);
  if (hash) return NAV.some((n) => n.id === hash[1]) ? hash[1] : null;
  if (h === "/" || h === "") return "today";
  return NAV.find((n) => n.path === h)?.id ?? null;
}

/** True for addresses that show the dashboard (the home page, or an old section page). */
export function isDashboardPath(path: string): boolean {
  return NAV.some((n) => n.path === path);
}
