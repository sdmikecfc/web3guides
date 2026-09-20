import { EQUIPMENT_BY_ID, INGREDIENT_BY_ID, RECIPE_BY_ID, SERVICE_RULES } from '../../../lib/chef/diner/content';
import { servicePath, stationWorkingCell, tableFootprint, targetPath } from '../../../lib/chef/diner/geometry';
import { serviceReadyError, serviceSupplyChoices, serviceTargetIntent, serviceMissingIngredients, serviceRecipeSteps } from '../../../lib/chef/diner/service';
import { recipeVessel, SERVING_VESSELS, vesselSupplyStation, type VesselKind } from '../../../lib/chef/diner/batch';
import type { Point, ServiceItem, ServiceState } from '../../../lib/chef/diner/types';

export interface TruckInteraction {targetId:string;seatId?:string;recipeId?:string;ingredientId?:string}
export interface LunchCoach {heading:string;detail:string;targetId:string|null}

/** Camera rotation is the same quarter-turn index used by DinerScene. */
export function keyboardDirection(key:string,rotation:number):Point|null {
  const directions:Record<string,Point>={w:{x:0,y:-1},arrowup:{x:0,y:-1},s:{x:0,y:1},arrowdown:{x:0,y:1},a:{x:-1,y:0},arrowleft:{x:-1,y:0},d:{x:1,y:0},arrowright:{x:1,y:0}};
  const normalized=key.toLowerCase(),base=Object.prototype.hasOwnProperty.call(directions,normalized)?directions[normalized]:null;if(!base||!Number.isFinite(rotation))return null;
  let {x,y}=base;const turns=((Math.round(rotation)%4)+4)%4;
  for(let i=0;i<turns;i++)[x,y]=[y,-x];return {x:x||0,y:y||0};
}

/** Buttons keep game shortcuts; text entry retains normal browser editing. */
export function isTypingTarget(target:{tagName?:string;isContentEditable?:boolean}|null):boolean {
  return !!target&&(target.isContentEditable===true||['INPUT','TEXTAREA','SELECT'].includes(target.tagName?.toUpperCase()??''));
}

const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
function requestedRecipe(service:ServiceState):string|undefined {
  return service.customers.filter(c=>c.phase==='seated').sort((a,b)=>a.patience-b.patience)[0]?.recipeId??service.config.menu[0];
}
const prepared=(service:ServiceState,item:ServiceItem|null):boolean=>!!item&&item.physical===true&&item.kind==='processed'&&item.step>=serviceRecipeSteps(service,item.recipeId).length;
const requiredVessel=(service:ServiceState,item:ServiceItem):VesselKind=>service.config.batchVersion===1?recipeVessel(item.recipeId):'plate';
const matchingVessel=(service:ServiceState,food:ServiceItem|null,vessel:ServiceItem|null):boolean=>!!food&&!!vessel&&vessel.kind==='plate'&&(vessel.vesselKind??'plate')===requiredVessel(service,food);
const component=(item:ServiceItem|null):boolean=>!!item?.physical&&item.kind==='ingredient'&&item.ingredientId!==RECIPE_BY_ID[item.recipeId].ingredients[0];
const missingIngredients=(item:ServiceItem|null):string[]=>item?serviceMissingIngredients(item):[];
function neededSupply(service:ServiceState):{recipeId:string;ingredientId:string}|null{
  const slots=service.stations.flatMap(station=>station.slots.map(slot=>({station,slot})));
  const waiting=slots.find(({station,slot})=>station.kind==='prep'&&slot.item&&!slot.job&&missingIngredients(slot.item).length);
  if(waiting)return {recipeId:waiting.slot.item!.recipeId,ingredientId:missingIngredients(waiting.slot.item)[0]};
  if(slots.some(({slot})=>slot.item&&!component(slot.item)&&slot.item.kind!=='plate'))return null;
  const storedComponent=slots.find(({slot})=>component(slot.item))?.slot.item;
  const recipeId=storedComponent?.recipeId??requestedRecipe(service),recipe=recipeId&&RECIPE_BY_ID[recipeId];
  return recipe?{recipeId:recipe.id,ingredientId:recipe.ingredients[0]}:null;
}

