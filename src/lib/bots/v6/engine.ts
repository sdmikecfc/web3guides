/** Version 6: all contacts and decisions come from fixed, seeded simulation ticks. */
import { snapshotBuildV6,validBuildV6 } from "./build";
import { BODY_SOCKETS_V6,footprintSupportV6,footprintRadiusV6,sampleWeaponPathV6,sweepRobotV6,sweepWeaponSegmentV6,type HitProxyV6,type SweepContactV6 } from "./collision";
import { add,angle,clamp,cloneV6,deepFreeze,dotV6,hashV6,lerp,localPoint,normalize,randomV6,rotateQuatV6,rotateY,rounded,scale,subtract,worldPoint,type Vec3 } from "./math";
import { aimGunMountV6,guardArmPoseV6,restArmPoseV6,weaponGripPoseV6,type ArmPoseV6,type GunMountPoseV6,type WeaponGripPoseV6 } from "./pose";
import { bodyMotionV6,bodyFromProxiesV6,bodyPointV6,bodyDirectionV6,unbodyPointV6,transformProxyV6,type BodyFrameV6,type RigidLegPoseV6 } from "./body-pose";
import { WEAPONS_V6 } from "./weapons";
import type { ActionV6,AttackKindV6,BodySocketV6,BuildV6,DefensePlanV6,EventKindV6,EventV6,FighterV6,FightOptionsV6,MountV6,ProjectileV6,ResultV6,SideV6,SpecialCommandV6,SpecialReceiptV6,StateV6,WeaponDefinitionV6 } from "./types";
export const FPS_V6=60,MAX_FRAMES_V6=5400,ARENA_RADIUS_V6=6500;
export const DEFENSE_PLANS_V6=deepFreeze([{id:"early",name:"Early",description:"Use Special as soon as it is ready."},{id:"balanced",name:"Balanced",description:"Save Special for a useful attack or defence window."},{id:"last-stand",name:"Last stand",description:"Save Special until body durability is below 40%."}] as const);
export const RULES_V6=deepFreeze({version:6,rulesVersion:"mk6-2",catalogVersion:"mk6-catalog-1",fps:60,maxFrames:5400,arenaRadius:6500,specialFrames:300,meterPerSecond:5,damageMeterCap:40,shieldReduction:.9,shieldBodyCap:.35,speedMove:1.5,speedAttack:1.2,speedDamage:1.25,speedEvasion:15,evasionCap:60,slow:.3,platingCap:.35,apBypass:.5,stunFrames:24,knockdownFrames:72,recoveryProtection:120,burnFrames:150,burnPulse:30,heatCapacity:100,handAimYaw:850,shoulderAimYaw:650,aimPitch:1050} as const);
const other=(who:SideV6)=>(1-who) as SideV6;
const root=(f:FighterV6)=>({x:f.x,z:f.z,yaw:f.yaw});
const legs=(f:FighterV6)=>Number(f.armour[4]>0)+Number(f.armour[5]>0);
const workingArm=(f:FighterV6,mount:MountV6)=>mount==="shoulder"?f.armour[1]>0:f.armour[mount==="left"?2:3]>0;
const speedActive=(f:FighterV6)=>f.special?.style==="speed";
function emit(s:StateV6,kind:EventKindV6,who:SideV6,extra:Partial<EventV6>={}):EventV6 {const e:EventV6={id:s.events.length,frame:s.frame,kind,who,target:other(who),...extra};s.events.push(e);return e;}
export const controlledV6=(s:StateV6,who:SideV6)=>s.fighters[who].stunnedUntil>s.frame||s.fighters[who].downUntil>s.frame;
export function facingV6(f:FighterV6,x:number,z:number,cosine=.35):boolean {const dx=x-f.x,dz=z-f.z,d=Math.hypot(dx,dz);return d>0&&(Math.sin(f.yaw/1000)*dx+Math.cos(f.yaw/1000)*dz)/d>=cosine;}
/** An occupied or attacking left hand cannot also block. Protection requires its actual contact. */
export function guardingV6(s:StateV6,who:SideV6):boolean {const f=s.fighters[who],w=s.builds[who].capabilities.weaponDefinition,a=f.action;return f.armour[2]>0&&f.guard>0&&!controlledV6(s,who)&&!w.paired&&w.mount!=="left"&&!(w.mount==="right"&&w.proxy.offhandGrip)&&!(a&&(a.mount==="left"||a.special==="burst"||a.special==="charge"));}
export function movementV6(s:StateV6,who:SideV6):number {const f=s.fighters[who];return s.stats[who].movement*(legs(f)===2?1:legs(f)===1?.6:.20)*(speedActive(f)?1.5:1)*(f.slowUntil>s.frame?.7:1);}
function move(f:FighterV6,x:number,z:number){f.x+=Math.round(x);f.z+=Math.round(z);const d=Math.hypot(f.x,f.z);if(d>f.arenaLimit){f.x=Math.round(f.x*f.arenaLimit/d);f.z=Math.round(f.z*f.arenaLimit/d);}}
function fighter(b:BuildV6,who:SideV6,seed:number):FighterV6 {const random=Number.parseInt(hashV6({seed,parts:Object.fromEntries(Object.entries(b.parts).map(([slot,part])=>[slot,part.id]))}),16)||0x9e3779b9;return {random,x:who?3500:-3500,z:who?-180:180,yaw:who?-1571:1571,moveX:0,moveZ:0,gait:0,arenaLimit:ARENA_RADIUS_V6-b.collision.radius,armour:[...b.stats.armour],guard:b.stats.guard,guardPose:0,guardRecoverAt:0,heat:0,overheated:false,action:null,special:null,meter:0,damageMeter:0,dealt:0,shots:0,stunnedUntil:0,downUntil:0,immuneUntil:0,slowUntil:0,shock:0,shockDecayAt:60,burn:null,dodgeUntil:0,nextDodge:90,dashUntil:0,dashX:0,dashZ:0,pushUntil:0,pushX:0,pushZ:0,nextAction:20,nextShove:0,nextMount:"right",lastThreat:-1};}
export function createFightV6(seed:number,a:BuildV6,b:BuildV6,options:FightOptionsV6={}):StateV6 {
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error("Choose an unsigned 32-bit fight seed.");if(!validBuildV6(a)||!validBuildV6(b))throw new Error("The saved build does not match its recorded catalogue and collision rules.");
  const builds=[a,b].map(v=>snapshotBuildV6(v.appearanceBuild,{collisionVersion:v.collisionVersion})) as [BuildV6,BuildV6],plans=options.defensePlans??["balanced","balanced"],automatic=options.autoSpecial??[false,true];
  if(plans.length!==2||plans.some(p=>!DEFENSE_PLANS_V6.some(d=>d.id===p))||automatic.length!==2||automatic.some(v=>typeof v!=="boolean"))throw new Error("Choose a valid defence plan.");
  const fighters:[FighterV6,FighterV6]=[fighter(a,0,seed),fighter(b,1,seed)],initiative:SideV6=fighters[0].random===fighters[1].random?(seed%2) as SideV6:fighters[0].random<fighters[1].random?0:1;
  return {version:6,rulesVersion:"mk6-2",catalogVersion:"mk6-catalog-1",seed,initiative,random:seed||0x9e3779b9,frame:0,done:false,winner:null,builds,stats:[cloneV6(a.stats),cloneV6(b.stats)],fighters,projectiles:[],events:[{id:0,frame:0,kind:"start",who:0,target:1}],commands:[],autoSpecial:[...automatic],defensePlans:[...plans],attackSequence:0};
}
export function applyControlV6(s:StateV6,victim:SideV6,kind:"stun"|"knockdown",by:SideV6):boolean {
  const f=s.fighters[victim];if(s.done||f.immuneUntil>s.frame||controlledV6(s,victim))return false;const duration=kind==="stun"?24:72;if(kind==="stun")f.stunnedUntil=s.frame+duration;else f.downUntil=s.frame+duration;f.immuneUntil=s.frame+duration+120;
  if(f.action)emit(s,"interrupt",victim,{attackId:f.action.id,weapon:f.action.kind,mount:f.action.mount});f.action=null;f.dashUntil=f.dodgeUntil=s.frame;f.nextAction=s.frame+duration+6;emit(s,kind,by,{target:victim});return true;
}
export function weaponDamageV6(s:StateV6,who:SideV6,kind:AttackKindV6,critical=false):number {const f=s.fighters[who],d=definition(s,who,kind);return rounded(d.damage*s.stats[who].power*(speedActive(f)?1.25:1)*(critical?1.2:1));}
export interface ImpactV6 {who:SideV6;weapon:AttackKindV6;mount:MountV6;attackId:number;contact:SweepContactV6;damage:number;platingBypass?:number;burn?:number;shock?:number;impulse?:number;knockdown?:boolean;finisher?:boolean;critical?:boolean;source?:Vec3;burnTick?:boolean}
/** No randomness follows a geometric contact. Damage, protection and status are explicit. */
export function resolveImpactV6(s:StateV6,impact:ImpactV6):number {
  if(s.done)return 0;const who=impact.who,target=other(who),a=s.fighters[who],b=s.fighters[target],index=BODY_SOCKETS_V6.indexOf(impact.contact.slot);if(index<0||b.armour[index]<=0)return 0;
  let amount=Math.max(0,impact.damage),absorbed=0;const source=impact.source??[a.x,0,a.z],front=facingV6(b,source[0],source[2]);
  if(b.special?.style==="tank"&&b.special.shieldLeft>0){absorbed=Math.min(b.special.shieldLeft,amount*.9);b.special.shieldLeft=rounded(b.special.shieldLeft-absorbed);amount-=absorbed;if(b.special.shieldLeft<=0&&b.action?.special==="charge"){emit(s,"interrupt",target,{weapon:b.action.kind,attackId:b.action.id});b.action=null;b.nextAction=s.frame+12;}}
  else if(!impact.burnTick&&index===2&&b.guard>0&&front&&guardingV6(s,target)&&b.guardPose>=.5){absorbed=Math.min(b.guard,amount*.5);b.guard=rounded(b.guard-absorbed);b.guardRecoverAt=s.frame+90;amount-=absorbed;}
  const stopped=amount*clamp(s.stats[target].plating[index],0,.35)*(1-clamp(impact.platingBypass??0,0,1));amount-=stopped;
  if(impact.finisher&&a.special?.style==="speed"&&s.builds[who].capabilities.tier3&&s.frame>=a.special.until-60&&!facingV6(b,source[0],source[2],-.35)&&absorbed===0&&index>=2&&b.armour[index]<s.stats[target].armour[index]*.25)amount=b.armour[index];
  amount=rounded(Math.min(b.armour[index],Math.max(0,amount)));b.armour[index]=rounded(b.armour[index]-amount);a.dealt=rounded(a.dealt+amount);
  if(index===1&&!b.special&&amount>0){const gain=Math.min(40-b.damageMeter,amount/s.stats[target].armour[1]*100);b.damageMeter=rounded(b.damageMeter+gain);b.meter=Math.min(100,rounded(b.meter+gain));}
  emit(s,impact.burnTick?"burn":absorbed>0?"block":"hit",who,{target,attackId:impact.attackId,weapon:impact.weapon,mount:impact.mount,slot:impact.contact.slot,damage:amount,absorbed:rounded(absorbed),platingStopped:rounded(stopped),point:impact.contact.localPoint,normal:impact.contact.localNormal,worldPoint:impact.contact.point,worldNormal:impact.contact.normal,critical:impact.critical});
  if(amount>0&&absorbed===0&&!impact.burnTick){if(impact.burn){const prior=b.burn;b.burn={by:who,weapon:impact.weapon,until:s.frame+150,nextTick:prior&&prior.until>s.frame?prior.nextTick:s.frame+30,damage:Math.max(impact.burn,prior&&prior.until>s.frame?prior.damage:0),slot:impact.contact.slot,attackId:impact.attackId};}
    if(impact.shock){b.shock=Math.min(100,b.shock+impact.shock);b.shockDecayAt=s.frame+90;emit(s,"shock",who,{attackId:impact.attackId,slot:impact.contact.slot});if(b.shock>=100){applyControlV6(s,target,"stun",who);b.shock=0;}}
    if(impact.impulse){const n=normalize([b.x-a.x,0,b.z-a.z]),force=impact.impulse*(1+s.stats[who].str*.015)/(1+s.stats[target].str*.07);b.pushX=Math.round(n[0]*force/8);b.pushZ=Math.round(n[2]*force/8);b.pushUntil=s.frame+8;}
    if(impact.knockdown)applyControlV6(s,target,"knockdown",who);
  }
  if(b.armour[index]===0){emit(s,"break",target,{target,slot:impact.contact.slot,attackId:impact.attackId});if(b.action&&((index===2&&b.action.mount==="left")||(index===3&&b.action.mount==="right")||(index>=4&&b.action.special&&b.action.special!=="burst"))){emit(s,"interrupt",target,{attackId:b.action.id,weapon:b.action.kind});b.action=null;}if(index>=4)b.dashUntil=b.dodgeUntil=s.frame;const disabled=b.armour[2]<=0&&b.armour[3]<=0&&!workingArm(b,s.builds[target].capabilities.mount);if(index===1||disabled){s.done=true;s.winner=who;emit(s,"ko",who,{defeatReason:disabled?"disabled":"body"});}}
  return amount;
}
const definitionCacheV6=new WeakMap<BuildV6,Map<AttackKindV6,WeaponDefinitionV6>>();
function definition(s:StateV6,who:SideV6,kind:AttackKindV6):WeaponDefinitionV6{if(kind==="special_charge")return uncachedDefinition(s,who,kind);const build=s.builds[who];if(kind===build.capabilities.weapon)return build.capabilities.weaponDefinition;let cache=definitionCacheV6.get(build);if(!cache){cache=new Map();definitionCacheV6.set(build,cache);}let value=cache.get(kind);if(!value){value=uncachedDefinition(s,who,kind);cache.set(kind,value);}return value;}
function uncachedDefinition(s:StateV6,who:SideV6,kind:AttackKindV6):WeaponDefinitionV6 {
  const equipped=s.builds[who].capabilities.weaponDefinition;if(kind===equipped.id)return equipped;
  if(kind==="punch"||kind==="shove")return {...WEAPONS_V6.sword,range:1600,windup:kind==="shove"?8:20,active:10,recovery:kind==="shove"?20:30,damage:kind==="shove"?5:11,impulse:kind==="shove"?1600:0,proxy:{...WEAPONS_V6.sword.proxy,strikeSegments:undefined,grip:[0,0,0],strikePoint:[0,0,0],radius:150,path:[{time:0,point:[450,1400,200],normal:[0,0,1]},{time:.4,point:[300,1450,650],normal:[0,0,1]},{time:.6,point:[170,1500,1250],normal:[0,0,1]},{time:1,point:[450,1400,200],normal:[0,0,1]}]}};
  if(kind==="backup_pistol"||kind==="special_burst")return {...WEAPONS_V6.ap_rifle,range:4000,minimumRange:0,windup:18,active:1,recovery:57,damage:kind==="special_burst"?9:18,platingBypass:0,impulse:kind==="backup_pistol"?260:0,heat:6,projectileSpeed:430,proxy:{...WEAPONS_V6.ap_rifle.proxy,muzzle:kind==="backup_pistol"?s.builds[who].collision.weapon.backupMuzzle??[0,130,590]:s.builds[who].collision.specialMuzzle}};
  if(kind==="special_flank")return {...WEAPONS_V6.sword,damage:24,proxy:s.builds[who].collision.specialBlade};
  if(kind==="special_charge"){
    const f=s.fighters[who],available=s.builds[who].collision.proxies.filter(p=>f.armour[BODY_SOCKETS_V6.indexOf(p.slot)]>0),part=available.reduce((a,b)=>footprintSupportV6([a],[1,1,1,1,1,1],[0,0,1])>=footprintSupportV6([b],[1,1,1,1,1,1],[0,0,1])?a:b),point=part.shape==="capsule"?(part.a![2]>part.b![2]?part.a!:part.b!):part.center,radius=part.shape==="capsule"?part.radius!:Math.min(part.half[0],part.half[2]);
    return {...WEAPONS_V6.hammer,damage:40,impulse:500,proxy:{grip:[0,0,0],muzzle:[0,0,0],strikePoint:[0,0,0],strikeNormal:[0,0,1],radius,active:[.34,.76],path:[{time:0,point:[...point],normal:[0,0,1]},{time:1,point:[...point],normal:[0,0,1]}]}};
  }
  return WEAPONS_V6[kind];
}
function activate(s:StateV6,who:SideV6){const f=s.fighters[who];if(f.action)emit(s,"interrupt",who,{attackId:f.action.id,weapon:f.action.kind});f.action=null;f.meter=0;f.damageMeter=0;f.nextAction=s.frame+5;f.special={style:s.builds[who].style,started:s.frame,until:s.frame+300,shieldLeft:s.stats[who].armour[1]*.35,finisherUsed:false,burstBudget:weaponDamageV6(s,who,"ap_rifle")*2};emit(s,"special_start",who,{ability:f.special.style});if(f.special.style==="ranged"){s.fighters[other(who)].slowUntil=f.special.until;emit(s,"slow",who);}}
export function acceptSpecialV6(s:StateV6,command:SpecialCommandV6):SpecialReceiptV6 {
  if(!command||typeof command.id!=="string"||!command.id||command.id.length>96||command.kind!=="special"||(command.who!==0&&command.who!==1)||!Number.isInteger(command.frame))return {accepted:false,reason:"Use a valid Special command."};
  const prior=s.commands.find(c=>c.id===command.id);if(prior)return prior.who===command.who&&prior.frame===command.frame?{accepted:true,command:cloneV6(prior)}:{accepted:false,reason:"That command ID was already used."};
  const f=s.fighters[command.who],reason=command.frame!==s.frame?"Use the current fight tick.":s.done?"The fight has ended.":controlledV6(s,command.who)?"Wait until your robot recovers.":f.special?"Special is already active.":f.meter<100?"Special is still charging.":null;if(reason)return {accepted:false,reason};
  const accepted={id:command.id,who:command.who,kind:"special" as const,frame:s.frame};s.commands.push(accepted);activate(s,command.who);return {accepted:true,command:cloneV6(accepted)};
}

