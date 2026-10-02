/** Real shipped/native geometry, grip alignment and contact orientation. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createCombatToy } from "../src/app/bots/_view/combat-toy";
import { createWeaponContactSolver } from "../src/app/bots/_view/weapon-surface";
import { SHOWCASE } from "../src/lib/bots/showcase";
import { CARD_BY_ID } from "../src/lib/bots/fixtures";

const folder="public/bots-art/3d/pilot/", manifest=JSON.parse(readFileSync(folder+"manifest.json","utf8"));
const originalFetch=globalThis.fetch, originalLoad=GLTFLoader.prototype.loadAsync;
globalThis.fetch=async()=>new Response(JSON.stringify(manifest));
GLTFLoader.prototype.loadAsync=async function(url){const b=readFileSync(folder+url.split("/").pop());return this.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer,"");};
process.env.NEXT_PUBLIC_BOTS_TOY_PILOT="1";
const moves=["overhead","horizontal","backhand","diagonal-cut","rising-cut","low-cut"];
const armMask=["armL","elbowL","wristL","armR","elbowR","wristR"];
const solver=createWeaponContactSolver();
async function main(){
  let cases=0,maxError=0;
  for(const id of ["weapon.ironWrench","weapon.steelSaw","weapon.pistonHammer","weapon.anvilCleaver"]){
    const card=CARD_BY_ID[id];assert(card, id);
    for(const forceNative of [false,true]){
      const toy=await createCombatToy({...SHOWCASE.hammer,weapon:{id,s:[...card.s]}} ,{},forceNative);
      assert(toy.weaponFace,`${id}: actual working surface`);
      toy.root.updateMatrixWorld(true);
      const normal=toy.weaponFace!.clone().transformDirection(toy.bones.weapon.matrixWorld);
      assert(normal.z>.9,`${id}: edge/face points forward in the held rest pose`);
      const marker=toy.tip(new THREE.Vector3());
      const meshes:THREE.Mesh[]=[];
      toy.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.update();if(o instanceof THREE.Mesh&&o.userData.socket==="weapon")meshes.push(o);});
      const ray=new THREE.Raycaster(marker.clone().addScaledVector(normal,.12),normal.clone().negate(),0,.25);
      const hit=ray.intersectObjects(meshes,false)[0];
      assert(hit,`${id}: contact marker intersects real weapon mesh`);
      assert(Math.abs(hit.distance-.12)<.065,`${id}: marker lies on the working surface (${hit.distance-.12})`);
      for(const height of [.4,1.7,2.9])for(const scale of [.68,1])for(const yaw of [0,Math.PI/2,-Math.PI/2])for(const move of moves){
        toy.resetPose();toy.root.position.set(0,0,0);toy.root.rotation.set(0,yaw,0);
        toy.root.scale.setScalar(scale);
        toy.applyClip(move,.5,1,armMask);toy.root.updateMatrixWorld(true);
        const goal=new THREE.Vector3(.65,height,1.2).multiplyScalar(scale).applyAxisAngle(new THREE.Vector3(0,1,0),yaw);
        assert(solver(toy,goal,1));
        const error=toy.tip(new THREE.Vector3()).distanceTo(goal);maxError=Math.max(maxError,error);
        const face=toy.weaponFace!.clone().transformDirection(toy.bones.weapon.matrixWorld);
        const direction=goal.clone();direction.y=0;direction.normalize();
        assert(face.dot(direction)>.995,`${id}/${move}: working face leads toward opponent`);
        assert(error<.045,`${id}/${move}/${forceNative}/${scale}/height ${height}: contact error ${error}`);
        assert(toy.root.matrixWorld.elements.every(Number.isFinite));cases++;
      }
      toy.dispose();
    }
  }
  console.log(`PASS ${cases} face/edge contacts on actual native and GLB assemblies; maximum error ${maxError.toFixed(4)}.`);
  assert(maxError<.045,"all contacts reach their actual working surface");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{globalThis.fetch=originalFetch;GLTFLoader.prototype.loadAsync=originalLoad;});
