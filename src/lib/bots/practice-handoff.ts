/** Only catalogue choices and ordinary cosmetics cross the practice/account boundary. */
import { BEGINNER_OFFERS, BEGINNER_ORDER, WELCOME_PAINTS, beginnerOffer } from "./beginner-catalog";
import { EQUIPMENT_KIND, socketsOf } from "./equipment";
import { FIRST_WORDS, SECOND_WORDS, type Build, type Socket } from "./fixtures";
import type { BotLookRaw } from "./look";
import type { GameDemo } from "./game-demo";
import { isPaintId, type PaintId } from "@/app/bots/_engine/parts";
import { parseDraftOffers, parseDraftName, type DraftOffers } from "./onboarding-draft";

export interface PracticeAppearance { offers: Record<Socket, string>; paints?: Partial<Record<Socket, PaintId>>; name: Build["name"]; look?: BotLookRaw }
export interface PracticeDraft { version: 2; catalogueVersion?: 1 | 2; offers: DraftOffers; paints?: Partial<Record<Socket, PaintId>>; name: Build["name"]; look?: BotLookRaw; complete: boolean }
export function parsePracticeDraft(raw: unknown): PracticeDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<PracticeDraft>;
  if (value.catalogueVersion !== undefined && value.catalogueVersion !== 1 && value.catalogueVersion !== 2) return null;
  const catalogueVersion = value.catalogueVersion ?? 1;
  const offers = parseDraftOffers(value.offers, catalogueVersion), name = parseDraftName(value.name);
  if (value.version !== 2 || !offers || !name || typeof value.complete !== "boolean") return null;
  if (value.complete && BEGINNER_ORDER.some(s => !offers[s])) return null;
  const full = BEGINNER_ORDER.every(s => offers[s]) ? parsePracticeAppearance(value) : null;
  if (BEGINNER_ORDER.every(s => offers[s]) && !full) return null;
  const paints: Partial<Record<Socket, PaintId>> = full?.paints ?? {};
  if (!full) for (const socket of BEGINNER_ORDER) {
    const paint = value.paints?.[socket];
    if (paint == null) continue;
    if (!isPaintId(paint) || socket === "weapon" || paint !== beginnerOffer(offers[socket])?.color) return null;
    paints[socket] = paint;
  }
  return { version: 2, ...(value.catalogueVersion !== undefined ? { catalogueVersion } : {}), offers, name, paints, complete: value.complete, ...(value.look && typeof value.look === "object" ? { look: value.look } : {}) };
}
/** Partial choices cross as catalogue IDs; no local currency, items or results. */
export function practiceDraftOf(state: GameDemo, build: Build | undefined): PracticeDraft | null {
  if (!build) return null;
  const offers = Object.fromEntries(BEGINNER_ORDER.map(s => [s, state.parts.find(p => p.uid === socketsOf(build)[s])?.id ?? null]));
  const paints = Object.fromEntries(BEGINNER_ORDER.map(s => [s, state.parts.find(p => p.uid === socketsOf(build)[s])?.paint]));
  const hasAll = BEGINNER_ORDER.every(s => !!offers[s]);
  return parsePracticeDraft({ version: 2, ...(state.onboarding.catalogueVersion ? { catalogueVersion: state.onboarding.catalogueVersion } : {}), offers, paints, name: build.name, look: build.look,
    complete: hasAll && (state.version === 1 || state.onboarding.milestones.assembled) });
}
export function parsePracticeAppearance(raw: unknown): PracticeAppearance | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<PracticeAppearance>;
  if (!value.name || !FIRST_WORDS.includes(value.name.first) || !SECOND_WORDS.includes(value.name.second)) return null;
  if (value.name.num != null && (!Number.isInteger(value.name.num) || value.name.num < 1 || value.name.num > 99)) return null;
  const offers = {} as Record<Socket, string>;
  const paints: Partial<Record<Socket, PaintId>> = {};
  const isWelcome = BEGINNER_ORDER.every(socket => value.offers?.[socket] === BEGINNER_OFFERS.find(o => o.part.slot === EQUIPMENT_KIND[socket])?.id &&
    (value.paints?.[socket] ?? null) === WELCOME_PAINTS[socket]);
  for (const socket of BEGINNER_ORDER) {
    const offer = beginnerOffer(value.offers?.[socket]);
    if (!offer || offer.part.slot !== EQUIPMENT_KIND[socket]) return null;
    offers[socket] = offer.id;
    const paint = value.paints?.[socket];
    if (paint != null) {
      if (socket === "weapon" || !isPaintId(paint) || !isWelcome && paint !== offer.color) return null;
      paints[socket] = paint;
    }
  }
  return { offers, paints, name: { first: value.name.first, second: value.name.second, num: value.name.num ?? null }, ...(value.look && typeof value.look === "object" ? { look: value.look } : {}) };
}
export function practiceAppearanceOf(state: GameDemo, build: Build | undefined): PracticeAppearance | null {
  if (!build) return null;
  const offers = Object.fromEntries(BEGINNER_ORDER.map(socket => [socket, state.parts.find(p => p.uid === socketsOf(build)[socket])?.id]));
  const paints = Object.fromEntries(BEGINNER_ORDER.map(socket => [socket, state.parts.find(p => p.uid === socketsOf(build)[socket])?.paint]));
  return parsePracticeAppearance({ offers, paints, name: build.name, look: build.look });
}
