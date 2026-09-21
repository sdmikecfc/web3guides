/** Actual model placement, rotations and picking without a browser or WebGL. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const {makeTable,tableFootprint}=require('../src/lib/chef/diner/geometry.ts');
const {HOME_EQUIPMENT}=require('../src/lib/chef/diner/content.ts');
const {DECOR}=require('../src/lib/chef/diner/collections.ts');
const {roomTableSeats}=require('../src/lib/chef/diner/room-plan.ts');
const threeURL=pathToFileURL(resolve('node_modules/three/build/three.module.js')).href,THREE=await import(threeURL);
function moduleURL(path,replacements={}){let source=readFileSync(path,'utf8').replaceAll("from 'three'",`from '${threeURL}'`);for(const [from,to]of Object.entries(replacements))source=source.replaceAll(`from '${from}'`,`from '${to}'`);return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{fileName:path,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;}
const modelURL=moduleURL('src/app/chef/diner-preview/models.ts',{'three/examples/jsm/geometries/RoundedBoxGeometry.js':pathToFileURL(resolve('node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js')).href});
const tableURL=moduleURL('src/app/chef/diner-preview/table-presentation.ts');
const kit=await import(modelURL),{createPlacementGhost,projectPlacementTile}=await import(moduleURL('src/app/chef/diner-preview/placement-ghost.ts',{'./models':modelURL,'./table-presentation':tableURL}));
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
