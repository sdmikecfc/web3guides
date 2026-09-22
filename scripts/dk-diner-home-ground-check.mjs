/** Real home adapter + actual Three board support, without a browser or WebGL. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const require=createRequire(import.meta.url);
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);
const {createDiner,homeSimulationConfig,homeIncidents,dailyIngredientParcel}=require('../src/lib/chef/diner/progression.ts');
const {createHomeWorld,stepHomeWorld}=require('../src/lib/chef/diner/home-simulation.ts');
const {createRestaurantBlueprint}=require('../src/lib/chef/diner/room-plan.ts');
const {homeScene}=require('../src/app/chef/diner-preview/home-scene.ts');
const spatial=require('../src/lib/chef/diner/home-spatial.ts');
const {createHomeBoard}=await sourceModule('src/app/chef/diner-preview/home-board.ts'),models=await sourceModule('src/app/chef/diner-preview/models.ts');
const {createRoomShell}=await sourceModule('src/app/chef/diner-preview/room-shell.ts');
// These are the preserved open-room/terrace fixtures. Staged-room geometry is
// covered separately by dk-diner-room-art-check and room-plan-check.
function legacyDiner(now,seed){const state=createDiner(now,seed);delete state.home.roomPlan;delete state.home.fixtureInventory;state.home.w=state.home.h=8;state.home.staff={chefs:1,waiters:1,cashiers:0};state.home.layout=[{id:'grill',equipmentId:'grill',x:1,y:0,rotation:0},{id:'prep',equipmentId:'prep',x:3,y:0,rotation:0},{id:'sink',equipmentId:'sink',x:5,y:0,rotation:0},{id:'table',equipmentId:'table_2',x:2,y:3,rotation:0}];state.equipment.table_2.homeCopies=1;return state;}
let groups=0,samples=0;
const check=(name,fn)=>{fn();groups++;console.log(`PASS ${name}`);};
function assertSupported(scene){
  for(const thing of [...scene.objects,...scene.people,...scene.tables.flatMap(table=>table.seats)])assert.ok(spatial.homeSupportAt(scene.width,scene.height,thing.x,thing.y),`${thing.id} unsupported at ${thing.x},${thing.y}`);
  for(const object of scene.objects.filter(item=>item.id.startsWith('home-')))assert.ok(object.y>=scene.height,`${object.id} occupies owned interior`);
  for(const person of scene.people.filter(item=>item.id.startsWith('regular:')))assert.ok(person.y>=scene.height,'regular occupies owned interior');
}
for(const size of [8,10,12,14])check(`${size}×${size}: exact simulated positions and supported welcome terrace`,()=>{
  const state=legacyDiner(20*86400000+1000,`ground-${size}`);state.home.w=state.home.h=size;state.updatedAt+=7200000;state.daily.regularProgress.old_pete=1;
  const space=spatial.homeSpatial(size,size),world=createHomeWorld(homeSimulationConfig(state));
  for(let tick=0;tick<6000;tick+=20){stepHomeWorld(world,20);const scene=homeScene(state,world,null,'#bd6a50');assertSupported(scene);samples++;
    for(const actor of [...world.actors,...world.customers]){const drawn=scene.people.find(person=>person.id===actor.id);assert.equal(drawn.x,actor.x);assert.equal(drawn.y,actor.y);}
  }
  const scene=homeScene(state,world,null,'#bd6a50');assert.ok(scene.people.some(p=>p.id==='regular:old_pete'));assert.equal(scene.objects.filter(p=>p.id.startsWith('home-')).length,4);
  assert.equal(new Set(scene.objects.filter(p=>p.id.startsWith('home-')).map(p=>`${p.x},${p.y}`)).size,4);
  for(const point of space.approach)assert.ok(!scene.objects.some(object=>object.x===point.x&&object.y===point.y)&&!scene.people.some(person=>person.id.startsWith('regular:')&&person.x===point.x&&person.y===point.y),'welcome approach blocked');
  const board=createHomeBoard(size,size,'checker');board.updateMatrixWorld(true);const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  for(let y=0;y<size+space.terrace.h;y++)for(let x=0;x<size;x++){
    const support=spatial.homeSupportAt(size,size,x,y);ray.set(new THREE.Vector3(x,3,y),down);const hits=ray.intersectObject(board,true);assert.ok(hits.length,`no real geometry below ${x},${y}`);assert.ok(Math.abs(hits[0].point.y-support.elevation)<.002,`wrong floor elevation ${x},${y}: ${hits[0].point.y}`);
  }
  for(const [key,point] of Object.entries({...space.context,regular:space.regular})){
    const model=key==='regular'?models.createModel('customer'):models.createModel({parcel:'parcel',collections:'trophy',binder:'book',till:'till'}[key]);if(key==='regular')models.animateCharacter(model,0,'cheer',false,false);model.position.set(point.x,spatial.HOME_TERRACE_ELEVATION,point.y);model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model);
    assert.ok(bounds.min.x>=-.5&&bounds.max.x<=size-.5&&bounds.min.z>=size-.5&&bounds.max.z<=size+2.5,`${key} overhangs unsupported terrace`);
    ray.set(new THREE.Vector3(point.x,3,point.y),down);const floor=ray.intersectObject(board,true)[0].point.y;assert.ok(bounds.min.y-floor>=-.005&&bounds.min.y-floor<.04,`${key} floats ${bounds.min.y-floor} above terrace`);
  }
  ray.set(new THREE.Vector3(space.door.x,3,size-.4),down);assert.ok(Math.abs(ray.intersectObject(board,true)[0].point.y-spatial.HOME_INTERIOR_ELEVATION)<.002,'doorstep fails to join the raised floor');
  models.disposeObject(board);
  const bad=structuredClone(world);bad.actors[0].x=-1;const unmodified=homeScene(state,bad,null,'#bd6a50').people.find(person=>person.id===bad.actors[0].id);assert.equal(unmodified.x,-1,'adapter silently clamps invalid position');assert.equal(spatial.homeSupportAt(size,size,unmodified.x,unmodified.y),null);
});
check('incident markers retain IDs, avoid furniture/seats and expose real work progress',()=>{
  const state=legacyDiner(20*86400000+1000,'chores-ground');state.updatedAt+=7200000;
  const before=homeIncidents(state);assert.equal(before.length,2);
  const first=before[0];state.homeTask={incidentId:first.id,progressTicks:Math.floor(first.requiredTicks/2),phase:'working'};
  let scene=homeScene(state,createHomeWorld(homeSimulationConfig(state)),null,'#bd6a50');let marker=scene.objects.find(item=>item.id===first.id);assert.equal(marker.state,'working');assert.equal(marker.progress,.5);
  state.homeTask.phase='paused';marker=homeScene(state,null,null,'#bd6a50').objects.find(item=>item.id===first.id);assert.equal(marker.state,'ready');assert.equal(marker.progress,.5);
  state.decorOwned.red_planter=1;state.home.layout.push({id:'chore-obstacle',equipmentId:'red_planter',x:first.x,y:first.y,rotation:0});
  const after=homeIncidents(state);assert.deepEqual(after.map(item=>item.id),before.map(item=>item.id));assert.ok(after.every(item=>item.x!==first.x||item.y!==first.y),'chore remained underneath moved furniture');
  scene=homeScene(state,createHomeWorld(homeSimulationConfig(state)),null,'#bd6a50');assertSupported(scene);
  for(const incident of after)for(const seat of scene.tables.flatMap(table=>table.seats))assert.ok(incident.x!==seat.x||incident.y!==seat.y,'chore occupies a rendered chair');
});
check('single-seat home tables render one chair from the simulation in every rotation',()=>{
  for(const rotation of [0,1,2,3]){
    const state=legacyDiner(20*86400000+1000,`solo-table-${rotation}`);
    const placement=state.home.layout.find(item=>item.equipmentId==='table_2');
    placement.equipmentId='table_1';placement.rotation=rotation;
    state.equipment.table_1.homeCopies=1;
    const world=createHomeWorld(homeSimulationConfig(state));
    const scene=homeScene(state,world,null,'#bd6a50'),table=scene.tables.find(item=>item.id===placement.id);
    assert.equal(table.capacity,1);assert.equal(table.seats.length,1);
    assert.deepEqual(table.seats.map(({id,x,y})=>({id,x,y})),world.tables[0].seats.map(({id,x,y})=>({id,x,y})));
    assert.equal(homeScene(state,null,null,'#bd6a50').tables[0].capacity,1,'loading room must retain its single-seat model');
    const model=models.createModel(`table_${table.capacity}`);model.rotation.y=-rotation*Math.PI/2;model.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model);
    assert(bounds.max.x-bounds.min.x<1&&bounds.max.z-bounds.min.z<1,'single-seat table must fit its one-tile footprint');
    models.disposeObject(model);assertSupported(scene);
  }
});
check('free-tile selector respects reachability, reserves and a blocked entrance',()=>{
  const input={width:8,height:8,blocked:[],reserved:[],preferred:{x:2,y:2}};assert.deepEqual(spatial.chooseHomeInteractionTile(input),{x:2,y:2});
  input.reserved.push({x:2,y:2});assert.notDeepEqual(spatial.chooseHomeInteractionTile(input),{x:2,y:2});
  input.blocked=Array.from({length:8},(_,x)=>({x,y:4}));assert.ok(spatial.chooseHomeInteractionTile(input).y>4,'selected unreachable side of wall');
  input.blocked.push(spatial.homeSpatial(8,8).door);assert.equal(spatial.chooseHomeInteractionTile(input),null);
});
check('all staged rooms retain a real three-row concrete apron with clear package and entry positions',()=>{
 for(const stage of ['burger_shop','diner','restaurant']){
  const state=createDiner(20*86400000+1000,`staged-ground-${stage}`),blueprint=createRestaurantBlueprint(stage);Object.assign(state.home,{w:blueprint.roomPlan.w,h:blueprint.roomPlan.h,roomPlan:blueprint.roomPlan,layout:blueprint.layout,staff:blueprint.staff});state.updatedAt+=7200000;
  const scene=homeScene(state,createHomeWorld(homeSimulationConfig(state)),null,'#bd654e'),shell=createRoomShell(blueprint.roomPlan,scene),tiles=shell.getObjectByName('room-supported-floor');shell.updateMatrixWorld(true);assert(tiles);const space=spatial.homeSpatial(scene.width,scene.height),ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  assert.equal(space.terrace.h,3);assert.equal(tiles.userData.tiles.filter(cell=>cell.y>=scene.height).length,scene.width*3);
  for(let y=scene.height;y<scene.height+3;y++)for(let x=0;x<scene.width;x++){ray.set(new THREE.Vector3(x,3,y),down);const hit=ray.intersectObject(tiles,true)[0];assert(hit,`${stage}: no floor at ${x},${y}`);assert(Math.abs(hit.point.y-spatial.HOME_TERRACE_ELEVATION)<.00001);}
  const parcel=dailyIngredientParcel(state),delivery=homeIncidents(state).find(item=>item.kind==='delivery');assert(delivery);
  for(const point of [parcel,delivery]){const object=scene.objects.find(item=>item.id===(point.sceneId??point.id));assert(object);assert.equal(spatial.homeSupportAt(scene.width,scene.height,point.x,point.y)?.zone,'terrace');assert(![space.door,...space.approach].some(p=>p.x===point.x&&p.y===point.y));const model=models.createModel('parcel');model.position.set(point.x,spatial.HOME_TERRACE_ELEVATION,point.y);model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model);assert(bounds.min.x>=-.5&&bounds.max.x<=scene.width-.5&&bounds.min.z>=scene.height-.5&&bounds.max.z<=scene.height+2.5,`${stage}: parcel overhangs apron`);models.disposeObject(model);}
  assert.notDeepEqual({x:parcel.x,y:parcel.y},{x:delivery.x,y:delivery.y});assert(!scene.objects.some(o=>o.kind==='parcel'&&o.y<scene.height),'staged parcels are still inside the doorway');models.disposeObject(shell);
 }
});
console.log(`Home grounding PASS: ${groups} groups; ${samples} sampled live home states; all supported sizes and actual Three.js floor raycasts. No screenshot approval claimed.`);
