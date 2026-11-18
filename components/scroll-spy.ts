"use client";
import { useSyncExternalStore } from "react";
import { NAV } from "./nav";
import { ms } from "@/lib/motion";

/*
 * Which dashboard section is on screen, shared by the sidebar, the phone tab bar and the
 * dashboard itself, plus the smooth jump used when you pick a section from the menu.
 */

let active: string = NAV[0].id;
const listeners = new Set<() => void>();

export function setActiveSection(id: string) {
  if (id === active) return;
  active = id;
  listeners.forEach((l) => l());
}

export function useActiveSection(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => active,
    () => NAV[0].id,
  );
}

/** Height of the phone's top bar (0 on desktop), so a section lands just below it. */
export function topbarHeight(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar"));
  const bar = document.querySelector<HTMLElement>("header.material");
  return bar && getComputedStyle(bar).display !== "none" && Number.isFinite(v) ? v : 0;
}

/** Where the page has to be scrolled to for a section to sit at the top. */
export function sectionTop(id: string): number {
  const el = document.getElementById(id);
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (!el || id === NAV[0].id) return 0;
  return Math.max(0, Math.min(max, window.scrollY + el.getBoundingClientRect().top - topbarHeight()));
}

// The app's one curve, cubic-bezier(0.65, 0, 0.35, 1), solved for y at time x.
function ease(x: number): number {
  const [x1, y1, x2, y2] = [0.65, 0, 0.35, 1];
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 24; i++) {
    t = (lo + hi) / 2;
    if (bx(t) < x) lo = t;
    else hi = t;
  }
  return by(t);
}

/** While a menu jump is gliding, the highlight stays on where you're going instead of flickering past. */
export let jumping: string | null = null;
let raf = 0;
let stopJump: (() => void) | null = null;

export function scrollToSection(id: string, opts: { instant?: boolean } = {}) {
  stopJump?.();
  setActiveSection(id);
  const from = window.scrollY;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (opts.instant || reduced || Math.abs(sectionTop(id) - from) < 2) {
    window.scrollTo({ top: sectionTop(id), behavior: "instant" });
    return;
  }
  // Longer trips take a little longer, but never drag: 0.45s to 0.8s at 1x, through the speed dial.
  const dist = Math.abs(sectionTop(id) - from);
  const dur = ms(Math.min(800, 450 + dist * 0.05));
  const start = performance.now();
  jumping = id;
  const end = () => {
    cancelAnimationFrame(raf);
    jumping = null;
    stopJump = null;
    window.removeEventListener("wheel", end);
    window.removeEventListener("touchstart", end);
    window.removeEventListener("keydown", end);
    window.dispatchEvent(new Event("daybook:jumped"));
  };
  stopJump = end;
  // Any wheel, touch or key from you takes over straight away.
  window.addEventListener("wheel", end, { passive: true });
  window.addEventListener("touchstart", end, { passive: true });
  window.addEventListener("keydown", end);
  const frame = (now: number) => {
    const p = Math.min(1, (now - start) / dur);
    // Re-measure every frame, in case something above the section is still settling in.
    const to = sectionTop(id);
    window.scrollTo({ top: from + (to - from) * ease(p), behavior: "instant" });
    if (p < 1) raf = requestAnimationFrame(frame);
    else end();
  };
  raf = requestAnimationFrame(frame);
}
