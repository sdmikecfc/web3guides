/** Plain-language guidance. Styles suggest a build; they never lock its slots. */
import { fightRoomHref } from "./fight-navigation";
export type FightingStyle = "tank" | "speed" | "ranged";
export const FIGHTING_STYLES: readonly FightingStyle[] = ["tank", "speed", "ranged"];
export const STYLE_GUIDE: Readonly<Record<FightingStyle, { label: string; strength: string; weakness: string; parts: string }>> = {
  tank: { label: "Tank", strength: "Takes more hits.", weakness: "Moves slowly.", parts: "Heavy body, strong arms and steady legs." },
  speed: { label: "Speed", strength: "Moves and attacks quickly.", weakness: "Has lighter armour.", parts: "Light body, quick legs and paired weapons." },
  ranged: { label: "Ranged", strength: "Shoots from a distance.", weakness: "Needs room to aim.", parts: "Accurate head, rifle and legs that can move back." },
};
export const STYLE_STARTER_ORDER = ["torso", "head", "armL", "armR", "legL", "legR", "weapon"] as const;
export const stylesPreviewEnabled = () => process.env.NEXT_PUBLIC_BOTS_STYLES_V1 === "1";
export function stylePreviewHref(style: FightingStyle, tier: number = 1) {
  return fightRoomHref(5, { style, tier: String(Math.min(4, Math.max(1, Math.trunc(tier)))) });
}
