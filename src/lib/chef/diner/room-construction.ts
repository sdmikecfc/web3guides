import type {HomePlacement} from './progression';
import type {Point} from './types';
import {type RoomPlan,type RoomEdge,type RoomSurface,alignRoomMounts,roomModuleGeometry,roomMountAnchors} from './room-plan';
import {migrateRoomPlan,edgeKey,freeRoomSeats} from './room-plan-v2';
import {EQUIPMENT_BY_ID} from './content';

export type ConstructionTool='select'|'wall'|'half_wall'|'glass'|'screen'|'window'|'door'|'staff_gate'|'erase'|'indoor'|'patio'|'garden'|'entrance';
export type ConstructionDraft=import('./room-building-draft').RoomDesign;

/** The familiar cutaway becomes individual editable edges only when building. */
export function editableConstruction(draft:ConstructionDraft):ConstructionDraft {
 const next={...structuredClone(draft),roomPlan:migrateRoomPlan(draft.roomPlan,draft.layout)},p=next.roomPlan;
 if(!p.legacyShell)return next;
 const put=(id:string,a:Point,b:Point,height:number,kind:RoomEdge['kind']='wall')=>{if(!p.edges.some(e=>edgeKey(e.a,e.b)===edgeKey(a,b)))p.edges.push({id,a,b,kind,height});};
 for(let x=0;x<p.w;x++)put(`outer-back-${x}`,{x,y:0},{x,y:-1},2.78);
 for(let y=0;y<p.h;y++)put(`outer-side-${y}`,{x:0,y},{x:-1,y},2.4,y===p.h-3||y===p.h-6?'window':'wall');
 for(let y=4;y<p.h;y++)put(`outer-right-${y}`,{x:p.w-1,y},{x:p.w,y},1.03,'half_wall');
 for(let x=0;x<p.w;x++)put(`outer-front-${x}`,{x,y:p.h-1},{x,y:p.h},.7,x===p.entrances![0].at.x?'door':'half_wall');
 for(const edge of p.edges)edge.height??=edge.zoneId==='bathroom'?1.92:p.stage==='burger_shop'?1.11:2.5;
 p.legacyShell=false;
 // Old broad-wall mounts retain an explicit supporting segment.
 next.layout=next.layout.map(item=>{if(!item.mount?.targetId.startsWith('outer-'))return item;const side=item.mount.targetId==='outer-side',targetId=`${side?'outer-side':'outer-back'}-${item.mount.slot}`;return {...item,mount:{...item.mount,targetId,slot:0}};});
 next.layout=alignRoomMounts(next.layout,p);
 return next;
}
/** Endpoints are grid corners (0..w, 0..h), shared by pointer and touch input. */
export function drawRoomEdges(draft:ConstructionDraft,start:Point,end:Point,kind:RoomEdge['kind']|'erase'):ConstructionDraft {
 const next=editableConstruction(draft),p=next.roomPlan;
 if(![start.x,start.y,end.x,end.y].every(Number.isInteger)||start.x<0||start.y<0||end.x<0||end.y<0||start.x>p.w||end.x>p.w||start.y>p.h||end.y>p.h)return next;
 const horizontal=Math.abs(end.x-start.x)>=Math.abs(end.y-start.y),fixed=horizontal?start.y:start.x,min=Math.min(horizontal?start.x:start.y,horizontal?end.x:end.y),max=Math.max(horizontal?start.x:start.y,horizontal?end.x:end.y),removed=new Set<string>();
 for(let n=min;n<max;n++){
  const a=horizontal?{x:n,y:fixed-1}:{x:fixed-1,y:n},b=horizontal?{x:n,y:fixed}:{x:fixed,y:n},key=edgeKey(a,b),old=p.edges.find(e=>edgeKey(e.a,e.b)===key);
  p.edges=p.edges.filter(e=>edgeKey(e.a,e.b)!==key);
  if(old&&(kind==='erase'||kind!=='wall')){removed.add(old.id);if(p.appearance)delete p.appearance.pieces[old.id];}
  if(kind==='erase')continue;
  p.edges.push({id:old?.id??`build-${horizontal?'h':'v'}-${fixed}-${n}`,a,b,kind,height:kind==='half_wall'?1:2.4});
 }
 next.layout=next.layout.filter(item=>!roomMountAnchors(item,draft.roomPlan).some(m=>removed.has(m.targetId)));
 return next;
}
export function paintRoomFloor(draft:ConstructionDraft,start:Point,end:Point,kind:RoomSurface['kind'],finish?:string):ConstructionDraft {
 const next=editableConstruction(draft),p=next.roomPlan;
 p.surfaces=p.surfaces!.map(tile=>tile.x>=Math.min(start.x,end.x)&&tile.x<=Math.max(start.x,end.x)&&tile.y>=Math.min(start.y,end.y)&&tile.y<=Math.max(start.y,end.y)?{x:tile.x,y:tile.y,kind,...(finish?{finish}:{})}:tile);
 return next;
}
export function storeRoomPiece(draft:ConstructionDraft,id:string):ConstructionDraft {
 const next=structuredClone(draft);next.roomPlan.modules=next.roomPlan.modules.filter(m=>m.id!==id);next.roomPlan.edges=next.roomPlan.edges.filter(e=>e.id!==id);next.layout=next.layout.filter(p=>p.id!==id&&!roomMountAnchors(p,draft.roomPlan).some(m=>m.targetId===id));if(next.roomPlan.seating)delete next.roomPlan.seating[id];return next;
}
export function setRoomSeating(draft:ConstructionDraft,id:string,mode:'waiter'|'pickup'|'chef',pointId?:string):ConstructionDraft {
 const next={...structuredClone(draft),roomPlan:migrateRoomPlan(draft.roomPlan,draft.layout)},p=next.roomPlan,table=p.modules.find(m=>m.id===id)??next.layout.find(m=>m.id===id);
 if(!table)return next;
 const candidates=p.modules.filter(m=>['internal_pass','service_hatch','display_counter'].includes(m.kind)).sort((a,b)=>Math.hypot(a.x-table.x,a.y-table.y)-Math.hypot(b.x-table.x,b.y-table.y));
 p.seating![id]={...p.seating![id],mode,...(mode==='pickup'?{pointId:pointId??candidates[0]?.id}:{pointId:undefined})};return next;
}
export function roomServiceConnection(draft:ConstructionDraft,id:string):Point[] {
 const item=draft.layout.find(p=>p.id===id)??draft.roomPlan.modules.find(m=>m.id===id),target=draft.roomPlan.modules.find(m=>m.id===draft.roomPlan.seating?.[id]?.pointId);
 return item&&target?[item,roomModuleGeometry(target).front]:[];
}
export function moveRoomChair(draft:ConstructionDraft,id:string,index:number,to:Point):ConstructionDraft {
 const next=structuredClone(draft),p=next.layout.find(p=>p.id===id),plan=next.roomPlan;
 if(!p||plan.version!==2||!Number.isInteger(index))return next;
 const seats=freeRoomSeats(plan,p);if(!seats[index])return next;seats[index]=to;
 const [w,h]=EQUIPMENT_BY_ID[p.equipmentId].footprint;
 const chairs=seats.map(q=>{const x=q.x-p.x,y=q.y-p.y;return p.rotation===0?{x,y}:p.rotation===1?{x:y,y:h-1-x}:p.rotation===2?{x:w-1-x,y:h-1-y}:{x:w-1-y,y:x};});
 plan.seating??={};plan.seating[id]={...plan.seating[id],mode:plan.seating[id]?.mode??'waiter',chairs};return next;
}
/** An entrance also needs an opening; moving its sign alone cannot create a path. */
export function moveRoomEntrance(draft:ConstructionDraft,id:string,to:Point,facing?:0|1|2|3):ConstructionDraft {
 const next=editableConstruction(draft),p=next.roomPlan,entry=p.entrances?.find(e=>e.id===id);
 if(!entry||to.x<0||to.y<0||to.x>=p.w||to.y>=p.h)return next;
 entry.at={...to};entry.facing=facing??(to.y===0?2:to.x===0?3:to.x===p.w-1?1:to.y===p.h-1?0:entry.facing);
 const delta=entry.facing===0?{x:0,y:1}:entry.facing===1?{x:1,y:0}:entry.facing===2?{x:0,y:-1}:{x:-1,y:0};
 const outside={x:to.x+delta.x,y:to.y+delta.y};
 // A doorway can face a patio within the plot. Validation requires a public
 // route from it to the actual perimeter, so enclosed rooms cannot spawn guests.
 const edge=p.edges.find(e=>edgeKey(e.a,e.b)===edgeKey(to,outside));if(edge)edge.kind='door';else p.edges.push({id:`entrance-${id}-${to.x}-${to.y}`,a:{...to},b:outside,kind:'door',height:2.4});
 return next;
}
