import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {DOMAIN_COLLECTIBLE_BY_ID} from '@/lib/chef/diner/domain-worlds';
import {hasDomainArtStudy} from '@/lib/chef/diner/domain-art-studies';
import {DOMAIN_ROOM_ASSET_IDS} from '@/lib/chef/diner/domain-room-studies';
import {DOMAIN_KIT_ASSETS} from '@/lib/chef/diner/domain-room-kit-defs';
const sources=new Map<string,Promise<THREE.Group>>();
/** Only the private benchmark loads provisional art. Production never requests a D: asset. */
export function loadDomainStudy(id:string){
  if(process.env.NODE_ENV!=='development'||(!hasDomainArtStudy(id)&&!DOMAIN_ROOM_ASSET_IDS.has(id)&&!DOMAIN_KIT_ASSETS.has(id)))return Promise.reject(new Error('Study unavailable'));
  const prior=sources.get(id);if(prior)return prior;
  const task=new GLTFLoader().loadAsync(`/api/chef/domain-review-assets/${id}.glb`).then(({scene})=>{
    scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;o.geometry.userData.sharedKitResource=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.userData.sharedKitResource=true;if(m.transparent){m.depthWrite=false;o.castShadow=false;}}}});return scene;
  });sources.set(id,task);void task.catch(()=>sources.delete(id));return task;
}
export function createDomainStudy(id:string):THREE.Group|null{
  if(process.env.NODE_ENV!=='development'||(!hasDomainArtStudy(id)&&!DOMAIN_ROOM_ASSET_IDS.has(id)&&!DOMAIN_KIT_ASSETS.has(id)))return null;
  const root=new THREE.Group();root.name=id;root.userData.collectible=true;root.userData.surfaceHeight=.90;
  // Align the retained, simulation-controlled basket and food to this cauldron.
  if(id==='domain_gochujang_volcano_boiler')root.userData.operatingBasketOffset=-.16;
  root.userData.ready=loadDomainStudy(id).then(source=>{if(root.userData.disposed)return;const model=source.clone(true);if(!DOMAIN_ROOM_ASSET_IDS.has(id)&&!DOMAIN_KIT_ASSETS.has(id))model.rotation.y=Math.PI;root.add(model);root.userData.loaded=true;root.dispatchEvent({type:'assetready'} as never);});
  void root.userData.ready.catch(()=>{root.userData.assetError=true;});return root;
}
