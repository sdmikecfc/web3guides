import { useState } from 'react';
import { truckStorage, truckEquipmentShop, truckMenuCapacity, recipeEquipmentNeeded, TRUCK_TABLE_PRICES, type DinerState, type DinerCommand } from '@/lib/chef/diner/progression';
import { RECIPE_BY_ID } from '@/lib/chef/diner/content';
import { RecipeLearning, equipmentUpgradeDescription, equipmentDisplayName, recipeEquipmentHint } from './RecipeLearning';
import { ModelIcon } from './ModelIcon';
import css from './diner.module.css';

/** A shelf in the parked truck, not another full-screen shop. */
export function TruckPacking({state,placing,onChoose,onBuy,send}:{state:DinerState;placing:string|null;onChoose:(id:string)=>void;onBuy:(capacity:1|2)=>void;send:(command:DinerCommand)=>boolean}){
  const [view,setView]=useState<'equipment'|'seats'|'menu'>('equipment');
  const pieces=truckStorage(state).filter(item=>item.available>0);
  const menu=state.run?.menu??state.truckConfig.menu;
  const changeMenu=(id:string)=>{const next=menu.includes(id)?menu.filter(item=>item!==id):[...menu,id];if(next.length)send({type:'setTruckMenu',recipeIds:next});};
  return <section className={css.packing} aria-label="Equipment trailer">
    <div className={css.packingTitle}><strong>{view==='menu'?"Today’s menu":'Your equipment trailer'}</strong><div>{view!=='equipment'&&<button onClick={()=>setView('equipment')}>Equipment</button>}<button onClick={()=>setView(view==='menu'?'equipment':'menu')} aria-expanded={view==='menu'}>{view==='menu'?'Close menu':'Choose menu'}</button><button onClick={()=>setView(view==='seats'?'equipment':'seats')} aria-expanded={view==='seats'}>{view==='seats'?'Back':'Shop'}</button></div></div>
    {view==='menu'&&<p className={css.menuExplanation}>{menu.length>truckMenuCapacity(state)?`Your existing ${menu.length}-recipe menu is kept. New menus allow up to ${truckMenuCapacity(state)} recipes; grow your truck to add more.`:`${menu.length} / ${truckMenuCapacity(state)} recipes chosen. Larger trucks make room for more.`} Buying a recipe keeps it off the menu until you add it.</p>}
    {view==='equipment'&&<p className={css.menuExplanation}>Leave a clear side or corner to work. Bins and supplies can stand outside.</p>}
    {view==='seats'&&<RecipeLearning state={state} compact/>}
    <div className={css.packingShelf}>
      {view==='menu'?Object.keys(state.recipes).filter(id=>RECIPE_BY_ID[id]).map(id=>{
        const chosen=menu.includes(id),missing=recipeEquipmentNeeded(state,id),full=menu.length>=truckMenuCapacity(state),last=chosen&&menu.length===1;
        const hint=last?'Keep at least one dish':chosen?'Tap to remove':missing.length?recipeEquipmentHint(state,id):full?'Menu full · remove a dish first':'Tap to add · arrange equipment before opening';
        return <button key={id} aria-pressed={chosen} title={hint} disabled={last||!chosen&&(full||missing.length>0)} onClick={()=>changeMenu(id)}><ModelIcon kind="food" recipeId={id} label={RECIPE_BY_ID[id].name} size={48}/><span>{RECIPE_BY_ID[id].name}<small>{chosen?'On today’s menu':hint}</small>{chosen&&<small>{hint}</small>}</span></button>;
      }):view==='seats'?<>{([1,2] as const).map(capacity=><button key={capacity} disabled={state.coins<TRUCK_TABLE_PRICES[capacity]} onClick={()=>onBuy(capacity)}><ModelIcon kind={`table_${capacity}`} label="Table" size={48}/><span>{capacity===1?'Table + chair':'Table + two chairs'}<small>{TRUCK_TABLE_PRICES[capacity]} coins</small></span></button>)}{truckEquipmentShop(state).map(offer=><button key={offer.equipmentId} disabled={!offer.available} title={offer.reason??undefined} onClick={()=>send({type:offer.action==='buy'?'buyTruckEquipment':'upgradeTruckEquipment',equipmentId:offer.equipmentId})}><ModelIcon kind={offer.equipmentId} tier={offer.tier} label={equipmentDisplayName(offer.equipmentId,offer.tier)} size={48}/><span>{equipmentDisplayName(offer.equipmentId,offer.tier)}<small>{offer.action==='upgrade'?`Tier ${offer.tier} upgrade`:'Truck supply'}</small><small>{equipmentUpgradeDescription(offer.equipmentId,offer.tier)}</small><small>{offer.available?`${offer.price} coins`:offer.reason}</small></span></button>)}</>:pieces.length?pieces.map(item=><button key={item.equipmentId} aria-pressed={placing===item.equipmentId} onClick={()=>onChoose(item.equipmentId)}><ModelIcon kind={item.equipmentId} tier={item.tier} label={equipmentDisplayName(item.equipmentId,item.tier)} size={48}/><span>{equipmentDisplayName(item.equipmentId,item.tier)}<small>{placing===item.equipmentId?'Choose a floor tile':`${item.available} ready to place`}</small></span></button>):<p>Everything is packed. Tap a station to move it or return it here.</p>}
    </div>
  </section>;
}
