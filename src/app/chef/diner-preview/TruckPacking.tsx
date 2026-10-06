"use client";
import {useEffect,useRef,useState} from 'react';
import {truckStorage,truckMenuCapacity,recipeEquipmentNeeded,type DinerState,type DinerCommand} from '@/lib/chef/diner/progression';
import {ROUND_HELPER_ROLES,ROUND_HELPER_LABELS,roundHelperCapacity,roundHelpers,type RoundHelperRole} from '@/lib/chef/diner/round-staff';
import {RECIPE_BY_ID} from '@/lib/chef/diner/content';
import {equipmentDisplayName} from './RecipeLearning';
import {requiredLoadout} from './required-loadout';
import {ModelIcon} from './ModelIcon';
import css from './diner.module.css';
type Loadout=Extract<DinerCommand,{type:'setupLayout'}>;
/** Describe the helpers who will actually enter this saved lunch. */
export function lunchHelp(state:DinerState){
 const paid=!!state.run&&state.run.mapVersion>=6&&!state.run.practice;
 const helpers=state.run?.service?.config.helpers??(paid?roundHelpers(state):[]);
 const capacity=roundHelperCapacity(state),soloChallenge=!!state.run?.spices.includes('short_staffed');
 const editable=paid&&capacity>0&&!soloChallenge;
 const summary=helpers.length?(paid?`${helpers.length} helper${helpers.length===1?'':'s'} · ${helpers.length*20}% of food + tips`:helpers.map(h=>`${h.name??'Helper'} · ${ROUND_HELPER_LABELS[h.role]}`).join(' · ')):'Solo · no helper';
 const detail=state.run?.practice?(helpers.length?'No helper wages during practice.':"You’re cooking this practice lunch solo."):!paid?(helpers.length?'Your current helpers stay for this trip, with no wages. Choose paid help on your next trip.':'This trip is solo. Hire a helper when you start your next trip.'):soloChallenge?'You chose a solo challenge for this trip.':capacity===0?'Finish your first lunch to unlock one helper.':'Choose a job for each helper. They earn 20% each of this lunch’s food income and tips; you keep the completion bonus.';
 return {paid,helpers,capacity,editable,summary,detail};
}
export function TruckPacking({state,placing,editing,onChoose,onEdit,send,onPreviewLoadout}:{state:DinerState;placing:string|null;editing:boolean;onChoose:(id:string)=>void;onEdit:()=>void;send:(c:DinerCommand)=>boolean;onPreviewLoadout:(c:Loadout|null)=>void;onRehearse?:()=>void;onInspect?:(id:string)=>void}){
 const [section,setSection]=useState<'menu'|'equipment'|'help'|null>(null),[proposal,setProposal]=useState<ReturnType<typeof requiredLoadout>|null>(null);
 const panelRef=useRef<HTMLElement>(null);
 const pieces=truckStorage(state),menu=state.run?.menu??state.truckConfig.menu,help=lunchHelp(state),roles=help.helpers.map(h=>h.role),{capacity}=help;
 useEffect(()=>{const panel=panelRef.current;if(!panel)return;const row=panel.querySelector<HTMLElement>('[data-open=true]');panel.scrollTop=section&&row?panel.scrollTop+row.getBoundingClientRect().top-panel.getBoundingClientRect().top-8:0;},[section]);
 useEffect(()=>{if(placing)setSection(null);},[placing]);
 useEffect(()=>()=>onPreviewLoadout(null),[onPreviewLoadout]);
 useEffect(()=>{setProposal(null);onPreviewLoadout(null);},[menu.join(','),editing,onPreviewLoadout]);
 const changeMenu=(id:string)=>{const next=menu.includes(id)?menu.filter(x=>x!==id):[...menu,id];if(next.length)send({type:'setTruckMenu',recipeIds:next});};
 const toggle=(s:typeof section)=>setSection(section===s?null:s);
 const chooseHelpers=(next:RoundHelperRole[])=>send({type:'setRoundHelpers',roles:next});
 if(editing)return <div className={css.packing}><button className={css.quietLink} onClick={()=>toggle('equipment')}>Equipment trailer {section==='equipment'?'▾':'▸'}</button>{section==='equipment'&&<div className={css.packingShelf}>{pieces.filter(p=>p.available).map(p=><button key={p.equipmentId} onClick={()=>onChoose(p.equipmentId)}><ModelIcon kind={p.equipmentId} label={equipmentDisplayName(p.equipmentId)} size={38}/><span>{equipmentDisplayName(p.equipmentId)}<small>{p.available} stored</small></span></button>)}</div>}</div>;
 if(proposal)return <section className={css.preparation} aria-label="Confirm equipment loadout"><div className={css.preparationHeading}><strong>Load your equipment</strong></div><div className={css.loadoutProposal}><p>{proposal.error??(proposal.added.length?`Preview: add ${proposal.added.map(k=>equipmentDisplayName(k)).join(', ')}. Your other pieces stay put.`:'Required equipment is already loaded.')}</p><button className={css.button} onClick={()=>{setProposal(null);onPreviewLoadout(null);}}>Cancel</button>{proposal.command&&proposal.added.length>0&&<button className={css.primary} onClick={()=>{if(send(proposal.command!)){setProposal(null);setSection(null);onPreviewLoadout(null);}}}>Confirm loadout</button>}</div></section>;
 return <section className={css.preparation} ref={panelRef} aria-label="Prepare this lunch" data-expanded={section??undefined}>
  <div className={css.preparationHeading}><strong>Prepare this lunch</strong><span>{state.run?.assistance==='cosy'?'Cosy':'Regular'}</span></div>
  <div className={css.preparationRow} data-open={section==='menu'||undefined}><span><b><span className={css.preparationStep}>1</span>Menu</b><small>{menu.map(id=>RECIPE_BY_ID[id]?.name).join(' · ')}</small></span><button aria-label="Edit today's menu" onClick={()=>toggle('menu')} aria-expanded={section==='menu'}>Edit</button></div>
  {section==='menu'&&<div className={css.packingShelf}>{Object.keys(state.recipes).filter(id=>RECIPE_BY_ID[id]).map(id=>{const chosen=menu.includes(id),missing=recipeEquipmentNeeded(state,id);return <button key={id} aria-pressed={chosen} disabled={chosen?menu.length===1:menu.length>=truckMenuCapacity(state)||missing.length>0} onClick={()=>changeMenu(id)}><ModelIcon kind="food" recipeId={id} label={RECIPE_BY_ID[id].name} size={40}/><span>{RECIPE_BY_ID[id].name}<small>{missing.length?'Needs '+missing.map(k=>equipmentDisplayName(k)).join(', '):RECIPE_BY_ID[id].steps.map(s=>equipmentDisplayName(s.station)).filter((v,i,a)=>a.indexOf(v)===i).join(' + ')}</small></span></button>;})}</div>}
  <div className={css.preparationRow} data-open={section==='equipment'||undefined}><span><b><span className={css.preparationStep}>2</span>Equipment</b><small>{pieces.reduce((n,p)=>n+p.placed,0)} loaded · {pieces.reduce((n,p)=>n+p.available,0)} stored</small></span><button aria-label="Edit loaded equipment" onClick={()=>toggle('equipment')} aria-expanded={section==='equipment'}>Edit</button></div>
  {section==='equipment'&&<><button className={css.quietLink} onClick={()=>{const next=requiredLoadout(state);setProposal(next);onPreviewLoadout(next.command);}}>Load required equipment</button><div className={css.packingShelf}>{pieces.map(p=><button key={p.equipmentId} disabled={!p.available} onClick={()=>onChoose(p.equipmentId)}><ModelIcon kind={p.equipmentId} label={equipmentDisplayName(p.equipmentId)} size={38}/><span>{equipmentDisplayName(p.equipmentId)}<small>{p.placed} loaded · {p.available} stored</small></span></button>)}</div></>}

  <div className={css.preparationRow}><span><b><span className={css.preparationStep}>3</span>Layout</b><small>Move, rotate or store your pieces</small></span><button aria-label="Edit truck layout" onClick={onEdit}>Edit</button></div>
  <div className={css.preparationRow} data-open={section==='help'||undefined}><span><b><span className={css.preparationStep}>4</span>Kitchen help</b><small>{help.summary}</small></span><button aria-label={help.editable?'Choose help for this lunch':'About help for this lunch'} onClick={()=>toggle('help')} aria-expanded={section==='help'}>{help.editable?'Choose':'Info'}</button></div>
  {section==='help'&&help.editable&&<div className={css.helperChoices}><div>{Array.from({length:capacity+1},(_,n)=><button key={n} aria-pressed={roles.length===n} onClick={()=>chooseHelpers(Array.from({length:n},(_,i)=>roles[i]??(i===0?'runner':'washer')))}>{n===0?'Solo':`${n} helper${n>1?'s':''} · ${n*20}%`}</button>)}</div>{roles.map((role,i)=><label key={i}>Helper {i+1}<select value={role} onChange={e=>chooseHelpers(roles.map((r,j)=>j===i?e.target.value as RoundHelperRole:r))}>{ROUND_HELPER_ROLES.map(r=><option key={r} value={r}>{ROUND_HELPER_LABELS[r]}</option>)}</select></label>)}<small>No upfront cost. Bonuses are yours. Staffing locks when you start preparing.</small></div>}
  {section==='help'&&!help.editable&&<p className={css.preparationHelp}>{help.detail}</p>}
 </section>;
}
