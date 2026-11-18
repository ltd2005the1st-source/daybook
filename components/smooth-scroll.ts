"use client";
import { useEffect } from "react";

/*
 * Eased mouse-wheel scrolling.
 *
 * A mouse wheel moves in hard notches, so each notch is turned into a very short, light ease-in-out
 * glide (about a tenth of a second) that begins moving on the first frame. A notch that lands mid-glide carries the current speed into the new glide (no
 * stop-and-start), then eases out at the new resting point. Trackpads and touch already glide
 * natively, so they're left alone, as are pinch-zoom, sideways scrolling and reduced motion.
 * Works on the page and on any scrolling panel under the pointer (calendar, sheets, palette).
 */

const DURATION = 170; // ms per notch: short enough to feel instant, long enough to take the edge off

// A light ease-in-out. Unlike the app's usual curve it starts already moving (the first frame
// after a wheel tick travels), so scrolling never feels delayed; it only softens the stop.
function ease(x: number): number {
  const x1 = 0.2, y1 = 0.12, x2 = 0.2, y2 = 1;
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 20; i++) {
    const v = bx(t);
    if (Math.abs(v - x) < 1e-4) break;
    if (v < x) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  return by(t);
}

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
    let from = 0, to = 0, v0 = 0, start = 0, lastPos = 0, raf = 0;

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      el = null;
    };

    const frame = (now: number) => {
      if (!el) return;
      // Someone else moved it (scrollbar drag, keyboard, a jump): let go.
      if (Math.abs(el.scrollTop - lastPos) > 2) return stop();
      const t = Math.min(1, (now - start) / DURATION);
      let pos: number;
      if (v0 === 0) {
        pos = from + (to - from) * ease(t);
      } else {
        // Hermite glide: starts at the speed it already had, settles at rest on the target.
        const T = DURATION / 1000;
        const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2;
        pos = h00 * from + h10 * T * v0 + h01 * to;
      }
      el.scrollTo({ top: pos, behavior: "instant" });
      lastPos = el.scrollTop;
      if (t < 1) raf = requestAnimationFrame(frame);
      else stop();
    };

    const onWheel = (e: WheelEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || !isWheelNotch(e)) return;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      const target = scrollerFor(e.target, Math.sign(delta));
      if (!target) return;
      e.preventDefault();

      const now = performance.now();
      const max = target.scrollHeight - target.clientHeight;
      if (el === target && raf) {
        // Mid-glide: keep the speed we're travelling at and extend the destination.
        const T = DURATION / 1000;
        const t = Math.min(1, (now - start) / DURATION);
        const dh00 = 6 * t * t - 6 * t, dh10 = 3 * t * t - 4 * t + 1, dh01 = -6 * t * t + 6 * t;
        const speed = v0 === 0
          ? ((to - from) * (ease(Math.min(1, t + 0.01)) - ease(t))) / (0.01 * T)
          : (dh00 * from + dh10 * T * v0 + dh01 * to) / T;
        from = target.scrollTop;
        to = Math.max(0, Math.min(max, to + delta));
        v0 = Number.isFinite(speed) ? speed : 0;
      } else {
        cancelAnimationFrame(raf);
        el = target;
        from = target.scrollTop;
        to = Math.max(0, Math.min(max, from + delta));
        v0 = 0;
      }
      start = now;
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