export type ActionPhaseV6="preparation"|"contact"|"recovery"|"done";
export function actionPhaseV6(action:ActionV6,frame:number):ActionPhaseV6 {const t=frame-action.started;return t<action.windup?"preparation":t<action.windup+action.active?"contact":t<action.windup+action.active+action.recovery?"recovery":"done";}
/** Maps actual fixed-tick timing to the authored striking-surface path. */
export function actionPathPhaseV6(action:ActionV6,frame:number):number {
  const t=Math.max(0,frame-action.started),[a,b]=action.pathActive;
  return t<action.windup?a*t/Math.max(1,action.windup):t<action.windup+action.active?a+(b-a)*(t-action.windup)/Math.max(1,action.active):clamp(b+(1-b)*(t-action.windup-action.active)/Math.max(1,action.recovery),0,1);
}
function proxyTarget(s:StateV6,who:SideV6,bodyOnly=false):Vec3 {
  const target=other(who),f=s.fighters[target],proxies=posedProxiesV6(s,target);
  const available=proxies.filter(p=>f.armour[BODY_SOCKETS_V6.indexOf(p.slot)]>0),body=available.find(p=>p.slot==="torso")!;
  // Choosing an aim target is allowed before an attack. Contact decides the part actually struck.
  const p=bodyOnly||randomV6(s.fighters[who],10)<7?body:available[randomV6(s.fighters[who],available.length)];return worldPoint(p.center,root(f));
}
/** Aim at a visible point on the chosen part. Cover remains a real first collision, never a damage bypass. */
export function projectileAimV6(s:StateV6,who:SideV6,kind:AttackKindV6,mount:MountV6,part:HitProxyV6):Vec3 {
  const f=s.fighters[who],r=s.fighters[other(who)],b=s.builds[who],w=definition(s,who,kind),body=bodyMotionV6(b.collision,{...f,frame:s.frame}).body,targetProxies=posedProxiesV6(s,other(who)),center=worldPoint(part.center,root(r)),origin=muzzleV6(s,who,kind,mount);
  const direct=sweepRobotV6(origin,center,root(r),root(r),targetProxies,r.armour,w.projectileRadius);
  if(direct?.slot===part.slot||part.shape==="capsule")return center;
  const q=part.orientation??[0,0,0,1],offsets:Vec3[]=[.2,.35,.5].flatMap(n=>[[0,-n,0],[0,n,0],[-n,0,0],[n,0,0]] as Vec3[]);
  for(const offset of offsets){const local=add(part.center,rotateQuatV6(offset.map((v,i)=>v*part.half[i]) as Vec3,q)),point=worldPoint(local,root(r));if(sweepRobotV6(origin,point,root(r),root(r),targetProxies,r.armour,w.projectileRadius)?.slot!==part.slot)continue;
    const gun=aimGunMountV6(b.collision,w.proxy,mount,unbodyPointV6(body,localPoint(point,root(f))));if(!gun.aimable)continue;const actualOrigin=worldPoint(bodyPointV6(body,gun.muzzle),root(f));if(sweepRobotV6(actualOrigin,point,root(r),root(r),targetProxies,r.armour,w.projectileRadius)?.slot===part.slot)return point;
  }
  return center;
}
/** Root-local aimed mount, including the same velocity lead used by the physical projectile. */
export function gunMountV6(s:StateV6,who:SideV6,kind:AttackKindV6,mount:MountV6):GunMountPoseV6 {
  const b=s.builds[who],f=s.fighters[who],w=definition(s,who,kind),a=f.action,rest=aimGunMountV6(b.collision,w.proxy,mount),matching=a?.kind===kind,body=bodyMotionV6(b.collision,{...f,frame:s.frame}).body;
  if(!matching)return rest;const baseOrigin=worldPoint(bodyPointV6(body,rest.muzzle),root(f)),flight=Math.hypot(...subtract(a.aim,baseOrigin))/w.projectileSpeed,goal=add(a.aim,scale(a.aimVelocity,flight+Math.max(0,s.frame-(a.aimFrame??a.started))));return aimGunMountV6(b.collision,w.proxy,mount,unbodyPointV6(body,localPoint(goal,root(f))));
}
export function muzzleV6(s:StateV6,who:SideV6,kind:AttackKindV6,mount:MountV6):Vec3 {return worldPoint(bodyPointV6(bodyMotionV6(s.builds[who].collision,{...s.fighters[who],frame:s.frame}).body,gunMountV6(s,who,kind,mount).muzzle),root(s.fighters[who])).map(Math.round) as Vec3;}

