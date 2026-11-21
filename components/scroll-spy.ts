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

/**
 * What scrolls the page. On desktop it is the content pane itself, so the glass frame around the
 * app (sidebar, pane edges, the wallpaper margin) stays put and only the pane's insides move.
 * On phones the window scrolls as before (address bar, pull to refresh).
 */
export function pageScroller(): HTMLElement {
  const main = document.querySelector<HTMLElement>("main[data-page-scroll]");
  if (main) {
    const oy = getComputedStyle(main).overflowY;
    if (oy === "auto" || oy === "scroll") return main;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Top of the visible part of the page, in window pixels: under the phone's top bar, or the pane's top edge. */
export function viewTop(sc: HTMLElement = pageScroller()): number {
  return sc === document.scrollingElement ? topbarHeight() : sc.getBoundingClientRect().top;
}

/** Calls back when the page scrolls, whichever of the two is doing the scrolling. */
export function onPageScroll(cb: () => void): () => void {
  const main = document.querySelector<HTMLElement>("main[data-page-scroll]");
  window.addEventListener("scroll", cb, { passive: true });
  main?.addEventListener("scroll", cb, { passive: true });
  return () => {
    window.removeEventListener("scroll", cb);
    main?.removeEventListener("scroll", cb);
  };
}

/** Where the page has to be scrolled to for a section to sit at the top. */
export function sectionTop(id: string): number {
  const el = document.getElementById(id);
  const sc = pageScroller();
  const max = sc.scrollHeight - sc.clientHeight;
  if (!el || id === NAV[0].id) return 0;
  return Math.max(0, Math.min(max, sc.scrollTop + el.getBoundingClientRect().top - viewTop(sc)));
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
  const sc = pageScroller();
  const from = sc.scrollTop;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (opts.instant || reduced || Math.abs(sectionTop(id) - from) < 2) {
    sc.scrollTo({ top: sectionTop(id), behavior: "instant" });
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
    sc.scrollTo({ top: from + (to - from) * ease(p), behavior: "instant" });
    if (p < 1) raf = requestAnimationFrame(frame);
    else end();
  };
  raf = requestAnimationFrame(frame);
}
