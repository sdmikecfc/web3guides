"use client";
import {useState} from 'react';
import type {DinerState,DinerCommand} from '@/lib/chef/diner/progression';
import {SERVER_PRIORITIES,SIGNATURE_STYLES,type SignatureDish} from '@/lib/chef/diner/personal-touches';
import type {DinerStaff} from '@/lib/chef/diner/collections';
import {RECIPE_BY_ID} from '@/lib/chef/diner/content';
import {recipeVessel} from '@/lib/chef/diner/batch';
import {ModelIcon} from './ModelIcon';
import css from './diner.module.css';
const uniforms={classic:'#2f6658',cherry:'#b96050',mint:'#91b29a'};
type Send=(command:DinerCommand)=>boolean;
function CrewCard({person,send,expanded}:{person:DinerStaff;send:Send;expanded:boolean}){
 const [name,setName]=useState(person.name),[outfit,setOutfit]=useState(person.outfit),[priority,setPriority]=useState(person.priority??'balanced');
 return <details open={expanded||undefined} className={css.card}><summary className={css.row}><ModelIcon kind={person.role} look={person.look} color={uniforms[outfit as keyof typeof uniforms]} size={64} label={person.name}/><span><strong>{person.name}</strong><br/>{person.role==='waiter'?'Server':person.role==='cashier'?'Cashier':'Cook'}</span></summary><div className={css.cardBody}>
  <label>Name<input className={css.input} maxLength={24} value={name} onChange={e=>setName(e.target.value)}/></label>
  <label>Uniform<select className={css.input} value={outfit} onChange={e=>setOutfit(e.target.value)}>{Object.keys(uniforms).map(id=><option key={id} value={id}>{id==='classic'?'Classic green':id==='cherry'?'Cherry':'Mint'}</option>)}</select></label>
  {person.role==='waiter'&&<><label>Restaurant priority<select className={css.input} value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}><option value="balanced">Balanced</option><option value="serve">Serve first</option><option value="clear">Clear first</option></select></label><p className={css.small}>{SERVER_PRIORITIES[priority]} Urgent jobs always come first.</p></>}
  <button className={css.button} disabled={!name.trim()} onClick={()=>send({type:'setCrew',staffId:person.id,name,outfit,priority})}>Save · free</button><p className={css.small}>Finishes the current task before changing priorities.</p>
 </div></details>;
}
export function CrewCards({state,send,selected}:{state:DinerState;send:Send;selected?:string|null}){
 return <div className={css.list}>{state.home.roomPlan?.version===2&&<div className={css.card}><strong>Restaurant shift</strong><p className={css.small}>Pickup and chef-counter seating can run without servers. Off-shift crew stay hired.</p><div className={css.actions}>{(['chefs','waiters','cashiers'] as const).map(key=>{const role=key==='chefs'?'chef':key==='waiters'?'waiter':'cashier',owned=state.staffMembers.filter(p=>p.role===role).length;return <label key={key}>{key==='chefs'?'Cooks':key==='waiters'?'Servers':'Cashiers'}<select className={css.input} value={state.home.staff[key]??0} onChange={e=>send({type:'setHomeStaff',chefs:state.home.staff.chefs,waiters:state.home.staff.waiters,cashiers:state.home.staff.cashiers??0,[key]:Number(e.target.value)})}>{Array.from({length:owned+1},(_,n)=>n).filter(n=>key!=='chefs'||n>0).map(n=><option key={n} value={n}>{n} on shift</option>)}</select></label>;})}</div><small>Current guests finish before the new shift starts.</small></div>}{state.staffMembers.map(person=><CrewCard key={person.id} person={person} send={send} expanded={selected===person.id}/>)}</div>;
}
export function SignatureEditor({state,recipeId,send}:{state:DinerState;recipeId:string;send:Send}){
 const current=state.personal?.signature?.recipeId===recipeId?state.personal.signature:null;
 const [name,setName]=useState(current?.name??RECIPE_BY_ID[recipeId].name.slice(0,24)),[style,setStyle]=useState<SignatureDish['style']>(current?.style??'cream');
 if((state.recipes[recipeId]?.level??0)<1)return null;
 return <details className={css.card}><summary className={css.row}>{current?`House signature: ${current.name}`:'Give this dish your restaurant’s touch'}</summary><div className={css.cardBody}>
  <ModelIcon kind="food" recipeId={recipeId} vesselKind={recipeVessel(recipeId)} signatureStyle={style} mastery={state.recipes[recipeId].level} size={140} label={`${name} · ${RECIPE_BY_ID[recipeId].name}`}/>
  <label>Dish name<input className={css.input} maxLength={24} value={name} onChange={e=>setName(e.target.value)}/></label>
  <div className={css.actions}>{Object.keys(SIGNATURE_STYLES).map(id=><button className={style===id?css.softButton:css.button} aria-pressed={style===id} key={id} onClick={()=>setStyle(id as SignatureDish['style'])}>{id[0].toUpperCase()+id.slice(1)}</button>)}</div>
  <p className={css.small}>One house signature. A new name and serving style; the recipe and value stay the same. Appears in your next ordinary service.</p>
  <div className={css.actions}><button className={css.primary} disabled={!name.trim()} onClick={()=>send({type:'setSignature',signature:{version:1,recipeId,name:name.trim(),style}})}>Make my signature · free</button>{current&&<button className={css.button} onClick={()=>send({type:'setSignature',signature:null})}>Remove signature</button>}</div>
 </div></details>;
}
