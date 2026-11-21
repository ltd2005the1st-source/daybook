"use client";
import { memo, useCallback, useMemo, useRef } from "react";
import { motion } from "motion/react";
import { useData } from "./data";
import { daysInMonth, parseDate, today, WD_SHORT } from "@/lib/dates";
import { cx, vnd } from "@/lib/format";
import { eventsOn, lessonRow, makeupsOwed, type DayMark } from "@/lib/teaching";
import type { LessonStatus, Student } from "@/lib/types";
import { sec } from "@/lib/motion";

const NEXT: Record<DayMark, LessonStatus | null> = {
  none: "taught",
  planned: "taught",
  taught: "missed_owe",
  missed_owe: "cancelled",
  cancelled: null,
};

export function useMarkLesson() {
  const { storeRef, insert, update, remove } = useData();
  return useCallback(
    (studentId: string, date: string, status: LessonStatus | null) => {
      const row = lessonRow(storeRef.current, studentId, date);
      if (status === null) {
        if (row) remove("lessons", row.id, { silent: true });
        return;
      }
      if (row) update("lessons", row.id, { status });
      else insert("lessons", { student_id: studentId, date, status, start_time: null, end_time: null, note: null });
    },
    [storeRef, insert, update, remove],
  );
}

/** One register cell. The mark is drawn in the student's color; missed classes use the red marking pen. */
export function Mark({ mark, color, past, size = 22 }: { mark: DayMark; color: string; past: boolean; size?: number }) {
  const r = size / 2 - 2;
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {mark === "taught" && (
        <motion.g initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: sec(0.24), ease: [0.65, 0, 0.35, 1] }} style={{ originX: "50%", originY: "50%" }}>
          <circle cx={c} cy={c} r={r} fill={color} />
          <path
            d={`M${c - r * 0.45} ${c + r * 0.02} l${r * 0.32} ${r * 0.34} l${r * 0.6} ${-r * 0.7}`}
            fill="none"
            stroke="white"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pen-stroke"
            style={{ ["--len" as string]: 14 }}
          />
        </motion.g>
      )}
      {mark === "planned" && (
        <circle
          cx={c}
          cy={c}
          r={r - 0.5}
          fill="none"
          stroke={past ? "var(--muted)" : color}
          strokeWidth={1.5}
          strokeDasharray={past ? "2.5 2.5" : undefined}
          opacity={past ? 0.7 : 0.75}
        />
      )}
      {mark === "missed_owe" && (
        <g>
          <circle cx={c} cy={c} r={r - 0.5} fill="var(--pen-soft)" stroke="var(--pen)" strokeWidth={1.6} />
          <path d={`M${c - r * 0.38} ${c - r * 0.38} L${c + r * 0.38} ${c + r * 0.38} M${c + r * 0.38} ${c - r * 0.38} L${c - r * 0.38} ${c + r * 0.38}`} stroke="var(--pen)" strokeWidth={1.7} strokeLinecap="round" />
        </g>
      )}
      {mark === "cancelled" && (
        <path d={`M${c - r * 0.55} ${c} h${r * 1.1}`} stroke="var(--muted)" strokeWidth={1.8} strokeLinecap="round" />
      )}
    </svg>
  );
}

/** The mark for every student on every day of the month, worked out once (not once per cell). */
function useMonthMarks(month: string, students: Student[]) {
  const { store } = useData();
  const lessons = store.lessons;
  const events = store.events;
  return useMemo(() => {
    const days = daysInMonth(month);
    const row = new Map<string, (typeof lessons)[number]>();
    for (const l of lessons) {
      const k = l.student_id + "|" + l.date;
      if (!row.has(k)) row.set(k, l);
    }
    const marks = new Map<string, DayMark>();
    for (const d of days) {
      const withClass = new Set<string>();
      for (const o of eventsOn({ events }, d)) if (o.studentId) withClass.add(o.studentId);
      for (const s of students) {
        const l = row.get(s.id + "|" + d);
        let m: DayMark;
        if (l && !(l.status === "cancelled" && l.note?.startsWith("Moved to"))) m = l.status;
        else m = withClass.has(s.id) ? "planned" : "none";
        marks.set(s.id + "|" + d, m);
      }
    }
    const taught = new Map<string, number>();
    for (const s of students) taught.set(s.id, 0);
    for (const l of lessons) if (l.status === "taught" && l.date.startsWith(month) && taught.has(l.student_id)) taught.set(l.student_id, taught.get(l.student_id)! + 1);
    return { days, marks, taught };
  }, [lessons, events, students, month]);
}

export function Register({ month, students, onPickStudent }: { month: string; students: Student[]; onPickStudent: (s: Student) => void }) {
  const { marks, days, taught } = useMonthMarks(month, students);
  const mark = useMarkLesson();
  return <RegisterTable month={month} students={students} days={days} marks={marks} taught={taught} today={today()} mark={mark} onPickStudent={onPickStudent} />;
}

type TableProps = {
  month: string;
  students: Student[];
  days: string[];
  marks: Map<string, DayMark>;
  taught: Map<string, number>;
  today: string;
  mark: (studentId: string, date: string, status: LessonStatus | null) => void;
  onPickStudent: (s: Student) => void;
};

