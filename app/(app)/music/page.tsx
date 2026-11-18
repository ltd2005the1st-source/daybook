"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, Music2, Play, Plus, X } from "lucide-react";
import { useData } from "@/components/data";
import { Bars, useMusic } from "@/components/music";
import { Page, PageHeader, Segmented } from "@/components/ui";
import { cx } from "@/lib/format";
import { isShortLink, KIND_LABEL, lookup, openUrl, parseSpotify } from "@/lib/spotify";
import type { MusicItem } from "@/lib/types";
import { sec } from "@/lib/motion";

const EASE = [0.65, 0, 0.35, 1] as const;
type Filter = "all" | "playlist" | "album" | "track";

export default function MusicPage() {
  const { store, insert, update, toast } = useData();
  const { current, play } = useMusic();
  const [link, setLink] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const items = [...(store.music ?? [])].sort((a, b) => a.sort - b.sort || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const shown = items.filter((m) => filter === "all" || m.kind === filter || (filter === "playlist" && m.kind === "artist"));
  const parsed = parseSpotify(link);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    if (!parsed) {
      toast(
        isShortLink(link)
          ? "Short spotify.link addresses can’t be read. In Spotify, use Share → Copy link to playlist, album or song."
          : "That isn’t a Spotify link. In Spotify, use Share → Copy link.",
      );
      return;
    }
    const dup = items.find((m) => m.kind === parsed.kind && m.spotify_id === parsed.id);
    if (dup) {
      toast(`“${dup.title}” is already in your music.`);
      setLink("");
      return;
    }
    const row = insert("music", {
      title: `Spotify ${KIND_LABEL[parsed.kind].toLowerCase()}`,
      kind: parsed.kind,
      spotify_id: parsed.id,
      image: null,
      sort: items.length,
    });
    setLink("");
    play(row);
    // Fill in the real name and cover art.
    const info = await lookup(parsed.kind, parsed.id);
    if (info) update("music", row.id, { title: info.title, image: info.image });
  }

  return (
    <Page wide>
      <PageHeader eyebrow="Music" title="Something to work to">
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "all", label: "All" },
            { value: "playlist", label: "Playlists" },
            { value: "album", label: "Albums" },
            { value: "track", label: "Songs" },
          ]}
        />
      </PageHeader>

      <form onSubmit={add} className="mb-2">
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1 focus-within:border-ink-2">
          <Plus size={17} className="text-muted" />
          <input
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none focus-visible:outline-none placeholder:text-muted"
            placeholder="Paste a Spotify link to a playlist, album or song"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            aria-label="Spotify link"
          />
          {parsed && <span className="hidden text-[12px] text-muted md:inline">{KIND_LABEL[parsed.kind]}</span>}
          <button className="btn btn-primary" disabled={!link.trim()}>
            Add
          </button>
        </div>
      </form>
      <p className="mb-8 text-[12.5px] text-muted">
        In Spotify, open a playlist, album or song and choose Share → Copy link. It plays in the player at the bottom and keeps playing while you move between
        tabs. Sign in to Spotify in this browser to hear whole songs instead of previews.
      </p>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <Music2 size={22} className="mx-auto mb-2 text-muted" />
          <p className="text-[14px] text-ink-2">Nothing saved yet. Paste your first Spotify link above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          <AnimatePresence initial={false}>
            {shown.map((m) => (
              <Card key={m.id} m={m} playing={current?.id === m.id} onPlay={() => play(m)} />
            ))}
          </AnimatePresence>
        </div>
      )}
      {items.length > 0 && shown.length === 0 && <p className="text-[13.5px] text-muted">Nothing here under this filter.</p>}
    </Page>
  );
}

function Card({ m, playing, onPlay }: { m: MusicItem; playing: boolean; onPlay: () => void }) {
  const { remove, update } = useData();
  const { current, stop } = useMusic();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: sec(0.3), ease: EASE }}
      className="group min-w-0"
    >
      <button type="button" onClick={onPlay} className="relative block aspect-square w-full overflow-hidden rounded-lg bg-sunken text-left" aria-label={`Play ${m.title}`}>
        {m.image ? (
          <img src={m.image} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted">
            <Music2 size={28} />
          </span>
        )}
        <span
          className={cx(
            "absolute bottom-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-ink text-bg shadow-pop transition-[opacity,transform] duration-300",
            playing ? "opacity-100" : "translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100",
          )}
        >
          {playing ? <Bars className="!h-4 !w-4 [&>span]:!bg-bg" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
        </span>
      </button>
      <div className="mt-2 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <input
            aria-label="Name"
            key={m.title}
            defaultValue={m.title}
            title="Click to rename"
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (!v) e.target.value = m.title;
              else if (v !== m.title) update("music", m.id, { title: v });
            }}
            className={cx(
              "-mx-1 w-full truncate rounded px-1 text-[14px] font-semibold leading-snug outline-none transition-colors duration-200 hover:bg-hover focus:bg-hover bg-transparent",
              playing && "text-accent",
            )}
          />
          <div className="text-[12px] text-muted">{playing ? "Playing" : KIND_LABEL[m.kind]}</div>
        </div>
        <a
          href={openUrl(m.kind, m.spotify_id)}
          target="_blank"
          rel="noreferrer"
          aria-label="Open in Spotify"
          className="rounded-md p-1 text-muted opacity-0 transition-opacity duration-200 hover:text-ink group-hover:opacity-100 max-md:opacity-60"
        >
          <ExternalLink size={14} />
        </a>
        <button
          type="button"
          aria-label={`Remove ${m.title}`}
          className="rounded-md p-1 text-muted opacity-0 transition-opacity duration-200 hover:text-pen group-hover:opacity-100 max-md:opacity-60"
          onClick={() => {
            if (current?.id === m.id) stop();
            remove("music", m.id);
          }}
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}
