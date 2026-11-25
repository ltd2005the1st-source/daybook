"use client";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { Dialog, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { Progress as CossProgress, ProgressIndicator, ProgressTrack } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cx } from "@/lib/format";
import { sfx } from "@/lib/sound/app";

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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 md:mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-sm text-muted-foreground">{eyebrow}</div>}
        <h1 className="title font-heading text-3xl font-semibold md:text-4xl">{title}</h1>
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
      <div className="relative mb-3 flex items-center justify-between gap-2 pb-2">
        <h2 className="font-heading text-sm font-semibold">{title}</h2>
        {action}
        <span className="rv-line" aria-hidden />
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
  // Sheet sounds: open when it appears, close when it goes (not on first render while closed).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open !== wasOpen.current) sfx.play("sheet", open ? "open" : "close");
    wasOpen.current = open;
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPopup data-scroll-contain className="max-h-[88dvh] sm:max-w-[var(--sheet-w)]" style={{ ["--sheet-w" as string]: `${width}px` }}>
        <DialogHeader className="pb-2">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogPanel className="pt-1">{children}</DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("mb-3 flex flex-col gap-1.5", className)}>
      <Label render={<span />} className="text-sm font-medium">{label}</Label>
      {children}
    </label>
  );
}

export function Progress({ value, color, className, height = 6 }: { value: number; color?: string; className?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <CossProgress value={pct} className={className}>
      <ProgressTrack style={{ height }}>
        <ProgressIndicator style={color ? { background: color } : undefined} />
      </ProgressTrack>
    </CossProgress>
  );
}

/** Checkbox whose tick is drawn like a pen stroke. */
export function Tick({
  checked,
  onChange,
  color = "var(--foreground)",
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
        borderColor: checked ? color : "var(--input)",
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
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
      <TabsList>
        {options.map((o) => (
          <TabsTab key={o.value} value={o.value} data-sound="tab">
            {o.label}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
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
      className={cx(className, armed && "!bg-destructive !text-white")}
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
