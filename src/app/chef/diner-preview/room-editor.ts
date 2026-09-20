import { alignRoomMounts, bathroomBays, moveRoomModule, moveRoomZone, moveRoomZoneLayout, validateRoomPlan, type RoomPlan, type RoomModuleKind } from '../../../lib/chef/diner/room-plan';
import { validateDinerHomePlacement, type DinerState, type HomePlacement } from '../../../lib/chef/diner/progression';
export interface RoomDraft {roomPlan:RoomPlan;layout:HomePlacement[]}
export function moveRoomDraft(draft:RoomDraft,selected:string|null,x:number,y:number):RoomDraft {
 if(!selected||!Number.isInteger(x)||!Number.isInteger(y))return structuredClone(draft);
 if(selected.startsWith('zone:')){const zoneId=selected.slice(5),roomPlan=moveRoomZone(draft.roomPlan,zoneId,x,y);return {roomPlan,layout:moveRoomZoneLayout(draft.layout,draft.roomPlan,zoneId,x,y)};}
 const module=draft.roomPlan.modules.find(m=>m.id===selected);if(!module)return structuredClone(draft);const roomPlan=moveRoomModule(draft.roomPlan,selected,x,y,module.rotation);return {roomPlan,layout:alignRoomMounts(draft.layout,roomPlan)};
}
export function rotateRoomDraft(draft:RoomDraft,selected:string|null):RoomDraft {
 const module=draft.roomPlan.modules.find(m=>m.id===selected);if(!module)return structuredClone(draft);const roomPlan=moveRoomModule(draft.roomPlan,module.id,module.x,module.y,((module.rotation+1)%4) as 0|1|2|3);return {roomPlan,layout:alignRoomMounts(draft.layout,roomPlan)};
}
export function addStoredRoomFixture(draft:RoomDraft,id:string,kind:RoomModuleKind,condition=100):RoomDraft {
 const next=structuredClone(draft);if(next.roomPlan.modules.some(m=>m.id===id))return next;
 const bays=bathroomBays(next.roomPlan),rotation=kind==='handwash_sink'?2:0,candidates=kind==='toilet'?bays.toilets:kind==='handwash_sink'?bays.sinks:[];
 for(let y=0;y<next.roomPlan.h;y++)for(let x=0;x<next.roomPlan.w;x++)candidates.push({x,y});
 for(const point of candidates){const candidate={...next.roomPlan,modules:[...next.roomPlan.modules,{id,kind,...point,rotation:rotation as 0|2,condition}]};if(!validateRoomPlan(candidate,next.layout)){next.roomPlan=candidate;return next;}}
 next.roomPlan.modules.push({id,kind,x:0,y:0,rotation,condition});return next;
}
export function validateRoomDraft(state:DinerState,draft:RoomDraft):string|null {
 if(draft.roomPlan.stage!==state.home.roomPlan?.stage)return 'Renovate before changing restaurant stage.';
 for(const module of draft.roomPlan.modules){const owned=state.home.fixtureInventory?.[module.id];if(!owned||owned.kind!==module.kind)return 'Choose a fixture you own.';}
 const candidate={...state,home:{...state.home,w:draft.roomPlan.w,h:draft.roomPlan.h,roomPlan:draft.roomPlan,layout:draft.layout}};
 return validateRoomPlan(draft.roomPlan,draft.layout)??validateDinerHomePlacement(candidate,draft.layout);
}
