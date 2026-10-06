import assert from 'node:assert/strict';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const {createRouteEnvironment,SCENERY_BUDGETS}=await sourceModule('src/app/chef/diner-preview/living-destinations.ts');
const {TRUCK_TIERS}=await sourceModule('src/lib/chef/diner/content.ts');
const camera=new THREE.PerspectiveCamera();camera.position.set(-10,15,20);let combinations=0;const maxima={low:{draws:0,triangles:0},medium:{draws:0,triangles:0},high:{draws:0,triangles:0}};
for(const route of ['street','festival','business','boardwalk','night_market'])for(const tier of [1,2,3,4]){
 const dims=TRUCK_TIERS[tier],controller=createRouteEnvironment(route,dims.w,dims.h);assert.equal(controller.root.userData.inputPassthrough,true);
 for(const q of ['low','medium','high']){controller.setQuality(q);const s=controller.stats();assert(s.draws<=SCENERY_BUDGETS[q].draws,`${route} draws ${s.draws}`);assert(s.triangles<=SCENERY_BUDGETS[q].triangles);maxima[q].draws=Math.max(maxima[q].draws,s.draws);maxima[q].triangles=Math.max(maxima[q].triangles,s.triangles);combinations++;
  for(let rotation=0;rotation<4;rotation++){camera.position.set(Math.sin(rotation*Math.PI/2)*20,15,Math.cos(rotation*Math.PI/2)*20);controller.update(.05,camera);assert(Number.isFinite(controller.stats().time));}
 }
 const pausedAt=controller.stats().time;controller.update(.1,camera,false,true);assert.equal(controller.stats().time,pausedAt);controller.update(.1,camera,true);assert.equal(controller.stats().time,pausedAt);assert.equal(controller.stats().event,null);
 const starts=[];let wasEvent=false;for(let i=0;i<6000;i++){controller.update(.1,camera);const event=controller.stats().event;if(event&&!wasEvent)starts.push(controller.stats().time);wasEvent=!!event;}
 for(let i=1;i<starts.length;i++)assert(starts[i]-starts[i-1]>=90);
 controller.dispose();assert.equal(controller.root.children.length,0);controller.dispose();
}
console.log(`PASS ${combinations} destination/size/quality builds, four camera orientations, bounded events, pause/reduced motion and disposal`);
console.log(JSON.stringify({maximumSceneryResources:maxima}));
{
 const street=createRouteEnvironment('street',7,3),bike=street.root.getObjectByName('downtown-cyclist');assert(bike);
 street.update(.1,camera);street.root.updateMatrixWorld(true);
 const wheels=[];bike.traverse(o=>{if(o.name==='upright-wheel')wheels.push(o);});assert.equal(wheels.length,2);
 for(const wheel of wheels){const bounds=new THREE.Box3().setFromObject(wheel,true),size=bounds.getSize(new THREE.Vector3());assert(size.y>.5&&size.z<.1,'bicycle wheels must stand upright, not form horizontal rings');assert(bounds.min.y>-.10,'tires meet the road');}
 const before=bike.position.clone();for(let n=0;n<10;n++)street.update(.1,camera);
 assert(bike.position.x>before.x);assert.equal(bike.position.z,before.z);assert.equal(bike.rotation.y,0,'bicycle faces its direction of travel');
 street.dispose();console.log('PASS upright bicycle, road contact and travel direction');
}
