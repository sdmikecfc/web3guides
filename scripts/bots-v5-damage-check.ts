/** Real toy GLBs plus recorded v5 commands; no browser, WebGL or network requests. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, basename } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createCombatToy, type CombatToy } from "@/app/bots/_view/combat-toy";
import { createCombatDamage, COMBAT_DAMAGE_VERTEX_BUDGET, type CombatDamageEvent } from "@/app/bots/_view/combat-damage";
import { acceptSpecialV5, cardV5, createFightV5, presetV5, replayV5, resultV5, RIFLE_MIN_RANGE_V5, snapshotBuildV5, stepFightV5, type BuildV5, type EventV5 } from "@/lib/bots/v5";
import type { Socket } from "@/lib/bots/fixtures";

const folder=resolve("public/bots-art/3d/pilot"), manifest=JSON.parse(readFileSync(resolve(folder,"manifest.json"),"utf8"));
const fetchBefore=globalThis.fetch,loadBefore=GLTFLoader.prototype.loadAsync,documentBefore=globalThis.document,pilotBefore=process.env.NEXT_PUBLIC_BOTS_TOY_PILOT;
const context=new Proxy({}, {get:()=>()=>undefined,set:()=>true});
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context})} as unknown as Document;
globalThis.fetch=async input=>{assert(String(input).endsWith("/manifest.json"),"unexpected asset/network request");return new Response(JSON.stringify(manifest));};
GLTFLoader.prototype.loadAsync=async function(url){const bytes=readFileSync(resolve(folder,basename(url)));return this.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,"");};
process.env.NEXT_PUBLIC_BOTS_TOY_PILOT="1";
const slots:Socket[]=["head","torso","armL","armR","legL","legR"];
const look={paint:Object.fromEntries(slots.map(s=>[s,0x619bb7])),face:"happy" as const};
function meshes(root:THREE.Object3D){const out:THREE.Mesh[]=[];root.traverse(o=>{if(o instanceof THREE.Mesh)out.push(o);});return out;}
function hash(g:THREE.BufferGeometry){const h=createHash("sha256");for(const key of Object.keys(g.attributes).sort()){const a=g.getAttribute(key).array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}if(g.index){const a=g.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}return h.digest("hex");}
function hashes(root:THREE.Object3D){return meshes(root).map(m=>hash(m.geometry));}
function visible(object:THREE.Object3D){for(let o:THREE.Object3D|null=object;o;o=o.parent)if(!o.visible)return false;return true;}
function points(root:THREE.Object3D){root.updateMatrixWorld(true);const v=new THREE.Vector3(),rows:string[]=[];for(const m of meshes(root)){if(m instanceof THREE.SkinnedMesh)m.skeleton.update();for(let i=0;i<m.geometry.getAttribute("position").count;i++){m.getVertexPosition(i,v).applyMatrix4(m.matrixWorld);rows.push(v.toArray().map(n=>Math.round(n*1000)).join(","));}}return rows.sort();}
function worldPoints(root:THREE.Object3D){root.updateMatrixWorld(true);const v=new THREE.Vector3(),rows:THREE.Vector3[]=[];for(const m of meshes(root)){if(m instanceof THREE.SkinnedMesh)m.skeleton.update();for(let i=0;i<m.geometry.getAttribute("position").count;i++)rows.push(m.getVertexPosition(i,v).applyMatrix4(m.matrixWorld).clone());}return rows;}
function containsPosedPoints(source:THREE.Object3D,target:THREE.Object3D){const epsilon=.00001,buckets=new Map<string,THREE.Vector3[]>(),cell=(n:number)=>Math.floor(n/epsilon);for(const p of worldPoints(target)){const key=[cell(p.x),cell(p.y),cell(p.z)].join(",");buckets.set(key,[...(buckets.get(key)??[]),p]);}return worldPoints(source).every(p=>{const [x,y,z]=[cell(p.x),cell(p.y),cell(p.z)];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)if(buckets.get([x+dx,y+dy,z+dz].join(","))?.some(q=>q.distanceToSquared(p)<=epsilon*epsilon))return true;return false;});}
function damageEvent(e:EventV5):CombatDamageEvent{return {frame:e.frame,slot:e.slot!,amount:e.damage!,point:e.point,normal:e.normal,kind:e.weapon==="rifle"||e.weapon==="smg"?"projectile":/blade/.test(e.weapon??"")?"blade":"blunt"};}
function pose(toy:CombatToy,frame:number,step:number){toy.resetPose();toy.root.position.set(Math.sin(frame*.004)*2,0,Math.cos(frame*.006));toy.root.rotation.y=frame*.005;toy.root.scale.setScalar(step===1?.62:.83);toy.bones.armL.rotation.z=Math.sin(frame*.01)*.7;toy.bones.armR.rotation.x=-.4-Math.sin(frame*.008)*.5;toy.bones.head.rotation.y=Math.sin(frame*.01)*.4;toy.root.updateMatrixWorld(true);}
function recorded(a:BuildV5,b:BuildV5,seed:number){const s=createFightV5(seed,a,b,{autoSpecial:[false,true]});let inputs=0;while(!s.done){if(s.fighters[0].meter>=100&&!s.fighters[0].special){const accepted=acceptSpecialV5(s,{id:`press-${s.frame}`,kind:"special",who:0,frame:s.frame});if(accepted.accepted)inputs++;}stepFightV5(s);}const r=resultV5(s);assert.equal(resultV5(replayV5(JSON.parse(JSON.stringify(r)))).hash,r.hash);return {r,inputs};}
function replayDents(toy:CombatToy,effect:ReturnType<typeof createCombatDamage>,events:EventV5[],last:number,step:number){let at=0,accepted=0;for(let frame=0;frame<=last+step;frame+=step){pose(toy,frame,step);while(at<events.length&&events[at].frame<=frame){const e=events[at++];if((e.kind==="hit"||e.kind==="block")&&e.slot&&(e.damage??0)>0){const hit=effect.hit(damageEvent(e));assert(hit&&hit.moved>0,`recorded ${e.weapon}/${e.slot} has no dent at${e.frame}`);assert(hit.point.toArray().every(Number.isFinite));accepted++;}}}assert.equal(at,events.length);return accepted;}
function disposeDebris(root:THREE.Object3D){for(const m of meshes(root))m.geometry.dispose();root.removeFromParent();}
function heldArmMeshes(toy:CombatToy,target:"armL"|"armR"){const wrist=toy.bones[target==="armL"?"wristL":"wristR"];return meshes(toy.root).filter(m=>!m.userData.styleReplaced&&visible(m)&&(m.userData.socket===target||(m.userData.socket==="weapon"&&(m.userData.styleAccessory?!!wrist.getObjectById(m.id):target==="armR"))));}
function frozenSource(source:THREE.Mesh[]){const result=new THREE.Group();for(const m of source){const g=m.geometry.clone(),p=g.getAttribute("position"),v=new THREE.Vector3();if(m instanceof THREE.SkinnedMesh)m.skeleton.update();for(let i=0;i<p.count;i++){m.getVertexPosition(i,v).applyMatrix4(m.matrixWorld);p.setXYZ(i,v.x,v.y,v.z);}result.add(new THREE.Mesh(g,m.material));}return result;}

async function main(){
  const paired=presetV5("speed",2).appearanceBuild,card=cardV5("mk5.t2.speed.paired-blades")!;paired.weapon={id:card.id,s:[...card.s]};
  const cases=[{name:"tier1 hammer",build:presetV5("tank",1),enemy:presetV5("speed",1),seed:75},{name:"paired blades",build:snapshotBuildV5(paired),enemy:presetV5("tank",2),seed:85},{name:"rifle and dual-pistol ending",build:presetV5("ranged",3),enemy:presetV5("tank",3),seed:77}];
  let impacts=0,manual=0,disposalResources=0;
  for(const item of cases){
    const {r,inputs}=recorded(item.build,item.enemy,item.seed);manual+=inputs;
    const hits=r.events.filter(e=>e.target===0&&(e.kind==="hit"||e.kind==="block")&&e.slot&&(e.damage??0)>0);assert(hits.length>4);
    const left=await createCombatToy(item.build.appearanceBuild,look),right=await createCombatToy(item.build.appearanceBuild,look);assert(left.styleEquipment&&right.styleEquipment);
    if(item.build.capabilities.weapon==='rifle'){left.resetPose();left.root.position.set(0,0,0);left.root.rotation.set(0,0,0);left.root.scale.setScalar(.62);left.styleEquipment.poseAim();left.root.updateMatrixWorld(true);const muzzle=left.styleEquipment.muzzles[1].getWorldPosition(new THREE.Vector3());const nearestOpponentFront=(RIFLE_MIN_RANGE_V5-item.enemy.stats.radius)*.88/1000;assert(muzzle.z<nearestOpponentFront,'aimed rifle barrel crosses the rival at its legal firing distance');console.log(`RIFLE CLEARANCE: folded muzzle z=${muzzle.z.toFixed(3)}m; rival front at minimum legal firing distance=${nearestOpponentFront.toFixed(3)}m.`);left.styleEquipment.setBurst(true);left.styleEquipment.poseAim();left.root.updateMatrixWorld(true);for(const point of left.styleEquipment.muzzles){const p=point.getWorldPosition(new THREE.Vector3());assert(p.z<item.build.stats.radius*.88/1000,'compact pistol crosses the rival at contact distance');}left.styleEquipment.setBurst(false);}
    // Damage proxies must start from the same bind pose; the clearance audit above is a separate posed measurement.
    left.resetPose();left.root.position.set(0,0,0);left.root.rotation.set(0,0,0);left.root.scale.setScalar(1);left.root.updateMatrixWorld(true);
    const original=meshes(left.root).map(mesh=>({mesh,geometry:mesh.geometry,material:mesh.material,hash:hash(mesh.geometry)})),untouched=meshes(right.root).map(mesh=>({mesh,geometry:mesh.geometry,hash:hash(mesh.geometry)}));
    const effect=createCombatDamage(left),owned=original.filter(v=>v.mesh.geometry!==v.geometry),pristine=hashes(left.root);
    const added=owned.reduce((n,v)=>n+v.mesh.geometry.getAttribute("position").count-v.geometry.getAttribute("position").count,0);assert(added>=0&&added<=COMBAT_DAMAGE_VERTEX_BUDGET);
    const count=replayDents(left,effect,hits,r.frames,1);impacts+=count;assert.equal(effect.dents,count);assert(effect.changedVertices>10);const damaged=hashes(left.root);assert.notDeepEqual(damaged,pristine);
    for(const row of untouched){assert.equal(row.mesh.geometry,row.geometry);assert.equal(hash(row.geometry),row.hash,"another robot changed before its replay");}
    for(const row of original.filter(v=>!owned.includes(v)))assert.equal(hash(row.geometry),row.hash,"weapon/hardware/source geometry deformed");
    const independent=createCombatDamage(right);replayDents(right,independent,hits,r.frames,7);assert.deepEqual(hashes(right.root),damaged,`${item.name}: cadence/root/bone posing changed recorded dents`);
    effect.reset();assert.deepEqual(hashes(left.root),pristine);replayDents(left,effect,hits,r.frames,4);assert.deepEqual(hashes(left.root),damaged,`${item.name}: replay did not reconstruct dents`);
    const target=item.name==="paired blades"?"armL":"armR";
    pose(left,r.frames,1);left.styleEquipment!.setBurst(false);left.setVisible(target,true);left.setVisible("weapon",true);left.root.updateMatrixWorld(true);
    const sourceArm=heldArmMeshes(left,target),beforeArm=frozenSource(sourceArm);
    const attached=left.freezePart(target),beforeDetached=hashes(attached);assert(meshes(attached).length>=sourceArm.length);
    // The renderer hides a lost arm before processing its break event. Its held weapon must still join the debris.
    left.setVisible(target,false);const hidden=left.freezePart(target);assert.deepEqual(points(hidden),points(attached),`${item.name}: hiding the lost arm removed its held weapon from detached debris`);
    assert(containsPosedPoints(beforeArm,attached),`${item.name}: detached arm lost its posed dents`);
    if(item.build.capabilities.weapon==="rifle"){
      left.setVisible(target,true);left.styleEquipment!.setBurst(true);left.styleEquipment!.poseAim();left.root.updateMatrixWorld(true);
      for(const arm of ["armL","armR"] as const){left.setVisible(arm,true);const activeSource=heldArmMeshes(left,arm);assert(activeSource.some(m=>m.userData.styleAccessory),"burst fixture has no active pistol");const expected=frozenSource(activeSource),burst=left.freezePart(arm);left.setVisible(arm,false);const hiddenBurst=left.freezePart(arm);assert.equal(meshes(burst).length,activeSource.length,"burst debris includes an inactive rifle or loses its machine pistol");assert.deepEqual(points(hiddenBurst),points(burst),"hidden burst arm lost its machine pistol");assert(containsPosedPoints(expected,burst),"burst arm does not preserve its posed geometry");disposeDebris(expected);disposeDebris(burst);disposeDebris(hiddenBurst);}
      left.styleEquipment!.setBurst(false);
    }
    effect.reset();assert.deepEqual(hashes(attached),beforeDetached,"reset changed already detached damage");
    const resources=owned.flatMap(v=>[v.mesh.geometry,...(Array.isArray(v.mesh.material)?v.mesh.material:[v.mesh.material])]);const counts=new Map<object,number>();for(const resource of resources){if(counts.has(resource))continue;counts.set(resource,0);resource.addEventListener("dispose",()=>counts.set(resource,counts.get(resource)!+1));}
    effect.dispose();effect.dispose();assert(Array.from(counts.values()).every(n=>n===1));disposalResources+=counts.size;
    for(const row of original){assert.equal(row.mesh.geometry,row.geometry);assert.equal(hash(row.geometry),row.hash);}
    disposeDebris(beforeArm);disposeDebris(attached);disposeDebris(hidden);independent.dispose();left.dispose();left.dispose();right.dispose();right.dispose();
    console.log(`PASS ${item.name}: ${hits.length} recorded dents, ${inputs} manual specials, ${added} added vertices, independent geometry/cadence/reset/detachment/disposal`);
  }
  assert(manual>0,"fixtures never accepted a manual special");
  console.log(`PASS v5 actual-model damage: ${cases.length} builds, ${impacts} recorded impacts, ${manual} manual commands, ${disposalResources} owned damage resources disposed once. Headless geometry checks, not rendering FPS.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{globalThis.fetch=fetchBefore;GLTFLoader.prototype.loadAsync=loadBefore;globalThis.document=documentBefore;if(pilotBefore===undefined)delete process.env.NEXT_PUBLIC_BOTS_TOY_PILOT;else process.env.NEXT_PUBLIC_BOTS_TOY_PILOT=pilotBefore;});
