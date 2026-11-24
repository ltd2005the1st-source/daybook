import { createEngine, type Engine, type PlayOpts } from "./engine";
import { EVENTS } from "./library";

const KEY = "daybook.soundlab";

export type Choices = Record<string, 0 | 1 | 2>;
type Saved = { volume: number; muted: boolean; choices: Choices };

const defaults = (): Saved => ({ volume: 0.8, muted: false, choices: Object.fromEntries(EVENTS.map((e) => [e.id, 0])) as Choices });

function load(): Saved {
  const d = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw) {
      if (typeof raw.volume === "number") d.volume = Math.min(1, Math.max(0, raw.volume));
      if (typeof raw.muted === "boolean") d.muted = raw.muted;
      for (const e of EVENTS) if ([0, 1, 2].includes(raw.choices?.[e.id])) d.choices[e.id] = raw.choices[e.id];
    }
  } catch {}
  return d;
}

/** Owns the AudioContext, the chosen option per event, volume and rate limits. Browser only. */
export class SoundPlayer {
  private engine: Engine | null = null;
  private last = new Map<string, number>();
  private listeners = new Set<() => void>();
  state: Saved = defaults();
  unlocked = false;

  /** Call once on the client. Reads saved choices. */
  hydrate() {
    this.state = load();
    this.emit();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };
  private emit() {
    this.state = { ...this.state, choices: { ...this.state.choices } };
    this.listeners.forEach((f) => f());
  }
  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {}
  }

  /** Browsers only start audio after a gesture, so this runs on the first pointer/key event. */
  unlock() {
    if (!this.engine) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: "interactive" });
      this.engine = createEngine(ctx, this.state.muted ? 0 : this.state.volume);
    }
    const ctx = this.engine.ctx as AudioContext;
    if (ctx.state !== "running") void ctx.resume();
    if (!this.unlocked) {
      this.unlocked = true;
      this.emit();
    }
  }

  setVolume(v: number) {
    this.state.volume = v;
    this.engine?.setVolume(this.state.muted ? 0 : v);
    this.save();
    this.emit();
  }
  setMuted(m: boolean) {
    this.state.muted = m;
    this.engine?.setVolume(m ? 0 : this.state.volume);
    this.save();
    this.emit();
  }
  choose(eventId: string, i: 0 | 1 | 2) {
    this.state.choices[eventId] = i;
    this.save();
    this.emit();
  }
  chooseAll(i: 0 | 1 | 2) {
    for (const e of EVENTS) this.state.choices[e.id] = i;
    this.save();
    this.emit();
  }

  /** Play a cue with the currently chosen option (or a specific one, for auditioning). */
  play(eventId: string, cue: string, opts: PlayOpts & { option?: 0 | 1 | 2 } = {}) {
    this.unlock();
    const ev = EVENTS.find((e) => e.id === eventId);
    if (!ev || !this.engine) return;
    const now = performance.now();
    const k = `${eventId}:${cue}`;
    if (ev.minGap && now - (this.last.get(k) ?? 0) < ev.minGap && opts.option === undefined) return;
    this.last.set(k, now);
    const hits = ev.options[opts.option ?? this.state.choices[eventId] ?? 0].cues[cue];
    if (hits) this.engine.play(hits, opts);
  }
}
