"use client";
import { useEffect } from "react";

/*
 * Smooth mouse-wheel scrolling, tuned to feel like populous.com.
 *
 * That site eases the wheel with a simple "chase": every frame the page covers a fixed share of
 * the distance still left to go, so it jumps off the mark straight away (no lag at the start) and
 * then glides to a soft stop in roughly half a second. Each wheel notch moves the
 * same distance the browser would (no extra multiplier); notches that land mid-glide just push
 * the destination further, so fast spinning builds up speed naturally.
 * Trackpads and touch already glide natively, so they're left alone, as are pinch-zoom,
 * sideways scrolling and reduced motion. Works on the page and on any scrolling panel under the
 * pointer (calendar, sheets, palette).
 */

// Pace of the glide: 0.1 settled in about three quarters of a second; 0.15 is 50% faster, so about
// half a second. Still starts moving on the very first frame. Applied by elapsed time, so it feels
// the same on 60Hz and 120Hz screens.
const LERP = 0.15;

function isWheelNotch(e: WheelEvent): boolean {
  if (e.deltaMode !== 0) return true; // lines or pages: always a real wheel
  // Mouse wheels send big whole-number steps with no sideways part; trackpads send small fractional ones.
  return Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY) && e.deltaX === 0;
}

function canScroll(el: Element, dir: number): boolean {
  const root = el === document.scrollingElement;
  if (!root) {
    const oy = getComputedStyle(el).overflowY;
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return false;
  } else if (getComputedStyle(document.documentElement).overflowY === "hidden" || getComputedStyle(document.body).overflowY === "hidden") {
    return false;
  }
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  return dir > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0;
}

function scrollerFor(target: EventTarget | null, dir: number): Element | null {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    if (canScroll(el, dir)) return el;
    el = el.parentElement;
  }
  const root = document.scrollingElement;
  return root && canScroll(root, dir) ? root : null;
}

export function useSmoothWheel() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let el: Element | null = null;
    let pos = 0, to = 0, last = 0, lastPos = 0, raf = 0;

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      el = null;
    };

    const frame = (now: number) => {
      if (!el) return;
      // Someone else moved it (scrollbar drag, keyboard, a jump): let go.
      if (Math.abs(el.scrollTop - lastPos) > 2) return stop();
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      pos += (to - pos) * (1 - Math.exp(-60 * LERP * dt));
      const done = Math.abs(to - pos) < 0.5;
      if (done) pos = to;
      el.scrollTo({ top: pos, behavior: "instant" });
      lastPos = el.scrollTop;
      if (done) stop();
      else raf = requestAnimationFrame(frame);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || !isWheelNotch(e)) return;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      const target = scrollerFor(e.target, Math.sign(delta));
      if (!target) return;
      e.preventDefault();

      const max = target.scrollHeight - target.clientHeight;
      if (el !== target || !raf) {
        cancelAnimationFrame(raf);
        el = target;
        pos = to = target.scrollTop;
        // Count the first frame as a full frame, so the very next paint already moves.
        last = performance.now() - 1000 / 60;
      }
      // Mid-glide notches add onto where we're heading, not where we are.
      to = Math.max(0, Math.min(max, to + delta));
      lastPos = target.scrollTop;
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const cancel = () => el && stop();
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("touchstart", cancel, { passive: true, capture: true });
    window.addEventListener("keydown", cancel, true);
    return () => {
      stop();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("touchstart", cancel, true);
      window.removeEventListener("keydown", cancel, true);
    };
  }, []);
}
