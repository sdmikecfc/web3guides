'use client';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {animateCollection} from '../diner-preview/collection-assets';
import {DOMAIN_COLLECTIBLE_BY_ID} from '@/lib/chef/diner/domain-worlds';
import css from './pack-experience.module.css';
import {configureCollectibleRenderer,createCollectiblePresentation,disposeCollectible} from './collectible-presentation';

/** One selected model, one disposable renderer. No simulated rewards or account state. */
export default function CollectibleStage({id,reduced=false,turn=0,onReady}:{id:string;reduced?:boolean;turn?:number;onReady?:(ready:boolean)=>void}){
 const host=useRef<HTMLDivElement>(null),latest=useRef({reduced,turn,onReady}),[status,setStatus]=useState('loading'),[retry,setRetry]=useState(0);latest.current={reduced,turn,onReady};
 useEffect(()=>{
  if(!host.current)return;let disposed=false,frame=0,model:THREE.Group|null=null,time=0,prior=0;setStatus('loading');latest.current.onReady?.(false);
  let renderer:THREE.WebGLRenderer;try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});}catch{setStatus('error');return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));configureCollectibleRenderer(renderer);
  renderer.domElement.setAttribute('aria-label',DOMAIN_COLLECTIBLE_BY_ID[id]?.name??'Collectible');renderer.domElement.setAttribute('role','img');host.current.appendChild(renderer.domElement);
  const presentation=createCollectiblePresentation(),{scene,camera,rig}=presentation;
  let lastTurn=0;const fit=()=>{if(!host.current)return;const w=host.current.clientWidth,h=host.current.clientHeight;if(!w||!h)return;renderer.setSize(w,h);presentation.fit(w,h);};
  const observer=new ResizeObserver(fit);observer.observe(host.current);fit();
  new GLTFLoader().loadAsync(`/api/chef/domain-review-assets/${id}.glb`).then(gltf=>{if(disposed){disposeCollectible(gltf.scene);return;}model=gltf.scene;presentation.attach(model);fit();setStatus('ready');latest.current.onReady?.(true);}).catch(()=>{if(!disposed)setStatus('error');});
  const render=(now:number)=>{frame=requestAnimationFrame(render);if(document.hidden){prior=now;return;}const delta=prior?Math.min((now-prior)/1000,.05):0;prior=now;time+=delta;rig.rotation.y=latest.current.turn*Math.PI/2;if(lastTurn!==latest.current.turn){lastTurn=latest.current.turn;fit();}if(model)animateCollection(model,time,false,latest.current.reduced);renderer.render(scene,camera);};frame=requestAnimationFrame(render);
  const lost=(event:Event)=>{event.preventDefault();setStatus('error');latest.current.onReady?.(false);};renderer.domElement.addEventListener('webglcontextlost',lost);
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();renderer.domElement.removeEventListener('webglcontextlost',lost);presentation.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
 },[id,retry]);
 return <div className={css.modelStage} ref={host} data-model-status={status}>{status==='loading'&&<span className={css.modelStatus} role="status">Unpacking the artwork…</span>}{status==='error'&&<div className={css.modelStatus}><p>The 3D view couldn’t load. Your preview result is still here.</p><button onClick={()=>setRetry(n=>n+1)}>Retry artwork</button></div>}</div>;
}
