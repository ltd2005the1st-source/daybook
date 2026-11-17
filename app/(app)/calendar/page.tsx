"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { needsScope, useCalendarEdits, type Scope, type Target } from "@/components/calendar-edit";
import { CheckSheet } from "@/components/checks";
import { ColorPicker } from "@/components/color-picker";
import { useData } from "@/components/data";
import { EventSheet, LessonSheet } from "@/components/event-sheet";
import { Page } from "@/components/ui";
import { textOn } from "@/lib/colors";
import { addDays, fmtDay, fromMinutes, minutes, MONTHS, parseDate, startOfWeek, today, WD_SHORT } from "@/lib/dates";
import { cx } from "@/lib/format";
import { agendaOn, CHECK_TIME, checkTasksOn, type Occurrence } from "@/lib/teaching";

const START_H = 6;
const END_H = 24;
const HOUR = 52;
const SNAP = 15; // minutes
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const endLabel = (t: string | null) => (t === "00:00" ? "24:00" : t);

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const q = matchMedia("(max-width: 767px)");
    const f = () => setM(q.matches);
    f();
    q.addEventListener("change", f);
    return () => q.removeEventListener("change", f);
  }, []);
  return m;
}

type Placed = Occurrence & { lane: number; lanes: number; top: number; height: number };

function layout(items: Occurrence[]): Placed[] {
  const timed = items.filter((o) => o.start && o.end && o.kind !== "check").sort((a, b) => minutes(a.start!) - minutes(b.start!));
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((c) => c.lane + 1));
    cluster.forEach((c) => (c.lanes = lanes));
    cluster = [];
  };
  for (const o of timed) {
    const s = minutes(o.start!);
    let e = minutes(o.end!);
    if (e <= s) e = 24 * 60;
    if (s >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => minutes(c.end!) > s || minutes(c.end!) <= minutes(c.start!)).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const p: Placed = { ...o, lane, lanes: 1, top: ((s - START_H * 60) / 60) * HOUR, height: Math.max(20, ((e - s) / 60) * HOUR - 2) };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return placed;
}

type Drag = {
  mode: "move" | "resize" | "create";
  o: Occurrence | null; // null while creating
  pointer: string; // "mouse" | "touch" | "pen"
  x0: number;
  y0: number;
  origin: number; // minute where the pointer went down
  grab: number; // minutes between the pointer and the block's start
  origDate: string;
  date: string;
  start: number;
  end: number;
  active: boolean;
};

type Pending = { o: Occurrence; to: Target };

