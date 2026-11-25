"use client";
import { useLayoutEffect, useEffect, useRef, useState, type RefObject } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { SPEED, sec } from "@/lib/motion";

/*
 * Opening and scroll animations.
 *
 * - useRevealScan() (called by the dashboard) marks the titles, labels, cards, rows, icons and rules
 *   inside every section as "out" and lets them fall into place (fade + slide, eased out) as they
 *   scroll into view. On opening, everything in the first screen arrives in a quick stagger.
 *   Only `opacity`, `translate` and `scale` are animated (compositor friendly, and they stack with
 *   the `transform` other components already use). CSS lives under "Reveal" in globals.css.
 * - useSeen() tells a component when it has come into view, so bars, charts and numbers can wait
 *   for that moment before they grow or count up.
 * Everything is off under prefers-reduced-motion.
 */

/** Strong ease-out: quick off the mark, long soft landing. */
export const OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const motionOK = (): boolean =>
  typeof window !== "undefined" && "IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches;

/** False until the element has scrolled into view (then true for good). True from the start without motion. */
export function useSeen<T extends Element>(ref: RefObject<T | null>): boolean {
  const [seen, setSeen] = useState(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !motionOK()) return;
    setSeen(false);
    const io = new IntersectionObserver(
      (es) => {
        // Already scrolled past (a jump straight to a lower section) counts as seen too.
        if (es.some((e) => e.isIntersecting || e.boundingClientRect.top < 0)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return seen;
}

/** A bar that grows to `to` (a CSS length such as "62%") once it is on screen. */
export function Grow({
  prop = "width",
  to,
  delay = 0,
  ...rest
}: { prop?: "width" | "height"; to: string; delay?: number } & Omit<HTMLMotionProps<"div">, "initial" | "animate">) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useSeen(ref);
  return (
    <motion.div
      ref={ref}
      {...rest}
      initial={{ [prop]: 0 }}
      animate={{ [prop]: seen ? to : 0 }}
      transition={{ duration: sec(1.5), ease: OUT_EXPO, delay: sec(delay) }}
    />
  );
}

/** A whole number that counts up from zero the first time it is on screen, and follows changes after that. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useSeen(ref);
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useLayoutEffect(() => {
    if (!seen) {
      from.current = 0;
      setShown(0);
    }
  }, [seen]);
  useEffect(() => {
    if (!seen) return;
    const start = from.current;
    if (start === value || !motionOK()) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const dur = 1500 / SPEED;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p); // expo ease-out
      const v = Math.round(start + (value - start) * e);
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, value]);
  return (
    <span ref={ref} className={className}>
      {shown}
    </span>
  );
}

const SELECTOR = "h1, h2, .label, .card, li, .row, svg.lucide, .rv-line, .cal-lift, [data-reveal]";
const SKIP = "[role=dialog], .fixed, [data-scroll-contain], [data-rv-skip], [class*='sticky']";
/** New content keeps animating in for this long after its section first came on screen. */
const WINDOW = 2500;

function kindOf(el: Element): string {
  const k = el.getAttribute("data-reveal");
  if (k) return k;
  if (el.matches("h1, h2")) return "title";
  if (el.matches("svg")) return "icon";
  if (el.matches(".rv-line")) return "line";
  if (el.matches("li, .row")) return "row";
  if (el.matches(".label")) return "fade";
  if (el.matches(".cal-lift")) return "drop";
  return "up";
}

/**
 * Marks content inside the dashboard's sections and reveals it as it scrolls into view. Elements
 * that arrive together are staggered in reading order. Call once, from the dashboard.
 */
export function useRevealScan() {
  useLayoutEffect(() => {
    const board = document.querySelector("[data-dashboard]");
    if (!board || !motionOK()) return;
    const html = document.documentElement;
    html.classList.add("rv-on");
    const opened = new Map<Element, number>();
    const timers = new Set<number>();

    const reveal = (el: HTMLElement, delay: number, instant = false) => {
      if (el.dataset.rv !== "out") return;
      if (instant) {
        el.dataset.rv = "done";
        return;
      }
      el.style.setProperty("--rv-d", String(delay));
      el.dataset.rv = "in";
      const t = window.setTimeout(() => {
        timers.delete(t);
        if (el.dataset.rv === "in") {
          el.dataset.rv = "done";
          el.style.removeProperty("--rv-d");
        }
      }, (delay + 1300) / SPEED);
      timers.add(t);
    };

    const io = new IntersectionObserver(
      (entries) => {
        const inView = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => Math.round(a.boundingClientRect.top / 8) - Math.round(b.boundingClientRect.top / 8) || a.boundingClientRect.left - b.boundingClientRect.left);
        inView.forEach((e, i) => {
          reveal(e.target as HTMLElement, Math.min(i, 10) * 38);
          io.unobserve(e.target);
        });
        for (const e of entries) {
          // Scrolled past before it was ever seen (a jump straight down the page): just show it.
          if (!e.isIntersecting && e.boundingClientRect.top < 0) {
            reveal(e.target as HTMLElement, 0, true);
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -40px 0px" },
    );

    const allowed = (el: Element): boolean => {
      if (el.hasAttribute("data-rv") || el.closest(SKIP)) return false;
      const sec = el.closest("section[id]");
      if (!sec) return false;
      const o = opened.get(sec);
      if (o !== undefined && performance.now() - o > WINDOW) return false;
      return getComputedStyle(el).display !== "contents";
    };
    const tag = (root: Element) => {
      const list: Element[] = root.matches(SELECTOR) ? [root] : [];
      root.querySelectorAll(SELECTOR).forEach((n) => list.push(n));
      for (const el of list) {
        if (!allowed(el)) continue;
        (el as HTMLElement).dataset.rv = "out";
        (el as HTMLElement).dataset.rvk = kindOf(el);
        io.observe(el);
      }
    };

    // A section counts as opened the first time any of it is on screen.
    const secIo = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting && !opened.has(e.target)) opened.set(e.target, performance.now());
    });
    board.querySelectorAll(":scope > section").forEach((s) => secIo.observe(s));

    tag(board);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => n instanceof Element && tag(n));
    });
    mo.observe(board, { childList: true, subtree: true });

    // Safety net: anything on screen that the observer somehow missed is shown after a moment.
    const sweep = window.setInterval(() => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      board.querySelectorAll<HTMLElement>('[data-rv="out"]').forEach((el, i) => {
        if (i > 400) return;
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < vh - 40 && r.right > 0 && r.left < vw) reveal(el, 0);
      });
    }, 2000);

    return () => {
      io.disconnect();
      secIo.disconnect();
      mo.disconnect();
      clearInterval(sweep);
      timers.forEach((t) => clearTimeout(t));
      html.classList.remove("rv-on");
    };
  }, []);
}
