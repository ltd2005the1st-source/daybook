import type { Hit } from "./engine";

/*
 * Three keyboard "personalities" are the raw material. Every event below tunes them (pitch, weight,
 * extra strikes) so A / B / C of one event feel like the same family but each fits its job.
 *
 *   Cream  : lubed linear in a foam case. Deep, round, no sharp edges.
 *   Blue   : click-jacket switch. A bright snap and ring, then a clack when the cap bottoms out.
 *   Dome   : Topre / marble-like. A soft low thump with a little pop on top.
 */

// ---- Cream ---------------------------------------------------------------------------------
const creamDown = (s = 1, v = 1): Hit => ({
  v,
  thock: { f: 175 * s, drop: 0.55, dec: 0.11, g: 0.9 },
  body: { f: 430 * s, q: 1.1, dec: 0.05, g: 0.55 },
  pop: { f: 1100, dec: 0.02, g: 0.3 },
  click: { f: 2400, dec: 0.004, g: 0.1 },
});
const creamUp = (s = 1, v = 1): Hit => ({
  v: 0.55 * v,
  thock: { f: 240 * s, drop: 0.7, dec: 0.06, g: 0.55 },
  click: { f: 3200, dec: 0.003, g: 0.07 },
});

// ---- Blue ----------------------------------------------------------------------------------
const blueSnap = (s = 1, v = 1): Hit => ({
  v,
  click: { f: 4300 * s, q: 1.8, dec: 0.007, g: 0.6 },
  ring: { f: [3350 * s, 4720 * s, 6380 * s], dec: 0.02, g: 0.4 },
});
const blueBottom = (s = 1, v = 1, at = 0.016): Hit => ({
  at,
  v: 0.9 * v,
  thock: { f: 240 * s, drop: 0.6, dec: 0.07, g: 0.6 },
  body: { f: 1500 * s, q: 1.6, dec: 0.035, g: 0.55 },
  click: { f: 2800, dec: 0.005, g: 0.3 },
});
const blueDown = (s = 1, v = 1): Hit[] => [blueSnap(s, v), blueBottom(s, v)];
const blueUp = (s = 1, v = 1): Hit[] => [
  { v: 0.7 * v, click: { f: 5200 * s, q: 2, dec: 0.005, g: 0.45 }, ring: { f: [4100 * s, 5600 * s], dec: 0.013, g: 0.3 } },
];

// ---- Dome ----------------------------------------------------------------------------------
const domeDown = (s = 1, v = 1): Hit => ({
  v,
  thock: { f: 125 * s, drop: 0.62, dec: 0.15, g: 1.05 },
  body: { f: 270 * s, q: 0.9, dec: 0.07, g: 0.45 },
  pop: { f: 1300, dec: 0.03, g: 0.5 },
  click: { f: 950, q: 0.8, dec: 0.01, g: 0.22 },
});
const domeUp = (s = 1, v = 1): Hit => ({
  v: 0.5 * v,
  thock: { f: 170 * s, drop: 0.7, dec: 0.07, g: 0.55 },
  pop: { f: 1900, dec: 0.015, g: 0.28 },
});

const late = (h: Hit, s: number): Hit => ({ ...h, at: (h.at ?? 0) + s });

// ---- The catalogue ------------------------------------------------------------------------

export type Option = { id: "A" | "B" | "C"; name: string; blurb: string; cues: Record<string, Hit[]> };
export type SoundEvent = {
  id: string;
  title: string;
  hint: string;
  cues: { id: string; label: string }[];
  /** Minimum gap between plays, for sounds that can fire many times a second. */
  minGap?: number;
  options: [Option, Option, Option];
};

