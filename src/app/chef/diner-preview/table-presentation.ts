import type { ScenePoint,SceneSeat,SceneTable } from './scene-types';

export function diningTableCenter(table:SceneTable):ScenePoint {
  const raw=table.footprint??[table.capacity===4?2:1,table.capacity===1?1:2],r=(table.rotation??0)%2;
  return {x:table.x+(raw[r?1:0]-1)/2,y:table.y+(raw[r?0:1]-1)/2};
}
export function diningPlaceSettings(table:SceneTable):Array<{x:number;z:number;rotation:number}>|undefined {
  if(table.kind!=='booth'&&table.tableStyle!=='restaurant')return undefined;
  const center=diningTableCenter(table),angle=-(table.rotation??0)*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  return table.seats.map(seat=>{
    const dx=seat.x-center.x,dz=seat.y-center.y,x=c*dx-s*dz,z=s*dx+c*dz;
    if(table.kind==='booth')return {x:Math.sign(x)*.235,z:-.325,rotation:Math.sign(x)*Math.PI/2};
    if(table.capacity===1)return {x:0,z:0,rotation:Math.atan2(x,z)};
    const side=Math.abs(x)>Math.abs(z)*.8;
    return {x:side?Math.sign(x)*(table.capacity===4?.44:.21):Math.max(-.35,Math.min(.35,x*.4)),z:side?Math.max(-.48,Math.min(.48,z*.5)):Math.sign(z)*.54,rotation:side?Math.sign(x)*Math.PI/2:z<0?Math.PI:0};
  });
}
/** Food and linen use the same seated guest's setting, including rotated booths. */
export function diningFoodPoint(table:SceneTable,seat:SceneSeat):ScenePoint|undefined {
  const setting=diningPlaceSettings(table)?.[table.seats.findIndex(item=>item.id===seat.id)];if(!setting)return undefined;
  const center=diningTableCenter(table),angle=-(table.rotation??0)*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  return {x:center.x+c*setting.x+s*setting.z,y:center.y-s*setting.x+c*setting.z};
}
