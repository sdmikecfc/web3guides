import {EQUIPMENT, EQUIPMENT_BY_ID, INGREDIENT_BY_ID, RECIPES, RECIPE_BY_ID, ROUTES, isTruckEquipmentAvailable} from './content';
import {recipeDiscoveryRank} from './routes';
import {TRIP_BOOSTS} from './trip-boosts';
import type {DinerState,DinerRun} from './progression';

export type RoadsideGiftOffer={id:string;kind:'coins'|'recipe'|'equipment'|'upgrade'|'ingredients'|'special';target:string;amount:number};
export type RoadsideGift={version:1;nodeId:string;benchmark:number;offers:RoadsideGiftOffer[];claimed?:string};
const hash=(text:string)=>{let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
export function makeRoadsideGift(state:DinerState,run:DinerRun,benchmark:number):RoadsideGift{
  const seed=`${run.seed}:${run.position}:gift-v1`,number=(salt:string)=>hash(`${seed}:${salt}`),pick=<T,>(items:readonly T[],salt:string)=>items.length?items[number(salt)%items.length]:undefined;
  const offers:RoadsideGiftOffer[]=[{id:'coins',kind:'coins',target:'',amount:Math.max(100,Math.round(benchmark*(.4+(number('coins')%21)/100)/25)*25)}];
  const rank=Math.max(state.truckTier,ROUTES.find(r=>r.id===run.routeId)?.marketPool??1),cap=state.restaurantLevel>=12?3:2;
  const recipes=RECIPES.filter(r=>!r.secret&&!state.recipes[r.id]&&(r.route==='starter'||['tomato_pasta','vegetable_ramen'].includes(r.id)||recipeDiscoveryRank(r.route)<=rank));
  const equipment=EQUIPMENT.filter(e=>isTruckEquipmentAvailable(e.id)&&!e.domain&&!state.equipment[e.id]?.truckOwned&&['cooking','prep','cleaning'].includes(e.family));
  const upgrades=EQUIPMENT.filter(e=>isTruckEquipmentAvailable(e.id)&&state.equipment[e.id]?.truckOwned&&state.equipment[e.id].tier<cap&&e.tiers.some(t=>t.tier===state.equipment[e.id].tier+1));
  if(number('discovery')%100<60){
    const pools:Array<'recipe'|'equipment'|'upgrade'>=[];if(recipes.length)pools.push('recipe','recipe');if(equipment.length)pools.push('equipment','equipment');if(upgrades.length)pools.push('upgrade');
    const kind=pick(pools,'kind');const item=kind==='recipe'?pick(recipes,'recipe'):kind==='equipment'?pick(equipment,'equipment'):pick(upgrades,'upgrade');
    if(kind&&item)offers.push({id:'discovery',kind,target:item.id,amount:kind==='upgrade'?state.equipment[item.id].tier+1:1});
  }
  const boosts=TRIP_BOOSTS.filter(b=>!run.specials.includes(b.id)),boost=pick(boosts,'boost');
  const needed=[...new Set(run.menu.flatMap(id=>RECIPE_BY_ID[id].ingredients))].sort((a,b)=>(state.pantry[a]??0)-(state.pantry[b]??0));
  const ingredientAllowed=run.qualified&&!run.ingredientClaimed&&state.daily.truckRuns.length<2&&state.daily.minted<7;
  const extras:RoadsideGiftOffer[]=[];
  if(boost)extras.push({id:'special',kind:'special',target:boost.id,amount:1});
  if(ingredientAllowed&&needed.length)extras.push({id:'ingredients',kind:'ingredients',target:needed[0],amount:1});
  if(number('extras')%2)extras.reverse();
  offers.push(...extras.slice(0,3-offers.length));
  return {version:1,nodeId:run.position!,benchmark,offers};
}
export function giftOfferText(offer:RoadsideGiftOffer,state?:DinerState):{name:string;detail:string}{
  if(offer.kind==='coins')return {name:`${offer.amount.toLocaleString('en-US')} coins`,detail:'Added to your carried haul.'};
  if(offer.kind==='special'){const boost=TRIP_BOOSTS.find(b=>b.id===offer.target)!;return {name:boost.name,detail:`${boost.detail} Until this trip ends.`};}
  if(offer.kind==='ingredients')return {name:INGREDIENT_BY_ID[offer.target].name,detail:'One permanent recipe-upgrade ingredient. Uses this trip’s ingredient allowance.'};
  if(offer.kind==='recipe'){const recipe=RECIPE_BY_ID[offer.target],missing=[...new Set(recipe.steps.map(s=>s.station))].filter(id=>!state?.equipment[id]?.truckOwned);return {name:recipe.name,detail:`Recipe to keep.${missing.length?' Needs '+missing.map(id=>EQUIPMENT_BY_ID[id].name).join(' + ')+'.':' Choose it for a future menu.'}`};}
  return {name:EQUIPMENT_BY_ID[offer.target].name+(offer.kind==='upgrade'?` · tier ${offer.amount}`:''),detail:offer.kind==='upgrade'?'A permanent upgrade for your machine.':'Yours to keep. Serving supplies included where needed; matching recipes are learned separately.'};
}
export function validRoadsideGifts(run:DinerRun):boolean{
  if(run.gifts===undefined)return true;
  if(!run.gifts||typeof run.gifts!=='object'||Array.isArray(run.gifts)||Object.keys(run.gifts).length>12)return false;
  return Object.entries(run.gifts).every(([id,g])=>g&&g.version===1&&g.nodeId===id&&run.map.some(n=>n.id===id&&['bonus','ingredients'].includes(n.kind))&&Number.isFinite(g.benchmark)&&g.benchmark>=0&&g.benchmark<=1e6&&Array.isArray(g.offers)&&g.offers.length>0&&g.offers.length<=3&&new Set(g.offers.map(o=>o.id)).size===g.offers.length&&g.offers.every(o=>o&&typeof o.id==='string'&&o.id.length<=32&&Number.isSafeInteger(o.amount)&&o.amount>0&&o.amount<=1e6&&(o.kind==='coins'?o.target==='':o.kind==='recipe'?!!RECIPE_BY_ID[o.target]&&!RECIPE_BY_ID[o.target].secret:o.kind==='equipment'||o.kind==='upgrade'?isTruckEquipmentAvailable(o.target)&&o.amount<=3:o.kind==='ingredients'?!!INGREDIENT_BY_ID[o.target]&&o.amount===1:o.kind==='special'?TRIP_BOOSTS.some(b=>b.id===o.target)&&o.amount===1:false))&&(g.claimed===undefined?run.position===id:run.visited.includes(id)&&g.offers.some(o=>o.id===g.claimed)));
}
