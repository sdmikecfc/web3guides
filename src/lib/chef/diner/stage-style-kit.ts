import type { DinerState,HomePlacement } from './progression';
import type { RestaurantStage,RoomPlan } from './room-plan';
import { resolveRoomMount } from './room-plan';
import type { FinishSlot } from './collections';

export const STAGE_DECOR_KITS={burger_shop:[],diner:['diner_clock','bear_statue','deer_trophy','pie_display'],restaurant:['chandelier','wine_rack','deco_mirror','brass_planter']} as const;
export const stageDecorIds=(stage:RestaurantStage):readonly string[]=>STAGE_DECOR_KITS[stage];
export function stageDefaultSurfaces(stage:RestaurantStage){return stage==='diner'?{floor:'wood',wall:'diner_panel'}:stage==='restaurant'?{floor:'terrazzo',wall:'deco'}:{floor:'checker',wall:'cream'};}
/** Untouched stage finishes advance; an individually purchased choice stays chosen. */
export function stageFinishKit(state:Pick<DinerState,'cosmetics'|'finishOwned'|'renovation'>,stage:RestaurantStage):{cosmetics:DinerState['cosmetics'];finishOwned:Partial<Record<FinishSlot,string[]>>}{
 const cosmetics={...state.cosmetics},finishOwned:Partial<Record<FinishSlot,string[]>>={},defaults=stageDefaultSurfaces(stage);
 for(const slot of ['floor','wall'] as const){
  // A wood floor bought by the player is a choice, even though wood is also
  // the diner's default. Only documented gifts advance with the room stage.
  const stock=[slot==='floor'?'checker':'cream',...(state.renovation?.surfaceGifts?.[slot]??[])];
  if(stock.includes(cosmetics[slot])&&(state.finishOwned[slot]??[]).every(id=>stock.includes(id)))cosmetics[slot]=defaults[slot];
  if(!state.finishOwned[slot]?.includes(defaults[slot]))finishOwned[slot]=[defaults[slot]];
 }
 return {cosmetics,finishOwned};
}
/** Only used for an explicit fresh renovation preview, never over a saved layout. */
export function stageDecorLayout(plan:RoomPlan):HomePlacement[]{
 const mounted=(id:string,kind:'wall'|'counter'|'ceiling',targetId:string,slot:number):HomePlacement[]=>{
  const mount={kind,targetId,slot},at=resolveRoomMount(plan,mount);return at?[{id:`${plan.stage}-gift-${id}`,equipmentId:id,x:Math.floor(at.x),y:Math.floor(at.y),rotation:at.rotation,mount}]:[];
 };
 const floor=(equipmentId:string,x:number,y:number):HomePlacement=>({id:`${plan.stage}-gift-${equipmentId}`,equipmentId,x,y,rotation:0});
 if(plan.stage==='diner'){
  const bar=plan.modules.find(m=>m.kind==='chef_bar');
  return [...mounted('diner_clock','wall','outer-side',2),...mounted('deer_trophy','wall','outer-side',6),...(bar?mounted('pie_display','counter',bar.id,4):[]),floor('bear_statue',10,8)];
 }
 if(plan.stage==='restaurant')return [...mounted('chandelier','ceiling','ceiling',7*plan.w+6),...mounted('deco_mirror','wall','outer-side',4),floor('wine_rack',0,5),floor('brass_planter',12,10)];
 return [];
}
