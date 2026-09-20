import type { Intersection, Material, Object3D, Vector3 } from 'three';

export interface ScenePickTarget {id:string;seatId?:string}
export interface VisibleSceneSurface {target?:ScenePickTarget;tile?:{x:number;y:number};point:Vector3}
type SurfaceObject=Object3D&{material?:Material|Material[]};

/** Truck crew are visual work feedback, not selection surfaces. Mark their root
 * so hats, animated limbs, tools and carried dishes all follow the same rule. */
export function setActorPicking(root:Object3D,mode:'truck'|'home',person:{id:string;role:'chef'|'waiter'|'customer';tableId?:string|null;seatId?:string|null}){
  root.userData.inputPassthrough=mode==='truck'&&person.role!=='customer';
  root.userData.pick=person.tableId?{id:person.tableId,seatId:person.seatId??undefined}:mode==='home'?{id:person.id}:undefined;
}

/** Raycaster results are distance-sorted. Keep the nearest participating surface,
 * including opaque scenery without an action, so input cannot pass through it.
 * Three raycasts hidden descendants too; visibility must be checked up to root.
 */
export function firstVisibleSceneSurface(intersections:readonly Intersection[]):VisibleSceneSurface|null {
  for(const hit of intersections){
    let target:ScenePickTarget|undefined,object:Object3D|null=hit.object,visible=true;
    while(object){
      if(!object.visible||object.userData.inputPassthrough){visible=false;break;}
      const pick=object.userData.pick as Partial<ScenePickTarget>|undefined;
      if(!target&&pick&&typeof pick.id==='string'&&pick.id.length){target={id:pick.id,...(typeof pick.seatId==='string'?{seatId:pick.seatId}:{})};}
      object=object.parent;
    }
    if(!visible)continue;
    const source=(hit.object as SurfaceObject).material;
    // Only the material on the intersected face matters. An opaque side of the
    // same mesh must not turn its faded front face into an invisible blocker.
    const material=Array.isArray(source)?source[hit.face?.materialIndex??0]:source;
    if(Array.isArray(source)&&!material)continue;
    if(material&&(!material.visible||(material.transparent&&material.opacity<.25)))continue;
    const rawTile=hit.instanceId!=null?hit.object.userData.tiles?.[hit.instanceId]??hit.object.userData.tile:hit.object.userData.tile;
    const tile=rawTile&&Number.isFinite(rawTile.x)&&Number.isFinite(rawTile.y)?{x:rawTile.x as number,y:rawTile.y as number}:undefined;
    return {target,tile,point:hit.point};
  }
  return null;
}
