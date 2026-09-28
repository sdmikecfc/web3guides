import {add,angle,axisQuatV6,clamp,cloneV6,crossV6,fromVectorsQuatV6,inverseQuatV6,length3,lerp,multiplyQuatV6,normalize,rotateQuatV6,rotateY,scale,slerpQuatV6,subtract,type Vec3,type QuatV6} from '@/lib/bots/v6/math';
import {BODY_SOCKETS_V6} from '@/lib/bots/v6/collision';
import {inversePointV7,markerV7,restNodesV7,transformPointV7,worldNodesV7} from './rig';
import type {ActionV7,FighterPoseV7,HeroRigV7,NodeTransformV7,PosedProxyV7,SideV7,StateV7} from './types';
import {attackMotionV7} from './motion';
const I:QuatV6=[0,0,0,1],smooth=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const qx=(r:number)=>axisQuatV6([1,0,0],r),qy=(r:number)=>axisQuatV6([0,1,0],r),qz=(r:number)=>axisQuatV6([0,0,1],r);
const impactPulse=(age:number,peak:number,end:number)=>age<0||age>=end?0:age<peak?Math.sin(age/peak*Math.PI/2):Math.pow(1-(age-peak)/(end-peak),2);
function aimDirection(aim:Vec3,origin:Vec3,error:Vec3=[0,0,0]):Vec3{const direction=rotateY(normalize(subtract(aim,origin)),error[0]);direction[1]+=error[1]/1000;return normalize(direction);}
export function actionPhaseV7(action:ActionV7|null,frame:number):{phase:'idle'|'prepare'|'contact'|'recover';t:number;weight:number}{if(!action)return {phase:'idle',t:0,weight:0};const age=frame-action.started;if(age<action.windup)return {phase:'prepare',t:clamp(age/action.windup,0,1),weight:smooth(age/action.windup)};if(age<action.windup+action.active)return {phase:'contact',t:clamp((age-action.windup)/action.active,0,1),weight:1};const t=clamp((age-action.windup-action.active)/Math.max(1,action.recovery),0,1);return {phase:'recover',t,weight:1-smooth(t)};}
/** Two rigid links: the desired point may clamp, but neither bone ever stretches. */
function solveTwo(rig:HeroRigV7,nodes:Record<string,NodeTransformV7>,upper:string,middle:string,end:string,target:Vec3,pole:Vec3):number{
  let world=worldNodesV7(rig,nodes);const start=world[upper].position,a=length3(nodes[middle].position),b=length3(nodes[end].position),delta=subtract(target,start),requested=length3(delta),distance=clamp(requested,Math.abs(a-b)+.01,a+b-.01),dir=normalize(delta),projection=scale(dir,pole[0]*dir[0]+pole[1]*dir[1]+pole[2]*dir[2]),perp=normalize(subtract(pole,projection));
  const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along)),elbow=add(start,add(scale(dir,along),scale(perp,height))),goal=add(start,scale(dir,distance));
  const parent=rig.nodes[upper].parent!,parentQ=world[parent].quaternion,wantedUpper=fromVectorsQuatV6(nodes[middle].position,subtract(elbow,start));nodes[upper].quaternion=multiplyQuatV6(inverseQuatV6(parentQ),wantedUpper);
  world=worldNodesV7(rig,nodes);const wantedLower=fromVectorsQuatV6(nodes[end].position,subtract(goal,elbow));nodes[middle].quaternion=multiplyQuatV6(inverseQuatV6(world[upper].quaternion),wantedLower);return Math.max(0,requested-(a+b));
}
function setWorldQuaternion(rig:HeroRigV7,nodes:Record<string,NodeTransformV7>,name:string,q:QuatV6){const parent=rig.nodes[name].parent,world=worldNodesV7(rig,nodes);nodes[name].quaternion=parent?multiplyQuatV6(inverseQuatV6(world[parent].quaternion),q):q;}
function setRootRelative(rig:HeroRigV7,nodes:Record<string,NodeTransformV7>,name:string,position:Vec3,q:QuatV6){const world=worldNodesV7(rig,nodes),parent=rig.nodes[name].parent;nodes[name]={position:parent?inversePointV7(world[parent],position):position,quaternion:parent?multiplyQuatV6(inverseQuatV6(world[parent].quaternion),q):q};}
export function fighterPoseV7(state:StateV7,side:SideV7,frameOverride=state.frame):FighterPoseV7{
  const f=state.fighters[side],build=state.builds[side],rig=build.rig,nodes=restNodesV7(rig),frame=state.done?Math.max(state.frame,frameOverride):state.frame,phase=actionPhaseV7(f.action,frame),overdrive=!!f.special&&f.special.style==='speed'&&frame<f.special.until,controlled=frame<f.downUntil||frame<f.stunnedUntil;
  const rest=worldNodesV7(rig,nodes);
  const overdriveWeight=overdrive&&f.special?smooth((frame-f.special.started)/8)*smooth((f.special.until-frame)/12):0;
  nodes.root={position:[f.x,0,f.z],quaternion:qy(f.yaw/1000)};
  const speed=Math.hypot(f.velocityX,f.velocityZ),moving=clamp(speed/Math.max(1,build.stats.movement),0,1),reaction=f.reaction,age=reaction?frame-reaction.started:Infinity,isFallen=reaction?.kind==='ko'||reaction?.kind==='knockdown'&&frame<f.downUntil;
  let fall=0;if(isFallen){fall=smooth(age/28);if(reaction!.kind==='knockdown'&&age>45)fall*=1-smooth((age-45)/27);}
  const brace=phase.phase==='prepare'?phase.weight:phase.phase==='contact'?1-phase.t:0;
  const recoil=reaction&&(reaction.kind==='hit'||reaction.kind==='stun')?impactPulse(age,7,28)*reaction.strength:0;
  const localVelocity=rotateQuatV6([f.velocityX,0,f.velocityZ],inverseQuatV6(nodes.root.quaternion));
  const readyHand=(suffix:'L'|'R'):Vec3=>{const p=rest['shoulder'+suffix].position,sign=suffix==='L'?-1:1;return [p[0]-sign*(build.style==='tank'?60:45),p[1]-(build.style==='tank'?420:build.style==='speed'?350:400)+55*overdriveWeight,190+80*overdriveWeight];};
  const carryAngles:Vec3=[build.style==='speed'?.24:.10,build.style==='speed'?.20:0,build.style==='speed'?-.12:0];
  const workingSuffix=f.action?.mount==='left'?'L':'R',workingSign=workingSuffix==='L'?-1:1;
  const motion=f.action?attackMotionV7(f.action,frame,workingSign,rest['shoulder'+workingSuffix].position,readyHand(workingSuffix),carryAngles):null;
  const defence=f.defence&&frame<f.defence.until&&!controlled&&!isFallen?f.defence:null;
  const defenceT=defence?clamp((frame-defence.started)/Math.max(1,defence.until-defence.started),0,1):0;
  const defenceWeight=defence?Math.sin(Math.PI*defenceT):0;
  const localDefence=defence?rotateQuatV6(defence.direction,inverseQuatV6(nodes.root.quaternion)):[0,0,0] as Vec3;
  const duck=defence?.kind==='duck'?230: defence?.kind==='roll'?270: defence?.kind==='slip'?80:0;
  const slip=defence?.kind==='slip'||defence?.kind==='roll'?localDefence[0]*defenceWeight:0;
  const stanceTwist=build.style==='tank'?-.10:build.style==='speed'?-.18:-.12;
  const twist=stanceTwist+(f.action?.special==='burst'?0:motion?.twist??0);
  nodes.pelvis.position[1]-=78+130*overdriveWeight+(motion?.crouch??0)+duck*defenceWeight+recoil*24;
  nodes.pelvis.position[0]+=slip*115;
  nodes.pelvis.quaternion=multiplyQuatV6(qy(twist*.22),multiplyQuatV6(qz(clamp(-localVelocity[0]/300,-.22,.22)-slip*.13),qx(clamp(localVelocity[2]/320,-.22,.22))));
  nodes.chest.quaternion=multiplyQuatV6(qy(twist*.78),multiplyQuatV6(qx(.055+.32*overdriveWeight+(motion?.pitch??0)-recoil*.13+(defence?.kind==='duck'?.35*defenceWeight:0)),qz((motion?.roll??0)-slip*.32)));
  const rival=state.fighters[(1-side) as SideV7],tracking=clamp(angle(Math.atan2(rival.x-f.x,rival.z-f.z)-f.yaw/1000),-.6,.6);
  nodes.head.quaternion=multiplyQuatV6(qy(tracking-twist*.60),qx(-(motion?.pitch??0)*.45-.16*overdriveWeight));
  if(reaction&&recoil){const local=rotateQuatV6(reaction.direction,inverseQuatV6(nodes.root.quaternion));nodes.pelvis.position[0]+=local[0]*recoil*24;nodes.pelvis.position[2]+=local[2]*recoil*24;nodes.pelvis.position[1]-=recoil*15;nodes.pelvis.quaternion=multiplyQuatV6(nodes.pelvis.quaternion,multiplyQuatV6(qx(local[2]*recoil*.09),qz(-local[0]*recoil*.09)));}
  if(f.interruptedPose?.pelvis&&frame<f.interruptedPose.until){const blend=smooth((frame-f.interruptedPose.started)/Math.max(1,f.interruptedPose.until-f.interruptedPose.started));nodes.pelvis.position=lerp(f.interruptedPose.pelvis.position,nodes.pelvis.position,blend);nodes.pelvis.quaternion=slerpQuatV6(f.interruptedPose.pelvis.quaternion,nodes.pelvis.quaternion,blend);}
  if(fall&&reaction){const local=rotateQuatV6(reaction.direction,inverseQuatV6(nodes.root.quaternion)),axis=normalize([local[2],0,-local[0]]);nodes.pelvis.quaternion=multiplyQuatV6(axisQuatV6(axis,fall*1.34),nodes.pelvis.quaternion);nodes.pelvis.position[1]-=fall*430;nodes.pelvis.position[0]+=local[0]*fall*160;nodes.pelvis.position[2]+=local[2]*fall*160;}
  const footPoint=(suffix:'L'|'R'):Vec3=>{
    const foot=f.feet[suffix==='L'?'left':'right'];
    if(f.action?.kind==='kick'&&f.action.mount===(suffix==='L'?'left':'right')&&!fall){
      const base=markerV7(rig,rest,'sole'+suffix),local=(y:number,z:number)=>transformPointV7(nodes.root,[base[0],y,z]);
      const chamber=local(430,170),contact=local(625,610),extended=local(665,710);
      if(phase.phase==='prepare')return phase.t<.62?lerp(foot.from,chamber,smooth(phase.t/.62)):lerp(chamber,contact,smooth((phase.t-.62)/.38));
      if(phase.phase==='contact')return phase.t<.48?lerp(contact,extended,smooth(phase.t/.48)):lerp(extended,chamber,smooth((phase.t-.48)/.52));
      return lerp(chamber,foot.to,smooth(phase.t));
    }
    const t=foot.until>foot.started?clamp((frame-foot.started)/(foot.until-foot.started),0,1):1;
    return foot.planted?foot.plant:add(lerp(foot.from,foot.to,smooth(t)),[0,Math.sin(t*Math.PI)*foot.lift,0]);
  };
  const footRotation=(suffix:'L'|'R'):QuatV6=>{
    const which=suffix==='L'?'left':'right',foot=f.feet[which];
    if(rig.legKind[which]==='wheel'||f.action?.kind==='kick'&&f.action.mount===which)return nodes.root.quaternion;
    const from=foot.fromYaw??foot.yaw??f.yaw,to=foot.toYaw??from;
    const t=foot.planted?0:smooth((frame-foot.started)/Math.max(1,foot.until-foot.started));
    return qy(foot.planted?(foot.yaw??f.yaw)/1000:from/1000+angle((to-from)/1000)*t);
  };
  let maxReachError=0;const reachErrors:Record<string,number>={};let world=worldNodesV7(rig,nodes);
  // Physical suspension lowers the pelvis when a planted foot needs more reach.
  // This moves the same chest/arm proxies seen by combat; it never stretches a leg.
  if(fall<1){let lower=0;for(const suffix of ['L','R'] as const){if(f.armour[suffix==='L'?4:5]<=0)continue;const p=footPoint(suffix),target=subtract(p,rotateQuatV6(rig.markers['sole'+suffix].position,footRotation(suffix))),delta=subtract(world['hip'+suffix].position,target),reach=length3(nodes['knee'+suffix].position)+length3(nodes['ankle'+suffix].position)-2,horizontal=Math.hypot(delta[0],delta[2]);lower=Math.max(lower,delta[1]-Math.sqrt(Math.max(0,reach*reach-horizontal*horizontal)));}nodes.pelvis.position[1]-=clamp(lower,0,220)*(1-fall);world=worldNodesV7(rig,nodes);}
  for(const suffix of ['L','R'] as const){const which=suffix==='L'?'left':'right',foot=f.feet[which],alive=f.armour[suffix==='L'?4:5]>0,ankle='ankle'+suffix;
    if(!alive){nodes['hip'+suffix].quaternion=qx(fall*.72);nodes['knee'+suffix].quaternion=qx(-fall*1.05);continue;}
    const sole=rig.markers['sole'+suffix],footQ=footRotation(suffix),point=footPoint(suffix);
    const target=subtract(point,rotateQuatV6(sole?.position??[0,-180,80],footQ)),pole=rotateQuatV6([0,0,1],nodes.root.quaternion);
    const reachError=solveTwo(rig,nodes,'hip'+suffix,'knee'+suffix,ankle,target,pole);reachErrors['leg'+suffix]=fall?0:reachError;maxReachError=Math.max(maxReachError,reachErrors['leg'+suffix]);setWorldQuaternion(rig,nodes,ankle,footQ);
    // A falling robot releases its planted stance progressively. Switching to
    // straight rest legs on the first fall frame makes floor support pop up.
    if(fall){nodes['hip'+suffix].quaternion=slerpQuatV6(nodes['hip'+suffix].quaternion,qx(.72),fall);nodes['knee'+suffix].quaternion=slerpQuatV6(nodes['knee'+suffix].quaternion,qx(-1.05),fall);nodes[ankle].quaternion=slerpQuatV6(nodes[ankle].quaternion,I,fall);}
    for(const wheel of ['wheelFront'+suffix,'wheelBack'+suffix])if(nodes[wheel])nodes[wheel].quaternion=qx(foot.angle);
  }
  world=worldNodesV7(rig,nodes);const chest=world.chest;
  for(const suffix of ['L','R'] as const){const mount=suffix==='L'?'left':'right',sign=suffix==='L'?-1:1,hand='hand'+suffix,wrist='wrist'+suffix,shoulder='shoulder'+suffix,alive=f.armour[suffix==='L'?2:3]>0;if(!alive)continue;
    const shoulderY=rest[shoulder].position[1];
    const attacking=f.action&&(f.action.mount===mount||f.action.special==='charge');
    const isMelee=attacking&&!['kick','shoulder_cannon','backup_pistol','special_burst'].includes(f.action!.kind);
    const isGun=build.style==='ranged'&&(f.action?.kind==='backup_pistol'||f.action?.kind==='special_burst')&&(f.action?.kind==='special_burst'||f.action?.mount===mount);
    const carry=readyHand(suffix),carryRotation=multiplyQuatV6(qy(carryAngles[1]*sign),multiplyQuatV6(qx(carryAngles[0]),qz(carryAngles[2]*sign)));
    let desired:Vec3=[...carry],rotation:QuatV6=carryRotation;
    // A parry grows from the existing guard. It must not lower a raised hand at
    // activation, or snap it back up when the defensive motion ends.
    const guard=Math.max(mount==='left'&&!build.capabilities.paired?f.guardPose:0,defence?.kind==='parry'?defenceWeight:0);
    if(guard>.01){desired=lerp(carry,[rest[shoulder].position[0]-sign*130,shoulderY-175,330],guard);rotation=slerpQuatV6(carryRotation,multiplyQuatV6(qx(.5),qz(-sign*.25)),guard);}
    if(defence?.kind==='duck'||defence?.kind==='slip'||defence?.kind==='roll'){desired[1]+=defenceWeight*120;desired[2]+=defenceWeight*80;rotation=multiplyQuatV6(qx(defenceWeight*.25),rotation);}
    const held=f.sidearms?.[mount],heldWeight=held&&frame<held.until?smooth((frame-held.started)/12)*smooth((held.until-frame)/22):0;
    if(build.style==='ranged'){desired[1]+=75*heldWeight;desired[2]+=80*heldWeight;}
    const idleRotation=rotation,action=f.action;
    const actionWeight=action?smooth((frame-action.started)/8)*smooth((action.started+action.windup+action.active+action.recovery-frame)/10):0;
    if(isMelee||isGun){
      const armMotion=attackMotionV7(action!,frame,sign,rest[shoulder].position,carry,carryAngles);
      desired=lerp(desired,armMotion.hand,actionWeight);rotation=slerpQuatV6(rotation,armMotion.rotation,actionWeight);
    }else if(action&&phase.phase!=='idle'&&guard<.3){desired[1]+=phase.weight*65;desired[2]+=phase.weight*55;rotation=multiplyQuatV6(qx(phase.weight*.12),rotation);}
    if(fall){desired[1]+=fall*260;desired[2]-=fall*110;}
    // Desired carries are expressed in the authored root frame, then follow the physical chest.
    const localToChest=inversePointV7(rest.chest,desired),target=transformPointV7(chest,localToChest),wantedQ=isGun&&action?slerpQuatV6(multiplyQuatV6(chest.quaternion,idleRotation),fromVectorsQuatV6([0,0,1],aimDirection(action.aim,target,action.aimError)),actionWeight):multiplyQuatV6(chest.quaternion,rotation),wristTarget=subtract(target,rotateQuatV6(nodes[hand].position,wantedQ)),pole=rotateQuatV6([sign,.08,-.4],nodes.root.quaternion);
    reachErrors['arm'+suffix]=solveTwo(rig,nodes,shoulder,'elbow'+suffix,wrist,wristTarget,pole);maxReachError=Math.max(maxReachError,reachErrors['arm'+suffix]);setWorldQuaternion(rig,nodes,wrist,wantedQ);
  }
  // Feet remain governed by their physical supports, including the progressive
  // release above. Reapplying old leg rotations here would undo the IK solve.
  if(f.interruptedPose&&frame<f.interruptedPose.until){const blend=smooth((frame-f.interruptedPose.started)/(f.interruptedPose.until-f.interruptedPose.started));for(const [key,q] of Object.entries(f.interruptedPose.rotations))if(nodes[key]&&!/^(hip|knee|ankle)/.test(key))nodes[key].quaternion=slerpQuatV6(q,nodes[key].quaternion,blend);}
  // The hit travels through the neck, chest and hips at different times. Apply
  // the upper-body impulse after the interrupted pose blend so a cancelled
  // wind-up cannot hide the reaction. These are also the collision transforms.
  if(reaction&&(reaction.kind==='hit'||reaction.kind==='stun')&&age<28&&!fall){const local=rotateQuatV6(reaction.direction,inverseQuatV6(nodes.root.quaternion)),chestHit=impactPulse(age,4,24)*reaction.strength,headHit=impactPulse(age,2,20)*reaction.strength*(reaction.slot==='head'?1:.55);nodes.chest.quaternion=multiplyQuatV6(multiplyQuatV6(qx(local[2]*chestHit*.24),qz(-local[0]*chestHit*.24)),nodes.chest.quaternion);nodes.head.quaternion=multiplyQuatV6(multiplyQuatV6(qx(local[2]*headHit*.30),qz(-local[0]*headHit*.30)),nodes.head.quaternion);}
  world=worldNodesV7(rig,nodes);
  if(nodes.cannonYaw&&nodes.cannonPitch){const a=f.action,aim=a?.aim??[f.x+Math.sin(f.yaw/1000)*5000,1550,f.z+Math.cos(f.yaw/1000)*5000] as Vec3,base=world.cannonYaw,dir=rotateQuatV6(aimDirection(aim,base.position,a?.aimError),inverseQuatV6(base.quaternion)),yaw=clamp(Math.atan2(dir[0],dir[2]),-.62,.62),pitch=clamp(-Math.atan2(dir[1],Math.hypot(dir[0],dir[2])),-.45,.55);nodes.cannonYaw.quaternion=qy(yaw);nodes.cannonPitch.quaternion=qx(pitch);
    if(nodes.cannonDeploy)nodes.cannonDeploy.quaternion=qx(0);if(nodes.cannonRecoil){const shot=state.events.slice(-24).reverse().find(e=>e.kind==='shot'&&e.who===side&&e.mount==='shoulder'),t=shot?frame-shot.frame:99;nodes.cannonRecoil.position[2]-=t>=0&&t<18?Math.sin(Math.PI*t/18)*95:0;}}
  world=worldNodesV7(rig,nodes);
  for(const suffix of ['R','L'] as const){const name=suffix==='R'?'backupGun':'backupGunL',holster=suffix==='R'?'backupHolster':'backupHolsterL',mount=suffix==='R'?'right':'left';if(!nodes[name])continue;const held=f.sidearms?.[mount],draw=held&&frame<held.until?smooth((frame-held.started)/12)*smooth((held.until-frame)/22):f.action&&(f.action.kind==='backup_pistol'||f.action.kind==='special_burst')&&(f.action.kind==='special_burst'||f.action.mount===mount)?phase.phase==='prepare'?smooth(phase.t/.65):phase.phase==='contact'?1:1-smooth(phase.t):0;
    const origin=rig.markers[holster]?markerV7(rig,world,holster):world[holster]?.position??world[name].position,hand=world['hand'+suffix],holsteredQ=world[holster]&&rest[holster]?multiplyQuatV6(world[holster].quaternion,multiplyQuatV6(inverseQuatV6(rest[holster].quaternion),rest[name].quaternion)):world[name].quaternion,q=slerpQuatV6(holsteredQ,hand.quaternion,draw);setRootRelative(rig,nodes,name,lerp(origin,hand.position,draw),q);}
  world=worldNodesV7(rig,nodes);
  if(fall){let lowest=Infinity;for(const p of rig.proxies){if(p.slot!=='torso'&&f.armour[BODY_SOCKETS_V6.indexOf(p.slot)]<=0)continue;const w=world[p.node];if(p.shape==='capsule'){lowest=Math.min(lowest,transformPointV7(w,p.a!)[1]-p.radius!,transformPointV7(w,p.b!)[1]-p.radius!);}else for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])lowest=Math.min(lowest,transformPointV7(w,add(p.center,[p.half[0]*x,p.half[1]*y,p.half[2]*z]))[1]);}if(lowest<0){nodes.root.position[1]-=lowest;world=worldNodesV7(rig,nodes);}}
  const proxies:PosedProxyV7[]=rig.proxies.map((p,proxyIndex)=>{const w=world[p.node];return {...cloneV6(p),proxyIndex,center:transformPointV7(w,p.center),orientation:w.quaternion,...(p.a?{a:transformPointV7(w,p.a)}:{}),...(p.b?{b:transformPointV7(w,p.b)}:{})};});
  const mounts:FighterPoseV7['mounts']={},weapons:FighterPoseV7['weapons']={};
  for(const mount of ['left','right','shoulder'] as const){const suffix=mount==='left'?'L':'R',node=mount==='shoulder'?'cannonRecoil':build.style==='ranged'?mount==='left'?'backupGunL':'backupGun':'weapon'+suffix;if(!world[node])continue;const marker=mount==='shoulder'?'cannonMuzzle':build.style==='ranged'?mount==='left'?'backupMuzzleL':'backupMuzzle':'weaponStrike'+suffix,m=rig.markers[marker],w=world[node],muzzle=m?markerV7(rig,world,marker):w.position,forward=m?.normal?rotateQuatV6(m.normal,world[m.node].quaternion):rotateQuatV6([0,0,1],w.quaternion);mounts[mount]={node,position:w.position,quaternion:w.quaternion,muzzle,forward:normalize(forward),aimable:!controlled&&f.armour[mount==='left'?2:mount==='right'?3:1]>0};weapons[mount]=w;}
  const feet={left:markerV7(rig,world,'soleL'),right:markerV7(rig,world,'soleR')};
  return {nodes,worldNodes:world,proxies,mounts,weapons,support:{feet,planted:{left:f.feet.left.planted,right:f.feet.right.planted},maxReachError,reachErrors},root:nodes.root,aftermath:state.done?clamp((frame-state.frame)/84,0,1):0};
}
