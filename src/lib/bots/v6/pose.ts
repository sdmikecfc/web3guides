import { add,axisQuatV6,clamp,crossV6,dotV6,eulerQuatV6,fromVectorsQuatV6,inverseQuatV6,length3,multiplyQuatV6,normalize,rotateQuatV6,scale,subtract,type QuatV6,type Vec3 } from "./math";
import type { ArmRigV6,CollisionSnapshotV6,HitProxyV6,WeaponProxyV6 } from "./collision";

export interface ArmPoseV6 {
  shoulder:Vec3;elbow:Vec3;grip:Vec3;requestedGrip:Vec3;gripError:number;
  /** Local rotations for the three glTF nodes, with their authored translations left intact. */
  upperQuaternion:QuatV6;elbowQuaternion:QuatV6;handQuaternion:QuatV6;
  /** Weapon/hand rotation in robot-root space. */
  orientation:QuatV6;proxies:HitProxyV6[];
}
export interface WeaponGripPoseV6 extends ArmPoseV6 {strikePoint:Vec3;requestedStrikePoint:Vec3;strikeNormal:Vec3;weaponOrigin:Vec3}
export interface GunMountPoseV6 {weaponOrigin:Vec3;orientation:QuatV6;muzzle:Vec3;forward:Vec3;aimable:boolean;arm?:ArmPoseV6}
const identity:QuatV6=[0,0,0,1];
const sideKey=(side:"left"|"right")=>side==="left"?"armL":"armR";
/** Fallback is explicit in the saved snapshot; production assets should author these vectors. */
export function defaultArmRigV6(side:"left"|"right",size:number,radius:number):ArmRigV6 {return {upper:[(side==="left"?-40:40)*size,-390*size,25*size],lower:[0,-425*size,95*size],pole:[side==="left"?-1:1,-.2,.1],upperRadius:radius,lowerRadius:radius*.88};}
function capsule(slot:"armL"|"armR",a:Vec3,b:Vec3,radius:number,pose:NonNullable<HitProxyV6["pose"]>):HitProxyV6{return {slot,shape:"capsule",a,b,radius,center:scale(add(a,b),.5),half:a.map((v,i)=>Math.abs(v-b[i])/2+radius) as Vec3,pose};}
function proxies(c:CollisionSnapshotV6,side:"left"|"right",shoulder:Vec3,elbow:Vec3,grip:Vec3,upper:QuatV6,lower:QuatV6):HitProxyV6[]{
  const slot=sideKey(side),rig=c.arms[side],rest=c.proxies.find(p=>p.slot===slot)!,mount=c.mounts[slot],base=eulerQuatV6(mount.rotation),restElbow=add(shoulder,rotateQuatV6(rig.upper,base));
  return [capsule(slot,shoulder,elbow,rig.upperRadius,{segment:"upper",origin:shoulder,restOrigin:shoulder,rotation:multiplyQuatV6(upper,inverseQuatV6(base)),restCenter:rest.center,restHalf:rest.half}),capsule(slot,elbow,grip,rig.lowerRadius,{segment:"lower",origin:elbow,restOrigin:restElbow,rotation:multiplyQuatV6(lower,inverseQuatV6(base)),restCenter:rest.center,restHalf:rest.half})];
}
/** Exact rest pose, including authored joint bend and mount rotation. */
export function restArmPoseV6(c:CollisionSnapshotV6,side:"left"|"right"):ArmPoseV6 {
  const rig=c.arms[side],mount=c.mounts[sideKey(side)],q=eulerQuatV6(mount.rotation),shoulder=[...mount.position] as Vec3,elbow=add(shoulder,rotateQuatV6(rig.upper,q)),grip=add(elbow,rotateQuatV6(rig.lower,q));
  return {shoulder,elbow,grip,requestedGrip:[...grip],gripError:0,upperQuaternion:q,elbowQuaternion:[...identity],handQuaternion:[...identity],orientation:q,proxies:proxies(c,side,shoulder,elbow,grip,q,q)};
}
/** Bounded two-link IK. An unreachable target moves the actual hand, never stretches a limb. */
export function solveArmPoseV6(c:CollisionSnapshotV6,side:"left"|"right",requestedGrip:Vec3,orientation:QuatV6):ArmPoseV6 {
  const rig=c.arms[side],shoulder=[...c.mounts[sideKey(side)].position] as Vec3,a=length3(rig.upper),b=length3(rig.lower),delta=subtract(requestedGrip,shoulder),distance=length3(delta),dir=distance>1e-8?scale(delta,1/distance):normalize(add(rig.upper,rig.lower)),d=clamp(distance,Math.abs(a-b)+.001,a+b-.001),grip=add(shoulder,scale(dir,d));
  let pole=subtract(rig.pole,scale(dir,dotV6(rig.pole,dir)));if(length3(pole)<1e-8)pole=crossV6(dir,Math.abs(dir[0])<.8?[1,0,0]:[0,1,0]);pole=normalize(pole);
  const along=(a*a-b*b+d*d)/(2*d),spread=Math.sqrt(Math.max(0,a*a-along*along)),elbow=add(shoulder,add(scale(dir,along),scale(pole,spread))),upper=fromVectorsQuatV6(rig.upper,subtract(elbow,shoulder)),lower=fromVectorsQuatV6(rig.lower,subtract(grip,elbow));
  return {shoulder,elbow,grip,requestedGrip:[...requestedGrip],gripError:length3(subtract(grip,requestedGrip)),upperQuaternion:upper,elbowQuaternion:multiplyQuatV6(inverseQuatV6(upper),lower),handQuaternion:multiplyQuatV6(inverseQuatV6(lower),orientation),orientation,proxies:proxies(c,side,shoulder,elbow,grip,upper,lower)};
}
/** Preserve the striking normal; choose the remaining roll that brings the grip nearest its shoulder. */
export function weaponGripPoseV6(c:CollisionSnapshotV6,weapon:WeaponProxyV6,side:"left"|"right",sample:{point:Vec3;normal:Vec3;roll?:number}):WeaponGripPoseV6 {
  const mirror=(v:Vec3):Vec3=>side==="left"?[-v[0],v[1],v[2]]:[...v],offset=mirror(subtract(weapon.strikePoint,weapon.grip)),normal=normalize(sample.normal),base=fromVectorsQuatV6(mirror(weapon.strikeNormal),normal),rotated=rotateQuatV6(offset,base),shoulder=c.mounts[sideKey(side)].position;
  const projection=subtract(rotated,scale(normal,dotV6(rotated,normal))),toward=subtract(sample.point,shoulder),wanted=subtract(toward,scale(normal,dotV6(toward,normal)));
  const roll=sample.roll!==undefined?sample.roll/1000:length3(projection)>1e-8&&length3(wanted)>1e-8?Math.atan2(dotV6(normal,crossV6(projection,wanted)),dotV6(projection,wanted)):0,orientation=multiplyQuatV6(axisQuatV6(normal,roll),base),desired=subtract(sample.point,rotateQuatV6(offset,orientation)),pose=solveArmPoseV6(c,side,desired,orientation),origin=subtract(pose.grip,rotateQuatV6(mirror(weapon.grip),orientation));
  return {...pose,strikePoint:add(pose.grip,rotateQuatV6(offset,orientation)),requestedStrikePoint:[...sample.point],strikeNormal:normal,weaponOrigin:origin};
}
/** Exact barrel-ray aiming from an eccentric muzzle. The grip stays on its real hand or body mount. */
export function aimGunMountV6(c:CollisionSnapshotV6,weapon:WeaponProxyV6,mount:"left"|"right"|"shoulder",target?:Vec3):GunMountPoseV6 {
  const side=mount==="left"?"left":"right",frame=c.mounts[mount==="shoulder"?"shoulderR":side==="left"?"armL":"armR"],rest=mount==="shoulder"?undefined:restArmPoseV6(c,side),grip=rest?.grip??frame.position,mirror=(v:Vec3):Vec3=>mount==="left"?[-v[0],v[1],v[2]]:[...v],offset=mirror(subtract(weapon.muzzle,weapon.grip)),base=eulerQuatV6(frame.rotation);
  let orientation=base,aimable=true;
  if(target){const delta=rotateQuatV6(subtract(target,grip),inverseQuatV6(base)),d2=dotV6(delta,delta),xy2=offset[0]*offset[0]+offset[1]*offset[1],depth=Math.sqrt(Math.max(0,d2-xy2)),yaw=Math.atan2(delta[0],delta[2]),pitch=Math.atan2(delta[1],Math.hypot(delta[0],delta[2]));aimable=d2>xy2&&depth>offset[2]+1&&Math.abs(yaw)<(mount==="shoulder"?.65:.85)&&Math.abs(pitch)<1.05;
    const bounded:Vec3=[Math.sin(clamp(yaw,mount==="shoulder"?-.65:-.85,mount==="shoulder"?.65:.85))*Math.cos(clamp(pitch,-1.05,1.05)),Math.sin(clamp(pitch,-1.05,1.05)),Math.cos(clamp(yaw,mount==="shoulder"?-.65:-.85,mount==="shoulder"?.65:.85))*Math.cos(clamp(pitch,-1.05,1.05))];
    orientation=multiplyQuatV6(base,fromVectorsQuatV6([offset[0],offset[1],depth],scale(bounded,Math.sqrt(d2))));
  }
  const arm=rest?solveArmPoseV6(c,side,grip,orientation):undefined,actualGrip=arm?.grip??grip,weaponOrigin=subtract(actualGrip,rotateQuatV6(mirror(weapon.grip),orientation));
  return {weaponOrigin,orientation,muzzle:add(actualGrip,rotateQuatV6(offset,orientation)),forward:rotateQuatV6([0,0,1],orientation),aimable,...(arm?{arm}:{})};
}
/** A contact on an animated arm is stored in its canonical rest space for persistent damage. */
export function unposeContactV6(proxy:HitProxyV6,point:Vec3,normal:Vec3):{point:Vec3;normal:Vec3;center:Vec3;half:Vec3}{const p=proxy.pose;return p?{point:add(p.restOrigin,rotateQuatV6(subtract(point,p.origin),inverseQuatV6(p.rotation))),normal:rotateQuatV6(normal,inverseQuatV6(p.rotation)),center:p.restCenter,half:p.restHalf}:{point,normal,center:proxy.center,half:proxy.half};}
