import { RIFLE, statsFor, WEAPON, type BuildV4, type Module, type Slot } from "./engine";
export const SLOT_LABEL: Record<Slot | "weapon", string> = { head: "Head", torso: "Body", armL: "Left arm", armR: "Right arm", legL: "Left leg", legR: "Right leg", weapon: "Weapon" };
export const FAMILY_LABEL = { brute: "Heavy hitter", hotshot: "Fast fighter", deadeye: "Sharpshooter" };
export const FAMILY_SHORT = { brute: "Heavy", hotshot: "Fast", deadeye: "Precision" };
export const FAMILY_DESCRIPTION = {
  brute: "Hammer + shield. Heavy hits and strong armour, but slow to move and recover.",
  hotshot: "Shock baton + spring legs. Quick attacks and dodges, but less armour.",
  deadeye: "Rifle + steady aim. Strong at a distance, but needs space and time to line up a shot.",
};
export type StatRow = { key: string; label: string; value: number; unit?: string; lower?: boolean };
export function overallRows(b: BuildV4): StatRow[] {
  const s = statsFor(b);
  return [
    { key: "armour", label: "Total armour", value: s.armour.reduce((n, x) => n + x, 0) },
    { key: "body", label: "Body armour", value: s.armour[1] },
    { key: "damage", label: "Hit power", value: WEAPON[b.weapon].damage + s.force },
    { key: "speed", label: "Movement", value: Math.round(s.speed * .06 * 100) / 100, unit: "m/s" },
    { key: "aim", label: "Accuracy", value: s.accuracy },
    { key: "dodge", label: "Evasion", value: s.dodge },
    { key: "guard", label: "Shield guard", value: s.shield },
    { key: "reach", label: "Reach", value: WEAPON[b.weapon].range / 1000, unit: "m" },
  ];
}
export function partRows(b: BuildV4, slot: Slot | "weapon"): StatRow[] {
  if (slot === "weapon") { const w = WEAPON[b.weapon]; return [
    { key: "power", label: "Weapon power", value: w.damage },
    { key: "reach", label: "Reach", value: w.range / 1000, unit: "m" },
    ...(b.weapon === "rifle" ? [{ key: "minimum", label: "Minimum distance", value: RIFLE.minimumRange / 1000, unit: "m", lower: true }] : []),
    { key: "windup", label: "Wind-up", value: +(w.windup / 60).toFixed(2), unit: "s", lower: true },
    { key: "recovery", label: "Recovery", value: +(w.recovery / 60).toFixed(2), unit: "s", lower: true },
  ]; }
  const p = b.parts[slot], stats = statsFor(b), rows: StatRow[] = [{ key: "armour", label: "Part armour", value: stats.armour[["head", "torso", "armL", "armR", "legL", "legR"].indexOf(slot)] }];
  if (slot === "head") rows.push({ key: "accuracy", label: "Accuracy", value: stats.accuracy });
  if (slot.startsWith("leg")) rows.push({ key: "mobility", label: "Mobility", value: ({ brute: 15, hotshot: 32, deadeye: 26 })[p.family] + p.design * 2 }, { key: "evasion", label: "Evasion", value: ({ brute: 2, hotshot: 10, deadeye: 4 })[p.family] });
  if (slot.startsWith("arm") || slot === "torso") rows.push({ key: "force", label: "Impact bonus", value: ({ brute: 4, hotshot: 1, deadeye: 2 })[p.family] });
  if (slot === "armL") rows.push({ key: "guard", label: "Shield guard", value: stats.shield });
  return rows;
}
export function partName(slot: Slot | "weapon", b: BuildV4): string {
  if (slot === "weapon") return { hammer: "Forge hammer", baton: "Arc baton", rifle: "Longshot rifle" }[b.weapon];
  const p = b.parts[slot];
  if (slot === "armL" && p.family === "brute" && p.design === 1) return "Shield arm";
  return `${FAMILY_SHORT[p.family]} ${SLOT_LABEL[slot].toLowerCase()} ${p.design + 1}`;
}
export function partDescription(slot: Slot | "weapon", b: BuildV4): string {
  if (slot === "weapon") return { hammer: "A committed wind-up. A clean hit knocks the opponent down.", baton: "Quick combinations. Every third clean hit briefly stuns.", rifle: "Aimed projectiles. Strong at range; needs room to fire." }[b.weapon];
  if (slot === "armL" && statsFor(b).shield) return "Protects the front while this arm is free. Blocking spends guard, which starts recharging after three seconds without a block.";
  if (slot.startsWith("leg")) return b.parts[slot].family === "hotshot" ? b.parts[slot].design ? "Quick skate wheels. Slides out of incoming attacks when both legs can support it." : "Spring-loaded legs. Light enough for a fast roll and recovery." : b.parts[slot].family === "brute" ? "Broad feet and a heavy, planted step. Built to take punishment." : "Steady movement and precise footing. Holds a clear firing stance.";
  return { brute: "Thick hand-pressed clay over reinforced machinery.", hotshot: "A light shell with a little attitude. Trades armour for agility.", deadeye: "Deliberate, precise machinery beneath a sculpted clay shell." }[b.parts[slot].family];
}
