'use client';
import {useMemo,useState} from 'react';
import {buildServiceLoadout} from '@/lib/chef/diner/geometry';
import {createService,dispatchService} from '@/lib/chef/diner/service';
import {ROUTE_DEFINITIONS,type RouteEnvironment} from '@/lib/chef/diner/routes';
import type {DinerTier} from '@/lib/chef/diner/types';
import {serviceScene} from '../diner-preview/scene-adapter';
import DinerScene from '../diner-preview/DinerScene';
import type {RenderQuality} from '../diner-preview/presentation';
import type {DinerPerformance} from '../diner-preview/scene-types';
export default function DestinationReview(){
 const [environment,setEnvironment]=useState<RouteEnvironment>('boardwalk'),[tier,setTier]=useState<DinerTier>(1),[quality,setQuality]=useState<RenderQuality>('high'),[rotation,setRotation]=useState(0),[size,setSize]=useState('1280x720'),[notice,setNotice]=useState(''),[stats,setStats]=useState<DinerPerformance|null>(null);
 const scene=useMemo(()=>{let s=createService({...buildServiceLoadout(tier,['classic_burger']),tier,seed:'scenery-fixture',menu:['classic_burger'],practice:true,lessonVersion:0,customers:4,customerTypes:[environment==='festival'?'party':environment==='business'?'business':'walk_in'],environment});s=dispatchService(s,{type:'open'});for(let i=0;i<8;i++)s=dispatchService(s,{type:'tick',ticks:100});return {...serviceScene(s),quality};},[environment,tier,quality]);
 const dimensions=size.split('x').map(Number);
 const capture=()=>requestAnimationFrame(()=>document.querySelector('canvas')?.toBlob(blob=>{if(blob)void fetch(`/api/chef/review-capture?name=destination_${environment}_${size}_t${tier}_r${rotation}_${quality}.png`,{method:'POST',body:blob}).then(r=>setNotice(r.ok?'Scene capture saved on D:':'Capture failed'));}));
 return <main style={{minHeight:'100dvh',background:'#f4e9dd'}}><header style={{position:'relative',zIndex:20,padding:14,display:'flex',gap:12,flexWrap:'wrap',background:'#fff7e8ee',color:'#31594e'}}><strong>Living destinations · isolated review</strong><label>Route <select value={environment} onChange={e=>setEnvironment(e.target.value as RouteEnvironment)}>{ROUTE_DEFINITIONS.map(r=><option key={r.id} value={r.environment}>{r.name}</option>)}</select></label><label>Truck <select value={tier} onChange={e=>setTier(Number(e.target.value) as DinerTier)}>{[1,2,3,4].map(t=><option key={t} value={t}>Tier {t}</option>)}</select></label><label>Quality <select value={quality} onChange={e=>setQuality(e.target.value as RenderQuality)}>{['low','medium','high'].map(q=><option key={q}>{q}</option>)}</select></label><label>Frame <select value={size} onChange={e=>setSize(e.target.value)}>{['1280x720','390x844','360x640','844x390'].map(s=><option key={s}>{s}</option>)}</select></label><button onClick={()=>setRotation(r=>(r+1)%4)}>Rotate view</button><button onClick={capture}>Save scene capture</button><output>{stats?`${stats.fps.toFixed(0)} FPS · ${stats.drawCalls} draws · ${Math.round(stats.triangles).toLocaleString()} triangles`:''}</output><small>{notice}</small></header><div style={{position:'relative',width:dimensions[0],height:dimensions[1]}}><DinerScene mode="truck" scene={scene} rotation={rotation} onRotate={setRotation} onTarget={()=>{}} onTile={()=>{}} onPerformance={setStats}/></div></main>;
}
