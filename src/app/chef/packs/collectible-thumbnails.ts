import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {hasDomainArtStudy} from '@/lib/chef/diner/domain-art-studies';
import {configureCollectibleRenderer,createCollectiblePresentation} from './collectible-presentation';

const thumbnails=new Map<string,Promise<string>>();
const queue:Array<{id:string;resolve:(url:string)=>void;reject:(reason:unknown)=>void}>=[];
let running=false;

/** One temporary renderer for the queue, then ordinary cached images in every card. */
async function renderQueue() {
 if(running)return;running=true;
 let renderer:THREE.WebGLRenderer|undefined;
 try {
  renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
  configureCollectibleRenderer(renderer);renderer.setPixelRatio(1);renderer.setSize(512,512,false);
  const loader=new GLTFLoader();
  while(queue.length){
   const job=queue.shift()!,presentation=createCollectiblePresentation();
   try {
    const gltf=await loader.loadAsync(`/api/chef/domain-review-assets/${job.id}.glb`);
    presentation.attach(gltf.scene);presentation.fit(512,512);
    renderer.render(presentation.scene,presentation.camera);
    // Capture in the same task as render; no preserveDrawingBuffer or live card canvases.
    const blob=await new Promise<Blob>((resolve,reject)=>renderer!.domElement.toBlob(value=>value?resolve(value):reject(new Error('Artwork capture failed')),'image/webp',.92));
    job.resolve(URL.createObjectURL(blob));
   } catch(error) {thumbnails.delete(job.id);job.reject(error);}
   finally {presentation.dispose();}
  }
 } catch(error) {
  queue.splice(0).forEach(job=>{thumbnails.delete(job.id);job.reject(error);});
 } finally {renderer?.dispose();renderer?.forceContextLoss();running=false;}
}

export function collectibleThumbnail(id:string):Promise<string> {
 if(!hasDomainArtStudy(id))return Promise.reject(new Error('Artwork unavailable'));
 const existing=thumbnails.get(id);if(existing)return existing;
 // Finite allowlisted artwork inventory; cached URLs live for this page session only.
 const promise=new Promise<string>((resolve,reject)=>queue.push({id,resolve,reject}));
 thumbnails.set(id,promise);void renderQueue();return promise;
}
