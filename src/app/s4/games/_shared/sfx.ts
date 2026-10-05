/**
 * S4 shared SFX kit — the franchise's first audio (ADR-0020 quality floor).
 * Tiny WebAudio synth: no assets, no network, ~zero cost until first play().
 * Rules: muted by default until the player unmutes OR autoStart(true) is
 * passed after a user gesture; always silent under prefers-reduced-motion;
 * never throws (audio failure must never break a game).
 */

export type SfxName =
  | "tap" | "fire" | "hit" | "hurt" | "pickup" | "score" | "boost" | "ko";

type Preset = { f0: number; f1: number; dur: number; type: OscillatorType; noise?: boolean; vol?: number };

const PRESETS: Record<SfxName, Preset> = {
  tap: { f0: 660, f1: 660, dur: 0.05, type: "square", vol: 0.12 },
  fire: { f0: 880, f1: 220, dur: 0.09, type: "sawtooth", vol: 0.16 },
  hit: { f0: 300, f1: 80, dur: 0.12, type: "square", noise: true, vol: 0.2 },
  hurt: { f0: 180, f1: 60, dur: 0.25, type: "sawtooth", noise: true, vol: 0.22 },
  pickup: { f0: 520, f1: 1040, dur: 0.12, type: "triangle", vol: 0.16 },
  score: { f0: 660, f1: 1320, dur: 0.22, type: "triangle", vol: 0.18 },
  boost: { f0: 200, f1: 900, dur: 0.3, type: "sawtooth", vol: 0.14 },
  ko: { f0: 440, f1: 55, dur: 0.5, type: "square", noise: true, vol: 0.24 },
};

export type Sfx = {
  play: (name: SfxName) => void;
  muted: () => boolean;
  setMuted: (m: boolean) => void;
};

export function createSfx(startUnmuted = false): Sfx {
  let ctx: AudioContext | null = null;
  let muted = !startUnmuted;
  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function ensure(): AudioContext | null {
    if (ctx) return ctx;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function play(name: SfxName) {
    if (muted || reduced) return;
    try {
      const c = ensure();
      if (!c) return;
      if (c.state === "suspended") void c.resume();
      const p = PRESETS[name];
      const t = c.currentTime;
      const gain = c.createGain();
      gain.gain.setValueAtTime(p.vol ?? 0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
      gain.connect(c.destination);
      const osc = c.createOscillator();
      osc.type = p.type;
      osc.frequency.setValueAtTime(p.f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, p.f1), t + p.dur);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + p.dur);
      if (p.noise) {
        const len = Math.floor(c.sampleRate * p.dur);
        const buf = c.createBuffer(1, len, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = c.createBufferSource();
        src.buffer = buf;
        const ng = c.createGain();
        ng.gain.setValueAtTime((p.vol ?? 0.15) * 0.7, t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
        src.connect(ng);
        ng.connect(c.destination);
        src.start(t);
      }
    } catch {
      // audio must never break a game
    }
  }

  return {
    play,
    muted: () => muted,
    setMuted: (m: boolean) => {
      muted = m;
    },
  };
}
