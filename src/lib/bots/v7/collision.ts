/** V7-only narrow-phase fork. Legacy collision functions and replays remain unchanged. */
import {BODY_SOCKETS_V6,sweepBoxV6,sweepMovingCapsuleV6,type HitProxyV6,type SweepContactV6} from '@/lib/bots/v6/collision';
import {add,angle,clamp,inverseQuatV6,lerp,localPoint,normalize,rotateQuatV6,rotateY,scale,slerpQuatV6,subtract,worldPoint,type QuatV6,type Vec3} from '@/lib/bots/v6/math';
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
/** Equal-time contacts keep authored proxy/face order; last-bit noise cannot swap dents. */
export const earlierContactV7=(candidate:number,current:number)=>candidate<current-1e-10;
function closestSegments(a:Vec3,b:Vec3,c:Vec3,d:Vec3):{weapon:Vec3;target:Vec3;normal?:Vec3}{
  const u=subtract(b,a),v=subtract(d,c),r=subtract(a,c),aa=dot(u,u),bb=dot(v,v),uv=dot(u,v),ur=dot(u,r),vr=dot(v,r);let s=0,t=0;
  if(aa<=1e-9)t=bb>1e-9?clamp(vr/bb,0,1):0;else if(bb<=1e-9)s=clamp(-ur/aa,0,1);else{const den=aa*bb-uv*uv;s=den>1e-9?clamp((uv*vr-ur*bb)/den,0,1):0;t=(uv*s+vr)/bb;if(t<0){t=0;s=clamp(-ur/aa,0,1);}else if(t>1){t=1;s=clamp((uv-ur)/aa,0,1);}}
  return {weapon:lerp(a,b,s),target:lerp(c,d,t)};
}
type BoxPairV7={weapon:Vec3;target:Vec3;inside:boolean;normal?:Vec3};
/** Analytic local-space surface, including segments already penetrating the box.
 * Entry/exit faces have a stable X/Y/Z tie order. A wholly internal segment uses
 * its first endpoint's nearest face. No arbitrary zero-distance minimizer. */
