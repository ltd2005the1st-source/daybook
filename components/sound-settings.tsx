"use client";
import { useSyncExternalStore } from "react";
import { Switch } from "./checks";
import { sfx } from "@/lib/sound/app";

/** Keyboard sounds on/off and volume. Saved on this device. */
export function SoundSettings() {
  const s = useSyncExternalStore(sfx.subscribe, () => sfx.state, () => sfx.state);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[14px] text-ink">Keyboard sounds</div>
          <div className="text-[13px] text-muted">Clicks, ticks, switches, drags and typing sound like a clicky mechanical keyboard.</div>
        </div>
        <Switch on={!s.muted} onChange={(v) => sfx.setMuted(!v)} label="Keyboard sounds" />
      </div>
      <div className="flex items-center gap-3">
        <span className="w-14 text-[13px] text-muted">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={s.volume}
          disabled={s.muted}
          aria-label="Sound volume"
          onChange={(e) => sfx.setVolume(Number(e.target.value))}
          onPointerUp={() => sfx.play("click", "down")}
          className="h-1.5 w-full max-w-xs cursor-pointer disabled:opacity-40"
          style={{ accentColor: "var(--accent)" }}
        />
        <span className="w-9 text-right text-[12.5px] tabular-nums text-muted">{Math.round(s.volume * 100)}%</span>
      </div>
    </div>
  );
}
