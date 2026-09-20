import { EQUIPMENT_BY_ID, RECIPE_BY_ID, SERVICE_RULES, recipePrice } from './content';
import { DECOR_BY_ID } from './collections';
import type { HomePlacement } from './progression';
import type { Point, ServiceItem, ServiceJob, StationKind } from './types';

export const HOME_SIM_RULES = { version:1,ticksPerSecond:20,chefSpeed:2.6,waiterSpeed:3,customerSpeed:2.4,eatTicks:240,washTicks:60,queueLimit:24,measurementWarmupTicks:6000,measurementTicks:144000,cacheEntries:100 } as const;
export type HomeSimulationConfig = { w:number;h:number;layout:HomePlacement[];equipment:Record<string,{tier:number}>;menu:string[];recipeLevels:Record<string,number>;chefs:number;waiters:number;arrivalRate:number;staffSpeedMultiplier?:number };
export type HomeTask = { kind:'cook'|'deliver'|'wash';orderId:string|null;stationId:string|null;slotIndex:number;tableId:string|null;seatId:string|null;phase:'approach'|'work'|'pickup'|'carry'|'drop' };
export type HomeActor = Point & { id:string;role:'chef'|'waiter';path:Point[];goal:Point|null;blockedTicks:number;held:ServiceItem|null;task:HomeTask|null;pose:'idle'|'walk'|'cook'|'carry'|'wash' };
export type HomeStation = Point & { id:string;kind:StationKind;tier:number;rotation:number;front:Point;handoff:Point;slots:{item:ServiceItem|null;job:ServiceJob|null;orderId:string|null;workerId:string|null}[] };
export type HomeSeat = Point & { id:string;status:'clean'|'occupied'|'eating'|'dirty'|'awaitingWash';customerId:string|null;mealId:string|null;item:ServiceItem|null };
export type HomeTable = Point & { id:string;rotation:number;capacity:number;tier:number;front:Point;servicePoints:Point[];seats:HomeSeat[] };
export type HomeCustomer = Point & { id:string;phase:'queue'|'walking'|'seated'|'eating'|'leaving';path:Point[];tableId:string|null;seatId:string|null;orderId:string|null;recipeId:string;eatRemaining:number;blockedTicks?:number };
export type HomeOrder = { id:string;customerId:string;recipeId:string;status:'queued'|'cooking'|'ready'|'carried'|'served';chefId:string|null;waiterId:string|null;stationId:string|null;slotIndex:number;itemId:string };
export type HomeWorld = { version:1;config:HomeSimulationConfig;tick:number;nextId:number;nextArrival:number;menu:string[];door:Point;walkable:boolean[];actors:HomeActor[];stations:HomeStation[];tables:HomeTable[];customers:HomeCustomer[];orders:HomeOrder[];metrics:{coins:number;reputation:number;plates:number;platesByRecipe:Record<string,number>;arrivals:number;turnedAway:number;seatBusy:number;chefBusy:number;waiterBusy:number;washed:number};notice:string };
export type HomeRates = {coins:number;reputation:number;plates:number;platesByRecipe:Record<string,number>;bottleneck:'arrivals'|'seats'|'kitchen'|'waiters';rates:{arrivals:number;seats:number;kitchen:number;waiters:number};menu:string[]};
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const bounded=(v:number,fallback:number,lo:number,hi:number):number=>Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):fallback;
const key=(p:Point)=>`${p.x},${p.y}`;
const kinds:StationKind[]=['crate','grill','prep','fryer','sink','bin','oven','blender','coffee','drinks','waffle','pass'];
function footprint(p:HomePlacement):Point[]{const size=(EQUIPMENT_BY_ID[p.equipmentId]??DECOR_BY_ID[p.equipmentId])?.footprint??[1,1];const [w,h]=p.rotation%2?[size[1],size[0]]:size;return Array.from({length:w*h},(_,i)=>({x:p.x+i%w,y:p.y+Math.floor(i/w)}));}
function frontOf(p:HomePlacement):Point {const cells=footprint(p);return p.rotation===0?{x:p.x,y:Math.max(...cells.map(c=>c.y))+1}:p.rotation===1?{x:p.x-1,y:p.y}:p.rotation===2?{x:p.x,y:p.y-1}:{x:Math.max(...cells.map(c=>c.x))+1,y:p.y};}
function id(w:HomeWorld,prefix:string):string{return `${prefix}_${w.nextId++}`;}
function canWalk(w:HomeWorld,p:Point):boolean{return Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<w.config.w&&p.y<w.config.h&&w.walkable[p.y*w.config.w+p.x]===true;}
export function homePath(w:HomeWorld,from:Point,to:Point,blocked:ReadonlySet<string>=new Set()):Point[]|null {
  const start={x:Math.round(from.x),y:Math.round(from.y)};if(!canWalk(w,start)||!canWalk(w,to)||(blocked.has(key(to))&&key(start)!==key(to)))return null;
  const previous=new Map<string,Point|null>([[key(start),null]]),queue=[start];
  for(let i=0;i<queue.length;i++){const p=queue[i];if(p.x===to.x&&p.y===to.y){const path:Point[]=[];let q:Point|null=p;while(q){path.push(q);q=previous.get(key(q))??null;}path.reverse();path.shift();if(Math.abs(start.x-from.x)+Math.abs(start.y-from.y)>.001)path.unshift(start);return path;}
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const q={x:p.x+dx,y:p.y+dy};if(canWalk(w,q)&&!blocked.has(key(q))&&!previous.has(key(q))){previous.set(key(q),p);queue.push(q);}}
  }return null;
}
function move(actor:Point&{path:Point[]},speed:number):void {let remaining=speed/20;while(remaining>0&&actor.path.length){const p=actor.path[0],dx=p.x-actor.x,dy=p.y-actor.y,d=Math.hypot(dx,dy);if(d<=remaining+.000001){actor.x=p.x;actor.y=p.y;actor.path.shift();remaining-=d;}else{actor.x+=dx/d*remaining;actor.y+=dy/d*remaining;break;}}}
const at=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)<.001;
const neighbors=(p:Point):Point[]=>[{x:p.x,y:p.y-1},{x:p.x+1,y:p.y},{x:p.x,y:p.y+1},{x:p.x-1,y:p.y}];
// Layout is immutable for a world. Weak caches are rebuilt for JSON-restored
// worlds and do not become hidden simulation state or alter deterministic ticks.
const geometryCache=new WeakMap<HomeWorld,{chairs:Set<string>;perimeters:Map<string,Point[]>;useful?:Set<string>}>();
function geometry(w:HomeWorld){let cached=geometryCache.get(w);if(!cached){cached={chairs:new Set(w.tables.flatMap(table=>table.seats.map(key))),perimeters:new Map()};geometryCache.set(w,cached);}return cached;}
function chairCells(w:HomeWorld):Set<string>{return geometry(w).chairs;}
function trafficBlocks(w:HomeWorld,mover:Point&{id:string},allowSeat?:Point,yieldIdle=false):Set<string>{
 const blocked=new Set(chairCells(w));if(allowSeat)blocked.delete(key(allowSeat));
 for(const actor of w.actors)if(actor.id!==mover.id&&(!yieldIdle||actor.path.length||actor.task?.phase==='work'))blocked.add(key({x:Math.round(actor.x),y:Math.round(actor.y)}));
 for(const guest of w.customers)if(guest.id!==mover.id&&guest.phase!=='queue')blocked.add(key({x:Math.round(guest.x),y:Math.round(guest.y)}));
 return blocked;
}
function clearSegment(w:HomeWorld,actor:Point&{id:string},to:Point,yieldIdle=false):boolean{const dx=to.x-actor.x,dy=to.y-actor.y,length=dx*dx+dy*dy;return [...w.actors.filter(other=>other.id!==actor.id&&(!yieldIdle||other.path.length||other.task?.phase==='work')),...w.customers.filter(c=>c.id!==actor.id&&c.phase!=='queue')].every(other=>{const t=length?Math.max(0,Math.min(1,((other.x-actor.x)*dx+(other.y-actor.y)*dy)/length)):0;const nearest=Math.hypot(actor.x+dx*t-other.x,actor.y+dy*t-other.y),start=Math.hypot(actor.x-other.x,actor.y-other.y);return nearest>=Math.min(.65,start)-.00001;});}
function trafficPath(w:HomeWorld,actor:Point&{id:string},to:Point,allowSeat?:Point):Point[]|null{
 // A person stopped between cells must be able to back up to the other end
 // before yielding. Snapping to the nearest center would trap opposing traffic.
 const centers:Point[]=[];if(Number.isInteger(actor.x)&&!Number.isInteger(actor.y))centers.push({x:actor.x,y:Math.floor(actor.y)},{x:actor.x,y:Math.ceil(actor.y)});if(Number.isInteger(actor.y)&&!Number.isInteger(actor.x))centers.push({x:Math.floor(actor.x),y:actor.y},{x:Math.ceil(actor.x),y:actor.y});
 // Prefer a clear route. When an idle colleague is the only obstruction,
 // publish the route so they can yield; movement still checks every body.
 for(const yieldIdle of [false,true]){
  const blocked=trafficBlocks(w,actor,allowSeat,yieldIdle),normal=homePath(w,actor,to,blocked),paths:Point[][]=[];
  if(normal&&(!normal.length||clearSegment(w,actor,normal[0],yieldIdle)))paths.push(normal);
  for(const center of centers)if(canWalk(w,center)&&clearSegment(w,actor,center,yieldIdle)){const rest=homePath(w,center,to,blocked);if(rest)paths.push([center,...rest]);}
  // Both endpoints of the current edge are valid starts. Choose actual travel
  // distance so a reroute never needlessly reverses towards approaching traffic.
  const length=(path:Point[])=>path.reduce((sum,p,i)=>sum+Math.hypot(p.x-(path[i-1]??actor).x,p.y-(path[i-1]??actor).y),0);
  paths.sort((a,b)=>length(a)-length(b));if(paths.length)return paths[0];
 }return null;
}
function staffPath(w:HomeWorld,actor:HomeActor,to:Point):Point[]|null{return trafficPath(w,actor,to);}
function route(w:HomeWorld,actor:HomeActor,to:Point):boolean {actor.goal={...to};const path=staffPath(w,actor,to);if(!path)return false;actor.path=path;actor.blockedTicks=0;return true;}
function perimeter(w:HomeWorld,placementId:string):Point[]{const cache=geometry(w),existing=cache.perimeters.get(placementId);if(existing)return existing;const placement=w.config.layout.find(p=>p.id===placementId);if(!placement)return [];const own=new Set(footprint(placement).map(key)),seen=new Set<string>(),points=footprint(placement).flatMap(neighbors).filter(point=>!own.has(key(point))&&!seen.has(key(point))&&!!seen.add(key(point))&&canWalk(w,point));cache.perimeters.set(placementId,points);return points;}
function nearestTarget(w:HomeWorld,actor:HomeActor,points:Point[]):Point|null{
 const blocked=trafficBlocks(w,actor,undefined,true),targets=new Set(points.filter(p=>canWalk(w,p)&&!blocked.has(key(p))&&!w.actors.some(other=>other!==actor&&Math.hypot(other.x-p.x,other.y-p.y)<.65)).map(key));if(!targets.size)return null;
 const start={x:Math.round(actor.x),y:Math.round(actor.y)},queue=[start],seen=new Set([key(start)]);for(let i=0;i<queue.length;i++){const point=queue[i];if(targets.has(key(point)))return point;for(const next of neighbors(point))if(canWalk(w,next)&&!blocked.has(key(next))&&!seen.has(key(next))){seen.add(key(next));queue.push(next);}}return null;
}
function tableTarget(w:HomeWorld,actor:HomeActor,table:HomeTable):Point|null{return nearestTarget(w,actor,table.servicePoints);}
function pickupTarget(w:HomeWorld,actor:HomeActor,station:HomeStation):Point|null{return nearestTarget(w,actor,[station.handoff,...perimeter(w,station.id).filter(p=>!at(p,station.front)&&!at(p,station.handoff))]);}
function usefulCells(w:HomeWorld):Set<string>{const cache=geometry(w);return cache.useful??(cache.useful=new Set([key(w.door),...neighbors(w.door).map(key),...chairCells(w),...w.stations.flatMap(st=>[key(st.front),key(st.handoff)]),...w.tables.flatMap(table=>table.servicePoints.map(key))]));}
function park(w:HomeWorld,actor:HomeActor):void{
 if(actor.path.length)return;const useful=usefulCells(w),current={x:Math.round(actor.x),y:Math.round(actor.y)};
 const passing=[...w.actors.filter(other=>other!==actor),...w.customers.filter(c=>c.phase!=='queue')],usedPaths=new Set(passing.flatMap(other=>other.path.map(key)));
 if(!useful.has(key(current))&&!usedPaths.has(key(current))&&at(actor,current)){actor.goal=null;return;}
 const options:Point[]=[];for(let y=0;y<w.config.h;y++)for(let x=0;x<w.config.w;x++)if(canWalk(w,{x,y})&&!useful.has(key({x,y}))&&!usedPaths.has(key({x,y}))&&!at(current,{x,y}))options.push({x,y});
 const target=nearestTarget(w,actor,options);if(target&&!at(actor,target))route(w,actor,target);
}
function yieldPath(w:HomeWorld,actor:HomeActor,blocker:Point&{id:string;path?:Point[]}):Point[]|null{
 const points:Point[]=[];const current={x:Math.round(actor.x),y:Math.round(actor.y)},avoid=new Set((blocker.path??[]).map(key));
 for(let y=current.y-2;y<=current.y+2;y++)for(let x=current.x-2;x<=current.x+2;x++)if(Math.abs(x-current.x)+Math.abs(y-current.y)<=2&&canWalk(w,{x,y})&&!avoid.has(key({x,y}))&&Math.hypot(x-blocker.x,y-blocker.y)>Math.hypot(actor.x-blocker.x,actor.y-blocker.y)+.2)points.push({x,y});
 const target=nearestTarget(w,actor,points);return target?staffPath(w,actor,target):null;
}
function moveStaff(w:HomeWorld,actor:HomeActor,speed:number):void{
 if(!actor.path.length)return;const next=actor.path[0],distance=Math.hypot(next.x-actor.x,next.y-actor.y),step=Math.min(speed/20,distance),candidate=distance?{x:actor.x+(next.x-actor.x)*step/distance,y:actor.y+(next.y-actor.y)*step/distance}:next;
 const others=[...w.actors.filter(other=>other!==actor),...w.customers.filter(c=>c.phase!=='queue')];
 const blocker=others.find(other=>Math.hypot(candidate.x-other.x,candidate.y-other.y)<.64999&&Math.hypot(candidate.x-other.x,candidate.y-other.y)<Math.hypot(actor.x-other.x,actor.y-other.y)-.00001);
 if(blocker){
  if('role' in blocker&&!blocker.path.length&&blocker.task?.phase!=='work')park(w,blocker);
  actor.blockedTicks++;if(actor.blockedTicks%10===0&&actor.goal){const yields=!actor.task||!blocker.path.length||!('role' in blocker)||!blocker.task||actor.id>blocker.id;const detour=yields?yieldPath(w,actor,blocker):null;const path=detour??staffPath(w,actor,actor.goal);if(path?.length){actor.path=path;if(detour&&!actor.task)actor.goal={...detour[detour.length-1]};}}
  return;
 }
 actor.blockedTicks=0;move(actor,Math.min(speed,distance*20));
}
function moveCustomer(w:HomeWorld,c:HomeCustomer):void{
 const seat=w.tables.find(table=>table.id===c.tableId)?.seats.find(seat=>seat.id===c.seatId),goal=c.phase==='leaving'?w.door:seat;
 if(!goal)return;if(!c.path.length&&!at(c,goal)){c.path=trafficPath(w,c,goal,seat)??[];if(!c.path.length)return;}
 const next=c.path[0];if(!next)return;const distance=Math.hypot(next.x-c.x,next.y-c.y),step=Math.min(HOME_SIM_RULES.customerSpeed/20,distance),candidate=distance?{x:c.x+(next.x-c.x)*step/distance,y:c.y+(next.y-c.y)*step/distance}:next;
 const others=[...w.actors,...w.customers.filter(other=>other!==c&&other.phase!=='queue')];
 const blocker=others.find(other=>Math.hypot(candidate.x-other.x,candidate.y-other.y)<.64999&&Math.hypot(candidate.x-other.x,candidate.y-other.y)<Math.hypot(c.x-other.x,c.y-other.y)-.00001);
 if(blocker){
  if('role' in blocker&&!blocker.path.length&&blocker.task?.phase!=='work')park(w,blocker);
  c.blockedTicks=(c.blockedTicks??0)+1;const path=trafficPath(w,c,goal,seat);if(path)c.path=path;return;
 }
 c.blockedTicks=0;move(c,Math.min(HOME_SIM_RULES.customerSpeed,distance*20));
}
export function createHomeWorld(input:HomeSimulationConfig):HomeWorld {
  const config:HomeSimulationConfig={...clone(input),w:Math.floor(bounded(input.w,8,4,30)),h:Math.floor(bounded(input.h,8,4,30)),chefs:Math.floor(bounded(input.chefs,1,0,8)),waiters:Math.floor(bounded(input.waiters,1,0,8)),arrivalRate:bounded(input.arrivalRate,8,0,1200),staffSpeedMultiplier:bounded(input.staffSpeedMultiplier??1,1,1,1.1)};
  const w:HomeWorld={version:1,config,tick:0,nextId:1,nextArrival:20,menu:[],door:{x:Math.floor(config.w/2),y:config.h-1},walkable:Array.from({length:config.w*config.h},()=>true),actors:[],stations:[],tables:[],customers:[],orders:[],metrics:{coins:0,reputation:0,plates:0,platesByRecipe:{},arrivals:0,turnedAway:0,seatBusy:0,chefBusy:0,waiterBusy:0,washed:0},notice:''};
  const ids=new Set<string>();let invalid=false;
  for(const p of config.layout){if(!p||ids.has(p.id)||(!EQUIPMENT_BY_ID[p.equipmentId]&&!DECOR_BY_ID[p.equipmentId])||!Number.isInteger(p.x)||!Number.isInteger(p.y)||![0,1,2,3].includes(p.rotation)){invalid=true;continue;}ids.add(p.id);for(const c of footprint(p)){if(!canWalk(w,c)||(c.x===w.door.x&&c.y===w.door.y)){invalid=true;continue;}w.walkable[c.y*config.w+c.x]=false;}}
  for(const p of config.layout){if(!EQUIPMENT_BY_ID[p.equipmentId])continue;const front=frontOf(p),reachable=homePath(w,w.door,front)!==null,tier=Math.floor(bounded(config.equipment[p.equipmentId]?.tier??1,1,1,EQUIPMENT_BY_ID[p.equipmentId].tiers.length));
    if(!reachable)continue;
    if(kinds.includes(p.equipmentId as StationKind)){const kind=p.equipmentId as StationKind,capacity=EQUIPMENT_BY_ID[kind].tiers[tier-1].capacity;w.stations.push({id:p.id,kind,x:p.x,y:p.y,rotation:p.rotation,tier,front,handoff:{...front},slots:Array.from({length:capacity},()=>({item:null,job:null,orderId:null,workerId:null}))});}
    if(p.equipmentId==='table_1'||p.equipmentId==='table_2'||p.equipmentId==='table_4'){
      const capacity=p.equipmentId==='table_4'?4:p.equipmentId==='table_1'?1:2,cells=footprint(p),corners=cells.flatMap(c=>[{x:c.x-1,y:c.y},{x:c.x+1,y:c.y},{x:c.x,y:c.y-1},{x:c.x,y:c.y+1}]);
      const usable=corners.filter((c,i)=>canWalk(w,c)&&homePath(w,w.door,c)!==null&&corners.findIndex(other=>key(other)===key(c))===i).sort((a,b)=>a.y-b.y||a.x-b.x);
      if(usable.length<capacity)continue;
      // Seats occupy distinct reachable sides; mirrored/rotated table footprints share the same navigation source.
      const seats=Array.from({length:capacity},(_,i)=>{const p=capacity===1?front:usable[Math.floor(i*usable.length/capacity)];return {...p,id:`${p.x}_${p.y}_seat_${i}`,status:'clean' as const,customerId:null,mealId:null,item:null};});
      w.tables.push({id:p.id,x:p.x,y:p.y,rotation:p.rotation,capacity,tier,front,servicePoints:[],seats:seats.map((seat,i)=>({...seat,id:`${p.id}_seat_${i+1}`}))});
    }
  }
  const chairs=chairCells(w);for(const station of w.stations){const options=perimeter(w,station.id).filter(point=>!chairs.has(key(point))&&homePath(w,w.door,point,chairs));station.handoff=options.find(point=>!at(point,station.front))??station.front;}
  for(const table of w.tables)table.servicePoints=perimeter(w,table.id).filter(point=>!chairs.has(key(point))&&homePath(w,w.door,point,chairs)!==null);
  const stationKinds=new Set(w.stations.map(st=>st.kind));
  w.menu=invalid||!stationKinds.has('sink')?[]:[...new Set(config.menu)].filter(recipeId=>RECIPE_BY_ID[recipeId]?.steps.every(step=>stationKinds.has(step.station)));
  if(invalid)w.notice='This room has overlapping or blocked furnishings.';else if(!w.menu.length)w.notice='Place the working equipment for a selected recipe.';
  for(const role of ['chef','waiter'] as const)for(let i=0;i<(role==='chef'?config.chefs:config.waiters);i++)w.actors.push({...w.door,id:`${role}_${i+1}`,role,path:[],goal:null,blockedTicks:0,held:null,task:null,pose:'idle'});
  const useful=usefulCells(w),spawnCells:Point[]=[];for(let y=0;y<config.h;y++)for(let x=0;x<config.w;x++)if(canWalk(w,{x,y})&&!useful.has(key({x,y}))&&homePath(w,w.door,{x,y},chairCells(w)))spawnCells.push({x,y});
  spawnCells.sort((a,b)=>a.y-b.y||a.x-b.x);
  w.actors.forEach((actor,index)=>{const point=spawnCells[index];if(point){actor.x=point.x;actor.y=point.y;}});
  return w;
}
function emptyStation(w:HomeWorld,kind:StationKind,from:HomeActor):{station:HomeStation;index:number}|null {
  let best:{station:HomeStation;index:number;distance:number}|null=null;
  for(const station of w.stations)if(station.kind===kind){if(station.slots.some(slot=>slot.workerId&&slot.workerId!==from.id))continue;const index=station.slots.findIndex(slot=>!slot.item&&!slot.workerId);if(index<0)continue;const path=staffPath(w,from,station.front);if(path&&(best===null||path.length<best.distance))best={station,index,distance:path.length};}
  return best?{station:best.station,index:best.index}:null;
}
function assignChef(w:HomeWorld,actor:HomeActor):void {
  const order=w.orders.find(order=>order.status==='queued');if(!order){park(w,actor);return;}
  const step=RECIPE_BY_ID[order.recipeId].steps[0],target=emptyStation(w,step.station,actor);if(!target){park(w,actor);return;}
  order.status='cooking';order.chefId=actor.id;order.stationId=target.station.id;order.slotIndex=target.index;
  actor.held={id:order.itemId,kind:'raw',recipeId:order.recipeId,step:0,stage:`raw_${order.recipeId}`,createdTick:w.tick,cold:false};
  target.station.slots[target.index].workerId=actor.id;actor.task={kind:'cook',orderId:order.id,stationId:target.station.id,slotIndex:target.index,tableId:null,seatId:null,phase:'approach'};route(w,actor,target.station.front);
}
function assignWaiter(w:HomeWorld,actor:HomeActor):void {
  const order=w.orders.find(order=>order.status==='ready'&&!order.waiterId);
  if(order){const station=w.stations.find(st=>st.id===order.stationId),pickup=station?pickupTarget(w,actor,station):null;if(station&&pickup&&route(w,actor,pickup)){order.waiterId=actor.id;actor.task={kind:'deliver',orderId:order.id,stationId:station.id,slotIndex:order.slotIndex,tableId:null,seatId:null,phase:'pickup'};return;}}
  for(const table of w.tables)for(const seat of table.seats)if(seat.status==='dirty'&&!w.actors.some(other=>other.task?.kind==='wash'&&other.task.seatId===seat.id)){
    const sink=emptyStation(w,'sink',actor);if(!sink)continue;const approach=tableTarget(w,actor,table);if(!approach||!route(w,actor,approach))continue;
    sink.station.slots[sink.index].workerId=actor.id;actor.task={kind:'wash',orderId:null,stationId:sink.station.id,slotIndex:sink.index,tableId:table.id,seatId:seat.id,phase:'pickup'};return;
  }
  park(w,actor);
}
function processChef(w:HomeWorld,actor:HomeActor):void {
  if(actor.path.length)return;const task=actor.task;if(!task){assignChef(w,actor);return;}if(task.kind!=='cook')return;
  const order=w.orders.find(o=>o.id===task.orderId),station=w.stations.find(st=>st.id===task.stationId),slot=station?.slots[task.slotIndex];if(!order||!station||!slot){actor.task=null;return;}
  if(task.phase==='approach'&&!actor.path.length&&actor.held){
    if(!at(actor,station.front)){route(w,actor,station.front);return;}
    const item=actor.held,step=RECIPE_BY_ID[item.recipeId].steps[item.step],spec=EQUIPMENT_BY_ID[station.kind].tiers[station.tier-1],duration=Math.max(1,Math.round(step.ticks/spec.speed/(step.action==='hold'?(w.config.staffSpeedMultiplier??1):1)));
    slot.item=item;slot.orderId=order.id;slot.workerId=actor.id;slot.job={action:step.action,remaining:duration,total:duration,burnRemaining:null,ready:false};actor.held=null;task.phase='work';
  }
  if(task.phase==='work'&&slot.job?.ready&&slot.item){
    if(slot.item.kind==='dish'){order.status='ready';order.stationId=station.id;order.slotIndex=task.slotIndex;slot.workerId=null;actor.task=null;park(w,actor);return;}
    actor.held=slot.item;slot.item=null;slot.job=null;slot.orderId=null;slot.workerId=null;task.phase='carry';
  }
  if(task.phase==='carry'&&actor.held){const step=RECIPE_BY_ID[actor.held.recipeId].steps[actor.held.step],target=emptyStation(w,step.station,actor);if(!target){park(w,actor);return;}target.station.slots[target.index].workerId=actor.id;task.stationId=target.station.id;task.slotIndex=target.index;task.phase='approach';order.stationId=target.station.id;order.slotIndex=target.index;route(w,actor,target.station.front);}
}
function processWaiter(w:HomeWorld,actor:HomeActor):void {
  if(actor.path.length)return;const task=actor.task;if(!task){assignWaiter(w,actor);return;}if(actor.path.length)return;
  const station=w.stations.find(st=>st.id===task.stationId),slot=station?.slots[task.slotIndex];if(!station||!slot){actor.task=null;return;}
  if(task.kind==='deliver'){
    const order=w.orders.find(o=>o.id===task.orderId),customer=w.customers.find(c=>c.orderId===task.orderId),table=w.tables.find(t=>t.id===customer?.tableId),seat=table?.seats.find(seat=>seat.id===customer?.seatId);
    if(!order||!customer||!seat){actor.task=null;return;}
    if(task.phase==='pickup'&&slot.item?.kind==='dish'){
      if(!perimeter(w,station.id).some(point=>at(actor,point))){const pickup=pickupTarget(w,actor,station);if(pickup)route(w,actor,pickup);return;}
      actor.held=slot.item;slot.item=null;slot.job=null;slot.orderId=null;slot.workerId=null;order.status='carried';task.phase='drop';task.tableId=table!.id;task.seatId=seat.id;const approach=tableTarget(w,actor,table!);if(approach)route(w,actor,approach);return;
    }
    if(task.phase==='drop'&&actor.held&&customer.phase==='seated'){
      if(!table!.servicePoints.some(point=>at(actor,point))){const approach=tableTarget(w,actor,table!);if(approach)route(w,actor,approach);else park(w,actor);return;}
      seat.item=actor.held;actor.held=null;seat.status='eating';customer.phase='eating';customer.eatRemaining=Math.round(HOME_SIM_RULES.eatTicks/(table!.tier===2?1.25:1));order.status='served';actor.task=null;park(w,actor);return;
    }
  }
  if(task.kind==='wash'){
    const table=w.tables.find(t=>t.id===task.tableId),seat=table?.seats.find(seat=>seat.id===task.seatId);if(!seat){actor.task=null;return;}
    if(task.phase==='pickup'&&seat.status==='dirty'&&seat.item){if(!table!.servicePoints.some(point=>at(actor,point))){const approach=tableTarget(w,actor,table!);if(approach)route(w,actor,approach);return;}actor.held=seat.item;seat.item=null;seat.status='awaitingWash';task.phase='drop';route(w,actor,station.front);return;}
    if(task.phase==='drop'&&actor.held){if(!at(actor,station.front)){if(!route(w,actor,station.front))park(w,actor);return;}const spec=EQUIPMENT_BY_ID.sink.tiers[station.tier-1],duration=Math.round(HOME_SIM_RULES.washTicks/spec.speed/(station.tier===3?1:(w.config.staffSpeedMultiplier??1)));slot.item=actor.held;actor.held=null;slot.job={action:station.tier===3?'timed':'wash',remaining:duration,total:duration,burnRemaining:null,ready:false};task.phase='work';}
    if(task.phase==='work'&&!slot.item){actor.task=null;slot.workerId=null;park(w,actor);}
  }
}
function updateStations(w:HomeWorld):void {
  for(const station of w.stations)for(const slot of station.slots){const job=slot.job,item=slot.item;if(!job||!item||job.ready)continue;
    if(job.action==='hold'||job.action==='wash'){const actor=w.actors.find(a=>a.id===slot.workerId);if(!actor||actor.path.length||actor.task?.stationId!==station.id||!at(actor,station.front))continue;}
    if(--job.remaining>0)continue;
    if(item.kind==='dirty'){
      const ref=item.meal,seat=ref?w.tables.find(t=>t.id===ref.tableId)?.seats.find(seat=>seat.id===ref.seatId):null;
      if(seat&&seat.mealId===ref!.mealId&&seat.status==='awaitingWash'){seat.status='clean';seat.customerId=null;seat.mealId=null;seat.item=null;w.metrics.washed++;}
      slot.item=null;slot.job=null;slot.orderId=null;continue;
    }
    const recipe=RECIPE_BY_ID[item.recipeId];item.stage=recipe.steps[item.step].output;item.step++;item.kind=item.step>=recipe.steps.length?'dish':'processed';if(item.kind==='dish'){item.finishedTick=w.tick;item.stage=`plated_${item.recipeId}`;}job.ready=true;job.remaining=0;
  }
}
function spawn(w:HomeWorld):void {
  w.metrics.arrivals++;w.nextArrival=72000/w.config.arrivalRate;
  if(w.customers.filter(c=>c.phase==='queue').length>=HOME_SIM_RULES.queueLimit){w.metrics.turnedAway++;return;}
  const recipeId=w.menu[(w.metrics.arrivals-1)%w.menu.length];w.customers.push({...w.door,id:id(w,'guest'),phase:'queue',path:[],tableId:null,seatId:null,orderId:null,recipeId,eatRemaining:0});
}
function seatGuests(w:HomeWorld):void {
  for(const customer of w.customers)if(customer.phase==='queue'){
    if([...w.actors,...w.customers.filter(c=>c!==customer&&c.phase!=='queue')].some(other=>Math.hypot(other.x-w.door.x,other.y-w.door.y)<.65))return;
    const table=w.tables.find(t=>t.seats.some(seat=>seat.status==='clean'));if(!table)return;const seat=table.seats.find(seat=>seat.status==='clean')!,path=trafficPath(w,customer,seat,seat);if(!path)continue;
    customer.tableId=table.id;customer.seatId=seat.id;customer.phase='walking';customer.path=path;customer.orderId=id(w,'order');seat.status='occupied';seat.customerId=customer.id;seat.mealId=id(w,'meal');
  }
}
function updateCustomers(w:HomeWorld):void {
  for(let i=w.customers.length-1;i>=0;i--){const c=w.customers[i];
    if(c.phase==='walking'||c.phase==='leaving'){
      moveCustomer(w,c);
      if(!c.path.length){if(c.phase==='leaving'&&!at(c,w.door))continue;if(c.phase==='walking'){const seat=w.tables.find(t=>t.id===c.tableId)?.seats.find(s=>s.id===c.seatId);if(!seat||!at(c,seat))continue;}if(c.phase==='leaving'){w.customers.splice(i,1);continue;}c.phase='seated';w.orders.push({id:c.orderId!,customerId:c.id,recipeId:c.recipeId,status:'queued',chefId:null,waiterId:null,stationId:null,slotIndex:0,itemId:id(w,'food')});}
    }else if(c.phase==='eating'&&--c.eatRemaining<=0){
      const seat=w.tables.find(t=>t.id===c.tableId)?.seats.find(seat=>seat.id===c.seatId);if(!seat)continue;
      w.metrics.coins+=recipePrice(c.recipeId,w.config.recipeLevels[c.recipeId]);w.metrics.reputation+=RECIPE_BY_ID[c.recipeId].reputation;w.metrics.plates++;w.metrics.platesByRecipe[c.recipeId]=(w.metrics.platesByRecipe[c.recipeId]??0)+1;
      seat.status='dirty';seat.item={id:id(w,'plate'),kind:'dirty',recipeId:c.recipeId,step:RECIPE_BY_ID[c.recipeId].steps.length,stage:'dirty_plate',createdTick:w.tick,cold:false,meal:{tableId:c.tableId!,seatId:c.seatId!,mealId:seat.mealId!}};
      c.phase='leaving';c.path=homePath(w,c,w.door,trafficBlocks(w,c))??[];w.orders=w.orders.filter(o=>o.id!==c.orderId);
    }
  }
}
/** The visible restaurant and measured offline rates run this exact physical loop. */
export function stepHomeWorld(w:HomeWorld,ticks=1):void {
  if(!Number.isSafeInteger(ticks)||ticks<1||ticks>300000)return;
  for(let i=0;i<ticks;i++){
    // No actor, order or appliance can change before the next arrival. Skip
    // these exact empty ticks; busy counters are zero and no RNG is consumed.
    if(!w.customers.length&&!w.orders.length&&w.tables.every(table=>table.seats.every(seat=>seat.status==='clean'))&&w.stations.every(st=>st.slots.every(slot=>!slot.item&&!slot.job))&&w.actors.every(actor=>!actor.task&&!actor.held&&!actor.path.length)){
      const useful=usefulCells(w);if(w.actors.every(actor=>!useful.has(key(actor)))){const until=w.menu.length&&w.config.arrivalRate>0?Math.max(0,Math.ceil(w.nextArrival)-1):ticks-i,skip=Math.min(ticks-i,until);if(skip>0){w.tick+=skip;if(w.menu.length&&w.config.arrivalRate>0)w.nextArrival-=skip;i+=skip-1;continue;}}
    }
    w.tick++;
    if(w.menu.length&&w.config.arrivalRate>0&&--w.nextArrival<=0)spawn(w);
    seatGuests(w);updateCustomers(w);updateStations(w);
    for(const actor of w.actors){moveStaff(w,actor,(actor.role==='chef'?HOME_SIM_RULES.chefSpeed:HOME_SIM_RULES.waiterSpeed)*(w.config.staffSpeedMultiplier??1));if(actor.role==='chef')processChef(w,actor);else processWaiter(w,actor);actor.pose=actor.path.length?(actor.held?'carry':'walk'):actor.task?.phase==='work'?(actor.role==='chef'?'cook':'wash'):'idle';}
    w.metrics.seatBusy+=w.tables.reduce((n,t)=>n+t.seats.filter(seat=>seat.status!=='clean').length,0);
    w.metrics.chefBusy+=w.actors.filter(a=>a.role==='chef'&&a.task).length;w.metrics.waiterBusy+=w.actors.filter(a=>a.role==='waiter'&&a.task).length;
  }
}
const rateCache=new Map<string,HomeRates>();
export function measureHomeRates(config:HomeSimulationConfig):HomeRates {
  const cacheKey=JSON.stringify(config),cached=rateCache.get(cacheKey);if(cached)return clone(cached);
  const world=createHomeWorld(config);stepHomeWorld(world,HOME_SIM_RULES.measurementWarmupTicks);const before=clone(world.metrics);stepHomeWorld(world,HOME_SIM_RULES.measurementTicks);
  const after=world.metrics,hours=HOME_SIM_RULES.measurementTicks/72000,plates=(after.plates-before.plates)/hours;
  const utilisation=(field:'seatBusy'|'chefBusy'|'waiterBusy',count:number)=>count>0?(after[field]-before[field])/(HOME_SIM_RULES.measurementTicks*count):1;
  const capacity=(use:number,available:boolean)=>available&&use>0?plates/use:0;
  const rates={arrivals:world.config.arrivalRate,seats:capacity(utilisation('seatBusy',world.tables.reduce((n,t)=>n+t.capacity,0)),world.tables.length>0),kitchen:capacity(utilisation('chefBusy',world.config.chefs),world.config.chefs>0&&world.menu.length>0),waiters:capacity(utilisation('waiterBusy',world.config.waiters),world.config.waiters>0&&world.stations.some(st=>st.kind==='sink'))};
  const bottleneck=(Object.keys(rates) as (keyof typeof rates)[]).reduce((a,b)=>rates[a]<=rates[b]?a:b);
  const platesByRecipe=Object.fromEntries(Object.entries(after.platesByRecipe).map(([id,count])=>[id,(count-(before.platesByRecipe[id]??0))/hours]));
  const result:HomeRates={coins:(after.coins-before.coins)/hours,reputation:(after.reputation-before.reputation)/hours,plates,platesByRecipe,bottleneck,rates,menu:world.menu};
  rateCache.set(cacheKey,result);if(rateCache.size>HOME_SIM_RULES.cacheEntries)rateCache.delete(rateCache.keys().next().value!);return clone(result);
}
