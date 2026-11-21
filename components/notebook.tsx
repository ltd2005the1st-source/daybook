"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, NotebookPen, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { useData } from "./data";
import { createNote, deleteNote, editNote, flushAll, restoreNote, useNotebook, type Note } from "./notebook-store";
import { EVENT_COLORS } from "@/lib/colors";
import { cx, fold } from "@/lib/format";
import { MONTHS } from "@/lib/dates";
import { sec } from "@/lib/motion";
import { ONLINE } from "@/lib/supabase";

const EASE = [0.65, 0, 0.35, 1] as const;

/** "20:31" today, "21 Nov" this year, "21 Nov 2025" before that. */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const base = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

function longWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Flair = { name: string; color: string };

export function FlairChip({ name, color, className }: { name: string; color: string; className?: string }) {
  return (
    <span
      className={cx("inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-px text-[11.5px] font-medium leading-[18px]", className)}
      style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color: `color-mix(in oklab, ${color} 62%, var(--ink))` }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

const blank = (n: Note) => !n.title.trim() && !n.body.trim();

export function Notebook({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useData();
  const nb = useNotebook(toast);
  const [selected, setSelected] = useState<string | null>(null);
  // Phones show the list or one note at a time.
  const [phoneView, setPhoneView] = useState<"list" | "note">("list");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [flairOpen, setFlairOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const sorted = useMemo(() => [...nb.notes].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)), [nb.notes]);
  const flairs = useMemo(() => {
    const seen = new Map<string, Flair>();
    for (const n of sorted) if (n.flair && n.flair_color && !seen.has(fold(n.flair))) seen.set(fold(n.flair), { name: n.flair, color: n.flair_color });
    return [...seen.values()];
  }, [sorted]);
  const shown = useMemo(() => {
    const q = fold(query.trim());
    return sorted.filter((n) => (!filter || (n.flair && fold(n.flair) === filter)) && (!q || fold(`${n.title} ${n.body} ${n.flair ?? ""}`).includes(q)));
  }, [sorted, query, filter]);
  const note = nb.notes.find((n) => n.id === selected) ?? null;

  // A blank note you walk away from is dropped, so "New note" never leaves "Untitled" litter behind.
  const leave = (id: string | null) => {
    const n = nb.notes.find((x) => x.id === id);
    if (n && blank(n)) deleteNote(n.id);
  };
  const pick = (id: string) => {
    if (id !== selected) leave(selected);
    setSelected(id);
    setPhoneView("note");
    setFlairOpen(false);
  };
  const add = () => {
    leave(selected);
    const f = filter ? flairs.find((x) => fold(x.name) === filter) : null;
    const n = createNote(f ? { flair: f.name, flair_color: f.color } : {});
    setSelected(n.id);
    setPhoneView("note");
    setQuery("");
    requestAnimationFrame(() => titleRef.current?.focus());
  };
  const close = () => {
    leave(selected);
    flushAll();
    setFlairOpen(false);
    onClose();
  };
  const remove = (n: Note) => {
    const victim = deleteNote(n.id);
    const next = shown.find((x) => x.id !== n.id);
    setSelected(next?.id ?? null);
    setPhoneView("list");
    if (victim && !blank(victim)) toast("Note deleted", () => restoreNote(victim));
  };

  // On opening, land on the newest note (desktop) or the list (phone).
  useEffect(() => {
    if (!open) return;
    setPhoneView("list");
    setSelected((cur) => (cur && nb.notes.some((n) => n.id === cur) ? cur : sorted[0]?.id ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // First load finishing after the window opened.
  useEffect(() => {
    if (open && !selected && sorted.length && nb.mode !== "loading") setSelected(sorted[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nb.mode, sorted.length]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (flairOpen) setFlairOpen(false);
        else close();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  return (
    <AnimatePresence>
      {open && (
        <div data-scroll-contain className="no-print fixed inset-0 z-40 flex items-end justify-center md:items-center md:p-6 md:pb-[calc(1.5rem+var(--dock,0px))]">
          <motion.div className="absolute inset-0 bg-[var(--scrim)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="My Notebook"
            initial={{ opacity: 0, y: 28, scale: 0.98, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 28, scale: 0.98, filter: "blur(6px)" }}
            transition={{ duration: sec(0.34), ease: EASE }}
            style={{ transformOrigin: "50% 100%" }}
            className="relative flex h-[92dvh] w-full overflow-hidden rounded-t-xl glass-thick md:h-full md:max-h-[760px] md:max-w-[1080px] md:rounded-xl"
          >
            {/* Side list. Concentric corners: 12px window, 6px padding, so rows are 6px. */}
            <aside
              className={cx(
                "flex min-w-0 flex-col md:w-[300px] md:shrink-0 md:border-r md:border-line",
                phoneView === "list" ? "flex w-full" : "hidden md:flex",
              )}
            >
              <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
                <h3 className="display flex items-center gap-2 text-[20px] font-semibold">
                  <NotebookPen size={19} strokeWidth={1.9} className="text-accent" /> My Notebook
                </h3>
                <div className="flex items-center gap-1">
                  <button aria-label="New note" title="New note" onClick={add} className="press btn-primary inline-flex h-8 w-8 items-center justify-center rounded-full p-0">
                    <Plus size={17} strokeWidth={2.2} />
                  </button>
                  <button aria-label="Close" onClick={close} className="press glass-pill inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:text-ink md:hidden">
                    <X size={17} />
                  </button>
                </div>
              </div>
              <div className="px-3 pb-2">
                <label className="relative block">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notes" className="field text-[13.5px]" style={{ paddingLeft: 32 }} />
                </label>
                {flairs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {flairs.map((f) => {
                      const on = filter === fold(f.name);
                      return (
                        <button
                          key={f.name}
                          onClick={() => setFilter(on ? null : fold(f.name))}
                          aria-pressed={on}
                          className={cx("press rounded-full transition-opacity", filter && !on && "opacity-45 hover:opacity-80", on && "ring-1 ring-[var(--line-strong)]")}
                        >
                          <FlairChip name={f.name} color={f.color} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-[max(var(--sab),8px)]">
                {nb.mode === "loading" ? (
                  <p className="px-3 py-6 text-[13px] text-muted">Loading notes…</p>
                ) : shown.length === 0 ? (
                  <div className="px-3 py-8 text-center text-[13px] text-muted">
                    {nb.notes.length ? "No notes match." : "No notes yet."}
                    {!nb.notes.length && (
                      <button onClick={add} className="press btn btn-line mx-auto mt-3 flex items-center gap-1.5">
                        <Plus size={15} /> New note
                      </button>
                    )}
                  </div>
                ) : (
                  <ul className="flex flex-col gap-px">
                    {shown.map((n) => {
                      const on = n.id === selected;
                      const preview = n.body.trim().split("\n")[0];
                      return (
                        <li key={n.id}>
                          <button
                            onClick={() => pick(n.id)}
                            aria-current={on ? "true" : undefined}
                            className={cx("press relative w-full rounded-[6px] px-3 py-2 text-left", on ? "glass-pill" : "hover:bg-hover")}
                          >
                            <div className="flex items-baseline gap-2">
                              <span className={cx("min-w-0 flex-1 truncate text-[14px]", n.title.trim() ? "font-medium text-ink" : "text-muted")}>{n.title.trim() || "Untitled"}</span>
                              <span className="num shrink-0 text-[11.5px] text-muted">{when(n.updated_at)}</span>
                            </div>
                            {preview && <p className="mt-0.5 truncate text-[12.5px] text-ink-2">{preview}</p>}
                            {n.flair && n.flair_color && <FlairChip name={n.flair} color={n.flair_color} className="mt-1.5" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {ONLINE && nb.mode === "device" && (
                <p className="border-t border-line px-4 py-2 text-[11.5px] leading-snug text-muted">Saved on this device until the notebook is set up online.</p>
              )}
            </aside>

            {/* Editor */}
            <section className={cx("relative min-w-0 flex-1 flex-col", phoneView === "note" ? "flex" : "hidden md:flex")}>
              <div className="flex items-center gap-2 px-4 pt-4 pb-2 md:px-6">
                <button aria-label="All notes" onClick={() => { leave(selected); setPhoneView("list"); }} className="press glass-pill inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:text-ink md:hidden">
                  <ArrowLeft size={17} />
                </button>
                {note && (
                  <div className="relative">
                    <button onClick={() => setFlairOpen((v) => !v)} className="press flex items-center rounded-full" aria-label="Flair" aria-expanded={flairOpen}>
                      {note.flair && note.flair_color ? (
                        <FlairChip name={note.flair} color={note.flair_color} className="py-[3px] text-[12.5px]" />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line-strong px-2.5 py-[2px] text-[12.5px] text-muted hover:text-ink">
                          <Tag size={12} /> Add flair
                        </span>
                      )}
                    </button>
                    <AnimatePresence>
                      {flairOpen && (
                        <FlairMenu
                          flairs={flairs}
                          current={note.flair}
                          onPick={(f) => {
                            editNote(note.id, { flair: f?.name ?? null, flair_color: f?.color ?? null }, true);
                            setFlairOpen(false);
                          }}
                          onClose={() => setFlairOpen(false)}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                )}
                <div className="flex-1" />
                {note && (
                  <span className="num hidden text-[11.5px] text-muted sm:inline" title={`Created ${longWhen(note.created_at)}`}>
                    {nb.saving ? "Saving…" : `Edited ${longWhen(note.updated_at)}`}
                  </span>
                )}
                {note && (
                  <button aria-label="Delete note" title="Delete note" onClick={() => remove(note)} className="press inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-hover hover:text-pen">
                    <Trash2 size={16} />
                  </button>
                )}
                <button aria-label="Close" onClick={close} className="press glass-pill hidden h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:text-ink md:inline-flex">
                  <X size={17} />
                </button>
              </div>
              {note ? (
                <div className="flex min-h-0 flex-1 flex-col px-4 pb-[max(var(--sab),16px)] md:px-6 md:pb-6">
                  <input
                    ref={titleRef}
                    value={note.title}
                    onChange={(e) => editNote(note.id, { title: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        bodyRef.current?.focus();
                      }
                    }}
                    placeholder="Untitled"
                    aria-label="Note title"
                    className="display w-full bg-transparent py-1 text-[26px] font-semibold leading-tight text-ink outline-none placeholder:text-muted/70"
                  />
                  <textarea
                    ref={bodyRef}
                    value={note.body}
                    onChange={(e) => editNote(note.id, { body: e.target.value })}
                    placeholder="Start writing…"
                    aria-label="Note"
                    className="mt-2 min-h-0 w-full flex-1 resize-none overflow-y-auto overscroll-contain bg-transparent text-[15px] leading-relaxed text-ink outline-none placeholder:text-muted/70"
                  />
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[13.5px] text-muted">
                  <NotebookPen size={28} strokeWidth={1.5} />
                  {nb.mode === "loading" ? "Loading…" : "Pick a note on the left, or start a new one."}
                  {nb.mode !== "loading" && (
                    <button onClick={add} className="press btn btn-primary flex items-center gap-1.5">
                      <Plus size={15} /> New note
                    </button>
                  )}
                </div>
              )}
            </section>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Choose one of the flairs you've used, take it off, or make a new one with a colour. */
function FlairMenu({ flairs, current, onPick, onClose }: { flairs: Flair[]; current: string | null; onPick: (f: Flair | null) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(EVENT_COLORS[6].hex);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    // Wait a frame so the click that opened it doesn't close it.
    const t = setTimeout(() => document.addEventListener("pointerdown", away), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", away);
    };
  }, [onClose]);
  const submit = () => {
    const n = name.trim();
    if (!n) return;
    const existing = flairs.find((f) => fold(f.name) === fold(n));
    onPick(existing ?? { name: n, color });
  };
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: sec(0.22), ease: EASE }}
      className="glass-thick absolute left-0 top-[calc(100%+8px)] z-20 w-[268px] rounded-xl p-3"
    >
      {flairs.length > 0 && (
        <>
          <p className="label mb-1.5">Flairs</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {flairs.map((f) => (
              <button key={f.name} onClick={() => onPick(f)} className="press inline-flex items-center gap-1 rounded-full">
                <FlairChip name={f.name} color={f.color} />
                {current && fold(current) === fold(f.name) && <Check size={13} className="text-accent" />}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="label mb-1.5">New flair</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Name, e.g. Ideas"
        maxLength={24}
        className="field text-[13.5px]"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {EVENT_COLORS.map((c) => (
          <button
            key={c.hex}
            title={c.name}
            aria-label={c.name}
            aria-pressed={c.hex === color}
            onClick={() => setColor(c.hex)}
            className={cx("h-5 w-5 rounded-full transition-transform hover:scale-110", c.hex === color && "ring-2 ring-ink ring-offset-2 ring-offset-[var(--paper)]")}
            style={{ background: c.hex }}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        {current ? (
          <button onClick={() => onPick(null)} className="press text-[12.5px] text-muted hover:text-pen">
            Remove flair
          </button>
        ) : (
          <span />
        )}
        <button onClick={submit} disabled={!name.trim()} className="press btn btn-primary px-3 py-1 text-[12.5px] disabled:opacity-50">
          Add
        </button>
      </div>
    </motion.div>
  );
}
