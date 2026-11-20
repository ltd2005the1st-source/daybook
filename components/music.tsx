"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp, Pause, Play, X } from "lucide-react";
import { useData } from "./data";
import { cx } from "@/lib/format";
import { embedUrl, KIND_LABEL } from "@/lib/spotify";
import type { MusicItem } from "@/lib/types";
import { sec } from "@/lib/motion";

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
  // Collapsed by default: a slim bar. Expanding opens the full player.
  const [folded, setFolded] = useState(true);
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
    play: (item) => remember(item.id),
    stop: () => remember(null),
    folded,
    setFolded,
  };
  return <MusicCtx.Provider value={value}>{children}</MusicCtx.Provider>;
}

/* ---------- Spotify's embed controller ---------- */

type Playback = { paused: boolean; position: number; duration: number };
type Controller = {
  loadUri: (uri: string) => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  destroy: () => void;
  addListener: (ev: string, fn: (e: { data: { isPaused: boolean; position: number; duration: number } }) => void) => void;
};
type IFrameAPI = { createController: (el: HTMLElement, o: { uri: string; width: string; height: number }, cb: (c: Controller) => void) => void };

let apiPromise: Promise<IFrameAPI | null> | null = null;
/** Spotify's iFrame API lets the bar play, pause and seek the embedded player. If it can't load, the plain embed still works. */
function spotifyApi(): Promise<IFrameAPI | null> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const w = window as unknown as { onSpotifyIframeApiReady?: (api: IFrameAPI) => void };
    const t = window.setTimeout(() => resolve(null), 8000);
    w.onSpotifyIframeApiReady = (api) => {
      window.clearTimeout(t);
      resolve(api);
    };
    const sc = document.createElement("script");
    sc.src = "https://open.spotify.com/embed/iframe-api/v1";
    sc.async = true;
    sc.onerror = () => {
      window.clearTimeout(t);
      resolve(null);
    };
    document.body.appendChild(sc);
  });
  return apiPromise;
}

const PLAYER_H = 352;
const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The player is a bar along the bottom of the app. While something is loaded it pushes the whole interface up
 * (through --dock), so nothing is ever covered. Collapsed it shows the cover, name, play/pause and a thin
 * timeline; expanded it opens Spotify's full player with the album art, controls and track list.
 * The player itself never unmounts while music is loaded, so switching tabs or collapsing keeps it playing.
 */
