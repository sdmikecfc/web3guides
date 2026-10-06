import { createWorld, validateLayout } from "../../app/chef/game/_engine/world";
import { shellAt } from "../../app/chef/game/_engine/rooms";
import { dishQualityBonus } from "../../app/chef/game/_engine/pantry";
import { itemDef } from "../../app/chef/game/_engine/items";
import { dishDef } from "../../app/chef/game/_engine/cookbook";
import { sanitizeEquipment, homeTechnology, EQUIPMENT_RULES, type EquipmentState } from "../../app/chef/game/_engine/equipment";
import type { DkSave } from "../../app/chef/game/_engine/save";
import { accruePassiveCoins, dishEarningsMultiplier, sanitizeLaunchProgress, type LaunchProgress } from "../../app/chef/game/_engine/launch-progression";
import { KITCHEN_RULES as RULES } from "./rules";

export interface KitchenCondition {
  cleanliness: number;
  equipment: number;
  lastSettledAt: number;
}

/** Fractional carry prevents short settlement requests from creating or losing coins. */
export interface SettlementState {
  condition: KitchenCondition;
  coinRemainder: number;
  plateRemainder: number;
  /** Return-state carry also makes standalone repeated settlements obey the purse. */
  passive?: LaunchProgress["passive"];
  equipment?: EquipmentState;
  /** Fractions belong to the dish actually produced, including before a break. */
  dishRemainders?: Record<string, number>;
}

export function capacityFor(save: DkSave): number {
  const room = shellAt(save.shell);
  const layout = save.layout.map((p, i) => ({ ...p, uid: p.uid ?? i + 1 }));
  if (validateLayout(room, layout)) return 0;
  if (!save.layout.some((p) => itemDef(p.itemId)?.kind === "counter")) return 0;
  const world = createWorld("server-capacity", room, { layout, equipment:save.equipment,truck:save.truck,pantry:save.pantry,menu:save.menu,hires: { chefs: save.chefs, waiters: save.waiters } });
  // Shortest open walking paths from the pass to the table service positions.
  const distances = new Int16Array(room.w * room.h).fill(-1);
  const start = world.passAnchor.y * room.w + world.passAnchor.x;
  const queue = [start]; distances[start] = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor], x = current % room.w, y = Math.floor(current / room.w);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= room.w || ny >= room.h) continue;
      const i = ny * room.w + nx;
      if (distances[i] >= 0 || world.grid.cells[i] !== 0) continue;
      distances[i] = distances[current] + 1; queue.push(i);
    }
  }
  const pathLengths = world.seats.map((seat) => distances[seat.serveY * room.w + seat.serveX]);
  if (pathLengths.some((distance) => distance < 0) || !pathLengths.length) return 0;
  const averagePath = pathLengths.reduce((n, d) => n + d, 0) / pathLengths.length;
  const travelFactor = 1 / (1 + Math.max(0, averagePath - 3) * 0.06);
  const menu = world.operations.menu;
  if (!menu.length) return 0;
  const mastery = menu.reduce((sum, id) => sum + Math.max(0, (save.pantry.levels[id] ?? 1) - 1), 0) / menu.length;
  const technology = homeTechnology(save.truck.techLevels);
  return Math.min(
    world.seats.length * RULES.platesPerSeatHour,
    Math.min(world.operations.stations.length, save.chefs) * RULES.platesPerChefHour * technology.cook,
    save.waiters * RULES.platesPerWaiterHour * travelFactor * technology.service,
  ) * (1 + mastery * 0.06);
}

export function operativeMenuForSave(save:DkSave):string[] {
  const world=createWorld("server-menu",shellAt(save.shell),{layout:save.layout,equipment:save.equipment,truck:save.truck,pantry:save.pantry,menu:save.menu,inventory:save.inventory});
  return world.operations.menu;
}