/** Choose an actionable target without inventing food, bypassing a route or discarding a good dish. */
export function nearestTruckInteraction(service:ServiceState,preferredId?:string):TruckInteraction|null {
  if(!['preparing','playing','closing'].includes(service.phase))return null;
  const held=service.chef.held,candidates:{action:TruckInteraction;distance:number;contextual:boolean;priority:number}[]=[],supply=service.config.physicalSupplies?neededSupply(service):null;
  const matchingGuests=held?.kind==='dish'?service.customers.filter(c=>c.phase==='seated'&&c.recipeId===held.recipeId):[];
  const orderNeedsClearing=matchingGuests.length>0&&matchingGuests.every(c=>service.tables.find(t=>t.id===c.tableId)?.seats.find(seat=>seat.id===c.seatId)?.item?.kind==='dirty');
  const add=(action:TruckInteraction,point:Point,reachable:boolean,contextual=true,priority=1)=>{
    if(reachable&&!serviceTargetIntent(service,action.targetId,action.seatId,action.recipeId).disabled)candidates.push({action,distance:distance(service.chef,point),contextual,priority});
  };
  for(const station of service.stations){
    const point=stationWorkingCell(station),isSupply=service.config.physicalSupplies&&['crate','fridge'].includes(station.kind);
    const choice=isSupply?serviceSupplyChoices(service,station.id).find(choice=>choice.recipeId===supply?.recipeId&&choice.ingredientId===supply?.ingredientId):undefined;
    const recipeId=choice?.recipeId??(station.kind==='crate'&&!service.config.physicalSupplies?requestedRecipe(service):undefined);
    const expected=held&&serviceRecipeSteps(service,held.recipeId)[held.step]?.station;
    let contextual=!held?true:held.kind==='burnt'?station.kind==='bin':held.kind==='dirty'?station.kind==='sink':held.kind==='dish'?false:station.kind===expected;
    if(held?.kind==='dish'&&orderNeedsClearing)contextual=['prep','pass'].includes(station.kind)&&station.slots.some(slot=>!slot.item);
    if(held?.kind==='plate')contextual=station.slots.some(slot=>prepared(service,slot.item)&&matchingVessel(service,slot.item,held))||station.kind==='prep';
    else if(prepared(service,held))contextual=station.slots.some(slot=>matchingVessel(service,held,slot.item))||station.kind==='prep';
    else if(component(held))contextual=station.kind==='prep';
    else if(!held&&service.config.physicalSupplies){
      if(isSupply)contextual=!!choice;
      else if(['plates','cups','boxes'].includes(station.kind))contextual=service.stations.some(s=>s.slots.some(slot=>slot.item&&prepared(service,slot.item)&&(!slot.batch||slot.batch.phase==='raised')&&vesselSupplyStation(requiredVessel(service,slot.item))===station.kind));
      else if(station.slots.some(slot=>slot.batch?.phase==='ready'))contextual=true;
      else if(station.slots.some(slot=>!slot.job&&(component(slot.item)||missingIngredients(slot.item).length>0)))contextual=false;
      else if(station.slots.some(slot=>prepared(service,slot.item)))contextual=false;
    }
    add({targetId:station.id,...(recipeId?{recipeId}:{}),...(choice?{ingredientId:choice.ingredientId}:{})},point,servicePath(service.config.tier,service.stations,service.tables,service.chef,point)!==null,contextual);
  }
  for(const table of service.tables){
    const reachable=targetPath(service.config.tier,service.stations,service.tables,service.chef,tableFootprint(table))!==null;
    for(const seat of table.seats)add({targetId:table.id,seatId:seat.id},seat,reachable,true,!held&&seat.item?.kind==='dirty'&&['reserved','occupied'].includes(seat.status)?0:1);
  }
  const byDistance=(a:typeof candidates[number],b:typeof candidates[number])=>a.distance-b.distance||a.action.targetId.localeCompare(b.action.targetId)||(a.action.seatId??'').localeCompare(b.action.seatId??'');
  const preferred=preferredId?candidates.filter(candidate=>candidate.action.targetId===preferredId).sort(byDistance)[0]:undefined;
  return preferred?.action??candidates.filter(candidate=>candidate.contextual).sort((a,b)=>a.priority-b.priority||byDistance(a,b))[0]?.action??null;
}

