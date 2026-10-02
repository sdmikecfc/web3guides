import { CARD_INDEX } from "@/app/bots/_engine/catalog";
import { isPaintId, type Part, type Stats, type Tier } from "@/app/bots/_engine/parts";
import { meanPart, type CombatBuild } from "@/lib/bots/combat-model";
import { cardV5, specialInfoV5 } from "./catalog";
import { SLOTS_V5, type AggregatesV5, type BuildV5, type PartV5, type SocketV5, type StatsV5, type StyleV5 } from "./types";

const sockets: SocketV5[] = [...SLOTS_V5, "weapon"];
function partAt(b: CombatBuild, s: SocketV5): Part | undefined {
  return s === "armL" || s === "armR" ? b.limbs?.[s] ?? b.arms : s === "legL" || s === "legR" ? b.limbs?.[s] ?? b.legs : b[s];
}
const values = (p: Part | undefined): Stats => [0, 1, 2].map(i => Number.isFinite(p?.s?.[i]) ? Math.max(0, p!.s[i]) : 0) as Stats;
const mean = (a: Stats, b: Stats): Stats => a.map((v, i) => (v + b[i]) / 2) as Stats;
/** Draft-friendly aggregation. Empty sockets contribute zero; colour and family never add stats. */
export function statsV5(b: CombatBuild): AggregatesV5 {
  const h = values(partAt(b, "head")), t = values(partAt(b, "torso")), w = values(partAt(b, "weapon"));
  const arms = mean(values(partAt(b, "armL")), values(partAt(b, "armR"))), legs = mean(values(partAt(b, "legL")), values(partAt(b, "legR")));
  return { speed: legs[0], str: legs[1] + arms[1] + t[1], dodge: legs[2] + h[1], dmg: arms[0] + w[0], block: arms[2], health: t[0], luck: t[2] + h[2], acc: h[0] + w[2], atkSpd: w[1] };
}
export function combatStatsV5(b: CombatBuild): StatsV5 {
  const a = statsV5(b);
  const armour = SLOTS_V5.map(s => { const p = values(partAt(b, s)), material = p.reduce((n, v) => n + v, 0) * 1.25; return s === "torso" ? Math.round(145 + a.health * 8 + a.str * .6) : s === "head" ? Math.round(48 + material + a.str) : Math.round(50 + material + p[1] * 2 + a.str * .7); });
  return { ...a, armour, movement: 28 + a.speed * 1.35, turnRate: 70 + Math.min(45, a.speed * 3), accuracy: Math.min(98, 83 + a.acc * .7), evasion: Math.min(45, 3 + a.dodge * 1.35 + a.speed * .6), force: a.dmg + a.str * .65, shield: 8 + a.block * 2, radius: 530 };
}
const copyPart = (p: Part): Part => ({ id: p.id, s: [...p.s] as Stats, ...(p.paint ? { paint: p.paint } : {}) });
export function canonicalAppearanceV5(raw: CombatBuild): CombatBuild {
  if (!raw || !raw.head || !raw.torso || !raw.arms || !raw.legs || !raw.weapon) throw new Error("Complete the seven part choices first.");
  return { legs: raw.limbs ? meanPart(copyPart(raw.limbs.legL), copyPart(raw.limbs.legR)) : copyPart(raw.legs), arms: raw.limbs ? meanPart(copyPart(raw.limbs.armL), copyPart(raw.limbs.armR)) : copyPart(raw.arms), torso: copyPart(raw.torso), head: copyPart(raw.head), weapon: copyPart(raw.weapon), ...(raw.limbs ? { limbs: { armL: copyPart(raw.limbs.armL), armR: copyPart(raw.limbs.armR), legL: copyPart(raw.limbs.legL), legR: copyPart(raw.limbs.legR) } } : {}) };
}
/** A styled torso is an explicit opt-in. Old finished robots are never reclassified. */
export function snapshotBuildV5(raw: CombatBuild): BuildV5 {
  const appearanceBuild = canonicalAppearanceV5(raw), body = cardV5(appearanceBuild.torso.id);
  if (!body || body.slot !== "torso") throw new Error("This robot uses the earlier fight rules.");
  const parts = Object.fromEntries(sockets.map(slot => {
    const p = partAt(appearanceBuild, slot)!;
    if (!p || typeof p.id !== "string" || !Array.isArray(p.s) || p.s.length !== 3 || p.s.some(n => !Number.isInteger(n) || n < 0 || n > 12) || p.s.reduce((a, b) => a + b, 0) < 1 || p.s.reduce((a, b) => a + b, 0) > 20) throw new Error(`Invalid ${slot} part.`);
    const card = cardV5(p.id), expected = slot.startsWith("arm") ? "arms" : slot.startsWith("leg") ? "legs" : slot;
    if (card && (card.slot !== expected || card.s.some((n, i) => n !== p.s[i]))) throw new Error(`The ${slot} stats do not match its saved item.`);
    if (p.paint !== undefined && !isPaintId(p.paint)) throw new Error(`Invalid ${slot} paint.`);
    const old = CARD_INDEX[p.id.replace(/^beginner\.v1\./, "")];
    if (!card && !old) throw new Error(`Unknown ${slot} item.`);
    if (old && old.slot !== expected) throw new Error(`The item does not fit ${slot}.`);
    const oldBeginner = p.id.startsWith("beginner.v1."), expectedOld = oldBeginner ? [1, 1, 1] : old?.s;
    if (!card && expectedOld?.some((n, i) => n !== p.s[i])) throw new Error(`The ${slot} stats do not match its saved item.`);
    const item: PartV5 = { ...copyPart(p), slot, tier: card?.tier ?? (oldBeginner ? 1 : old?.tier) ?? 1, style: card?.style ?? null, artKey: card?.artKey ?? p.id.replace(/^beginner\.v1\./, ""), ...(slot === "weapon" ? { weaponKind: card?.weaponKind ?? "hammer" as const } : {}) };
    return [slot, item];
  })) as Record<SocketV5, PartV5>;
  const weapon = parts.weapon.weaponKind!;
  return { version: 5, balanceVersion: "mk5-1", appearanceBuild, style: body.style, tier: body.tier, parts, capabilities: { special: specialInfoV5(body.style, body.tier), tier3: body.tier >= 3, weapon, pairedMelee: weapon === "paired_blades" }, stats: combatStatsV5(appearanceBuild) };
}
export function validBuildV5(value: unknown): value is BuildV5 {
  function sorted(v: unknown): unknown { return Array.isArray(v) ? v.map(sorted) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])])) : v; }
  try { const b = value as BuildV5; return b?.version === 5 && b.balanceVersion === "mk5-1" && JSON.stringify(sorted(snapshotBuildV5(b.appearanceBuild))) === JSON.stringify(sorted(b)); } catch { return false; }
}
export function presetV5(style: StyleV5, tier: Tier = 1, starter = false): BuildV5 {
  const get = (slot: string) => { const c = cardV5(starter ? `mk5.starter.${style}.${slot}` : `mk5.t${tier}.${style}.${slot}`); if (!c) throw new Error("Unknown style or tier."); return { id: c.id, s: [...c.s] as Stats }; };
  const arms = get("arms"), legs = get("legs");
  return snapshotBuildV5({ head: get("head"), torso: get("torso"), arms, legs, weapon: get("weapon"), limbs: { armL: copyPart(arms), armR: copyPart(arms), legL: copyPart(legs), legR: copyPart(legs) } });
}
