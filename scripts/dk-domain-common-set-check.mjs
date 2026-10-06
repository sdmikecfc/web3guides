import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const {animateCollection}=await sourceModule('src/app/chef/diner-preview/collection-assets.ts');
const {DOMAIN_COMMON_STUDIES,DOMAIN_SUPER_COMMON_STUDIES,DOMAIN_UNCOMMON_STUDIES}=await sourceModule('src/lib/chef/diner/domain-art-studies.ts');
const {DOMAIN_COLLECTIBLE_BY_ID}=await sourceModule('src/lib/chef/diner/domain-worlds.ts');
for(const id of [...DOMAIN_COMMON_STUDIES,...DOMAIN_SUPER_COMMON_STUDIES,...DOMAIN_UNCOMMON_STUDIES]){
 const path=`D:/Doma/DomainKitchenAssets/three-worlds-v1/${DOMAIN_UNCOMMON_STUDIES.has(id)?'uncommon-set-v1':DOMAIN_SUPER_COMMON_STUDIES.has(id)?'super-common-v1':'common-set-v1'}/${id}`,bytes=readFileSync(path+'.glb');
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const rest=new Map(),pivots=[];scene.traverse(o=>{rest.set(o.uuid,{p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()});if(o.userData.dkMotion)pivots.push(o);});
 assert(pivots.length>0,`${id} has a signature movement`);const envelope=new THREE.Box3();
 assert(pivots.every(p=>p.children.length>0),`${id} motion pivots keep their attached geometry`);
 animateCollection(scene,13,false,false);
 for(const pivot of pivots){
  if(pivot.userData.dkWorkOnly)assert.equal(pivot.visible,false,`${id}: steam is absent while idle`);
  if(pivot.userData.dkWorkOnly||pivot.userData.dkAnimateOnlyWorking){const v=rest.get(pivot.uuid);assert(pivot.position.equals(v.p)&&pivot.rotation.equals(v.r)&&pivot.scale.equals(v.s),`${id}: idle machines retain their authored pose`);}
 }
 for(let time=0;time<=60;time+=.33){
  animateCollection(scene,time,true,false);scene.updateMatrixWorld(true);envelope.union(new THREE.Box3().setFromObject(scene,true));
  for(const pivot of pivots)assert.equal(pivot.visible,true,`${id}: working detail is visible`);
  scene.traverse(o=>{if(!o.userData.dkMotion){const v=rest.get(o.uuid);assert(o.position.equals(v.p)&&o.rotation.equals(v.r)&&o.scale.equals(v.s),'Fixed geometry cannot drift');}});
 }
 const size=envelope.getSize(new THREE.Vector3()),footprint=DOMAIN_COLLECTIBLE_BY_ID[id].footprint;assert(size.x<=footprint[0]+.02&&size.z<=footprint[1]+.02&&size.y<=1.6,`${id}: envelope ${size.toArray()}`);assert(envelope.min.y>=-.002,`${id}: supporting surface`);
 animateCollection(scene,16,true,true);scene.traverse(o=>{const v=rest.get(o.uuid);assert(o.position.equals(v.p)&&o.rotation.equals(v.r)&&o.scale.equals(v.s),'Reduced motion retains authored pose');});
 const record=JSON.parse(readFileSync(path+'.json','utf8'));assert(record.triangles<=75000);assert(record.bytes===bytes.length);
 console.log(`PASS ${id}: ${record.triangles} triangles, ${pivots.length} restrained movements, ${size.toArray().map(n=>n.toFixed(3)).join(' x ')}m`);
}
