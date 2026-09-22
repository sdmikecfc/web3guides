/**
 * S5 shared SFX kit — sample-first WebAudio engine with a synth fallback.
 * Public entry point (unchanged): `createSfx(startUnmuted)` -> `Sfx`. Games
 * call `sfx.play("cannon")` exactly as before; every addition below is
 * additive, so no call site anywhere needs to change.
 *
 * SAMPLE-FIRST, ALWAYS: play()/loop() ask audio.ts (peek()) for a decoded
 * AudioBuffer for the name. If one exists, it plays through the bus. If not
 * (not fetched yet, still decoding, or the file/folder is missing), the call
 * synthesizes instead — same call site, no game-side branching, and a call
 * also nudges audio.ts to fetch that name in the background so the NEXT play
 * of it can be sample-backed. A missing /s5-art/audio directory therefore
 * degrades every game to the synth bank with zero visible failure, exactly
 * the art.ts precedent (art never blocks code; audio never blocks a frame).
 *
 * SIGNAL PATH: every voice (sample or synth, one-shot or loop) connects to
 * ONE master bus: perVoiceGain -> masterGain -> DynamicsCompressor (a soft
 * limiter) -> destination. A concurrent-voice cap (MAX_VOICES) on one-shots
 * means a kill-streak burst gets quieter via the compressor, never clipped.
 *
 * SYNTH PATH: every preset now has a real ATTACK ramp (0 -> vol, not the old
 * instant-on pluck), plus per-play detune jitter (+/- cents) and gain jitter
 * so repeated shots do not sound machine-stamped, and a BiquadFilterNode
 * lowpass on every noise layer so explosions read as rumbles, not white
 * hiss. Jitter uses Math.random() deliberately: this module is page/render
 * side only and is NEVER imported by a sim, so it is exempt from the
 * sims'-must-be-Math.random()-free rule (see the games' sim.ts headers). The
 * SAMPLE path does not re-gain/re-jitter: the pack is already
 * loudness-balanced (transients peak-normalised, sustained tones held back),
 * so samples play at ~unity into the bus by design.
 *
 * LOOP API: `sfx.loop(name, opts?) -> { stop(fadeMs?), setRate(r), setGain(g) }`.
 * Always returns a live handle, sample-backed or synth-backed, muted or not
 * (a muted/failed loop returns a harmless no-op handle so callers never need
 * a null check). Sample-backed loops use loopStart=0 / loopEnd=buffer.duration
 * exactly: the six loop .wav files are PCM, exactly 2.000s, wrap-crossfaded
 * by construction, so the naive full-buffer loop is already seamless (no
 * inset needed). A synth-backed loop is an oscillator (+ an optional filtered
 * noise layer, some with a slow LFO wobble) that sustains until stop(). Every
 * loop fades in on start and fades out on stop (default ~150ms either way).
 * setRate(r) is how an engine revs with speed: it scales AudioBufferSourceNode
 * .playbackRate (sample) or the oscillator's base frequency (synth) alike.
 *
 * sfx.buzz(pattern): a navigator.vibrate() helper, feature-detected, a no-op
 * where unsupported. Governed by the MUTE toggle only (never by
 * prefers-reduced-motion — a motion preference is not a haptics/audio
 * preference).
 *
 * sfx.stopAll(): kills every active loop (immediate, no fade) and forgets
 * every one-shot voice bookkeeping. RunShell calls this on run-end AND on
 * unmount AND defensively before a new run starts, because a leaked engine
 * loop is the worst possible bug in this kit.
 *
 * A11Y FIX: prefers-reduced-motion NO LONGER gates audio anywhere in this
 * module (the old bug: a motion preference is not an audio preference).
 * Audio is gated by the mute toggle ONLY. Reduced-motion still governs
 * shake/particles etc. elsewhere (RunShell, pagefx.ts) — untouched by this
 * file.
 *
 * Spirit unchanged from the original kit: no dependencies, never throws,
 * silent by default until unmuted.
 */

