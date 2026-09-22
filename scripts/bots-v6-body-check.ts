import assert from "node:assert/strict";
import {snapshotBuildV6,applyControlV6,bodyPointV6,cloneV6,createFightV6,fighterPoseV6,hashV6,inverseQuatV6,knockdownAmountV6,presetV6,rotateQuatV6,stepFightV6,sweepMovingBoxV6,sweepRobotV6,unposeContactV6,type HitProxyV6,type Vec3} from "../src/lib/bots/v6";
import {HERO_COLLISION_VERSION_V6} from "../src/lib/bots/v6/hero-collision";
let groups=0;const check=(name:string,run:()=>void)=>{run();groups++;console.log(`PASS ${name}`);};
const near=(a:readonly number[],b:readonly number[],epsilon=.001)=>assert(Math.hypot(...a.map((n,i)=>n-b[i]))<epsilon,`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const poseState=(style:"tank"|"speed"|"ranged")=>createFightV6(773,presetV6(style,3,{signature:true,collisionVersion:HERO_COLLISION_VERSION_V6}),presetV6("tank",3,{signature:true,collisionVersion:HERO_COLLISION_VERSION_V6}),{autoSpecial:[false,false]});
check("all three heroes fall and get up in exactly 72 ticks, retaining canonical damage coordinates",()=>{
 for(const style of ["tank","speed","ranged"] as const){const state=poseState(style),initial=fighterPoseV6(state,0);near(initial.body.translation,[0,0,0]);near(initial.body.orientation,[0,0,0,1]);applyControlV6(state,0,"knockdown",1);
  for(let frame=0;frame<=72;frame++){state.frame=frame;const p=fighterPoseV6(state,0),q=cloneV6(state);assert.equal(hashV6(p),hashV6(fighterPoseV6(q,0)));for(const proxy of p.proxies){const original=state.builds[0].collision.proxies.find(item=>item.slot===proxy.slot)!;assert(proxy.center.every(Number.isFinite));const contact=unposeContactV6(proxy,proxy.center,[0,1,0]);if(proxy.slot==="torso"||proxy.slot==="head")near(contact.point,original.center);}
   const torso=p.proxies.find(item=>item.slot==="torso")!;near(torso.center,bodyPointV6(p.body,state.builds[0].collision.proxies[1].center));assert(p.body.knockdown>=0&&p.body.knockdown<=1);
  }near(fighterPoseV6(state,0).body.translation,[0,0,0]);near(fighterPoseV6(state,0).body.orientation,[0,0,0,1]);assert.equal(knockdownAmountV6(12,72),1);assert.equal(knockdownAmountV6(36,72),1);assert.equal(knockdownAmountV6(72,72),0);
 }
});
check("prone body really leaves the standing shot line and can be hit on the ground",()=>{
 const state=poseState("tank"),upright=fighterPoseV6(state,0).proxies.filter(p=>p.slot==="torso"),at={x:0,z:0,yaw:0};assert(sweepRobotV6([-3000,1640,20],[3000,1640,20],at,at,upright,state.fighters[0].armour));
 applyControlV6(state,0,"knockdown",1);state.frame=24;const prone=fighterPoseV6(state,0).proxies.filter(p=>p.slot==="torso"),center=prone[0].center;assert.equal(sweepRobotV6([-3000,1640,20],[3000,1640,20],at,at,prone,state.fighters[0].armour),null);const hit=sweepRobotV6([-3000,center[1],center[2]],[3000,center[1],center[2]],at,at,prone,state.fighters[0].armour);assert(hit);assert.equal(hit.slot,"torso");assert(hit.localPoint.every(Number.isFinite));
});
check("a rotating body sweeps a stationary projectile instead of teleporting past it",()=>{
 const old:HitProxyV6={slot:"torso",shape:"box",center:[0,0,0],half:[100,1000,100],orientation:[0,0,0,1]},q=Math.sin(Math.PI/4),current:HitProxyV6={...old,orientation:[q,0,0,q]};
 const hit=sweepMovingBoxV6([0,600,600],[0,600,600],old,current,10);assert(hit&&hit.t>.2&&hit.t<.8);assert.equal(sweepMovingBoxV6([0,1600,1600],[0,1600,1600],old,current,10),null);
});
check("rigid hip motion moves the same leg capsule; missing legs cannot take steps",()=>{
 const state=poseState("speed");state.fighters[0].moveX=60;state.fighters[0].gait=.8;const p=fighterPoseV6(state,0),leg=p.legs.left,rest=state.builds[0].collision.proxies.find(item=>item.slot==="legL")!,mount=state.builds[0].collision.mounts.legL.position;
 const expected=rest.b!.map((n,i)=>n-mount[i]) as Vec3,rotated=rotateQuatV6(expected,leg.hipQuaternion);near(leg.proxy.b!,rotated.map((n,i)=>n+mount[i]));assert(Math.abs(leg.hipQuaternion[0])+Math.abs(leg.hipQuaternion[2])>.01);
 state.fighters[0].armour[4]=0;near(fighterPoseV6(state,0).legs.left.hipQuaternion,[0,0,0,1]);
});
check("falling at the arena wall keeps the solid body inside without an invalid jump",()=>{
 const state=poseState("tank");state.fighters[0].x=state.fighters[0].arenaLimit;state.fighters[0].z=0;state.fighters.forEach(f=>f.nextAction=99999);applyControlV6(state,0,"knockdown",1);
 for(let frame=0;frame<72;frame++){const before=state.fighters.map(f=>[f.x,f.z]);stepFightV6(state);for(let i=0;i<2;i++){const f=state.fighters[i];assert(Math.hypot(f.x,f.z)<=f.arenaLimit+1);assert(Math.hypot(f.x-before[i][0],f.z-before[i][1])<650);}}
});
check("mixed tall bodies and short legs share the authored floor instead of hovering",()=>{
 for(const style of ["tank","speed","ranged"] as const)for(const bodyTier of [1,4] as const)for(const legTier of [1,4] as const){const body=presetV6(style,bodyTier),legs=presetV6(style,legTier),raw=cloneV6(body.appearanceBuild);raw.limbs!.legL=legs.appearanceBuild.limbs!.legL;raw.limbs!.legR=legs.appearanceBuild.limbs!.legR;const b=snapshotBuildV6(raw),s=createFightV6(4,b,b),p=fighterPoseV6(s,0),floor=Math.min(...p.proxies.map(v=>v.shape==="capsule"?Math.min(v.a![1],v.b![1])-v.radius!:v.center[1]-v.half[1]));assert(Math.abs(floor-b.collision.floorY)<.01);if(bodyTier>legTier)assert(p.body.translation[1]<-100);if(bodyTier<legTier)assert(p.body.translation[1]>100);}
});
check("a completely destroyed robot retains a finite final render frame",()=>{
 const s=createFightV6(18,presetV6("ranged",3,{signature:true}),presetV6("tank",3));s.fighters[0].armour=[0,0,0,0,0,0];const p=fighterPoseV6(s,0);assert(p.body.translation.every(Number.isFinite));assert(p.proxies.every(v=>v.center.every(Number.isFinite)));
});
console.log(JSON.stringify({ok:true,groups}));