export default function CalendarPage() {
  const { store, update } = useData();
  const apply = useCalendarEdits();
  const mobile = useIsMobile();
  const [anchor, setAnchor] = useState(today());
  const [newAt, setNewAt] = useState<{ date: string; start: string; end?: string } | null>(null);
  const [openEvent, setOpenEvent] = useState<{ id: string; date: string } | null>(null);
  const [openLesson, setOpenLesson] = useState<Occurrence | null>(null);
  const [openCheck, setOpenCheck] = useState<{ studentId: string; date: string } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [colorMenu, setColorMenu] = useState<{ o: Occurrence; x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<Drag | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const t = today();

  const days = useMemo(() => {
    if (mobile) return [anchor];
    const s = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [anchor, mobile]);

  useEffect(() => {
    const h = new Date().getHours();
    scroller.current?.scrollTo({ top: (Math.max(7, Math.min(h - 1, 18)) - START_H) * HOUR - 8 });
  }, [mobile]);

  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  useEffect(() => {
    const i = setInterval(() => setNowMin(new Date().getHours() * 60 + new Date().getMinutes()), 60_000);
    return () => clearInterval(i);
  }, []);

  // The header never moves: the page itself doesn't scroll here, only the time grid does.
  const caption = useRef<HTMLParagraphElement>(null);
  const [gridH, setGridH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const prev = [root.style.overflow, document.body.style.overflow, root.style.overscrollBehavior];
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    window.scrollTo(0, 0);
    const fit = () => {
      const sc = scroller.current;
      if (!sc) return;
      const nav = document.querySelector<HTMLElement>("[data-bottom-nav]");
      const navH = nav && getComputedStyle(nav).display !== "none" ? nav.offsetHeight : 0;
      const capH = caption.current ? caption.current.offsetHeight + 8 : 0;
      const bottomGap = mobile ? 10 : 24;
      setGridH(Math.max(200, window.innerHeight - sc.getBoundingClientRect().top - capH - navH - bottomGap));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (caption.current) ro.observe(caption.current);
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      [root.style.overflow, document.body.style.overflow, root.style.overscrollBehavior] = prev;
    };
  }, [mobile]);

  const step = mobile ? 1 : 7;
  const first = parseDate(days[0]);
  const title = `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  const weekStrip = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

  const onOcc = (o: Occurrence) => {
    if (o.kind === "event" && o.event) setOpenEvent({ id: o.event.id, date: o.date });
    else if (o.kind === "check" && o.studentId) setOpenCheck({ studentId: o.studentId, date: o.date });
    else setOpenLesson(o);
  };

  /* ---------- Dragging ---------- */

  const minuteAt = (clientY: number, date: string) => {
    const col = cols.current.get(date);
    if (!col) return START_H * 60;
    const y = clientY - col.getBoundingClientRect().top;
    return (y / HOUR) * 60 + START_H * 60;
  };
  const dateAt = (clientX: number, fallback: string) => {
    let best = fallback;
    let bestDist = Infinity;
    for (const [d, el] of cols.current) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return d;
      const dist = Math.min(Math.abs(clientX - r.left), Math.abs(clientX - r.right));
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  };

  const blockTouchScroll = useCallback((e: TouchEvent) => {
    if (dragRef.current?.active) e.preventDefault();
  }, []);

  // The listeners attached for the current drag, so they can be removed exactly.
  const listeners = useRef<{ move: (e: PointerEvent) => void; up: () => void; cancel: () => void } | null>(null);
  const cleanup = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    const l = listeners.current;
    if (l) {
      window.removeEventListener("pointermove", l.move);
      window.removeEventListener("pointerup", l.up);
      window.removeEventListener("pointercancel", l.cancel);
      listeners.current = null;
    }
    document.body.classList.remove("cal-dragging");
  }, [blockTouchScroll]);

  function activate() {
    const d = dragRef.current;
    if (!d) return;
    d.active = true;
    document.body.classList.add("cal-dragging");
    if (d.pointer === "touch") navigator.vibrate?.(8);
    setDrag({ ...d });
  }

  function onMove(e: PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (!d.active) {
      if (d.pointer === "touch") {
        // Moving before the long-press finishes means you are scrolling, not dragging.
        if (dist > 8) {
          cleanup();
          dragRef.current = null;
        }
        return;
      }
      if (dist < 4) return;
      activate();
    }
    // Scroll the grid when dragging near its top or bottom edge.
    const sc = scroller.current;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (e.clientY < r.top + 28) sc.scrollBy({ top: -14 });
      else if (e.clientY > r.bottom - 28) sc.scrollBy({ top: 14 });
    }
    const len = d.end - d.start;
    if (d.mode === "move") {
      d.date = mobile ? d.origDate : dateAt(e.clientX, d.date);
      const m = minuteAt(e.clientY, d.date);
      d.start = Math.min(Math.max(snap(m - d.grab), START_H * 60), 24 * 60 - len);
      d.end = d.start + len;
    } else if (d.mode === "resize") {
      const m = minuteAt(e.clientY, d.date);
      d.end = Math.min(Math.max(snap(m), d.start + SNAP), 24 * 60);
    } else {
      const m = Math.min(Math.max(minuteAt(e.clientY, d.date), START_H * 60), 24 * 60);
      const a = Math.floor(d.origin / SNAP) * SNAP;
      const b = snap(m);
      d.start = Math.min(a, b);
      d.end = Math.max(Math.max(a, b), d.start + SNAP);
    }
    setDrag({ ...d });
  }

  function onUp() {
    const d = dragRef.current;
    cleanup();
    dragRef.current = null;
    if (!d || !d.active) {
      setDrag(null);
      return;
    }
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    if (d.mode === "create") {
      setDrag(null);
      setNewAt({ date: d.date, start: fromMinutes(d.start), end: fromMinutes(d.end) });
      return;
    }
    const o = d.o!;
    const to: Target = { date: d.date, start: fromMinutes(d.start), end: fromMinutes(d.end) };
    if (to.date === o.date && to.start === o.start && to.end === o.end) {
      setDrag(null);
      return;
    }
    if (needsScope(o)) {
      setPending({ o, to }); // keep the block where it was dropped while you choose
      return;
    }
    apply(o, to, "one");
    setDrag(null);
  }

  function onCancel() {
    cleanup();
    dragRef.current = null;
    setDrag(null);
  }

  function begin(e: React.PointerEvent, o: Occurrence | null, mode: Drag["mode"], date: string) {
    if (e.button !== 0 || pending) return;
    if (mode === "create" && e.pointerType !== "mouse") return; // on phones, tap empty space to add instead
    e.stopPropagation();
    const origin = minuteAt(e.clientY, date);
    const s = o?.start ? minutes(o.start) : origin;
    let en = o?.end ? minutes(o.end) : origin + SNAP;
    if (o && en <= s) en = 24 * 60;
    dragRef.current = {
      mode,
      o,
      pointer: e.pointerType,
      x0: e.clientX,
      y0: e.clientY,
      origin,
      grab: origin - s,
      origDate: date,
      date,
      start: s,
      end: en,
      active: false,
    };
    cleanup();
    listeners.current = { move: onMove, up: onUp, cancel: onCancel };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    if (e.pointerType === "touch") {
      holdTimer.current = setTimeout(activate, 380);
    }
  }

  useEffect(() => cleanup, [cleanup]);
  // Phones decide whether a touch scrolls before the drag starts, so this listener has to be
  // in place from the start. It only blocks scrolling while a block is being dragged.
  useEffect(() => {
    document.addEventListener("touchmove", blockTouchScroll, { passive: false });
    return () => document.removeEventListener("touchmove", blockTouchScroll);
  }, [blockTouchScroll]);

  const choose = (scope: Scope | null) => {
    if (pending && scope) apply(pending.o, pending.to, scope);
    setPending(null);
    setDrag(null);
  };

  /* ---------- Rendering ---------- */

  const ghostFor = (d: string) => {
    if (!drag?.active || drag.date !== d) return null;
    return drag;
  };

  return (
    <Page wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="label mb-1">Calendar</div>
          <h1 className="display text-[30px] md:text-[38px] font-semibold leading-[1.05]">{title}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button aria-label="Previous" className="btn btn-ghost px-1.5" onClick={() => setAnchor(addDays(anchor, -step))}>
            <ChevronLeft size={17} />
          </button>
          <button className="btn btn-line" onClick={() => setAnchor(t)}>
            Today
          </button>
          <button aria-label="Next" className="btn btn-ghost px-1.5" onClick={() => setAnchor(addDays(anchor, step))}>
            <ChevronRight size={17} />
          </button>
          <button className="btn btn-primary ml-1" onClick={() => setNewAt({ date: anchor, start: "09:00" })}>
            <Plus size={15} /> Event
          </button>
        </div>
      </div>

      {mobile && (
        <div className="mb-3 grid grid-cols-7 gap-1">
          {weekStrip.map((d) => {
            const sel = d === anchor;
            const n = agendaOn(store, d).length;
            return (
              <button key={d} onClick={() => setAnchor(d)} className={cx("flex flex-col items-center rounded-lg py-1.5", sel ? "bg-ink text-bg" : "hover:bg-hover")}>
                <span className={cx("text-[10.5px]", sel ? "opacity-80" : "text-muted")}>{WD_SHORT[parseDate(d).getDay()]}</span>
                <span className={cx("num text-[15px] font-semibold", d === t && !sel && "text-accent")}>{parseDate(d).getDate()}</span>
                <span className={cx("mt-0.5 h-1 w-1 rounded-full", n ? (sel ? "bg-bg" : "bg-muted") : "bg-transparent")} />
              </button>
            );
          })}
        </div>
      )}

      <div className="card overflow-hidden">
        {/* Day headers */}
        {!mobile && (
          <div className="grid border-b border-line" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
            <div className="num self-end px-1 pb-1 text-[10px] text-muted">GMT+7</div>
            {days.map((d) => (
              <button key={d} onClick={() => setAnchor(d)} className="flex flex-col items-center py-2 hover:bg-hover">
                <span className="label !text-[10.5px]">{WD_SHORT[parseDate(d).getDay()]}</span>
                <span className={cx("num mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-[18px]", d === t ? "bg-pen text-white font-semibold" : "text-ink")}>
                  {parseDate(d).getDate()}
                </span>
              </button>
            ))}
          </div>
        )}
        <div
          ref={scroller}
          className="relative overflow-y-auto overscroll-contain"
          style={{ height: gridH ?? undefined, maxHeight: gridH ? undefined : "calc(100dvh - 230px)" }}
        >
          <div className="grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
            {/* Hours */}
            <div className="relative" style={{ height: (END_H - START_H) * HOUR }}>
              {Array.from({ length: END_H - START_H }, (_, i) => (
                <div key={i} className="num absolute right-2 -translate-y-1/2 text-[10.5px] text-muted" style={{ top: i * HOUR }}>
                  {i === 0 ? "" : `${String(START_H + i).padStart(2, "0")}:00`}
                </div>
              ))}
            </div>
            {days.map((d) => {
              const draggingKey = drag?.active && drag.o ? drag.o.key : null;
              // The dragged block stays in place (faded) so a phone keeps sending its touch events to it.
              const items = agendaOn(store, d);
              const placed = layout(items);
              const ghost = ghostFor(d);
              return (
                <div
                  key={d}
                  ref={(el) => {
                    if (el) cols.current.set(d, el);
                    else cols.current.delete(d);
                  }}
                  className="relative border-l border-line"
                  style={{
                    height: (END_H - START_H) * HOUR,
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${HOUR}px)`,
                  }}
                  onPointerDown={(e) => begin(e, null, "create", d)}
                  onClick={(e) => {
                    if (suppressClick.current || pending) return;
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const m = Math.floor(((y / HOUR) * 60 + START_H * 60) / 30) * 30;
                    setNewAt({ date: d, start: fromMinutes(m) });
                  }}
                >
                  {placed.map((o) => (
                    <Block
                      key={o.key}
                      o={o}
                      dragging={o.key === draggingKey}
                      onPointerDown={(e, mode) => begin(e, o, mode, d)}
                      onOpen={() => !suppressClick.current && !pending && onOcc(o)}
                      onMenu={(x, y) => !dragRef.current && setColorMenu({ o, x, y })}
                    />
                  ))}
                  <CheckLine date={d} onOpen={(studentId) => !suppressClick.current && setOpenCheck({ studentId, date: d })} />
                  {ghost && <Ghost drag={ghost} />}
                  {d === t && nowMin >= START_H * 60 && (
                    <div className="pointer-events-none absolute inset-x-0 z-[2] flex items-center" style={{ top: ((nowMin - START_H * 60) / 60) * HOUR }}>
                      <span className="-ml-1 h-2 w-2 rounded-full bg-pen" />
                      <span className="h-[1.5px] flex-1 bg-pen" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p ref={caption} className="mt-2 hidden text-[12px] text-muted md:block">
        {mobile
          ? "Press and hold a block to move it, or hold its bottom edge to change the length. Tap empty space to add an event."
          : "Drag a block to move it, drag its bottom edge to change the length, and right-click it to change the colour. Drag across empty space to add an event."}{" "}
        The slim blocks at {CHECK_TIME} are homework checks: tap one to tick it off or change what to check.
      </p>

      {/* "This one or all?" after moving something that repeats */}
      <AnimatePresence>
        {pending && (
          <div className="fixed inset-0 z-50 flex items-end justify-center p-4 md:items-center">
            <motion.div className="absolute inset-0 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => choose(null)} />
            <motion.div
              role="dialog"
              aria-label="Apply the change to"
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.3, ease: [0.65, 0, 0.35, 1] }}
              className="relative w-full max-w-[340px] rounded-xl border border-line bg-surface p-4 shadow-pop"
            >
              <div className="display mb-1 text-[17px] font-semibold">{pending.o.kind === "lesson" ? "Move this class" : "Change repeating event"}</div>
              <p className="mb-3 text-[13px] text-ink-2">
                {pending.o.title} → {fmtDay(pending.to.date, { weekday: true })}, <span className="num">{pending.to.start}–{endLabel(pending.to.end)}</span>
              </p>
              <div className="flex flex-col gap-1.5">
                <button className="btn btn-primary justify-center" onClick={() => choose("one")}>
                  {pending.o.kind === "lesson" ? "This class only" : "This event only"}
                </button>
                <button className="btn btn-line justify-center" onClick={() => choose("all")}>
                  {pending.o.kind === "lesson" ? "Every week from now on" : "All events in the series"}
                </button>
                <button className="btn btn-ghost justify-center" onClick={() => choose(null)}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Right-click colour menu */}
      {colorMenu && (
        <div className="fixed inset-0 z-50" onClick={() => setColorMenu(null)} onContextMenu={(e) => (e.preventDefault(), setColorMenu(null))}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.12 }}
            className="absolute w-[236px] rounded-xl border border-line bg-surface p-3 shadow-pop"
            style={{ left: Math.min(colorMenu.x, window.innerWidth - 248), top: Math.min(colorMenu.y, window.innerHeight - 150) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="label mb-2 truncate">
              {colorMenu.o.kind === "event" ? colorMenu.o.title : `${store.students.find((s) => s.id === colorMenu.o.studentId)?.name ?? ""} (all their blocks)`}
            </div>
            <ColorPicker
              size={22}
              value={colorMenu.o.color}
              onChange={(c) => {
                const o = colorMenu.o;
                if (o.kind === "event" && o.event) update("events", o.event.id, { color: c });
                else if (o.studentId) update("students", o.studentId, { color: c });
                setColorMenu(null);
              }}
            />
          </motion.div>
        </div>
      )}

      <EventSheet
        open={!!newAt || !!openEvent}
        eventId={openEvent?.id ?? null}
        occurrenceDate={openEvent?.date ?? newAt?.date ?? t}
        defaultStart={newAt?.start}
        defaultEnd={newAt?.end}
        onClose={() => {
          setNewAt(null);
          setOpenEvent(null);
        }}
      />
      <LessonSheet occ={openLesson} onClose={() => setOpenLesson(null)} />
      <CheckSheet at={openCheck} onClose={() => setOpenCheck(null)} />
    </Page>
  );
}

