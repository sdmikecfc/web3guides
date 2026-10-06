import type {DinerState} from './progression';
import {DECOR_BY_ID, roomFinishPrice, finishPrice, type RoomFinishSlot, type FinishSlot} from './collections';
import {STYLE_BUNDLES} from './progress-rewards';

export interface RoomStyle {id:string;name:string;description:string;stage:'burger_shop'|'diner'|'restaurant';decor:readonly string[];finishes:Partial<Record<RoomFinishSlot,string>>;surfaces?:Partial<Record<FinishSlot,string>>}
export const ROOM_STYLES:RoomStyle[]=[
  ...STYLE_BUNDLES.map(b=>({id:b.id,name:b.name,description:b.description,stage:'burger_shop' as const,decor:b.decor,finishes:{counter:b.counter}})),
  {id:'smalltown_evening',name:'Small-town evening',description:'Timber, favourite records and a pie waiting for the late shift.',stage:'diner',decor:['diner_clock','wall_records','pie_display'],finishes:{counter:'oak'},surfaces:{floor:'wood',wall:'diner_panel'}},
  {id:'golden_hour',name:'Golden hour',description:'Polished stone, brass lighting and a green dining-room accent.',stage:'restaurant',decor:['deco_mirror','brass_sconce','cafe_candles'],finishes:{counter:'sage'},surfaces:{floor:'terrazzo',wall:'deco'}},
];
export function roomStyleName(state:DinerState):string {
  return ROOM_STYLES.find(style=>Object.entries(style.finishes).every(([slot,id])=>state.home.finishes?.[slot as RoomFinishSlot]===id)&&Object.entries(style.surfaces??{}).every(([slot,id])=>state.cosmetics[slot as FinishSlot]===id)&&style.decor.every(id=>state.home.layout.some(p=>p.equipmentId===id)))?.name??'Your own mix';
}
export function roomStyleQuote(state:DinerState,id:string){
  const style=ROOM_STYLES.find(s=>s.id===id);if(!style)return null;
  const stages=['burger_shop','diner','restaurant'];
  if(stages.indexOf(state.home.roomPlan?.stage??'burger_shop')<stages.indexOf(style.stage))return null;
  const items=style.decor.filter(id=>!(state.decorOwned[id]>0));
  const finishes=Object.entries(style.finishes).filter(([slot,id])=>!state.paletteOwned?.[slot as RoomFinishSlot]?.includes(id!)) as [RoomFinishSlot,string][];
  const surfaces=Object.entries(style.surfaces??{}).filter(([slot,id])=>!state.finishOwned[slot as FinishSlot].includes(id!)) as [FinishSlot,string][];
  const cost=items.reduce((n,id)=>n+DECOR_BY_ID[id].price,0)+finishes.reduce((n,[slot,id])=>n+(roomFinishPrice(slot,id)??0),0)+surfaces.reduce((n,[slot,id])=>n+(finishPrice(slot,id)??0),0);
  return {style,items,finishes,surfaces,cost};
}
