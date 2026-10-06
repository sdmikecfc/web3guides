/** Pure launch authority checks: no credentials, network, or database writes. */
import assert from "node:assert/strict";
import { applyKitchenCommand, initializeKitchen, KitchenCommandError, syncDeliveryFromAuthority, type KitchenRecord } from "../src/lib/chef/authority";
import { operativeMenuForSave, settleRestaurant } from "../src/lib/chef/offline";
import { LAUNCH_RULES, dailyGoals, dishEarningsMultiplier, type LaunchGoalId } from "../src/app/chef/game/_engine/launch-progression";
import { DAILY_SPECIALS, nextRecipe } from "../src/app/chef/game/_engine/pantry";
import { DISHES, STARTER_DISH_IDS } from "../src/app/chef/game/_engine/cookbook";
import { sanitizeSave } from "../src/app/chef/game/_engine/save";

const now = Date.UTC(2026, 8, 16, 12);
const fresh = () => initializeKitchen(null, now);
const run = (name: string, fn: () => void) => { fn(); console.log(`ok ${name}`); };
const rejects = (fn: () => unknown, code: string) => assert.throws(fn, (error) => error instanceof KitchenCommandError && error.code === code);
const rareCount = (record: KitchenRecord) => (record.save.pantry.stock.saffron ?? 0) + (record.save.pantry.stock.truffle ?? 0);

run("passive starter earnings scale with short absences and consume the eight-hour bank once", () => {
  const record = fresh();
  const short = settleRestaurant(record.save, record.authority.settlement, now + 3_600_000);
  const overnight = settleRestaurant(record.save, record.authority.settlement, now + 8 * 3_600_000);
  const days = settleRestaurant(record.save, record.authority.settlement, now + 72 * 3_600_000);
  assert.ok(short.coins > 0 && short.coins <= 10);
  assert.ok(overnight.coins >= 60 && overnight.coins <= 80);
  assert.equal(days.coins, overnight.coins);
  assert.equal(days.elapsedMs, LAUNCH_RULES.passiveHours * 3_600_000);
  assert.equal(settleRestaurant(record.save, days, now + 72 * 3_600_000).coins, 0);
  assert.equal(settleRestaurant(record.save, days, now).coins, 0);
  console.log(`  measured starter: ${short.coins}/1h, ${overnight.coins}/8h, ${days.coins}/72h absence`);
});

run("repeated active settlement cannot exceed the UTC passive purse, including small requests", () => {
  const initial = initializeKitchen(null, Date.UTC(2026, 8, 16));
  let record = initial;
  for (let hour = 1; hour <= 23; hour++) {
    const time = Date.UTC(2026, 8, 16) + hour * 3_600_000;
    record = applyKitchenCommand(record, { type: "settle" }, time, "alice").actor;
    record = applyKitchenCommand(record, { type: "repair" }, time, "alice").actor;
    const stove = record.save.layout.find(piece => piece.itemId === "stove_basic")!;
    record = applyKitchenCommand(record, { type: "repairMachine", uid: stove.uid! }, time + 10_000, "alice").actor;
  }
  assert.ok(record.save.coins - initial.save.coins <= LAUNCH_RULES.passiveCoinsPerDay);
  assert.equal(record.save.launch.passive.coins, LAUNCH_RULES.passiveCoinsPerDay);
  const before = record.save.coins;
  record = applyKitchenCommand(record, { type: "settle" }, record.save.savedAt + 1, "alice").actor;
  assert.equal(record.save.coins, before);
  assert.equal(rareCount(record), rareCount(initial), "time alone no longer grants a rare");
});

run("menu mastery gives the shared 25/50 percent bonus only for operable dishes", () => {
  const record = fresh(); record.save.menu.selected = ["margherita"];
  const settle = () => settleRestaurant(record.save, record.authority.settlement, now + 8 * 3_600_000).coins;
  const base = settle();
  record.save.pantry.levels.fries = 3; record.save.pantry.levels.lemonade = 3; assert.equal(settle(), base);
  for(const dish of DISHES.filter(dish=>!dish.machine))record.save.pantry.levels[dish.id]=2;
  assert.equal(dishEarningsMultiplier(record.save.pantry.levels, operativeMenuForSave(record.save)), 1.25);
  const improved = settle(); assert.ok(improved > base && improved <= 100);
  for(const dish of DISHES.filter(dish=>!dish.machine))record.save.pantry.levels[dish.id]=3;
  assert.equal(dishEarningsMultiplier(record.save.pantry.levels, operativeMenuForSave(record.save)), 1.5);
  const mastered = settle(); assert.ok(mastered > improved && mastered <= 120);
  console.log(`  eight-hour starter menu: level1=${base}, level2=${improved}, level3=${mastered}`);
});

