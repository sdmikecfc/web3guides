import type { EventV7 } from "@/lib/bots/v7/types";

/** Original synthesized mechanical proof cues; the final Foley pass follows visual approval. */
export function createRemasterAudio() {
  let context: AudioContext | null = null, master: GainNode | null = null, bus: MediaStreamAudioDestinationNode | null = null;
  let muted = true, disposed = false;
  const voices = new Set<AudioScheduledSourceNode>();
  const filters = new Set<AudioNode>();
  const seen = new Set<number>();
  let noise: AudioBuffer | null = null;
  function unlock() {
    if (disposed) return;
    if (!context) {
      context = new AudioContext(); master = context.createGain(); master.gain.value = muted ? 0 : .56;
      const limiter = context.createDynamicsCompressor(); limiter.threshold.value = -13; limiter.knee.value = 14; limiter.ratio.value = 8; limiter.attack.value = .003; limiter.release.value = .12;
      bus = context.createMediaStreamDestination(); master.connect(limiter); limiter.connect(context.destination); limiter.connect(bus); filters.add(limiter);
      noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const values = noise.getChannelData(0); let random = 34712;
      for (let i = 0; i < values.length; i++) { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; values[i] = random / 2147483648 - 1; }
    }
    void context.resume().catch(() => undefined);
  }
  function layer(hz: number, endHz: number, duration: number, volume: number, side: number, type: OscillatorType | "noise" = "sine", delay = 0) {
    if (disposed || muted || !context || !master || context.state !== "running" || voices.size >= 28) return;
    const start = context.currentTime + delay, gain = context.createGain(), pan = context.createStereoPanner(), filter = context.createBiquadFilter();
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(volume, start + .003); gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    pan.pan.value = side === 0 ? -.25 : .25;
    filter.type = "lowpass"; filter.frequency.setValueAtTime(type === "noise" ? hz : 7000, start); filter.frequency.exponentialRampToValueAtTime(Math.max(50, type === "noise" ? endHz : 4000), start + duration);
    const source = type === "noise" ? context.createBufferSource() : context.createOscillator();
    if (source instanceof AudioBufferSourceNode) source.buffer = noise;
    else { source.type = type as OscillatorType; source.frequency.setValueAtTime(hz, start); source.frequency.exponentialRampToValueAtTime(Math.max(20, endHz), start + duration); }
    source.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(master);
    voices.add(source); source.start(start); source.stop(start + duration + .01);
    source.onended = () => { voices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); pan.disconnect(); };
  }
  function event(e: EventV7) {
    if (seen.has(e.id)) return; seen.add(e.id);
    const side = e.who, weapon = e.weapon ?? "hammer";
    const gun = /rifle|shotgun|cannon|pistol|burst/.test(weapon), heavy = /hammer|cannon|charge/.test(weapon);
    if (e.kind === "windup") {
      if (gun) { layer(240, 370, .12, .1, side, "triangle"); layer(2200, 600, .08, .1, side, "noise", .07); }
      else { layer(700, 2800, .23, .13, side, "noise"); layer(85, 130, .18, .05, side); }
    } else if (e.kind === "shot") {
      layer(heavy ? 70 : 145, 35, heavy ? .5 : .19, heavy ? .65 : .42, side);
      layer(6500, 330, heavy ? .34 : .16, .8, side, "noise");
      layer(1100, 230, .12, .07, side, "triangle", .025);
    } else if (e.kind === "hit") {
      layer(heavy ? 72 : 125, 35, heavy ? .32 : .15, heavy ? .62 : .36, side);
      layer(2400, 380, .13, .3, side, "noise");
      layer(760, 730, .22, .11, side, "triangle"); layer(1189, 1170, .13, .065, side, "sine");
    } else if (e.kind === "block") {
      layer(1300, 1250, .27, .24, side, "triangle"); layer(2247, 2200, .2, .09, side); layer(90, 45, .14, .18, side);
    } else if (e.kind === "special_start") {
      const style = e.ability;
      if (style === "speed") { layer(150, 900, .6, .21, side, "sawtooth"); layer(2400, 5400, .5, .22, side, "noise"); }
      else if (style === "ranged") { layer(650, 190, .85, .15, side, "triangle"); layer(990, 292, .9, .08, side); }
      else { layer(60, 135, .65, .34, side); layer(1200, 540, .42, .12, side, "noise"); }
    } else if (e.kind === "special_end") {
      layer(350, 65, .4, .12, side, "triangle");
    } else if (e.kind === "break" || e.kind === "knockdown" || e.kind === "ko") {
      layer(78, 28, .5, .48, side); layer(1300, 260, .35, .32, side, "noise");
      for (let i = 0; i < 3; i++) layer(730 + i * 230, 660 + i * 220, .2, .11 / (i + 1), side, "triangle", .12 + i * .14);
      if (e.kind === "ko") { layer(650, 400, 1.3, .1, side, "noise", .15); layer(880, 878, 1.2, .13, side, "sine", .35); }
    } else if (e.kind === "land") {
      layer(160, 60, .08, .15, side); layer(900, 250, .09, .06, side, "noise");
    } else if (e.kind === "dodge" || e.kind === "flank") {
      layer(2000, 400, .18, .18, side, "noise");
    } else if (e.kind === "shock" || e.kind === "stun") {
      layer(920, 310, .24, .1, side, "sawtooth");
    }
  }
  function stop() { voices.forEach(v => { try { v.stop(); } catch { /* already stopped */ } }); seen.clear(); }
  return {
    unlock, event, stop,
    setMuted(value: boolean) { muted = value; if (context && master) master.gain.setTargetAtTime(muted ? 0 : .56, context.currentTime, .025); if (muted) stop(); },
    captureStream() { return bus?.stream ?? null; },
    dispose() { if (disposed) return; disposed = true; stop(); master?.disconnect(); bus?.disconnect(); filters.forEach(f => f.disconnect()); bus?.stream.getTracks().forEach(t => t.stop()); void context?.close(); context = null; master = null; bus = null; noise = null; },
  };
}
