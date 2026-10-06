/** Real cooking commands: either plating order, finite vessels, and disposable cartons. */
import assert from 'node:assert/strict';
import {recipeVessel,vesselSupplyStation} from '../src/lib/chef/diner/batch';
import {SERVICE_RULES} from '../src/lib/chef/diner/content';
import {buildServiceLoadout,makeStation} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,sanitizeService,serviceTargetIntent,compatibleServiceTargets,isUsedFriesBox,isPlatableServiceFood} from '../src/lib/chef/diner/service';
import type {CreateServiceOptions,ServiceAction,ServiceState} from '../src/lib/chef/diner/types';
import {firstLunchCoach,nearestTruckInteraction} from '../src/app/chef/diner-preview/truck-controls';
import {Cook} from './dk-diner-cook-fixture';

let groups=0;
function test(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
class Kitchen {
  s:ServiceState;
  cook:Cook;
  constructor(menu=['classic_burger'],options:CreateServiceOptions={}) {
    const loadout=buildServiceLoadout(2,menu);
    loadout.stations.push(makeStation('holding','pass',6,5));
    this.s=dispatchService(createService({...loadout,tier:2,menu,customers:4,lessonVersion:0,tutorialLearning:true,queuePatienceTicks:12000,tablePatienceTicks:12000,...options}),{type:'prepare'});
    assert.equal(this.s.phase,'preparing',this.s.notice);
    this.cook=new Cook(()=>this.s,action=>this.send(action));
  }
  send(action:ServiceAction){this.s=dispatchService(this.s,action);}
  touch(id:string,recipeId?:string,seatId?:string,ingredientId?:string){this.cook.touch(id,recipeId,seatId,ingredientId);}
  reload(){const loaded=sanitizeService(JSON.parse(JSON.stringify(this.s)));assert(loaded,'valid checkpoint');this.s=dispatchService(loaded,{type:'resume'});}
  tick(ticks:number){while(ticks>0){const n=Math.min(ticks,SERVICE_RULES.maxTicksPerAction);this.send({type:'tick',ticks:n});ticks-=n;}}
  stock(){return [...this.s.plateStock,...this.s.cupStock,...this.s.bowlStock];}
  fryPortion(recipe='fries'){
    this.touch('crate',recipe,undefined,'potato');this.touch('prep');this.send({type:'hold',active:true});
    this.cook.until(()=>!!this.s.stations.find(s=>s.kind==='prep')!.slots[0].job?.ready);this.send({type:'hold',active:false});
    this.touch('prep');this.touch('fryer');this.cook.until(()=>this.s.stations.find(s=>s.kind==='fryer')!.slots[0].batch?.phase==='ready');
    this.touch('fryer');this.touch('fryer');assert.equal(this.s.chef.held?.stage,'fries_portion');
  }
  serve(){
    this.send({type:'open'});this.cook.until(()=>this.s.customers.some(c=>c.phase==='seated'));
    const guest=this.s.customers.find(c=>c.phase==='seated')!;this.touch(guest.tableId!,undefined,guest.seatId!);
    assert.equal(this.s.served,1,this.s.notice);return guest;
  }
}

test('finished food can collect its vessel second, with exact ownership across reload',()=>{
  for(const recipe of ['classic_burger','fries','cheese_fries','coffee','tomato_pasta']){
    const k=new Kitchen([recipe]);k.cook.dish(recipe,false);assert(isPlatableServiceFood(k.s,k.s.chef.held),recipe);
    k.reload();const food=structuredClone(k.s.chef.held!),before=k.stock(),supply=vesselSupplyStation(recipeVessel(recipe))!;
    assert.equal(serviceTargetIntent(k.s,supply).disabled,false);assert(compatibleServiceTargets(k.s).includes(supply));
    assert.equal(nearestTruckInteraction(k.s)?.targetId,supply);assert.equal(firstLunchCoach(k.s).targetId,supply);
    k.touch(supply);assert.equal(k.s.chef.held?.kind,'dish');assert.equal(k.s.chef.held?.id,food.id);assert.equal(k.s.chef.held?.recipeId,recipe);
    assert.equal(k.s.chef.held?.vesselKind,recipeVessel(recipe));assert(k.s.chef.held?.plateId);
    assert.deepEqual(k.stock(),before.filter(id=>id!==k.s.chef.held?.plateId));
    assert((k.s.chef.held!.warmthTicks??0)<=(food.warmthTicks??0));assert.equal(k.s.chef.held?.cold,food.cold);
    const plate=k.s.chef.held!.plateId,after=k.stock();k.touch(supply);
    assert.equal(k.s.chef.held?.plateId,plate);assert.deepEqual(k.stock(),after);k.reload();k.serve();
  }
});

test('vessel-first and food-first use the same three-portion basket without duplicating food',()=>{
  const k=new Kitchen(['fries']);k.cook.dish('fries');assert.equal(k.s.chef.held?.kind,'dish');
  const fryer=()=>k.s.stations.find(s=>s.kind==='fryer')!.slots[0];assert.equal(fryer().batch?.remaining,2);k.touch('bin');
  k.cook.dish('fries',false);const second=k.s.chef.held!.id;k.touch('boxes');assert.equal(k.s.chef.held?.id,second);assert.equal(fryer().batch?.remaining,1);k.touch('bin');
  k.cook.dish('fries',false);k.touch('boxes');assert.equal(fryer().item,null);assert.equal(fryer().batch,null);k.touch('bin');
  k.touch('fryer');assert.equal(k.s.chef.held,null);assert.equal(k.s.washed,0);k.reload();
});

test('an empty plate at prep accepts carried food and a carried plate accepts prepared food',()=>{
  const k=new Kitchen();k.cook.dish('classic_burger',false);const food=k.s.chef.held!.id;
  k.touch('holding');k.touch('plates');const plate=k.s.chef.held!.id;
  k.touch('prep');k.touch('holding');k.touch('prep');
  assert.equal(k.s.chef.held?.kind,'dish');assert.equal(k.s.chef.held?.id,food);assert.equal(k.s.chef.held?.plateId,plate);k.reload();
  const plateFirst=new Kitchen();plateFirst.cook.dish('classic_burger');assert.equal(plateFirst.s.chef.held?.kind,'dish');assert.equal(plateFirst.s.cleanPlates,1);plateFirst.reload();
});

test('empty racks, wrong vessels and unfinished food cannot consume or invent plates',()=>{
  const k=new Kitchen(['classic_burger','fries']);k.touch('plates');const reserved=k.s.chef.held!.id;k.touch('holding');
  k.touch('plates');k.touch('holding');assert.equal(k.s.cleanPlates,0);
  k.cook.dish('classic_burger',false);const food=k.s.chef.held!.id;
  assert.equal(serviceTargetIntent(k.s,'plates').disabled,true);k.touch('plates');assert.equal(k.s.chef.held?.id,food);assert.equal(k.s.chef.held?.kind,'processed');
  assert.equal(serviceTargetIntent(k.s,'boxes').disabled,true);k.touch('boxes');assert.equal(k.s.chef.held?.id,food);assert.equal(k.s.cleanPlates,0);
  k.touch('prep');k.cook.touch('holding',undefined,undefined,undefined,reserved);k.touch('prep');assert.equal(k.s.chef.held?.plateId,reserved);k.reload();
  const raw=new Kitchen();raw.touch('fridge','classic_burger',undefined,'beef');const stock=raw.stock();raw.touch('plates');assert.equal(raw.s.chef.held?.kind,'ingredient');assert.deepEqual(raw.stock(),stock);
  raw.touch('grill');raw.cook.until(()=>!!raw.s.stations.find(s=>s.kind==='grill')!.slots[0].job?.ready);raw.touch('grill');raw.touch('plates');assert.equal(raw.s.chef.held?.stage,'cooked_patty');assert.deepEqual(raw.stock(),stock);
  const cheese=new Kitchen(['cheese_fries']);cheese.fryPortion('cheese_fries');assert.equal(serviceTargetIntent(cheese.s,'boxes').disabled,true);cheese.touch('boxes');assert.equal(cheese.s.chef.held?.stage,'fries_portion');assert.equal(cheese.s.chef.held?.plateId,undefined);cheese.reload();
});

test('boxing and plating cold food never refreshes warmth',()=>{
  for(const recipe of ['classic_burger','fries']){
    const k=new Kitchen([recipe]);k.cook.dish(recipe,false);k.tick(1801);assert.equal(k.s.chef.held?.cold,true);
    k.touch(vesselSupplyStation(recipeVessel(recipe))!);assert.equal(k.s.chef.held?.kind,'dish');assert.equal(k.s.chef.held?.cold,true);assert.equal(k.s.chef.held?.warmthTicks,0);k.reload();
  }
});

test('cleared fries and cheese-fries boxes go to the bin, never the sink or a clean rack',()=>{
  for(const recipe of ['fries','cheese_fries']){
    const k=new Kitchen([recipe]);k.cook.dish(recipe,false);k.touch('boxes');const box=k.s.chef.held!.plateId!,guest=k.serve();
    k.cook.until(()=>k.s.tables.some(t=>t.seats.some(seat=>seat.item?.kind==='dirty')));k.touch(guest.tableId!,undefined,guest.seatId!);
    assert(isUsedFriesBox(k.s.chef.held));assert.equal(k.s.chef.held?.id,box);assert.equal(k.s.tables.find(t=>t.id===guest.tableId)!.seats.find(s=>s.id===guest.seatId)!.item,null);
    assert.equal(nearestTruckInteraction(k.s)?.targetId,'bin');assert.equal(firstLunchCoach(k.s).targetId,'bin');assert(compatibleServiceTargets(k.s).includes('bin'));assert(!compatibleServiceTargets(k.s).includes('sink'));
    assert.equal(serviceTargetIntent(k.s,'sink').recovery?.targetId,'bin');k.touch('sink');assert.equal(k.s.chef.held?.id,box);assert(k.s.stations.find(s=>s.kind==='sink')!.slots.every(slot=>!slot.item));
    k.touch('holding');k.reload();k.cook.touch('holding',undefined,undefined,undefined,box);const stock=k.stock();k.touch('bin');
    assert.equal(k.s.chef.held,null);assert.equal(k.s.washed,0);assert.deepEqual(k.stock(),stock);k.touch('bin');assert.equal(k.s.washed,0);k.reload();
  }
});

test('clear-and-wash helpers physically carry used cartons to the bin',()=>{
  const k=new Kitchen(['fries'],{helpers:[{id:'washer',role:'washer',look:0}]});k.cook.dish('fries');k.serve();
  let carried=false,headedToBin=false,washed=false;
  for(let tick=0;tick<1200;tick++){
    k.tick(1);const helper=k.s.helpers[0];carried||=isUsedFriesBox(helper.held);headedToBin||=helper.targetId==='bin';washed||=k.s.stations.find(s=>s.kind==='sink')!.slots.some(slot=>!!slot.item);
    if(carried&&headedToBin&&!helper.held&&!helper.task)break;
  }
  assert(carried);assert(headedToBin);assert(!washed);assert.equal(k.s.washed,0);assert.equal(k.s.helpers[0].held,null);k.reload();
});

test('reusable plates still need washing, including legacy fries served on plates',()=>{
  for(const recipe of ['classic_burger','fries']){
    const k=new Kitchen([recipe],{...buildServiceLoadout(2,['classic_burger','fries']),batchVersion:0,cookingVersion:0});k.cook.dish(recipe);const guest=k.serve();
    k.cook.until(()=>k.s.tables.some(t=>t.seats.some(seat=>seat.item?.kind==='dirty')));k.touch(guest.tableId!,undefined,guest.seatId!);
    assert.equal(isUsedFriesBox(k.s.chef.held),false);const plate=k.s.chef.held!.id;k.touch('bin');assert.equal(k.s.chef.held?.id,plate);
    k.touch('sink');k.send({type:'hold',active:true});k.cook.until(()=>k.s.washed===1);k.send({type:'hold',active:false});assert(k.s.plateStock.includes(plate));k.reload();
  }
});
console.log(`PASS ${groups} serving-vessel groups`);
