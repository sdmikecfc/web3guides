import {moveRoomChair,moveRoomEntrance} from '@/lib/chef/diner/room-construction';
import { alignRoomMounts, bathroomBays, moveRoomModule, moveRoomZone, moveRoomZoneLayout, validateRoomPlan, type RoomPlan, type RoomModuleKind } from '../../../lib/chef/diner/room-plan';
import { validateDinerHomePlacement, type DinerState, type HomePlacement } from '../../../lib/chef/diner/progression';
import {roomDesignAssetError,quoteRoomPurchases,type RoomDesign} from '../../../lib/chef/diner/room-building-draft';
import {roomModuleGeometry,ROOM_FIXTURES} from '@/lib/chef/diner/room-plan';
import {furnitureCells,compileRestaurantPlan,freeRoomProblem,plotInside,type RoomLayoutProblem} from '@/lib/chef/diner/room-plan-v2';
import {EQUIPMENT_BY_ID} from '@/lib/chef/diner/content';
import {DECOR_BY_ID} from '@/lib/chef/diner/collections';
import {roomChairSelection} from './room-selection';
export interface RoomDraft extends RoomDesign {}
export const roomFixtureLabel=(kind:RoomModuleKind)=>kind==='console'?'Dining counter · 3 stool spaces':kind==='chef_bar'?'Chef counter · 6 stool spaces':ROOM_FIXTURES[kind].name;
export function roomPieceLabel(draft:RoomDraft,id:string):string {
 const chair=roomChairSelection(id);if(chair)return `Chair ${chair.index+1} · ${roomPieceLabel(draft,chair.tableId)}`;
 const module=draft.roomPlan.modules.find(m=>m.id===id);if(module)return roomFixtureLabel(module.kind);
 const item=draft.layout.find(p=>p.id===id);if(item)return EQUIPMENT_BY_ID[item.equipmentId]?.name??DECOR_BY_ID[item.equipmentId]?.name??'Furnishing';
 if(id.startsWith('entrance:'))return 'Entrance';
 const edge=draft.roomPlan.edges.find(e=>`edge:${e.id}`===id);return edge?edge.kind.replace('_',' '):'This piece';
}
/** Transform full footprints; mounted ornaments follow their stable support. */
export function transformRoomGroup(draft:RoomDraft,ids:string[],dx:number,dy:number,turn=false):RoomDraft {
 const next=structuredClone(draft),selected=new Set(ids),roots=[...next.roomPlan.modules.filter(m=>selected.has(m.id)),...next.layout.filter(p=>selected.has(p.id)&&!p.mount)],cells=roots.flatMap(p=>'equipmentId'in p?furnitureCells(p):roomModuleGeometry(p).cells);
 if(!cells.length)return next;
 const minX=Math.min(...cells.map(p=>p.x)),minY=Math.min(...cells.map(p=>p.y)),maxY=Math.max(...cells.map(p=>p.y))+1;
 for(const p of roots){if(turn){const own='equipmentId'in p?furnitureCells(p):roomModuleGeometry(p).cells,height=Math.max(...own.map(p=>p.y))-p.y+1,x=p.x;p.x=minX+maxY-p.y-height;p.y=minY+x-minX;p.rotation=((p.rotation+1)%4) as 0|1|2|3;}else {p.x+=dx;p.y+=dy;}}
 next.layout=alignRoomMounts(next.layout,next.roomPlan);return next;
}
export function moveRoomDraft(draft:RoomDraft,selected:string|null,x:number,y:number):RoomDraft {
 if(!selected||!Number.isInteger(x)||!Number.isInteger(y))return structuredClone(draft);
 if(draft.roomPlan.version===2){
  const next=structuredClone(draft),entry=next.roomPlan.entrances?.find(e=>`entrance:${e.id}`===selected),item=next.layout.find(p=>p.id===selected);
  if(entry)return moveRoomEntrance(draft,entry.id,{x,y});
  const chair=roomChairSelection(selected);if(chair)return moveRoomChair(draft,chair.tableId,chair.index,{x,y});
  if(item){if(!item.mount){item.x=x;item.y=y;next.layout=alignRoomMounts(next.layout,next.roomPlan);}return next;}
 }
 if(selected.startsWith('zone:')){const zoneId=selected.slice(5),roomPlan=moveRoomZone(draft.roomPlan,zoneId,x,y);return {roomPlan,layout:moveRoomZoneLayout(draft.layout,draft.roomPlan,zoneId,x,y)};}
 const module=draft.roomPlan.modules.find(m=>m.id===selected);if(!module)return structuredClone(draft);const roomPlan=moveRoomModule(draft.roomPlan,selected,x,y,module.rotation);return {...draft,roomPlan,layout:alignRoomMounts(draft.layout,roomPlan)};
}
export function rotateRoomDraft(draft:RoomDraft,selected:string|null):RoomDraft {
 if(draft.roomPlan.version===2){const next=structuredClone(draft),entry=next.roomPlan.entrances?.find(e=>`entrance:${e.id}`===selected),item=next.layout.find(p=>p.id===selected);if(entry)return moveRoomEntrance(draft,entry.id,entry.at,((entry.facing+1)%4) as 0|1|2|3);if(item){item.rotation=((item.rotation+1)%4) as 0|1|2|3;next.layout=alignRoomMounts(next.layout,next.roomPlan);return next;}}
 const module=draft.roomPlan.modules.find(m=>m.id===selected);if(!module)return structuredClone(draft);const roomPlan=moveRoomModule(draft.roomPlan,module.id,module.x,module.y,((module.rotation+1)%4) as 0|1|2|3);return {...draft,roomPlan,layout:alignRoomMounts(draft.layout,roomPlan)};
}
export function addStoredRoomFixture(draft:RoomDraft,id:string,kind:RoomModuleKind,condition=100,width?:number):RoomDraft {
 const next=structuredClone(draft);if(next.roomPlan.modules.some(m=>m.id===id))return next;
 const bays=bathroomBays(next.roomPlan),rotation=kind==='handwash_sink'?2:0,candidates=kind==='toilet'?bays.toilets:kind==='handwash_sink'?bays.sinks:[];
 for(let y=0;y<next.roomPlan.h;y++)for(let x=0;x<next.roomPlan.w;x++)candidates.push({x,y});
 const extras={...(width===undefined?{}:{width}),...(['console','chef_bar'].includes(kind)?{seatStyles:[]}:{} )};
 const c=next.roomPlan.version===2?compileRestaurantPlan(next.roomPlan,next.layout):null;
 const occupied=new Set([...next.roomPlan.modules.flatMap(m=>roomModuleGeometry(m).cells),...next.layout.flatMap(furnitureCells),...(c?[...c.seats.values()].flat():[])].map(p=>`${p.x},${p.y}`));
 let best:typeof next.roomPlan.modules[number]|null=null,bestScore=Infinity;
 for(const turn of [rotation,(rotation+1)%4,(rotation+2)%4,(rotation+3)%4] as (0|1|2|3)[])for(const point of candidates){
  const module={id,kind,...point,rotation:turn,condition,...extras},g=roomModuleGeometry(module);
  const score=g.cells.reduce((n,p)=>n+(!plotInside(next.roomPlan,p)?10000:occupied.has(`${p.x},${p.y}`)?1000:0)+(next.roomPlan.entrances?.some(e=>e.at.x===p.x&&e.at.y===p.y)?1000:0),0)+Math.hypot(point.x-next.roomPlan.w/2,point.y-next.roomPlan.h/2);
  if(score<bestScore){best=module;bestScore=score;}
  // Check every facing before giving up; a blocked current draft still gets a visible, low-overlap preview.
  if(score>=1000)continue;
  const candidate={...next.roomPlan,modules:[...next.roomPlan.modules,module]};
  if(!validateRoomPlan(candidate,next.layout)){next.roomPlan=candidate;return next;}
 }
 next.roomPlan.modules.push(best??{id,kind,x:0,y:0,rotation:rotation as 0|2,condition,...extras});return next;
}
export function roomDraftProblem(state:DinerState,draft:RoomDraft):RoomLayoutProblem|null {
 if(draft.roomPlan.stage!==state.home.roomPlan?.stage)return {message:'Renovate before changing restaurant stage.'};
 if(draft.roomPlan.version===2){const error=roomDesignAssetError(state,draft);if(error)return {message:error};}
 state=quoteRoomPurchases(state,draft).owned;
 for(const module of draft.roomPlan.modules){const owned=state.home.fixtureInventory?.[module.id];if(!owned||owned.kind!==module.kind)return {message:'Choose a fixture you own.',targetId:module.id};}
 const candidate={...state,home:{...state.home,w:draft.roomPlan.w,h:draft.roomPlan.h,roomPlan:draft.roomPlan,layout:draft.layout}};
 if(draft.roomPlan.version===2){const problem=freeRoomProblem(draft.roomPlan,draft.layout);if(problem)return problem;}
 const error=(draft.roomPlan.version===2?null:validateRoomPlan(draft.roomPlan,draft.layout))??validateDinerHomePlacement(candidate,draft.layout);return error?{message:error}:null;
}
export function validateRoomDraft(state:DinerState,draft:RoomDraft):string|null{return roomDraftProblem(state,draft)?.message??null;}
