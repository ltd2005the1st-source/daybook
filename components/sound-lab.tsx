"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, Volume2, VolumeX, Play } from "lucide-react";
import { cx } from "@/lib/format";
import { Segmented } from "@/components/ui";
import { EVENTS, type SoundEvent } from "@/lib/sound/library";
import { SoundPlayer } from "@/lib/sound/player";

const player = new SoundPlayer();

function useSounds() {
  return useSyncExternalStore(player.subscribe, () => player.state, () => player.state);
}
const play = (event: string, cue: string, opts?: Parameters<SoundPlayer["play"]>[2]) => player.play(event, cue, opts);

/* ---------------------------------------------------------------- Playground demos */

function Demo({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-[13.5px] font-medium text-foreground">{title}</div>
      <div className="mb-3 mt-0.5 text-[12.5px] text-muted-foreground">{hint}</div>
      {children}
    </div>
  );
}

function ClickDemo() {
  const bind = {
    onPointerDown: () => play("click", "down"),
    onPointerUp: () => play("click", "up"),
    onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && !e.repeat && play("click", "down"),
    onKeyUp: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && play("click", "up"),
  };
  return (
    <Demo title="Button click" hint="Press and hold, then let go: down and up are separate sounds.">
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" {...bind}>Save</button>
        <button className="btn btn-line" {...bind}>Cancel</button>
        <button className="btn btn-ghost" {...bind}>Archive</button>
      </div>
    </Demo>
  );
}

function HoverDemo() {
  const bind = { onPointerEnter: (e: React.PointerEvent) => e.pointerType === "mouse" && play("hover", "hover") };
  return (
    <Demo title="Button hover" hint="Slide your mouse across the row. (Touch screens have no hover.)">
      <div className="flex flex-wrap gap-2">
        {["Today", "Calendar", "Tasks", "Money", "Music"].map((l) => (
          <button key={l} className="btn btn-line" {...bind}>{l}</button>
        ))}
      </div>
    </Demo>
  );
}

function TickDemo() {
  const [on, setOn] = useState([false, true, false]);
  const labels = ["Mark homework", "Reply to parents", "Plan next week"];
  return (
    <Demo title="Tickbox" hint="Tick and untick the same box.">
      <div className="space-y-1">
        {labels.map((l, i) => (
          <button
            key={l}
            role="checkbox"
            aria-checked={on[i]}
            onClick={() => {
              play("tick", on[i] ? "uncheck" : "check");
              setOn((s) => s.map((v, j) => (j === i ? !v : v)));
            }}
            className="press flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
          >
            <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors duration-200", on[i] ? "border-info bg-info text-white" : "border-input bg-card")}>
              {on[i] && <Check size={12} strokeWidth={3} />}
            </span>
            <span className={cx("text-[14px] transition-colors", on[i] ? "text-muted-foreground line-through" : "text-foreground")}>{l}</span>
          </button>
        ))}
      </div>
    </Demo>
  );
}

function SwitchDemo() {
  const [on, setOn] = useState([true, false]);
  const labels = ["Class reminders", "Dark mode"];
  return (
    <Demo title="Switch" hint="On climbs in pitch, off falls.">
      <div className="space-y-2">
        {labels.map((l, i) => (
          <div key={l} className="flex items-center justify-between rounded-lg px-2 py-1">
            <span className="text-[14px] text-foreground">{l}</span>
            <button
              role="switch"
              aria-checked={on[i]}
              aria-label={l}
              onClick={() => {
                play("switch", on[i] ? "off" : "on");
                setOn((s) => s.map((v, j) => (j === i ? !v : v)));
              }}
              className={cx("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-300", on[i] ? "bg-info" : "bg-input")}
            >
              <span className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300" style={{ transform: `translateX(${on[i] ? 16 : 0}px)`, transitionTimingFunction: "var(--ease)" }} />
            </button>
          </div>
        ))}
      </div>
    </Demo>
  );
}

function TabDemo() {
  const [v, setV] = useState("day");
  return (
    <Demo title="Tab / segmented select" hint="Switch between choices.">
      <Segmented
        value={v}
        options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]}
        onChange={(n) => {
          play("tab", "select");
          setV(n);
        }}
      />
    </Demo>
  );
}

