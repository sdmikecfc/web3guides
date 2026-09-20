'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { createDiner,homeSimulationConfig } from '@/lib/chef/diner/progression';
import { createRestaurantBlueprint,type RestaurantStage } from '@/lib/chef/diner/room-plan';
import { createHomeWorld,stepHomeWorld } from '@/lib/chef/diner/home-simulation';
import DinerScene from '../diner-preview/DinerScene';
import { homeScene } from '../diner-preview/home-scene';

/** Development-only live simulation. No wallet, save, rewards, or authority writes. */
export default function RoomReview(){
 const [stage,setStage]=useState<RestaurantStage>('burger_shop'),[rotation,setRotation]=useState(0),[editing,setEditing]=useState(false),[selected,setSelected]=useState<string|null>(null),[frame,setFrame]=useState(0),[speed,setSpeed]=useState(1),[fps,setFps]=useState(0);
 const state=useMemo(()=>{const s=createDiner(1_800_000_000_000,'room-review'),blueprint=createRestaurantBlueprint(stage);s.home={...s.home,...blueprint.roomPlan,roomPlan:blueprint.roomPlan,layout:blueprint.layout,staff:blueprint.staff,name:stage==='burger_shop'?'Bun & Butter':stage==='diner'?'The Cherry Counter':'Sunday Supper'};s.home.menu.main=['classic_burger'];return s;},[stage]);
 const world=useMemo(()=>createHomeWorld({...homeSimulationConfig(state),arrivalRate:90}),[state]);
 const current=useRef(world);current.current=world;
 useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible'){stepHomeWorld(current.current,speed);setFrame(v=>v+1);}},50);return()=>clearInterval(timer);},[speed]);
 const scene=homeScene(state,world,selected,'#bd654e');void frame;
 const button:React.CSSProperties={border:'1px solid #cbbca6',borderRadius:12,padding:'10px 12px',background:'#fffaf0',color:'#643e30',font:'inherit',minHeight:44};
 return <main style={{position:'fixed',inset:0,background:'#f6eee3',fontFamily:'var(--font-dk),system-ui,sans-serif'}}>
  <DinerScene mode="home" scene={scene} rotation={rotation} editing={editing} onTarget={setSelected} onTile={()=>{}} showWorldHints={false} onPerformance={p=>setFps(p.fps)}/>
  <header style={{position:'absolute',top:12,left:12,right:12,display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',pointerEvents:'none'}}><strong style={{fontSize:18,color:'#783e2b'}}>Room art review</strong><span style={{fontSize:12,color:'#725f4c'}}>Live service · {fps} FPS</span><select aria-label="Room stage" value={stage} onChange={e=>{setStage(e.target.value as RestaurantStage);setSelected(null);}} style={{...button,pointerEvents:'auto'}}><option value="burger_shop">Burger shop · 10 × 8</option><option value="diner">Diner · 12 × 10</option><option value="restaurant">Restaurant · 14 × 12</option></select></header>
  <footer style={{position:'absolute',bottom:18,left:12,right:12,display:'flex',gap:8,justifyContent:'center',alignItems:'center',flexWrap:'wrap'}}><button style={button} onClick={()=>setRotation(v=>(v+3)%4)}>Turn left</button><button style={button} onClick={()=>setRotation(v=>(v+1)%4)}>Turn right</button><button style={button} onClick={()=>setEditing(v=>!v)}>{editing?'Hide grid':'Show grid'}</button><button style={button} onClick={()=>setSpeed(v=>v===1?4:1)}>{speed}× service</button><output style={{fontSize:12,color:'#725f4c',width:'100%',textAlign:'center'}}>{selected??'Pan or zoom to inspect actual geometry.'} · {world.metrics.plates} served · {world.metrics.ordersTaken} orders taken</output></footer>
 </main>;
}