import { ensure as ensureSample, isUnlocked, peek as peekSample, prefetch as prefetchSamples, unlock } from "./audio";

// ── the fixed sound-name contract (a sample pack is rendered against this
// exact list; do not rename, add or drop entries here) ─────────────────────
export type SfxName =
  | "tap"
  | "fire"
  | "hit"
  | "hurt"
  | "pickup"
  | "score"
  | "boost"
  | "ko"
  | "cannon"
  | "clank"
  | "alarm"
  | "reload"
  | "explode"
  | "blast"
  | "flak"
  | "bombdrop"
  | "bombhit"
  | "ricochet"
  | "casing"
  | "powerup"
  | "banner"
  | "boss"
  | "fanfare"
  | "pb"
  | "door"
  | "breaker"
  | "warn"
  | "rumble"
  | "splash";

export type SfxLoopName = "eng-tank" | "eng-truck" | "eng-prop" | "eng-hover" | "mg-loop"
  | "klaxon-loop" | "rumble-loop";

type Preset = {
  f0: number;
  f1: number;
  dur: number;
  type: OscillatorType;
  noise?: boolean;
  vol?: number;
  /** Two-tone mode: alternate f0/alt in four steps across dur (no sweep). */
  alt?: number;
  /** Amplitude attack time, ms. Default ATTACK_MS_DEFAULT. This is the fix
   * for the old decay-only "pluck": every preset now ramps UP first. */
  attackMs?: number;
  /** Lowpass cutoff (Hz) applied to the noise layer only. Lower = duller
   * rumble, higher = brighter hiss/crack. Default NOISE_LPF_DEFAULT. */
  noiseLpf?: number;
};

const ATTACK_MS_DEFAULT = 6;
const NOISE_LPF_DEFAULT = 2400;

