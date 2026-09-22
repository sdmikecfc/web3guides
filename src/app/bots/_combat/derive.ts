import { aggregates as legacyAggregates, deriveFighter as legacyDerive, startingArmor as legacyArmor, FORMULA, type Aggregates, type Fighter as LegacyFighter } from "../_engine/derive";
import { NO_ORDERS, type Orders } from "../_engine/parts";
import { combatPart, modularSet, type CombatBuild } from "@/lib/bots/combat-model";
export { SHIELD_PERCENT, blockChance, hitChance } from "../_engine/derive";

export interface Fighter extends LegacyFighter { pieceArmor: number[] }
export function aggregates(b: CombatBuild, orders: Orders = NO_ORDERS): Aggregates {
  if (!b.limbs) return legacyAggregates(b, orders);
  const k = modularSet(b).perStat;
  const st = [
    { block: 0, dodge: 0, dmg: 0, atkSpd: 0 },
    { block: 2, dodge: 2, dmg: -3, atkSpd: 0 },
    { block: -2, dodge: -3, dmg: 2, atkSpd: 2 },
  ][orders.stance] ?? { block: 0, dodge: 0, dmg: 0, atkSpd: 0 };
  // Add the six-piece set and stance before clamping. A delta applied to
  // already-clamped legacy numbers could invent damage on a guarded bot.
  return {
    speed: b.legs.s[0] + k,
    str: b.legs.s[1] + b.arms.s[1] + b.torso.s[1] + k,
    dodge: Math.max(0, b.legs.s[2] + b.head.s[1] + st.dodge + k),
    dmg: Math.max(0, b.arms.s[0] + b.weapon.s[0] + st.dmg + k),
    block: Math.max(0, b.arms.s[2] + st.block + k),
    health: b.torso.s[0] + k,
    luck: b.torso.s[2] + b.head.s[2] + k,
    acc: b.head.s[0] + b.weapon.s[2] + k,
    atkSpd: Math.max(0, b.weapon.s[1] + st.atkSpd + k),
  };
}
export function deriveFighter(b: CombatBuild, o: Orders = NO_ORDERS): Fighter {
  const old = legacyDerive(b, o), a = aggregates(b, o);
  const bonus = b.limbs ? modularSet(b).perStat : old.setPerStat;
  const f = { ...old, ...a, setPerStat: bonus,
    bodyArmor: FORMULA.BODY_BASE + FORMULA.BODY_PER_HEALTH * a.health + FORMULA.BODY_PER_STR * a.str,
    limbArmor: FORMULA.LIMB_BASE + FORMULA.LIMB_PER_STR * a.str,
    damagePerHit: FORMULA.DMG_BASE + a.dmg + Math.floor(a.str / FORMULA.STR_PER_DMG),
    interval: Math.max(FORMULA.INTERVAL_MIN, Math.min(FORMULA.INTERVAL_MAX, FORMULA.INTERVAL_BASE - 2 * a.atkSpd - a.speed)),
    critChance: FORMULA.CRIT_BASE + FORMULA.CRIT_PER_LUCK * a.luck, bounceChance: a.luck,
  };
  const armor = legacyArmor(f);
  // Matching limbs keep the old armour. Mixed limbs put the sturdiness where
  // the player fitted it, so losing the left or right piece matters.
  (["armL","armR","legL","legR"] as const).forEach((s, i) => {
    const part = combatPart(b,s), average = s.startsWith("arm") ? b.arms : b.legs;
    armor[i+2] = Math.max(1, f.limbArmor + 2 * (part.s[1] - average.s[1]));
  });
  return { ...f, pieceArmor: armor };
}
export const startingArmor = (f: Fighter) => f.pieceArmor.slice();
