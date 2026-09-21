import type { Point } from './types';
import type { HomePlacement } from './progression';
import { EQUIPMENT_BY_ID } from './content';
import { DECOR_BY_ID } from './collections';

export type RestaurantStage = 'burger_shop' | 'diner' | 'restaurant';
export type RoomRole = 'chef' | 'waiter' | 'cashier' | 'customer';
export type RoomModuleKind = 'display_counter' | 'lift_gate' | 'service_hatch' | 'internal_pass' | 'console' | 'chef_bar' | 'toilet' | 'handwash_sink';
export type RoomModule = Point & { id:string;kind:RoomModuleKind;rotation:0|1|2|3;condition?:number };
export type RoomEdge = { id:string;a:Point;b:Point;kind:'wall'|'staff_gate'|'door'|'hatch';zoneId?:string };
export type RoomZone = { id:string;kind:'kitchen'|'dining'|'bathroom';x:number;y:number;w:number;h:number };
export type RoomPlan = { version:1;stage:RestaurantStage;w:number;h:number;modules:RoomModule[];edges:RoomEdge[];zones:RoomZone[] };
export const ROOM_RULES = { version:1,orderTicks:40,toiletTicks:80,handwashTicks:40,toiletWear:.5,handwashWear:.25,minimumCondition:20,bathroomEvery:3,bathroomWaitTicks:300,tipRate:.12 } as const;
export const RESTAURANT_STAGES = { burger_shop:{w:10,h:8,bathroomBays:2},diner:{w:12,h:10,bathroomBays:3},restaurant:{w:14,h:12,bathroomBays:4} } as const;
export const ROOM_FIXTURES:Record<RoomModuleKind,{name:string;footprint:[number,number];solid:boolean;capacity:number}> = {
 display_counter:{name:'Display counter',footprint:[3,1],solid:true,capacity:2},lift_gate:{name:'Staff lift gate',footprint:[1,1],solid:false,capacity:0},service_hatch:{name:'Serving hatch',footprint:[1,1],solid:true,capacity:2},internal_pass:{name:'Kitchen pass',footprint:[2,1],solid:true,capacity:3},console:{name:'Wall console with three stools',footprint:[3,1],solid:true,capacity:3},chef_bar:{name:'Chef bar with six stools',footprint:[6,1],solid:true,capacity:6},toilet:{name:'Toilet',footprint:[1,1],solid:true,capacity:1},handwash_sink:{name:'Handwashing sink',footprint:[1,1],solid:true,capacity:1},
};
const key=(p:Point)=>`${p.x},${p.y}`;
const navigationCache=new WeakMap<RoomPlan,{zones:(RoomZone|undefined)[];edges:Map<string,RoomEdge['kind']>}>();
function navigation(plan:RoomPlan){let cached=navigationCache.get(plan);if(cached)return cached;const zones=Array.from({length:plan.w*plan.h},(_,i)=>{const x=i%plan.w,y=Math.floor(i/plan.w);return plan.zones.find(z=>z.kind==='kitchen'&&x>=z.x&&x<z.x+z.w&&y>=z.y&&y<z.y+z.h)??plan.zones.find(z=>z.kind==='bathroom'&&x>=z.x&&x<z.x+z.w&&y>=z.y&&y<z.y+z.h);}),edges=new Map<string,RoomEdge['kind']>();for(const e of plan.edges){edges.set(`${e.a.x},${e.a.y}>${e.b.x},${e.b.y}`,e.kind);edges.set(`${e.b.x},${e.b.y}>${e.a.x},${e.a.y}`,e.kind);}cached={zones,edges};navigationCache.set(plan,cached);return cached;}
export function roomModuleGeometry(module:RoomModule):{cells:Point[];front:Point;back:Point;orderFront:Point;orderBack:Point;seats:Point[];servicePoints:Point[]} {
 const [width,height]=ROOM_FIXTURES[module.kind].footprint;
 const turn=(x:number,y:number):Point=>module.rotation===0?{x:module.x+x,y:module.y+y}:module.rotation===1?{x:module.x+height-1-y,y:module.y+x}:module.rotation===2?{x:module.x+width-1-x,y:module.y+height-1-y}:{x:module.x+y,y:module.y+width-1-x};
 const cells=Array.from({length:width*height},(_,i)=>turn(i%width,Math.floor(i/width))),seating=module.kind==='console'||module.kind==='chef_bar';
 return {cells,front:turn(Math.floor(width/2),height),back:turn(Math.floor(width/2),-1),orderFront:turn(0,height),orderBack:turn(0,-1),seats:seating?Array.from({length:width},(_,i)=>turn(i,height)):[],servicePoints:seating?Array.from({length:width},(_,i)=>turn(i,module.kind==='console'?height+1:-1)):[]};
}
export function roomZoneAt(plan:RoomPlan,p:Point):RoomZone|undefined{return Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<plan.w&&p.y>=0&&p.y<plan.h?navigation(plan).zones[p.y*plan.w+p.x]:plan.zones.find(z=>p.x>=z.x&&p.x<z.x+z.w&&p.y>=z.y&&p.y<z.y+z.h&&z.kind!=='dining');}
export function roomCanStep(plan:RoomPlan|undefined,from:Point,to:Point,role:RoomRole='waiter'):boolean {
 if(!plan)return true;const zone=roomZoneAt(plan,to);if(role==='customer'&&zone?.kind==='kitchen')return false;if(role!=='customer'&&zone?.kind==='bathroom')return false;
 const edge=navigation(plan).edges.get(`${from.x},${from.y}>${to.x},${to.y}`);
 return !edge||edge==='door'||(edge==='staff_gate'&&role!=='customer');
}
export function bathroomBays(plan:Pick<RoomPlan,'stage'|'w'>&Partial<Pick<RoomPlan,'zones'>>):{toilets:Point[];sinks:Point[]} {
 const count=RESTAURANT_STAGES[plan.stage].bathroomBays,zone=plan.zones?.find(z=>z.kind==='bathroom'),start=zone?zone.x+1:plan.w-count,y=zone?.y??0;
 return {toilets:Array.from({length:count},(_,i)=>({x:start+i,y})),sinks:Array.from({length:count},(_,i)=>({x:start+i,y:y+3}))};
}
export function createRestaurantBlueprint(stage:RestaurantStage):{roomPlan:RoomPlan;layout:HomePlacement[];staff:{chefs:number;waiters:number;cashiers:number}} {
 const spec=RESTAURANT_STAGES[stage],kitchenWidth=stage==='burger_shop'?5:stage==='diner'?8:9,bathX=spec.w-spec.bathroomBays-1;
 const modules:RoomModule[]=[{id:'staff-gate',kind:'lift_gate',x:kitchenWidth-1,y:3,rotation:0},{id:'service-counter',kind:stage==='burger_shop'?'display_counter':stage==='diner'?'service_hatch':'internal_pass',x:stage==='burger_shop'?1:stage==='diner'?6:3,y:stage==='restaurant'?2:3,rotation:0}];
 if(stage==='burger_shop')modules.push({id:'starter-console',kind:'console',x:0,y:5,rotation:3});
 if(stage==='diner')modules.push({id:'diner-bar',kind:'chef_bar',x:0,y:4,rotation:0});
 const bays=bathroomBays({stage,w:spec.w});modules.push({id:'toilet-1',kind:'toilet',...bays.toilets[0],rotation:0,condition:100},{id:'handwash-1',kind:'handwash_sink',...bays.sinks[0],rotation:2,condition:100});
 const edges:RoomEdge[]=[];
 for(let x=0;x<kitchenWidth;x++)edges.push({id:`kitchen-${x}`,a:{x,y:3},b:{x,y:4},kind:x===kitchenWidth-1?'staff_gate':stage==='burger_shop'&&x>=1&&x<=3||stage==='diner'&&x===6?'hatch':'wall',zoneId:'kitchen'});
 for(let y=0;y<4;y++)edges.push({id:`kitchen-side-${y}`,a:{x:kitchenWidth-1,y},b:{x:kitchenWidth,y},kind:'wall',zoneId:'kitchen'});
 // The bathroom opens into the dining room through a clear side aisle. Each
 // reserved bay remains an editable floor location, not an invisible fixture.
 for(let x=bathX;x<spec.w;x++)edges.push({id:`bath-front-${x}`,a:{x,y:3},b:{x,y:4},kind:x===bathX?'door':'wall',zoneId:'bathroom'});
 for(let y=0;y<4;y++)if(bathX>kitchenWidth)edges.push({id:`bath-side-${y}`,a:{x:bathX-1,y},b:{x:bathX,y},kind:'wall',zoneId:'bathroom'});
 for(const [i,p] of bays.toilets.entries()){edges.push({id:`stall-door-${i}`,a:{x:p.x,y:1},b:{x:p.x,y:2},kind:'door',zoneId:'bathroom'});for(const y of [0,1])edges.push({id:`stall-side-${i}-${y}`,a:{x:p.x-1,y},b:{x:p.x,y},kind:'wall',zoneId:'bathroom'});}
 const roomPlan:RoomPlan={version:1,stage,w:spec.w,h:spec.h,modules,edges,zones:[{id:'kitchen',kind:'kitchen',x:0,y:0,w:kitchenWidth,h:4},{id:'bathroom',kind:'bathroom',x:bathX,y:0,w:spec.w-bathX,h:4}]};
 const layout:HomePlacement[]=[{id:'home-grill',equipmentId:'grill',x:0,y:0,rotation:0},{id:'home-prep',equipmentId:'prep',x:2,y:0,rotation:0},{id:'home-sink',equipmentId:'sink',x:4,y:0,rotation:0}];
 if(stage==='diner')layout.push({id:'home-booth-1',equipmentId:'booth_2',x:2,y:7,rotation:0});
 if(stage==='restaurant')layout.push({id:'home-table-1',equipmentId:'table_2',x:2,y:6,rotation:0},{id:'home-table-2',equipmentId:'table_2',x:6,y:6,rotation:0},{id:'home-table-3',equipmentId:'table_2',x:10,y:6,rotation:0});
 return {roomPlan,layout,staff:{chefs:1,waiters:stage==='burger_shop'?1:2,cashiers:stage==='burger_shop'?1:0}};
}
function moduleEdges(module:RoomModule):{a:Point;b:Point}[]{const g=roomModuleGeometry(module),delta=module.rotation===0?{x:0,y:1}:module.rotation===1?{x:-1,y:0}:module.rotation===2?{x:0,y:-1}:{x:1,y:0};return g.cells.map(a=>({a,b:{x:a.x+delta.x,y:a.y+delta.y}})).filter(e=>!g.cells.some(p=>key(p)===key(e.b)));}
/** Pure editor draft. Validation belongs after rotation/translation, never before. */
export function moveRoomModule(plan:RoomPlan,id:string,x:number,y:number,rotation:0|1|2|3):RoomPlan {
 const next=structuredClone(plan),module=next.modules.find(m=>m.id===id);if(!module)return next;
 const opening=module.kind==='lift_gate'?'staff_gate':module.kind==='display_counter'||module.kind==='service_hatch'?'hatch':null,old=moduleEdges(module);
 if(opening)for(const edge of next.edges)if(edge.kind===opening&&old.some(e=>(key(e.a)===key(edge.a)&&key(e.b)===key(edge.b))||(key(e.a)===key(edge.b)&&key(e.b)===key(edge.a))))edge.kind='wall';
 module.x=x;module.y=y;module.rotation=rotation;
 if(opening)for(const [i,e] of moduleEdges(module).entries()){const existing=next.edges.find(edge=>(key(e.a)===key(edge.a)&&key(e.b)===key(edge.b))||(key(e.a)===key(edge.b)&&key(e.b)===key(edge.a)));if(existing)existing.kind=opening;else next.edges.push({id:`${id}-opening-${i}`,...e,kind:opening,zoneId:roomZoneAt(next,module)?.id});}
 return next;
}
const inZone=(z:RoomZone,p:Point)=>p.x>=z.x&&p.y>=z.y&&p.x<z.x+z.w&&p.y<z.y+z.h;
function closeZoneBoundaries(plan:RoomPlan):void {
 const inside=(p:Point)=>p.x>=0&&p.y>=0&&p.x<plan.w&&p.y<plan.h;
 for(const zone of plan.zones)if(zone.kind!=='dining')for(let y=zone.y;y<zone.y+zone.h;y++)for(let x=zone.x;x<zone.x+zone.w;x++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const a={x,y},b={x:x+dx,y:y+dy};if(inZone(zone,b)||!inside(a)||!inside(b)||plan.edges.some(e=>(key(e.a)===key(a)&&key(e.b)===key(b))||(key(e.a)===key(b)&&key(e.b)===key(a))))continue;plan.edges.push({id:`${zone.id}-boundary-${x}-${y}-${dx}-${dy}`,a,b,kind:'wall',zoneId:zone.id});}
}
export function moveRoomZone(plan:RoomPlan,zoneId:string,x:number,y:number):RoomPlan {
 const next=structuredClone(plan),zone=next.zones.find(z=>z.id===zoneId);if(!zone)return next;const old={...zone},dx=x-zone.x,dy=y-zone.y;
 for(const module of next.modules){const g=roomModuleGeometry(module);if(g.cells.some(p=>inZone(old,p))||(module.kind==='chef_bar'&&g.servicePoints.some(p=>inZone(old,p)))){module.x+=dx;module.y+=dy;}}
 for(const edge of next.edges)if(edge.zoneId===zoneId||(!edge.zoneId&&inZone(old,edge.a)&&inZone(old,edge.b))){edge.a.x+=dx;edge.a.y+=dy;edge.b.x+=dx;edge.b.y+=dy;}
 zone.x=x;zone.y=y;closeZoneBoundaries(next);return next;
}
export function moveRoomZoneLayout(layout:HomePlacement[],plan:RoomPlan,zoneId:string,x:number,y:number):HomePlacement[]{const zone=plan.zones.find(z=>z.id===zoneId);if(!zone)return structuredClone(layout);return alignRoomMounts(layout.map(p=>inZone(zone,p)?{...p,x:p.x+x-zone.x,y:p.y+y-zone.y}:structuredClone(p)),moveRoomZone(plan,zoneId,x,y));}
export function alignRoomMounts(layout:HomePlacement[],plan:RoomPlan):HomePlacement[]{return layout.map(p=>{const at=p.mount?resolveRoomMount(plan,p.mount):null;return at?{...p,x:Math.floor(at.x),y:Math.floor(at.y)}:structuredClone(p);});}
export function validateRoomMount(plan:RoomPlan,p:HomePlacement):string|null {
 const mount=p.mount;if(!mount)return null;const decor=DECOR_BY_ID[p.equipmentId];if(!decor||!Number.isInteger(mount.slot)||mount.slot<0)return 'Only suitable decorations can be mounted.';
 if(mount.kind==='wall')return decor.wall&&resolveRoomMount(plan,mount)?null:'Choose a clear solid wall for this decoration.';
 if(mount.kind==='counter')return decor.counter&&resolveRoomMount(plan,mount)?null:'Choose a free display spot away from the till and serving dishes.';
 return 'Choose a wall or counter mount.';
}
export function resolveRoomMount(plan:RoomPlan,mount:{kind:'wall'|'counter';targetId:string;slot:number}):{x:number;y:number;rotation:0|1|2|3;surfaceHeight:number}|null {
 if(!Number.isInteger(mount.slot)||mount.slot<0)return null;
 if(mount.kind==='wall'){
  if(mount.targetId==='outer-back')return mount.slot<plan.w?{x:mount.slot,y:-.55,rotation:0,surfaceHeight:1.5}:null;
  if(mount.targetId==='outer-side')return mount.slot<plan.h?{x:-.55,y:mount.slot,rotation:3,surfaceHeight:1.5}:null;
  const edge=plan.edges.find(e=>e.id===mount.targetId&&e.kind==='wall');return edge&&mount.slot===0?{x:(edge.a.x+edge.b.x)/2,y:(edge.a.y+edge.b.y)/2,rotation:edge.a.x===edge.b.x?0:1,surfaceHeight:1.5}:null;
 }
 const module=plan.modules.find(m=>m.id===mount.targetId);if(!module||!['display_counter','internal_pass','console','chef_bar'].includes(module.kind)||(['display_counter','internal_pass'].includes(module.kind)&&mount.slot===0))return null;
 const point=roomModuleGeometry(module).cells[mount.slot];if(!point)return null;
 // Along the top, between meal centers. Cross-depth offsets would overhang a
 // narrow wall console; the last pot still stays within its final half-cell.
 const delta=module.rotation===0?{x:.36,y:0}:module.rotation===1?{x:0,y:.36}:module.rotation===2?{x:-.36,y:0}:{x:0,y:-.36};
 return {x:point.x+delta.x,y:point.y+delta.y,rotation:module.rotation,surfaceHeight:module.kind==='internal_pass'?1.13:1.11};
}
/** One source for staged table chairs, used by both validation and simulation. */
export function roomTableSeats(p:HomePlacement,available:(point:Point)=>boolean):Point[] {
 const capacity=p.equipmentId==='table_1'?1:p.equipmentId==='table_2'||p.equipmentId==='booth_2'?2:p.equipmentId==='table_4'?4:0;if(!capacity)return [];
 // Booth benches belong to the furnishing. Unlike loose chairs they cannot
 // jump to a different side when somebody places an object next to them.
 if(p.equipmentId==='booth_2'){
  const turn=(x:number,y:number):Point=>p.rotation===0?{x:p.x+x,y:p.y+y}:p.rotation===1?{x:p.x+1-y,y:p.y+x}:p.rotation===2?{x:p.x-x,y:p.y+1-y}:{x:p.x+y,y:p.y-x};
  const seats=[turn(-1,0),turn(1,0)];return seats.every(available)?seats:[];
 }
 const def=EQUIPMENT_BY_ID[p.equipmentId],[width,height]=p.rotation%2?[def.footprint[1],def.footprint[0]]:def.footprint;
 const front=p.rotation===0?{x:p.x,y:p.y+height}:p.rotation===1?{x:p.x-1,y:p.y}:p.rotation===2?{x:p.x,y:p.y-1}:{x:p.x+width,y:p.y};if(capacity===1)return available(front)?[front]:[];
 const candidates:Point[]=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++)candidates.push({x:p.x+x-1,y:p.y+y},{x:p.x+x+1,y:p.y+y},{x:p.x+x,y:p.y+y-1},{x:p.x+x,y:p.y+y+1});
 const usable=candidates.filter((point,i)=>available(point)&&candidates.findIndex(other=>key(point)===key(other))===i).sort((a,b)=>a.y-b.y||a.x-b.x);
 return usable.length<capacity?[]:Array.from({length:capacity},(_,i)=>usable[Math.floor(i*usable.length/capacity)]);
}
export function validateRoomPlan(value:RoomPlan,layout:HomePlacement[]=[]):string|null {
 if(!value||value.version!==1||!Object.hasOwn(RESTAURANT_STAGES,value.stage))return 'Choose a known restaurant stage.';
 navigationCache.delete(value);
 const spec=RESTAURANT_STAGES[value.stage];if(value.w!==spec.w||value.h!==spec.h||!Array.isArray(value.modules)||value.modules.length>80||!Array.isArray(value.edges)||value.edges.length>180||!Array.isArray(value.zones)||value.zones.length>12)return 'The room plan dimensions or module count are invalid.';
 const inside=(p:Point)=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<value.w&&p.y<value.h,ids=new Set<string>(),solid=new Set<string>();
 for(const m of value.modules){if(!m||typeof m.id!=='string'||!m.id||ids.has(m.id)||!Object.hasOwn(ROOM_FIXTURES,m.kind)||![0,1,2,3].includes(m.rotation)||!inside(m)||(m.condition!==undefined&&(!Number.isFinite(m.condition)||m.condition<0||m.condition>100)))return 'A room module is invalid.';ids.add(m.id);for(const p of roomModuleGeometry(m).cells){if(!inside(p)||solid.has(key(p)))return 'Room modules overlap or leave the room.';if(ROOM_FIXTURES[m.kind].solid)solid.add(key(p));}}
 const edgeIds=new Set<string>(),edgePairs=new Set<string>();for(const e of value.edges){if(!e||typeof e.id!=='string'||edgeIds.has(e.id)||!inside(e.a)||!inside(e.b)||Math.abs(e.a.x-e.b.x)+Math.abs(e.a.y-e.b.y)!==1||!['wall','staff_gate','door','hatch'].includes(e.kind))return 'A wall or opening is invalid.';const pair=[key(e.a),key(e.b)].sort().join('|');if(edgePairs.has(pair))return 'Two walls occupy the same edge.';edgeIds.add(e.id);edgePairs.add(pair);}
 const zoneIds=new Set<string>();for(const z of value.zones){if(!z||typeof z.id!=='string'||zoneIds.has(z.id)||!['kitchen','dining','bathroom'].includes(z.kind)||!inside(z)||!Number.isInteger(z.w)||!Number.isInteger(z.h)||z.w<1||z.h<1||z.x+z.w>value.w||z.y+z.h>value.h)return 'A room zone is invalid.';zoneIds.add(z.id);}
 for(let i=0;i<value.zones.length;i++)for(let j=i+1;j<value.zones.length;j++){const a=value.zones[i],b=value.zones[j];if(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)return 'Room areas cannot overlap.';}
 const kitchens=value.zones.filter(z=>z.kind==='kitchen'),bathrooms=value.zones.filter(z=>z.kind==='bathroom');
 if(kitchens.length!==1||bathrooms.length!==1||bathrooms[0].w<spec.bathroomBays+1||bathrooms[0].h<4)return 'Keep one kitchen and the reserved bathroom area for this stage.';
 const requiredPass=value.stage==='burger_shop'?'display_counter':value.stage==='diner'?'service_hatch':'internal_pass';
 if(!value.modules.some(m=>m.kind===requiredPass)||!value.modules.some(m=>m.kind==='lift_gate')||(value.stage==='burger_shop'&&!value.modules.some(m=>m.kind==='console'))||(value.stage==='diner'&&!value.modules.some(m=>m.kind==='chef_bar')))return 'Keep this stage’s food handoff and staff lift gate.';
 const sameEdge=(a:{a:Point;b:Point},b:{a:Point;b:Point})=>(key(a.a)===key(b.a)&&key(a.b)===key(b.b))||(key(a.a)===key(b.b)&&key(a.b)===key(b.a));
 for(const m of value.modules)if(m.kind==='lift_gate'||m.kind==='display_counter'||m.kind==='service_hatch'){const kind=m.kind==='lift_gate'?'staff_gate':'hatch';if(moduleEdges(m).some(edge=>!value.edges.some(e=>e.kind===kind&&sameEdge(e,edge))))return 'Align the gate or serving opening with its room wall.';}
 for(const zone of [...kitchens,...bathrooms])for(let y=zone.y;y<zone.y+zone.h;y++)for(let x=zone.x;x<zone.x+zone.w;x++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const a={x,y},b={x:x+dx,y:y+dy};if(!inside(b)||inZone(zone,b))continue;const edge=value.edges.find(e=>sameEdge(e,{a,b}));if(!edge||(zone.kind==='kitchen'?edge.kind==='door':!['wall','door'].includes(edge.kind)))return 'Keep the kitchen and bathroom boundaries enclosed, with their proper openings.';}
 for(const m of value.modules)if(m.kind==='lift_gate'){const g=roomModuleGeometry(m),edge=moduleEdges(m)[0];if(roomZoneAt(value,g.back)?.kind!=='kitchen'||roomZoneAt(value,edge.b)?.kind==='kitchen'||roomZoneAt(value,edge.b)?.kind==='bathroom')return 'Place the lift gate between the kitchen and public floor.';}
 for(const edge of value.edges)if(edge.kind==='staff_gate'&&!value.modules.some(m=>m.kind==='lift_gate'&&moduleEdges(m).some(e=>sameEdge(e,edge))))return 'Every staff opening needs a visible lift gate.';
 const mounts=new Set<string>(),occupied=new Set(solid);for(const p of layout){if(p.mount){const error=validateRoomMount(value,p),resolved=resolveRoomMount(value,p.mount);if(error)return error;if(!resolved||p.x!==Math.floor(resolved.x)||p.y!==Math.floor(resolved.y))return 'Keep mounted decoration aligned with its support.';const slot=`${p.mount.kind}:${p.mount.targetId}:${p.mount.slot}`;if(mounts.has(slot))return 'This display spot already holds a decoration.';mounts.add(slot);continue;}const def=EQUIPMENT_BY_ID[p.equipmentId]??DECOR_BY_ID[p.equipmentId];if(!def)return 'Choose a known furnishing.';const [width,height]=p.rotation%2?[def.footprint[1],def.footprint[0]]:def.footprint;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const point={x:p.x+x,y:p.y+y};if(!inside(point)||occupied.has(key(point)))return 'Furniture overlaps a room module or another furnishing.';occupied.add(key(point));if(!DECOR_BY_ID[p.equipmentId]?.passable)solid.add(key(point));}}
 if(!value.modules.some(m=>['display_counter','service_hatch','internal_pass'].includes(m.kind)))return 'Add a food handoff counter.';
 const door={x:Math.floor(value.w/2),y:value.h-1};if(solid.has(key(door)))return 'Keep the restaurant entrance clear.';
 const chairs=new Set<string>();for(const m of value.modules)for(const seat of roomModuleGeometry(m).seats){if(!inside(seat)||solid.has(key(seat))||chairs.has(key(seat)))return 'Give each stool its own clear floor space.';chairs.add(key(seat));}
 const reach=(role:RoomRole,blockChairs:boolean)=>{const seen=new Set<string>([key(door)]),queue=[door];for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const q={x:queue[i].x+dx,y:queue[i].y+dy};if(inside(q)&&!solid.has(key(q))&&(!blockChairs||!chairs.has(key(q)))&&!seen.has(key(q))&&roomCanStep(value,queue[i],q,role)){seen.add(key(q));queue.push(q);}}return seen;};
 const publicFloor=reach('customer',false),tableSeats=new Map<string,Point[]>();
 for(const p of layout)if(['table_1','table_2','table_4','booth_2'].includes(p.equipmentId)){const seats=roomTableSeats(p,point=>publicFloor.has(key(point))&&!solid.has(key(point)));if(!seats.length)return p.equipmentId==='booth_2'?'Keep both fixed booth benches clear and reachable from the dining room.':'Keep every table chair reachable from the public dining room.';for(const seat of seats){if(chairs.has(key(seat))||key(seat)===key(door))return 'Give each chair its own clear floor space.';chairs.add(key(seat));}tableSeats.set(p.id,seats);}
 const staff=reach('waiter',true),publicAisles=reach('customer',true);
 for(const point of [...value.modules.flatMap(m=>roomModuleGeometry(m).seats),...tableSeats.values()].flat())if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const from={x:point.x+dx,y:point.y+dy};return publicAisles.has(key(from))&&roomCanStep(value,from,point,'customer');}))return 'Leave a public aisle to each chair without crossing another chair.';
 for(const p of layout)if(tableSeats.has(p.id)){const def=EQUIPMENT_BY_ID[p.equipmentId],[width,height]=p.rotation%2?[def.footprint[1],def.footprint[0]]:def.footprint;let service=false;for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(staff.has(key({x:p.x+x+dx,y:p.y+y+dy})))service=true;if(!service)return 'Leave a serving side beside every table.';}
 for(const m of value.modules){const g=roomModuleGeometry(m);if(m.kind==='toilet'||m.kind==='handwash_sink'){if(roomZoneAt(value,m)?.kind!=='bathroom'||roomZoneAt(value,g.front)?.kind!=='bathroom')return 'Place bathroom fixtures inside the bathroom area.';if(!publicFloor.has(key(g.front)))return 'Keep a public path to each bathroom fixture.';}if(['display_counter','service_hatch','internal_pass'].includes(m.kind)&&(!staff.has(key(g.front))||!staff.has(key(g.back))))return 'Keep both sides of the food handoff reachable.';if((m.kind==='display_counter'||m.kind==='service_hatch')&&(roomZoneAt(value,g.back)?.kind!=='kitchen'||roomZoneAt(value,g.front)?.kind==='kitchen'))return 'Place this counter between the kitchen and public floor.';if(m.kind==='display_counter'&&(!staff.has(key(g.orderBack))||!publicFloor.has(key(g.orderFront))))return 'Keep the cashier and ordering side reachable.';if(g.seats.some(p=>!publicFloor.has(key(p)))||g.servicePoints.some(p=>!staff.has(key(p))))return 'Keep every stool and its serving side reachable.';}
 for(const p of layout){if(p.mount||DECOR_BY_ID[p.equipmentId]||tableSeats.has(p.id))continue;const def=EQUIPMENT_BY_ID[p.equipmentId],[width,height]=p.rotation%2?[def.footprint[1],def.footprint[0]]:def.footprint,front=p.rotation===0?{x:p.x,y:p.y+height}:p.rotation===1?{x:p.x-1,y:p.y}:p.rotation===2?{x:p.x,y:p.y-1}:{x:p.x+width,y:p.y};if(!staff.has(key(front)))return 'Keep a staff route to each furnishing’s working side.';}
 return null;
}