const PRESETS: Record<SfxName, Preset> = {
  // ── the 12 that exist today: same character, now with an attack + (where
  // noisy) a tuned noise colour instead of white hiss ──
  tap: { f0: 660, f1: 660, dur: 0.05, type: "square", vol: 0.12, attackMs: 2 },
  fire: { f0: 880, f1: 220, dur: 0.09, type: "sawtooth", vol: 0.16, attackMs: 3 },
  hit: { f0: 300, f1: 80, dur: 0.12, type: "square", noise: true, vol: 0.2, attackMs: 4, noiseLpf: 3000 },
  hurt: { f0: 180, f1: 60, dur: 0.25, type: "sawtooth", noise: true, vol: 0.22, attackMs: 8, noiseLpf: 1400 },
  pickup: { f0: 520, f1: 1040, dur: 0.12, type: "triangle", vol: 0.16, attackMs: 10 },
  score: { f0: 660, f1: 1320, dur: 0.22, type: "triangle", vol: 0.18, attackMs: 12 },
  boost: { f0: 200, f1: 900, dur: 0.3, type: "sawtooth", vol: 0.14, attackMs: 15 },
  ko: { f0: 440, f1: 55, dur: 0.5, type: "square", noise: true, vol: 0.24, attackMs: 6, noiseLpf: 900 },
  cannon: { f0: 120, f1: 40, dur: 0.35, type: "sawtooth", noise: true, vol: 0.26, attackMs: 5, noiseLpf: 500 },
  clank: { f0: 900, f1: 500, dur: 0.07, type: "square", vol: 0.18, attackMs: 1 },
  alarm: { f0: 520, f1: 660, alt: 660, dur: 0.4, type: "square", vol: 0.16, attackMs: 8 },
  reload: { f0: 280, f1: 340, dur: 0.08, type: "triangle", vol: 0.12, attackMs: 2 },

  // ── the 17 new names (each authored fresh for this pass) ──
  explode: { f0: 150, f1: 50, dur: 0.3, type: "sawtooth", noise: true, vol: 0.22, attackMs: 4, noiseLpf: 700 },
  blast: { f0: 110, f1: 35, dur: 0.55, type: "sawtooth", noise: true, vol: 0.28, attackMs: 5, noiseLpf: 450 },
  flak: { f0: 700, f1: 200, dur: 0.15, type: "square", noise: true, vol: 0.2, attackMs: 1, noiseLpf: 2600 },
  bombdrop: { f0: 900, f1: 260, dur: 0.6, type: "sine", vol: 0.14, attackMs: 30 },
  bombhit: { f0: 90, f1: 30, dur: 0.6, type: "sawtooth", noise: true, vol: 0.3, attackMs: 3, noiseLpf: 350 },
  ricochet: { f0: 500, f1: 1800, dur: 0.35, type: "triangle", noise: true, vol: 0.16, attackMs: 2, noiseLpf: 4200 },
  casing: { f0: 1800, f1: 900, dur: 0.12, type: "triangle", vol: 0.08, attackMs: 1 },
  powerup: { f0: 700, f1: 1700, dur: 0.28, type: "triangle", vol: 0.2, attackMs: 8 },
  banner: { f0: 440, f1: 440, alt: 660, dur: 0.5, type: "sawtooth", vol: 0.2, attackMs: 4 },
  boss: { f0: 90, f1: 50, dur: 0.7, type: "sawtooth", noise: true, vol: 0.26, attackMs: 20, noiseLpf: 600 },
  fanfare: { f0: 660, f1: 660, alt: 880, dur: 0.9, type: "triangle", vol: 0.22, attackMs: 6 },
  pb: { f0: 1200, f1: 2200, dur: 0.4, type: "sine", vol: 0.18, attackMs: 3 },
  door: { f0: 70, f1: 40, dur: 0.4, type: "square", noise: true, vol: 0.22, attackMs: 15, noiseLpf: 300 },
  breaker: { f0: 150, f1: 60, dur: 0.15, type: "square", noise: true, vol: 0.2, attackMs: 1, noiseLpf: 1000 },
  warn: { f0: 880, f1: 880, alt: 660, dur: 0.3, type: "square", vol: 0.16, attackMs: 2 },
  rumble: { f0: 60, f1: 25, dur: 0.8, type: "sawtooth", noise: true, vol: 0.26, attackMs: 40, noiseLpf: 250 },
  splash: { f0: 400, f1: 150, dur: 0.25, type: "sine", noise: true, vol: 0.15, attackMs: 5, noiseLpf: 1800 },
};

type LoopPreset = {
  freq: number;
  type: OscillatorType;
  noiseMix: number; // 0 = tone only
  lpf: number;
  gain: number;
  wobbleHz?: number; // slow LFO on detune (klaxon warble)
  wobbleCents?: number;
};

const LOOP_PRESETS: Record<SfxLoopName, LoopPreset> = {
  "eng-tank": { freq: 55, type: "sawtooth", noiseMix: 0.35, lpf: 700, gain: 0.16 }, // diesel idle
  "eng-truck": { freq: 70, type: "sawtooth", noiseMix: 0.3, lpf: 900, gain: 0.14 }, // convoy, lighter
  "eng-prop": { freq: 140, type: "sawtooth", noiseMix: 0.4, lpf: 1500, gain: 0.13 }, // aircraft drone
  "eng-hover": { freq: 220, type: "sine", noiseMix: 0.5, lpf: 2200, gain: 0.11 }, // hover hum
  // sustained MG: the synth fallback is a fast wobble on a noisy body. The
  // real pack clip is cadence-matched to MG_CD so its 10 shots wrap a 1.1s loop.
  "mg-loop": { freq: 190, type: "square", noiseMix: 0.75, lpf: 3200, gain: 0.12, wobbleHz: 9, wobbleCents: 120 },
  "klaxon-loop": { freq: 500, type: "square", noiseMix: 0, lpf: 4000, gain: 0.14, wobbleHz: 4, wobbleCents: 260 },
  "rumble-loop": { freq: 45, type: "sawtooth", noiseMix: 0.6, lpf: 300, gain: 0.18 }, // structural groan
};

