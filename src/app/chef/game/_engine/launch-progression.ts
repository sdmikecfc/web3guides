/** Shared launch progression. Rewards are kitchen items, never token payouts.
 * The server supplies trusted actions/time; the guest simulation supplies its
 * own validated actions. None of these helpers authenticates client evidence.
 */
import { footprintCells, itemDef } from "./items";
import { DISHES, STARTER_DISH_IDS } from "./cookbook";
import { COMMONS, RARES, MAX_DISH_LEVEL } from "./pantry";

export const LAUNCH_RULES = {
  version: 3,
  passiveCoinsPerDay: 80,
  passiveCoinsPerHour: 10,
  passiveHours: 8,
  careSteps: 3,
  careStepCooldownMs: 650,
  dailyGoalCoins: 20,
  shiftGoals: 3,
  expansions: [
    { coins: 0, upgradedDishes: 0, masteredDishes: 0 },
    { coins: 1200, upgradedDishes: 2, masteredDishes: 0 },
    { coins: 3500, upgradedDishes: 3, masteredDishes: 2 },
  ],
} as const;
const DAY_MS = 86_400_000;
const MAX_DAY = 100_000;
export type LaunchGoalId = "serve" | "prep" | "care" | "decorate" | "special";
export type LaunchActivity = "serve" | "prep" | "clean" | "repair" | "upgrade" | "decorate" | "special";
export interface CareTarget { kind: "table" | "toilet" | "stove" | "floor"; gx: number; gy: number; itemId?: string }
export interface CareTask { id: string; kind: "clean" | "repair"; target: CareTarget; steps: number; progress: number }
export interface LaunchReward { coins: number; stock: Record<string, number>; shiftCompleted?: boolean }
export interface LaunchProgress {
  version: 1;
  day: number;
  counts: Record<LaunchActivity, number>;
  claimed: LaunchGoalId[];
  careTasks: CareTask[];
  completedDays: number;
  shiftClaimed: boolean;
  passive: { day: number; coins: number; remainder: number; lastSettledAt: number };
}
export interface LaunchGoal { id: LaunchGoalId; label: string; current: number; target: number; ready: boolean; claimed: boolean; reward: LaunchReward }
type Layout = readonly { itemId: string; gx: number; gy: number; facing?: string }[];
type Room = { w: number; h: number; door?: { x: number; y: number } };
const ACTIVITIES: LaunchActivity[] = ["serve", "prep", "clean", "repair", "upgrade", "decorate", "special"];
const GOALS: { id: LaunchGoalId; label: string; target: number }[] = [
  { id: "serve", label: "Serve 5 dishes", target: 5 },
  { id: "care", label: "Finish 3 care jobs", target: 3 },
  { id: "prep", label: "Prepare today's special", target: 1 },
  { id: "special", label: "Serve 3 daily specials", target: 3 },
  { id: "decorate", label: "Keep a decorating change", target: 1 },
];
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const num = (value: unknown, max: number, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.floor(value))) : fallback;

function floorTarget(layout: Layout, room: Room, offset: number): CareTarget {
  const blocked = new Set<string>();
  for (const p of layout) if (itemDef(p.itemId)?.solid) {
    for (const c of footprintCells(p.itemId, p.gx, p.gy, p.facing as "se" | "sw" | "nw" | "ne" ?? "se")) blocked.add(`${c.x},${c.y}`);
  }
  const open: CareTarget[] = [];
  // Keep the marker inside the dining room, clear of the cutaway storefront.
  // Stable distance ordering also gives an empty room three distinct jobs.
  for (let gy = 0; gy < room.h; gy++) for (let gx = 0; gx < room.w; gx++) {
    if (!blocked.has(`${gx},${gy}`)) open.push({ kind: "floor", gx, gy });
  }
  const wantX = Math.min(room.w - 2, Math.max(1, (room.door?.x ?? Math.floor(room.w / 2)) + 2));
  const wantY = Math.max(1, room.h - 3);
  const edge = (p: CareTarget) => p.gx < 1 || p.gx >= room.w - 1 || p.gy < 1 || p.gy >= room.h - 1 ? 1 : 0;
  const distance = (p: CareTarget) => Math.abs(p.gx - wantX) + Math.abs(p.gy - wantY);
  open.sort((a, b) => edge(a) - edge(b) || distance(a) - distance(b) || a.gy - b.gy || a.gx - b.gx);
  return open[offset % Math.max(1, open.length)] ?? { kind: "floor", gx: room.door?.x ?? 0, gy: room.door?.y ?? room.h - 1 };
}

