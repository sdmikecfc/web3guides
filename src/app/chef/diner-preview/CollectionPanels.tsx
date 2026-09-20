"use client";
import { useState } from 'react';
import { COSMETICS, DECOR, DECOR_BY_ID, REGULARS, regularAvailable, regularFavourite, regularLevel, FRIENDSHIP_LEVELS } from '@/lib/chef/diner/collections';
import { RECIPE_BY_ID, SPICES, TRUCK_TIERS } from '@/lib/chef/diner/content';
import type { DinerCommand, DinerState } from '@/lib/chef/diner/progression';
import { DinerIcon } from './DinerIcon';
import { ModelIcon } from './ModelIcon';
import css from './diner.module.css';
type Props={state:DinerState;send:(command:DinerCommand)=>boolean};
const friendly=(name:string)=>name.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());

export function HomeFinishes({state,send,place}:{state:DinerState;send:Props['send'];place:(id:string)=>void}){
  const [name,setName]=useState('My favourite layout');
  return <>
    <div className={css.split}>{(['floor','wall'] as const).map(slot=><div key={slot}><h3 className={css.sectionTitle}>{slot==='floor'?'Under your feet':'Around the room'}</h3><div className={css.tabs}>{(slot==='floor'?COSMETICS.floors:COSMETICS.walls).map(id=><button key={id} className={state.cosmetics[slot]===id?css.tabActive:''} onClick={()=>send({type:'setCosmetic',slot,id})}>{friendly(id)}</button>)}</div></div>)}</div>
    <div className={css.grid}>{DECOR.filter(d=>!d.memento||state.decorOwned[d.id]>0).map(item=>{const stored=(state.decorOwned[item.id]??0)-state.home.layout.filter(p=>p.equipmentId===item.id).length;return <article className={css.card} key={item.id}><div className={css.cardArt}><ModelIcon kind={item.id} label={item.name}/>{stored>0&&<span className={css.ribbon}>{stored} in storage</span>}</div><div className={css.cardBody}><span className={css.badge}>{friendly(item.setId)} · {item.wall?'Wall hanging':'Floor decoration'}</span><h3>{item.name}</h3>{stored>0&&<button className={css.primary} onClick={()=>place(item.id)}>Place</button>}{!item.memento&&<button className={css.button} disabled={state.coins<item.price} onClick={()=>send({type:'buyDecor',decorId:item.id})}>Buy · {item.price} coins</button>}</div></article>;})}</div>
    <h3 className={css.sectionTitle}>Keep a favourite arrangement</h3><div className={css.inputRow}><input className={css.textInput} aria-label="Layout name" maxLength={24} value={name} onChange={e=>setName(e.target.value)}/><button className={css.button} disabled={state.savedLayouts.length>=3} onClick={()=>send({type:'saveLayout',name})}>Save room</button></div><div className={css.list}>{state.savedLayouts.map(layout=><div className={css.row} key={layout.id}><DinerIcon name="home"/><div><h3>{layout.name}</h3><p>{layout.layout.length} furnishings</p></div><button className={css.button} onClick={()=>send({type:'loadLayout',layoutId:layout.id})}>Use layout</button></div>)}</div>
  </>;
}

export function RegularBook({state,send}:Props){return <div className={css.grid}>{REGULARS.map((regular,index)=>{
  const available=regularAvailable(state,regular.id),count=state.collections.regulars[regular.id]??0,level=regularLevel(count),ready=available&&(state.daily.regularProgress[regular.id]??0)>=1&&!state.daily.regularServed.includes(regular.id),favourite=regularFavourite(state,regular.id);
  return <article className={`${css.card} ${!available&&!count?css.locked:''}`} key={regular.id}><div className={css.cardArt}><ModelIcon kind="customer" look={index} label={regular.name}/><span className={css.ribbon}>{level?`Friendship ${level} / 5`:count?'A familiar face':'Someone to meet'}</span></div><div className={css.cardBody}><h3>{regular.name}</h3><p>{available||count?regular.quirk:regular.hint}</p><span className={css.small}>Favourite: {favourite?RECIPE_BY_ID[favourite]?.name:'Any mastered dish'}</span><span className={css.small}>{count} lunches · {level<5?`${FRIENDSHIP_LEVELS[level]} for the next friendship level`:'A friend for life'}</span><button className={css.softButton} disabled={!ready} onClick={()=>send({type:'serveRegular',regularId:regular.id})}>{state.daily.regularServed.includes(regular.id)?'See you tomorrow':ready?'Say hello':'Waiting for their favourite'}</button></div></article>;
})}</div>;}

