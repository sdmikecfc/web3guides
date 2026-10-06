import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const {createRouteEnvironment,SCENERY_BUDGETS}=await sourceModule('src/app/chef/diner-preview/living-destinations.ts');
const {TRUCK_TIERS}=await sourceModule('src/lib/chef/diner/content.ts');
const camera=new THREE.PerspectiveCamera();
const maxima={};let combinations=0;
function fingerprint(root){const h=createHash('sha256');root.updateMatrixWorld(true);root.traverse(o=>{if(o.isMesh){h.update(JSON.stringify(o.matrixWorld.elements));for(const name of ['position','normal','color'])h.update(Buffer.from(o.geometry.attributes[name].array.buffer));if(o.geometry.index)h.update(Buffer.from(o.geometry.index.array.buffer));}});return h.digest('hex');}
// Captured before the two other destinations were rebuilt. Gochu is intentionally unchanged.
const legacyGochu=['5857a5e180dff221cbb042d4d1792134ed38da7d66fb2c9773d25d0fd0537d68','f593b34d14abd664e8f7f808b89cbbb0b5c44628eb11424931f631cf9f9414b8','3af482d4aa667507ae8c7a933ceb529bc91e8999832b09bc76bc14151c2af735'];
const unchanged=createRouteEnvironment('night_market',8,4,'gochujang');
for(const [i,q] of ['low','medium','high'].entries()){unchanged.setQuality(q);assert.equal(fingerprint(unchanged.root),legacyGochu[i]);}unchanged.dispose();
for(const domain of ['gochujang','smoothie','wines'])for(const tier of [1,2,3,4]){
 const {w,h}=TRUCK_TIERS[tier],c=createRouteEnvironment(domain==='gochujang'?'night_market':domain==='smoothie'?'boardwalk':'business',w,h,domain);
 for(const quality of ['low','medium','high']){
  c.setQuality(quality);const s=c.stats(),key=`${domain}/${quality}`;maxima[key]=Math.max(maxima[key]??0,s.triangles);
  assert(s.draws+(domain==='gochujang'?6:0)<=SCENERY_BUDGETS[quality].draws,'include browser-only signs');assert(s.triangles<SCENERY_BUDGETS[quality].triangles,`${key}: ${s.triangles}`);
  for(let i=0;i<4;i++){camera.position.set(Math.sin(i*Math.PI/2)*20,15,Math.cos(i*Math.PI/2)*20);c.update(.1,camera);}combinations++;
  if(domain!=='gochujang'){
   // Substantial tall landmarks stay outside the cooking and outdoor seating area.
   const names=domain==='smoothie'?['smoothie-fruit-pavilion','smoothie-beach-garden']:['wines-arched-cellar','wines-vine-pergola'];
   for(const name of names){const landmark=c.root.getObjectByName(name);assert(landmark);const bounds=new THREE.Box3().setFromObject(landmark);assert(bounds.max.y>1.3);if(!name.includes('garden'))assert(bounds.max.x<-.8||bounds.min.x>w+.8);}
   const moving=c.root.getObjectByName(domain==='smoothie'?'smoothie-promenade-walker':'wines-cellar-visitor');assert(moving);
   let distance=0,last=moving.position.clone();for(let i=0;i<300;i++){c.update(.1,camera);distance+=last.distanceTo(moving.position);last.copy(moving.position);assert(moving.position.z< -1.8,'pedestrians never enter service area');}
   assert(distance>1,'ambient actors actually travel');
  }
 }
 const t=c.stats().time,pose=fingerprint(c.root);c.update(.1,camera,true);assert.equal(c.stats().time,t);assert.equal(fingerprint(c.root),pose);c.update(.1,camera,false,true);assert.equal(c.stats().time,t);assert.equal(fingerprint(c.root),pose);assert.equal(c.root.userData.inputPassthrough,true);
 // Repeated quality rebuilds must release every retired geometry and owned material.
 const retired=[],oldMaterials=new Set(),releasedMaterials=new Set();c.root.traverse(o=>{if(o.isMesh){retired.push(o.geometry);oldMaterials.add(o.material);}});let released=0;for(const g of retired)g.addEventListener('dispose',()=>released++);for(const m of oldMaterials)m.addEventListener('dispose',()=>releasedMaterials.add(m));c.setQuality('low');assert.equal(released,retired.length);
 const retained=new Set();c.root.traverse(o=>{if(o.isMesh)retained.add(o.material);});for(const m of oldMaterials)assert.equal(releasedMaterials.has(m),!retained.has(m),'release retired materials, retain shared paint');
 c.dispose();assert.equal(c.root.children.length,0);assert.equal(releasedMaterials.size,oldMaterials.size);c.dispose();
}
console.log(`PASS ${combinations} domain/size/quality scenes, unchanged Gochu geometry, four orientations, scenery boundaries, walking, pause/reduced motion and disposal`);
console.log(JSON.stringify({maximumTriangles:maxima}));
