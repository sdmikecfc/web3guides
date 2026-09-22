import { useState } from 'react';
import { truckStorage, truckMenuCapacity, recipeEquipmentNeeded, type DinerState, type DinerCommand } from '@/lib/chef/diner/progression';
import { RECIPE_BY_ID } from '@/lib/chef/diner/content';
import { equipmentDisplayName, recipeEquipmentHint } from './RecipeLearning';
import { ModelIcon } from './ModelIcon';
import css from './diner.module.css';

/** Arrange owned pieces here. New equipment is found at roadside markets. */
export function TruckPacking({state,placing,onChoose,send}:{state:DinerState;placing:string|null;onChoose:(id:string)=>void;send:(command:DinerCommand)=>boolean}){
  const [view,setView]=useState<'equipment'|'menu'>('equipment');
  const pieces=truckStorage(state).filter(item=>item.available>0);
  const menu=state.run?.menu??state.truckConfig.menu;
  const changeMenu=(id:string)=>{const next=menu.includes(id)?menu.filter(item=>item!==id):[...menu,id];if(next.length)send({type:'setTruckMenu',recipeIds:next});};
  return <section className={css.packing} aria-label="Equipment trailer">
    <div className={css.packingTitle}><strong>{view==='menu'?"Today’s menu":'Your equipment trailer'}</strong><div><button onClick={()=>setView(view==='menu'?'equipment':'menu')} aria-expanded={view==='menu'}>{view==='menu'?'Back to equipment':'Choose menu'}</button></div></div>
    {view==='menu'&&<p className={css.menuExplanation}>{menu.length>truckMenuCapacity(state)?`Your existing ${menu.length}-recipe menu is kept. New menus allow up to ${truckMenuCapacity(state)} recipes; grow your truck to add more.`:`${menu.length} / ${truckMenuCapacity(state)} recipes chosen. Larger trucks make room for more.`} Buying a recipe keeps it off the menu until you add it.</p>}
    {view==='equipment'&&<p className={css.menuExplanation}>Arrange what you own. Find new equipment at roadside markets. Leave a clear side or corner to work; bins and supplies can stand outside.</p>}
    <div className={css.packingShelf}>
      {view==='menu'?Object.keys(state.recipes).filter(id=>RECIPE_BY_ID[id]).map(id=>{
        const chosen=menu.includes(id),missing=recipeEquipmentNeeded(state,id),full=menu.length>=truckMenuCapacity(state),last=chosen&&menu.length===1;
        const hint=last?'Keep at least one dish':chosen?'Tap to remove':missing.length?recipeEquipmentHint(state,id):full?'Menu full · remove a dish first':'Tap to add · arrange equipment before opening';
        return <button key={id} aria-pressed={chosen} title={hint} disabled={last||!chosen&&(full||missing.length>0)} onClick={()=>changeMenu(id)}><ModelIcon kind="food" recipeId={id} label={RECIPE_BY_ID[id].name} size={48}/><span>{RECIPE_BY_ID[id].name}<small>{chosen?'On today’s menu':hint}</small>{chosen&&<small>{hint}</small>}</span></button>;
      }):pieces.length?pieces.map(item=><button key={item.equipmentId} aria-pressed={placing===item.equipmentId} onClick={()=>onChoose(item.equipmentId)}><ModelIcon kind={item.equipmentId} tier={item.tier} label={equipmentDisplayName(item.equipmentId,item.tier)} size={48}/><span>{equipmentDisplayName(item.equipmentId,item.tier)}<small>{placing===item.equipmentId?'Choose a floor tile':`${item.available} ready to place`}</small></span></button>):<p>Everything is packed. Tap a station to move it or return it here.</p>}
    </div>
  </section>;
}
