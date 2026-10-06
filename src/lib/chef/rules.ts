import { DAILY_PARCEL_INGREDIENTS } from "../../app/chef/game/_engine/onboarding";
import { LAUNCH_RULES } from "../../app/chef/game/_engine/launch-progression";

/** Versioned restaurant rules. These are gameplay defaults, never token payouts. */
export const KITCHEN_RULES = {
  version: LAUNCH_RULES.version,
  offlineHours: LAUNCH_RULES.passiveHours,
  settlementStepMs: 60_000,
  passiveFullCapacity: 40,
  platesPerSeatHour: 12,
  platesPerChefHour: 50,
  platesPerWaiterHour: 42,
  dirtPerHour: 7,
  wearPerHour: 3,
  conditionFloor: 20,
  dailyIngredients: DAILY_PARCEL_INGREDIENTS,
  ingredientOfferCost: 30,
  ingredientOfferQuantity: 2,
  domainServiceMastery: 15,
  socialIngredientsPerDay: 6,
  friendsMax: 100,
  repairAmount: 25,
  repairCooldownMs: 10_000,
  careStepCooldownMs: LAUNCH_RULES.careStepCooldownMs,
  helpAmount: 20,
  maxCommandBytes: 32_000,
} as const;

export const utcKitchenDay = (time: number) => Math.floor(time / 86_400_000);
