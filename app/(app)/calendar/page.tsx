"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCheck, ChevronLeft, ChevronRight, ClipboardPaste, Plus, RotateCcw, X } from "lucide-react";
import { copyOf, needsScope, useCalendarEdits, type Scope, type Target } from "@/components/calendar-edit";
import { CheckSheet, useCheckActions } from "@/components/checks";
import { ColorPicker } from "@/components/color-picker";
import { useData } from "@/components/data";
import { EventSheet, LessonSheet } from "@/components/event-sheet";
import { TaskSheet } from "@/components/task-sheet";
import { Page, Segmented } from "@/components/ui";
import { textOn } from "@/lib/colors";
import { addDays, daysInMonth, fmtDay, fromMinutes, minutes, monthOf, MONTHS, parseDate, startOfWeek, today, WD_SHORT } from "@/lib/dates";
import { describeEvent, duplicateEvent } from "@/lib/dupes";
import { cx } from "@/lib/format";
import { agendaOn, checkTasksOn, type Occurrence } from "@/lib/teaching";
import type { CalEvent } from "@/lib/types";

const START_H = 6;
const END_H = 24;
const HOUR = 52;
const SNAP = 15; // minutes
const BAR = 19; // height of a task bar
const EASE = [0.65, 0, 0.35, 1] as const;
const VIEW_KEY = "daybook:calendar-view";
const desktopNow = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
const snap = (m: number) => Math.round(m / SNAP) * SNAP;
const endLabel = (t: string | null) => (t === "00:00" ? "24:00" : t);
/** Tasks and checks sit on top of events as slim bars; events are blocks. */
const isBar = (o: Pick<Occurrence, "kind">) => o.kind === "check" || o.kind === "task";

type View = "week" | "month" | "year";

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
  const timed = items.filter((o) => o.start && o.end && !isBar(o)).sort((a, b) => minutes(a.start!) - minutes(b.start!));
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