/** Retarget moved/stored fixtures while retaining every step and reward receipt. */
export function syncCareTasks(progress: LaunchProgress, layout: Layout, room: Room): void {
  const preferred: CareTarget["kind"][] = ["table", "toilet", "floor"];
  progress.careTasks = preferred.map((kind, index) => {
    const id = `${progress.day}:care:${index}`, previous = progress.careTasks.find(t => t.id === id);
    let target: CareTarget | undefined;
    if (kind !== "floor") {
      const existing = previous?.target;
      const piece = layout.find(p => itemDef(p.itemId)?.kind === kind && existing?.gx === p.gx && existing?.gy === p.gy)
        ?? layout.find(p => itemDef(p.itemId)?.kind === kind)
        ?? (kind === "toilet" ? layout.find(p => itemDef(p.itemId)?.kind === "stove") : undefined);
      if (piece) target = { kind: itemDef(piece.itemId)!.kind as CareTarget["kind"], gx: piece.gx, gy: piece.gy, itemId: piece.itemId };
    }
    target ??= floorTarget(layout, room, index);
    return { id, kind: index === 1 && target.kind !== "floor" ? "repair" : "clean", target, steps: LAUNCH_RULES.careSteps, progress: num(previous?.progress, LAUNCH_RULES.careSteps) };
  });
}

export function createLaunchProgress(day: number, layout: Layout, room: Room): LaunchProgress {
  const safeDay = num(day, MAX_DAY);
  const progress: LaunchProgress = {
    version: 1, day: safeDay,
    counts: { serve: 0, prep: 0, clean: 0, repair: 0, upgrade: 0, decorate: 0, special: 0 },
    claimed: [], careTasks: [], completedDays: 0, shiftClaimed: false,
    passive: { day: safeDay, coins: 0, remainder: 0, lastSettledAt: 0 },
  };
  syncCareTasks(progress, layout, room);
  return progress;
}

export function sanitizeLaunchProgress(value: unknown, day: number, layout: Layout, room: Room): LaunchProgress {
  const raw = object(value), progress = createLaunchProgress(num(raw.day, MAX_DAY, num(day, MAX_DAY)), layout, room);
  if (raw.version !== 1) return progress;
  const counts = object(raw.counts), passive = object(raw.passive);
  for (const key of ACTIVITIES) progress.counts[key] = num(counts[key], key === "serve" || key === "special" ? 100_000 : 100);
  progress.claimed = GOALS.map(g => g.id).filter(id => Array.isArray(raw.claimed) && raw.claimed.includes(id));
  progress.completedDays = num(raw.completedDays, MAX_DAY);
  progress.shiftClaimed = raw.shiftClaimed === true;
  const tasks = Array.isArray(raw.careTasks) ? raw.careTasks : [];
  for (const task of progress.careTasks) {
    const prior = tasks.map(object).find(t => t.id === task.id);
    task.progress = num(prior?.progress, task.steps);
    const target = object(prior?.target);
    if (target.kind === task.target.kind && typeof target.gx === "number" && typeof target.gy === "number") task.target = { ...task.target, gx: num(target.gx, room.w - 1), gy: num(target.gy, room.h - 1) };
  }
  progress.passive = {
    day: num(passive.day, MAX_DAY, progress.day), coins: num(passive.coins, LAUNCH_RULES.passiveCoinsPerDay * 1.5),
    remainder: typeof passive.remainder === "number" && Number.isFinite(passive.remainder) ? Math.max(0, Math.min(.999999999, passive.remainder)) : 0,
    lastSettledAt: num(passive.lastSettledAt, Number.MAX_SAFE_INTEGER),
  };
  syncCareTasks(progress, layout, room);
  rollLaunchDay(progress, day, layout, room);
  return progress;
}

/** Day rollback never re-arms goals or chores. */
export function rollLaunchDay(progress: LaunchProgress, day: number, layout: Layout, room: Room): boolean {
  const safeDay = num(day, MAX_DAY);
  if (safeDay <= progress.day) { syncCareTasks(progress, layout, room); return false; }
  const next = createLaunchProgress(safeDay, layout, room);
  Object.assign(progress, next, { completedDays: progress.completedDays, passive: progress.passive });
  return true;
}

export function recordLaunchActivity(progress: LaunchProgress, type: LaunchActivity, count = 1): void {
  if (!ACTIVITIES.includes(type) || !Number.isFinite(count) || count <= 0) return;
  progress.counts[type] = Math.min(100_000, progress.counts[type] + Math.floor(count));
}

export function dailyGoals(progress: LaunchProgress): LaunchGoal[] {
  return GOALS.map((goal, index) => {
    const count = goal.id === "care" ? progress.careTasks.filter(t => t.progress >= t.steps).length : progress.counts[goal.id];
    const claimed = progress.claimed.includes(goal.id);
    return { ...goal, current: Math.min(goal.target, count), ready: count >= goal.target && !claimed, claimed,
      reward: { coins: LAUNCH_RULES.dailyGoalCoins, stock: { [COMMONS[(progress.day + index) % COMMONS.length]]: 1 } } };
  });
}

