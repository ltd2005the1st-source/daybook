"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  Moon,
  PanelRightOpen,
  Sun,
  X,
} from "lucide-react";
import { useData } from "./data";
import { Login } from "./login";
import { Palette } from "./palette";
import { cx } from "@/lib/format";
import { NAV } from "./nav";
import { MusicDock, MusicProvider } from "./music";
import { useSmoothWheel } from "./smooth-scroll";
import { sec, ms } from "@/lib/motion";


function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark") ?? "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    // Ease the colours across rather than jumping from light to dark in one frame.
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      root.classList.add("theme-fade");
      window.setTimeout(() => root.classList.remove("theme-fade"), ms(400));
    }
    root.dataset.theme = next;
    try {
      localStorage.setItem("daybook.theme", next);
    } catch {}
    setTheme(next);
  };
  return { theme, toggle };
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { ready, needsLogin, online, toasts, dismissToast, signOut, session } = useData();
  const path = usePathname();
  const { theme, toggle } = useTheme();
  useSmoothWheel();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // The top bar only shows its edge once the page has scrolled under it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  // Publish the mobile top bar's height so sticky headers inside pages can sit just below it.
  const topbarObserver = useRef<ResizeObserver | null>(null);
  const topbarRef = (el: HTMLElement | null) => {
    topbarObserver.current?.disconnect();
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--topbar", `${el.offsetHeight}px`);
    set();
    topbarObserver.current = new ResizeObserver(set);
    topbarObserver.current.observe(el);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  if (online && needsLogin) return <Login />;

  return (
    // Anything that animates without its own timing eases in and out the same way.
    <MotionConfig transition={{ duration: sec(0.3), ease: [0.65, 0, 0.35, 1] }} reducedMotion="user">
    <MusicProvider>
    <div className="min-h-dvh md:flex">
      {/* Sidebar (desktop) */}
      <aside className="no-print hidden md:flex w-[232px] shrink-0 flex-col border-r border-line bg-sunken sticky top-0 h-[calc(100dvh-var(--dock,0px))] px-2.5 py-3 transition-[height] duration-300 ease-in-out">
        <Link href="/" className="flex items-center gap-2 px-2 py-1.5 mb-3">
          <img src="/icon.svg" alt="" className="h-6 w-6 rounded-[6px]" />
          <span className="display text-[17px] font-semibold">Daybook</span>
        </Link>
        <button
          onClick={() => setPaletteOpen(true)}
          className="press mb-3 flex items-center justify-between rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-muted shadow-card hover:text-ink"
        >
          <span>Jump or add…</span>
          <kbd className="num rounded-[5px] border border-line px-1 text-[10.5px] leading-[16px]">⌘K</kbd>
        </button>
        <nav className="flex flex-col gap-px">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "press nav-item relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[14px]",
                  active ? "text-ink font-medium" : "text-ink-2 hover:bg-hover hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-lg bg-surface shadow-card"
                    transition={{ duration: sec(0.3), ease: [0.65, 0, 0.35, 1] }}
                  />
                )}
                <n.icon size={16} strokeWidth={active ? 2 : 1.8} className={cx("relative", active && "text-accent")} />
                <span className="relative">{n.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-px">
          <button onClick={toggle} className="btn btn-ghost">
            {theme === "dark" ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <Link href="/settings" className="btn btn-ghost">
            <PanelRightOpen size={16} strokeWidth={1.8} /> Settings
          </Link>
          <div className="px-2.5 pt-2 text-[11.5px] text-muted leading-snug">
            {online ? (
              <>
                Synced · {(session?.user.app_metadata?.username as string | undefined) ?? session?.user.email}
                <button onClick={signOut} className="block underline-offset-2 hover:underline">
                  Sign out
                </button>
              </>
            ) : (
              "Local mode · saved in this browser"
            )}
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header ref={topbarRef} data-scrolled={scrolled || undefined} className="no-print md:hidden sticky top-0 z-30 flex items-center justify-between material edge-bottom px-4 pt-[max(env(safe-area-inset-top),10px)] pb-2.5">
        <Link href="/" className="flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-6 w-6 rounded-[6px]" />
          <span className="display text-[17px] font-semibold">Daybook</span>
        </Link>
        <div className="flex items-center gap-1">
          <button aria-label="Toggle theme" onClick={toggle} className="press inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link aria-label="Settings" href="/settings" className="press inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink">
            <PanelRightOpen size={17} />
          </Link>
        </div>
      </header>

      <main className="min-w-0 flex-1 pb-[calc(7rem+var(--dock,0px))] md:pb-[calc(2.5rem+var(--dock,0px))]">
        {ready ? children : <Loading />}
      </main>

      {/* Mobile tab bar */}
      <nav data-bottom-nav className="no-print md:hidden fixed inset-x-0 bottom-0 z-30 material-thick edge-top pb-[env(safe-area-inset-bottom)]">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}>
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "press flex min-w-0 flex-col items-center gap-[3px] pt-2 pb-1.5 text-[10px] tracking-[0.01em]",
                  active ? "text-ink font-semibold" : "text-muted",
                )}
              >
                <span className="relative flex h-7 w-12 max-w-full items-center justify-center">
                  {active && (
                    <motion.span
                      layoutId="tab-active"
                      className="absolute inset-0 rounded-full bg-accent-soft"
                      transition={{ duration: sec(0.3), ease: [0.65, 0, 0.35, 1] }}
                    />
                  )}
                  <n.icon size={20} strokeWidth={active ? 2.1 : 1.7} className={cx("relative", active && "text-accent")} />
                </span>
                <span className="max-w-full truncate">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <MusicDock />

      {/* Toasts */}
      <div className="no-print fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] md:bottom-6 left-1/2 z-50 -translate-x-1/2 flex flex-col gap-2 items-center">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              // Eases up into place, then eases back down as it leaves.
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0, transition: { duration: sec(0.34), ease: [0.65, 0, 0.35, 1] } }}
              exit={{ opacity: 0, y: 28, transition: { duration: sec(0.3), ease: [0.65, 0, 0.35, 1] } }}
              transition={{ layout: { duration: sec(0.3), ease: [0.65, 0, 0.35, 1] } }}
              className="flex items-center gap-3 rounded-full bg-ink/90 py-2 pl-4 pr-3 text-[13.5px] text-bg shadow-pop backdrop-blur-xl"
            >
              {t.text}
              {t.undo && (
                <button
                  className="font-semibold underline underline-offset-2"
                  onClick={() => {
                    t.undo?.();
                    dismissToast(t.id);
                  }}
                >
                  Undo
                </button>
              )}
              <button aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="opacity-60">
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
    </MusicProvider>
    </MotionConfig>
  );
}

function Loading() {
  return (
    <div className="flex h-[60dvh] items-center justify-center text-muted">
      <span className="label">Opening your daybook…</span>
    </div>
  );
}