export interface SfxLoopHandle {
  /** Fade out over fadeMs (default 150) then stop and free the nodes. Safe
   * to call more than once; the second call is a no-op. */
  stop: (fadeMs?: number) => void;
  /** Rev with speed: scales sample playbackRate or the synth's base
   * frequency alike (pitch moves with rate, same as a real engine). */
  setRate: (r: number) => void;
  setGain: (g: number) => void;
}

export interface SfxLoopOpts {
  gain?: number; // default 1 (multiplies the preset/pack level)
  rate?: number; // default 1
  fadeMs?: number; // fade-IN duration; default 150
}

export type Sfx = {
  play: (name: SfxName) => void;
  loop: (name: SfxLoopName, opts?: SfxLoopOpts) => SfxLoopHandle;
  buzz: (pattern: number | number[]) => void;
  /** Warm audio.ts's cache for a game's whole pack; call once at run start.
   * No-op (and free) while muted/locked — see audio.ts's unlock(). */
  prefetch: (names: readonly string[]) => void;
  /** Kill every active loop immediately and reset one-shot voice bookkeeping.
   * Call on run end AND on unmount: a leaked loop must never survive a run. */
  stopAll: () => void;
  muted: () => boolean;
  setMuted: (m: boolean) => void;
};

const MAX_VOICES = 24; // concurrent one-shot cap; the compressor handles the rest
const NOISE_JITTER_GAIN = 0.7; // noise layer sits under the tone layer

