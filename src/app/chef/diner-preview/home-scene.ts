import type { HomeWorld } from '../../../lib/chef/diner/home-simulation';
import { dailyIngredientParcel,homeIncidents,type DinerState } from '../../../lib/chef/diner/progression';
import { REGULARS,regularAvailable } from '../../../lib/chef/diner/collections';
import { homeSpatial,chooseHomeInteractionTile } from '../../../lib/chef/diner/home-spatial';
import { roomModuleGeometry } from '../../../lib/chef/diner/room-plan';
import { physicalHomeScene } from './physical-home-scene';
import type { DinerSceneData } from './scene-types';

/** Private interactive overlays are deliberately outside the public room adapter. */
export function homeScene(state:DinerState,world:HomeWorld|null,selectedId:string|null,paint:string):DinerSceneData {
  const scene=physicalHomeScene(state,world,selectedId,paint),{objects,tables,people}=scene,plan=state.home.roomPlan,space=homeSpatial(state.home.w,state.home.h);
  const parcel=dailyIngredientParcel(state);
  if(!parcel.claimed){const task=state.homeTask?.incidentId===parcel.id?state.homeTask:null;objects.push({id:parcel.sceneId,kind:'parcel',x:parcel.x,y:parcel.y,state:task?.phase==='working'?'working':'ready',progress:parcel.progressTicks/parcel.requiredTicks});}
  for(const incident of homeIncidents(state).filter(i=>i.availableAt<=state.updatedAt)){
    const task=state.homeTask?.incidentId===incident.id?state.homeTask:null;
    objects.push({id:incident.id,kind:incident.kind==='spill'?'spill':'parcel',x:incident.x,y:incident.y,state:task?.phase==='working'?'working':'ready',progress:task?task.progressTicks/incident.requiredTicks:0});
  }
  const regular=REGULARS.find(r=>regularAvailable(state,r.id)&&!state.daily.regularServed.includes(r.id)&&(state.daily.regularProgress[r.id]??0)>=1);
  if(regular){const blocked=world?world.walkable.flatMap((free,i)=>free?[]:[{x:i%state.home.w,y:Math.floor(i/state.home.w)}]):objects.filter(o=>!o.mount).map(o=>({x:o.x,y:o.y}));const point=plan?chooseHomeInteractionTile({width:state.home.w,height:state.home.h,blocked,reserved:[...objects,...tables.flatMap(t=>t.seats),...people,...plan.modules.flatMap(m=>{const g=roomModuleGeometry(m);return [g.front,g.back,g.orderFront,g.orderBack,...g.servicePoints];})],preferred:{x:space.door.x+1,y:state.home.h-1}}):space.regular;if(point)people.push({id:`regular:${regular.id}`,role:'customer',look:REGULARS.findIndex(r=>r.id===regular.id),...point,pose:'cheer',target:{x:point.x-1,y:point.y+1}});}
  return scene;
}
