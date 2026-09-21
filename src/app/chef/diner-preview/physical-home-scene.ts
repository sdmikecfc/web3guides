import type { HomeWorld } from '../../../lib/chef/diner/home-simulation';
import type { DinerState } from '../../../lib/chef/diner/progression';
import { homeSpatial } from '../../../lib/chef/diner/home-spatial';
import { roomModuleGeometry,ROOM_FIXTURES,resolveRoomMount } from '../../../lib/chef/diner/room-plan';
import type { DinerSceneData,SceneFood,SceneObject,ScenePerson,SceneTable } from './scene-types';

/** Explicit public visual fields only. No balances, inventory, jobs, parcels or rewards. */
export interface HomeVisualState {
  home:Pick<DinerState['home'],'w'|'h'|'layout'|'roomPlan'|'finishes'|'menu'|'name'>;
  equipment:Record<string,{tier:number}>;
  recipes:Record<string,{level:number}>;
  cosmetics:Pick<DinerState['cosmetics'],'floor'|'wall'|'wrap'|'uniform'>;
  collections:Pick<DinerState['collections'],'trophies'|'mementos'>;
}
/** Owner and visitor use identical physical fixtures and simulated actor contacts. */
export function physicalHomeScene(state:HomeVisualState,world:HomeWorld|null,selectedId:string|null,paint='#bd654e'):DinerSceneData {
  const objects:SceneObject[]=[],tables:SceneTable[]=[],space=homeSpatial(state.home.w,state.home.h);
  const plated=(item?:SceneFood|null):SceneFood|null=>item?{...item,mastery:state.recipes[item.recipeId]?.level??0}:null;
  const plan=state.home.roomPlan;
  for(const p of state.home.layout){
    if(p.mount&&plan){const mounted=resolveRoomMount(plan,p.mount);if(mounted)objects.push({id:p.id,kind:p.equipmentId,x:mounted.x,y:mounted.y,rotation:mounted.rotation,mount:{kind:p.mount.kind,targetId:p.mount.targetId,surfaceHeight:mounted.surfaceHeight},elevation:p.mount.kind==='wall'?.095+mounted.surfaceHeight-(p.equipmentId==='chrome_clock'?1.54:1.49):.095+mounted.surfaceHeight});continue;}
    if(p.equipmentId.startsWith('table_')||p.equipmentId==='booth_2'){
      const table=world?.tables.find(t=>t.id===p.id);
      const boothSurface=p.equipmentId==='booth_2'&&table?.seats.length===2?{x:(table.seats[0].x+table.seats[1].x)/2,y:(table.seats[0].y+table.seats[1].y)/2}:undefined;
      tables.push({id:p.id,x:p.x,y:p.y,capacity:p.equipmentId==='table_1'?1:p.equipmentId==='table_4'?4:2,rotation:p.rotation,kind:p.equipmentId==='booth_2'?'booth':undefined,tableStyle:plan?.stage==='restaurant'?'restaurant':'cafe',seats:table?.seats.map(s=>({...s,item:plated(s.item),...(boothSurface?{surface:boothSurface}:{})}))??[]});
    }else{
      const station=world?.stations.find(s=>s.id===p.id),slot=station?.slots.find(s=>s.item);
      const finish:Record<string,string>={cherry:'#b66751',mint:'#91b29a',cream:'#ede1bc'};
      objects.push({id:p.id,kind:p.equipmentId,x:p.x,y:p.y,rotation:p.rotation,tier:state.equipment[p.equipmentId]?.tier,food:plated(slot?.item),color:p.skin?finish[p.skin]:undefined,
        slots:station?.slots.map(s=>({food:plated(s.item),state:s.job?.ready?'ready':s.job?'working':'idle',progress:s.job?1-s.job.remaining/Math.max(1,s.job.total):0})),
        state:slot?.job?.ready?'ready':slot?.job?'working':'idle',progress:slot?.job?1-slot.job.remaining/Math.max(1,slot.job.total):0});
    }
  }
  if(plan){
    for(const module of plan.modules){
      const geometry=roomModuleGeometry(module),station=world?.stations.find(st=>st.moduleId===module.id),table=world?.tables.find(table=>table.moduleId===module.id),bath=world?.bathrooms.find(f=>f.id===module.id);
      if(module.kind==='console'||module.kind==='chef_bar'){
        tables.push({id:module.id,kind:module.kind,x:module.x,y:module.y,rotation:module.rotation,capacity:module.kind==='console'?3:6,footprint:ROOM_FIXTURES[module.kind].footprint,seatHeight:.707,surfaceHeight:1.11,seats:(table?.seats??geometry.seats.map((p,i)=>({...p,id:`${module.id}_seat_${i+1}`,status:'clean'}))).map(seat=>({...seat,item:'item'in seat?plated(seat.item):null,surface:geometry.cells.reduce((best,p)=>Math.hypot(p.x-seat.x,p.y-seat.y)<Math.hypot(best.x-seat.x,best.y-seat.y)?p:best,geometry.cells[0])}))});
      }else{
        const gateOpen=module.kind==='lift_gate'&&world?.actors.some(actor=>actor.path.length&&Math.hypot(actor.x-module.x,actor.y-module.y)<1.05);
        objects.push({id:module.id,kind:module.kind==='lift_gate'&&plan.stage!=='burger_shop'?'staff_door':module.kind,x:module.x,y:module.y,rotation:module.rotation,footprint:ROOM_FIXTURES[module.kind].footprint,gateOpen,condition:bath?.condition??module.condition,
          state:bath?.occupiedBy?'working':(bath?.condition??module.condition??100)<=20?'burning':'idle',slots:station?[...station.slots.map(slot=>({food:plated(slot.item),state:slot.item?'ready' as const:'idle' as const})),...(station.dirtySlots??[]).map(slot=>({food:plated(slot.item),state:slot.item?'ready' as const:'idle' as const}))]:undefined});
      }
    }
    const counter=plan.modules.find(module=>module.kind==='display_counter')??plan.modules.find(module=>module.kind==='chef_bar')??plan.modules.find(module=>['service_hatch','internal_pass'].includes(module.kind));
    if(counter){const geometry=roomModuleGeometry(counter),cell=geometry.cells[0],next=geometry.cells[1]??{x:cell.x+1,y:cell.y},height=counter.kind==='internal_pass'?1.13:1.11;objects.push({id:'home-till',kind:'counter_till',...cell,rotation:counter.rotation,elevation:.095+height,mount:{kind:'counter',targetId:counter.id,surfaceHeight:height}},{id:'home-binder',kind:'counter_book',x:cell.x+(next.x-cell.x)*.46,y:cell.y+(next.y-cell.y)*.46,rotation:counter.rotation,elevation:.095+height,mount:{kind:'counter',targetId:counter.id,surfaceHeight:height}});}
    const kitchen=plan.zones.find(zone=>zone.kind==='kitchen');objects.push({id:'home-collections',kind:'keepsake_shelf',x:(kitchen?.x??0)+(kitchen?.w??5)-1,y:-.55,rotation:0,elevation:.405,mount:{kind:'wall',targetId:'outer-back',surfaceHeight:1.80},stock:state.collections.trophies.length+state.collections.mementos.length});
  }else objects.push({id:'home-till',kind:'till',...space.context.till},{id:'home-binder',kind:'book',...space.context.binder},{id:'home-collections',kind:'trophy',...space.context.collections});
  const people:ScenePerson[]=[...(world?.actors.map((a):ScenePerson=>{
    const working=(a.pose==='cook'||a.pose==='wash'||a.pose==='takeOrder')&&a.task,station=working?world.stations.find(s=>s.id===working.stationId):undefined;
    const order=working?world.orders.find(o=>o.id===working.orderId):undefined,recipeId=order?.recipeId??(working?station?.slots[working.slotIndex]?.item?.recipeId:undefined);
    return {id:a.id,role:a.role,x:a.x,y:a.y,pose:a.pose,held:plated(a.held),target:a.path[0]??(station?{x:station.x,y:station.y}:a.pose==='idle'?space.door:undefined),work:station?{stationKind:station.kind,recipeId}:undefined};
  })??[]),...(world?.customers.map((c):ScenePerson=>{const table=tables.find(table=>table.id===c.tableId),fixture=world.bathrooms.find(f=>f.id===c.fixtureId);return {id:c.id,role:'customer',x:c.x,y:c.y,look:Number(c.id.replace(/\D/g,''))%8,pose:c.phase==='eating'?'eat':c.phase==='seated'?'sit':c.path.length?'walk':c.phase==='washingHands'?'wash':'idle',target:c.path[0]??fixture,tableId:c.tableId,seatId:c.seatId,hidden:c.phase==='usingToilet',work:{seatHeight:table?.seatHeight,stationKind:c.phase==='washingHands'?'handwash_sink':undefined},order:c.phase==='seated'||c.phase==='ordering'?{recipeId:c.recipeId,patience:1}:null};})??[])];
  return {width:state.home.w,height:state.home.h,homeTerraceDepth:space.terrace.h,sign:state.home.name,paint,selectedId,objects,tables,people,tick:world?.tick,roomPlan:plan,roomFinishes:state.home.finishes,menu:Object.values(state.home.menu).flat(),floor:state.cosmetics.floor,wall:state.cosmetics.wall,wrap:state.cosmetics.wrap,uniform:state.cosmetics.uniform};
}