run("legacy migration preserves balances and mastery but never accepts client daily evidence", () => {
  const source = fresh(); source.save.coins = 2000; source.save.pantry.levels.margherita = 3;
  source.save.launch.counts.serve = 10000; source.save.launch.counts.prep = 100;
  source.save.launch.careTasks.forEach(task => { task.progress = task.steps; });
  source.save.launch.completedDays = 999;
  const migrated = initializeKitchen(source.save, now);
  assert.equal(migrated.save.coins, 2000); assert.equal(migrated.save.pantry.levels.margherita, 3);
  assert.equal(migrated.save.launch.counts.serve, 0); assert.equal(migrated.save.launch.completedDays, 0);
  assert.ok(migrated.save.launch.careTasks.every(task => task.progress === 0));
  const oldAuthority = fresh(); delete oldAuthority.authority.launch;
  oldAuthority.save.launch.counts.serve = 1000;
  syncDeliveryFromAuthority(oldAuthority);
  assert.equal(oldAuthority.save.launch.counts.serve, 0);
  rejects(() => applyKitchenCommand(migrated, { type: "claimDailyGoal", goalId: "serve" }, now, "alice"), "goal_incomplete");
  const forgedSpecial = structuredClone(source.save);
  forgedSpecial.utcDay = Math.floor(now / 86_400_000); forgedSpecial.daily.prepped = true;
  const legacySpecial = applyKitchenCommand(initializeKitchen(forgedSpecial, now), { type: "settle" }, now + 3_600_000, "alice").actor;
  assert.ok(legacySpecial.save.launch.counts.serve > 0);
  assert.equal(legacySpecial.save.launch.counts.special, 0, "legacy prepped flag cannot authorize a special-order reward");
});

run("care commands need a live issued target, three timed steps, and never replay completion", () => {
  let record = fresh(), clock = now;
  record.authority.settlement.condition.cleanliness = 20;
  record.authority.settlement.condition.equipment = 20;
  const ids = record.save.launch.careTasks.map(task => task.id);
  rejects(() => applyKitchenCommand(record, { type: "careTask", taskId: "invented" }, clock, "alice"), "task_unavailable");
  for (const id of ids) {
    for (let step = 0; step < LAUNCH_RULES.careSteps; step++) {
      record = applyKitchenCommand(record, { type: "careTask", taskId: id }, clock, "alice").actor;
      assert.equal(record.save.launch.careTasks.find(task => task.id === id)!.progress, step + 1);
      if (step < LAUNCH_RULES.careSteps - 1) rejects(() => applyKitchenCommand(record, { type: "careTask", taskId: id }, clock, "alice"), "care_cooldown");
      clock += LAUNCH_RULES.careStepCooldownMs;
    }
    rejects(() => applyKitchenCommand(record, { type: "careTask", taskId: id }, clock, "alice"), "task_unavailable");
  }
  assert.equal(record.save.maintenance.cleanliness, 100);
  assert.ok(record.save.maintenance.equipment > 99.99, "later clean steps only cause normal elapsed wear");
  assert.equal(record.save.launch.counts.clean, 2); assert.equal(record.save.launch.counts.repair, 1);
  assert.ok(dailyGoals(record.save.launch).find(goal => goal.id === "care")?.ready);
  const claimed = applyKitchenCommand(record, { type: "claimDailyGoal", goalId: "care" }, clock, "alice").actor;
  assert.equal(claimed.save.coins, record.save.coins + LAUNCH_RULES.dailyGoalCoins);
  rejects(() => applyKitchenCommand(claimed, { type: "claimDailyGoal", goalId: "care" }, clock, "alice"), "already_claimed");
});

run("layout edits retarget care without resetting progress; global incidental repair grants no care credit", () => {
  let record = fresh(); const id = record.save.launch.careTasks[1].id;
  record = applyKitchenCommand(record, { type: "careTask", taskId: id }, now, "alice").actor;
  record = applyKitchenCommand(record, { type: "layout", layout: [] }, now, "alice").actor;
  const task = record.save.launch.careTasks.find(entry => entry.id === id)!;
  assert.equal(task.target.kind, "floor"); assert.equal(task.progress, 1);
  record.authority.settlement.condition.equipment = 20;
  record = applyKitchenCommand(record, { type: "repair" }, now, "alice").actor;
  assert.equal(record.save.launch.careTasks.find(entry => entry.id === id)!.progress, 1);
  assert.equal(record.save.launch.counts.repair, 0);
  const forged = applyKitchenCommand(record, { type: "appearance", appearance: { launch: { counts: { serve: 10000 }, careTasks: [{ id, progress: 3 }] } }, launch: { claimed: [] } } as any, now, "alice").actor;
  assert.deepEqual(forged.save.launch, record.save.launch);
});

