/** Free construction shares the same physical cells with validation and simulation. */
import type {Point} from './types';
import type {HomePlacement} from './progression';
import {EQUIPMENT_BY_ID} from './content';
import {DECOR_BY_ID} from './collections';
import {ROOM_FIXTURES,RESTAURANT_STAGES,roomModuleGeometry,roomTableSeats,validateRoomMount,type RoomPlan,type RoomRole,type RoomEdge} from './room-plan';
const key=(p:Point)=>`${p.x},${p.y}`;
const neighbors=(p:Point)=>[{x:p.x+1,y:p.y},{x:p.x-1,y:p.y},{x:p.x,y:p.y+1},{x:p.x,y:p.y-1}];
export const edgeKey=(a:Point,b:Point)=>[key(a),key(b)].sort().join('|');
const edgeCache=new WeakMap<RoomPlan,Map<string,RoomEdge>>();
function edges(plan:RoomPlan){let map=edgeCache.get(plan);if(!map){map=new Map(plan.edges.map(e=>[edgeKey(e.a,e.b),e]));edgeCache.set(plan,map);}return map;}
export function plotInside(plan:RoomPlan,p:Point){return !!p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<plan.w&&p.y<plan.h;}
export function restaurantEntrance(plan?:RoomPlan):Point|undefined{return plan?.version===2?plan.entrances?.[0]?.at:undefined;}
export function freeRoomCanStep(plan:RoomPlan,from:Point,to:Point,role:RoomRole):boolean{
 const edge=edges(plan).get(edgeKey(from,to));
 return !edge||edge.kind==='door'||edge.kind==='staff_gate'&&role!=='customer';
}
const size=(p:HomePlacement)=>{const d=EQUIPMENT_BY_ID[p.equipmentId]??DECOR_BY_ID[p.equipmentId];return !d?[0,0]:p.rotation%2?[d.footprint[1],d.footprint[0]]:d.footprint;};
export function furnitureCells(p:HomePlacement):Point[]{if(p.mount)return [];const [w,h]=size(p);return Array.from({length:w*h},(_,i)=>({x:p.x+i%w,y:p.y+Math.floor(i/w)}));}
export function freeRoomSeats(plan:RoomPlan,p:HomePlacement):Point[]{
 const saved=plan.seating?.[p.id]?.chairs;
 if(saved){const d=EQUIPMENT_BY_ID[p.equipmentId],[w,h]=d.footprint;return saved.map(q=>p.rotation===0?{x:p.x+q.x,y:p.y+q.y}:p.rotation===1?{x:p.x+h-1-q.y,y:p.y+q.x}:p.rotation===2?{x:p.x+w-1-q.x,y:p.y+h-1-q.y}:{x:p.x+q.y,y:p.y+w-1-q.x});}
 return roomTableSeats(p,q=>!furnitureCells(p).some(c=>key(q)===key(c)));
}
export function compileRestaurantPlan(plan:RoomPlan,layout:readonly HomePlacement[]){
 const solid=new Set<string>(),occupied=new Set<string>(),mats=new Set<string>(),seats=new Map<string,Point[]>(),errors:Array<{targetId:string;message:string;cells:Point[]}>=[];
 const add=(id:string,cells:Point[],blocks=true,mat=false)=>{for(const p of cells){if(!plotInside(plan,p))errors.push({targetId:id,message:'Keep this piece within your plot.',cells:[p]});const layer=mat?mats:occupied;if(layer.has(key(p)))errors.push({targetId:id,message:'This piece overlaps another furnishing.',cells:[p]});layer.add(key(p));if(blocks)solid.add(key(p));}};
 for(const surface of plan.surfaces??[])if(surface.kind==='garden')solid.add(key(surface));
 for(const m of plan.modules){if(!ROOM_FIXTURES[m.kind])continue;const g=roomModuleGeometry(m);add(m.id,g.cells,ROOM_FIXTURES[m.kind].solid);if(g.seats.length)seats.set(m.id,g.seats);}
 for(const p of layout)if(!p.mount){const mat=DECOR_BY_ID[p.equipmentId]?.passable===true;add(p.id,furnitureCells(p),!mat,mat);if(['table_1','table_2','table_4','booth_2'].includes(p.equipmentId))seats.set(p.id,freeRoomSeats(plan,p));}
 const walkable=(p:Point)=>plotInside(plan,p)&&!solid.has(key(p));
 const path=(from:Point,to:Point,role:RoomRole='waiter',extra:ReadonlySet<string>=new Set()):Point[]|null=>{
  if(!walkable(from)||!walkable(to)||extra.has(key(to)))return null;const queue=[from],parents=new Map<string,Point|null>([[key(from),null]]);
  for(let i=0;i<queue.length;i++){const p=queue[i];if(key(p)===key(to)){const out:Point[]=[];let at:Point|null=p;while(at&&parents.get(key(at))){out.unshift(at);at=parents.get(key(at))!;}return out;}for(const q of neighbors(p))if(walkable(q)&&!extra.has(key(q))&&!parents.has(key(q))&&freeRoomCanStep(plan,p,q,role)){parents.set(key(q),p);queue.push(q);}}
  return null;
 };
 return {solid,seats,errors,walkable,path,entrances:(plan.entrances??[]).map(e=>e.at)};
}
export function migrateRoomPlan(plan:RoomPlan,layout:HomePlacement[]):RoomPlan{
 if(plan.version===2)return structuredClone(plan);
 const next:RoomPlan={...structuredClone(plan),version:2,legacyShell:true,surfaces:Array.from({length:plan.w*plan.h},(_,i)=>({x:i%plan.w,y:Math.floor(i/plan.w),kind:'indoor'})),entrances:[{id:'main-entry',at:{x:Math.floor(plan.w/2),y:plan.h-1},facing:0,awning:true}],seating:{}};
 const compiled=compileRestaurantPlan(next,layout),entry=next.entrances![0].at;
 // Preserve the original actual chair locations, expressed relative to the table.
 for(const p of layout)if(['table_1','table_2','table_4','booth_2'].includes(p.equipmentId)){
  const seats=roomTableSeats(p,q=>compiled.walkable(q)&&!plan.zones.some(z=>z.kind==='kitchen'&&q.x>=z.x&&q.x<z.x+z.w&&q.y>=z.y&&q.y<z.y+z.h)&&!!compiled.path(entry,q,'customer'));
  const [w,h]=EQUIPMENT_BY_ID[p.equipmentId].footprint;
  next.seating![p.id]={mode:'waiter',chairs:seats.map(q=>{const x=q.x-p.x,y=q.y-p.y;return p.rotation===0?{x,y}:p.rotation===1?{x:y,y:h-1-x}:p.rotation===2?{x:w-1-x,y:h-1-y}:{x:w-1-y,y:x};})};
 }
 for(const m of plan.modules)if(roomModuleGeometry(m).seats.length)next.seating![m.id]={mode:'waiter'};
 return next;
}
export function freeRoomStructureError(plan:RoomPlan):string|null {
 const id=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value);
 const point=(p:Point)=>!!p&&Number.isInteger(p.x)&&Number.isInteger(p.y);
 const spec=plan&&RESTAURANT_STAGES[plan.stage];if(!spec||plan.version!==2||plan.w!==spec.w||plan.h!==spec.h)return 'Keep this stage’s unlocked plot size.';
 if(plan.legacyShell!==undefined&&typeof plan.legacyShell!=='boolean')return 'Keep a valid building shell.';
 if(!Array.isArray(plan.zones)||plan.zones.length>40||plan.zones.some(z=>!z||!id(z.id)||!['kitchen','dining','bathroom'].includes(z.kind)||![z.x,z.y,z.w,z.h].every(Number.isInteger)||z.x<0||z.y<0||z.w<1||z.h<1||z.x+z.w>plan.w||z.y+z.h>plan.h))return 'Keep valid room area metadata.';
 if(!Array.isArray(plan.surfaces)||plan.surfaces.length!==plan.w*plan.h||plan.surfaces.some(s=>!plotInside(plan,s)||!['indoor','patio','garden'].includes(s.kind)||s.finish!==undefined&&(typeof s.finish!=='string'||s.finish.length>64))||new Set(plan.surfaces.map(key)).size!==plan.surfaces.length)return 'Choose a valid surface for every plot tile.';
 if(!Array.isArray(plan.modules)||plan.modules.length>80||!Array.isArray(plan.edges)||plan.edges.length>600||!Array.isArray(plan.entrances)||!plan.entrances.length||plan.entrances.length>8)return 'Keep a valid set of walls, fixtures and entrances.';
 const ids=new Set<string>(),pairs=new Set<string>();
 for(const edge of plan.edges){
  if(!edge||!id(edge.id)||ids.has(edge.id)||!point(edge.a)||!point(edge.b)||Math.abs(edge.a.x-edge.b.x)+Math.abs(edge.a.y-edge.b.y)!==1||!plotInside(plan,edge.a)&&!plotInside(plan,edge.b)||!['wall','half_wall','glass','screen','window','door','staff_gate','hatch'].includes(edge.kind)||pairs.has(edgeKey(edge.a,edge.b))||edge.height!==undefined&&(!Number.isFinite(edge.height)||edge.height<.4||edge.height>3.4)||edge.finish!==undefined&&(typeof edge.finish!=='string'||edge.finish.length>64))return 'A wall or opening is invalid.';
  ids.add(edge.id);pairs.add(edgeKey(edge.a,edge.b));
 }
 for(const m of plan.modules)if(!m||!id(m.id)||!Object.hasOwn(ROOM_FIXTURES,m.kind)||!plotInside(plan,m)||![0,1,2,3].includes(m.rotation)||m.width!==undefined&&(m.kind!=='display_counter'||![3,4].includes(m.width))||m.seatStyles!==undefined&&(!Array.isArray(m.seatStyles)||!['console','chef_bar'].includes(m.kind)||m.seatStyles.length>ROOM_FIXTURES[m.kind].capacity||m.seatStyles.some(s=>!['classic','diner'].includes(s))))return 'Choose valid owned fixtures.';
 if(plan.entrances.some(e=>!e||!id(e.id)||!plotInside(plan,e.at)||![0,1,2,3].includes(e.facing)||e.awning!==undefined&&typeof e.awning!=='boolean')||new Set(plan.modules.map(m=>m.id)).size!==plan.modules.length||new Set(plan.entrances.map(e=>e.id)).size!==plan.entrances.length)return 'Place each entrance on a clear plot tile.';
 if(!plan.seating||typeof plan.seating!=='object'||Array.isArray(plan.seating)||Object.keys(plan.seating).length>plan.w*plan.h||Object.entries(plan.seating).some(([name,s])=>!id(name)||!s||!['waiter','pickup','chef'].includes(s.mode)||s.pointId!==undefined&&!id(s.pointId)||s.chairs!==undefined&&(!Array.isArray(s.chairs)||s.chairs.length>4||s.chairs.some(p=>!point(p)||Math.abs(p.x)>4||Math.abs(p.y)>4))))return 'Choose valid seating arrangements.';
 return null;
}
export interface RoomLayoutProblem {message:string;targetId?:string;cells?:Point[]}
/** The editor and authoritative validator describe the same first blocking problem. */
export function freeRoomProblem(plan:RoomPlan,layout:HomePlacement[]):RoomLayoutProblem|null {
 edgeCache.delete(plan);
 const problem=(message:string,targetId?:string,cells?:Point[]):RoomLayoutProblem=>({message,targetId,cells});
 const basic=freeRoomStructureError(plan);if(basic)return problem(basic);
 const c=compileRestaurantPlan(plan,layout);
 if(c.errors.length){const first=c.errors[0];return problem(first.message,first.targetId,first.cells);}
 const entry=plan.entrances![0].at;
 for(const e of plan.entrances!)if(!c.walkable(e.at))return problem('Keep every entrance clear.','entrance:'+e.id,[e.at]);
 const exits=(plan.surfaces??[]).filter(p=>c.walkable(p)&&neighbors(p).some(q=>!plotInside(plan,q)&&freeRoomCanStep(plan,p,q,'customer')));
 for(const e of plan.entrances!)if(!exits.some(exit=>c.path(e.at,exit,'customer')))return problem('Connect each entrance to the outside with a clear public path and a door.','entrance:'+e.id,[e.at]);
 const chairs=new Set<string>();
 const seatTarget=(id:string,i:number)=>layout.some(p=>p.id===id&&p.equipmentId!=='booth_2')?'chair:'+id+':'+i:id;
 for(const p of layout)if(c.seats.has(p.id)){
  const seats=c.seats.get(p.id)!,capacity=p.equipmentId==='table_1'?1:p.equipmentId==='table_4'?4:2;
  if(seats.length!==capacity)return problem('Keep this table’s included chairs, each in its own position.',p.id,furnitureCells(p));
  const index=seats.findIndex(seat=>!furnitureCells(p).some(cell=>Math.abs(cell.x-seat.x)+Math.abs(cell.y-seat.y)===1));
  if(index!==-1)return problem('Keep each chair beside its own table.',seatTarget(p.id,index),[seats[index]]);
 }
 for(const [id,seats] of c.seats){
  if(!seats.length)return problem('Give this table a usable chair.',id);
  for(const [i,seat] of seats.entries()){
   if(!c.walkable(seat)||chairs.has(key(seat))||!c.path(entry,seat,'customer'))return problem('Keep each chair clear and reachable.',seatTarget(id,i),[seat]);
   chairs.add(key(seat));
  }
 }
 for(const [id,seats] of c.seats){
  const spec=plan.seating![id];
  if(spec?.mode==='pickup'){
   const counter=plan.modules.find(m=>m.id===spec.pointId&&['display_counter','service_hatch','internal_pass'].includes(m.kind));
   if(!counter)return problem('Connect pickup seating to a serving counter.',id);
   const front=roomModuleGeometry(counter).front;
   if(!c.path(entry,front,'customer',chairs))return problem('Let guests reach the front of their pickup counter.',counter.id,[front]);
  }
  if(spec?.mode==='chef'&&!plan.modules.some(m=>m.id===id&&m.kind==='chef_bar'))return problem('Use chef-side service on a chef counter.',id);
  for(const [i,seat] of seats.entries())if(!neighbors(seat).some(q=>c.walkable(q)&&!chairs.has(key(q))&&c.path(entry,q,'customer',chairs)&&freeRoomCanStep(plan,q,seat,'customer')))return problem('Leave a public aisle to each chair.',seatTarget(id,i),[seat]);
 }
 for(const p of layout){
  if(p.mount){const error=validateRoomMount(plan,p,layout);if(error)return problem(error,p.id,[p]);continue;}
  const def=EQUIPMENT_BY_ID[p.equipmentId];
  if(!def){if(!DECOR_BY_ID[p.equipmentId])return problem('Choose a known furnishing.',p.id,[p]);continue;}
  if(c.seats.has(p.id))continue;
  const [w,h]=size(p),front=p.rotation===0?{x:p.x,y:p.y+h}:p.rotation===1?{x:p.x-1,y:p.y}:p.rotation===2?{x:p.x,y:p.y-1}:{x:p.x+w,y:p.y};
  if(!c.path(entry,front,'waiter',chairs))return problem('Leave a clear working side for this equipment.',p.id,[front]);
 }
 for(const m of plan.modules){
  const g=roomModuleGeometry(m);
  if(plan.seating?.[m.id]?.mode==='chef'&&g.servicePoints.some(p=>!c.path(entry,p,'chef',chairs)))return problem('Leave the chef side of this counter clear.',m.id,g.servicePoints);
  if(['toilet','handwash_sink'].includes(m.kind)&&!c.path(entry,g.front,'customer',chairs))return problem('Leave a path to this bathroom fixture.',m.id,[g.front]);
  if(['display_counter','internal_pass','service_hatch'].includes(m.kind)&&(!c.path(entry,g.front,'waiter',chairs)||!c.path(entry,g.back,'chef',chairs)))return problem('Keep both sides of this serving counter reachable.',m.id,[g.front,g.back]);
 }
 return null;
}
export function validateFreeRoomPlan(plan:RoomPlan,layout:HomePlacement[]):string|null{return freeRoomProblem(plan,layout)?.message??null;}

/** Privacy follows the actual enclosure. Doors close it; glass and low dividers do not. */
const privacyCache=new WeakMap<RoomPlan,Map<string,boolean>>();
export function privateRestroom(plan:RoomPlan,at:Point):boolean {
 let cache=privacyCache.get(plan);if(!cache){cache=new Map();privacyCache.set(plan,cache);}const cached=cache.get(key(at));if(cached!==undefined)return cached;
 const queue=[at],seen=new Set([key(at)]),entrances=new Set((plan.entrances??[]).map(e=>key(e.at)));let door=false,privateRoom=true;
 for(let i=0;i<queue.length&&privateRoom;i++){
  const p=queue[i];if(entrances.has(key(p))){privateRoom=false;break;}
  for(const q of neighbors(p)){
   const edge=edges(plan).get(edgeKey(p,q));
   if(edge?.kind==='door'){door=true;continue;}
   if(edge&&['wall','screen'].includes(edge.kind)&&(edge.height??2.4)>=1.8)continue;
   if(!plotInside(plan,q)){if(!plan.legacyShell)privateRoom=false;continue;}
   if(!seen.has(key(q))){seen.add(key(q));queue.push(q);}
  }
 }
 const result=privateRoom&&door;cache.set(key(at),result);return result;
}
