/** Physical one-hour comparisons; this is not a full renovation campaign. */
import assert from 'node:assert/strict';
import {createRestaurantBlueprint} from '../src/lib/chef/diner/room-plan';
import {migrateRoomPlan} from '../src/lib/chef/diner/room-plan-v2';
import {createHomeWorld,stepHomeWorld,measureHomeRates,type HomeSimulationConfig} from '../src/lib/chef/diner/home-simulation';
import {recipePrice} from '../src/lib/chef/diner/content';
import type {HomePlacement} from '../src/lib/chef/diner/progression';

for(const arrivalRate of [90,240])for(const mode of ['waiter','pickup','chef'] as const){
 const b=createRestaurantBlueprint('restaurant'),plan=migrateRoomPlan(b.roomPlan,b.layout);
 plan.legacyShell=false;plan.edges=[];plan.zones=[];plan.modules=[];plan.seating={};
 const layout:HomePlacement[]=['grill','prep','sink'].map((kind,i)=>({id:kind,equipmentId:kind,x:3+i*2,y:2,rotation:0}));
 if(mode==='chef'){plan.modules=[{id:'seating',kind:'chef_bar',x:3,y:7,rotation:0,seatStyles:['classic','classic']}];plan.seating.seating={mode};}
 else {layout.push({id:'seating',equipmentId:'table_2',x:4,y:7,rotation:0});plan.seating.seating={mode,...(mode==='pickup'?{pointId:'pickup'}:{})};}
 if(mode==='pickup')plan.modules.push({id:'pickup',kind:'internal_pass',x:9,y:6,rotation:0});
 const config:HomeSimulationConfig={roomPlan:plan,w:14,h:12,layout,equipment:{grill:{tier:1},prep:{tier:1},sink:{tier:1}},menu:['classic_burger'],recipeLevels:{classic_burger:3},chefs:1,waiters:mode==='waiter'?1:0,cashiers:0,arrivalRate,staffPolicyVersion:1};
 const continuous=createHomeWorld(config);let split=createHomeWorld(config);stepHomeWorld(continuous,72000);
 for(let i=0;i<12;i++){stepHomeWorld(split,6000);if(i===5)split=JSON.parse(JSON.stringify(split));}
 assert.deepEqual(split,continuous,`${mode}: chunking and reload cannot create income or skip work`);
 assert(continuous.metrics.plates>10,`${mode}: service must continue making meals`);
 assert(Math.abs(continuous.metrics.coins-continuous.metrics.tips-continuous.metrics.plates*recipePrice('classic_burger',3))<.001,'service style cannot multiply food prices');
 const rate=measureHomeRates(config);if(mode!=='waiter')assert.notEqual(rate.bottleneck,'waiters','do not advise hiring unnecessary servers');
 console.log('MEASURED '+JSON.stringify({mode,arrivalRate,staff:1+config.waiters,minutes:60,meals:continuous.metrics.plates,foodIncome:continuous.metrics.coins-continuous.metrics.tips,tips:continuous.metrics.tips,washed:continuous.metrics.washed,bottleneck:rate.bottleneck}));
}
console.log('PASS three physical service styles, identical split/offline simulation and no price multiplier. Full campaign renovation timing still requires campaign measurement.');
