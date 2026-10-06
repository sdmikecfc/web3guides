import {createHomeWorld,stepHomeWorld,setHomeFixtureCondition,type HomeWorld,type HomeSimulationConfig} from './home-simulation';
import {validateRoomPlan} from './room-plan';
import {validDomainBatch} from './domain-cooking';
import {RECIPE_BY_ID} from './content';
import type {DinerState} from './progression';
export interface HomeAudienceState {version:1;world:HomeWorld;fraction:number;pendingLayout?:HomeSimulationConfig}
/** Checkpoint validation never supplies progress or rewards from a command. */
export function validHomeAudience(saved:HomeAudienceState):boolean {
  try {
    const w=saved.world,c=w.config;
    if(saved.pendingLayout&&(!w.config.layoutDraining||!saved.pendingLayout.roomPlan||validateRoomPlan(saved.pendingLayout.roomPlan,saved.pendingLayout.layout)))return false;
    if(saved.version!==1||!Number.isFinite(saved.fraction)||saved.fraction<0||saved.fraction>=1||w.version!==1||!Number.isSafeInteger(w.tick)||w.tick<0||!Number.isSafeInteger(w.nextId)||w.nextId<1||![c.w,c.h].every(n=>Number.isInteger(n)&&n>=1&&n<=20)||!Number.isFinite(c.arrivalRate)||c.arrivalRate<0||c.arrivalRate>10000)return false;
    if(!Array.isArray(w.messes)||w.messes.length>4||w.messes.some(m=>!m||typeof m.id!=='string'||![m.x,m.y,m.progress,m.createdTick].every(Number.isInteger)||m.x<0||m.y<0||m.x>=c.w||m.y>=c.h||m.progress<0||m.progress>=60||m.createdTick>w.tick)||new Set(w.messes.map(m=>`${m.x},${m.y}`)).size!==w.messes.length)return false;
    if(!Array.isArray(w.customers)||w.customers.length>150||!Array.isArray(w.orders)||w.orders.length>100||!Array.isArray(w.actors)||w.actors.length>24||!Array.isArray(w.stations)||w.stations.length>300||!Array.isArray(w.tables)||w.tables.length>300||!Array.isArray(w.bathrooms)||w.bathrooms.length>20||!Array.isArray(w.walkable)||w.walkable.length!==c.w*c.h||!Array.isArray(w.businessOrders)||w.businessOrders.length>2||!Number.isInteger(w.rng)||w.rng<0||w.rng>4294967295)return false;
    const finite=(value:unknown):boolean=>typeof value==='number'?Number.isFinite(value):Array.isArray(value)?value.every(finite):value!==null&&typeof value==='object'?Object.values(value).every(finite):true;
    if(!finite(w)||Object.values(w.metrics).some(value=>typeof value==='number'&&value<0))return false;
    for(const station of w.stations)for(const slot of station.slots)if(slot.portions&&(!validDomainBatch(slot.portions,station.kind)||slot.item?.recipeId!==slot.portions.recipeId||slot.portions.createdTick>w.tick))return false;
    for(const list of [w.customers,w.orders,w.actors,w.stations,w.tables,w.bathrooms,w.messes])if(new Set(list.map(v=>v.id)).size!==list.length)return false;
    return [...w.customers,...w.actors].every(actor=>Array.isArray(actor.path)&&actor.path.length<=400&&actor.path.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<c.w&&p.y<c.h));
  }catch{return false;}
}
const structure=(c:HomeSimulationConfig)=>JSON.stringify({w:c.w,h:c.h,layout:c.layout,roomPlan:c.roomPlan,chefs:c.chefs,waiters:c.waiters,cashiers:c.cashiers,equipment:c.layout.map(p=>[p.id,c.equipment[p.equipmentId]?.tier??1])},(key,value)=>['condition','skin','finish'].includes(key)?undefined:value);
export function homeLayoutIsClear(w:HomeWorld):boolean {
 return !w.customers.length&&!w.orders.length&&!w.messes.length&&w.actors.every(a=>!a.held&&!a.task)&&w.tables.every(t=>t.seats.every(s=>s.status==='clean'&&!s.item))&&w.stations.every(s=>s.slots.every(slot=>!slot.item&&!slot.job)&&(s.dirtySlots??[]).every(slot=>!slot.item&&!slot.workerId));
}
/** Accepted guests and dishes belong to the old world until physical work ends. */
export function queueRestaurantLayout(saved:HomeAudienceState,config:HomeSimulationConfig):void {
 if(structure(saved.world.config)===structure(config)){delete saved.pendingLayout;delete saved.world.config.layoutDraining;return;}
 saved.pendingLayout=structuredClone(config);saved.world.config.layoutDraining=true;
}
function activatePendingLayout(saved:HomeAudienceState):boolean {
 if(!saved.pendingLayout||!homeLayoutIsClear(saved.world))return false;
 const old=saved.world,next=createHomeWorld(saved.pendingLayout);
 next.tick=old.tick;next.nextId=old.nextId;next.rng=old.rng;next.lastMessTick=old.lastMessTick;
 next.metrics=structuredClone(old.metrics);next.businessOrders=[...old.businessOrders];
 for(const fixture of old.bathrooms)setHomeFixtureCondition(next,fixture.id,fixture.condition);
 saved.world=next;delete saved.pendingLayout;return true;
}
/** A bounded, persisted physical simulation for opted-in crowds. No client score
 * enters settlement; only elapsed server time advances the canonical world. */
