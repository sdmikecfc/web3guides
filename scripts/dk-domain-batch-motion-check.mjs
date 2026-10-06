import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const {animateCollection}=await sourceModule('src/app/chef/diner-preview/collection-assets.ts');
const {DOMAIN_COLLECTIBLE_BY_ID}=await sourceModule('src/lib/chef/diner/domain-worlds.ts');
const {DOMAIN_NEW_STUDY_FOLDERS}=await sourceModule('src/lib/chef/diner/domain-art-studies.ts');
const folder=process.argv[2];assert(folder?.startsWith('D:/Doma/DomainKitchenAssets/three-worlds-v1/'));
const expected=Object.entries(DOMAIN_NEW_STUDY_FOLDERS).filter(([,f])=>folder.endsWith('/'+f)).map(([id])=>id+'.glb').sort();
assert(expected.length,'Known complete batch');assert.deepEqual(readdirSync(folder).filter(f=>f.endsWith('.glb')).sort(),expected,'No absent models hidden by directory enumeration');
let failed=0;
for(const file of readdirSync(folder).filter(f=>f.endsWith('.glb'))){
 const id=file.slice(0,-4);
 try{
  const def=DOMAIN_COLLECTIBLE_BY_ID[id];assert(def);
  const bytes=readFileSync(`${folder}/${file}`),{scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const rest=new Map(),pivots=[];scene.traverse(o=>{rest.set(o.uuid,{p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()});if(o.userData.dkMotion)pivots.push(o);});
  assert(pivots.length>0,'Has signature motion');assert(pivots.every(p=>p.children.length),'Pivots own actual geometry');
  const envelope=new THREE.Box3();
  for(let t=0;t<=70;t+=.5){animateCollection(scene,t,true,false);scene.updateMatrixWorld(true);envelope.union(new THREE.Box3().setFromObject(scene,true));}
  const size=envelope.getSize(new THREE.Vector3());assert(size.x<=def.footprint[0]+.02&&size.z<=1.02&&size.y<=1.60,`Placement envelope ${size.toArray()}`);assert(envelope.min.y>=-.002,`Below supporting surface ${envelope.min.y}`);
  animateCollection(scene,15,false,true);
  scene.traverse(o=>{const v=rest.get(o.uuid);assert(o.position.equals(v.p)&&o.rotation.equals(v.r)&&o.scale.equals(v.s),'Reduced motion preserves rest pose');});
  animateCollection(scene,15,false,false);
  for(const p of pivots)if(p.userData.dkAnimateOnlyWorking){const v=rest.get(p.uuid);assert(p.position.equals(v.p)&&p.rotation.equals(v.r),'Stopped equipment must stay still');}
  const record=JSON.parse(readFileSync(`${folder}/${id}.json`,'utf8'));assert(record.triangles<=75000);assert.equal(record.bytes,bytes.length);
  console.log(`PASS ${id}: ${record.triangles} tris, ${pivots.length} pivots, ${size.toArray().map(v=>v.toFixed(3)).join(' x ')}`);
 }catch(e){failed++;console.error(`FAIL ${id}: ${e.message}`);}
}
assert.equal(failed,0,'All actual exported assets must pass');
