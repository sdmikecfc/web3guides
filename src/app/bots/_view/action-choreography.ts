/** Action-preview choreography. Samples the recorded fight; never writes to it. */
import { activeAttack, clamp01, ease, type DirectedAttack, type FightDirection, type RingPosition } from "./fight-director";
import type { Side } from "../_engine/parts";

export function actionClipTime(a: DirectedAttack, frame: number): number {
  if (frame > a.frame) return .5 + .5 * ease((frame - a.frame) / Math.max(1, a.end - a.frame));
  const u = clamp01((frame - a.begin) / Math.max(1, a.frame - a.begin));
  // Hold a readable wind-up, then fire through the last third into contact.
  return u < .64 ? .20 * ease(u / .64) : .20 + .30 * ease((u - .64) / .36);
}

export function actionRingPosition(d: FightDirection, side: Side, frame: number, seed: number): RingPosition {
  const t = frame / 60, sign = side === 0 ? -1 : 1, phase = (seed % 97) * .035;
  let pressure = 0;
  for (const a of d.attacks) {
    const before = a.frame - frame;
    const envelope = before >= 0 ? ease(1 - before / 27) : 1 - ease(-before / 30);
    pressure = Math.max(pressure, envelope);
  }
  const angle = Math.sin(t * .72 + phase) * .43;
  const radius = 2.12 - 1.00 * pressure;
  const driftX = Math.sin(t * .39 + phase) * .32, driftZ = Math.sin(t * .49 + phase) * .38;
  return { x: driftX + sign * radius * Math.cos(angle), z: driftZ + sign * radius * Math.sin(angle),
    yaw: (side === 0 ? 1 : -1) * (Math.PI / 2 - .24) - angle, advance: pressure, stride: t * 2.5 + side * .5 };
}

export function actionPose(d: FightDirection, side: Side, frame: number) {
  const out = { lift: 0, lean: 0, twist: 0, slide: 0, dodge: 0 };
  const legs = d.breakFrames[side]?.slice(4, 6).every(f => f >= frame) ?? true;
  const own = activeAttack(d, side, frame);
  if (own) {
    const u = clamp01((frame - own.begin) / Math.max(1, own.frame - own.begin));
    const preparation = frame < own.frame ? Math.sin(Math.PI * u) : 0;
    const finish = frame >= own.frame ? Math.sin(Math.PI * clamp01((frame - own.frame) / Math.max(1, own.end - own.frame))) : 0;
    const heavy = own.move === "overhead" || own.move === "backhand";
    if (legs && (heavy || own.move === "kick")) out.lift = Math.pow(preparation, 1.25) * (heavy ? .70 : .36);
    out.lean = preparation * -.20 + finish * .24;
    out.twist = (own.move.includes("cut") || own.move === "backhand" ? .48 : .17) * (preparation - finish);
  }
  for (const a of d.attacks) {
    if (a.defender !== side) continue;
    const age = frame - a.frame;
    if (a.outcome === "hit" && age > 0 && age < 32) {
      // Fast displacement, then a planted recovery. Zero offset at contact.
      const k = age < 8 ? ease(age / 8) : 1 - ease((age - 8) / 24);
      out.slide = Math.max(out.slide, k * (a.strong ? .82 : .43));
      out.lean = Math.max(out.lean, k * (a.strong ? .36 : .20));
    }
    if (legs && a.outcome === "miss" && age > -14 && age < 18) {
      const k = Math.sin(Math.PI * (age + 14) / 32);
      out.dodge = Math.max(out.dodge, k * .68);
      out.lift = Math.max(out.lift, Math.sin(Math.PI * clamp01((age + 14) / 14)) * .20);
    }
  }
  // A simultaneous counter remains planted: the contact solver keeps its
  // actual working face on the opponent, even in a busy combination.
  if (d.attacks.some(a => a.frame === frame && (a.attacker === side || a.defender === side))) out.lift = 0;
  return out;
}
