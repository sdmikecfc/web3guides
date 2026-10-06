import {validSignature} from './personal-touches';
import {newServiceStats} from './service-experience';
import {customerTraits,businessOrder} from './customer-traits';
import {communityIdentity} from './community-customers';
import {cleanupDrain,leaveServiceMess,workServiceMess} from './cleanup';
import { CONTENT_VERSION, DAILY_SPECIALS, DIFFICULTIES, EQUIPMENT_BY_ID, INGREDIENT_BY_ID, ingredientSupply, RECIPE_BY_ID, SERVICE_RULES, SPICES, TRUCK_TIERS, recipePrice } from './content';
import { blockedCells, inServiceFloor, isAtStationAccess, makeStation, makeTable, pointKey, serviceGeometry, servicePath, serviceQueueSlots, starterStations, starterTables, stationAccessPath, stationFootprint, tableFootprint, targetPath, validateServiceLayout } from './geometry';
import type { CreateServiceOptions, CustomerType, Point, RecipeStep, ServiceAction, ServiceCustomer, ServiceEvent, ServiceHelper, ServiceItem, ServiceResult, ServiceSeat, ServiceState, ServiceStation, ServiceTable, StationSlot } from './types';
export type * from './types';
import {createFryBatch,markFryBatchReady,raiseFryBatch,burnFryBatch,takeFryPortion,validateFryBatch,createBoilBasket,validateBoilBasket,takeBoilerPortion,isSoup,boilerPortions,recipeVessel,vesselReusable,SERVING_VESSELS,type VesselKind} from './batch';
import {serviceSchedule,protectedLesson,earlyPatienceFloor} from './service-schedule';
import {createDomainBatch,validDomainBatch,takeDomainPortion} from './domain-cooking';
import {isDomainId} from './domain-worlds';
import {COMPONENT_WARMTH,COMPONENT_NAMES,COMPONENT_RECIPES,componentForOutput,compatibleAssemblies,auxiliaryChicken} from './prepared-components';
export function serviceRecipeSteps(s:Pick<ServiceState,'config'>,recipeId:string):RecipeStep[]{
  const steps=RECIPE_BY_ID[recipeId]?.steps??[];
  if(s.config.cookingVersion===1&&recipeId==='chicken_ramen')return steps.filter(step=>step.station!=='grill');
  if(s.config.cookingVersion===1&&s.config.batchVersion&&recipeId==='fries')return [...steps,{station:'prep',action:'instant',ticks:0,label:'Finish fries portion',output:'prepared_fries'}];
  return recipeId==='fries'&&!s.config.batchVersion?steps.slice(1):steps;
}
export function serviceAssemblyChoices(s:ServiceState):string[]{return s.config.cookingVersion===1?compatibleAssemblies(s.config.menu,s.chef.held):[];}
const vesselOf=(item:ServiceItem):VesselKind=>item.vesselKind??'plate';
export const isUsedFriesBox=(item:ServiceItem|null|undefined):boolean=>item?.kind==='dirty'&&item.vesselKind==='fry_box';
const foodVessel=(s:ServiceState,item:ServiceItem):VesselKind=>s.config.batchVersion?recipeVessel(item.recipeId):'plate';
const supplyVessel=(station:ServiceStation):VesselKind=>station.kind==='cups'?'cup':station.kind==='boxes'?'fry_box':station.kind==='bowls'?'bowl':'plate';
const stockFor=(s:ServiceState,kind:VesselKind)=>kind==='cup'?s.cupStock:kind==='bowl'?s.bowlStock:s.plateStock;
const updateVesselCounts=(s:ServiceState):void=>{s.cleanPlates=s.plateStock.length;s.cleanCups=s.cupStock.length;s.cleanBowls=s.bowlStock.length;};
function returnVessel(s:ServiceState,item:ServiceItem):void{const kind=vesselOf(item);if(!vesselReusable(kind))return;const stock=stockFor(s,kind);if(!stock.includes(item.id))stock.push(item.id);updateVesselCounts(s);}

/** Additive defaults for canonical as well as local saves. Never pauses a
 * service, restocks a vessel pool, advances time or changes existing items. */
export function normalizeServiceAdditions(s:ServiceState):void {
  s.config.maxWaitingCustomers??=4;
  // Existing checkpoints retain their arrival sequence and food timers.
  s.config.pacingVersion??=0;
  s.config.destinationVersion??=0;s.config.environment??='street';s.config.cleanupLesson??=false;s.messes??=[];s.lastMessTick??=-300;s.cleanupIntroduced??=false;s.businessOrders??=[];
  s.config.cookingVersion??=0;s.config.boilerVersion??=0;
  s.config.wageVersion??=0;s.config.demandVersion??=0;
  s.config.pacingProfile??='standard';s.config.lessonVersion??=0;
  s.lessonStatus??='none';s.arrivalCursor??=0;s.arrivalSchedule??=[];
  s.config.bowlCount??=0;s.cleanBowls??=0;s.bowlStock??=[];
  if(s.config.recipeLevels)for(const id of Object.keys(RECIPE_BY_ID))s.config.recipeLevels[id]??=0;
  if(s.config.counterVersion===undefined){
    // The old tier-one pass was sold with a heat lamp. Keep that purchased
    // benefit and every staged object when adopting the new upgrade model.
    if(Array.isArray(s.stations))for(const station of s.stations)if(station.kind==='pass'&&station.tier===1&&Array.isArray(station.slots)){
      station.tier=2;while(station.slots.length<EQUIPMENT_BY_ID.pass.tiers[1].capacity)station.slots.push({item:null,job:null});
    }
    s.config.counterVersion=1;
  }
  if(s.chef)s.chef.targetItemId??=null;for(const helper of s.helpers??[])helper.targetItemId??=null;
}


