/** Character acting keeps real item ownership, joints and furniture contacts intact. */
import assert from 'node:assert/strict';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
const kit=await sourceModule('src/app/chef/diner-preview/models.ts');
const visibleProps=rig=>Object.entries(rig.props).filter(([,prop])=>prop.visible).map(([key])=>key);
let frames=0;
let cheekRays=0;
for(const role of ['chef','waiter','customer'])for(let look=0;look<8;look++){
  const actor=kit.createCharacter(role,look),rig=actor.userData.rig,sentinel=new THREE.Group();rig.held.add(sentinel);
  const face=rig.head.getObjectByName('face-surface'),faceMeshes=[];face?.traverse(part=>{if(part.isMesh)faceMeshes.push(part);});assert.equal(faceMeshes.length,1,'the skull and cheeks must be one continuous skin surface');
  assert.equal(rig.eyes.length,2,'exactly two animated eyes');
  actor.updateMatrixWorld(true);const inverseHead=rig.head.matrixWorld.clone().invert(),skin=faceMeshes[0].material.color.getHex(),skinMeshes=new THREE.Group();
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
  let animationTime=0;
  for(const [pose,work,expected] of [['idle',undefined,[]],['walk',undefined,[]],['carry',undefined,[]],['cook',{stationKind:'grill'},['cook']],['cook',{stationKind:'prep',recipeId:'classic_burger'},['knife']],['cook',{stationKind:'prep',recipeId:'brownie'},['spoon']],['wash',undefined,['wash']],['eat',undefined,['eat']],['sit',undefined,[]],['cheer',undefined,[]]]){
    for(let frame=0;frame<48;frame++){
      animationTime+=1/60;kit.animateCharacter(actor,animationTime,pose,pose==='carry',pose==='walk',work);actor.updateMatrixWorld(true);
      assert.deepEqual(visibleProps(rig),expected,`${role}/${pose}: incorrect acting prop`);
      assert.deepEqual(rig.held.children,[sentinel],'acting changed simulated held-item ownership');assert.deepEqual(rig.held.position.toArray(),[0,.9,-.39]);
      const bounds=new THREE.Box3().setFromObject(actor),size=bounds.getSize(new THREE.Vector3());
      assert(bounds.min.y>=-.09&&bounds.max.y<=2.1&&size.x<=2.1&&size.z<=2.1,`${role}/${pose}: pose escaped anchors or bounds`);
      if(pose==='sit'||pose==='eat'){const hip=new THREE.Vector3();rig.legs[0].getWorldPosition(hip);assert(Math.abs(hip.y-.47)<1e-8,'seated hip moved off cushion');}
      if(pose==='idle'||pose==='cheer')assert(Math.abs(bounds.min.y)<.025,'idle acting lifts the feet off the floor');
      frames++;
    }
  }
  for(const pose of ['cook','wash','eat']){animationTime+=1/60;kit.animateCharacter(actor,animationTime,pose,true,false,{stationKind:'prep',recipeId:'brownie'});assert.deepEqual(visibleProps(rig),[],'an acting prop duplicates carried food');}
  const belongsTo=(part,parent)=>{while(part){if(part===parent)return true;part=part.parent;}return false;};
  assert(rig.elbows.every((elbow,i)=>belongsTo(elbow,rig.arms[i])),'forearm detached from shoulder');
}
const a=kit.createCharacter('customer',0),b=kit.createCharacter('customer',1);let closed=false,open=false,different=false;
for(let i=0;i<240;i++){kit.animateCharacter(a,i*.025,'idle',false,false);kit.animateCharacter(b,i*.025,'idle',false,false);const ay=a.userData.rig.eyes[0].scale.y,by=b.userData.rig.eyes[0].scale.y;closed ||= ay<.20;open ||= ay>.98;different ||= Math.abs(ay-by)>.5;}
assert(closed&&open&&different,'blinks must open, close and vary by character');
const stats=kit.modelKitStats();for(let i=0;i<120;i++)kit.animateCharacter(a,i*.1,'cook',false,false,{stationKind:'prep',recipeId:'brownie'});assert.deepEqual(kit.modelKitStats(),stats,'animation allocates geometry or materials each frame');
// Inspect actual tool and inventory transforms through a settled action cycle.
// A believable bend alone is insufficient if the utensil misses the station
// or a carried plate has no palm beneath its physical underside.
let contactSamples=0;
for(const [pose,stationKind] of [['cook','grill'],['wash','sink'],['carry',undefined]]){
  const actor=kit.createCharacter(pose==='carry'?'waiter':'chef'),rig=actor.userData.rig;
  const plate=pose==='carry'?kit.createPlate():null;if(plate){plate.scale.setScalar(.75);rig.held.add(plate);}
  for(let sample=0;sample<120;sample++){
    kit.animateCharacter(actor,sample/30,pose,pose==='carry',false,{stationKind});actor.updateMatrixWorld(true);
    if(sample<8)continue;
    if(pose==='cook'){
      const tip=new THREE.Vector3(0,-.382,0).applyMatrix4(rig.props.cook.matrixWorld);
      assert(tip.z<-.80&&tip.z>-.90&&tip.y>1.00&&tip.y<1.17,'grill spatula cannot reach the cooking surface through its action cycle');
    }else if(pose==='wash'){
      const sponge=new THREE.Vector3(0,-.0755,-.035).applyMatrix4(rig.props.wash.matrixWorld),bounds=new THREE.Box3().setFromObject(rig.props.wash);
      assert(sponge.y>.92&&sponge.y<1.00&&sponge.z<-.65&&bounds.min.z<-.71,'wash sponge misses the sink work area');
    }else{
      const left=actor.getObjectByName('left-hand-grip'),right=actor.getObjectByName('right-hand');assert(left&&right,'carrying hands lack inspectable palm anchors');
      const palms=[left.getWorldPosition(new THREE.Vector3()),new THREE.Vector3(0,-.161,0).applyMatrix4(right.matrixWorld)];
      assert(palms[0].x<-.10&&palms[1].x>.10,'carried plate is not supported on both sides');
      for(const palm of palms){const hit=new THREE.Raycaster(palm,new THREE.Vector3(0,1,0)).intersectObject(plate,true)[0];assert(hit&&hit.distance>.015&&hit.distance<.09,'carried plate has no physical underside immediately above its palm');}
      assert.deepEqual(rig.held.position.toArray(),[0,.9,-.39],'carrying pose displaced simulated inventory');
    }
    contactSamples++;
  }
  kit.disposeObject(actor);
}
for(const id of ['classic_burger','fries']){const food=kit.createFoodModel({recipeId:id,kind:'dish'}),bounds=new THREE.Box3().setFromObject(food),size=bounds.getSize(new THREE.Vector3());assert(size.x<=.59&&size.z<=.59&&bounds.max.y<=.55,`${id}: hero food overflows its plate`);}
const single=kit.createModel('table_1');assert.equal(single.userData.unsupportedModel,undefined);const singleSize=new THREE.Box3().setFromObject(single).getSize(new THREE.Vector3());assert(singleSize.x<=.9&&singleSize.z<=.9,'single table escapes its one-tile footprint');
const tabletop=new THREE.Raycaster(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0)).intersectObject(single,true)[0];assert(tabletop&&Math.abs(tabletop.point.y-.8505)<.003,'the single table must support its centered serving plate');
console.log(`Diner acting PASS: ${frames} sampled pose frames; ${cheekRays} single-surface face probes; ${contactSamples} tool/palm contact samples; truthful props, stable item ownership, seated/floor contacts, independent blinks, fixed resource cache and one-seat table/hero plate bounds.`);
