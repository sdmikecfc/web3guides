import { CONTENT_VERSION, DAILY_SPECIALS, DIFFICULTIES, EQUIPMENT_BY_ID, INGREDIENT_BY_ID, ingredientSupply, RECIPE_BY_ID, SERVICE_RULES, SPICES, TRUCK_TIERS, recipePrice } from './content';
import { blockedCells, inServiceFloor, isAdjacent, makeStation, makeTable, pointKey, serviceGeometry, servicePath, starterStations, starterTables, stationFootprint, stationWorkingCell, tableFootprint, targetPath, validateServiceLayout } from './geometry';
import type { CreateServiceOptions, CustomerType, Point, RecipeStep, ServiceAction, ServiceCustomer, ServiceEvent, ServiceHelper, ServiceItem, ServiceResult, ServiceSeat, ServiceState, ServiceStation, ServiceTable, StationSlot } from './types';
export type * from './types';
import {createFryBatch,markFryBatchReady,raiseFryBatch,burnFryBatch,takeFryPortion,validateFryBatch,recipeVessel,vesselReusable,SERVING_VESSELS,type VesselKind} from './batch';
export function serviceRecipeSteps(s:Pick<ServiceState,'config'>,recipeId:string):RecipeStep[]{const steps=RECIPE_BY_ID[recipeId]?.steps??[];return recipeId==='fries'&&!s.config.batchVersion?steps.slice(1):steps;}
const vesselOf=(item:ServiceItem):VesselKind=>item.vesselKind??'plate';
const foodVessel=(s:ServiceState,item:ServiceItem):VesselKind=>s.config.batchVersion?recipeVessel(item.recipeId):'plate';
const stockFor=(s:ServiceState,kind:VesselKind)=>kind==='cup'?s.cupStock:s.plateStock;
function returnVessel(s:ServiceState,item:ServiceItem):void{const kind=vesselOf(item);if(!vesselReusable(kind))return;const stock=stockFor(s,kind);if(!stock.includes(item.id))stock.push(item.id);s.cleanPlates=s.plateStock.length;s.cleanCups=s.cupStock.length;}


