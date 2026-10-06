/** Exercise exported art and its real presentation code, not proxy geometry. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const {animateCollection,collectionTrackPose}=await sourceModule('src/app/chef/diner-preview/collection-assets.ts');
const L=.49,R=.28,perimeter=4*L+2*Math.PI*R;
for(let distance=-perimeter;distance<perimeter*2;distance+=.002){
 const p=collectionTrackPose(distance,L,R),next=collectionTrackPose(distance+.0001,L,R),dx=next.x-p.x,dz=next.z-p.z;
 assert.ok(Math.abs(Math.hypot(dx,dz)-.0001)<1e-8,'Track speed stays constant through corners');
 assert.ok((dx*Math.sin(p.yaw)+dz*Math.cos(p.yaw))/Math.hypot(dx,dz)>.99999,'Nose follows the track tangent, never sideways');
 const loop=collectionTrackPose(distance+perimeter,L,R);assert.ok(Math.hypot(loop.x-p.x,loop.z-p.z)<1e-10,'Track loop is seamless');
}
console.log('PASS rounded railway: continuous position, constant speed, tangent-facing movement, negative carriage offsets');
const subjects=[
 ['domain_gochujang_midnight_express',2,3],['domain_smoothie_toucan_bar',1,1],
 ['domain_smoothie_orbit_blender',1,1],['domain_smoothie_mango_lagoon',2,1],['domain_gochujang_volcano_boiler',1,1],
];
for(const [id,width,movingParts] of subjects){
 const bytes=readFileSync(`D:/Doma/DomainKitchenAssets/three-worlds-v1/${id==='domain_smoothie_toucan_bar'?'heroes-r4':'heroes-r3'}/${id}.glb`);
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const rest=new Map(),pivots=[];scene.traverse(o=>{rest.set(o.uuid,{p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()});if(o.userData.dkMotion)pivots.push(o);});
 assert.equal(pivots.length,movingParts,`${id} deliberate motion pivots only`);
 const envelope=new THREE.Box3();
 for(let time=0;time<=42;time+=.25){
  animateCollection(scene,time,true,false);scene.updateMatrixWorld(true);envelope.union(new THREE.Box3().setFromObject(scene,true));
  scene.traverse(o=>{if(!o.userData.dkMotion){const p=rest.get(o.uuid);assert.ok(o.position.equals(p.p)&&o.rotation.equals(p.r)&&o.scale.equals(p.s),'Stationary bodies/supports never slide');}});
 }
 const size=envelope.getSize(new THREE.Vector3());
 assert.ok(size.x<=width+.02&&size.z<=1.02&&size.y<=1.6,`${id} respects placement envelope: ${size.toArray()}`);
 assert.ok(envelope.min.y>=-.002,`${id} never below its supporting surface`);
 animateCollection(scene,17,false,true);
 scene.traverse(o=>{const p=rest.get(o.uuid);assert.ok(o.position.equals(p.p)&&o.rotation.equals(p.r)&&o.scale.equals(p.s),'Reduced motion restores the full authored rest pose');});
 if(id.endsWith('orbit_blender')){
  animateCollection(scene,13,false,false);const rotor=pivots[0];assert.ok(rotor.rotation.equals(rest.get(rotor.uuid).r),'Blender motor stops when the machine stops');
 }
 console.log(`PASS ${id}: bounded motion, fixed supports, reduced motion, ${size.toArray().map(v=>v.toFixed(3)).join(' × ')}m`);
}
// Keep the actual equipment-appearance assembly in this check: a decorative
// basket must never sit alongside the real liftable one or invent cooked food.
const originalLoad=GLTFLoader.prototype.loadAsync,originalEnv=process.env.NODE_ENV;
try{
 process.env.NODE_ENV='development';
 GLTFLoader.prototype.loadAsync=async function(url){
  assert.equal(url,'/api/chef/domain-review-assets/domain_gochujang_volcano_boiler.glb');
  const bytes=readFileSync('D:/Doma/DomainKitchenAssets/three-worlds-v1/heroes-r3/domain_gochujang_volcano_boiler.glb');
  return this.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 };
 const {createEquipmentAppearance}=await sourceModule('src/app/chef/diner-preview/models.ts');
 const equipment=createEquipmentAppearance('boiler','domain_gochujang_volcano_boiler',{tier:2});await equipment.userData.ready;
 const baskets=[],displays=[];equipment.traverse(o=>{if(o.name==='boiler-basket')baskets.push(o);if(o.userData.dkDisplayOnly)displays.push(o);});
 assert.equal(baskets.length,1);assert.equal(displays.length,1);assert.equal(displays[0].visible,false);
 animateCollection(equipment,10,true,false);assert.equal(displays[0].visible,false,'Animation cannot reveal display-only noodles in a working machine');
 assert.ok(Math.abs(equipment.userData.surfaceHeight-.895)<1e-9);
 equipment.updateMatrixWorld(true);const before=new THREE.Box3().setFromObject(baskets[0],true);assert.ok(before.max.y<1.05,'Basket fits the cauldron rim');
 baskets[0].position.y=.22;equipment.updateMatrixWorld(true);const after=new THREE.Box3().setFromObject(baskets[0],true);
 assert.ok(Math.abs(after.min.y-before.min.y-.22)<1e-6,'Actual draining action retains its full lift');
 console.log('PASS working boiler: one basket, correct basin height, real lift, no decorative cooked food');
}finally{GLTFLoader.prototype.loadAsync=originalLoad;if(originalEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalEnv;}
