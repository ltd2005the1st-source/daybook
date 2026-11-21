"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TodaySection from "./sections/today";
import CalendarSection from "./sections/calendar";
import TasksSection from "./sections/tasks";
import TeachingSection from "./sections/teaching";
import MoneySection from "./sections/money";
import HabitsSection from "./sections/habits";
import MusicSection from "./sections/music";
import { InDashboard } from "./ui";
import { NAV, sectionOf } from "./nav";
import { jumping, onPageScroll, pageScroller, scrollToSection, setActiveSection, viewTop } from "./scroll-spy";

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
              {i < count ? <Part /> : <div className="min-h-[70vh]" />}
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
