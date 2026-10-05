/** Pure recipe receipts, truck utility ownership and authoritative prep time. No network. */
import assert from 'node:assert/strict';
import { BATCH_RULES, SERVING_VESSELS, createFryBatch, validateFryBatch, markFryBatchReady, raiseFryBatch, burnFryBatch, takeFryPortion, recipeVessel, vesselReusable } from '../src/lib/chef/diner/batch';
import { EQUIPMENT_BY_ID, HOME_EQUIPMENT } from '../src/lib/chef/diner/content';
import { activeDinerMode, createDiner, dispatchDiner, sanitizeDinerSave, truckEquipmentShop, type DinerCommand, type DinerState } from '../src/lib/chef/diner/progression';
import { createDinerRecord, replayDiner, DinerAuthorityError } from '../src/lib/chef/diner/authority';
const now=Date.UTC(2026,8,23,12),fresh=()=>createDiner(now,'batch-check');let groups=0;
function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function act(state:DinerState,command:DinerCommand){const result=dispatchDiner(state,command,{now});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
function reject(state:DinerState,command:DinerCommand,code:string){const result=dispatchDiner(state,command,{now});assert.equal(result.code,code,result.error);assert.deepEqual(result.state,state);}
function packed(state=fresh()){return act(state,{type:'setupLayout',stations:[...state.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:state.truckConfig.tables});}
check('a raised basket dispenses exactly three durable portions without mutating its input',()=>{
  const raw=createFryBatch(25);assert.equal(BATCH_RULES.friesPortions,3);assert.equal(takeFryPortion(raw),null);assert.equal(raiseFryBatch(raw),null);
  const ready=markFryBatchReady(raw);assert.equal(raw.phase,'cooking');assert.equal(takeFryPortion(ready),null);
  let receipt=raiseFryBatch(ready)!;assert.equal(ready.phase,'ready');assert.equal(raiseFryBatch(receipt),null);
  for(let portion=1;portion<=3;portion++){const before=structuredClone(receipt),result=takeFryPortion(validateFryBatch(JSON.parse(JSON.stringify(receipt)))!)!;assert.equal(result.portion,portion);assert.deepEqual(receipt,before);if(portion<3){receipt=result.batch!;assert.equal(receipt.remaining,3-portion);}else assert.equal(result.batch,null);}
});
check('burnt, forged and incomplete batch records cannot mint servings',()=>{
  const burnt=burnFryBatch(markFryBatchReady(createFryBatch(0)));assert.equal(burnt.phase,'burnt');assert.equal(takeFryPortion(burnt),null);assert.equal(raiseFryBatch(burnt),null);
  const raised=raiseFryBatch(markFryBatchReady(createFryBatch(0)))!;assert.deepEqual(burnFryBatch(raised),raised);
  for(const value of [{...raised,remaining:4},{...raised,remaining:0},{...raised,remaining:1.5},{...raised,total:999},{...raised,coins:999},{...raised,createdTick:NaN},Object.create(raised),{...raised,phase:'cooking',remaining:2}])assert.equal(validateFryBatch(value),null);
});
check('serving containers have distinct typed uses and later vessels remain unavailable',()=>{
  assert.equal(recipeVessel('classic_burger'),'plate');assert.equal(recipeVessel('fries'),'fry_box');for(const recipe of ['lemonade','coffee','vanilla_shake','strawberry_shake'])assert.equal(recipeVessel(recipe),'cup');
  assert.equal(vesselReusable('plate'),true);assert.equal(vesselReusable('cup'),true);assert.equal(vesselReusable('fry_box'),false);
  assert.equal(SERVING_VESSELS.bowl.available,true);assert.equal(SERVING_VESSELS.bowl.supply,'bowls');assert.equal(recipeVessel('tomato_pasta'),'bowl');assert.equal(recipeVessel('vegetable_ramen'),'bowl');
  assert.equal(SERVING_VESSELS.pizza_dish.available,false);assert.equal(SERVING_VESSELS.pizza_dish.supply,null);
  assert.deepEqual(EQUIPMENT_BY_ID.cups.tiers.map(t=>t.capacity),[2,4]);assert(!HOME_EQUIPMENT.some(e=>['cups','boxes'].includes(e.id)));
});
check('utility purchases require their machine and never change a menu or grant a home copy',()=>{
  let state=fresh();reject(state,{type:'buyTruckEquipment',equipmentId:'cups'},'equipment_unavailable');reject(state,{type:'buyTruckEquipment',equipmentId:'boxes'},'equipment_unavailable');
  state.equipment.drinks={tier:1,truckOwned:true,homeCopies:0};const before=structuredClone(state);state=act(state,{type:'buyTruckEquipment',equipmentId:'cups'});
  assert.equal(state.coins,before.coins-80);assert.equal(state.equipment.cups.homeCopies,0);assert.equal(state.equipment.cups.tier,1);assert.deepEqual(state.truckConfig.menu,before.truckConfig.menu);assert.deepEqual(state.truckConfig.stations,before.truckConfig.stations);
  reject(state,{type:'buyTruckEquipment',equipmentId:'cups'},'equipment_unavailable');reject(state,{type:'buyHomeEquipment',equipmentId:'cups'},'discover_first');
  state.equipment.fryer.truckOwned=true;const coins=state.coins;state=act(state,{type:'buyTruckEquipment',equipmentId:'boxes'});assert.equal(state.coins,coins);assert.equal(state.equipment.boxes.homeCopies,0);assert.deepEqual(sanitizeDinerSave(state)!.equipment,state.equipment);
});
check('capacity upgrades have real level and coin gates, preserve owned home copies, and reject arbitrary price',()=>{
  let state=fresh();reject(state,{type:'upgradeTruckEquipment',equipmentId:'plates'},'equipment_unavailable');
  state.restaurantLevel=5;state.coins=1000;const homes=state.equipment.sink.homeCopies;state=act(state,{type:'upgradeTruckEquipment',equipmentId:'plates'});assert.equal(state.coins,880);assert.equal(state.equipment.plates.tier,2);
  state=act(state,{type:'upgradeTruckEquipment',equipmentId:'sink'});assert.equal(state.equipment.sink.homeCopies,homes);assert.equal(state.equipment.sink.tier,2);assert.equal(truckEquipmentShop(state).find(o=>o.equipmentId==='sink')!.available,false);
  for(const equipmentId of ['constructor','__proto__','grill'])reject(state,{type:'buyTruckEquipment',equipmentId},'equipment_unavailable');
  reject(state,{type:'upgradeTruckEquipment',equipmentId:'grill',price:0} as any,'invalid_command');
});
check('setup rack upgrades rebuild actual capacity and cannot be bought after preparation begins',()=>{
  let state=packed();state.restaurantLevel=5;state.coins=1000;state=act(state,{type:'startPractice'});assert.equal(state.run!.service!.config.plateCount,2);
  state=act(state,{type:'upgradeTruckEquipment',equipmentId:'plates'});assert.equal(state.run!.service!.config.plateCount,4);assert.equal(state.run!.service!.cleanPlates,4);
  state=act(state,{type:'service',action:{type:'prepare'}});assert.equal(state.run!.service!.phase,'preparing');assert.equal(activeDinerMode(state),'service');reject(state,{type:'upgradeTruckEquipment',equipmentId:'sink'},'equipment_unavailable');
});
check('placing and upgrading a cup stand during setup derives its real pool instead of retaining zero',()=>{
  let state=packed();state.restaurantLevel=5;state.coins=1000;state.equipment.drinks={tier:1,truckOwned:true,homeCopies:0};state=act(state,{type:'startPractice'});assert.equal(state.run!.service!.cleanCups,0);
  state=act(state,{type:'buyTruckEquipment',equipmentId:'cups'});state=act(state,{type:'setupLayout',stations:[...state.truckConfig.stations,{id:'cups',kind:'cups',x:0,y:6,facing:3}],tables:state.truckConfig.tables});assert.equal(state.run!.service!.cleanCups,2);
  state=act(state,{type:'upgradeTruckEquipment',equipmentId:'cups'});assert.equal(state.run!.service!.config.cupCount,4);assert.equal(state.run!.service!.cupStock.length,4);assert.equal(state.equipment.cups.homeCopies,0);
});
check('prep before opening spends server time, pauses on absence, and cannot spawn customers',()=>{
  let record=createDinerRecord(now,'prep-clock');record.state=packed(record.state);record.state=act(record.state,{type:'startPractice'});
  record=replayDiner(record,[{type:'service',action:{type:'prepare'}}],now).record;
  assert.throws(()=>replayDiner(record,[{type:'service',action:{type:'tick',ticks:1}}],now),(e:unknown)=>e instanceof DinerAuthorityError&&e.code==='time_credit');
  record=replayDiner(record,[{type:'service',action:{type:'tick',ticks:20}}],now+1000).record;assert.equal(record.state.run!.service!.tick,20);assert.equal(record.state.run!.service!.spawned,0);
  const result=replayDiner(record,[{type:'service',action:{type:'tick',ticks:1}}],now+10000);assert.equal(result.interrupted,true);assert.equal(result.record.state.run!.service!.phase,'paused');assert.equal(result.record.state.run!.service!.pausedPhase,'preparing');
  assert.equal(sanitizeDinerSave(record.state)!.run!.service!.pausedPhase,'preparing');
});
console.log(`PASS ${groups} diner batch/progression groups`);