const coldTicks = (s:ServiceState):number => s.config.pacingVersion>=1?SERVICE_RULES.coldTicks:SERVICE_RULES.legacyColdTicks;
const copy = <T>(value:T):T => JSON.parse(JSON.stringify(value));
const integer = (value:unknown,fallback:number,min:number,max:number):number => typeof value==='number' && Number.isFinite(value) ? Math.max(min,Math.min(max,Math.floor(value))) : fallback;
function seedNumber(seed:string):number { let n=2166136261; for(let i=0;i<seed.length;i++) n=Math.imul(n^seed.charCodeAt(i),16777619); return n>>>0 || 1; }
function random(s:ServiceState):number { let n=s.rng; n^=n<<13;n^=n>>>17;n^=n<<5;s.rng=n>>>0;return s.rng/4294967296; }
function id(s:ServiceState,prefix:string):string { return `${prefix}_${s.nextId++}`; }
function emit(s:ServiceState,type:ServiceEvent['type'],targetId:string,amount?:number):void { s.events.push({id:s.nextId++,tick:s.tick,type,targetId,...(amount===undefined?{}:{amount})}); if(s.events.length>SERVICE_RULES.maxEvents)s.events.shift(); }
function clearTarget(s:ServiceState):void { s.chef.targetId=null;s.chef.targetSeatId=null;s.chef.targetRecipeId=null;s.chef.targetIngredientId=null;s.chef.targetItemId=null;s.chef.holding=false; }
function notice(s:ServiceState,message:string):void { s.notice=message; }
const active = (s:ServiceState):boolean => s.phase==='preparing'||s.phase==='playing'||s.phase==='closing';
export function createService(options:CreateServiceOptions={}):ServiceState {
  const tier=integer(options.tier,1,1,4) as 1|2|3|4, seed=typeof options.seed==='string'?options.seed.slice(0,200):'diner-opening';
  const levels:Record<string,number>={}; for(const key of Object.keys(RECIPE_BY_ID)) levels[key]=integer(options.recipeLevels?.[key],0,0,10);
  const menu=[...new Set((options.menu??['classic_burger','fries']).filter(id=>typeof id==='string'&&RECIPE_BY_ID[id]))].slice(0,4);
  const rack=(options.stations??starterStations(tier)).find(station=>station.kind==='plates'),plateCount=options.physicalSupplies===false?0:integer(options.plateCount,rack?EQUIPMENT_BY_ID.plates.tiers[rack.tier-1].capacity:0,0,24);
  const batchVersion=options.batchVersion===0?0:options.batchVersion===1?1:options.physicalSupplies===false?0:1,cupRack=(options.stations??starterStations(tier)).find(station=>station.kind==='cups'),cupCount=batchVersion&&cupRack?integer(options.cupCount,EQUIPMENT_BY_ID.cups.tiers[cupRack.tier-1].capacity,0,24):0;
  const bowlRack=(options.stations??starterStations(tier)).find(station=>station.kind==='bowls'),bowlCount=batchVersion&&bowlRack?integer(options.bowlCount,EQUIPMENT_BY_ID.bowls.tiers[bowlRack.tier-1].capacity,0,24):0;
  const s:ServiceState={stats:newServiceStats(),version:1,contentVersion:CONTENT_VERSION,phase:'setup',pausedPhase:null,tick:0,rng:seedNumber(seed),nextId:1,
    chef:{...serviceGeometry(tier).door,path:[],held:null,targetId:null,targetSeatId:null,targetRecipeId:null,targetIngredientId:null,targetItemId:null,holding:false},helpers:[],
    stations:options.stations?options.stations.map(st=>makeStation(st.id,st.kind,st.x,st.y,st.tier,st.facing)):starterStations(tier),
    tables:options.tables?options.tables.map(t=>makeTable(t.id,t.x,t.y,t.capacity,t.tier,t.rotation??0)):starterTables(tier),customers:[],
    config:{seed,tier,menu,recipeLevels:levels,customers:integer(options.customers,DIFFICULTIES.slow.customers,1,80),arrivalTicks:integer(options.arrivalTicks,DIFFICULTIES.slow.arrivalTicks,20,2400),maxWaitingCustomers:integer(options.maxWaitingCustomers,4,1,4),queuePatienceTicks:integer(options.queuePatienceTicks,DIFFICULTIES.slow.queuePatienceTicks,20,12000),tablePatienceTicks:integer(options.tablePatienceTicks,DIFFICULTIES.slow.tablePatienceTicks,20,12000),cosy:options.cosy===true,practice:options.practice===true,strikeLimit:integer(options.strikeLimit,options.cosy?5:3,1,5),tutorialFailure:options.tutorialFailure===true,customerTypes:(options.customerTypes??['walk_in']).filter(t=>['walk_in','office','kid','family','critic','influencer','regular','party','business'].includes(t)),specials:[...new Set((options.specials??[]).filter(k=>(DAILY_SPECIALS as readonly string[]).includes(k)))].slice(0,3),spices:[...new Set((options.spices??[]).filter(k=>(SPICES as readonly string[]).includes(k)))],helpers:[],tipMultiplier:integer(options.tipMultiplier,1,1,2),tutorialLearning:options.tutorialLearning===true,physicalSupplies:options.physicalSupplies!==false,plateCount,cupCount,bowlCount,batchVersion,counterVersion:1,pacingVersion:options.pacingVersion===0?0:1},
    cleanBowls:bowlCount,bowlStock:Array.from({length:bowlCount},(_,i)=>`service_bowl_${i+1}`),cleanCups:cupCount,cupStock:Array.from({length:cupCount},(_,i)=>`service_cup_${i+1}`),cleanPlates:plateCount,plateStock:Array.from({length:plateCount},(_,i)=>`service_plate_${i+1}`),spawned:0,nextArrival:20,coins:0,reputation:0,strikes:0,combo:0,served:0,paid:0,missed:0,burnt:0,washed:0,notice:'Choose your menu and open for service.',events:[],influenceRemaining:0};
  if(options.completionBonus!==undefined)s.config.completionBonus=integer(options.completionBonus,0,0,100000);
  s.config.wageVersion=options.wageVersion===1?1:0;s.config.demandVersion=options.demandVersion===1?1:0;
  s.config.pacingVersion=options.pacingVersion===0||options.pacingVersion===1?options.pacingVersion:2;
  s.config.pacingProfile=options.pacingProfile&&['first','second','third','slow','standard','destination','relaxed','steady','rush','finale'].includes(options.pacingProfile)?options.pacingProfile:(s.config.arrivalTicks===600?'slow':'standard');
  s.config.lessonVersion=options.lessonVersion===0?0:1;
  s.config.cookingVersion=options.cookingVersion===0?0:1;
  s.config.destinationVersion=options.destinationVersion===0?0:1;s.config.environment=options.environment&&['street','festival','business','boardwalk','night_market'].includes(options.environment)?options.environment:'street';s.config.cleanupLesson=options.cleanupLesson===true;s.messes=[];s.lastMessTick=-300;s.cleanupIntroduced=false;s.businessOrders=[];
  if(options.signature&&validSignature(options.signature))s.config.signature=copy(options.signature);
  s.config.boilerVersion=options.boilerVersion===0?0:1;
  if(isDomainId(options.domain))s.config.domain=options.domain;
  if(!s.config.boilerVersion)for(const st of s.stations)if(st.kind==='boiler'&&st.tier===3)st.slots=st.slots.slice(0,2);
  s.lessonStatus=s.config.lessonVersion===1&&s.config.tutorialLearning?'active':'none';
  s.arrivalCursor=0;s.arrivalSchedule=s.config.pacingVersion===2?serviceSchedule(s.config):[];
  if(!s.config.customerTypes.length)s.config.customerTypes=['walk_in'];
  s.config.helpers=(options.spices?.includes('short_staffed')?[]:(options.helpers??[])).filter((helper,i,all)=>helper&&/^[a-zA-Z0-9_-]{1,64}$/.test(helper.id)&&['washer','runner','prep'].includes(helper.role)&&all.findIndex(h=>h.id===helper.id)===i).slice(0,s.config.wageVersion===1?(tier>=2?2:1):TRUCK_TIERS[tier].helpers).map(helper=>({id:helper.id,role:helper.role,look:integer(helper.look,0,0,7),name:typeof helper.name==='string'?helper.name.slice(0,24):undefined,outfit:['classic','cherry','mint'].includes(helper.outfit??'')?helper.outfit:undefined}));
  s.helpers=s.config.helpers.map(helper=>({...copy(s.chef),...helper,task:null}));
  const error=serviceReadyError(s); if(error)s.notice=error;
  return s;
}
export function serviceReadyError(s:ServiceState):string|null {
  const invalid=validateServiceLayout(s.config.tier,s.stations,s.tables);if(invalid)return invalid;
  if(s.config.physicalSupplies){const ingredients=s.config.menu.flatMap(id=>RECIPE_BY_ID[id]?[RECIPE_BY_ID[id].ingredients[0],...(RECIPE_BY_ID[id].assemblyIngredients??[])]:[]);for(const kind of new Set(ingredients.map(ingredientSupply)))if(!s.stations.some(station=>station.kind===kind))return `Place the ${EQUIPMENT_BY_ID[kind].name.toLowerCase()} before opening.`;if(!s.config.batchVersion&&!s.stations.some(st=>st.kind==='plates'))return 'Place the clean plate rack before opening.';}
  if(!s.config.menu.length)return 'Choose at least one recipe.';
  if(s.config.spices.includes('full_menu')&&s.config.menu.length<3)return 'Full menu requires three recipes.';
  for(const recipeId of s.config.menu) { const recipe=RECIPE_BY_ID[recipeId]; if(!recipe)return 'Unknown recipe.';for(const step of recipeId==='chicken_ramen'?recipe.steps:serviceRecipeSteps(s,recipeId))if(!s.stations.some(st=>st.kind===step.station))return `${recipe.name} needs a ${EQUIPMENT_BY_ID[step.station].name.toLowerCase()}.`; }
  if(s.config.batchVersion)for(const id of s.config.menu){const kind=SERVING_VESSELS[recipeVessel(id)].supply;if(kind&&!s.stations.some(st=>st.kind===kind))return `Place the ${EQUIPMENT_BY_ID[kind].name.toLowerCase()} before opening.`;}
  return null;
}
export function serviceResult(s:ServiceState):ServiceResult { return {coins:s.config.practice?0:s.coins,reputation:s.config.practice?0:s.reputation,strikes:s.strikes,completed:s.phase==='complete',failed:s.phase==='failed',served:s.served,missed:s.missed,practice:s.config.practice}; }
/** Local checkpoint validation, never proof of earned progress. Active saves resume paused. */
export function sanitizeService(raw:unknown,options:{diagnosticReplay?:boolean}={}):ServiceState|null {
  try {
    if(!raw||typeof raw!=='object')return null;
    const s=copy(raw) as ServiceState;
    if(s.version!==1||s.contentVersion!==CONTENT_VERSION||!s.config||typeof s.config.seed!=='string'||s.config.seed.length>200||!TRUCK_TIERS[s.config.tier])return null;
    if(s.helpers===undefined)s.helpers=[];if(s.config.helpers===undefined)s.config.helpers=[];if(s.config.tipMultiplier===undefined)s.config.tipMultiplier=1;if(s.config.tutorialLearning===undefined)s.config.tutorialLearning=false;if(s.config.physicalSupplies===undefined)s.config.physicalSupplies=false;
    s.config.batchVersion??=0;s.config.cupCount??=0;s.cleanCups??=0;s.cupStock??=[];
    normalizeServiceAdditions(s);
    if(Array.isArray(s.stations))for(const st of s.stations)if(st.kind==='sink'&&Array.isArray(st.slots)){const capacity=EQUIPMENT_BY_ID.sink.tiers[st.tier-1]?.capacity??0;while(st.slots.length<capacity)st.slots.push({item:null,job:null});}
    if(s.chef)s.chef.targetIngredientId??=null;for(const helper of s.helpers)helper.targetIngredientId??=null;
    if(!s.config.physicalSupplies){s.config.plateCount??=0;s.cleanPlates??=0;s.plateStock??=[];}
    if(Array.isArray(s.tables))for(const table of s.tables)if(table&&table.rotation===undefined)table.rotation=0;
    if(!Array.isArray(s.stations)||!Array.isArray(s.tables)||!Array.isArray(s.customers)||s.customers.length>80||!Array.isArray(s.config.menu)||s.config.menu.length<1||s.config.menu.length>4||new Set(s.config.menu).size!==s.config.menu.length||s.config.menu.some(id=>!RECIPE_BY_ID[id]))return null;
    if(!Array.isArray(s.config.specials)||!Array.isArray(s.config.spices)||!Array.isArray(s.config.customerTypes)||!s.config.recipeLevels||(s.phase==='setup'?validateServiceLayout(s.config.tier,s.stations,s.tables,{allowIncomplete:true}):serviceReadyError(s)))return null;
    if(![0,1].includes(s.config.boilerVersion??0)||![0,1].includes(s.config.destinationVersion??0)||!['street','festival','business','boardwalk','night_market'].includes(s.config.environment??'street'))return null;
    if(!Array.isArray(s.messes)||s.messes.length>4||s.messes.some(m=>!m||typeof m.id!=='string'||!Number.isInteger(m.x)||!Number.isInteger(m.y)||!Number.isInteger(m.progress)||m.progress<0||m.progress>=60||!Number.isInteger(m.createdTick)||m.createdTick>s.tick||!inServiceFloor(s.config.tier,m)||blockedCells(s.stations,s.tables).has(pointKey(m)))||new Set(s.messes.map(m=>m.id)).size!==s.messes.length||new Set(s.messes.map(pointKey)).size!==s.messes.length||!Number.isInteger(s.lastMessTick)||s.lastMessTick!>s.tick||typeof s.cleanupIntroduced!=='boolean'||!Array.isArray(s.businessOrders)||s.businessOrders.length>2||s.businessOrders.some(id=>!s.config.menu.includes(id))||(!s.config.destinationVersion&&s.messes.length))return null;
    const whole=(v:unknown,max=1e9):boolean=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
    if(s.stats!==undefined&&(!s.stats||s.stats.version!==1||Object.entries(s.stats).some(([key,value])=>!['version','food','tips','queuePeak','queueTicks','prepTicks','maxCombo','servedWarm'].includes(key)||!whole(value))||Object.keys(newServiceStats()).some(key=>!Object.hasOwn(s.stats!,key))||s.stats.queuePeak>4||s.stats.maxCombo>10||s.stats.prepTicks>s.tick||s.stats.servedWarm>s.served||s.stats.food+s.stats.tips!==s.coins))return null;
    if(!['setup','preparing','playing','closing','paused','complete','failed'].includes(s.phase)||![null,'preparing','playing','closing'].includes(s.pausedPhase))return null;
    for(const key of ['tick','rng','nextId','spawned','coins','reputation','strikes','combo','served','paid','missed','burnt','washed','influenceRemaining'] as const)if(!whole(s[key],key==='rng'?4294967295:1e9))return null;
    if(s.spawned!==s.customers.length||s.spawned>s.config.customers||s.served>s.spawned||s.paid>s.served||s.missed+s.served>s.spawned||s.combo>10||s.strikes>5||!Number.isFinite(s.nextArrival))return null;
    const normalized=createService({...s.config,stations:s.stations,tables:s.tables});
    if(!['none','active','complete','skipped'].includes(s.lessonStatus!)||!whole(s.arrivalCursor,80)||!Array.isArray(s.arrivalSchedule)||(options.diagnosticReplay?s.arrivalSchedule.length>80||s.arrivalSchedule.some(n=>!whole(n,100000)):JSON.stringify(s.arrivalSchedule)!==JSON.stringify(normalized.arrivalSchedule)))return null;
    if(s.config.lessonVersion===0&&s.lessonStatus!=='none')return null;
    if(s.lessonStatus==='active'&&(!s.config.tutorialLearning||s.spawned>1)||s.lessonStatus==='complete'&&(!s.customers[0]?.washed||s.customers[0]?.servedTick===null))return null;
    if(Object.keys(s.config).some(key=>!Object.hasOwn(normalized.config,key))||Object.keys(normalized.config).some(key=>key==='recipeLevels'?Object.keys(normalized.config.recipeLevels).some(id=>normalized.config.recipeLevels[id]!==s.config.recipeLevels[id])||Object.keys(s.config.recipeLevels).some(id=>!Object.hasOwn(RECIPE_BY_ID,id)):JSON.stringify(normalized.config[key as keyof typeof normalized.config])!==JSON.stringify(s.config[key as keyof typeof s.config])))return null;
    const occupied=blockedCells(s.stations,s.tables), validPosition=(p:Point):boolean=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&inServiceFloor(s.config.tier,{x:Math.round(p.x),y:Math.round(p.y)})&&!occupied.has(pointKey({x:Math.round(p.x),y:Math.round(p.y)}));
    const validPath=(p:Point&{path:Point[]}):boolean=>validPosition(p)&&Array.isArray(p.path)&&p.path.length<300&&p.path.every((q,i)=>validPosition(q)&&Number.isInteger(q.x)&&Number.isInteger(q.y)&&(i?Math.abs(q.x-p.path[i-1].x)+Math.abs(q.y-p.path[i-1].y)===1:Math.abs(q.x-p.x)+Math.abs(q.y-p.y)<=1.01));
    if(!whole(s.config.plateCount,24)||!whole(s.cleanPlates,s.config.plateCount)||!Array.isArray(s.plateStock)||s.plateStock.length!==s.cleanPlates||new Set(s.plateStock).size!==s.plateStock.length||s.plateStock.some(id=>typeof id!=='string'||!id.length||id.length>64))return null;
    if(![0,1].includes(s.config.batchVersion)||!whole(s.config.cupCount,24)||!whole(s.cleanCups,s.config.cupCount)||!Array.isArray(s.cupStock)||s.cupStock.length!==s.cleanCups||new Set(s.cupStock).size!==s.cupStock.length||s.cupStock.some(id=>typeof id!=='string'||!id.length||id.length>64||s.plateStock.includes(id)))return null;
    if(!whole(s.config.bowlCount,24)||!whole(s.cleanBowls,s.config.bowlCount)||!Array.isArray(s.bowlStock)||s.bowlStock.length!==s.cleanBowls||new Set(s.bowlStock).size!==s.bowlStock.length||s.bowlStock.some(id=>typeof id!=='string'||!id.length||id.length>64||s.plateStock.includes(id)||s.cupStock.includes(id)))return null;
    const plateIds=new Set(s.plateStock),cupIds=new Set(s.cupStock),bowlIds=new Set(s.bowlStock),registerPlate=(id:string,kind:VesselKind)=>{if(!vesselReusable(kind))return true;if(plateIds.has(id)||cupIds.has(id)||bowlIds.has(id))return false;(kind==='cup'?cupIds:kind==='bowl'?bowlIds:plateIds).add(id);return true;};
    const itemIds=new Set<string>([...s.plateStock,...s.cupStock,...s.bowlStock]), validItem=(item:ServiceItem|null):boolean=>{
      if(item===null)return true;
      if(!item||typeof item.id!=='string'||item.id.length>64||itemIds.has(item.id)||!Object.hasOwn(RECIPE_BY_ID,item.recipeId)||!['ingredient','plate','raw','processed','dish','burnt','dirty'].includes(item.kind)||!whole(item.step,serviceRecipeSteps(s,item.recipeId).length)||!whole(item.createdTick,s.tick)||typeof item.stage!=='string'||typeof item.cold!=='boolean'||(item.finishedTick!==undefined&&!whole(item.finishedTick,s.tick)))return false;
      if(item.kind==='dirty'&&((!item.meal&&!item.physical)||(item.meal&&!s.customers.some(c=>c.mealId===item.meal!.mealId&&c.tableId===item.meal!.tableId&&c.seatId===item.meal!.seatId&&c.servedTick!==null&&!c.washed))))return false;
      if(item.vesselKind!==undefined&&!Object.hasOwn(SERVING_VESSELS,item.vesselKind))return false;
      if(item.warmthTicks!==undefined&&(s.config.cookingVersion!==1||!whole(item.warmthTicks,COMPONENT_WARMTH)))return false;
      if(item.preparedComponent!==undefined&&(s.config.cookingVersion!==1||!Object.hasOwn(COMPONENT_NAMES,item.preparedComponent)||!['processed','dish','burnt'].includes(item.kind)))return false;
      itemIds.add(item.id);
      if(item.physical!==undefined&&typeof item.physical!=='boolean')return false;
      if(item.kind==='ingredient'&&(!item.physical||!item.ingredientId||!Object.hasOwn(INGREDIENT_BY_ID,item.ingredientId)||![RECIPE_BY_ID[item.recipeId].ingredients[0],...(RECIPE_BY_ID[item.recipeId].assemblyIngredients??[])].includes(item.ingredientId)))return false;
      if(item.kind==='plate'&&!item.physical)return false;
      if(item.components!==undefined){if(!Array.isArray(item.components)||item.components.length>8||new Set(item.components.map(c=>c.ingredientId)).size!==item.components.length)return false;for(const component of item.components){if(!component||typeof component.id!=='string'||!component.id.length||component.id.length>64||itemIds.has(component.id)||!RECIPE_BY_ID[item.recipeId].assemblyIngredients?.includes(component.ingredientId))return false;itemIds.add(component.id);}}
      if(item.plateId!==undefined){if(typeof item.plateId!=='string'||!item.plateId.length||item.plateId.length>64||itemIds.has(item.plateId))return false;itemIds.add(item.plateId);}
      if(item.physical&&item.kind==='dish'&&!item.plateId)return false;
      if(item.physical&&['plate','dirty'].includes(item.kind)&&!registerPlate(item.id,vesselOf(item)))return false;
      if(item.plateId&&!registerPlate(item.plateId,vesselOf(item)))return false;
      return true;
    };
    const validItemTarget=(actor:ServiceState['chef'])=>actor.targetItemId===null||typeof actor.targetItemId==='string'&&actor.targetItemId.length>0&&actor.targetItemId.length<=64;
    if(!s.chef||!validPath(s.chef)||!validItem(s.chef.held)||!validItemTarget(s.chef)||typeof s.chef.holding!=='boolean'||!Array.isArray(s.helpers)||s.helpers.length!==s.config.helpers.length)return null;
    for(const [i,helper] of s.helpers.entries())if(helper.id!==s.config.helpers[i].id||helper.role!==s.config.helpers[i].role||!validPath(helper)||!validItem(helper.held)||!validItemTarget(helper)||typeof helper.holding!=='boolean'||(helper.task&&(!['wash','deliver','prep'].includes(helper.task.kind)||!['take','deliver','work'].includes(helper.task.phase))))return null;
    for(const station of s.stations){
      const capacity=station.kind==='boiler'&&station.tier===3&&!s.config.boilerVersion?2:EQUIPMENT_BY_ID[station.kind].tiers[station.tier-1].capacity;
      if(!Array.isArray(station.slots)||station.slots.length!==capacity)return null;
      for(const slot of station.slots){
        if(!validItem(slot.item))return null;
        if(slot.batch&&(!s.config.batchVersion||station.kind!=='fryer'||!slot.item||!['fries','cheese_fries'].includes(slot.item?.recipeId??'')||!validateFryBatch(slot.batch)||slot.batch.createdTick>s.tick||!slot.job||(slot.batch.phase==='cooking'&&slot.job.ready)||(slot.batch.phase!=='cooking'&&!slot.job.ready)||(slot.batch.phase==='raised'&&slot.job.burnRemaining!==null)||(slot.batch.phase==='burnt'&&slot.item.kind!=='burnt')||(slot.batch.phase!=='burnt'&&slot.item.kind==='burnt')))return null;
        if(slot.portions){
          const batch=slot.portions,item=slot.item,job=slot.job;
          if(!validDomainBatch(batch,station.kind)||!item||!job||slot.batch||slot.boil||item.recipeId!==batch.recipeId||batch.createdTick>s.tick||batch.ready!==job.ready||item.step!==(batch.ready?1:0))return null;
        }else if(['steamer','wine_station'].includes(station.kind)&&slot.item)return null;
        if(slot.boil){
          const boil=validateBoilBasket(slot.boil),item=slot.item,job=slot.job;
          if(boil?.version===2&&(!s.config.boilerVersion||boil.total!==boilerPortions(station.tier)))return null;
          if(!boil||station.kind!=='boiler'||!item||!job||slot.batch||item.recipeId!==boil.recipeId||boil.createdTick>s.tick||job.action!=='timed'||job.burnRemaining!==null)return null;
          if(boil.phase==='cooking'?(job.ready||item.step!==0||!['ingredient','raw'].includes(item.kind)):( !job.ready||item.step!==1||item.kind!=='processed'))return null;
          const output=RECIPE_BY_ID[item.recipeId].steps[0].output,drained=isSoup(item.recipeId)?output:RECIPE_BY_ID[item.recipeId].ingredients[0]==='pasta'?'drained_pasta':'drained_noodles';
          if(boil.phase==='ready'&&item.stage!==output||boil.phase==='drained'&&item.stage!==drained)return null;
        }else if(station.kind==='boiler'&&slot.item)return null;
        const job=slot.job;if(job&&(!slot.item||!['instant','hold','timed','risk','wash'].includes(job.action)||!whole(job.remaining,12000)||!whole(job.total,12000)||job.remaining>job.total||(job.burnRemaining!==null&&!whole(job.burnRemaining,12000))||typeof job.ready!=='boolean'))return null;
      }
    }
    const customerIds=new Set<string>();for(const c of s.customers){if(!c||typeof c.id!=='string'||customerIds.has(c.id)||!validPath(c)||!s.config.menu.includes(c.recipeId)||!['queue','walking','seated','eating','leaving','gone'].includes(c.phase)||!Number.isFinite(c.patience)||!Number.isFinite(c.maxPatience)||!whole(c.eatRemaining,12000)||!whole(c.payment)||!whole(c.tip)||typeof c.servedCold!=='boolean')return null;customerIds.add(c.id);}
    for(const table of s.tables)for(const seat of table.seats)if(!['clean','reserved','occupied','eating','dirty','awaitingWash'].includes(seat.status)||!validItem(seat.item)||(seat.customerId!==null&&!customerIds.has(seat.customerId)))return null;
    if(plateIds.size!==s.config.plateCount||cupIds.size!==s.config.cupCount||bowlIds.size!==s.config.bowlCount)return null;
    for(const table of s.tables)for(const seat of table.seats)if(seat.status==='awaitingWash'&&!seat.item){seat.status='clean';seat.mealId=null;seat.customerId=null;}
    if(s.chef.targetId!==null&&!s.stations.some(st=>st.id===s.chef.targetId)&&!s.tables.some(t=>t.id===s.chef.targetId)&&!s.messes?.some(m=>m.id===s.chef.targetId))return null;
    s.events=Array.isArray(s.events)?s.events.filter(e=>e&&whole(e.id)&&whole(e.tick,s.tick)&&['arrive','sit','ready','burn','serve','pay','strike','wash','complete'].includes(e.type)&&typeof e.targetId==='string').slice(-SERVICE_RULES.maxEvents):[];
    s.notice=typeof s.notice==='string'?s.notice.slice(0,300):'';
    arrangeServiceQueue(s,true);
    if(!options.diagnosticReplay){if(active(s)){s.pausedPhase=s.phase as 'preparing'|'playing'|'closing';s.phase='paused';}s.chef.holding=false;}
    return s;
  } catch {return null;}
}
export function itemLabel(item:ServiceItem|null):string { if(!item)return 'Empty hands';if(item.kind==='dirty')return `${isUsedFriesBox(item)?'Used':'Dirty'} ${SERVING_VESSELS[vesselOf(item)].name}`;if(item.kind==='plate')return `${vesselReusable(vesselOf(item))?'Clean':'Empty'} ${SERVING_VESSELS[vesselOf(item)].name}`;if(item.kind==='ingredient')return item.ingredientId==='beef'?'Raw patty':INGREDIENT_BY_ID[item.ingredientId??'']?.name??'Ingredient';const name=RECIPE_BY_ID[item.recipeId]?.name??'Food';if(item.kind==='processed'&&!preparedFood(item)&&item.components?.some(c=>c.ingredientId==='bun'))return `Bun + cooked ${item.recipeId==='fried_chicken_sandwich'?'chicken':'patty'} · ready to assemble`;if(item.preparedComponent&&item.kind==='processed'&&!preparedFood(item))return `${item.cold?'Cold ':''}${COMPONENT_NAMES[item.preparedComponent]}`;if(preparedFood(item))return `${name} · needs a ${SERVING_VESSELS[recipeVessel(item.recipeId)].name}`;return item.kind==='dish'?`${item.cold?'Cold ':''}${name}`:item.kind==='burnt'?`Burnt ${name.toLowerCase()}`:`${name}: ${item.stage.replaceAll('_',' ')}`; }
export function serviceSupplyChoices(s:ServiceState,stationId:string):{ingredientId:string;recipeId:string;recipeIds:string[];name:string}[]{
  const station=s.stations.find(item=>item.id===stationId);if(!station||!['crate','fridge'].includes(station.kind)||!s.config.physicalSupplies)return [];
  const choices=s.config.menu.flatMap(recipeId=>{const recipe=RECIPE_BY_ID[recipeId];return [recipe.ingredients[0],...(recipe.assemblyIngredients??[])].filter(ingredientId=>ingredientSupply(ingredientId)===station.kind).map(ingredientId=>({ingredientId,recipeId,recipeIds:[recipeId],name:ingredientId==='beef'?'Raw patty':INGREDIENT_BY_ID[ingredientId]?.name??ingredientId}));});
  if(s.config.cookingVersion!==1)return choices;
  const unique=new Map<string,typeof choices[number]>();for(const choice of choices){const prior=unique.get(choice.ingredientId);if(prior){if(!prior.recipeIds.includes(choice.recipeId))prior.recipeIds.push(choice.recipeId);}else unique.set(choice.ingredientId,choice);}return [...unique.values()];
}
export type ServiceIntent = { label:string;disabled:boolean;hold:boolean;progress?:number;reason?:string;target?:{id:string;seatId?:string;slot?:number;itemId?:string};action?:'interact'|'hold'|'blocked';movement?:{available:boolean;only:boolean};recovery?:{targetId:string;label:string} };
/** Use the same seat and refusal reason for hints, routing and the actual handoff.
 * An explicit seat is never redirected. A general table action can skip a dirty
 * place when another matching guest has room for their dish. */
