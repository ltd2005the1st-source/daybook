"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
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


function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme((document.documentElement.dataset.theme as "light" | "dark") ?? "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
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
  const [paletteOpen, setPaletteOpen] = useState(false);
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
    <div className="min-h-dvh md:flex">
      {/* Sidebar (desktop) */}
      <aside className="no-print hidden md:flex w-[232px] shrink-0 flex-col border-r border-line bg-sunken sticky top-0 h-dvh px-2.5 py-3">
        <Link href="/" className="flex items-center gap-2 px-2 py-1.5 mb-3">
          <img src="/icon.svg" alt="" className="h-6 w-6 rounded-[6px]" />
          <span className="display text-[17px] font-semibold">Daybook</span>
        </Link>
        <button
          onClick={() => setPaletteOpen(true)}
          className="mb-2 flex items-center justify-between rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-muted hover:text-ink"
        >
          <span>Jump or add…</span>
          <kbd className="num text-[11px]">⌘K</kbd>
        </button>
        <nav className="flex flex-col gap-px">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[14px] transition-colors",
                  active ? "text-ink font-medium" : "text-ink-2 hover:bg-hover hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-md bg-hover"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <n.icon size={16} strokeWidth={1.8} className="relative" />
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
                Synced · {session?.user.email}
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
      <header ref={topbarRef} className="no-print md:hidden sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/85 backdrop-blur px-4 pt-[max(env(safe-area-inset-top),10px)] pb-2.5">
        <Link href="/" className="flex items-center gap-2">
          <img src="/icon.svg" alt="" className="h-6 w-6 rounded-[6px]" />
          <span className="display text-[17px] font-semibold">Daybook</span>
        </Link>
        <div className="flex items-center gap-1">
          <button aria-label="Toggle theme" onClick={toggle} className="btn btn-ghost px-2">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link aria-label="Settings" href="/settings" className="btn btn-ghost px-2">
            <PanelRightOpen size={17} />
          </Link>
        </div>
      </header>

      <main className="min-w-0 flex-1 pb-28 md:pb-10">
        {ready ? children : <Loading />}
      </main>

      {/* Mobile tab bar */}
      <nav className="no-print md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-6">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "flex flex-col items-center gap-0.5 py-2 text-[10.5px]",
                  active ? "text-ink font-semibold" : "text-muted",
                )}
              >
                <n.icon size={20} strokeWidth={active ? 2.1 : 1.7} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Toasts */}
      <div className="no-print fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] md:bottom-6 left-1/2 z-50 -translate-x-1/2 flex flex-col gap-2 items-center">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              className="flex items-center gap-3 rounded-lg bg-ink px-3.5 py-2 text-[13.5px] text-bg shadow-pop"
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
  );
}

function Loading() {
  return (
    <div className="flex h-[60dvh] items-center justify-center text-muted">
      <span className="label">Opening your daybook…</span>
    </div>
  );
}
