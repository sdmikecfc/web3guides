/** Check the exported studies through the real runtime animation code. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const {animateCollection}=await sourceModule('src/app/chef/diner-preview/collection-assets.ts');
const subjects=[
 ['domain_gochujang_fireant_brigade','Forearm_stirring_at_elbow'],
 ['domain_smoothie_toucan_bar','Head_nod_on_neck_joint'],
 ['domain_wines_midnight_decanter','Small_candle_flame'],
];
for(const [id,motionName] of subjects){
 const bytes=readFileSync(`D:/Doma/DomainKitchenAssets/three-worlds-v1/heroes-r2/${id}.glb`);
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 scene.updateMatrixWorld(true);const rest=new Map(),pivots=[];
 scene.traverse(o=>{rest.set(o.uuid,{p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()});if(o.userData.dkMotion)pivots.push(o);});
 assert.equal(pivots.length,1,`${id}: exactly one localized gesture`);
 assert.equal(pivots[0].name,motionName);
 assert.equal(pivots[0].userData.dkMotion,'rock');
 const envelope=new THREE.Box3();
 for(let time=0;time<=12;time+=.25){
  animateCollection(scene,time,true,false);scene.updateMatrixWorld(true);envelope.union(new THREE.Box3().setFromObject(scene,true));
  scene.traverse(o=>{if(!o.userData.dkMotion){const pose=rest.get(o.uuid);assert.ok(o.position.equals(pose.p)&&o.rotation.equals(pose.r)&&o.scale.equals(pose.s),'No whole-body sliding or stationary-prop animation');}});
 }
 const dimensions=envelope.getSize(new THREE.Vector3());
 assert.ok(dimensions.x<=1.01&&dimensions.z<=1.01&&dimensions.y<=1.50,`${id}: movement fits one counter tile (${dimensions.toArray()})`);
 assert.ok(envelope.min.y>=-.002,'Support remains on the counter');
 animateCollection(scene,9,true,true);
 scene.traverse(o=>{const pose=rest.get(o.uuid);assert.ok(o.position.equals(pose.p)&&o.rotation.equals(pose.r)&&o.scale.equals(pose.s),'Reduced motion restores the authored pose');});
 console.log(`PASS ${id}: localized gesture, static supports, reduced motion, ${dimensions.toArray().map(v=>v.toFixed(3)).join(' × ')}m envelope`);
}