function tableInteraction(s:ServiceState,table:ServiceTable,seatId?:string|null):{seat?:ServiceSeat;error?:string}{
  const held=s.chef.held,seats=seatId?table.seats.filter(seat=>seat.id===seatId):table.seats;
  if(!seats.length)return {error:'That seat does not belong to this table.'};
  if(held&&held.kind!=='dish'){
    if(isPlatableServiceFood(s,held)){const vessel=SERVING_VESSELS[foodVessel(s,held)].name;return {error:`This food needs a ${vessel}. Take it to the ${vessel} supply.`};}
    if(held.kind==='plate')return {error:'This serving dish is empty. Collect prepared food with it first.'};
    if(held.kind==='dirty')return {error:isUsedFriesBox(held)?'Take this used fries box to the bin.':'Take this dirty dish to the sink first.'};
    if(held.kind==='burnt')return {error:'Take burnt food to the bin.'};
    return {error:'Finish preparing this food before serving it.'};
  }
  if(!held){
    const dirty=seats.filter(seat=>seat.item?.kind==='dirty');
    const seat=dirty.find(seat=>['reserved','occupied'].includes(seat.status))??dirty[0];
    return seat?{seat}:{error:'There is no dirty dish at this seat.'};
  }
  const waiting=seats.filter(seat=>seat.status==='occupied'&&s.customers.some(c=>c.id===seat.customerId&&c.phase==='seated'));
  const matching=waiting.filter(seat=>s.customers.some(c=>c.id===seat.customerId&&c.recipeId===held.recipeId));
  const seat=seatId?seats[0]:matching.find(seat=>!seat.item)??matching[0];
  if(!seat){
    if(waiting.length)return {error:`Nobody at this table ordered ${RECIPE_BY_ID[held.recipeId].name.toLowerCase()}.`};
    return {error:seats.some(seat=>seat.status==='reserved')?'Wait for the guest to sit down before serving.':seats.some(seat=>seat.status==='eating')?'These guests have already been served.':'Nobody is waiting for food at this table.'};
  }
  const customer=s.customers.find(c=>c.id===seat.customerId);
  if(seat.status==='eating'||customer?.phase==='eating')return {error:'This guest has already been served.'};
  if(seat.status==='reserved'||customer?.phase==='walking')return {error:'Wait for this guest to sit down before serving.'};
  if(seat.status!=='occupied'||customer?.phase!=='seated')return {error:'Nobody is waiting for food at this seat.'};
  if(customer.recipeId!==held.recipeId)return {error:`This guest ordered ${RECIPE_BY_ID[customer.recipeId].name.toLowerCase()}.`};
  if(seat.item)return {error:'Clear the old dish before serving this guest.'};
  if(s.config.spices.includes('picky_eaters')&&(s.config.recipeLevels[held.recipeId]??0)<3)return {error:'Picky eaters require recipe level three.'};
  return {seat};
}
/** Text and hold semantics come from the same recipe/job data as the interaction. */
function serviceTargetFeedback(s:ServiceState,targetId:string,seatId?:string,recipeId?:string,itemId?:string):ServiceIntent {
  const mess=s.messes?.find(m=>m.id===targetId);if(mess)return {label:s.chef.held?'Put down your held item first':'Hold to mop · 3 seconds',disabled:!!s.chef.held,hold:!s.chef.held,progress:mess.progress/60};
  const station=s.stations.find(st=>st.id===targetId),table=s.tables.find(t=>t.id===targetId),held=s.chef.held;
  const stop=(label:string,reason=label):ServiceIntent=>({label,disabled:true,hold:false,reason});
  if(!station&&!table)return stop('Choose a station or table');
  if(!active(s))return stop(s.phase==='setup'?'Open to start cooking':s.phase==='paused'?'Resume service':'Service has ended');
  const portion=station?.slots.find(slot=>slot.portions?.ready&&(!itemId||slot.item?.id===itemId));
  if(portion?.portions&&(!held||held.kind==='plate'))return portion.portions.recipeId==='house_red'?(held?.kind==='plate'&&vesselOf(held)==='cup'?{label:`Pour a glass · ${portion.portions.remaining} left`,disabled:false,hold:false}:stop('Bring a clean glass from the cup stand')):held?stop('Take a mandu portion with empty hands'):{label:`Take mandu · ${portion.portions.remaining} portions`,disabled:false,hold:false};
  if(station?.kind==='boiler'&&itemId){const slot=station.slots.find(slot=>slot.item?.id===itemId);if(!slot)return stop('That batch is no longer here');if(!slot.job?.ready)return stop('This batch is still cooking');if(isSoup(slot.item!.recipeId))return held?.kind==='plate'&&vesselOf(held)==='bowl'?{label:'Ladle one soup portion',disabled:false,hold:false}:stop('Bring a clean bowl');if(held)return stop('Put down held item first');return {label:slot.boil?.phase==='ready'?'Lift & drain noodles':'Take one portion',disabled:false,hold:false};}
  if(station?.kind==='pass'){
    if(held)return itemId?stop('Put down held item first'):station.slots.some(slot=>!slot.item)?{label:`Put down ${itemLabel(held).toLowerCase()}`,disabled:false,hold:false}:stop('Holding counter is full');
    const stored=station.slots.find(slot=>slot.item&&(!itemId||slot.item.id===itemId));return stored?{label:`Take ${itemLabel(stored.item).toLowerCase()}`,disabled:false,hold:false}:stop(itemId?'That item is no longer here':'Bring an item to put down');
  }
  if(table){const target=tableInteraction(s,table,seatId);return target.error?stop(target.error):{label:held?`Serve ${RECIPE_BY_ID[held.recipeId].name.toLowerCase()}`:'Clear dirty dish',disabled:false,hold:false};}
  if(s.config.physicalSupplies&&['crate','fridge'].includes(station!.kind)){const choices=serviceSupplyChoices(s,station!.id).filter(choice=>!recipeId||choice.recipeIds.includes(recipeId));return held?stop('Put down held item first'):choices.length===1?{label:`Take ${choices[0].name.toLowerCase()}`,disabled:false,hold:false}:choices.length?{label:'Choose an ingredient',disabled:false,hold:false}:stop('No ingredients for this menu here');}
  if(s.config.physicalSupplies&&['plates','cups','boxes','bowls'].includes(station!.kind)){
    const kind=supplyVessel(station!),name=SERVING_VESSELS[kind].name,count=kind==='fry_box'?Infinity:stockFor(s,kind).length;
    if(held?.kind==='plate'&&vesselOf(held)===kind)return {label:`Return ${name}`,disabled:false,hold:false};
    if(isUsedFriesBox(held))return stop('Take this used fries box to the bin');
    if(isPlatableServiceFood(s,held))return foodVessel(s,held)!==kind?stop(`This food needs a ${SERVING_VESSELS[foodVessel(s,held)].name}`):count>0?{label:`Serve in a ${name}`,disabled:false,hold:false}:stop(`Wash a ${name} first`);
    return held?stop('Put down held item first'):count>0?{label:`Take ${name}${Number.isFinite(count)?' · '+count+' left':''}`,disabled:false,hold:false}:stop(`Wash a ${name} first`);
  }
  const basket=station!.slots.find(slot=>slot.item&&slot.batch?.phase===(held?.kind==='plate'?'raised':'ready'))??station!.slots.find(slot=>slot.batch&&slot.item);if(basket?.batch){if(!held&&basket.batch.phase==='ready')return {label:'Raise fryer basket',disabled:false,hold:false};if(held?.kind==='plate'&&vesselOf(held)==='fry_box'&&s.config.cookingVersion===1&&!s.config.menu.includes('fries'))return stop('Take a fries portion to prep and add the topping first');if(held?.kind==='plate'&&vesselOf(held)==='fry_box')return basket.batch.phase==='raised'?{label:`Fill fries box · ${basket.batch.remaining} left`,disabled:false,hold:false}:stop('Raise the ready basket first');if(!held&&basket.batch.phase==='raised')return s.config.cookingVersion===1?{label:'Take fries portion to prep',disabled:false,hold:false}:stop('Bring an empty fries box');}
  if(station!.kind==='crate')return held?stop('Put down held item first'):{label:`Take ${RECIPE_BY_ID[recipeId??s.config.menu[0]]?.name.toLowerCase()??'recipe'} ingredients`,disabled:false,hold:false};
  if(held?.kind==='plate'&&station!.slots.some(slot=>isPlatableServiceFood(s,slot.item)&&!slot.batch&&foodVessel(s,slot.item!)===vesselOf(held!)))return {label:`Serve in the ${SERVING_VESSELS[vesselOf(held!)].name}`,disabled:false,hold:false};
  if(isPlatableServiceFood(s,held)&&station!.slots.some(slot=>slot.item?.kind==='plate'&&vesselOf(slot.item)===foodVessel(s,held!)))return {label:'Fill the clean serving dish',disabled:false,hold:false};
  if(held?.physical&&station!.kind==='prep'){const assembly=station!.slots.find(slot=>slot.item&&((assemblyComponent(held)&&held.ingredientId&&missingAssembly(slot.item).includes(held.ingredientId))||(assemblyComponent(slot.item)&&slot.item.ingredientId&&missingAssembly(held).includes(slot.item.ingredientId))));if(assembly){const main=missingAssembly(held).length?held:assembly.item!;return {label:RECIPE_BY_ID[main.recipeId].steps[main.step]?.label??'Combine ingredients',disabled:false,hold:false};}}
  if(station!.kind==='bin')return isUsedFriesBox(held)?{label:'Throw away used fries box',disabled:false,hold:false}:held?.kind==='dirty'?stop('Wash this dish at the sink'):held?{label:'Discard held food',disabled:false,hold:false}:stop('Nothing to discard');
  if(isUsedFriesBox(held))return stop('Take this used fries box to the bin');
  if(held?.kind==='plate'&&vesselOf(held)==='bowl'&&station!.slots.some(slot=>slot.item&&isSoup(slot.item.recipeId)&&slot.boil?.phase==='drained'))return {label:'Ladle one soup portion',disabled:false,hold:false};
  if(!held&&station!.slots.some(slot=>slot.item&&!isSoup(slot.item.recipeId)&&slot.boil?.phase==='ready'))return {label:'Lift & drain noodles',disabled:false,hold:false};
  const ready=station!.slots.find(slot=>slot.item&&(!slot.job||slot.job.ready));
  if(!held&&ready)return {label:`Take ${itemLabel(ready.item).toLowerCase()}`,disabled:false,hold:false};
  const working=station!.slots.find(slot=>slot.item&&slot.job&&!slot.job.ready);
  if(!held&&working?.job){const job=working.job,manual=job.action==='hold'||job.action==='wash',step=working.item?.kind==='dirty'?null:serviceRecipeSteps(s,working.item!.recipeId)[working.item!.step];return {label:manual?job.action==='wash'?'Hold to wash dish':`Hold to ${(step?.label??'work').toLowerCase()}`:`Cooking · ${Math.ceil(job.remaining/20)}s`,disabled:!manual,hold:manual,progress:1-job.remaining/job.total};}
  if(held){if(!station!.slots.some(slot=>!slot.item))return stop(station!.kind==='sink'?'Sink is full':'Station is full');if(station!.kind==='sink')return held.kind==='dirty'?{label:'Put dish in sink',disabled:false,hold:false}:stop('Bring a dirty dish');if(held.kind==='dirty')return stop('Take this dish to the sink');if(held.kind==='burnt')return stop('Take burnt food to the bin');const step=stationStep(s,station!,held);if(step)return {label:step.action==='hold'?`Start ${step.label.toLowerCase()}`:step.label,disabled:false,hold:false};if(station!.kind==='prep')return {label:'Put down held food',disabled:false,hold:false};return stop('Use the next recipe station');}
  return stop('Bring recipe ingredients');
}

