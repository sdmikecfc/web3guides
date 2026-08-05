/**
 * Domain Kitchen SFX (ADR-0101 M3b): a trimmed ADAPTED COPY of the S5 shared
 * kit (s5/games/_shared/sfx.ts) — copied, not imported, per the reuse law.
 * Synth-only for now; the sample-override path returns when a DK pack is
 * rendered through the S5 offline audio pipeline (drop-in: same names).
 *
 * Kept from the S5 kit: one master bus with a soft compressor, real attack
 * ramps (never instant-on plucks), per-play detune/gain jitter, lowpassed
 * noise layers, voice cap, mute that ramps the bus, never throws.
 * Math.random() is deliberate and allowed here: page-side only, NEVER
 * imported by the sim (world.ts stays deterministic).
 *
 * The DK sound contract (a future sample pack renders against this list):
 *   doorbell  a guest pushes the door open
 *   serve     a plate lands (soft ding)
 *   kaching   a shop purchase
 *   bus       dishes swept off a table
 *   hustle    crew speed boost
 *   heart     a guest leaves delighted
 *   gus       Gus arrives (warm two-note hello)
 *   unlock    the house special unlocks / masters
 */

export type DkSfxName =
  | "doorbell"
  | "serve"
  | "kaching"
  | "bus"
  | "hustle"
  | "heart"
  | "gus"
  | "unlock";

type Preset = {
  f0: number;
  f1: number;
  dur: number;
  type: OscillatorType;
  noise?: boolean;
  vol?: number;
  alt?: number;
  attackMs?: number;
  noiseLpf?: number;
};

const PRESETS: Record<DkSfxName, Preset> = {
  doorbell: { f0: 880, f1: 880, alt: 1174, dur: 0.32, type: "triangle", vol: 0.09, attackMs: 4 },
  serve: { f0: 660, f1: 990, dur: 0.14, type: "triangle", vol: 0.11, attackMs: 6 },
  kaching: { f0: 1318, f1: 1318, alt: 1760, dur: 0.2, type: "square", vol: 0.1, attackMs: 2 },
  bus: { f0: 420, f1: 180, dur: 0.13, type: "square", noise: true, vol: 0.11, attackMs: 2, noiseLpf: 3400 },
  hustle: { f0: 300, f1: 940, dur: 0.2, type: "sine", vol: 0.1, attackMs: 8 },
  heart: { f0: 880, f1: 1760, dur: 0.28, type: "sine", vol: 0.09, attackMs: 10 },
  gus: { f0: 523, f1: 523, alt: 659, dur: 0.4, type: "triangle", vol: 0.11, attackMs: 8 },
  unlock: { f0: 523, f1: 1046, dur: 0.36, type: "triangle", vol: 0.13, attackMs: 6 },
};

const ATTACK_MS_DEFAULT = 6;
const NOISE_LPF_DEFAULT = 2400;
const MAX_VOICES = 12;
const NOISE_GAIN = 0.7;

export interface DkSfx {
  play: (name: DkSfxName) => void;
  muted: () => boolean;
  setMuted: (m: boolean) => void;
}

export function createDkSfx(startUnmuted: boolean): DkSfx {
  let ctx: AudioContext | null = null;
  let muted = !startUnmuted;
  let master: GainNode | null = null;
  let voiceCount = 0;

  function ensureCtx(): AudioContext | null {
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

  function ensureMaster(c: AudioContext): GainNode {
    if (master) return master;
    const gain = c.createGain();
    gain.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    const t = c.currentTime;
    comp.threshold.setValueAtTime(-18, t);
    comp.knee.setValueAtTime(24, t);
    comp.ratio.setValueAtTime(6, t);
    comp.attack.setValueAtTime(0.003, t);
    comp.release.setValueAtTime(0.25, t);
    gain.connect(comp);
    comp.connect(c.destination);
    master = gain;
    return master;
  }

  function play(name: DkSfxName): void {
    if (muted) return;
    try {
      const c = ensureCtx();
      if (!c) return;
      if (c.state === "suspended") void c.resume();
      if (voiceCount >= MAX_VOICES) return;
      voiceCount++;

      const m = ensureMaster(c);
      const p = PRESETS[name];
      const t = c.currentTime;
      const attack = Math.max(1, p.attackMs ?? ATTACK_MS_DEFAULT) / 1000;
      const vol = Math.max(0.0002, (p.vol ?? 0.12) * (1 + (Math.random() * 2 - 1) * 0.08));

      const gain = c.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
      gain.connect(m);

      const osc = c.createOscillator();
      osc.type = p.type;
      osc.detune.value = (Math.random() * 2 - 1) * 14;
      if (p.alt != null) {
        const seg = p.dur / 4;
        for (let i = 0; i < 4; i++) {
          osc.frequency.setValueAtTime(i % 2 === 0 ? p.f0 : p.alt, t + i * seg);
        }
      } else {
        osc.frequency.setValueAtTime(p.f0, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, p.f1), t + p.dur);
      }
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + p.dur + 0.03);
      osc.onended = () => {
        voiceCount = Math.max(0, voiceCount - 1);
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // already torn down
        }
      };

      if (p.noise) {
        const len = Math.max(1, Math.floor(c.sampleRate * p.dur));
        const buf = c.createBuffer(1, len, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = c.createBufferSource();
        src.buffer = buf;
        const filt = c.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = p.noiseLpf ?? NOISE_LPF_DEFAULT;
        filt.Q.value = 0.7;
        const ng = c.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(vol * NOISE_GAIN, t + attack);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
        src.connect(filt);
        filt.connect(ng);
        ng.connect(m);
        src.start(t);
        src.stop(t + p.dur + 0.03);
      }
    } catch {
      // audio must never break the game
    }
  }

  function setMuted(m: boolean): void {
    muted = m;
    if (master && ctx) {
      try {
        const t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(m ? 0 : 0.9, t + 0.05);
      } catch {
        // never break the game over an audio param
      }
    }
  }

  return { play, muted: () => muted, setMuted };
}