export function createSfx(startUnmuted = false): Sfx {
  let ctx: AudioContext | null = null;
  let muted = !startUnmuted;
  let master: { gain: GainNode; comp: DynamicsCompressorNode } | null = null;
  let voiceCount = 0;
  const activeLoops = new Set<{ kill: () => void }>();

  if (startUnmuted) unlock(); // born unmuted = the unlock gesture already happened

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

  function ensureMaster(c: AudioContext): { gain: GainNode; comp: DynamicsCompressorNode } {
    if (master) return master;
    const gain = c.createGain();
    gain.gain.value = 0.9; // headroom under the limiter
    const comp = c.createDynamicsCompressor();
    const t = c.currentTime;
    comp.threshold.setValueAtTime(-18, t);
    comp.knee.setValueAtTime(24, t);
    comp.ratio.setValueAtTime(6, t);
    comp.attack.setValueAtTime(0.003, t);
    comp.release.setValueAtTime(0.25, t);
    gain.connect(comp);
    comp.connect(c.destination);
    master = { gain, comp };
    return master;
  }

  function voiceStart(): boolean {
    if (voiceCount >= MAX_VOICES) return false;
    voiceCount++;
    return true;
  }
  function voiceEnd() {
    voiceCount = Math.max(0, voiceCount - 1);
  }

  function playSample(c: AudioContext, buf: AudioBuffer) {
    const m = ensureMaster(c);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.value = 1; // the pack is loudness-balanced: play at ~unity into the bus
    src.connect(g);
    g.connect(m.gain);
    src.onended = () => {
      voiceEnd();
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        // already torn down
      }
    };
    src.start();
  }

  function playSynth(c: AudioContext, name: SfxName) {
    const m = ensureMaster(c);
    const p = PRESETS[name];
    const t = c.currentTime;
    const attack = Math.max(1, p.attackMs ?? ATTACK_MS_DEFAULT) / 1000;
    const gainJitter = 1 + (Math.random() * 2 - 1) * 0.08; // +/-8%: Math.random is fine, page-side only
    const detuneJitter = (Math.random() * 2 - 1) * 18; // +/-18 cents
    const vol = Math.max(0.0002, (p.vol ?? 0.15) * gainJitter);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack); // the real attack ramp (was instant-on)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
    gain.connect(m.gain);

    const osc = c.createOscillator();
    osc.type = p.type;
    osc.detune.value = detuneJitter;
    if (p.alt != null) {
      const seg = p.dur / 4;
      for (let i = 0; i < 4; i++) osc.frequency.setValueAtTime(i % 2 === 0 ? p.f0 : p.alt, t + i * seg);
    } else {
      osc.frequency.setValueAtTime(p.f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, p.f1), t + p.dur);
    }
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + p.dur + 0.03);
    osc.onended = () => {
      voiceEnd();
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
      ng.gain.exponentialRampToValueAtTime(vol * NOISE_JITTER_GAIN, t + attack);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
      src.connect(filt);
      filt.connect(ng);
      ng.connect(m.gain);
      src.start(t);
      src.stop(t + p.dur + 0.03);
    }
  }

  function play(name: SfxName) {
    if (muted) return;
    try {
      const c = ensureCtx();
      if (!c) return;
      if (c.state === "suspended") void c.resume();
      const buf = peekSample(name);
      if (buf) {
        if (!voiceStart()) return;
        playSample(c, buf);
        return;
      }
      // not decoded (yet): kick a background fetch for next time, synth now
      void ensureSample(c, name);
      if (!voiceStart()) return;
      playSynth(c, name);
    } catch {
      // audio must never break a game
    }
  }

  function makeLoopingNoise(c: AudioContext, lpf: number): { src: AudioBufferSourceNode; filt: BiquadFilterNode } {
    const len = Math.max(1, Math.floor(c.sampleRate * 1)); // 1s of noise, looped
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filt = c.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = lpf;
    filt.Q.value = 0.6;
    src.connect(filt);
    return { src, filt };
  }

  function loop(name: SfxLoopName, opts: SfxLoopOpts = {}): SfxLoopHandle {
    const noop: SfxLoopHandle = { stop: () => {}, setRate: () => {}, setGain: () => {} };
    if (muted) return noop;
    const c = ensureCtx();
    if (!c) return noop;
    try {
      if (c.state === "suspended") void c.resume();
      const m = ensureMaster(c);
      const gain0 = opts.gain ?? 1;
      const rate0 = opts.rate ?? 1;
      const fadeInMs = opts.fadeMs ?? 150;
      const preset = LOOP_PRESETS[name];
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, preset.gain * gain0), c.currentTime + fadeInMs / 1000);
      g.connect(m.gain);

      let stopped = false;
      const buf = peekSample(name);
      let sampleSrc: AudioBufferSourceNode | null = null;
      let synthOsc: OscillatorNode | null = null;
      let synthNoise: AudioBufferSourceNode | null = null;
      let synthLfo: OscillatorNode | null = null;

      if (buf) {
        const src = c.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        // PCM, exactly 2.000s, wrap-crossfaded by construction: the exact
        // full-buffer loop is already seamless, no inset needed.
        src.loopStart = 0;
        src.loopEnd = buf.duration;
        src.playbackRate.value = rate0;
        src.connect(g);
        src.start();
        sampleSrc = src;
      } else {
        void ensureSample(c, name); // warm the cache for next time
        const osc = c.createOscillator();
        osc.type = preset.type;
        osc.frequency.value = preset.freq * rate0;
        const filt = c.createBiquadFilter();
        filt.type = "lowpass";
        filt.frequency.value = preset.lpf;
        osc.connect(filt);
        filt.connect(g);
        if (preset.wobbleHz) {
          const lfo = c.createOscillator();
          lfo.type = "sine";
          lfo.frequency.value = preset.wobbleHz;
          const lfoGain = c.createGain();
          lfoGain.gain.value = preset.wobbleCents ?? 0;
          lfo.connect(lfoGain);
          lfoGain.connect(osc.detune);
          lfo.start();
          synthLfo = lfo;
        }
        osc.start();
        synthOsc = osc;
        if (preset.noiseMix > 0) {
          const { src: nsrc, filt: nfilt } = makeLoopingNoise(c, preset.lpf * 0.6);
          const ng = c.createGain();
          ng.gain.value = preset.noiseMix;
          nfilt.connect(ng);
          ng.connect(g);
          nsrc.start();
          synthNoise = nsrc;
        }
      }

      const entry = {
        kill: () => {
          if (stopped) return;
          stopped = true;
          try {
            sampleSrc?.stop();
          } catch {
            // already stopped
          }
          try {
            synthOsc?.stop();
          } catch {
            // already stopped
          }
          try {
            synthNoise?.stop();
          } catch {
            // already stopped
          }
          try {
            synthLfo?.stop();
          } catch {
            // already stopped
          }
          try {
            g.disconnect();
          } catch {
            // already disconnected
          }
        },
      };
      activeLoops.add(entry);

      const handle: SfxLoopHandle = {
        stop(fadeMsOut = 150) {
          if (stopped) return;
          try {
            const t = c.currentTime;
            g.gain.cancelScheduledValues(t);
            g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.02, fadeMsOut / 1000));
          } catch {
            // fall through to immediate kill below
          }
          const waitMs = Math.max(20, fadeMsOut) + 40;
          setTimeout(() => {
            entry.kill();
            activeLoops.delete(entry);
          }, waitMs);
        },
        setRate(r) {
          if (stopped) return;
          try {
            if (sampleSrc) sampleSrc.playbackRate.setTargetAtTime(r, c.currentTime, 0.05);
            else if (synthOsc) synthOsc.frequency.setTargetAtTime(preset.freq * r, c.currentTime, 0.05);
          } catch {
            // never break a game over an audio param
          }
        },
        setGain(gg) {
          if (stopped) return;
          try {
            g.gain.setTargetAtTime(Math.max(0.0001, preset.gain * gg), c.currentTime, 0.05);
          } catch {
            // never break a game over an audio param
          }
        },
      };
      return handle;
    } catch {
      return noop;
    }
  }

  function buzz(pattern: number | number[]) {
    if (muted) return; // governed by mute, NOT reduced-motion
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(pattern);
      }
    } catch {
      // unsupported/blocked: never throws
    }
  }

  function prefetch(names: readonly string[]) {
    try {
      const c = ensureCtx();
      if (!c) return;
      prefetchSamples(c, names);
    } catch {
      // never break a game over a warm-up fetch
    }
  }

  function stopAll() {
    for (const entry of Array.from(activeLoops)) {
      entry.kill();
    }
    activeLoops.clear();
    voiceCount = 0; // one-shots self-clean via onended; this just resets bookkeeping
  }

  /** Mute gates future play()/loop() calls (unchanged), AND ramps the master
   * bus itself so an ALREADY-RUNNING loop (an engine idle, a klaxon) goes
   * silent immediately too — the old kit only gated new calls, which left a
   * mid-run engine loop audibly running right through a mute tap. */
  function setMutedImpl(m: boolean) {
    muted = m;
    if (!m) unlock(); // a manual unmute is also "the first gesture" for a visitor who started muted
    if (master && ctx) {
      try {
        const t = ctx.currentTime;
        master.gain.gain.cancelScheduledValues(t);
        master.gain.gain.setValueAtTime(master.gain.gain.value, t);
        master.gain.gain.linearRampToValueAtTime(m ? 0 : 0.9, t + 0.05);
      } catch {
        // never break a game over an audio param
      }
    }
  }

  return {
    play,
    loop,
    buzz,
    prefetch,
    stopAll,
    muted: () => muted,
    setMuted: setMutedImpl,
  };
}

/** Re-exported so a caller can check unlock state without importing audio.ts
 * directly (kept minimal; most games never need this). */
export { isUnlocked };