/** One semantic target for pointer, keyboard, accessible text and scene cues.
 * This is read-only; the interaction checks its target again on arrival. */
export function serviceTargetIntent(s:ServiceState,targetId:string,seatId?:string,recipeId?:string,itemId?:string):ServiceIntent {
  const intent=serviceTargetFeedback(s,targetId,seatId,recipeId,itemId),station=s.stations.find(st=>st.id===targetId),table=s.tables.find(t=>t.id===targetId),held=s.chef.held;
  const seat=table?tableInteraction(s,table,seatId).seat:undefined;
  let slot=-1;
  if(station){
    if(itemId)slot=station.slots.findIndex(slot=>slot.item?.id===itemId);
    else if(intent.hold)slot=station.slots.findIndex(slot=>!!slot.job&&!slot.job.ready);
    else if(station.kind==='pass')slot=station.slots.findIndex(slot=>held?!slot.item:!!slot.item);
    else if(held?.kind==='plate')slot=station.slots.findIndex(slot=>slot.batch?.phase==='raised'&&vesselOf(held)==='fry_box'||isPlatableServiceFood(s,slot.item)&&foodVessel(s,slot.item)===vesselOf(held));
    else if(isPlatableServiceFood(s,held))slot=station.slots.findIndex(slot=>slot.item?.kind==='plate'&&vesselOf(slot.item)===foodVessel(s,held));
    if(slot<0&&held&&station.kind==='prep')slot=station.slots.findIndex(slot=>!!slot.item&&(assemblyComponent(held)&&!!held.ingredientId&&missingAssembly(slot.item).includes(held.ingredientId)||assemblyComponent(slot.item)&&!!slot.item.ingredientId&&missingAssembly(held).includes(slot.item.ingredientId)));
    if(slot<0)slot=station.slots.findIndex(slot=>held?!slot.item:!!slot.item&&(!slot.job||slot.job.ready));
  }
  intent.target={id:targetId,...(seat?.id||seatId?{seatId:seat?.id??seatId}:{}),...(slot>=0?{slot,...(station!.slots[slot].item?{itemId:station!.slots[slot].item!.id}:{})}:{})};
  intent.action=intent.disabled?'blocked':intent.hold?'hold':'interact';
  if(table){
    const validSeat=!seatId||table.seats.some(seat=>seat.id===seatId);
    intent.movement={available:validSeat&&targetPath(s.config.tier,s.stations,s.tables,s.chef,tableFootprint(table))!==null,only:intent.disabled};
    if(!held&&intent.disabled&&validSeat){intent.label='Walk to table';delete intent.reason;}
  }
  if(intent.disabled){
    const readyFood=isPlatableServiceFood(s,held),vessel=readyFood?foodVessel(s,held):null;
    const kind=held?.kind==='burnt'||isUsedFriesBox(held)?'bin':held?.kind==='dirty'?'sink':readyFood?vessel==='fry_box'?'boxes':vessel==='cup'?'cups':vessel==='bowl'?'bowls':'plates':held?'prep':/wash/i.test(intent.reason??'')?'sink':undefined;
    const recovery=kind?s.stations.find(st=>st.kind===kind&&st.id!==targetId&&(readyFood||kind==='bin'||st.slots.some(slot=>!slot.item))&&(!readyFood||vessel==='fry_box'||stockFor(s,vessel!).length>0)):undefined;
    if(recovery)intent.recovery={targetId:recovery.id,label:kind==='prep'?'Put it down first':kind==='sink'?'Take to sink':kind==='bin'?'Take to bin':`Use a ${SERVING_VESSELS[vessel!].name}`};
  }
  return intent;
}

export function compatibleServiceTargets(s:ServiceState):string[]{
  if(!s.chef.held||!active(s))return [];
  return [...s.stations,...s.tables].filter(target=>target.id!==s.chef.targetId&&(!('kind' in target)||target.kind!=='bin'||s.chef.held?.kind==='burnt'||isUsedFriesBox(s.chef.held))&&!serviceTargetIntent(s,target.id).disabled).map(target=>target.id);
}