function startAction(s:StateV6,who:SideV6,kind:AttackKindV6,mount:MountV6,special?:ActionV6["special"]){
  const f=s.fighters[who],w=definition(s,who,kind),rate=s.stats[who].attackRate*(speedActive(f)?1.2:1)*(f.slowUntil>s.frame?.7:1),initial=proxyTarget(s,who),initialLocal=localPoint(initial,root(s.fighters[other(who)])),aimPart=posedProxiesV6(s,other(who)).reduce((best,p)=>Math.hypot(...subtract(p.center,initialLocal))<Math.hypot(...subtract(best.center,initialLocal))?p:best),aim=w.projectile?projectileAimV6(s,who,kind,mount,aimPart):initial,aimLocal=localPoint(aim,root(s.fighters[other(who)])),error=s.stats[who].aimError*(f.armour[0]>0?1:2);
  const a:ActionV6={id:++s.attackSequence,kind,mount,started:s.frame,windup:Math.max(3,Math.round(w.windup/rate/(w.projectile?1+s.stats[who].acc*.025:1))),active:Math.max(1,Math.round(w.active/rate)),recovery:Math.max(6,Math.round(w.recovery/rate)),released:false,hitTargets:[],targetHeight:aim[1],aim,aimLocal,aimFrame:s.frame,aimSlot:aimPart.slot,aimSegment:aimPart.pose?.segment,aimVelocity:[0,0,0],aimError:[(randomV6(f,2001)-1000)/1000*error,(randomV6(f,2001)-1000)/1000*error*.65,0],lastPoint:null,nextPulse:s.frame,burstBudget:0,critical:randomV6(f,100)<Math.min(18,3+s.stats[who].luck*.35),emissions:0,pathActive:[...w.proxy.active],slowed:f.slowUntil>s.frame,special};
  if(special){a.windup=special==="burst"?10:special==="flank"?34:18;a.active=special==="burst"?40:special==="flank"?16:25;a.recovery=special==="flank"?10:12;a.critical=false;if(special==="burst")a.burstBudget=f.special!.burstBudget;}
  f.action=a;emit(s,"windup",who,{attackId:a.id,weapon:kind,mount});if(special&&special!=="burst")emit(s,special,who,{attackId:a.id,weapon:kind,mount});
}
function cancel(s:StateV6,who:SideV6,delay=4){const f=s.fighters[who];if(f.action)emit(s,"interrupt",who,{attackId:f.action.id,weapon:f.action.kind,mount:f.action.mount});f.action=null;f.nextAction=s.frame+delay;}
const reachCacheV6=new WeakMap<BuildV6,Map<string,{reach:number;stance:number}>>();
function meleeReachPose(s:StateV6,who:SideV6,kind:AttackKindV6):{reach:number;stance:number}{
  const build=s.builds[who],f=s.fighters[who],a=f.action,w=definition(s,who,kind),side=(a?.mount??(f.armour[3]>0?"right":"left"))==="left"?"left":"right",height=a?.targetHeight??s.builds[other(who)].collision.proxies.find(p=>p.slot==="torso")!.center[1],key=`${kind}:${side}:${height}`;let cache=reachCacheV6.get(build);if(!cache){cache=new Map();reachCacheV6.set(build,cache);}const stored=cache.get(key);if(stored)return stored;
  const pose=(phase:number)=>weaponGripPoseV6(build.collision,w.proxy,side,sampleWeaponPathV6(w.proxy,phase,side,height)),middle=pose((w.proxy.active[0]+w.proxy.active[1])/2).strikePoint,stance=Math.atan2(middle[0],middle[2]),direction:Vec3=[Math.sin(stance),0,Math.cos(stance)];let reach=0;for(let i=0;i<=20;i++){const phase=w.proxy.active[0]+(w.proxy.active[1]-w.proxy.active[0])*i/20;const p=pose(phase);if(w.proxy.strikeSegments?.length){for(const edge of w.proxy.strikeSegments)for(const endpoint of [edge.a,edge.b])reach=Math.max(reach,dotV6(add(p.weaponOrigin,rotateQuatV6(side==="left"?[-endpoint[0],endpoint[1],endpoint[2]]:endpoint,p.orientation)),direction));}else reach=Math.max(reach,dotV6(p.strikePoint,direction));}const result={reach,stance};cache.set(key,result);return result;
}
function reachableMelee(s:StateV6,who:SideV6,kind:AttackKindV6):number {const w=definition(s,who,kind),f=s.fighters[who],target=s.fighters[other(who)],direction=rotateY(normalize([f.x-target.x,0,f.z-target.z]),-target.yaw),support=footprintSupportV6(posedProxiesV6(s,other(who)),target.armour,direction);return Math.min(w.range,meleeReachPose(s,who,kind).reach+w.proxy.radius+support);}