/** Claim the goal once; the third claim includes the day's single rare reward. */
export function claimLaunchGoal(progress: LaunchProgress, id: LaunchGoalId): LaunchReward | null {
  const goal = dailyGoals(progress).find(g => g.id === id);
  if (!goal?.ready) return null;
  progress.claimed.push(id);
  const reward: LaunchReward = { coins: goal.reward.coins, stock: { ...goal.reward.stock } };
  if (!progress.shiftClaimed && progress.claimed.length >= LAUNCH_RULES.shiftGoals) {
    progress.shiftClaimed = true; progress.completedDays++;
    reward.stock[RARES[progress.day % RARES.length]] = 1;
    reward.shiftCompleted = true;
  }
  return reward;
}

/** Callers enforce real interaction cooldowns and check the target still exists. */
export function advanceCareTask(progress: LaunchProgress, id: string): { task: CareTask; done: boolean } | null {
  const task = progress.careTasks.find(t => t.id === id);
  if (!task || task.progress >= task.steps) return null;
  task.progress++;
  const done = task.progress === task.steps;
  if (done) recordLaunchActivity(progress, task.kind);
  return { task, done };
}

export function dishEarningsMultiplier(levels: Record<string, number>, selected: readonly string[] = STARTER_DISH_IDS): number {
  const known = [...new Set(selected)].filter(id => DISHES.some(d => d.id === id));
  if (!known.length) return 1;
  return known.reduce((total, id) => total + 1 + Math.max(0, num(levels[id], MAX_DISH_LEVEL, 1) - 1) * .25, 0) / known.length;
}
export function passiveTerms(levels: Record<string, number>, selected?: readonly string[]) {
  const multiplier = dishEarningsMultiplier(levels, selected);
  return { multiplier, coinsPerHour: LAUNCH_RULES.passiveCoinsPerHour * multiplier, dailyCap: LAUNCH_RULES.passiveCoinsPerDay * multiplier, maxHours: LAUNCH_RULES.passiveHours };
}

/** UTC purse, fractional carry, bounded absence, and receipt-based replay guard. */
export function accruePassiveCoins(progress: LaunchProgress, elapsedMs: number, now: number, efficiency = 1, masteryMultiplier = 1): number {
  if (!Number.isFinite(now) || now < 0 || now > (MAX_DAY + 1) * DAY_MS || !Number.isFinite(elapsedMs) || elapsedMs <= 0 || now <= progress.passive.lastSettledAt) return 0;
  let start = Math.max(0, now - Math.min(elapsedMs, LAUNCH_RULES.passiveHours * 3_600_000), progress.passive.lastSettledAt);
  const multiplier = Math.max(1, Math.min(1.5, Number.isFinite(masteryMultiplier) ? masteryMultiplier : 1));
  const productive = Math.max(0, Math.min(1, Number.isFinite(efficiency) ? efficiency : 0));
  const cap = LAUNCH_RULES.passiveCoinsPerDay * multiplier;
  let coins = 0;
  while (start < now) {
    const day = Math.floor(start / DAY_MS), end = Math.min(now, (day + 1) * DAY_MS);
    if (day >= progress.passive.day) {
      if (day > progress.passive.day) progress.passive = { day, coins: 0, remainder: 0, lastSettledAt: progress.passive.lastSettledAt };
      const raw = Math.min(Math.max(0, cap - progress.passive.coins), progress.passive.remainder + (end - start) / 3_600_000 * LAUNCH_RULES.passiveCoinsPerHour * multiplier * productive);
      const earned = Math.floor(raw + 1e-10);
      progress.passive.coins += earned; progress.passive.remainder = Math.max(0, raw - earned); coins += earned;
    }
    start = end;
  }
  progress.passive.lastSettledAt = now;
  return coins;
}

export function expansionRequirements(shellIdx: number, levels: Record<string, number>, coins: number) {
  const nextShell = shellIdx + 1, rule = LAUNCH_RULES.expansions[nextShell];
  if (!rule) return null;
  const actual = DISHES.map(d => levels[d.id] ?? 1);
  const upgradedDishes = actual.filter(level => level >= 2).length, masteredDishes = actual.filter(level => level >= MAX_DISH_LEVEL).length;
  const goals = [
    { id: "coins", label: "Kitchen coins", current: coins, target: rule.coins, ready: coins >= rule.coins },
    { id: "upgraded", label: "Recipes at level 2 or higher", current: upgradedDishes, target: rule.upgradedDishes, ready: upgradedDishes >= rule.upgradedDishes },
    ...(rule.masteredDishes ? [{ id: "mastered", label: "Mastered recipes", current: masteredDishes, target: rule.masteredDishes, ready: masteredDishes >= rule.masteredDishes }] : []),
  ];
  return { nextShell, coins: rule.coins, upgradedDishes: rule.upgradedDishes, masteredDishes: rule.masteredDishes, goals, allowed: goals.every(g => g.ready) };
}