/** Bars at the same time stack downwards instead of squeezing sideways. */
function stackBars(items: Occurrence[]): (Occurrence & { top: number })[] {
  const bars = items.filter((o) => isBar(o) && o.start).sort((a, b) => minutes(a.start!) - minutes(b.start!));
  const out: (Occurrence & { top: number })[] = [];
  let lastBottom = -Infinity;
  for (const o of bars) {
    let top = ((minutes(o.start!) - START_H * 60) / 60) * HOUR + 1;
    if (top < lastBottom + 2) top = lastBottom + 2;
    out.push({ ...o, top });
    lastBottom = top + BAR;
  }
  return out;
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
type Clip = { e: CalEvent; date: string };

export default function CalendarPage() {
  const { store, insert, update, remove, toast } = useData();
  const apply = useCalendarEdits();
  const mobile = useIsMobile();
  const [view, setViewState] = useState<View>("week");
  const [anchor, setAnchor] = useState(today());
  const [newAt, setNewAt] = useState<{ date: string; start: string; end?: string } | null>(null);
  const [openEvent, setOpenEvent] = useState<{ id: string; date: string } | null>(null);
  const [openLesson, setOpenLesson] = useState<Occurrence | null>(null);
  const [openCheck, setOpenCheck] = useState<{ studentId: string; date: string; forDate?: string } | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [colorMenu, setColorMenu] = useState<{ o: Occurrence; x: number; y: number } | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [pasting, setPasting] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<Drag | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const hovered = useRef<Occurrence | null>(null);
  const pointerAt = useRef<{ x: number; y: number } | null>(null);
  const t = today();

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY) as View | null;
      if (v === "week" || v === "month" || v === "year") setViewState(v);
    } catch {}
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };
  const openDay = (d: string) => {
    setAnchor(d);
    setView("week");
  };

  const days = useMemo(() => {
    if (mobile) return [anchor];
    const s = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [anchor, mobile]);

  useEffect(() => {
    if (view !== "week") return;
    const h = new Date().getHours();
    scroller.current?.scrollTo({ top: (Math.max(7, Math.min(h - 1, 18)) - START_H) * HOUR - 8 });
  }, [mobile, view]);

  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  useEffect(() => {
    const i = setInterval(() => setNowMin(new Date().getHours() * 60 + new Date().getMinutes()), 60_000);
    return () => clearInterval(i);
  }, []);

  // In the week view the header never moves: the page itself doesn't scroll, only the time grid does.
  const caption = useRef<HTMLParagraphElement>(null);
  const [gridH, setGridH] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (view !== "week") return;
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
      const dock = document.querySelector<HTMLElement>("[data-music-dock]");
      const dockH = dock && !desktopNow() ? dock.offsetHeight + 8 : 0;
      const bottomGap = mobile ? 10 : 24;
      setGridH(Math.max(200, window.innerHeight - sc.getBoundingClientRect().top - capH - navH - dockH - bottomGap));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (caption.current) ro.observe(caption.current);
    window.addEventListener("resize", fit);
    window.addEventListener("daybook:dock", fit);
    window.visualViewport?.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
      window.removeEventListener("daybook:dock", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      [root.style.overflow, document.body.style.overflow, root.style.overscrollBehavior] = prev;
    };
  }, [mobile, view, pasting]);

  const step = (dir: number) => {
    if (view === "week") setAnchor(addDays(anchor, dir * (mobile ? 1 : 7)));
    else if (view === "month") setAnchor(monthStart(monthOf(anchor), dir));
    else setAnchor(`${parseDate(anchor).getFullYear() + dir}-01-01`);
  };
  const first = parseDate(view === "week" ? days[0] : anchor);
  const title = view === "year" ? `${first.getFullYear()}` : `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  const weekStrip = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

  /* ---------- Mark every task in view done or not done ---------- */

  const checks = useCheckActions();
  const inView = useMemo(() => {
    if (view === "week") return days;
    if (view === "month") return daysInMonth(monthOf(anchor));
    const y = parseDate(anchor).getFullYear();
    return Array.from({ length: 12 }, (_, m) => daysInMonth(`${y}-${String(m + 1).padStart(2, "0")}`)).flat();
  }, [view, days, anchor]);
  const viewTasks = useMemo(() => {
    const set = new Set(inView);
    return {
      checks: inView.flatMap((d) => checkTasksOn(store, d)),
      tasks: store.tasks.filter((x) => !x.student_id && x.due_on && x.due_time && set.has(x.due_on)),
    };
  }, [store, inView]);
  const viewLabel = view === "week" ? (mobile ? "this day" : "this week") : view === "month" ? "this month" : "this year";
  const markAll = (done: boolean) => {
    const cs = viewTasks.checks.filter((c) => c.done !== done);
    const ts = viewTasks.tasks.filter((x) => x.done !== done);
    const prevTasks = ts.map((x) => [x.id, { done: x.done, done_at: x.done_at }] as const);
    cs.forEach((c) => checks.setDone(c, done));
    ts.forEach((x) => update("tasks", x.id, { done, done_at: done ? new Date().toISOString() : null }));
    const n = cs.length + ts.length;
    toast(`${done ? "Marked" : "Unmarked"} ${n} ${n === 1 ? "task" : "tasks"} ${viewLabel}`, () => {
      cs.forEach((c) => checks.setDone(c, !done));
      prevTasks.forEach(([id, p]) => update("tasks", id, p));
    });
  };
  const openCount = viewTasks.checks.filter((c) => !c.done).length + viewTasks.tasks.filter((x) => !x.done).length;
  const doneCount = viewTasks.checks.length + viewTasks.tasks.length - openCount;

  const onOcc = (o: Occurrence) => {
    if (o.event) setOpenEvent({ id: o.event.id, date: o.date });
    else if (o.kind === "check" && o.studentId) setOpenCheck({ studentId: o.studentId, date: o.date, forDate: o.forDate });
    else if (o.kind === "task" && o.taskId) setOpenTask(o.taskId);
    else setOpenLesson(o);
  };

  /* ---------- Copy and paste ---------- */

  const copy = (e: CalEvent, date: string) => {
    setClip({ e, date });
    setPasting(true);
    setOpenEvent(null);
    toast(mobile ? `Copied “${e.title}”. Tap a time to paste it.` : `Copied “${e.title}”. Click a time to paste it, or point at a time and press ⌘V.`);
  };

  const paste = (date: string, startMin: number) => {
    if (!clip) return;
    const e = clip.e;
    const len = e.start_time ? Math.max(SNAP, (minutes(e.end_time ?? e.start_time) || 1440) - minutes(e.start_time)) : 60;
    const s = Math.min(snap(startMin), 24 * 60 - len);
    const row = copyOf(e, date, e.start_time ? { start_time: fromMinutes(s), end_time: fromMinutes(Math.min(1440, s + len) % 1440) } : {});
    const clash = duplicateEvent(store, row as CalEvent);
    if (clash) {
      toast(`${describeEvent(clash)} Not pasted.`);
      return;
    }
    const r = insert("events", row);
    setPasting(false);
    toast(`Pasted “${e.title}” on ${fmtDay(date, { weekday: true })}${row.start_time ? `, ${row.start_time}` : ""}`, () => remove("events", r.id, { silent: true }));
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

  // ⌘C on the event under the pointer, ⌘V at the time under the pointer. Esc stops pasting.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "Escape") setPasting(false);
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "c" && hovered.current?.event) {
        e.preventDefault();
        copy(hovered.current.event, hovered.current.date);
      } else if (k === "v" && clip && pointerAt.current) {
        const { x, y } = pointerAt.current;
        for (const [d, col] of cols.current) {
          const r = col.getBoundingClientRect();
          if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) {
            e.preventDefault();
            paste(d, minuteAt(y, d));
            return;
          }
        }
      }
    };
    const onMove = (e: PointerEvent) => (pointerAt.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
    };
  });

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
  }, []);

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
    const bar = isBar(o);
    const to: Target = { date: d.date, start: fromMinutes(d.start), end: bar ? fromMinutes(d.start) : fromMinutes(d.end) };
    if (to.date === o.date && to.start === o.start && (bar || to.end === o.end)) {
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
    if (e.button !== 0 || pending || pasting) return;
    if (mode === "create" && e.pointerType !== "mouse") return; // on phones, tap empty space to add instead
    e.stopPropagation();
    const origin = minuteAt(e.clientY, date);
    const s = o?.start ? minutes(o.start) : origin;
    let en = o?.end ? minutes(o.end) : origin + SNAP;
    if (o && isBar(o)) en = s + SNAP;
    else if (o && en <= s) en = 24 * 60;
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

  const scopeText = (o: Occurrence) => {
    if (o.kind === "check") {
      const name = o.title.replace("Check ", "");
      return { head: "Move this check", one: "Just this check", all: `All of ${name}’s checks` };
    }
    if (o.kind === "lesson") return { head: "Move this class", one: "This class only", all: "Every class in the series" };
    return { head: "Change repeating event", one: "This event only", all: "All events in the series" };
  };

  return (
    <Page wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="label mb-1">Calendar</div>
          <h1 className="display text-[30px] md:text-[38px] font-semibold leading-[1.05]">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "week", label: mobile ? "Day" : "Week" },
              { value: "month", label: "Month" },
              { value: "year", label: "Year" },
            ]}
            className="mr-1"
          />
          <button
            className="btn btn-line disabled:opacity-40"
            disabled={openCount === 0}
            aria-label="Mark all done"
            onClick={() => markAll(true)}
            title={`Tick every task and homework check ${viewLabel}`}
          >
            <CheckCheck size={15} /> <span className="hidden md:inline">Mark all done</span>
          </button>
          <button
            className="btn btn-line mr-1 disabled:opacity-40"
            disabled={doneCount === 0}
            aria-label="Mark all not done"
            onClick={() => markAll(false)}
            title={`Untick every task and homework check ${viewLabel}`}
          >
            <RotateCcw size={14} /> <span className="hidden md:inline">Mark all not done</span>
          </button>
          <button aria-label="Previous" className="btn btn-ghost px-1.5" onClick={() => step(-1)}>
            <ChevronLeft size={17} />
          </button>
          <button className="btn btn-line" onClick={() => setAnchor(t)}>
            Today
          </button>
          <button aria-label="Next" className="btn btn-ghost px-1.5" onClick={() => step(1)}>
            <ChevronRight size={17} />
          </button>
          <button className="btn btn-primary ml-1" onClick={() => setNewAt({ date: anchor, start: "09:00" })}>
            <Plus size={15} /> Event
          </button>
        </div>
      </div>

      {/* Pasting a copied event */}
      <AnimatePresence initial={false}>
        {pasting && clip && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2 text-[13px]">
              <ClipboardPaste size={15} className="text-accent" />
              <span className="min-w-0 flex-1">
                Pasting <b>{clip.e.title}</b>. {view === "week" ? (mobile ? "Tap a time." : "Click a time.") : "Pick a day."}
              </span>
              <button className="btn btn-ghost px-1.5 py-0.5" onClick={() => setPasting(false)} aria-label="Stop pasting">
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {view === "month" && (
        <MonthView
          month={monthOf(anchor)}
          onDay={(d) => (pasting && clip ? paste(d, clip.e.start_time ? minutes(clip.e.start_time) : 9 * 60) : openDay(d))}
          onOcc={onOcc}
        />
      )}
      {view === "year" && <YearView year={parseDate(anchor).getFullYear()} onDay={openDay} />}

      {view === "week" && (
        <>
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
                  const bars = stackBars(items);
                  const ghost = ghostFor(d);
                  return (
                    <div
                      key={d}
                      ref={(el) => {
                        if (el) cols.current.set(d, el);
                        else cols.current.delete(d);
                      }}
                      className={cx("relative border-l border-line", pasting && "cursor-copy")}
                      style={{
                        height: (END_H - START_H) * HOUR,
                        backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${HOUR}px)`,
                      }}
                      onPointerDown={(e) => begin(e, null, "create", d)}
                      onClick={(e) => {
                        if (suppressClick.current || pending) return;
                        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                        const y = e.clientY - rect.top;
                        const raw = (y / HOUR) * 60 + START_H * 60;
                        if (pasting && clip) return paste(d, raw);
                        const m = Math.floor(raw / 30) * 30;
                        setNewAt({ date: d, start: fromMinutes(m) });
                      }}
                    >
                      {placed.map((o) => (
                        <Block
                          key={o.key}
                          o={o}
                          dragging={o.key === draggingKey}
                          onPointerDown={(e, mode) => begin(e, o, mode, d)}
                          onOpen={() => !suppressClick.current && !pending && !pasting && onOcc(o)}
                          onMenu={(x, y) => !dragRef.current && setColorMenu({ o, x, y })}
                          onHover={(on) => (hovered.current = on ? o : hovered.current?.key === o.key ? null : hovered.current)}
                        />
                      ))}
                      {bars.map((o) => (
                        <Bar
                          key={o.key}
                          o={o}
                          top={o.top}
                          dragging={o.key === draggingKey}
                          onPointerDown={(e) => begin(e, o, "move", d)}
                          onOpen={() => !suppressClick.current && !pending && !pasting && onOcc(o)}
                        />
                      ))}
                      {ghost && <Ghost drag={ghost} />}
                      {d === t && nowMin >= START_H * 60 && (
                        <div className="pointer-events-none absolute inset-x-0 z-[4] flex items-center" style={{ top: ((nowMin - START_H * 60) / 60) * HOUR }}>
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
            Drag an event to move it, drag its bottom edge to change the length, right-click to change the colour. Drag across empty space to add an event. Slim bars
            are tasks and homework checks; drag them to another time. Point at an event and press ⌘C, then ⌘V where you want a copy.
          </p>
        </>
      )}

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
              transition={{ duration: 0.3, ease: EASE }}
              className="relative w-full max-w-[340px] rounded-xl border border-line bg-surface p-4 shadow-pop"
            >
              <div className="display mb-1 text-[17px] font-semibold">{scopeText(pending.o).head}</div>
              <p className="mb-3 text-[13px] text-ink-2">
                {pending.o.title} → {fmtDay(pending.to.date, { weekday: true })},{" "}
                <span className="num">{isBar(pending.o) ? pending.to.start : `${pending.to.start}–${endLabel(pending.to.end)}`}</span>
              </p>
              <div className="flex flex-col gap-1.5">
                <button className="btn btn-primary justify-center" onClick={() => choose("one")}>
                  {scopeText(pending.o).one}
                </button>
                <button className="btn btn-line justify-center" onClick={() => choose("all")}>
                  {scopeText(pending.o).all}
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
      {colorMenu && colorMenu.o.event && (
        <div className="fixed inset-0 z-50" onClick={() => setColorMenu(null)} onContextMenu={(e) => (e.preventDefault(), setColorMenu(null))}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.12 }}
            className="absolute w-[236px] rounded-xl border border-line bg-surface p-3 shadow-pop"
            style={{ left: Math.min(colorMenu.x, window.innerWidth - 248), top: Math.min(colorMenu.y, window.innerHeight - 190) }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="label mb-2 truncate">{colorMenu.o.title}</div>
            <ColorPicker
              size={22}
              value={colorMenu.o.color}
              onChange={(c) => {
                update("events", colorMenu.o.event!.id, { color: c });
                setColorMenu(null);
              }}
            />
            <button className="btn btn-ghost mt-2 w-full justify-start px-1.5 text-[13px]" onClick={() => (copy(colorMenu.o.event!, colorMenu.o.date), setColorMenu(null))}>
              Copy
            </button>
          </motion.div>
        </div>
      )}

      <EventSheet
        open={!!newAt || !!openEvent}
        eventId={openEvent?.id ?? null}
        occurrenceDate={openEvent?.date ?? newAt?.date ?? t}
        defaultStart={newAt?.start}
        defaultEnd={newAt?.end}
        onCopy={copy}
        onClose={() => {
          setNewAt(null);
          setOpenEvent(null);
        }}
      />
      <LessonSheet occ={openLesson} onClose={() => setOpenLesson(null)} />
      <CheckSheet at={openCheck} onClose={() => setOpenCheck(null)} />
      <TaskSheet task={store.tasks.find((x) => x.id === openTask) ?? null} onClose={() => setOpenTask(null)} />
    </Page>
  );
}