export function StaffRitual({state,send}:Props){return <>
  <h3 className={css.sectionTitle}>A meal for your crew</h3><p className={css.small}>Pick one house favourite for a small speed boost today. No ingredients needed.</p><div className={css.tabs}>{Object.keys(state.recipes).map(id=><button key={id} disabled={!!state.daily.staffMeal} className={state.daily.staffMeal===id?css.tabActive:''} onClick={()=>send({type:'staffMeal',recipeId:id})}>{RECIPE_BY_ID[id]?.name}</button>)}</div>
  <h3 className={css.sectionTitle}>Your people</h3><div className={css.list}>{state.staffMembers.map(member=><div className={css.row} key={member.id}><ModelIcon kind={member.role} label={member.name} size={48}/><div><h3>{member.name}</h3><p>{member.role} · {member.named?'Met on the road':'Diner crew'}</p></div></div>)}</div>
  <h3 className={css.sectionTitle}>Aprons for the team</h3><div className={css.tabs}>{COSMETICS.uniforms.map(id=><button key={id} className={state.cosmetics.uniform===id?css.tabActive:''} onClick={()=>send({type:'setCosmetic',slot:'uniform',id})}>{friendly(id)}</button>)}</div>
</>;}

export function TruckExtras({state,send}:Props){
  const spiceDetails:Record<string,string>={rush_hour:'Patience drains 25% faster.',picky_eaters:'Only dishes at level 3 or higher.',short_staffed:'Leave your helpers at home.',two_strikes:'Two strikes end the trip.',full_menu:'Cook at least three recipes.'};
  const locked=!!state.run||!!state.rally.service,capacity=TRUCK_TIERS[state.truckTier].helpers;
  const helperSlots=[{slot:0 as const,id:state.truckConfig.helperId,role:state.truckConfig.helperRole},{slot:1 as const,id:state.truckConfig.helperId2,role:state.truckConfig.helperRole2}];
  return <>
    <h3 className={css.sectionTitle}>An extra pair of hands</h3><p className={css.small}>{capacity?'Choose different crew members and one fixed job each before leaving home.':'Grow your truck to tier 2 for a helper seat.'}{locked?' Change your crew after returning home.':''}</p>
    {helperSlots.filter(helper=>helper.slot===0||capacity>1).map(helper=>{const other=helperSlots[1-helper.slot].id;return <div key={helper.slot} role="group" aria-label={`Helper seat ${helper.slot+1}`}>
      {capacity>1&&<h4 className={css.small}>Helper seat {helper.slot+1}</h4>}
      <div className={css.tabs}><button disabled={locked||capacity<=helper.slot} aria-pressed={!helper.id} className={!helper.id?css.tabActive:''} onClick={()=>send({type:'assignHelper',slot:helper.slot,staffId:null})}>Empty seat</button>{state.staffMembers.map(member=><button key={member.id} disabled={locked||capacity<=helper.slot||other===member.id} aria-pressed={helper.id===member.id} title={other===member.id?'Already in the other helper seat':undefined} className={helper.id===member.id?css.tabActive:''} onClick={()=>send({type:'assignHelper',slot:helper.slot,staffId:member.id,role:helper.role})}>{member.name}</button>)}</div>
      {helper.id&&<div className={css.tabs} role="group" aria-label={`Job for helper seat ${helper.slot+1}`}>{(['washer','runner','prep'] as const).map(role=><button key={role} disabled={locked||capacity<=helper.slot} aria-pressed={helper.role===role} className={helper.role===role?css.tabActive:''} onClick={()=>send({type:'assignHelper',slot:helper.slot,staffId:helper.id,role})}>{role==='washer'?'Clear & wash':role==='runner'?'Serve ready dishes':'Help prepare'}</button>)}</div>}
    </div>;})}
    {capacity<2&&<p className={css.tiny}>A second helper seat opens at truck tier 4.</p>}
    <h3 className={css.sectionTitle}>A little extra spice</h3><p className={css.small}>After your first finale, add optional challenges for skill trophies.</p><div className={css.list}>{SPICES.map(id=><div className={css.row} key={id}><DinerIcon name="star"/><div><h3>{friendly(id)}</h3><p>{spiceDetails[id]}</p></div><button disabled={locked||!state.collections.routeWins.length} className={state.truckConfig.spices.includes(id)?css.softButton:css.button} onClick={()=>send({type:'setSpices',spiceIds:state.truckConfig.spices.includes(id)?state.truckConfig.spices.filter(s=>s!==id):[...state.truckConfig.spices,id]})}>{state.truckConfig.spices.includes(id)?'Added':'Add'}</button></div>)}</div>
  </>;
}
