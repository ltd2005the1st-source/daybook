"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ms } from "@/lib/motion";
import { useSeen } from "./reveal";
import { cx, vnd } from "@/lib/format";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * One digit as an odometer wheel. The real digit sits in the flow (invisible) so the line box,
 * width and baseline are exactly what plain text would give; the wheel of 0–9 is laid over it and
 * slides with a transform. A wheel that appears after the number first showed (the number grew a
 * digit) starts at 0 and rolls up to its value.
 */
function Wheel({ d, fresh, hold, delay }: { d: number; fresh: boolean; hold: boolean; delay: number }) {
  const [shown, setShown] = useState(fresh ? 0 : d);
  const [intro, setIntro] = useState(false);
  // Until the figure first scrolls into view every wheel waits at 0 (no transition), then rolls up.
  useLayoutEffect(() => {
    if (hold) {
      setShown(0);
      setIntro(true);
    }
  }, [hold]);
  useEffect(() => {
    if (hold || !intro) return;
    const h = window.setTimeout(() => setIntro(false), ms(1700) + delay);
    return () => clearTimeout(h);
  }, [hold, intro, delay]);
  useEffect(() => {
    if (hold || shown === d) return;
    // Two frames so a fresh wheel paints at 0 before it rolls.
    let b = 0;
    const a = requestAnimationFrame(() => (b = requestAnimationFrame(() => setShown(d))));
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [d, shown, hold]);
  return (
    <span className="roll-cell">
      <span className="invisible">{d}</span>
      <span
        className={cx("roll-wheel", hold && "roll-snap", intro && "roll-intro")}
        style={{ transform: `translate3d(0, ${-(hold ? 0 : shown) * 10}%, 0)`, transitionDelay: intro && !hold ? `${delay}ms` : undefined }}
      >
        {DIGITS.map((x) => (
          <span key={x}>{x}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * Text whose digits roll like an odometer when it changes. Characters are matched from the right,
 * so the units stay in place when the number gains or loses a digit ("950k" → "1.2M").
 */
export function RollingText({ text, className }: { text: string; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useSeen(ref);
  const chars = Array.from(text);
  const n = chars.length;
  let digit = 0;
  return (
    <span ref={ref} className={cx("roll", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {chars.map((c, i) => {
          const key = n - i; // position from the right
          return /\d/.test(c) ? (
            <Wheel key={`d${key}`} d={+c} fresh={mounted} hold={!seen} delay={ms(Math.min(digit++, 8) * 45)} />
          ) : (
            <span key={`c${key}${c}`}>{c}</span>
          );
        })}
      </span>
    </span>
  );
}

/** A ₫ amount, formatted like vnd(), that rolls to its new value. */
export function Money({
  value,
  sign,
  compact,
  className,
}: {
  value: number;
  sign?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return <RollingText text={vnd(value, { sign, compact })} className={className} />;
}
