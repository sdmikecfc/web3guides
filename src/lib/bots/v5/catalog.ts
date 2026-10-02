import type { Slot, Stats, Tier } from "@/app/bots/_engine/parts";
import type { CardV5, SpecialInfoV5, StyleV5 } from "./types";
export const STYLES_V5: readonly StyleV5[] = ["tank", "speed", "ranged"];
const slots: Slot[] = ["head", "torso", "arms", "legs", "weapon"];
const titles: Record<StyleV5, string> = { tank: "Heavy", speed: "Fast", ranged: "Sharpshooter" };
const labels: Record<Slot, string> = { head: "Head", torso: "Body", arms: "Arm", legs: "Leg", weapon: "Weapon" };
const starterNames: Record<StyleV5, Record<Slot, string>> = {
  tank: { head: "Guard head", torso: "Armoured body", arms: "Strong arm", legs: "Steady leg", weapon: "Heavy hammer" },
  speed: { head: "Dodging head", torso: "Light body", arms: "Striking arm", legs: "Quick leg", weapon: "Quick blade" },
  ranged: { head: "Aiming head", torso: "Steady body", arms: "Guarding arm", legs: "Escape leg", weapon: "Toy rifle" },
};
const art = {
  tank: { head: ["peeperEye", "lanternLens", "pistonVisor", "anvilMask"], torso: ["peeperBox", "lanternDrum", "pistonShell", "anvilCore"], arms: ["peeperHooks", "lanternClamps", "pistonLevers", "anvilGrips"], legs: ["peeperStilts", "lanternStruts", "pistonTreads", "anvilSprings"], weapon: ["tinMallet", "pistonHammer", "pistonHammer", "pistonHammer"] },
  speed: { head: ["sprocketCap", "kettleDome", "hornetScope", "bulldozerHelm"], torso: ["sprocketCan", "kettleChest", "hornetFrame", "bulldozerHull"], arms: ["sprocketMitts", "kettleGrips", "hornetFists", "bulldozerFists"], legs: ["sprocketPegs", "kettleShins", "hornetBoots", "bulldozerHooves"], weapon: ["tinMallet", "sparkDrill", "brassPike", "anvilCleaver"] },
  ranged: { head: ["peeperEye", "kettleDome", "hornetScope", "anvilMask"], torso: ["sprocketCan", "lanternDrum", "hornetFrame", "anvilCore"], arms: ["peeperHooks", "kettleGrips", "pistonLevers", "bulldozerFists"], legs: ["sprocketPegs", "lanternStruts", "hornetBoots", "anvilSprings"], weapon: ["tinMallet", "sparkDrill", "brassPike", "anvilCleaver"] },
} as const;
const profiles: Record<StyleV5, Record<Slot, Stats>> = {
  tank: { head: [0, 2, 1], torso: [2, 1, 0], arms: [0, 2, 1], legs: [0, 2, 1], weapon: [2, 0, 1] },
  speed: { head: [1, 2, 0], torso: [1, 0, 2], arms: [2, 0, 1], legs: [2, 0, 1], weapon: [1, 2, 0] },
  ranged: { head: [2, 0, 1], torso: [1, 2, 0], arms: [1, 0, 2], legs: [1, 0, 2], weapon: [1, 0, 2] },
};
export function specialInfoV5(style: StyleV5, tier: number): SpecialInfoV5 {
  const third = tier >= 3;
  return { id: `${style}.${third ? "advanced" : "basic"}`, name: style === "tank" ? "Energy Shield" : style === "speed" ? "Overdrive" : "Slow Field", unlockTier: third ? 3 : 1, durationSeconds: 5,
    description: style === "tank" ? "Block 90% of damage for 5 seconds, up to 35% of your starting body armour." + (third ? " End with a charge if the shield survives." : "") : style === "speed" ? "Move 50% faster, attack 20% faster, deal 25% more damage and gain 15% evasion for 5 seconds." + (third ? " End with a blade flank. A clean rear hit can finish a limb below 25% armour." : "") : "Slow your rival's movement, turning and attacks by 30% for 5 seconds." + (third ? " End with a short burst from both arms. Its total damage is capped at two rifle hits." : "") };
}
function tuple(base: Stats, tier: Tier): Stats {
  const budget = [0, 3, 7, 12, 18][tier], out = base.map(v => Math.floor(v * budget / 3)) as Stats;
  let left = budget - out.reduce((n, v) => n + v, 0);
  const order = [0, 1, 2].sort((a, b) => base[b] - base[a] || a - b);
  for (let i = 0; left > 0; i++, left--) out[order[i % 3]]++;
  return out;
}
function make(style: StyleV5, slot: Slot, tier: Tier, starter = false): CardV5 {
  return { id: starter ? `mk5.starter.${style}.${slot}` : `mk5.t${tier}.${style}.${slot}`, slot, s: tuple(profiles[style][slot], tier), tier, price: (slot === "arms" || slot === "legs" ? .5 : 1) * [0, 50, 200, 600, 1600][tier], style, artKey: `${slot}.${art[style][slot][tier - 1]}`, starter,
    name: tier === 1 ? starterNames[style][slot] : `${titles[style]} ${tier} ${slot === "weapon" ? style === "tank" ? "Hammer" : style === "speed" ? "Blade" : "Rifle" : labels[slot]}`,
    lore: slot === "torso" ? "The body gives your robot its special move." : style === "tank" ? "Built to take hard hits." : style === "speed" ? "Built for quick movement." : "Built for steady aim.",
    ...(slot === "weapon" ? { weaponKind: style === "tank" ? "hammer" as const : style === "speed" ? "blade" as const : "rifle" as const } : {}), ...(slot === "torso" ? { special: specialInfoV5(style, tier) } : {}) };
}
export const STARTER_CARDS_V5: readonly CardV5[] = STYLES_V5.flatMap(s => slots.map(slot => make(s, slot, 1, true)));
export const V5_CATALOG: readonly CardV5[] = ([1, 2, 3, 4] as Tier[]).flatMap(t => [...STYLES_V5.flatMap(s => slots.map(slot => make(s, slot, t))), ...(t >= 2 ? [{ ...make("speed", "weapon", t), id: `mk5.t${t}.speed.paired-blades`, name: `Twin ${t} Blades`, weaponKind: "paired_blades" as const, lore: "One blade in each hand. Each arm can keep fighting on its own." }] : [])]);
const index: Readonly<Record<string, CardV5>> = Object.fromEntries([...STARTER_CARDS_V5, ...V5_CATALOG].map(c => [c.id, Object.freeze({ ...c, s: Object.freeze(c.s) as unknown as Stats, ...(c.special ? { special: Object.freeze(c.special) } : {}) })]));
export function cardV5(id: string | undefined): CardV5 | undefined { return id ? index[id.startsWith("beginner.v2.") ? id.slice(12) : id] : undefined; }
export const STYLE_PARTS = V5_CATALOG;
export const styleCard = cardV5;
