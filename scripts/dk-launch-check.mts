import assert from "node:assert/strict";
import { LAUNCH_RULES, accruePassiveCoins, advanceCareTask, claimLaunchGoal, createLaunchProgress, dailyGoals, dishEarningsMultiplier, expansionRequirements, passiveTerms, recordLaunchActivity, rollLaunchDay, sanitizeLaunchProgress, syncCareTasks } from "../src/app/chef/game/_engine/launch-progression";
import { createWorld, applyAction, applyCanonicalLaunch, setCareJobsActive, stepWorld, WORLD_FIXED_DT } from "../src/app/chef/game/_engine/world";
import { SHELL, SHELL_SIZES, starterLayout } from "../src/app/chef/game/_engine/rooms";
import { sanitizeSave, serializeSave, layoutFromSave } from "../src/app/chef/game/_engine/save";
import { DAILY_SPECIALS, RARES } from "../src/app/chef/game/_engine/pantry";

const DAY_MS = 86_400_000, HOUR = 3_600_000;
const start = Date.UTC(2026, 8, 16), day = start / DAY_MS;
const create = () => createLaunchProgress(day, starterLayout(), SHELL);
const tick = (world: ReturnType<typeof createWorld>, seconds: number) => { for (let n = 0; n < Math.ceil(seconds / WORLD_FIXED_DT); n++) stepWorld(world, SHELL_SIZES[world.shellIdx]); };

