'use client';
import {useState} from 'react';
import {appearanceError,appearanceTargets,assignedCopies,ownedEquipmentAppearances,type AppearanceLocation} from '@/lib/chef/diner/collectible-appearances';
import {EQUIPMENT_BY_ID} from '@/lib/chef/diner/content';
import type {DinerState,DinerCommand} from '@/lib/chef/diner/progression';
import {ModelIcon} from './ModelIcon';
import css from './equipment-appearance.module.css';
export interface AppearanceChoice {location:AppearanceLocation;targetId:string;skinId:string|null}
export function EquipmentAppearance({state,initial,send,preview,close}:{state:DinerState;initial:AppearanceChoice;send:(c:DinerCommand)=>boolean;preview:(c:AppearanceChoice)=>void;close:()=>void}){
 const [choice,setChoice]=useState(initial);
 const choose=(c:AppearanceChoice)=>{setChoice(c);preview(c);};
 const targets=appearanceTargets(state,choice.location).filter(t=>ownedEquipmentAppearances(state,t.kind).length>0);
 const target=targets.find(t=>t.id===choice.targetId),options=ownedEquipmentAppearances(state,target?.kind),error=appearanceError(state,choice.location,choice.targetId,choice.skinId);
 return <section className={css.panel} aria-label="Change equipment appearance"><header><div><small>MAKE IT YOURS</small><h3>Change appearance</h3></div><button onClick={close} aria-label="Cancel appearance preview">×</button></header>
 <p>Your machine keeps its speed, capacity and upgrades.</p><label>Machine<select value={choice.targetId} onChange={e=>choose({...choice,targetId:e.target.value,skinId:null})}>{!targets.length&&<option value="">Place compatible equipment first</option>}{targets.map((t,i)=><option key={t.id} value={t.id}>{EQUIPMENT_BY_ID[t.kind]?.name} · {i+1}</option>)}</select></label>
 <div className={css.options}><button aria-pressed={choice.skinId===null} onClick={()=>choose({...choice,skinId:null})}>Original appearance</button>{options.map(item=><button key={item.id} aria-pressed={choice.skinId===item.id} onClick={()=>choose({...choice,skinId:item.id})}><ModelIcon kind={item.id} label="" size={68}/><span>{item.name}<small>{state.decorOwned[item.id]} owned · {assignedCopies(state,item.id)} in use</small></span></button>)}</div>
 {error&&<p role="status">{error}</p>}<footer><button onClick={close}>Cancel</button><button disabled={!!error} onClick={()=>{if(send({type:'setCollectibleAppearance',...choice}))close();}}>{choice.skinId?'Apply appearance':'Use original'}</button></footer>
 </section>;
}
