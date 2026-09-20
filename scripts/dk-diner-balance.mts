/** Reproducible preview tuning samples. No network, credentials, or saved games. */
import { createDiner, DINER_RULES, dinerRates, homeSimulationConfig, validateDinerHome } from "../src/lib/chef/diner/progression";
import { EQUIPMENT_BY_ID, RECIPES } from "../src/lib/chef/diner/content";
import assert from "node:assert/strict";
const now = Date.UTC(2026, 8, 20, 8);
const samples = [1, 5, 10, 20, 30].map(level => {
  const state = createDiner(now, "balance-sample"); state.restaurantLevel = level;
  const mastery = level === 1 ? 0 : level <= 5 ? 1 : level <= 10 ? 3 : level <= 20 ? 6 : 10;
  state.recipes.classic_burger.level = mastery;
  const tier = level >= 12 ? 3 : level >= 5 ? 2 : 1;
  for (const id of ["grill", "prep", "sink"]) state.equipment[id].tier = tier;
  const tables = level >= 20 ? 3 : level >= 5 ? 2 : 1;
  state.equipment.table_2.homeCopies = tables;
  for (let index = 1; index < tables; index++) state.home.layout.push({ id: `extra-table-${index}`, equipmentId: "table_2", x: 2 + index * 2, y: 3, rotation: 0 });
  state.home.staff.chefs = state.home.staff.waiters = level >= 20 ? 3 : level >= 5 ? 2 : 1;
  assert.equal(validateDinerHome(state, state.home.layout), null);
  const rate = dinerRates(state), config = homeSimulationConfig(state);
  return { level, mastery, tables, chefs: config.chefs, waiters: config.waiters, arrivalsPerHour: +config.arrivalRate.toFixed(1), platesPerHour: +rate.plates.toFixed(1), coinsPerHour: +rate.coins.toFixed(1), reputationPerHour: +rate.reputation.toFixed(1), oneFullTill: Math.floor(rate.coins * DINER_RULES.tillHours * DINER_RULES.offlineMultiplier), twoFullTills: Math.floor(rate.coins * DINER_RULES.tillHours * DINER_RULES.offlineMultiplier * 2), bottleneck: rate.bottleneck, grillCopy: EQUIPMENT_BY_ID.grill.tiers[tier - 1].price * DINER_RULES.homeEquipmentMultiplier };
});
const ingredientUnits = RECIPES.reduce((total, recipe) => total + recipe.ingredients.length * DINER_RULES.maxDishLevel, 0);
console.table(samples);
console.log(JSON.stringify({ ingredientUnits, idealDaysAtFive: ingredientUnits / 5, idealDaysAtSeven: ingredientUnits / 7, note: "Ingredient days are theoretical lower bounds before recipe discovery and uneven pantry stock. Rows compare an explicit burger-room fixture, not promised player outcomes. Daily earnings exclude truck haul and incidents." }, null, 2));
