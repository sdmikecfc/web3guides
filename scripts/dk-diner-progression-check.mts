/** Local isolated-preview progression checks. No old saves, credentials or network. */
import assert from "node:assert/strict";
import { createDiner, DINER_RULES, dinerRates, dispatchDiner, generateDinerMap, homeIncidents, homeSimulationConfig, sanitizeDinerSave, shopOffers, validateDinerHome, type DinerCommand, type DinerState } from "../src/lib/chef/diner/progression";
import { DEFERRED_EQUIPMENT_IDS, HOME_EQUIPMENT, ROUTES, SERVICE_RULES, TRUCK_EQUIPMENT } from "../src/lib/chef/diner/content";
import { measureHomeRates } from "../src/lib/chef/diner/home-simulation";
import { regularAvailable } from "../src/lib/chef/diner/collections";
const now = Date.UTC(2026, 8, 20, 8), hour = 3_600_000;
const fresh = () => createDiner(now, "diner-check");
function action(state: DinerState, command: DinerCommand, at = now) { const result = dispatchDiner(state, command, { now: at }); assert.equal(result.error, undefined, `${command.type}: ${result.error}`); return result.state; }
function rejected(state: DinerState, command: DinerCommand, code: string, at = now) { const result = dispatchDiner(state, command, { now: at }); assert.equal(result.code, code); assert.deepEqual(result.state, state); }
let groups = 0; function test(name: string, fn: () => void) { fn(); groups++; console.log(`ok ${name}`); }
function prepared(){const state=fresh();return action(state,{type:'setupLayout',stations:[...state.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:state.truckConfig.tables});}
function started(tutorial = false) { let state = prepared(); state.tutorial.finished = !tutorial; return action(state, { type: "startRun" }); }
function atService(tutorial = false) { const state = started(tutorial); return action(state, { type: "chooseNode", nodeId: state.run!.available[0] }); }

test("separate fresh namespace has no old wealth or owned home fryer", () => {
  const state = fresh(); assert.equal(state.version, 1); assert.equal(state.home.w, 10); assert.equal(state.home.h, 8);
  assert.equal(state.recipes.classic_burger.level, 0); assert.equal(state.equipment.fryer.homeCopies, 0);
  assert.equal(validateDinerHome(state, state.home.layout), null); assert.ok(dinerRates(state).coins > 0);
});
test("seeded twelve-row branches only reach the next row and terminate at one finale", () => {
  const map = generateDinerMap("branch-seed"); assert.deepEqual(map, generateDinerMap("branch-seed")); assert.notDeepEqual(map, generateDinerMap("other-seed"));
  assert.equal(map.filter(n => n.kind === "finale").length, 1);
  for (const node of map) { if (node.row < 11) assert.ok(node.next.length >= 1 && node.next.length <= 2); for (const id of node.next) assert.equal(map.find(n => n.id === id)!.row, node.row + 1); }
  const services = new Set([0, 1, 3, 5, 7, 9, 11]);
  for (const node of map) assert.equal(["slow", "medium", "busy", "special", "finale"].includes(node.kind), services.has(node.row));
  assert.deepEqual(map.filter(n => n.row === 4).map(n => n.kind).sort(),["ingredients","shop"]);
});
test("opening crate is exact burger set and cannot be repeated or rewound", () => {
  let state = action(fresh(), { type: "claimCrate" }); assert.deepEqual(state.pantry, { beef: 1, bun: 1 }); assert.equal(state.daily.minted, 2);
  rejected(state, { type: "claimCrate" }, "already_claimed"); rejected(state, { type: "claimCrate" }, "already_claimed", now - hour);
  state = action(state, { type: "upgradeRecipe", recipeId: "classic_burger" }); assert.equal(state.recipes.classic_burger.level, 1); assert.equal(state.pantry.beef, 0);
  rejected(state, { type: "upgradeRecipe", recipeId: "classic_burger" }, "ingredients_needed");
});
test("till uses sixty percent, caps eight hours and partitions exactly", () => {
  const state = fresh(), rate = dinerRates(state);
  const whole = action(state, { type: "settle" }, now + 24 * hour);
  assert.ok(Math.abs(whole.home.till.coins - rate.coins * 8 * .6) < 1e-8);
  let split = state; for (let i = 1; i <= 24; i++) split = action(split, { type: "settle" }, now + i * hour);
  assert.ok(Math.abs(split.home.till.coins - whole.home.till.coins) < 1e-8);
  const banked = action(whole, { type: "collectTill" }, now + 24 * hour); assert.equal(banked.coins, state.coins + Math.floor(whole.home.till.coins));
  assert.equal(action(banked, { type: "collectTill" }, now + 24 * hour).coins, banked.coins);
  assert.equal(action(banked, { type: "settle" }, now).home.till.coins, banked.home.till.coins);
});
test("buzz expiry is integrated without retroactively changing the full till", () => {
  const state = fresh(); state.buzz = [now]; const whole = action(state, { type: "settle" }, now + 8 * hour);
  let split = state; for (let i = 1; i <= 8; i++) split = action(split, { type: "settle" }, now + i * hour);
  assert.ok(Math.abs(split.home.till.coins - whole.home.till.coins) < 1e-8);
  assert.deepEqual(whole.buzz, []); assert.ok(whole.home.till.coins > action(fresh(), { type: "settle" }, now + 8 * hour).home.till.coins);
});
test("road spending uses haul only and purchases survive failure with half the remainder", () => {
  let state = started(); const shop = state.run!.map.find(n => n.kind === "shop")!;
  state.run!.available = [shop.id]; state = action(state, { type: "chooseNode", nodeId: shop.id }); state.coins = 100_000;
  const offer = state.run!.offers.find(o => o.kind === "recipe")!; rejected(state, { type: "buyOffer", offerId: offer.id }, "not_enough_haul");
  state.run!.haul = 401 + offer.price; state = action(state, { type: "buyOffer", offerId: offer.id }); assert.equal(state.recipes[offer.target].level, 0); assert.equal(state.coins, 100_000);
  state = action(state, { type: "leaveNode" }); const node = state.run!.map.find(n => n.kind === "slow")!; state.run!.available = [node.id]; state = action(state, { type: "chooseNode", nodeId: node.id });
  state.run!.service!.phase = "failed"; state.run!.service!.strikes = 3;
  state = action(state, { type: "service", action: { type: "tick", ticks: 0 } });
  assert.equal(state.coins, 100_200); assert.equal(state.lastRun!.lost, 201); assert.ok(state.recipes[offer.target]); assert.equal(state.run, null);
});
test("day cumulative service coins enter haul once; banking is never doubled", () => {
  let state = atService(); const bank = state.coins; state.run!.service!.coins = 51;
  state = action(state, { type: "service", action: { type: "tick", ticks: 0 } }); assert.equal(state.run!.haul, 51); assert.equal(state.coins, bank);
  state = action(state, { type: "service", action: { type: "tick", ticks: 0 } }); assert.equal(state.run!.haul, 51);
  state.run!.service!.phase = "complete"; state = action(state, { type: "finishService" });
  const haul = state.run!.haul; state = action(state, { type: "goHome" }); assert.equal(state.coins, bank + haul);
  rejected(state, { type: "goHome" }, "between_stops");
});
test("tutorial failure grants exactly one home fryer and does not repeat on later runs", () => {
  let state = atService(true); rejected(state, { type: "goHome" }, "between_stops");
  // The third tutorial service is the intentional learning setback. The first two never drain patience.
  state.run!.serviceDays = 2; state.run!.service = null; state.run!.position = null;
  const scripted = state.run!.map.find(n => n.row === 3)!; state.run!.available = [scripted.id];
  state = action(state, { type: "chooseNode", nodeId: scripted.id });
  state = action(state, { type: "service", action: { type: "open" } });
  for (let i = 0; i < 500 && state.run; i++) state = action(state, { type: "service", action: { type: "tick", ticks: SERVICE_RULES.maxTicksPerAction } });
  assert.equal(state.run, null); assert.equal(state.tutorial.finished, true); assert.equal(state.equipment.fryer.homeCopies, 1);
  state = action(state, { type: "startRun" }); state = action(state, { type: "goHome" }); assert.equal(state.equipment.fryer.homeCopies, 1);
});
test("seven source units are bounded, with two truck run receipts and no regular overflow", () => {
  let state = fresh(); state.restaurantLevel = 8; state.coins = 10000; state.home.garden.plantedAt = now - 8 * hour;
  state = action(state, { type: "claimCrate" }); state = action(state, { type: "buyIngredient", ingredientId: state.daily.marketOffers[0] }); state = action(state, { type: "harvestGarden" }); state = action(state, { type: "greetRegular" }); assert.equal(state.daily.minted, 5);
  rejected(state, { type: "greetRegular" }, "already_claimed"); state.tutorial.finished = true;
  for (let i = 0; i < 3; i++) { state = action(state, { type: "startRun" }); const node = state.run!.map.find(n => n.kind === "bonus")!; state.run!.available = [node.id]; state.run!.qualified = true; state = action(state, { type: "chooseNode", nodeId: node.id }); state = action(state, { type: "chooseGift", choice: "ingredients" }); state = action(state, { type: "goHome" }); }
  assert.equal(state.daily.minted, 7); assert.equal(state.daily.truckRuns.length, 2); assert.equal(Object.values(state.pantry).reduce((a, b) => a + b, 0), 7);
});
test("home layout conserves ownership, course selection needs its machines", () => {
  const state = fresh(); rejected(state, { type: "homeLayout", layout: [...state.home.layout, { id: "forged", equipmentId: "fryer", x: 6, y: 3, rotation: 0 }] }, "invalid_layout");
  rejected(state, { type: "setHomeMenu", menu: { ...state.home.menu, starter: ["fries"] } }, "invalid_menu");
  rejected(state, { type: "homeLayout", layout: state.home.layout.map(p => p.id === "home-grill" ? { ...p, x: 5, y: 7 } : p) }, "invalid_layout");
  assert.deepEqual(action(state, { type: "homeLayout", layout: state.home.layout }).home.layout, state.home.layout);
});
test("route growth requires recipes plus finale; forged rewards and unknown fields refuse atomically", () => {
  const state = started(); rejected(state, { type: "service", action: { type: "tick", ticks: 0, coins: 99999 } } as any, "invalid_service_action");
  rejected(state, { type: "settle", coins: 99999 } as any, "invalid_command");
  const home = fresh(); rejected(home, { type: "startRun", routeId: ROUTES[1].id }, "route_locked");
  assert.equal(DINER_RULES.sourceAllowances.crate + DINER_RULES.sourceAllowances.market + DINER_RULES.sourceAllowances.garden + DINER_RULES.sourceAllowances.kindness + DINER_RULES.sourceAllowances.truck, 7);
});
test("visible home configuration is the measured economy configuration", () => {
  const state = fresh(), config = homeSimulationConfig(state); assert.equal(config.arrivalRate, 60.72); // Six distinct welcome pieces add twelve charm.
  assert.deepEqual(dinerRates(state), measureHomeRates(config)); assert.ok(dinerRates(state).plates >= 50);
  const meal = action(state, { type: "staffMeal", recipeId: "classic_burger" }); assert.equal(homeSimulationConfig(meal).staffSpeedMultiplier, 1.1);
  rejected(meal, { type: "staffMeal", recipeId: "fries" }, "meal_unavailable");
  assert.equal(homeSimulationConfig(meal, (meal.daily.day + 1) * DINER_RULES.dayMs).staffSpeedMultiplier, 1);
  const atMidnight = (meal.daily.day + 1) * DINER_RULES.dayMs, late = fresh(); late.createdAt = late.updatedAt = late.home.till.lastAt = atMidnight - hour;
  const fed = action(late, { type: "staffMeal", recipeId: "classic_burger" }, late.updatedAt);
  const whole = action(fed, { type: "settle" }, atMidnight + hour), split = action(action(fed, { type: "settle" }, atMidnight), { type: "settle" }, atMidnight + hour);
  assert.ok(Math.abs(whole.home.till.coins - split.home.till.coins) < 1e-8);
});
test("practice uses owned equipment and never grants trip rewards or consumes a trip number", () => {
  let state = action(fresh(), { type: "startPractice" }); const initial = fresh(); assert.equal(state.runsStarted, initial.runsStarted); assert.equal(state.run!.service!.config.practice, true);
  state.run!.service!.coins = 9999; state.run!.service!.phase = "complete";
  state = action(state, { type: "service", action: { type: "tick", ticks: 0 } }); assert.equal(state.run!.haul, 0);
  state = action(state, { type: "finishService" }); assert.equal(state.coins, initial.coins); assert.equal(state.lastRun, null); assert.deepEqual(state.buzz, []); assert.equal(state.equipment.fryer.homeCopies, 0); assert.equal(state.tutorial.finished, false);
  state = action(state, { type: "startPractice" }); state = action(state, { type: "endPractice" }); assert.equal(state.run, null);
  rejected(started(), { type: "startPractice" }, "run_active");
});
test("menu and complete loadout persist at home and change only before opening", () => {
  let state=prepared();state.equipment.fryer.truckOwned=true;state=action(state,{type:'buyTruckRecipe',recipeId:'fries'});state=action(state,{type:'buyTruckEquipment',equipmentId:'boxes'});
  state=action(state,{type:'setupLayout',stations:[...state.truckConfig.stations.map(station=>station.kind==='fridge'?{...station,x:2,y:2,facing:2 as const}:station),{id:'fryer',kind:'fryer',x:3,y:0,facing:0},{id:'boxes',kind:'boxes',x:0,y:6,facing:3}],tables:state.truckConfig.tables});
  state = action(state, { type: "setTruckMenu", recipeIds: ["fries"] }); state.tutorial.finished = true;
  state = action(state, { type: "setupLayout", stations: state.truckConfig.stations, tables: state.truckConfig.tables });
  state = action(state, { type: "startRun" }); state = action(state, { type: "chooseNode", nodeId: state.run!.available[0] }); assert.deepEqual(state.run!.service!.config.menu, ["fries"]);
  state = action(state, { type: "setTruckMenu", recipeIds: ["classic_burger", "fries"] }); assert.deepEqual(state.run!.service!.config.menu, ["classic_burger", "fries"]);
  const saved = sanitizeDinerSave(JSON.stringify(state)); assert.ok(saved); assert.deepEqual(saved.truckConfig, state.truckConfig);
  const forged = state.truckConfig.stations.map((p, i) => i === 0 ? { ...p, tier: 3 } : p); rejected(state, { type: "setupLayout", stations: forged, tables: state.truckConfig.tables } as any, "invalid_layout");
  state = action(state, { type: "service", action: { type: "open" } }); rejected(state, { type: "setTruckMenu", recipeIds: ["fries"] }, "invalid_menu");
  rejected(state, { type: "setupLayout", stations: state.truckConfig.stations, tables: state.truckConfig.tables }, "setup_only");
  assert.equal(sanitizeDinerSave(state)!.run!.service!.phase, "paused");
});
test("head starts and spices need actual route ownership; helpers use roster and truck tier", () => {
  let state = fresh(); state.tutorial.finished = true;
  rejected(state, { type: "startRun", headStart: true }, "head_start_locked"); rejected(state, { type: "setSpices", spiceIds: ["rush_hour"] }, "spices_locked");
  rejected(state, { type: "assignHelper", staffId: "waiter-1" }, "helper_unavailable"); state.collections.routeWins.push("downtown"); state.truckTier = 2;
  state = action(state, { type: "assignHelper", staffId: "waiter-1", role: "washer" });
  state = action(state, { type: "setSpices", spiceIds: ["two_strikes"] }); state = action(state, { type: "startRun", headStart: true });
  assert.ok(state.run!.available.every(id => state.run!.map.find(n => n.id === id)!.row === 3)); assert.equal(state.run!.haul, 0); assert.deepEqual(state.run!.visited, []);
  const service = state.run!.map.find(n => n.kind === "slow")!; state.run!.available = [service.id]; state.run!.strikes = 1;
  state = action(state, { type: "chooseNode", nodeId: service.id }); assert.equal(state.run!.service!.config.strikeLimit, 1); assert.equal(state.run!.service!.helpers[0].role, "washer");
});
test("friendship requires measured favourite output, has daily receipts, and rewards a keepsake once", () => {
  let state = fresh(); rejected(state, { type: "serveRegular", regularId: "old_pete" }, "regular_not_ready");
  const noKitchen = fresh(); noKitchen.home.layout = noKitchen.home.layout.filter(p => p.equipmentId !== "grill");
  rejected(action(noKitchen, { type: "settle" }, now + hour), { type: "serveRegular", regularId: "old_pete" }, "regular_not_ready", now + hour);
  state.collections.regulars.old_pete = 14;
  state = action(state, { type: "serveRegular", regularId: "old_pete" }, now + hour); assert.equal(state.collections.regulars.old_pete, 15); assert.equal(state.decorOwned.pete_postcard, 1); assert.equal(state.daily.minted, 0);
  rejected(state, { type: "serveRegular", regularId: "old_pete" }, "regular_not_ready", now + hour);
  rejected(state, { type: "serveRegular", regularId: "old_pete", served: 9999 } as any, "invalid_command", now + hour);
  assert.ok(sanitizeDinerSave(state));
});
test("optional home jobs pay fixed once-only coins and skipping leaves measured rates unchanged", () => {
  const before = fresh(), job = homeIncidents(before)[0], rate = dinerRates(before);
  const selected = action(before, { type: "helpIncident", incidentId: job.id }, job.availableAt); assert.equal(selected.coins,before.coins);
  let after = action(selected,{type:"homeTaskInput",action:{type:"strokeStart",point:{x:job.x-.2,y:job.y}}},job.availableAt);
  for(let i=0;i<20;i++){after=action(after,{type:'homeTaskInput',action:{type:'stroke',point:{x:job.x+(i%2===0?.2:-.2),y:job.y}}},job.availableAt);after=action(after,{type:'homeTaskInput',action:{type:'tick',ticks:2}},job.availableAt);}
  assert.equal(after.coins, before.coins + job.reward); assert.deepEqual(dinerRates(after), rate);
  rejected(after, { type: "helpIncident", incidentId: job.id }, "incident_unavailable", job.availableAt);
  assert.equal(homeIncidents(after).length, 1); assert.equal(action(before, { type: "settle" }, now + hour).coins, before.coins);
});
test("decor, skins and saved layouts preserve ownership and create only bounded charm", () => {
  let state = action(fresh(), { type: "buyDecor", decorId: "red_planter" }); assert.equal(state.decorOwned.red_planter, 1);
  const layout = [...state.home.layout, { id: "plant", equipmentId: "red_planter", x: 6, y: 5, rotation: 0 as const }];
  state = action(state, { type: "homeLayout", layout }); assert.ok(homeSimulationConfig(state).arrivalRate <= 60 * 1.1);
  state = action(state, { type: "skinEquipment", placementId: "home-grill", skinId: "cherry" }); state = action(state, { type: "saveLayout", name: "My first room" });
  state = action(state, { type: "homeLayout", layout: state.home.layout.filter(p => p.id !== "plant") }); state = action(state, { type: "loadLayout", layoutId: state.savedLayouts[0].id }); assert.equal(state.home.layout.find(p => p.id === "home-grill")!.skin, "cherry"); assert.ok(state.home.layout.some(p => p.id === "plant"));
  rejected(state, { type: "buyDecor", decorId: "pete_postcard" }, "decor_unavailable");
  rejected(state, { type: "homeLayout", layout: [...state.home.layout, { id: "duplicate-plant", equipmentId: "red_planter", x: 6, y: 0, rotation: 0 }] }, "invalid_layout"); assert.ok(sanitizeDinerSave(state));
});
test("largest truck assigns two distinct fixed-role helpers and preserves primary-slot checkpoints", () => {
  let state=fresh();state.truckTier=2;
  state=action(state,{type:'assignHelper',staffId:'chef-1',role:'runner'});
  rejected(state,{type:'assignHelper',slot:1,staffId:'waiter-1',role:'washer'},'helper_unavailable');
  state.truckTier=4;state=action(state,{type:'assignHelper',slot:1,staffId:'waiter-1',role:'washer'});
  rejected(state,{type:'assignHelper',slot:1,staffId:'chef-1'},'helper_unavailable');
  rejected(state,{type:'assignHelper',slot:2,staffId:null} as any,'helper_unavailable');
  rejected(state,{type:'assignHelper',slot:null,staffId:null} as any,'helper_unavailable');
  assert.equal(state.truckConfig.helperId,'chef-1');assert.equal(state.truckConfig.helperId2,'waiter-1');
  assert.equal(sanitizeDinerSave(state)!.truckConfig.helperRole2,'washer');
  state=action(state,{type:'startPractice',recipeIds:['classic_burger']});
  assert.deepEqual(state.run!.service!.helpers.map(h=>[h.id,h.role]),[['chef-1','runner'],['waiter-1','washer']]);
  rejected(state,{type:'assignHelper',slot:1,staffId:null},'helper_unavailable');
  state=action(state,{type:'endPractice'});state=action(state,{type:'assignHelper',slot:1,staffId:null});
  assert.equal(state.truckConfig.helperId,'chef-1');assert.equal(state.truckConfig.helperId2,null);
  const legacy=fresh();delete (legacy.truckConfig as any).helperId2;delete (legacy.truckConfig as any).helperRole2;
  const restored=sanitizeDinerSave(legacy)!;assert(restored);assert.equal(restored.truckConfig.helperId2,null);assert.equal(restored.truckConfig.helperRole2,'washer');
});
test("shops and home catalog offer only implemented equipment while preserving old owned IDs",()=>{
  for(const id of DEFERRED_EQUIPMENT_IDS){assert(!TRUCK_EQUIPMENT.some(e=>e.id===id));assert(!HOME_EQUIPMENT.some(e=>e.id===id));}
  assert(TRUCK_EQUIPMENT.some(e=>e.id==='pass'));assert(!HOME_EQUIPMENT.some(e=>e.id==='pass'));
  let state=started();state.restaurantLevel=12;state.coins=100000;
  for(const id of DEFERRED_EQUIPMENT_IDS)state.equipment[id]={tier:1,truckOwned:true,homeCopies:1};
  for(let seed=0;seed<50;seed++)for(const offer of shopOffers(state,`gear-${seed}`))if(['equipment','upgrade'].includes(offer.kind))assert(!(DEFERRED_EQUIPMENT_IDS as readonly string[]).includes(offer.target));
  assert(sanitizeDinerSave(state));for(const id of DEFERRED_EQUIPMENT_IDS)rejected(state,{type:'buyHomeEquipment',equipmentId:id},'discover_first');
  const shop=state.run!.map.find(node=>node.kind==='shop')!;state.run!.available=[shop.id];state=action(state,{type:'chooseNode',nodeId:shop.id});
  state.run!.offers=[{id:'old-tray-offer',kind:'equipment',target:'tray',price:0,purchased:false}];
  rejected(state,{type:'buyOffer',offerId:'old-tray-offer'},'offer_unavailable');
  assert.equal(state.equipment.tray.homeCopies,1);
});
test("inherited object keys cannot become ingredients, recipes or staff-meal receipts",()=>{
  const state=fresh();state.restaurantLevel=3;
  for(const id of ['constructor','__proto__','toString']){
    rejected(state,{type:'staffMeal',recipeId:id},'meal_unavailable');
    rejected(state,{type:'plantGarden',ingredientId:id},'garden_locked');
    rejected(state,{type:'upgradeRecipe',recipeId:id},'recipe_unavailable');
    rejected(state,{type:'buyHomeEquipment',equipmentId:id},'discover_first');
    const corrupt=structuredClone(state);corrupt.home.garden={plantedAt:now-8*hour,ingredientId:id};
    rejected(corrupt,{type:'harvestGarden'},'unknown_ingredient');assert.equal(sanitizeDinerSave(corrupt),null);
  }
  assert.equal(state.daily.staffMeal,null);assert.deepEqual(state.pantry,{});
});
test("Dottie unlocks through a purchasable daisy pot and real sundae output, without deferred gear",()=>{
  let state=fresh();state.home.layout=state.home.layout.filter(p=>p.equipmentId!=='daisy_pot');state.decorOwned.daisy_pot=0;state.recipes.ice_cream_sundae={level:0};
  state=action(state,{type:'setHomeMenu',menu:{...state.home.menu,dessert:['ice_cream_sundae']}});
  assert.equal(regularAvailable(state,'dottie'),false);
  state=action(state,{type:'buyDecor',decorId:'daisy_pot'});assert.equal(regularAvailable(state,'dottie'),false);
  state=action(state,{type:'homeLayout',layout:[...state.home.layout,{id:'daisies',equipmentId:'daisy_pot',x:6,y:5,rotation:0}]});
  assert.equal(regularAvailable(state,'dottie'),true);assert.equal(state.equipment.queue_bench,undefined);
  rejected(state,{type:'serveRegular',regularId:'dottie'},'regular_not_ready');
  state=action(state,{type:'serveRegular',regularId:'dottie'},now+hour);assert.equal(state.collections.regulars.dottie,1);
  assert(HOME_EQUIPMENT.some(e=>e.id==='table_2'));const table=fresh();table.coins=1000;
  const bought=action(table,{type:'buyHomeEquipment',equipmentId:'table_2'});assert.equal(bought.equipment.table_2.homeCopies,1);assert.equal(bought.coins,40);
});
console.log(`Diner progression: ${groups} groups passed.`);