/** Every accepted command returns an independent serializable state. No wall-clock reads. */
export function dispatchService(previous:ServiceState,action:ServiceAction):ServiceState {
  const s=copy(previous);
  normalizeServiceAdditions(s);
  if(!action||typeof action!=='object'||typeof action.type!=='string'){notice(s,'Invalid service action.');return s;}
  if(action.type==='skipLesson'){if(protectedLesson(s)){s.lessonStatus='skipped';s.nextArrival=Math.max(20,s.nextArrival);notice(s,'Normal service begins. Food can burn and customers now have limited patience.');}return s;}
  if(action.type==='pause') { if(active(s)){s.pausedPhase=s.phase as 'preparing'|'playing'|'closing';s.phase='paused';s.chef.holding=false;}return s; }
  if(action.type==='resume') { if(s.phase==='paused'){s.phase=s.pausedPhase??'playing';s.pausedPhase=null;}return s; }
  if(action.type==='prepare'){if(s.phase!=='setup')return s;const error=serviceReadyError(s);if(error){notice(s,error);return s;}s.phase='preparing';notice(s,'Prep time. Open when you are ready. Food can still burn or cool.');return s;}
  if(action.type==='open') { if(s.phase!=='setup'&&s.phase!=='preparing'){notice(s,'Service has already opened.');return s;}const error=serviceReadyError(s);if(error){notice(s,error);return s;}s.phase='playing';s.nextArrival=20;notice(s,'Open! Customers are on their way.');return s; }
  if(!active(s)){notice(s,s.phase==='paused'?'Service is paused.':'Open service before cooking.');return s;}
  if(action.type==='tick') { if(!Number.isInteger(action.ticks)||action.ticks<1||action.ticks>SERVICE_RULES.maxTicksPerAction){notice(s,'Invalid time step.');return s;}stepService(s,action.ticks);return s; }
  if(action.type==='hold') { if(typeof action.active!=='boolean'){notice(s,'Invalid hold action.');return s;}s.chef.holding=action.active;return s; }
  if(action.type==='move') {
    if(!Number.isInteger(action.x)||!Number.isInteger(action.y)){notice(s,'Choose a floor tile.');return s;}
    const path=servicePath(s.config.tier,s.stations,s.tables,s.chef,{x:action.x,y:action.y});if(!path){notice(s,'That spot is blocked.');return s;}clearTarget(s);s.chef.path=path;return s;
  }
  if(action.type==='discard') { const bin=s.stations.find(st=>st.kind==='bin');if(bin)routeInteraction(s,bin.id,null,null);return s; }
  if(action.type==='interact') {
    if(typeof action.targetId!=='string'||(action.recipeId!==undefined&&(typeof action.recipeId!=='string'||!Object.hasOwn(RECIPE_BY_ID,action.recipeId)))||(action.ingredientId!==undefined&&(typeof action.ingredientId!=='string'||!Object.hasOwn(INGREDIENT_BY_ID,action.ingredientId)))||(action.seatId!==undefined&&typeof action.seatId!=='string')||(action.itemId!==undefined&&(typeof action.itemId!=='string'||!action.itemId.length||action.itemId.length>64))){notice(s,'Invalid interaction.');return s;}
    routeInteraction(s,action.targetId,action.recipeId??null,action.seatId??null,action.ingredientId??null,action.itemId??null);return s;
  }
  notice(s,'Unknown service action.');return s;
}
function routeInteraction(s:ServiceState,targetId:string,recipeId:string|null,seatId:string|null,ingredientId:string|null=null,itemId:string|null=null):void {
  const mess=s.messes?.find(m=>m.id===targetId);if(mess){if(s.chef.held){notice(s,'Put down your held item before mopping.');return;}const path=servicePath(s.config.tier,s.stations,s.tables,s.chef,mess);if(!path){notice(s,'Leave a clear route to this mess.');return;}clearTarget(s);s.chef.path=path;s.chef.targetId=mess.id;notice(s,'Hold to mop. Cleaning progress is kept if you stop.');return;}
  const station=s.stations.find(st=>st.id===targetId),table=s.tables.find(t=>t.id===targetId);
  if(!station&&!table){notice(s,'That target no longer exists.');return;}
  if(itemId){const slot=station?.slots.find(slot=>slot.item?.id===itemId),held=s.chef.held;const allowed=station?.kind==='pass'?!held:slot?.portions?.ready?(!held&&station?.kind==='steamer'||held?.kind==='plate'&&vesselOf(held)==='cup'&&station?.kind==='wine_station'):station?.kind==='boiler'&&(!held||held.kind==='plate'&&vesselOf(held)==='bowl'&&slot?.item&&isSoup(slot.item.recipeId));if(!slot||!allowed){notice(s,held?'Put down held item first.':'That stored item is no longer here.');clearTarget(s);return;}}
  if(seatId&&(!table||!table.seats.some(seat=>seat.id===seatId))){notice(s,'That seat does not belong to this table.');return;}
  const tableTarget=table?tableInteraction(s,table,seatId):null;
  const footprint=station?stationFootprint(station):tableFootprint(table!);
  const path=station?stationAccessPath(s.config.tier,s.stations,s.tables,s.chef,station):targetPath(s.config.tier,s.stations,s.tables,s.chef,footprint);
  if(!path){notice(s,'There is no clear route.');return;}
  if(tableTarget?.error){
    // A movement-only click is deliberately not an interaction queued for later.
    // A guest sitting or a dirty plate appearing during the walk cannot trigger it.
    clearTarget(s);s.chef.path=path;
    notice(s,s.chef.held?tableTarget.error:'');return;
  }
  s.chef.path=path;s.chef.targetId=targetId;s.chef.targetRecipeId=recipeId;s.chef.targetSeatId=tableTarget?.seat?.id??seatId;s.chef.targetIngredientId=ingredientId;s.chef.targetItemId=itemId;s.chef.holding=false;
  if(!path.length)performInteraction(s);
}
function performInteraction(s:ServiceState):void {
  if(s.messes?.some(m=>m.id===s.chef.targetId))return;
  const station=s.stations.find(st=>st.id===s.chef.targetId),table=s.tables.find(t=>t.id===s.chef.targetId);
  if(station){if(isAtStationAccess(s.config.tier,s.stations,s.tables,s.chef,station))interactStation(s,station);else clearTarget(s);}else if(table)interactTable(s,table);else clearTarget(s);
}
function stationStep(s:ServiceState,station:ServiceStation,item:ServiceItem):RecipeStep|null {
  if(s.config.cookingVersion===1&&auxiliaryChicken(item)){if(station.kind!=='grill'||item.kind!=='ingredient')return null;const chicken=RECIPE_BY_ID.chicken_ramen.steps.find(step=>step.station==='grill')!,spec=EQUIPMENT_BY_ID.grill.tiers[station.tier-1];return {...chicken,ticks:Math.round(chicken.ticks/spec.speed),burnTicks:spec.noBurn?undefined:chicken.burnTicks};}
  if(item.kind==='plate'||(item.physical&&item.kind==='ingredient'&&item.ingredientId!==RECIPE_BY_ID[item.recipeId]?.ingredients[0]))return null;
  const step=serviceRecipeSteps(s,item.recipeId)[item.step];if(!step||step.station!==station.kind)return null;
  let action=step.action,ticks=step.ticks;
  if(['blender','juicer'].includes(station.kind)&&station.tier>=2)action='timed';
  if(station.kind==='drinks'&&station.tier>=2){action='instant';ticks=0;}
  if(action==='hold'&&s.config.specials.includes('sharp_knives'))ticks=Math.ceil(ticks/2);
  const spec=EQUIPMENT_BY_ID[station.kind].tiers[station.tier-1];
  return {...step,action,ticks:Math.max(action==='instant'?0:1,Math.round(ticks/(spec?.speed??1))),burnTicks:spec?.noBurn?undefined:step.burnTicks};
}
export function serviceMissingIngredients(item:ServiceItem):string[]{
  const recipe=RECIPE_BY_ID[item.recipeId],step=item.recipeId==='chicken_ramen'&&item.stage!=='raw_chicken'?recipe.steps.filter(step=>step.station!=='grill')[item.step]:recipe?.steps[item.step];if(!item.physical||step?.station!=='prep'||item.ingredientId!==recipe.ingredients[0]||recipe.id==='cheese_fries'&&item.step<2||recipe.assemblyStep!==undefined&&item.step!==recipe.assemblyStep)return [];
  return (recipe.assemblyIngredients??[]).filter(ingredientId=>!item.components?.some(component=>component.ingredientId===ingredientId));
}
const missingAssembly=serviceMissingIngredients;
const preparedFood=(item:ServiceItem|null):item is ServiceItem & {kind:'processed'}=>!!item&&item.physical===true&&item.kind==='processed'&&item.stage.startsWith('prepared_');
export const isPreparedServiceFood=preparedFood;
/** A raised fries portion may become plain fries only when plain fries are on
 * the menu. Other unfinished components still need their actual assembly. */
