"use client";
import {useEffect,useRef,useState} from 'react';
import type {DinerSceneData,SceneAnchor} from './scene-types';

/** Brief, noninteractive equivalents of ready/burning sound cues. */
export function ServiceCues({scene,anchors}:{scene:DinerSceneData;anchors:SceneAnchor[]}){
 const signals=scene.objects.flatMap(o=>{const states=o.slots?.map(s=>s.state)??[o.state];return states.includes('burning')?[{id:o.id,label:'! Burning',urgent:true}]:states.includes('ready')?[{id:o.id,label:'✓ Ready',urgent:false}]:[];});
 const key=JSON.stringify(signals),previous=useRef('');
 const [shown,setShown]=useState<typeof signals>([]);
 useEffect(()=>{if(previous.current===key)return;const old=new Set<string>((JSON.parse(previous.current||'[]') as typeof signals).map(s=>`${s.id}:${s.label}`));previous.current=key;const fresh=signals.filter(s=>!old.has(`${s.id}:${s.label}`)).sort((a,b)=>Number(b.urgent)-Number(a.urgent)).slice(0,2);setShown(fresh);},[key]);
 useEffect(()=>{if(!shown.length)return;const timer=setTimeout(()=>setShown([]),3500);return()=>clearTimeout(timer);},[shown]);
 return <div aria-live="polite" style={{pointerEvents:'none'}}>{shown.map(cue=>{const a=anchors.find(a=>a.id===cue.id);return a?.visible?<span key={cue.id} style={{position:'absolute',left:`clamp(8px, ${a.x-42}px, calc(100% - 100px))`,top:Math.max(80,a.y-40),padding:'5px 9px',borderRadius:10,fontSize:'calc(12px * var(--dk-text-scale, 1))',fontWeight:700,color:cue.urgent?'#fff8ec':'#365f55',background:cue.urgent?'#a95035':'#fff8ec',border:'1px solid #d5b995',boxShadow:'0 2px 6px #0002'}}>{cue.label}</span>:null;})}</div>;
}
