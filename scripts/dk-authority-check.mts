/** Local pure checks. No credentials, network requests, or production mutations. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyKitchenCommand, dailyIngredientOffers, featuredItems, initializeKitchen, KitchenCommandError } from "../src/lib/chef/authority";
import { capacityFor, operativeMenuForSave, settleRestaurant } from "../src/lib/chef/offline";
import { KITCHEN_RULES } from "../src/lib/chef/rules";
import { COURSES } from "../src/app/chef/game/_engine/academy";

const now = Date.UTC(2026, 8, 13, 12);
const fresh = () => initializeKitchen(null, now);
const run = (name: string, fn: () => void) => { fn(); console.log(`ok ${name}`); };
const rejects = (fn: () => unknown, code: string) => assert.throws(fn, (error) => error instanceof KitchenCommandError && error.code === code);

run("new accounts use a playable server starter and zero verified history", () => {
  const record = fresh();
  assert.ok(record.save.layout.length > 5); assert.ok(capacityFor(record.save) > 0);
  assert.equal(record.authority.verifiedBestQuality, 0);
});
run("legacy furniture and mastery survive without importing a competitive record", () => {
  const original = fresh().save;
  original.coins = 12345; original.bestQuality = 100; original.pantry.levels.margherita = 3;
  original.inventory.plant_basic = 2;
  const record = initializeKitchen(original, now);
  assert.equal(record.save.coins, 12345); assert.equal(record.save.inventory.plant_basic, 2);
  assert.equal(record.save.pantry.levels.margherita, 3); assert.deepEqual(record.save.layout, original.layout);
  assert.equal(record.authority.verifiedBestQuality, 0); assert.equal(record.authority.verifiedPlates, 0);
});
run("short and overnight settlement earn coins and degrade recoverable condition", () => {
  const record = fresh();
  const minute = settleRestaurant(record.save, record.authority.settlement, now + 30 * 60_000);
  const night = settleRestaurant(record.save, record.authority.settlement, now + 8 * 3_600_000);
  assert.ok(minute.coins > 0); assert.ok(night.coins > minute.coins);
  assert.ok(night.condition.cleanliness < minute.condition.cleanliness);
  assert.ok(night.condition.equipment >= KITCHEN_RULES.conditionFloor);
});
run("long absences consume the cap once; clock rollback and replay mint nothing", () => {
  const record = fresh();
  const end = now + 90 * 86_400_000;
  const result = settleRestaurant(record.save, record.authority.settlement, end);
  assert.equal(result.elapsedMs, KITCHEN_RULES.offlineHours * 3_600_000);
  assert.equal(settleRestaurant(record.save, result, end).coins, 0);
  assert.equal(settleRestaurant(record.save, result, now).coins, 0);
  assert.equal(settleRestaurant(record.save, result, now).condition.lastSettledAt, end);
});
run("chairs without tables and a restaurant without a pass earn nothing", () => {
  const record = fresh();
  record.save.layout = record.save.layout.filter((p) => p.itemId !== "table_basic");
  assert.equal(capacityFor(record.save), 0);
  const noPass = fresh(); noPass.save.layout = noPass.save.layout.filter((p) => p.itemId !== "counter_basic");
  assert.equal(capacityFor(noPass.save), 0);
});
run("supported dish mastery affects production; recipes without their machine do not", () => {
  const record = fresh(); record.save.menu.selected = ["margherita"];
  const base = capacityFor(record.save);
  record.save.pantry.levels.fries = 3; record.save.pantry.levels.lemonade = 3;
  assert.equal(capacityFor(record.save), base);
  record.save.pantry.levels.tiramisu = 3; assert.ok(capacityFor(record.save) > base);
});
run("longer working paths reduce throughput in an otherwise equivalent restaurant", () => {
  const near = fresh(), far = fresh();
  far.save.layout = far.save.layout.map((p) => p.itemId === "chair_basic" || p.itemId === "table_basic" ? { ...p, gy: p.gy + 2 } : p);
  assert.ok(capacityFor(far.save) > 0);
  assert.ok(capacityFor(far.save) < capacityFor(near.save));
});
run("furnishing purchase and storage conserve ownership; forged placements are refused", () => {
  const record = fresh(); record.save.coins = 500;
  const bought = applyKitchenCommand(record, { type: "purchase", itemId: "plant_basic" }, now, "alice").actor;
  assert.equal(bought.save.coins, 450); assert.equal(bought.save.inventory.plant_basic, 1);
  assert.equal(record.save.coins, 500);
  rejects(() => applyKitchenCommand(record, { type: "layout", layout: [...record.save.layout, { itemId: "plant_basic", gx: 8, gy: 6, facing: "se" }] }, now, "alice"), "not_owned");
  const stored = applyKitchenCommand(record, { type: "layout", layout: [] }, now, "alice").actor;
  assert.equal(stored.save.inventory.table_basic, 2);
  assert.equal(stored.save.inventory.chair_basic, 4);
});
run("appearance cannot smuggle currency, pantry, staff, or mastery changes", () => {
  const record = fresh();
  const command = { type: "appearance", appearance: { name: "Garden", coins: 1e9, chefs: 99, pantry: { levels: { margherita: 3 } } } } as any;
  const next = applyKitchenCommand(record, command, now, "alice").actor;
  assert.equal(next.save.coins, record.save.coins); assert.equal(next.save.chefs, 1);
  assert.equal(next.save.pantry.levels.margherita, 1); assert.equal(next.save.name, "Garden");
});
run("daily delivery and ingredient offer each have a server-day claim limit", () => {
  const record = fresh(); record.save.coins = 500;
  const daily = applyKitchenCommand(record, { type: "claimDaily" }, now, "alice").actor;
  rejects(() => applyKitchenCommand(daily, { type: "claimDaily" }, now + 1, "alice"), "already_claimed");
  const offer = dailyIngredientOffers(now)[0];
  const purchased = applyKitchenCommand(daily, { type: "purchaseIngredient", ingredientId: offer.id }, now, "alice").actor;
  assert.equal(purchased.save.coins, daily.save.coins - offer.cost);
  rejects(() => applyKitchenCommand(purchased, { type: "purchaseIngredient", ingredientId: offer.id }, now, "alice"), "already_purchased");
  assert.ok(dailyIngredientOffers(now, purchased.authority)[0].purchased);
  assert.deepEqual(featuredItems(now), featuredItems(now + 1000));
});
run("recipe upgrades spend their exact ingredients and cannot upgrade locked domains", () => {
  const record = fresh(); record.save.pantry.stock = { tomato: 2, herb: 1 };
  const upgraded = applyKitchenCommand(record, { type: "upgradeDish", dishId: "margherita" }, now, "alice").actor;
  assert.equal(upgraded.save.pantry.levels.margherita, 2); assert.equal(upgraded.save.pantry.stock.tomato, 0);
  rejects(() => applyKitchenCommand(upgraded, { type: "upgradeDish", dishId: "margherita" }, now, "alice"), "ingredients_needed");
  rejects(() => applyKitchenCommand(record, { type: "upgradeDish", dishId: "software_tart" }, now, "alice"), "dish_locked");
});
run("maintained service records the operative menu without passive rare rewards", () => {
  let record=fresh();record.save.menu.selected=["margherita"];
  for(let hour=1;hour<=6;hour++) {
    record=applyKitchenCommand(record,{type:"settle"},now+hour*3_600_000,"alice").actor;
    record=applyKitchenCommand(record,{type:"repair"},now+hour*3_600_000,"alice").actor;
  }
  assert.equal((record.save.pantry.stock.saffron??0)+(record.save.pantry.stock.truffle??0),0);
  const menu=operativeMenuForSave(record.save);
  assert.ok(menu.length>1);assert.ok(menu.every(id=>record.save.menu.serves[id]>0));
  const dishTotal = menu.reduce((sum,id)=>sum+(record.save.menu.serves[id]??0)+(record.authority.settlement.dishRemainders?.[id]??0),0);
  assert.ok(Math.abs(dishTotal-record.authority.verifiedPlates-record.authority.settlement.plateRemainder)<1e-8,"Dish-specific fractions must conserve the total production without inventing a sale.");
  assert.equal(record.save.menu.serves.fries??0,0);assert.equal(record.save.menu.serves.lemonade??0,0);
  const neglected=fresh();neglected.save.daily.plates=1000;neglected.save.utcDay=Math.floor(now/86_400_000);
  neglected.authority.settlement.condition.cleanliness=20;neglected.authority.settlement.condition.equipment=20;
  const noReward=applyKitchenCommand(neglected,{type:"settle"},now,"alice").actor;
  assert.equal((noReward.save.pantry.stock.saffron??0)+(noReward.save.pantry.stock.truffle??0),0);
});
run("lessons persist once without minting currency", () => {
  const record=fresh();const id=COURSES[0].id;
  const done=applyKitchenCommand(record,{type:"completeCourse",id},now,"alice").actor;
  assert.ok(done.save.courses.includes(id));assert.equal(done.save.coins,record.save.coins);
  rejects(()=>applyKitchenCommand(done,{type:"completeCourse",id},now,"alice"),"already_completed");
});
run("repair restores current condition without deleting mastery or possessions", () => {
  const record = fresh();
  const away = applyKitchenCommand(record, { type: "settle" }, now + 8 * 3_600_000, "alice").actor;
  const repaired = applyKitchenCommand(away, { type: "repair" }, now + 8 * 3_600_000, "alice").actor;
  assert.ok(repaired.authority.settlement.condition.cleanliness > away.authority.settlement.condition.cleanliness);
  assert.deepEqual(repaired.save.layout, away.save.layout);
  rejects(() => applyKitchenCommand(repaired, { type: "repair" }, now + 8 * 3_600_000 + 1, "alice"), "repair_cooldown");
});
run("friend requests, acceptance, help, removal, and mutual blocks validate both participants", () => {
  const a = fresh(), b = fresh();
  const request = applyKitchenCommand(a, { type: "requestFriend", targetHandle: "b" }, now, "a", { id: "b", record: b });
  assert.equal(request.actor.authority.neighbors.b, "outgoing");
  const accepted = applyKitchenCommand(request.target!, { type: "acceptFriend", targetHandle: "a" }, now, "b", { id: "a", record: request.actor });
  assert.equal(accepted.actor.authority.neighbors.a, "friend");
  const blocked = applyKitchenCommand(accepted.actor, { type: "block", targetHandle: "a" }, now, "b", { id: "a", record: accepted.target! });
  rejects(() => applyKitchenCommand(blocked.target!, { type: "requestFriend", targetHandle: "b" }, now, "a", { id: "b", record: blocked.actor }), "unavailable_neighbor");
});
run("many sending wallets cannot exceed a recipient's shared daily social budget", () => {
  let recipient = fresh();
  for (let i = 0; i < KITCHEN_RULES.socialIngredientsPerDay + 1; i++) {
    const sender = fresh(), id = `sender${i}`;
    sender.authority.neighbors.recipient = "friend"; recipient.authority.neighbors[id] = "friend";
    const action = () => applyKitchenCommand(sender, { type: "sendGift", targetHandle: "recipient" }, now, id, { id: "recipient", record: recipient });
    if (i < KITCHEN_RULES.socialIngredientsPerDay) recipient = action().target!;
    else rejects(action, "daily_limit");
  }
  assert.equal(recipient.authority.socialUsed, KITCHEN_RULES.socialIngredientsPerDay);
  const sender = fresh(); sender.authority.neighbors.recipient = "friend"; recipient.authority.neighbors.extra = "friend";
  rejects(() => applyKitchenCommand(recipient, { type: "findGift", targetHandle: "extra" }, now, "recipient", { id: "extra", record: sender }), "daily_limit");
});
run("SQL gates command replay and revisions before atomic actor/target state changes", () => {
  const sql = readFileSync("supabase/migrations/20260913_domain_kitchen_authority.sql", "utf8");
  assert.ok(sql.includes("primary key (game_key, wallet, command_id)"));
  assert.ok(sql.includes("receipt.fingerprint <> p_fingerprint"));
  assert.ok(sql.includes("r.state_revision <> p_expected_revision"));
  assert.ok(sql.includes("r.state_revision <> p_target_revision"));
  assert.ok(sql.includes("order by wallet for update"));
  assert.ok(sql.includes("revoke all on function public.dk_commit_command"));
  assert.ok(sql.includes("insert into public.domain_kitchen_legacy_snapshots"));
});
run("v8 snapshot SQL captures the original ledger transactionally and grants only service reads", () => {
  // Structural regression only: staging PostgreSQL must verify trigger execution,
  // role inheritance, RLS, rollback, and concurrent writes before release.
  const sql = readFileSync("supabase/migrations/20260919_domain_kitchen_truck_snapshot.sql", "utf8")
    .replace(/--[^\r\n]*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  assert.match(sql, /^begin;.*commit;$/);
  assert.ok(sql.includes("primary key (game_key, wallet, target_version)"));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("revoke all on public.domain_kitchen_version_snapshots from public, anon, authenticated, service_role"));
  assert.deepEqual(sql.match(/grant [^;]+;/g), ["grant select on public.domain_kitchen_version_snapshots to service_role;"]);
  assert.ok(sql.includes("language plpgsql security definer set search_path = public, pg_temp"));
  assert.ok(sql.includes("if new.state->>'v' = '8' and old.state->>'v' is distinct from '8' then"));
  assert.ok(sql.includes("values (old.game_key, old.wallet, 8, old.state, old.authority_state, old.state_revision, old.best_quality, old.quality_now, old.seats) on conflict do nothing"));
  assert.ok(sql.includes("revoke all on function public.dk_snapshot_before_truck() from public, anon, authenticated, service_role"));
  assert.ok(sql.includes("create trigger dk_snapshot_before_truck before update of state on public.domain_kitchen_players for each row execute function public.dk_snapshot_before_truck()"));
  assert.equal(/on conflict[^;]*do update|delete from public\.domain_kitchen_version_snapshots|update public\.domain_kitchen_version_snapshots/.test(sql), false);
});
console.log("Domain Kitchen authority checks passed.");
