/** Pure social intentions. Both diner states and social receipts are server-owned. */
import { INGREDIENT_BY_ID } from "./content";
import { dinerDay, dispatchDiner, homeSimulationConfig, type DinerState } from "./progression";
import { DinerAuthorityError, type DinerRecord } from "./authority";

export const DINER_SOCIAL_RULES = { version: 1, tradeLevel: 8, tradesPerDay: 5, pendingTrades: 3, tradeMs: 86_400_000, requestsPerDay: 10, stickersPerDay: 20 } as const;
export const DINER_STICKERS = [{ id: "cosy", name: "So cosy" }, { id: "delicious", name: "Looks delicious" }, { id: "creative", name: "Beautiful room" }, { id: "welcome", name: "Glad you're here" }] as const;
export interface DinerSocialProfile { handle: string; published: boolean; day: number; trades: number; requests: number; stickerClaims: string[]; pendingTrades: string[]; stickers: Record<string, number> }
export interface DinerFriendship { left: string; right: string; requester: string | null; accepted: boolean; blockedBy: string[] }
export interface DinerTrade { id: string; from: string; to: string; give: string; receive: string; status: "pending" | "accepted" | "cancelled" | "expired"; createdAt: number; expiresAt: number; resolvedAt: number | null }
export type DinerSocialCommand =
  | { type: "publish"; enabled: boolean }
  | { type: "request" | "accept" | "remove" | "block" | "unblock" | "visitGift"; targetHandle: string }
  | { type: "sticker"; targetHandle: string; stickerId: string }
  | { type: "offerTrade"; targetHandle: string; give: string; receive: string }
  | { type: "acceptTrade" | "cancelTrade"; tradeId: string };
