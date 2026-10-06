import assert from 'node:assert/strict';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const {LEGACY_COLLECTIBLES:COLLECTIBLES}=await sourceModule('src/lib/chef/diner/collectible-packs.ts');
const {SHOP_DECOR}=await sourceModule('src/lib/chef/diner/decor-catalog.ts');
const {createModel,disposeObject}=await sourceModule('src/app/chef/diner-preview/models.ts');
let triangles=0,maxMeshes=0;
for(const item of [...COLLECTIBLES,...SHOP_DECOR]){
  const model=createModel(item.id),box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());
  assert.equal(model.name,item.id);assert(!box.isEmpty(),item.id);assert([size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>0),item.id);
  assert(size.x<=item.footprint[0]+.1,`${item.id} overflows width ${size.x}`);
  assert(size.z<=item.footprint[1]+.1,`${item.id} overflows depth ${size.z}`);
  let meshes=0;model.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});maxMeshes=Math.max(maxMeshes,meshes);assert(meshes<=14,`${item.id}: ${meshes} draw calls`);disposeObject(model);
}
console.log(`PASS legacy collectible and shop models; bounded footprints; max ${maxMeshes} meshes; ${Math.round(triangles)} total triangles`);
