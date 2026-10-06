'use client';
import {useState} from 'react';
import {COSMETICS,ROOM_PALETTES,ROOM_FINISH_DEFAULTS,finishPrice,type RoomFinishSlot,type FinishSlot} from '@/lib/chef/diner/collections';
import {quoteRoomPurchases,type RoomDesign} from '@/lib/chef/diner/room-building-draft';
import type {DinerState} from '@/lib/chef/diner/progression';
import type {ConstructionTool} from '@/lib/chef/diner/room-construction';
import {FINISH_PREVIEWS} from './FinishPreview';
import styles from './free-room-editor.module.css';

const labels={floor:'Floor',wall:'Walls',counter:'Counter fronts',worktop:'Worktops',upholstery:'Seats',sign:'Sign'};
export function EditorFinishes({state,draft,onDraft,selected,onTool,onFloorFinish}:{state:DinerState;draft:RoomDesign;onDraft:(d:RoomDesign)=>void;selected:string|null;onTool:(t:ConstructionTool)=>void;onFloorFinish:(id:string)=>void}){
 const [slot,setSlot]=useState<FinishSlot|RoomFinishSlot>('floor');
 const surface=slot==='floor'||slot==='wall',owned=quoteRoomPurchases(state,draft).owned;
 const current=surface?draft.surfaces?.[slot]??state.cosmetics[slot]:draft.finishes?.[slot]??state.home.finishes?.[slot]??ROOM_FINISH_DEFAULTS[slot];
 const choices=surface?(slot==='floor'?COSMETICS.floors:COSMETICS.walls).map(id=>({id,name:FINISH_PREVIEWS[id].label,color:FINISH_PREVIEWS[id].background,price:finishPrice(slot,id)??0,owned:state.finishOwned[slot].includes(id)})):ROOM_PALETTES[slot].map(f=>({...f,owned:state.paletteOwned?.[slot]?.includes(f.id)}));
 const preview=(id:string)=>{
  const next=structuredClone(draft);
  if(slot==='floor'||slot==='wall'){
   next.surfaces={...next.surfaces,[slot]:id};
   if(slot==='floor')next.roomPlan.surfaces=next.roomPlan.surfaces?.map(s=>s.kind==='indoor'?{...s,finish:id}:s);
   else next.roomPlan.edges=next.roomPlan.edges.map(e=>({...e,finish:id}));
  }else next.finishes={...next.finishes,[slot]:id};
  onTool('select');onDraft(next);
 };
 const edge=draft.roomPlan.edges.find(e=>`edge:${e.id}`===selected);
 return <>
  <label className={styles.field}>Change<select value={slot} onChange={e=>{setSlot(e.target.value as typeof slot);onTool('select');}}>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
  <div className={styles.swatches}>{choices.map(f=><button key={f.id} aria-pressed={current===f.id} onClick={()=>preview(f.id)}><span className={styles.swatch} style={{background:f.color}}/><span>{f.name}<small>{f.owned?'Owned':`${f.price} coins`}</small></span></button>)}</div>
  {surface&&<details><summary>{slot==='floor'?'Paint a floor area':'Finish one selected wall'}</summary>
   <label className={styles.field}>Owned colour<select aria-label="Area finish" value={slot==='floor'?current:edge?.finish??current} onChange={e=>{
    if(slot==='floor'){onFloorFinish(e.target.value);onTool('indoor');}
    else if(edge)onDraft({...draft,roomPlan:{...draft.roomPlan,edges:draft.roomPlan.edges.map(w=>w.id===edge.id?{...w,finish:e.target.value}:w)}});
   }}>{owned.finishOwned[slot].map(id=><option key={id} value={id}>{FINISH_PREVIEWS[id].label}</option>)}</select></label>
   {slot==='floor'?<div className={styles.tools}><button onClick={()=>{onFloorFinish(current);onTool('indoor');}}>Paint floor</button><button onClick={()=>onTool('patio')}>Patio paving</button><button onClick={()=>onTool('garden')}>Planted area</button></div>:!edge&&<p>Select a wall in the room first.</p>}
  </details>}
 </>;
}
