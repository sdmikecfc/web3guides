/** Food-truck adventures: deterministic gameplay shared by browser and server.
 * No clock, network, renderer, or home-world dependency belongs in this module. */
export const TRUCK_VERSION = 1;
export const TRUCK_TICK_RATE = 20;
export const TRUCK_TICK_MS = 1000 / TRUCK_TICK_RATE;
export type TruckSize = "small" | "medium" | "large";
export type TruckDish = "pasta" | "salad" | "fries" | "drink";
export type TruckMachineId = "pantry" | "fridge" | "prep" | "stove" | "sauce" | "plates" | "pass" | "sink" | "counter" | "fryer" | "drinks";
export type TruckRole = "washer" | "prep" | "runner";
export type TruckTech = "prep" | "cook" | "service";
export type TruckFacing = 0 | 1 | 2 | 3;
export type TruckItemKind = "raw_pasta" | "raw_tomato" | "sauce" | "sauced_pasta" | "raw_salad" | "raw_potato" | "cut_potato" | "cooked_pasta" | "chopped_salad" | "cooked_fries" | "cup" | "lemon_cup" | "drink" | "plate_pasta" | "plate_salad" | "plate_fries" | "dirty_plate" | "burnt";
export type TruckIngredientChoice = TruckDish | "cup" | "tomato";
export interface TruckItem { id: number; kind: TruckItemKind }
export interface TruckPoint { x: number; y: number }
export interface TruckPlacement extends TruckPoint { id: number; machineId: TruckMachineId; facing: TruckFacing }
export interface TruckStation extends TruckPlacement {
  item: TruckItem | null;
  processing: { remaining: number; total: number; output: TruckItemKind; owner: number | "player" | null } | null;
  readyTicks: number;
}
export interface TruckPerson extends TruckPoint {
  facing: TruckFacing; held: TruckItem | null; path: TruckPoint[];
  job: { stationId: number; remaining: number; total: number } | null;
  pending: { stationId: number; choice?: TruckIngredientChoice } | null;
  moveTicks: number;
}
export interface TruckHelper extends TruckPerson { id: number; role: TruckRole; look: number }
export interface TruckCustomer { id: number; dish: TruckDish; patience: number; maxPatience: number }
export interface TruckLoadout { size: TruckSize; layout: TruckPlacement[]; techLevels: Record<TruckTech, number>; crew: { id: number; role: TruckRole; look: number }[]; color: string; sign: string; recipeLevels: Record<string, number> }
export interface TruckRun {
  id: string; node: number; practice: boolean; challenge: boolean; seed: number; tick: number;
  phase: "playing" | "paused" | "cleared" | "failed"; failure: string | null;
  loadout: TruckLoadout; menu: TruckDish[]; player: TruckPerson; helpers: TruckHelper[]; stations: TruckStation[];
  customers: TruckCustomer[]; nextCustomerIn: number; remainingTicks: number;
  served: number; target: number; coinsEarned: number; dirtyDishes: number; cleanPlates: number;
  nextId: number; rewardClaimed: boolean; notice: string;
}
export interface TruckProgress {
  version: 1; size: TruckSize; unlockedMachineIds: TruckMachineId[];
  machineInventory: Partial<Record<TruckMachineId, number>>; techLevels: Record<TruckTech, number>;
  crew: { id: number; role: TruckRole; look: number }[]; layout: TruckPlacement[];
  firstClears: number[]; bestDay: number; nextNode: number; challengeNext: boolean; color: string; sign: string; chefLook: number; nextStationId: number; attempts: number;
  run: TruckRun | null;
  lastResult: { node: number; outcome: "cleared" | "failed"; served: number; coins: number; practice: boolean; reason: string | null } | null;
}
export interface TruckNode { id: number; kind: "service" | "market" | "gift"; serviceDay: number; name: string; dishes: TruckDish[]; target: number; seconds: number; patienceSeconds: number; arrivalSeconds: number; clearCoins: number; unlock?: "fryer" | "drinks" }
export const TRUCK_SIZES = [
  { id: "small" as TruckSize, name: "Little truck", w: 6, h: 4, helpers: 1, customers: 4, cost: 0, unlockNode: 0 },
  { id: "medium" as TruckSize, name: "Market truck", w: 8, h: 5, helpers: 2, customers: 6, cost: 240, unlockNode: 4 },
  { id: "large" as TruckSize, name: "Festival truck", w: 10, h: 6, helpers: 3, customers: 8, cost: 600, unlockNode: 8 },
] as const;
export const TRUCK_MACHINES: { id: TruckMachineId; name: string; description: string; cost: number; color: string; homeItemId?: string }[] = [
  { id: "pantry", name: "Ingredient crates", description: "Pick pasta, tomatoes, or potatoes.", cost: 35, color: "#7a9959" },
  { id: "fridge", name: "Fridge", description: "Get fresh salad greens or a cup with chilled lemons.", cost: 45, color: "#9bb9bb" },
  { id: "prep", name: "Chopping board", description: "Chop greens or slice potatoes while you work here.", cost: 50, color: "#bc8c59" },
  { id: "stove", name: "Pasta pot", description: "Boils pasta while you handle another order.", cost: 70, color: "#bd7256" },
  { id: "sauce", name: "Sauce pan", description: "Simmer tomatoes, then add boiled pasta to the finished sauce.", cost: 55, color: "#bf7755" },
  { id: "plates", name: "Plating counter", description: "Put cooked food on a clean plate.", cost: 35, color: "#d3bb84" },
  { id: "pass", name: "Serving window", description: "Serve a matching order; pick up dirty dishes with an empty hand.", cost: 0, color: "#689a7a" },
  { id: "sink", name: "Sink", description: "Wash dirty dishes to restock your clean plates.", cost: 40, color: "#78a6b0" },
  { id: "counter", name: "Spare counter", description: "Put down one item for later, or for a helper.", cost: 20, color: "#c59d70" },
  { id: "fryer", name: "Fryer", description: "Turns sliced potatoes into golden fries.", cost: 110, color: "#d5a247", homeItemId: "fryer_basic" },
  { id: "drinks", name: "Drink machine", description: "Fill a cup with a cold drink.", cost: 100, color: "#91b3b9", homeItemId: "drinks_basic" },
];
export const TRUCK_PRICES = { version: 1, hire: { washer: 60, prep: 100, runner: 140 }, tech: [80, 160, 280], salePerOrder: 4 } as const;
export const TRUCK_COLORS = ["tomato", "sage", "sky", "sunshine"] as const;
export const TRUCK_SERVICE_NODES = [1, 2, 4, 6, 8, 9, 11, 12] as const;
export const TRUCK_LADDER: TruckNode[] = Array.from({ length: 12 }, (_, index) => {
  const id = index + 1, serviceDay = (TRUCK_SERVICE_NODES as readonly number[]).indexOf(id) + 1;
  return { id, kind: serviceDay ? "service" : id === 5 ? "gift" : "market", serviceDay,
    name: ["First lunch", "Garden corner", "Market square", "Golden hour", "A roadside gift", "Riverside supper", "Refreshment market", "Music in the park", "Town festival", "Night market", "Chef's parade", "Grand food fair"][index],
    dishes: serviceDay === 1 ? ["pasta"] : serviceDay <= 2 ? ["pasta", "salad"] : serviceDay <= 4 ? ["pasta", "salad", "fries"] : ["pasta", "salad", "fries", "drink"],
    target: [7, 10, 12, 14, 17, 20, 22, 24][Math.max(0, serviceDay - 1)], seconds: [240, 310, 350, 380, 410, 440, 460, 490][Math.max(0, serviceDay - 1)], patienceSeconds: Math.max(48, 88 - serviceDay * 4), arrivalSeconds: Math.max(16, 30 - serviceDay * 2),
    clearCoins: serviceDay ? 20 + serviceDay * 5 : 0, ...(id === 3 ? { unlock: "fryer" as const } : id === 7 ? { unlock: "drinks" as const } : {}), };
});
export type TruckAction =
  | { type: "start"; node: number; practice?: boolean }
  | { type: "marketVisit"; node: number; choice?: "supplies" | "challenge" }
  | { type: "tick"; ticks: number }
  | { type: "move"; dx: number; dy: number }
  | { type: "moveTo"; x: number; y: number }
  | { type: "interact"; stationId: number; choice?: TruckIngredientChoice }
  | { type: "discard" | "pause" | "resume" | "abandon" | "finish" }
  | { type: "place"; machineId: TruckMachineId; x: number; y: number; facing?: TruckFacing }
  | { type: "moveStation"; stationId: number; x: number; y: number; facing?: TruckFacing }
  | { type: "rotate"; stationId: number }
  | { type: "store"; stationId: number }
  | { type: "buyMachine"; machineId: TruckMachineId }
  | { type: "buySize"; size: TruckSize }
  | { type: "hire"; role: TruckRole }
  | { type: "upgrade"; tech: TruckTech }
  | { type: "setCrew"; look: number }
  | { type: "setCosmetic"; color?: string; sign?: string };
