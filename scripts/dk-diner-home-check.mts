import assert from 'node:assert/strict';
import { createHomeWorld, homePath, HOME_SIM_RULES, measureHomeRates, stepHomeWorld } from '../src/lib/chef/diner/home-simulation';
import type { HomeSimulationConfig, HomeWorld } from '../src/lib/chef/diner/home-simulation';
let groups=0;
function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function starter():HomeSimulationConfig{return {w:8,h:8,layout:[{id:'grill-1',equipmentId:'grill',x:1,y:0,rotation:0},{id:'prep-1',equipmentId:'prep',x:3,y:0,rotation:0},{id:'sink-1',equipmentId:'sink',x:5,y:0,rotation:0},{id:'table-1',equipmentId:'table_2',x:2,y:3,rotation:0}],equipment:{grill:{tier:1},prep:{tier:1},sink:{tier:1},table_2:{tier:1}},menu:['classic_burger'],recipeLevels:{classic_burger:0},chefs:1,waiters:1,arrivalRate:8};}
function assertOnFloor(w:HomeWorld){for(const actor of [...w.actors,...w.customers])assert(w.walkable[Math.round(actor.y)*w.config.w+Math.round(actor.x)],`${actor.id} crossed a furnishing at ${actor.x},${actor.y}`);}
check('physical chefs and waiters preserve a dish through cooking, carrying, eating and washing',()=>{
  const config=starter();config.arrivalRate=120;const world=createHomeWorld(config);assert.equal(world.menu.length,1);let carried=false,cooking=false,eating=false,dirty=false,clearing=false;
  for(let i=0;i<4000;i++){stepHomeWorld(world);assertOnFloor(world);carried ||= world.actors.some(a=>a.role==='waiter'&&a.held?.kind==='dish');cooking ||= world.actors.some(a=>a.pose==='cook');eating ||= world.customers.some(c=>c.phase==='eating');dirty ||= world.tables.some(t=>t.seats.some(seat=>seat.status==='dirty'));clearing ||= world.actors.some(a=>a.held?.kind==='dirty');
    const items=[...world.actors.map(a=>a.held),...world.stations.flatMap(st=>st.slots.map(slot=>slot.item)),...world.tables.flatMap(t=>t.seats.map(seat=>seat.item))].filter(Boolean);assert.equal(new Set(items.map(item=>item!.id)).size,items.length,'an item may exist in only one physical location');
  }
  assert(carried&&cooking&&eating&&dirty&&clearing);assert(world.metrics.plates>=3);assert(world.metrics.washed>=2);assert(world.metrics.coins>0);
});
check('one visible world and the headless rate measurement produce identical earnings',()=>{
  const config=starter(),world=createHomeWorld(config);stepHomeWorld(world,HOME_SIM_RULES.measurementWarmupTicks);const before={...world.metrics};stepHomeWorld(world,HOME_SIM_RULES.measurementTicks);const rates=measureHomeRates(config),hours=HOME_SIM_RULES.measurementTicks/72000;
  assert.equal(rates.plates,(world.metrics.plates-before.plates)/hours);assert.equal(rates.coins,(world.metrics.coins-before.coins)/hours);assert.equal(rates.reputation,(world.metrics.reputation-before.reputation)/hours);assert.equal(rates.plates,8);assert.equal(rates.coins,200);assert.equal(rates.bottleneck,'arrivals');
  rates.menu.length=0;assert.equal(measureHomeRates(config).menu.length,1,'cached results must not be mutable');console.log(`  starter ${rates.plates} plates/hour, ${rates.coins} coins/hour`);
});
check('stored, removed, blocked or missing equipment cannot sell unsupported dishes',()=>{
  for(const kind of ['grill','prep']){const config=starter();config.layout=config.layout.filter(p=>p.equipmentId!==kind);assert.equal(measureHomeRates(config).plates,0);}
  const reversed=starter();reversed.layout.find(p=>p.equipmentId==='grill')!.rotation=2;assert.equal(measureHomeRates(reversed).plates,0);
  const stored=starter();stored.menu=['fries'];stored.equipment.fryer={tier:3};assert.equal(measureHomeRates(stored).plates,0);
  stored.layout.push({id:'fryer-1',equipmentId:'fryer',x:6,y:0,rotation:0});assert(measureHomeRates(stored).plates>0);
  const noSink=starter();noSink.layout=noSink.layout.filter(p=>p.equipmentId!=='sink');assert.equal(measureHomeRates(noSink).plates,0,'dirty seats cannot earn again without washing');
});
check('staff shortages and actual walking distance constrain throughput',()=>{
  for(const role of ['chefs','waiters'] as const){const config=starter();config[role]=0;assert.equal(measureHomeRates(config).plates,0);}
  const close=starter();close.arrivalRate=1200;const far=starter();far.arrivalRate=1200;far.layout.find(p=>p.equipmentId==='table_2')!.y=5;
  const nearRate=measureHomeRates(close),farRate=measureHomeRates(far);assert(nearRate.plates>farRate.plates,`${nearRate.plates} vs ${farRate.plates}`);
  // Moving the table another row closer puts a chair in the kitchen aisle:
  // short distance must not let a waiter walk through that chair or its diner.
  const cramped=structuredClone(close);cramped.layout.find(p=>p.equipmentId==='table_2')!.y=2;assert(measureHomeRates(cramped).plates<nearRate.plates);
  console.log(`  clear-aisle close layout ${nearRate.plates}/hour; distant layout ${farRate.plates}/hour`);
});
check('equipment upgrades and recipe mastery improve their real capacity or plate value',()=>{
  const config=starter();config.arrivalRate=1200;config.waiters=3;config.layout.push({id:'table-2',equipmentId:'table_2',x:5,y:3,rotation:0},{id:'table-3',equipmentId:'table_2',x:2,y:6,rotation:0});
  const base=measureHomeRates(config),better=structuredClone(config);better.equipment.grill.tier=3;better.equipment.prep.tier=3;better.equipment.sink.tier=3;const upgraded=measureHomeRates(better);assert(upgraded.plates>base.plates,`${upgraded.plates} <= ${base.plates}`);
  const mastery=starter();mastery.recipeLevels.classic_burger=10;assert.equal(measureHomeRates(mastery).coins,400);assert.equal(measureHomeRates(mastery).plates,8);
});
check('split ticks and JSON reload preserve all physical work and counters',()=>{
  const config=starter();config.arrivalRate=120;const whole=createHomeWorld(config),split=createHomeWorld(config);stepHomeWorld(whole,20000);stepHomeWorld(split,10000);const resumed=JSON.parse(JSON.stringify(split)) as HomeWorld;stepHomeWorld(resumed,10000);assert.deepEqual(resumed,whole);assertOnFloor(whole);
  assert(homePath(whole,whole.door,whole.stations[0].front));assert.equal(homePath(whole,whole.door,{x:-1,y:0}),null);
});
check('decor is inert blocking furniture, never a cooking station or direct earnings multiplier',()=>{
  const config=starter();const before=measureHomeRates(config);config.layout.push({id:'plant-1',equipmentId:'red_planter',x:0,y:0,rotation:0});const world=createHomeWorld(config);assert.equal(world.walkable[0],false);assert(!world.stations.some(st=>st.id==='plant-1'));assert.equal(measureHomeRates(config).coins,before.coins);
  config.layout[config.layout.length-1].x=1;config.layout[config.layout.length-1].y=1;assert.equal(measureHomeRates(config).plates,0,'a plant in front of the only grill blocks that work position');
});
check('staff meals accelerate physical work and rates; per-recipe output conserves paid plates',()=>{
  const config=starter();config.arrivalRate=1200;const before=measureHomeRates(config),fed=measureHomeRates({...config,staffSpeedMultiplier:1.1});assert(fed.plates>before.plates);assert.deepEqual(measureHomeRates({...config,staffSpeedMultiplier:9}),fed);assert.equal(Object.values(fed.platesByRecipe).reduce((a,b)=>a+b,0),fed.plates);assert.equal(fed.platesByRecipe.fries??0,0);
  const mixed=starter();mixed.arrivalRate=60;mixed.menu.push('fries');mixed.layout.push({id:'fryer-1',equipmentId:'fryer',x:6,y:0,rotation:0});mixed.equipment.fryer={tier:1};const rates=measureHomeRates(mixed);assert(rates.platesByRecipe.fries>0);assert(rates.platesByRecipe.classic_burger>0);assert.equal(Object.values(rates.platesByRecipe).reduce((a,b)=>a+b,0),rates.plates);
});
console.log(`PASS ${groups} diner home simulation groups`);
