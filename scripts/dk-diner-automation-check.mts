/** Real upgrade behavior through physical cooking, finite stock and reloads. */
import assert from 'node:assert/strict';
import {EQUIPMENT_BY_ID,RECIPE_BY_ID,SERVICE_RULES,ingredientSupply} from '../src/lib/chef/diner/content';
import {buildServiceLoadout,makeStation} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,sanitizeService,serviceTargetIntent} from '../src/lib/chef/diner/service';
import type {ServiceAction,ServiceState} from '../src/lib/chef/diner/types';
import {Cook} from './dk-diner-cook-fixture';
let groups=0;function check(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
class Kitchen {
 s:ServiceState;cook:Cook;
 constructor(readonly recipe:string,tiers:Record<string,number>={},extra=false){const loadout=buildServiceLoadout(1,[recipe],tiers);assert.equal(loadout.error,null);if(extra)loadout.stations.push(makeStation('pass','pass',5,5,2));this.s=dispatchService(createService({...loadout,menu:[recipe],customers:4,tutorialLearning:true,tablePatienceTicks:12000,queuePatienceTicks:12000}),{type:'open'});assert.equal(this.s.phase,'playing',this.s.notice);this.cook=new Cook(()=>this.s,a=>this.send(a));}
 send(a:ServiceAction){this.s=dispatchService(this.s,a);}
 advance(ticks:number){while(ticks>0){const count=Math.min(SERVICE_RULES.maxTicksPerAction,ticks);this.send({type:'tick',ticks:count});ticks-=count;}}
 touch(id:string,ingredient?:string){this.cook.touch(id,this.recipe,undefined,ingredient);}
 slot(kind:string){return this.s.stations.find(st=>st.kind===kind)!.slots[0];}
 reload(){const before=JSON.parse(JSON.stringify(this.s)),loaded=sanitizeService(before);assert(loaded);assert.equal(loaded.phase,'paused');assert.equal(loaded.tick,before.tick);assert.deepEqual(loaded.stations,before.stations);const frozen=dispatchService(loaded,{type:'tick',ticks:80});assert.deepEqual(frozen.stations,loaded.stations);assert.equal(frozen.tick,loaded.tick);this.s=dispatchService(loaded,{type:'resume'});}
 cutFries(){this.touch('crate','potato');this.touch('prep');this.send({type:'hold',active:true});this.cook.until(()=>!!this.slot('prep').job?.ready);this.send({type:'hold',active:false});this.touch('prep');this.touch('fryer');}
}
check('only the top fryer automatically lifts a completed three-portion basket',()=>{
 for(const tier of [1,2,3]){const k=new Kitchen('fries',{fryer:tier});k.cutFries();assert.equal(k.slot('fryer').batch!.phase,'cooking');k.send({type:'hold',active:false});k.touch('boxes');const box=k.s.chef.held!.id;k.reload();k.cook.until(()=>!!k.slot('fryer').job?.ready);assert.equal(k.s.chef.held!.id,box,'machine operation must not take the held carton');assert.equal(k.slot('fryer').batch!.phase,tier===3?'raised':'ready');assert.equal(k.slot('fryer').batch!.remaining,3);assert.equal(serviceTargetIntent(k.s,'fryer').disabled,tier!==3);if(tier===3){assert.equal(k.slot('fryer').job!.burnRemaining,null);k.touch('fryer');assert.equal(k.s.chef.held?.kind,'dish');assert.equal(k.slot('fryer').batch!.remaining,2);}else{assert(serviceTargetIntent(k.s,'fryer').label.includes('Raise'));k.touch('fryer');assert.equal(k.s.chef.held?.kind,'plate');assert.equal(k.slot('fryer').batch!.remaining,3);}}
});
check('automatic lifting cannot duplicate portions and older ready baskets resume safely',()=>{
 const k=new Kitchen('fries',{fryer:3});k.cutFries();k.send({type:'tick',ticks:15});const remaining=k.slot('fryer').job!.remaining;k.reload();assert.equal(k.slot('fryer').job!.remaining,remaining);k.cook.until(()=>k.slot('fryer').batch?.phase==='raised');
 // Before this release the same valid tier-three checkpoint remained ready.
 k.slot('fryer').batch!.phase='ready';const itemId=k.slot('fryer').item!.id;k.reload();assert.equal(k.slot('fryer').batch!.phase,'ready');k.send({type:'tick',ticks:1});assert.equal(k.slot('fryer').batch!.phase,'raised');assert.equal(k.slot('fryer').item!.id,itemId);k.reload();
 const portions=new Set<string>();for(let i=0;i<3;i++){k.touch('boxes');k.touch('fryer');assert.equal(k.s.chef.held?.kind,'dish');portions.add(k.s.chef.held!.id);if(i<2){assert.equal(k.slot('fryer').batch!.remaining,2-i);k.reload();}k.touch('bin');}
 assert.equal(portions.size,3);assert.equal(k.slot('fryer').batch,null);assert.equal(k.slot('fryer').item,null);k.touch('boxes');k.touch('fryer');assert.equal(k.s.chef.held?.kind,'plate');k.send({type:'tick',ticks:40});assert.equal(k.slot('fryer').item,null);assert(sanitizeService(k.s));
});
check('the dishwasher restores the exact used plate, cup and bowl without holding or cloning stock',()=>{
 for(const recipe of ['classic_burger','coffee','tomato_pasta']){const k=new Kitchen(recipe,{sink:3});const kind=recipe==='coffee'?'cup':recipe==='tomato_pasta'?'bowl':'plate',stock=kind==='cup'?'cupStock':kind==='bowl'?'bowlStock':'plateStock';const initial=[...k.s[stock]];assert.equal(k.s.stations.find(st=>st.kind==='sink')!.slots.length,6);k.cook.until(()=>k.s.customers.some(c=>c.phase==='seated'));k.cook.dish(recipe);const vessel=k.s.chef.held!.plateId!,guest=k.s.customers.find(c=>c.phase==='seated')!;k.cook.touch(guest.tableId!,undefined,guest.seatId!);k.cook.until(()=>k.s.tables.some(t=>t.seats.some(seat=>seat.item?.kind==='dirty')));k.cook.touch(guest.tableId!,undefined,guest.seatId!);assert.equal(k.s.chef.held!.id,vessel);k.touch('sink');assert.equal(k.slot('sink').job!.action,'timed');assert.equal(k.s.chef.holding,false);k.send({type:'tick',ticks:8});const remaining=k.slot('sink').job!.remaining;k.reload();assert.equal(k.slot('sink').job!.remaining,remaining);k.send({type:'move',x:5,y:1});k.cook.until(()=>k.s.washed===1);assert.equal(k.s.chef.holding,false);assert.deepEqual([...k.s[stock]].sort(),initial.sort());assert.equal(new Set(k.s[stock]).size,initial.length);assert.equal(k.s.customers.find(c=>c.id===guest.id)!.washed,true);k.send({type:'tick',ticks:100});assert.equal(k.s.washed,1);assert.deepEqual([...k.s[stock]].sort(),initial.sort());assert(sanitizeService(k.s));}
});
check('legacy individual fries remain individual dishes rather than acquiring new batch rewards',()=>{
 const layout=buildServiceLoadout(1,['fries'],{fryer:3});let s=dispatchService(createService({...layout,menu:['fries'],physicalSupplies:false,batchVersion:0,customers:3,tutorialLearning:true}),{type:'open'});const cook=new Cook(()=>s,a=>{s=dispatchService(s,a);});cook.touch('crate','fries');cook.touch('fryer');cook.tick(15);const loaded=sanitizeService(s);assert(loaded);s=dispatchService(loaded,{type:'resume'});cook.until(()=>!!s.stations.find(st=>st.kind==='fryer')!.slots[0].job?.ready);assert.equal(s.stations.find(st=>st.kind==='fryer')!.slots[0].batch,undefined);cook.touch('fryer');assert.equal(s.chef.held?.kind,'dish');assert.equal(s.chef.held?.recipeId,'fries');assert.equal(s.chef.held?.plateId,undefined);assert(sanitizeService(s));
});
check('ordinary sinks still need physical washing rather than gaining the dishwasher benefit',()=>{
 for(const tier of [1,2]){const k=new Kitchen('classic_burger',{sink:tier});k.cook.dish('classic_burger');const vessel=k.s.chef.held!.plateId!;k.touch('bin');k.touch('sink');assert.equal(k.slot('sink').job!.action,'wash');const remaining=k.slot('sink').job!.remaining;k.send({type:'move',x:5,y:1});k.send({type:'tick',ticks:100});assert.equal(k.slot('sink').job!.remaining,remaining);assert(!k.s.plateStock.includes(vessel));k.touch('sink');k.send({type:'hold',active:true});k.cook.until(()=>k.s.plateStock.includes(vessel));assert.equal(k.s.plateStock.length,2);}
});
check('faster grills shorten real jobs, while only the top grill prevents burning',()=>{
 const totals:number[]=[];for(const tier of [1,2,3]){const k=new Kitchen('classic_burger',{grill:tier});k.touch('fridge','beef');k.touch('grill');const job=k.slot('grill').job!;totals.push(job.total);assert.equal(job.total,Math.round(RECIPE_BY_ID.classic_burger.steps[0].ticks/EQUIPMENT_BY_ID.grill.tiers[tier-1].speed));k.cook.until(()=>!!k.slot('grill').job?.ready);k.advance(200);assert.equal(k.slot('grill').item!.kind,tier===3?'processed':'burnt');assert(sanitizeService(k.s));}assert(totals[1]<totals[0]);assert(totals[2]<totals[1]);
});
check('upgraded blending and instant drinks do their advertised work without a held action',()=>{
 for(const tier of [1,2]){const k=new Kitchen('vanilla_shake',{blender:tier});k.touch('fridge','milk');k.touch('blender');assert.equal(k.slot('blender').job!.action,tier===1?'hold':'timed');const remaining=k.slot('blender').job!.remaining;k.send({type:'move',x:5,y:1});k.advance(160);assert.equal(k.slot('blender').job!.ready,tier===2);if(tier===1)assert.equal(k.slot('blender').job!.remaining,remaining);}
 const drink=new Kitchen('lemonade',{drinks:2});drink.touch(ingredientSupply(RECIPE_BY_ID.lemonade.ingredients[0]),RECIPE_BY_ID.lemonade.ingredients[0]);drink.touch('drinks');assert.equal(drink.slot('drinks').job!.total,0);assert.equal(drink.slot('drinks').job!.ready,true);assert.equal(drink.slot('drinks').item!.stage,'prepared_lemonade');assert(sanitizeService(drink.s));
});
check('a heat-lamp pass keeps prepared dishes warm without preparing or delivering them',()=>{
 const k=new Kitchen('classic_burger',{},true);k.cook.dish('classic_burger');const item=structuredClone(k.s.chef.held!);k.touch('pass');assert.equal(k.s.chef.held,null);k.send({type:'move',x:5,y:1});k.advance(SERVICE_RULES.coldTicks+20);assert.equal(k.slot('pass').item!.id,item.id);assert.equal(k.slot('pass').item!.cold,false);assert.equal(k.s.served,0);assert(sanitizeService(k.s));
});
console.log(`PASS ${groups} physical automation groups`);
