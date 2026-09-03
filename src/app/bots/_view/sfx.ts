/**
 * BATTLE BOTS SFX (week 2, the fight viewer): a trimmed ADAPTED COPY of the
 * Domain Kitchen kit (src/app/chef/game/_view/sfx.ts) per the reuse law,
 * copied and not imported so the two games version apart. Synth only; a
 * sample pack rendered against the same names drops in later.
 *
 * Kept from the DK kit: one master bus with a soft compressor, a real attack
 * ramp on every voice (never an instant-on pluck), per-play detune and gain
 * jitter, a lowpassed noise layer, a voice cap, a mute that ramps the bus,
 * never throws, silent until unmuted. Math.random() is deliberate and
 * allowed here: page side only, NEVER imported by the engine (resolve.ts
 * stays deterministic; the fight would hash differently otherwise).
 *
 * The fight sound contract (engine doc section 6):
 *   tick          the tell: a swing is coming (14 frames out)
 *   whoosh        a miss
 *   clank         a block, the brass tink
 *   crunch        a hit lands on clay
 *   clang-tumble  a part breaks off and tumbles
 *   crack         the body cracks (the knockout)
 *   bell          the bell at the start and the end
 */

export type BotsSfxName = "tick" | "whoosh" | "clank" | "crunch" | "clang-tumble" | "crack" | "bell";

type Preset = {
  f0: number;
  f1: number;
  dur: number;
  type: OscillatorType;
  noise?: boolean;
  vol?: number;
  /** two-tone: alternate f0 and alt in four steps across dur (no sweep) */
  alt?: number;
  attackMs?: number;
  noiseLpf?: number;
};

const PRESETS: Record<BotsSfxName, Preset> = {
  tick: { f0: 1400, f1: 1100, dur: 0.035, type: "square", vol: 0.05, attackMs: 1 },
  whoosh: { f0: 700, f1: 180, dur: 0.18, type: "sine", noise: true, vol: 0.08, attackMs: 20, noiseLpf: 1600 },
  clank: { f0: 1900, f1: 1300, dur: 0.09, type: "triangle", noise: true, vol: 0.1, attackMs: 1, noiseLpf: 5200 },
  crunch: { f0: 260, f1: 70, dur: 0.14, type: "square", noise: true, vol: 0.14, attackMs: 3, noiseLpf: 2200 },
  "clang-tumble": { f0: 1500, f1: 300, dur: 0.55, type: "sawtooth", noise: true, vol: 0.13, attackMs: 1, noiseLpf: 3400 },
  crack: { f0: 180, f1: 40, dur: 0.6, type: "sawtooth", noise: true, vol: 0.18, attackMs: 4, noiseLpf: 900 },
  bell: { f0: 1318, f1: 1318, alt: 1760, dur: 0.5, type: "triangle", vol: 0.11, attackMs: 3 },
};

const ATTACK_MS_DEFAULT = 6;
const NOISE_LPF_DEFAULT = 2400;
const MAX_VOICES = 12;
const NOISE_GAIN = 0.7;

export interface BotsSfx {
  play: (name: BotsSfxName) => void;
  muted: () => boolean;
  setMuted: (m: boolean) => void;
  /** close the AudioContext on unmount (Chrome caps contexts per document) */
  dispose: () => void;
}

export function createBotsSfx(startUnmuted: boolean): BotsSfx {
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

  function play(name: BotsSfxName): void {
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
      // audio must never break the viewer
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
        // never break the viewer over an audio param
      }
    }
  }

  function dispose(): void {
    try {
      void ctx?.close();
    } catch {
      // already closed
    }
    ctx = null;
    master = null;
  }

  return { play, muted: () => muted, setMuted, dispose };
}
