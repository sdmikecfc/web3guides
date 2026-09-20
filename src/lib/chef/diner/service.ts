import { CONTENT_VERSION, DAILY_SPECIALS, DIFFICULTIES, EQUIPMENT_BY_ID, RECIPE_BY_ID, SERVICE_RULES, SPICES, TRUCK_TIERS, recipePrice } from './content';
import { blockedCells, inServiceFloor, isAdjacent, makeStation, makeTable, pointKey, serviceGeometry, servicePath, starterStations, starterTables, stationFootprint, stationWorkingCell, tableFootprint, targetPath, validateServiceLayout } from './geometry';
import type { CreateServiceOptions, CustomerType, Point, RecipeStep, ServiceAction, ServiceCustomer, ServiceEvent, ServiceHelper, ServiceItem, ServiceResult, ServiceSeat, ServiceState, ServiceStation, ServiceTable, StationSlot } from './types';
export type * from './types';

const copy = <T>(value:T):T => JSON.parse(JSON.stringify(value));
const integer = (value:unknown,fallback:number,min:number,max:number):number => typeof value==='number' && Number.isFinite(value) ? Math.max(min,Math.min(max,Math.floor(value))) : fallback;
function seedNumber(seed:string):number { let n=2166136261; for(let i=0;i<seed.length;i++) n=Math.imul(n^seed.charCodeAt(i),16777619); return n>>>0 || 1; }
function random(s:ServiceState):number { let n=s.rng; n^=n<<13;n^=n>>>17;n^=n<<5;s.rng=n>>>0;return s.rng/4294967296; }
function id(s:ServiceState,prefix:string):string { return `${prefix}_${s.nextId++}`; }
function emit(s:ServiceState,type:ServiceEvent['type'],targetId:string,amount?:number):void { s.events.push({id:s.nextId++,tick:s.tick,type,targetId,...(amount===undefined?{}:{amount})}); if(s.events.length>SERVICE_RULES.maxEvents)s.events.shift(); }
function clearTarget(s:ServiceState):void { s.chef.targetId=null;s.chef.targetSeatId=null;s.chef.targetRecipeId=null;s.chef.holding=false; }
function notice(s:ServiceState,message:string):void { s.notice=message; }
const active = (s:ServiceState):boolean => s.phase==='playing'||s.phase==='closing';
export function createService(options:CreateServiceOptions={}):ServiceState {
  const tier=integer(options.tier,1,1,4) as 1|2|3|4, seed=typeof options.seed==='string'?options.seed.slice(0,200):'diner-opening';
  const levels:Record<string,number>={}; for(const key of Object.keys(RECIPE_BY_ID)) levels[key]=integer(options.recipeLevels?.[key],0,0,10);
  const menu=[...new Set((options.menu??['classic_burger','fries']).filter(id=>typeof id==='string'&&RECIPE_BY_ID[id]))].slice(0,4);
  const s:ServiceState={version:1,contentVersion:CONTENT_VERSION,phase:'setup',pausedPhase:null,tick:0,rng:seedNumber(seed),nextId:1,
    chef:{...serviceGeometry(tier).door,path:[],held:null,targetId:null,targetSeatId:null,targetRecipeId:null,holding:false},helpers:[],
    stations:options.stations?options.stations.map(st=>makeStation(st.id,st.kind,st.x,st.y,st.tier,st.facing)):starterStations(tier),
    tables:options.tables?options.tables.map(t=>makeTable(t.id,t.x,t.y,t.capacity,t.tier,t.rotation??0)):starterTables(tier),customers:[],
    config:{seed,tier,menu,recipeLevels:levels,customers:integer(options.customers,DIFFICULTIES.slow.customers,1,80),arrivalTicks:integer(options.arrivalTicks,DIFFICULTIES.slow.arrivalTicks,20,2400),queuePatienceTicks:integer(options.queuePatienceTicks,DIFFICULTIES.slow.queuePatienceTicks,20,12000),tablePatienceTicks:integer(options.tablePatienceTicks,DIFFICULTIES.slow.tablePatienceTicks,20,12000),cosy:options.cosy===true,practice:options.practice===true,strikeLimit:integer(options.strikeLimit,options.cosy?5:3,1,5),tutorialFailure:options.tutorialFailure===true,customerTypes:(options.customerTypes??['walk_in']).filter(t=>['walk_in','office','kid','family','critic','influencer','regular'].includes(t)),specials:[...new Set((options.specials??[]).filter(k=>(DAILY_SPECIALS as readonly string[]).includes(k)))].slice(0,3),spices:[...new Set((options.spices??[]).filter(k=>(SPICES as readonly string[]).includes(k)))],helpers:[],tipMultiplier:integer(options.tipMultiplier,1,1,2),tutorialLearning:options.tutorialLearning===true},
    spawned:0,nextArrival:20,coins:0,reputation:0,strikes:0,combo:0,served:0,paid:0,missed:0,burnt:0,washed:0,notice:'Choose your menu and open for service.',events:[],influenceRemaining:0};
  if(!s.config.customerTypes.length)s.config.customerTypes=['walk_in'];
  s.config.helpers=(options.spices?.includes('short_staffed')?[]:(options.helpers??[])).filter((helper,i,all)=>helper&&/^[a-zA-Z0-9_-]{1,64}$/.test(helper.id)&&['washer','runner','prep'].includes(helper.role)&&all.findIndex(h=>h.id===helper.id)===i).slice(0,TRUCK_TIERS[tier].helpers).map(helper=>({id:helper.id,role:helper.role,look:integer(helper.look,0,0,7)}));
  s.helpers=s.config.helpers.map(helper=>({...copy(s.chef),...helper,task:null}));
  const error=serviceReadyError(s); if(error)s.notice=error;
  return s;
}
export function serviceReadyError(s:ServiceState):string|null {
  const invalid=validateServiceLayout(s.config.tier,s.stations,s.tables);if(invalid)return invalid;
  if(!s.config.menu.length)return 'Choose at least one recipe.';
  if(s.config.spices.includes('full_menu')&&s.config.menu.length<3)return 'Full menu requires three recipes.';
  for(const recipeId of s.config.menu) { const recipe=RECIPE_BY_ID[recipeId]; if(!recipe)return 'Unknown recipe.';for(const step of recipe.steps)if(!s.stations.some(st=>st.kind===step.station))return `${recipe.name} needs a ${EQUIPMENT_BY_ID[step.station].name.toLowerCase()}.`; }
  return null;
}
export function serviceResult(s:ServiceState):ServiceResult { return {coins:s.config.practice?0:s.coins,reputation:s.config.practice?0:s.reputation,strikes:s.strikes,completed:s.phase==='complete',failed:s.phase==='failed',served:s.served,missed:s.missed,practice:s.config.practice}; }
/** Local checkpoint validation, never proof of earned progress. Active saves resume paused. */
export function sanitizeService(raw:unknown):ServiceState|null {
  try {
    if(!raw||typeof raw!=='object')return null;
    const s=copy(raw) as ServiceState;
    if(s.version!==1||s.contentVersion!==CONTENT_VERSION||!s.config||typeof s.config.seed!=='string'||s.config.seed.length>200||!TRUCK_TIERS[s.config.tier])return null;
    if(s.helpers===undefined)s.helpers=[];if(s.config.helpers===undefined)s.config.helpers=[];if(s.config.tipMultiplier===undefined)s.config.tipMultiplier=1;if(s.config.tutorialLearning===undefined)s.config.tutorialLearning=false;
    if(Array.isArray(s.tables))for(const table of s.tables)if(table&&table.rotation===undefined)table.rotation=0;
    if(!Array.isArray(s.stations)||!Array.isArray(s.tables)||!Array.isArray(s.customers)||s.customers.length>80||!Array.isArray(s.config.menu)||s.config.menu.length<1||s.config.menu.length>4||new Set(s.config.menu).size!==s.config.menu.length||s.config.menu.some(id=>!RECIPE_BY_ID[id]))return null;
    if(!Array.isArray(s.config.specials)||!Array.isArray(s.config.spices)||!Array.isArray(s.config.customerTypes)||!s.config.recipeLevels||serviceReadyError(s))return null;
    const whole=(v:unknown,max=1e9):boolean=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max;
    if(!['setup','playing','closing','paused','complete','failed'].includes(s.phase)||![null,'playing','closing'].includes(s.pausedPhase))return null;
    for(const key of ['tick','rng','nextId','spawned','coins','reputation','strikes','combo','served','paid','missed','burnt','washed','influenceRemaining'] as const)if(!whole(s[key],key==='rng'?4294967295:1e9))return null;
    if(s.spawned!==s.customers.length||s.spawned>s.config.customers||s.served>s.spawned||s.paid>s.served||s.missed+s.served>s.spawned||s.combo>10||s.strikes>5||!Number.isFinite(s.nextArrival))return null;
    const normalized=createService({...s.config,stations:s.stations,tables:s.tables});
    if(JSON.stringify(normalized.config)!==JSON.stringify(s.config))return null;
    const occupied=blockedCells(s.stations,s.tables), validPosition=(p:Point):boolean=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&inServiceFloor(s.config.tier,{x:Math.round(p.x),y:Math.round(p.y)})&&!occupied.has(pointKey({x:Math.round(p.x),y:Math.round(p.y)}));
    const validPath=(p:Point&{path:Point[]}):boolean=>validPosition(p)&&Array.isArray(p.path)&&p.path.length<300&&p.path.every((q,i)=>validPosition(q)&&Number.isInteger(q.x)&&Number.isInteger(q.y)&&(i?Math.abs(q.x-p.path[i-1].x)+Math.abs(q.y-p.path[i-1].y)===1:Math.abs(q.x-p.x)+Math.abs(q.y-p.y)<=1.01));
    const itemIds=new Set<string>(), validItem=(item:ServiceItem|null):boolean=>{
      if(item===null)return true;
      if(!item||typeof item.id!=='string'||item.id.length>64||itemIds.has(item.id)||!RECIPE_BY_ID[item.recipeId]||!['raw','processed','dish','burnt','dirty'].includes(item.kind)||!whole(item.step,RECIPE_BY_ID[item.recipeId].steps.length)||!whole(item.createdTick,s.tick)||typeof item.stage!=='string'||typeof item.cold!=='boolean'||(item.finishedTick!==undefined&&!whole(item.finishedTick,s.tick)))return false;
      if(item.kind==='dirty'&&(!item.meal||!s.tables.some(t=>t.id===item.meal!.tableId&&t.seats.some(seat=>seat.id===item.meal!.seatId&&seat.mealId===item.meal!.mealId))))return false;
      itemIds.add(item.id);return true;
    };
    if(!s.chef||!validPath(s.chef)||!validItem(s.chef.held)||typeof s.chef.holding!=='boolean'||!Array.isArray(s.helpers)||s.helpers.length!==s.config.helpers.length)return null;
    for(const [i,helper] of s.helpers.entries())if(helper.id!==s.config.helpers[i].id||helper.role!==s.config.helpers[i].role||!validPath(helper)||!validItem(helper.held)||typeof helper.holding!=='boolean'||(helper.task&&(!['wash','deliver','prep'].includes(helper.task.kind)||!['take','deliver','work'].includes(helper.task.phase))))return null;
    for(const station of s.stations){const capacity=EQUIPMENT_BY_ID[station.kind].tiers[station.tier-1].capacity;if(!Array.isArray(station.slots)||station.slots.length!==capacity)return null;for(const slot of station.slots){if(!validItem(slot.item))return null;const job=slot.job;if(job&&(!slot.item||!['instant','hold','timed','risk','wash'].includes(job.action)||!whole(job.remaining,12000)||!whole(job.total,12000)||job.remaining>job.total||(job.burnRemaining!==null&&!whole(job.burnRemaining,12000))||typeof job.ready!=='boolean'))return null;}}
    const customerIds=new Set<string>();for(const c of s.customers){if(!c||typeof c.id!=='string'||customerIds.has(c.id)||!validPath(c)||!s.config.menu.includes(c.recipeId)||!['queue','walking','seated','eating','leaving','gone'].includes(c.phase)||!Number.isFinite(c.patience)||!Number.isFinite(c.maxPatience)||!whole(c.eatRemaining,12000)||!whole(c.payment)||!whole(c.tip)||typeof c.servedCold!=='boolean')return null;customerIds.add(c.id);}
    for(const table of s.tables)for(const seat of table.seats)if(!['clean','reserved','occupied','eating','dirty','awaitingWash'].includes(seat.status)||!validItem(seat.item)||(seat.customerId!==null&&!customerIds.has(seat.customerId)))return null;
    if(s.chef.targetId!==null&&!s.stations.some(st=>st.id===s.chef.targetId)&&!s.tables.some(t=>t.id===s.chef.targetId))return null;
    s.events=Array.isArray(s.events)?s.events.filter(e=>e&&whole(e.id)&&whole(e.tick,s.tick)&&['arrive','sit','ready','burn','serve','pay','strike','wash','complete'].includes(e.type)&&typeof e.targetId==='string').slice(-SERVICE_RULES.maxEvents):[];
    s.notice=typeof s.notice==='string'?s.notice.slice(0,300):'';
    if(active(s)){s.pausedPhase=s.phase as 'playing'|'closing';s.phase='paused';}s.chef.holding=false;
    return s;
  } catch {return null;}
}
export function itemLabel(item:ServiceItem|null):string { if(!item)return 'Empty hands';if(item.kind==='dirty')return 'Dirty plate';const name=RECIPE_BY_ID[item.recipeId]?.name??'Food';return item.kind==='dish'?`${item.cold?'Cold ':''}${name}`:item.kind==='burnt'?`Burnt ${name.toLowerCase()}`:`${name}: ${item.stage.replaceAll('_',' ')}`; }
export type ServiceIntent = { label:string;disabled:boolean;hold:boolean;progress?:number;reason?:string };
/** Text and hold semantics come from the same recipe/job data as the interaction. */
export function serviceTargetIntent(s:ServiceState,targetId:string,seatId?:string,recipeId?:string):ServiceIntent {
  const station=s.stations.find(st=>st.id===targetId),table=s.tables.find(t=>t.id===targetId),held=s.chef.held;
  const stop=(label:string,reason=label):ServiceIntent=>({label,disabled:true,hold:false,reason});
  if(!station&&!table)return stop('Choose a station or table');
  if(!active(s))return stop(s.phase==='setup'?'Open to start cooking':s.phase==='paused'?'Resume service':'Service has ended');
  if(table){const seats=seatId?table.seats.filter(seat=>seat.id===seatId):table.seats;if(!held)return seats.some(seat=>seat.status==='dirty')?{label:'Clear dirty plate',disabled:false,hold:false}:stop('No dirty plate here');
    const customer=s.customers.find(c=>c.phase==='seated'&&c.recipeId===held.recipeId&&seats.some(seat=>seat.customerId===c.id));return held.kind==='dish'&&customer?{label:`Serve ${RECIPE_BY_ID[held.recipeId].name.toLowerCase()}`,disabled:false,hold:false}:stop('Bring the ordered dish');}
  if(station!.kind==='crate')return held?stop('Put down held item first'):{label:`Take ${RECIPE_BY_ID[recipeId??s.config.menu[0]]?.name.toLowerCase()??'recipe'} ingredients`,disabled:false,hold:false};
  if(station!.kind==='bin')return held?.kind==='dirty'?stop('Wash this plate at the sink'):held?{label:'Discard held food',disabled:false,hold:false}:stop('Nothing to discard');
  const ready=station!.slots.find(slot=>slot.item&&(!slot.job||slot.job.ready));
  if(!held&&ready)return {label:`Take ${itemLabel(ready.item).toLowerCase()}`,disabled:false,hold:false};
  const working=station!.slots.find(slot=>slot.item&&slot.job&&!slot.job.ready);
  if(!held&&working?.job){const job=working.job,manual=job.action==='hold'||job.action==='wash',step=working.item?.kind==='dirty'?null:RECIPE_BY_ID[working.item!.recipeId]?.steps[working.item!.step];return {label:manual?job.action==='wash'?'Hold to wash plate':`Hold to ${(step?.label??'work').toLowerCase()}`:`Cooking · ${Math.ceil(job.remaining/20)}s`,disabled:!manual,hold:manual,progress:1-job.remaining/job.total};}
  if(held){if(!station!.slots.some(slot=>!slot.item))return stop('Station is full');if(station!.kind==='sink')return held.kind==='dirty'?{label:'Put plate in sink',disabled:false,hold:false}:stop('Bring a dirty plate');if(held.kind==='dirty')return stop('Take this plate to the sink');if(held.kind==='burnt')return stop('Take burnt food to the bin');const step=stationStep(s,station!,held);if(step)return {label:step.action==='hold'?`Start ${step.label.toLowerCase()}`:step.label,disabled:false,hold:false};if(station!.kind==='prep'||station!.kind==='pass')return {label:'Put down held food',disabled:false,hold:false};return stop('Use the next recipe station');}
  return stop('Bring recipe ingredients');
}