export interface TruckContext { coins: number; recipeLevels?: Record<string, number>; now?: number; seed?: number | string; runId?: string }
export interface TruckResult { truck: TruckProgress; coinDelta: number; homeGrants: Record<string, number>; stockGrants: Record<string, number>; error?: string }
const BASE_MACHINES: TruckMachineId[] = ["pantry", "fridge", "prep", "stove", "sauce", "plates", "pass", "sink", "counter"];
export function truckSize(size: TruckSize) { return TRUCK_SIZES.find(entry => entry.id === size) ?? TRUCK_SIZES[0]; }
export function truckMachine(id: TruckMachineId) { return TRUCK_MACHINES.find(entry => entry.id === id); }
export function createTruckProgress(): TruckProgress {
  return { version: 1, size: "small", unlockedMachineIds: [...BASE_MACHINES], machineInventory: {}, techLevels: { prep: 0, cook: 0, service: 0 }, crew: [],
    layout: ["pantry", "prep", "stove", "plates", "sink", "pass"].map((machineId, x) => ({ id: x + 1, machineId: machineId as TruckMachineId, x, y: 0, facing: 0 as TruckFacing })).concat([{ id: 7, machineId: "counter", x: 0, y: 2, facing: 3 }, { id: 8, machineId: "fridge", x: 0, y: 3, facing: 3 }, { id: 9, machineId: "sauce", x: 5, y: 2, facing: 1 }]),
    firstClears: [], bestDay: 0, nextNode: 1, challengeNext: false, color: "tomato", sign: "My Food Truck", chefLook: 0, nextStationId: 10, attempts: 0, run: null, lastResult: null };
}
export function snapshotTruckLoadout(progress: TruckProgress, recipeLevels: Record<string, number> = {}): TruckLoadout {
  const levels: Record<string, number> = {};
  for (const id of Object.values(TRUCK_DISH_RECIPES)) if (typeof recipeLevels[id] === "number") levels[id] = int(recipeLevels[id], 1, 3, 1);
  return structuredClone({ size: progress.size, layout: progress.layout, techLevels: progress.techLevels, crew: progress.crew, color: progress.color, sign: progress.sign, recipeLevels: levels });
}
export const TRUCK_DISH_RECIPES: Record<TruckDish, string> = { pasta: "tomato_pasta", salad: "garden_salad", fries: "fries", drink: "lemonade" };
const DIRECTIONS: TruckPoint[] = [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }];
const ITEM_KINDS: TruckItemKind[] = ["raw_pasta", "raw_tomato", "sauce", "sauced_pasta", "raw_salad", "raw_potato", "cut_potato", "cooked_pasta", "chopped_salad", "cooked_fries", "cup", "lemon_cup", "drink", "plate_pasta", "plate_salad", "plate_fries", "dirty_plate", "burnt"];
const ROLES: TruckRole[] = ["washer", "prep", "runner"];
const TECHS: TruckTech[] = ["prep", "cook", "service"];
const pointKey = (p: TruckPoint) => `${p.x},${p.y}`;
const int = (n: unknown, low: number, high: number, fallback = low) => typeof n === "number" && Number.isFinite(n) ? Math.max(low, Math.min(high, Math.floor(n))) : fallback;
const object = (n: unknown): Record<string, unknown> => n && typeof n === "object" && !Array.isArray(n) ? n as Record<string, unknown> : {};
const spawn = (size: TruckSize): TruckPoint => ({ x: Math.floor(truckSize(size).w / 2), y: truckSize(size).h - 2 });
const same = (a: TruckPoint, b: TruckPoint) => a.x === b.x && a.y === b.y;
const near = (a: TruckPoint, b: TruckPoint) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
function open(size: TruckSize, layout: TruckPlacement[], p: TruckPoint): boolean {
  const room = truckSize(size);
  return Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < room.w && p.y < room.h && !layout.some(s => same(s, p));
}
/** Stable four-neighbor BFS, reused by human auto-approach and actual helpers. */
export function truckPath(size: TruckSize, layout: TruckPlacement[], from: TruckPoint, to: TruckPoint): TruckPoint[] | null {
  if (!open(size, layout, from) || !open(size, layout, to)) return null;
  const queue = [from], previous = new Map<string, TruckPoint | null>([[pointKey(from), null]]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (same(current, to)) {
      const path: TruckPoint[] = []; let cursor = current;
      while (!same(cursor, from)) { path.unshift({ ...cursor }); cursor = previous.get(pointKey(cursor))!; }
      return path;
    }
    for (const delta of DIRECTIONS) {
      const next = { x: current.x + delta.x, y: current.y + delta.y }, key = pointKey(next);
      if (open(size, layout, next) && !previous.has(key)) { previous.set(key, current); queue.push(next); }
    }
  }
  return null;
}
export function validateTruckLayout(size: TruckSize, layout: TruckPlacement[]): string | null {
  const room = truckSize(size), origin = spawn(size), ids = new Set<number>(), cells = new Set<string>();
  if (layout.length > room.w * room.h - 3) return "Leave some floor clear for your crew.";
  for (const station of layout) {
    if (!truckMachine(station.machineId) || !Number.isInteger(station.id) || station.id < 1 || ids.has(station.id) || cells.has(pointKey(station)) || !Number.isInteger(station.x) || !Number.isInteger(station.y) || station.x < 0 || station.y < 0 || station.x >= room.w || station.y >= room.h || ![0, 1, 2, 3].includes(station.facing)) return "That machine does not fit there.";
    if (station.machineId === "pass" && station.x !== 0 && station.y !== 0 && station.x !== room.w - 1 && station.y !== room.h - 1) return "The serving window belongs on an outside edge.";
    ids.add(station.id); cells.add(pointKey(station));
  }
  if (!open(size, layout, origin)) return "Leave the entrance clear.";
  for (const station of layout) {
    if (!DIRECTIONS.some(d => truckPath(size, layout, origin, { x: station.x + d.x, y: station.y + d.y }) !== null)) return "Your crew needs a clear path to every machine.";
  }
  return null;
}
export function truckStartError(progress: TruckProgress, nodeId: number, practice = false): string | null {
  const node = TRUCK_LADDER.find(n => n.id === nodeId);
  if (!node) return "Choose a stop on your route.";
  if (node.kind !== "service") return "Visit this stop before continuing your route.";
  if (!practice && nodeId !== progress.nextNode) return "Continue from your current stop.";
  const invalid = validateTruckLayout(progress.size, progress.layout); if (invalid) return invalid;
  const needed: TruckMachineId[] = ["pass", "sink"];
  const missing = needed.find(id => !progress.layout.some(station => station.machineId === id));
  return missing ? `Place your ${truckMachine(missing)!.name.toLowerCase()} before opening.` : truckMenu(progress.layout, node).length ? null : "Place the stations for at least one dish before opening.";
}
/** Installed complete production chains determine the orders this truck accepts. */
export function truckMenu(layout: TruckPlacement[], node: TruckNode): TruckDish[] {
  const has = (...ids: TruckMachineId[]) => ids.every(id => layout.some(s => s.machineId === id));
  return node.dishes.filter(dish => dish === "pasta" ? has("pantry", "stove", "sauce", "plates") : dish === "salad" ? has("fridge", "prep", "plates") : dish === "fries" ? has("pantry", "prep", "fryer", "plates") : has("fridge", "drinks"));
}
function hash(text: string): number { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0 || 1; }
function roll(run: TruckRun): number { run.seed = (Math.imul(run.seed, 1664525) + 1013904223) >>> 0; return run.seed / 4294967296; }
function person(point: TruckPoint): TruckPerson { return { ...point, facing: 2, held: null, path: [], job: null, pending: null, moveTicks: 0 }; }
function createRun(progress: TruckProgress, node: TruckNode, practice: boolean, context: TruckContext): TruckRun {
  const origin = spawn(progress.size), loadout = snapshotTruckLoadout(progress, context.recipeLevels);
  const run: TruckRun = { id: context.runId ?? `truck-${hash(String(context.seed ?? context.now ?? 0))}-${progress.attempts}`, node: node.id, practice, challenge: !practice && progress.challengeNext,
    seed: hash(String(context.seed ?? `${context.now ?? 0}:${progress.attempts}:${node.id}`)), tick: 0, phase: "playing", failure: null, loadout, menu: truckMenu(loadout.layout, node),
    player: person(origin), helpers: progress.crew.map(c => ({ ...person(origin), ...c })),
    stations: progress.layout.map(s => ({ ...s, item: null, processing: null, readyTicks: 0 })), customers: [], nextCustomerIn: Math.round(node.arrivalSeconds * TRUCK_TICK_RATE),
    remainingTicks: node.seconds * TRUCK_TICK_RATE, served: 0, target: node.target, coinsEarned: 0, dirtyDishes: 0, cleanPlates: 6, nextId: 100, rewardClaimed: false, notice: "Your first order is here. Bring it to the serving window." };
  addCustomer(run, node, true); return run;
}
function addCustomer(run: TruckRun, node: TruckNode, first = false) {
  const dish = first ? run.menu[0] : run.menu[Math.floor(roll(run) * run.menu.length)];
  const patience = Math.round(node.patienceSeconds * TRUCK_TICK_RATE * (1 + run.loadout.techLevels.service * .07) * (run.challenge ? .75 : 1));
  run.customers.push({ id: run.nextId++, dish, patience, maxPatience: patience });
}
function item(run: TruckRun, kind: TruckItemKind): TruckItem { return { id: run.nextId++, kind }; }
function cancelJob(run: TruckRun, actor: TruckPerson) {
  if (actor.job) { const station = run.stations.find(s => s.id === actor.job!.stationId); if (station?.processing) station.processing.owner = null; }
  actor.job = null; actor.pending = null;
}
function approach(run: TruckRun, actor: TruckPerson, station: TruckStation, choice?: TruckIngredientChoice): boolean {
  const paths = DIRECTIONS.map(d => truckPath(run.loadout.size, run.stations, actor, { x: station.x + d.x, y: station.y + d.y })).filter((p): p is TruckPoint[] => p !== null).sort((a, b) => a.length - b.length);
  if (!paths.length) return false;
  cancelJob(run, actor); actor.path = paths[0]; actor.pending = { stationId: station.id, choice }; return true;
}
function dishOf(kind: TruckItemKind): TruckDish | null { return kind === "plate_pasta" ? "pasta" : kind === "plate_salad" ? "salad" : kind === "plate_fries" ? "fries" : kind === "drink" ? "drink" : null; }
function prepDuration(run: TruckRun, seconds: number) { return Math.max(10, Math.round(seconds * TRUCK_TICK_RATE * (1 - run.loadout.techLevels.prep * .12))); }
function cookDuration(run: TruckRun, seconds: number, dish: TruckDish) {
  const level = int(run.loadout.recipeLevels[TRUCK_DISH_RECIPES[dish]], 1, 3, 1);
  return Math.max(10, Math.round(seconds * TRUCK_TICK_RATE * (1 - run.loadout.techLevels.cook * .1) * (1 - (level - 1) * .05)));
}
function processAt(run: TruckRun, actor: TruckPerson, station: TruckStation, output: TruckItemKind, ticks: number, active: boolean) {
  station.item = actor.held; actor.held = null; station.readyTicks = 0;
  const owner = actor === run.player ? "player" : (actor as TruckHelper).id;
  station.processing = { remaining: ticks, total: ticks, output, owner: active ? owner : null };
  if (active) actor.job = { stationId: station.id, remaining: ticks, total: ticks };
}
function awardCoins(run: TruckRun, out: TruckResult, amount: number) { if (!run.practice) { out.coinDelta += amount; run.coinsEarned += amount; } }
function endRun(progress: TruckProgress, out: TruckResult, outcome: "cleared" | "failed", reason: string | null = null) {
  const run = progress.run!; if (run.phase === "cleared" || run.phase === "failed") return;
  run.phase = outcome; run.failure = reason;
  if (outcome === "cleared" && !run.practice && !run.rewardClaimed) {
    const node = TRUCK_LADDER[run.node - 1];
    if (!progress.firstClears.includes(run.node)) {
      progress.firstClears.push(run.node); progress.firstClears.sort((a, b) => a - b); progress.bestDay = Math.max(progress.bestDay, node.serviceDay);
      awardCoins(run, out, node.clearCoins + (run.challenge ? 15 : 0));
      out.stockGrants[node.id % 2 ? "tomato" : "herb"] = 2;
      if (node.unlock && !progress.unlockedMachineIds.includes(node.unlock)) {
        progress.unlockedMachineIds.push(node.unlock); progress.machineInventory[node.unlock] = (progress.machineInventory[node.unlock] ?? 0) + 1;
        out.homeGrants[truckMachine(node.unlock)!.homeItemId!] = 1;
      }
    }
    run.rewardClaimed = true;
  }
  if (!run.practice) { progress.nextNode = outcome === "cleared" && run.node < 12 ? run.node + 1 : 1; progress.challengeNext = false; }
  for (const actor of [run.player, ...run.helpers]) { actor.path = []; cancelJob(run, actor); }
  progress.lastResult = { node: run.node, outcome, served: run.served, coins: run.coinsEarned, practice: run.practice, reason };
}
function interactAt(progress: TruckProgress, out: TruckResult, actor: TruckPerson, station: TruckStation, choice?: TruckIngredientChoice): string | null {
  const run = progress.run!;
  if (!near(actor, station)) return "Stand beside that station.";
  actor.facing = station.x > actor.x ? 3 : station.x < actor.x ? 1 : station.y > actor.y ? 0 : 2;
  if (station.machineId === "pantry" || station.machineId === "fridge") {
    if (actor.held) return "Put down what you are carrying first.";
    const wanted = choice ?? (station.machineId === "fridge" ? "salad" : "pasta");
    if (station.machineId === "fridge") {
      if (wanted === "drink" || wanted === "cup") { if (run.cleanPlates < 1) return "Wash a dirty dish for a clean cup."; run.cleanPlates--; actor.held = item(run, "lemon_cup"); }
      else if (wanted === "salad") actor.held = item(run, "raw_salad");
      else return "The fridge holds salad greens and chilled lemons.";
    } else {
      if (!["pasta", "tomato", "fries"].includes(wanted)) return "Get greens and chilled lemons from the fridge.";
      actor.held = item(run, wanted === "pasta" ? "raw_pasta" : wanted === "tomato" ? "raw_tomato" : "raw_potato");
    }
    return null;
  }
  if (station.machineId === "pass") {
    if (!actor.held) { if (run.dirtyDishes < 1) return "The window has no dirty dishes."; run.dirtyDishes--; actor.held = item(run, "dirty_plate"); return null; }
    const dish = dishOf(actor.held.kind), index = run.customers.findIndex(c => c.dish === dish);
    if (index < 0) return "Nobody has ordered that dish. Keep it on a counter.";
    run.customers.splice(index, 1); actor.held = null; run.served++; run.dirtyDishes++;
    awardCoins(run, out, TRUCK_PRICES.salePerOrder); run.notice = `Served ${dish}. ${run.served} of ${run.target} orders.`;
    if (run.served >= run.target) endRun(progress, out, "cleared");
    return null;
  }
  if (station.processing) {
    if (station.machineId === "prep" && station.processing.owner === null && !actor.held) {
      station.processing.owner = actor === run.player ? "player" : (actor as TruckHelper).id;
      actor.job = { stationId: station.id, remaining: station.processing.remaining, total: station.processing.total }; return null;
    }
    return "That station is still working.";
  }
  if (station.item) {
    if (station.machineId === "sauce" && station.item.kind === "sauce" && actor.held?.kind === "cooked_pasta") { actor.held.kind = "sauced_pasta"; station.item = null; station.readyTicks = 0; return null; }
    if (actor.held) return "Your hands are full. Use a spare counter.";
    actor.held = station.item; station.item = null; station.readyTicks = 0; return null;
  }
  if (!actor.held) return "Bring an ingredient here first.";
  const kind = actor.held.kind;
  if (station.machineId === "counter") { station.item = actor.held; actor.held = null; return null; }
  if (station.machineId === "prep" && (kind === "raw_salad" || kind === "raw_potato")) { processAt(run, actor, station, kind === "raw_salad" ? "chopped_salad" : "cut_potato", prepDuration(run, 3), true); return null; }
  if (station.machineId === "stove" && kind === "raw_pasta") { processAt(run, actor, station, "cooked_pasta", cookDuration(run, 6, "pasta"), false); return null; }
  if (station.machineId === "sauce" && kind === "raw_tomato") { processAt(run, actor, station, "sauce", cookDuration(run, 4, "pasta"), false); return null; }
  if (station.machineId === "fryer" && kind === "cut_potato") { processAt(run, actor, station, "cooked_fries", cookDuration(run, 6, "fries"), false); return null; }
  if (station.machineId === "drinks" && kind === "lemon_cup") { processAt(run, actor, station, "drink", cookDuration(run, 2, "drink"), false); return null; }
  if (station.machineId === "sink" && kind === "dirty_plate") { processAt(run, actor, station, "dirty_plate", prepDuration(run, 3), false); return null; }
  if (station.machineId === "plates" && ["sauced_pasta", "chopped_salad", "cooked_fries"].includes(kind)) {
    if (run.cleanPlates < 1) return "The clean plates are gone. Wash a dirty dish.";
    run.cleanPlates--; station.item = { ...actor.held, kind: kind === "sauced_pasta" ? "plate_pasta" : kind === "chopped_salad" ? "plate_salad" : "plate_fries" }; actor.held = null; return null;
  }
  return "That ingredient needs a different station.";
}
function moveActor(run: TruckRun, actor: TruckPerson) {
  if (actor.moveTicks > 0) { actor.moveTicks--; return; }
  const next = actor.path.shift(); if (!next) return;
  if (!near(actor, next) || !open(run.loadout.size, run.stations, next)) { actor.path = []; actor.pending = null; return; }
  actor.facing = next.x > actor.x ? 3 : next.x < actor.x ? 1 : next.y > actor.y ? 0 : 2;
  actor.x = next.x; actor.y = next.y; actor.moveTicks = Math.max(3, 5 - run.loadout.techLevels.service);
}
function runHelper(run: TruckRun, helper: TruckHelper) {
  if (helper.path.length || helper.pending || helper.job) return;
  const find = (machineId: TruckMachineId, free = false) => run.stations.find(s => s.machineId === machineId && (!free || (!s.item && !s.processing)));
  if (helper.held) {
    const kind = helper.held.kind;
    const destination = kind === "dirty_plate" ? find("sink", true) : dishOf(kind) ? find("pass")
      : kind === "raw_salad" || kind === "raw_potato" ? find("prep", true)
      : kind === "chopped_salad" || kind === "sauced_pasta" || kind === "cooked_fries" ? find("plates", true)
      : kind === "cut_potato" ? find("fryer", true) : undefined;
    if (destination && (kind !== "dirty_plate" || !destination.processing)) approach(run, helper, destination);
    return;
  }
  if (helper.role === "washer") { const pass = find("pass"); if (pass && run.dirtyDishes > 0 && find("sink", true)) approach(run, helper, pass); return; }
  if (helper.role === "runner") {
    const ready = run.stations.find(s => s.item && !s.processing && dishOf(s.item.kind) && run.customers.some(c => c.dish === dishOf(s.item!.kind)));
    if (ready) approach(run, helper, ready); return;
  }
  const prepped = run.stations.find(s => s.machineId === "prep" && s.item && !s.processing);
  if (prepped) { approach(run, helper, prepped); return; }
  const stalled = run.stations.find(s => s.machineId === "prep" && s.processing?.owner === null);
  if (stalled) { approach(run, helper, stalled); return; }
  const needed = run.customers.find(c => c.dish === "salad" || c.dish === "fries");
  const pantry = find(needed?.dish === "salad" ? "fridge" : "pantry");
  if (needed && pantry && find("prep", true)) approach(run, helper, pantry, needed.dish);
}
function stepTruck(progress: TruckProgress, out: TruckResult) {
  const run = progress.run!; if (run.phase !== "playing") return;
  run.tick++; run.remainingTicks = Math.max(0, run.remainingTicks - 1);
  for (const actor of [run.player, ...run.helpers]) {
    moveActor(run, actor);
    if (!actor.path.length && actor.pending && actor.moveTicks === 0) {
      const pending = actor.pending; actor.pending = null;
      const station = run.stations.find(s => s.id === pending.stationId);
      if (station) { const error = interactAt(progress, out, actor, station, pending.choice); if (error && actor === run.player) run.notice = error; }
      if (run.phase !== "playing") return;
    }
  }
  for (const station of run.stations) {
    const processing = station.processing;
    if (processing) {
      const owner = processing.owner === "player" ? run.player : run.helpers.find(h => h.id === processing.owner);
      if (station.machineId === "prep" && (!owner || !near(owner, station) || owner.job?.stationId !== station.id)) continue;
      processing.remaining--;
      if (owner?.job?.stationId === station.id) owner.job.remaining = processing.remaining;
      if (processing.remaining <= 0) {
        if (station.machineId === "sink") { station.item = null; run.cleanPlates++; }
        else if (station.item) station.item.kind = processing.output;
        station.processing = null; station.readyTicks = 0;
        if (owner?.job?.stationId === station.id) owner.job = null;
      }
    } else if (station.item && (station.machineId === "stove" || station.machineId === "fryer" || station.machineId === "sauce") && station.item.kind !== "burnt") {
      if (++station.readyTicks > 30 * TRUCK_TICK_RATE) { station.item.kind = "burnt"; run.notice = "A pan burned. Discard it and start again."; }
    }
  }
  for (const helper of run.helpers) runHelper(run, helper);
  for (const customer of run.customers) if (--customer.patience <= 0) { endRun(progress, out, "failed", "A customer left hungry. Your served coins and recovered equipment are safe."); return; }
  const node = TRUCK_LADDER[run.node - 1];
  if (--run.nextCustomerIn <= 0 && run.served + run.customers.length < run.target && run.customers.length < truckSize(run.loadout.size).customers) { addCustomer(run, node); run.nextCustomerIn = Math.round(node.arrivalSeconds * TRUCK_TICK_RATE); }
}

