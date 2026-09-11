import { BEGINNER_ORDER, beginnerOffer } from "./beginner-catalog";
import { EQUIPMENT_KIND, fitPart } from "./equipment";
import { FIRST_WORDS, SECOND_WORDS, starterBuild, type Build, type OwnedPart, type Socket } from "./fixtures";
import type { OnboardingView } from "./onboarding-types";

export type DraftOffers = Record<Socket, string | null>;
export const emptyDraftOffers = (): DraftOffers => Object.fromEntries(BEGINNER_ORDER.map(s => [s, null])) as DraftOffers;
export function parseDraftName(raw: unknown): Build["name"] | null {
  if (!raw || typeof raw !== "object") return null;
  const name = raw as Build["name"];
  if (!FIRST_WORDS.includes(name.first) || !SECOND_WORDS.includes(name.second) || name.num != null && (!Number.isInteger(name.num) || name.num < 1 || name.num > 99)) return null;
  return { first: name.first, second: name.second, num: name.num ?? null };
}
export function parseDraftOffers(raw: unknown, catalogueVersion?: 1 | 2): DraftOffers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>, offers = emptyDraftOffers();
  if (Object.keys(value).some(s => !BEGINNER_ORDER.includes(s as Socket))) return null;
  for (const socket of BEGINNER_ORDER) {
    if (value[socket] == null) continue;
    const offer = beginnerOffer(value[socket], catalogueVersion);
    if (!offer || offer.part.slot !== EQUIPMENT_KIND[socket]) return null;
    offers[socket] = offer.id;
  }
  return offers;
}
/** Virtual instances cannot be sent to bot/save or used as owned inventory. */
export function draftPreview(view: OnboardingView): { build: Build; parts: OwnedPart[] } {
  let build = { ...starterBuild(view.draftBay), ...(view.draftName ? { name: view.draftName } : {}) };
  const parts: OwnedPart[] = [];
  for (const socket of BEGINNER_ORDER) {
    const offer = beginnerOffer(view.draftOffers?.[socket], view.catalogueVersion ?? 1);
    if (!offer || offer.part.slot !== EQUIPMENT_KIND[socket]) continue;
    const part: OwnedPart = { ...offer.part, s: [...offer.part.s], uid: `draft-v2-${socket}`, salvage: 0, provenance: "Starter build preview", ...(offer.color ? { paint: offer.color } : {}) };
    parts.push(part); build = fitPart(build, part, socket);
  }
  return { build, parts };
}