/** A short first-lunch story driven entirely by the live meal, job and seat state. */
export function firstLunchCoach(service:ServiceState):LunchCoach {
  const hint=(heading:string,detail:string,targetId:string|null=null):LunchCoach=>({heading,detail,targetId});
  if(service.phase==='setup')return hint('Get ready to cook',serviceReadyError(service)??'Open service when your truck is ready.');
  if(service.phase==='paused')return hint('Lunch is paused','Resume when you are ready.');
  if(service.phase==='failed')return hint('Time to regroup','Your trip summary explains what you brought home.');
  if(service.phase==='complete')return hint('Lunch is served','Choose your next stop or head home.');
  const held=service.chef.held;
  const waitingDirty=service.tables.flatMap(table=>table.seats.map(seat=>({table,seat}))).find(({seat})=>seat.item?.kind==='dirty'&&['reserved','occupied'].includes(seat.status));
  if(!held&&waitingDirty){const name=SERVING_VESSELS[waitingDirty.seat.item!.vesselKind??'plate'].name;return hint(`Clear the used ${name}`,'Your guest is waiting. Remove the old dish before serving their order.',waitingDirty.table.id);}
  const physical=physicalLunchCoach(service);if(physical)return physical;
  if(held){
    if(held.kind==='dirty'){const sink=service.stations.find(s=>s.kind==='sink'&&!serviceTargetIntent(service,s.id).disabled),name=SERVING_VESSELS[held.vesselKind??'plate'].name;return hint(`Bring the ${name} to the sink`,sink?'Put it in, then hold to wash.':`Make room in the sink for this ${name}.`,sink?.id??null);}
    if(held.kind==='burnt'){const bin=service.stations.find(s=>s.kind==='bin');return hint('Clear the burnt food','Use the bin, then try a fresh portion.',bin?.id??null);}
    if(held.kind==='dish'){
      const guests=service.customers.filter(c=>c.phase==='seated'&&c.recipeId===held.recipeId).sort((a,b)=>a.patience-b.patience);
      const guest=guests.find(c=>service.tables.find(t=>t.id===c.tableId)?.seats.find(seat=>seat.id===c.seatId)?.item?.kind!=='dirty');
      if(!guest&&guests.length){const counter=service.stations.find(station=>['prep','pass'].includes(station.kind)&&!serviceTargetIntent(service,station.id).disabled);return hint('Set the dish down first',counter?'Leave this order on the counter, then clear the old dish at your guest’s place.':'Make room on a counter so you can put this order down and clear the old dish.',counter?.id??null);}
      return guest?hint('Serve your guest',`Bring the ${RECIPE_BY_ID[held.recipeId].name.toLowerCase()} to their table.`,guest.tableId):hint('Keep the dish ready','Wait for a guest who ordered this dish.');
    }
    const recipe=RECIPE_BY_ID[held.recipeId],step=serviceRecipeSteps(service,held.recipeId)[held.step];
    const station=service.stations.find(s=>s.kind===step?.station&&!serviceTargetIntent(service,s.id).disabled);
    if(!step)return hint('Check this dish','Select a station to see what it needs.');
    const name=EQUIPMENT_BY_ID[step.station].name.toLowerCase();
    return hint(held.recipeId==='classic_burger'&&held.step===0?'Put the patty on the grill':held.recipeId==='classic_burger'&&held.step===1?'Add the bun':`Take it to the ${name}`,station?`${step.label}. Select the ${name} to put it down.`:`Make room at the ${name}.`,station?.id??null);
  }
  const ready=service.stations.find(s=>s.slots.some(slot=>slot.item&&(!slot.job||slot.job.ready)&&!(service.config.physicalSupplies&&(component(slot.item)||missingIngredients(slot.item).length>0)&&s.kind==='prep')));
  if(ready){const item=ready.slots.find(slot=>slot.item&&(!slot.job||slot.job.ready))!.item!;return hint(item.kind==='burnt'?'Remove the burnt food':item.kind==='dish'?'Pick up the finished dish':'Take the cooked food',`Select the ${EQUIPMENT_BY_ID[ready.kind].name.toLowerCase()} to collect it.`,ready.id);}
  const working=service.stations.find(s=>s.slots.some(slot=>slot.item&&slot.job&&!slot.job.ready));
  if(working){
    const slot=working.slots.find(slot=>slot.item&&slot.job&&!slot.job.ready)!,job=slot.job!,manual=job.action==='hold'||job.action==='wash';
    const seconds=Math.ceil(job.remaining/SERVICE_RULES.ticksPerSecond),name=EQUIPMENT_BY_ID[working.kind].name.toLowerCase();
    if(manual)return hint(job.action==='wash'?`Hold to wash the ${SERVING_VESSELS[slot.item?.vesselKind??'plate'].name}`:'Hold to finish the dish',`At the ${name}, hold the work control or E. Release to stop.`,working.id);
    if(slot.item?.kind==='dirty')return hint('The dish is washing',`${seconds}s remaining. Washing returns it to the clean supply.`,working.id);
    return hint('Let it cook',`${seconds}s remaining. ${job.burnRemaining!==null?'Collect it when ready, before it burns.':'Collect the food when it is ready.'}`,working.id);
  }
  const dirty=service.tables.flatMap(table=>table.seats.map(seat=>({table,seat}))).find(({seat})=>seat.item?.kind==='dirty');
  if(dirty)return hint(`Clear the used ${SERVING_VESSELS[dirty.seat.item?.vesselKind??'plate'].name}`,'Pick it up, then take it to the sink.',dirty.table.id);
  const eating=service.customers.find(c=>c.phase==='eating');
  if(eating&&service.served===1&&service.washed===0)return hint('Let your guest enjoy it','When they finish, pick up the dirty plate.',eating.tableId);
  if(service.tables.some(table=>table.seats.some(seat=>seat.status==='awaitingWash')))return hint('The plate is being cleared','A clean plate makes this seat ready for another guest.');
  if(service.spawned===service.config.customers&&service.customers.every(c=>['eating','leaving','gone'].includes(c.phase)))return hint('A good lunch','Your guests are finishing up.');
  if(service.config.physicalSupplies){const needed=neededSupply(service);if(needed)return supplyCoach(service,needed);}
  const recipeId=requestedRecipe(service),crate=service.stations.find(s=>s.kind==='crate'),recipe=recipeId?RECIPE_BY_ID[recipeId]:undefined;
  return hint('Take fresh ingredients',recipe?`Start a ${recipe.name.toLowerCase()} at the ingredient crate.`:'Choose a recipe at the ingredient crate.',crate?.id??null);
}

