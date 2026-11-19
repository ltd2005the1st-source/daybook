"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  LayoutGrid,
  Moon,
  PanelRightOpen,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { useData } from "./data";
import { AppGrid, AppLinks } from "./apps";
import { Sheet } from "./ui";
import { Login } from "./login";
import { Palette } from "./palette";
import { Assistant, useAssistantShortcut } from "./assistant";
import { cx } from "@/lib/format";
import { NAV, isDashboardPath } from "./nav";
import { useActiveSection } from "./scroll-spy";
import { MusicDock, MusicProvider } from "./music";
import { useSmoothWheel } from "./smooth-scroll";
import { NativeSync } from "./native-sync";
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
  // Which section is lit: on the dashboard it follows the scroll; on Settings nothing is, and on
  // receipts Teaching is. The notch stays where it was while nothing is lit.
  const section = useActiveSection();
  const onDashboard = isDashboardPath(path);
  const activeIdx = onDashboard ? NAV.findIndex((n) => n.id === section) : NAV.findIndex((n) => n.path !== "/" && path.startsWith(n.path));
  const lastIdx = useRef(Math.max(activeIdx, 0));
  if (activeIdx >= 0) lastIdx.current = activeIdx;
  const slotAt = lastIdx.current;
  useSmoothWheel();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [askSeed, setAskSeed] = useState<string | null>(null);
  const toggleAsk = useCallback(() => setAskOpen((v) => !v), []);
  useAssistantShortcut(toggleAsk);
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

  // Makes the public "tester" showcase account the first time the owner opens Daybook after it was added.
  // The server ignores this for anyone but the owner, and does nothing once the account exists.
  const showcaseAsked = useRef(false);
  useEffect(() => {
    if (!online || !session || showcaseAsked.current || session.user.app_metadata?.showcase) return;
    showcaseAsked.current = true;
    fetch("/api/auth/pin", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: "showcase", mode: "ensure" }),
    }).catch(() => {});
  }, [online, session]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  if (online && needsLogin) return <Login />;

  return (
    // Anything that animates without its own timing eases in and out the same way.
    <MotionConfig transition={{ duration: sec(0.3), ease: [0.65, 0, 0.35, 1] }} reducedMotion="user">
    <MusicProvider>
    <NativeSync />
    <div className="min-h-dvh md:flex">
      {/* Sidebar (desktop) */}
      <aside className="no-print hidden md:flex w-[186px] shrink-0 flex-col border-r border-line bg-sunken sticky top-0 h-[calc(100dvh-var(--dock,0px))] px-2.5 py-3 transition-[height] duration-300 ease-in-out">
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
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-3 [mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]">
        <nav className="flex flex-col gap-px">
          {NAV.map((n, i) => {
            const active = i === activeIdx;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "true" : undefined}
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
        <AppLinks />
        </div>
        <div className="mt-auto flex flex-col gap-px">
          <button onClick={() => setAskOpen(true)} className="press nav-item flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13.5px] text-ink-2 hover:bg-hover hover:text-ink">
            <Sparkles size={16} strokeWidth={1.8} />
            <span className="flex-1 text-left">Ask Claude</span>
            <kbd className="num text-[10.5px] text-muted">⌘J</kbd>
          </button>
          <button onClick={toggle} className="press nav-item flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13.5px] text-ink-2 hover:bg-hover hover:text-ink">
            {theme === "dark" ? <Sun size={16} strokeWidth={1.8} /> : <Moon size={16} strokeWidth={1.8} />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <Link href="/settings" className="press nav-item flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] text-[13.5px] text-ink-2 hover:bg-hover hover:text-ink">
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
          <button aria-label="Apps" onClick={() => setAppsOpen(true)} className="press inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink">
            <LayoutGrid size={17} />
          </button>
          <button aria-label="Ask Claude" onClick={() => setAskOpen(true)} className="press inline-flex h-9 w-9 items-center justify-center rounded-full text-accent hover:bg-hover">
            <Sparkles size={17} />
          </button>
          <button aria-label="Toggle theme" onClick={toggle} className="press inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link aria-label="Settings" href="/settings" className="press inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-ink">
            <PanelRightOpen size={17} />
          </Link>
        </div>
      </header>

      <main className="min-w-0 flex-1 pb-[calc(9rem+var(--dock,0px))] md:pb-[calc(2.5rem+var(--dock,0px))]">
        {ready ? children : <Loading />}
      </main>

      {/* Mobile tab bar: a floating pill. The active tab is a raised circle sitting in a round notch
          cut into the bar; the circle and the notch glide together to whichever tab you pick. */}
      <nav
        data-bottom-nav
        aria-label="Main"
        className="no-print md:hidden pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pt-[26px] pb-[max(env(safe-area-inset-bottom),12px)]"
      >
        <div
          className="tabbar pointer-events-auto relative mx-auto h-16 max-w-[440px]"
          style={{ ["--i" as string]: slotAt, ["--n" as string]: NAV.length }}
        >
          {/* The bar's surface. A strip wider than the bar slides sideways (a GPU transform, no
              repainting): flat surface, then a 100px piece with the round notch and softly rounded
              shoulders, then more flat surface. The pill clips it to the bar's rounded shape. The notch
              piece bleeds 2px over both flat pieces, so no hairline seam shows at fractional pixels. */}
          <div className="tabbar-pill absolute inset-0 overflow-hidden rounded-[26px]" aria-hidden>
            <div className="tabbar-strip absolute inset-y-0 left-0 flex">
              <div className="tabbar-flat" />
              <div className="relative h-full w-[100px] shrink-0">
                <svg className="tabbar-fill absolute inset-0" width="100" height="64" viewBox="0 0 100 64">
                  <path d="M-2 0H8.19A8 8 0 0 1 16.15 7.24A34 34 0 0 0 83.85 7.24A8 8 0 0 1 91.81 0H102V64H-2Z" />
                </svg>
                <svg className={cx("tabbar-fill tabbar-patch absolute inset-0", activeIdx < 0 && "is-on")} width="100" height="64" viewBox="0 0 100 64">
                  <rect x="-2" width="104" height="64" />
                </svg>
              </div>
              <div className="tabbar-flat" />
            </div>
          </div>
          {/* Circle and dot ride one slot-wide carrier that slides to the open tab. */}
          <div aria-hidden className="tabbar-carrier pointer-events-none absolute left-0 top-[-22px] h-[86px]">
            <div className={cx("tabbar-circle relative mx-auto h-[52px] w-[52px] rounded-full bg-accent text-surface", activeIdx < 0 && "scale-50 opacity-0")}>
              {NAV.map((n, i) => (
                <n.icon
                  key={n.href}
                  size={23}
                  strokeWidth={2}
                  className={cx("tabbar-glyph absolute left-1/2 top-1/2 -ml-[11.5px] -mt-[11.5px]", i === activeIdx ? "opacity-100" : "scale-50 opacity-0")}
                />
              ))}
            </div>
            <div className={cx("tabbar-dot mx-auto mt-[18px] h-1 w-1 rounded-full bg-accent", activeIdx < 0 && "opacity-0")} />
          </div>
          <div className="relative grid h-full" style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}>
            {NAV.map((n, i) => {
              const active = i === activeIdx;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-label={n.label}
                  title={n.label}
                  aria-current={active ? "true" : undefined}
                  className="press flex min-w-0 items-center justify-center rounded-2xl"
                >
                  <n.icon
                    size={22}
                    strokeWidth={1.7}
                    className={cx("tabbar-icon", active ? "scale-50 opacity-0" : "text-muted")}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <Palette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAsk={(q) => {
          setAskSeed(q);
          setAskOpen(true);
        }}
      />
      <Sheet open={appsOpen} onClose={() => setAppsOpen(false)} title="Apps" width={420}>
        <AppGrid onPick={() => setAppsOpen(false)} />
      </Sheet>
      <Assistant open={askOpen} onClose={() => setAskOpen(false)} seed={askSeed} onSeedUsed={() => setAskSeed(null)} />
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
