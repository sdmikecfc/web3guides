import type { EventV4 } from "./engine";
export function labAudio() {
  let context: AudioContext | null = null, enabled = false;
  const voices = new Set<OscillatorNode>();
  function tone(hz: number, end: number, duration: number, volume: number, type: OscillatorType = "sine") {
    if (!enabled || !context) return;
    const t = context.currentTime, oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(hz, t); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + .007); gain.gain.exponentialRampToValueAtTime(.001, t + duration);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(t + duration + .02); voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  }
  return {
    enable(value: boolean) { enabled = value; if (value) { context ??= new AudioContext(); void context.resume(); } else voices.forEach(v => { try { v.stop(); } catch {} }); },
    event(e: EventV4) {
      if (e.kind === "windup" && e.weapon === "hammer") tone(70, 230, .75, .022, "sawtooth");
      if (e.kind === "windup" && e.weapon === "rifle") tone(300, 1000, .55, .012, "triangle");
      if (e.kind === "shot") tone(1000, 95, .14, .055, "sawtooth");
      if (e.kind === "hit") { tone(e.weapon === "hammer" ? 90 : 165, 35, .22, .11); tone(370, 90, .12, .025, "triangle"); }
      if (e.kind === "block") { tone(970, 740, .25, .038, "triangle"); tone(1530, 1470, .18, .014); }
      if (e.kind === "stun") tone(740, 180, .30, .035, "square");
      if (e.kind === "break" || e.kind === "knockdown") tone(80, 25, .4, .075);
      if (e.kind === "start" || e.kind === "ko") tone(660, 655, .85, .035, "triangle");
    },
    stop() { voices.forEach(v => { try { v.stop(); } catch {} }); },
    dispose() { voices.forEach(v => { try { v.stop(); } catch {} }); voices.clear(); void context?.close(); },
  };
}