function supplyCoach(service:ServiceState,needed:{recipeId:string;ingredientId:string}):LunchCoach{
  const station=service.stations.find(s=>serviceSupplyChoices(service,s.id).some(choice=>choice.recipeId===needed.recipeId&&choice.ingredientId===needed.ingredientId));
  const name=needed.ingredientId==='beef'?'a raw patty':`the ${INGREDIENT_BY_ID[needed.ingredientId]?.name.toLowerCase()??'ingredient'}`;
  return {heading:`Take ${name}`,detail:station?`Collect it from the ${EQUIPMENT_BY_ID[station.kind].name.toLowerCase()}.`:'Install the required supply before cooking.',targetId:station?.id??null};
}
function physicalLunchCoach(service:ServiceState):LunchCoach|null{
  if(!service.config.physicalSupplies)return null;
  const held=service.chef.held,hint=(heading:string,detail:string,targetId:string|null=null):LunchCoach=>({heading,detail,targetId});
  const counter=service.stations.find(station=>station.kind==='prep'&&!serviceTargetIntent(service,station.id).disabled);
  if(!held){const readyBasket=service.stations.find(station=>station.slots.some(slot=>slot.batch?.phase==='ready'));if(readyBasket)return hint('Raise the fryer basket','Lift it out of the oil before portioning three servings.',readyBasket.id);}
  if(held?.kind==='plate'){
    const food=service.stations.find(station=>station.slots.some(slot=>prepared(service,slot.item)&&matchingVessel(service,slot.item,held))),name=SERVING_VESSELS[held.vesselKind??'plate'].name;
    return food?hint(held.vesselKind==='fry_box'?'Box one serving of fries':held.vesselKind==='cup'?'Pour into the cup':'Plate your finished food',`Bring this ${name} to the prepared food.`,food.id):hint(`Put the ${name} down`,'Leave it on the prep counter until the food is ready.',counter?.id??null);
  }
  if(prepared(service,held)){
    const plate=service.stations.find(station=>station.slots.some(slot=>matchingVessel(service,held,slot.item))),name=SERVING_VESSELS[requiredVessel(service,held!)].name;
    return plate?hint(`Use the ${name}`,`Bring the food to its ${name}.`,plate.id):hint('Put the food down first',`Leave it on the prep counter, then fetch a ${name}.`,counter?.id??null);
  }
  if(component(held))return hint(`Add the ${INGREDIENT_BY_ID[held!.ingredientId!]?.name.toLowerCase()??'ingredient'}`,'Bring it to the prep counter with your food.',counter?.id??null);
  if(held?.physical&&missingIngredients(held).length)return hint('Set it on the prep counter','Put down the cooked food, then collect the remaining ingredients.',counter?.id??null);
  if(held)return null;
  const finished=service.stations.find(station=>station.slots.some(slot=>prepared(service,slot.item)));
  if(finished){
    const food=finished.slots.find(slot=>prepared(service,slot.item))!.item!,kind=requiredVessel(service,food),name=SERVING_VESSELS[kind].name;
    const counterPlate=service.stations.find(station=>station.slots.some(slot=>matchingVessel(service,food,slot.item)));
    if(counterPlate)return hint(`Pick up the ${name}`,'Bring it to the prepared food.',counterPlate.id);
    const rack=service.stations.find(station=>station.kind===vesselSupplyStation(kind)&&!serviceTargetIntent(service,station.id).disabled);
    if(rack)return hint(kind==='plate'?'Fetch a clean plate':`Fetch a ${name}`,`The food is ready. Take a ${name} from its supply, then bring it back.`,rack.id);
    if(!service.stations.some(station=>station.kind===vesselSupplyStation(kind)))return hint(`Pack a ${name} supply`,'This menu needs its matching serving containers. Add the supply before the next service.');
    const dirty=service.tables.find(table=>table.seats.some(seat=>seat.item?.kind==='dirty'&&(seat.item.vesselKind??'plate')===kind));
    if(dirty)return hint(`Wash a ${name} for this dish`,`Clear a dirty ${name} and wash it before serving.`,dirty.id);
    const sink=service.stations.find(station=>station.kind==='sink'&&station.slots.some(slot=>slot.item?.kind==='dirty'&&(slot.item.vesselKind??'plate')===kind));
    if(sink)return hint(`Wash a ${name} for this dish`,`Finish washing the ${name} at the sink before collecting your food.`,sink.id);
    const eating=service.customers.find(customer=>customer.phase==='eating'&&(service.config.batchVersion===1?recipeVessel(customer.recipeId):'plate')===kind);
    return hint(`Wait for a clean ${name}`,`When a guest finishes, clear and wash their ${name}.`,eating?.tableId??null);
  }
  const waiting=service.stations.flatMap(station=>station.slots.map(slot=>({station,slot}))).find(({station,slot})=>station.kind==='prep'&&!slot.job&&missingIngredients(slot.item).length);
  if(waiting)return supplyCoach(service,{recipeId:waiting.slot.item!.recipeId,ingredientId:missingIngredients(waiting.slot.item)[0]});
  return null;
}