function blockStyle(o: Pick<Occurrence, "kind" | "color">) {
  const isCheck = o.kind === "check";
  return {
    background: isCheck ? `color-mix(in oklab, ${o.color} 14%, var(--surface))` : o.color,
    color: isCheck ? "var(--ink)" : textOn(o.color),
    borderLeft: isCheck ? `3px solid ${o.color}` : undefined,
    outline: isCheck ? `1px dashed color-mix(in oklab, ${o.color} 50%, transparent)` : undefined,
    outlineOffset: -1,
  } as React.CSSProperties;
}

function Block({
  o,
  dragging,
  onPointerDown,
  onOpen,
  onMenu,
}: {
  o: Placed;
  dragging?: boolean;
  onPointerDown: (e: React.PointerEvent, mode: "move" | "resize") => void;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const struck = o.status === "cancelled" || o.status === "missed_owe";
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onMenu(e.clientX, e.clientY);
      }}
      className={cx(
        "cal-block group absolute flex cursor-grab flex-col justify-start overflow-hidden rounded-[6px] px-1.5 py-1 text-left text-[11.5px] leading-tight transition-[filter,box-shadow] hover:brightness-110",
        struck && "opacity-45",
        dragging && "!opacity-30",
      )}
      style={{
        top: o.top,
        height: o.height,
        left: `calc(${(o.lane / o.lanes) * 100}% + 2px)`,
        width: `calc(${100 / o.lanes}% - 4px)`,
        ...blockStyle(o),
      }}
    >
      <div className={cx("font-semibold truncate", struck && "line-through")}>
        {o.title}
        {o.tentative && " (pending)"}
      </div>
      {o.height > 30 && (
        <div className="num opacity-80">
          {o.start}–{endLabel(o.end)}
        </div>
      )}
      {o.status === "taught" && o.height > 44 && <div className="opacity-90">✓ taught</div>}
      {/* Bottom edge: drag to change the length */}
      <div
        aria-hidden
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown(e, "resize");
        }}
        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
      >
        <span className="mx-auto mt-[3px] block h-[3px] w-5 rounded-full bg-current opacity-0 transition-opacity group-hover:opacity-50" />
      </div>
    </div>
  );
}

