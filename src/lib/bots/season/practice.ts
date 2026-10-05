import { cardV6, FAMILIES_V6, presetV6, snapshotBuildV6 } from "@/lib/bots/v6";
import type { BuildV6, FamilyV6, StyleV6, TierV6, WeaponKindV6 } from "@/lib/bots/v6/types";
import type { CombatBuild } from "@/lib/bots/combat-model";
import "@/lib/bots/v6/hero-collision";

export interface SeasonPracticeQuery { session?: string; style?: string; rival?: string; seed?: string; tier?: string; weapon?: string; family?: string; part?: string; robot?: string; name?: string; collision?: string }
const styleOf = (raw: string | undefined): StyleV6 => { if (raw === undefined) return "tank"; if (raw === "tank" || raw === "speed" || raw === "ranged") return raw; throw new Error("Choose Tank, Speed or Ranged."); };
const tierOf = (raw: string | undefined): TierV6 => { if (raw === undefined) return 1; if (/^[1-4]$/.test(raw)) return Number(raw) as TierV6; throw new Error("Choose a tier from 1 to 4."); };
const titleOf = (build: BuildV6, name?: string) => name?.trim().slice(0, 32) || FAMILIES_V6.find(f => f.id === build.parts.torso.family)!.name;

/** Local practice reads the exact linked parts. Invalid links never silently substitute another robot. */
export function seasonPracticeBuild(query: SeasonPracticeQuery): { build: BuildV6; name: string; linked: boolean } {
  if (query.robot !== undefined) {
    if (query.robot.length > 16000) throw new Error("This robot link is too long. Open it from your garage again.");
    let raw: CombatBuild;
    try { raw = JSON.parse(query.robot) as CombatBuild; } catch { throw new Error("This robot link is incomplete. Open it from your garage again."); }
    const build = snapshotBuildV6(raw, query.collision ? { collisionVersion: query.collision } : {});
    return { build, name: titleOf(build, query.name), linked: true };
  }
  if (query.part !== undefined) {
    const card = cardV6(query.part); if (!card) throw new Error("This part is not in the catalogue. Choose it from the shop again.");
    const build = presetV6(card.style, card.tier, { ...(card.family ? { family: card.family } : {}), ...(card.slot === "weapon" ? card.signature ? { signature: true } : { weapon: card.weaponKind } : {}) });
    return { build, name: titleOf(build, query.name), linked: true };
  }
  const family = query.family === undefined ? undefined : FAMILIES_V6.find(f => f.id === query.family);
  if (query.family !== undefined && !family) throw new Error("Choose one of the six robot families.");
  const style = family?.style ?? styleOf(query.style), tier = tierOf(query.tier);
  const weaponCard = query.weapon === undefined ? undefined : cardV6(query.weapon) ?? cardV6(`mk6.t${tier}.weapon.${query.weapon}`) ?? cardV6(`mk6.t${tier}.signature.${query.weapon}`);
  if (query.weapon !== undefined && (!weaponCard || weaponCard.slot !== "weapon")) throw new Error("This weapon is not available at that tier.");
  if (weaponCard && weaponCard.tier !== tier) throw new Error("Choose a weapon from this tier, or open your mixed robot from the garage.");
  const build = presetV6(style, tier, { family: family?.id as FamilyV6 | undefined, ...(weaponCard ? weaponCard.signature ? { signature: true } : { weapon: weaponCard.weaponKind as WeaponKindV6 } : {}) });
  if (weaponCard && build.parts.weapon.id !== weaponCard.id) throw new Error("This signature weapon needs a matching Tier 3 or Tier 4 body.");
  return { build, name: titleOf(build, query.name), linked: false };
}
