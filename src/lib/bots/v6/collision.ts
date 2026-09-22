import { add, angle, clamp, cloneV6, deepFreeze, hashV6, inverseQuatV6, lerp, localPoint, normalize, rotateQuatV6, rotateY, scale, slerpQuatV6, subtract, worldPoint, type QuatV6, type Vec3 } from "./math";

export const BODY_SOCKETS_V6 = ["head","torso","armL","armR","legL","legR"] as const;
export type BodySocketV6 = typeof BODY_SOCKETS_V6[number];
export interface HitProxyV6 { slot:BodySocketV6; center:Vec3; half:Vec3; shape?:"box"|"capsule"; a?:Vec3;b?:Vec3;radius?:number;orientation?:QuatV6;
  /** Runtime-only rigid segment mapping back into the canonical unposed part. */
  pose?:{segment:"upper"|"lower"|"body"|"rigid";origin:Vec3;restOrigin:Vec3;rotation:QuatV6;restCenter:Vec3;restHalf:Vec3};
}
export type AttachmentNameV6=BodySocketV6|"handL"|"handR"|"shoulderL"|"shoulderR";
/** Root-space position in mm and Euler XYZ rotation in milliradians. */
export interface AttachmentFrameV6 {position:Vec3;rotation:Vec3}
export interface ContactKeyV6 { time:number; point:Vec3; normal:Vec3;/** Optional authored twist about the striking normal, in milliradians. */roll?:number;/** Optional root-space blade-up reference, blended to automatic reach between unauthored keys. */up?:Vec3 }
export interface ArmRigV6 {upper:Vec3;lower:Vec3;pole:Vec3;upperRadius:number;lowerRadius:number}
export interface WeaponProxyV6 {
  /** Weapon-local coordinates. Authored forward is +Z. */
  grip:Vec3; muzzle:Vec3; strikePoint:Vec3;strikeNormal:Vec3;offhandGrip?:Vec3;backupMuzzle?:Vec3;specialMuzzle?:Vec3; radius:number;
  /** Root-space path of the striking surface, not the hand or weapon origin. */
  path:readonly ContactKeyV6[]; active:[number,number];
  /** Actual sharp edges in weapon-local space. Hilt and protected machinery are excluded. */
  strikeSegments?:readonly {a:Vec3;b:Vec3;radius:number}[];
}
export interface BodyCollisionV6 { radius:number; height:number; proxies:readonly HitProxyV6[];mounts:Readonly<Record<AttachmentNameV6,AttachmentFrameV6>>;arms?:Readonly<Record<"left"|"right",ArmRigV6>>;specialMuzzle?:Vec3;specialBlade?:WeaponProxyV6 }
export interface CollisionManifestV6 {
  version:string; rigVersion:string; units:"millimetres";
  bodies:Readonly<Record<string,BodyCollisionV6>>;
  weapons:Readonly<Record<string,WeaponProxyV6>>;
}
export interface CollisionSnapshotV6 { version:string; rigVersion:string; manifestHash:string; radius:number; height:number; floorY:number; proxies:readonly HitProxyV6[];mounts:Readonly<Record<AttachmentNameV6,AttachmentFrameV6>>;arms:Readonly<Record<"left"|"right",ArmRigV6>>;weapon:WeaponProxyV6;specialMuzzle:Vec3;specialBlade:WeaponProxyV6 }
export interface SweepContactV6 { t:number; slot:BodySocketV6; point:Vec3; normal:Vec3; localPoint:Vec3; localNormal:Vec3 }
/** A directional support radius, derived from the actual surviving body parts. */
export function footprintSupportV6(proxies:readonly HitProxyV6[],alive:readonly number[],direction:Vec3):number {
  const n=normalize([direction[0],0,direction[2]]);let support=0;
  for(const p of proxies){if(alive[BODY_SOCKETS_V6.indexOf(p.slot)]<=0)continue;const axis=p.orientation?rotateQuatV6(n,inverseQuatV6(p.orientation)):n,value=p.shape==="capsule"?Math.max(p.a![0]*n[0]+p.a![2]*n[2],p.b![0]*n[0]+p.b![2]*n[2])+p.radius!:p.center[0]*n[0]+p.center[2]*n[2]+Math.abs(axis[0])*p.half[0]+Math.abs(axis[1])*p.half[1]+Math.abs(axis[2])*p.half[2];support=Math.max(support,value);}
  return Math.max(100,support);
}
export function footprintRadiusV6(proxies:readonly HitProxyV6[]):number{return Math.ceil(Math.max(...proxies.map(p=>{if(p.shape==="capsule")return Math.max(Math.hypot(p.a![0],p.a![2]),Math.hypot(p.b![0],p.b![2]))+p.radius!;let radius=0;for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const delta:Vec3=[p.half[0]*x,p.half[1]*y,p.half[2]*z],point=add(p.center,p.orientation?rotateQuatV6(delta,p.orientation):delta);radius=Math.max(radius,Math.hypot(point[0],point[2]));}return radius;})));}
const registry=new Map<string,Readonly<CollisionManifestV6>>();
function vector(value:unknown,limit=10000):value is Vec3{return Array.isArray(value)&&value.length===3&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<=limit);}
function validWeaponProxyV6(w:WeaponProxyV6):boolean{return w&&vector(w.grip)&&vector(w.muzzle)&&vector(w.strikePoint)&&vector(w.strikeNormal)&&(!w.offhandGrip||vector(w.offhandGrip))&&(!w.backupMuzzle||vector(w.backupMuzzle))&&(!w.specialMuzzle||vector(w.specialMuzzle))&&(!w.strikeSegments||Array.isArray(w.strikeSegments)&&w.strikeSegments.length>=1&&w.strikeSegments.length<=8&&w.strikeSegments.every(e=>vector(e.a)&&vector(e.b)&&Number.isFinite(e.radius)&&e.radius>=5&&e.radius<=300))&&Number.isFinite(w.radius)&&w.radius>=5&&w.radius<=500&&Array.isArray(w.active)&&w.active.length===2&&w.active[0]>=0&&w.active[1]<=1&&w.active[0]<w.active[1]&&Array.isArray(w.path)&&w.path.length>=2&&w.path.length<=32&&w.path[0].time===0&&w.path[w.path.length-1].time===1&&w.path.every((k,i)=>Number.isFinite(k.time)&&k.time>=0&&k.time<=1&&(!i||w.path[i-1].time<k.time)&&vector(k.point)&&vector(k.normal)&&(!k.up||vector(k.up)&&Math.hypot(...k.up)>.5)&&Math.hypot(...k.normal)>.5&&(k.roll===undefined||Number.isFinite(k.roll)&&Math.abs(k.roll)<=6284));}
export function validateCollisionManifestV6(raw:CollisionManifestV6):boolean {
  if(!raw||!/^mk6-[a-z0-9.-]{1,80}$/.test(raw.version)||!/^mk6-[a-z0-9.-]{1,80}$/.test(raw.rigVersion)||raw.units!=="millimetres"||!raw.bodies||!raw.weapons)return false;
  const bodies=Object.values(raw.bodies),weapons=Object.values(raw.weapons);if(!bodies.length||!weapons.length)return false;
  return bodies.every(b=>b&&(!b.specialMuzzle||vector(b.specialMuzzle))&&(!b.specialBlade||validWeaponProxyV6(b.specialBlade))&&Number.isFinite(b.radius)&&b.radius>=250&&b.radius<=1500&&Number.isFinite(b.height)&&b.height>=800&&b.height<=4000&&(!b.arms||[b.arms.left,b.arms.right].every(a=>a&&vector(a.upper)&&vector(a.lower)&&vector(a.pole)&&Math.hypot(...a.upper)>50&&Math.hypot(...a.lower)>50&&a.upperRadius>0&&a.upperRadius<=500&&a.lowerRadius>0&&a.lowerRadius<=500))&&b.mounts&&[...BODY_SOCKETS_V6,"handL","handR","shoulderL","shoulderR"].every(k=>{const f=b.mounts[k as AttachmentNameV6];return f&&vector(f.position)&&vector(f.rotation,6284);})&&Array.isArray(b.proxies)&&b.proxies.length===6&&new Set(b.proxies.map(p=>p.slot)).size===6&&b.proxies.every(p=>BODY_SOCKETS_V6.includes(p.slot)&&vector(p.center)&&vector(p.half)&&p.half.every((n:number)=>n>0&&n<=1500)&&(!p.shape||p.shape==="box"||p.shape==="capsule")&&(p.shape!=="capsule"||vector(p.a)&&vector(p.b)&&Number.isFinite(p.radius)&&p.radius!>0&&p.radius!<=1000)))&&weapons.every(validWeaponProxyV6);
}
/** Authoring registers an immutable, new version. Client snapshots cannot redefine it. */
export function registerCollisionManifestV6(manifest:CollisionManifestV6):Readonly<CollisionManifestV6>{
  if(!validateCollisionManifestV6(manifest))throw new Error("Invalid v6 collision manifest.");
  const prior=registry.get(manifest.version);if(prior&&hashV6(prior)!==hashV6(manifest))throw new Error("A collision version cannot be replaced.");
  if(prior)return prior;const stored=deepFreeze(cloneV6(manifest));registry.set(manifest.version,stored);return stored;
}
export function collisionManifestV6(version:string):Readonly<CollisionManifestV6>{const manifest=registry.get(version);if(!manifest)throw new Error("The recorded collision version is not installed.");return manifest;}