export function isPlatableServiceFood(s:ServiceState,item:ServiceItem|null):item is ServiceItem & {kind:'processed'} {
  return preparedFood(item)||!!item&&item.physical===true&&item.kind==='processed'&&item.stage==='fries_portion'&&item.preparedComponent==='fries'&&s.config.cookingVersion===1&&s.config.menu.includes('fries');
}
function putOnPlate(food:ServiceItem,plate:ServiceItem):ServiceItem{food.vesselKind=vesselOf(plate);food.kind='dish';food.stage=`plated_${food.recipeId}`;food.plateId=plate.id;return food;}
function platePreparedFood(s:ServiceState,food:ServiceItem,plate:ServiceItem):ServiceItem {
  if(food.stage==='fries_portion'){
    food.recipeId='fries';food.step=serviceRecipeSteps(s,'fries').length;
    food.warmthTicks=Math.min(food.warmthTicks??COMPONENT_WARMTH,coldTicks(s));
    food.finishedTick=s.tick;delete food.preparedComponent;
  }
  return putOnPlate(food,plate);
}
function assemblyComponent(item:ServiceItem):boolean{return item.kind==='ingredient'&&!auxiliaryChicken(item)||item.kind==='processed'&&item.preparedComponent==='chicken';}
function joinAtCounter(s:ServiceState,station:ServiceStation,held:ServiceItem):boolean{
  if(station.kind!=='prep'||!held.physical)return false;
  const withComponent=station.slots.find(slot=>slot.item&&assemblyComponent(slot.item)&&slot.item.ingredientId&&missingAssembly(held).includes(slot.item.ingredientId));
  const withMain=station.slots.find(slot=>slot.item&&assemblyComponent(held)&&held.ingredientId&&missingAssembly(slot.item).includes(held.ingredientId));
  const slot=withComponent??withMain;if(!slot)return false;
  const main=withComponent?held:slot.item!,component=withComponent?slot.item!:held;
  if(component.warmthTicks!==undefined){main.warmthTicks=Math.min(main.warmthTicks??COMPONENT_WARMTH,component.warmthTicks);main.cold=main.cold||component.cold;}
  main.components=[...(main.components??[]),{id:component.id,ingredientId:component.ingredientId!}];slot.item=main;slot.job=null;s.chef.held=null;
  const missing=missingAssembly(main),step=stationStep(s,station,main);
  if(!missing.length&&step){slot.job={action:step.action,remaining:step.ticks,total:step.ticks,burnRemaining:step.burnTicks??null,ready:false};notice(s,`${step.label} — hold to combine.`);}
  else {notice(s,`Add ${missing.map(id=>INGREDIENT_BY_ID[id].name.toLowerCase()).join(' and ')}.`);clearTarget(s);}
  return true;
}
function interactStation(s:ServiceState,station:ServiceStation):void {
  const chef=s.chef,held=chef.held;
  // A holding surface stores exact objects. It never plates, combines, washes
  // or discards them, and an explicit pickup cannot silently take another item.
  if(station.kind==='pass'){
    if(held){const empty=station.slots.find(slot=>!slot.item);if(chef.targetItemId)notice(s,'Put down held item first.');else if(!empty)notice(s,'Holding counter is full.');else{empty.item=held;empty.job=null;empty.batch=null;empty.boil=null;chef.held=null;notice(s,`${itemLabel(held)} put down.`);}}
    else{const stored=station.slots.find(slot=>slot.item&&(!chef.targetItemId||slot.item.id===chef.targetItemId));if(stored){chef.held=stored.item;stored.item=null;stored.job=null;stored.batch=null;stored.boil=null;notice(s,`Picked up ${itemLabel(chef.held).toLowerCase()}.`);}else notice(s,chef.targetItemId?'That stored item is no longer here.':'Holding counter is empty.');}
    clearTarget(s);return;
  }
  if(s.config.physicalSupplies&&['crate','fridge','plates','cups','boxes','bowls'].includes(station.kind)){
    if(['plates','cups','boxes','bowls'].includes(station.kind)){
      const kind=supplyVessel(station),name=SERVING_VESSELS[kind].name;
      if(held?.kind==='plate'&&vesselOf(held)===kind){returnVessel(s,held);chef.held=null;notice(s,'Serving vessel returned.');clearTarget(s);return;}
      if(isPlatableServiceFood(s,held)){
        if(foodVessel(s,held)!==kind){notice(s,`This food needs a ${SERVING_VESSELS[foodVessel(s,held)].name}.`);clearTarget(s);return;}
        const vesselId=kind==='fry_box'?id(s,'box'):stockFor(s,kind).shift();
        if(!vesselId){notice(s,`No clean ${name}s. Put the food down and wash one.`);clearTarget(s);return;}
        updateVesselCounts(s);
        chef.held=platePreparedFood(s,held,{id:vesselId,kind:'plate',vesselKind:kind,recipeId:held.recipeId,step:0,stage:'clean',createdTick:s.tick,cold:false});
        notice(s,'Ready to serve.');clearTarget(s);return;
      }
      if(held){notice(s,isUsedFriesBox(held)?'Take this used fries box to the bin.':'Put down what you are holding first.');clearTarget(s);return;}
      const vesselId=kind==='fry_box'?id(s,'box'):stockFor(s,kind).shift();if(!vesselId){notice(s,`No clean ${SERVING_VESSELS[kind].name}s. Wash one at the sink.`);clearTarget(s);return;}
      updateVesselCounts(s);chef.held={id:vesselId,kind:'plate',physical:true,vesselKind:kind,recipeId:s.config.menu[0],step:0,stage:kind==='fry_box'?'empty_fry_box':`clean_${kind}`,createdTick:s.tick,cold:false};notice(s,`Picked up a ${SERVING_VESSELS[kind].name}.`);clearTarget(s);return;
    }
    if(held){notice(s,'Put down what you are holding first.');clearTarget(s);return;}
    const choices=serviceSupplyChoices(s,station.id).filter(choice=>(!chef.targetRecipeId||choice.recipeIds.includes(chef.targetRecipeId))&&(!chef.targetIngredientId||choice.ingredientId===chef.targetIngredientId));
    if(choices.length!==1){notice(s,choices.length?'Choose which ingredient to take.':'That ingredient does not come from this supply.');clearTarget(s);return;}
    const choice=choices[0];chef.held={id:id(s,'ingredient'),kind:'ingredient',physical:true,recipeId:chef.targetRecipeId??choice.recipeId,ingredientId:choice.ingredientId,step:0,stage:`raw_${choice.ingredientId}`,createdTick:s.tick,cold:false};notice(s,`Picked up ${choice.name.toLowerCase()}.`);clearTarget(s);return;
  }
  if(station.kind==='crate') {
    if(held){notice(s,'Put down what you are holding first.');clearTarget(s);return;}
    const recipeId=chef.targetRecipeId??s.config.menu[0];
    if(!s.config.menu.includes(recipeId)){notice(s,'That recipe is not on today’s menu.');clearTarget(s);return;}
    chef.held={id:id(s,'food'),kind:'raw',recipeId,step:0,stage:`raw_${recipeId}`,createdTick:s.tick,cold:false};notice(s,`Picked up ingredients for ${RECIPE_BY_ID[recipeId].name.toLowerCase()}.`);clearTarget(s);return;
  }
  if(station.kind==='bin') {
    if(isUsedFriesBox(held)){chef.held=null;notice(s,'Used fries box thrown away.');clearTarget(s);return;}
    if(held?.kind==='dirty'){notice(s,'Dirty dishes must be washed, not thrown away.');clearTarget(s);return;}
    if(held?.physical&&held.plateId&&vesselReusable(vesselOf(held))){chef.held={id:held.plateId,kind:'dirty',physical:true,vesselKind:vesselOf(held),recipeId:held.recipeId,step:serviceRecipeSteps(s,held.recipeId).length,stage:'dirty_plate',createdTick:s.tick,cold:false};notice(s,'Food discarded. Take its dirty dish to the sink.');clearTarget(s);return;}
    if(held?.kind==='plate'){returnVessel(s,held);chef.held=null;notice(s,'Clean serving dish returned to its rack.');clearTarget(s);return;}
    chef.held=null;notice(s,held?'Food discarded.':'The bin is empty.');clearTarget(s);return;
  }
  const basket=station.slots.find(slot=>slot.item&&slot.batch?.phase===(held?.kind==='plate'?'raised':'ready'))??station.slots.find(slot=>slot.batch&&slot.item);
  if(basket?.batch&&basket.item){
    if(!held&&basket.batch.phase==='ready'){basket.batch=raiseFryBatch(basket.batch)!;if(basket.job)basket.job.burnRemaining=null;notice(s,'Basket raised. Take a fries box for each portion.');clearTarget(s);return;}
    if(s.config.cookingVersion===1&&!held&&basket.batch.phase==='raised'){
      const portion=takeFryPortion(basket.batch)!;chef.held={...basket.item,id:id(s,'fries_portion'),kind:'processed',step:2,stage:'fries_portion',preparedComponent:'fries',components:undefined};basket.batch=portion.batch;
      if(!basket.batch){basket.item=null;basket.job=null;}notice(s,s.config.menu.includes('fries')?'One fries portion. Take it to the boxes, or add a topping at prep.':'One fries portion. Choose its topping at prep.');clearTarget(s);return;
    }
    if(held?.kind==='plate'&&vesselOf(held)==='fry_box'){
      if(s.config.cookingVersion===1&&!s.config.menu.includes('fries')){notice(s,'Take a fries portion to prep before boxing it.');clearTarget(s);return;}
      const portion=takeFryPortion(basket.batch);if(!portion){notice(s,'Raise the ready basket before filling boxes.');clearTarget(s);return;}
      chef.held=putOnPlate({...basket.item,id:id(s,'fries_portion'),components:undefined},held);basket.batch=portion.batch;
      if(s.config.cookingVersion===1){chef.held.recipeId='fries';chef.held.stage='plated_fries';chef.held.step=serviceRecipeSteps(s,'fries').length;chef.held.warmthTicks=Math.min(chef.held.warmthTicks??COMPONENT_WARMTH,coldTicks(s));delete chef.held.preparedComponent;}
      if(!basket.batch){basket.item=null;basket.job=null;}notice(s,`Boxed fries · ${basket.batch?.remaining??0} portions left.`);clearTarget(s);return;
    }
    if(!held&&basket.batch.phase!=='burnt'){notice(s,basket.batch.phase==='cooking'?'Fries are cooking.':'Bring an empty fries box.');clearTarget(s);return;}
  }
  if(held?.kind==='plate'){
    const food=station.slots.find(slot=>isPlatableServiceFood(s,slot.item)&&!slot.batch&&!slot.portions&&foodVessel(s,slot.item!)===vesselOf(held!));
    if(food){chef.held=platePreparedFood(s,food.item!,held);food.item=null;food.job=null;notice(s,'Plated and ready to serve.');clearTarget(s);return;}
  }
  if(isPlatableServiceFood(s,held)){
    const plate=station.slots.find(slot=>slot.item?.kind==='plate'&&vesselOf(slot.item)===foodVessel(s,held!));
    if(plate){chef.held=platePreparedFood(s,held,plate.item!);plate.item=null;plate.job=null;notice(s,'Plated and ready to serve.');clearTarget(s);return;}
  }
  if(held&&station.kind==='prep'&&s.config.cookingVersion===1){
    const choices=serviceAssemblyChoices(s),chosen=chef.targetRecipeId??(choices.length===1?choices[0]:null);
    if(choices.length&&(!chosen||!choices.includes(chosen))){notice(s,'Choose which dish to assemble at this counter.');clearTarget(s);return;}
    if(chosen&&choices.includes(chosen)){held.recipeId=chosen;held.ingredientId=RECIPE_BY_ID[chosen].ingredients[0];held.step=serviceRecipeSteps(s,chosen).findIndex((step,index)=>step.station==='prep'&&index>0);held.stage='assembly_'+chosen;delete held.preparedComponent;}
  }
  if(held&&joinAtCounter(s,station,held))return;
  // A bottle or basket stays in its slot. Only a newly identified portion leaves.
  const portionSlot=station.slots.find(slot=>slot.item&&slot.portions?.ready&&(!chef.targetItemId||slot.item.id===chef.targetItemId));
  if(portionSlot?.portions&&(!held||held.kind==='plate')){
    const wine=portionSlot.portions.recipeId==='house_red';
    if(wine&&(!held||vesselOf(held)!=='cup')){notice(s,'Bring a clean glass from the cup stand.');clearTarget(s);return;}
    if(!wine&&held){notice(s,'Take one mandu portion with empty hands, then add sauce at prep.');clearTarget(s);return;}
    const food={...copy(portionSlot.item!),id:id(s,wine?'wine_portion':'mandu_portion'),components:undefined};
    if(wine){food.finishedTick=s.tick;food.warmthTicks=coldTicks(s);chef.held=putOnPlate(food,held!);}else chef.held=food;
    portionSlot.portions=takeDomainPortion(portionSlot.portions);
    const remaining=portionSlot.portions?.remaining??0;
    if(!portionSlot.portions){portionSlot.item=null;portionSlot.job=null;}
    notice(s,`${wine?'Poured one glass':'Took one mandu portion'} · ${remaining} left.`);clearTarget(s);return;
  }
  if(station.kind==='boiler'&&(!held||held.kind==='plate')&&!chef.targetItemId&&station.slots.filter(slot=>slot.item&&slot.job?.ready).length>1){notice(s,'Choose the batch you want at the boiler.');clearTarget(s);return;}
  if(held?.kind==='plate'&&vesselOf(held)==='bowl'){const pot=station.slots.find(slot=>(!chef.targetItemId||slot.item?.id===chef.targetItemId)&&slot.item&&isSoup(slot.item.recipeId)&&slot.boil?.version===2&&slot.boil.phase==='drained');if(pot&&pot.boil?.version===2){chef.held={...copy(pot.item!),id:id(s,'soup_portion'),kind:'processed',plateId:held.id,vesselKind:'bowl',components:undefined};pot.boil=takeBoilerPortion(pot.boil);if(!pot.boil){pot.item=null;pot.job=null;}notice(s,'One bowl of soup. Finish with the topping at prep.');clearTarget(s);return;}}
  if(!held){const readyBoil=station.slots.find(slot=>(!chef.targetItemId||slot.item?.id===chef.targetItemId)&&slot.item&&!isSoup(slot.item.recipeId)&&slot.boil?.phase==='ready');if(readyBoil){readyBoil.boil!.phase='drained';readyBoil.item!.stage=RECIPE_BY_ID[readyBoil.item!.recipeId].ingredients[0]==='pasta'?'drained_pasta':'drained_noodles';notice(s,'Basket lifted and drained. Take the noodles to the prep counter.');clearTarget(s);return;}}
  const ready=station.slots.find(slot=>(!chef.targetItemId||slot.item?.id===chef.targetItemId)&&slot.item&&(!slot.job||slot.job.ready));
  if(!held&&ready) {
    if(ready.boil?.version===2){if(isSoup(ready.item!.recipeId)){notice(s,'Bring a clean bowl to ladle one soup portion.');clearTarget(s);return;}chef.held={...copy(ready.item!),id:id(s,'noodle_portion'),components:undefined};ready.boil=takeBoilerPortion(ready.boil);if(!ready.boil){ready.item=null;ready.job=null;}}else{chef.held=ready.item;ready.item=null;ready.job=null;ready.batch=null;ready.boil=null;}notice(s,`Picked up ${itemLabel(chef.held).toLowerCase()}.`);clearTarget(s);return;
  }
  if(!held) {
    const manual=station.slots.find(slot=>slot.item&&slot.job&&!slot.job.ready&&(slot.job.action==='hold'||slot.job.action==='wash'));
    if(manual){notice(s,station.kind==='sink'?'Hold to wash the dish.':'Hold to work at this station.');return;}
    notice(s,'This station has nothing ready.');clearTarget(s);return;
  }
  const empty=station.slots.find(slot=>!slot.item);if(!empty){notice(s,'This station is full.');clearTarget(s);return;}
  if(station.kind==='sink') {
    if(isUsedFriesBox(held)){notice(s,'Used fries boxes go in the bin, not the sink.');clearTarget(s);return;}
    if(held.kind!=='dirty'){notice(s,'Only dirty dishes go in the sink.');clearTarget(s);return;}
    empty.item=held;chef.held=null;const duration=Math.round(SERVICE_RULES.washTicks/(EQUIPMENT_BY_ID.sink.tiers[station.tier-1]?.speed??1));empty.job={action:station.tier===3?'timed':'wash',remaining:duration,total:duration,burnRemaining:null,ready:false};notice(s,station.tier===3?'Dishwasher started.':'Hold to wash the dish.');return;
  }
  if(held.kind==='dirty'||held.kind==='burnt'){notice(s,isUsedFriesBox(held)?'Take this used fries box to the bin.':held.kind==='dirty'?'Take this dish to the sink.':'Take burnt food to the bin.');clearTarget(s);return;}
  const step=stationStep(s,station,held);
  if(step) {
    if(missingAssembly(held).length){empty.item=held;empty.job=null;chef.held=null;notice(s,`Add ${missingAssembly(held).map(id=>`${INGREDIENT_BY_ID[id].name.toLowerCase()} from the ${ingredientSupply(id)==='fridge'?'fridge':'pantry'}`).join(' and ')}.`);clearTarget(s);return;}
    empty.item=held;chef.held=null;empty.portions=createDomainBatch(held.recipeId,station.kind,s.tick);if(s.config.batchVersion&&station.kind==='fryer'&&['fries','cheese_fries'].includes(held.recipeId))empty.batch=createFryBatch(s.tick);if(station.kind==='boiler')empty.boil=createBoilBasket(held.recipeId,s.tick,station.tier,s.config.boilerVersion);empty.job={action:step.action,remaining:step.ticks,total:step.ticks,burnRemaining:step.burnTicks??null,ready:false};
    if(step.action==='instant')finishCooking(s,station,empty);notice(s,`${step.label}${step.action==='hold'?' — hold to continue.':'.'}`);
    if(step.action!=='hold')clearTarget(s);return;
  }
  if(station.kind==='prep') {empty.item=held;empty.job=null;chef.held=null;notice(s,'Food put down.');clearTarget(s);return;}
  notice(s,`This food needs ${EQUIPMENT_BY_ID[RECIPE_BY_ID[held.recipeId]?.steps[held.step]?.station]?.name?.toLowerCase()??'a customer'}.`);clearTarget(s);
}
function interactTable(s:ServiceState,table:ServiceTable):void {
  const held=s.chef.held;
  const {seat,error}=tableInteraction(s,table,s.chef.targetSeatId);
  if(error||!seat){notice(s,error??'This seat is no longer available.');clearTarget(s);return;}
  if(!held) {
    if(seat.item?.kind!=='dirty'){notice(s,'There is no dirty dish at this seat.');clearTarget(s);return;}
    s.chef.held=seat.item;seat.item=null;const current=s.customers.find(c=>c.id===seat.customerId&&c.mealId===seat.mealId&&['walking','seated','eating'].includes(c.phase));if(!current){seat.status='clean';seat.customerId=null;seat.mealId=null;}notice(s,isUsedFriesBox(s.chef.held)?'Table cleared. Throw the used fries box in the bin.':'Table cleared. Take the dirty vessel to the sink.');clearTarget(s);return;
  }
  const customer=s.customers.find(c=>c.id===seat.customerId)!;
  const patience=customer.patience/customer.maxPatience;
  if(patience<.25)s.combo=0;else if(patience>.5&&!held.cold)s.combo=Math.min(SERVICE_RULES.comboMax,s.combo+1);
  const menuMultiplier=SERVICE_RULES.menuMultipliers[s.config.menu.length-1];
  const base=recipePrice(held.recipeId,s.config.recipeLevels[held.recipeId])*(s.config.destinationVersion?customerTraits(customer.type).price:1)*menuMultiplier*(s.config.cosy?.8:1)*(s.config.specials.includes('happy_hour')&&RECIPE_BY_ID[held.recipeId].course==='drink'?2:1);
  const tipRate=customer.type==='office'||customer.type==='business'?.22:customer.type==='regular'?.16:SERVICE_RULES.baseTipRate;
  const comboRate=s.config.specials.includes('big_tipper')?.08:SERVICE_RULES.comboTipPerStep;
  customer.tip=held.cold?0:Math.round(base*tipRate*(1+s.combo*comboRate)*s.config.tipMultiplier);customer.payment=Math.round(base)+customer.tip;customer.servedCold=held.cold;if(s.stats){s.stats.maxCombo=Math.max(s.stats.maxCombo,s.combo);if(!held.cold)s.stats.servedWarm++;}customer.servedTick=s.tick;
  customer.phase='eating';customer.eatRemaining=Math.round((s.config.demandVersion===1?240+seedNumber(`${s.config.seed}:${customer.id}:eating`)%121:SERVICE_RULES.eatTicks)*(s.config.destinationVersion?customerTraits(customer.type).eat:1)*(s.config.domain==='wines'?1.8:1)/(table.tier===2?1.25:1));
  seat.status='eating';seat.item=held;s.chef.held=null;s.served++;
  if(customer.type==='influencer'&&patience>.5)s.influenceRemaining=3;
  emit(s,'serve',customer.id);notice(s,held.cold?'Cold food served for its base price.':'Enjoy your meal!');clearTarget(s);
}
/** The top fryer lifts a completed basket, including a ready basket resumed
 * from an older checkpoint. It never creates another portion or lifts early. */
