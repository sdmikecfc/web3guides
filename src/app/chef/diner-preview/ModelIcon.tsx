"use client";
import { useEffect, useState } from "react";
import { DinerIcon } from "./DinerIcon";
import css from "./model-icon.module.css";
import type { SceneFood } from './scene-types';

const images=new Map<string,string>();
export interface ModelIconProps {kind:string;recipeId?:string;label:string;size?:number;foodKind?:SceneFood['kind'];look?:number;stage?:string;cold?:boolean;tier?:number;color?:string;mastery?:number}
const iconKey=({kind,recipeId,foodKind='dish',look=0,stage,cold=false,tier=1,color,mastery=0}:ModelIconProps)=>JSON.stringify([kind,recipeId,foodKind,look,stage,cold,tier,color,mastery>=10?10:mastery>=3?3:0]);
let studio:Promise<Awaited<ReturnType<typeof makeStudio>>>|null=null;
const pendingIcons:{priority:number;run:()=>Promise<void>}[]=[];
let drawingIcons=false;
function enqueueIcon(priority:number,run:()=>Promise<void>){
  pendingIcons.push({priority,run});
  if(drawingIcons)return;drawingIcons=true;
  void (async()=>{
    try{
      while(pendingIcons.length){
        // Give React and the browser a paint between synchronous GPU readbacks.
        // Large selected dishes should appear before the small discovery rail.
        await new Promise<void>(resolve=>typeof requestAnimationFrame==='function'?requestAnimationFrame(()=>resolve()):resolve());
        pendingIcons.sort((a,b)=>b.priority-a.priority);
        await pendingIcons.shift()!.run();
      }
    }finally{drawingIcons=false;}
  })();
}
function cachedPreview(props:ModelIconProps){
  const exact=images.get(iconKey(props));if(exact)return exact;
  // Keep this same dish visible while its new signature/house plating renders.
  // Never substitute another recipe, preparation state, or future mastery tier.
  if(props.kind==='food')for(const mastery of [3,0])if((props.mastery??0)>mastery){
    const image=images.get(iconKey({...props,mastery}));if(image)return image;
  }
  return undefined;
}
const retryIcons=new Set<()=>void>();
function retryMissingIcons(){for(const retry of retryIcons)retry();}
function getStudio(){
  if(studio)return studio;
  const pending=makeStudio();studio=pending;
  void pending.then(retryMissingIcons,()=>{if(studio===pending)studio=null;});
  return pending;
}
async function makeStudio(){
  const [THREE,models]=await Promise.all([import('three'),import('./models')]);
  const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  renderer.setSize(320,320);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight('#fff9ec','#a0b3a0',1.05));
  const light=new THREE.DirectionalLight('#ffffff',1.4);light.position.set(-3,6,5);scene.add(light);
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);
  renderer.domElement.addEventListener('webglcontextrestored',retryMissingIcons);
  return {THREE,models,renderer,scene,camera};
}
function requireContext(renderer:Awaited<ReturnType<typeof makeStudio>>['renderer']){
  if(renderer.getContext().isContextLost())throw new Error('Thumbnail graphics context is temporarily unavailable.');
}
async function renderIcon(props:ModelIconProps):Promise<string>{
  const {kind,recipeId,foodKind='dish',look=0,stage,cold,tier,color,mastery}=props,key=iconKey(props),cached=images.get(key);if(cached)return cached;
  const s=await getStudio();requireContext(s.renderer);
  const model=kind==='food'?s.models.createFoodModel({recipeId:recipeId??'classic_burger',kind:foodKind,stage,cold,mastery}):s.models.createModel(kind,{recipeId,look,tier,color});
  model.rotation.y=Math.PI;
  s.scene.add(model);
  try{
    const box=new s.THREE.Box3().setFromObject(model),center=box.getCenter(new s.THREE.Vector3());
    s.camera.position.set(center.x+4,center.y+(kind==='food'?5.5:3.5),center.z+5);s.camera.lookAt(center);s.camera.updateMatrixWorld(true);
    // Fit the whole projected object, including tall backs and wide handles.
    // The old largest-axis estimate wasted space on food and could crop furniture.
    let extent=.12;
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const p=new s.THREE.Vector3(x,y,z).applyMatrix4(s.camera.matrixWorldInverse);extent=Math.max(extent,Math.abs(p.x),Math.abs(p.y));
    }
    extent*=1.13;s.camera.left=-extent;s.camera.right=extent;s.camera.top=extent;s.camera.bottom=-extent;s.camera.updateProjectionMatrix();
    requireContext(s.renderer);s.renderer.render(s.scene,s.camera);requireContext(s.renderer);
    const image=s.renderer.domElement.toDataURL('image/png');requireContext(s.renderer);
    images.set(key,image);return image;
  }finally{s.scene.remove(model);s.models.disposeObject(model);}
}
export function ModelIcon(props:ModelIconProps){
  const {kind,label,size=112}=props,key=iconKey(props);
  const [loaded,setLoaded]=useState({key,src:images.get(key)});
  const src=(loaded.key===key?loaded.src:undefined)??cachedPreview(props);
  useEffect(()=>{let live=true,queued=false;
    const request=()=>{
      if(!live)return;const cached=images.get(key);if(cached){setLoaded({key,src:cached});return;}
      if(queued)return;queued=true;
      enqueueIcon(size,async()=>{try{if(!live)return;const image=await renderIcon(props);if(live)setLoaded({key,src:image});}catch{/* Keep the accessible fallback until a graphics recovery event. */}finally{queued=false;}});
    };
    retryIcons.add(request);request();
    return()=>{live=false;retryIcons.delete(request);};
  },[key]);
  return src?<img className={css.image} src={src} alt={label} width={size} height={size} draggable={false} decoding="async" data-model-icon="ready" style={{width:size}}/>:<span className={css.fallback} role={label?'img':undefined} aria-label={label||undefined} aria-hidden={label?undefined:true} data-model-icon="fallback" style={{width:size}}><DinerIcon name={kind==='food'?'plate':'store'} size={Math.min(64,size*.46)}/></span>;
}
