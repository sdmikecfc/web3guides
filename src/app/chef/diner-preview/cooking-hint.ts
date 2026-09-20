import { EQUIPMENT_BY_ID, RECIPE_BY_ID } from '@/lib/chef/diner/content';
import type { ServiceState } from '@/lib/chef/diner/types';

export type CookingHint={target:string;seatId?:string;label:string;disabled?:boolean};
/** A single useful next action; the player can always work elsewhere in the scene. */
export function cookingHint(state:ServiceState):CookingHint{
  const held=state.chef.held;
  if(held){
    if(held.kind==='dirty')return {target:'sink',label:'Wash this plate'};
    if(held.kind==='burnt')return {target:'bin',label:'Bin the burnt food'};
    if(held.kind==='dish'){
      const guest=state.customers.find(c=>c.phase==='seated'&&c.recipeId===held.recipeId);
      return guest?{target:guest.tableId!,seatId:guest.seatId!,label:'Serve this dish'}:{target:'',label:'No guest is waiting for this dish',disabled:true};
    }
    const step=RECIPE_BY_ID[held.recipeId].steps[held.step],station=state.stations.find(s=>s.kind===step.station&&s.slots.some(slot=>!slot.item));
    return station?{target:station.id,label:step.label}:{target:'',label:'Make room at the next station',disabled:true};
  }
  const ready=state.stations.find(s=>s.slots.some(slot=>slot.job?.ready&&slot.item));
  if(ready)return {target:ready.id,label:`Take from ${EQUIPMENT_BY_ID[ready.kind].name.toLowerCase()}`};
  const working=state.stations.find(s=>s.slots.some(slot=>slot.job&&!slot.job.ready));
  if(working){const job=working.slots.find(slot=>slot.job&&!slot.job.ready)!.job!;return {target:working.id,label:`${job.action==='wash'?'Washing':job.action==='hold'?'Prepare at':'Cooking at'} ${EQUIPMENT_BY_ID[working.kind].name.toLowerCase()} · ${Math.ceil(job.remaining/20)}s`,disabled:job.action!=='hold'&&job.action!=='wash'};}
  const dirty=state.tables.flatMap(t=>t.seats.map(s=>({table:t,seat:s}))).find(p=>p.seat.status==='dirty');
  if(dirty)return {target:dirty.table.id,seatId:dirty.seat.id,label:'Clear the used plate'};
  return {target:'crate',label:'Take fresh ingredients'};
}
