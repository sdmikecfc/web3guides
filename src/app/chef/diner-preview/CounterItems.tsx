"use client";

import {itemLabel,serviceTargetIntent} from '@/lib/chef/diner/service';
import type {ServiceState,ServiceStation} from '@/lib/chef/diner/types';
import {ModelIcon} from './ModelIcon';
import {equipmentDisplayName} from './RecipeLearning';
import css from './counter-items.module.css';

/** Picking a stored object is an action, not optional station feedback. */
export function CounterItems({service,station,onTake,onPutDown,onClose}:{service:ServiceState;station:ServiceStation;onTake:(itemId:string)=>void;onPutDown:()=>void;onClose:()=>void}){
  const occupied=station.slots.flatMap((slot,index)=>slot.item?[{item:slot.item,index}]:[]),held=service.chef.held;
  const putDown=serviceTargetIntent(service,station.id);
  return <section className={css.picker} aria-label="Items on the holding counter">
    <header><strong>{equipmentDisplayName(station.kind,station.tier)}</strong><button type="button" onClick={onClose} aria-label="Close counter items">Close</button></header>
    <p>{held?'Your hands are full. Put that down before taking another item.':occupied.length?'Tap an item to pick it up.':'Nothing stored here yet.'}</p>
    {held&&<button type="button" className={css.putDown} disabled={putDown.disabled} onClick={onPutDown}>{putDown.disabled?putDown.label:`Put down ${itemLabel(held).toLowerCase()}`}</button>}
    {occupied.length>0&&<div className={css.items}>{occupied.map(({item,index})=>{
      const intent=serviceTargetIntent(service,station.id,undefined,undefined,item.id);
      return <button type="button" key={item.id} disabled={intent.disabled} aria-label={`Take ${itemLabel(item)} from spot ${index+1}`} onClick={()=>onTake(item.id)}>
        <ModelIcon kind="food" recipeId={item.recipeId} foodKind={item.kind} ingredientId={item.ingredientId} vesselKind={item.vesselKind} stage={item.stage} cold={item.cold} mastery={service.config.recipeLevels[item.recipeId]??0} label={itemLabel(item)} size={32}/>
        <span>{itemLabel(item)}<small>Take · spot {index+1}</small></span>
      </button>;
    })}</div>}
  </section>;
}