const copy = <T>(value:T):T => JSON.parse(JSON.stringify(value));
const integer = (value:unknown,fallback:number,min:number,max:number):number => typeof value==='number' && Number.isFinite(value) ? Math.max(min,Math.min(max,Math.floor(value))) : fallback;
function seedNumber(seed:string):number { let n=2166136261; for(let i=0;i<seed.length;i++) n=Math.imul(n^seed.charCodeAt(i),16777619); return n>>>0 || 1; }
function random(s:ServiceState):number { let n=s.rng; n^=n<<13;n^=n>>>17;n^=n<<5;s.rng=n>>>0;return s.rng/4294967296; }
function id(s:ServiceState,prefix:string):string { return `${prefix}_${s.nextId++}`; }
function emit(s:ServiceState,type:ServiceEvent['type'],targetId:string,amount?:number):void { s.events.push({id:s.nextId++,tick:s.tick,type,targetId,...(amount===undefined?{}:{amount})}); if(s.events.length>SERVICE_RULES.maxEvents)s.events.shift(); }
function clearTarget(s:ServiceState):void { s.chef.targetId=null;s.chef.targetSeatId=null;s.chef.targetRecipeId=null;s.chef.targetIngredientId=null;s.chef.holding=false; }
function notice(s:ServiceState,message:string):void { s.notice=message; }
const active = (s:ServiceState):boolean => s.phase==='preparing'||s.phase==='playing'||s.phase==='closing';
export function createService(options:CreateServiceOptions={}):ServiceState {
  const tier=integer(options.tier,1,1,4) as 1|2|3|4, seed=typeof options.seed==='string'?options.seed.slice(0,200):'diner-opening';
  const levels:Record<string,number>={}; for(const key of Object.keys(RECIPE_BY_ID)) levels[key]=integer(options.recipeLevels?.[key],0,0,10);
  const menu=[...new Set((options.menu??['classic_burger','fries']).filter(id=>typeof id==='string'&&RECIPE_BY_ID[id]))].slice(0,4);
  const rack=(options.stations??starterStations(tier)).find(station=>station.kind==='plates'),plateCount=options.physicalSupplies===false?0:integer(options.plateCount,EQUIPMENT_BY_ID.plates.tiers[(rack?.tier??1)-1].capacity,1,24);
  const batchVersion=options.batchVersion===0?0:options.batchVersion===1?1:options.physicalSupplies===false?0:1,cupRack=(options.stations??starterStations(tier)).find(station=>station.kind==='cups'),cupCount=batchVersion&&cupRack?integer(options.cupCount,EQUIPMENT_BY_ID.cups.tiers[cupRack.tier-1].capacity,0,24):0;
  const s:ServiceState={version:1,contentVersion:CONTENT_VERSION,phase:'setup',pausedPhase:null,tick:0,rng:seedNumber(seed),nextId:1,
    chef:{...serviceGeometry(tier).door,path:[],held:null,targetId:null,targetSeatId:null,targetRecipeId:null,targetIngredientId:null,holding:false},helpers:[],
    stations:options.stations?options.stations.map(st=>makeStation(st.id,st.kind,st.x,st.y,st.tier,st.facing)):starterStations(tier),
    tables:options.tables?options.tables.map(t=>makeTable(t.id,t.x,t.y,t.capacity,t.tier,t.rotation??0)):starterTables(tier),customers:[],
    config:{seed,tier,menu,recipeLevels:levels,customers:integer(options.customers,DIFFICULTIES.slow.customers,1,80),arrivalTicks:integer(options.arrivalTicks,DIFFICULTIES.slow.arrivalTicks,20,2400),queuePatienceTicks:integer(options.queuePatienceTicks,DIFFICULTIES.slow.queuePatienceTicks,20,12000),tablePatienceTicks:integer(options.tablePatienceTicks,DIFFICULTIES.slow.tablePatienceTicks,20,12000),cosy:options.cosy===true,practice:options.practice===true,strikeLimit:integer(options.strikeLimit,options.cosy?5:3,1,5),tutorialFailure:options.tutorialFailure===true,customerTypes:(options.customerTypes??['walk_in']).filter(t=>['walk_in','office','kid','family','critic','influencer','regular'].includes(t)),specials:[...new Set((options.specials??[]).filter(k=>(DAILY_SPECIALS as readonly string[]).includes(k)))].slice(0,3),spices:[...new Set((options.spices??[]).filter(k=>(SPICES as readonly string[]).includes(k)))],helpers:[],tipMultiplier:integer(options.tipMultiplier,1,1,2),tutorialLearning:options.tutorialLearning===true,physicalSupplies:options.physicalSupplies!==false,plateCount,cupCount,batchVersion},
    cleanCups:cupCount,cupStock:Array.from({length:cupCount},(_,i)=>`service_cup_${i+1}`),cleanPlates:plateCount,plateStock:Array.from({length:plateCount},(_,i)=>`service_plate_${i+1}`),spawned:0,nextArrival:20,coins:0,reputation:0,strikes:0,combo:0,served:0,paid:0,missed:0,burnt:0,washed:0,notice:'Choose your menu and open for service.',events:[],influenceRemaining:0};
  if(!s.config.customerTypes.length)s.config.customerTypes=['walk_in'];
  s.config.helpers=(options.spices?.includes('short_staffed')?[]:(options.helpers??[])).filter((helper,i,all)=>helper&&/^[a-zA-Z0-9_-]{1,64}$/.test(helper.id)&&['washer','runner','prep'].includes(helper.role)&&all.findIndex(h=>h.id===helper.id)===i).slice(0,TRUCK_TIERS[tier].helpers).map(helper=>({id:helper.id,role:helper.role,look:integer(helper.look,0,0,7)}));
  s.helpers=s.config.helpers.map(helper=>({...copy(s.chef),...helper,task:null}));
  const error=serviceReadyError(s); if(error)s.notice=error;
  return s;
}
export function serviceReadyError(s:ServiceState):string|null {
  const invalid=validateServiceLayout(s.config.tier,s.stations,s.tables);if(invalid)return invalid;
  if(s.config.physicalSupplies)for(const kind of ['fridge','plates'])if(!s.stations.some(station=>station.kind===kind))return `Place the ${EQUIPMENT_BY_ID[kind].name.toLowerCase()} before opening.`;
  if(!s.config.menu.length)return 'Choose at least one recipe.';
  if(s.config.spices.includes('full_menu')&&s.config.menu.length<3)return 'Full menu requires three recipes.';
  for(const recipeId of s.config.menu) { const recipe=RECIPE_BY_ID[recipeId]; if(!recipe)return 'Unknown recipe.';for(const step of serviceRecipeSteps(s,recipeId))if(!s.stations.some(st=>st.kind===step.station))return `${recipe.name} needs a ${EQUIPMENT_BY_ID[step.station].name.toLowerCase()}.`; }
  if(s.config.batchVersion)for(const id of s.config.menu){const kind=SERVING_VESSELS[recipeVessel(id)].supply;if(kind&&!s.stations.some(st=>st.kind===kind))return `Place the ${EQUIPMENT_BY_ID[kind].name.toLowerCase()} before opening.`;}
  return null;
}
export function serviceResult(s:ServiceState):ServiceResult { return {coins:s.config.practice?0:s.coins,reputation:s.config.practice?0:s.reputation,strikes:s.strikes,completed:s.phase==='complete',failed:s.phase==='failed',served:s.served,missed:s.missed,practice:s.config.practice}; }
/** Local checkpoint validation, never proof of earned progress. Active saves resume paused. */
export function sanitizeService(raw:unknown):ServiceState|null {
  try {
    if(!raw||typeof raw!=='object')return null;
    const s=copy(raw) as ServiceState;
    if(s.version!==1||s.contentVersion!==CONTENT_VERSION||!s.config||typeof s.config.seed!=='string'||s.config.seed.length>200||!TRUCK_TIERS[s.config.tier])return null;
    if(s.helpers===undefined)s.helpers=[];if(s.config.helpers===undefined)s.config.helpers=[];if(s.config.tipMultiplier===undefined)s.config.tipMultiplier=1;if(s.config.tutorialLearning===undefined)s.config.tutorialLearning=false;if(s.config.physicalSupplies===undefined)s.config.physicalSupplies=false;
    s.config.batchVersion??=0;s.config.cupCount??=0;s.cleanCups??=0;s.cupStock??=[];
    if(Array.isArray(s.stations))for(const st of s.stations)if(st.kind==='sink'&&Array.isArray(st.slots)){const capacity=EQUIPMENT_BY_ID.sink.tiers[st.tier-1]?.capacity??0;while(st.slots.length<capacity)st.slots.push({item:null,job:null});}
    if(s.chef)s.chef.targetIngredientId??=null;for(const helper of s.helpers)helper.targetIngredientId??=null;
    if(!s.config.physicalSupplies){s.config.plateCount??=0;s.cleanPlates??=0;s.plateStock??=[];}
    if(Array.isArray(s.tables))for(const table of s.tables)if(table&&table.rotation===undefined)table.rotation=0;
    if(!Array.isArray(s.stations)||!Array.isArray(s.tables)||!Array.isArray(s.customers)||s.customers.length>80||!Array.isArray(s.config.menu)||s.config.menu.length<1||s.config.menu.length>4||new Set(s.config.menu).size!==s.config.menu.length||s.config.menu.some(id=>!RECIPE_BY_ID[id]))return null;
    if(!Array.isArray(s.config.specials)||!Array.isArray(s.config.spices)||!Array.isArray(s.config.customerTypes)||!s.config.recipeLevels||(s.phase==='setup'?validateServiceLayout(s.config.tier,s.stations,s.tables,{allowIncomplete:true}):serviceReadyError(s)))return null;
    const whole=(v:unknown,max=1e9):boolean=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
    if(!['setup','preparing','playing','closing','paused','complete','failed'].includes(s.phase)||![null,'preparing','playing','closing'].includes(s.pausedPhase))return null;
    for(const key of ['tick','rng','nextId','spawned','coins','reputation','strikes','combo','served','paid','missed','burnt','washed','influenceRemaining'] as const)if(!whole(s[key],key==='rng'?4294967295:1e9))return null;
    if(s.spawned!==s.customers.length||s.spawned>s.config.customers||s.served>s.spawned||s.paid>s.served||s.missed+s.served>s.spawned||s.combo>10||s.strikes>5||!Number.isFinite(s.nextArrival))return null;
    const normalized=createService({...s.config,stations:s.stations,tables:s.tables});
    if(Object.keys(s.config).some(key=>!Object.hasOwn(normalized.config,key))||Object.keys(normalized.config).some(key=>JSON.stringify(normalized.config[key as keyof typeof normalized.config])!==JSON.stringify(s.config[key as keyof typeof s.config])))return null;
    const occupied=blockedCells(s.stations,s.tables), validPosition=(p:Point):boolean=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&inServiceFloor(s.config.tier,{x:Math.round(p.x),y:Math.round(p.y)})&&!occupied.has(pointKey({x:Math.round(p.x),y:Math.round(p.y)}));
    const validPath=(p:Point&{path:Point[]}):boolean=>validPosition(p)&&Array.isArray(p.path)&&p.path.length<300&&p.path.every((q,i)=>validPosition(q)&&Number.isInteger(q.x)&&Number.isInteger(q.y)&&(i?Math.abs(q.x-p.path[i-1].x)+Math.abs(q.y-p.path[i-1].y)===1:Math.abs(q.x-p.x)+Math.abs(q.y-p.y)<=1.01));
    if(!whole(s.config.plateCount,24)||!whole(s.cleanPlates,s.config.plateCount)||!Array.isArray(s.plateStock)||s.plateStock.length!==s.cleanPlates||new Set(s.plateStock).size!==s.plateStock.length||s.plateStock.some(id=>typeof id!=='string'||!id.length||id.length>64))return null;
    if(![0,1].includes(s.config.batchVersion)||!whole(s.config.cupCount,24)||!whole(s.cleanCups,s.config.cupCount)||!Array.isArray(s.cupStock)||s.cupStock.length!==s.cleanCups||new Set(s.cupStock).size!==s.cupStock.length||s.cupStock.some(id=>typeof id!=='string'||!id.length||id.length>64||s.plateStock.includes(id)))return null;
    const plateIds=new Set(s.plateStock),cupIds=new Set(s.cupStock),registerPlate=(id:string,kind:VesselKind)=>{if(!vesselReusable(kind))return true;if(plateIds.has(id)||cupIds.has(id))return false;(kind==='cup'?cupIds:plateIds).add(id);return true;};
    const itemIds=new Set<string>([...s.plateStock,...s.cupStock]), validItem=(item:ServiceItem|null):boolean=>{
      if(item===null)return true;
      if(!item||typeof item.id!=='string'||item.id.length>64||itemIds.has(item.id)||!Object.hasOwn(RECIPE_BY_ID,item.recipeId)||!['ingredient','plate','raw','processed','dish','burnt','dirty'].includes(item.kind)||!whole(item.step,serviceRecipeSteps(s,item.recipeId).length)||!whole(item.createdTick,s.tick)||typeof item.stage!=='string'||typeof item.cold!=='boolean'||(item.finishedTick!==undefined&&!whole(item.finishedTick,s.tick)))return false;
      if(item.kind==='dirty'&&((!item.meal&&!item.physical)||(item.meal&&!s.customers.some(c=>c.mealId===item.meal!.mealId&&c.tableId===item.meal!.tableId&&c.seatId===item.meal!.seatId&&c.servedTick!==null&&!c.washed))))return false;
      if(item.vesselKind!==undefined&&!Object.hasOwn(SERVING_VESSELS,item.vesselKind))return false;
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
    if(!s.chef||!validPath(s.chef)||!validItem(s.chef.held)||typeof s.chef.holding!=='boolean'||!Array.isArray(s.helpers)||s.helpers.length!==s.config.helpers.length)return null;
    for(const [i,helper] of s.helpers.entries())if(helper.id!==s.config.helpers[i].id||helper.role!==s.config.helpers[i].role||!validPath(helper)||!validItem(helper.held)||typeof helper.holding!=='boolean'||(helper.task&&(!['wash','deliver','prep'].includes(helper.task.kind)||!['take','deliver','work'].includes(helper.task.phase))))return null;
    for(const station of s.stations){const capacity=EQUIPMENT_BY_ID[station.kind].tiers[station.tier-1].capacity;if(!Array.isArray(station.slots)||station.slots.length!==capacity)return null;for(const slot of station.slots){if(!validItem(slot.item))return null;if(slot.batch&&(!s.config.batchVersion||station.kind!=='fryer'||slot.item?.recipeId!=='fries'||!validateFryBatch(slot.batch)||slot.batch.createdTick>s.tick||!slot.job||(slot.batch.phase==='cooking'&&slot.job.ready)||(slot.batch.phase!=='cooking'&&!slot.job.ready)||(slot.batch.phase==='raised'&&slot.job.burnRemaining!==null)||(slot.batch.phase==='burnt'&&slot.item.kind!=='burnt')||(slot.batch.phase!=='burnt'&&slot.item.kind==='burnt')))return null;const job=slot.job;if(job&&(!slot.item||!['instant','hold','timed','risk','wash'].includes(job.action)||!whole(job.remaining,12000)||!whole(job.total,12000)||job.remaining>job.total||(job.burnRemaining!==null&&!whole(job.burnRemaining,12000))||typeof job.ready!=='boolean'))return null;}}
    const customerIds=new Set<string>();for(const c of s.customers){if(!c||typeof c.id!=='string'||customerIds.has(c.id)||!validPath(c)||!s.config.menu.includes(c.recipeId)||!['queue','walking','seated','eating','leaving','gone'].includes(c.phase)||!Number.isFinite(c.patience)||!Number.isFinite(c.maxPatience)||!whole(c.eatRemaining,12000)||!whole(c.payment)||!whole(c.tip)||typeof c.servedCold!=='boolean')return null;customerIds.add(c.id);}
    for(const table of s.tables)for(const seat of table.seats)if(!['clean','reserved','occupied','eating','dirty','awaitingWash'].includes(seat.status)||!validItem(seat.item)||(seat.customerId!==null&&!customerIds.has(seat.customerId)))return null;
    if(plateIds.size!==s.config.plateCount||cupIds.size!==s.config.cupCount)return null;
    for(const table of s.tables)for(const seat of table.seats)if(seat.status==='awaitingWash'&&!seat.item){seat.status='clean';seat.mealId=null;seat.customerId=null;}
    if(s.chef.targetId!==null&&!s.stations.some(st=>st.id===s.chef.targetId)&&!s.tables.some(t=>t.id===s.chef.targetId))return null;
    s.events=Array.isArray(s.events)?s.events.filter(e=>e&&whole(e.id)&&whole(e.tick,s.tick)&&['arrive','sit','ready','burn','serve','pay','strike','wash','complete'].includes(e.type)&&typeof e.targetId==='string').slice(-SERVICE_RULES.maxEvents):[];
    s.notice=typeof s.notice==='string'?s.notice.slice(0,300):'';
    if(active(s)){s.pausedPhase=s.phase as 'preparing'|'playing'|'closing';s.phase='paused';}s.chef.holding=false;
    return s;
  } catch {return null;}
}
export function itemLabel(item:ServiceItem|null):string { if(!item)return 'Empty hands';if(item.kind==='dirty')return `Dirty ${SERVING_VESSELS[vesselOf(item)].name}`;if(item.kind==='plate')return `${vesselReusable(vesselOf(item))?'Clean':'Empty'} ${SERVING_VESSELS[vesselOf(item)].name}`;if(item.kind==='ingredient')return item.ingredientId==='beef'?'Raw patty':INGREDIENT_BY_ID[item.ingredientId??'']?.name??'Ingredient';const name=RECIPE_BY_ID[item.recipeId]?.name??'Food';if(preparedFood(item))return `${name} · needs a ${SERVING_VESSELS[recipeVessel(item.recipeId)].name}`;return item.kind==='dish'?`${item.cold?'Cold ':''}${name}`:item.kind==='burnt'?`Burnt ${name.toLowerCase()}`:`${name}: ${item.stage.replaceAll('_',' ')}`; }
export function serviceSupplyChoices(s:ServiceState,stationId:string):{ingredientId:string;recipeId:string;name:string}[]{
  const station=s.stations.find(item=>item.id===stationId);if(!station||!['crate','fridge'].includes(station.kind)||!s.config.physicalSupplies)return [];
  return s.config.menu.flatMap(recipeId=>{const recipe=RECIPE_BY_ID[recipeId];return [recipe.ingredients[0],...(recipe.assemblyIngredients??[])].filter(ingredientId=>ingredientSupply(ingredientId)===station.kind).map(ingredientId=>({ingredientId,recipeId,name:ingredientId==='beef'?'Raw patty':INGREDIENT_BY_ID[ingredientId]?.name??ingredientId}));});
}
export type ServiceIntent = { label:string;disabled:boolean;hold:boolean;progress?:number;reason?:string };
/** Text and hold semantics come from the same recipe/job data as the interaction. */
export function serviceTargetIntent(s:ServiceState,targetId:string,seatId?:string,recipeId?:string):ServiceIntent {
  const station=s.stations.find(st=>st.id===targetId),table=s.tables.find(t=>t.id===targetId),held=s.chef.held;
  const stop=(label:string,reason=label):ServiceIntent=>({label,disabled:true,hold:false,reason});
  if(!station&&!table)return stop('Choose a station or table');
  if(!active(s))return stop(s.phase==='setup'?'Open to start cooking':s.phase==='paused'?'Resume service':'Service has ended');
  if(table){const seats=seatId?table.seats.filter(seat=>seat.id===seatId):table.seats;if(!held)return seats.some(seat=>seat.item?.kind==='dirty')?{label:'Clear dirty plate',disabled:false,hold:false}:stop('No dirty plate here');
    const customer=s.customers.find(c=>c.phase==='seated'&&c.recipeId===held.recipeId&&seats.some(seat=>seat.customerId===c.id));if(held.kind==='dish'&&customer&&seats.find(seat=>seat.customerId===customer.id)?.item?.kind==='dirty')return stop('Clear the old dish before serving');return held.kind==='dish'&&customer?{label:`Serve ${RECIPE_BY_ID[held.recipeId].name.toLowerCase()}`,disabled:false,hold:false}:stop('Bring the ordered dish');}
  if(s.config.physicalSupplies&&['crate','fridge'].includes(station!.kind)){const choices=serviceSupplyChoices(s,station!.id).filter(choice=>!recipeId||choice.recipeId===recipeId);return held?stop('Put down held item first'):choices.length===1?{label:`Take ${choices[0].name.toLowerCase()}`,disabled:false,hold:false}:choices.length?{label:'Choose an ingredient',disabled:false,hold:false}:stop('No ingredients for this menu here');}
  if(s.config.physicalSupplies&&['plates','cups','boxes'].includes(station!.kind)){const kind:VesselKind=station!.kind==='cups'?'cup':station!.kind==='boxes'?'fry_box':'plate',name=SERVING_VESSELS[kind].name,count=kind==='fry_box'?Infinity:stockFor(s,kind).length;return held?.kind==='plate'&&vesselOf(held)===kind?{label:`Return ${name}`,disabled:false,hold:false}:held?stop('Put down held item first'):count>0?{label:`Take ${name}${Number.isFinite(count)?' · '+count+' left':''}`,disabled:false,hold:false}:stop(`Wash a ${name} first`);}
  const basket=station!.slots.find(slot=>slot.item&&slot.batch?.phase===(held?.kind==='plate'?'raised':'ready'))??station!.slots.find(slot=>slot.batch&&slot.item);if(basket?.batch){if(!held&&basket.batch.phase==='ready')return {label:'Raise fryer basket',disabled:false,hold:false};if(held?.kind==='plate'&&vesselOf(held)==='fry_box')return basket.batch.phase==='raised'?{label:`Fill fries box · ${basket.batch.remaining} left`,disabled:false,hold:false}:stop('Raise the ready basket first');if(!held&&basket.batch.phase==='raised')return stop('Bring an empty fries box');}
  if(station!.kind==='crate')return held?stop('Put down held item first'):{label:`Take ${RECIPE_BY_ID[recipeId??s.config.menu[0]]?.name.toLowerCase()??'recipe'} ingredients`,disabled:false,hold:false};
  if(held?.kind==='plate'&&station!.slots.some(slot=>preparedFood(slot.item)&&!slot.batch&&foodVessel(s,slot.item!)===vesselOf(held!)))return {label:`Serve in the ${SERVING_VESSELS[vesselOf(held!)].name}`,disabled:false,hold:false};
  if(preparedFood(held)&&station!.slots.some(slot=>slot.item?.kind==='plate'&&vesselOf(slot.item)===foodVessel(s,held!)))return {label:'Put food on the clean plate',disabled:false,hold:false};
  if(held?.physical&&station!.kind==='prep'&&station!.slots.some(slot=>slot.item&&((held.kind==='ingredient'&&held.ingredientId&&missingAssembly(slot.item).includes(held.ingredientId))||(slot.item.kind==='ingredient'&&slot.item.ingredientId&&missingAssembly(held).includes(slot.item.ingredientId)))))return {label:'Combine patty and bun',disabled:false,hold:false};
  if(station!.kind==='bin')return held?.kind==='dirty'?stop('Wash this plate at the sink'):held?{label:'Discard held food',disabled:false,hold:false}:stop('Nothing to discard');
  const ready=station!.slots.find(slot=>slot.item&&(!slot.job||slot.job.ready));
  if(!held&&ready)return {label:`Take ${itemLabel(ready.item).toLowerCase()}`,disabled:false,hold:false};
  const working=station!.slots.find(slot=>slot.item&&slot.job&&!slot.job.ready);
  if(!held&&working?.job){const job=working.job,manual=job.action==='hold'||job.action==='wash',step=working.item?.kind==='dirty'?null:serviceRecipeSteps(s,working.item!.recipeId)[working.item!.step];return {label:manual?job.action==='wash'?'Hold to wash plate':`Hold to ${(step?.label??'work').toLowerCase()}`:`Cooking · ${Math.ceil(job.remaining/20)}s`,disabled:!manual,hold:manual,progress:1-job.remaining/job.total};}
  if(held){if(!station!.slots.some(slot=>!slot.item))return stop('Station is full');if(station!.kind==='sink')return held.kind==='dirty'?{label:'Put plate in sink',disabled:false,hold:false}:stop('Bring a dirty plate');if(held.kind==='dirty')return stop('Take this plate to the sink');if(held.kind==='burnt')return stop('Take burnt food to the bin');const step=stationStep(s,station!,held);if(step)return {label:step.action==='hold'?`Start ${step.label.toLowerCase()}`:step.label,disabled:false,hold:false};if(station!.kind==='prep'||station!.kind==='pass')return {label:'Put down held food',disabled:false,hold:false};return stop('Use the next recipe station');}
  return stop('Bring recipe ingredients');
}

/** Every accepted command returns an independent serializable state. No wall-clock reads. */
export function dispatchService(previous:ServiceState,action:ServiceAction):ServiceState {
  const s=copy(previous);
  if(!action||typeof action!=='object'||typeof action.type!=='string'){notice(s,'Invalid service action.');return s;}
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
    if(typeof action.targetId!=='string'||(action.recipeId!==undefined&&(typeof action.recipeId!=='string'||!Object.hasOwn(RECIPE_BY_ID,action.recipeId)))||(action.ingredientId!==undefined&&(typeof action.ingredientId!=='string'||!Object.hasOwn(INGREDIENT_BY_ID,action.ingredientId)))||(action.seatId!==undefined&&typeof action.seatId!=='string')){notice(s,'Invalid interaction.');return s;}
    routeInteraction(s,action.targetId,action.recipeId??null,action.seatId??null,action.ingredientId??null);return s;
  }
  notice(s,'Unknown service action.');return s;
}
function routeInteraction(s:ServiceState,targetId:string,recipeId:string|null,seatId:string|null,ingredientId:string|null=null):void {
  const station=s.stations.find(st=>st.id===targetId),table=s.tables.find(t=>t.id===targetId);
  if(!station&&!table){notice(s,'That target no longer exists.');return;}
  if(seatId&&(!table||!table.seats.some(seat=>seat.id===seatId))){notice(s,'That seat does not belong to this table.');return;}
  const footprint=station?stationFootprint(station):tableFootprint(table!);
  const path=station?servicePath(s.config.tier,s.stations,s.tables,s.chef,stationWorkingCell(station)):targetPath(s.config.tier,s.stations,s.tables,s.chef,footprint);
  if(!path){notice(s,'There is no clear route.');return;}
  s.chef.path=path;s.chef.targetId=targetId;s.chef.targetRecipeId=recipeId;s.chef.targetSeatId=seatId;s.chef.targetIngredientId=ingredientId;s.chef.holding=false;
  if(!path.length)performInteraction(s);
}
function performInteraction(s:ServiceState):void {
  const station=s.stations.find(st=>st.id===s.chef.targetId),table=s.tables.find(t=>t.id===s.chef.targetId);
  if(station)interactStation(s,station);else if(table)interactTable(s,table);else clearTarget(s);
}
function stationStep(s:ServiceState,station:ServiceStation,item:ServiceItem):RecipeStep|null {
  if(item.kind==='plate'||(item.physical&&item.kind==='ingredient'&&item.ingredientId!==RECIPE_BY_ID[item.recipeId]?.ingredients[0]))return null;
  const step=serviceRecipeSteps(s,item.recipeId)[item.step];if(!step||step.station!==station.kind)return null;
  let action=step.action,ticks=step.ticks;
  if(station.kind==='blender'&&station.tier>=2)action='timed';
  if(station.kind==='drinks'&&station.tier>=2){action='instant';ticks=0;}
  if(action==='hold'&&s.config.specials.includes('sharp_knives'))ticks=Math.ceil(ticks/2);
  const spec=EQUIPMENT_BY_ID[station.kind].tiers[station.tier-1];
  return {...step,action,ticks:Math.max(action==='instant'?0:1,Math.round(ticks/(spec?.speed??1))),burnTicks:spec?.noBurn?undefined:step.burnTicks};
}
export function serviceMissingIngredients(item:ServiceItem):string[]{
  const recipe=RECIPE_BY_ID[item.recipeId];if(!item.physical||recipe?.steps[item.step]?.station!=='prep'||item.ingredientId!==recipe.ingredients[0])return [];
  return (recipe.assemblyIngredients??[]).filter(ingredientId=>!item.components?.some(component=>component.ingredientId===ingredientId));
}
const missingAssembly=serviceMissingIngredients;
const preparedFood=(item:ServiceItem|null):item is ServiceItem & {kind:'processed'}=>!!item&&item.physical===true&&item.kind==='processed'&&item.stage.startsWith('prepared_');
export const isPreparedServiceFood=preparedFood;
function putOnPlate(food:ServiceItem,plate:ServiceItem):ServiceItem{food.vesselKind=vesselOf(plate);food.kind='dish';food.stage=`plated_${food.recipeId}`;food.plateId=plate.id;return food;}
function joinAtCounter(s:ServiceState,station:ServiceStation,held:ServiceItem):boolean{
  if(station.kind!=='prep'||!held.physical)return false;
  const withComponent=station.slots.find(slot=>slot.item&&slot.item.kind==='ingredient'&&slot.item.ingredientId&&missingAssembly(held).includes(slot.item.ingredientId));
  const withMain=station.slots.find(slot=>slot.item&&held.kind==='ingredient'&&held.ingredientId&&missingAssembly(slot.item).includes(held.ingredientId));
  const slot=withComponent??withMain;if(!slot)return false;
  const main=withComponent?held:slot.item!,component=withComponent?slot.item!:held;
  main.components=[...(main.components??[]),{id:component.id,ingredientId:component.ingredientId!}];slot.item=main;slot.job=null;s.chef.held=null;
  const missing=missingAssembly(main),step=stationStep(s,station,main);
  if(!missing.length&&step){slot.job={action:step.action,remaining:step.ticks,total:step.ticks,burnRemaining:step.burnTicks??null,ready:false};notice(s,`${step.label} — hold to combine.`);}
  else {notice(s,`Add ${missing.map(id=>INGREDIENT_BY_ID[id].name.toLowerCase()).join(' and ')}.`);clearTarget(s);}
  return true;
}
function interactStation(s:ServiceState,station:ServiceStation):void {
  const chef=s.chef,held=chef.held;
  if(s.config.physicalSupplies&&['crate','fridge','plates','cups','boxes'].includes(station.kind)){
    if(['plates','cups','boxes'].includes(station.kind)){
      const kind:VesselKind=station.kind==='cups'?'cup':station.kind==='boxes'?'fry_box':'plate';
      if(held?.kind==='plate'&&vesselOf(held)===kind){returnVessel(s,held);chef.held=null;notice(s,'Serving vessel returned.');clearTarget(s);return;}
      if(held){notice(s,'Put down what you are holding first.');clearTarget(s);return;}
      const vesselId=kind==='fry_box'?id(s,'box'):stockFor(s,kind).shift();if(!vesselId){notice(s,`No clean ${SERVING_VESSELS[kind].name}s. Wash one at the sink.`);clearTarget(s);return;}
      s.cleanPlates=s.plateStock.length;s.cleanCups=s.cupStock.length;chef.held={id:vesselId,kind:'plate',physical:true,vesselKind:kind,recipeId:s.config.menu[0],step:0,stage:kind==='fry_box'?'empty_fry_box':`clean_${kind}`,createdTick:s.tick,cold:false};notice(s,`Picked up a ${SERVING_VESSELS[kind].name}.`);clearTarget(s);return;
    }
    if(held){notice(s,'Put down what you are holding first.');clearTarget(s);return;}
    const choices=serviceSupplyChoices(s,station.id).filter(choice=>(!chef.targetRecipeId||choice.recipeId===chef.targetRecipeId)&&(!chef.targetIngredientId||choice.ingredientId===chef.targetIngredientId));
    if(choices.length!==1){notice(s,choices.length?'Choose which ingredient to take.':'That ingredient does not come from this supply.');clearTarget(s);return;}
    const choice=choices[0];chef.held={id:id(s,'ingredient'),kind:'ingredient',physical:true,recipeId:choice.recipeId,ingredientId:choice.ingredientId,step:0,stage:`raw_${choice.ingredientId}`,createdTick:s.tick,cold:false};notice(s,`Picked up ${choice.name.toLowerCase()}.`);clearTarget(s);return;
  }
  if(station.kind==='crate') {
    if(held){notice(s,'Put down what you are holding first.');clearTarget(s);return;}
    const recipeId=chef.targetRecipeId??s.config.menu[0];
    if(!s.config.menu.includes(recipeId)){notice(s,'That recipe is not on today’s menu.');clearTarget(s);return;}
    chef.held={id:id(s,'food'),kind:'raw',recipeId,step:0,stage:`raw_${recipeId}`,createdTick:s.tick,cold:false};notice(s,`Picked up ingredients for ${RECIPE_BY_ID[recipeId].name.toLowerCase()}.`);clearTarget(s);return;
  }
  if(station.kind==='bin') {
    if(held?.kind==='dirty'){notice(s,'Dirty plates must be washed, not thrown away.');clearTarget(s);return;}
    if(held?.physical&&held.plateId&&vesselReusable(vesselOf(held))){chef.held={id:held.plateId,kind:'dirty',physical:true,vesselKind:vesselOf(held),recipeId:held.recipeId,step:serviceRecipeSteps(s,held.recipeId).length,stage:'dirty_plate',createdTick:s.tick,cold:false};notice(s,'Food discarded. Take its dirty plate to the sink.');clearTarget(s);return;}
    if(held?.kind==='plate'){returnVessel(s,held);chef.held=null;notice(s,'Clean plate returned to the rack.');clearTarget(s);return;}
    chef.held=null;notice(s,held?'Food discarded.':'The bin is empty.');clearTarget(s);return;
  }
  const basket=station.slots.find(slot=>slot.item&&slot.batch?.phase===(held?.kind==='plate'?'raised':'ready'))??station.slots.find(slot=>slot.batch&&slot.item);
  if(basket?.batch&&basket.item){
    if(!held&&basket.batch.phase==='ready'){basket.batch=raiseFryBatch(basket.batch)!;if(basket.job)basket.job.burnRemaining=null;notice(s,'Basket raised. Take a fries box for each portion.');clearTarget(s);return;}
    if(held?.kind==='plate'&&vesselOf(held)==='fry_box'){
      const portion=takeFryPortion(basket.batch);if(!portion){notice(s,'Raise the ready basket before filling boxes.');clearTarget(s);return;}
      chef.held=putOnPlate({...basket.item,id:id(s,'fries_portion'),components:undefined},held);basket.batch=portion.batch;
      if(!basket.batch){basket.item=null;basket.job=null;}notice(s,`Boxed fries · ${basket.batch?.remaining??0} portions left.`);clearTarget(s);return;
    }
    if(!held&&basket.batch.phase!=='burnt'){notice(s,basket.batch.phase==='cooking'?'Fries are cooking.':'Bring an empty fries box.');clearTarget(s);return;}
  }
  if(held?.kind==='plate'){
    const food=station.slots.find(slot=>preparedFood(slot.item)&&!slot.batch&&foodVessel(s,slot.item!)===vesselOf(held!));
    if(food){chef.held=putOnPlate(food.item!,held);food.item=null;food.job=null;notice(s,'Plated and ready to serve.');clearTarget(s);return;}
  }
  if(preparedFood(held)){
    const plate=station.slots.find(slot=>slot.item?.kind==='plate'&&vesselOf(slot.item)===foodVessel(s,held!));
    if(plate){chef.held=putOnPlate(held,plate.item!);plate.item=null;plate.job=null;notice(s,'Plated and ready to serve.');clearTarget(s);return;}
  }
  if(held&&joinAtCounter(s,station,held))return;
  const ready=station.slots.find(slot=>slot.item&&(!slot.job||slot.job.ready));
  if(!held&&ready) {
    chef.held=ready.item;ready.item=null;ready.job=null;ready.batch=null;notice(s,`Picked up ${itemLabel(chef.held).toLowerCase()}.`);clearTarget(s);return;
  }
  if(!held) {
    const manual=station.slots.find(slot=>slot.item&&slot.job&&!slot.job.ready&&(slot.job.action==='hold'||slot.job.action==='wash'));
    if(manual){notice(s,station.kind==='sink'?'Hold to wash the plate.':'Hold to work at this station.');return;}
    notice(s,'This station has nothing ready.');clearTarget(s);return;
  }
  const empty=station.slots.find(slot=>!slot.item);if(!empty){notice(s,'This station is full.');clearTarget(s);return;}
  if(station.kind==='sink') {
    if(held.kind!=='dirty'){notice(s,'Only dirty plates go in the sink.');clearTarget(s);return;}
    empty.item=held;chef.held=null;const duration=Math.round(SERVICE_RULES.washTicks/(EQUIPMENT_BY_ID.sink.tiers[station.tier-1]?.speed??1));empty.job={action:station.tier===3?'timed':'wash',remaining:duration,total:duration,burnRemaining:null,ready:false};notice(s,station.tier===3?'Dishwasher started.':'Hold to wash the plate.');return;
  }
  if(held.kind==='dirty'||held.kind==='burnt'){notice(s,held.kind==='dirty'?'Take this plate to the sink.':'Take burnt food to the bin.');clearTarget(s);return;}
  const step=stationStep(s,station,held);
  if(step) {
    if(missingAssembly(held).length){empty.item=held;empty.job=null;chef.held=null;notice(s,`Add ${missingAssembly(held).map(id=>INGREDIENT_BY_ID[id].name.toLowerCase()).join(' and ')} from the pantry.`);clearTarget(s);return;}
    empty.item=held;chef.held=null;if(s.config.batchVersion&&station.kind==='fryer'&&held.recipeId==='fries')empty.batch=createFryBatch(s.tick);empty.job={action:step.action,remaining:step.ticks,total:step.ticks,burnRemaining:step.burnTicks??null,ready:false};
    if(step.action==='instant')finishCooking(s,station,empty);notice(s,`${step.label}${step.action==='hold'?' — hold to continue.':'.'}`);
    if(step.action!=='hold')clearTarget(s);return;
  }
  if(station.kind==='prep'||station.kind==='pass') {empty.item=held;empty.job=null;chef.held=null;notice(s,'Food put down.');clearTarget(s);return;}
  notice(s,`This food needs ${EQUIPMENT_BY_ID[RECIPE_BY_ID[held.recipeId]?.steps[held.step]?.station]?.name?.toLowerCase()??'a customer'}.`);clearTarget(s);
}
function interactTable(s:ServiceState,table:ServiceTable):void {
  const held=s.chef.held;
  const seat=s.chef.targetSeatId?table.seats.find(seat=>seat.id===s.chef.targetSeatId):held?.kind==='dish'?table.seats.find(seat=>seat.status==='occupied'&&s.customers.some(c=>c.id===seat.customerId&&c.recipeId===held.recipeId)):table.seats.find(seat=>seat.item?.kind==='dirty');
  if(!seat){notice(s,held?'Nobody here ordered that dish.':'There is no dirty plate here.');clearTarget(s);return;}
  if(!held) {
    if(seat.item?.kind!=='dirty'){notice(s,'There is no dirty plate at this seat.');clearTarget(s);return;}
    const disposable=seat.item.physical&&!vesselReusable(vesselOf(seat.item));s.chef.held=disposable?null:seat.item;seat.item=null;const current=s.customers.find(c=>c.id===seat.customerId&&c.mealId===seat.mealId&&['walking','seated','eating'].includes(c.phase));if(!current){seat.status='clean';seat.customerId=null;seat.mealId=null;}notice(s,disposable?'Empty carton cleared. Ready to serve.':'Table cleared. Take the dirty vessel to the sink.');clearTarget(s);return;
  }
  if(held.kind!=='dish'||seat.status!=='occupied'){notice(s,'Serve a finished dish to an occupied seat.');clearTarget(s);return;}
  if(seat.item){notice(s,'Clear the old dish before serving this guest.');clearTarget(s);return;}
  const customer=s.customers.find(c=>c.id===seat.customerId);
  if(!customer||customer.phase!=='seated'||customer.recipeId!==held.recipeId){notice(s,'This customer ordered a different dish.');clearTarget(s);return;}
  if(s.config.spices.includes('picky_eaters')&&(s.config.recipeLevels[held.recipeId]??0)<3){notice(s,'Picky eaters require recipe level three.');clearTarget(s);return;}
  const patience=customer.patience/customer.maxPatience;
  if(patience<.25)s.combo=0;else if(patience>.5&&!held.cold)s.combo=Math.min(SERVICE_RULES.comboMax,s.combo+1);
  const menuMultiplier=SERVICE_RULES.menuMultipliers[s.config.menu.length-1];
  const base=recipePrice(held.recipeId,s.config.recipeLevels[held.recipeId])*menuMultiplier*(s.config.cosy?.8:1)*(s.config.specials.includes('happy_hour')&&RECIPE_BY_ID[held.recipeId].course==='drink'?2:1);
  const tipRate=customer.type==='office'?.22:customer.type==='regular'?.16:SERVICE_RULES.baseTipRate;
  const comboRate=s.config.specials.includes('big_tipper')?.08:SERVICE_RULES.comboTipPerStep;
  customer.tip=held.cold?0:Math.round(base*tipRate*(1+s.combo*comboRate)*s.config.tipMultiplier);customer.payment=Math.round(base)+customer.tip;customer.servedCold=held.cold;customer.servedTick=s.tick;
  customer.phase='eating';customer.eatRemaining=Math.round(SERVICE_RULES.eatTicks/(table.tier===2?1.25:1));
  seat.status='eating';seat.item=held;s.chef.held=null;s.served++;
  if(customer.type==='influencer'&&patience>.5)s.influenceRemaining=3;
  emit(s,'serve',customer.id);notice(s,held.cold?'Cold food served for its base price.':'Enjoy your meal!');clearTarget(s);
}
function finishCooking(s:ServiceState,station:ServiceStation,slot:StationSlot):void {
  const item=slot.item,job=slot.job;if(!item||!job)return;
  if(item.kind==='dirty'){finishWash(s,station,slot);return;}
  const recipe=RECIPE_BY_ID[item.recipeId],steps=serviceRecipeSteps(s,item.recipeId),step=steps[item.step];if(!recipe||!step){slot.item=null;slot.job=null;return;}
  item.step++;item.stage=step.output;
  if(item.step>=steps.length){item.kind=item.physical?'processed':'dish';item.stage=`${item.physical?'prepared':'plated'}_${recipe.id}`;item.finishedTick=s.tick;item.cold=false;}else item.kind='processed';
  if(slot.batch)slot.batch=markFryBatchReady(slot.batch);
  job.remaining=0;job.ready=true;emit(s,'ready',station.id);if(job.action==='hold'&&!station.slots.some(other=>other.job&&!other.job.ready))for(const actor of [s.chef,...s.helpers])if(actor.targetId===station.id)actor.holding=false;
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
function helperRoute(s:ServiceState,helper:ServiceHelper,targetId:string,seatId:string|null=null):void {asHelper(s,helper,()=>routeInteraction(s,targetId,null,seatId));}
function helperWorkRoute(s:ServiceState,helper:ServiceHelper,station:ServiceStation):void {const path=servicePath(s.config.tier,s.stations,s.tables,helper,stationWorkingCell(station));if(!path){releaseHelper(s,helper);return;}helper.path=path;helper.targetId=station.id;helper.targetSeatId=null;helper.targetRecipeId=null;helper.holding=true;}
function releaseHelper(s:ServiceState,helper:ServiceHelper):void {helper.task=null;asHelper(s,helper,()=>clearTarget(s));}
function claimedByOther(s:ServiceState,helper:ServiceHelper,field:'seatId'|'itemId',value:string):boolean {return s.helpers.some(other=>other!==helper&&other.task?.[field]===value);}
/** Helpers move and handle the same actual items as the player; no abstract work rewards. */
function decideHelper(s:ServiceState,helper:ServiceHelper):void {
  if(helper.path.length)return;
  if(helper.role==='washer'){
    if(helper.held?.kind==='dirty'){
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
    for(const station of s.stations){if(s.chef.targetId===station.id)continue;const ready=station.slots.find(slot=>slot.item&&(!slot.job||slot.job.ready));if(ready?.item?.kind!=='dish'||claimedByOther(s,helper,'itemId',ready.item.id))continue;
      const customer=s.customers.find(c=>c.phase==='seated'&&c.recipeId===ready.item!.recipeId&&c.seatId&&!s.tables.some(table=>table.seats.some(seat=>seat.id===c.seatId&&seat.item))&&!claimedByOther(s,helper,'seatId',c.seatId));if(!customer)continue;
      helper.task={kind:'deliver',itemId:ready.item.id,stationId:station.id,tableId:customer.tableId,seatId:customer.seatId,phase:'take'};helperRoute(s,helper,station.id);return;
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
function patienceFactor(type:CustomerType):number { return type==='office'?.68:type==='kid'?1.5:type==='regular'?1.2:1; }
function chooseRecipe(s:ServiceState,type:CustomerType):string {
  let menu=s.config.menu;
  if(s.config.tutorialLearning)return menu[s.spawned%menu.length];
  if(type==='kid'){const kids=menu.filter(id=>['dessert','drink'].includes(RECIPE_BY_ID[id].course));if(kids.length)menu=kids;}
  if(type==='critic')return [...menu].sort((a,b)=>(s.config.recipeLevels[b]??0)-(s.config.recipeLevels[a]??0)||a.localeCompare(b))[0];
  return menu[Math.floor(random(s)*menu.length)];
}
/** Actual cooking plus a round trip across the floor and a decision buffer. */
export function servicePatienceMinimum(s:ServiceState,recipeId:string):{table:number;queue:number}{
  const g=serviceGeometry(s.config.tier),travel=(g.truck.w+g.truck.h+g.pavement.w+g.pavement.h)*2/SERVICE_RULES.chefSpeed*20;
  const cooking=serviceRecipeSteps(s,recipeId).reduce((sum,step)=>sum+step.ticks,0),drain=s.config.spices.includes('rush_hour')?1.25:1;
  return {table:Math.ceil(Math.max(45*20,cooking+travel+20*20)*drain),queue:Math.ceil(Math.max(60*20,cooking+travel+30*20)*drain)};
}
function spawnCustomer(s:ServiceState):void {
  const cfg=s.config,g=serviceGeometry(cfg.tier),remaining=cfg.customers-s.spawned;
  let type=cfg.customerTypes[Math.floor(random(s)*cfg.customerTypes.length)];
  if(type==='kid'&&!cfg.menu.some(id=>['dessert','drink'].includes(RECIPE_BY_ID[id].course)))type='walk_in';
  if(type==='family'&&(!s.tables.some(t=>t.capacity===4)||remaining<3))type='walk_in';
  const groupSize=type==='family'?Math.min(remaining,random(s)<.5?3:4):1,groupId=groupSize>1?id(s,'family'):null;
  for(let i=0;i<groupSize;i++) {
    let factor=patienceFactor(type)*(cfg.specials.includes('early_bird')&&s.spawned<5?2:1);
    if(s.influenceRemaining>0){factor*=1.25;s.influenceRemaining--;}
    const forced=cfg.tutorialFailure&&s.spawned>=Math.max(2,cfg.customers-cfg.strikeLimit);
    const recipeId=chooseRecipe(s,type),minimum=servicePatienceMinimum(s,recipeId),tableTicks=Math.max(minimum.table,forced?minimum.table:Math.round(cfg.tablePatienceTicks*factor)),queueTicks=Math.max(minimum.queue,forced?minimum.queue:Math.round(cfg.queuePatienceTicks*factor));
    const customer:ServiceCustomer={id:id(s,'customer'),groupId,type,phase:'queue',...g.queue,path:[],recipeId,patience:queueTicks,maxPatience:tableTicks,queuePatience:queueTicks,tableId:null,seatId:null,mealId:null,eatRemaining:0,payment:0,tip:0,servedCold:false,servedTick:null};
    s.customers.push(customer);s.spawned++;emit(s,'arrive',customer.id);
  }
  s.nextArrival=cfg.arrivalTicks*(s.spawned===1?1.5:s.spawned===2?1.2:1)/(cfg.specials.includes('happy_hour')?1.2:1);
  if(s.spawned>=cfg.customers)s.phase='closing';
}
function seatQueue(s:ServiceState):void {
  // Dirty dishes belong to historical meals; they do not reserve a chair.
  const available=(seat:ServiceSeat)=>['clean','dirty'].includes(seat.status)&&!s.customers.some(c=>c.id===seat.customerId&&c.mealId===seat.mealId&&['walking','seated','eating'].includes(c.phase));
  const waiting=s.customers.filter(c=>c.phase==='queue');
  while(waiting.length) {
    const first=waiting[0],group=first.groupId?waiting.filter(c=>c.groupId===first.groupId):[first];
    let table:ServiceTable|undefined,seats:ServiceSeat[]=[];
    if(first.groupId) {table=s.tables.find(t=>t.capacity>=group.length&&t.seats.every(available));if(table)seats=table.seats.slice(0,group.length);}
    else {table=s.tables.find(t=>t.seats.some(available)&&!t.seats.some(seat=>s.customers.some(c=>c.id===seat.customerId&&c.groupId&&c.phase!=='gone'&&c.phase!=='leaving')));if(table)seats=[table.seats.find(available)!];}
    if(!table)break;
    const paths=seats.map(seat=>servicePath(s.config.tier,s.stations,s.tables,first,seat));if(paths.some(p=>!p))break;
    for(let i=0;i<group.length;i++) {
      const c=group[i],seat=seats[i],mealId=id(s,'meal');seat.status='reserved';seat.customerId=c.id;seat.mealId=mealId;
      c.tableId=table.id;c.seatId=seat.id;c.mealId=mealId;c.phase='walking';c.path=paths[i]!;c.patience=c.maxPatience;
      waiting.splice(waiting.indexOf(c),1);
    }
  }
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
  s.coins+=c.payment;s.paid++;s.reputation+=RECIPE_BY_ID[c.recipeId].reputation+(c.type==='critic'&&c.patience/c.maxPatience>.5?3:0);
  const physical=seat.item?.physical===true,plateId=seat.item?.plateId,vesselKind=seat.item?vesselOf(seat.item):'plate';
  seat.status='dirty';seat.item={id:physical&&plateId?plateId:id(s,'plate'),kind:'dirty',...(physical?{physical:true,vesselKind}:{}),recipeId:c.recipeId,step:serviceRecipeSteps(s,c.recipeId).length,stage:'dirty_plate',createdTick:s.tick,cold:false,meal:{tableId:c.tableId!,seatId:c.seatId!,mealId:c.mealId!}};
  emit(s,'pay',c.id,c.payment);leaveCustomer(s,c,false);
}
/** Fixed 20 Hz evolution. Callers own real-time budgets and replay authorization. */
export function stepService(s:ServiceState,ticks=1):void {
  if(!Number.isInteger(ticks)||ticks<1||ticks>12000)return;
  for(let n=0;n<ticks&&active(s);n++) {
    s.tick++;
    const wasWalking=s.chef.path.length>0;moveActor(s.chef,SERVICE_RULES.chefSpeed);
    if(wasWalking&&!s.chef.path.length&&s.chef.targetId)performInteraction(s);
    for(const helper of s.helpers){const walking=helper.path.length>0;moveActor(helper,SERVICE_RULES.chefSpeed*.9);if(walking&&!helper.path.length&&helper.targetId&&helper.task?.kind!=='prep')asHelper(s,helper,()=>performInteraction(s));if(s.tick%5===0)decideHelper(s,helper);}
    const washedStations=new Set<string>();
    for(const station of s.stations)for(const slot of station.slots) {
      const job=slot.job,item=slot.item;if(!item)continue;
      if(job&&!job.ready) {
        const manual=job.action==='hold'||job.action==='wash';
        const working=!manual||[s.chef,...s.helpers].some(actor=>actor.targetId===station.id&&actor.holding&&!actor.path.length&&isAdjacent(actor,stationFootprint(station)));
        if(working&&(!manual||station.kind!=='sink'||(!washedStations.has(station.id)&&!!washedStations.add(station.id)))&&--job.remaining<=0)finishCooking(s,station,slot);
      }else if(job?.ready&&job.burnRemaining!==null&&--job.burnRemaining<=0&&item.kind!=='burnt') {
        item.kind='burnt';item.stage='burnt';if(slot.batch)slot.batch=burnFryBatch(slot.batch);job.burnRemaining=null;s.burnt++;emit(s,'burn',station.id);
      }
      if((slot.item?.kind==='dish'||preparedFood(slot.item))&&slot.item.finishedTick!==undefined) {
        if(EQUIPMENT_BY_ID[station.kind]?.tiers[station.tier-1]?.warm)slot.item.finishedTick=s.tick;
        else if(s.tick-slot.item.finishedTick>=SERVICE_RULES.coldTicks)slot.item.cold=true;
      }
    }
    if((s.chef.held?.kind==='dish'||preparedFood(s.chef.held))&&s.chef.held.finishedTick!==undefined&&s.tick-s.chef.held.finishedTick>=SERVICE_RULES.coldTicks)s.chef.held.cold=true;
    // The opening lesson waits for a real serve/eat/collect/wash cycle. Time
    // alone cannot bring another order while the first guest is being learned.
    if(s.phase!=='preparing'&&s.spawned<s.config.customers&&(!s.config.tutorialLearning||s.spawned!==1||s.washed>0||(s.config.batchVersion&&s.customers[0]?.recipeId==='fries'&&s.customers[0].servedTick!==null&&!s.tables.some(table=>table.seats.some(seat=>seat.mealId===s.customers[0].mealId))))&&--s.nextArrival<=0)spawnCustomer(s);
    if(s.phase!=='preparing')seatQueue(s);
    const drain=(s.config.cosy?2/3:1)*(s.config.spices.includes('rush_hour')?1.25:1);
    for(const customer of s.customers) {
      if(!active(s))break;
      if(customer.phase==='walking') {moveActor(customer,SERVICE_RULES.customerSpeed);if(!customer.path.length){customer.phase='seated';const seat=s.tables.find(t=>t.id===customer.tableId)?.seats.find(seat=>seat.id===customer.seatId);if(seat)seat.status='occupied';emit(s,'sit',customer.id);}}
      else if(customer.phase==='leaving'){moveActor(customer,SERVICE_RULES.customerSpeed);if(!customer.path.length)customer.phase='gone';}
      else if(customer.phase==='eating'){if(--customer.eatRemaining<=0)payCustomer(s,customer);}
      if(!s.config.tutorialLearning&&(customer.phase==='queue'||customer.phase==='seated')) {customer.patience-=drain;if(customer.patience<=0)leaveCustomer(s,customer,true);}
    }
    if(s.phase!=='preparing'&&active(s)&&s.spawned>=s.config.customers&&s.customers.every(c=>c.phase==='gone')) {s.phase='complete';s.chef.holding=false;notice(s,'Service complete. Time to choose the next stop.');emit(s,'complete','service',s.coins);}
  }
}