function Ghost({ drag }: { drag: Drag }) {
  const top = ((drag.start - START_H * 60) / 60) * HOUR;
  const height = Math.max(20, ((drag.end - drag.start) / 60) * HOUR - 2);
  const o = drag.o;
  const label = `${fromMinutes(drag.start)}–${drag.end >= 1440 ? "24:00" : fromMinutes(drag.end)}`;
  return (
    <div
      className="pointer-events-none absolute inset-x-[2px] z-[3] flex flex-col overflow-hidden rounded-[6px] px-1.5 py-1 text-[11.5px] leading-tight shadow-pop ring-2 ring-white/70"
      style={{ top, height, ...(o ? blockStyle(o) : { background: "var(--accent)", color: "white", opacity: 0.9 }) }}
    >
      <div className="font-semibold truncate">{o ? o.title : "New event"}</div>
      <div className="num opacity-90">{label}</div>
    </div>
  );
}

/** Homework checks at 22:30: slim blocks in the student's colour, stacked under each other. */
function CheckLine({ date, onOpen }: { date: string; onOpen: (studentId: string) => void }) {
  const { store } = useData();
  const checks = checkTasksOn(store, date);
  if (!checks.length) return null;
  const top = ((minutes(CHECK_TIME) - START_H * 60) / 60) * HOUR;
  return (
    <div className="absolute inset-x-0 z-[1] flex flex-col gap-[2px]" style={{ top: top + 1 }} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      {checks.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onOpen(c.student.id)}
          title={`${CHECK_TIME}${c.contents ? ` · ${c.contents}` : ""}`}
          className={cx(
            "mx-[2px] flex h-[19px] min-w-0 items-center gap-1 overflow-hidden rounded-[6px] px-1.5 text-left text-[11px] leading-none transition-[filter,opacity] duration-300 hover:brightness-110",
            c.done && "opacity-45",
          )}
          style={{ background: c.student.color, color: textOn(c.student.color) }}
        >
          <span className={cx("truncate font-semibold", c.done && "line-through")}>Check {c.student.name}</span>
        </button>
      ))}
    </div>
  );
}
