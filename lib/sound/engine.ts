// Tiny Web Audio synth for mechanical-keyboard style UI sounds. No audio files: every sound is built
// from a few layers of oscillators and filtered noise, with a little random pitch/velocity per play.

/** One layer set of a single "strike" (a key going down, a cap bottoming out, a click leaf snapping). */
export type Hit = {
  /** Seconds after the cue starts. */
  at?: number;
  /** Loudness of this strike, 1 = normal. */
  v?: number;
  /** Low "thock": a sine whose pitch falls quickly. f = start Hz, drop = end pitch ratio. */
  thock?: { f: number; drop?: number; dec: number; g: number };
  /** Case/plate body: band-passed noise. */
  body?: { f: number; q: number; dec: number; g: number };
  /** The sharp transient: high-passed (or band-passed when q is set) noise, a few ms long. */
  click?: { f: number; q?: number; dec: number; g: number };
  /** Metallic click-jacket ring: a few inharmonic sine partials that die fast. */
  ring?: { f: number[]; dec: number; g: number };
  /** Soft pop: low-passed noise, for rubber-dome and Topre-like thumps. */
  pop?: { f: number; dec: number; g: number };
  pan?: number;
};

export type PlayOpts = {
  /** Extra pitch multiplier (e.g. typing a higher key). */
  pitch?: number;
  /** Extra loudness multiplier. */
  gain?: number;
};

export type Engine = {
  ctx: BaseAudioContext;
  out: AudioNode;
  play(hits: Hit[], opts?: PlayOpts): void;
  setVolume(v: number): void;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeNoise(ctx: BaseAudioContext) {
  const len = Math.floor(ctx.sampleRate * 1.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** A short, dark room: it makes the strikes sound like they happen inside a case instead of in a void. */
function makeRoom(ctx: BaseAudioContext) {
  const len = Math.floor(ctx.sampleRate * 0.16);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

export function createEngine(ctx: BaseAudioContext, volume = 0.8): Engine {
  const master = ctx.createGain();
  master.gain.value = volume;
  // A gentle limiter keeps stacked sounds (drag over many targets) from ever clipping.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 5;
  comp.attack.value = 0.002;
  comp.release.value = 0.08;
  const bus = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1;
  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  const room = ctx.createConvolver();
  room.buffer = makeRoom(ctx);
  bus.connect(dry).connect(comp);
  bus.connect(room).connect(wet).connect(comp);
  comp.connect(master).connect(ctx.destination);
  const noise = makeNoise(ctx);

  function envelope(g: GainNode, t: number, peak: number, dec: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.0008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
  }

  function noiseSrc(t: number, dur: number) {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.start(t, rand(0, 0.9), dur);
    return s;
  }

  function strike(h: Hit, t0: number, pitch: number, gain: number) {
    const t = t0 + (h.at ?? 0);
    const v = (h.v ?? 1) * gain * rand(0.88, 1.12);
    const p = pitch * rand(0.965, 1.035);
    const dest: AudioNode = ctx.createGain();
    (dest as GainNode).gain.value = 1;
    let tail: AudioNode = dest;
    if (h.pan && "createStereoPanner" in ctx) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = h.pan;
      dest.connect(pan);
      tail = pan;
    }
    tail.connect(bus);
    const stopAt = (n: AudioScheduledSourceNode, end: number) => n.stop(end + 0.02);

    if (h.thock) {
      const o = ctx.createOscillator();
      o.type = "sine";
      const f = h.thock.f * p;
      o.frequency.setValueAtTime(f * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f * (h.thock.drop ?? 0.6)), t + h.thock.dec * 0.7);
      const g = ctx.createGain();
      envelope(g, t, h.thock.g * v, h.thock.dec);
      o.connect(g).connect(dest);
      o.start(t);
      stopAt(o, t + h.thock.dec);
    }
    if (h.body) {
      const s = noiseSrc(t, h.body.dec + 0.03);
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = h.body.f * p;
      f.Q.value = h.body.q;
      const g = ctx.createGain();
      envelope(g, t, h.body.g * v, h.body.dec);
      s.connect(f).connect(g).connect(dest);
    }
    if (h.click) {
      const s = noiseSrc(t, h.click.dec + 0.02);
      const f = ctx.createBiquadFilter();
      f.type = h.click.q ? "bandpass" : "highpass";
      f.frequency.value = h.click.f * p;
      if (h.click.q) f.Q.value = h.click.q;
      const g = ctx.createGain();
      envelope(g, t, h.click.g * v, h.click.dec);
      s.connect(f).connect(g).connect(dest);
    }
    if (h.pop) {
      const s = noiseSrc(t, h.pop.dec + 0.02);
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = h.pop.f * p;
      f.Q.value = 0.7;
      const g = ctx.createGain();
      envelope(g, t, h.pop.g * v, h.pop.dec);
      s.connect(f).connect(g).connect(dest);
    }
    if (h.ring) {
      for (const hz of h.ring.f) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = hz * p * rand(0.99, 1.01);
        const g = ctx.createGain();
        envelope(g, t, (h.ring.g / h.ring.f.length) * 1.6 * v, h.ring.dec * rand(0.85, 1.15));
        o.connect(g).connect(dest);
        o.start(t);
        stopAt(o, t + h.ring.dec * 1.2);
      }
    }
  }

  return {
    ctx,
    out: master,
    play(hits, opts = {}) {
      const t0 = ctx.currentTime + 0.005;
      const pitch = (opts.pitch ?? 1) * rand(0.97, 1.03);
      const gain = opts.gain ?? 1;
      for (const h of hits) strike(h, t0, pitch, gain);
    },
    setVolume(v) {
      master.gain.setTargetAtTime(v, ctx.currentTime, 0.02);
    },
  };
}
