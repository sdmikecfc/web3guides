import { DECOR_BY_ID, FRIENDSHIP_LEVELS, REGULARS, regularAvailable, regularFavourite, regularLevel } from '@/lib/chef/diner/collections';
import { EQUIPMENT_BY_ID, RECIPE_BY_ID, ROUTES, TRUCK_TIERS } from '@/lib/chef/diner/content';
import { DINER_RULES, type DinerState, type NodeKind } from '@/lib/chef/diner/progression';

export type CollectionAction='recipes'|'decorate'|'cook';
export interface RegularRequirement { label:string; met:boolean; action:CollectionAction }
/** Presentation derives from the same availability/receipt rules as serveRegular. */
export function regularBookEntry(state:DinerState,id:string){
  const regular=REGULARS.find(entry=>entry.id===id);if(!regular)return null;
  const favourite=regularFavourite(state,id),recipe=favourite?RECIPE_BY_ID[favourite]:undefined,menu=Object.values(state.home.menu).flat();
  const requirements:RegularRequirement[]=[];
  if(id==='mr_bell'&&!favourite)requirements.push({label:'Master a recipe at level 10',met:false,action:'recipes'});
  if(favourite&&!Object.hasOwn(state.recipes,favourite))requirements.push({label:`Discover ${recipe?.name??'their favourite recipe'}`,met:false,action:'recipes'});
  requirements.push({label:favourite?`${recipe?.name??'Their favourite'} on the home menu`:'A mastered dish on the home menu',met:!!favourite&&menu.includes(favourite),action:'recipes'});
  if(id==='dottie')requirements.push({label:'A daisy pot placed in the restaurant',met:state.home.layout.some(item=>item.equipmentId==='daisy_pot'),action:'decorate'});
  if(id==='rex')requirements.push({label:'A friendly or jazzy truck horn selected',met:state.cosmetics.horn!=='quiet',action:'cook'});
  if(id==='professor_lin')requirements.push({label:'Apple pie at recipe level 5 or higher',met:(state.recipes.apple_pie?.level??0)>=5,action:'recipes'});
  if(id==='kiki')requirements.push({label:'Visit a Boardwalk stop',met:state.collections.stamps.some(stamp=>stamp.startsWith('boardwalk:')),action:'cook'});
  if(id==='hendersons')requirements.push({label:'A table for four placed in the restaurant',met:state.home.layout.some(item=>item.equipmentId==='table_4'),action:'decorate'});
  const count=state.collections.regulars[id]??0,level=regularLevel(count),nextAt=FRIENDSHIP_LEVELS[level]??null;
  const available=regularAvailable(state,id),served=(state.daily.regularProgress[id]??0)+1e-9>=DINER_RULES.regularDailyServings,greeted=state.daily.regularServed.includes(id);
  const missingMachines=recipe?[...new Set(recipe.steps.map(step=>step.station))].filter(station=>!state.home.layout.some(item=>item.equipmentId===station)):[];
  const wait=missingMachines.length?`Place ${missingMachines.map(id=>EQUIPMENT_BY_ID[id]?.name.toLowerCase()??id).join(' and ')} at home so your staff can cook this dish.`:'Your restaurant staff serve automatically. Keep the cooking stations, tables and sink reachable, then check back after a meal.';
  return {regular,favourite,recipe,requirements,count,level,nextAt,available,served,greeted,ready:available&&served&&!greeted,wait,
    mementoName:DECOR_BY_ID[regular.memento]?.name??'Personal keepsake',mementoOwned:state.collections.mementos.includes(regular.memento)||(state.decorOwned[regular.memento]??0)>0,
    nextReward:nextAt===15?'A personal keepsake':nextAt===40?'One secret recipe scrap':nextAt?'Friendship recognition':'A friend for life'};
}

export const PASSPORT_STOP_NAMES:Record<NodeKind,string>={slow:'Easy service',medium:'Steady service',busy:'Busy service',special:'Special service',shop:'Equipment market',ingredients:'Ingredient stop',bonus:'A free gift',event:'Roadside encounter',finale:'The big finish'};
export function passportStamp(value:string){
  const [routeId,rowText,kind,...extra]=value.split(':'),route=ROUTES.find(entry=>entry.id===routeId),row=Number(rowText);
  if(!route||extra.length||!/^\d+$/.test(rowText??'')||!Number.isInteger(row)||row<0||row>=route.rows||!Object.hasOwn(PASSPORT_STOP_NAMES,kind))return null;
  return {id:value,routeId:route.id,routeName:route.name,stop:row+1,kind:kind as NodeKind,name:PASSPORT_STOP_NAMES[kind as NodeKind]};
}
export function passportRoute(state:DinerState,routeId:string){
  const route=ROUTES.find(entry=>entry.id===routeId);if(!route)return null;
  const stamps=[...new Set(state.collections.stamps)].flatMap(value=>{const stamp=passportStamp(value);return stamp?.routeId===routeId?[stamp]:[];}).sort((a,b)=>a.stop-b.stop||a.name.localeCompare(b.name));
  const recipes=route.recipeIds.map(id=>({id,name:RECIPE_BY_ID[id].name,owned:Object.hasOwn(state.recipes,id)})),owned=recipes.filter(recipe=>recipe.owned).length;
  const won=state.collections.routeWins.includes(route.id),earned=won&&owned===recipes.length,nextTier=TRUCK_TIERS[(route.tier+1) as keyof typeof TRUCK_TIERS];
  return {route,stamps,recipes,owned,won,earned,nextTier,open:state.truckTier>=route.tier,upgraded:state.truckTier>=nextTier.tier};
}