function liftAutomaticFryer(station:ServiceStation,slot:StationSlot):void {
  if(station.kind!=='fryer'||station.tier!==3||slot.batch?.phase!=='ready'||!slot.job?.ready||!slot.item||slot.item.kind==='burnt')return;
  slot.batch=raiseFryBatch(slot.batch);slot.job.burnRemaining=null;
}
function finishCooking(s:ServiceState,station:ServiceStation,slot:StationSlot):void {
  const item=slot.item,job=slot.job;if(!item||!job)return;
  if(item.kind==='dirty'){finishWash(s,station,slot);return;}
  const recipe=RECIPE_BY_ID[item.recipeId],steps=serviceRecipeSteps(s,item.recipeId),step=s.config.cookingVersion===1&&station.kind==='grill'&&auxiliaryChicken(item)?recipe.steps.find(step=>step.station==='grill'):steps[item.step];if(!recipe||!step){slot.item=null;slot.job=null;return;}
  if(s.config.cookingVersion===1&&station.kind==='grill'&&auxiliaryChicken(item)){item.kind='processed';item.stage='cooked_chicken';item.preparedComponent='chicken';item.warmthTicks=COMPONENT_WARMTH;job.remaining=0;job.ready=true;emit(s,'ready',station.id);return;}
  item.step++;item.stage=step.output;
  if(s.config.cookingVersion===1){const component=componentForOutput(step.output)??(slot.batch?'fries':undefined);if(component&&(component==='chicken'||COMPONENT_RECIPES[component].includes(item.recipeId))){item.preparedComponent=component;item.warmthTicks=COMPONENT_WARMTH;}}
  if(item.step>=steps.length){item.kind=item.physical?'processed':'dish';item.stage=`${item.physical?'prepared':'plated'}_${recipe.id}`;item.finishedTick=s.tick;if(s.config.cookingVersion===1){item.warmthTicks=Math.min(item.warmthTicks??coldTicks(s),coldTicks(s));item.cold=item.cold||item.warmthTicks===0;delete item.preparedComponent;if(item.plateId)item.kind='dish';}else item.cold=false;}else item.kind='processed';
  if(slot.batch)slot.batch=markFryBatchReady(slot.batch);
  if(slot.boil){slot.boil.phase=isSoup(item.recipeId)?'drained':'ready';if(s.config.boilerVersion&&item.warmthTicks===undefined)item.warmthTicks=COMPONENT_WARMTH;}
  if(slot.portions){slot.portions.ready=true;if(item.recipeId==='steamed_mandu')item.warmthTicks=COMPONENT_WARMTH;else{item.stage='opened_wine';delete item.warmthTicks;delete item.finishedTick;}}
  job.remaining=0;job.ready=true;liftAutomaticFryer(station,slot);emit(s,'ready',station.id);if(job.action==='hold'&&!station.slots.some(other=>other.job&&!other.job.ready))for(const actor of [s.chef,...s.helpers])if(actor.targetId===station.id)actor.holding=false;
}
function finishWash(s:ServiceState,station:ServiceStation,slot:StationSlot):void {
  const item=slot.item;if(!item||item.kind!=='dirty')return;
  const ref=item.meal,customer=ref?s.customers.find(c=>c.mealId===ref.mealId&&c.tableId===ref.tableId&&c.seatId===ref.seatId):null;
  // The seat may already have another guest. Settle only the old meal receipt.
  if(customer&&customer.servedTick!==null&&!customer.washed){customer.washed=true;s.washed++;emit(s,'wash',ref!.seatId);}
  if(item.physical)returnVessel(s,item);
  slot.item=null;slot.job=null;slot.batch=null;if(!station.slots.some(other=>other.job&&!other.job.ready))for(const actor of [s.chef,...s.helpers])if(actor.targetId===station.id)actor.holding=false;notice(s,'Clean vessel returned to its rack.');
}
function asHelper(s:ServiceState,helper:ServiceHelper,fn:()=>void):void {const chef=s.chef,message=s.notice;s.chef=helper;try{fn();}finally{s.chef=chef;s.notice=message;}}
function helperRoute(s:ServiceState,helper:ServiceHelper,targetId:string,seatId:string|null=null):void {const itemId=!helper.held&&s.stations.some(st=>st.id===targetId&&st.kind==='pass')?helper.task?.itemId??null:null;asHelper(s,helper,()=>routeInteraction(s,targetId,null,seatId,null,itemId));}
function helperWorkRoute(s:ServiceState,helper:ServiceHelper,station:ServiceStation):void {const path=stationAccessPath(s.config.tier,s.stations,s.tables,helper,station);if(!path){releaseHelper(s,helper);return;}helper.path=path;helper.targetId=station.id;helper.targetSeatId=null;helper.targetRecipeId=null;helper.targetItemId=null;helper.holding=true;}
function releaseHelper(s:ServiceState,helper:ServiceHelper):void {helper.task=null;asHelper(s,helper,()=>clearTarget(s));}
function claimedByOther(s:ServiceState,helper:ServiceHelper,field:'seatId'|'itemId',value:string):boolean {return s.helpers.some(other=>other!==helper&&other.task?.[field]===value);}
/** Helpers move and handle the same actual items as the player; no abstract work rewards. */
function decideHelper(s:ServiceState,helper:ServiceHelper):void {
  if(helper.path.length)return;
  if(helper.role==='washer'){
    if(helper.held?.kind==='dirty'){
      if(isUsedFriesBox(helper.held)){
        const bin=s.stations.find(st=>st.kind==='bin');if(!bin)return;
        helper.task={kind:'wash',itemId:helper.held.id,stationId:bin.id,tableId:helper.held.meal?.tableId??null,seatId:helper.held.meal?.seatId??null,phase:'work'};helperRoute(s,helper,bin.id);return;
      }
      const sink=s.stations.find(st=>st.kind==='sink'&&st.slots.some(slot=>!slot.item));if(!sink)return;
      helper.task={kind:'wash',itemId:helper.held.id,stationId:sink.id,tableId:helper.held.meal?.tableId??null,seatId:helper.held.meal?.seatId??null,phase:'work'};helperRoute(s,helper,sink.id);helper.holding=true;return;
    }
    if(helper.task?.phase==='work'){
      const station=s.stations.find(st=>st.id===helper.task!.stationId),slot=station?.slots.find(slot=>slot.item?.id===helper.task!.itemId);
      if(slot?.job&&!slot.job.ready){helper.holding=true;return;}releaseHelper(s,helper);
    }
    for(const station of s.stations)if(station.kind==='sink')for(const slot of station.slots)if(slot.item?.kind==='dirty'&&slot.job&&!slot.job.ready&&!claimedByOther(s,helper,'itemId',slot.item.id)&&!(s.chef.targetId===station.id&&s.chef.holding)){
      helper.task={kind:'wash',itemId:slot.item.id,stationId:station.id,tableId:slot.item.meal?.tableId??null,seatId:slot.item.meal?.seatId??null,phase:'work'};helperRoute(s,helper,station.id);helper.holding=true;return;
    }
    for(const table of s.tables)for(const seat of table.seats)if(seat.item?.kind==='dirty'&&!claimedByOther(s,helper,'seatId',seat.id)&&!(s.chef.targetId===table.id&&(!s.chef.targetSeatId||s.chef.targetSeatId===seat.id))){
      helper.task={kind:'wash',itemId:seat.item.id,stationId:null,tableId:table.id,seatId:seat.id,phase:'take'};helperRoute(s,helper,table.id,seat.id);return;
    }
    releaseHelper(s,helper);return;
  }
  if(helper.role==='runner'){
    if(helper.held?.kind==='dish'){
      const customer=s.customers.find(c=>c.phase==='seated'&&c.recipeId===helper.held!.recipeId&&c.seatId&&!s.tables.some(table=>table.seats.some(seat=>seat.id===c.seatId&&seat.item))&&!claimedByOther(s,helper,'seatId',c.seatId));if(!customer)return;
      helper.task={kind:'deliver',itemId:helper.held.id,stationId:null,tableId:customer.tableId,seatId:customer.seatId,phase:'deliver'};helperRoute(s,helper,customer.tableId!,customer.seatId);return;
    }
    if(helper.held)return;
    if(helper.task?.phase==='deliver')releaseHelper(s,helper);
    for(const station of s.stations){if(s.chef.targetId===station.id)continue;
      const candidates=station.kind==='pass'?station.slots:[station.slots.find(slot=>slot.item&&(!slot.job||slot.job.ready))];
      for(const ready of candidates){if(ready?.item?.kind!=='dish'||ready.job&&!ready.job.ready||claimedByOther(s,helper,'itemId',ready.item.id))continue;
        const customer=s.customers.find(c=>c.phase==='seated'&&c.recipeId===ready.item!.recipeId&&c.seatId&&!s.tables.some(table=>table.seats.some(seat=>seat.id===c.seatId&&seat.item))&&!claimedByOther(s,helper,'seatId',c.seatId));if(!customer)continue;
        helper.task={kind:'deliver',itemId:ready.item.id,stationId:station.id,tableId:customer.tableId,seatId:customer.seatId,phase:'take'};helperRoute(s,helper,station.id);return;
      }
    }
    releaseHelper(s,helper);return;
  }
  if(helper.role==='prep'){
    if(helper.task){const station=s.stations.find(st=>st.id===helper.task!.stationId),job=station?.slots.find(slot=>slot.item?.id===helper.task!.itemId)?.job;if(job&&!job.ready){helper.holding=true;return;}releaseHelper(s,helper);}
    for(const station of s.stations)for(const slot of station.slots)if(slot.item&&slot.item.kind!=='dirty'&&slot.job?.action==='hold'&&!slot.job.ready&&!claimedByOther(s,helper,'itemId',slot.item.id)&&!(s.chef.targetId===station.id&&s.chef.holding)){
      helper.task={kind:'prep',itemId:slot.item.id,stationId:station.id,tableId:null,seatId:null,phase:'work'};helperWorkRoute(s,helper,station);return;
    }
  }
}
function moveActor(actor:Point&{path:Point[]},speed:number):void {
  let distance=speed/SERVICE_RULES.ticksPerSecond;
  while(distance>0&&actor.path.length) {const next=actor.path[0],dx=next.x-actor.x,dy=next.y-actor.y,d=Math.hypot(dx,dy);if(d<=distance+.000001){actor.x=next.x;actor.y=next.y;actor.path.shift();distance-=d;}else{actor.x+=dx/d*distance;actor.y+=dy/d*distance;break;}}
}
const CUSTOMER_SPACING=.8;
/** An arrival needs an actual empty standing spot, not just a queue count. */
export function availableServiceQueueSpots(s:ServiceState):Point[]{
  const visible=s.customers.filter(c=>c.phase!=='gone');
  return serviceQueueSlots(s.config.tier,s.stations,s.tables).filter(p=>visible.every(c=>Math.hypot(c.x-p.x,c.y-p.y)>=CUSTOMER_SPACING));
}
function arrangeServiceQueue(s:ServiceState,restore=false):void {
  const waiting=s.customers.filter(c=>c.phase==='queue');if(!waiting.length)return;
  // Preserve legitimate mid-step checkpoints exactly. Only the old version's
  // shared spawn coordinate needs a one-time repair on reload.
  if(restore&&!waiting.some((c,i)=>waiting.slice(i+1).some(other=>Math.hypot(c.x-other.x,c.y-other.y)<.05)))return;
  const slots=serviceQueueSlots(s.config.tier,s.stations,s.tables);
  const occupied=restore?s.customers.filter(c=>c.phase!=='queue'&&c.phase!=='gone'):[];
  const available=restore?slots.filter(p=>occupied.every(c=>Math.hypot(c.x-p.x,c.y-p.y)>=CUSTOMER_SPACING)):slots;
  waiting.forEach((customer,i)=>{
    const spot=available[i];if(!spot)return;
    if(restore){customer.x=spot.x;customer.y=spot.y;customer.path=[];return;}
    const destination=customer.path.at(-1)??customer;
    if(Math.hypot(destination.x-spot.x,destination.y-spot.y)>.001)customer.path=servicePath(s.config.tier,s.stations,s.tables,customer,spot)??[];
  });
}
function moveWaitingCustomer(s:ServiceState,customer:ServiceCustomer):void {
  if(!customer.path.length)return;
  const proposed={x:customer.x,y:customer.y,path:[...customer.path]};moveActor(proposed,SERVICE_RULES.customerSpeed*(s.config.destinationVersion?customerTraits(customer.type).walk:1)*(s.config.domain==='smoothie'?1.15:1));
  // Follow the guest ahead without walking through them while the line closes.
  if(s.customers.some(other=>other!==customer&&other.phase!=='gone'&&Math.hypot(other.x-proposed.x,other.y-proposed.y)<CUSTOMER_SPACING))return;
  customer.x=proposed.x;customer.y=proposed.y;customer.path=proposed.path;
}
function patienceFactor(type:CustomerType):number { return type==='business'?.8:type==='office'?.68:type==='kid'?1.5:type==='regular'?1.2:1; }
function chooseRecipe(s:ServiceState,type:CustomerType):string {
  let menu=s.config.menu;
  if(s.config.tutorialLearning)return menu[s.spawned%menu.length];
  if(type==='business'&&s.config.destinationVersion){const recipe=businessOrder(menu,s.config.recipeLevels,random(s),s.businessOrders??[],id=>recipePrice(id,s.config.recipeLevels[id])*(s.config.specials.includes('happy_hour')&&RECIPE_BY_ID[id].course==='drink'?2:1));s.businessOrders=[...(s.businessOrders??[]),recipe].slice(-2);return recipe;}
  if(type==='kid'){const kids=menu.filter(id=>['dessert','drink'].includes(RECIPE_BY_ID[id].course));if(kids.length)menu=kids;}
  if(type==='critic')return [...menu].sort((a,b)=>(s.config.recipeLevels[b]??0)-(s.config.recipeLevels[a]??0)||a.localeCompare(b))[0];
  return menu[Math.floor(random(s)*menu.length)];
}
/** Actual cooking plus a round trip across the floor and a decision buffer. */
export function servicePatienceMinimum(s:ServiceState,recipeId:string):{table:number;queue:number}{
  const g=serviceGeometry(s.config.tier),travel=(g.truck.w+g.truck.h+g.pavement.w+g.pavement.h)*2/SERVICE_RULES.chefSpeed*20;
  const cooking=serviceRecipeSteps(s,recipeId).reduce((sum,step)=>sum+step.ticks,0),drain=s.config.spices.includes('rush_hour')?1.25:1;
  const early=earlyPatienceFloor(s);
  return {table:Math.max(early.table,Math.ceil(Math.max(45*20,cooking+travel+20*20)*drain)),queue:Math.max(early.queue,Math.ceil(Math.max(60*20,cooking+travel+30*20)*drain))};
}
function spawnCustomer(s:ServiceState):void {
  const cfg=s.config,remaining=cfg.customers-s.spawned;
  const queueRoom=(cfg.maxWaitingCustomers??4)-s.customers.filter(c=>c.phase==='queue').length;
  // A full line delays arrivals instead of accumulating an overdue burst.
  // Nobody is discarded from the day's total when the queue is full.
  if(queueRoom<=0)return;
  const spots=availableServiceQueueSpots(s),room=Math.min(spots.length,queueRoom);
  if(room<=0)return;
  let type=cfg.customerTypes[Math.floor(random(s)*cfg.customerTypes.length)];
  if(cfg.demandVersion===1&&cfg.customerTypes.includes('party')){const quota=cfg.customerTypes.filter(t=>t==='party').length;type=s.spawned%cfg.customerTypes.length<quota?'party':cfg.customerTypes.find(t=>t!=='party')??'party';}
  if(type==='kid'&&!cfg.menu.some(id=>['dessert','drink'].includes(RECIPE_BY_ID[id].course)))type='walk_in';
  if(type==='family'&&(!s.tables.some(t=>t.capacity===4)||remaining<3||room<3))type='walk_in';
  const groupSize=type==='family'?Math.min(remaining,room,random(s)<.5?3:4):1,groupId=groupSize>1?id(s,'family'):null;
  for(let i=0;i<groupSize;i++) {
    let factor=patienceFactor(type)*(cfg.specials.includes('early_bird')&&s.spawned<5?2:1);
    if(s.influenceRemaining>0){factor*=1.25;s.influenceRemaining--;}
    const forced=cfg.tutorialFailure&&s.spawned>=Math.max(2,cfg.customers-cfg.strikeLimit);
    const recipeId=chooseRecipe(s,type),minimum=servicePatienceMinimum(s,recipeId),tableTicks=Math.max(minimum.table,forced?minimum.table:Math.round(cfg.tablePatienceTicks*factor)),queueTicks=Math.max(minimum.queue,forced?minimum.queue:Math.round(cfg.queuePatienceTicks*factor));
    const spot=spots[i];
    const customer:ServiceCustomer={id:id(s,'customer'),groupId,type,phase:'queue',...spot,path:[],recipeId,patience:queueTicks,maxPatience:tableTicks,queuePatience:queueTicks,tableId:null,seatId:null,mealId:null,eatRemaining:0,payment:0,tip:0,servedCold:false,servedTick:null};
    if(protectedLesson(s)&&s.spawned===0){customer.regularId='old_pete';customer.type='regular';}
    if(cfg.destinationVersion&&!customer.regularId){const identity=communityIdentity(type==='party'||type==='business'?type:'local',s.spawned);customer.communityHandle=identity.handle;customer.look=identity.look;}
    s.customers.push(customer);s.spawned++;emit(s,'arrive',customer.id);
  }
  const gap=cfg.arrivalTicks/(cfg.specials.includes('happy_hour')?1.2:1);
  // The old opening multipliers made gentle days feel empty. New services
  // vary by at most 20%; an overdue arrival never creates a catch-up burst.
  s.nextArrival=cfg.pacingVersion===1?Math.max(20,Math.round(gap*(.8+random(s)*.4))):cfg.arrivalTicks*(s.spawned===1?1.5:s.spawned===2?1.2:1)/(cfg.specials.includes('happy_hour')?1.2:1);
  if(cfg.pacingVersion===2)s.nextArrival=s.arrivalSchedule![s.arrivalCursor!++]??Math.max(20,cfg.arrivalTicks);
  if(s.spawned>=cfg.customers)s.phase='closing';
}
function seatQueue(s:ServiceState):void {
  // Canonical services already in progress may predate distinct queue slots.
  arrangeServiceQueue(s,true);
  // Dirty dishes belong to historical meals; they do not reserve a chair.
  const available=(seat:ServiceSeat)=>['clean','dirty'].includes(seat.status)&&!s.customers.some(c=>c.id===seat.customerId&&c.mealId===seat.mealId&&['walking','seated','eating'].includes(c.phase));
  const waiting=s.customers.filter(c=>c.phase==='queue');
  while(waiting.length) {
    const first=waiting[0],group=first.groupId?waiting.filter(c=>c.groupId===first.groupId):[first];
    let table:ServiceTable|undefined,seats:ServiceSeat[]=[];
    let paths:ReturnType<typeof servicePath>[]=[];
    for(const candidate of s.tables){
      if(!first.groupId&&candidate.seats.some(seat=>s.customers.some(c=>c.id===seat.customerId&&c.groupId&&c.phase!=='gone'&&c.phase!=='leaving')))continue;
      const choices=first.groupId?(candidate.capacity>=group.length&&candidate.seats.every(available)?[candidate.seats.slice(0,group.length)]:[]):candidate.seats.filter(available).map(seat=>[seat]);
      for(const proposed of choices){const routes=proposed.map((seat,i)=>servicePath(s.config.tier,s.stations,s.tables,group[i],seat));if(routes.every(Boolean)){table=candidate;seats=proposed;paths=routes;break;}}
      if(table)break;
    }
    if(!table)break;
    for(let i=0;i<group.length;i++) {
      const c=group[i],seat=seats[i],mealId=id(s,'meal');seat.status='reserved';seat.customerId=c.id;seat.mealId=mealId;
      c.tableId=table.id;c.seatId=seat.id;c.mealId=mealId;c.phase='walking';c.path=paths[i]!;c.patience=c.maxPatience;
      waiting.splice(waiting.indexOf(c),1);
    }
  }
  arrangeServiceQueue(s);
}
function leaveCustomer(s:ServiceState,c:ServiceCustomer,upset:boolean):void {
  const seat=s.tables.find(t=>t.id===c.tableId)?.seats.find(seat=>seat.id===c.seatId);
  if(upset&&seat&&seat.mealId===c.mealId){seat.status=seat.item?.kind==='dirty'?'dirty':'clean';seat.customerId=null;seat.mealId=null;if(seat.item?.kind!=='dirty')seat.item=null;}
  c.phase='leaving';c.path=servicePath(s.config.tier,s.stations,s.tables,c,serviceGeometry(s.config.tier).exit)??[];
  if(upset){s.strikes++;s.missed++;s.combo=0;emit(s,'strike',c.id);notice(s,'A customer left upset. One plate cracked.');const limit=s.config.spices.includes('two_strikes')?Math.min(2,s.config.strikeLimit):s.config.strikeLimit;if(s.strikes>=limit){s.phase='failed';s.chef.holding=false;notice(s,'Service ended. Your expedition will bank its remaining share.');}}
}
function payCustomer(s:ServiceState,c:ServiceCustomer):void {
  const seat=s.tables.find(t=>t.id===c.tableId)?.seats.find(seat=>seat.id===c.seatId);
  if(!seat||seat.mealId!==c.mealId)return;
  if(s.stats){s.stats.food+=c.payment-c.tip;s.stats.tips+=c.tip;}
  s.coins+=c.payment;s.paid++;s.reputation+=RECIPE_BY_ID[c.recipeId].reputation+(c.type==='critic'&&c.patience/c.maxPatience>.5?3:0);
  const physical=seat.item?.physical===true,plateId=seat.item?.plateId,vesselKind=seat.item?vesselOf(seat.item):'plate';
  seat.status='dirty';seat.item={id:physical&&plateId?plateId:id(s,'plate'),kind:'dirty',...(physical?{physical:true,vesselKind}:{}),recipeId:c.recipeId,step:serviceRecipeSteps(s,c.recipeId).length,stage:'dirty_plate',createdTick:s.tick,cold:false,meal:{tableId:c.tableId!,seatId:c.seatId!,mealId:c.mealId!}};
  if(c.type==='party')leaveServiceMess(s,c,random(s));
  emit(s,'pay',c.id,c.payment);leaveCustomer(s,c,false);
}
function coolComponent(item:ServiceItem,warm:boolean):void{if(warm||item.warmthTicks===undefined)return;item.warmthTicks=Math.max(0,item.warmthTicks-1);if(item.warmthTicks===0)item.cold=true;}
/** Fixed 20 Hz evolution. Callers own real-time budgets and replay authorization. */
export function stepService(s:ServiceState,ticks=1):void {
  if(!Number.isInteger(ticks)||ticks<1||ticks>12000)return;
  for(let n=0;n<ticks&&active(s);n++) {
    s.tick++;if(s.stats){if(s.phase==='preparing')s.stats.prepTicks++;const queue=s.customers.filter(c=>c.phase==='queue').length;s.stats.queuePeak=Math.max(s.stats.queuePeak,queue);s.stats.queueTicks+=queue;}
    workServiceMess(s);
    const wasWalking=s.chef.path.length>0;moveActor(s.chef,SERVICE_RULES.chefSpeed);
    if(wasWalking&&!s.chef.path.length&&s.chef.targetId)performInteraction(s);
    for(const helper of s.helpers){const walking=helper.path.length>0;moveActor(helper,SERVICE_RULES.chefSpeed*.9);if(walking&&!helper.path.length&&helper.targetId&&helper.task?.kind!=='prep')asHelper(s,helper,()=>performInteraction(s));if(s.tick%5===0)decideHelper(s,helper);}
    const washedStations=new Set<string>();
    for(const station of s.stations)for(const slot of station.slots) {
      const job=slot.job,item=slot.item;if(!item)continue;
      liftAutomaticFryer(station,slot);
      if(job&&!job.ready) {
        const manual=job.action==='hold'||job.action==='wash';
        const working=!manual||[s.chef,...s.helpers].some(actor=>actor.targetId===station.id&&actor.holding&&!actor.path.length&&isAtStationAccess(s.config.tier,s.stations,s.tables,actor,station));
        if(working&&(!manual||station.kind!=='sink'||(!washedStations.has(station.id)&&!!washedStations.add(station.id)))&&--job.remaining<=0)finishCooking(s,station,slot);
      }else if(job?.ready&&job.burnRemaining!==null&&!protectedLesson(s)&&--job.burnRemaining<=0&&item.kind!=='burnt') {
        item.kind='burnt';item.stage='burnt';if(slot.batch)slot.batch=burnFryBatch(slot.batch);job.burnRemaining=null;s.burnt++;emit(s,'burn',station.id);
      }
      if(s.config.cookingVersion===1&&slot.item?.warmthTicks!==undefined){coolComponent(slot.item,!!EQUIPMENT_BY_ID[station.kind]?.tiers[station.tier-1]?.warm);}
      else if((slot.item?.kind==='dish'||preparedFood(slot.item))&&slot.item.finishedTick!==undefined) {
        if(EQUIPMENT_BY_ID[station.kind]?.tiers[station.tier-1]?.warm)slot.item.finishedTick=s.tick;
        else if(s.tick-slot.item.finishedTick>=coldTicks(s))slot.item.cold=true;
      }
    }
    for(const actor of [s.chef,...s.helpers])if(s.config.cookingVersion===1&&actor.held?.warmthTicks!==undefined)coolComponent(actor.held,false);
    if(s.chef.held?.warmthTicks===undefined&&(s.chef.held?.kind==='dish'||preparedFood(s.chef.held))&&s.chef.held.finishedTick!==undefined&&s.tick-s.chef.held.finishedTick>=coldTicks(s))s.chef.held.cold=true;
    // The opening lesson waits for a real serve/eat/collect/wash cycle. Time
    // alone cannot bring another order while the first guest is being learned.
    const firstLesson=(s.config.lessonVersion===1?protectedLesson(s):s.config.tutorialLearning)&&s.spawned===1,lessonDone=s.config.lessonVersion===1?s.customers[0]?.washed===true:s.washed>0||(s.config.batchVersion&&s.customers[0]?.recipeId==='fries'&&s.customers[0].servedTick!==null&&!s.tables.some(table=>table.seats.some(seat=>seat.mealId===s.customers[0].mealId)));
    if(firstLesson&&lessonDone&&s.config.lessonVersion===1){s.lessonStatus='complete';notice(s,'Thanks, says Old Pete. You did it! Normal service begins: watch your food and your guests’ patience.');}
    // Count the inter-arrival gap during the lesson, but never admit order two
    // before the real wash/clear. Once that is done, the wait is at most 1 second.
    if(firstLesson&&!lessonDone)s.nextArrival=Math.max(20,s.nextArrival-1);
    if(firstLesson&&lessonDone)s.nextArrival=Math.min(20,s.nextArrival);
    if(s.phase!=='preparing'&&s.spawned<s.config.customers&&(!firstLesson||lessonDone)&&--s.nextArrival<=0)spawnCustomer(s);
    if(s.phase!=='preparing')seatQueue(s);
    const drain=(s.config.cosy?2/3:1)*(s.config.spices.includes('rush_hour')?1.25:1)*cleanupDrain(s.messes?.length??0);
    for(const customer of s.customers) {
      if(!active(s))break;
      if(customer.phase==='queue')moveWaitingCustomer(s,customer);
      else if(customer.phase==='walking') {moveActor(customer,SERVICE_RULES.customerSpeed*(s.config.destinationVersion?customerTraits(customer.type).walk:1)*(s.config.domain==='smoothie'?1.15:1));if(!customer.path.length){customer.phase='seated';const seat=s.tables.find(t=>t.id===customer.tableId)?.seats.find(seat=>seat.id===customer.seatId);if(seat)seat.status='occupied';emit(s,'sit',customer.id);}}
      else if(customer.phase==='leaving'){moveActor(customer,SERVICE_RULES.customerSpeed*(s.config.destinationVersion?customerTraits(customer.type).walk:1)*(s.config.domain==='smoothie'?1.15:1));if(!customer.path.length)customer.phase='gone';}
      else if(customer.phase==='eating'){if(--customer.eatRemaining<=0)payCustomer(s,customer);}
      if(!(s.config.lessonVersion===1?protectedLesson(s):s.config.tutorialLearning)&&(customer.phase==='queue'||customer.phase==='seated')) {customer.patience-=drain;if(customer.patience<=0)leaveCustomer(s,customer,true);}
    }
    if(s.phase!=='preparing'&&active(s)&&!protectedLesson(s)&&s.spawned>=s.config.customers&&s.customers.every(c=>c.phase==='gone')&&!(s.messes?.length)) {s.phase='complete';s.chef.holding=false;notice(s,'Service complete. Time to choose the next stop.');emit(s,'complete','service',s.coins);}
  }
}
