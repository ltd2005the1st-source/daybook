"use client";
import { useEffect, useRef } from "react";

/**
 * A cursor that trails the pointer: it starts moving the instant the mouse or finger does and settles on the
 * target about a quarter of a second later (exponential ease-out, so it decelerates into place).
 * Desktop: the native arrow is hidden while this is showing, so there is never a double image. Over text
 * fields and during calendar drags the native cursor takes over. Touch: a soft dot follows the finger.
 * Over a button or link the dot dissolves into four corner brackets that snap to that element's corners
 * (like motion.dev's magnetic cursor) and follow it if it moves.
 * Off entirely for reduced motion (the native cursor stays).
 */
const TAU = 0.07; // seconds; 1 - e^(-0.25 / 0.07) ≈ 97% of the way after 250 ms
const TEXT = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]), textarea, [contenteditable=""], [contenteditable="true"]';
const CLICKABLE = 'a, button, [role="button"], [role="tab"], [role="menuitem"], summary, select, label, input[type=checkbox], input[type=radio], input[type=range], [data-clickable], .row';

export function SmoothCursor() {
  const el = useRef<HTMLDivElement>(null);
  const corners = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(hover: hover) and (pointer: fine)");
    const root = document.documentElement;
    const target = { x: 0, y: 0 };
    const pos = { x: 0, y: 0 };
    let shown = false;
    let raf = 0;
    let last = 0;
    let locked: Element | null = null;
    let touching = false;
    let lastTouch = 0;

    const sync = () => {
      const c = node.nextElementSibling as HTMLElement | null;
      if (c) c.dataset.on = shown && locked ? "1" : "0";
    };
    const setShown = (on: boolean) => {
      if (on === shown) return;
      shown = on;
      node.dataset.show = on ? "1" : "0";
      sync();
    };
    const draw = () => {
      node.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    };
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
      last = t;
      const k = 1 - Math.exp(-dt / TAU);
      pos.x += (target.x - pos.x) * k;
      pos.y += (target.y - pos.y) * k;
      draw();
      placeCorners();
      if (!locked && Math.abs(target.x - pos.x) < 0.1 && Math.abs(target.y - pos.y) < 0.1) {
        pos.x = target.x;
        pos.y = target.y;
        draw();
        placeCorners();
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    // Corner brackets: at the locked element's corners, or tucked into the dot when nothing is locked.
    const PAD = 5;
    const placeCorners = () => {
      const cs = corners.current;
      let l = pos.x - 4, t = pos.y - 4, r = pos.x + 4, b = pos.y + 4;
      if (locked) {
        const rc = locked.getBoundingClientRect();
        l = rc.left - PAD; t = rc.top - PAD; r = rc.right + PAD; b = rc.bottom + PAD;
      }
      const S = 9;
      const at = [[l, t], [r - S, t], [l, b - S], [r - S, b - S]];
      for (let i = 0; i < 4; i++) {
        const c = cs[i];
        if (c) c.style.transform = `translate3d(${at[i][0]}px, ${at[i][1]}px, 0)`;
      }
    };
    const lock = (to: Element | null) => {
      if (to === locked) return;
      locked = to;
      node.dataset.lock = to ? "1" : "0";
      sync();
      go();
    };
    const go = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    const aim = (x: number, y: number, jump: boolean) => {
      target.x = x;
      target.y = y;
      if (jump) {
        pos.x = x;
        pos.y = y;
        draw();
      }
      go();
    };
    const active = () => !reduce.matches;

    const onMouse = (e: MouseEvent) => {
      if (!active() || !fine.matches || Date.now() - lastTouch < 800) return;
      const t = e.target instanceof Element ? e.target : null;
      const text = !!t?.closest(TEXT);
      const dragging = document.body.classList.contains("cal-dragging");
      root.classList.toggle("cursor-on", !text && !dragging);
      const hit = !text && !dragging ? t?.closest(CLICKABLE) ?? null : null;
      let magnet: Element | null = null;
      if (hit) {
        const rc = hit.getBoundingClientRect();
        const wide = hit.classList.contains("row") ? 1400 : 560;
        if (rc.width <= wide && rc.height <= 140 && rc.width >= 12 && rc.height >= 12) magnet = hit;
      }
      lock(magnet);
      node.dataset.hot = hit && !magnet ? "1" : "0";
      if (text || dragging) {
        setShown(false);
        return;
      }
      aim(e.clientX, e.clientY, !shown);
      setShown(true);
    };
    const onLeave = () => {
      lock(null);
      setShown(false);
      root.classList.remove("cursor-on");
    };
    const onDown = () => (node.dataset.down = "1");
    const onUp = () => (node.dataset.down = "0");

    const onTouch = (e: TouchEvent) => {
      if (!active()) return;
      const p = e.touches[0];
      if (!p) return;
      lastTouch = Date.now();
      lock(null);
      aim(p.clientX, p.clientY, e.type === "touchstart");
      if (e.type === "touchstart") {
        touching = true;
        node.dataset.touch = "1";
        setShown(true);
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      lastTouch = Date.now();
      if (e.touches.length) return;
      touching = false;
      // let it finish gliding to the last position, then fade
      setTimeout(() => {
        if (!touching) setShown(false);
      }, 120);
    };

    const off = () => {
      onLeave();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onReduce = () => reduce.matches && off();

    addEventListener("mousemove", onMouse, { passive: true });
    addEventListener("mousedown", onDown, { passive: true });
    addEventListener("mouseup", onUp, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    addEventListener("blur", onLeave);
    addEventListener("touchstart", onTouch, { passive: true });
    addEventListener("touchmove", onTouch, { passive: true });
    addEventListener("touchend", onTouchEnd, { passive: true });
    addEventListener("touchcancel", onTouchEnd, { passive: true });
    reduce.addEventListener("change", onReduce);
    return () => {
      off();
      removeEventListener("mousemove", onMouse);
      removeEventListener("mousedown", onDown);
      removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseleave", onLeave);
      removeEventListener("blur", onLeave);
      removeEventListener("touchstart", onTouch);
      removeEventListener("touchmove", onTouch);
      removeEventListener("touchend", onTouchEnd);
      removeEventListener("touchcancel", onTouchEnd);
      reduce.removeEventListener("change", onReduce);
    };
  }, []);

  return (
    <>
      <div ref={el} className="smooth-cursor" data-show="0" aria-hidden>
        <span />
      </div>
      <div className="smooth-corners" data-on="0" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} ref={(n) => { corners.current[i] = n; }} className={`sc-c sc-c${i}`} />
        ))}
      </div>
    </>
  );
}