export function truckCurrentNode(progress: TruckProgress): TruckNode { return TRUCK_LADDER[int(progress.nextNode, 1, 12, 1) - 1]; }
export function availableTruckNodes(progress: TruckProgress): TruckNode[] { return [truckCurrentNode(progress)]; }
/** Competition starts from this server-owned loadout, never a player's upgrades. */
export function createEqualTruckProgress(): TruckProgress {
  const progress = createTruckProgress();
  progress.unlockedMachineIds.push("fryer", "drinks");
  progress.layout.push({ id: 10, machineId: "fryer", x: 5, y: 3, facing: 1 }, { id: 11, machineId: "drinks", x: 3, y: 3, facing: 2 });
  progress.nextStationId = 12; return progress;
}

/** All actions return a new state. A caller applies each returned reward exactly
 * once with its command receipt; the reducer never reads a browser/server clock. */
export function dispatchTruck(previous: TruckProgress, action: TruckAction, context: TruckContext): TruckResult {
  const progress = structuredClone(previous);
  const out: TruckResult = { truck: progress, coinDelta: 0, homeGrants: {}, stockGrants: {} };
  const fail = (error: string): TruckResult => ({ truck: previous, coinDelta: 0, homeGrants: {}, stockGrants: {}, error });
  if (!action || typeof action !== "object" || typeof action.type !== "string") return fail("Choose a truck action.");
  const run = progress.run;
  const active = run && (run.phase === "playing" || run.phase === "paused");
  const afford = (cost: number) => typeof context?.coins === "number" && Number.isFinite(context.coins) && context.coins >= cost;
  const validPoint = (x: unknown, y: unknown) => Number.isInteger(x) && Number.isInteger(y);
  const validFacing = (facing: unknown) => facing === undefined || [0, 1, 2, 3].includes(facing as number);
  const replaceLayout = (layout: TruckPlacement[]) => { const error = validateTruckLayout(progress.size, layout); if (error) return error; progress.layout = layout; return null; };
  if (action.type === "tick") {
    if (!Number.isInteger(action.ticks) || action.ticks < 1 || action.ticks > 1200) return fail("Time must advance in bounded simulation ticks.");
    if (!run || run.phase !== "playing") return out;
    for (let i = 0; i < action.ticks && run.phase === "playing"; i++) stepTruck(progress, out);
    return out;
  }
  if (action.type === "start") {
    if (active) return fail("Finish this service first.");
    if (!Number.isInteger(action.node) || (action.practice !== undefined && typeof action.practice !== "boolean")) return fail("Choose a valid service day.");
    const error = truckStartError(progress, action.node, action.practice === true); if (error) return fail(error);
    progress.attempts++; progress.run = createRun(progress, TRUCK_LADDER[action.node - 1], action.practice === true, context);
    return out;
  }
  if (action.type === "marketVisit") {
    if (active) return fail("Finish this service first.");
    if (!Number.isInteger(action.node) || action.node !== progress.nextNode || ![undefined, "supplies", "challenge"].includes(action.choice)) return fail("Visit your current route stop.");
    const node = TRUCK_LADDER[action.node - 1]; if (!node || node.kind === "service") return fail("This stop needs a real service shift.");
    if (action.choice === "challenge" && node.kind !== "market") return fail("This gift stop has no challenge.");
    if (!progress.firstClears.includes(node.id)) {
      progress.firstClears.push(node.id); progress.firstClears.sort((a, b) => a - b);
      out.stockGrants[node.kind === "gift" ? "tomato" : "herb"] = node.kind === "gift" ? 3 : 1;
      if (node.unlock && !progress.unlockedMachineIds.includes(node.unlock)) {
        progress.unlockedMachineIds.push(node.unlock); progress.machineInventory[node.unlock] = (progress.machineInventory[node.unlock] ?? 0) + 1;
        out.homeGrants[truckMachine(node.unlock)!.homeItemId!] = 1;
      }
    }
    progress.challengeNext = action.choice === "challenge"; progress.nextNode = node.id + 1; progress.run = null; return out;
  }
  if (action.type === "finish") {
    if (active) return fail("Pause or abandon the shift before going home.");
    progress.run = null; return out;
  }
  if (["move", "moveTo", "interact", "discard", "pause", "resume", "abandon"].includes(action.type)) {
    if (!run || !active) return fail("Open your truck for service first.");
    if (action.type === "resume") { if (run.phase !== "paused") return fail("This shift is already running."); run.phase = "playing"; return out; }
    if (action.type === "abandon") { endRun(progress, out, "failed", "You headed home. Your served coins and recovered equipment are safe."); return out; }
    if (run.phase !== "playing") return fail("Resume your shift first.");
    if (action.type === "pause") { run.phase = "paused"; return out; }
    if (action.type === "discard") {
      if (!run.player.held) return fail("Your hands are empty.");
      if (run.player.held.kind === "dirty_plate") return fail("Take the dirty dish to a sink.");
      cancelJob(run, run.player); run.player.path = [];
      if (dishOf(run.player.held.kind) || run.player.held.kind === "cup" || run.player.held.kind === "lemon_cup") run.player.held.kind = "dirty_plate";
      else run.player.held = null;
      return out;
    }
    if (action.type === "move" || action.type === "moveTo") {
      let target: TruckPoint;
      if (action.type === "move") {
        if (!validPoint(action.dx, action.dy) || Math.abs(action.dx) + Math.abs(action.dy) !== 1) return fail("Move one floor tile at a time.");
        target = { x: run.player.x + action.dx, y: run.player.y + action.dy };
      } else { if (!validPoint(action.x, action.y)) return fail("Choose a floor tile."); target = { x: action.x, y: action.y }; }
      const path = truckPath(run.loadout.size, run.stations, run.player, target); if (!path) return fail("That floor tile is blocked.");
      cancelJob(run, run.player); run.player.path = path; return out;
    }
    if (action.type === "interact") {
      if (!Number.isInteger(action.stationId) || ![undefined, "pasta", "salad", "fries", "drink", "cup", "tomato"].includes(action.choice)) return fail("Choose a valid station or ingredient.");
      const station = run.stations.find(s => s.id === action.stationId); if (!station) return fail("That station is not in this truck.");
      if (run.player.job?.stationId === station.id) return out;
      cancelJob(run, run.player); run.player.path = [];
      if (near(run.player, station)) { const error = interactAt(progress, out, run.player, station, action.choice); if (error) return fail(error); }
      else if (!approach(run, run.player, station, action.choice)) return fail("There is no clear path to that station.");
      return out;
    }
  }
  if (active) return fail("Change your truck between service days.");
  if (action.type === "place") {
    if (!truckMachine(action.machineId) || !progress.unlockedMachineIds.includes(action.machineId) || !validPoint(action.x, action.y) || !validFacing(action.facing)) return fail("Choose an owned machine and a valid floor tile.");
    if (!(progress.machineInventory[action.machineId]! > 0)) return fail("That machine is not in storage.");
    const error = replaceLayout([...progress.layout, { id: progress.nextStationId, machineId: action.machineId, x: action.x, y: action.y, facing: action.facing ?? 0 }]); if (error) return fail(error);
    progress.nextStationId++; progress.machineInventory[action.machineId]!--; return out;
  }
  if (action.type === "moveStation" || action.type === "rotate" || action.type === "store") {
    if (!Number.isInteger(action.stationId)) return fail("Choose a machine.");
    const station = progress.layout.find(s => s.id === action.stationId); if (!station) return fail("That machine is not placed.");
    if (action.type === "store") { progress.layout = progress.layout.filter(s => s.id !== station.id); progress.machineInventory[station.machineId] = (progress.machineInventory[station.machineId] ?? 0) + 1; return out; }
    if (action.type === "moveStation" && (!validPoint(action.x, action.y) || !validFacing(action.facing))) return fail("Choose a valid floor tile and orientation.");
    const updated = action.type === "rotate" ? { ...station, facing: ((station.facing + 1) % 4) as TruckFacing } : { ...station, x: action.x, y: action.y, facing: action.facing ?? station.facing };
    const error = replaceLayout(progress.layout.map(s => s.id === station.id ? updated : s)); return error ? fail(error) : out;
  }
  if (action.type === "buyMachine") {
    const machine = truckMachine(action.machineId);
    if (!machine || !progress.unlockedMachineIds.includes(machine.id) || machine.cost <= 0) return fail("Find this machine on your route first.");
    if (!afford(machine.cost)) return fail(`You need ${machine.cost} coins for this machine.`);
    if ((progress.machineInventory[machine.id] ?? 0) >= 99) return fail("Your storage has enough of this machine.");
    progress.machineInventory[machine.id] = (progress.machineInventory[machine.id] ?? 0) + 1; out.coinDelta -= machine.cost; return out;
  }
  if (action.type === "buySize") {
    const index = TRUCK_SIZES.findIndex(s => s.id === action.size), current = TRUCK_SIZES.findIndex(s => s.id === progress.size);
    if (index !== current + 1) return fail("Choose the next truck size.");
    const size = TRUCK_SIZES[index]; if (progress.bestDay < size.unlockNode) return fail(`Clear service day ${size.unlockNode} to unlock this truck.`);
    if (!afford(size.cost)) return fail(`You need ${size.cost} coins for this truck.`);
    const error = validateTruckLayout(size.id, progress.layout); if (error) return fail(error);
    progress.size = size.id; out.coinDelta -= size.cost; return out;
  }
  if (action.type === "hire") {
    if (!ROLES.includes(action.role) || progress.crew.some(c => c.role === action.role)) return fail("Choose a helper you have not hired yet.");
    if (progress.crew.length >= truckSize(progress.size).helpers) return fail("A larger truck has room for more helpers.");
    const cost = TRUCK_PRICES.hire[action.role]; if (!afford(cost)) return fail(`You need ${cost} coins to hire this helper.`);
    progress.crew.push({ id: Math.max(0, ...progress.crew.map(c => c.id)) + 1, role: action.role, look: progress.crew.length + 1 }); out.coinDelta -= cost; return out;
  }
  if (action.type === "upgrade") {
    if (!TECHS.includes(action.tech)) return fail("Choose a kitchen upgrade.");
    const level = progress.techLevels[action.tech]; if (level >= 3) return fail("This upgrade is mastered.");
    const cost = TRUCK_PRICES.tech[level]; if (!afford(cost)) return fail(`You need ${cost} coins for this upgrade.`);
    progress.techLevels[action.tech]++; out.coinDelta -= cost; return out;
  }
  if (action.type === "setCrew") { if (!Number.isInteger(action.look) || action.look < 0 || action.look > 7) return fail("Choose a chef appearance."); progress.chefLook = action.look; return out; }
  if (action.type === "setCosmetic") {
    if (action.color === undefined && action.sign === undefined) return fail("Choose a paint color or sign.");
    if (action.color !== undefined && !(TRUCK_COLORS as readonly string[]).includes(action.color)) return fail("Choose a truck paint color.");
    if (action.sign !== undefined && (typeof action.sign !== "string" || action.sign.trim().length < 1 || action.sign.length > 24 || /[\x00-\x1f]/.test(action.sign))) return fail("Use 1–24 letters for your truck sign.");
    if (action.color !== undefined) progress.color = action.color;
    if (action.sign !== undefined) progress.sign = action.sign.trim();
    return out;
  }
  return fail("That truck action is not supported.");
}

