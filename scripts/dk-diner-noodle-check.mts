/** Real noodle preparation, explicit draining and independent washable vessels. */
import assert from 'node:assert/strict';
import {Cook} from './dk-diner-cook-fixture';
import {buildServiceLoadout} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,sanitizeService,serviceReadyError,serviceSupplyChoices,serviceTargetIntent,serviceMissingIngredients} from '../src/lib/chef/diner/service';
import {createBoilBasket,validateBoilBasket} from '../src/lib/chef/diner/batch';
import type {CreateServiceOptions,ServiceAction,ServiceState} from '../src/lib/chef/diner/types';
let groups=0;
function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
class Kitchen {
  s:ServiceState; cook:Cook;
  constructor(menu=['tomato_pasta'],options:CreateServiceOptions={}){
    const layout=buildServiceLoadout(options.tier??1,menu);assert.equal(layout.error,null);
    this.s=createService({...layout,menu,customers:8,tutorialLearning:true,...options});
    assert.equal(serviceReadyError(this.s),null);
    this.cook=new Cook(()=>this.s,action=>this.send(action));this.send({type:'open'});
  }
  send(action:ServiceAction){this.s=dispatchService(this.s,action);}
  until(predicate:()=>boolean){this.cook.until(predicate,4000);}
  touch(target:string,recipe?:string,ingredient?:string){this.cook.touch(target,recipe,undefined,ingredient);}
  boiler(){return this.s.stations.find(st=>st.kind==='boiler')!.slots[0];}
  prep(){return this.s.stations.find(st=>st.kind==='prep')!.slots[0];}
  reload(){const before=JSON.parse(JSON.stringify(this.s));const loaded=sanitizeService(before);assert(loaded,'valid noodle checkpoint must resume');assert.equal(loaded.phase,'paused');assert.equal(loaded.chef.holding,false);const frozen=structuredClone(loaded),tick=dispatchService(loaded,{type:'tick',ticks:100});tick.notice=frozen.notice;assert.deepEqual(tick,frozen);this.s=dispatchService(loaded,{type:'resume'});}
  boiled(recipe='tomato_pasta',ingredient='pasta'){
    this.touch('crate',recipe,ingredient);this.touch('boiler');this.until(()=>this.boiler().boil?.phase==='ready');
    assert.match(serviceTargetIntent(this.s,'boiler').label,/lift.*drain/i);this.touch('boiler');assert.equal(this.s.chef.held,null);assert.equal(this.boiler().boil?.phase,'drained');
    this.touch('boiler');assert.equal(this.s.chef.held?.step,1);assert.equal(this.boiler().item,null);assert.equal(this.boiler().boil,null);
  }
}
check('pasta fits the small truck using a boiler, prep counter and bowls without burger supplies',()=>{
  const k=new Kitchen();assert.deepEqual(k.s.stations.map(st=>st.kind).sort(),['bin','boiler','bowls','crate','prep','sink'].sort());
  assert.equal(k.s.config.plateCount,0);assert.equal(k.s.config.cupCount,0);assert.equal(k.s.config.bowlCount,2);
  assert.deepEqual(serviceSupplyChoices(k.s,'crate').map(item=>item.ingredientId),['pasta','tomato_sauce']);
  for(const kind of ['boiler','bowls','prep']){const missing=structuredClone(k.s);missing.stations=missing.stations.filter(st=>st.kind!==kind);assert(serviceReadyError(missing));}
  const ramen=new Kitchen(['vegetable_ramen']);assert(ramen.s.stations.some(st=>st.kind==='fridge'));assert.deepEqual(serviceSupplyChoices(ramen.s,'fridge').map(item=>item.ingredientId),['mixed_vegetables']);
});
check('boiling persists mid-job and draining is an explicit action before collection',()=>{
  const k=new Kitchen();k.touch('crate','tomato_pasta','pasta');const original=k.s.chef.held!.id;k.touch('boiler');k.send({type:'tick',ticks:30});const remaining=k.boiler().job!.remaining;assert(remaining>0);k.reload();assert.equal(k.boiler().job!.remaining,remaining);
  k.until(()=>k.boiler().boil?.phase==='ready');assert.equal(k.boiler().item!.stage,'boiled_pasta');k.reload();assert.equal(k.boiler().boil!.phase,'ready');
  k.touch('boiler');assert.equal(k.s.chef.held,null);assert.equal(k.boiler().item!.id,original);assert.equal(k.boiler().item!.stage,'drained_pasta');k.reload();
  k.touch('boiler');assert.equal(k.s.chef.held!.id,original);assert.equal(k.s.chef.held!.stage,'drained_pasta');k.touch('prep');k.touch('boiler');assert.equal(k.s.chef.held,null,'a second pickup cannot recreate the drained noodles');assert(sanitizeService(k.s));
});
check('tomato sauce is a separate component and cannot be replaced by a plate or timer',()=>{
  const k=new Kitchen();k.boiled();k.touch('prep');assert.deepEqual(serviceMissingIngredients(k.prep().item!),['tomato_sauce']);assert.equal(k.prep().job,null);k.send({type:'hold',active:true});k.send({type:'tick',ticks:100});assert.equal(k.prep().item!.step,1);
  k.touch('bowls');k.touch('prep');assert.equal(k.s.chef.held?.kind,'plate');assert.equal(k.prep().job,null);k.touch('bowls');
  k.touch('crate','tomato_pasta','tomato_sauce');const sauce=k.s.chef.held!.id;k.touch('prep');assert.deepEqual(k.prep().item!.components,[{id:sauce,ingredientId:'tomato_sauce'}]);
  k.send({type:'hold',active:true});k.send({type:'tick',ticks:10});k.reload();const remaining=k.prep().job!.remaining;k.send({type:'tick',ticks:10});assert.equal(k.prep().job!.remaining,remaining);k.send({type:'hold',active:true});k.until(()=>!!k.prep().job?.ready);k.touch('bowls');k.touch('prep');assert.equal(k.s.chef.held?.kind,'dish');assert.equal(k.s.chef.held?.vesselKind,'bowl');assert(sanitizeService(k.s));
});
check('ramen needs pantry broth and refrigerated vegetables, with partial assembly preserved',()=>{
  const k=new Kitchen(['vegetable_ramen']);k.boiled('vegetable_ramen','ramen_noodles');k.touch('prep');
  k.touch('crate','vegetable_ramen','mixed_vegetables');assert.equal(k.s.chef.held,null);k.touch('fridge','vegetable_ramen','vegetable_broth');assert.equal(k.s.chef.held,null);
  k.touch('crate','vegetable_ramen','vegetable_broth');const broth=k.s.chef.held!.id;k.touch('prep');assert.equal(k.prep().job,null);assert.deepEqual(serviceMissingIngredients(k.prep().item!),['mixed_vegetables']);k.reload();
  k.touch('fridge','vegetable_ramen','mixed_vegetables');const veg=k.s.chef.held!.id;k.touch('prep');assert.deepEqual(k.prep().item!.components,[{id:broth,ingredientId:'vegetable_broth'},{id:veg,ingredientId:'mixed_vegetables'}]);k.send({type:'hold',active:true});k.until(()=>!!k.prep().job?.ready);k.touch('bowls');k.touch('prep');assert.equal(k.s.chef.held?.stage,'plated_vegetable_ramen');assert.equal(k.s.chef.held?.vesselKind,'bowl');assert(sanitizeService(k.s));
});
check('dirty bowls leave the table at pickup and return exactly once to the bowl rack',()=>{
  const k=new Kitchen(['tomato_pasta'],{bowlCount:1});k.until(()=>k.s.customers.some(c=>c.phase==='seated'));k.cook.dish('tomato_pasta');const vessel=k.s.chef.held!.plateId!,guest=k.s.customers.find(c=>c.phase==='seated')!;
  k.cook.touch(guest.tableId!,undefined,guest.seatId!);k.until(()=>k.s.tables.some(table=>table.seats.some(seat=>seat.item?.kind==='dirty')));assert.equal(k.s.cleanBowls,0);
  k.cook.touch(guest.tableId!,undefined,guest.seatId!);assert.equal(k.s.chef.held?.id,vessel);assert.equal(k.s.chef.held?.vesselKind,'bowl');assert.equal(k.s.tables.find(t=>t.id===guest.tableId)!.seats.find(s=>s.id===guest.seatId)!.item,null);k.reload();
  k.touch('sink');k.send({type:'hold',active:true});k.send({type:'tick',ticks:10});k.reload();k.send({type:'hold',active:true});k.until(()=>k.s.stations.find(s=>s.kind==='sink')!.slots.every(slot=>!slot.item));
  assert.deepEqual(k.s.bowlStock,[vessel]);assert.equal(k.s.cleanPlates,0);assert.equal(k.s.cleanCups,0);assert.equal(k.s.washed,1);k.send({type:'tick',ticks:100});assert.deepEqual(k.s.bowlStock,[vessel]);assert(sanitizeService(k.s));
});
check('plate, cup and bowl pools stay separate through bin disposal, washing and forged checkpoints',()=>{
  const k=new Kitchen(['tomato_pasta','coffee','classic_burger'],{tier:3,bowlCount:1});assert.equal(k.s.cleanPlates,2);assert.equal(k.s.cleanCups,2);const plates=[...k.s.plateStock],cups=[...k.s.cupStock];
  k.cook.dish('tomato_pasta');const bowl=k.s.chef.held!.plateId!;k.touch('bin');assert.equal(k.s.chef.held?.kind,'dirty');assert.equal(k.s.chef.held?.id,bowl);k.touch('bin');assert.equal(k.s.chef.held?.id,bowl);k.touch('sink');k.send({type:'hold',active:true});k.until(()=>k.s.cleanBowls===1);assert.deepEqual(k.s.plateStock,plates);assert.deepEqual(k.s.cupStock,cups);
  for(const pool of ['plateStock','cupStock'] as const){const forged=structuredClone(k.s);forged.bowlStock[0]=forged[pool][0];assert.equal(sanitizeService(forged),null);}
  const lost=structuredClone(k.s);lost.bowlStock=[];lost.cleanBowls=0;assert.equal(sanitizeService(lost),null);
  k.touch('bowls');k.touch('prep');k.touch('bowls');assert.equal(k.s.chef.held,null);assert.match(k.s.notice,/wash/i);assert.deepEqual(k.s.plateStock,plates);assert.deepEqual(k.s.cupStock,cups);k.touch('prep');k.touch('bowls');assert.equal(k.s.cleanBowls,1);assert(sanitizeService(k.s));
});
check('boiler receipts reject impossible phases, duplicate objects and missing drain state',()=>{
  const receipt=createBoilBasket('tomato_pasta',0)!;assert(validateBoilBasket(receipt));assert.equal(createBoilBasket('classic_burger',0),null);
  for(const bad of [{...receipt,phase:'raised'},{...receipt,recipeId:'fries'},{...receipt,createdTick:-1},{...receipt,portions:3}])assert.equal(validateBoilBasket(bad),null);
  const k=new Kitchen();k.touch('crate','tomato_pasta','pasta');k.touch('boiler');k.until(()=>k.boiler().boil?.phase==='ready');
  const noReceipt=structuredClone(k.s);delete noReceipt.stations.find(st=>st.kind==='boiler')!.slots[0].boil;assert.equal(sanitizeService(noReceipt),null);
  const fakeDrain=structuredClone(k.s);fakeDrain.stations.find(st=>st.kind==='boiler')!.slots[0].boil!.phase='drained';assert.equal(sanitizeService(fakeDrain),null);
  const duplicate=structuredClone(k.s);duplicate.chef.held=structuredClone(duplicate.stations.find(st=>st.kind==='boiler')!.slots[0].item);assert.equal(sanitizeService(duplicate),null);
});
check('six actual noodle customers can be served with only two bowls and no burger machinery',()=>{
  for(const recipe of ['tomato_pasta','vegetable_ramen']){const k=new Kitchen([recipe],{customers:6});k.cook.run();assert.equal(k.s.served,6);assert.equal(k.s.missed,0);assert(k.s.washed>=4);assert.equal(k.s.config.bowlCount,2);assert(sanitizeService(k.s));console.log(`  ${recipe}: ${k.s.tick/20}s, ${k.s.washed} bowls washed`);}
});
check('old active burger saves retain food, progress and their original vessel pools',()=>{
  const k=new Kitchen(['classic_burger']);k.touch('fridge','classic_burger','beef');k.touch('grill');k.send({type:'tick',ticks:15});const old=JSON.parse(JSON.stringify(k.s));delete old.config.bowlCount;delete old.bowlStock;delete old.cleanBowls;delete old.config.recipeLevels.tomato_pasta;delete old.config.recipeLevels.vegetable_ramen;
  const restored=sanitizeService(old);assert(restored);assert.equal(restored.config.bowlCount,0);assert.deepEqual(restored.bowlStock,[]);assert.deepEqual(restored.plateStock,k.s.plateStock);assert.deepEqual(restored.stations,k.s.stations);assert.equal(restored.tick,k.s.tick);
});
console.log(`PASS ${groups} noodle cooking and vessel conservation groups`);
