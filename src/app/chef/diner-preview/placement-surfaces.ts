import * as T from 'three';
import type {SceneMountSurface} from './scene-types';

/** Cast onto the selected attachment family, never down onto the room floor. */
export function pickMountSurface(ray:T.Ray,surfaces:SceneMountSurface[]):SceneMountSurface|null{
 let result:SceneMountSurface|null=null,distance=Infinity;
 for(const surface of surfaces){
  const wall=surface.mount.kind==='wall',side=wall&&surface.rotation%2===1;
  const normal=wall?new T.Vector3(side?1:0,0,side?0:1):new T.Vector3(0,1,0);
  const center=new T.Vector3(surface.x,.095+surface.surfaceHeight,surface.y),point=new T.Vector3();
  if(!ray.intersectPlane(new T.Plane().setFromNormalAndCoplanarPoint(normal,center),point))continue;
  const inside=wall?Math.abs(point.y-center.y)<.85&&Math.abs(side?point.z-center.z:point.x-center.x)<.5:Math.abs(point.x-center.x)<.48&&Math.abs(point.z-center.z)<.48;
  const d=ray.origin.distanceToSquared(point);if(inside&&d<distance){result=surface;distance=d;}
 }
 return result;
}
export function mountSurfaceHighlights(surfaces:SceneMountSurface[]):T.Group{
 const root=new T.Group();root.userData.inputPassthrough=true;
 for(const s of surfaces){const wall=s.mount.kind==='wall',m=new T.Mesh(new T.PlaneGeometry(.83,wall?1.05:.83),new T.MeshBasicMaterial({color:s.error?'#bb6a52':'#73aa88',transparent:true,opacity:s.error?.07:.24,depthWrite:false,side:T.DoubleSide}));
  m.position.set(s.x,.095+s.surfaceHeight,s.y);if(wall)m.rotation.y=s.rotation%2?Math.PI/2:0;else m.rotation.x=-Math.PI/2;m.raycast=()=>{};root.add(m);
 }return root;
}