/** Persistence validation is not an authority boundary. Connected rewards use a
 * server-created ledger and command replay, never a submitted saved truck. */
export function sanitizeTruckProgress(value: unknown): TruckProgress {
  const raw = object(value), progress = createTruckProgress();
  if (!Object.keys(raw).length) return progress;
  if (TRUCK_SIZES.some(s => s.id === raw.size)) progress.size = raw.size as TruckSize;
  const knownMachine = (id: unknown): id is TruckMachineId => typeof id === "string" && TRUCK_MACHINES.some(m => m.id === id);
  const ids = Array.isArray(raw.unlockedMachineIds) ? raw.unlockedMachineIds.filter(knownMachine) : [];
  progress.unlockedMachineIds = [...new Set([...BASE_MACHINES, ...ids])];
  const stock = object(raw.machineInventory);
  for (const id of progress.unlockedMachineIds) if (typeof stock[id] === "number") progress.machineInventory[id] = int(stock[id], 0, 99);
  for (const tech of TECHS) progress.techLevels[tech] = int(object(raw.techLevels)[tech], 0, 3);
  const roles = new Set<TruckRole>();
  if (Array.isArray(raw.crew)) for (const entry of raw.crew.slice(0, truckSize(progress.size).helpers)) {
    const crew = object(entry), role = crew.role as TruckRole;
    if (ROLES.includes(role) && !roles.has(role)) { progress.crew.push({ id: progress.crew.length + 1, role, look: int(crew.look, 0, 7) }); roles.add(role); }
  }
  const placements = (input: unknown): TruckPlacement[] | null => {
    if (!Array.isArray(input) || input.length > 60) return null;
    const result: TruckPlacement[] = [];
    for (const entry of input) {
      const s = object(entry);
      if (!knownMachine(s.machineId) || !Number.isInteger(s.id) || !Number.isInteger(s.x) || !Number.isInteger(s.y) || ![0, 1, 2, 3].includes(s.facing as number)) return null;
      result.push({ id: s.id as number, machineId: s.machineId, x: s.x as number, y: s.y as number, facing: s.facing as TruckFacing });
    }
    return result;
  };
  const savedLayout = placements(raw.layout);
  if (savedLayout && !validateTruckLayout(progress.size, savedLayout)) {
    progress.layout = savedLayout;
    for (const station of savedLayout) if (!progress.unlockedMachineIds.includes(station.machineId)) progress.unlockedMachineIds.push(station.machineId);
  }
  progress.nextStationId = Math.max(int(raw.nextStationId, 1, 1_000_000, 8), ...progress.layout.map(s => s.id + 1));
  progress.firstClears = [...new Set((Array.isArray(raw.firstClears) ? raw.firstClears : []).filter((id): id is number => Number.isInteger(id) && id >= 1 && id <= 12))].sort((a, b) => a - b);
  progress.bestDay = Math.max(0, ...progress.firstClears.map(id => TRUCK_LADDER[id - 1].serviceDay));
  progress.nextNode = int(raw.nextNode, 1, 12, 1); progress.challengeNext = raw.challengeNext === true;
  progress.color = (TRUCK_COLORS as readonly unknown[]).includes(raw.color) ? raw.color as string : "tomato";
  progress.sign = typeof raw.sign === "string" && raw.sign.trim() ? raw.sign.replace(/[\x00-\x1f]/g, "").trim().slice(0, 24) : "My Food Truck";
  progress.chefLook = int(raw.chefLook, 0, 7); progress.attempts = int(raw.attempts, 0, 1_000_000);
  const last = object(raw.lastResult);
  if ((last.outcome === "cleared" || last.outcome === "failed") && Number.isInteger(last.node) && (last.node as number) >= 1 && (last.node as number) <= 12) {
    progress.lastResult = { node: last.node as number, outcome: last.outcome, served: int(last.served, 0, 30), coins: int(last.coins, 0, 500), practice: last.practice === true, reason: typeof last.reason === "string" ? last.reason.slice(0, 300) : null };
  }
  // A valid active run must retain the exact frozen layout and in-flight jobs.
  // Broken transient data is discarded without touching permanent possessions.
  const r = object(raw.run), node = TRUCK_LADDER.find(n => n.id === r.node && n.kind === "service");
  if (!node || typeof r.id !== "string" || r.id.length > 120 || !["playing", "paused", "cleared", "failed"].includes(r.phase as string)) return progress;
  const l = object(r.loadout), layout = placements(l.layout);
  if (!TRUCK_SIZES.some(s => s.id === l.size) || !layout || validateTruckLayout(l.size as TruckSize, layout)) return progress;
  const loadout: TruckLoadout = { size: l.size as TruckSize, layout, techLevels: { prep: 0, cook: 0, service: 0 }, crew: [], color: (TRUCK_COLORS as readonly unknown[]).includes(l.color) ? l.color as string : progress.color, sign: typeof l.sign === "string" ? l.sign.slice(0, 24) : progress.sign, recipeLevels: {} };
  for (const tech of TECHS) loadout.techLevels[tech] = int(object(l.techLevels)[tech], 0, 3);
  for (const recipe of Object.values(TRUCK_DISH_RECIPES)) if (typeof object(l.recipeLevels)[recipe] === "number") loadout.recipeLevels[recipe] = int(object(l.recipeLevels)[recipe], 1, 3, 1);
  if (Array.isArray(l.crew)) for (const entry of l.crew.slice(0, truckSize(loadout.size).helpers)) {
    const c = object(entry); if (!ROLES.includes(c.role as TruckRole) || loadout.crew.some(h => h.id === c.id || h.role === c.role) || !Number.isInteger(c.id)) return progress;
    loadout.crew.push({ id: c.id as number, role: c.role as TruckRole, look: int(c.look, 0, 7) });
  }
  const itemIds = new Set<number>(); let invalid = false;
  const readItem = (input: unknown): TruckItem | null => {
    if (input == null) return null;
    const it = object(input);
    if (!Number.isInteger(it.id) || (it.id as number) < 1 || !ITEM_KINDS.includes(it.kind as TruckItemKind) || itemIds.has(it.id as number)) { invalid = true; return null; }
    itemIds.add(it.id as number); return { id: it.id as number, kind: it.kind as TruckItemKind };
  };
  const stations: TruckStation[] = [];
  if (!Array.isArray(r.stations) || r.stations.length !== layout.length) return progress;
  for (const base of layout) {
    const s = object(r.stations.find(entry => object(entry).id === base.id));
    if (s.machineId !== base.machineId || s.x !== base.x || s.y !== base.y || s.facing !== base.facing) return progress;
    const p = object(s.processing); let processing: TruckStation["processing"] = null;
    if (s.processing != null) {
      if (!ITEM_KINDS.includes(p.output as TruckItemKind) || !(p.owner === null || p.owner === "player" || loadout.crew.some(c => c.id === p.owner)) || !Number.isInteger(p.remaining) || !Number.isInteger(p.total) || (p.remaining as number) < 1 || (p.remaining as number) > (p.total as number) || (p.total as number) > 1200) return progress;
      processing = { output: p.output as TruckItemKind, owner: p.owner as number | "player" | null, remaining: p.remaining as number, total: p.total as number };
    }
    const held = readItem(s.item); if (processing && !held) return progress;
    stations.push({ ...base, item: held, processing, readyTicks: int(s.readyTicks, 0, 601) });
  }
  const readPerson = (input: unknown): TruckPerson | null => {
    const p = object(input), position = { x: p.x as number, y: p.y as number };
    if (!open(loadout.size, layout, position) || !Array.isArray(p.path) || p.path.length > 60 || ![0, 1, 2, 3].includes(p.facing as number)) return null;
    const actor: TruckPerson = { ...person(position), facing: p.facing as TruckFacing, held: readItem(p.held), moveTicks: int(p.moveTicks, 0, 5) };
    let cursor = position;
    for (const point of p.path) { const rawPoint = object(point), next = { x: rawPoint.x as number, y: rawPoint.y as number }; if (!near(cursor, next) || !open(loadout.size, layout, next)) return null; actor.path.push(next); cursor = next; }
    if (p.pending != null) { const pending = object(p.pending); if (!stations.some(s => s.id === pending.stationId) || ![undefined, "pasta", "salad", "fries", "drink", "cup", "tomato"].includes(pending.choice as string)) return null; actor.pending = { stationId: pending.stationId as number, ...(pending.choice !== undefined ? { choice: pending.choice as TruckIngredientChoice } : {}) }; }
    if (p.job != null) { const j = object(p.job), station = stations.find(s => s.id === j.stationId); if (!station?.processing || !near(actor, station)) return null; actor.job = { stationId: station.id, remaining: station.processing.remaining, total: station.processing.total }; }
    return actor;
  };
  const player = readPerson(r.player); if (!player || !Array.isArray(r.helpers) || r.helpers.length !== loadout.crew.length) return progress;
  const helpers: TruckHelper[] = [];
  for (const c of loadout.crew) { const helper = readPerson(r.helpers.find(entry => object(entry).id === c.id)); if (!helper) return progress; helpers.push({ ...helper, ...c }); }
  if (invalid || !Array.isArray(r.customers) || r.customers.length > truckSize(loadout.size).customers) return progress;
  const menu = truckMenu(layout, node); if (!menu.length) return progress;
  const customers: TruckCustomer[] = [];
  for (const entry of r.customers) {
    const c = object(entry); if (!Number.isInteger(c.id) || itemIds.has(c.id as number) || customers.some(v => v.id === c.id) || !menu.includes(c.dish as TruckDish)) return progress;
    const maxPatience = int(c.maxPatience, 1, 10_000), patience = int(c.patience, 0, maxPatience);
    customers.push({ id: c.id as number, dish: c.dish as TruckDish, maxPatience, patience });
  }
  progress.run = { id: r.id, node: node.id, practice: r.practice === true, challenge: r.challenge === true, seed: int(r.seed, 0, 4294967295), tick: int(r.tick, 0, 100_000), phase: r.phase as TruckRun["phase"], failure: typeof r.failure === "string" ? r.failure.slice(0, 300) : null,
    loadout, menu, stations, player, helpers, customers, nextCustomerIn: int(r.nextCustomerIn, -100_000, 100_000), remainingTicks: int(r.remainingTicks, 0, node.seconds * TRUCK_TICK_RATE),
    served: int(r.served, 0, node.target), target: node.target, coinsEarned: int(r.coinsEarned, 0, 500), dirtyDishes: int(r.dirtyDishes, 0, 99), cleanPlates: int(r.cleanPlates, 0, 99),
    nextId: Math.max(int(r.nextId, 100, 1_000_000), ...itemIds, ...customers.map(c => c.id)) + (int(r.nextId, 100, 1_000_000) <= Math.max(0, ...itemIds, ...customers.map(c => c.id)) ? 1 : 0), rewardClaimed: r.rewardClaimed === true || r.phase === "cleared", notice: typeof r.notice === "string" ? r.notice.slice(0, 300) : "" };
  return progress;
}