const RegisterTable = memo(function RegisterTable({ students, days, marks, taught, today: t, mark, onPickStudent }: TableProps) {
  const cols = `minmax(72px,88px) repeat(${students.length}, minmax(80px, 1fr))`;
  const minWidth = 72 + students.length * 80;
  const head = useRef<HTMLDivElement>(null);

  // The names stay pinned to the top of the screen while you scroll down the month.
  // The header lives outside the sideways-scrolling body, so it follows that scroll by hand.
  return (
    <div className="card min-w-0 max-w-full" style={{ overflow: "clip" }}>
      <div
        ref={head}
        className="sticky z-20 overflow-hidden rounded-t-[11px] bg-surface border-b border-line-strong shadow-[0_6px_12px_-10px_rgb(0_0_0/0.25)]"
        style={{ top: "var(--topbar, 0px)" }}
      >
          <div className="grid" style={{ gridTemplateColumns: cols, minWidth }}>
            <div className="sticky left-0 z-[1] self-stretch flex items-end bg-surface px-3 py-2.5 label">Date</div>
            {students.map((s) => (
              <button
                key={s.id}
                onClick={() => onPickStudent(s)}
                className="group flex flex-col items-center justify-end gap-1 px-1 py-2.5 text-center hover:bg-hover"
              >
                <span className="h-[3px] w-6 rounded-full" style={{ background: s.color }} />
                <span className="max-w-full line-clamp-2 break-words text-[12.5px] font-semibold leading-tight group-hover:underline underline-offset-2">{s.name}</span>
                {makeupsOwed(null, s) > 0 ? (
                  <span className="num text-[10.5px] text-pen leading-none">{makeupsOwed(null, s)} makeup{makeupsOwed(null, s) === 1 ? "" : "s"}</span>
                ) : (
                  <span className="num text-[10.5px] text-muted leading-none">{vnd(s.rate, { compact: true })}</span>
                )}
              </button>
            ))}
          </div>
      </div>
      <div
        className="overflow-x-auto"
        onScroll={(e) => {
          if (head.current) head.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <div style={{ minWidth }}>
          {/* Rows */}
          {days.map((d) => {
            const wd = parseDate(d).getDay();
            const isToday = d === t;
            const weekend = wd === 0 || wd === 6;
            return (
              <div
                key={d}
                className={cx(
                  "grid border-b border-line last:border-b-0",
                  weekend && "bg-sunken/60",
                  isToday && "!bg-accent-soft",
                  wd === 1 && "border-t border-t-line-strong",
                )}
                style={{ gridTemplateColumns: cols }}
              >
                {/* The date column stays put when you swipe sideways on a phone. */}
                <div className="sticky left-0 z-[1] bg-surface">
                  <div className={cx("flex h-full items-baseline gap-1.5 px-3 py-[5px]", weekend && "bg-sunken/60", isToday && "!bg-accent-soft")}>
                  <span className={cx("num inline-block w-[2ch] tabular-nums text-right text-[13px]", isToday ? "font-semibold text-accent" : "text-ink")}>{parseDate(d).getDate()}</span>
                  <span className={cx("text-[11.5px]", weekend ? "text-ink-2" : "text-muted")}>{WD_SHORT[wd]}</span>
                  </div>
                </div>
                {students.map((s) => {
                  const m = marks.get(s.id + "|" + d) ?? "none";
                  return (
                    <button
                      key={s.id}
                      onClick={() => mark(s.id, d, NEXT[m])}
                      title={`${s.name}, ${d}: ${LABEL[m]}. Tap to change.`}
                      aria-label={`${s.name} ${d} ${LABEL[m]}`}
                      className="flex items-center justify-center py-[3px] hover:bg-hover transition-colors"
                    >
                      <Mark mark={m} color={s.color} past={d < t} />
                    </button>
                  );
                })}
              </div>
            );
          })}
          {/* Footer totals, like the bottom of your sheet */}
          <div className="grid border-t border-line-strong bg-sunken" style={{ gridTemplateColumns: cols }}>
            <div className="sticky left-0 z-[1] flex items-center bg-sunken px-3 py-2 label">Earned</div>
            {students.map((s) => {
              const n = taught.get(s.id) ?? 0;
              return (
                <div key={s.id} className="flex flex-col items-center py-2">
                  <span className="num text-[13px] font-semibold">{n}</span>
                  <span className="num text-[10.5px] text-muted">{vnd(n * s.rate, { compact: true })}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

export const LABEL: Record<DayMark, string> = {
  taught: "taught",
  planned: "scheduled",
  missed_owe: "missed",
  cancelled: "cancelled",
  none: "no class",
};

export function Legend() {
  const items: [DayMark, string][] = [
    ["taught", "Taught"],
    ["planned", "Scheduled"],
    ["missed_owe", "Missed"],
    ["cancelled", "Cancelled"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2">
      {items.map(([m, l]) => (
        <span key={m} className="flex items-center gap-1.5">
          <Mark mark={m} color="var(--ink-2)" past={false} size={16} />
          {l}
        </span>
      ))}
      <span className="text-muted">Tap a cell to cycle. Makeups left are counted by you: set them on each student.</span>
    </div>
  );
}
