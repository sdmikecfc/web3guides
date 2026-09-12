import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BODY_SOCKETS_V6,add,aimGunMountV6,normalize,sweepWeaponSegmentV6,createFightV6,dotV6,fighterPoseV6,footprintSupportV6,fromVectorsQuatV6,length3,multiplyQuatV6,presetV6,restArmPoseV6,rotateQuatV6,sampleWeaponPathV6,scale,solveArmPoseV6,subtract,sweepMovingCapsuleV6,sweepRobotV6,weaponGripPoseV6,type HitProxyV6,type QuatV6,type Vec3 } from "../src/lib/bots/v6";
import { HERO_COLLISION_VERSION_V6 } from "../src/lib/bots/v6/hero-collision";

const close=(a:Vec3,b:Vec3,tolerance=.01)=>assert.ok(length3(subtract(a,b))<=tolerance,`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
let groups=0;
function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
const heroes=(["tank","speed","ranged"] as const).map(style=>presetV6(style,3,{signature:true,collisionVersion:HERO_COLLISION_VERSION_V6}));
check("saved arm vectors match each actual glTF elbow and hand translation",()=>{
  const assetRoot=process.env.BOTS_V6_ASSET_ROOT??path.resolve(__dirname,"../public/bots-art/3d/season-v6");
  for(const b of heroes){const file=readFileSync(path.join(assetRoot,`${b.parts.torso.family}.t3.glb`)),json=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString("utf8")) as {nodes:{name:string;translation?:number[]}[]};
    for(const side of ["left","right"] as const){const suffix=side==="left"?"L":"R",find=(name:string)=>json.nodes.find(n=>n.name.replace(/\.\d+$/,"")===name)!;assert.ok(find(`arm${suffix}_elbow`));assert.ok(find(`hand${suffix}`));close(b.collision.arms[side].upper,scale(find(`arm${suffix}_elbow`).translation as Vec3,1000));close(b.collision.arms[side].lower,scale(find(`hand${suffix}`).translation as Vec3,1000));}
  }
});
check("pure quaternions reconstruct the same bounded two-link arm, even for unreachable requests",()=>{
  for(const b of heroes)for(const side of ["left","right"] as const)for(const target of [[0,1800,700],[2500,3000,2000],[0,0,0]] as Vec3[]){const q:QuatV6=fromVectorsQuatV6([0,0,1],[.5,-.2,.8]),p=solveArmPoseV6(b.collision,side,target,q),rig=b.collision.arms[side];close(add(p.shoulder,rotateQuatV6(rig.upper,p.upperQuaternion)),p.elbow);const lower=multiplyQuatV6(p.upperQuaternion,p.elbowQuaternion);close(add(p.elbow,rotateQuatV6(rig.lower,lower)),p.grip);close(rotateQuatV6([0,0,1],multiplyQuatV6(lower,p.handQuaternion)),rotateQuatV6([0,0,1],q));assert.ok(Math.abs(length3(subtract(p.elbow,p.shoulder))-length3(rig.upper))<.01);assert.ok(Math.abs(length3(subtract(p.grip,p.elbow))-length3(rig.lower))<.01);assert.ok(p.gripError>=0);}
});
check("live arm capsules sweep through a stationary projectile and map damage back to rest",()=>{
  const hit=sweepMovingCapsuleV6([0,500,0],[0,500,0],[-300,0,0],[-300,1000,0],[300,0,0],[300,1000,0],30,5);assert.ok(hit&&hit.t>.4&&hit.t<.5);
  const b=heroes[0],pose=solveArmPoseV6(b.collision,"right",[1000,1850,550],fromVectorsQuatV6([0,0,1],[0,1,0])),rest=restArmPoseV6(b.collision,"right"),p=pose.proxies[1],mid=scale(add(p.a!,p.b!),.5),normal:Vec3=[1,0,0],contact=sweepRobotV6(add(mid,scale(normal,600)),mid,{x:0,z:0,yaw:0},{x:0,z:0,yaw:0},[p],[1,1,1,1,1,1],0,[p]);assert.ok(contact?.slot==="armR");assert.notDeepEqual(p.a,rest.proxies[1].a);assert.ok(contact.localPoint.every(Number.isFinite));assert.equal(pose.proxies.length,2);
});
check("posed robot, weapon grip and authored striking normal agree on both sides",()=>{
  for(const b of heroes.slice(0,2))for(const side of ["left","right"] as const)for(let i=0;i<=100;i++){const sample=sampleWeaponPathV6(b.collision.weapon,i/100,side),p=weaponGripPoseV6(b.collision,b.collision.weapon,side,sample),mirror=(v:Vec3):Vec3=>side==="left"?[-v[0],v[1],v[2]]:v;close(add(p.weaponOrigin,rotateQuatV6(mirror(b.collision.weapon.grip),p.orientation)),p.grip);close(add(p.weaponOrigin,rotateQuatV6(mirror(b.collision.weapon.strikePoint),p.orientation)),p.strikePoint);assert.ok(dotV6(rotateQuatV6(mirror(b.collision.weapon.strikeNormal),p.orientation),p.strikeNormal)>.99999);}
  const s=createFightV6(2,heroes[0],heroes[1]),p=fighterPoseV6(s,0);assert.equal(p.proxies.filter(v=>v.slot==="armR").length,2);assert.equal(new Set(p.proxies.map(v=>v.slot)).size,BODY_SOCKETS_V6.length);assert.ok(footprintSupportV6(p.proxies,s.fighters[0].armour,[0,0,1])>0);
});
check("articulated gun muzzles lie on the real barrel ray and keep both arm segments attached",()=>{
  const b=heroes[2];for(const mount of ["left","right","shoulder"] as const)for(const target of [[0,1600,4000],[1000,2100,5000],[-1000,600,4500]] as Vec3[]){const proxy={...b.collision.weapon,muzzle:mount==="shoulder"?b.collision.weapon.muzzle:[0,130,590] as Vec3},p=aimGunMountV6(b.collision,proxy,mount,target),localMuzzle:Vec3=mount==="left"?[-proxy.muzzle[0],proxy.muzzle[1],proxy.muzzle[2]]:proxy.muzzle;assert.ok(p.aimable);close(add(p.weaponOrigin,rotateQuatV6(localMuzzle,p.orientation)),p.muzzle);assert.ok(dotV6(normalize(subtract(target,p.muzzle)),p.forward)>.9999999);if(p.arm){assert.ok(p.arm.gripError<.01);close(rotateQuatV6([0,0,1],multiplyQuatV6(multiplyQuatV6(p.arm.upperQuaternion,p.arm.elbowQuaternion),p.arm.handQuaternion)),p.forward);}}
  assert.equal(aimGunMountV6(b.collision,b.collision.weapon,"shoulder",[0,1800,-2000]).aimable,false);
});
check("the entire sharp blade edge sweeps small targets that both end-point paths miss",()=>{
  const root={x:0,z:0,yaw:0},box:HitProxyV6={slot:"torso",shape:"box",center:[0,500,0],half:[20,20,20]},oldA:Vec3=[-500,0,0],oldB:Vec3=[-500,1000,0],a:Vec3=[500,0,0],b:Vec3=[500,1000,0],alive=[1,1,1,1,1,1];assert.equal(sweepRobotV6(oldA,a,root,root,[box],alive,10),null);assert.equal(sweepRobotV6(oldB,b,root,root,[box],alive,10),null);const hit=sweepWeaponSegmentV6(oldA,oldB,a,b,root,root,[box],alive,10);assert.ok(hit&&hit.t>.46&&hit.t<.48&&hit.slot==="torso");
  const before:HitProxyV6={slot:"armR",shape:"capsule",a:[-500,400,0],b:[-500,600,0],radius:20,center:[-500,500,0],half:[20,120,20]},after:HitProxyV6={...before,a:[500,400,0],b:[500,600,0],center:[500,500,0]};const moving=sweepWeaponSegmentV6([0,0,0],[0,1000,0],[0,0,0],[0,1000,0],root,root,[after],alive,10,[before]);assert.ok(moving&&moving.t>.46&&moving.t<.48);
});
const errors:{style:string;maxGripErrorMm:number;phase:number;targetHeight:number|null}[]=[];
for(const b of heroes.slice(0,2)){let max=0,at=0,height:number|null=null;for(const side of ["left","right"] as const)for(const targetHeight of [undefined,1100,1500,1900,2500])for(let i=0;i<=200;i++){const sample=sampleWeaponPathV6(b.collision.weapon,i/200,side,targetHeight),pose=weaponGripPoseV6(b.collision,b.collision.weapon,side,sample);if(pose.gripError>max){max=pose.gripError;at=i/200;height=targetHeight??null;}}errors.push({style:b.style,maxGripErrorMm:max,phase:at,targetHeight:height});}
console.log(JSON.stringify({groups,authoredReach:errors}));
if(process.env.BOTS_V6_REQUIRE_AUTHORED_REACH!=="0")assert.ok(errors.every(e=>e.maxGripErrorMm<1),"Authored hero paths must be reachable within 1mm; no limb stretching or phantom contact is permitted.");
