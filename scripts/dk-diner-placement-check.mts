import {createLegacyDinerFixture} from './dk-diner-legacy-fixture';
/** Real layout validation and persistence behind the local editor preview. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDiner, dispatchDiner, homeSimulationConfig, sanitizeDinerSave, type DinerCommand, type DinerState } from '../src/lib/chef/diner/progression';
import { createHomeWorld } from '../src/lib/chef/diner/home-simulation';
import { makeTable } from '../src/lib/chef/diner/geometry';
import { createRestaurantBlueprint, roomTableSeats } from '../src/lib/chef/diner/room-plan';
import { fixtureInventoryFor } from '../src/lib/chef/diner/renovation';
import { aimHomeMount, createPlacementDraft, movePlacementDraft, previewPlacement, rotatePlacementDraft } from '../src/app/chef/diner-preview/placement-preview';
const now=Date.UTC(2026,8,20,8);
const fresh=()=>createLegacyDinerFixture(now,'placement-check');
function act(state:DinerState,command:DinerCommand){const result=dispatchDiner(state,command,{now});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
let groups=0;function test(name:string,run:()=>void){run();groups++;console.log(`ok ${name}`);}
test('stored furniture can rotate before placement without spending or mutating the live layout',()=>{
  const state=fresh();state.equipment.fryer.homeCopies=1;const before=structuredClone(state);
  let draft=createPlacementDraft(state,'home','fryer','home-fryer');assert.equal(previewPlacement(state,draft).error,null);
  draft=movePlacementDraft(draft,1,0,true);assert.ok(previewPlacement(state,draft).error,'occupied grill tile is invalid');
  for(let n=0;n<4;n++){draft=rotatePlacementDraft(draft);assert.equal(draft.rotation,(n+1)%4);assert.ok(previewPlacement(state,draft).error);}
  assert.deepEqual(state,before,'preview, invalid rotation and cancellation have no saved mutation');
  draft=movePlacementDraft(rotatePlacementDraft(draft),5,3,true);const preview=previewPlacement(state,draft);assert.equal(preview.error,null);
  const saved=act(state,preview.command);assert.equal(saved.home.layout.find(p=>p.id===draft.id)!.rotation,1);assert.equal(saved.equipment.fryer.homeCopies,1);
  assert.equal(sanitizeDinerSave(JSON.stringify(saved))!.home.layout.find(p=>p.id===draft.id)!.rotation,1);
});
test('moving an existing home furnishing replaces its ID and preserves its finish',()=>{
  const state=fresh();state.home.layout[0].skin='mint';const before=structuredClone(state);
  let draft=createPlacementDraft(state,'home','grill',state.home.layout[0].id,true);
  draft=movePlacementDraft(rotatePlacementDraft(draft),2,2,true);const preview=previewPlacement(state,draft);
  assert.equal(preview.error,null);assert.equal(preview.object!.color,'#91b29a');assert.deepEqual(state,before);
  const moved=act(state,preview.command);assert.equal(moved.home.layout.length,before.home.layout.length);assert.equal(moved.home.layout[0].skin,'mint');
  assert.equal(moved.home.layout.filter(p=>p.id===draft.id).length,1);assert.equal(sanitizeDinerSave(moved)!.home.layout[0].rotation,1);
});
test('home table ghost chairs use the same real coordinates as the committed room',()=>{
  const state=fresh();state.equipment.table_1.homeCopies=1;
  let draft=movePlacementDraft(createPlacementDraft(state,'home','table_1','home-single'),5,4,true);
  for(let r=0;r<4;r++){
    const preview=previewPlacement(state,draft);assert.equal(preview.error,null);const committed=act(state,preview.command);
    const actual=createHomeWorld(homeSimulationConfig(committed)).tables.find(t=>t.id===draft.id)!;
    assert.deepEqual(preview.table!.seats,actual.seats);assert.equal(preview.table!.rotation,r);draft=rotatePlacementDraft(draft);
  }
});
test('truck storage preview does not consume the station and Confirm installs only one owned copy',()=>{
  let state=act(fresh(),{type:'startPractice'});const before=structuredClone(state);
  let draft=createPlacementDraft(state,'truck','grill','truck-grill');assert.equal(previewPlacement(state,draft).error,null);
  draft=movePlacementDraft(draft,7,0,true);for(let n=0;n<4;n++){draft=rotatePlacementDraft(draft);assert.ok(previewPlacement(state,draft).error);}
  assert.deepEqual(state,before);draft=movePlacementDraft(draft,1,0,true);const preview=previewPlacement(state,draft);assert.equal(preview.error,null);
  state=act(state,preview.command);assert.equal(state.truckConfig.stations.filter(s=>s.kind==='grill').length,1);assert.equal(state.equipment.grill.truckOwned,true);
  assert.ok(previewPlacement(state,createPlacementDraft(state,'truck','grill','second-grill')).error);
  assert.equal(sanitizeDinerSave(JSON.stringify(state))!.truckConfig.stations.find(s=>s.id==='truck-grill')!.facing,0);
});
test('a blocked home single chair remains visible at its exact rotated anchor',()=>{
  const state=fresh();state.equipment.table_1.homeCopies=1;
  let draft=movePlacementDraft(createPlacementDraft(state,'home','table_1','blocked-single'),1,0,true);
  for(let r=0;r<4;r++){
    const preview=previewPlacement(state,draft);assert.ok(preview.error,'the grill already occupies this tile');
    assert.equal(preview.table!.seats.length,1);assert.deepEqual(preview.table!.seats.map(({x,y})=>({x,y})),makeTable(draft.id,1,0,1,1,r as 0|1|2|3).seats.map(({x,y})=>({x,y})));
    draft=rotatePlacementDraft(draft);
  }
});
test('truck table rotation preview has exact seats and survives a single explicit layout commit',()=>{
  const state=act(fresh(),{type:'startPractice'}),source=state.run!.service!.tables[0],before=structuredClone(state);
  let draft=movePlacementDraft(createPlacementDraft(state,'truck','table_1',source.id,true),4,5,true);
  for(let r=0;r<4;r++){
    const preview=previewPlacement(state,draft);assert.equal(preview.error,null);assert.deepEqual(preview.table,makeTable(source.id,4,5,1,1,r as 0|1|2|3));
    const saved=act(state,preview.command);assert.equal(saved.run!.service!.tables.length,1);assert.equal(sanitizeDinerSave(saved)!.truckConfig.tables[0].rotation,r);
    draft=rotatePlacementDraft(draft);
  }assert.deepEqual(state,before);
});
test('canonical state is revalidated before committing a draft that no longer owns a stored item',()=>{
  const state=fresh();state.decorOwned.daisy_pot=1;const draft=createPlacementDraft(state,'home','daisy_pot','home-pot');
  assert.equal(previewPlacement(state,draft).error,null);state.decorOwned.daisy_pot=0;assert.ok(previewPlacement(state,draft).error);
});
test('input handlers keep hover, taps and rotation local and expose an explicit guarded confirmation',()=>{
  const source=readFileSync('src/app/chef/diner-preview/DinerClient.tsx','utf8');
  const rotate=source.slice(source.indexOf('const rotateItem='),source.indexOf('const cancelPlacement='));assert.ok(!rotate.includes('send('));
  const tile=source.slice(source.indexOf('const onTile='),source.indexOf('const onHoverTile='));assert.match(tile,/if\(editing\)\{setPlacement/);assert.ok(!tile.includes("type:'homeLayout'"));assert.ok(!tile.includes("type:'setupLayout'"));
  assert.match(source,/const confirmPlacement=.*previewPlacement\(current,placement\)/);assert.match(source,/if\(preview.error\)/);assert.match(source,/send\(preview.command\)/);
  assert.match(source,/disabled=\{!placementPreview\|\|!!placementPreview.error\}/);assert.ok(source.includes('onHoverTile={onHoverTile}'));
});
test('staged starter uses its actual grill cell and commits a stored fryer without changing room structure',()=>{
 const state=createDiner(now,'staged-placement');state.equipment.fryer.homeCopies=1;const original=structuredClone(state.home.roomPlan),grill=state.home.layout.find(p=>p.equipmentId==='grill')!;
 const draft=createPlacementDraft(state,'home','fryer','staged-fryer');assert.equal(previewPlacement(state,draft).error,null);assert(previewPlacement(state,movePlacementDraft(draft,grill.x,grill.y,true)).error);
 const committed=act(state,previewPlacement(state,draft).command);assert.equal(committed.home.layout.filter(p=>p.equipmentId==='fryer').length,1);assert.deepEqual(committed.home.roomPlan,original);assert(sanitizeDinerSave(committed));
});
test('wall art previews snap to exterior walls, commit facing into the room and reload on the same support',()=>{
 let state=createDiner(now,'outer-wall-placement');state.decorOwned.burger_print=Math.max(1,state.decorOwned.burger_print??0);
 const existing=state.home.layout.find(p=>p.equipmentId==='burger_print'),id=existing?.id??'wall-burger-print';
 let draft=createPlacementDraft(state,'home','burger_print',id,!!existing);
 for(const [x,y,targetId,slot,rotation] of [[-.55,4,'outer-side',4,3],[5,-.55,'outer-back',5,0]] as const){
  const before=JSON.stringify(state);draft=aimHomeMount(state,draft,x,y,true);const preview=previewPlacement(state,draft);
  assert.equal(preview.error,null);assert.deepEqual(draft.mount,{kind:'wall',targetId,slot});assert.equal(preview.object!.x,x);assert.equal(preview.object!.y,y);assert.equal(preview.object!.rotation,rotation);assert.equal(JSON.stringify(state),before);
  state=act(state,preview.command);const reloaded=sanitizeDinerSave(JSON.stringify(state))!;assert(reloaded);assert.deepEqual(reloaded.home.layout.find(p=>p.id===id)!.mount,draft.mount);
  state=reloaded;draft={...draft,existing:true};
 }
 assert(previewPlacement(state,{...draft,mount:{kind:'wall',targetId:'outer-back',slot:state.home.w}}).error);
});
test('booth previews and committed rooms share fixed bench cells, including invalid draft positions',()=>{
 const state=createDiner(now,'booth-placement'),blueprint=createRestaurantBlueprint('diner');Object.assign(state.home,{w:blueprint.roomPlan.w,h:blueprint.roomPlan.h,roomPlan:blueprint.roomPlan,fixtureInventory:fixtureInventoryFor(blueprint.roomPlan),layout:blueprint.layout,staff:blueprint.staff});state.equipment.booth_2={tier:1,truckOwned:false,homeCopies:1};
 const booth=state.home.layout.find(p=>p.equipmentId==='booth_2')!,original=structuredClone(state);let draft=movePlacementDraft(createPlacementDraft(state,'home','booth_2',booth.id,true),8,7,true);
 for(let r=0;r<4;r++){
  const preview=previewPlacement(state,draft);assert.equal(preview.error,null);assert.equal(preview.table!.kind,'booth');const saved=act(state,preview.command),actual=createHomeWorld(homeSimulationConfig(saved)).tables.find(t=>t.id===booth.id)!;assert.deepEqual(preview.table!.seats,actual.seats);assert.equal(sanitizeDinerSave(saved)!.home.layout.find(p=>p.id===booth.id)!.rotation,r);
  const invalid=movePlacementDraft(draft,0,0,true),blocked=previewPlacement(state,invalid);assert(blocked.error);assert.deepEqual(blocked.table!.seats.map(({x,y})=>({x,y})),roomTableSeats({...booth,x:0,y:0,rotation:draft.rotation},()=>true),'fixed booth benches should remain visible when the draft is blocked');draft=rotatePlacementDraft(draft);
 }
 assert.deepEqual(state,original,'hovering and rotation must never rearrange the live room');
});
console.log(`Diner placement: ${groups} groups passed.`);
