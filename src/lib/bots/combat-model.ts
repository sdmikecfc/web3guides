import { CARD_INDEX } from "@/app/bots/_engine/catalog";
import { assertLegalBuild as assertLegacy, isLegalStats, isPaintId, partColor, partFamily, type Build as LegacyBuild, type Part, type Slot, type Stats } from "@/app/bots/_engine/parts";

export type LimbSocket = "armL" | "armR" | "legL" | "legR";
export type CombatSocket = "head" | "torso" | LimbSocket | "weapon";
export const LIMB_SOCKETS: readonly LimbSocket[] = ["armL", "armR", "legL", "legR"];
export interface CombatBuild extends LegacyBuild { limbs?: Record<LimbSocket, Part> }
const kind: Record<CombatSocket, Slot> = { head: "head", torso: "torso", armL: "arms", armR: "arms", legL: "legs", legR: "legs", weapon: "weapon" };
export function combatPart(build: CombatBuild, socket: CombatSocket): Part {
  return build.limbs && socket in build.limbs ? build.limbs[socket as LimbSocket] : build[kind[socket]];
}
/** Each limb contributes half a pair's strength, with stable whole-number rounding. */
export function meanStats(a: Stats, b: Stats): Stats {
  const combined = a.map((v, i) => v + b[i]);
  const s = combined.map(v => Math.floor(v / 2)) as Stats;
  // Two legal one-point limbs must still make a legal pair. Resolve a tie by
  // stat order, so swapping the left and right pieces never changes power.
  if (s[0] + s[1] + s[2] === 0 && a.some(v => v > 0) && b.some(v => v > 0)) {
    s[combined.indexOf(Math.max(...combined))] = 1;
  }
  return s;
}
export function meanPart(a: Part, b: Part): Part {
  return { id: a.id, s: meanStats(a.s, b.s), ...(a.paint ? { paint: a.paint } : {}) };
}
/** Shared by save validation, the server read model and the workshop. */
export function equipmentStatsTotal(parts: Record<CombatSocket, Stats>): number {
  const stats = [parts.head, parts.torso, parts.weapon, meanStats(parts.armL, parts.armR), meanStats(parts.legL, parts.legR)];
  return stats.reduce((total, s) => total + s[0] + s[1] + s[2], 0);
}
export function modularBuild(head: Part, torso: Part, armL: Part, armR: Part, legL: Part, legR: Part, weapon: Part): CombatBuild {
  return { legs: meanPart(legL, legR), arms: meanPart(armL, armR), torso, head, weapon, limbs: { armL, armR, legL, legR } };
}
export function modularSet(build: CombatBuild) {
  const parts = (["head", "torso", ...LIMB_SOCKETS] as const).map(s => combatPart(build, s));
  const family = parts.map(p => partFamily(p, CARD_INDEX));
  const colour = parts.map(p => partColor(p, CARD_INDEX));
  const familyMatch = !!family[0] && family.every(f => f === family[0]);
  const colorMatch = !!colour[0] && colour.every(c => c === colour[0]);
  return { familyMatch, colorMatch, perStat: familyMatch && colorMatch ? 3 : familyMatch ? 2 : colorMatch ? 1 : 0 };
}
export function assertModularBuild(build: CombatBuild, label: string) {
  assertLegacy(build, label);
  if (!build.limbs) return;
  for (const s of LIMB_SOCKETS) {
    const p = build.limbs[s];
    if (!p || typeof p.id !== "string" || !p.id || !Array.isArray(p.s) || !isLegalStats(p.s)) throw new Error(`${label}: illegal ${s}`);
    if (p.paint !== undefined && !isPaintId(p.paint)) throw new Error(`${label}: illegal paint in ${s}`);
    const card = CARD_INDEX[p.id];
    if (card && card.slot !== kind[s]) throw new Error(`${label}: wrong part in ${s}`);
  }
  for (const [slot, left, right] of [["arms", "armL", "armR"], ["legs", "legL", "legR"]] as const) {
    const expected = meanPart(build.limbs[left], build.limbs[right]);
    const alias = build[slot];
    if (alias.id !== expected.id || alias.paint !== expected.paint || alias.s.some((v, i) => v !== expected.s[i])) {
      throw new Error(`${label}: ${slot} summary does not match its fitted pieces`);
    }
  }
}
export function combatPaints(build: CombatBuild) {
  const paint = (s: CombatSocket) => combatPart(build, s).paint ?? null;
  return { head: paint("head"), torso: paint("torso"), armL: paint("armL"), armR: paint("armR"), legL: paint("legL"), legR: paint("legR"), weapon: paint("armR") };
}
