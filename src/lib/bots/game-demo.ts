/** A visitor's practice garage. This store is never merged into a connected account. */
import { BEGINNER_ALLOWANCE, BEGINNER_OFFERS, BEGINNER_ORDER, beginnerOffer, gameCard } from "./beginner-catalog";
import { EQUIPMENT_KIND, fitPart, socketsOf, withSockets } from "./equipment";
import { FIRST_WORDS, SECOND_WORDS, starterBuild, type Build, type OwnedPart, type Socket } from "./fixtures";
import { NO_LOOK, findsOf, normalizeLook } from "./look";
import type { OnboardingView } from "./onboarding-types";
import type { PaintId } from "@/app/bots/_engine/parts";

export const GAME_DEMO_KEY = "bots.practice.garage.v1";
export interface GameDemo { version: 1; coins: number; parts: OwnedPart[]; builds: Build[]; onboarding: OnboardingView; nudgeDismissed: boolean }
const purchases = () => Object.fromEntries(BEGINNER_ORDER.map(s => [s, null])) as OnboardingView["purchases"];
export function freshGameDemo(): GameDemo {
  const paints: Record<Socket, PaintId | null> = { head: "butter", torso: "mint", armL: "coral", armR: "coral", legL: "ink", legR: "ink", weapon: null };
  const parts: OwnedPart[] = [], slots = socketsOf(starterBuild(1));
  for (const socket of BEGINNER_ORDER) {
    const offer = BEGINNER_OFFERS.find(o => o.part.slot === EQUIPMENT_KIND[socket])!;
    const uid = `welcome-${socket}`;
    parts.push({ ...offer.part, s: [1, 1, 1], price: 0, salvage: 0, uid, provenance: "Your welcome robot", ...(paints[socket] ? { paint: paints[socket]! } : {}) });
    slots[socket] = uid;
  }
  const welcome = withSockets({ ...starterBuild(1), name: { first: "Tiny", second: "Biscuit", num: null }, look: { ...NO_LOOK, face: "happy" } }, slots);
  const draft = withSockets({ ...starterBuild(2), name: { first: "Rusty", second: "Pickle", num: null }, look: { ...NO_LOOK } }, socketsOf(starterBuild(2)));
  return { version: 1, coins: BEGINNER_ALLOWANCE, parts, builds: [welcome, draft], nudgeDismissed: false, onboarding: {
    version: 1, step: "welcome", welcomeBotId: -1, welcomeBay: 1, draftBotId: -2, draftBay: 2, allowance: 250, reservedCoins: 250,
    purchases: purchases(), nextSocket: "head", purchasedCount: 0, practiceFightId: null,
    milestones: { welcomed: false, assembled: false, practiced: false, completed: false }, offers: BEGINNER_OFFERS,
  } };
}
export function demoWelcome(state: GameDemo): GameDemo {
  if (state.onboarding.step !== "welcome") return state;
  return { ...state, onboarding: { ...state.onboarding, step: "shop", milestones: { ...state.onboarding.milestones, welcomed: true } } };
}
export function demoBuy(state: GameDemo, socket: Socket, offerId: string): GameDemo {
  const o = state.onboarding, offer = beginnerOffer(offerId);
  if (!offer || o.step !== "shop" || o.nextSocket !== socket || offer.part.slot !== EQUIPMENT_KIND[socket] || o.purchases[socket] || state.coins < offer.price) return state;
  const uid = `intro-${socket}`, part: OwnedPart = { ...offer.part, s: [1, 1, 1], uid, salvage: 0, provenance: "Your first build", ...(offer.color ? { paint: offer.color } : {}) };
  const bought = { ...o.purchases, [socket]: { partId: BEGINNER_ORDER.indexOf(socket) + 1, offerId } };
  const nextSocket = BEGINNER_ORDER.find(s => !bought[s]) ?? null, purchasedCount = BEGINNER_ORDER.filter(s => bought[s]).length;
  return { ...state, coins: state.coins - offer.price, parts: [...state.parts, part], builds: state.builds.map(b => b.bay === o.draftBay ? fitPart(b, part, socket) : b), onboarding: {
    ...o, purchases: bought, nextSocket, purchasedCount, reservedCoins: o.reservedCoins - offer.price, step: nextSocket ? "shop" : "practice",
    milestones: { ...o.milestones, assembled: !nextSocket },
  } };
}
export function demoComplete(state: GameDemo): GameDemo {
  if (state.onboarding.purchasedCount !== 7) return state;
  return { ...state, onboarding: { ...state.onboarding, step: "complete", practiceFightId: "local-welcome-practice", milestones: { ...state.onboarding.milestones, practiced: true, completed: true } } };
}
export function demoSave(state: GameDemo, build: Build): GameDemo {
  const valid = new Map(state.parts.map(p => [p.uid, p])), used = new Set<string>();
  const elsewhere = new Set(state.builds.filter(b => b.bay !== build.bay).flatMap(b => Object.values(socketsOf(b)).filter((uid): uid is string => uid !== null)));
  for (const socket of BEGINNER_ORDER) {
    const uid = socketsOf(build)[socket], part = uid ? valid.get(uid) : undefined;
    if (uid && (!part || used.has(uid) || elsewhere.has(uid) || part.slot !== EQUIPMENT_KIND[socket])) return state;
    if (uid) used.add(uid);
  }
  return { ...state, builds: state.builds.map(b => b.bay === build.bay ? build : b) };
}
/** New practice bays have no grant and no parts. The existing inventory is shared. */
export function demoCreateBay(state: GameDemo, bay: number): GameDemo {
  if (state.onboarding.step !== "complete" || !Number.isInteger(bay) || bay < 1 || bay > 5 || state.builds.some(b => b.bay === bay)) return state;
  return { ...state, builds: [...state.builds, starterBuild(bay)].sort((a,b) => a.bay-b.bay) };
}
/** Reconstruct prices, identities and progress from valid choices; never trust persisted claims. */
export function readGameDemo(raw: string | null): GameDemo {
  if (!raw || raw.length > 150000) return freshGameDemo();
  try {
    const value = JSON.parse(raw) as GameDemo;
    if (value.version !== 1) return freshGameDemo();
    let state = freshGameDemo();
    if (value.onboarding?.milestones?.welcomed) state = demoWelcome(state);
    for (const s of BEGINNER_ORDER) { const id = value.onboarding?.purchases?.[s]?.offerId; if (typeof id === "string") state = demoBuy(state, s, id); }
    if (value.onboarding?.milestones?.completed) state = demoComplete(state);
    const rawBuilds = Array.isArray(value.builds) ? value.builds : [];
    for (const rawBuild of rawBuilds) if (rawBuild && typeof rawBuild.bay === "number") state = demoCreateBay(state, rawBuild.bay);
    const builds = state.builds.map(saved => {
      const raw = rawBuilds.find(b => b?.bay === saved.bay);
      return raw && FIRST_WORDS.includes(raw.name?.first) && SECOND_WORDS.includes(raw.name?.second) ? raw : saved;
    });
    // Restore the whole arrangement at once. A legitimate swap between two robots
    // must not collide with the other robot's old arrangement during hydration.
    if (state.onboarding.step === "complete") {
      const candidate = builds.map((b, i) => b.sockets ? withSockets(state.builds[i], socketsOf(b)) : state.builds[i]);
      const known = new Map(state.parts.filter(p => gameCard(p.id)).map(p => [p.uid, p]));
      const used = new Set<string>();
      const valid = candidate.every(b => BEGINNER_ORDER.every(socket => {
        const uid = socketsOf(b)[socket];
        if (uid === null) return true;
        const part = known.get(uid);
        if (!part || used.has(uid) || part.slot !== EQUIPMENT_KIND[socket]) return false;
        used.add(uid); return true;
      }));
      if (valid) state = { ...state, builds: candidate };
    }
    state = { ...state, builds: builds.map((build, i) => {
      const saved = state.builds[i];
      const name = { first: build.name.first, second: build.name.second, num: Number.isInteger(build.name.num) && Number(build.name.num) >= 1 && Number(build.name.num) <= 99 ? build.name.num : null };
      const next = { ...saved, name };
      const worn = BEGINNER_ORDER.map(s => state.parts.find(p => p.uid === socketsOf(next)[s]));
      const earned = findsOf({ wins: 0, losses: 0, level: 1, champion: false, bodyCount: 6, bodyPaints: worn.filter(p => p && p.slot !== "weapon").map(p => p!.paint).filter((p): p is PaintId => !!p), partStars: worn.filter((p): p is OwnedPart => !!p).map(p => p.tier), hats: [], plateNumber: name.num });
      next.look = normalizeLook(build.look, earned);
      if (!next.look.sticker && !build.look?.stickerPaint) next.look.stickerPaint = null;
      next.decal = next.look.spot === "chest" ? next.look.sticker : null;
      return next;
    }) };
    return { ...state, nudgeDismissed: value.nudgeDismissed === true };
  } catch { return freshGameDemo(); }
}