function minimumFireRange(s:StateV6,who:SideV6,kind:AttackKindV6,_mount:MountV6):number {return definition(s,who,kind).minimumRange;}
/** A directional support circle rejects valid shots between outstretched arms. Check the actual barrel capsule. */
export function barrelClearV6(s:StateV6,who:SideV6,kind:AttackKindV6,mount:MountV6):boolean {const f=s.fighters[who],target=s.fighters[other(who)],w=definition(s,who,kind),gun=gunMountV6(s,who,kind,mount),body=bodyMotionV6(s.builds[who].collision,{...f,frame:s.frame}).body,from=worldPoint(bodyPointV6(body,gun.weaponOrigin),root(f)),to=worldPoint(bodyPointV6(body,gun.muzzle),root(f));return !sweepRobotV6(from,to,root(target),root(target),posedProxiesV6(s,other(who)),target.armour,Math.min(65,w.proxy.radius));}

export const weaponForActionV6=(s:StateV6,who:SideV6,kind:AttackKindV6)=>definition(s,who,kind);
/** Five physical rays spanning the authored full cone angle, expressed in milliradians. */
export function flameDirectionsV6(forward:Vec3,spread:number):Vec3[]{return [-2,-1,0,1,2].map(ray=>rotateY(forward,ray*spread/4));}
export interface FighterPoseV6 {body:BodyFrameV6;legs:{left:RigidLegPoseV6;right:RigidLegPoseV6};arms:Record<"left"|"right",ArmPoseV6>;weapons:Partial<Record<"left"|"right",WeaponGripPoseV6>>;mounts:Partial<Record<MountV6,GunMountPoseV6>>;proxies:HitProxyV6[]}
const fighterPoseCacheV6=new WeakMap<StateV6,Map<SideV6,{key:string;pose:FighterPoseV6}>>();
/** Single source of arm transforms for rendering, struck-part proxies and held weapon contact. */
export function fighterPoseV6(s:StateV6,who:SideV6,frame=s.frame):FighterPoseV6 {
  const actor=s.fighters[who],action=actor.action,key=JSON.stringify([frame,actor.x,actor.z,actor.yaw,actor.moveX,actor.moveZ,actor.gait,actor.guardPose,actor.guard>0,actor.stunnedUntil,actor.downUntil,actor.armour.map(n=>n>0),action&&[action.id,action.kind,action.mount,action.started,action.windup,action.active,action.recovery,action.pathActive,action.aim,action.aimFrame,action.aimVelocity,action.targetHeight,action.special]]);let cache=fighterPoseCacheV6.get(s);if(!cache){cache=new Map();fighterPoseCacheV6.set(s,cache);}const found=cache.get(who);if(found?.key===key)return found.pose;
  const f=s.fighters[who],c=s.builds[who].collision,equipped=s.builds[who].capabilities.weaponDefinition,a=f.action,arms={left:restArmPoseV6(c,"left"),right:restArmPoseV6(c,"right")},weapons:Partial<Record<"left"|"right",WeaponGripPoseV6>>={},mounts:Partial<Record<MountV6,GunMountPoseV6>>={};
  for(const side of ["left","right"] as const){const active=a&&a.mount===side&&a.special!=="charge",carriedBackup=side==="right"&&equipped.mount==="shoulder",w=active?definition(s,who,a.kind):carriedBackup?definition(s,who,"backup_pistol"):equipped,held=active||carriedBackup||equipped.mount===side||equipped.paired;if(!held)continue;if(w.projectile||w.id==="flamethrower"){const kind=active?a.kind:carriedBackup?"backup_pistol":w.id,gun=gunMountV6(s,who,kind,side);mounts[side]=gun;if(gun.arm)arms[side]=gun.arm;continue;}
    const phase=active?actionPathPhaseV6(a,frame):0,sample=sampleWeaponPathV6(w.proxy,phase,side,active?a.targetHeight:undefined),pose=weaponGripPoseV6(c,w.proxy,side,sample);arms[side]=pose;weapons[side]=pose;
  }
  if(equipped.mount==="shoulder")mounts.shoulder=gunMountV6(s,who,equipped.id,"shoulder");if(a?.special==="burst")for(const side of ["left","right"] as const){const gun=gunMountV6(s,who,a.kind,side);mounts[side]=gun;if(gun.arm)arms[side]=gun.arm;}
  if(!weapons.left&&!mounts.left&&!equipped.paired&&!(equipped.mount==="right"&&equipped.proxy.offhandGrip))arms.left=guardArmPoseV6(c,f.guardPose);
  const motion=bodyMotionV6(c,{...f,frame});const pose:FighterPoseV6={...motion,arms,weapons,mounts,proxies:[...motion.proxies.filter(p=>p.slot!=="armL"&&p.slot!=="armR"),...arms.left.proxies.map(p=>transformProxyV6(p,motion.body.translation,motion.body.orientation)),...arms.right.proxies.map(p=>transformProxyV6(p,motion.body.translation,motion.body.orientation))]};cache.set(who,{key,pose});return pose;
}
export const posedProxiesV6=(s:StateV6,who:SideV6,frame=s.frame):HitProxyV6[]=>fighterPoseV6(s,who,frame).proxies;
export function strikePoseV6(s:StateV6,who:SideV6,frame=s.frame):{point:Vec3;normal:Vec3;localPoint:Vec3;localNormal:Vec3;radius:number;pathPhase:number;gripError:number}|null {
  const f=s.fighters[who],a=f.action;if(!a)return null;const w=definition(s,who,a.kind),pathPhase=actionPathPhaseV6(a,frame),sample=sampleWeaponPathV6(w.proxy,pathPhase,a.mount==="left"?"left":"right",a.special==="charge"?undefined:a.targetHeight),pose=a.special!=="charge"&&!w.projectile&&w.id!=="flamethrower"?weaponGripPoseV6(s.builds[who].collision,w.proxy,a.mount==="left"?"left":"right",sample):null,point=pose?.strikePoint??sample.point,normal=pose?.strikeNormal??sample.normal;
  const body=bodyMotionV6(s.builds[who].collision,{...f,frame}).body,posedPoint=bodyPointV6(body,point),posedNormal=bodyDirectionV6(body,normal);return {point:worldPoint(posedPoint,root(f)),normal:rotateY(posedNormal,f.yaw),localPoint:posedPoint,localNormal:posedNormal,radius:w.proxy.radius,pathPhase,gripError:pose?.gripError??0};
}
function readyFinisher(s:StateV6,who:SideV6):boolean {
  const f=s.fighters[who],sp=f.special;if(!sp||sp.finisherUsed||!s.builds[who].capabilities.tier3||s.frame<sp.until-60||controlledV6(s,who))return false;
  if(sp.style==="tank"&&(sp.shieldLeft<=0||legs(f)<2||f.armour[2]<=0&&f.armour[3]<=0))return false;
  if(sp.style==="speed"&&(legs(f)<2||f.armour[2]<=0&&f.armour[3]<=0))return false;
  if(sp.style==="ranged"&&f.armour[2]<=0&&f.armour[3]<=0)return false;
  if(f.action)cancel(s,who,0);sp.finisherUsed=true;const mount=f.armour[3]>0?"right":"left";
  startAction(s,who,sp.style==="tank"?"special_charge":sp.style==="speed"?"special_flank":"special_burst",mount,sp.style==="tank"?"charge":sp.style==="speed"?"flank":"burst");return true;
}
function escape(s:StateV6,who:SideV6){const f=s.fighters[who],rival=s.fighters[other(who)];if(legs(f)<2)return;let direction=normalize([f.x-rival.x,0,f.z-rival.z]);if(Math.hypot(f.x+direction[0]*1800,f.z+direction[2]*1800)>f.arenaLimit){const left:Vec3=[-direction[2],0,direction[0]],right=scale(left,-1);direction=normalize(add(scale(direction,.15),Math.hypot(f.x+left[0]*1600,f.z+left[2]*1600)<Math.hypot(f.x+right[0]*1600,f.z+right[2]*1600)?left:right));}f.dashUntil=s.frame+Math.round(16*([0,.79,.9,1,1.06][s.builds[who].parts.legL.tier]+[0,.79,.9,1,1.06][s.builds[who].parts.legR.tier]));f.dashX=direction[0];f.dashZ=direction[2];emit(s,"dodge",who);}
/** The shield plan responds to a real prepared attack or approaching projectile, including rifles at standoff. */
export function incomingThreatV6(s:StateV6,who:SideV6):boolean {
  const target=other(who),f=s.fighters[who],r=s.fighters[target],a=r.action;
  if(a&&!controlledV6(s,target)&&actionPhaseV6(a,s.frame)!=="recovery"&&actionPhaseV6(a,s.frame)!=="done"){
    const w=definition(s,target,a.kind),d=Math.hypot(f.x-r.x,f.z-r.z);
    if(w.projectile){const origin=muzzleV6(s,target,a.kind,a.mount);if(Math.hypot(f.x-origin[0],f.z-origin[2])<=w.range&&barrelClearV6(s,target,a.kind,a.mount))return true;}
    else if(d<=reachableMelee(s,target,a.kind)+Math.min(500,movementV6(s,target)*Math.max(0,a.started+a.windup-s.frame)))return true;
  }
  return s.projectiles.some(p=>p.who===target&&sweepRobotV6([p.x,p.y,p.z],[p.x+p.vx*5,p.y+p.vy*5,p.z+p.vz*5],root(f),root(f),posedProxiesV6(s,who),f.armour,p.radius)!==null);
}
function decide(s:StateV6,who:SideV6){
  const f=s.fighters[who],rival=s.fighters[other(who)],d=Math.hypot(rival.x-f.x,rival.z-f.z),b=s.builds[who];if(controlledV6(s,who))return;
  if(s.autoSpecial[who]&&f.meter>=100&&!f.special){const plan=s.defensePlans[who],use=plan==="early"||plan==="last-stand"&&f.armour[1]<s.stats[who].armour[1]*.4||plan==="balanced"&&(b.style==="tank"?incomingThreatV6(s,who):b.style==="speed"?d<2600&&!(s.builds[other(who)].style==="tank"&&((rival.special?.shieldLeft??0)>0&&rival.special!.until-s.frame>45)&&f.armour[1]>s.stats[who].armour[1]*.3):d<3600);if(use)activate(s,who);}
  if(readyFinisher(s,who))return;
  // Recovery keeps its full duration; a working pair of legs may still make space.
  if(f.action&&!f.action.special&&actionPhaseV6(f.action,s.frame)==="recovery"&&b.capabilities.weaponDefinition.projectile&&legs(f)===2&&s.frame>=f.nextShove&&(!barrelClearV6(s,who,b.capabilities.weapon,b.capabilities.mount))&&rival.action){f.nextShove=s.frame+150;escape(s,who);}
  if(f.action||f.nextAction>s.frame||f.overheated||f.dashUntil>s.frame)return;
  let kind:AttackKindV6=b.capabilities.weapon,mount=b.capabilities.mount;
  if(b.capabilities.paired){mount=f.nextMount;f.nextMount=mount==="left"?"right":"left";if(!workingArm(f,mount))mount=mount==="left"?"right":"left";}
  if(!workingArm(f,mount)){mount=workingArm(f,"right")?"right":"left";if(!workingArm(f,mount))return;kind="punch";}
  let w=definition(s,who,kind);
  const closing=Math.max(0,movementV6(s,other(who))-movementV6(s,who)*.43),prepare=w.windup/s.stats[who].attackRate/(1+s.stats[who].acc*.025),fireWindow=minimumFireRange(s,who,kind,mount)+Math.min(900,closing*prepare);
  if(w.projectile&&(d<fireWindow||!barrelClearV6(s,who,kind,mount))){
    if(s.frame>=f.nextShove&&d<=reachableMelee(s,who,"shove")+100&&(workingArm(f,"left")||workingArm(f,"right"))){kind="shove";mount=workingArm(f,"left")?"left":"right";f.nextShove=s.frame+150;w=definition(s,who,kind);}
    else if(kind==="shoulder_cannon"&&s.frame>=f.nextShove&&legs(f)===2){f.nextShove=s.frame+150;escape(s,who);return;}
    else if(kind==="shoulder_cannon"&&f.armour[3]>0){kind="backup_pistol";mount="right";w=definition(s,who,kind);}
    else if(s.frame>=f.nextShove&&d<=1700){kind="shove";mount=f.armour[3]>0?"right":"left";if(!workingArm(f,mount))return;f.nextShove=s.frame+150;w=definition(s,who,kind);}
    else {if(s.frame>=f.nextShove&&legs(f)===2){f.nextShove=s.frame+150;escape(s,who);}return;}
  }
  if(f.heat+w.heat>s.stats[who].heatCapacity){f.overheated=true;emit(s,"overheat",who);return;}
  const reach=w.projectile?w.range:kind==="flamethrower"?w.range:reachableMelee(s,who,kind)*.86;
  if(d>reach||!facingV6(f,rival.x,rival.z,.83))return;
  startAction(s,who,kind,mount);
}
function moveFighter(s:StateV6,who:SideV6){
  const f=s.fighters[who],target=s.fighters[other(who)],dx=target.x-f.x,dz=target.z-f.z,d=Math.max(1,Math.hypot(dx,dz)),forward=[dx/d,dz/d],equipped=s.builds[who].capabilities.weaponDefinition,kind:AttackKindV6=workingArm(f,equipped.mount)||equipped.paired&&(f.armour[2]>0||f.armour[3]>0)?s.builds[who].capabilities.weapon:"punch",w=definition(s,who,kind),a=f.action;
  if(f.pushUntil>s.frame)move(f,f.pushX,f.pushZ);if(controlledV6(s,who))return;
  // A swing stance belongs to its preparation/contact. Approach and recovery face
  // the rival so the actual front forearm can guard while the weapon is carried.
  const phase=a?actionPhaseV6(a,s.frame):null,committed=Boolean(a&&phase!=="recovery"&&a.special!=="charge"),aimed=definition(s,who,a?.kind??kind),stance=!committed||aimed.projectile||aimed.id==="flamethrower"?0:meleeReachPose(s,who,a!.kind).stance,desired=Math.atan2(committed?a!.aim[0]-f.x:dx,committed?a!.aim[2]-f.z:dz)-stance,turn=s.stats[who].turnRate*(f.slowUntil>s.frame?.7:1),delta=angle(desired-f.yaw/1000);if(!a||a.special||phase==="recovery"||s.frame<a.started+a.windup-7)f.yaw=Math.round(angle(f.yaw/1000+clamp(delta,-turn/1000,turn/1000))*1000);
  // Evasion moves a real collider before the strike, never rolls a hit away afterward.
  const threat=target.action;if(threat&&threat.id!==f.lastThreat&&threat.started+threat.windup-s.frame<=7&&threat.started+threat.windup>s.frame){f.lastThreat=threat.id;if(legs(f)===2&&s.frame>=f.nextDodge&&d<4500){f.nextDodge=s.frame+120;const chance=Math.min(60,s.stats[who].evasion+(speedActive(f)?15:0));if(randomV6(f,10000)<chance*100){const direction=randomV6(f,2)?1:-1;f.dodgeUntil=s.frame+10;f.dashX=-forward[1]*direction;f.dashZ=forward[0]*direction;emit(s,"dodge",who,{attackId:threat.id});}}}
  if(f.dodgeUntil>s.frame&&legs(f)===2){move(f,f.dashX*movementV6(s,who)*2.2,f.dashZ*movementV6(s,who)*2.2);return;}
  if(f.dashUntil>s.frame&&legs(f)===2){move(f,f.dashX*movementV6(s,who)*2.5,f.dashZ*movementV6(s,who)*2.5);return;}
  if(a?.special==="flank"&&actionPhaseV6(a,s.frame)!=="recovery"){
    const radial:Vec3=[-forward[0],0,-forward[1]],rear=rotateY([0,0,-1],target.yaw),heading=Math.atan2(radial[0],radial[2]),remaining=angle(Math.atan2(rear[0],rear[2])-heading),chassis=(side:SideV6)=>posedProxiesV6(s,side).filter(p=>p.slot!=="armL"&&p.slot!=="armR"),clearance=footprintSupportV6(chassis(who),f.armour,rotateY(scale(radial,-1),-f.yaw))+footprintSupportV6(chassis(other(who)),target.armour,rotateY(radial,-target.yaw)),radius=Math.abs(remaining)>.25?Math.max(1500,clearance+180):Math.max(clearance+30,reachableMelee(s,who,"special_flank")*.70),nextHeading=heading+clamp(remaining,-.45,.45),x=target.x+Math.sin(nextHeading)*radius-f.x,z=target.z+Math.cos(nextHeading)*radius-f.z,n=Math.max(1,Math.hypot(x,z));move(f,x/n*movementV6(s,who)*2.8,z/n*movementV6(s,who)*2.8);return;
  }
  if(a?.special==="charge"&&actionPhaseV6(a,s.frame)==="contact"){move(f,Math.sin(f.yaw/1000)*movementV6(s,who)*2.8,Math.cos(f.yaw/1000)*movementV6(s,who)*2.8);return;}
  const ranged=w.projectile||w.id==="flamethrower",ideal=ranged?Math.min(w.range*.67,w.id==="flamethrower"?2300:3800):reachableMelee(s,who,kind)*.80;
  let factor=d>ideal+80?1:d<ideal-100&&ranged?-1:0;
  if(a){const phase=actionPhaseV6(a,s.frame);if(a.kind==="shove")factor=phase==="recovery"?-1:d>reachableMelee(s,who,"shove")*.66?.8:0;else if(phase==="contact")factor=ranged?0:d>ideal*.75?.8:0;else if(phase==="preparation")factor=ranged?(d<ideal?-.7:0):d>ideal*.8?.85:0;else factor*=.65;}
  if(factor){const speed=movementV6(s,who)*factor*(ranged&&factor<0?.62:1);move(f,forward[0]*speed,forward[1]*speed);}
  if(!ranged&&legs(f)===2&&s.stats[who].speed>0&&d<ideal+350&&(!a||actionPhaseV6(a,s.frame)==="recovery")){const direction=(Math.floor((a?.id??s.frame/60))+s.seed)%2?1:-1,pace=movementV6(s,who)*Math.min(.75,.2+s.stats[who].speed*.05);move(f,-forward[1]*direction*pace,forward[0]*direction*pace);}
  // At the wall, a ranged robot sidesteps around the arena instead of backing into a dead end.
  if(ranged&&factor<0&&Math.hypot(f.x,f.z)>f.arenaLimit-250){const side=s.seed%2?1:-1;move(f,-forward[1]*movementV6(s,who)*side*.5,forward[0]*movementV6(s,who)*side*.5);}
}
function separate(s:StateV6){const a=s.fighters[0],b=s.fighters[1];for(let n=0;n<5;n++){let dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d<1){const yaw=(s.seed%6283)/1000;dx=Math.sin(yaw);dz=Math.cos(yaw);d=1;}const toward:Vec3=[dx/d,0,dz/d],minimum=footprintSupportV6(posedProxiesV6(s,0).filter(p=>p.slot!=="armL"&&p.slot!=="armR"),a.armour,rotateY(toward,-a.yaw))+footprintSupportV6(posedProxiesV6(s,1).filter(p=>p.slot!=="armL"&&p.slot!=="armR"),b.armour,rotateY(scale(toward,-1),-b.yaw));if(d>=minimum-.5)return;const shift=(minimum-d)/2+.5;move(a,-dx/d*shift,-dz/d*shift);move(b,dx/d*shift,dz/d*shift);}}
function contactFromCenter(s:StateV6,who:SideV6,slot:BodySocketV6):SweepContactV6 {const target=other(who),f=s.fighters[target],p=s.builds[target].collision.proxies.find(p=>p.slot===slot)!;return {t:0,slot,point:worldPoint(p.center,root(f)),normal:[0,1000,0],localPoint:[0,500,0],localNormal:[0,1000,0]};}
function statuses(s:StateV6,who:SideV6){const f=s.fighters[who];
  if(f.special&&s.frame>=f.special.until){if(f.action?.special)cancel(s,who);emit(s,"special_end",who,{ability:f.special.style});f.special=null;}
  if(!f.special){f.meter=Math.min(100,rounded(f.meter+5/60));if(f.meter>99.999)f.meter=100;}
  const action=f.action,slowed=f.slowUntil>s.frame;if(action&&Boolean(action.slowed)!==slowed){const factor=slowed?1/.7:.7,t=s.frame-action.started;if(t<action.windup){action.windup=t+Math.ceil((action.windup-t)*factor);action.active=Math.max(1,Math.ceil(action.active*factor));action.recovery=Math.max(1,Math.ceil(action.recovery*factor));}else if(t<action.windup+action.active){action.active=t-action.windup+Math.max(1,Math.ceil((action.windup+action.active-t)*factor));action.recovery=Math.max(1,Math.ceil(action.recovery*factor));}else action.recovery=t-action.windup-action.active+Math.max(1,Math.ceil((action.windup+action.active+action.recovery-t)*factor));action.slowed=slowed;}
  f.heat=rounded(Math.max(0,f.heat-s.stats[who].cooling*(f.action?.kind==="flamethrower"?.25:1)));if(f.overheated&&f.heat<=40){f.overheated=false;emit(s,"cooled",who);}
  if(!controlledV6(s,who)&&s.frame>=f.guardRecoverAt)f.guard=Math.min(s.stats[who].guard,rounded(f.guard+.14));
  f.guardPose=rounded(clamp(f.guardPose+(guardingV6(s,who)?.125:-.125),0,1));
  if(s.frame>=f.shockDecayAt){f.shock=Math.max(0,f.shock-12);f.shockDecayAt=s.frame+60;}
  if(f.burn){const burn=f.burn;if(s.frame>=burn.until||f.armour[BODY_SOCKETS_V6.indexOf(burn.slot)]<=0)f.burn=null;else if(s.frame>=burn.nextTick){burn.nextTick+=30;resolveImpactV6(s,{who:burn.by,weapon:burn.weapon,mount:"right",attackId:burn.attackId,contact:contactFromCenter(s,burn.by,burn.slot),damage:burn.damage,burnTick:true});}}
}
function fire(s:StateV6,who:SideV6,a:ActionV6,overrideMount?:MountV6){
  const f=s.fighters[who],target=s.fighters[other(who)],mount=overrideMount??a.mount,w=definition(s,who,a.kind),origin=muzzleV6(s,who,a.kind,mount),d=Math.hypot(target.x-f.x,target.z-f.z);
  if(!workingArm(f,mount))return;const gun=gunMountV6(s,who,a.kind,mount);if(!gun.aimable){cancel(s,who,0);return;}
  if(a.kind!=="special_burst"&&(d<minimumFireRange(s,who,a.kind,mount)||!barrelClearV6(s,who,a.kind,mount))){cancel(s,who,0);if(s.frame>=f.nextShove&&d<1800){f.nextShove=s.frame+150;startAction(s,who,"shove",f.armour[3]>0?"right":"left");}return;}
  // Never emit an already-embedded bullet. A collision here means the gun must lower or the robot must create space.
  if(sweepRobotV6(origin,origin,root(target),root(target),posedProxiesV6(s,other(who)),target.armour,w.projectileRadius)){cancel(s,who,0);return;}
  const direct=rotateY(bodyDirectionV6(bodyMotionV6(s.builds[who].collision,{...f,frame:s.frame}).body,gun.forward),f.yaw),yaw=Math.atan2(direct[0],direct[2]),pitch=Math.asin(clamp(direct[1],-1,1));
  let total=weaponDamageV6(s,who,a.kind,a.critical);if(a.special==="burst"){const remaining=Math.max(0,a.burstBudget);total=Math.min(total,remaining);a.burstBudget=rounded(remaining-total);if(total<=0)return;}
  f.heat=rounded(Math.min(100,f.heat+(a.special==="burst"?w.heat:w.heat)));f.shots++;a.emissions++;
  for(let pellet=0;pellet<w.pellets;pellet++){const spreadYaw=w.spread?(randomV6(f,2001)-1000)/1000*w.spread:0,spreadPitch=w.spread?(randomV6(f,2001)-1000)/1000*w.spread:0,rayYaw=yaw+(a.aimError[0]+spreadYaw)/1000,rayPitch=pitch+(a.aimError[1]+spreadPitch)/1000,dir:Vec3=[Math.sin(rayYaw)*Math.cos(rayPitch),Math.sin(rayPitch),Math.cos(rayYaw)*Math.cos(rayPitch)],velocity=scale(dir,w.projectileSpeed).map(Math.round) as Vec3;
    const projectile:ProjectileV6={id:a.id*1000+a.emissions*10+pellet,attackId:a.id,who,weapon:a.kind,mount,x:origin[0],y:origin[1],z:origin[2],vx:velocity[0],vy:velocity[1],vz:velocity[2],radius:w.projectileRadius,ttl:Math.ceil(w.range/w.projectileSpeed),damage:total,platingBypass:w.platingBypass,burn:w.burn,shock:w.shock,impulse:w.impulse};s.projectiles.push(projectile);
    emit(s,"shot",who,{attackId:a.id,weapon:a.kind,mount,origin,direction:dir.map(v=>Math.round(v*1000)) as Vec3});
  }
}
function chargeContact(s:StateV6,who:SideV6,previous:[{x:number;z:number;yaw:number},{x:number;z:number;yaw:number}],previousProxies:[HitProxyV6[],HitProxyV6[]]):SweepContactV6|null {
  const f=s.fighters[who],target=s.fighters[other(who)];let nearest:SweepContactV6|null=null;
  const direction=rotateY(normalize([target.x-f.x,0,target.z-f.z]),-f.yaw);
  for(const proxy of posedProxiesV6(s,who)){if(f.armour[BODY_SOCKETS_V6.indexOf(proxy.slot)]<=0)continue;const points:{point:Vec3;radius:number}[]=[];
    if(proxy.shape==="capsule"){for(const t of [0,.5,1])points.push({point:lerp(proxy.a!,proxy.b!,t),radius:proxy.radius!});}
    else {const axis=Math.abs(direction[0])>Math.abs(direction[2])?0:2,sign=direction[axis]>=0?1:-1,side=axis===0?2:0;for(const u of [-1,0,1])for(const v of [-1,0,1]){const p:[number,number,number]=[...proxy.center];p[axis]+=sign*proxy.half[axis];p[side]+=u*proxy.half[side];p[1]+=v*proxy.half[1];points.push({point:p,radius:12});}}
    for(const point of points){const hit=sweepRobotV6(worldPoint(point.point,previous[who]),worldPoint(point.point,root(f)),previous[other(who)],root(target),posedProxiesV6(s,other(who)),target.armour,point.radius,previousProxies[other(who)]);if(hit&&(!nearest||hit.t<nearest.t))nearest=hit;}
  }return nearest;
}
function actionContacts(s:StateV6,who:SideV6,previous:[{x:number;z:number;yaw:number},{x:number;z:number;yaw:number}],previousProxies:[HitProxyV6[],HitProxyV6[]]){
  const f=s.fighters[who],target=s.fighters[other(who)],a=f.action;if(!a||controlledV6(s,who))return;const w=definition(s,who,a.kind),phase=actionPhaseV6(a,s.frame);
  if(!workingArm(f,a.mount)||a.special==="charge"&&f.special?.shieldLeft===0){cancel(s,who);return;}
  if(phase==="done"){f.action=null;f.nextAction=s.frame+2;return;}
  if(phase==="preparation"){
    const remaining=a.started+a.windup-s.frame;if(remaining>7){const tracked=a.aimSlot?posedProxiesV6(s,other(who)).find(p=>p.slot===a.aimSlot&&p.pose?.segment===a.aimSegment):undefined;a.aim=w.projectile&&tracked?projectileAimV6(s,who,a.kind,a.mount,tracked):worldPoint(tracked?.center??a.aimLocal,root(target));a.aimFrame=s.frame;a.aimVelocity=[target.moveX,0,target.moveZ];}
    if(w.projectile&&a.special!=="burst"&&(Math.hypot(target.x-f.x,target.z-f.z)<minimumFireRange(s,who,a.kind,a.mount)||!barrelClearV6(s,who,a.kind,a.mount))){cancel(s,who,0);return;}
  }
  if(a.special==="burst"){
    if(phase==="contact"&&s.frame>=a.nextPulse&&a.emissions<8){a.nextPulse=s.frame+5;const mount=a.emissions%2?"left":"right";a.aim=projectileAimV6(s,who,a.kind,mount,posedProxiesV6(s,other(who)).find(p=>p.slot==="torso")!);a.aimFrame=s.frame;a.aimVelocity=[target.moveX,0,target.moveZ];if(workingArm(f,mount))fire(s,who,a,mount);else a.emissions++;}return;
  }
  if(a.special==="charge"){if(phase==="contact"&&!a.hitTargets.length){const hit=chargeContact(s,who,previous,previousProxies);if(hit){a.hitTargets.push(hit.slot);resolveImpactV6(s,{who,weapon:a.kind,mount:a.mount,attackId:a.id,contact:hit,damage:weaponDamageV6(s,who,a.kind),impulse:w.impulse,knockdown:true});}}return;}
  if(w.projectile){if(phase==="contact"&&!a.released){a.released=true;fire(s,who,a);}return;}
  if(a.kind==="flamethrower"){
    if(phase!=="contact"||s.frame<a.nextPulse)return;a.nextPulse=s.frame+8;if(!a.released){a.released=true;f.heat=Math.min(100,f.heat+w.heat);}const origin=muzzleV6(s,who,a.kind,a.mount),gun=gunMountV6(s,who,a.kind,a.mount),dir=rotateY(bodyDirectionV6(bodyMotionV6(s.builds[who].collision,{...f,frame:s.frame}).body,gun.forward),f.yaw);if(!gun.aimable){cancel(s,who);return;}emit(s,"flame",who,{attackId:a.id,weapon:a.kind,origin,direction:dir.map(v=>Math.round(v*1000)) as Vec3});
    // Five deterministic rays approximate the visible cone; one earliest contact per flame pulse.
    let best:SweepContactV6|null=null;for(const direction of flameDirectionsV6(dir,w.spread)){const end=add(origin,scale(direction,w.range)),hit=sweepRobotV6(origin,end,previous[other(who)],root(target),posedProxiesV6(s,other(who)),target.armour,70,previousProxies[other(who)]);if(hit&&(!best||hit.t<best.t))best=hit;}
    if(best)resolveImpactV6(s,{who,weapon:a.kind,mount:a.mount,attackId:a.id,contact:best,damage:weaponDamageV6(s,who,a.kind),burn:w.burn,source:origin});return;
  }
  const point=strikePoseV6(s,who)!.point;
  if(phase==="contact"&&a.emissions===0){a.emissions=1;f.heat=Math.min(100,f.heat+w.heat);}
  if(phase==="contact"&&!a.hitTargets.length){const prior=a.lastPoint??worldPoint(strikePoseV6(s,who,s.frame-1)!.localPoint,previous[who]);let hit:SweepContactV6|null=null;
    if(w.proxy.strikeSegments?.length){const side=a.mount==="left"?"left":"right",before=weaponGripPoseV6(s.builds[who].collision,w.proxy,side,sampleWeaponPathV6(w.proxy,actionPathPhaseV6(a,s.frame-1),side,a.targetHeight)),after=weaponGripPoseV6(s.builds[who].collision,w.proxy,side,sampleWeaponPathV6(w.proxy,actionPathPhaseV6(a,s.frame),side,a.targetHeight)),oldBody=bodyFromProxiesV6(previousProxies[who]),newBody=bodyMotionV6(s.builds[who].collision,{...f,frame:s.frame}).body,edgePoint=(v:Vec3,p:WeaponGripPoseV6,r:{x:number;z:number;yaw:number},body:BodyFrameV6)=>worldPoint(bodyPointV6(body,add(p.weaponOrigin,rotateQuatV6(side==="left"?[-v[0],v[1],v[2]]:v,p.orientation))),r);
      for(const edge of w.proxy.strikeSegments){const contact=sweepWeaponSegmentV6(edgePoint(edge.a,before,previous[who],oldBody),edgePoint(edge.b,before,previous[who],oldBody),edgePoint(edge.a,after,root(f),newBody),edgePoint(edge.b,after,root(f),newBody),previous[other(who)],root(target),posedProxiesV6(s,other(who)),target.armour,edge.radius,previousProxies[other(who)]);if(contact&&(!hit||contact.t<hit.t))hit=contact;}
    }else hit=sweepRobotV6(prior,point,previous[other(who)],root(target),posedProxiesV6(s,other(who)),target.armour,w.proxy.radius,previousProxies[other(who)]);
    if(hit&&dotV6(strikePoseV6(s,who)!.normal,hit.normal)<-100){a.hitTargets.push(hit.slot);resolveImpactV6(s,{who,weapon:a.kind,mount:a.mount,attackId:a.id,contact:hit,damage:weaponDamageV6(s,who,a.kind,a.critical),burn:w.burn,shock:w.shock,impulse:w.impulse,finisher:a.special==="flank",critical:a.critical});if(a.kind==="shove"){emit(s,"shove",who,{attackId:a.id});escape(s,who);}}
  }
  a.lastPoint=point;
  if(phase==="recovery"&&!a.released){a.released=true;if(!a.hitTargets.length)emit(s,"miss",who,{attackId:a.id,weapon:a.kind,mount:a.mount});if(a.kind==="shove")escape(s,who);}
}
function projectiles(s:StateV6,previous:[{x:number;z:number;yaw:number},{x:number;z:number;yaw:number}],previousProxies:[HitProxyV6[],HitProxyV6[]]){const survivors:ProjectileV6[]=[];for(const p of s.projectiles){const target=other(p.who),f=s.fighters[target],from:Vec3=[p.x,p.y,p.z],to:Vec3=[p.x+p.vx,p.y+p.vy,p.z+p.vz],hit=sweepRobotV6(from,to,previous[target],root(f),posedProxiesV6(s,target),f.armour,p.radius,previousProxies[target]);p.ttl--;
    if(hit){resolveImpactV6(s,{who:p.who,weapon:p.weapon,mount:p.mount,attackId:p.attackId,contact:hit,damage:p.damage,platingBypass:p.platingBypass,burn:p.burn,shock:p.shock,impulse:p.impulse,source:from});continue;}
    p.x=to[0];p.y=to[1];p.z=to[2];if(p.ttl>0&&p.y>-200&&Math.hypot(p.x,p.z)<ARENA_RADIUS_V6+4000)survivors.push(p);else emit(s,"miss",p.who,{attackId:p.attackId,weapon:p.weapon,mount:p.mount});}
  s.projectiles=survivors;
}
export function stepFightV6(s:StateV6):StateV6 {
  if(s.done)return s;const previousProxies:[HitProxyV6[],HitProxyV6[]]=[posedProxiesV6(s,0),posedProxiesV6(s,1)];s.frame++;const previous=s.fighters.map(f=>root(f)) as [{x:number;z:number;yaw:number},{x:number;z:number;yaw:number}];
  const order:SideV6[]=s.frame%2?[s.initiative,other(s.initiative)]:[other(s.initiative),s.initiative];for(const who of order)statuses(s,who);if(s.done)return s;
  for(const who of order){const f=s.fighters[who];f.arenaLimit=ARENA_RADIUS_V6-Math.max(s.builds[who].collision.radius,footprintRadiusV6(posedProxiesV6(s,who).filter(p=>p.slot!=="armL"&&p.slot!=="armR")));move(f,0,0);decide(s,who);}for(const who of order)moveFighter(s,who);
  // Detect a body ram before resolving interpenetration; otherwise the separation response removes its contact.
  for(const who of order){if(s.done)break;const a=s.fighters[who].action;if(a?.special==="charge"&&actionPhaseV6(a,s.frame)==="contact")actionContacts(s,who,previous,previousProxies);}separate(s);
  for(const who of order){const f=s.fighters[who];f.moveX=f.x-previous[who].x;f.moveZ=f.z-previous[who].z;f.gait=((f.gait??0)+Math.hypot(f.moveX,f.moveZ)/Math.max(120,s.builds[who].collision.height*.10))%(Math.PI*2);}
  for(const who of order){if(s.done)break;actionContacts(s,who,previous,previousProxies);}if(!s.done)projectiles(s,previous,previousProxies);
  if(!s.done&&s.frame>=MAX_FRAMES_V6){s.done=true;const health=s.fighters.map((f,i)=>f.armour[1]/s.stats[i].armour[1]+f.armour.reduce((a,b)=>a+b,0)/s.stats[i].armour.reduce((a,b)=>a+b,0)*.15);s.winner=health[0]===health[1]?randomV6(s,2) as SideV6:health[0]>health[1]?0:1;emit(s,"timeout",s.winner);}
  return s;
}
export function advanceFightV6(s:StateV6,toFrame:number):StateV6 {if(!Number.isInteger(toFrame)||toFrame<s.frame||toFrame>MAX_FRAMES_V6)throw new Error("Advance to a valid future fight tick.");while(!s.done&&s.frame<toFrame)stepFightV6(s);return s;}
function resultHash(s:StateV6):string{return hashV6({version:s.version,rulesVersion:s.rulesVersion,seed:s.seed,frame:s.frame,winner:s.winner,builds:s.builds,commands:s.commands,events:s.events,fighters:s.fighters,projectiles:s.projectiles});}
export function resultV6(s:StateV6):ResultV6 {if(!s.done||s.winner===null)throw new Error("The fight has not finished.");return deepFreeze({version:6,rulesVersion:"mk6-2",catalogVersion:"mk6-catalog-1",seed:s.seed,builds:cloneV6(s.builds),commands:cloneV6(s.commands),autoSpecial:[...s.autoSpecial],defensePlans:[...s.defensePlans],winner:s.winner,frames:s.frame,hash:resultHash(s),events:cloneV6(s.events)} as ResultV6);}
export function runFightV6(seed:number,a:BuildV6,b:BuildV6,options:FightOptionsV6={}):ResultV6 {
  const s=createFightV6(seed,a,b,options),commands=[...(options.commands??[])].sort((a,b)=>a.frame-b.frame);let at=0;
  while(!s.done){while(at<commands.length&&commands[at].frame===s.frame){const receipt=acceptSpecialV6(s,commands[at++]);if(!receipt.accepted)throw new Error(receipt.reason);}if(at<commands.length&&commands[at].frame<s.frame)throw new Error("Replay commands must use recorded ticks.");stepFightV6(s);}
  if(at<commands.length)throw new Error("A command was recorded after the fight ended.");return resultV6(s);
}
export function replayV6(result:ResultV6):ResultV6 {if(result.version!==6||result.rulesVersion!=="mk6-2"||result.catalogVersion!=="mk6-catalog-1")throw new Error("The recorded replay rules are not installed.");const replay=runFightV6(result.seed,result.builds[0],result.builds[1],{autoSpecial:result.autoSpecial,defensePlans:result.defensePlans,commands:result.commands});if(replay.hash!==result.hash)throw new Error("The replay does not match its recorded result.");return replay;}
