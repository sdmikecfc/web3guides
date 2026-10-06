/** Pure command reducer. Only authenticated server routes may persist its output. */
import { itemDef, ITEMS } from "../../app/chef/game/_engine/items";
import { availableDishes, dishDef } from "../../app/chef/game/_engine/cookbook";
import { COURSES } from "../../app/chef/game/_engine/academy";
import { createDelivery, createOnboarding, deliveryContents, sanitizeOnboarding, welcomeIngredientBundle } from "../../app/chef/game/_engine/onboarding";
import { COMMONS, DAILY_SPECIALS, nextRecipe } from "../../app/chef/game/_engine/pantry";
import { createWorld, HIRE_SHOP, validateLayout } from "../../app/chef/game/_engine/world";
import { SHELL, SHELL_SIZES, shellAt } from "../../app/chef/game/_engine/rooms";
import { LIMITS, sanitizeSave, serializeSave, type DkSave } from "../../app/chef/game/_engine/save";
import { KITCHEN_RULES as RULES, utcKitchenDay } from "./rules";
import { operationalQuality, settleRestaurant, operativeMenuForSave, type SettlementState } from "./offline";
import { createLaunchProgress, sanitizeLaunchProgress, rollLaunchDay, syncCareTasks, recordLaunchActivity, advanceCareTask, claimLaunchGoal, dailyGoals, expansionRequirements, type LaunchProgress, type LaunchGoalId } from "../../app/chef/game/_engine/launch-progression";
import type { TruckAction } from "../../app/chef/game/_engine/truck";
import { createTruckAuthority, replayTruck, TruckAuthorityError, type TruckAuthority } from "./truck-authority";
import type { EventEntry } from "./reward-events";
import { sellStoredEquipment } from "../../app/chef/game/_engine/equipment";

export type NeighborStatus = "outgoing" | "incoming" | "friend" | "blocked";
export interface AuthorityState {
  version: 1;
  rulesVersion: number;
  settlement: SettlementState;
  verifiedBestQuality: number;
  verifiedPlates: number;
  dailyClaimDay: number;
  /** Only a fresh server-issued record may contain false. Missing means already claimed. */
  welcomeClaimed?: boolean;
  /** One optional cosmetic import into a fresh account; missing means unavailable. */
  guestDesignImported?: boolean;
  offerDay: number;
  purchasedOffers: string[];
  serviceRewardDay: number;
  socialDay: number;
  socialUsed: number;
  socialPairs: Record<string, true>;
  neighbors: Record<string, NeighborStatus>;
  repairAt: number;
  /** This ledger is issued by the server, never adopted from a client save. */
  launch?: LaunchProgress;
  /** Server-issued truck ledger; client save migrations never establish a run or unlock. */
  truck?: TruckAuthority;
  truckEvents?: Record<string, EventEntry>;
  careAt?: number;
  /** Server-issued collection eligibility only; legacy LP dials never authorize purchases. */
  eligibleMarkets: string[];
  legacyImported: boolean;
}
export interface KitchenRecord { save: DkSave; authority: AuthorityState; revision: number }

export type KitchenCommand =
  | { type: "repairMachine"; uid: number }
  | { type: "truck"; action: TruckAction }
  | { type: "truckBatch"; actions: TruckAction[] }
  | { type: "truckEvent"; eventId: string; action: { type: "enter" | "restart" } | { type: "play"; actions: TruckAction[] } }
  | { type: "settle" | "claimDaily" | "repair" | "expand" | "prepSpecial" }
  | { type: "purchase" | "sell"; itemId: string }
  | { type: "purchaseIngredient"; ingredientId: string }
  | { type: "upgradeDish"; dishId: string }
  | { type: "completeCourse"; id: string }
  | { type: "careTask"; taskId: string }
  | { type: "claimDailyGoal"; goalId: LaunchGoalId }
  | { type: "hire"; hire: "waiter" | "chef" }
  | { type: "layout"; layout: DkSave["layout"]; design?: unknown }
  | { type: "appearance"; appearance: Partial<Pick<DkSave, "name" | "theme" | "crew" | "intro" | "market">> & { onboarding?: Partial<DkSave["onboarding"]> }; design?: unknown }
  | { type: "adoptGuestDesign"; appearance: Partial<Pick<DkSave, "name" | "theme" | "crew">>; layout: DkSave["layout"]; design?: unknown }
  | { type: "selectMenu"; dishes: string[] }
  | { type: "requestFriend" | "acceptFriend" | "removeFriend" | "block" | "unblock" | "findGift" | "sendGift" | "help"; targetHandle: string };