export function segmentBoxSurfaceV7(a:Vec3,b:Vec3,center:Vec3,half:Vec3):BoxPairV7|null {
  const start=subtract(a,center),delta=subtract(b,a),epsilon=1e-8;
  let enter=-Infinity,exit=Infinity,enterAxis=-1,exitAxis=-1,enterSign=1,exitSign=1;
  for(let axis=0;axis<3;axis++){
    if(Math.abs(delta[axis])<1e-12){if(Math.abs(start[axis])>half[axis]+epsilon)return null;continue;}
    const first=(-half[axis]-start[axis])/delta[axis],last=(half[axis]-start[axis])/delta[axis],near=Math.min(first,last),far=Math.max(first,last);
    if(near>enter+1e-12){enter=near;enterAxis=axis;enterSign=first<last?-1:1;}
    if(far<exit-1e-12){exit=far;exitAxis=axis;exitSign=first<last?1:-1;}
  }
  if(enter>exit+1e-12||exit< -1e-12||enter>1+1e-12)return null;
  const startsInside=start.every((v,i)=>Math.abs(v)<=half[i]+epsilon);
  let t:number,axis:number,sign:number;
  if(!startsInside&&enterAxis>=0){t=clamp(enter,0,1);axis=enterAxis;sign=enterSign;}
  else if(exitAxis>=0&&exit>=0&&exit<=1+1e-12){t=clamp(exit,0,1);axis=exitAxis;sign=exitSign;}
  else{t=0;axis=0;let margin=Infinity;for(let i=0;i<3;i++){const d=half[i]-Math.abs(start[i]);if(d<margin-epsilon){axis=i;margin=d;}}sign=start[axis]>=0?1:-1;}
  const weapon=lerp(a,b,t),target=weapon.map((v,i)=>clamp(v,center[i]-half[i],center[i]+half[i])) as Vec3,normal:Vec3=[0,0,0];target[axis]=center[axis]+sign*half[axis];normal[axis]=sign;
  return {weapon,target,inside:true,normal};
}
function closestSegmentBox(a:Vec3,b:Vec3,center:Vec3,half:Vec3):BoxPairV7{
  const intersecting=segmentBoxSurfaceV7(a,b,center,half);if(intersecting)return intersecting;
  const delta=subtract(b,a),cuts=[0,1];for(let axis=0;axis<3;axis++)if(Math.abs(delta[axis])>1e-9)for(const sign of [-1,1]){const t=(center[axis]+sign*half[axis]-a[axis])/delta[axis];if(t>0&&t<1)cuts.push(t);}cuts.sort((x,y)=>x-y);
  let best=Infinity,weapon:Vec3=[...a],target:Vec3=[...a];const sample=(t:number)=>{const p=lerp(a,b,t),q=p.map((v,i)=>clamp(v,center[i]-half[i],center[i]+half[i])) as Vec3,d=dot(subtract(p,q),subtract(p,q));if(d<best-1e-12){best=d;weapon=p;target=q;}};
  for(let i=0;i<cuts.length-1;i++){const low=cuts[i],high=cuts[i+1],mid=(low+high)/2;let numerator=0,denominator=0;for(let axis=0;axis<3;axis++){const v=a[axis]+delta[axis]*mid,edge=v<center[axis]-half[axis]?center[axis]-half[axis]:v>center[axis]+half[axis]?center[axis]+half[axis]:null;if(edge!==null){numerator+=delta[axis]*(a[axis]-edge);denominator+=delta[axis]*delta[axis];}}sample(low);sample(high);if(denominator>0)sample(clamp(-numerator/denominator,low,high));}
  return {weapon,target,inside:false};
}
const boxIdentityV7:QuatV6=[0,0,0,1];
function boxMotionV7(prior:HitProxyV6,current:HitProxyV6):number {
  const a=prior.orientation??boxIdentityV7,b=current.orientation??boxIdentityV7,cos=Math.abs(a.reduce((sum,n,i)=>sum+n*b[i],0));
  return Math.hypot(...subtract(current.center,prior.center))+2*Math.acos(clamp(cos,-1,1))*Math.hypot(...current.half);
}
function orientedSegmentBoxV7(a:Vec3,b:Vec3,prior:HitProxyV6,current:HitProxyV6,t:number):BoxPairV7{
  const center=lerp(prior.center,current.center,t),q=slerpQuatV6(prior.orientation??boxIdentityV7,current.orientation??boxIdentityV7,t),inv=inverseQuatV6(q),pair=closestSegmentBox(rotateQuatV6(subtract(a,center),inv),rotateQuatV6(subtract(b,center),inv),[0,0,0],current.half);
  return {...pair,weapon:add(center,rotateQuatV6(pair.weapon,q)),target:add(center,rotateQuatV6(pair.target,q)),normal:pair.normal?rotateQuatV6(pair.normal,q):undefined};
}
/** Swept sphere against a translating/rotating authored box, at fixed 0.1 mm tolerance. */
export function sweepMovingBoxV7(from:Vec3,to:Vec3,prior:HitProxyV6,current:HitProxyV6,radius=0):{t:number;point:Vec3;normal:Vec3}|null {
  const oldQ=prior.orientation??boxIdentityV7,newQ=current.orientation??boxIdentityV7;
  if(oldQ.every((n,i)=>Math.abs(n-newQ[i])<1e-10)){const inverse=inverseQuatV6(newQ),a=rotateQuatV6(subtract(from,prior.center),inverse),b=rotateQuatV6(subtract(to,current.center),inverse),inside=a.every((v,i)=>Math.abs(v)<=current.half[i]+1e-8),surface=inside?segmentBoxSurfaceV7(a,a,[0,0,0],current.half):null,hit=surface?{t:0,point:surface.target,normal:surface.normal!}:sweepBoxV6(a,b,[0,0,0],current.half,radius);return hit?{t:hit.t,point:add(lerp(prior.center,current.center,hit.t),rotateQuatV6(hit.point,newQ)),normal:rotateQuatV6(hit.normal,newQ)}:null;}
  const speed=Math.hypot(...subtract(to,from))+boxMotionV7(prior,current);let t=0;
  for(let i=0;i<256&&t<=1;i++){const point=lerp(from,to,t),pair=orientedSegmentBoxV7(point,point,prior,current,t),delta=subtract(pair.weapon,pair.target),distance=Math.hypot(...delta),gap=pair.inside?-radius:distance-radius;
    if(gap<=.1)return {t,point:pair.target,normal:pair.normal??normalize(delta)};if(speed<1e-9)return null;t+=Math.max(.0000001,gap/speed*.95);
  }return null;
}
function contactRecord(proxy:HitProxyV6,prior:HitProxyV6,contact:{t:number;point:Vec3;normal:Vec3},previous:{x:number;z:number;yaw:number},current:{x:number;z:number;yaw:number}):SweepContactV6{
  const root={x:previous.x+(current.x-previous.x)*contact.t,z:previous.z+(current.z-previous.z)*contact.t,yaw:Math.round(previous.yaw+angle((current.yaw-previous.yaw)/1000)*1000*contact.t)},p=contact.point,normal=normalize(contact.normal),pose=proxy.pose?{...proxy.pose,origin:lerp(prior.pose?.origin??proxy.pose.origin,proxy.pose.origin,contact.t),rotation:slerpQuatV6(prior.pose?.rotation??proxy.pose.rotation,proxy.pose.rotation,contact.t)}:undefined,restPoint=pose?add(pose.restOrigin,rotateQuatV6(subtract(p,pose.origin),inverseQuatV6(pose.rotation))):p,restNormal=pose?rotateQuatV6(normal,inverseQuatV6(pose.rotation)):normal,center=pose?.restCenter??proxy.center,half=pose?.restHalf??proxy.half;
  return {t:contact.t,slot:proxy.slot,point:worldPoint(p,root).map(Math.round) as Vec3,normal:rotateY(normal,root.yaw).map(n=>Math.round(n*1000)) as Vec3,localPoint:[Math.round(clamp((restPoint[0]-center[0])/half[0]*1000,-1000,1000)),Math.round(clamp((restPoint[1]-center[1]+half[1])/(half[1]*2)*1000,0,1000)),Math.round(clamp((restPoint[2]-center[2])/half[2]*1000,-1000,1000))],localNormal:restNormal.map(n=>Math.round(n*1000)) as Vec3};
}
/** Sweeps an entire real blade-edge capsule, with moving target limbs and no sampling gaps along the edge. */
export function sweepWeaponSegmentV7(oldA:Vec3,oldB:Vec3,a:Vec3,b:Vec3,previous:{x:number;z:number;yaw:number},current:{x:number;z:number;yaw:number},proxies:readonly HitProxyV6[],alive:readonly number[],radius:number,previousProxies:readonly HitProxyV6[]=proxies):SweepContactV6|null{
  const fromA=localPoint(oldA,previous),fromB=localPoint(oldB,previous),toA=localPoint(a,current),toB=localPoint(b,current),da=subtract(toA,fromA),db=subtract(toB,fromB);let nearest:SweepContactV6|null=null;
  for(const proxy of proxies){if(alive[BODY_SOCKETS_V6.indexOf(proxy.slot)]<=0)continue;const prior=previousProxies.find(p=>p.slot===proxy.slot&&p.pose?.segment===proxy.pose?.segment)??proxy,targetSpeed=proxy.shape==="capsule"?Math.max(Math.hypot(...subtract(proxy.a!,prior.a!)),Math.hypot(...subtract(proxy.b!,prior.b!))):boxMotionV7(prior,proxy),speed=Math.max(Math.hypot(...da),Math.hypot(...db))+targetSpeed,totalRadius=radius+(proxy.shape==="capsule"?proxy.radius!:0);let t=0;
    for(let iteration=0;iteration<256&&t<=1&&(!nearest||earlierContactV7(t,nearest.t));iteration++){const pa=lerp(fromA,toA,t),pb=lerp(fromB,toB,t),pair=proxy.shape==="capsule"?closestSegments(pa,pb,lerp(prior.a!,proxy.a!,t),lerp(prior.b!,proxy.b!,t)):orientedSegmentBoxV7(pa,pb,prior,proxy,t),delta=subtract(pair.weapon,pair.target),distance=Math.hypot(...delta),gap=proxy.shape!=="capsule"&&"inside" in pair&&pair.inside?-totalRadius:distance-totalRadius;
      if(gap<=.1){const normal=pair.normal??normalize(delta),point=proxy.shape==="capsule"?add(pair.target,scale(normal,proxy.radius!)):pair.target;nearest=contactRecord(proxy,prior,{t,point,normal},previous,current);break;}if(speed<1e-9)break;t+=Math.max(.0000001,gap/speed*.95);
    }
  }return nearest;
}
/** Targets move over the same tick; translation is included in relative swept contact. */
export function sweepRobotV7(from:Vec3,to:Vec3,previous:{x:number;z:number;yaw:number},current:{x:number;z:number;yaw:number},proxies:readonly HitProxyV6[],alive:readonly number[],radius=0,previousProxies:readonly HitProxyV6[]=proxies):SweepContactV6|null {
  const localFrom=localPoint(from,previous),localTo=localPoint(to,current);let nearest:SweepContactV6|null=null;
  for(const proxy of proxies){if(alive[BODY_SOCKETS_V6.indexOf(proxy.slot)]<=0)continue;const prior=previousProxies.find(p=>p.slot===proxy.slot&&p.pose?.segment===proxy.pose?.segment)??proxy;const contact=proxy.shape==="capsule"?sweepMovingCapsuleV6(localFrom,localTo,prior.a??proxy.a!,prior.b??proxy.b!,proxy.a!,proxy.b!,proxy.radius!,radius):sweepMovingBoxV7(localFrom,localTo,prior,proxy,radius);if(!contact||nearest&&!earlierContactV7(contact.t,nearest.t))continue;
    nearest=contactRecord(proxy,prior,contact,previous,current);
  }
  return nearest;
}