/** Every accepted command returns an independent serializable state. No wall-clock reads. */
export function dispatchService(previous:ServiceState,action:ServiceAction):ServiceState {
  const s=copy(previous);
  if(!action||typeof action!=='object'||typeof action.type!=='string'){notice(s,'Invalid service action.');return s;}
  if(action.type==='pause') { if(active(s)){s.pausedPhase=s.phase as 'playing'|'closing';s.phase='paused';s.chef.holding=false;}return s; }
  if(action.type==='resume') { if(s.phase==='paused'){s.phase=s.pausedPhase??'playing';s.pausedPhase=null;}return s; }
  if(action.type==='open') { if(s.phase!=='setup'){notice(s,'Service has already opened.');return s;}const error=serviceReadyError(s);if(error){notice(s,error);return s;}s.phase='playing';notice(s,'Open! Customers are on their way.');return s; }
  if(!active(s)){notice(s,s.phase==='paused'?'Service is paused.':'Open service before cooking.');return s;}
  if(action.type==='tick') { if(!Number.isInteger(action.ticks)||action.ticks<1||action.ticks>SERVICE_RULES.maxTicksPerAction){notice(s,'Invalid time step.');return s;}stepService(s,action.ticks);return s; }
  if(action.type==='hold') { if(typeof action.active!=='boolean'){notice(s,'Invalid hold action.');return s;}s.chef.holding=action.active;return s; }
  if(action.type==='move') {
    if(!Number.isInteger(action.x)||!Number.isInteger(action.y)){notice(s,'Choose a floor tile.');return s;}
    const path=servicePath(s.config.tier,s.stations,s.tables,s.chef,{x:action.x,y:action.y});if(!path){notice(s,'That spot is blocked.');return s;}clearTarget(s);s.chef.path=path;return s;
  }
  if(action.type==='discard') { const bin=s.stations.find(st=>st.kind==='bin');if(bin)routeInteraction(s,bin.id,null,null);return s; }
  if(action.type==='interact') {
    if(typeof action.targetId!=='string'||(action.recipeId!==undefined&&(typeof action.recipeId!=='string'||!RECIPE_BY_ID[action.recipeId]))||(action.seatId!==undefined&&typeof action.seatId!=='string')){notice(s,'Invalid interaction.');return s;}
    routeInteraction(s,action.targetId,action.recipeId??null,action.seatId??null);return s;
  }
  notice(s,'Unknown service action.');return s;
}
function routeInteraction(s:ServiceState,targetId:string,recipeId:string|null,seatId:string|null):void {
  const station=s.stations.find(st=>st.id===targetId),table=s.tables.find(t=>t.id===targetId);
  if(!station&&!table){notice(s,'That target no longer exists.');return;}
  if(seatId&&(!table||!table.seats.some(seat=>seat.id===seatId))){notice(s,'That seat does not belong to this table.');return;}
  const footprint=station?stationFootprint(station):tableFootprint(table!);
  const path=station?servicePath(s.config.tier,s.stations,s.tables,s.chef,stationWorkingCell(station)):targetPath(s.config.tier,s.stations,s.tables,s.chef,footprint);
  if(!path){notice(s,'There is no clear route.');return;}
  s.chef.path=path;s.chef.targetId=targetId;s.chef.targetRecipeId=recipeId;s.chef.targetSeatId=seatId;s.chef.holding=false;
  if(!path.length)performInteraction(s);
}
function performInteraction(s:ServiceState):void {
  const station=s.stations.find(st=>st.id===s.chef.targetId),table=s.tables.find(t=>t.id===s.chef.targetId);
  if(station)interactStation(s,station);else if(table)interactTable(s,table);else clearTarget(s);
}
function stationStep(s:ServiceState,station:ServiceStation,item:ServiceItem):RecipeStep|null {
  const step=RECIPE_BY_ID[item.recipeId]?.steps[item.step];if(!step||step.station!==station.kind)return null;
  let action=step.action,ticks=step.ticks;
  if(station.kind==='blender'&&station.tier>=2)action='timed';
  if(station.kind==='drinks'&&station.tier>=2){action='instant';ticks=0;}
  if(action==='hold'&&s.config.specials.includes('sharp_knives'))ticks=Math.ceil(ticks/2);
  const spec=EQUIPMENT_BY_ID[station.kind].tiers[station.tier-1];
  return {...step,action,ticks:Math.max(action==='instant'?0:1,Math.round(ticks/(spec?.speed??1))),burnTicks:spec?.noBurn?undefined:step.burnTicks};
}
function interactStation(s:ServiceState,station:ServiceStation):void {
  const chef=s.chef,held=chef.held;
  if(station.kind==='crate') {
    if(held){notice(s,'Put down what you are holding first.');clearTarget(s);return;}
    const recipeId=chef.targetRecipeId??s.config.menu[0];
    if(!s.config.menu.includes(recipeId)){notice(s,'That recipe is not on today’s menu.');clearTarget(s);return;}
    chef.held={id:id(s,'food'),kind:'raw',recipeId,step:0,stage:`raw_${recipeId}`,createdTick:s.tick,cold:false};notice(s,`Picked up ingredients for ${RECIPE_BY_ID[recipeId].name.toLowerCase()}.`);clearTarget(s);return;
  }
  if(station.kind==='bin') {
    if(held?.kind==='dirty'){notice(s,'Dirty plates must be washed, not thrown away.');clearTarget(s);return;}
    chef.held=null;notice(s,held?'Food discarded.':'The bin is empty.');clearTarget(s);return;
  }
  const ready=station.slots.find(slot=>slot.item&&(!slot.job||slot.job.ready));
  if(!held&&ready) {
    chef.held=ready.item;ready.item=null;ready.job=null;notice(s,`Picked up ${itemLabel(chef.held).toLowerCase()}.`);clearTarget(s);return;
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
    empty.item=held;chef.held=null;empty.job={action:step.action,remaining:step.ticks,total:step.ticks,burnRemaining:step.burnTicks??null,ready:false};
    if(step.action==='instant')finishCooking(s,station,empty);notice(s,`${step.label}${step.action==='hold'?' — hold to continue.':'.'}`);
    if(step.action!=='hold')clearTarget(s);return;
  }
  if(station.kind==='prep'||station.kind==='pass') {empty.item=held;empty.job=null;chef.held=null;notice(s,'Food put down.');clearTarget(s);return;}
  notice(s,`This food needs ${EQUIPMENT_BY_ID[RECIPE_BY_ID[held.recipeId]?.steps[held.step]?.station]?.name?.toLowerCase()??'a customer'}.`);clearTarget(s);
}
function interactTable(s:ServiceState,table:ServiceTable):void {
  const held=s.chef.held;
  const seat=s.chef.targetSeatId?table.seats.find(seat=>seat.id===s.chef.targetSeatId):held?.kind==='dish'?table.seats.find(seat=>seat.status==='occupied'&&s.customers.some(c=>c.id===seat.customerId&&c.recipeId===held.recipeId)):table.seats.find(seat=>seat.status==='dirty');
  if(!seat){notice(s,held?'Nobody here ordered that dish.':'There is no dirty plate here.');clearTarget(s);return;}
  if(!held) {
    if(seat.status!=='dirty'||!seat.item){notice(s,'There is no dirty plate at this seat.');clearTarget(s);return;}
    s.chef.held=seat.item;seat.item=null;seat.status='awaitingWash';notice(s,'Take the dirty plate to the sink.');clearTarget(s);return;
  }
  if(held.kind!=='dish'||seat.status!=='occupied'){notice(s,'Serve a finished dish to an occupied seat.');clearTarget(s);return;}
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
  const recipe=RECIPE_BY_ID[item.recipeId],step=recipe?.steps[item.step];if(!recipe||!step){slot.item=null;slot.job=null;return;}
  item.step++;item.stage=step.output;
  if(item.step>=recipe.steps.length){item.kind='dish';item.stage=`plated_${recipe.id}`;item.finishedTick=s.tick;item.cold=false;}else item.kind='processed';
  job.remaining=0;job.ready=true;emit(s,'ready',station.id);if(job.action==='hold'&&!station.slots.some(other=>other.job&&!other.job.ready))for(const actor of [s.chef,...s.helpers])if(actor.targetId===station.id)actor.holding=false;
}
function finishWash(s:ServiceState,station:ServiceStation,slot:StationSlot):void {
  const item=slot.item;if(!item||item.kind!=='dirty')return;
  const ref=item.meal,seat=ref?s.tables.find(t=>t.id===ref.tableId)?.seats.find(seat=>seat.id===ref.seatId):null;
  // A plate can release only its own current meal. Stale/duplicate plates grant nothing.
  if(ref&&seat?.mealId===ref.mealId&&seat.status==='awaitingWash') {seat.status='clean';seat.mealId=null;seat.customerId=null;seat.item=null;s.washed++;emit(s,'wash',ref.seatId);}
  slot.item=null;slot.job=null;if(!station.slots.some(other=>other.job&&!other.job.ready))for(const actor of [s.chef,...s.helpers])if(actor.targetId===station.id)actor.holding=false;notice(s,'Clean plate. This seat can welcome another customer.');
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
    for(const table of s.tables)for(const seat of table.seats)if(seat.status==='dirty'&&seat.item&&!claimedByOther(s,helper,'seatId',seat.id)&&!(s.chef.targetId===table.id&&(!s.chef.targetSeatId||s.chef.targetSeatId===seat.id))){
      helper.task={kind:'wash',itemId:seat.item.id,stationId:null,tableId:table.id,seatId:seat.id,phase:'take'};helperRoute(s,helper,table.id,seat.id);return;
    }
    releaseHelper(s,helper);return;
  }
  if(helper.role==='runner'){
    if(helper.held?.kind==='dish'){
      const customer=s.customers.find(c=>c.phase==='seated'&&c.recipeId===helper.held!.recipeId&&c.seatId&&!claimedByOther(s,helper,'seatId',c.seatId));if(!customer)return;
      helper.task={kind:'deliver',itemId:helper.held.id,stationId:null,tableId:customer.tableId,seatId:customer.seatId,phase:'deliver'};helperRoute(s,helper,customer.tableId!,customer.seatId);return;
    }
    if(helper.held)return;
    if(helper.task?.phase==='deliver')releaseHelper(s,helper);
    for(const station of s.stations){if(s.chef.targetId===station.id)continue;const ready=station.slots.find(slot=>slot.item&&(!slot.job||slot.job.ready));if(ready?.item?.kind!=='dish'||claimedByOther(s,helper,'itemId',ready.item.id))continue;
      const customer=s.customers.find(c=>c.phase==='seated'&&c.recipeId===ready.item!.recipeId&&c.seatId&&!claimedByOther(s,helper,'seatId',c.seatId));if(!customer)continue;
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
    const tableTicks=forced?20:Math.round(cfg.tablePatienceTicks*factor),queueTicks=forced?20:Math.round(cfg.queuePatienceTicks*factor);
    const customer:ServiceCustomer={id:id(s,'customer'),groupId,type,phase:'queue',...g.queue,path:[],recipeId:chooseRecipe(s,type),patience:queueTicks,maxPatience:tableTicks,queuePatience:queueTicks,tableId:null,seatId:null,mealId:null,eatRemaining:0,payment:0,tip:0,servedCold:false,servedTick:null};
    s.customers.push(customer);s.spawned++;emit(s,'arrive',customer.id);
  }
  s.nextArrival=cfg.arrivalTicks/(cfg.specials.includes('happy_hour')?1.2:1);
  if(s.spawned>=cfg.customers)s.phase='closing';
}
function seatQueue(s:ServiceState):void {
  const waiting=s.customers.filter(c=>c.phase==='queue');
  while(waiting.length) {
    const first=waiting[0],group=first.groupId?waiting.filter(c=>c.groupId===first.groupId):[first];
    let table:ServiceTable|undefined,seats:ServiceSeat[]=[];
    if(first.groupId) {table=s.tables.find(t=>t.capacity>=group.length&&t.seats.every(seat=>seat.status==='clean'));if(table)seats=table.seats.slice(0,group.length);}
    else {table=s.tables.find(t=>t.seats.some(seat=>seat.status==='clean')&&!t.seats.some(seat=>s.customers.some(c=>c.id===seat.customerId&&c.groupId&&c.phase!=='gone'&&c.phase!=='leaving')));if(table)seats=[table.seats.find(seat=>seat.status==='clean')!];}
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
  if(upset&&seat&&seat.mealId===c.mealId){seat.status='clean';seat.customerId=null;seat.mealId=null;seat.item=null;}
  c.phase='leaving';c.path=servicePath(s.config.tier,s.stations,s.tables,c,serviceGeometry(s.config.tier).exit)??[];
  if(upset){s.strikes++;s.missed++;s.combo=0;emit(s,'strike',c.id);notice(s,'A customer left upset. One plate cracked.');const limit=s.config.spices.includes('two_strikes')?Math.min(2,s.config.strikeLimit):s.config.strikeLimit;if(s.strikes>=limit){s.phase='failed';s.chef.holding=false;notice(s,'Service ended. Your expedition will bank its remaining share.');}}
}
function payCustomer(s:ServiceState,c:ServiceCustomer):void {
  const seat=s.tables.find(t=>t.id===c.tableId)?.seats.find(seat=>seat.id===c.seatId);
  if(!seat||seat.mealId!==c.mealId)return;
  s.coins+=c.payment;s.paid++;s.reputation+=RECIPE_BY_ID[c.recipeId].reputation+(c.type==='critic'&&c.patience/c.maxPatience>.5?3:0);
  seat.status='dirty';seat.item={id:id(s,'plate'),kind:'dirty',recipeId:c.recipeId,step:RECIPE_BY_ID[c.recipeId].steps.length,stage:'dirty_plate',createdTick:s.tick,cold:false,meal:{tableId:c.tableId!,seatId:c.seatId!,mealId:c.mealId!}};
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
    for(const station of s.stations)for(const slot of station.slots) {
      const job=slot.job,item=slot.item;if(!item)continue;
      if(job&&!job.ready) {
        const manual=job.action==='hold'||job.action==='wash';
        const working=!manual||[s.chef,...s.helpers].some(actor=>actor.targetId===station.id&&actor.holding&&!actor.path.length&&isAdjacent(actor,stationFootprint(station)));
        if(working&&--job.remaining<=0)finishCooking(s,station,slot);
      }else if(job?.ready&&job.burnRemaining!==null&&--job.burnRemaining<=0&&item.kind!=='burnt') {
        item.kind='burnt';item.stage='burnt';job.burnRemaining=null;s.burnt++;emit(s,'burn',station.id);
      }
      if(slot.item?.kind==='dish'&&slot.item.finishedTick!==undefined) {
        if(EQUIPMENT_BY_ID[station.kind]?.tiers[station.tier-1]?.warm)slot.item.finishedTick=s.tick;
        else if(s.tick-slot.item.finishedTick>=SERVICE_RULES.coldTicks)slot.item.cold=true;
      }
    }
    if(s.chef.held?.kind==='dish'&&s.chef.held.finishedTick!==undefined&&s.tick-s.chef.held.finishedTick>=SERVICE_RULES.coldTicks)s.chef.held.cold=true;
    if(s.spawned<s.config.customers&&--s.nextArrival<=0)spawnCustomer(s);
    seatQueue(s);
    const drain=(s.config.cosy?2/3:1)*(s.config.spices.includes('rush_hour')?1.25:1);
    for(const customer of s.customers) {
      if(!active(s))break;
      if(customer.phase==='walking') {moveActor(customer,SERVICE_RULES.customerSpeed);if(!customer.path.length){customer.phase='seated';const seat=s.tables.find(t=>t.id===customer.tableId)?.seats.find(seat=>seat.id===customer.seatId);if(seat)seat.status='occupied';emit(s,'sit',customer.id);}}
      else if(customer.phase==='leaving'){moveActor(customer,SERVICE_RULES.customerSpeed);if(!customer.path.length)customer.phase='gone';}
      else if(customer.phase==='eating'){if(--customer.eatRemaining<=0)payCustomer(s,customer);}
      if(!s.config.tutorialLearning&&(customer.phase==='queue'||customer.phase==='seated')) {customer.patience-=drain;if(customer.patience<=0)leaveCustomer(s,customer,true);}
    }
    if(active(s)&&s.spawned>=s.config.customers&&s.customers.every(c=>c.phase==='gone')) {s.phase='complete';s.chef.holding=false;notice(s,'Service complete. Time to choose the next stop.');emit(s,'complete','service',s.coins);}
  }
}
