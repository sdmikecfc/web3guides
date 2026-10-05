import assert from "node:assert/strict";
import {acceptSpecialV6,actionPhaseV6,angle,aimErrorV6,facingV6,barrelClearV6,flameDirectionsV6,fighterPoseV6,guardingV6,sweepRobotV6,type HitProxyV6,advanceFightV6,aimGunMountV6,bodyMotionV6,bodyPointV6,cloneV6,createFightV6,incomingThreatV6,projectileAimV6,posedProxiesV6,muzzleV6,dotV6,gunMountV6,localPoint,normalize,presetV6,resolveImpactV6,runFightV6,scale,snapshotBuildV6,stepFightV6,subtract,weaponForActionV6,worldPoint,type SweepContactV6,type Vec3} from "../src/lib/bots/v6";
import {HERO_COLLISION_VERSION_V6} from "../src/lib/bots/v6/hero-collision";
let groups=0;const check=(name:string,run:()=>void)=>{run();groups++;console.log(`PASS ${name}`);};
const hero=(style:"tank"|"speed"|"ranged")=>presetV6(style,3,{signature:true,collisionVersion:HERO_COLLISION_VERSION_V6});
check("paint leaves the mechanical random stream and every event unchanged",()=>{
 const base=hero("speed"),raw=cloneV6(base.appearanceBuild);raw.head.paint="coral";const painted=snapshotBuildV6(raw,{collisionVersion:base.collisionVersion});const a=createFightV6(771,base,hero("ranged")),b=createFightV6(771,painted,hero("ranged"));assert.equal(a.fighters[0].random,b.fighters[0].random);advanceFightV6(a,1500);advanceFightV6(b,1500);assert.deepEqual(a.events,b.events);assert.deepEqual(a.fighters,b.fighters);
});
check("swapping distinct builds preserves their initial random streams and initiative",()=>{
 const tank=hero("tank"),speed=hero("speed"),a=createFightV6(1741,tank,speed),b=createFightV6(1741,speed,tank);assert.equal(a.fighters[0].random,b.fighters[1].random);assert.equal(a.fighters[1].random,b.fighters[0].random);assert.equal(a.initiative,1-b.initiative);
});
check("the barrel leads by both time since aim lock and projectile flight",()=>{
 const s=createFightV6(887,hero("ranged"),hero("tank"),{autoSpecial:[false,false]});while(!s.fighters[0].action)stepFightV6(s);const f=s.fighters[0],a=f.action!;a.aim=[0,1600,3500];a.aimVelocity=[35,0,0];f.x=0;f.z=0;f.yaw=0;a.aimFrame=s.frame-7;
 const w=weaponForActionV6(s,0,a.kind),rest=aimGunMountV6(s.builds[0].collision,w.proxy,a.mount),body=bodyMotionV6(s.builds[0].collision,{...f,frame:s.frame}).body,baseOrigin=worldPoint(bodyPointV6(body,rest.muzzle),f),flight=Math.hypot(...subtract(a.aim,baseOrigin))/w.projectileSpeed,target=a.aim.map((n,i)=>n+a.aimVelocity[i]*(flight+7)) as Vec3,gun=gunMountV6(s,0,a.kind,a.mount);
 assert(gun.aimable);assert(dotV6(normalize(subtract(target,gun.muzzle)),gun.forward)>.99999);a.aimFrame=s.frame;const stale=gunMountV6(s,0,a.kind,a.mount);assert(gun.forward[0]>stale.forward[0]+.03);
});
check("an actual fist shove connects without the arm moving the opposing chassis away first",()=>{
 const s=createFightV6(19,hero("ranged"),hero("speed"),{autoSpecial:[false,false]});while(!s.fighters[0].action&&s.frame<300)stepFightV6(s);const f=s.fighters[0],a=f.action!;assert(a);f.x=0;f.z=0;f.yaw=0;f.dashUntil=0;f.nextAction=0;f.action={...a,kind:"shove",mount:"left",started:s.frame,windup:8,active:10,recovery:20,pathActive:[...weaponForActionV6(s,0,"shove").proxy.active],aim:[0,1500,1250],aimLocal:[0,1500,0],targetHeight:1500,released:false,hitTargets:[],lastPoint:null};s.fighters[1].x=0;s.fighters[1].z=1250;s.fighters[1].yaw=3142;s.fighters[1].stunnedUntil=9999;s.fighters[1].immuneUntil=9999;advanceFightV6(s,s.frame+180);
 assert(s.events.some(e=>e.kind==="hit"&&e.who===0&&e.weapon==="shove"));assert(s.events.some(e=>e.kind==="dodge"&&e.who===0));
});
check("losing all attack mounts is an explicit defeat; a shoulder cannon still works without arms",()=>{
 const contact=(slot:"armL"|"armR"):SweepContactV6=>({t:.5,slot,point:[0,1400,0],normal:[0,0,1000],localPoint:[0,500,1000],localNormal:[0,0,1000]});
 for(const shoulder of [false,true]){const s=createFightV6(6,hero("tank"),shoulder?hero("ranged"):hero("speed"));for(const slot of ["armL","armR"] as const)resolveImpactV6(s,{who:0,weapon:"hammer",mount:"right",attackId:1,contact:contact(slot),damage:100000});assert.equal(s.done,!shoulder);if(!shoulder){assert.equal(s.events.at(-1)!.defeatReason,"disabled");assert(s.fighters[1].armour[1]>0);}else{advanceFightV6(s,300);assert(s.events.some(e=>e.kind==="shot"&&e.who===1&&e.mount==="shoulder"));}}
});
check("built-in Special equipment follows torso tier even with a cheaper weapon",()=>{
 for(const tier of [3,4] as const){const base=presetV6("ranged",tier),raw=cloneV6(base.appearanceBuild);raw.weapon=presetV6("ranged",1).appearanceBuild.weapon;const mixed=snapshotBuildV6(raw);assert.deepEqual(mixed.collision.specialMuzzle,base.collision.specialMuzzle);assert.deepEqual(mixed.collision.specialBlade,base.collision.specialBlade);assert.equal(mixed.collision.specialMuzzle[2],tier===3?450:477);}
});
check("flame rays span the real 360-milliradian cone and strike an off-axis target",()=>{
 const rays=flameDirectionsV6([0,0,1],360);assert.equal(rays.length,5);assert(Math.abs(Math.atan2(rays[0][0],rays[0][2])+.18)<1e-10);assert(Math.abs(Math.atan2(rays[4][0],rays[4][2])-.18)<1e-10);
 const center:Vec3=[Math.sin(.18)*2000,1000,Math.cos(.18)*2000],target:HitProxyV6={slot:"torso",center,half:[15,15,15]},root={x:0,z:0,yaw:0},alive=[1,1,1,1,1,1],origin:Vec3=[0,1000,0];
 const hit=(direction:Vec3)=>sweepRobotV6(origin,[direction[0]*3000,1000,direction[2]*3000],root,root,[target],alive,10);
 assert.equal(hit(rays[2]),null);assert.equal(hit(rays[4])?.slot,"torso");assert(rays.every(r=>r[2]>.98));
});
check("a blocked rifle cannot fire, while a physically clear angled shot inside 1.5m can",()=>{
 const make=(height:number)=>{const s=createFightV6(81,presetV6("ranged",3),presetV6("tank",3));while(!s.fighters[0].action&&s.frame<300)stepFightV6(s);const f=s.fighters[0],r=s.fighters[1],a=f.action!;assert(a&&a.kind==="ap_rifle");f.x=f.z=0;f.yaw=0;f.moveX=f.moveZ=0;r.x=0;r.z=1100;r.yaw=3142;r.moveX=r.moveZ=0;r.action=null;r.stunnedUntil=99999;a.aim=[0,height,1100];a.aimFrame=s.frame;a.aimVelocity=[0,0,0];a.aimError=[0,0,0];a.started=s.frame;a.windup=1;a.active=1;a.released=false;a.emissions=0;return s;};
 const blocked=make(1400),clear=make(2200);assert.equal(barrelClearV6(blocked,0,"ap_rifle","right"),false);assert.equal(barrelClearV6(clear,0,"ap_rifle","right"),true);assert(gunMountV6(clear,0,"ap_rifle","right").aimable);const b=blocked.events.length,c=clear.events.length;stepFightV6(blocked);stepFightV6(clear);assert(!blocked.events.slice(b).some(e=>e.who===0&&e.kind==="shot"));assert(clear.events.slice(c).some(e=>e.who===0&&e.kind==="shot"));
});
check("only a real available left forearm can guard, using finite strength during a right-arm attack",()=>{
 for(const tier of [1,2,3,4] as const){const s=createFightV6(391,presetV6("ranged",tier),presetV6("tank",tier),{autoSpecial:[false,false]});while(!s.fighters[1].action&&s.frame<300)stepFightV6(s);const f=s.fighters[1];assert(f.action&&f.action.mount==="right");f.x=f.z=f.yaw=0;f.guardPose=1;f.guard=20;f.stunnedUntil=f.downUntil=0;assert(guardingV6(s,1));const p=fighterPoseV6(s,1),forearm=p.proxies.find(p=>p.slot==="armL"&&p.pose?.segment==="lower")!;assert(p.arms.left.gripError<.01);const from:Vec3=[forearm.center[0],forearm.center[1],forearm.center[2]+2000],to:Vec3=[forearm.center[0],forearm.center[1],forearm.center[2]-100],contact=sweepRobotV6(from,to,f,f,[forearm],f.armour,15)!;assert(contact&&contact.slot==="armL");resolveImpactV6(s,{who:0,weapon:"ap_rifle",mount:"right",attackId:100,contact,damage:30,source:from});assert.equal(f.guard,5);assert.equal(s.events.at(-1)?.absorbed,15);f.stunnedUntil=s.frame+24;assert(!guardingV6(s,1));f.stunnedUntil=0;f.armour[2]=0;assert(!guardingV6(s,1));}
 const paired=createFightV6(1,presetV6("speed",3,{weapon:"paired_blades"}),presetV6("tank",3)),supported=createFightV6(1,presetV6("ranged",3,{collisionVersion:HERO_COLLISION_VERSION_V6}),presetV6("tank",3));assert(!guardingV6(paired,0));assert(!guardingV6(supported,0));
});
check("exhausted guard lowers and cannot be kept active by next-tick regeneration",()=>{
 const s=createFightV6(55,presetV6("tank",3),presetV6("tank",3)),f=s.fighters[1];f.x=f.z=f.yaw=0;f.guard=1;f.guardPose=1;f.nextAction=9999;s.fighters[0].nextAction=9999;
 const contact:SweepContactV6={t:.5,slot:"armL",point:[0,1400,0],normal:[0,0,1000],localPoint:[0,500,1000],localNormal:[0,0,1000]};resolveImpactV6(s,{who:0,weapon:"sword",mount:"right",attackId:1,contact,damage:8,source:[0,0,1000]});assert.equal(f.guard,0);assert.equal(f.guardRecoverAt,90);advanceFightV6(s,80);assert.equal(f.guard,0);assert.equal(f.guardPose,0);advanceFightV6(s,100);assert(f.guard>0);assert(f.guardPose>.5);
});
check("raising a forearm cannot block a burn already attached to that part",()=>{
 const s=createFightV6(5,presetV6("tank",3),presetV6("tank",3)),f=s.fighters[1];f.x=f.z=f.yaw=0;f.guard=20;f.guardPose=1;s.stats[1].plating[2]=0;const contact:SweepContactV6={t:0,slot:"armL",point:[0,1400,0],normal:[0,0,1000],localPoint:[0,500,1000],localNormal:[0,0,1000]};assert.equal(resolveImpactV6(s,{who:0,weapon:"flamethrower",mount:"right",attackId:1,contact,damage:2,burnTick:true,source:[0,0,1000]}),2);assert.equal(f.guard,20);assert.equal(s.events.at(-1)?.kind,"burn");
});
check("the ending flank travels around a chassis and can make real rear contact inside its one-second window",()=>{
 for(const tier of [3,4] as const){const s=createFightV6(718,presetV6("speed",tier),presetV6("tank",tier),{autoSpecial:[false,false]}),f=s.fighters[0],r=s.fighters[1];f.meter=100;assert(acceptSpecialV6(s,{id:"flank",who:0,kind:"special",frame:0}).accepted);f.nextAction=9999;r.nextAction=9999;r.stunnedUntil=9999;advanceFightV6(s,239);f.x=r.x=r.z=0;f.z=1500;f.yaw=3142;r.yaw=0;f.moveX=f.moveZ=r.moveX=r.moveZ=0;let rear=false,rearHit=false,maxStep=0;
  while(s.frame<300){const x=f.x,z=f.z,count=s.events.length;stepFightV6(s);maxStep=Math.max(maxStep,Math.hypot(f.x-x,f.z-z));const behind=!facingV6(r,f.x,f.z,-.35);rear ||= behind;rearHit ||= behind&&s.events.slice(count).some(e=>e.who===0&&e.weapon==="special_flank"&&(e.kind==="hit"||e.kind==="block"));assert(Math.hypot(f.x-r.x,f.z-r.z)>650);}
  assert(rear,`T${tier} reaches the rear`);assert(rearHit,`T${tier} makes geometric rear contact`);assert(maxStep<400);assert.equal(f.special,null);
 }
});
check("a charge moves along its real bounded facing instead of homing sideways",()=>{
 const s=createFightV6(92,presetV6("tank",3),presetV6("speed",3),{autoSpecial:[false,false]}),f=s.fighters[0],r=s.fighters[1];f.meter=100;assert(acceptSpecialV6(s,{id:"charge",who:0,kind:"special",frame:0}).accepted);f.nextAction=r.nextAction=9999;r.stunnedUntil=9999;advanceFightV6(s,257);assert.equal(f.action?.special,"charge");f.x=f.z=f.yaw=0;f.moveX=f.moveZ=0;r.x=2500;r.z=0;r.moveX=r.moveZ=0;stepFightV6(s);const distance=Math.hypot(f.x,f.z);assert(distance>0);assert(Math.abs(f.yaw)<=s.stats[0].turnRate);assert(dotV6(normalize([f.x,0,f.z]),[Math.sin(f.yaw/1000),0,Math.cos(f.yaw/1000)])>.999);assert(f.z>f.x*4);
});
check("the complete cannon kit keeps its inactive backup attached to the right hand",()=>{
 for(const tier of [3,4] as const){const s=createFightV6(931,presetV6("ranged",tier,{weapon:"shoulder_cannon"}),presetV6("tank",tier),{autoSpecial:[false,false]});for(const prepared of [false,true]){if(prepared){while(!s.fighters[0].action&&s.frame<300)stepFightV6(s);assert.equal(s.fighters[0].action?.kind,"shoulder_cannon");}const pose=fighterPoseV6(s,0),mount=pose.mounts.right;assert(mount);assert(pose.mounts.shoulder);assert(mount.weaponOrigin[1]>500);assert(Math.hypot(...subtract(mount.weaponOrigin,pose.arms.right.grip))<.01);const expected=gunMountV6(s,0,"backup_pistol","right");assert.deepEqual(mount.muzzle,expected.muzzle);assert.deepEqual(mount.orientation,expected.orientation);}}
});
check("a lost rifle arm switches movement to the surviving fist instead of waiting at rifle range",()=>{
 const b=presetV6("ranged",4),s=createFightV6(435631378,b,b,{autoSpecial:[false,false]});s.fighters.forEach(f=>f.armour[3]=0);advanceFightV6(s,900);assert(s.events.some(e=>e.weapon==="punch"&&(e.kind==="hit"||e.kind==="block")));assert(!s.events.some(e=>e.kind==="shot"));while(!s.done)stepFightV6(s);assert(s.frame<5400);assert(s.events.some(e=>e.weapon==="punch"&&e.mount==="left"));
});
check("ordinary hammer critical contact adds impact without random stun or knockdown",()=>{
 const s=createFightV6(27,presetV6("tank",3),presetV6("tank",3),{autoSpecial:[false,false]});while(!s.done&&s.frame<1200){for(const f of s.fighters)if(f.action?.kind==="hammer")f.action.critical=true;stepFightV6(s);}assert(s.events.some(e=>e.weapon==="hammer"&&e.critical&&(e.kind==="hit"||e.kind==="block")));assert(!s.events.some(e=>e.kind==="knockdown"||e.kind==="stun"));
});
check("Balanced shield recognizes an actual rifle windup at standoff and ignores an empty reload",()=>{
 const s=createFightV6(391,presetV6("tank",3),presetV6("ranged",3),{autoSpecial:[false,false]});while(!s.fighters[1].action&&s.frame<400)stepFightV6(s);const f=s.fighters[0],r=s.fighters[1],a=r.action!;assert.equal(a.kind,"ap_rifle");f.x=f.z=0;f.yaw=0;r.x=0;r.z=3800;r.yaw=3142;a.aim=[0,1500,0];a.aimFrame=s.frame;a.aimVelocity=[0,0,0];a.started=s.frame;a.windup=20;a.active=1;a.recovery=40;assert(incomingThreatV6(s,0));a.started=s.frame-22;s.projectiles=[];assert(!incomingThreatV6(s,0));a.started=s.frame;f.meter=100;s.autoSpecial[0]=true;stepFightV6(s);assert.equal(f.special?.style,"tank");assert(Math.hypot(f.x-r.x,f.z-r.z)>3200);
});
check("Balanced Overdrive responds to an active shield, not an opponent merely holding meter",()=>{
 for(const active of [false,true]){const s=createFightV6(17,presetV6("speed",3),presetV6("tank",3),{autoSpecial:[true,false]}),f=s.fighters[0],r=s.fighters[1];f.x=f.z=0;r.x=0;r.z=2000;f.yaw=0;r.yaw=3142;f.meter=r.meter=100;r.nextAction=9999;if(active)assert(acceptSpecialV6(s,{id:"shield",who:1,kind:"special",frame:0}).accepted);stepFightV6(s);assert.equal(Boolean(f.special),!active);}
});
check("a prepared rifle can aim at a physically exposed point without shooting through forearm cover",()=>{
 const s=createFightV6((0x19e52103+104729+8191)>>>0,presetV6("speed",1),presetV6("ranged",1),{autoSpecial:[true,true]}),r=s.fighters[0];let proved=false;
 while(!s.done&&!proved){stepFightV6(s);const a=s.fighters[1].action;if(a?.kind!=="ap_rifle"||a.aimSlot!=="torso"||a.started+a.windup-s.frame<=7)continue;const proxies=posedProxiesV6(s,0),part=proxies.find(p=>p.slot==="torso")!,center=worldPoint(part.center,r),origin=muzzleV6(s,1,a.kind,a.mount),covered=sweepRobotV6(origin,center,r,r,proxies,r.armour,14);if(!covered||covered.slot==="torso")continue;const point=projectileAimV6(s,1,a.kind,a.mount,part);if(Math.hypot(...subtract(point,center))<1)continue;const old=a.aim;a.aim=point;a.aimFrame=s.frame;a.aimVelocity=[0,0,0];const hit=sweepRobotV6(muzzleV6(s,1,a.kind,a.mount),point,r,r,proxies,r.armour,14);a.aim=old;assert.equal(hit?.slot,"torso");proved=true;
 }assert(proved,"The real moving forearm occlusion fixture must be exercised");
});
check("every accuracy point narrows the cone, including an actual tier1 head swap",()=>{
 let previous=Infinity;for(let accuracy=0;accuracy<=24;accuracy++){const error=aimErrorV6(accuracy);assert(Number.isFinite(error)&&error>=77&&error<=105);assert(error<previous);previous=error;}
 let oldAccuracy=-1,oldCone=Infinity,oldError=Infinity,oldPreparation=Infinity;for(const style of ["tank","speed","ranged"] as const){const raw=cloneV6(presetV6("ranged",1).appearanceBuild);raw.head=presetV6(style,1).appearanceBuild.head;const b=snapshotBuildV6(raw),s=createFightV6(916,b,presetV6("tank",1),{autoSpecial:[false,false]}),f=s.fighters[0],r=s.fighters[1];f.x=f.z=f.yaw=0;r.x=0;r.z=4000;r.yaw=3142;f.random=991;f.nextAction=0;f.nextDodge=9999;r.nextAction=9999;r.stunnedUntil=9999;stepFightV6(s);const a=f.action!;assert.equal(a.kind,"ap_rifle");assert(b.stats.acc>oldAccuracy&&b.stats.aimError<oldCone);assert(Math.abs(a.aimError[0])<oldError);assert(a.windup<=oldPreparation);oldAccuracy=b.stats.acc;oldCone=b.stats.aimError;oldError=Math.abs(a.aimError[0]);oldPreparation=a.windup;}
});
check("approach and recovery face the rival, while a prepared melee stance obeys the turn limit and keeps its grip",()=>{
 for(const style of ["tank","speed"] as const)for(const tier of [1,2,3,4] as const){
  const s=createFightV6(312,presetV6(style,tier),presetV6("ranged",tier),{autoSpecial:[false,false]}),f=s.fighters[0],r=s.fighters[1];f.x=f.z=f.yaw=0;r.x=0;r.z=5000;r.yaw=3142;r.stunnedUntil=99999;r.nextAction=99999;f.nextAction=99999;f.nextDodge=99999;
  for(let i=0;i<12;i++){const before=f.yaw;stepFightV6(s);assert(Math.abs(angle((f.yaw-before)/1000))*1000<=s.stats[0].turnRate+1);assert(Math.abs(angle(Math.atan2(r.x-f.x,r.z-f.z)-f.yaw/1000))<.002);}
  f.x=f.z=f.yaw=0;r.x=0;r.z=1700;f.nextAction=0;let preparation=0,contact=0,recovery=0,largestTurn=0,returnError=Infinity;
  for(let i=0;i<150&&!s.done;i++){const before=f.yaw;stepFightV6(s);largestTurn=Math.max(largestTurn,Math.abs(angle((f.yaw-before)/1000))*1000);const a=f.action;if(!a)continue;const phase=actionPhaseV6(a,s.frame),pose=fighterPoseV6(s,0);if(phase==="preparation")preparation++;if(phase==="contact")contact++;if(phase==="recovery"){recovery++;returnError=Math.min(returnError,Math.abs(angle(Math.atan2(r.x-f.x,r.z-f.z)-f.yaw/1000)));}
   const mount=pose.mounts[a.mount];if(mount&&a.mount!=="shoulder"){assert(Math.hypot(...subtract(mount.weaponOrigin,pose.arms[a.mount].grip))<.01);assert(mount.weaponOrigin.every(Number.isFinite));}
  }
  assert(preparation>0&&contact>0&&recovery>0);assert(largestTurn<=s.stats[0].turnRate+1);assert(returnError<.05);
 }
});
console.log(JSON.stringify({ok:true,groups}));
