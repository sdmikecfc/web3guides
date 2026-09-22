/** Public projection must retain real room geometry without private interactions. */
import assert from 'node:assert/strict';
import { createDiner,homeSimulationConfig } from '../src/lib/chef/diner/progression';
import { createSocialProfile,publicDiner } from '../src/lib/chef/diner/social';
import { createRestaurantBlueprint,resolveRoomMount,ROOM_FIXTURES } from '../src/lib/chef/diner/room-plan';
import { createHomeWorld,stepHomeWorld } from '../src/lib/chef/diner/home-simulation';
import { homeScene } from '../src/app/chef/diner-preview/home-scene';
import { physicalHomeScene } from '../src/app/chef/diner-preview/physical-home-scene';

const now=1_800_000_000_000,profile=createSocialProfile('11111111-1111-4111-8111-111111111111',now);profile.published=true;
let cases=0;
for(const stage of ['burger_shop','diner','restaurant'] as const){
 const state=createDiner(now,'public-room'),blueprint=createRestaurantBlueprint(stage);state.home={...state.home,w:blueprint.roomPlan.w,h:blueprint.roomPlan.h,layout:blueprint.layout,roomPlan:blueprint.roomPlan,staff:blueprint.staff};
 state.coins=999987;state.pantry.beef=12345;state.daily.regularProgress.old_pete=1;state.recipes.classic_burger.level=3;
 const module=state.home.roomPlan!.modules.find(m=>m.kind==='console'||m.kind==='chef_bar'||m.kind==='internal_pass')!,mount={kind:'counter' as const,targetId:module.id,slot:1},resolved=resolveRoomMount(state.home.roomPlan!,mount)!;
 state.home.layout.push({id:'mounted-herbs',equipmentId:'herb_planter',x:Math.floor(resolved.x),y:Math.floor(resolved.y),rotation:resolved.rotation,mount});state.decorOwned.herb_planter=1;
 const wall=state.home.roomPlan!.edges.find(edge=>edge.kind==='wall')!,wallMount={kind:'wall' as const,targetId:wall.id,slot:0},wallPoint=resolveRoomMount(state.home.roomPlan!,wallMount)!;
 state.home.layout.push({id:'mounted-print',equipmentId:'coffee_print',x:Math.floor(wallPoint.x),y:Math.floor(wallPoint.y),rotation:wallPoint.rotation,mount:wallMount});state.decorOwned.coffee_print=1;
 const payload=publicDiner(state,profile)!;assert(payload);
 const world=createHomeWorld(payload.simulation);stepHomeWorld(world,1600);
 const owner=homeScene(state,world,null,'#bd654e'),visitor=physicalHomeScene(payload,world,null);
 const publicOnly={...owner,objects:owner.objects.filter(o=>o.id!=='home-parcel'&&!o.id.startsWith('incident:')),people:owner.people.filter(p=>!p.id.startsWith('regular:'))};assert.deepEqual(visitor,publicOnly,`${stage}: owner and visitor visual states differ`);
 assert(!visitor.objects.some(o=>o.kind==='parcel'||o.kind==='spill'||o.id.startsWith('incident:')),'private home interactions leaked');
 assert(!JSON.stringify(visitor).includes('999987')&&!JSON.stringify(visitor).includes('12345'),'private balances leaked into scene');
 for(const m of state.home.roomPlan!.modules){const drawn=visitor.objects.find(o=>o.id===m.id)??visitor.tables.find(t=>t.id===m.id);assert(drawn,`${stage}: missing ${m.kind}`);assert.deepEqual(drawn.footprint,ROOM_FIXTURES[m.kind].footprint);}
 for(const id of ['mounted-herbs','mounted-print'])assert.deepEqual(visitor.objects.find(o=>o.id===id),owner.objects.find(o=>o.id===id));
 if(stage==='burger_shop')assert(visitor.people.some(p=>p.role==='cashier'),'cashier disappeared from visit');
 assert(visitor.roomPlan&&visitor.roomFinishes,'public room structure or finishes missing');cases++;
}
const state=createDiner(now,'public-single');delete state.home.roomPlan;state.home.w=state.home.h=8;state.home.layout=[{id:'single',equipmentId:'table_1',x:4,y:4,rotation:0},{id:'grill',equipmentId:'grill',x:0,y:0,rotation:0},{id:'prep',equipmentId:'prep',x:2,y:0,rotation:0},{id:'sink',equipmentId:'sink',x:4,y:0,rotation:0}];state.equipment.table_1={tier:1,truckOwned:false,homeCopies:1};
const payload=publicDiner(state,profile)!,world=createHomeWorld(homeSimulationConfig(state)),scene=physicalHomeScene(payload,world,null),table=scene.tables.find(t=>t.id==='single');assert.equal(table?.capacity,1);assert.equal(table?.seats.length,1);cases++;
console.log(`PASS ${cases} public room projections: all three authored stages, exact owner/visitor fixtures and actors, wall/counter mounts, mastery, private overlay exclusion and true one-seat table.`);