export class KitchenCommandError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryAfterMs?: number) { super(message); }
}
function fail(code: string, message: string): never { throw new KitchenCommandError(code, message); }
const socialTypes = new Set(["requestFriend", "acceptFriend", "removeFriend", "block", "unblock", "findGift", "sendGift", "help"]);
export const isSocialCommand = (command: KitchenCommand) => socialTypes.has(command.type);

/** Client save receipts are display data. Restore them from the server ledger. */
export function syncDeliveryFromAuthority(record: KitchenRecord): KitchenRecord {
  record.authority.welcomeClaimed = record.authority.welcomeClaimed !== false;
  record.save.delivery = createDelivery(record.authority.dailyClaimDay, record.authority.welcomeClaimed);
  record.authority.truck ??= createTruckAuthority(record.authority.settlement.condition.lastSettledAt);
  record.save.truck = structuredClone(record.authority.truck.progress);
  // Recipes earned from stored mastery become permanent collection entries.
  // Client commands cannot supply levels or unlock receipts.
  record.save.menu.unlocked = availableDishes(record.save).map(dish => dish.id);
  const day = utcKitchenDay(record.authority.settlement.condition.lastSettledAt);
  record.authority.launch = record.authority.launch
    ? sanitizeLaunchProgress(record.authority.launch, day, record.save.layout, shellAt(record.save.shell))
    : createLaunchProgress(day, record.save.layout, shellAt(record.save.shell));
  if (record.authority.settlement.passive) record.authority.launch.passive = structuredClone(record.authority.settlement.passive);
  record.save.launch = structuredClone(record.authority.launch);
  return record;
}

export function initializeKitchen(legacy: unknown | null, now: number): KitchenRecord {
  const save = legacy ? sanitizeSave(legacy) : serializeSave(createWorld("domain-kitchen-starter", SHELL), "trattoria");
  save.savedAt = now;
  if (!legacy) { save.intro = 1; save.onboarding = createOnboarding(false); }
  const condition = { cleanliness: 100, equipment: 100, lastSettledAt: now };
  Object.assign(save, { maintenance: condition });
  return syncDeliveryFromAuthority({
    save, revision: 0,
    authority: {
      version: 1, rulesVersion: RULES.version,
      settlement: { condition, coinRemainder: 0, plateRemainder: 0 },
      verifiedBestQuality: 0, verifiedPlates: 0,
      dailyClaimDay: legacy ? save.delivery.claimedDay : -1,
      welcomeClaimed: !!legacy, guestDesignImported: !!legacy,
      offerDay: utcKitchenDay(now), purchasedOffers: [], serviceRewardDay: -1,
      socialDay: utcKitchenDay(now), socialUsed: 0, socialPairs: {},
      neighbors: {}, repairAt: 0, eligibleMarkets: [], legacyImported: !!legacy,
      launch: createLaunchProgress(utcKitchenDay(now), save.layout, shellAt(save.shell)), careAt: 0,
      truck: createTruckAuthority(now),
    },
  });
}

