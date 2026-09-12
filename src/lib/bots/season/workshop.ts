import { modularBuild, type CombatBuild, type CombatSocket } from "@/lib/bots/combat-model";
import { cardV6, presetV6, snapshotBuildV6, statsV6, weaponCompatibilityV6, type CardV6, type BuildV6 } from "@/lib/bots/v6";
import { fightRoomHref } from "@/lib/bots/fight-navigation";
import type { Part } from "@/app/bots/_engine/parts";
import type { SeasonDraft, SeasonStateResponse } from "./types";

export const BUILD_ORDER = ["torso", "head", "armL", "armR", "legL", "legR", "weapon"] as const;
export const SOCKET_NAME: Record<CombatSocket, string> = { torso: "Body", head: "Head", armL: "Left arm", armR: "Right arm", legL: "Left leg", legR: "Right leg", weapon: "Weapon" };
export const socketKind = (socket: CombatSocket) => socket.startsWith("arm") ? "arms" : socket.startsWith("leg") ? "legs" : socket;
export const emptySeasonDraft = (): SeasonDraft => ({ revision: 0, name: "", parts: {}, defensePlan: "balanced" });
export function seasonBuild(parts: SeasonDraft["parts"]): CombatBuild {
  const part = (socket: CombatSocket): Part => { const c = cardV6(parts[socket]); return c && c.slot === socketKind(socket) ? { id: c.id, s: [...c.s] } : { id: "", s: [0, 0, 0] }; };
  return modularBuild(part("head"), part("torso"), part("armL"), part("armR"), part("legL"), part("legR"), part("weapon"));
}
export function seasonDraftSummary(draft: SeasonDraft) {
  const cards = BUILD_ORDER.map(socket => { const card = cardV6(draft.parts[socket]); return card?.slot === socketKind(socket) ? card : undefined; });
  const count = cards.filter(Boolean).length, build = seasonBuild(draft.parts);
  const compatibility = draft.parts.weapon ? weaponCompatibilityV6(draft.parts.weapon, draft.parts.torso) : { compatible: true, reason: null };
  return { build, cards, count, complete: count === 7 && compatibility.compatible, price: cards.reduce((sum, card) => sum + (card?.price ?? 0), 0), stats: statsV6(build), compatibility };
}
/** Missing choices only fill an invisible display rig; they never enter the editable draft or Finish payload. */
export function seasonDisplayBuild(draft: SeasonDraft): { build: BuildV6; visibleSlots: CombatSocket[]; warning: string | null } | null {
  const summary = seasonDraftSummary(draft), first = cardV6(draft.parts.torso) ?? summary.cards.find((c): c is CardV6 => !!c);
  if (!first) return null;
  const base = presetV6(first.style, first.tier, { ...(first.family ? { family: first.family } : {}) });
  const parts = Object.fromEntries(BUILD_ORDER.map(socket => [socket, base.parts[socket].id]));
  const visibleSlots: CombatSocket[] = [];
  for (const socket of BUILD_ORDER) { const card = cardV6(draft.parts[socket]); if (card?.slot !== socketKind(socket)) continue; if (socket === "weapon" && !weaponCompatibilityV6(card.id, parts.torso).compatible) continue; parts[socket] = card.id; visibleSlots.push(socket); }
  return { build: snapshotBuildV6(seasonBuild(parts)), visibleSlots, warning: summary.compatibility.reason };
}
/** A try-on changes exactly one socket. It never silently swaps an incompatible weapon. */
export function trySeasonPart(draft: SeasonDraft, socket: CombatSocket, card: CardV6): SeasonDraft {
  if (card.slot !== socketKind(socket)) throw new Error(`Choose a ${SOCKET_NAME[socket].toLowerCase()}.`);
  return { ...draft, parts: { ...draft.parts, [socket]: card.id } };
}
export function seasonComparison(draft: SeasonDraft, socket: CombatSocket, card: CardV6) {
  const before = seasonDraftSummary(draft), afterDraft = trySeasonPart(draft, socket, card), after = seasonDraftSummary(afterDraft);
  const keys = ["health", "speed", "str", "dodge", "dmg", "block", "luck", "acc", "atkSpd"] as const;
  return { before, after, afterDraft, gp: after.stats.gp - before.stats.gp, coins: after.price - before.price, deltas: keys.map(key => ({ key, before: before.stats[key], after: after.stats[key], change: after.stats[key] - before.stats[key] })) };
}
export const STAT_NAME = { health: "Body strength", speed: "Speed", str: "Push power", dodge: "Dodging", dmg: "Hit power", block: "Guard", luck: "Critical hits", acc: "Aim", atkSpd: "Attack speed" } as const;
export function seasonPreviewHref(card: CardV6) { return fightRoomHref(6, { part: card.id }); }
export function readSeasonDraft(raw: string | null): SeasonDraft | null {
  try { const value = raw ? JSON.parse(raw) : null; if (!value || typeof value.name !== "string" || value.name.length > 40 || !value.parts || typeof value.parts !== "object" || !["early", "balanced", "last-stand"].includes(value.defensePlan)) return null;
    const draft = emptySeasonDraft(); draft.name = value.name; draft.defensePlan = value.defensePlan;
    for (const socket of BUILD_ORDER) { const card = cardV6(value.parts[socket]); if (card?.slot === socketKind(socket)) draft.parts[socket] = card.id; }
    return draft;
  } catch { return null; }
}

/** Archived designs are reusable; a repeated left/right design is only bought once. */
export function collectionBuildQuote(draft: SeasonDraft, collections: NonNullable<SeasonStateResponse["collections"]>) {
  const owned = new Set(collections.flatMap(c => c.parts)), summary = seasonDraftSummary(draft);
  const missing = Array.from(new Set(summary.cards.filter((c): c is CardV6 => !!c).map(c => c.id))).filter(id => !owned.has(id)).map(id => cardV6(id)!);
  return { ...summary, missing, coins: missing.reduce((total, c) => total + c.price, 0) };
}

/** Only these complete, uniform authoring references have exact stills. Mixed robots never borrow a preset picture. */
export function seasonHeroStill(build: Pick<BuildV6, "parts">): string | null {
  const body = build.parts.torso, supported = body.family === "boiler_knight" || body.family === "roller_daredevil" || body.family === "owl_ranger";
  const weapon = build.parts.weapon;
  if (!supported || body.tier !== 3 || weapon.tier !== 3 || weapon.signatureStyle !== body.style) return null;
  if (!BUILD_ORDER.filter(s => s !== "weapon").every(s => build.parts[s].tier === 3 && build.parts[s].family === body.family)) return null;
  return `/bots-art/3d/season-v6/${body.style}-three-quarter.png`;
}