export interface DinerSocialInput { actorId: string; actor: DinerRecord; actorProfile: DinerSocialProfile; targetId?: string; target?: DinerRecord; targetProfile?: DinerSocialProfile; friendship?: DinerFriendship | null; trade?: DinerTrade | null }
export function createSocialProfile(playerId: string, now: number): DinerSocialProfile { return { handle: `diner-${playerId.replace(/-/g, "").slice(0, 16)}`, published: false, day: dinerDay(now), trades: 0, requests: 0, stickerClaims: [], pendingTrades: [], stickers: {} }; }
export function socialPair(left: string, right: string): DinerFriendship { const ids = [left, right].sort(); return { left: ids[0], right: ids[1], requester: null, accepted: false, blockedBy: [] }; }
function fail(code: string, message: string): never { throw new DinerAuthorityError(code, message); }
const knownIngredient = (id: unknown): id is string => typeof id === "string" && Object.prototype.hasOwnProperty.call(INGREDIENT_BY_ID, id);
function roll(profile: DinerSocialProfile, now: number) { const day = dinerDay(now); if (day > profile.day) { profile.day = day; profile.trades = 0; profile.requests = 0; profile.stickerClaims = []; } }
export function validateSocialCommand(raw: unknown): DinerSocialCommand {
  const value = raw as DinerSocialCommand;
  const fields: Record<string, string[]> = { publish: ["enabled"], request: ["targetHandle"], accept: ["targetHandle"], remove: ["targetHandle"], block: ["targetHandle"], unblock: ["targetHandle"], visitGift: ["targetHandle"], sticker: ["targetHandle", "stickerId"], offerTrade: ["targetHandle", "give", "receive"], acceptTrade: ["tradeId"], cancelTrade: ["tradeId"] };
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.prototype.hasOwnProperty.call(fields, value.type) || Object.keys(value).some(key => key !== "type" && !fields[value.type].includes(key))) fail("invalid_social_action", "Choose a friendship action, never balances or rewards.");
  if ("targetHandle" in value && (typeof value.targetHandle !== "string" || !/^diner-[a-f0-9]{16}$/.test(value.targetHandle))) fail("invalid_handle", "Choose a public diner handle.");
  if ("tradeId" in value && (typeof value.tradeId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.tradeId))) fail("invalid_trade", "Choose a saved trade.");
  if (value.type === "publish" && typeof value.enabled !== "boolean") fail("invalid_social_action", "Choose whether to publish your diner.");
  if (value.type === "offerTrade" && (!knownIngredient(value.give) || !knownIngredient(value.receive) || value.give === value.receive)) fail("invalid_trade", "Offer one ingredient for one different ingredient.");
  if (value.type === "sticker" && !DINER_STICKERS.some(sticker => sticker.id === value.stickerId)) fail("invalid_sticker", "Choose a sticker from the collection.");
  return value;
}
export function replayDinerSocial(input: DinerSocialInput, raw: DinerSocialCommand, context: { now: number; commandId: string }) {
  const command = validateSocialCommand(raw), result = structuredClone(input), { actor, actorProfile, actorId } = result;
  const now = Math.max(context.now, actor.state.updatedAt, result.target?.state.updatedAt ?? 0);
  if (!Number.isSafeInteger(now) || now < 0) fail("invalid_clock", "The street clock is unavailable.");
  roll(actorProfile, now); if (result.targetProfile) roll(result.targetProfile, now);
  if (command.type === "publish") { actorProfile.published = command.enabled; return result; }
  const target = result.target, targetProfile = result.targetProfile, targetId = result.targetId;
  if (!target || !targetProfile || !targetId || targetId === actorId) fail("diner_unavailable", "That diner is unavailable.");
  const pair = result.friendship ?? socialPair(actorId, targetId); result.friendship = pair;
  if (command.type === "cancelTrade") {
    const trade = result.trade;
    if (!trade || trade.status !== "pending" || ![trade.from, trade.to].includes(actorId)) fail("trade_unavailable", "Choose a pending offer you sent or received.");
    const sender = trade.from === actorId ? actor : target;
    sender.state.pantry[trade.give] = (sender.state.pantry[trade.give] ?? 0) + 1;
    trade.status = now >= trade.expiresAt ? "expired" : "cancelled"; trade.resolvedAt = now;
    actorProfile.pendingTrades = actorProfile.pendingTrades.filter(id => id !== trade.id); targetProfile.pendingTrades = targetProfile.pendingTrades.filter(id => id !== trade.id); return result;
  }
  if (command.type === "unblock") { pair.blockedBy = pair.blockedBy.filter(id => id !== actorId); return result; }
  if (pair.blockedBy.length && command.type !== "remove" && command.type !== "block") fail("diner_unavailable", "That diner is unavailable.");
  if (command.type === "block") { pair.blockedBy = [...new Set([...pair.blockedBy, actorId])]; pair.accepted = false; pair.requester = null; return result; }
  if (command.type === "remove") { pair.accepted = false; pair.requester = null; return result; }
  if (!actorProfile.published || !targetProfile.published) fail("diner_unavailable", "Both diners need a published room for this action.");
  switch (command.type) {
    case "request": if (pair.accepted || pair.requester || actorProfile.requests >= DINER_SOCIAL_RULES.requestsPerDay) fail("request_unavailable", "That invitation is already pending, or today's invitations are used."); else { pair.requester = actorId; actorProfile.requests++; break; }
    case "accept": if (pair.requester !== targetId || pair.accepted) fail("request_unavailable", "Accept an invitation sent to you."); else { pair.accepted = true; pair.requester = null; break; }
    case "sticker": {
      const key = `${targetId}:${command.stickerId}`;
      if (actorProfile.stickerClaims.includes(key) || actorProfile.stickerClaims.length >= DINER_SOCIAL_RULES.stickersPerDay) fail("sticker_used", "This sticker was already left today, or today's stickers are used.");
      actorProfile.stickerClaims.push(key); targetProfile.stickers[command.stickerId] = Math.min(1_000_000, (targetProfile.stickers[command.stickerId] ?? 0) + 1); break;
    }
    case "visitGift": {
      if (!pair.accepted) fail("friend_required", "Accept each other's invitation before finding a friendship parcel.");
      const granted = dispatchDiner(actor.state, { type: "greetRegular" }, { now });
      if (granted.error) fail(granted.code ?? "already_claimed", granted.error); actor.state = granted.state; break;
    }
    case "offerTrade": {
      if (!pair.accepted || actor.state.restaurantLevel < DINER_SOCIAL_RULES.tradeLevel || target.state.restaurantLevel < DINER_SOCIAL_RULES.tradeLevel) fail("trade_locked", "Both friends need restaurant level 8 to trade.");
      if (actorProfile.trades >= 5 || targetProfile.trades >= 5 || actorProfile.pendingTrades.length >= 3 || targetProfile.pendingTrades.length >= 3) fail("trade_limit", "A diner has used its daily trades or has three pending offers.");
      if ((actor.state.pantry[command.give] ?? 0) < 1) fail("ingredient_needed", "Keep one offered ingredient in your pantry.");
      actor.state.pantry[command.give]--;
      result.trade = { id: context.commandId, from: actorId, to: targetId, give: command.give, receive: command.receive, status: "pending", createdAt: now, expiresAt: now + DINER_SOCIAL_RULES.tradeMs, resolvedAt: null };
      actorProfile.pendingTrades.push(context.commandId); targetProfile.pendingTrades.push(context.commandId); break;
    }
    case "acceptTrade": {
      const trade = result.trade;
      if (!trade || trade.to !== actorId || trade.from !== targetId || trade.status !== "pending") fail("trade_unavailable", "Accept a pending offer sent to you.");
      if (now >= trade.expiresAt) { target.state.pantry[trade.give] = (target.state.pantry[trade.give] ?? 0) + 1; trade.status = "expired"; }
      else {
        if (!pair.accepted || actor.state.restaurantLevel < 8 || target.state.restaurantLevel < 8 || actorProfile.trades >= 5 || targetProfile.trades >= 5) fail("trade_limit", "Both friends need level 8 and a daily trade remaining.");
        if ((actor.state.pantry[trade.receive] ?? 0) < 1) fail("ingredient_needed", "Keep the requested ingredient before accepting.");
        actor.state.pantry[trade.receive]--; actor.state.pantry[trade.give] = (actor.state.pantry[trade.give] ?? 0) + 1; target.state.pantry[trade.receive] = (target.state.pantry[trade.receive] ?? 0) + 1;
        actorProfile.trades++; targetProfile.trades++; trade.status = "accepted";
      }
      trade.resolvedAt = now; actorProfile.pendingTrades = actorProfile.pendingTrades.filter(id => id !== trade.id); targetProfile.pendingTrades = targetProfile.pendingTrades.filter(id => id !== trade.id); break;
    }
  }
  return result;
}
export function publicDiner(state: DinerState, profile: DinerSocialProfile) {
  if (!profile.published) return null;
  const config = homeSimulationConfig(state), placed = new Set(state.home.layout.map(p => p.equipmentId)), selected = new Set(config.menu);
  const equipment = Object.fromEntries(Object.entries(state.equipment).filter(([id]) => placed.has(id)).map(([id, value]) => [id, { tier: value.tier }]));
  const recipes = Object.fromEntries(Object.entries(state.recipes).filter(([id]) => selected.has(id)).map(([id, value]) => [id, { level: value.level }]));
  const menu = { starter: [...state.home.menu.starter], main: [...state.home.menu.main], drink: [...state.home.menu.drink], dessert: [...state.home.menu.dessert] };
  return { ok: true, handle: profile.handle, name: state.home.name, home: { w: state.home.w, h: state.home.h, layout: structuredClone(state.home.layout), menu, staff: { chefs: state.home.staff.chefs, waiters: state.home.staff.waiters }, name: state.home.name }, equipment, recipes, cosmetics: { wrap: state.cosmetics.wrap, horn: state.cosmetics.horn, uniform: state.cosmetics.uniform, floor: state.cosmetics.floor, wall: state.cosmetics.wall }, collections: { trophies: [...state.collections.trophies], mementos: [...state.collections.mementos] }, stickers: DINER_STICKERS.map(sticker => ({ ...sticker, count: profile.stickers[sticker.id] ?? 0 })), simulation: { ...config, equipment, recipeLevels: Object.fromEntries(Object.entries(recipes).map(([id, value]) => [id, value.level])) } };
}
