/** Pure camera composition checked through the actual Three projection, without WebGL. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDiner,homeSimulationConfig } from '../src/lib/chef/diner/progression';
import { createHomeWorld } from '../src/lib/chef/diner/home-simulation';
import { homeScene } from '../src/app/chef/diner-preview/home-scene';
import { createHomeCameraBounds,fitHomeCamera } from '../src/app/chef/diner-preview/home-camera';

const starter=createDiner(42*86400000+1000,'camera-review');
const initial=homeScene(starter,createHomeWorld(homeSimulationConfig(starter)),null,'#bd654e');
let cases=0;
function cameraFor(fit:ReturnType<typeof fitHomeCamera>,width:number,height:number,rotation:number,azimuthOffset=-Math.PI/4){
  const focus=new THREE.Vector3(fit.focus.x,fit.focus.y,fit.focus.z),elevation=35*Math.PI/180,angle=rotation+azimuthOffset;
  const camera=new THREE.OrthographicCamera(-fit.vertical*width/height/2,fit.vertical*width/height/2,fit.vertical/2,-fit.vertical/2,.1,100);
  camera.position.set(focus.x+Math.sin(angle)*Math.cos(elevation)*22,focus.y+Math.sin(elevation)*22,focus.z+Math.cos(angle)*Math.cos(elevation)*22);camera.lookAt(focus);
  const {left,right,top,bottom}=fit.insets,usableW=width-left-right,usableH=height-top-bottom;
  camera.setViewOffset(width,height,width/2-(left+usableW/2),height/2-(top+usableH/2),width,height);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  return camera;
}
function pointToScreen(camera:THREE.Camera,width:number,height:number,x:number,y:number,z:number){const point=new THREE.Vector3(x,y,z).project(camera);return {x:(point.x+1)*width/2,y:(1-point.y)*height/2};}

for(const size of [8,10,12,14])for(const [width,height] of [[390,844],[1280,720],[844,390]])for(let quarter=0;quarter<4;quarter++){
  const scene=structuredClone(initial);scene.width=scene.height=size;
  const bounds=createHomeCameraBounds(scene),rotation=quarter*Math.PI/2,fit=fitHomeCamera({bounds,width,height,rotation}),camera=cameraFor(fit,width,height,rotation);
  for(const box of bounds.boxes)for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const point=pointToScreen(camera,width,height,x,y,z);
    assert.ok(point.x>=fit.insets.left+6.99&&point.x<=width-fit.insets.right-6.99,`horizontal crop at ${size},${width}×${height},turn${quarter}: ${point.x}`);
    assert.ok(point.y>=fit.insets.top+6.99&&point.y<=height-fit.insets.bottom-6.99,`vertical crop at ${size},${width}×${height},turn${quarter}: ${point.y}`);
  }
  cases++;
}
console.log(`PASS ${cases} real projection fits: four room sizes, four turns, phone/desktop/landscape`);

const bounds=createHomeCameraBounds(initial),before=fitHomeCamera({bounds,width:390,height:844,rotation:0});
const changed=structuredClone(initial);changed.people=[{id:'visitor',role:'customer',x:100,y:100,pose:'walk'}];changed.tick=999;
changed.objects=changed.objects.filter(object=>object.id!=='home-parcel');
changed.objects.push({id:'incident:later',kind:'parcel',x:1,y:6,state:'working',progress:.9});
for(const object of changed.objects){object.state='working';object.progress=.8;object.food={recipeId:'fries',kind:'dish'};}
for(const table of changed.tables)for(const seat of table.seats){seat.status='dirty';seat.item={recipeId:'classic_burger',kind:'dirty'};}
assert.deepEqual(fitHomeCamera({bounds:createHomeCameraBounds(changed),width:390,height:844,rotation:0}),before);
console.log('PASS stationary composition across actors, jobs, food, dirty seats and parcel removal');

const rotated=structuredClone(initial);rotated.objects.push({id:'wide-pass',kind:'pass',x:6,y:1,rotation:1});
const wide=createHomeCameraBounds(rotated).boxes.find(box=>Math.abs(box.min.x-5.46)<.001&&Math.abs(box.min.z-.46)<.001);
assert.ok(wide);assert.ok(Math.abs(wide.max.x-6.54)<.001);assert.ok(Math.abs(wide.max.z-2.54)<.001);
console.log('PASS rotated two-cell furniture uses its true footprint');

const camera=cameraFor(before,390,844,0),positions=Object.fromEntries(initial.objects.filter(object=>['grill-1','prep-1','sink-1','home-binder','home-till','home-parcel'].includes(object.id)).map(object=>{
  const point=pointToScreen(camera,390,844,object.x,.9,object.y);return [object.id,{x:Math.round(point.x),y:Math.round(point.y)}];
}));
console.log(JSON.stringify({starter390x844:{focus:before.focus,vertical:before.vertical,pixelsPerTile:before.pixelsPerTile,positions}},null,2));

let newAngles=0;
for(const size of [8,10,12,14])for(const [width,height,azimuthOffset] of [[390,844,Math.PI/12],[1280,720,Math.PI/4]])for(let quarter=0;quarter<4;quarter++){
  const scene=structuredClone(initial);scene.width=scene.height=size;
  const bounds=createHomeCameraBounds(scene),rotation=quarter*Math.PI/2,fit=fitHomeCamera({bounds,width,height,rotation,azimuthOffset}),camera=cameraFor(fit,width,height,rotation,azimuthOffset);
  for(const box of bounds.boxes)for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const point=pointToScreen(camera,width,height,x,y,z);
    assert.ok(point.x>=fit.insets.left+6.99&&point.x<=width-fit.insets.right-6.99,`angled horizontal crop: ${size},${quarter},${point.x}`);
    assert.ok(point.y>=fit.insets.top+6.99&&point.y<=height-fit.insets.bottom-6.99,`angled vertical crop: ${size},${quarter},${point.y}`);
  }
  newAngles++;
}
const portrait=fitHomeCamera({bounds,width:390,height:844,rotation:0,azimuthOffset:Math.PI/12}),portraitCamera=cameraFor(portrait,390,844,0,Math.PI/12);
assert.ok(portrait.pixelsPerTile>before.pixelsPerTile*1.2,'new portrait angle does not improve readable scale');
const portraitPositions=Object.fromEntries(initial.objects.filter(object=>['grill-1','prep-1','sink-1','home-binder','home-till','home-parcel'].includes(object.id)).map(object=>{
  const point=pointToScreen(portraitCamera,390,844,object.x,.9,object.y);return [object.id,{x:Math.round(point.x),y:Math.round(point.y)}];
}));
console.log(`PASS ${newAngles} alternate-angle projections: portrait+15° and desktop+45°, four room sizes and turns`);
console.log(JSON.stringify({portraitPlus15:{focus:portrait.focus,vertical:portrait.vertical,pixelsPerTile:portrait.pixelsPerTile,scaleGain:portrait.pixelsPerTile/before.pixelsPerTile,projectedHeight:(portrait.projectedBounds.maxY-portrait.projectedBounds.minY)*portrait.pixelsPerTile,positions:portraitPositions}},null,2));
