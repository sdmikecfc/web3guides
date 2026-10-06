import assert from 'node:assert/strict';
import {createRestaurantBlueprint,roomModuleGeometry,validateRoomPlan} from '../src/lib/chef/diner/room-plan';
import {migrateRoomPlan,freeRoomProblem,compileRestaurantPlan} from '../src/lib/chef/diner/room-plan-v2';
import {addStoredRoomFixture,roomPieceLabel} from '../src/app/chef/diner-preview/room-editor';

function room(){
 const starter=createRestaurantBlueprint('burger_shop');
 const roomPlan=migrateRoomPlan(starter.roomPlan,starter.layout);
 roomPlan.legacyShell=false;roomPlan.edges=[];roomPlan.zones=[];roomPlan.modules=[];roomPlan.seating={};
 return {roomPlan,layout:[{id:'grill',equipmentId:'grill',x:2,y:2,rotation:0 as const},{id:'table',equipmentId:'table_1',x:4,y:4,rotation:0 as const}]};
}
{
 const draft=room();assert.equal(validateRoomPlan(draft.roomPlan,draft.layout),null);
 draft.layout.push({id:'second-grill',equipmentId:'grill',x:2,y:2,rotation:0});
 const issue=freeRoomProblem(draft.roomPlan,draft.layout)!;
 assert.equal(issue.targetId,'second-grill');assert.deepEqual(issue.cells,[{x:2,y:2}]);
 assert.equal(issue.message,validateRoomPlan(draft.roomPlan,draft.layout));
}
{
 const draft=room();draft.roomPlan.seating={table:{mode:'waiter',chairs:[{x:2,y:0}]}};
 const issue=freeRoomProblem(draft.roomPlan,draft.layout)!;
 assert.equal(issue.targetId,'chair:table:0');assert.deepEqual(issue.cells,[{x:6,y:4}]);
 assert.equal(roomPieceLabel(draft,issue.targetId!),'Chair 1 · Table and one chair');
}
{
 const draft=room();draft.layout.push({id:'blocker',equipmentId:'grill',x:2,y:3,rotation:0});
 const issue=freeRoomProblem(draft.roomPlan,draft.layout)!;
 assert.equal(issue.targetId,'grill');assert.deepEqual(issue.cells,[{x:2,y:3}]);
 assert.match(issue.message,/working side/);
 const entrance=room(),at=entrance.roomPlan.entrances![0].at;
 entrance.layout.push({id:'blocker',equipmentId:'grill',...at,rotation:0});
 assert.equal(freeRoomProblem(entrance.roomPlan,entrance.layout)!.targetId,'entrance:main-entry');
}
console.log('PASS overlap, individual chair, working side and entrance report exact targets without changing validation');
{
 const draft=room();draft.layout=[];
 // A tall narrow corridor accepts a rotated counter only. Garden cells block its working sides.
 draft.roomPlan.surfaces!.forEach(s=>{s.kind=s.x<3?'indoor':'garden';});
 draft.roomPlan.modules=draft.roomPlan.surfaces!.filter(s=>s.x>=3).map(s=>({id:`occupied-${s.x}-${s.y}`,kind:'lift_gate',x:s.x,y:s.y,rotation:0}));
 draft.roomPlan.entrances![0].at={x:0,y:draft.roomPlan.h-1};
 const before=structuredClone(draft),added=addStoredRoomFixture(draft,'counter','display_counter');
 assert.equal(validateRoomPlan(added.roomPlan,added.layout),null);
 assert.equal(added.roomPlan.modules.find(m=>m.id==='counter')!.rotation%2,1,'try another facing when the horizontal counter seals its own access');
 assert.deepEqual(draft,before,'choosing an initial position never changes the source draft');
}
{
 const draft=room();draft.layout.push({id:'origin',equipmentId:'grill',x:0,y:0,rotation:0});
 draft.roomPlan.seating={table:{mode:'waiter',chairs:[{x:2,y:0}]}};
 const before=structuredClone(draft),added=addStoredRoomFixture(draft,'basin','handwash_sink');
 const basin=added.roomPlan.modules[0];assert.notDeepEqual({x:basin.x,y:basin.y},{x:0,y:0});
 assert.equal(compileRestaurantPlan(added.roomPlan,added.layout).errors.length,0,'an unrelated draft error does not make new fixtures overlap');
 assert(roomModuleGeometry(basin).cells.every(p=>p.x>=0&&p.y>=0&&p.x<draft.roomPlan.w&&p.y<draft.roomPlan.h));
 assert.deepEqual(draft,before);
 assert.equal(addStoredRoomFixture(added,'basin','handwash_sink').roomPlan.modules.length,1);
}
console.log('PASS rotated fixture search, visible non-overlapping fallback, no draft mutation or duplicate fixture');
