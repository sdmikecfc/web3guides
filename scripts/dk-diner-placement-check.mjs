/** Actual model placement, rotations and picking without a browser or WebGL. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const require=createRequire(import.meta.url);
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {makeTable,tableFootprint}=require('../src/lib/chef/diner/geometry.ts');
const {HOME_EQUIPMENT}=require('../src/lib/chef/diner/content.ts');
const {DECOR}=require('../src/lib/chef/diner/collections.ts');
const {roomTableSeats}=require('../src/lib/chef/diner/room-plan.ts');
const kit=await sourceModule('src/app/chef/diner-preview/models.ts'),{createPlacementGhost,projectPlacementTile}=await sourceModule('src/app/chef/diner-preview/placement-ghost.ts');
const height=()=>.095,close=(a,b,message)=>assert(Math.abs(a-b)<1e-7,message);
let cases=0,disposed=0;
function verifyGhost(ghost,expectedCells){
  assert.equal(ghost.userData.inputPassthrough,true);ghost.updateMatrixWorld(true);
  const cells=[];const materials=new Set(),geometry=new Set();
  ghost.traverse(object=>{assert(!object.userData.pick,'ghost acquired a gameplay target');if(!object.isMesh)return;if(object.userData.placementCell)cells.push(`${object.userData.placementCell.x},${object.userData.placementCell.y}`);assert(object.material.transparent);assert(object.material.opacity<1);assert.equal(object.material.depthWrite,false);materials.add(object.material);if(object.geometry.userData.sharedKitResource)geometry.add(object.geometry);});
  assert.deepEqual(cells.sort(),expectedCells.map(cell=>`${cell.x},${cell.y}`).sort());
  for(const cell of expectedCells){const ray=new THREE.Raycaster(new THREE.Vector3(cell.x,5,cell.y),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(ghost,true).length,0,'ghost intercepts a floor/furnishing click');}
  let uniqueDisposed=0,sharedDisposed=0;materials.forEach(material=>material.addEventListener('dispose',()=>uniqueDisposed++));geometry.forEach(item=>item.addEventListener('dispose',()=>sharedDisposed++));
  kit.disposeObject(ghost);assert.equal(uniqueDisposed,materials.size,'preview material leak');assert.equal(sharedDisposed,0,'preview disposed shared model geometry');disposed+=uniqueDisposed;cases++;
}
for(const def of [...HOME_EQUIPMENT,...DECOR])for(let rotation=0;rotation<4;rotation++){
  if(def.id.startsWith('table_')||def.id==='booth_2')continue;
  const object={id:'draft',kind:def.id,x:2,y:3,rotation,footprint:def.footprint,tier:1},valid=rotation%2===0,ghost=createPlacementGhost({object,valid},height,'home'),model=ghost.getObjectByName('placement-object');
  const [w,h]=rotation%2?[def.footprint[1],def.footprint[0]]:def.footprint;
  close(model.position.x,2+(w-1)/2,`${def.id}: footprint x anchor`);close(model.position.z,3+(h-1)/2,`${def.id}: footprint y anchor`);close(model.position.y,.095,'floor contact');close(model.rotation.y,Math.PI-rotation*Math.PI/2,'front direction');
  const cells=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)cells.push({x:2+x,y:3+y});verifyGhost(ghost,cells);
}
for(let rotation=0;rotation<4;rotation++){
  const object={id:'wide-counter',kind:'display_counter',x:2,y:3,rotation,footprint:[4,1]},ghost=createPlacementGhost({object,valid:true},height,'home'),model=ghost.getObjectByName('placement-object'),[w,h]=rotation%2?[1,4]:[4,1];
  const bounds=new THREE.Box3().setFromObject(model);assert(Math.abs((rotation%2?bounds.max.z-bounds.min.z:bounds.max.x-bounds.min.x)-4)<.002,'four-tile counter preview reverted to the legacy three-tile model');
  const cells=Array.from({length:w*h},(_,i)=>({x:2+i%w,y:3+Math.floor(i/w)}));verifyGhost(ghost,cells);
}
for(let rotation=0;rotation<4;rotation++){
  const object={id:'hanging-chandelier',kind:'chandelier',x:5,y:7,rotation,footprint:[1,1],elevation:.095+2.8-2.7,mount:{kind:'ceiling',targetId:'ceiling',surfaceHeight:2.8}},ghost=createPlacementGhost({object,valid:true},height,'home'),model=ghost.getObjectByName('placement-object');ghost.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model);
  assert(Math.abs(bounds.max.y-2.895)<.003,'chandelier preview does not attach to the actual room ceiling');assert(bounds.min.y>2.10,'chandelier preview intrudes on diners');assert(Math.abs((bounds.min.x+bounds.max.x)/2-5)<.001&&Math.abs((bounds.min.z+bounds.max.z)/2-7)<.001,'ceiling preview drifts from its chosen spot');verifyGhost(ghost,[{x:5,y:7}]);
}
{
 const table={id:'owned-stools',kind:'chef_bar',x:2,y:3,rotation:0,footprint:[6,1],capacity:6,seats:[{id:'old-stool',x:2,y:4,status:'clean',style:'classic',surface:{x:2,y:3}},{id:'new-stool',x:3,y:4,status:'clean',style:'diner',surface:{x:3,y:3}}]},ghost=createPlacementGhost({table,valid:true},height,'home');ghost.updateMatrixWorld(true);
 const old=ghost.getObjectByName('placement-seat:old-stool'),upgraded=ghost.getObjectByName('placement-seat:new-stool');assert(old&&upgraded);assert(new THREE.Box3().setFromObject(old).max.y<.095+.8,'old stool silently gained an upholstered back in the editor');assert(new THREE.Box3().setFromObject(upgraded).max.y>.095+1.15,'purchased upholstered stool loses its back in the placement preview');assert.equal(ghost.children.filter(child=>child.name.startsWith('placement-seat:')).length,2,'preview adds stools that are not owned');verifyGhost(ghost,[...Array.from({length:6},(_,i)=>({x:2+i,y:3})),...table.seats]);
}
for(let rotation=0;rotation<4;rotation++){
  const placement={id:'preview-booth',equipmentId:'booth_2',x:4,y:5,rotation},seats=roomTableSeats(placement,()=>true).map((p,index)=>({...p,id:`bench-${index}`,status:'clean'}));
  const table={id:placement.id,x:placement.x,y:placement.y,rotation,capacity:2,kind:'booth',seats};
  const ghost=createPlacementGhost({table,valid:true},height,'home'),model=ghost.getObjectByName('placement-table');assert(model);close(model.rotation.y,-rotation*Math.PI/2,'booth uses exact fixed bench rotation');
  for(const seat of seats)assert.equal(ghost.getObjectByName(`placement-seat:${seat.id}`),undefined,'integrated booths must not render loose chairs');
  const [w,h]=rotation%2?[2,1]:[1,2],cells=Array.from({length:w*h},(_,i)=>({x:4+i%w,y:5+Math.floor(i/w)}));verifyGhost(ghost,[...cells,...seats]);
}
for(const capacity of [1,2,4])for(let rotation=0;rotation<4;rotation++){
  const table=makeTable('preview',2,3,capacity,1,rotation),cells=tableFootprint(table),ghost=createPlacementGhost({table,valid:true},height,'home'),model=ghost.getObjectByName('placement-table');
  const center={x:cells.reduce((sum,p)=>sum+p.x,0)/cells.length,y:cells.reduce((sum,p)=>sum+p.y,0)/cells.length};close(model.position.x,center.x,'table center x');close(model.position.z,center.y,'table center y');
  for(const seat of table.seats){const chair=ghost.getObjectByName(`placement-seat:${seat.id}`);assert(chair);close(chair.position.x,seat.x,'chair/engine x contact');close(chair.position.z,seat.y,'chair/engine y contact');const forward=new THREE.Vector3(0,0,-1).applyQuaternion(chair.quaternion),toward=new THREE.Vector3(center.x-seat.x,0,center.y-seat.y).normalize();assert(forward.dot(toward)>.9999,'chair faces away from its table');}
  verifyGhost(ghost,[...cells,...table.seats]);
}
const real=kit.createModel('grill'),realMaterials=[];real.traverse(object=>{if(object.isMesh)realMaterials.push(object.material);});const before=realMaterials.map(m=>[m.opacity,m.transparent,m.depthWrite,m.color.getHex()]);let sharedMaterialDisposals=0;realMaterials.forEach(m=>m.addEventListener('dispose',()=>sharedMaterialDisposals++));
for(let i=0;i<12;i++)kit.disposeObject(createPlacementGhost({object:{id:'draft',kind:'grill',x:i,y:0},valid:i%2===0},height,'truck'));
assert.deepEqual(realMaterials.map(m=>[m.opacity,m.transparent,m.depthWrite,m.color.getHex()]),before,'preview mutates real furniture paint');assert.equal(sharedMaterialDisposals,0,'preview disposed live furniture material');
real.updateMatrixWorld(true);assert(new THREE.Raycaster(new THREE.Vector3(0,5,0),new THREE.Vector3(0,-1,0)).intersectObject(real,true).length>0,'actual grill became unpickable');
const warm=kit.modelKitStats();for(let i=0;i<30;i++)kit.disposeObject(createPlacementGhost({object:{id:'draft',kind:'grill',x:i,y:0},valid:true},height,'truck'));assert.deepEqual(kit.modelKitStats(),warm,'hovering grows the shared model cache');
// Actual occupied floor: the visual ray first hits the grill, but an active
// draft must use the floor cell beneath it for both hover and click.
let projected=0;
for(const mode of ['home','truck'])for(const [x,y] of [[1,1],[3,5]])for(let facing=0;facing<4;facing++){
  const floor=mode==='home'?.095:y<3?.455:.065,grill=kit.createModel('grill');grill.position.set(x,floor,y);grill.updateMatrixWorld(true);
  const angle=facing*Math.PI/2,origin=new THREE.Vector3(x+Math.sin(angle)*.5,4,y+Math.cos(angle)*.5),target=new THREE.Vector3(x,floor,y),direction=target.clone().sub(origin).normalize(),raycaster=new THREE.Raycaster(origin,direction);
  assert(raycaster.intersectObject(grill,true).length,'occupied-cell fixture missed the real grill');
  assert.deepEqual(projectPlacementTile(raycaster.ray,mode,4,3),{x,y},`${mode}/${facing}: occupied floor replaced by object surface coordinates`);projected++;
}
assert.equal(projectPlacementTile(new THREE.Ray(new THREE.Vector3(0,2,0),new THREE.Vector3(1,0,0)),'home',8,8),null,'parallel camera ray should not invent a tile');
console.log(`Placement PASS: ${cases} actual-model previews; all 4 rotations; engine table/chair anchors; ghost rays pass through; ${disposed} preview materials disposed; ${projected} occupied-floor projections; live model paint, picking and caches unchanged.`);
