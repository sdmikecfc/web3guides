/** Screen adapters for the separately versioned combat catalogue. */
import { V5_CATALOG, STARTER_CARDS_V5, cardV5 } from "./v5";
import type { PartCard } from "./fixtures";
import { STYLE_GUIDE } from "./style-guide";
import type { PaintId } from "@/app/bots/_engine/parts";

type CanonicalStyleCard = NonNullable<ReturnType<typeof cardV5>>;
export type StylePartCard = PartCard & CanonicalStyleCard;
function adapt(card: CanonicalStyleCard): StylePartCard {
  const color: PaintId = card.style === "tank" ? "butter" : card.style === "speed" ? "coral" : "sky";
  return { ...card, s: [...card.s], familyName: card.slot === "weapon" ? null : STYLE_GUIDE[card.style].label, design: 1, ...(card.slot === "weapon" ? {} : { color }) };
}
export const STYLE_CATALOG: readonly StylePartCard[] = V5_CATALOG.map(adapt);
export const STYLE_STARTER_CARDS: readonly StylePartCard[] = STARTER_CARDS_V5.map(adapt);
export function styleCardOf(id: string | undefined | null): StylePartCard | undefined {
  const card = id ? cardV5(id) : undefined;
  return card ? adapt(card) : undefined;
}
export function styleSpecialInfo(id: string | undefined | null) {
  const card = styleCardOf(id);
  if (!card || card.slot !== "torso") return null;
  return { current: card.special, upgraded: styleCardOf(`mk5.t3.${card.style}.torso`)?.special, unlocked: card.tier >= 3 };
}
