import assert from 'node:assert/strict';
import {buildServiceLoadout} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,sanitizeService,serviceTargetIntent} from '../src/lib/chef/diner/service';
import {Cook} from './dk-diner-cook-fixture';
import {DOMAIN_IDS,DOMAIN_WORLDS} from '../src/lib/chef/diner/domain-worlds';
import {domainService} from '../src/lib/chef/diner/domain-journeys';
import {RECIPE_BY_ID} from '../src/lib/chef/diner/content';
for(const domain of DOMAIN_IDS)for(const def of DOMAIN_WORLDS[domain].menu){
 const recipe=RECIPE_BY_ID[def.id];assert(recipe&&recipe.domain===domain);
 let s=dispatchService(createService({...buildServiceLoadout(3,[recipe.id]),tier:3,menu:[recipe.id],customers:2,plateCount:3,cupCount:3,bowlCount:3,queuePatienceTicks:12000,tablePatienceTicks:12000}),{type:'prepare'});
 const cook=new Cook(()=>s,a=>{s=dispatchService(s,a);},20);cook.dish(recipe.id);assert.equal(s.chef.held?.kind,'dish');
 assert(sanitizeService(s),`${recipe.id}: reload`);s=sanitizeService(s)!;s=dispatchService(s,{type:'resume'});
 cook.send({type:'open'});cook.until(()=>s.customers.some(c=>c.phase==='seated'));let c=s.customers.find(c=>c.phase==='seated')!;cook.touch(c.tableId!,undefined,c.seatId!);assert.equal(s.served,1);
 cook.until(()=>s.tables.some(t=>t.seats.some(seat=>seat.item?.kind==='dirty')));cook.wash(c.tableId!,c.seatId!);assert.equal(s.washed,1);assert(sanitizeService(s));
 console.log(`PASS ${recipe.id}: prepare, cook, serve, wash, reload, one-second decisions`);
}
for(const recipeId of ['steamed_mandu','house_red']){
 let s=dispatchService(createService({...buildServiceLoadout(3,[recipeId]),tier:3,menu:[recipeId],cupCount:6}),{type:'prepare'});
 const cook=new Cook(()=>s,a=>{s=dispatchService(s,a);});
 const wine=recipeId==='house_red',kind=wine?'wine_station':'steamer',primary=RECIPE_BY_ID[recipeId].ingredients[0],total=wine?6:3;
 cook.touch(wine?'crate':'fridge',recipeId,undefined,primary);cook.touch(kind);cook.send({type:'hold',active:true});cook.until(()=>!!s.stations.find(st=>st.kind===kind)!.slots[0].job?.ready);cook.send({type:'hold',active:false});
 const slot=()=>s.stations.find(st=>st.kind===kind)!.slots[0];assert.equal(slot().portions?.remaining,total);assert(sanitizeService(s));
 const bad=structuredClone(s);bad.stations.find(st=>st.kind===kind)!.slots[0].portions!.remaining=100;assert.equal(sanitizeService(bad),null);
 const ids=new Set<string>();for(let i=0;i<total;i++){
  if(wine)cook.touch('cups');const itemId=slot().item!.id;assert(!serviceTargetIntent(s,kind,undefined,undefined,itemId).disabled);
  cook.touch(kind,undefined,undefined,undefined,itemId);assert(s.chef.held);ids.add(s.chef.held!.id);
  if(!wine)assert(s.chef.held!.warmthTicks!<=1800);cook.touch('bin');
  if(wine){cook.touch('sink');cook.send({type:'hold',active:true});cook.until(()=>s.stations.find(st=>st.kind==='sink')!.slots.every(s=>!s.item));cook.send({type:'hold',active:false});}
  assert(sanitizeService(s));assert.equal(slot().portions?.remaining??0,total-i-1);
 }
 assert.equal(ids.size,total);assert.equal(slot().item,null);assert.equal(slot().job,null);cook.touch(kind);assert.equal(s.chef.held,null);assert.equal(s.cleanCups,wine?6:0);
 console.log(`PASS ${recipeId}: exactly ${total} portions, explicit slot, no duplication, discarded-food vessel recovery`);
}
for(const domain of DOMAIN_IDS){const s=domainService(domain,'layout-proof',4);assert.equal(s.config.menu.length,3);assert.equal(s.config.cosy,false);assert.equal(s.config.tier,3);assert(sanitizeService(s));}
console.log('PASS all domain kitchens retain valid supplied layouts.');
