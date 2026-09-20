/** Character acting keeps real item ownership, joints and furniture contacts intact. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const threeUrl=pathToFileURL(resolve('node_modules/three/build/three.module.js')).href;
const THREE=await import(threeUrl);
let source=await readFile('src/app/chef/diner-preview/models.ts','utf8');
source=source.replaceAll("from 'three'",`from '${threeUrl}'`).replaceAll("from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'",`from '${pathToFileURL(resolve('node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js')).href}'`);
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const kit=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const visibleProps=rig=>Object.entries(rig.props).filter(([,prop])=>prop.visible).map(([key])=>key);
let frames=0;
for(const role of ['chef','waiter','customer'])for(let look=0;look<8;look++){
  const actor=kit.createCharacter(role,look),rig=actor.userData.rig,sentinel=new THREE.Group();rig.held.add(sentinel);
  for(const [pose,work,expected] of [['idle',undefined,[]],['walk',undefined,[]],['carry',undefined,[]],['cook',{stationKind:'grill'},['cook']],['cook',{stationKind:'prep',recipeId:'classic_burger'},['knife']],['cook',{stationKind:'prep',recipeId:'brownie'},['spoon']],['wash',undefined,['wash']],['eat',undefined,['eat']],['sit',undefined,[]],['cheer',undefined,[]]]){
    for(let frame=0;frame<48;frame++){
      kit.animateCharacter(actor,frame*.17,pose,pose==='carry',pose==='walk',work);actor.updateMatrixWorld(true);
      assert.deepEqual(visibleProps(rig),expected,`${role}/${pose}: incorrect acting prop`);
      assert.deepEqual(rig.held.children,[sentinel],'acting changed simulated held-item ownership');assert.deepEqual(rig.held.position.toArray(),[0,.9,-.39]);
      const bounds=new THREE.Box3().setFromObject(actor),size=bounds.getSize(new THREE.Vector3());
      assert(bounds.min.y>=-.09&&bounds.max.y<=2.1&&size.x<=2.1&&size.z<=2.1,`${role}/${pose}: pose escaped anchors or bounds`);
      if(pose==='sit'||pose==='eat'){const hip=new THREE.Vector3();rig.legs[0].getWorldPosition(hip);assert(Math.abs(hip.y-.47)<1e-8,'seated hip moved off cushion');}
      if(pose==='idle'||pose==='cheer')assert(Math.abs(bounds.min.y)<.025,'idle acting lifts the feet off the floor');
      frames++;
    }
  }
  for(const pose of ['cook','wash','eat']){kit.animateCharacter(actor,1,pose,true,false,{stationKind:'prep',recipeId:'brownie'});assert.deepEqual(visibleProps(rig),[],'an acting prop duplicates carried food');}
  assert(rig.elbows.every((elbow,i)=>elbow.parent===rig.arms[i]),'forearm detached from shoulder');
}
const a=kit.createCharacter('customer',0),b=kit.createCharacter('customer',1);let closed=false,open=false,different=false;
for(let i=0;i<240;i++){kit.animateCharacter(a,i*.025,'idle',false,false);kit.animateCharacter(b,i*.025,'idle',false,false);const ay=a.userData.rig.eyes[0].scale.y,by=b.userData.rig.eyes[0].scale.y;closed ||= ay<.20;open ||= ay>.98;different ||= Math.abs(ay-by)>.5;}
assert(closed&&open&&different,'blinks must open, close and vary by character');
const stats=kit.modelKitStats();for(let i=0;i<120;i++)kit.animateCharacter(a,i*.1,'cook',false,false,{stationKind:'prep',recipeId:'brownie'});assert.deepEqual(kit.modelKitStats(),stats,'animation allocates geometry or materials each frame');
for(const id of ['classic_burger','fries']){const food=kit.createFoodModel({recipeId:id,kind:'dish'}),bounds=new THREE.Box3().setFromObject(food),size=bounds.getSize(new THREE.Vector3());assert(size.x<=.59&&size.z<=.59&&bounds.max.y<=.55,`${id}: hero food overflows its plate`);}
console.log(`Diner acting PASS: ${frames} sampled pose frames; truthful prop visibility, stable item ownership, seated/floor contacts, independent blinks, fixed resource cache and hero plate bounds.`);
