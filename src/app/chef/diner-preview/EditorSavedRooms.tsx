'use client';
import {useState} from 'react';
import {quoteRoomPurchases,type RoomDesign} from '@/lib/chef/diner/room-building-draft';
import {migrateRoomPlan} from '@/lib/chef/diner/room-plan-v2';
import type {DinerState} from '@/lib/chef/diner/progression';
import styles from './free-room-editor.module.css';

export function EditorSavedRooms({state,draft,onDraft,onSave,error}:{state:DinerState;draft:RoomDesign;onDraft:(d:RoomDesign)=>void;onSave:(name:string,id?:string)=>boolean;error:string|null}){
 const [name,setName]=useState('My room'),[slot,setSlot]=useState(''),[notice,setNotice]=useState('');
 const pending=quoteRoomPurchases(state,draft).cost>0||Object.keys(draft.purchases??{}).length>0;
 return <>
  <div className={styles.goods}>{state.savedLayouts.map(saved=>{
   const plan=saved.room?.roomPlan,compatible=!!plan&&plan.stage===draft.roomPlan.stage&&plan.w===draft.roomPlan.w&&plan.h===draft.roomPlan.h;
   return <button key={saved.id} disabled={!compatible} onClick={()=>{if(!plan)return;onDraft({roomPlan:migrateRoomPlan(plan,saved.layout),layout:structuredClone(saved.layout),finishes:saved.finishes,surfaces:saved.surfaces});setNotice(`Previewing ${saved.name}. Apply to keep it.`);}}><span aria-hidden="true" className={styles.roomGlyph}>⌂</span><span>{saved.name}<small>{compatible?'Preview this room':'For a different restaurant size'}</small></span></button>;
  })}</div>
  {!state.savedLayouts.length&&<p className={styles.note}>Keep up to three named arrangements here.</p>}
  <label className={styles.field}>Save this design<input maxLength={24} value={name} onChange={e=>setName(e.target.value)} aria-label="Design name"/></label>
  <label className={styles.field}>Save to<select value={slot} onChange={e=>setSlot(e.target.value)}><option value="" disabled={state.savedLayouts.length>=3}>New saved room</option>{state.savedLayouts.map(s=><option value={s.id} key={s.id}>Replace {s.name}</option>)}</select></label>
  <button disabled={pending||!!error||!name.trim()||!slot&&state.savedLayouts.length>=3} onClick={()=>{if(onSave(name,slot||undefined))setNotice('Design saved. Your operating restaurant is unchanged.');}}>Save design</button>
  {pending&&<p className={styles.note}>Apply purchases before saving a named room. Tools → Save unfinished draft keeps an unpurchased preview.</p>}
  {notice&&<p role="status">{notice}</p>}
 </>;
}
