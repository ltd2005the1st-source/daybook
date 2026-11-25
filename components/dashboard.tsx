"use client";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
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
import { ms } from "@/lib/motion";
import { useRevealScan } from "./reveal";

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
  useRevealScan();
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
    // The Android app swaps this for the paged dashboard; don't rewrite its address meanwhile.
    if (native()) return;
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


/** One page's content. Memoised so switching pages doesn't re-render the ones that didn't change. */
const Page = memo(function Page({ id }: { id: string }) {
  const Part = PARTS[id];
  return (
    <DataGate>
      <Part />
    </DataGate>
  );
});

/**
 * The Android app: each section is its own page. Pick one from the tab bar or drag/swipe sideways.
 * Opened pages stay mounted (parked, invisible) so they keep their state and slide in without a
 * layout hitch. Each page is the same fixed box that scrolls inside itself, so boxes always line up. Pages slide on the compositor
 * (transform only) and ease out, so a drag is 1:1 with the finger and a release settles quickly.
 */
function PagedDashboard() {
  useRevealScan();
  const [cur, setCur] = useState<string>(() => hashSection() ?? NAV[0].id);
  const [seen, setSeen] = useState<string[]>(() => [hashSection() ?? NAV[0].id]);
  const curRef = useRef(cur);
  const busy = useRef(false);
  const queued = useRef<string | null>(null);
  const slideRef = useRef<(id: string) => void>(() => {});

  // Switches page at once, no animation.
  const commit = useCallback((id: string) => {
    if (!NAV.some((n) => n.id === id) || id === curRef.current) return;
    curRef.current = id;
    setSeen((s) => (s.includes(id) ? s : [...s, id]));
    setCur(id);
    setActiveSection(id);
    history.replaceState(history.state, "", id === NAV[0].id ? location.pathname + location.search : `#${id}`);
  }, []);

  // Tab bar, links and addresses: slide to the page.
  const go = useCallback((id: string) => {
    if (id === curRef.current) return;
    if (busy.current) {
      queued.current = id;
      return;
    }
    slideRef.current(id);
  }, []);

  // Neighbouring pages are mounted in the background so a drag can show them straight away.
  useEffect(() => {
    const i = NAV.findIndex((n) => n.id === cur);
    const want = [NAV[i - 1]?.id, NAV[i + 1]?.id].filter(Boolean) as string[];
    if (want.every((w) => seen.includes(w))) return;
    const h = window.setTimeout(() => setSeen((s) => [...s, ...want.filter((w) => !s.includes(w))]), 350);
    return () => clearTimeout(h);
  }, [cur, seen]);

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

  // Dragging and sliding. Direct DOM writes (no React renders) while the finger is down.
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-dashboard]");
    if (!root) return;
    const html = document.documentElement;
    const tabbar = () => document.querySelector<HTMLElement>(".tabbar");
    const curIdx = () => NAV.findIndex((n) => n.id === curRef.current);
    let mode = 0; // 0 idle, 1 undecided, 2 dragging
    let sx = 0, sy = 0, dir = 0, x = 0, vx = 0, lastX = 0, lastT = 0, raf = 0;
    let nb: HTMLElement | null = null;
    const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    // Show the neighbour beside the current page and get the layers ready to move.
    const prepare = (el: HTMLElement, d: number) => {
      nb = el;
      dir = d;
      el.style.visibility = "visible";
      el.style.left = `${d * 100}%`;
      // Pages always sit side by side at the same height, so nothing jumps while you move between them.
      el.style.top = "0px";
      html.classList.add("paging");
      root.style.willChange = "transform";
    };
    const reset = () => {
      if (nb) {
        nb.style.visibility = nb.style.left = nb.style.top = "";
      }
      root.style.transform = root.style.transition = root.style.willChange = "";
      html.classList.remove("paging");
      nb = null;
      mode = 0;
      busy.current = false;
      const q = queued.current;
      queued.current = null;
      if (q && q !== curRef.current) go(q);
    };
    // Glide the layers to where they should end up, then switch page for real.
    const settle = (to: number, id: string | null, speed = 1) => {
      busy.current = true;
      const tb = tabbar();
      tb?.classList.remove("is-dragging");
      if (id) setActiveSection(id);
      tb?.style.setProperty("--i", String(id ? NAV.findIndex((n) => n.id === id) : curIdx()));
      const dur = ms(300 * speed);
      root.style.transition = `transform ${dur}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      root.style.transform = `translate3d(${to}px,0,0)`;
      window.setTimeout(() => {
        if (id) {
          flushSync(() => commit(id));
        }
        reset();
      }, dur + 30);
    };
    slideRef.current = (id) => {
      const el = document.getElementById(id);
      if (!el || reduced()) {
        commit(id);
        return;
      }
      const d = NAV.findIndex((n) => n.id === id) > NAV.findIndex((n) => n.id === curRef.current) ? 1 : -1;
      setSeen((s) => (s.includes(id) ? s : [...s, id]));
      busy.current = true;
      setActiveSection(id);
      // Wait a frame if it had to be mounted first.
      requestAnimationFrame(() => {
        const t = document.getElementById(id);
        if (!t) {
          busy.current = false;
          return commit(id);
        }
        prepare(t, d);
        root.style.transition = "none";
        root.style.transform = "translate3d(0,0,0)";
        void root.offsetWidth;
        settle(-d * (root.clientWidth || window.innerWidth), id);
      });
    };
    const apply = () => {
      raf = 0;
      root.style.transform = `translate3d(${x}px,0,0)`;
      // The tab bar's open-tab circle travels with the page, not after it.
      const w = root.clientWidth || window.innerWidth;
      tabbar()?.style.setProperty("--i", String(curIdx() + dir * Math.min(1, Math.abs(x) / w)));
    };
    const start = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || blocked(e.target) || document.body.classList.contains("cal-dragging")) {
        mode = 0;
        return;
      }
      mode = 1;
      sx = lastX = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      lastT = performance.now();
      vx = 0;
    };
    const move = (e: TouchEvent) => {
      if (mode === 0 || busy.current) return;
      const t = e.touches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (mode === 1) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2 || document.body.classList.contains("cal-dragging")) {
          mode = 0;
          return;
        }
        mode = 2;
        const d = dx < 0 ? 1 : -1;
        const target = NAV[NAV.findIndex((n) => n.id === curRef.current) + d];
        const el = target ? document.getElementById(target.id) : null;
        if (el) prepare(el, d);
        else {
          dir = d;
          nb = null;
          html.classList.add("paging");
          root.style.willChange = "transform";
        }
        if (target) setSeen((s) => (s.includes(target.id) ? s : [...s, target.id]));
        root.style.transition = "none";
        tabbar()?.classList.add("is-dragging");
      }
      if (e.cancelable) e.preventDefault();
      const now = performance.now();
      if (now > lastT) vx = 0.5 * vx + 0.5 * ((t.clientX - lastX) / (now - lastT));
      lastX = t.clientX;
      lastT = now;
      // Only towards the neighbour; past the first or last page it resists.
      let m = dx * dir < 0 ? dx : 0;
      if (!nb) m *= 0.25;
      x = m;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const end = () => {
      if (mode !== 2) {
        mode = 0;
        return;
      }
      mode = 0;
      cancelAnimationFrame(raf);
      raf = 0;
      const w = root.clientWidth || window.innerWidth;
      const go2 = !!nb && (Math.abs(x) > w * 0.3 || vx * dir < -0.4);
      // Closer to its end means a shorter glide.
      const left = go2 ? w - Math.abs(x) : Math.abs(x);
      settle(go2 ? -dir * w : 0, go2 && nb ? nb.id : null, Math.max(0.55, Math.min(1, left / w + 0.3)));
    };
    root.style.touchAction = "pan-y";
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", end, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
      root.style.touchAction = "";
      html.classList.remove("paging");
      tabbar()?.classList.remove("is-dragging");
    };
  }, [go, commit]);

  // Leaving for Settings or a receipt: the next visit starts with Today lit until it measures.
  useEffect(() => () => setActiveSection(NAV[0].id), []);

  return (
    <InDashboard.Provider value={true}>
      <div data-paged-clip>
      <div data-dashboard data-paged>
        {NAV.map((n) => (
          <section key={n.id} id={n.id} aria-label={n.label} className={n.id === cur ? "page-current" : "page-parked"} aria-hidden={n.id !== cur}>
            {seen.includes(n.id) && <Page id={n.id} />}
          </section>
        ))}
      </div>
      </div>
    </InDashboard.Provider>
  );
}