export function MusicDock() {
  const { current, stop, folded, setFolded } = useMusic();
  const expanded = !folded;
  const ref = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const ctrl = useRef<Controller | null>(null);
  const [fallback, setFallback] = useState(false);
  const [pb, setPb] = useState<Playback>({ paused: true, position: 0, duration: 0 });
  const [navH, setNavH] = useState(0);

  // Sit just above the phone's tab bar.
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>("[data-bottom-nav]");
    if (!nav) return;
    const set = () => setNavH(getComputedStyle(nav).display === "none" ? 0 : nav.offsetHeight);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(nav);
    window.addEventListener("resize", set);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", set);
    };
  }, []);

  // Publish the bar's height so the app makes room for it.
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    const set = () => {
      root.style.setProperty("--dock", el ? `${el.offsetHeight}px` : "0px");
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
  }, [current ? 1 : 0]);

  // Create the player once, then swap what it plays.
  const uri = current ? `spotify:${current.kind}:${current.spotify_id}` : null;
  useEffect(() => {
    if (!uri || !host.current) return;
    if (ctrl.current) {
      ctrl.current.loadUri(uri);
      return;
    }
    let cancelled = false;
    spotifyApi().then((api) => {
      if (cancelled || !host.current) return;
      if (!api) return setFallback(true);
      const el = document.createElement("div");
      host.current.replaceChildren(el);
      api.createController(el, { uri, width: "100%", height: PLAYER_H }, (c) => {
        if (cancelled) return c.destroy();
        ctrl.current = c;
        c.addListener("playback_update", (e) => setPb({ paused: e.data.isPaused, position: e.data.position, duration: e.data.duration }));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [uri]);
  useEffect(() => {
    if (current) return;
    ctrl.current?.destroy();
    ctrl.current = null;
    setPb({ paused: true, position: 0, duration: 0 });
  }, [current]);

  const progress = pb.duration ? Math.min(1, pb.position / pb.duration) : 0;
  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ctrl.current || !pb.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    ctrl.current.seek(((e.clientX - r.left) / r.width) * (pb.duration / 1000));
  };

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key="dock"
          ref={ref}
          data-music-dock
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ duration: sec(0.34), ease: EASE }}
          style={{ bottom: navH }}
          className="no-print fixed inset-x-0 z-40 glass"
          aria-label="Music player"
        >
          {/* Timeline: a thin line along the top edge; click to jump. */}
          <div className="group absolute inset-x-0 -top-[3px] h-[7px] cursor-pointer" onClick={seekTo} aria-hidden>
            <div className="absolute inset-x-0 top-[3px] h-[2px] bg-line transition-[height,top] duration-200 group-hover:top-[2px] group-hover:h-[4px]">
              <div className="h-full bg-accent transition-[width] duration-500 ease-linear" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>

          <div className="mx-auto flex h-[58px] max-w-[1400px] items-center gap-3 px-3 md:px-5">
            {current.image ? (
              <img src={current.image} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover shadow-card" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hover">
                <Bars playing={!pb.paused} />
              </span>
            )}
            <button className="min-w-0 flex-1 text-left" onClick={() => setFolded(!folded)}>
              <div className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-semibold leading-tight">{current.title}</span>
                {!pb.paused && <Bars className="hidden md:flex" />}
              </div>
              <div className="num truncate text-[11.5px] leading-tight text-muted">
                {KIND_LABEL[current.kind]}
                {pb.duration ? ` · ${fmtTime(pb.position)} / ${fmtTime(pb.duration)}` : ""}
              </div>
            </button>
            {!fallback && (
              <button
                aria-label={pb.paused ? "Play" : "Pause"}
                disabled={!ctrl.current}
                onClick={() => ctrl.current?.togglePlay()}
                className="press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-bg disabled:opacity-40"
              >
                {pb.paused ? <Play size={16} fill="currentColor" className="ml-[2px]" /> : <Pause size={16} fill="currentColor" />}
              </button>
            )}
            <button
              aria-label={expanded ? "Collapse player" : "Expand player"}
              aria-expanded={expanded}
              className="press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
              onClick={() => setFolded(!folded)}
            >
              <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: sec(0.34), ease: EASE }} className="inline-flex">
                <ChevronUp size={18} />
              </motion.span>
            </button>
            <button aria-label="Close player" className="press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink" onClick={stop}>
              <X size={17} />
            </button>
          </div>

          {/* Spotify's full player: cover, timeline, controls, track list. Collapsing only hides it; it keeps playing. */}
          <motion.div
            initial={false}
            animate={{ height: expanded ? PLAYER_H + 12 : 0 }}
            transition={{ duration: sec(0.34), ease: EASE }}
            className="overflow-hidden"
            aria-hidden={!expanded}
          >
            <div className="mx-auto max-w-[1400px] px-3 pb-3 md:px-5" style={{ height: PLAYER_H + 12 }}>
              {fallback ? (
                <iframe
                  key={current.id}
                  title={`Spotify: ${current.title}`}
                  src={embedUrl(current.kind, current.spotify_id)}
                  width="100%"
                  height={PLAYER_H}
                  style={{ borderRadius: 12, border: 0, display: "block" }}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                />
              ) : (
                <div ref={host} className="h-[352px] overflow-hidden rounded-xl [&_iframe]:block [&_iframe]:rounded-xl" />
              )}
            </div>
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
          style={{ animationDelay: `${sec(i * 0.18)}s` }}
        />
      ))}
    </span>
  );
}