function SheetDemo() {
  const [open, setOpen] = useState(false);
  const toggle = (o: boolean) => {
    play("sheet", o ? "open" : "close");
    setOpen(o);
  };
  return (
    <Demo title="Sheet open / close" hint="A pop-up panel, like the event and task sheets.">
      <button className="btn btn-line" onClick={() => toggle(true)}>Open a sheet</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/20 p-4 sm:place-items-center" onClick={() => toggle(false)}>
          <div className="border bg-popover text-popover-foreground shadow-lg/5 w-full max-w-sm rounded-xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-medium text-foreground">New event</div>
            <p className="mt-1 text-[13px] text-muted-foreground">Closing it, or tapping outside, plays the close sound.</p>
            <div className="mt-4 flex justify-end">
              <button className="btn btn-primary" onClick={() => toggle(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </Demo>
  );
}

function SuccessDemo() {
  const [done, setDone] = useState(false);
  return (
    <Demo title="Success / complete" hint="Finish the task to hear the flourish.">
      <button
        className={cx("btn", done ? "btn-line" : "btn-primary")}
        onClick={() => {
          if (!done) play("success", "done");
          setDone(!done);
        }}
      >
        {done ? <><Check size={14} /> Completed · reset</> : "Complete task"}
      </button>
    </Demo>
  );
}

function TypeDemo() {
  return (
    <Demo title="Typing in a field" hint="Every key makes a sound, space is deeper.">
      <input
        className="w-full rounded-xl border border-input bg-card px-3 py-2 text-[14px] text-foreground outline-none focus:border-info"
        placeholder="Type something…"
        onKeyDown={(e) => {
          if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
          if (e.key === " ") play("type", "space");
          else if (e.key.length === 1 || e.key === "Backspace" || e.key === "Enter") play("type", "key", { pitch: 0.92 + ((e.key.charCodeAt(0) * 7) % 9) * 0.02 });
        }}
      />
    </Demo>
  );
}

type Chip = { id: string; text: string; kind: "task" | "event"; color: string };
const CHIPS: Chip[] = [
  { id: "a", text: "Mark Khánh's homework", kind: "task", color: "#2f4fb5" },
  { id: "b", text: "Class · Tống Linh", kind: "event", color: "#f4b024" },
  { id: "c", text: "Send receipts", kind: "task", color: "#2f4fb5" },
  { id: "d", text: "Class · Bảo Hân", kind: "event", color: "#3496c4" },
];
const ZONES = [{ id: "today", label: "Today" }, { id: "tomorrow", label: "Tomorrow" }, { id: "later", label: "Later" }];

function DragDemo() {
  const [place, setPlace] = useState<Record<string, string>>({ a: "today", b: "today", c: "tomorrow", d: "later" });
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number; over: string | null } | null>(null);
  const ref = useRef<{ id: string; sx: number; sy: number; started: boolean; over: string | null } | null>(null);

  const zoneAt = (x: number, y: number) => {
    for (const el of document.elementsFromPoint(x, y)) {
      const z = (el as HTMLElement).dataset?.zone;
      if (z) return z;
    }
    return null;
  };

  const down = (e: React.PointerEvent, id: string) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    ref.current = { id, sx: e.clientX, sy: e.clientY, started: false, over: place[id] };
  };
  const move = (e: React.PointerEvent) => {
    const r = ref.current;
    if (!r) return;
    const dx = e.clientX - r.sx;
    const dy = e.clientY - r.sy;
    if (!r.started) {
      if (Math.hypot(dx, dy) < 5) return;
      r.started = true;
      play("pickup", "pickup");
    }
    const over = zoneAt(e.clientX, e.clientY);
    if (over !== r.over) {
      r.over = over;
      // Each column has its own pitch, so you can hear where you are without looking.
      if (over) play("over", "enter", { pitch: 0.9 + ZONES.findIndex((z) => z.id === over) * 0.12 });
    }
    setDrag({ id: r.id, dx, dy, over });
  };
  const up = () => {
    const r = ref.current;
    ref.current = null;
    if (!r?.started) return;
    play("drop", "drop", { gain: r.over ? 1 : 0.6 });
    if (r.over) setPlace((p) => ({ ...p, [r.id]: r.over! }));
    setDrag(null);
  };

  return (
    <div className="card p-4 md:col-span-2">
      <div className="text-[13.5px] font-medium text-foreground">Pick up, move over, drop</div>
      <div className="mb-3 mt-0.5 text-[12.5px] text-muted-foreground">Drag a task or event between the columns. Pick-up, passing over a column and dropping each use their own sound.</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ZONES.map((z) => (
          <div
            key={z.id}
            data-zone={z.id}
            className={cx("min-h-[132px] rounded-xl border border-dashed p-2 transition-colors duration-200", drag?.over === z.id ? "border-info bg-info/12" : "border-input bg-muted")}
          >
            <div className="mb-1.5 px-1 text-[12px] font-medium text-muted-foreground">{z.label}</div>
            <div className="space-y-1.5">
              {CHIPS.filter((c) => place[c.id] === z.id).map((c) => {
                const active = drag?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onPointerDown={(e) => down(e, c.id)}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={up}
                    className={cx("relative flex cursor-grab touch-none select-none items-center gap-2 rounded-lg border border-rim bg-card px-2.5 py-2 text-[13px] text-foreground", active ? "z-50 cursor-grabbing shadow-pop" : "transition-transform duration-200")}
                    style={active ? { transform: `translate(${drag!.dx}px, ${drag!.dy}px) scale(1.03)`, transition: "none" } : undefined}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                    <span className="truncate">{c.text}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">{c.kind}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Option picker */

function EventCard({ ev, choice }: { ev: SoundEvent; choice: number }) {
  const audition = (i: 0 | 1 | 2, cueIds: string[]) => {
    cueIds.forEach((c, n) => window.setTimeout(() => play(ev.id, c, { option: i }), n * 480));
  };
  return (
    <section className="card p-4 md:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 className="text-[16px] font-medium text-foreground">{ev.title}</h3>
        <span className="text-[12px] text-muted-foreground">Using option {ev.options[choice].id}</span>
      </div>
      <p className="mb-3 mt-0.5 text-[13px] text-muted-foreground">{ev.hint}</p>
      <div className="grid gap-2.5 md:grid-cols-3">
        {ev.options.map((o, i) => {
          const sel = choice === i;
          return (
            <div key={o.id} className={cx("rounded-xl border p-3 transition-colors duration-200", sel ? "bg-accent border-info" : "border-rim bg-muted")}>
              <button
                className="press block w-full text-left"
                aria-pressed={sel}
                onClick={() => {
                  player.choose(ev.id, i as 0 | 1 | 2);
                  audition(i as 0 | 1 | 2, ev.cues.map((c) => c.id));
                }}
              >
                <div className="flex items-center gap-2">
                  <span className={cx("grid h-5 w-5 place-items-center rounded-md text-[11px] font-semibold", sel ? "bg-info text-white" : "bg-accent text-foreground/80")}>{o.id}</span>
                  <span className="text-[14px] font-medium text-foreground">{o.name}</span>
                  {sel && <Check size={14} className="ml-auto text-info-foreground" />}
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-muted-foreground">{o.blurb}</p>
              </button>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {ev.cues.map((c) => (
                  <button key={c.id} className="btn btn-line !px-2.5 !py-1 !text-[12px]" onClick={() => play(ev.id, c.id, { option: i as 0 | 1 | 2 })}>
                    <Play size={10} fill="currentColor" /> {c.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Page */

export function SoundLab() {
  const s = useSounds();

  useEffect(() => {
    player.hydrate();
    // Browsers keep audio locked until a gesture, so the first touch/click/key unlocks it.
    const go = () => player.unlock();
    window.addEventListener("pointerdown", go, { once: true });
    window.addEventListener("keydown", go, { once: true });
    return () => {
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
    };
  }, []);

  const set = EVENTS.every((e) => s.choices[e.id] === s.choices[EVENTS[0].id]) ? s.choices[EVENTS[0].id] : -1;

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-24 pt-4 md:px-8 md:pt-8">
      <div className="border bg-card sticky top-3 z-40 mb-6 rounded-xl p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="min-w-[160px]">
            <h1 className="text-[20px] font-semibold leading-tight text-foreground">Sound lab</h1>
            <div className={cx("text-[12.5px]", s && player.unlocked ? "text-success-foreground" : "text-muted-foreground")}>{player.unlocked ? "Sound is on" : "Tap anywhere to turn sound on"}</div>
          </div>
          <div className="flex min-w-[200px] flex-1 items-center gap-2.5">
            <button className="btn btn-ghost !px-2" aria-label={s.muted ? "Unmute" : "Mute"} onClick={() => { player.unlock(); player.setMuted(!s.muted); }}>
              {s.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={s.volume}
              aria-label="Master volume"
              onChange={(e) => { player.unlock(); player.setVolume(Number(e.target.value)); }}
              className="h-1.5 w-full cursor-pointer"
              style={{ accentColor: "var(--info)" }}
            />
            <span className="w-9 text-right text-[12.5px] tabular-nums text-muted-foreground">{Math.round(s.volume * 100)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-muted-foreground">Use all</span>
            <Segmented
              value={set === -1 ? "" : String(set)}
              options={[{ value: "0", label: "A" }, { value: "1", label: "B" }, { value: "2", label: "C" }]}
              onChange={(v) => {
                player.chooseAll(Number(v) as 0 | 1 | 2);
                play("drop", "drop");
              }}
            />
          </div>
        </div>
      </div>

      <h2 className="mb-1 px-1 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Try it</h2>
      <p className="mb-3 px-1 text-[13.5px] text-muted-foreground">Everything here plays with the options you pick below. Your picks are saved on this device.</p>
      <div className="mb-8 grid gap-3 md:grid-cols-2">
        <ClickDemo />
        <HoverDemo />
        <TickDemo />
        <SwitchDemo />
        <TabDemo />
        <SheetDemo />
        <SuccessDemo />
        <TypeDemo />
        <DragDemo />
      </div>

      <h2 className="mb-3 px-1 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Pick a sound for each moment</h2>
      <div className="space-y-3">
        {EVENTS.map((ev) => (
          <EventCard key={ev.id} ev={ev} choice={s.choices[ev.id] ?? 0} />
        ))}
      </div>
    </div>
  );
}