export const EVENTS: SoundEvent[] = [
  {
    id: "click",
    title: "Button click",
    hint: "Plays when a button goes down, and again, softer, when it comes back up.",
    cues: [
      { id: "down", label: "Press" },
      { id: "up", label: "Release" },
    ],
    options: [
      { id: "A", name: "Creamy Linear", blurb: "Deep, round thock. A lubed linear in a foam-filled case.", cues: { down: [creamDown()], up: [creamUp()] } },
      { id: "B", name: "Clicky Blue", blurb: "A bright snap and ring, then the clack of the cap bottoming out.", cues: { down: blueDown(), up: blueUp() } },
      { id: "C", name: "Dome Thump", blurb: "Topre-style. A soft, low pop with no sharp edge at all.", cues: { down: [domeDown()], up: [domeUp()] } },
    ],
  },
  {
    id: "tick",
    title: "Tickbox",
    hint: "Ticking is a full keystroke. Unticking is the lighter return.",
    cues: [
      { id: "check", label: "Tick" },
      { id: "uncheck", label: "Untick" },
    ],
    options: [
      { id: "A", name: "Cream Tap", blurb: "A smaller, higher thock, like tapping the top row.", cues: { check: [creamDown(1.3, 0.85), { at: 0.05, v: 0.3, click: { f: 4200, dec: 0.003, g: 0.12 } }], uncheck: [creamUp(1.15, 0.9)] } },
      { id: "B", name: "Jacket Click", blurb: "A tight click-leaf snap. Untick is the dry release click.", cues: { check: blueDown(1.12, 0.85), uncheck: blueUp(0.95, 0.9) } },
      { id: "C", name: "Marble Drop", blurb: "A round pebble dropped on a desk. Gentle and a little heavy.", cues: { check: [domeDown(1.45, 0.9), { at: 0.045, v: 0.3, pop: { f: 2400, dec: 0.012, g: 0.3 } }], uncheck: [domeUp(1.3, 0.9)] } },
    ],
  },
  {
    id: "switch",
    title: "Switch (on / off)",
    hint: "Two strikes, like a lever travelling. On rises in pitch, off falls.",
    cues: [
      { id: "on", label: "Turn on" },
      { id: "off", label: "Turn off" },
    ],
    options: [
      {
        id: "A",
        name: "Soft Rocker",
        blurb: "A low thock, then a higher one as the lever lands.",
        cues: {
          on: [creamDown(0.9, 0.8), late(creamDown(1.3, 0.8), 0.07)],
          off: [creamDown(1.2, 0.75), late(creamDown(0.82, 0.8), 0.07)],
        },
      },
      {
        id: "B",
        name: "Flip Clicker",
        blurb: "Two crisp clicks. On is bright, off is a duller double.",
        cues: {
          on: [blueSnap(1.05, 0.8), blueBottom(1.2, 0.8, 0.075)],
          off: [blueSnap(0.85, 0.75), blueBottom(0.8, 0.8, 0.075)],
        },
      },
      {
        id: "C",
        name: "Spacebar Roll",
        blurb: "A deep dome thump with the faint ting of a stabilizer wire.",
        cues: {
          on: [domeDown(0.95, 0.8), { at: 0.065, v: 0.7, thock: { f: 190, drop: 0.7, dec: 0.08, g: 0.6 }, ring: { f: [1380, 2210], dec: 0.05, g: 0.1 } }],
          off: [domeDown(0.8, 0.8), { at: 0.065, v: 0.6, thock: { f: 120, drop: 0.7, dec: 0.08, g: 0.55 }, ring: { f: [900, 1500], dec: 0.05, g: 0.08 } }],
        },
      },
    ],
  },
  {
    id: "pickup",
    title: "Pick up (drag start)",
    hint: "The moment a card or task leaves its spot. A key lifting, not pressing.",
    cues: [{ id: "pickup", label: "Pick up" }],
    options: [
      { id: "A", name: "Cap Lift", blurb: "A quick, hollow lift of a keycap off the switch.", cues: { pickup: [{ v: 0.9, thock: { f: 300, drop: 0.8, dec: 0.05, g: 0.6 }, pop: { f: 2400, dec: 0.012, g: 0.35 }, click: { f: 3600, dec: 0.003, g: 0.1 } }] } },
      { id: "B", name: "Latch Click", blurb: "A sharp spring-leaf click, like popping a latch.", cues: { pickup: blueUp(0.92, 1.2) } },
      { id: "C", name: "Dome Grab", blurb: "A low, soft squeeze, like a dome collapsing in reverse.", cues: { pickup: [domeUp(0.9, 1.3)] } },
    ],
  },
  {
    id: "over",
    title: "Over a drop target",
    hint: "Small ticks as you pass over places you could drop. Rate-limited so fast drags stay tidy.",
    minGap: 55,
    cues: [{ id: "enter", label: "Enter a target" }],
    options: [
      { id: "A", name: "Soft Tap", blurb: "A muted little tap. Nearly a whisper of thock.", cues: { enter: [{ v: 0.5, thock: { f: 260, drop: 0.65, dec: 0.05, g: 0.6 }, click: { f: 3000, dec: 0.003, g: 0.08 } }] } },
      { id: "B", name: "Detent Tick", blurb: "A dry scroll-wheel notch: pure click, no body.", cues: { enter: [{ v: 0.5, click: { f: 3300, q: 2.2, dec: 0.006, g: 0.5 }, ring: { f: [3900], dec: 0.01, g: 0.18 } }] } },
      { id: "C", name: "Marble Ping", blurb: "A rounded pop with a hint of ping. Friendly, not busy.", cues: { enter: [{ v: 0.5, pop: { f: 1700, dec: 0.02, g: 0.45 }, thock: { f: 210, drop: 0.7, dec: 0.05, g: 0.4 } }] } },
    ],
  },
  {
    id: "drop",
    title: "Drop into place",
    hint: "The satisfying one: the cap hitting the bottom of the case.",
    cues: [{ id: "drop", label: "Drop" }],
    options: [
      { id: "A", name: "Bottom-Out Thock", blurb: "Heavy, deep and creamy. The big one.", cues: { drop: [creamDown(0.8, 1.25)] } },
      { id: "B", name: "Clack Slam", blurb: "A hard, bright clack with a short metallic ring.", cues: { drop: [{ v: 1.1, click: { f: 3100, q: 1.2, dec: 0.008, g: 0.55 }, ring: { f: [3350, 4720], dec: 0.015, g: 0.25 }, thock: { f: 200, drop: 0.6, dec: 0.08, g: 0.8 }, body: { f: 1400, q: 1.3, dec: 0.045, g: 0.55 } }] } },
      { id: "C", name: "Marble Settle", blurb: "A deep thump, then a tiny second tap as it settles.", cues: { drop: [domeDown(0.8, 1.2), { at: 0.09, v: 0.35, thock: { f: 180, drop: 0.7, dec: 0.06, g: 0.7 }, pop: { f: 1600, dec: 0.012, g: 0.3 } }] } },
    ],
  },
  {
    id: "hover",
    title: "Button hover",
    hint: "Barely there. A finger brushing a cap before it presses. Keep it quiet.",
    minGap: 90,
    cues: [{ id: "hover", label: "Hover" }],
    options: [
      { id: "A", name: "Feather Tick", blurb: "A whisper of plastic on plastic.", cues: { hover: [{ v: 0.45, click: { f: 5200, dec: 0.003, g: 0.16 }, thock: { f: 420, drop: 0.8, dec: 0.025, g: 0.12 } }] } },
      { id: "B", name: "Switch Ping", blurb: "A tiny metallic tick, like a spring touched once.", cues: { hover: [{ v: 0.4, click: { f: 6200, q: 2.5, dec: 0.004, g: 0.3 }, ring: { f: [5300], dec: 0.012, g: 0.1 } }] } },
      { id: "C", name: "Cap Brush", blurb: "A soft dusty brush across rubber.", cues: { hover: [{ v: 0.45, body: { f: 2300, q: 0.8, dec: 0.025, g: 0.25 }, pop: { f: 1800, dec: 0.02, g: 0.2 } }] } },
    ],
  },
  {
    id: "tab",
    title: "Tab / segmented select",
    hint: "A quick keystroke when you switch between choices.",
    cues: [{ id: "select", label: "Select" }],
    options: [
      { id: "A", name: "Gentle Key", blurb: "A short, small thock.", cues: { select: [creamDown(1.25, 0.8)] } },
      { id: "B", name: "Snappy Key", blurb: "Just the click-leaf, with almost no bottom-out.", cues: { select: [blueSnap(1.1, 0.95), blueBottom(1.25, 0.45, 0.013)] } },
      { id: "C", name: "Dome Key", blurb: "A round, low-pitched press.", cues: { select: [domeDown(1.2, 0.85)] } },
    ],
  },
  {
    id: "sheet",
    title: "Sheet open / close",
    hint: "Two quick strikes. Open climbs, close descends.",
    cues: [
      { id: "open", label: "Open" },
      { id: "close", label: "Close" },
    ],
    options: [
      { id: "A", name: "Double Thock", blurb: "Two creamy knocks, up on open and down on close.", cues: { open: [creamDown(0.85, 0.8), late(creamDown(1.15, 0.7), 0.075)], close: [creamDown(1.15, 0.65), late(creamDown(0.82, 0.8), 0.07)] } },
      { id: "B", name: "Clack Slide", blurb: "Click, clack. Like slotting a drawer into its rails.", cues: { open: [blueSnap(1.0, 0.7), blueBottom(0.9, 0.8, 0.07)], close: [blueSnap(0.9, 0.65), blueBottom(0.75, 0.85, 0.07)] } },
      { id: "C", name: "Soft Stack", blurb: "Two round thumps, like stacking two cushions.", cues: { open: [domeDown(0.9, 0.75), late(domeDown(1.2, 0.65), 0.085)], close: [domeDown(1.2, 0.6), late(domeDown(0.85, 0.8), 0.085)] } },
    ],
  },
  {
    id: "success",
    title: "Success / task complete",
    hint: "A little typed flourish with a bell on the end.",
    cues: [{ id: "done", label: "Complete" }],
    options: [
      { id: "A", name: "Triple Thock", blurb: "Three rising keys and a soft chime.", cues: { done: [creamDown(0.95, 0.7), late(creamDown(1.1, 0.75), 0.075), late(creamDown(1.3, 0.9), 0.155), { at: 0.16, v: 0.9, ring: { f: [1568, 2349, 3136], dec: 0.35, g: 0.14 } }] } },
      { id: "B", name: "Clack, Clack, Ding", blurb: "A typewriter: two clacks and the carriage bell.", cues: { done: [blueSnap(1, 0.7), blueBottom(1, 0.7), ...[blueSnap(1.1, 0.75), blueBottom(1.1, 0.75, 0.016)].map((h) => ({ ...h, at: (h.at ?? 0) + 0.08 })), { at: 0.17, v: 1, ring: { f: [2637, 3951, 5274], dec: 0.5, g: 0.2 } }] } },
      { id: "C", name: "Marble Run", blurb: "Rounded pebbles rolling up, with a warm low bell.", cues: { done: [domeDown(1.0, 0.7), late(domeDown(1.2, 0.7), 0.08), late(domeDown(1.45, 0.85), 0.16), { at: 0.165, v: 0.9, ring: { f: [1175, 1760], dec: 0.4, g: 0.14 } }] } },
    ],
  },
  {
    id: "type",
    title: "Typing in a field",
    hint: "One sound per key you type. Space is deeper.",
    cues: [
      { id: "key", label: "Key" },
      { id: "space", label: "Space" },
    ],
    options: [
      { id: "A", name: "Cream Keys", blurb: "Lubed linears in a foam case. Quiet, deep, relaxed.", cues: { key: [creamDown(1.05, 0.75)], space: [creamDown(0.7, 1.1), { at: 0.012, v: 0.4, ring: { f: [980, 1550], dec: 0.04, g: 0.08 } }] } },
      { id: "B", name: "Blue Keys", blurb: "Loud, happy, office-mate clicking.", cues: { key: blueDown(1.08, 0.85), space: [...blueDown(0.75, 1), { at: 0.03, v: 0.4, ring: { f: [1100, 1700], dec: 0.05, g: 0.1 } }] } },
      { id: "C", name: "Dome Keys", blurb: "Soft, round typing, one cushion at a time.", cues: { key: [domeDown(1.15, 0.8)], space: [domeDown(0.75, 1.15), { at: 0.015, v: 0.35, ring: { f: [900, 1400], dec: 0.04, g: 0.07 } }] } },
    ],
  },
];


/* Loudness trims, found by rendering every cue offline and matching peaks (about 0.3 to 0.4 for a
   normal press, a little over for two-strike sounds, hover left deliberately faint). */
const TRIM: Record<string, number[]> = {
  click: [1, 0.85, 1],
  tick: [1, 0.9, 1],
  switch: [0.6, 0.6, 0.6],
  pickup: [1.1, 1.5, 1.4],
  over: [1.5, 1.8, 1.5],
  hover: [1.8, 1.9, 1.9],
  sheet: [0.6, 0.62, 0.6],
  success: [0.75, 0.9, 0.75],
};
for (const ev of EVENTS) {
  ev.options.forEach((o, i) => {
    const k = TRIM[ev.id]?.[i];
    if (!k) return;
    for (const cue of Object.keys(o.cues)) o.cues[cue] = o.cues[cue].map((h) => ({ ...h, v: (h.v ?? 1) * k }));
  });
}
