import assert from 'node:assert/strict';
import {createDiner,homeSimulationConfig} from '../src/lib/chef/diner/progression';
import {createHomeWorld,stepHomeWorld} from '../src/lib/chef/diner/home-simulation';
import {homeScene} from '../src/app/chef/diner-preview/home-scene';
import {createRestaurantBlueprint} from '../src/lib/chef/diner/room-plan';
for(const stage of ['burger_shop','diner','restaurant'] as const){
 const state=createDiner(86400000,'seat-pose-'+stage),blueprint=createRestaurantBlueprint(stage);
 Object.assign(state.home,{w:blueprint.roomPlan.w,h:blueprint.roomPlan.h,roomPlan:blueprint.roomPlan,layout:blueprint.layout,staff:blueprint.staff});
 const world=createHomeWorld(homeSimulationConfig(state));let seated=0;const conflicts=new Map<string,unknown>();
 for(let tick=0;tick<10000;tick++){
  stepHomeWorld(world);if(tick%10)continue;
  const scene=homeScene(state,world,null,'#bd654e');
  for(const guest of world.customers){
   const person=scene.people.find(p=>p.id===guest.id);if(!person||person.hidden)continue;
   if(guest.phase==='seated'||guest.phase==='eating'){assert.ok(person.pose==='sit'||person.pose==='eat',`${stage} ${guest.phase}: ${person.pose}`);seated++;}
   if(!['sit','eat'].includes(person.pose??''))for(const table of scene.tables)for(const seat of table.seats){
    if(Math.hypot(person.x-seat.x,person.y-seat.y)<.2){
     assert.ok(guest.path.length>0,`${stage}: stationary ${guest.phase} guest standing on a seat`);
     conflicts.set(`${guest.phase}:${table.id}:${seat.id}`,{phase:guest.phase,x:guest.x,y:guest.y,seat});
    }
   }
  }
 }
 console.log(`PASS ${stage}: ${seated} seated samples; ${conflicts.size} moving departures; no stationary guests standing on seats`);
 assert(seated>0,`${stage} never seated a guest`);
}