run("daily goals use command/service evidence, mint at most 100 coins plus one shift rare, and reset safely", () => {
  let record = fresh(), clock = now;
  rejects(() => applyKitchenCommand(record, { type: "claimDailyGoal", goalId: "not-a-goal" } as any, clock, "alice"), "unknown_goal");
  rejects(() => applyKitchenCommand(record, { type: "claimDailyGoal", goalId: "decorate" }, clock, "alice"), "goal_incomplete");
  record = applyKitchenCommand(record, { type: "layout", layout: record.save.layout, design: { ...record.save.design, wall: "rose" } }, clock, "alice").actor;
  record = applyKitchenCommand(record, { type: "settle" }, clock, "alice").actor;
  record.save.pantry.stock = { ...DAILY_SPECIALS[record.save.daily.idx].needs };
  record = applyKitchenCommand(record, { type: "prepSpecial" }, clock, "alice").actor;
  for (const id of record.save.launch.careTasks.map(task => task.id)) for (let i = 0; i < LAUNCH_RULES.careSteps; i++) {
    record = applyKitchenCommand(record, { type: "careTask", taskId: id }, clock, "alice").actor;
    clock += LAUNCH_RULES.careStepCooldownMs;
  }
  clock += 3_600_000;
  record = applyKitchenCommand(record, { type: "settle" }, clock, "alice").actor;
  const before = record.save.coins, rareBefore = rareCount(record);
  const goalIds: LaunchGoalId[] = ["serve", "care", "prep", "special", "decorate"];
  assert.ok(dailyGoals(record.save.launch).every(goal => goal.ready));
  for (const goalId of goalIds) record = applyKitchenCommand(record, { type: "claimDailyGoal", goalId }, clock, "alice").actor;
  assert.equal(record.save.coins - before, 100); assert.equal(rareCount(record) - rareBefore, 1);
  assert.equal(record.save.launch.completedDays, 1);
  for (const goalId of goalIds) rejects(() => applyKitchenCommand(record, { type: "claimDailyGoal", goalId }, clock, "alice"), "already_claimed");
  const reloaded = JSON.parse(JSON.stringify(record));
  rejects(() => applyKitchenCommand(reloaded, { type: "claimDailyGoal", goalId: "care" }, clock, "alice"), "already_claimed");
  rejects(() => applyKitchenCommand(record, { type: "claimDailyGoal", goalId: "care" }, now - 1, "alice"), "invalid_time");
  record = applyKitchenCommand(record, { type: "settle" }, now + 86_400_000, "alice").actor;
  assert.equal(record.save.launch.completedDays, 1); assert.deepEqual(record.save.launch.claimed, []);
  assert.ok(record.save.launch.careTasks.every(task => task.progress === 0));
  rejects(() => applyKitchenCommand(record, { type: "claimDailyGoal", goalId: "care" }, now + 86_400_000, "alice"), "goal_incomplete");
});

run("recipe achievements gate expansion even with an existing large balance", () => {
  let record = fresh(); record.save.coins = 2000;
  rejects(() => applyKitchenCommand(record, { type: "expand" }, now, "alice"), "expansion_locked");
  assert.equal(record.save.coins, 2000);
  record.save.pantry.levels.margherita = 2; record.save.pantry.levels.tiramisu = 2;
  record = applyKitchenCommand(record, { type: "expand" }, now, "alice").actor;
  assert.equal(record.save.shell, 1); assert.equal(record.save.coins, 800);
  record.save.coins = 5000;
  rejects(() => applyKitchenCommand(record, { type: "expand" }, now, "alice"), "expansion_locked");
  record.save.pantry.levels.margherita = 3; record.save.pantry.levels.tiramisu = 3; record.save.pantry.levels.caciopepe = 2;
  record = applyKitchenCommand(record, { type: "expand" }, now, "alice").actor;
  assert.equal(record.save.shell, 2); assert.equal(record.save.coins, 1500);
});

