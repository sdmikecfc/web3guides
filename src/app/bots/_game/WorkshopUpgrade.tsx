"use client";
import { useState } from 'react';
import { ENTRY_MAP, ITEM_MAP, SLOTS, SLOT_NAMES, SPECIAL_NAMES, itemId, legalChoices, type Slot } from '@/lib/bots/workshop8/catalogue';
import type { Robot8, Workshop8 } from '@/lib/bots/workshop8/state';
import { compareBuilds } from '@/lib/bots/workshop8/journey';
import EntryDialog from './EntryDialog';
import WorkshopItemPages from './WorkshopItemPages';
import css from './workshop-upgrade.module.css';

export default function WorkshopUpgrade({robot,state,initialSlot='torso',initialItem,busy,now,onInstall,onShop,onClose}:{
 robot:Robot8;state:Workshop8;initialSlot?:Slot;initialItem?:string;busy:boolean;now:number;
 onInstall:(slot:Slot,spareUid:string)=>Promise<boolean>;onShop:(slot:Slot)=>void;onClose:()=>void;
}) {
 const [slot,setSlot]=useState<Slot>(initialSlot),[picked,setPicked]=useState(''),[message,setMessage]=useState('');
 const fitted=ITEM_MAP.get(itemId(robot.choices[slot],slot))!;
 const spares=state.spares.flatMap(spare=>{
  const item=ITEM_MAP.get(spare.item);
  return item&&item.slot===slot&&item.id!==fitted.id&&legalChoices({...robot.choices,[slot]:item.entry.id})?[{...spare,item}]:[];
 });
 const choice=spares.find(p=>p.uid===picked)??spares.find(p=>p.item.id===initialItem)??spares[0];
 const comparison=choice?compareBuilds(robot.choices,{...robot.choices,[slot]:choice.item.entry.id}):null;
 const blocked=state.active?.robotId===robot.id?'Finish this robot’s battle before changing parts.':robot.repairUntil>now?'Finish repairs before changing parts.':'';
 const changed=comparison?.changes.filter(c=>Math.abs(c.delta)>.00001)??[];
 const display=(key:string,value:number)=>key==='plating'?`${Math.round(value*100)}%`:key==='attackSpeed'?`${value.toFixed(2)}×`:Number(value.toFixed(2)).toString();
 return <EntryDialog title={`Upgrade ${robot.name}`} onClose={onClose}>
  <div className={css.content}>
   <p className={css.note}>Install an owned spare for free. Your old part goes back in your cabinet.</p>
   <label className={css.slot}>Part to change<select aria-label="Part to upgrade" value={slot} onChange={event=>{setSlot(event.target.value as Slot);setPicked('');setMessage('')}}>{SLOTS.map(s=><option key={s} value={s}>{SLOT_NAMES[s]} · {ENTRY_MAP.get(robot.choices[s])?.name}</option>)}</select></label>
   <div className={css.fitted}><img src={fitted.image} alt=""/><div><small>FITTED NOW · {SLOT_NAMES[slot]}</small><strong>{fitted.entry.name}</strong><span>Tier {fitted.entry.tier}</span></div></div>
   {blocked?<p role="status" className={css.status}>{blocked}</p>:<>
    {spares.length?<><h2>Choose an owned spare</h2><div className={css.grid}><WorkshopItemPages compact items={spares} resetKey={`${robot.id}:${slot}:${state.revision}`} render={spare=><button className={css.part} key={spare.uid} aria-pressed={choice?.uid===spare.uid} onClick={()=>{setPicked(spare.uid);setMessage('')}}><img src={spare.item.image} alt=""/><strong>{spare.item.entry.name}</strong><small>Tier {spare.item.entry.tier} · Owned</small></button>}/></div>
     {comparison&&<div className={css.changes}>
      <p>{changed.length?`${comparison.benefit?`More ${comparison.benefit.label}.`:''} ${comparison.cost?`Less ${comparison.cost.label}.`:''}`:'Same performance. A different look.'}</p>
      {slot==='torso'&&<p>Special: {SPECIAL_NAMES[choice!.item.entry.style]}</p>}
      <details><summary>Robot stats: before → after</summary><dl>{comparison.changes.map(c=><div key={c.key}><dt>{c.label}</dt><dd>{display(c.key,c.from)} → {display(c.key,c.to)}</dd></div>)}</dl><p>Gear Points: {comparison.before.gp} → {comparison.after.gp}</p></details>
     </div>}
    </>:<p className={css.status}>No replacement {SLOT_NAMES[slot].toLowerCase()} in your cabinet yet.</p>}
   </>}
  </div>
  <p role="status" className={css.feedback}>{message}</p>
  <div className={css.actions}>{choice&&!blocked&&<button className={css.primary} disabled={busy} onClick={async()=>{setMessage('');if(await onInstall(slot,choice.uid)){setPicked('');setMessage('Installed. Your old part is back in the cabinet.')}else setMessage('Could not confirm the change. Check your connection and try again.')}}>{busy?'Installing…':'Install part'}</button>}<button disabled={busy} onClick={()=>onShop(slot)}>Shop for parts →</button></div>
 </EntryDialog>;
}
