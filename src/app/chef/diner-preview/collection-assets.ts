import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {COLLECTIBLE_BY_ID} from '@/lib/chef/diner/collectible-packs';
import {createDomainStudy} from './domain-assets';
const prototypes=new Map<string,Promise<THREE.Group>>();
const loader=new GLTFLoader();
export function collectionAssetFolder(shape:string){const revised=['phoenix_fryer','after_hours_diner','world_on_plate'];return shape==='cosmic_carousel'||revised.includes(shape.replace(/_low$/,''))?shape+'-2.0.1':shape;}
/** Only immutable GPU resources are shared; every placed object owns its motion pivots. */
function prototype(shape:string){
 let task=prototypes.get(shape);if(task)return task;
 task=loader.loadAsync(`/chef/collectibles-v2/${collectionAssetFolder(shape)}/model.glb`).then(gltf=>{
  gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;o.geometry.userData.sharedKitResource=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.userData.sharedKitResource=true;const map=(m as THREE.MeshStandardMaterial).map;if(map)map.userData.sharedKitResource=true;}}});return gltf.scene;
 });prototypes.set(shape,task);void task.catch(()=>{if(prototypes.get(shape)===task)prototypes.delete(shape);});return task;
}
export function createCollectionAsset(id:string,low=false):THREE.Group|null{
 const study=createDomainStudy(id);if(study)return study;
 const item=COLLECTIBLE_BY_ID[id];if(item?.version!==2)return null;
 const root=new THREE.Group();root.name=id;root.userData.collectible=true;root.userData.surfaceHeight=.95;
 root.userData.ready=prototype(item.shape+(low?'_low':'')).then(source=>{
  if(root.userData.disposed)return;const model=source.clone(true);model.rotation.y=Math.PI;
  // Catalogue sources are modelled from floor zero. Wall/ceiling mounting uses
  // the same shared datum as the existing placement engine.
  if(item.mount==='wall'){model.position.y=1.49;root.userData.wallMountPlane=.49;model.position.z=.42;}
  if(item.mount==='ceiling')model.position.y=2.7;
  root.add(model);root.userData.loaded=true;
  root.dispatchEvent({type:'assetready'} as never);
 });void root.userData.ready.catch(()=>{root.userData.assetError=true;});return root;
}
/** Preload authored capture subjects so a reveal never records the fallback. */
export async function preloadCollectionAssets(ids:string[]){await Promise.all(ids.map(id=>{const item=COLLECTIBLE_BY_ID[id];return item?.version===2?prototype(item.shape):Promise.resolve();}));}
/** Constant-distance motion on two straights joined by semicircular rails. */
export function collectionTrackPose(distance:number,straight:number,radius:number){
 let s=((distance%(4*straight+2*Math.PI*radius))+(4*straight+2*Math.PI*radius))%(4*straight+2*Math.PI*radius);
 if(s<2*straight)return {x:-straight+s,z:radius,yaw:Math.PI/2};
 s-=2*straight;
 if(s<Math.PI*radius){const angle=Math.PI/2-s/radius;return {x:straight+Math.cos(angle)*radius,z:Math.sin(angle)*radius,yaw:Math.PI-angle};}
 s-=Math.PI*radius;
 if(s<2*straight)return {x:straight-s,z:-radius,yaw:-Math.PI/2};
 s-=2*straight;const angle=-Math.PI/2-s/radius;return {x:-straight+Math.cos(angle)*radius,z:Math.sin(angle)*radius,yaw:Math.PI-angle};
}
export function animateCollection(root:THREE.Group,time:number,working=false,reduced=false){
 root.traverse(o=>{const u=o.userData;if(!u.dkMotion)return;
  u.restPosition??=o.position.clone();u.restRotation??=o.rotation.clone();u.restScale??=o.scale.clone();
  o.position.copy(u.restPosition);o.rotation.copy(u.restRotation);o.scale.copy(u.restScale);
  o.visible=!u.dkWorkOnly||working;
  if(reduced||u.dkWorkOnly&&!working||u.dkAnimateOnlyWorking&&!working)return;
  const axis=u.dkAxis==='Z'?'y':u.dkAxis==='Y'?'z':'x',wave=Math.sin(time*(u.dkSpeed??1)),amount=u.dkAmount??.1;
  if(u.dkMotion==='track'){const pose=collectionTrackPose(time*u.dkTrackSpeed+u.dkTrackOffset,u.dkTrackStraight,u.dkTrackRadius);o.position.x=pose.x;o.position.z=pose.z;o.rotation.y=pose.yaw;}
  else if(u.dkMotion==='orbit'){const phase=time*(u.dkSpeed??1)+(u.dkPhase??0);o.position.x=Math.cos(phase)*u.dkRadiusX;o.position.z=-Math.sin(phase)*u.dkRadiusZ;if(u.dkFaceOrbit)o.rotation.y=Math.atan2(-Math.sin(phase)*u.dkRadiusX,Math.cos(phase)*u.dkRadiusZ);}
  else if(u.dkMotion==='spin')o.rotation[axis]+=time*(u.dkSpeed??1);
  else if(u.dkMotion==='slide')o.position[axis]+=(1-Math.cos(time*(u.dkSpeed??1)))*.5*amount*(u.dkAxis==='Y'?-1:1);
  else if(u.dkMotion==='float')o.position.y+=wave*amount;
  else if(u.dkMotion==='pulse')o.scale.multiplyScalar(1+wave*amount);
  else o.rotation[axis]+=wave*amount;
 });
}
