import { EQUIPMENT_BY_ID, TRUCK_TIERS } from "@/lib/chef/diner/content";
import type { ServiceState } from "@/lib/chef/diner/types";
import type { DinerSceneData, ScenePerson, SceneObject, SceneFood } from "./scene-types";

export function serviceScene(state:ServiceState,selectedId:string|null=null,paint="#b66751",sign="The Little Lunch Truck"):DinerSceneData {
  const dims=TRUCK_TIERS[state.config.tier];
  const plated=(item?:SceneFood|null):SceneFood|null=>item?{...item,mastery:state.config.recipeLevels[item.recipeId]??0}:null;
  const target=state.stations.find(s=>s.id===state.chef.targetId);
  const currentSlot=target?.slots.find(slot=>slot.job&&!slot.job.ready);
  const chef:ScenePerson={id:'player',role:'chef',x:state.chef.x,y:state.chef.y,held:plated(state.chef.held),
    pose:state.chef.path.length?'walk':state.chef.holding&&currentSlot?(currentSlot.job?.action==='wash'?'wash':'cook'):state.chef.held?'carry':'idle',target:state.chef.path[0]??target??null,work:{stationKind:target?.kind,recipeId:currentSlot?.item?.recipeId}};
  const helpers=state.helpers.map((helper):ScenePerson=>{
    const station=state.stations.find(s=>s.id===helper.targetId),slot=station?.slots.find(s=>s.item?.id===helper.task?.itemId);
    return {id:helper.id,role:helper.role==='prep'?'chef':'waiter',look:helper.look,x:helper.x,y:helper.y,held:plated(helper.held),pose:helper.path.length?'walk':helper.holding?(helper.role==='washer'?'wash':'cook'):helper.held?'carry':'idle',target:helper.path[0]??station,work:station?{stationKind:station.kind,recipeId:slot?.item?.recipeId}:undefined};
  });
  // Occupancy belongs to the current guest. A used vessel may still hold the
  // previous meal's receipt, so never infer tabletop contents from seat status.
  const tables=state.tables.map(table=>({id:table.id,x:table.x,y:table.y,capacity:table.capacity,rotation:table.rotation,
    seats:table.seats.map(seat=>({...seat,item:plated(seat.item)}))}));
  const people:ScenePerson[]=[chef,...helpers,...state.customers.filter(c=>c.phase!=='gone').map((c):ScenePerson=>({id:c.id,role:'customer',x:c.x,y:c.y,look:Number(c.id.replace(/\D/g,''))%8,
    pose:c.phase==='eating'?'eat':c.phase==='seated'?'sit':c.path.length?'walk':c.phase==='leaving'?'leave':'idle',target:c.path[0],
    order:c.phase==='queue'||c.phase==='seated'||c.phase==='walking'?{recipeId:c.recipeId,patience:Math.max(0,c.patience/Math.max(1,c.maxPatience))}:null,
    tableId:c.tableId,seatId:c.seatId}))];
  return {width:dims.w,height:dims.h,pavementWidth:dims.pavementW,pavementHeight:dims.pavementH,paint,sign,selectedId,tick:state.tick,paused:state.phase==='paused',
    objects:state.stations.map((s):SceneObject=>{const slot=s.slots.find(v=>v.item)??s.slots[0];return {id:s.id,kind:s.kind,x:s.x,y:s.y,rotation:s.facing,tier:s.tier,stock:s.kind==='plates'?state.cleanPlates:s.kind==='cups'?state.cleanCups:undefined,basketRaised:s.slots.some(slot=>slot.batch?.phase==='raised'),portions:s.slots.reduce((n,slot)=>n+(slot.batch?.remaining??0),0),food:plated(slot?.item),footprint:EQUIPMENT_BY_ID[s.kind]?.footprint,
      slots:s.slots.map(slot=>({food:plated(slot.item),state:slot.item?.kind==='burnt'?'burning':slot.batch?.phase==='raised'||slot.batch?.phase==='ready'||slot.job?.ready?'ready':slot.job?'working':'idle',progress:slot.job?1-slot.job.remaining/Math.max(1,slot.job.total):0})),
      state:slot?.item?.kind==='burnt'?'burning':slot?.batch?.phase==='raised'||slot?.batch?.phase==='ready'||slot?.job?.ready?'ready':slot?.job?'working':'idle',progress:slot?.job?1-slot.job.remaining/Math.max(1,slot.job.total):0};}),
    tables,people};
}
