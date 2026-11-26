"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { LayoutGrid, Moon, NotebookPen, Search, Settings, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { useData, useToasts } from "./data";
import { AppGrid, AppLinks, AppsEditor } from "./apps";
import { Palette } from "./palette";
import { Notebook } from "./notebook";
import { Sheet } from "./ui";
import { Login } from "./login";
import { Spinner } from "@/components/ui/spinner";
import { cx } from "@/lib/format";
import { NAV, isDashboardPath } from "./nav";
import { onPageScroll, pageScroller, useActiveSection } from "./scroll-spy";
import { MusicDock, MusicProvider } from "./music";
import { useSmoothWheel } from "./smooth-scroll";
import { NativeSync } from "./native-sync";
import { AppSounds } from "./app-sounds";
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
  const { ready, needsLogin, online, signOut, session } = useData();
  const { toasts, dismissToast } = useToasts();
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
  const [notesOpen, setNotesOpen] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [editApps, setEditApps] = useState(false);
  // The top bar only shows its edge once the page has scrolled under it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(pageScroller().scrollTop > 4);
    on();
    return onPageScroll(on);
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

  if (online && needsLogin)
    return (
      <>
        <AppSounds />
        <Login />
      </>
    );

  const navBtn = "justify-start gap-2.5 font-normal text-foreground/80 hover:text-foreground";
  return (
    // Anything that animates without its own timing eases in and out the same way.
    <MotionConfig transition={{ duration: sec(0.3), ease: [0.65, 0, 0.35, 1] }} reducedMotion="user">
    <MusicProvider>
    <NativeSync />
    <AppSounds />
    <div className="min-h-dvh md:flex md:h-dvh md:overflow-hidden print:h-auto print:overflow-visible">
      {/* Sidebar (desktop) */}
      <aside className="no-print sticky top-0 hidden h-[calc(100dvh-var(--dock,0px))] w-60 shrink-0 flex-col border-r bg-sidebar px-3 py-4 text-sidebar-foreground transition-[height] duration-300 ease-in-out md:flex">
        <Link href="/" className="intro mb-4 flex items-center gap-2.5 px-2" style={{ ["--i" as string]: 0 }}>
          <img src="/icon.svg" alt="" className="size-7 rounded-lg" />
          <span className="font-heading text-lg font-semibold tracking-tight">Daybook</span>
        </Link>
        <Button
          variant="outline"
          onClick={() => setPaletteOpen(true)}
          style={{ ["--i" as string]: 1 }}
          className="intro mb-4 w-full justify-between font-normal text-muted-foreground"
        >
          <span className="flex items-center gap-2"><Search /> Jump or add…</span>
          <Kbd>⌘K</Kbd>
        </Button>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-3">
          <nav className="flex flex-col gap-0.5">
            {NAV.map((n, i) => {
              const active = i === activeIdx;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "true" : undefined}
                  style={{ ["--i" as string]: i + 2 }}
                  className={cx(
                    "intro relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "font-medium text-foreground" : "text-foreground/70 hover:bg-accent hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-accent" transition={{ duration: sec(0.3), ease: [0.65, 0, 0.35, 1] }} />
                  )}
                  <n.icon className={cx("relative size-4", active && "text-info-foreground")} />
                  <span className="relative">{n.label}</span>
                </Link>
              );
            })}
          </nav>
          <AppLinks onEdit={() => setEditApps(true)} />
        </div>
        <div className="intro mt-auto flex flex-col gap-0.5 border-t pt-3" style={{ ["--i" as string]: NAV.length + 3 }}>
          <Button variant="ghost" onClick={() => setNotesOpen(true)} className={navBtn}>
            <NotebookPen /> My Notebook
          </Button>
          <Button variant="ghost" onClick={toggle} className={navBtn}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </Button>
          <Button variant="ghost" render={<Link href="/settings" />} className={navBtn}>
            <Settings /> Settings
          </Button>
          <div className="px-2.5 pt-2 text-xs leading-snug text-muted-foreground">
            {online ? (
              <>
                <Badge variant="success" size="sm" className="mr-1.5">Synced</Badge>
                {(session?.user.app_metadata?.username as string | undefined) ?? session?.user.email}
                <button onClick={signOut} className="block underline-offset-2 hover:underline">
                  Sign out
                </button>
              </>
            ) : (
              <Badge variant="outline" size="sm">Local mode</Badge>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header ref={topbarRef} data-scrolled={scrolled || undefined} className="no-print edge-bottom sticky top-0 z-30 flex items-center justify-between bg-background/90 px-4 pb-2.5 pt-[max(var(--sat),10px)] backdrop-blur md:hidden">
        <Link href="/" className="intro-down flex items-center gap-2">
          <img src="/icon.svg" alt="" className="size-7 rounded-lg" />
          <span className="font-heading text-lg font-semibold tracking-tight">Daybook</span>
        </Link>
        <div className="intro-down flex items-center gap-0.5" style={{ ["--i" as string]: 2 }}>
          <Button variant="ghost" size="icon" aria-label="Apps" onClick={() => setAppsOpen(true)}><LayoutGrid /></Button>
          <Button variant="ghost" size="icon" aria-label="My Notebook" onClick={() => setNotesOpen(true)}><NotebookPen /></Button>
          <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={toggle}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
          <Button variant="ghost" size="icon" aria-label="Settings" render={<Link href="/settings" />}><Settings /></Button>
        </div>
      </header>

      <main data-page-scroll className="app-pane min-w-0 flex-1 bg-background pb-[calc(6rem+var(--dock,0px))] md:pb-10">
        {ready ? children : <Loading />}
      </main>

      {/* Mobile tab bar: a flat bar, the open section highlighted. */}
      <nav
        data-bottom-nav
        aria-label="Main"
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[max(var(--sab),6px)] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-[480px]" style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))` }}>
          {NAV.map((n, i) => {
            const active = i === activeIdx;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-label={n.label}
                title={n.label}
                aria-current={active ? "true" : undefined}
                className={cx("flex min-w-0 flex-col items-center gap-0.5 py-2 text-[10px] font-medium outline-none", active ? "text-foreground" : "text-muted-foreground")}
              >
                <span className={cx("flex h-6 w-11 items-center justify-center rounded-full transition-colors", active && "bg-accent")}>
                  <n.icon className={cx("size-[18px]", active && "text-info-foreground")} />
                </span>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Sheet open={appsOpen} onClose={() => setAppsOpen(false)} title="Apps" width={420}>
        <AppGrid
          onPick={() => setAppsOpen(false)}
          onEdit={() => {
            setAppsOpen(false);
            setEditApps(true);
          }}
        />
      </Sheet>
      <AppsEditor open={editApps} onClose={() => setEditApps(false)} />
      <Notebook open={notesOpen} onClose={() => setNotesOpen(false)} />
      <MusicDock />

      {/* Toasts */}
      <div className="no-print fixed bottom-[calc(var(--sab)+84px)] left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 md:bottom-6">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0, transition: { duration: sec(0.3), ease: [0.65, 0, 0.35, 1] } }}
              exit={{ opacity: 0, y: 20, transition: { duration: sec(0.25), ease: [0.65, 0, 0.35, 1] } }}
              className="flex items-center gap-3 rounded-xl border bg-popover py-1.5 pl-4 pr-1.5 text-sm text-popover-foreground shadow-lg/5"
            >
              {t.text}
              {t.undo && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    t.undo?.();
                    dismissToast(t.id);
                  }}
                >
                  Undo
                </Button>
              )}
              <Button size="icon-xs" variant="ghost" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
                <X />
              </Button>
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
    <div className="flex h-[60dvh] items-center justify-center text-muted-foreground">
      <Spinner className="mr-2" /> <span className="text-sm">Opening your daybook…</span>
    </div>
  );
}