{
  const world = createWorld("launch-opening-guide", SHELL, { utcDay: day, careJobsActive: false });
  assert.ok(world.toilets.every(toilet => !toilet.broken), "pristine opening has no hidden authored damage");
  const before = JSON.stringify(world.launch), coins = world.playMoney;
  tick(world, 30);
  assert.ok(world.stats.served >= 1, "first guest receives a plate during the guide");
  assert.ok(world.toilets.every(toilet => !toilet.broken));
  assert.equal(applyAction(world, SHELL, { type: "careTask", taskId: world.launch.careTasks[1].id }), false, "hidden care cannot be clicked early");
  applyCanonicalLaunch(world, JSON.parse(before));
  assert.ok(world.toilets.every(toilet => !toilet.broken), "server polling does not arm hidden jobs");
  const save = sanitizeSave(serializeSave(world, "trattoria"));
  assert.ok(!("careJobsActive" in save), "the guide gate is not progression data");
  const reloaded = createWorld("launch-opening-guide", SHELL, { utcDay: save.utcDay, layout: layoutFromSave(save), launch: save.launch, careJobsActive: false });
  assert.ok(reloaded.toilets.every(toilet => !toilet.broken), "unfinished guide reload stays welcoming");
  const receipts = JSON.stringify(reloaded.launch);
  setCareJobsActive(reloaded, true);
  assert.equal(reloaded.toilets.filter(toilet => toilet.broken).length, 1, "finishing or skipping guide arms the visible repair");
  setCareJobsActive(reloaded, true);
  assert.equal(JSON.stringify(reloaded.launch), receipts); assert.equal(reloaded.playMoney, coins);
  console.log("ok opening guide defers authored damage through first service, canonical polling, and reload without changing receipts");
}
{
  const legacy = sanitizeSave({ v: 7, savedAt: start, utcDay: day, coins: 2345, shell: 2, layout: starterLayout(), pantry: { levels: { margherita: 3, caciopepe: 2 } }, daily: { prepped: true, firstServePaid: true, potPaid: true } });
  assert.equal(legacy.coins, 2345); assert.equal(legacy.shell, 2); assert.equal(legacy.pantry.levels.margherita, 3);
  assert.equal(legacy.daily.firstServePaid, true); assert.equal(legacy.daily.potPaid, true);
  assert.equal(legacy.launch.careTasks.length, 3); assert.equal(dailyGoals(legacy.launch).length, 5);
  assert.ok(!dailyGoals(legacy.launch).some(g => String(g.id) === "upgrade"), "finite recipe upgrades are not mandatory recurring goals");
  console.log("ok legacy balances, owned room size, recipe mastery, and old daily receipts survive migration");
}
{
  const p = create();
  assert.equal(accruePassiveCoins(p, 24 * HOUR, start + 8 * HOUR), 80, "long absence banks at most eight hours");
  assert.equal(accruePassiveCoins(p, 8 * HOUR, start + 8 * HOUR), 0, "duplicate settlement");
  assert.equal(accruePassiveCoins(p, HOUR, start + 7 * HOUR), 0, "clock rollback");
  assert.equal(accruePassiveCoins(p, HOUR, start + 9 * HOUR), 0, "same-day cap survives repeated settles");
  const saved = sanitizeLaunchProgress(JSON.parse(JSON.stringify(p)), day, starterLayout(), SHELL);
  assert.equal(accruePassiveCoins(saved, HOUR, start + 10 * HOUR), 0, "reload cannot reset the purse");
  assert.equal(accruePassiveCoins(saved, HOUR, start + DAY_MS + HOUR), 10, "next UTC day has its own proportional allowance");
  assert.equal(accruePassiveCoins(saved, HOUR, Infinity), 0);
  const mastered = create();
  assert.equal(accruePassiveCoins(mastered, 8 * HOUR, start + 8 * HOUR, 1, 1.5), 120);
  assert.equal(passiveTerms({ margherita: 3 }, ["margherita"]).dailyCap, 120);
  assert.equal(dishEarningsMultiplier({ margherita: 2 }, ["margherita"]), 1.25);
  assert.equal(dishEarningsMultiplier({ margherita: 1, caciopepe: 3 }, ["margherita", "caciopepe"]), 1.25);
  assert.equal(dishEarningsMultiplier({ margherita: NaN }, ["margherita"]), 1);
  console.log("ok bounded passive purse, repeat/reload/rollback, next-day credit, and selected recipe mastery earnings");
}
{
  const whole = create(), pieces = create();
  const begin = start + 22 * HOUR, duration = 4 * HOUR;
  whole.passive.lastSettledAt = begin; pieces.passive.lastSettledAt = begin;
  const amount = accruePassiveCoins(whole, duration, begin + duration, .63, 1.25);
  let split = 0;
  for (let n = 1; n <= 240; n++) split += accruePassiveCoins(pieces, 60_000, begin + n * 60_000, .63, 1.25);
  assert.equal(split, amount, "fractional coins must not depend on polling frequency");
  assert.equal(pieces.passive.day, whole.passive.day);
  assert.equal(pieces.passive.coins, whole.passive.coins);
  assert.ok(Math.abs(pieces.passive.remainder - whole.passive.remainder) < 1e-8);
  console.log("ok minute-by-minute and single settlement agree across midnight");
}
{
  const p = create(), task = p.careTasks[1];
  assert.ok(advanceCareTask(p, task.id));
  const reduced = starterLayout().filter(p => p.itemId !== "toilet_basic" && p.itemId !== "stove_basic");
  syncCareTasks(p, reduced, SHELL);
  assert.equal(p.careTasks[1].id, task.id); assert.equal(p.careTasks[1].progress, 1); assert.equal(p.careTasks[1].target.kind, "floor");
  while (advanceCareTask(p, task.id)) { /* finite remaining steps */ }
  syncCareTasks(p, starterLayout(), SHELL);
  assert.equal(p.careTasks[1].progress, 3, "adding a fixture back cannot respawn completed work");
  const empty = createLaunchProgress(day, [], SHELL);
  assert.ok(empty.careTasks.every(t => t.target.kind === "floor" && t.kind === "clean"));
  assert.equal(new Set(empty.careTasks.map(t => `${t.target.gx},${t.target.gy}`)).size, 3);
  assert.ok(empty.careTasks.every(t => t.target.gx > 0 && t.target.gx < SHELL.w - 1 && t.target.gy > 0 && t.target.gy < SHELL.h - 1), "floor job markers stay inside the restaurant");
  console.log("ok moved/removed fixtures retarget without losing or rearming care progress; empty rooms remain playable");
}
{
  const world = createWorld("launch-care", SHELL, { utcDay: day, maintenance: { cleanliness: 20, equipment: 20, lastSettledAt: start } });
  const repairTask = world.launch.careTasks.find(t => t.kind === "repair")!;
  const toilet = world.toilets.find(t => t.gx === repairTask.target.gx && t.gy === repairTask.target.gy)!;
  assert.equal(toilet.broken, true);
  assert.equal(applyAction(world, SHELL, { type: "fixToilet", uid: toilet.uid }), false, "single click cannot bypass the daily repair job");
  assert.ok(applyAction(world, SHELL, { type: "careTask", taskId: repairTask.id }));
  assert.equal(applyAction(world, SHELL, { type: "careTask", taskId: repairTask.id }), false, "rapid repeated click rejected");
  const save = sanitizeSave(serializeSave(world, "trattoria"));
  const reloaded = createWorld("launch-care", SHELL, { utcDay: save.utcDay, launch: save.launch, layout: layoutFromSave(save), maintenance: save.maintenance, playMoney: save.coins });
  assert.equal(reloaded.launch.careTasks.find(t => t.id === repairTask.id)!.progress, 1);
  tick(reloaded, 10);
  assert.equal(reloaded.launch.careTasks.find(t => t.id === repairTask.id)!.progress, 1, "staff cannot complete the player's authored job");
  assert.equal(reloaded.toilets.find(t => t.gx === repairTask.target.gx && t.gy === repairTask.target.gy)!.broken, true);
  for (const taskId of reloaded.launch.careTasks.map(t => t.id)) while (reloaded.launch.careTasks.find(t => t.id === taskId)!.progress < LAUNCH_RULES.careSteps) {
    tick(reloaded, .7);
    assert.ok(applyAction(reloaded, SHELL, { type: "careTask", taskId }));
  }
  assert.equal(reloaded.maintenance.cleanliness, 100); assert.equal(reloaded.maintenance.equipment, 100);
  assert.ok(applyAction(reloaded, SHELL, { type: "claimDailyGoal", goalId: "care" }));
  assert.equal(reloaded.playMoney, save.coins + 20);
  assert.equal(applyAction(reloaded, SHELL, { type: "claimDailyGoal", goalId: "care" }), false);
  console.log("ok concrete three-step care: cooldown, partial reload, no staff completion, full restoration, one reward");
}
{
  const world = createWorld("launch-canonical-care", SHELL, { utcDay: day });
  const canonical: typeof world.launch = JSON.parse(JSON.stringify(world.launch));
  const repair = canonical.careTasks.find(t => t.kind === "repair")!;
  const toilet = world.toilets.find(t => t.gx === repair.target.gx && t.gy === repair.target.gy)!;
  const coins = world.playMoney, stock = JSON.stringify(world.pantry.stock);
  repair.progress = repair.steps;
  world.maintenance = { cleanliness: 45, equipment: 100, lastSettledAt: start };
  applyCanonicalLaunch(world, canonical);
  assert.equal(toilet.broken, false, "server repair receipt clears the actual broken fixture");
  assert.equal(world.maintenance.cleanliness, 45, "canonical condition must not receive a second local restoration");
  assert.equal(world.playMoney, coins); assert.equal(JSON.stringify(world.pantry.stock), stock);
  toilet.broken = true;
  applyCanonicalLaunch(world, canonical);
  assert.equal(toilet.broken, true, "same completed receipt cannot clear a later incidental breakdown");
  world.launch.counts.serve++;
  assert.equal(canonical.counts.serve, 0, "runtime progress cannot mutate the canonical server snapshot");
  console.log("ok canonical care mirrors fixture cleanup once, without minting rewards or replaying restoration");
}
{
  const world = createWorld("launch-midnight-repair", SHELL, { utcDay: day });
  const repair = world.launch.careTasks.find(t => t.kind === "repair")!;
  const receipt: typeof world.launch = JSON.parse(JSON.stringify(world.launch));
  receipt.careTasks.find(t => t.id === repair.id)!.progress = repair.steps;
  applyCanonicalLaunch(world, receipt);
  const toilet = world.toilets.find(t => t.gx === repair.target.gx && t.gy === repair.target.gy)!;
  toilet.broken = true;
  for (let n = 0; n < 7200 && !world.entities.some(e => e.taskToilet === toilet.uid); n++) stepWorld(world, SHELL);
  assert.ok(world.entities.some(e => e.taskToilet === toilet.uid), "staff starts incidental repair before UTC rollover");
  assert.ok(applyAction(world, SHELL, { type: "newDay", utcDay: day + 1, banked: 1, tenure: 0, deferDelivery: true }));
  tick(world, 10);
  assert.equal(toilet.broken, true, "in-flight staff chore cannot finish the next day's authored job");
  assert.ok(world.launch.careTasks.every(t => t.progress === 0));
  console.log("ok UTC rollover transfers an in-flight incidental repair to the daily player job");
}
{
  const world = createWorld("launch-actions", SHELL, { utcDay: day });
  const coins = world.playMoney;
  world.pantry.stock = { ...DAILY_SPECIALS[world.daily.idx].needs };
  assert.ok(applyAction(world, SHELL, { type: "prepSpecial" }));
  assert.equal(applyAction(world, SHELL, { type: "prepSpecial" }), false);
  tick(world, 300);
  assert.ok(world.stats.served >= 5);
  assert.equal(world.playMoney, coins, "animated plates and old daily beats do not mint coins");
  assert.equal(world.stats.raresDropped, 0, "automatic service no longer drops rares");
  for (const id of ["serve", "prep", "special"] as const) assert.ok(applyAction(world, SHELL, { type: "claimDailyGoal", goalId: id }));
  assert.equal(world.playMoney, coins + 60);
  assert.equal(RARES.reduce((sum, id) => sum + (world.pantry.stock[id] ?? 0), 0), 1);
  const saved = sanitizeSave(serializeSave(world, "trattoria"));
  for (const id of ["serve", "prep", "special"] as const) assert.equal(claimLaunchGoal(saved.launch, id), null);
  assert.equal(saved.launch.completedDays, 1);
  assert.equal(rollLaunchDay(saved.launch, day - 1, saved.layout, SHELL), false);
  assert.equal(rollLaunchDay(saved.launch, day + 1, saved.layout, SHELL), true);
  assert.ok(dailyGoals(saved.launch).every(g => !g.claimed && !g.ready));
  assert.equal(saved.launch.completedDays, 1);
  console.log("ok actual service and prep advance goals; third claim grants one rare; reload/day rollback cannot replay rewards");
}
{
  const world = createWorld("launch-decoration", SHELL, { utcDay: day });
  const original = world.layout.map(p => ({ ...p }));
  assert.ok(applyAction(world, SHELL, { type: "edit", on: true }));
  const plant = world.layout.find(p => p.itemId === "plant_basic")!;
  assert.ok(applyAction(world, SHELL, { type: "move", uid: plant.uid, gx: 0, gy: 5 }));
  assert.ok(applyAction(world, SHELL, { type: "replaceLayout", layout: original }));
  assert.ok(applyAction(world, SHELL, { type: "edit", on: false }));
  assert.equal(world.launch.counts.decorate, 0, "cancelled or undone decoration is not an achievement");
  assert.ok(applyAction(world, SHELL, { type: "edit", on: true }));
  assert.ok(applyAction(world, SHELL, { type: "storefront", awning: "blue" }));
  assert.ok(applyAction(world, SHELL, { type: "edit", on: false }));
  assert.equal(world.launch.counts.decorate, 1);
  console.log("ok decorating counts the kept change, not clicks, undo, or cancel");
}
{
  const rich = createWorld("launch-expansion", SHELL, { playMoney: 9999 });
  assert.equal(applyAction(rich, SHELL, { type: "expand" }), false, "coins alone do not unlock expansion");
  assert.equal(rich.playMoney, 9999);
  rich.pantry.levels.margherita = 2; rich.pantry.levels.caciopepe = 2;
  assert.ok(expansionRequirements(0, rich.pantry.levels, rich.playMoney)?.allowed);
  assert.ok(applyAction(rich, SHELL, { type: "expand" }));
  assert.equal(rich.playMoney, 9999 - 1200);
  assert.equal(applyAction(rich, SHELL_SIZES[1], { type: "expand" }), false);
  rich.pantry.levels.margherita = 3; rich.pantry.levels.caciopepe = 3; rich.pantry.levels.tiramisu = 2;
  assert.ok(applyAction(rich, SHELL_SIZES[1], { type: "expand" }));
  assert.equal(rich.playMoney, 9999 - 1200 - 3500);
  assert.equal(expansionRequirements(2, rich.pantry.levels, rich.playMoney), null);
  console.log("ok expansion requires visible coins and independent recipe achievements; completed rooms remain owned");
}
console.log(`Domain Kitchen launch progression checks passed (rules v${LAUNCH_RULES.version}).`);
