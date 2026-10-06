/** Actual Three.js floor picking, including the separate oak-plank instances. */
import assert from 'node:assert/strict';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const {domainRoomShell}=await sourceModule('src/app/chef/diner-preview/domain-room-renderer.ts');
const {firstVisibleSceneSurface}=await sourceModule('src/app/chef/diner-preview/scene-picking.ts');
const ray=new THREE.Raycaster();
for(const domain of ['gochujang','smoothie','wines'])for(const [w,h] of [[10,8],[12,10],[14,12]]){
 const plan={w,h,edges:[],surfaces:Array.from({length:w*h},(_,i)=>({x:i%w,y:Math.floor(i/w),kind:i%7===0?'patio':'indoor'})),appearance:{version:1,floor:domain,pieces:{}}};
 const shell=domainRoomShell(plan);shell.updateMatrixWorld(true);
 const floors=shell.children.filter(o=>o.name==='room-supported-floor');assert.ok(floors.length<=2,'Floor uses at most two instanced batches');
 for(const tile of plan.surfaces)for(const zOffset of domain==='wines'&&tile.kind==='indoor'?[-.333,0,.333]:[0]){
  ray.set(new THREE.Vector3(tile.x,5,tile.y+zOffset),new THREE.Vector3(0,-1,0));
  const hit=firstVisibleSceneSurface(ray.intersectObject(shell,true));assert.deepEqual(hit?.tile,{x:tile.x,y:tile.y},`${domain}/${w} floor must retain exact placement identity`);
 }
 console.log(`PASS ${domain}/${w}x${h}: every physical floor/plank selects its tile`);
}
