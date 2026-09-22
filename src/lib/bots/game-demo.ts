/** A visitor's practice garage. Its economy stays local; only validated appearance choices may be copied at sign-in. */
import { BEGINNER_ALLOWANCE, BEGINNER_OFFERS, BEGINNER_ORDER, WELCOME_PAINTS, beginnerOffer, beginnerOffersFor, beginnerOrderFor, gameCard } from "./beginner-catalog";
import { stylesPreviewEnabled } from "./style-guide";
import { hasStyleParts, styleAssemblyIssue } from "./style-preview";
import { EQUIPMENT_KIND, fitPart, socketsOf, withSockets } from "./equipment";
import { FIRST_WORDS, SECOND_WORDS, starterBuild, recycleValue, type Build, type OwnedPart, type Socket } from "./fixtures";
import { NO_LOOK, findsOf, normalizeLook } from "./look";
import type { OnboardingView } from "./onboarding-types";
import type { PaintId } from "@/app/bots/_engine/parts";
import { draftPreview, emptyDraftOffers, parseDraftName } from "./onboarding-draft";

export const GAME_DEMO_KEY = "bots.practice.garage.v1";
export interface GameDemo { version: 1 | 2; coins: number; parts: OwnedPart[]; builds: Build[]; onboarding: OnboardingView; nudgeDismissed: boolean; recycled?: { bays: number[]; parts: string[] } }
const purchases = () => Object.fromEntries(BEGINNER_ORDER.map(s => [s, null])) as OnboardingView["purchases"];
export function freshGameDemo(version: 1 | 2 = 1, catalogueVersion: 1 | 2 = version === 2 && stylesPreviewEnabled() ? 2 : 1): GameDemo {
  if (version === 2) {
    const draft = { ...starterBuild(1), name: { first: "Tiny", second: "Biscuit", num: null }, look: { ...NO_LOOK } };
    return { version: 2, coins: BEGINNER_ALLOWANCE, parts: [], builds: [draft], nudgeDismissed: false, onboarding: {
      version: 2, catalogueVersion, step: "welcome", welcomeBotId: -1, welcomeBay: 1, draftBotId: -1, draftBay: 1,
      allowance: 250, reservedCoins: 250, purchases: purchases(), nextSocket: beginnerOrderFor(catalogueVersion)[0], purchasedCount: 0, practiceFightId: null,
      milestones: { welcomed: false, assembled: false, practiced: false, completed: false }, offers: beginnerOffersFor(catalogueVersion),
      revision: 0, draftOffers: emptyDraftOffers(), draftName: draft.name,
    } };
  }
  const paints = WELCOME_PAINTS;
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
  const o = state.onboarding, offer = beginnerOffer(offerId, o.catalogueVersion ?? 1);
  if (o.version === 2) {
    if (!offer || o.step !== "shop" || offer.part.slot !== EQUIPMENT_KIND[socket] || o.draftOffers?.[socket] === offerId) return state;
    const draftOffers = { ...emptyDraftOffers(), ...o.draftOffers, [socket]: offerId };
    const chosen = { ...o.purchases, [socket]: { partId: -1 - BEGINNER_ORDER.indexOf(socket), offerId } };
    const onboarding: OnboardingView = { ...o, draftOffers, purchases: chosen, revision: (o.revision ?? 0) + 1,
      nextSocket: beginnerOrderFor(o.catalogueVersion).find(s => !chosen[s]) ?? null, purchasedCount: BEGINNER_ORDER.filter(s => chosen[s]).length };
    const preview = draftPreview(onboarding), previous = state.builds.find(b => b.bay === o.draftBay);
    return { ...state, onboarding, parts: preview.parts, builds: [{ ...preview.build, ...(previous ? { name: previous.name, look: previous.look } : {}) }] };
  }
  if (!offer || o.step !== "shop" || o.nextSocket !== socket || offer.part.slot !== EQUIPMENT_KIND[socket] || o.purchases[socket] || state.coins < offer.price) return state;
  const uid = `intro-${socket}`, part: OwnedPart = { ...offer.part, s: [1, 1, 1], uid, salvage: 0, provenance: "Your first build", ...(offer.color ? { paint: offer.color } : {}) };
  const bought = { ...o.purchases, [socket]: { partId: BEGINNER_ORDER.indexOf(socket) + 1, offerId } };
  const nextSocket = BEGINNER_ORDER.find(s => !bought[s]) ?? null, purchasedCount = BEGINNER_ORDER.filter(s => bought[s]).length;
  return { ...state, coins: state.coins - offer.price, parts: [...state.parts, part], builds: state.builds.map(b => b.bay === o.draftBay ? fitPart(b, part, socket) : b), onboarding: {
    ...o, purchases: bought, nextSocket, purchasedCount, reservedCoins: o.reservedCoins - offer.price, step: nextSocket ? "shop" : "practice",
    milestones: { ...o.milestones, assembled: !nextSocket },
  } };
}
/** Explicitly commit the one v2 starter. Choosing the seventh item never commits it. */
export function demoFinish(state: GameDemo): GameDemo {
  const o = state.onboarding;
  if (o.version !== 2 || o.step !== "shop" || o.purchasedCount !== 7 || state.coins < BEGINNER_ALLOWANCE || o.reservedCoins !== BEGINNER_ALLOWANCE) return state;
  const preview = draftPreview(o);
  if (preview.parts.length !== 7) return state;
  const previous = state.builds.find(b => b.bay === o.draftBay);
  return { ...state, coins: state.coins - BEGINNER_ALLOWANCE,
    parts: preview.parts.map(p => ({ ...p, salvage: Math.floor(p.price * .4), provenance: "Your starter build" })),
    builds: [{ ...preview.build, ...(previous ? { name: previous.name, look: previous.look } : {}) }],
    onboarding: { ...o, step: "complete", reservedCoins: 0, milestones: { ...o.milestones, assembled: true, completed: true } } };
}
export function demoComplete(state: GameDemo): GameDemo {
  if (state.onboarding.purchasedCount !== 7) return state;
  if (state.onboarding.version === 2 && !state.onboarding.milestones.assembled) return state;
  return { ...state, onboarding: { ...state.onboarding, step: "complete", practiceFightId: "local-welcome-practice", milestones: { ...state.onboarding.milestones, practiced: true, completed: true } } };
}
export function demoSave(state: GameDemo, build: Build): GameDemo {
  const previous = state.builds.find(b => b.bay === build.bay);
  if (!previous) return state;
  if (state.onboarding.version === 2 && !state.onboarding.milestones.assembled && build.bay === state.onboarding.draftBay) {
    const name = parseDraftName(build.name);
    if (!name) return state;
    return { ...state, builds: state.builds.map(b => b.bay === build.bay ? { ...b, name, look: { ...(build.look ?? b.look ?? NO_LOOK), plateNumber: name.num } } : b),
      onboarding: { ...state.onboarding, draftName: name, revision: (state.onboarding.revision ?? 0) + (JSON.stringify(previous.name) === JSON.stringify(name) ? 0 : 1) } };
  }
  const prior = socketsOf(previous), next = socketsOf(build);
  if (styleAssemblyIssue(build, state.parts, hasStyleParts(previous, state.parts))) return state;
  if (BEGINNER_ORDER.every(s => prior[s] && state.parts.some(p => p.uid === prior[s])) && BEGINNER_ORDER.some(s => prior[s] !== next[s])) return state;
  const valid = new Map(state.parts.map(p => [p.uid, p])), used = new Set<string>();
  const elsewhere = new Set(state.builds.filter(b => b.bay !== build.bay).flatMap(b => Object.values(socketsOf(b)).filter((uid): uid is string => uid !== null)));
  for (const socket of BEGINNER_ORDER) {
    const uid = socketsOf(build)[socket], part = uid ? valid.get(uid) : undefined;
    if (uid && (!part || used.has(uid) || elsewhere.has(uid) || part.slot !== EQUIPMENT_KIND[socket])) return state;
    if (uid) used.add(uid);
  }
  return { ...state, builds: state.builds.map(b => b.bay === build.bay ? build : b) };
}
/** Recycle only real inventory once. Persist tombstones so hydration cannot grant it again. */
export function demoRecycle(state: GameDemo, bay: number): GameDemo {
  if (state.onboarding.step !== "complete") return state;
  const build = state.builds.find(b => b.bay === bay);
  if (!build) return state;
  const ids = new Set(Object.values(socketsOf(build)).filter((id): id is string => !!id));
  const recycled = state.parts.filter(p => ids.has(p.uid));
  return { ...state, coins: state.coins + recycled.reduce((sum, p) => sum + recycleValue(p), 0), parts: state.parts.filter(p => !ids.has(p.uid)), builds: state.builds.filter(b => b.bay !== bay),
    recycled: { bays: Array.from(new Set([...(state.recycled?.bays ?? []), bay])), parts: Array.from(new Set([...(state.recycled?.parts ?? []), ...recycled.map(p => p.uid)])) } };
}
/** New practice bays have no grant and no parts. The existing inventory is shared. */
export function demoCreateBay(state: GameDemo, bay: number): GameDemo {
  if (state.onboarding.step !== "complete" || !Number.isInteger(bay) || bay < 1 || bay > 5 || state.builds.some(b => b.bay === bay)) return state;
  return { ...state, builds: [...state.builds, starterBuild(bay)].sort((a,b) => a.bay-b.bay), ...(state.recycled ? { recycled: { ...state.recycled, bays: state.recycled.bays.filter(b => b !== bay) } } : {}) };
}
/** Reconstruct prices, identities and progress from valid choices; never trust persisted claims. */
export function readGameDemo(raw: string | null, defaultVersion: 1 | 2 = 1): GameDemo {
  if (!raw || raw.length > 150000) return freshGameDemo(defaultVersion);
  try {
    const value = JSON.parse(raw) as GameDemo;
    if (value.version !== 1 && value.version !== 2) return freshGameDemo(defaultVersion);
    // A flag change must never turn an earlier saved draft into a new starter.
    const catalogueVersion = value.version === 2 && value.onboarding?.catalogueVersion === 2 ? 2 : 1;
    let state = freshGameDemo(value.version, catalogueVersion);
    if (value.onboarding?.milestones?.welcomed) state = demoWelcome(state);
    for (const s of BEGINNER_ORDER) { const id = value.onboarding?.purchases?.[s]?.offerId; if (typeof id === "string") state = demoBuy(state, s, id); }
    if (value.version === 2 && value.onboarding?.milestones?.assembled) state = demoFinish(state);
    if (value.onboarding?.milestones?.completed && (value.version === 1 || value.onboarding.milestones.practiced)) state = demoComplete(state);
    const rawBuilds = Array.isArray(value.builds) ? value.builds : [];
    if (state.onboarding.step === "complete" && value.recycled) {
      const retired = new Set(Array.isArray(value.recycled.parts) ? value.recycled.parts.filter(id => typeof id === "string" && state.parts.some(p => p.uid === id)) : []);
      const bays = Array.isArray(value.recycled.bays) ? Array.from(new Set(value.recycled.bays.filter(b => Number.isInteger(b) && b >= 1 && b <= 5))) : [];
      const credit = state.parts.filter(p => retired.has(p.uid)).reduce((sum, p) => sum + recycleValue(p), 0);
      state = { ...state, coins: state.coins + credit, parts: state.parts.filter(p => !retired.has(p.uid)), builds: state.builds.filter(b => !bays.includes(b.bay)).map(b =>
        withSockets(b, Object.fromEntries(BEGINNER_ORDER.map(s => [s, retired.has(socketsOf(b)[s] ?? "") ? null : socketsOf(b)[s]])) as ReturnType<typeof socketsOf>)), recycled: { bays, parts: Array.from(retired) } };
    }
    for (const rawBuild of rawBuilds) if (rawBuild && typeof rawBuild.bay === "number") state = demoCreateBay(state, rawBuild.bay);
    const builds = state.builds.map(saved => {
      const raw = rawBuilds.find(b => b?.bay === saved.bay);
      return raw && FIRST_WORDS.includes(raw.name?.first) && SECOND_WORDS.includes(raw.name?.second) ? raw : saved;
    });
    // Complete robots retain their canonical purchased instances. Recreated empty
    // stands may take valid remaining spares, but retired instances never return.
    if (state.onboarding.step === "complete") {
      const candidate = builds.map((b, i) => {
        const saved = state.builds[i], current = socketsOf(saved);
        const locked = BEGINNER_ORDER.every(s => current[s] && state.parts.some(p => p.uid === current[s]));
        return b.sockets && !locked ? withSockets(saved, socketsOf(b)) : saved;
      });
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
    if (value.version === 2) state = { ...state, onboarding: { ...state.onboarding, draftName: state.builds.find(b => b.bay === state.onboarding.draftBay)?.name ?? state.onboarding.draftName,
      revision: Number.isSafeInteger(value.onboarding.revision) && Number(value.onboarding.revision) >= Number(state.onboarding.revision) && Number(value.onboarding.revision) < 1000000 ? value.onboarding.revision : state.onboarding.revision } };
    return { ...state, nudgeDismissed: value.nudgeDismissed === true };
  } catch { return freshGameDemo(defaultVersion); }
}
