/** Restaurant changes are explicit plans; an old room is never silently replaced. */
import type { DinerState, HomePlacement } from './progression';
import { createDinerCareer, type DinerCareer } from './career';
import { createRestaurantBlueprint, RESTAURANT_STAGES, type RestaurantStage, type RoomModuleKind, type RoomPlan } from './room-plan';
import { ROUTES } from './content';

export type FixtureInventory=Record<string,{kind:RoomModuleKind;condition:number}>;
export interface RenovationBackup {id:string;at:number;stage:RestaurantStage|null;w:number;h:number;expansion:number;layout:HomePlacement[];roomPlan?:RoomPlan;staff:DinerState['home']['staff']}
export interface RenovationState {version:1;completed:RestaurantStage[];baseline:Pick<DinerCareer,'services'|'introductory'|'byDifficulty'|'multiRecipe'>;backups:RenovationBackup[]}
export const RENOVATION_RULES={version:1,introductoryCreditLimit:12,
  diner:{cost:25000,services:100,mediumOrHarder:12,multiRecipe:4,recipesAt3:3,recipesAt5:0,route:'downtown'},
  restaurant:{cost:60000,services:100,busyOrHarder:18,multiRecipe:6,recipesAt3:6,recipesAt5:2,route:'boardwalk'},
  fixturePrices:{toilet:600,handwash_sink:350,chef_bar:3000},maintenance:{clean:0,repair:75},
} as const;
export function createRenovationState(stage?:RestaurantStage):RenovationState{return {version:1,completed:stage?[stage]:[],baseline:{services:0,introductory:0,byDifficulty:{},multiRecipe:{two:0,three:0}},backups:[]};}
export function fixtureInventoryFor(plan:RoomPlan):FixtureInventory{return Object.fromEntries(plan.modules.map(m=>[m.id,{kind:m.kind,condition:m.condition??100}]));}
export function currentRestaurantStage(state:Pick<DinerState,'home'>):RestaurantStage|null{return state.home.roomPlan?.stage??null;}
export interface RenovationRequirement {id:string;label:string;current:number;target:number;met:boolean}
export function renovationRequirements(state:DinerState,requested?:RestaurantStage){
  const currentStage=currentRestaurantStage(state),nextStage:RestaurantStage|null=currentStage===null?'burger_shop':currentStage==='burger_shop'?'diner':currentStage==='diner'?'restaurant':null,stage=requested??nextStage;
  const career=state.career??createDinerCareer(state.updatedAt),base=state.renovation?.baseline??createRenovationState().baseline,requirements:RenovationRequirement[]=[];
  const add=(id:string,label:string,current:number,target:number)=>requirements.push({id,label,current,target,met:current>=target});
  if(stage==='diner'||stage==='restaurant'){
    const rule=RENOVATION_RULES[stage],levels=Object.values(state.recipes).map(r=>r.level),additional=stage==='restaurant'?base.services:0;
    const intro=career.introductory-(stage==='restaurant'?base.introductory:0);
    add('services',`${rule.services} career services${stage==='restaurant'?' since opening the diner':''} · introductory lunches count up to ${RENOVATION_RULES.introductoryCreditLimit}`,Math.max(0,career.services-additional-Math.max(0,intro-RENOVATION_RULES.introductoryCreditLimit)),rule.services);
    const kinds=stage==='diner'?['medium','busy','special','finale']:['busy','special','finale'];
    add('difficulty',stage==='diner'?'Medium or harder services':'Busy or harder services',kinds.reduce((n,k)=>n+(career.byDifficulty[k]??0)-(stage==='restaurant'?base.byDifficulty[k]??0:0),0),stage==='diner'?RENOVATION_RULES.diner.mediumOrHarder:RENOVATION_RULES.restaurant.busyOrHarder);
    const multi=stage==='diner'?'two':'three';add('variety',`Services actually serving ${stage==='diner'?'two':'three'} different dishes`,career.multiRecipe[multi]-(stage==='restaurant'?base.multiRecipe[multi]:0),rule.multiRecipe);
    add('mastery3','Recipes at level 3 or higher',levels.filter(l=>l>=3).length,rule.recipesAt3);
    if(rule.recipesAt5)add('mastery5','Recipes at level 5 or higher',levels.filter(l=>l>=5).length,rule.recipesAt5);
    add('route',`${ROUTES.find(r=>r.id===rule.route)?.name??rule.route} finale cleared`,state.collections.routeWins.includes(rule.route)?1:0,1);
  }
  const cost=stage==='diner'||stage==='restaurant'?RENOVATION_RULES[stage].cost:0;
  add('coins','Banked kitchen coins',state.coins,cost);
  const available=!!stage&&stage===nextStage&&!state.run&&!state.rally.service;
  return {stage,currentStage,nextStage,cost,requirements,allowed:available&&requirements.every(r=>r.met),reason:!stage?'Your restaurant has reached its final stage.':stage!==nextStage?'Renovate one stage at a time.':state.run||state.rally.service?'Return home before renovating.':null};
}
function hash(value:unknown){const text=JSON.stringify(value);let n=2166136261;for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);return (n>>>0).toString(16);}
export function getRenovationPreview(state:DinerState,requested?:RestaurantStage){
  const requirements=renovationRequirements(state,requested);if(!requirements.stage)return null;
  const stage=requirements.stage,blueprint=createRestaurantBlueprint(stage),owned=state.home.fixtureInventory??{},plan=blueprint.roomPlan;
  const staff={chefs:Math.max(blueprint.staff.chefs,state.home.staff.chefs),waiters:Math.max(blueprint.staff.waiters,state.home.staff.waiters+(stage==='burger_shop'?0:state.home.staff.cashiers??0)),cashiers:stage==='burger_shop'?Math.max(blueprint.staff.cashiers,state.home.staff.cashiers??0):0};
  for(const module of plan.modules){const previous=owned[module.id];if(['toilet','handwash_sink'].includes(module.kind)){if(previous?.kind===module.kind)module.condition=previous.condition;}else module.id=`${stage}-${module.id}`;}
  const includesTables=stage==='restaurant'&&!state.renovation?.completed.includes(stage),includedFurniture:Record<string,number>=includesTables?{table_2:3}:{};
  // Existing appliances can supply the blueprint; missing core copies are a
  // one-time room kit for legacy adoption, never repeats on undo/re-renovation.
  for(const placement of blueprint.layout){if(placement.equipmentId==='table_2')continue;if(!(state.equipment[placement.equipmentId]?.homeCopies))includedFurniture[placement.equipmentId]=1;}
  const used:Record<string,number>={};for(const p of blueprint.layout)used[p.equipmentId]=(used[p.equipmentId]??0)+1;
  const retainedStorage=Object.fromEntries(Object.entries(state.equipment).map(([id,item])=>[id,Math.max(0,item.homeCopies+(includedFurniture[id as keyof typeof includedFurniture]??0)-(used[id]??0))]).filter(([,n])=>Number(n)>0));
  const oldPlan=state.home.roomPlan?{...state.home.roomPlan,modules:state.home.roomPlan.modules.map(({condition,...module})=>module)}:undefined;
  const token=`renovation-v1:${hash({stage,home:{w:state.home.w,h:state.home.h,layout:state.home.layout,roomPlan:oldPlan},equipment:state.equipment,staff:state.home.staff,completed:state.renovation?.completed,services:state.career?.services,cost:requirements.cost})}`;
  return {...requirements,stage,token,roomPlan:plan,layout:blueprint.layout,staff,includedFurniture,retainedStorage,before:{w:state.home.w,h:state.home.h,layout:structuredClone(state.home.layout),roomPlan:state.home.roomPlan?structuredClone(state.home.roomPlan):undefined}};
}
