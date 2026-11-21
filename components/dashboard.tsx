"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TodaySection from "./sections/today";
import CalendarSection from "./sections/calendar";
import TasksSection from "./sections/tasks";
import TeachingSection from "./sections/teaching";
import MoneySection from "./sections/money";
import HabitsSection from "./sections/habits";
import MusicSection from "./sections/music";
import { InDashboard } from "./ui";
import { DataGate } from "./data";
import { NAV, sectionOf } from "./nav";
import { jumping, onPageScroll, pageScroller, scrollToSection, setActiveSection, setPagedGo, viewTop } from "./scroll-spy";
import { native } from "@/lib/native";

const PARTS: Record<string, React.ComponentType> = {
  today: TodaySection,
  calendar: CalendarSection,
  tasks: TasksSection,
  teaching: TeachingSection,
  money: MoneySection,
  habits: HabitsSection,
  music: MusicSection,
};

const idle = (fn: () => void): (() => void) => {
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (n: number) => void };
  if (w.requestIdleCallback) {
    const n = w.requestIdleCallback(fn, { timeout: 120 });
    return () => w.cancelIdleCallback?.(n);
  }
  const n = window.setTimeout(fn, 16);
  return () => clearTimeout(n);
};

/** The section a #hash in the address points at, if any. */
function hashSection(): string | null {
  return sectionOf(location.hash) ?? null;
}

/**
 * Every part of Daybook on one long page, from Today down to Music. The menu follows whichever
 * section is on screen, and picking one in the menu glides to it.
 */
export function Dashboard() {
  // The Android app shows one page at a time; the website keeps the long scrolling page.
  const [paged, setPaged] = useState(false);
  useLayoutEffect(() => setPaged(!!native()), []);
  if (paged) return <PagedDashboard />;
  return <ScrollDashboard />;
}

