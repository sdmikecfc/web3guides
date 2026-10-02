/** Restaurant changes are explicit plans; an old room is never silently replaced. */
import type { DinerState, HomePlacement } from './progression';
import { createDinerCareer, type DinerCareer } from './career';
import { createRestaurantBlueprint, RESTAURANT_STAGES, ROOM_FIXTURES, resolveRoomMount, roomSeatStyles, type RestaurantStage, type RoomModuleKind, type RoomPlan, type StoolStyle } from './room-plan';
import { ROUTES } from './content';
import { STARTER_TRINKETS, ROOM_FINISH_DEFAULTS, type RoomFinishSlot, type FinishSlot } from './collections';
import { stageDecorIds, stageDecorLayout, stageFinishKit } from './stage-style-kit';

export type FixtureInventory=Record<string,{kind:RoomModuleKind;condition:number;width?:number}>;
export type StoolInventory=Record<StoolStyle,number>;
export function installedStools(plan?:RoomPlan):StoolInventory {const counts={classic:0,diner:0};for(const module of plan?.modules??[])for(const style of roomSeatStyles(module))counts[style]++;return counts;}
export function stoolOwnershipError(plan:RoomPlan|undefined,owned:StoolInventory):string|null {const used=installedStools(plan);return used.classic>owned.classic||used.diner>owned.diner?'Place only stools you own; buy another stool or use one from storage.':null;}
export interface RenovationBackup {id:string;at:number;stage:RestaurantStage|null;w:number;h:number;expansion:number;layout:HomePlacement[];roomPlan?:RoomPlan;staff:DinerState['home']['staff'];finishes?:Record<RoomFinishSlot,string>;cosmetics?:DinerState['cosmetics']}
export interface RenovationState {version:1;completed:RestaurantStage[];baseline:Pick<DinerCareer,'services'|'introductory'|'byDifficulty'|'multiRecipe'>;backups:RenovationBackup[];boothGrant?:{version:1;granted:true};dinerPaletteGranted?:true;styleKitGranted?:RestaurantStage[];surfaceGifts?:Partial<Record<FinishSlot,string[]>>}
export const RENOVATION_RULES={version:1,introductoryCreditLimit:12,
  diner:{cost:25000,services:100,mediumOrHarder:12,multiRecipe:4,recipesAt3:3,recipesAt5:0,route:'downtown'},
  restaurant:{cost:60000,services:100,busyOrHarder:18,multiRecipe:6,recipesAt3:6,recipesAt5:2,route:'boardwalk'},
  fixturePrices:{toilet:600,handwash_sink:350,chef_bar:3000},maintenance:{clean:0,repair:75},
  stoolPrices:{classic:350,diner:650},stoolUpholsteryPrice:450,
} as const;
export function createRenovationState(stage?:RestaurantStage):RenovationState{return {version:1,completed:stage?[stage]:[],baseline:{services:0,introductory:0,byDifficulty:{},multiRecipe:{two:0,three:0}},backups:[]};}
export function fixtureInventoryFor(plan:RoomPlan):FixtureInventory{return Object.fromEntries(plan.modules.map(m=>[m.id,{kind:m.kind,condition:m.condition??100,...(m.width===undefined?{}:{width:m.width})}]));}
export function currentRestaurantStage(state:Pick<DinerState,'home'>):RestaurantStage|null{return state.home.roomPlan?.stage??null;}
export function stageDefaultFinishes(stage:RestaurantStage):Record<RoomFinishSlot,string>{return {...ROOM_FINISH_DEFAULTS,...(stage==='burger_shop'?{}:{counter:'oak'})};}
/** Renovations offer a coordinated palette, but never overwrite purchased choices. */
export function dinerFinishKit(state:Pick<DinerState,'home'|'paletteOwned'>):{finishes:Record<RoomFinishSlot,string>;includedPalette:Partial<Record<RoomFinishSlot,string[]>>}{
  const finishes={...ROOM_FINISH_DEFAULTS,...state.home.finishes},defaults=stageDefaultFinishes('diner'),includedPalette:Partial<Record<RoomFinishSlot,string[]>>={};
  for(const slot of ['counter'] as const){const owned=state.paletteOwned?.[slot]??[ROOM_FINISH_DEFAULTS[slot]];
    if(finishes[slot]===ROOM_FINISH_DEFAULTS[slot]&&owned.length===1&&owned[0]===ROOM_FINISH_DEFAULTS[slot])finishes[slot]=defaults[slot];
    if(!owned.includes(defaults[slot]))includedPalette[slot]=[defaults[slot]];
  }
  return {finishes,includedPalette};
}
/** A furnished welcome kit for a brand-new room, never applied over a player's layout. */
export function starterTrinketLayout(plan:RoomPlan):HomePlacement[] {
  if(plan.stage!=='burger_shop')return [];
  const counter=plan.modules.find(m=>m.kind==='display_counter'),console=plan.modules.find(m=>m.kind==='console');
  const mounts:Array<{equipmentId:string;mount:NonNullable<HomePlacement['mount']>}>=[];
  if(counter)mounts.push({equipmentId:'burger_mascot',mount:{kind:'counter',targetId:counter.id,slot:1}});
  if(console)mounts.push({equipmentId:'retro_radio',mount:{kind:'counter',targetId:console.id,slot:0}},{equipmentId:'condiment_caddy',mount:{kind:'counter',targetId:console.id,slot:2}});
  mounts.push({equipmentId:'burger_print',mount:{kind:'wall',targetId:'outer-side',slot:4}});
  const layout:HomePlacement[]=mounts.flatMap(({equipmentId,mount})=>{const at=resolveRoomMount(plan,mount);return at?[{id:`welcome-${equipmentId}`,equipmentId,x:Math.floor(at.x),y:Math.floor(at.y),rotation:at.rotation,mount}]:[];});
  layout.push({id:'welcome-daisy_pot',equipmentId:'daisy_pot',x:8,y:6,rotation:0},{id:'welcome-welcome_mat',equipmentId:'welcome_mat',x:Math.floor(plan.w/2),y:plan.h-1,rotation:0});
  return layout;
}
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
  // The new bar is furniture, not a free upgrade of the player's seating.
  // Carry the installed styles first, then any owned stools that fit from storage.
  const stoolStock=state.home.stools??installedStools(state.home.roomPlan),carried=(state.home.roomPlan?.modules??[]).flatMap(roomSeatStyles),remaining={...stoolStock};
  for(const module of plan.modules)if(module.kind==='console'||module.kind==='chef_bar'){
    module.seatStyles=[];for(const style of [...carried,...Array.from({length:stoolStock.classic},()=>'classic' as const),...Array.from({length:stoolStock.diner},()=>'diner' as const)])if(module.seatStyles.length<ROOM_FIXTURES[module.kind].capacity&&remaining[style]>0){module.seatStyles.push(style);remaining[style]--;}
    if(!state.home.roomPlan&&!module.seatStyles.length)module.seatStyles=['classic','classic','classic'];
  }
  const staff={chefs:Math.max(blueprint.staff.chefs,state.home.staff.chefs),waiters:Math.max(blueprint.staff.waiters,state.home.staff.waiters+(stage==='burger_shop'?0:state.home.staff.cashiers??0)),cashiers:stage==='burger_shop'?Math.max(blueprint.staff.cashiers,state.home.staff.cashiers??0):0};
  for(const module of plan.modules){const previous=owned[module.id];if(['toilet','handwash_sink'].includes(module.kind)){if(previous?.kind===module.kind)module.condition=previous.condition;}else module.id=`${stage}-${module.id}`;}
  const includedDecor:Record<string,number>=stage==='burger_shop'&&!state.starterTrinkets?Object.fromEntries(STARTER_TRINKETS.map(id=>[id,1])):!state.renovation?.styleKitGranted?.includes(stage)?Object.fromEntries(stageDecorIds(stage).map(id=>[id,1])):{};
  if(stage==='burger_shop'&&Object.keys(includedDecor).length)blueprint.layout.push(...starterTrinketLayout(plan));
  blueprint.layout.push(...stageDecorLayout(plan).filter(p=>(state.decorOwned[p.equipmentId]??0)+(includedDecor[p.equipmentId]??0)>0));
  const surfaceKit=stageFinishKit(state,stage),includedFinishes:Partial<Record<FinishSlot,string[]>>=state.renovation?.styleKitGranted?.includes(stage)?{}:surfaceKit.finishOwned;
  const cosmetics={...surfaceKit.cosmetics};for(const slot of ['floor','wall'] as const)if(!state.finishOwned[slot].includes(cosmetics[slot])&&!includedFinishes[slot]?.includes(cosmetics[slot]))cosmetics[slot]=state.cosmetics[slot];
  const includesTables=stage==='restaurant'&&!state.renovation?.completed.includes(stage),includedFurniture:Record<string,number>=includesTables?{table_2:3}:{};
  if(stage==='diner'&&!state.renovation?.boothGrant)includedFurniture.booth_2=1;
  const {finishes,includedPalette}=stage==='diner'?dinerFinishKit(state):{finishes:{...ROOM_FINISH_DEFAULTS,...state.home.finishes},includedPalette:{} as Partial<Record<RoomFinishSlot,string[]>>};
  // Existing appliances can supply the blueprint; missing core copies are a
  // one-time room kit for legacy adoption, never repeats on undo/re-renovation.
  for(const placement of blueprint.layout){if(placement.equipmentId==='table_2'||placement.equipmentId==='booth_2'||Object.hasOwn(includedDecor,placement.equipmentId)||stageDecorIds(stage).includes(placement.equipmentId))continue;if(!(state.equipment[placement.equipmentId]?.homeCopies))includedFurniture[placement.equipmentId]=1;}
  const used:Record<string,number>={};for(const p of blueprint.layout)used[p.equipmentId]=(used[p.equipmentId]??0)+1;
  const retainedStorage=Object.fromEntries(Object.entries(state.equipment).map(([id,item])=>[id,Math.max(0,item.homeCopies+(includedFurniture[id as keyof typeof includedFurniture]??0)-(used[id]??0))]).filter(([,n])=>Number(n)>0));
  const oldPlan=state.home.roomPlan?{...state.home.roomPlan,modules:state.home.roomPlan.modules.map(({condition,...module})=>module)}:undefined;
  const token=`renovation-v1:${hash({stage,home:{w:state.home.w,h:state.home.h,layout:state.home.layout,roomPlan:oldPlan,finishes:state.home.finishes,stools:state.home.stools},paletteOwned:state.paletteOwned,cosmetics:state.cosmetics,finishOwned:state.finishOwned,styleKitGranted:state.renovation?.styleKitGranted,surfaceGifts:state.renovation?.surfaceGifts??{},equipment:state.equipment,decorOwned:state.decorOwned,starterTrinkets:state.starterTrinkets,staff:state.home.staff,completed:state.renovation?.completed,boothGrant:state.renovation?.boothGrant,services:state.career?.services,cost:requirements.cost})}`;
  return {...requirements,stage,token,roomPlan:plan,layout:blueprint.layout,staff,finishes,includedPalette,cosmetics,includedFinishes,includedFurniture,includedDecor,retainedStorage,before:{w:state.home.w,h:state.home.h,layout:structuredClone(state.home.layout),roomPlan:state.home.roomPlan?structuredClone(state.home.roomPlan):undefined,finishes:{...ROOM_FINISH_DEFAULTS,...state.home.finishes},cosmetics:{...state.cosmetics}}};
}
