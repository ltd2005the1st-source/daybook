"use client";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cx } from "@/lib/format";
import { sec } from "@/lib/motion";

/** True inside the one-page dashboard, where every section shares the same left edge. */
export const InDashboard = createContext(false);

export function Page({ children, wide, tight }: { children: React.ReactNode; wide?: boolean; tight?: boolean }) {
  const stacked = useContext(InDashboard);
  if (stacked) {
    // Same outer width for every section so the left edge never jumps as you scroll;
    // narrower sections keep their comfortable line length inside it.
    return (
      <div className={cx("mx-auto max-w-[1240px] px-4 md:px-10", tight ? "pt-3 md:pt-5" : "pt-5 md:pt-8")}>
        <div className={wide ? undefined : "max-w-[900px]"}>{children}</div>
      </div>
    );
  }
  return (
    <div className={cx("mx-auto px-4 md:px-10", tight ? "pt-3 md:pt-5" : "pt-5 md:pt-10", wide ? "max-w-[1240px]" : "max-w-[980px]")}>{children}</div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 md:mb-8 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <div className="label mb-1.5">{eyebrow}</div>}
        <h1 className="display title text-[32px] md:text-[40px] font-semibold">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("mb-8", className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-line pb-1.5">
        <h2 className="text-[13px] font-semibold text-ink-2">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div data-scroll-contain className="fixed inset-0 z-40 flex items-end md:items-center justify-center">
          <motion.div
            className="absolute inset-0 bg-[var(--scrim)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            // Materialises rather than just fading: rises from where it docks, sharpening as it
            // arrives, and leaves along the same path it came in on.
            initial={{ opacity: 0, y: 28, scale: 0.98, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 28, scale: 0.98, filter: "blur(6px)" }}
            transition={{ duration: sec(0.34), ease: [0.65, 0, 0.35, 1] }}
            style={{ maxWidth: width, transformOrigin: "50% 100%" }}
            className="relative w-full max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-xl md:rounded-xl glass-thick pb-[env(safe-area-inset-bottom)]"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="display text-[20px] font-semibold">{title}</h3>
              <button aria-label="Close" onClick={onClose} className="press glass-pill inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:text-ink">
                <X size={17} />
              </button>
            </div>
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block mb-3", className)}>
      <span className="label block mb-1">{label}</span>
      {children}
    </label>
  );
}

export function Progress({ value, color, className, height = 6 }: { value: number; color?: string; className?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cx("relative w-full overflow-hidden rounded-full bg-hover", className)} style={{ height }}>
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color ?? "var(--ink)" }}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: sec(0.6), ease: [0.65, 0, 0.35, 1] }}
      />
    </div>
  );
}

/** Checkbox whose tick is drawn like a pen stroke. */
export function Tick({
  checked,
  onChange,
  color = "var(--ink)",
  size = 18,
  label,
  round,
}: {
  checked: boolean;
  onChange: () => void;
  color?: string;
  size?: number;
  label?: string;
  round?: boolean;
}) {
  // Only bounce when it changes to checked, not when a checked box first appears.
  const was = useRef(checked);
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (checked && !was.current) setPop(true);
    was.current = checked;
  }, [checked]);
  return (
    <button
      type="button"
      role="checkbox"
      onAnimationEnd={() => setPop(false)}
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cx(
        "press relative shrink-0 inline-flex items-center justify-center border-[1.5px] transition-colors duration-200",
        round ? "rounded-full" : "rounded-[5px]",
        pop && "tick-pop",
      )}
      style={{
        width: size,
        height: size,
        borderColor: checked ? color : "var(--line-strong)",
        background: checked ? color : "transparent",
      }}
    >
      {checked && (
        <svg viewBox="0 0 16 16" width={size - 4} height={size - 4} fill="none">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="#fff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pen-stroke"
            style={{ ["--len" as string]: 16 }}
          />
        </svg>
      )}
    </button>
  );
}

export function Dot({ color, size = 8, className }: { color: string; size?: number; className?: string }) {
  return <span className={cx("inline-block shrink-0 rounded-full", className)} style={{ width: size, height: size, background: color }} />;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  // One id per control, so two copies of the same options on screen never share (and hide) one pill.
  const pillId = useId();
  // Concentric corners: the track is 12px with 3px of padding, so the buttons and the pill are 12 - 3 = 9px.
  return (
    <div className={cx("inline-flex rounded-xl bg-hover p-[3px]", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "press relative rounded-[9px] px-3 py-1 text-[13px]",
            value === o.value ? "text-ink font-medium" : "text-muted hover:text-ink",
          )}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${pillId}`} className="absolute inset-0 rounded-[9px] glass-pill" transition={{ duration: sec(0.32), ease: [0.65, 0, 0.35, 1] }} />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">{children}</div>;
}

/** A destructive button that asks for a second tap instead of a browser dialog. */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Tap again to confirm",
  className,
}: {
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={cx(className, armed && "!bg-pen !text-white")}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}

/** A list of minutes typed as "40, 20". Saves when you leave the field so typing a comma doesn't fight you. */
export function MinutesInput({ value, onChange, placeholder = "40, 20" }: { value: number[]; onChange: (v: number[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => setText(value.join(", ")), [value.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    const v = [...new Set(text.split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => !Number.isNaN(n) && n >= 0))].sort((a, b) => b - a);
    onChange(v);
    setText(v.join(", "));
  };
  return (
    <input
      className="field num"
      inputMode="numeric"
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
    />
  );
}