export function operationalQuality(save: DkSave, condition: KitchenCondition): number {
  const kitchenWorks = capacityFor(save) > 0;
  const upkeep = (condition.cleanliness + condition.equipment) / 200;
  return Math.round(Math.max(RULES.conditionFloor, Math.min(100,
    (kitchenWorks ? 45 : 20) + 25 * upkeep + dishQualityBonus(save.pantry.levels),
  )));
}

/** Server time only. Bounded analytic steps charge maintenance against working capacity. */
export function settleRestaurant(save: DkSave, previous: SettlementState, now: number) {
  const state: SettlementState = structuredClone(previous);
  const equipment=sanitizeEquipment(previous.equipment??save.equipment);
  state.equipment=equipment;
  const workingSave={...save,equipment};
  const producedMenu=new Set<string>();
  const dishRemainders: Record<string, number> = {};
  for (const [id, value] of Object.entries(previous.dishRemainders ?? {})) if (dishDef(id) && Number.isFinite(value) && value >= 0 && value < 1) dishRemainders[id] = value;
  const dishPlates: Record<string, number> = {};
  state.dishRemainders = dishRemainders;
  const start = state.condition.lastSettledAt;
  if (!Number.isFinite(now) || now <= start) return { ...state, coins: 0, plates: 0, elapsedMs: 0, producedMenu:[] as string[], dishPlates };
  const elapsedMs = Math.min(now - start, RULES.offlineHours * 3_600_000);
  const progress = sanitizeLaunchProgress(save.launch, Math.floor(now / 86_400_000), save.layout, shellAt(save.shell));
  if (state.passive) progress.passive = structuredClone(state.passive);
  let coins = 0, creditedMs = 0;
  let capacity = capacityFor(workingSave);
  let operations=createWorld("server-equipment",shellAt(save.shell),{layout:save.layout,equipment,truck:save.truck,pantry:save.pantry,menu:save.menu}).operations;
  let remaining = elapsedMs;
  let plateFloat = state.plateRemainder;
  while (remaining > 0) {
    if (capacity <= 0) break;
    // A portion of staff time goes to upkeep. More staff help, but cannot erase neglect.
    const cleaningCapacity = Math.max(0, Math.min(0.4, (save.waiters + save.chefs - 2) * 0.1));
    const dirt = state.condition.cleanliness > RULES.conditionFloor ? RULES.dirtPerHour * (1 - cleaningCapacity) : 0;
    const wear = state.condition.equipment > RULES.conditionFloor ? RULES.wearPerHour : 0;
    // Split at condition floors, then integrate the quadratic throughput exactly.
    // A midpoint approximation otherwise changes wear when callers settle the
    // same absence in shorter requests.
    let hours = Math.min(remaining, RULES.settlementStepMs) / 3_600_000;
    const segmentAt = now - elapsedMs + creditedMs;
    const nextDayAt = (Math.floor(segmentAt / 86_400_000) + 1) * 86_400_000;
    hours = Math.min(hours, (nextDayAt - segmentAt) / 3_600_000);
    if (dirt > 0) hours = Math.min(hours, (state.condition.cleanliness - RULES.conditionFloor) / dirt);
    if (wear > 0) hours = Math.min(hours, (state.condition.equipment - RULES.conditionFloor) / wear);
    const average = (state.condition.cleanliness + state.condition.equipment) / 200;
    const decline = (dirt + wear) / 200, staffFactor = 0.82 - cleaningCapacity * 0.1;
    const producedIn = (h: number) => capacity * (
      (staffFactor * average + 0.18 * average * average) * h
      - decline * (staffFactor + 0.36 * average) * h * h / 2
      + 0.18 * decline * decline * h * h * h / 3
    );
    const potential = producedIn(hours);
    const stations=operations.stations.filter(s=>s.dishes.length>0);
    // Stop at the exact first break, rather than discarding the unused portion
    // of a minute. Other machines can keep working for that remaining time.
    const untilBreak=stations.length?Math.min(...stations.map(s=>equipment.instances[String(s.uid)]?.condition??100))*stations.length/EQUIPMENT_RULES.wearPerPlate:0;
    if (potential > untilBreak) {
      let low = 0, high = hours;
      for (let iteration = 0; iteration < 48; iteration++) { const middle = (low + high) / 2; if (producedIn(middle) < untilBreak) low = middle; else high = middle; }
      hours = (low + high) / 2;
    }
    const plates=Math.min(potential,untilBreak);
    // Integrate the hourly earning ceiling at the moment it is crossed. Capping
    // an entire absence's average would pay differently from frequent saves.
    const rateAt = (h: number) => { const quality = average - decline * h; return capacity * (staffFactor * quality + 0.18 * quality * quality); };
    let productiveHours: number;
    if (rateAt(0) <= RULES.passiveFullCapacity) productiveHours = plates / RULES.passiveFullCapacity;
    else if (rateAt(hours) >= RULES.passiveFullCapacity) productiveHours = hours;
    else {
      let low = 0, high = hours;
      for (let iteration = 0; iteration < 48; iteration++) { const middle = (low + high) / 2; if (rateAt(middle) > RULES.passiveFullCapacity) low = middle; else high = middle; }
      const crossedAt = (low + high) / 2;
      productiveHours = crossedAt + (plates - producedIn(crossedAt)) / RULES.passiveFullCapacity;
    }
    const multiplier = stations.length ? stations.reduce((total, station) => total + dishEarningsMultiplier(save.pantry.levels, station.dishes), 0) / stations.length : 1;
    const stepMs = hours * 3_600_000;
    creditedMs += stepMs;
    coins += accruePassiveCoins(progress, stepMs, now - elapsedMs + creditedMs, hours > 0 ? productiveHours / hours : 0, multiplier);
    if(plates>0){
      operations.menu.forEach(id=>producedMenu.add(id));
      for(const station of stations){
        const stationPlates = plates / stations.length;
        const instance=equipment.instances[String(station.uid)];if(instance)instance.condition=Math.max(0,instance.condition-stationPlates*EQUIPMENT_RULES.wearPerPlate);
        for (const id of station.dishes) {
          const raw = (dishRemainders[id] ?? 0) + stationPlates / station.dishes.length;
          const count = Math.floor(raw + 1e-10);
          dishRemainders[id] = Math.max(0, raw - count);
          if (count > 0) dishPlates[id] = (dishPlates[id] ?? 0) + count;
        }
      }
    }
    plateFloat += plates;
    state.condition.cleanliness = Math.max(RULES.conditionFloor, state.condition.cleanliness - dirt * hours);
    state.condition.equipment = Math.max(RULES.conditionFloor, state.condition.equipment - wear * hours);
    if (state.condition.cleanliness - RULES.conditionFloor < 1e-10) state.condition.cleanliness = RULES.conditionFloor;
    if (state.condition.equipment - RULES.conditionFloor < 1e-10) state.condition.equipment = RULES.conditionFloor;
    remaining = Math.max(0, remaining - hours * 3_600_000);
    if (remaining < 1e-7) remaining = 0;
    if(stations.some(s=>(equipment.instances[String(s.uid)]?.condition??100)<=1e-9)){
      for(const s of stations){const instance=equipment.instances[String(s.uid)];if(instance&&instance.condition<1e-9)instance.condition=0;}
      operations=createWorld("server-equipment",shellAt(save.shell),{layout:save.layout,equipment,truck:save.truck,pantry:save.pantry,menu:save.menu}).operations;
      capacity=capacityFor(workingSave);
    }
  }
  // The uncredited excess absence is consumed too: no repeatedly claiming the cap.
  state.condition.lastSettledAt = now;
  state.plateRemainder = plateFloat % 1;
  // Broken kitchens still consume elapsed time, so returning cannot reclaim it.
  if (creditedMs < elapsedMs) coins += accruePassiveCoins(progress, elapsedMs - creditedMs, now, 0, 1);
  progress.passive.lastSettledAt = now;
  state.passive = progress.passive;
  state.coinRemainder = progress.passive.remainder;
  return { ...state, coins, plates: Math.floor(plateFloat), elapsedMs, producedMenu:Array.from(producedMenu), dishPlates };
}