function ScrollDashboard() {
  // Sections come in one at a time after the first paint, so opening the app stays quick.
  // Everything down to the section you asked for is there straight away.
  const [shown, setShown] = useState(1);
  const [target, setTarget] = useState<string | null>(null);
  const targetIdx = target ? NAV.findIndex((n) => n.id === target) : 0;
  // Read the address once the new page is committed (a link from Settings updates it then).
  useLayoutEffect(() => {
    const t = hashSection();
    if (t && t !== NAV[0].id) setTarget(t);
    // Typing a #section into the address bar, or a link elsewhere changing it, glides there.
    const onHash = () => {
      const id = hashSection();
      if (id) scrollToSection(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const count = Math.max(shown, targetIdx + 1);

  useEffect(() => {
    if (count >= NAV.length) return;
    return idle(() => setShown(count + 1));
  }, [count]);

  // Land on the section the address asked for, once it's on the page.
  useLayoutEffect(() => {
    if (!target || targetIdx < 1) return;
    scrollToSection(target, { instant: true });
    // Fonts and the first data can nudge things for a moment; settle once more on the next frame.
    const r = requestAnimationFrame(() => scrollToSection(target, { instant: true }));
    return () => cancelAnimationFrame(r);
  }, [target, targetIdx]);

  // The menu highlight follows the section on screen, and the address follows it too.
  useEffect(() => {
    let raf = 0;
    let hash = location.hash.replace(/^#/, "");
    const spy = () => {
      raf = 0;
      if (jumping) return;
      const sc = pageScroller();
      const top = viewTop(sc);
      const bottom = sc === document.scrollingElement ? window.innerHeight : sc.getBoundingClientRect().bottom;
      const line = top + (bottom - top) * 0.35;
      const atEnd = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
      let id = NAV[0].id;
      for (const n of NAV) {
        const el = document.getElementById(n.id);
        if (el && el.getBoundingClientRect().top <= line) id = n.id;
      }
      // At the very top it is always Today, even while Today is still short and loading.
      if (sc.scrollTop < 4) id = NAV[0].id;
      else if (atEnd) {
        const last = [...NAV].reverse().find((n) => document.getElementById(n.id));
        if (last) id = last.id;
      }
      setActiveSection(id);
      const want = id === NAV[0].id ? "" : id;
      if (want !== hash) {
        hash = want;
        history.replaceState(history.state, "", want ? `#${want}` : location.pathname + location.search);
      }
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(spy);
    };
    spy();
    // Sections grow as their data arrives without any scroll, so measure again when the page resizes.
    const ro = new ResizeObserver(on);
    ro.observe(document.body);
    const board = document.querySelector("[data-dashboard]");
    if (board) ro.observe(board);
    const offScroll = onPageScroll(on);
    window.addEventListener("resize", on);
    window.addEventListener("daybook:jumped", on);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      offScroll();
      window.removeEventListener("resize", on);
      window.removeEventListener("daybook:jumped", on);
    };
  }, []);

  // Any link to a section (menu, "All tasks →", the logo) glides there instead of loading a page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || a.getAttribute("target")) return;
      const id = sectionOf(a.getAttribute("href"));
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      (a as HTMLElement).blur();
      scrollToSection(id);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Leaving for Settings or a receipt: the next visit starts with Today lit until it measures.
  useEffect(() => () => setActiveSection(NAV[0].id), []);

  return (
    <InDashboard.Provider value={true}>
      <div data-dashboard className="overflow-x-clip">
        {NAV.map((n, i) => {
          const Part = PARTS[n.id];
          return (
            <section key={n.id} id={n.id} aria-label={n.label} className="dash-section">
              {i < count ? (
                <DataGate>
                  <Part />
                </DataGate>
              ) : (
                <div className="min-h-[70vh]" />
              )}
            </section>
          );
        })}
      </div>
    </InDashboard.Provider>
  );
}

/** An old page address (like /calendar): opens the dashboard at that section. */
export function OldAddress({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/#${to}`);
  }, [router, to]);
  return null;
}


/**
 * The Android app: each section is its own page. Pick one from the tab bar or swipe sideways.
 * Pages you have opened stay mounted (hidden) so they keep their state, and each remembers its
 * own scroll position.
 */
function PagedDashboard() {
  const [cur, setCur] = useState<string>(() => hashSection() ?? NAV[0].id);
  const [seen, setSeen] = useState<string[]>(() => [hashSection() ?? NAV[0].id]);
  const [dir, setDir] = useState(0);
  const curRef = useRef(cur);
  const scrolls = useRef<Record<string, number>>({});

  const go = useCallback((id: string) => {
    if (!NAV.some((n) => n.id === id) || id === curRef.current) return;
    const from = NAV.findIndex((n) => n.id === curRef.current);
    const to = NAV.findIndex((n) => n.id === id);
    scrolls.current[curRef.current] = pageScroller().scrollTop;
    curRef.current = id;
    setDir(to > from ? 1 : -1);
    setSeen((s) => (s.includes(id) ? s : [...s, id]));
    setCur(id);
    setActiveSection(id);
    history.replaceState(history.state, "", id === NAV[0].id ? location.pathname + location.search : `#${id}`);
  }, []);

  // Each page opens where you left it (the top the first time).
  useLayoutEffect(() => {
    pageScroller().scrollTo({ top: scrolls.current[cur] ?? 0, behavior: "instant" });
  }, [cur]);

  useEffect(() => {
    setActiveSection(cur);
    setPagedGo(go);
    const onHash = () => {
      const id = hashSection();
      if (id) go(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      setPagedGo(null);
      window.removeEventListener("hashchange", onHash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);

  // Any link to a section (tab bar, "All tasks →", the logo) switches page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || a.getAttribute("target")) return;
      const id = sectionOf(a.getAttribute("href"));
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      (a as HTMLElement).blur();
      go(id);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [go]);

  // Swipe left or right for the next or previous page.
  useEffect(() => {
    let x0 = 0, y0 = 0, t0 = 0, ok = false;
    const blocked = (t: EventTarget | null) => {
      for (let el = t instanceof Element ? t : null; el && el !== document.body; el = el.parentElement) {
        if (el.matches("input, textarea, select, [contenteditable], [data-scroll-contain], .fixed.inset-0, [role=dialog]")) return true;
        if (el.scrollWidth > el.clientWidth + 1) {
          const ox = getComputedStyle(el).overflowX;
          if (ox === "auto" || ox === "scroll") return true;
        }
      }
      return false;
    };
    const start = (e: TouchEvent) => {
      ok = e.touches.length === 1 && !blocked(e.target);
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = performance.now();
    };
    const end = (e: TouchEvent) => {
      if (!ok) return;
      ok = false;
      if (document.body.classList.contains("cal-dragging")) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8 || performance.now() - t0 > 700) return;
      const i = NAV.findIndex((n) => n.id === curRef.current);
      const next = NAV[i + (dx < 0 ? 1 : -1)];
      if (next) go(next.id);
    };
    const cancel = () => (ok = false);
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel);
    };
  }, [go]);

  // Leaving for Settings or a receipt: the next visit starts with Today lit until it measures.
  useEffect(() => () => setActiveSection(NAV[0].id), []);

  return (
    <InDashboard.Provider value={true}>
      <div data-dashboard data-paged className="overflow-x-clip">
        {NAV.map((n) => {
          const Part = PARTS[n.id];
          const here = n.id === cur;
          return (
            <section
              key={n.id}
              id={n.id}
              aria-label={n.label}
              hidden={!here}
              className={here && dir ? (dir > 0 ? "page-in-next" : "page-in-prev") : undefined}
            >
              {seen.includes(n.id) && (
                <DataGate>
                  <Part />
                </DataGate>
              )}
            </section>
          );
        })}
      </div>
    </InDashboard.Provider>
  );
}
