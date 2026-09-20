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
let cheekRays=0;
for(const role of ['chef','waiter','customer'])for(let look=0;look<8;look++){
  const actor=kit.createCharacter(role,look),rig=actor.userData.rig,sentinel=new THREE.Group();rig.held.add(sentinel);
  const face=rig.head.getObjectByName('face-surface');assert(face?.children.length===1&&face.children[0].isMesh,'the skull and cheeks must be one continuous skin surface');
  assert.equal(rig.eyes.length,2,'exactly two animated eyes');
  actor.updateMatrixWorld(true);const inverseHead=rig.head.matrixWorld.clone().invert(),skin=face.children[0].material.color.getHex(),skinMeshes=new THREE.Group();
  rig.head.traverse(part=>{
    if(!part.isMesh||part.material.color?.getHex()!==skin)return;
    const copy=new THREE.Mesh(part.geometry,part.material);copy.matrixAutoUpdate=false;copy.matrix.multiplyMatrices(inverseHead,part.matrixWorld);skinMeshes.add(copy);
  });skinMeshes.updateMatrixWorld(true);
  // Probe the actual packed skin meshes below the nose/ears. Multiple front
  // intersections here catch the former overlapping cheek spheres even if
  // their triangles have been merged into one draw call.
  for(const x of [-.20,-.15,-.10,.10,.15,.20])for(const y of [-.14,-.10,-.075]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y,-1),new THREE.Vector3(0,0,1));
    const distances=ray.intersectObject(skinMeshes,true).map(hit=>hit.distance).filter((distance,i,all)=>i===0||Math.abs(distance-all[i-1])>1e-5);
    assert.equal(distances.length,1,`${role}/${look}: overlapping facial layers at ${x},${y}`);cheekRays++;
  }
  const pigment=rig.head.getObjectByName('face-pigment');assert(pigment,'curved facial pigment exists');pigment.traverse(part=>{if(part.isMesh)assert.equal(part.castShadow,false,'blush is skin pigment, not a raised shadow-casting shell');});
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
const single=kit.createModel('table_1');assert.equal(single.userData.unsupportedModel,undefined);const singleSize=new THREE.Box3().setFromObject(single).getSize(new THREE.Vector3());assert(singleSize.x<=.9&&singleSize.z<=.9,'single table escapes its one-tile footprint');
const tabletop=new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0)).intersectObject(single,true)[0];assert(tabletop&&Math.abs(tabletop.point.y-.8505)<.003,'the single table must support its centered serving plate');
console.log(`Diner acting PASS: ${frames} sampled pose frames; ${cheekRays} single-surface face probes; truthful props, stable item ownership, seated/floor contacts, independent blinks, fixed resource cache and one-seat table/hero plate bounds.`);
