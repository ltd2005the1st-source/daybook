"use client";
import { Check } from "lucide-react";
import { EVENT_COLORS, textOn } from "@/lib/colors";
import { cx } from "@/lib/format";

/** Google Calendar's eleven colours plus a custom one. The current colour is ticked. */
export function ColorPicker({ value, onChange, size = 26 }: { value: string; onChange: (hex: string) => void; size?: number }) {
  const known = EVENT_COLORS.some((c) => c.hex.toLowerCase() === value.toLowerCase());
  const swatch = (hex: string, name: string) => {
    const on = hex.toLowerCase() === value.toLowerCase();
    return (
      <button
        type="button"
        key={hex}
        title={name}
        aria-label={name}
        aria-pressed={on}
        onClick={() => onChange(hex)}
        className={cx("flex items-center justify-center rounded-full transition-transform hover:scale-110", on && "ring-2 ring-ring ring-offset-2 ring-offset-surface")}
        style={{ width: size, height: size, background: hex }}
      >
        {on && <Check size={size * 0.55} color={textOn(hex)} strokeWidth={3} />}
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {EVENT_COLORS.map((c) => swatch(c.hex, c.name))}
      {!known && swatch(value, "Current colour")}
      <label
        title="Custom colour"
        className="relative flex cursor-pointer items-center justify-center rounded-full border border-dashed border-input text-[13px] text-muted-foreground hover:bg-accent"
        style={{ width: size, height: size }}
      >
        +
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Custom colour" />
      </label>
    </div>
  );
}
