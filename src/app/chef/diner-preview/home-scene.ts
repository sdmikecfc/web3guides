import type { HomeWorld } from '../../../lib/chef/diner/home-simulation';
import { dailyIngredientParcel, homeIncidents, type DinerState } from '../../../lib/chef/diner/progression';
import { REGULARS, regularAvailable } from '../../../lib/chef/diner/collections';
import { homeSpatial } from '../../../lib/chef/diner/home-spatial';
import type { DinerSceneData, SceneFood, SceneObject, ScenePerson, SceneTable } from './scene-types';

/** Pure adapter: decorative context uses the terrace; simulated positions stay exact. */
export function homeScene(state:DinerState,world:HomeWorld|null,selectedId:string|null,paint:string):DinerSceneData {
  const objects:SceneObject[]=[],tables:SceneTable[]=[],space=homeSpatial(state.home.w,state.home.h);
  const plated=(item?:SceneFood|null):SceneFood|null=>item?{...item,mastery:state.recipes[item.recipeId]?.level??0}:null;
  for(const p of state.home.layout){
    if(p.equipmentId.startsWith('table_')){
      const table=world?.tables.find(t=>t.id===p.id);
      tables.push({id:p.id,x:p.x,y:p.y,capacity:p.equipmentId==='table_1'?1:p.equipmentId==='table_4'?4:2,rotation:p.rotation,seats:table?.seats.map(s=>({...s,item:plated(s.item)}))??[]});
    }else{
      const station=world?.stations.find(s=>s.id===p.id),slot=station?.slots.find(s=>s.item);
      const finish:Record<string,string>={cherry:'#b66751',mint:'#91b29a',cream:'#ede1bc'};
      objects.push({id:p.id,kind:p.equipmentId,x:p.x,y:p.y,rotation:p.rotation,tier:state.equipment[p.equipmentId]?.tier,food:plated(slot?.item),color:p.skin?finish[p.skin]:undefined,
        slots:station?.slots.map(s=>({food:plated(s.item),state:s.job?.ready?'ready':s.job?'working':'idle',progress:s.job?1-s.job.remaining/Math.max(1,s.job.total):0})),
        state:slot?.job?.ready?'ready':slot?.job?'working':'idle',progress:slot?.job?1-slot.job.remaining/Math.max(1,slot.job.total):0});
    }
  }
  objects.push({id:'home-till',kind:'till',...space.context.till},{id:'home-binder',kind:'book',...space.context.binder},{id:'home-collections',kind:'trophy',...space.context.collections});
  const parcel=dailyIngredientParcel(state);
  if(!parcel.claimed){const task=state.homeTask?.incidentId===parcel.id?state.homeTask:null;objects.push({id:parcel.sceneId,kind:'parcel',x:parcel.x,y:parcel.y,state:task?.phase==='working'?'working':'ready',progress:parcel.progressTicks/parcel.requiredTicks});}
  for(const incident of homeIncidents(state).filter(i=>i.availableAt<=state.updatedAt)){
    const task=state.homeTask?.incidentId===incident.id?state.homeTask:null;
    objects.push({id:incident.id,kind:incident.kind==='spill'?'spill':'parcel',x:incident.x,y:incident.y,state:task?.phase==='working'?'working':'ready',progress:task?task.progressTicks/incident.requiredTicks:0});
  }
  const people:ScenePerson[]=[...(world?.actors.map((a):ScenePerson=>{
    const working=(a.pose==='cook'||a.pose==='wash')&&a.task,station=working?world.stations.find(s=>s.id===working.stationId):undefined;
    const order=working?world.orders.find(o=>o.id===working.orderId):undefined,recipeId=order?.recipeId??(working?station?.slots[working.slotIndex]?.item?.recipeId:undefined);
    return {id:a.id,role:a.role,x:a.x,y:a.y,pose:a.pose,held:plated(a.held),target:a.path[0]??(station?{x:station.x,y:station.y}:a.pose==='idle'?space.door:undefined),work:station?{stationKind:station.kind,recipeId}:undefined};
  })??[]),...(world?.customers.map((c):ScenePerson=>({id:c.id,role:'customer',x:c.x,y:c.y,look:Number(c.id.replace(/\D/g,''))%8,pose:c.phase==='eating'?'eat':c.phase==='seated'?'sit':c.path.length?'walk':'idle',target:c.path[0],tableId:c.tableId,seatId:c.seatId,order:c.phase==='seated'?{recipeId:c.recipeId,patience:1}:null}))??[])];
  const regular=REGULARS.find(r=>regularAvailable(state,r.id)&&!state.daily.regularServed.includes(r.id)&&(state.daily.regularProgress[r.id]??0)>=1);
  if(regular)people.push({id:`regular:${regular.id}`,role:'customer',look:REGULARS.findIndex(r=>r.id===regular.id),...space.regular,pose:'cheer',target:{x:space.regular.x-1,y:space.regular.y+1}});
  return {width:state.home.w,height:state.home.h,homeTerraceDepth:space.terrace.h,sign:state.home.name,paint,selectedId,objects,tables,people,tick:world?.tick,floor:state.cosmetics.floor,wall:state.cosmetics.wall,wrap:state.cosmetics.wrap,uniform:state.cosmetics.uniform};
}
