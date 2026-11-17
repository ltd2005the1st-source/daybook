"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useData } from "@/components/data";
import { EventSheet, LessonSheet } from "@/components/event-sheet";
import { Page } from "@/components/ui";
import { addDays, fmtDay, fromMinutes, minutes, MONTHS, parseDate, startOfWeek, today, WD_SHORT } from "@/lib/dates";
import { cx } from "@/lib/format";
import { agendaOn, type Occurrence } from "@/lib/teaching";

const START_H = 6;
const END_H = 24;
const HOUR = 52;

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
  const timed = items.filter((o) => o.start && o.end).sort((a, b) => minutes(a.start!) - minutes(b.start!));
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

export default function CalendarPage() {
  const { store } = useData();
  const mobile = useIsMobile();
  const [anchor, setAnchor] = useState(today());
  const [newAt, setNewAt] = useState<{ date: string; start: string } | null>(null);
  const [openEvent, setOpenEvent] = useState<{ id: string; date: string } | null>(null);
  const [openLesson, setOpenLesson] = useState<Occurrence | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
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

  const step = mobile ? 1 : 7;
  const first = parseDate(days[0]);
  const title = `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  const weekStrip = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

  const onOcc = (o: Occurrence) => {
    if (o.kind === "event" && o.event) setOpenEvent({ id: o.event.id, date: o.date });
    else setOpenLesson(o);
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
        <div ref={scroller} className="relative max-h-[calc(100dvh-230px)] md:max-h-[calc(100dvh-200px)] overflow-y-auto">
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
              const items = agendaOn(store, d);
              const placed = layout(items);
              return (
                <div
                  key={d}
                  className="relative border-l border-line"
                  style={{
                    height: (END_H - START_H) * HOUR,
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${HOUR}px)`,
                  }}
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const m = Math.floor(((y / HOUR) * 60 + START_H * 60) / 30) * 30;
                    setNewAt({ date: d, start: fromMinutes(m) });
                  }}
                >
                  {placed.map((o) => {
                    const struck = o.status === "cancelled" || o.status === "missed_owe";
                    const isCheck = o.kind === "check";
                    return (
                      <button
                        key={o.key}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOcc(o);
                        }}
                        className={cx(
                          "absolute flex flex-col justify-start overflow-hidden rounded-[6px] px-1.5 py-1 text-left text-[11.5px] leading-tight transition-[filter,transform] hover:brightness-110 active:scale-[0.99]",
                          struck && "opacity-45",
                        )}
                        style={{
                          top: o.top,
                          height: o.height,
                          left: `calc(${(o.lane / o.lanes) * 100}% + 2px)`,
                          width: `calc(${100 / o.lanes}% - 4px)`,
                          background: isCheck ? `color-mix(in oklab, ${o.color} 14%, var(--surface))` : o.color,
                          color: isCheck ? "var(--ink)" : "white",
                          borderLeft: isCheck ? `3px solid ${o.color}` : undefined,
                          outline: isCheck ? `1px dashed color-mix(in oklab, ${o.color} 50%, transparent)` : undefined,
                          outlineOffset: -1,
                        }}
                      >
                        <div className={cx("font-semibold truncate", struck && "line-through")}>
                          {o.title}
                          {o.tentative && " (pending)"}
                        </div>
                        {o.height > 30 && (
                          <div className="num opacity-80">
                            {o.start}–{o.end}
                          </div>
                        )}
                        {o.status === "taught" && o.height > 44 && <div className="opacity-90">✓ taught</div>}
                      </button>
                    );
                  })}
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
      <p className="mt-2 text-[12px] text-muted">
        Classes come from each student’s weekly schedule. Dashed blocks are homework checks. Tap empty space to add an event. Showing {fmtDay(days[0])}
        {days.length > 1 && ` – ${fmtDay(days[days.length - 1])}`}.
      </p>

      <EventSheet
        open={!!newAt || !!openEvent}
        eventId={openEvent?.id ?? null}
        occurrenceDate={openEvent?.date ?? newAt?.date ?? t}
        defaultStart={newAt?.start}
        onClose={() => {
          setNewAt(null);
          setOpenEvent(null);
        }}
      />
      <LessonSheet occ={openLesson} onClose={() => setOpenLesson(null)} />
    </Page>
  );
}