/** Earliest segment contact against an expanded box; uses an actual swept path, never a post-hit roll. */
export function sweepBoxV6(from:Vec3,to:Vec3,center:Vec3,half:Vec3,radius=0):{t:number;point:Vec3;normal:Vec3}|null {
  let enter=0,leave=1,face=-1,sign=1;const delta=subtract(to,from);
  for(let axis=0;axis<3;axis++){
    const low=center[axis]-half[axis]-radius,high=center[axis]+half[axis]+radius;
    if(Math.abs(delta[axis])<1e-9){if(from[axis]<low||from[axis]>high)return null;continue;}
    const near=(low-from[axis])/delta[axis],far=(high-from[axis])/delta[axis],first=Math.min(near,far),last=Math.max(near,far);
    if(first>enter){enter=first;face=axis;sign=near<far?-1:1;}leave=Math.min(leave,last);if(enter>leave)return null;
  }
  if(leave<0||enter>1)return null;
  const t=clamp(enter,0,1),point=lerp(from,to,t),normal:Vec3=[0,0,0];
  if(face<0){let best=Infinity;for(let axis=0;axis<3;axis++){const d=half[axis]+radius-Math.abs(point[axis]-center[axis]);if(d<best){best=d;face=axis;sign=point[axis]>=center[axis]?1:-1;}}}
  normal[face]=sign;
  const surface:Vec3=point.map((n,i)=>clamp(n,center[i]-half[i],center[i]+half[i])) as Vec3;
  return {t,point:surface,normal};
}
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function sweepCapsuleV6(from:Vec3,to:Vec3,a:Vec3,b:Vec3,radius:number,projectileRadius=0):{t:number;point:Vec3;normal:Vec3}|null {
  const d=subtract(to,from),ba=subtract(b,a),oa=subtract(from,a),dd=dot(d,d),baba=dot(ba,ba),r=radius+projectileRadius,candidates:number[]=[];
  const closest=(p:Vec3)=>add(a,scale(ba,baba>0?clamp(dot(subtract(p,a),ba)/baba,0,1):0));
  if(Math.hypot(...subtract(from,closest(from)))<=r)candidates.push(0);
  if(dd>1e-12){for(const cap of [a,b]){const oc=subtract(from,cap),q=dot(oc,d),disc=q*q-dd*(dot(oc,oc)-r*r);if(disc>=0){const t=(-q-Math.sqrt(disc))/dd;if(t>=0&&t<=1)candidates.push(t);}}
    const bard=dot(ba,d),baoa=dot(ba,oa),aa=baba*dd-bard*bard,bb=baba*dot(d,oa)-baoa*bard,cc=baba*dot(oa,oa)-baoa*baoa-r*r*baba,h=bb*bb-aa*cc;
    if(Math.abs(aa)>1e-9&&h>=0){const t=(-bb-Math.sqrt(h))/aa,y=baoa+t*bard;if(t>=0&&t<=1&&y>=0&&y<=baba)candidates.push(t);}}
  if(!candidates.length)return null;const t=Math.min(...candidates),hit=lerp(from,to,t),axis=closest(hit),normal=normalize(subtract(hit,axis));return {t,point:add(axis,scale(normal,radius)),normal};
}
/** Conservative advancement against a linearly moving two-endpoint capsule, tolerance 0.1 mm. */
export function sweepMovingCapsuleV6(from:Vec3,to:Vec3,oldA:Vec3,oldB:Vec3,a:Vec3,b:Vec3,radius:number,projectileRadius=0):{t:number;point:Vec3;normal:Vec3}|null {
  const da=subtract(a,oldA),db=subtract(b,oldB),travel=subtract(to,from),speed=Math.max(Math.hypot(...subtract(travel,da)),Math.hypot(...subtract(travel,db))),r=radius+projectileRadius;
  if(Math.hypot(...subtract(da,db))<1e-8){const hit=sweepCapsuleV6(from,subtract(to,da),oldA,oldB,radius,projectileRadius);return hit?{...hit,point:add(hit.point,scale(da,hit.t))}:null;}
  // Reject the entire swept envelope before doing the bounded distance solve.
  const low:Vec3=[0,1,2].map(i=>Math.min(oldA[i],oldB[i],a[i],b[i])-r) as Vec3,high:Vec3=[0,1,2].map(i=>Math.max(oldA[i],oldB[i],a[i],b[i])+r) as Vec3;
  if(!sweepBoxV6(from,to,scale(add(low,high),.5),scale(subtract(high,low),.5)))return null;
  let t=0;for(let i=0;i<256&&t<=1;i++){const pa=lerp(oldA,a,t),pb=lerp(oldB,b,t),p=lerp(from,to,t),axis=subtract(pb,pa),axisLength=dot(axis,axis),nearest=add(pa,scale(axis,axisLength>1e-9?clamp(dot(subtract(p,pa),axis)/axisLength,0,1):0)),delta=subtract(p,nearest),distance=Math.hypot(...delta),gap=distance-r;
    if(gap<=.1){const normal=normalize(delta);return {t,point:add(nearest,scale(normal,radius)),normal};}if(speed<1e-8)return null;t+=Math.max(.0000001,gap/speed*.95);
  }return null;
}
function closestSegments(a:Vec3,b:Vec3,c:Vec3,d:Vec3):{weapon:Vec3;target:Vec3}{
  const u=subtract(b,a),v=subtract(d,c),r=subtract(a,c),aa=dot(u,u),bb=dot(v,v),uv=dot(u,v),ur=dot(u,r),vr=dot(v,r);let s=0,t=0;
  if(aa<=1e-9)t=bb>1e-9?clamp(vr/bb,0,1):0;else if(bb<=1e-9)s=clamp(-ur/aa,0,1);else{const den=aa*bb-uv*uv;s=den>1e-9?clamp((uv*vr-ur*bb)/den,0,1):0;t=(uv*s+vr)/bb;if(t<0){t=0;s=clamp(-ur/aa,0,1);}else if(t>1){t=1;s=clamp((uv-ur)/aa,0,1);}}
  return {weapon:lerp(a,b,s),target:lerp(c,d,t)};
}
function closestSegmentBox(a:Vec3,b:Vec3,center:Vec3,half:Vec3):{weapon:Vec3;target:Vec3;inside:boolean}{
  const delta=subtract(b,a),cuts=[0,1];for(let axis=0;axis<3;axis++)if(Math.abs(delta[axis])>1e-9)for(const sign of [-1,1]){const t=(center[axis]+sign*half[axis]-a[axis])/delta[axis];if(t>0&&t<1)cuts.push(t);}cuts.sort((x,y)=>x-y);
  let best=Infinity,weapon:Vec3=[...a],target:Vec3=[...a];const sample=(t:number)=>{const p=lerp(a,b,t),q=p.map((v,i)=>clamp(v,center[i]-half[i],center[i]+half[i])) as Vec3,d=dot(subtract(p,q),subtract(p,q));if(d<best){best=d;weapon=p;target=q;}};
  for(let i=0;i<cuts.length-1;i++){const low=cuts[i],high=cuts[i+1],mid=(low+high)/2;let numerator=0,denominator=0;for(let axis=0;axis<3;axis++){const v=a[axis]+delta[axis]*mid,edge=v<center[axis]-half[axis]?center[axis]-half[axis]:v>center[axis]+half[axis]?center[axis]+half[axis]:null;if(edge!==null){numerator+=delta[axis]*(a[axis]-edge);denominator+=delta[axis]*delta[axis];}}sample(low);sample(high);if(denominator>0)sample(clamp(-numerator/denominator,low,high));}
  return {weapon,target,inside:best<1e-10};
}
const boxIdentityV6:QuatV6=[0,0,0,1];
function boxMotionV6(prior:HitProxyV6,current:HitProxyV6):number {
  const a=prior.orientation??boxIdentityV6,b=current.orientation??boxIdentityV6,cos=Math.abs(a.reduce((sum,n,i)=>sum+n*b[i],0));
  return Math.hypot(...subtract(current.center,prior.center))+2*Math.acos(clamp(cos,-1,1))*Math.hypot(...current.half);
}
function orientedSegmentBoxV6(a:Vec3,b:Vec3,prior:HitProxyV6,current:HitProxyV6,t:number):{weapon:Vec3;target:Vec3;inside:boolean}{
  const center=lerp(prior.center,current.center,t),q=slerpQuatV6(prior.orientation??boxIdentityV6,current.orientation??boxIdentityV6,t),inv=inverseQuatV6(q),pair=closestSegmentBox(rotateQuatV6(subtract(a,center),inv),rotateQuatV6(subtract(b,center),inv),[0,0,0],current.half);
  if(pair.inside){let axis=0,margin=Infinity;for(let i=0;i<3;i++){const d=current.half[i]-Math.abs(pair.target[i]);if(d<margin){axis=i;margin=d;}}pair.target[axis]=(pair.target[axis]>=0?1:-1)*current.half[axis];}
  return {...pair,weapon:add(center,rotateQuatV6(pair.weapon,q)),target:add(center,rotateQuatV6(pair.target,q))};
}
/** Swept sphere against a translating/rotating authored box, at fixed 0.1 mm tolerance. */
export function sweepMovingBoxV6(from:Vec3,to:Vec3,prior:HitProxyV6,current:HitProxyV6,radius=0):{t:number;point:Vec3;normal:Vec3}|null {
  const oldQ=prior.orientation??boxIdentityV6,newQ=current.orientation??boxIdentityV6;
  if(oldQ.every((n,i)=>Math.abs(n-newQ[i])<1e-10)){const inverse=inverseQuatV6(newQ),hit=sweepBoxV6(rotateQuatV6(subtract(from,prior.center),inverse),rotateQuatV6(subtract(to,current.center),inverse),[0,0,0],current.half,radius);return hit?{t:hit.t,point:add(lerp(prior.center,current.center,hit.t),rotateQuatV6(hit.point,newQ)),normal:rotateQuatV6(hit.normal,newQ)}:null;}
  const speed=Math.hypot(...subtract(to,from))+boxMotionV6(prior,current);let t=0;
  for(let i=0;i<256&&t<=1;i++){const point=lerp(from,to,t),pair=orientedSegmentBoxV6(point,point,prior,current,t),delta=subtract(pair.weapon,pair.target),distance=Math.hypot(...delta),gap=pair.inside?-radius:distance-radius;
    if(gap<=.1)return {t,point:pair.target,normal:normalize(pair.inside?scale(delta,-1):delta)};if(speed<1e-9)return null;t+=Math.max(.0000001,gap/speed*.95);
  }return null;
}
function contactRecord(proxy:HitProxyV6,prior:HitProxyV6,contact:{t:number;point:Vec3;normal:Vec3},previous:{x:number;z:number;yaw:number},current:{x:number;z:number;yaw:number}):SweepContactV6{
  const root={x:previous.x+(current.x-previous.x)*contact.t,z:previous.z+(current.z-previous.z)*contact.t,yaw:Math.round(previous.yaw+angle((current.yaw-previous.yaw)/1000)*1000*contact.t)},p=contact.point,normal=normalize(contact.normal),pose=proxy.pose?{...proxy.pose,origin:lerp(prior.pose?.origin??proxy.pose.origin,proxy.pose.origin,contact.t),rotation:slerpQuatV6(prior.pose?.rotation??proxy.pose.rotation,proxy.pose.rotation,contact.t)}:undefined,restPoint=pose?add(pose.restOrigin,rotateQuatV6(subtract(p,pose.origin),inverseQuatV6(pose.rotation))):p,restNormal=pose?rotateQuatV6(normal,inverseQuatV6(pose.rotation)):normal,center=pose?.restCenter??proxy.center,half=pose?.restHalf??proxy.half;
  return {t:contact.t,slot:proxy.slot,point:worldPoint(p,root).map(Math.round) as Vec3,normal:rotateY(normal,root.yaw).map(n=>Math.round(n*1000)) as Vec3,localPoint:[Math.round(clamp((restPoint[0]-center[0])/half[0]*1000,-1000,1000)),Math.round(clamp((restPoint[1]-center[1]+half[1])/(half[1]*2)*1000,0,1000)),Math.round(clamp((restPoint[2]-center[2])/half[2]*1000,-1000,1000))],localNormal:restNormal.map(n=>Math.round(n*1000)) as Vec3};
}
/** Sweeps an entire real blade-edge capsule, with moving target limbs and no sampling gaps along the edge. */
export function sweepWeaponSegmentV6(oldA:Vec3,oldB:Vec3,a:Vec3,b:Vec3,previous:{x:number;z:number;yaw:number},current:{x:number;z:number;yaw:number},proxies:readonly HitProxyV6[],alive:readonly number[],radius:number,previousProxies:readonly HitProxyV6[]=proxies):SweepContactV6|null{
  const fromA=localPoint(oldA,previous),fromB=localPoint(oldB,previous),toA=localPoint(a,current),toB=localPoint(b,current),da=subtract(toA,fromA),db=subtract(toB,fromB);let nearest:SweepContactV6|null=null;
  for(const proxy of proxies){if(alive[BODY_SOCKETS_V6.indexOf(proxy.slot)]<=0)continue;const prior=previousProxies.find(p=>p.slot===proxy.slot&&p.pose?.segment===proxy.pose?.segment)??proxy,targetSpeed=proxy.shape==="capsule"?Math.max(Math.hypot(...subtract(proxy.a!,prior.a!)),Math.hypot(...subtract(proxy.b!,prior.b!))):boxMotionV6(prior,proxy),speed=Math.max(Math.hypot(...da),Math.hypot(...db))+targetSpeed,totalRadius=radius+(proxy.shape==="capsule"?proxy.radius!:0);let t=0;
    for(let iteration=0;iteration<256&&t<=1&&(!nearest||t<nearest.t);iteration++){const pa=lerp(fromA,toA,t),pb=lerp(fromB,toB,t),pair=proxy.shape==="capsule"?closestSegments(pa,pb,lerp(prior.a!,proxy.a!,t),lerp(prior.b!,proxy.b!,t)):orientedSegmentBoxV6(pa,pb,prior,proxy,t),delta=subtract(pair.weapon,pair.target),distance=Math.hypot(...delta),gap=proxy.shape!=="capsule"&&"inside" in pair&&pair.inside?-totalRadius:distance-totalRadius;
      if(gap<=.1){let normal=normalize(proxy.shape!=="capsule"&&"inside" in pair&&pair.inside?scale(delta,-1):delta),point=proxy.shape==="capsule"?add(pair.target,scale(normal,proxy.radius!)):pair.target;if(distance<1e-8&&proxy.shape!=="capsule"){let axis=0,margin=Infinity;for(let i=0;i<3;i++){const d=proxy.half[i]-Math.abs(pair.target[i]-proxy.center[i]);if(d<margin){axis=i;margin=d;}}normal=[0,0,0];normal[axis]=pair.target[axis]>=proxy.center[axis]?1:-1;point=[...pair.target];point[axis]=proxy.center[axis]+normal[axis]*proxy.half[axis];}nearest=contactRecord(proxy,prior,{t,point,normal},previous,current);break;}if(speed<1e-9)break;t+=Math.max(.0000001,gap/speed*.95);
    }
  }return nearest;
}
/** Targets move over the same tick; translation is included in relative swept contact. */
export function sweepRobotV6(from:Vec3,to:Vec3,previous:{x:number;z:number;yaw:number},current:{x:number;z:number;yaw:number},proxies:readonly HitProxyV6[],alive:readonly number[],radius=0,previousProxies:readonly HitProxyV6[]=proxies):SweepContactV6|null {
  const localFrom=localPoint(from,previous),localTo=localPoint(to,current);let nearest:SweepContactV6|null=null;
  for(const proxy of proxies){if(alive[BODY_SOCKETS_V6.indexOf(proxy.slot)]<=0)continue;const prior=previousProxies.find(p=>p.slot===proxy.slot&&p.pose?.segment===proxy.pose?.segment)??proxy;const contact=proxy.shape==="capsule"?sweepMovingCapsuleV6(localFrom,localTo,prior.a??proxy.a!,prior.b??proxy.b!,proxy.a!,proxy.b!,proxy.radius!,radius):sweepMovingBoxV6(localFrom,localTo,prior,proxy,radius);if(!contact||nearest&&contact.t>=nearest.t)continue;
    nearest=contactRecord(proxy,prior,contact,previous,current);
  }
  return nearest;
}
/** The renderer samples this exact path; mirror before world transform for the left hand. */
export function sampleWeaponPathV6(proxy:WeaponProxyV6,time:number,mount:"left"|"right",targetHeight?:number):{point:Vec3;normal:Vec3;roll?:number;rollWeight?:number;up?:Vec3;upWeight?:number}{
  const t=clamp(time,0,1);let at=proxy.path.length-2;for(let i=0;i<proxy.path.length-1;i++)if(t<=proxy.path[i+1].time){at=i;break;}
  const a=proxy.path[at],b=proxy.path[at+1],u=clamp((t-a.time)/(b.time-a.time),0,1),p=lerp(a.point,b.point,u),n=normalize(lerp(a.normal,b.normal,u));
  if(targetHeight!==undefined){const middle=(proxy.active[0]+proxy.active[1])/2;let reference=proxy.path[0].point[1];for(let i=0;i<proxy.path.length-1;i++){const first=proxy.path[i],next=proxy.path[i+1];if(middle>=first.time&&middle<=next.time){reference=first.point[1]+(next.point[1]-first.point[1])*(middle-first.time)/(next.time-first.time);break;}}p[1]+=clamp(targetHeight-reference,-180,180)*Math.sin(t*Math.PI);}
  const up=a.up&&b.up?normalize(lerp(a.up,b.up,u)):a.up?[...a.up] as Vec3:b.up?[...b.up] as Vec3:undefined;if(mount==="left"){p[0]*=-1;n[0]*=-1;if(up)up[0]*=-1;}return {point:p,normal:n,...(up?{up,upWeight:a.up&&b.up?1:a.up?1-u:u}:{}),...(a.roll!==undefined||b.roll!==undefined?{roll:a.roll!==undefined&&b.roll!==undefined?a.roll+angle((b.roll-a.roll)/1000)*1000*u:(a.roll??b.roll)!,rollWeight:a.roll!==undefined&&b.roll!==undefined?1:a.roll!==undefined?1-u:u}:{})};
}
