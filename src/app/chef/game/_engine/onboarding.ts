/** Presentation milestones and parcel receipts. These never enter WorldState. */
import { dishDef, STARTER_DISH_IDS } from "./cookbook";
import { COMMONS, nextRecipe } from "./pantry";
import { MAX_BANKED_DAYS, utcDayOf } from "./wallclock";
import type { DkSave } from "./save";

export interface OnboardingState {
  version: 1;
  served: boolean;
  decorated: boolean;
  goalDishId: string | null;
  upgraded: boolean;
  finished: boolean;
}
export interface DeliveryState { claimedDay: number; welcomeClaimed: boolean }
export interface OnboardingMetadata { onboarding: OnboardingState; delivery: DeliveryState }
export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6;
export const WELCOME_DISH_ID = "margherita";
export const DAILY_PARCEL_INGREDIENTS = 3;
export const DELIVERY_STOCK_LIMIT = 999;
export const DELIVERY_DAY_LIMIT = 100_000;

export function createOnboarding(finished = false): OnboardingState {
  return { version: 1, served: false, decorated: false, goalDishId: null, upgraded: false, finished };
}
export function createDelivery(claimedDay = -1, welcomeClaimed = false): DeliveryState {
  return { claimedDay, welcomeClaimed };
}
export function onboardingStep(state: OnboardingState, delivery: DeliveryState): OnboardingStep {
  if (state.finished) return 6;
  if (!state.served) return 1;
  if (!state.decorated) return 2;
  if (!delivery.welcomeClaimed) return 3;
  if (!state.goalDishId || !state.upgraded) return 4;
  return 5;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function sanitizeOnboarding(value: unknown, options: {
  intro?: number;
  savedAt?: number;
  allowedDishIds?: readonly string[];
  levels?: Record<string, number>;
} = {}): OnboardingState {
  const source = record(value);
  if (!source || source.version !== 1) {
    const intro = options.intro ?? 0;
    const finished = intro >= 6 || (intro === 0 && (options.savedAt ?? 0) > 0);
    return { ...createOnboarding(finished), served: intro >= 3 && intro < 6, decorated: intro >= 4 && intro < 6 };
  }
  const allowed = options.allowedDishIds ?? STARTER_DISH_IDS;
  const goalDishId = typeof source.goalDishId === "string" && dishDef(source.goalDishId) && allowed.includes(source.goalDishId)
    ? source.goalDishId : null;
  return {
    version: 1,
    served: source.served === true,
    decorated: source.decorated === true,
    goalDishId,
    upgraded: source.upgraded === true && goalDishId !== null && (!options.levels || (options.levels[goalDishId] ?? 1) > 1),
    finished: source.finished === true,
  };
}

export function sanitizeDelivery(value: unknown, options: { existing?: boolean; utcDay?: number } = {}): DeliveryState {
  const source = record(value);
  const oldDay = typeof options.utcDay === "number" && Number.isFinite(options.utcDay) ? options.utcDay : 0;
  const legacyDay = options.existing ? Math.max(0, Math.min(DELIVERY_DAY_LIMIT, Math.floor(oldDay))) : -1;
  const rawDay = source?.claimedDay;
  return {
    claimedDay: typeof rawDay === "number" && Number.isFinite(rawDay)
      ? Math.max(-1, Math.min(DELIVERY_DAY_LIMIT, Math.floor(rawDay))) : legacyDay,
    welcomeClaimed: typeof source?.welcomeClaimed === "boolean" ? source.welcomeClaimed : !!options.existing,
  };
}

/** A fresh object each time; enough for the first upgrade of one kitchen classic. */
export function welcomeIngredientBundle(): Record<string, number> {
  return { ...(nextRecipe(WELCOME_DISH_ID, 1) ?? {}) };
}
function hash(value: string): number {
  let n = 2166136261;
  for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return n >>> 0;
}
/** Shared guest/server daily contents: three commons, deterministic by UTC day. */
export function deliveryContents(day: number): Record<string, number> {
  if (!Number.isInteger(day) || day < 0 || day > DELIVERY_DAY_LIMIT) return {};
  const contents: Record<string, number> = {};
  for (let i = 0; i < DAILY_PARCEL_INGREDIENTS; i++) {
    const id = COMMONS[hash(`${day}:delivery:${i}`) % COMMONS.length];
    contents[id] = (contents[id] ?? 0) + 1;
  }
  return contents;
}

/** Guest-only receipt handling. Connected rewards must use server commands. */
export function claimGuestDelivery(save: DkSave, now: number): DkSave | null {
  if (!Number.isFinite(now) || now < 0) return null;
  const day = utcDayOf(now);
  if (day > DELIVERY_DAY_LIMIT || day < save.delivery.claimedDay) return null;
  if (day === save.delivery.claimedDay && save.delivery.welcomeClaimed) return null;
  const claimed = structuredClone(save);
  const add = (contents: Record<string, number>) => {
    for (const [id, count] of Object.entries(contents)) {
      claimed.pantry.stock[id] = Math.min(DELIVERY_STOCK_LIMIT, (claimed.pantry.stock[id] ?? 0) + count);
    }
  };
  if (!save.delivery.welcomeClaimed) add(welcomeIngredientBundle());
  // Fresh accounts receive today only. Returning kitchens bank at most three days.
  const firstDay = save.delivery.claimedDay < 0 ? day : Math.max(save.delivery.claimedDay + 1, day - MAX_BANKED_DAYS + 1);
  for (let due = firstDay; due <= day; due++) add(deliveryContents(due));
  claimed.delivery = { claimedDay: day, welcomeClaimed: true };
  claimed.savedAt = Math.max(save.savedAt, now);
  return claimed;
}
