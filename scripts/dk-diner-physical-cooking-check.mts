/** Physical supply, staged assembly and finite plate regressions. No network. */
import assert from 'node:assert/strict';
import {recipeVessel,vesselSupplyStation} from '../src/lib/chef/diner/batch';
import {RECIPES,RECIPE_BY_ID,ingredientSupply,SERVICE_RULES} from '../src/lib/chef/diner/content';
import {buildServiceLoadout,makeTable} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,sanitizeService,serviceRecipeSteps,serviceMissingIngredients,serviceSupplyChoices,serviceTargetIntent,stepService} from '../src/lib/chef/diner/service';
import {createDiner,dispatchDiner} from '../src/lib/chef/diner/progression';
import type {CreateServiceOptions,ServiceAction,ServiceState} from '../src/lib/chef/diner/types';
let groups=0;function test(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
class Cook{
  s:ServiceState;
  constructor(options:CreateServiceOptions={}){const menu=options.menu??['classic_burger'];this.s=dispatchService(createService({...buildServiceLoadout(options.tier??1,menu),menu,customers:4,tutorialLearning:true,...options}),{type:'open'});assert.equal(this.s.phase,'playing',this.s.notice);}
  send(action:ServiceAction){this.s=dispatchService(this.s,action);}
  until(fn:()=>boolean,limit=12000){let n=0;while(!fn()&&n++<limit&&['playing','closing'].includes(this.s.phase))stepService(this.s,1);assert(fn(),this.s.notice);}
  touch(targetId:string,recipeId?:string,ingredientId?:string,seatId?:string){this.send({type:'interact',targetId,recipeId,ingredientId,seatId});this.until(()=>!this.s.chef.path.length);}
  supply(recipeId:string,ingredientId=RECIPE_BY_ID[recipeId].ingredients[0]){this.touch(this.s.stations.find(st=>st.kind===ingredientSupply(ingredientId))!.id,recipeId,ingredientId);assert.equal(this.s.chef.held?.ingredientId,ingredientId,this.s.notice);}
  dish(recipeId:string){
    this.supply(recipeId);
    for(const [i,step] of serviceRecipeSteps(this.s,recipeId).entries()){
      const station=this.s.stations.find(st=>st.kind===step.station)!,missing=serviceMissingIngredients(this.s.chef.held!);this.touch(station.id);
      for(const ingredientId of missing){this.supply(recipeId,ingredientId);this.touch(station.id);}
      this.send({type:'hold',active:true});this.until(()=>this.s.stations.find(st=>st.id===station.id)!.slots.some(slot=>slot.job?.ready));this.send({type:'hold',active:false});
      if(step.station==='boiler')this.touch(station.id);
      if(i===serviceRecipeSteps(this.s,recipeId).length-1){if(recipeId==='fries'&&this.s.config.batchVersion)this.touch(station.id);this.touch(this.s.config.batchVersion?vesselSupplyStation(recipeVessel(recipeId))!:'plates');assert.equal(this.s.chef.held?.kind,'plate');this.touch(station.id);}else this.touch(station.id);
      assert.equal(this.s.chef.held?.step,i+1,`${recipeId} step${i}`);
    }
    assert.equal(this.s.chef.held?.kind,'dish');assert(this.s.chef.held?.plateId);assert(sanitizeService(this.s),'physical meal must be checkpointable');
  }
  wash(){this.touch('sink');this.send({type:'hold',active:true});this.until(()=>this.s.stations.find(st=>st.kind==='sink')!.slots.every(slot=>!slot.item));this.send({type:'hold',active:false});}
}
test('one burger has separate fridge patty, pantry bun and a visible two-plate rack',()=>{
  const d=new Cook();assert.deepEqual(serviceSupplyChoices(d.s,'fridge'),[{ingredientId:'beef',recipeId:'classic_burger',name:'Raw patty'}]);assert.deepEqual(serviceSupplyChoices(d.s,'crate'),[{ingredientId:'bun',recipeId:'classic_burger',name:'Bun'}]);assert.equal(d.s.cleanPlates,2);
  d.supply('classic_burger');const patty=d.s.chef.held!.id;d.touch('grill');d.until(()=>!!d.s.stations.find(st=>st.kind==='grill')!.slots[0].job?.ready);d.touch('grill');assert.equal(d.s.chef.held?.stage,'cooked_patty');d.touch('prep');
  let prep=d.s.stations.find(st=>st.kind==='prep')!;assert.equal(prep.slots[0].item?.id,patty);assert.equal(prep.slots[0].job,null);d.send({type:'hold',active:true});stepService(d.s,100);assert.equal(prep.slots[0].item?.kind,'processed');assert.equal(d.s.served,0);
  d.supply('classic_burger','bun');const bun=d.s.chef.held!.id;assert.match(serviceTargetIntent(d.s,'prep').label,/combine/i);d.touch('prep');prep=d.s.stations.find(st=>st.kind==='prep')!;assert.deepEqual(prep.slots[0].item?.components,[{id:bun,ingredientId:'bun'}]);assert.equal(d.s.chef.held,null);
  d.send({type:'hold',active:true});d.until(()=>!!d.s.stations.find(st=>st.kind==='prep')!.slots[0].job?.ready);d.send({type:'hold',active:false});assert.equal(d.s.stations.find(st=>st.kind==='prep')!.slots[0].item?.stage,'prepared_classic_burger');
  d.touch('plates');const plate=d.s.chef.held!.id;assert.equal(d.s.cleanPlates,1);assert.match(serviceTargetIntent(d.s,'prep').label,/plate/i);d.touch('prep');assert.equal(d.s.chef.held?.kind,'dish');assert.equal(d.s.chef.held?.id,patty);assert.equal(d.s.chef.held?.plateId,plate);assert(sanitizeService(d.s));
});
test('bun-first staging and partially assembled work survive pause and reload',()=>{
  const d=new Cook();d.supply('classic_burger','bun');d.touch('prep');const bunId=d.s.stations.find(st=>st.kind==='prep')!.slots[0].item!.id;
  d.supply('classic_burger');d.touch('grill');d.until(()=>!!d.s.stations.find(st=>st.kind==='grill')!.slots[0].job?.ready);d.touch('grill');d.touch('prep');d.send({type:'hold',active:true});stepService(d.s,9);
  const saved=sanitizeService(d.s)!;assert(saved);assert.equal(saved.phase,'paused');assert.equal(saved.chef.holding,false);const before=JSON.stringify(saved);stepService(saved,100);assert.equal(JSON.stringify(saved),before);assert.equal(saved.stations.find(st=>st.kind==='prep')!.slots[0].item!.components![0].id,bunId);
  d.s=dispatchService(saved,{type:'resume'});const remaining=d.s.stations.find(st=>st.kind==='prep')!.slots[0].job!.remaining;stepService(d.s,10);assert.equal(d.s.stations.find(st=>st.kind==='prep')!.slots[0].job!.remaining,remaining);d.send({type:'hold',active:true});d.until(()=>!!d.s.stations.find(st=>st.kind==='prep')!.slots[0].job?.ready);assert(sanitizeService(d.s));
});
test('multiple pantry supplies require a real selection; invalid source and unknown IDs mint nothing',()=>{
  const d=new Cook({menu:['classic_burger','fries']});assert.deepEqual(serviceSupplyChoices(d.s,'crate').map(c=>c.ingredientId),['bun','potato']);d.touch('crate');assert.equal(d.s.chef.held,null);assert.match(d.s.notice,/choose/i);
  d.touch('crate','classic_burger','beef');assert.equal(d.s.chef.held,null);d.touch('fridge','fries','potato');assert.equal(d.s.chef.held,null);
  for(const ingredientId of ['constructor','__proto__','free_burger']){const before=JSON.stringify(d.s);d.send({type:'interact',targetId:'crate',ingredientId});assert.equal(d.s.chef.held,null);assert.equal(d.s.nextId,JSON.parse(before).nextId);}
  d.supply('fries');assert.equal(d.s.chef.held?.ingredientId,'potato');
});
test('a finite plate cannot be cloned, lost in the bin or returned twice by washing',()=>{
  const d=new Cook({plateCount:1});d.dish('classic_burger');assert.equal(d.s.cleanPlates,0);const plate=d.s.chef.held!.plateId!;d.touch('bin');assert.equal(d.s.chef.held?.kind,'dirty');assert.equal(d.s.chef.held?.id,plate);assert.equal(d.s.chef.held?.meal,undefined);assert(sanitizeService(d.s));
  d.touch('bin');assert.equal(d.s.chef.held?.id,plate);d.wash();assert.equal(d.s.cleanPlates,1);assert.deepEqual(d.s.plateStock,[plate]);stepService(d.s,200);assert.equal(d.s.cleanPlates,1);
  d.touch('plates');d.touch('prep');assert.equal(d.s.cleanPlates,0);d.touch('plates');assert.equal(d.s.chef.held,null);assert.match(d.s.notice,/wash/i);d.touch('prep');d.touch('plates');assert.equal(d.s.cleanPlates,1);assert(sanitizeService(d.s));
  const duplicate=structuredClone(d.s);duplicate.plateStock.push(plate);duplicate.cleanPlates++;assert.equal(sanitizeService(duplicate),null);const vanished=structuredClone(d.s);vanished.plateStock=[];vanished.cleanPlates=0;assert.equal(sanitizeService(vanished),null);
});
test('served food becomes its same dirty plate, and clearing removes only its dish while washing returns the same plate',()=>{
  const d=new Cook({plateCount:1});d.until(()=>d.s.customers.some(c=>c.phase==='seated'));d.dish('classic_burger');const plate=d.s.chef.held!.plateId!,guest=d.s.customers[0];d.touch(guest.tableId!,undefined,undefined,guest.seatId!);d.until(()=>d.s.tables[0].seats.some(seat=>seat.status==='dirty'));
  const seat=d.s.tables[0].seats.find(seat=>seat.status==='dirty')!;assert.equal(seat.item?.id,plate);assert.equal(d.s.cleanPlates,0);assert(sanitizeService(d.s));d.touch(guest.tableId!,undefined,undefined,guest.seatId!);assert.equal(d.s.chef.held?.id,plate);assert.equal(seat.status,'dirty');assert.equal(d.s.tables[0].seats.find(s=>s.id===guest.seatId)!.status,'clean');d.wash();assert.equal(d.s.cleanPlates,1);assert.equal(d.s.washed,1);d.until(()=>d.s.spawned===2);assert.equal(d.s.strikes,0);
});
test('the whole first slow lunch is playable with one chair and two circulating plates',()=>{
  const now=Date.UTC(2026,8,20);let state=createDiner(now,'fresh-physical-layout');
  assert.deepEqual(state.truckConfig.stations.find(s=>s.kind==='fridge'),{id:'fridge',kind:'fridge',x:3,y:0,facing:0});
  state=dispatchDiner(state,{type:'setupLayout',stations:[...state.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:state.truckConfig.tables},{now}).state;
  state=dispatchDiner(state,{type:'startRun'},{now}).state;state=dispatchDiner(state,{type:'chooseNode',nodeId:state.run!.available[0]},{now}).state;
  const initial=state.run!.service!,d=new Cook({...initial.config,stations:initial.stations,tables:initial.tables});let decisions=0;
  while(['playing','closing'].includes(d.s.phase)&&decisions++<500){
    if(d.s.served===d.s.config.customers){stepService(d.s,20);continue;}
    const guest=d.s.customers.find(c=>c.phase==='seated');if(guest&&d.s.tables[0].seats.some(seat=>seat.customerId===guest.id&&seat.item?.kind==='dirty')){d.touch(guest.tableId!,undefined,undefined,guest.seatId!);d.wash();continue;}if(guest&&d.s.cleanPlates>0){d.dish(guest.recipeId);d.touch(guest.tableId!,undefined,undefined,guest.seatId!);continue;}
    const dirty=d.s.tables.flatMap(table=>table.seats.filter(seat=>seat.status==='dirty').map(seat=>({tableId:table.id,seatId:seat.id})))[0];if(dirty){d.touch(dirty.tableId,undefined,undefined,dirty.seatId);d.wash();continue;}stepService(d.s,20);
  }
  assert.equal(d.s.phase,'complete');assert.equal(d.s.served,4);assert.equal(d.s.paid,4);assert.equal(d.s.strikes,0);assert.equal(d.s.washed,3);assert.equal(d.s.config.plateCount,2);assert(sanitizeService(d.s));console.log(`  first lunch: ${d.s.tick/20}s, four physical burgers, three washed plates`);
});
test('every recipe uses a physical primary ingredient and the correct serving vessel, with cold food remaining cold',()=>{
  for(const recipe of RECIPES){const d=new Cook({menu:[recipe.id],customers:1,tutorialLearning:true});d.dish(recipe.id);assert.equal(d.s.cleanPlates,d.s.config.plateCount-(recipeVessel(recipe.id)==='plate'?1:0));assert.equal(d.s.chef.held!.vesselKind,recipeVessel(recipe.id));assert.equal(d.s.chef.held!.ingredientId,recipe.ingredients[0]);assert.equal(d.s.chef.held!.stage,`plated_${recipe.id}`);}
  const d=new Cook({menu:['fries'],...buildServiceLoadout(1,['classic_burger','fries'])});d.supply('fries');d.touch('prep');d.send({type:'hold',active:true});d.until(()=>!!d.s.stations.find(st=>st.kind==='prep')!.slots[0].job?.ready);d.touch('prep');d.touch('fryer');d.until(()=>!!d.s.stations.find(st=>st.kind==='fryer')!.slots[0].job?.ready);d.touch('fryer');stepService(d.s,SERVICE_RULES.coldTicks);d.touch('boxes');d.touch('fryer');assert.equal(d.s.chef.held?.kind,'dish');assert.equal(d.s.chef.held?.cold,true);
});
test('legacy recipe portions resume with their original meaning and do not conjure a physical plate pool',()=>{
  let s=createService({physicalSupplies:false,menu:['classic_burger']});s=dispatchService(s,{type:'open'});s=dispatchService(s,{type:'interact',targetId:'crate',recipeId:'classic_burger'});while(s.chef.path.length)stepService(s,1);assert.equal(s.chef.held?.kind,'raw');delete (s.config as any).physicalSupplies;delete (s.config as any).plateCount;delete (s as any).plateStock;delete (s as any).cleanPlates;
  const restored=sanitizeService(s)!;assert(restored);assert.equal(restored.config.physicalSupplies,false);assert.equal(restored.cleanPlates,0);assert.equal(restored.chef.held?.kind,'raw');assert.deepEqual(restored.chef.held,s.chef.held);
});
console.log(`PASS ${groups} physical cooking and plate conservation groups`);
