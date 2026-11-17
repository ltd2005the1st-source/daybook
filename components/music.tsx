"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useData } from "./data";
import { cx } from "@/lib/format";
import { embedUrl, KIND_LABEL } from "@/lib/spotify";
import type { MusicItem } from "@/lib/types";

const KEY = "daybook:playing";
const EASE = [0.65, 0, 0.35, 1] as const;

type Ctx = {
  current: MusicItem | null;
  play: (item: MusicItem) => void;
  stop: () => void;
  folded: boolean;
  setFolded: (v: boolean) => void;
};
const MusicCtx = createContext<Ctx | null>(null);
export const useMusic = () => useContext(MusicCtx)!;

/**
 * One Spotify player for the whole app. It lives in the app frame, not in a page,
 * so switching tabs never reloads it and the music keeps going.
 */
export function MusicProvider({ children }: { children: React.ReactNode }) {
  const { store } = useData();
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try {
      setCurrentId(localStorage.getItem(KEY));
    } catch {}
  }, []);
  const current = (store.music ?? []).find((m) => m.id === currentId) ?? null;
  const remember = (id: string | null) => {
    setCurrentId(id);
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {}
  };
  const value: Ctx = {
    current,
    play: (item) => {
      remember(item.id);
      setFolded(false);
    },
    stop: () => remember(null),
    folded,
    setFolded,
  };
  return <MusicCtx.Provider value={value}>{children}</MusicCtx.Provider>;
}

function useIsDesktop() {
  const [d, setD] = useState(true);
  useEffect(() => {
    const q = matchMedia("(min-width: 768px)");
    const f = () => setD(q.matches);
    f();
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return d;
}

/** The docked player: bottom right on a computer, above the tab bar on a phone. */
export function MusicDock() {
  const { current, stop, folded, setFolded } = useMusic();
  const path = usePathname();
  const desktop = useIsDesktop();
  const onMusic = path.startsWith("/music");
  // Taller on the Music page so you can pick songs from the list; slim everywhere else.
  // Only the height changes, so the player never reloads.
  const h = onMusic ? 352 : desktop ? 152 : 80;
  const ref = useRef<HTMLDivElement>(null);
  // Let pages leave room for the player so it never covers the end of a page on a phone.
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    const set = () => {
      root.style.setProperty("--dock", el ? `${el.offsetHeight + 12}px` : "0px");
      window.dispatchEvent(new Event("daybook:dock"));
    };
    set();
    if (!el) return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--dock", "0px");
      window.dispatchEvent(new Event("daybook:dock"));
    };
  }, [current?.id]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key="dock"
          ref={ref}
          data-music-dock
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.34, ease: EASE }}
          className={cx(
            "no-print fixed z-40 overflow-hidden rounded-xl border border-line bg-surface shadow-pop",
            desktop ? "bottom-6 right-6 w-[360px]" : "inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+66px)]",
          )}
          aria-label="Music player"
        >
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Bars playing={!folded} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold leading-tight">{current.title}</div>
              {folded && <div className="text-[11px] leading-tight text-muted">{KIND_LABEL[current.kind]} · still playing</div>}
            </div>
            <button
              aria-label={folded ? "Show player" : "Fold player away"}
              className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink"
              onClick={() => setFolded(!folded)}
            >
              {folded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button aria-label="Close player" className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink" onClick={stop}>
              <X size={16} />
            </button>
          </div>
          {/* Folding only hides the player; it stays loaded so the music doesn't stop. */}
          <motion.div
            initial={false}
            animate={{ height: folded ? 0 : h + 8 }}
            transition={{ duration: 0.34, ease: EASE }}
            className="overflow-hidden px-2"
            aria-hidden={folded}
          >
            <iframe
              key={current.id}
              title={`Spotify: ${current.title}`}
              src={embedUrl(current.kind, current.spotify_id)}
              width="100%"
              height={h}
              style={{ borderRadius: 12, border: 0, display: "block", transition: "height 0.34s cubic-bezier(0.65,0,0.35,1)" }}
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Three small bars that move while the player is open. */
export function Bars({ playing = true, className }: { playing?: boolean; className?: string }) {
  return (
    <span className={cx("flex h-3.5 w-3.5 shrink-0 items-end justify-between", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cx("w-[3px] rounded-full bg-accent", playing ? "music-bar" : "h-[5px]")}
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  );
}