const monthStart = (m: string, add: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + add, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

function blockStyle(o: Pick<Occurrence, "kind" | "color">) {
  return { background: o.color, color: textOn(o.color) } as React.CSSProperties;
}

function Block({
  o,
  dragging,
  onPointerDown,
  onOpen,
  onMenu,
  onHover,
}: {
  o: Placed;
  dragging?: boolean;
  onPointerDown: (e: React.PointerEvent, mode: "move" | "resize") => void;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
  onHover: (on: boolean) => void;
}) {
  const struck = o.status === "cancelled" || o.status === "missed_owe";
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
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
        "cal-block group absolute z-[1] flex cursor-grab flex-col justify-start overflow-hidden rounded-[6px] px-1.5 py-1 text-left text-[11.5px] leading-tight transition-[filter,box-shadow] hover:brightness-110",
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
      <div className={cx("font-semibold truncate", struck && "line-through")}>{o.title}</div>
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

/** A task or homework check: a slim bar laid over whatever is happening at that time, without squeezing it. */
function Bar({
  o,
  top,
  dragging,
  onPointerDown,
  onOpen,
}: {
  o: Occurrence;
  top: number;
  dragging?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onOpen: () => void;
}) {
  const check = o.kind === "check";
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={`${o.start} · ${o.title}`}
      className={cx(
        "absolute inset-x-[3px] z-[3] flex cursor-grab items-center gap-1 overflow-hidden rounded-[6px] px-1.5 text-left text-[11px] leading-none shadow-[0_1px_3px_rgba(0,0,0,0.18)] ring-1 ring-white/60 transition-[filter,opacity] duration-300 hover:brightness-110",
        o.done && "opacity-45",
        dragging && "!opacity-30",
      )}
      style={{ top, height: BAR, ...(check ? blockStyle(o) : { background: "var(--ink)", color: "var(--bg)" }) }}
    >
      <span className={cx("truncate font-semibold", o.done && "line-through")}>{o.title}</span>
      <span className="num ml-auto shrink-0 opacity-75">{o.start}</span>
    </button>
  );
}

function Ghost({ drag }: { drag: Drag }) {
  const o = drag.o;
  const top = ((drag.start - START_H * 60) / 60) * HOUR;
  if (o && isBar(o)) {
    return (
      <div
        className="pointer-events-none absolute inset-x-[3px] z-[5] flex items-center overflow-hidden rounded-[6px] px-1.5 text-[11px] leading-none shadow-pop ring-2 ring-white/70"
        style={{ top: top + 1, height: BAR, ...(o.kind === "check" ? blockStyle(o) : { background: "var(--ink)", color: "var(--bg)" }) }}
      >
        <span className="truncate font-semibold">{o.title}</span>
        <span className="num ml-auto pl-1">{fromMinutes(drag.start)}</span>
      </div>
    );
  }
  const height = Math.max(20, ((drag.end - drag.start) / 60) * HOUR - 2);
  const label = `${fromMinutes(drag.start)}–${drag.end >= 1440 ? "24:00" : fromMinutes(drag.end)}`;
  return (
    <div
      className="pointer-events-none absolute inset-x-[2px] z-[5] flex flex-col overflow-hidden rounded-[6px] px-1.5 py-1 text-[11.5px] leading-tight shadow-pop ring-2 ring-white/70"
      style={{ top, height, ...(o ? blockStyle(o) : { background: "var(--accent)", color: "white", opacity: 0.9 }) }}
    >
      <div className="font-semibold truncate">{o ? o.title : "New event"}</div>
      <div className="num opacity-90">{label}</div>
    </div>
  );
}

/* ---------- Month and year ---------- */

function MonthView({ month, onDay, onOcc }: { month: string; onDay: (d: string) => void; onOcc: (o: Occurrence) => void }) {
  const { store } = useData();
  const t = today();
  const first = `${month}-01`;
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = cells[35].startsWith(month) ? 6 : 5;
  return (
    <motion.div key={month} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE }} className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line">
        {cells.slice(0, 7).map((d) => (
          <div key={d} className="label py-2 text-center !text-[10.5px]">
            {WD_SHORT[parseDate(d).getDay()]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.slice(0, weeks * 7).map((d, i) => {
          const items = agendaOn(store, d);
          const inMonth = d.startsWith(month);
          const max = 4;
          return (
            <div
              key={d}
              role="button"
              tabIndex={0}
              onClick={() => onDay(d)}
              onKeyDown={(e) => e.key === "Enter" && onDay(d)}
              className={cx(
                "min-h-[72px] md:min-h-[112px] min-w-0 cursor-pointer border-line p-1 transition-colors hover:bg-hover",
                i % 7 !== 0 && "border-l",
                i >= 7 && "border-t",
                !inMonth && "bg-sunken/60",
              )}
            >
              <div className="mb-0.5 flex justify-center">
                <span
                  className={cx(
                    "num flex h-6 w-6 items-center justify-center rounded-full text-[12.5px]",
                    d === t ? "bg-pen font-semibold text-white" : inMonth ? "text-ink" : "text-muted",
                  )}
                >
                  {parseDate(d).getDate()}
                </span>
              </div>
              <div className="flex flex-col gap-[2px]">
                {items.slice(0, max).map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOcc(o);
                    }}
                    className={cx(
                      // On a phone each item is a thin coloured line; on a computer it has its name.
                      "flex h-[5px] min-w-0 items-center gap-1 overflow-hidden rounded-full text-left text-[11px] leading-tight md:h-auto md:rounded-[4px] md:px-1 md:py-[1px]",
                      (o.done || o.status === "cancelled" || o.status === "missed_owe") && "opacity-45 line-through",
                    )}
                    style={isBar(o) && desktopNow() ? undefined : { background: isBar(o) && o.kind === "task" ? "var(--ink)" : o.color, color: textOn(o.color) }}
                  >
                    {isBar(o) && <span className="hidden h-1.5 w-1.5 shrink-0 rounded-full md:block" style={{ background: o.kind === "check" ? o.color : "var(--ink)" }} />}
                    <span className="hidden truncate md:inline">
                      <span className="num hidden md:inline">{o.start ? `${o.start} ` : ""}</span>
                      {o.title}
                    </span>
                  </button>
                ))}
                {items.length > max && (
                  <span className="px-1 text-[10.5px] text-muted">
                    +{items.length - max}
                    <span className="hidden md:inline"> more</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

function YearView({ year, onDay }: { year: number; onDay: (d: string) => void }) {
  const { store } = useData();
  const t = today();
  return (
    <motion.div key={year} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25, ease: EASE }} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 12 }, (_, m) => {
        const month = `${year}-${String(m + 1).padStart(2, "0")}`;
        const ds = daysInMonth(month);
        const lead = (parseDate(ds[0]).getDay() + 6) % 7; // weeks start on Monday
        return (
          <div key={month} className="card p-3">
            <button className="display mb-2 text-[15px] font-semibold hover:underline" onClick={() => onDay(ds[0])}>
              {MONTHS[m]}
            </button>
            <div className="grid grid-cols-7 gap-y-0.5 text-center">
              {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => (
                <span key={i} className="text-[10px] text-muted">
                  {w}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`x${i}`} />
              ))}
              {ds.map((d) => {
                const n = agendaOn(store, d).filter((o) => !isBar(o)).length;
                return (
                  <button
                    key={d}
                    onClick={() => onDay(d)}
                    aria-label={fmtDay(d, { weekday: true })}
                    className={cx(
                      "num relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[11.5px] transition-colors hover:bg-hover",
                      d === t && "bg-pen font-semibold text-white hover:bg-pen",
                    )}
                  >
                    {parseDate(d).getDate()}
                    {n > 0 && d !== t && (
                      <span className="absolute bottom-[3px] h-[3px] w-[3px] rounded-full bg-accent" style={{ opacity: Math.min(1, 0.35 + n * 0.15) }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
