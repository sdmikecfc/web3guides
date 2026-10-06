import assert from 'node:assert/strict';
import {RECIPES} from '../src/lib/chef/diner/content';
import {recipeVessel} from '../src/lib/chef/diner/batch';
import {createRestaurantBlueprint,validateRoomPlan} from '../src/lib/chef/diner/room-plan';
import {migrateRoomPlan} from '../src/lib/chef/diner/room-plan-v2';
import {createHomeWorld,stepHomeWorld,type HomeWorld} from '../src/lib/chef/diner/home-simulation';
import type {HomePlacement} from '../src/lib/chef/diner/progression';

function uniqueFood(w:HomeWorld){
 const items=[...w.actors.map(a=>a.held),...w.customers.map(c=>c.held),...w.stations.flatMap(s=>[...s.slots,...s.dirtySlots??[]].map(slot=>slot.item)),...w.tables.flatMap(t=>t.seats.map(s=>s.item))].filter(Boolean);
 assert.equal(items.length,new Set(items.map(i=>i!.id)).size,'food cannot be in two places');
}
for(const cashiers of [0,1]){
 const b=createRestaurantBlueprint('burger_shop'),plan=migrateRoomPlan(b.roomPlan,b.layout),w=createHomeWorld({roomPlan:plan,w:plan.w,h:plan.h,layout:b.layout,equipment:{grill:{tier:1},prep:{tier:1},sink:{tier:1}},menu:['classic_burger'],recipeLevels:{classic_burger:0},chefs:1,waiters:1,cashiers,arrivalRate:35,arrivalLimit:4});
 for(let i=0;i<24000;i++){stepHomeWorld(w);if(w.metrics.plates===4&&!w.customers.length&&w.tables.every(t=>t.seats.every(s=>s.status==='clean')))break;}
 assert.equal(w.metrics.plates,4,JSON.stringify({cashiers,customers:w.customers,actors:w.actors}));assert.equal(w.metrics.ordersTaken,4);assert.equal(w.metrics.tips,0);
 console.log(`PASS migrated ordering counter with ${cashiers?'cashier':'cook handling orders'}`);
}
for(const mode of ['waiter','pickup','chef'] as const){
 for(const recipe of RECIPES){
  const base=createRestaurantBlueprint('restaurant'),plan=migrateRoomPlan(base.roomPlan,base.layout);
  plan.legacyShell=false;plan.edges=[];plan.zones=[];plan.modules=[];plan.seating={};
  const machines=[...new Set([...recipe.steps.map(s=>s.station),'sink'])],layout:HomePlacement[]=machines.map((kind,i)=>({id:`machine-${kind}`,equipmentId:kind,x:2+i*2,y:2,rotation:0}));
  if(mode==='chef'){plan.modules.push({id:'chef-counter',kind:'chef_bar',x:3,y:7,rotation:0,seatStyles:['classic','classic']});plan.seating['chef-counter']={mode};}
  else {layout.push({id:'table',equipmentId:'table_2',x:4,y:7,rotation:0});plan.seating.table={mode,...(mode==='pickup'?{pointId:'pickup-counter'}:{})};}
  if(mode==='pickup')plan.modules.push({id:'pickup-counter',kind:'internal_pass',x:9,y:6,rotation:0});
  assert.equal(validateRoomPlan(plan,layout),null,`${recipe.id}: ${mode}`);
  let w=createHomeWorld({roomPlan:plan,w:plan.w,h:plan.h,layout,equipment:Object.fromEntries(machines.map(id=>[id,{tier:1}])),menu:[recipe.id],recipeLevels:{[recipe.id]:0},chefs:1,waiters:mode==='waiter'?1:0,cashiers:0,staffPolicyVersion:1,arrivalRate:35,arrivalLimit:4});
  assert.equal(w.notice,'');
  for(let tick=0;tick<24000;tick++){
   stepHomeWorld(w);if(tick%20===0)uniqueFood(w);
   if(tick===1200)w=JSON.parse(JSON.stringify(w));
   if(w.metrics.plates===4&&!w.customers.length&&w.tables.every(t=>t.seats.every(s=>s.status==='clean')))break;
  }
  assert.equal(w.metrics.plates,4,`${recipe.id}/${mode}: ${JSON.stringify({orders:w.orders,actors:w.actors,customers:w.customers})}`);
  assert(w.tables.every(t=>t.seats.every(s=>s.status==='clean')),`${recipe.id}/${mode}: reusable dishes must clear`);
  if(recipeVessel(recipe.id)==='fry_box'){assert.equal(w.metrics.washed,0);assert.equal(w.metrics.discardedBoxes,4,'Empty boxes are discarded once without using a sink');}
 }
 console.log(`PASS ${RECIPES.length} recipes: ${mode}, physical handoffs, clean seats and mid-service reload`);
}

{
 const base=createRestaurantBlueprint('restaurant'),plan=migrateRoomPlan(base.roomPlan,base.layout);plan.legacyShell=false;plan.zones=[];plan.edges=[];
 plan.modules=[{id:'chef-counter',kind:'chef_bar',x:3,y:6,rotation:0,seatStyles:['classic','classic','classic']},{id:'pickup',kind:'internal_pass',x:10,y:7,rotation:0}];
 const layout:HomePlacement[]=['grill','prep','sink','fryer','boiler'].map((kind,i)=>({id:kind,equipmentId:kind,x:2+i*2,y:2,rotation:0}));
 layout.push({id:'second-prep',equipmentId:'prep',x:2,y:4,rotation:0},{id:'second-sink',equipmentId:'sink',x:11,y:4,rotation:0},{id:'waiter-table',equipmentId:'table_2',x:1,y:8,rotation:0},{id:'pickup-table',equipmentId:'table_2',x:8,y:9,rotation:0});
 plan.seating={'chef-counter':{mode:'chef'},'waiter-table':{mode:'waiter'},'pickup-table':{mode:'pickup',pointId:'pickup'}};
 assert.equal(validateRoomPlan(plan,layout),null);
 const w=createHomeWorld({roomPlan:plan,w:14,h:12,layout,equipment:Object.fromEntries(layout.map(p=>[p.equipmentId,{tier:2}])),menu:['classic_burger','fries','tomato_soup'],recipeLevels:{classic_burger:3,fries:3,tomato_soup:3},chefs:2,waiters:1,cashiers:1,staffPolicyVersion:1,arrivalRate:120,arrivalLimit:30});
 assert.equal(w.notice,'');for(let tick=0;tick<60000;tick++){stepHomeWorld(w);if(tick%20===0)uniqueFood(w);if(w.metrics.plates===30&&!w.customers.length&&w.tables.every(t=>t.seats.every(s=>s.status==='clean')))break;}
 assert.equal(w.metrics.plates,30,JSON.stringify({plates:w.metrics.plates,customers:w.customers,orders:w.orders,actors:w.actors}));assert(w.tables.every(t=>t.seats.every(s=>s.status==='clean')));assert.equal(Object.keys(w.metrics.platesByRecipe).length,3);
 console.log('PASS mixed service, multiple cooking areas, 30 meals and shared cleanup under contention');
}
