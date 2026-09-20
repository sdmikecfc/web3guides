import { useState } from 'react';
import { truckStorage, truckRecipeShop, truckEquipmentShop, TRUCK_TABLE_PRICES, type DinerState, type DinerCommand } from '@/lib/chef/diner/progression';
import { RECIPE_BY_ID } from '@/lib/chef/diner/content';
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
    {view==='menu'&&<p className={css.menuExplanation}>Serve only what you choose. Buying a recipe keeps it off the menu until you add it.</p>}
    <div className={css.packingShelf}>
      {view==='menu'?<>{Object.keys(state.recipes).filter(id=>RECIPE_BY_ID[id]).map(id=><button key={id} aria-pressed={menu.includes(id)} onClick={()=>changeMenu(id)}><ModelIcon kind="food" recipeId={id} label={RECIPE_BY_ID[id].name} size={48}/><span>{RECIPE_BY_ID[id].name}<small>{menu.includes(id)?'On today’s menu':'Tap to add'}</small></span></button>)}{truckRecipeShop(state).filter(offer=>offer.available||offer.reason?.startsWith('Save')||offer.recipeId==='fries').map(offer=><button key={offer.recipeId} title={offer.reason??undefined} disabled={!offer.available||state.coins<offer.price} onClick={()=>send({type:'buyTruckRecipe',recipeId:offer.recipeId})}><ModelIcon kind="food" recipeId={offer.recipeId} label={RECIPE_BY_ID[offer.recipeId].name} size={48}/><span>{RECIPE_BY_ID[offer.recipeId].name}<small>{offer.available?`Learn recipe · ${offer.price} coins`:offer.reason}</small></span></button>)}</>:view==='seats'?<>{([1,2] as const).map(capacity=><button key={capacity} disabled={state.coins<TRUCK_TABLE_PRICES[capacity]} onClick={()=>onBuy(capacity)}><ModelIcon kind={`table_${capacity}`} label="Table" size={48}/><span>{capacity===1?'Table + chair':'Table + two chairs'}<small>{TRUCK_TABLE_PRICES[capacity]} coins</small></span></button>)}{truckEquipmentShop(state).map(offer=><button key={offer.equipmentId} disabled={!offer.available} title={offer.reason??undefined} onClick={()=>send({type:offer.action==='buy'?'buyTruckEquipment':'upgradeTruckEquipment',equipmentId:offer.equipmentId})}><ModelIcon kind={offer.equipmentId} tier={offer.tier} label={offer.name} size={48}/><span>{offer.name}<small>{offer.action==='upgrade'?`Upgrade to ${offer.capacity} capacity`:`${offer.capacity} capacity · truck supply`}</small><small>{offer.available?`${offer.price} coins`:offer.reason}</small></span></button>)}</>:pieces.length?pieces.map(item=><button key={item.equipmentId} aria-pressed={placing===item.equipmentId} onClick={()=>onChoose(item.equipmentId)}><ModelIcon kind={item.equipmentId} label={item.name} size={48}/><span>{item.name}<small>{placing===item.equipmentId?'Choose a floor tile':`${item.available} ready to place`}</small></span></button>):<p>Everything is packed. Tap a station to move it or return it here.</p>}
    </div>
  </section>;
}