export function settleAudience(state:DinerState,config:HomeSimulationConfig,elapsedMs:number,online:boolean,recent=true):void {
  let saved=state.homeAudience;
  if(!saved){saved={version:1,world:createHomeWorld(config),fraction:0};state.homeAudience=saved;}
  queueRestaurantLayout(saved,config);activatePendingLayout(saved);
  const w=saved.world;for(const module of config.roomPlan?.modules??[]){if(module.condition!==undefined&&module.condition!==w.bathrooms.find(f=>f.id===module.id)?.condition)setHomeFixtureCondition(w,module.id,module.condition);}
  const active=online&&recent&&(!state.run||state.run.location==='home')&&!state.rally.service,visit=state.regularStories?.pending;w.config.namedVisit=active&&visit&&!visit.ready?{id:visit.id,regularId:visit.regularId,recipeId:visit.recipeId}:undefined;
  if(!saved.pendingLayout&&JSON.stringify(w.config.menu)!==JSON.stringify(config.menu)){w.menu=createHomeWorld(config).menu;w.config.menu=[...config.menu];}
  if(w.config.menu.some(id=>!!RECIPE_BY_ID[id]?.domain))w.config.domainCookingVersion=1;
  w.config.crew=structuredClone(config.crew);w.config.staffPolicyVersion=config.staffPolicyVersion;w.config.signature=structuredClone(config.signature);
  w.config.audience={...config.audience!};w.config.recipeLevels={...config.recipeLevels};w.config.arrivalRate=config.arrivalRate;w.config.staffSpeedMultiplier=config.staffSpeedMultiplier;
  if(!active)w.playerMopping=null;
  const before={coins:w.metrics.coins,reputation:w.metrics.reputation},ticks=Math.max(0,elapsedMs)/50*(online?1:.6)+saved.fraction;
  saved.fraction=ticks-Math.floor(ticks);let left=Math.floor(ticks);
  while(left>0){const count=saved.pendingLayout?1:Math.min(300000,left);stepHomeWorld(saved.world,count);left-=count;activatePendingLayout(saved);}
  state.home.till.coins+=saved.world.metrics.coins-before.coins;state.home.till.reputation+=saved.world.metrics.reputation-before.reputation;
  for(const fixture of saved.world.bathrooms){const owned=state.home.fixtureInventory?.[fixture.id],module=state.home.roomPlan?.modules.find(m=>m.id===fixture.id);if(owned)owned.condition=fixture.condition;if(module)module.condition=fixture.condition;}
}
