/** Checks the actual authored perimeter geometry without a browser or WebGL. */
import assert from 'node:assert/strict';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const {createHomeAmbience,createCafeWallLight}=await sourceModule('src/app/chef/diner-preview/home-ambience.ts');
const {disposeObject}=await sourceModule('src/app/chef/diner-preview/models.ts');
let cases=0;
for(const size of [8,10,12,14]){
  const ambience=createHomeAmbience(size,size),root=ambience.root,depth=size+3,ray=new THREE.Raycaster(new THREE.Vector3(0,5,0),new THREE.Vector3(0,-1,0));
  let triangles=0;root.updateMatrixWorld(true);
  root.traverse(object=>{if(!object.isMesh)return;const box=new THREE.Box3().setFromObject(object);assert.ok(box.min.y>=-.1101,'geometry extends below the real ground plane');assert.ok(box.max.x<=-.5||box.min.x>=size-.5||box.max.z<=-.5||box.min.z>=depth-.5,'decorative geometry occupies a walkable cell');assert.equal(object.userData.pick,undefined,'decoration accidentally becomes a game target');triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;});
  assert.ok(triangles<20000,`perimeter geometry over budget: ${triangles}`);
  for(let y=0;y<depth;y++)for(let x=0;x<size;x++){ray.ray.origin.set(x,5,y);assert.equal(ray.intersectObject(root,true).length,0,'decoration steals a room/terrace target');}
  const beds=root.children.filter(item=>item.name.startsWith('supported-planted-bed'));assert.equal(beds.length,2);
  for(let time=0;time<12;time+=.3){ambience.update(time);root.updateMatrixWorld(true);for(const bed of beds){const support=bed.getObjectByName('bed-support'),bounds=new THREE.Box3().setFromObject(bed),foot=new THREE.Box3().setFromObject(support);assert.ok(bounds.min.x>=foot.min.x-.001&&bounds.max.x<=foot.max.x+.001&&bounds.min.z>=foot.min.z-.001&&bounds.max.z<=foot.max.z+.001,'moving foliage overhangs its supporting footing');assert.ok(Math.abs(foot.min.y+.11)<.001,'bed is not grounded');}}
  ambience.update(12,false);for(const bed of beds)for(const pivot of bed.children.filter(item=>item.isGroup))assert.ok(pivot.rotation.x===0&&pivot.rotation.z===0,'reduced-motion foliage moves');
  let leavesDisposed=false;const foliageMesh=beds[0].children.find(item=>item.isGroup).children.find(item=>item.geometry?.type==='SphereGeometry');foliageMesh.geometry.addEventListener('dispose',()=>{leavesDisposed=true;});disposeObject(root);assert.ok(leavesDisposed,'private foliage geometry survives scene disposal');
  console.log(`PASS ${size}×${size}: supported perimeter, unobstructed cells, no raycast targets, bounded motion, ${triangles} triangles`);cases++;
}
const lamp=createCafeWallLight();lamp.updateMatrixWorld(true);const lampBounds=new THREE.Box3().setFromObject(lamp);assert.ok(lampBounds.min.z>=-.003&&lampBounds.max.z<.4,'wall light loses its attachment');assert.ok(lampBounds.getSize(new THREE.Vector3()).y<.3,'wall light exceeds modest architectural scale');disposeObject(lamp);
console.log(`Home ambience PASS: ${cases} room sizes and attached wall light. Visual review is separate.`);
