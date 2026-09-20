/** Local editor drafts produce a command only when the player confirms. */
import { DECOR_BY_ID } from '../../../lib/chef/diner/collections';
import { EQUIPMENT_BY_ID, TRUCK_TIERS } from '../../../lib/chef/diner/content';
import { makeStation, makeTable, validateServiceLayout } from '../../../lib/chef/diner/geometry';
import { createHomeWorld } from '../../../lib/chef/diner/home-simulation';
import { homeSimulationConfig, truckStorage, validateDinerHomePlacement, type DinerCommand, type DinerState, type HomePlacement } from '../../../lib/chef/diner/progression';
import type { ServiceState } from '../../../lib/chef/diner/types';
import type { SceneObject, SceneTable } from './scene-types';

export interface PlacementDraft { mode:'home'|'truck'; id:string; equipmentId:string; x:number;y:number;rotation:0|1|2|3;existing:boolean;pinned:boolean }
export interface PlacementPreview { command:DinerCommand; error:string|null; object?:SceneObject; table?:SceneTable }
export function rotatePlacementDraft(draft:PlacementDraft):PlacementDraft {return {...draft,rotation:((draft.rotation+1)%4) as PlacementDraft['rotation']};}
export function movePlacementDraft(draft:PlacementDraft,x:number,y:number,pinned=draft.pinned):PlacementDraft {return {...draft,x,y,pinned};}
function serviceOf(state:DinerState):ServiceState|null{return state.run?.service??null;}
export function previewPlacement(state:DinerState,draft:PlacementDraft):PlacementPreview {
  const {id,equipmentId,x,y,rotation}=draft,capacity=equipmentId==='table_1'?1:equipmentId==='table_2'?2:equipmentId==='table_4'?4:null;
  if(draft.mode==='home'){
    const existing=state.home.layout.find(p=>p.id===id);
    const item:HomePlacement={...(existing??{}),id,equipmentId,x,y,rotation};
    const layout=draft.existing?state.home.layout.map(p=>p.id===id?item:p):[...state.home.layout,item];
    const error=draft.existing&&(!existing||existing.equipmentId!==equipmentId)?'This furnishing is no longer placed.':validateDinerHomePlacement(state,layout);
    const command:DinerCommand={type:'homeLayout',layout};
    if(capacity){
      // Home seating is selected by the real room simulation, including rotated single chairs.
      const table=createHomeWorld({...homeSimulationConfig(state),layout,chefs:0,waiters:0,arrivalRate:0}).tables.find(t=>t.id===id);
      // A single chair has an exact rotated anchor even when blocked. Larger home
      // tables choose reachable perimeter seats, so the truck's seat pattern would lie.
      const seats=table?.seats??(capacity===1?makeTable(id,x,y,1,1,rotation).seats:[]);
      return {command,error,table:{id,x,y,capacity,rotation,seats}};
    }
    const colors:Record<string,string>={cherry:'#b66751',mint:'#91b29a',cream:'#ede1bc'};
    return {command,error,object:{id,kind:equipmentId,x,y,rotation,tier:state.equipment[equipmentId]?.tier,footprint:(EQUIPMENT_BY_ID[equipmentId]??DECOR_BY_ID[equipmentId])?.footprint,color:item.skin?colors[item.skin]:undefined}};
  }
  const service=serviceOf(state),stations=(service?.stations??[]).filter(s=>s.id!==id),tables=(service?.tables??[]).filter(t=>t.id!==id);
  const tier=Math.min(3,state.equipment[equipmentId]?.tier??1) as 1|2|3;
  const table=capacity?makeTable(id,x,y,capacity,1,rotation):undefined;
  const object:SceneObject|undefined=capacity?undefined:{id,kind:equipmentId,x,y,rotation,tier,footprint:EQUIPMENT_BY_ID[equipmentId]?.footprint};
  if(table)tables.push(table);else stations.push(makeStation(id,equipmentId as ServiceState['stations'][number]['kind'],x,y,tier,rotation));
  const owned=draft.existing?service?.stations.some(s=>s.id===id&&s.kind===equipmentId)||service?.tables.some(t=>t.id===id&&t.capacity===capacity):truckStorage(state).some(item=>item.equipmentId===equipmentId&&item.available>0);
  const error=!service||service.phase!=='setup'?'Arrange your truck before opening.':!owned?'This furnishing is no longer available in the trailer.':validateServiceLayout(state.truckTier,stations,tables,{allowIncomplete:true});
  return {error,object,table,command:{type:'setupLayout',stations:stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing})),tables:tables.map(({id,x,y,capacity,rotation})=>({id,x,y,capacity,rotation}))}};
}
export function createPlacementDraft(state:DinerState,mode:PlacementDraft['mode'],equipmentId:string,id:string,existing=false):PlacementDraft {
  const service=serviceOf(state),old=mode==='home'?state.home.layout.find(p=>p.id===id):service?.stations.find(s=>s.id===id)??service?.tables.find(t=>t.id===id);
  const draft:PlacementDraft={mode,id,equipmentId,x:old?.x??0,y:old?.y??0,rotation:old?('facing'in old?old.facing:old.rotation??0):0,existing,pinned:false};
  if(existing)return draft;
  const dims=TRUCK_TIERS[state.truckTier],width=mode==='home'?state.home.w:Math.max(dims.w,dims.pavementW-1),height=mode==='home'?state.home.h:dims.h+dims.pavementH+1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const candidate={...draft,x,y};if(!previewPlacement(state,candidate).error)return candidate;}
  return draft;
}