run("server upgrades unlock every launch recipe at its mastery threshold without LP or coins", () => {
  let record = fresh();
  record.save.pantry.stock = {tomato:100,herb:100,cheese:100,pepper:100,flour:100,lemon:100,saffron:100,truffle:100};
  const coins = record.save.coins;
  const locked = (dishId:string) => {
    rejects(() => applyKitchenCommand(record,{type:"selectMenu",dishes:[dishId]},now,"alice"),"invalid_menu");
    rejects(() => applyKitchenCommand(record,{type:"upgradeDish",dishId},now,"alice"),"dish_locked");
    assert.ok(!record.save.menu.unlocked.includes(dishId));
  };
  const upgrade = (dishId:string) => {
    const before = structuredClone(record.save.pantry.stock);
    const recipe = nextRecipe(dishId,record.save.pantry.levels[dishId]??1)!;
    record=applyKitchenCommand(record,{type:"upgradeDish",dishId},now,"alice").actor;
    for(const [ingredient,count] of Object.entries(before))assert.equal(record.save.pantry.stock[ingredient],count-(recipe[ingredient]??0),"only the exact upgrade ingredients are spent");
  };
  const choose = (dishId:string) => {
    assert.ok(record.save.menu.unlocked.includes(dishId),"earned recipe is persisted in the response immediately");
    record=applyKitchenCommand(record,{type:"selectMenu",dishes:[dishId]},now,"alice").actor;
    assert.deepEqual(record.save.menu.selected,[dishId]);
  };
  for(const id of ["software_noodles","software_tart","boner_broth","boner_feast"])locked(id);
  upgrade("margherita"); locked("software_noodles");
  upgrade("caciopepe"); choose("software_noodles"); locked("boner_broth"); locked("software_tart");
  upgrade("software_noodles"); choose("boner_broth");
  upgrade("margherita"); choose("software_tart"); locked("boner_feast");
  upgrade("caciopepe"); locked("boner_feast");
  upgrade("software_noodles"); choose("boner_feast");
  for(const id of ["boner_broth","software_tart","boner_feast"])upgrade(id);
  assert.deepEqual(record.save.lpDays,{}); assert.deepEqual(record.authority.eligibleMarkets,[]);
  assert.equal(record.save.coins,coins,"recipe unlocks and mastery upgrades do not charge kitchen coins");
  const reloaded={...record,save:sanitizeSave(JSON.parse(JSON.stringify(record.save)))};
  assert.ok(operativeMenuForSave(reloaded.save).includes("boner_feast"));
  assert.equal(reloaded.save.menu.unlocked.length,9);
  assert.deepEqual(reloaded.save.pantry.levels,record.save.pantry.levels);
});

run("old owned recipes survive migration and new unlocks never trust appearance metadata", () => {
  const source=fresh().save;
  source.menu.unlocked=[...STARTER_DISH_IDS,"boner_feast"];
  source.menu.selected=["boner_feast"];
  source.pantry.stock={flour:2,pepper:2};
  let legacy=initializeKitchen(source,now);
  legacy=applyKitchenCommand(legacy,{type:"appearance",appearance:{theme:"cafe",market:"software.ai"}},now,"alice").actor;
  legacy=applyKitchenCommand(legacy,{type:"selectMenu",dishes:["boner_feast"]},now,"alice").actor;
  legacy=applyKitchenCommand(legacy,{type:"upgradeDish",dishId:"boner_feast"},now,"alice").actor;
  assert.equal(legacy.save.pantry.levels.boner_feast,2);
  assert.deepEqual(legacy.save.lpDays,{});
  const incomplete=fresh().save;
  incomplete.menu.unlocked=[...STARTER_DISH_IDS];
  incomplete.menu.specialUnlocked=false;
  incomplete.menu.selected=["software_noodles"];
  incomplete.pantry.levels.software_noodles=3;
  const restored=initializeKitchen(incomplete,now);
  assert.ok(restored.save.menu.unlocked.includes("software_noodles"),"mastered legacy dish retains ownership when its old unlock receipt is missing");
  assert.deepEqual(restored.save.menu.selected,["software_noodles"]);
  assert.equal(applyKitchenCommand(restored,{type:"selectMenu",dishes:["software_noodles"]},now,"alice").actor.save.pantry.levels.software_noodles,3);
  assert.equal(restored.authority.verifiedBestQuality,0,"legacy mastery is not a verified competitive record");
  const freshRecord=fresh();
  const forged=applyKitchenCommand(freshRecord,{type:"appearance",appearance:{pantry:{levels:{margherita:3,caciopepe:3,tiramisu:3}},menu:{unlocked:["boner_feast"]}},pantry:{levels:{margherita:3}},menu:{unlocked:["boner_feast"]}} as any,now,"alice").actor;
  assert.deepEqual(forged.save.pantry,freshRecord.save.pantry);
  assert.deepEqual(forged.save.menu.unlocked,freshRecord.save.menu.unlocked);
  rejects(()=>applyKitchenCommand(forged,{type:"selectMenu",dishes:["boner_feast"]},now,"alice"),"invalid_menu");
  // An existing server row may predate explicit persistence of mastery unlocks.
  const existing=fresh();existing.save.pantry.levels.margherita=2;existing.save.pantry.levels.caciopepe=2;
  existing.save.menu.unlocked=[...STARTER_DISH_IDS];
  syncDeliveryFromAuthority(existing);
  assert.ok(existing.save.menu.unlocked.includes("software_noodles"));
});

console.log("Domain Kitchen launch authority checks passed.");