function creditStock(save: DkSave, id: string, quantity = 1) {
  save.pantry.stock[id] = Math.min(LIMITS.stock, (save.pantry.stock[id] ?? 0) + quantity);
}
function hash(value: string) { let n = 2166136261; for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619); return n >>> 0; }
export function featuredItems(now: number): string[] {
  const day = utcKitchenDay(now);
  return ITEMS.filter((item) => item.collection !== "essentials" && !item.market)
    .sort((a, b) => hash(`${day}:${a.id}`) - hash(`${day}:${b.id}`)).slice(0, 6).map((item) => item.id);
}
export function dailyIngredientOffers(now: number, authority?: AuthorityState) {
  const day = utcKitchenDay(now);
  return [...COMMONS].sort((a, b) => hash(`pantry:${day}:${a}`) - hash(`pantry:${day}:${b}`)).slice(0, 2)
    .map((id) => ({ id, cost: RULES.ingredientOfferCost, quantity: RULES.ingredientOfferQuantity,
      purchased: authority?.offerDay === day && !!authority.purchasedOffers?.includes(id) }));
}
function spend(save: DkSave, coins: number) {
  if (!Number.isSafeInteger(coins) || coins < 0 || save.coins < coins) fail("not_enough_coins", "Save a few more coins for this.");
  save.coins -= coins;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function commitLayout(save: DkSave, layout: DkSave["layout"], design?: unknown): boolean {
  if (!Array.isArray(layout) || layout.length > LIMITS.layout) fail("invalid_layout", "That layout is too large.");
  const cleaned = sanitizeSave({ ...save, layout, design: design ?? save.design });
  if (cleaned.layout.length !== layout.length || cleaned.layout.some((p, i) => {
    const original = layout[i];
    return !original || p.itemId !== original.itemId || p.gx !== original.gx || p.gy !== original.gy || p.facing !== original.facing;
  })) fail("invalid_layout", "One or more placements are invalid.");
  const counts: Record<string, number> = { ...save.inventory };
  for (const p of save.layout) counts[p.itemId] = (counts[p.itemId] ?? 0) + 1;
  for (const p of cleaned.layout) { if (!(counts[p.itemId] > 0)) fail("not_owned", "Buy a furnishing before placing it."); counts[p.itemId]--; }
  const error = validateLayout(shellAt(save.shell), cleaned.layout.map((p, i) => ({ ...p, uid: i + 1 })));
  if (error) fail("blocked_layout", error);
  // Array/key order is not decoration. A committed position, orientation, or
  // finish must actually differ before this tutorial step becomes complete.
  const changed = stable(save.layout.map(stable).sort()) !== stable(cleaned.layout.map(stable).sort()) || stable(save.design) !== stable(cleaned.design);
  save.layout = cleaned.layout; save.inventory = counts; save.design = cleaned.design; save.equipment = cleaned.equipment;
  if (changed) save.onboarding.decorated = true;
  return changed;
}
function settle(record: KitchenRecord, now: number) {
  syncDeliveryFromAuthority(record);
  const launch = record.authority.launch!;
  rollLaunchDay(launch, utcKitchenDay(now), record.save.layout, shellAt(record.save.shell));
  record.save.launch = structuredClone(launch);
  record.authority.rulesVersion = RULES.version;
  const result = settleRestaurant(record.save, record.authority.settlement, now);
  record.authority.settlement = { condition: result.condition, coinRemainder: result.coinRemainder, plateRemainder: result.plateRemainder, passive: result.passive, dishRemainders: result.dishRemainders };
  if (result.passive) launch.passive = structuredClone(result.passive);
  record.save.coins = Math.min(LIMITS.coins, record.save.coins + result.coins);
  if(result.equipment)record.save.equipment=result.equipment;
  record.authority.verifiedPlates += result.plates;
  if (result.plates > 0) record.save.onboarding.served = true;
  const selected = operativeMenuForSave(record.save);
  record.save.menu.selected = selected;
  const servedDishes = Object.entries(result.dishPlates);
  if (servedDishes.length) {
    servedDishes.forEach(([id, count]) => {
      record.save.menu.serves[id] = Math.min(LIMITS.serves, (record.save.menu.serves[id] ?? 0) + count);
      if (dishDef(id)?.domain) record.save.menu.specialServes = Math.min(LIMITS.serves, record.save.menu.specialServes + count);
    });
    record.save.menu.specialMastered ||= record.save.menu.specialServes >= RULES.domainServiceMastery;
  }
  if (result.plates > 0) record.authority.verifiedBestQuality = Math.max(record.authority.verifiedBestQuality, operationalQuality(record.save, result.condition));
  Object.assign(record.save, { maintenance: result.condition });
  const day = utcKitchenDay(now);
  if (record.authority.socialDay !== day) {
    record.authority.socialDay = day; record.authority.socialUsed = 0; record.authority.socialPairs = {};
  }
  if (record.save.utcDay !== day) {
    record.save.utcDay = day;
    record.save.daily = { idx: day % DAILY_SPECIALS.length, prepped: false, served: 0, potPaid: false, firstServePaid: false, plates: 0, greeted: false, goalPlatesPaid: false, goalSpecialPaid: false, goalGreetPaid: false };
  }
  record.save.daily.plates += result.plates;
  if (record.save.daily.prepped) record.save.daily.served += result.plates;
  recordLaunchActivity(launch, "serve", result.plates);
  // Legacy prepped flags may have been client-provided. Only a preparation
  // recorded in this server-owned daily ledger can qualify the new goal.
  if (record.save.daily.prepped && launch.counts.prep > 0) recordLaunchActivity(launch, "special", result.plates);
  if (record.authority.offerDay !== day) { record.authority.offerDay = day; record.authority.purchasedOffers = []; }
  // Rare ingredients now come from the once-daily active shift receipt.
  record.save.savedAt = now;
  record.save.launch = structuredClone(launch);
}

/** Source independent recipient cap: six gifts across ALL partners and social verbs. */
function socialIngredient(recipient: KitchenRecord, recipientId: string, sourceId: string, verb: string, now: number) {
  const a = recipient.authority;
  const pair = `${verb}:${sourceId}`;
  if (a.socialPairs[pair]) fail("already_claimed", "This parcel has already been collected today.");
  if (a.socialUsed >= RULES.socialIngredientsPerDay) fail("daily_limit", "Your six social ingredients are collected for today. Visit again tomorrow.");
  a.socialPairs[pair] = true;
  a.socialUsed++;
  creditStock(recipient.save, COMMONS[hash(`${utcKitchenDay(now)}:${recipientId}:${a.socialUsed}`) % COMMONS.length]);
}

export function applyKitchenCommand(current: KitchenRecord, command: KitchenCommand, now: number, actorId: string,
  targetInput?: { id: string; record: KitchenRecord }): { actor: KitchenRecord; target?: KitchenRecord } {
  if (!command || typeof command !== "object" || typeof command.type !== "string") fail("invalid_command", "Choose a kitchen action.");
  if (!Number.isSafeInteger(now) || now < 0 || now < current.authority.settlement.condition.lastSettledAt || (targetInput && now < targetInput.record.authority.settlement.condition.lastSettledAt)) fail("invalid_time", "The restaurant clock is catching up. Please try again shortly.");
  const actor = structuredClone(current);
  const target = targetInput ? structuredClone(targetInput.record) : undefined;
  settle(actor, now);
  const save = actor.save;
  if (isSocialCommand(command)) {
    if (!target || !targetInput || targetInput.id === actorId) fail("invalid_neighbor", "Choose another restaurant.");
    settle(target, now);
    const targetId = targetInput.id;
    const status = actor.authority.neighbors[targetId];
    const reverse = target.authority.neighbors[actorId];
    if (command.type === "block") {
      actor.authority.neighbors[targetId] = "blocked";
      if (reverse !== "blocked") delete target.authority.neighbors[actorId];
    } else if (command.type === "unblock") {
      if (status === "blocked") delete actor.authority.neighbors[targetId];
    } else {
      if (status === "blocked" || reverse === "blocked") fail("unavailable_neighbor", "This restaurant is unavailable.");
      if (command.type === "requestFriend") {
        if (status) fail("already_connected", "A connection or request already exists.");
        if (Object.keys(actor.authority.neighbors).length >= RULES.friendsMax || Object.keys(target.authority.neighbors).length >= RULES.friendsMax) fail("neighbor_limit", "This neighborhood is full.");
        actor.authority.neighbors[targetId] = "outgoing"; target.authority.neighbors[actorId] = "incoming";
      } else if (command.type === "acceptFriend") {
        if (status !== "incoming" || reverse !== "outgoing") fail("missing_request", "That invitation is no longer available.");
        actor.authority.neighbors[targetId] = "friend"; target.authority.neighbors[actorId] = "friend";
      } else if (command.type === "removeFriend") {
        delete actor.authority.neighbors[targetId]; delete target.authority.neighbors[actorId];
      } else {
        if (status !== "friend" || reverse !== "friend") fail("friends_only", "Become neighbors to share parcels and help.");
        if (command.type === "findGift") socialIngredient(actor, actorId, targetId, "find", now);
        if (command.type === "sendGift") socialIngredient(target, targetId, actorId, "gift", now);
        if (command.type === "help") {
          const pair = `help:${targetId}`;
          if (actor.authority.socialPairs[pair]) fail("already_helped", "You have already helped this restaurant today.");
          const condition = target.authority.settlement.condition;
          if (condition.cleanliness >= 100 && condition.equipment >= 100) fail("no_help_needed", "This restaurant is already sparkling.");
          actor.authority.socialPairs[pair] = true;
          condition.cleanliness = Math.min(100, condition.cleanliness + RULES.helpAmount);
          condition.equipment = Math.min(100, condition.equipment + RULES.helpAmount);
          Object.assign(target.save, { maintenance: condition });
        }
      }
    }
  } else switch (command.type) {
    case "settle": break;
    // Event commands require the server-only verified event registry. The
    // generic reducer cannot be used to bypass those admission/funding gates.
    case "truckEvent": fail("event_unavailable", "No verified, funded truck event is open.");
    case "truck":
    case "truckBatch": {
      try {
        const result = replayTruck(actor.authority.truck!, command.type === "truck" ? [command.action] : command.actions, now,
          { coins: save.coins, recipeLevels: save.pantry.levels, seed: `${actorId}:${actor.authority.truck!.progress.attempts + 1}`, runId: `${actorId}:${actor.revision + 1}` });
        actor.authority.truck = result.authority;
        save.truck = structuredClone(result.authority.progress);
        save.coins = Math.min(LIMITS.coins, save.coins + result.coinDelta);
        for (const [id, amount] of Object.entries(result.homeGrants)) {
          if (!itemDef(id)) fail("invalid_truck_reward", "That truck furnishing is unavailable.");
          save.inventory[id] = Math.min(LIMITS.perItem, (save.inventory[id] ?? 0) + amount);
        }
        for (const [id, amount] of Object.entries(result.stockGrants)) creditStock(save, id, amount);
      } catch (error) {
        if (error instanceof TruckAuthorityError) throw new KitchenCommandError(error.code, error.message, error.status, error.retryAfterMs || undefined);
        throw error;
      }
      break;
    }
    case "purchase": {
      const item = itemDef(command.itemId);
      if (!item) fail("unknown_item", "That furnishing is unavailable.");
      if(item.machine&&item.machine!=="stove"&&!save.truck.unlockedMachineIds.includes(item.machine))fail("truck_discovery_needed","Discover this machine on your food truck first.");
      if (item.market && !actor.authority.eligibleMarkets.includes(item.market)) fail("collection_locked", "This domain collection has not been unlocked by the server.");
      if (item.collection !== "essentials" && !item.market && !featuredItems(now).includes(item.id)) fail("not_in_shop", "That piece will return in a featured collection.");
      if ((save.inventory[item.id] ?? 0) >= LIMITS.perItem) fail("inventory_full", "You already own the maximum stored quantity.");
      spend(save, item.cost); save.inventory[item.id] = (save.inventory[item.id] ?? 0) + 1; break;
    }
    case "purchaseIngredient": {
      const offer = dailyIngredientOffers(now, actor.authority).find((entry) => entry.id === command.ingredientId);
      if (!offer) fail("offer_unavailable", "That ingredient is not featured today.");
      if (offer.purchased) fail("already_purchased", "Today's offer is already in your pantry.");
      if ((save.pantry.stock[offer.id] ?? 0) > LIMITS.stock - offer.quantity) fail("pantry_full", "Make some room in your pantry first.");
      spend(save, offer.cost); creditStock(save, offer.id, offer.quantity); actor.authority.purchasedOffers.push(offer.id); break;
    }
    case "sell": {
      const item = itemDef(command.itemId);
      if (!item || (save.inventory[item.id] ?? 0) < 1) fail("not_owned", "Store this furnishing before selling it.");
      save.inventory[item.id]--; sellStoredEquipment(save.equipment,save.layout,item.id); save.coins = Math.min(LIMITS.coins, save.coins + Math.floor(item.cost / 2)); break;
    }
    case "upgradeDish": {
      if (!availableDishes(save).some((dish) => dish.id === command.dishId)) fail("dish_locked", "Unlock this dish in your domain cookbook first.");
      const recipe = nextRecipe(command.dishId, save.pantry.levels[command.dishId] ?? 1);
      if (!recipe) fail("no_upgrade", "That dish is already mastered or unavailable.");
      for (const [id, n] of Object.entries(recipe)) if ((save.pantry.stock[id] ?? 0) < n) fail("ingredients_needed", "Collect the remaining ingredients first.");
      for (const [id, n] of Object.entries(recipe)) save.pantry.stock[id] -= n;
      save.pantry.levels[command.dishId] = (save.pantry.levels[command.dishId] ?? 1) + 1;
      if (save.onboarding.goalDishId === command.dishId) save.onboarding.upgraded = true;
      recordLaunchActivity(actor.authority.launch!, "upgrade");
      break;
    }
    case "claimDaily": {
      const day = utcKitchenDay(now);
      if (actor.authority.dailyClaimDay >= day) fail("already_claimed", "Today's delivery is already in your pantry.");
      actor.authority.dailyClaimDay = day;
      if (actor.authority.welcomeClaimed === false) {
        for (const [id, quantity] of Object.entries(welcomeIngredientBundle())) creditStock(save, id, quantity);
        actor.authority.welcomeClaimed = true;
      }
      for (const [id, quantity] of Object.entries(deliveryContents(day))) creditStock(save, id, quantity);
      syncDeliveryFromAuthority(actor);
      break;
    }
    case "repairMachine": {
      const machine=save.equipment.instances[String(command.uid)];
      if(!machine||!save.layout.some(p=>p.uid===command.uid)||machine.condition>=100)fail("no_help_needed","That machine does not need a repair.");
      if(now-actor.authority.repairAt<RULES.repairCooldownMs)fail("repair_cooldown","Give the crew a moment to finish this repair.");
      actor.authority.repairAt=now;machine.condition=100;break;
    }
    case "repair": {
      // Compatibility for incidental room repairs. This never advances a
      // daily care job or earns its rewards; those require the issued task ID.
      if (now - actor.authority.repairAt < RULES.repairCooldownMs) fail("repair_cooldown", "Give the crew a moment to finish this repair.");
      const condition = actor.authority.settlement.condition;
      if (condition.cleanliness >= 100 && condition.equipment >= 100) fail("no_help_needed", "Your restaurant is already sparkling.");
      actor.authority.repairAt = now;
      condition.cleanliness = Math.min(100, condition.cleanliness + RULES.repairAmount);
      condition.equipment = Math.min(100, condition.equipment + RULES.repairAmount);
      save.maintenance = { ...condition };
      break;
    }
    case "careTask": {
      const progress = actor.authority.launch!;
      const task = progress.careTasks.find(entry => entry.id === command.taskId);
      if (!task || task.progress >= task.steps) fail("task_unavailable", "That care job is already finished or no longer available.");
      if (now - (actor.authority.careAt ?? 0) < RULES.careStepCooldownMs) fail("care_cooldown", "Give this step a moment to finish.");
      const target = task.target, room = shellAt(save.shell);
      const inRoom = Number.isInteger(target.gx) && Number.isInteger(target.gy) && target.gx >= 0 && target.gy >= 0 && target.gx < room.w && target.gy < room.h;
      const exists = target.kind === "floor" || save.layout.some(piece => piece.itemId === target.itemId && piece.gx === target.gx && piece.gy === target.gy && itemDef(piece.itemId)?.kind === target.kind);
      if (!inRoom || !exists) fail("task_unavailable", "That furnishing moved. Refresh your care jobs.");
      const completed = advanceCareTask(progress, command.taskId);
      if (!completed) fail("task_unavailable", "That care job is no longer available.");
      actor.authority.careAt = now;
      if (completed.done) {
        const condition = actor.authority.settlement.condition;
        const key = task.kind === "repair" ? "equipment" : "cleanliness";
        const allDone = progress.careTasks.filter(entry => entry.kind === task.kind).every(entry => entry.progress >= entry.steps);
        condition[key] = allDone ? 100 : Math.min(100, condition[key] + RULES.repairAmount);
        save.maintenance = { ...condition };
      }
      break;
    }
    case "claimDailyGoal": {
      const progress = actor.authority.launch!;
      const goal = dailyGoals(progress).find(entry => entry.id === command.goalId);
      if (!goal) fail("unknown_goal", "Choose a goal from today's board.");
      if (goal.claimed) fail("already_claimed", "That daily reward is already collected.");
      const reward = claimLaunchGoal(progress, command.goalId);
      if (!reward) fail("goal_incomplete", "Finish this goal before collecting its reward.");
      save.coins = Math.min(LIMITS.coins, save.coins + reward.coins);
      for (const [id, quantity] of Object.entries(reward.stock)) creditStock(save, id, quantity);
      break;
    }
    case "layout": {
      if (commitLayout(save, command.layout, command.design)) {
        actor.authority.guestDesignImported = true;
        recordLaunchActivity(actor.authority.launch!, "decorate");
      }
      syncCareTasks(actor.authority.launch!, save.layout, shellAt(save.shell));
      break;
    }
    case "appearance": {
      const appearance = command.appearance && typeof command.appearance === "object" ? command.appearance : {};
      const cleaned = sanitizeSave({ ...save, name: appearance.name ?? save.name, theme: appearance.theme ?? save.theme, crew: appearance.crew ?? save.crew, intro: appearance.intro ?? save.intro, market: appearance.market ?? save.market, design: command.design ?? (save as DkSave & { design?: unknown }).design });
      save.name = cleaned.name; save.theme = cleaned.theme; save.crew = cleaned.crew; save.intro = cleaned.intro; save.market = cleaned.market;
      const incoming = appearance.onboarding;
      if (incoming && typeof incoming === "object") {
        const allowed = availableDishes(save).map((dish) => dish.id);
        if (incoming.goalDishId !== undefined && incoming.goalDishId !== null && !allowed.includes(incoming.goalDishId)) fail("invalid_goal", "Choose a dish available in your cookbook.");
        const progress = sanitizeOnboarding({ ...save.onboarding,
          served: save.onboarding.served || incoming.served === true,
          finished: save.onboarding.finished || incoming.finished === true,
          goalDishId: incoming.goalDishId === undefined ? save.onboarding.goalDishId : incoming.goalDishId,
        }, { allowedDishIds: allowed });
        // These are cosmetic guide markers, never evidence for an ingredient
        // claim or score. Decorating/upgrading only change through server actions.
        save.onboarding = { ...progress, decorated: save.onboarding.decorated,
          // Existing server-stored mastery also satisfies a newly chosen goal;
          // a mastered dish cannot perform another upgrade to finish the guide.
          upgraded: progress.goalDishId !== null && (save.pantry.levels[progress.goalDishId] ?? 1) > 1 };
      }
      Object.assign(save, { design: (cleaned as DkSave & { design?: unknown }).design }); break;
    }
    case "adoptGuestDesign": {
      if (actor.authority.guestDesignImported !== false) fail("design_import_unavailable", "This restaurant already has an established room design.");
      if (commitLayout(save, command.layout, command.design)) recordLaunchActivity(actor.authority.launch!, "decorate");
      syncCareTasks(actor.authority.launch!, save.layout, shellAt(save.shell));
      const appearance = command.appearance && typeof command.appearance === "object" ? command.appearance : {};
      const cleaned = sanitizeSave({ ...save, name: appearance.name ?? save.name, theme: appearance.theme ?? save.theme, crew: appearance.crew ?? save.crew });
      save.name = cleaned.name; save.theme = cleaned.theme; save.crew = cleaned.crew;
      actor.authority.guestDesignImported = true;
      break;
    }
    case "hire": {
      if (command.hire !== "chef" && command.hire !== "waiter") fail("unknown_hire", "Choose a chef or waiter.");
      const key = command.hire === "chef" ? "chefs" : "waiters";
      const config = HIRE_SHOP[command.hire];
      if (save[key] >= config.max) fail("crew_full", "Your crew is already complete.");
      spend(save, config.costs[save[key]]); save[key]++; break;
    }
    case "expand": {
      const shell = SHELL_SIZES[save.shell + 1];
      if (!shell) fail("largest_room", "You already have the largest restaurant.");
      const requirements = expansionRequirements(save.shell, save.pantry.levels, save.coins);
      if (!requirements?.allowed) fail("expansion_locked", "Complete the recipe milestones and save the coins shown for this expansion.");
      spend(save, requirements.coins); save.shell++;
      syncCareTasks(actor.authority.launch!, save.layout, shellAt(save.shell));
      break;
    }
    case "prepSpecial": {
      if (save.daily.prepped) fail("already_prepped", "Today's special is ready.");
      const recipe = DAILY_SPECIALS[save.daily.idx]?.needs;
      if (!recipe) fail("no_special", "Today's special is unavailable.");
      for (const [id, n] of Object.entries(recipe)) if ((save.pantry.stock[id] ?? 0) < n) fail("ingredients_needed", "Collect the remaining ingredients first.");
      for (const [id, n] of Object.entries(recipe)) save.pantry.stock[id] -= n;
      save.daily.prepped = true;
      recordLaunchActivity(actor.authority.launch!, "prep");
      break;
    }
    case "selectMenu": {
      const available = new Set(availableDishes(save).map((dish) => dish.id));
      if (!Array.isArray(command.dishes) || command.dishes.length < 1 || command.dishes.length > 4 || new Set(command.dishes).size !== command.dishes.length || command.dishes.some((id) => !available.has(id))) fail("invalid_menu", "Choose one to four different dishes from your cookbook.");
      Object.assign(save.menu, { selected: command.dishes }); break;
    }
    case "completeCourse": {
      if (!COURSES.some((course) => course.id === command.id)) fail("unknown_course", "That lesson is unavailable.");
      if (save.courses.includes(command.id)) fail("already_completed", "That lesson is already complete.");
      save.courses.push(command.id); break;
    }
    default: fail("invalid_command", "That kitchen action is unavailable.");
  }
  save.menu.unlocked = availableDishes(save).map(dish => dish.id);
  actor.save.launch = structuredClone(actor.authority.launch!);
  if (target?.authority.launch) target.save.launch = structuredClone(target.authority.launch);
  actor.revision++;
  if (target) target.revision++;
  return { actor, target };
}

export function publicAuthority(record: KitchenRecord, now: number) {
  return {
    rulesVersion: record.authority.rulesVersion,
    maintenance: record.authority.settlement.condition,
    currentQuality: operationalQuality(record.save, record.authority.settlement.condition),
    verifiedBestQuality: record.authority.verifiedBestQuality,
    dailyClaimed: record.authority.dailyClaimDay === utcKitchenDay(now),
    welcomeClaimed: record.authority.welcomeClaimed !== false,
    canImportGuestDesign: record.authority.guestDesignImported === false,
    socialRemaining: Math.max(0, RULES.socialIngredientsPerDay - (record.authority.socialDay === utcKitchenDay(now) ? record.authority.socialUsed : 0)),
    legacyImported: record.authority.legacyImported,
    eligibleMarkets: [...record.authority.eligibleMarkets],
    truckClock: record.authority.truck ? { ...record.authority.truck.clock, creditTicks: Math.floor(record.authority.truck.clock.creditMs / 50) } : null,
  };
}
