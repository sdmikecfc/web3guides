import {add,angle,axisQuatV6,clamp,cloneV6,crossV6,fromVectorsQuatV6,inverseQuatV6,length3,lerp,multiplyQuatV6,normalize,rotateQuatV6,rotateY,scale,slerpQuatV6,subtract,type Vec3,type QuatV6} from '@/lib/bots/v6/math';
import {BODY_SOCKETS_V6} from '@/lib/bots/v6/collision';
import {inversePointV7,markerV7,restNodesV7,transformPointV7,worldNodesV7} from './rig';
import type {ActionV7,FighterPoseV7,HeroRigV7,NodeTransformV7,PosedProxyV7,SideV7,StateV7} from './types';
const I:QuatV6=[0,0,0,1],smooth=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const qx=(r:number)=>axisQuatV6([1,0,0],r),qy=(r:number)=>axisQuatV6([0,1,0],r),qz=(r:number)=>axisQuatV6([0,0,1],r);
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
  nodes.root={position:[f.x,0,f.z],quaternion:qy(f.yaw/1000)};
  const speed=Math.hypot(f.velocityX,f.velocityZ),moving=clamp(speed/Math.max(1,build.stats.movement),0,1),reaction=f.reaction,age=reaction?frame-reaction.started:Infinity,isFallen=reaction?.kind==='ko'||reaction?.kind==='knockdown'&&frame<f.downUntil;
  let fall=0;if(isFallen){fall=smooth(age/28);if(reaction!.kind==='knockdown'&&age>45)fall*=1-smooth((age-45)/27);}
  const brace=phase.phase==='prepare'?phase.weight:phase.phase==='contact'?1-phase.t:0;
  const recoil=reaction?.kind==='hit'&&age<22?Math.sin(Math.PI*clamp(age/22,0,1))*reaction.strength:0;
  const localVelocity=rotateQuatV6([f.velocityX,0,f.velocityZ],inverseQuatV6(nodes.root.quaternion));
  nodes.pelvis.position[1]-=65+(overdrive?58:0)+brace*(build.style==='tank'?65:28);
  nodes.pelvis.quaternion=multiplyQuatV6(qz(clamp(-localVelocity[0]/750,-.09,.09)),qx(clamp(localVelocity[2]/650,-.1,.1)));
  nodes.chest.quaternion=multiplyQuatV6(qy((f.action?.special==='burst'?0:f.action?.mount==='left'?-1:1)*brace*(build.style==='speed'?.28:.16)),qx((overdrive?.19:0)+brace*.13-recoil*.1));
  nodes.head.quaternion=multiplyQuatV6(qy(-brace*(f.action?.special==='burst'?0:f.action?.mount==='left'?-1:1)*.1),qx(-brace*.08-(overdrive?.07:0)));
  if(reaction&&recoil){const local=rotateQuatV6(reaction.direction,inverseQuatV6(nodes.root.quaternion));nodes.chest.quaternion=multiplyQuatV6(nodes.chest.quaternion,multiplyQuatV6(qx(local[2]*recoil*.22),qz(-local[0]*recoil*.22)));}
  if(fall&&reaction){const local=rotateQuatV6(reaction.direction,inverseQuatV6(nodes.root.quaternion)),axis=normalize([local[2],0,-local[0]]);nodes.pelvis.quaternion=multiplyQuatV6(axisQuatV6(axis,fall*1.34),nodes.pelvis.quaternion);nodes.pelvis.position[1]-=fall*430;nodes.pelvis.position[0]+=local[0]*fall*160;nodes.pelvis.position[2]+=local[2]*fall*160;}
  let maxReachError=0;const reachErrors:Record<string,number>={};let world=worldNodesV7(rig,nodes);
  // Physical suspension lowers the pelvis when a planted foot needs more reach.
  // This moves the same chest/arm proxies seen by combat; it never stretches a leg.
  if(!fall){let lower=0;for(const suffix of ['L','R'] as const){if(f.armour[suffix==='L'?4:5]<=0)continue;const foot=f.feet[suffix==='L'?'left':'right'],t=foot.until>foot.started?clamp((frame-foot.started)/(foot.until-foot.started),0,1):1,p=foot.planted?foot.plant:add(lerp(foot.from,foot.to,smooth(t)),[0,Math.sin(t*Math.PI)*foot.lift,0]),target=subtract(p,rotateQuatV6(rig.markers['sole'+suffix].position,nodes.root.quaternion)),delta=subtract(world['hip'+suffix].position,target),reach=length3(nodes['knee'+suffix].position)+length3(nodes['ankle'+suffix].position)-2,horizontal=Math.hypot(delta[0],delta[2]);if(horizontal<reach)lower=Math.max(lower,delta[1]-Math.sqrt(reach*reach-horizontal*horizontal));}nodes.pelvis.position[1]-=clamp(lower,0,220);world=worldNodesV7(rig,nodes);}
  for(const suffix of ['L','R'] as const){const which=suffix==='L'?'left':'right',foot=f.feet[which],alive=f.armour[suffix==='L'?4:5]>0,ankle='ankle'+suffix;
    if(!alive||fall){nodes['hip'+suffix].quaternion=qx(fall*.72);nodes['knee'+suffix].quaternion=qx(-fall*1.05);continue;}
    const sole=rig.markers['sole'+suffix],footQ=nodes.root.quaternion,swing=foot.until>foot.started?clamp((frame-foot.started)/(foot.until-foot.started),0,1):1,point=foot.planted?foot.plant:add(lerp(foot.from,foot.to,smooth(swing)),[0,Math.sin(swing*Math.PI)*foot.lift,0]);
    const target=subtract(point,rotateQuatV6(sole?.position??[0,-180,80],footQ)),pole=rotateQuatV6([0,0,1],nodes.root.quaternion);
    reachErrors['leg'+suffix]=solveTwo(rig,nodes,'hip'+suffix,'knee'+suffix,ankle,target,pole);maxReachError=Math.max(maxReachError,reachErrors['leg'+suffix]);setWorldQuaternion(rig,nodes,ankle,footQ);
    for(const wheel of ['wheelFront'+suffix,'wheelBack'+suffix])if(nodes[wheel])nodes[wheel].quaternion=qx(foot.angle);
  }
  world=worldNodesV7(rig,nodes);const rest=worldNodesV7(rig,restNodesV7(rig)),chest=world.chest;
  for(const suffix of ['L','R'] as const){const mount=suffix==='L'?'left':'right',sign=suffix==='L'?-1:1,hand='hand'+suffix,wrist='wrist'+suffix,shoulder='shoulder'+suffix,alive=f.armour[suffix==='L'?2:3]>0;if(!alive)continue;
    const restHand=rest[hand].position,shoulderY=rest[shoulder].position[1],attacking=f.action&&(f.action.mount===mount||f.action.special==='charge'),isMelee=attacking&&!['shoulder_cannon','backup_pistol','special_burst'].includes(f.action!.kind),isGun=build.style==='ranged'&&(f.action?.kind==='backup_pistol'||f.action?.kind==='special_burst')&&(f.action?.kind==='special_burst'||f.action?.mount===mount);
    let carry:Vec3=[...restHand],carryRotation:QuatV6=I;
    if(overdrive){carry[1]+=45;carry[2]+=100;carryRotation=qx(.12);}if(mount==='left'&&f.guardPose>.01&&!build.capabilities.paired){carry=lerp(carry,[-310,shoulderY-210,340],f.guardPose);carryRotation=qx(f.guardPose*.75);}let desired:Vec3=[...carry],rotation:QuatV6=carryRotation;
    if(isMelee){const hammer=f.action!.kind==='hammer',p=phase.phase==='prepare'?smooth(phase.t/.74):1;
      const prep:Vec3=hammer?[sign*(Math.abs(restHand[0])+.03*1000),shoulderY+140,-100]:[sign*(Math.abs(restHand[0])+90),shoulderY-65,-45];
      const contactStart:Vec3=hammer?[sign*490,shoulderY+5,535]:[sign*250,shoulderY-150,460];
      const contactEnd:Vec3=hammer?[sign*460,shoulderY-360,450]:[sign*210,shoulderY-230,400];
      const prepQ=hammer?qx(-.72):multiplyQuatV6(qy(-sign*.35),qz(-sign*.8)),startQ=hammer?qx(.65):multiplyQuatV6(qx(.92),qz(sign*.4)),endQ=hammer?qx(1.7):multiplyQuatV6(qx(1.23),qz(sign*1.2));
      if(phase.phase==='prepare'){desired=lerp(carry,prep,p);rotation=slerpQuatV6(carryRotation,prepQ,p);}else if(phase.phase==='contact'){desired=lerp(contactStart,contactEnd,smooth(phase.t));rotation=slerpQuatV6(startQ,endQ,smooth(phase.t));}else {desired=lerp(contactEnd,carry,smooth(phase.t));rotation=slerpQuatV6(endQ,carryRotation,smooth(phase.t));}
      // The last preparation segment reaches the contact pose continuously.
      if(phase.phase==='prepare'&&phase.t>.74){const u=smooth((phase.t-.74)/.26);desired=lerp(prep,contactStart,u);rotation=slerpQuatV6(prepQ,startQ,u);}
      if(f.action!.kind==='punch'||f.action!.kind==='shove'||f.action!.kind==='special_charge'){
        const punch=f.action!.kind!=='special_charge',ready:Vec3=[sign*(Math.abs(restHand[0])-.09*1000),shoulderY-230,210],contact:Vec3=[sign*(Math.abs(restHand[0])-.12*1000),shoulderY-200,punch?480:270],u=phase.phase==='prepare'?smooth(phase.t):phase.phase==='contact'?1:1-smooth(phase.t);
        desired=lerp(carry,phase.phase==='prepare'?ready:contact,u);rotation=slerpQuatV6(carryRotation,qx(.3),u);
        if(phase.phase==='prepare'&&phase.t>.75)desired=lerp(ready,contact,smooth((phase.t-.75)/.25));
      }
    }else if(isGun){const draw=phase.phase==='prepare'?smooth(phase.t/.65):phase.phase==='contact'?1:1-smooth(phase.t);desired=lerp(carry,[sign*(Math.abs(restHand[0])-.04*1000),shoulderY-290,380],draw);rotation=slerpQuatV6(carryRotation,I,draw);}
    else if(mount==='left'&&f.guardPose>.01&&!build.capabilities.paired){desired=lerp(restHand,[-310,shoulderY-210,340],f.guardPose);rotation=qx(f.guardPose*.75);}
    if(fall){desired[1]+=fall*260;desired[2]-=fall*110;}
    // Desired carries are expressed in the authored root frame, then follow the physical chest.
    const localToChest=inversePointV7(rest.chest,desired),target=transformPointV7(chest,localToChest),wantedQ=isGun&&f.action?fromVectorsQuatV6([0,0,1],aimDirection(f.action.aim,target,f.action.aimError)):multiplyQuatV6(chest.quaternion,rotation),wristTarget=subtract(target,rotateQuatV6(nodes[hand].position,wantedQ)),pole=rotateQuatV6([sign,.08,-.4],nodes.root.quaternion);
    reachErrors['arm'+suffix]=solveTwo(rig,nodes,shoulder,'elbow'+suffix,wrist,wristTarget,pole);maxReachError=Math.max(maxReachError,reachErrors['arm'+suffix]);setWorldQuaternion(rig,nodes,wrist,wantedQ);
  }
  if(f.interruptedPose&&frame<f.interruptedPose.until){const blend=smooth((frame-f.interruptedPose.started)/(f.interruptedPose.until-f.interruptedPose.started));for(const [key,q] of Object.entries(f.interruptedPose.rotations))if(nodes[key])nodes[key].quaternion=slerpQuatV6(q,nodes[key].quaternion,blend);}
  world=worldNodesV7(rig,nodes);
  if(nodes.cannonYaw&&nodes.cannonPitch){const a=f.action,aim=a?.aim??[f.x+Math.sin(f.yaw/1000)*5000,1550,f.z+Math.cos(f.yaw/1000)*5000] as Vec3,base=world.cannonYaw,dir=rotateQuatV6(aimDirection(aim,base.position,a?.aimError),inverseQuatV6(base.quaternion)),yaw=clamp(Math.atan2(dir[0],dir[2]),-.62,.62),pitch=clamp(-Math.atan2(dir[1],Math.hypot(dir[0],dir[2])),-.45,.55);nodes.cannonYaw.quaternion=qy(yaw);nodes.cannonPitch.quaternion=qx(pitch);
    if(nodes.cannonDeploy)nodes.cannonDeploy.quaternion=qx(0);if(nodes.cannonRecoil){const shot=state.events.slice(-24).reverse().find(e=>e.kind==='shot'&&e.who===side&&e.mount==='shoulder'),t=shot?frame-shot.frame:99;nodes.cannonRecoil.position[2]-=t>=0&&t<18?Math.sin(Math.PI*t/18)*95:0;}}
  world=worldNodesV7(rig,nodes);
  for(const suffix of ['R','L'] as const){const name=suffix==='R'?'backupGun':'backupGunL',holster=suffix==='R'?'backupHolster':'backupHolsterL',mount=suffix==='R'?'right':'left';if(!nodes[name])continue;const draw=f.action&&(f.action.kind==='backup_pistol'||f.action.kind==='special_burst')&&(f.action.kind==='special_burst'||f.action.mount===mount)?phase.phase==='prepare'?smooth(phase.t/.65):phase.phase==='contact'?1:1-smooth(phase.t):0;
    const origin=rig.markers[holster]?markerV7(rig,world,holster):world[name].position,hand=world['hand'+suffix],q=slerpQuatV6(world[name].quaternion,hand.quaternion,draw);setRootRelative(rig,nodes,name,lerp(origin,hand.position,draw),q);}
  world=worldNodesV7(rig,nodes);
  if(fall){let lowest=Infinity;for(const p of rig.proxies){if(p.slot!=='torso'&&f.armour[BODY_SOCKETS_V6.indexOf(p.slot)]<=0)continue;const w=world[p.node];if(p.shape==='capsule'){lowest=Math.min(lowest,transformPointV7(w,p.a!)[1]-p.radius!,transformPointV7(w,p.b!)[1]-p.radius!);}else for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])lowest=Math.min(lowest,transformPointV7(w,add(p.center,[p.half[0]*x,p.half[1]*y,p.half[2]*z]))[1]);}if(lowest<0){nodes.root.position[1]-=lowest;world=worldNodesV7(rig,nodes);}}
  const proxies:PosedProxyV7[]=rig.proxies.map((p,proxyIndex)=>{const w=world[p.node];return {...cloneV6(p),proxyIndex,center:transformPointV7(w,p.center),orientation:w.quaternion,...(p.a?{a:transformPointV7(w,p.a)}:{}),...(p.b?{b:transformPointV7(w,p.b)}:{})};});
  const mounts:FighterPoseV7['mounts']={},weapons:FighterPoseV7['weapons']={};
  for(const mount of ['left','right','shoulder'] as const){const suffix=mount==='left'?'L':'R',node=mount==='shoulder'?'cannonRecoil':build.style==='ranged'?mount==='left'?'backupGunL':'backupGun':'weapon'+suffix;if(!world[node])continue;const marker=mount==='shoulder'?'cannonMuzzle':build.style==='ranged'?mount==='left'?'backupMuzzleL':'backupMuzzle':'weaponStrike'+suffix,m=rig.markers[marker],w=world[node],muzzle=m?markerV7(rig,world,marker):w.position,forward=m?.normal?rotateQuatV6(m.normal,world[m.node].quaternion):rotateQuatV6([0,0,1],w.quaternion);mounts[mount]={node,position:w.position,quaternion:w.quaternion,muzzle,forward:normalize(forward),aimable:!controlled&&f.armour[mount==='left'?2:mount==='right'?3:1]>0};weapons[mount]=w;}
  const feet={left:markerV7(rig,world,'soleL'),right:markerV7(rig,world,'soleR')};
  return {nodes,worldNodes:world,proxies,mounts,weapons,support:{feet,planted:{left:f.feet.left.planted,right:f.feet.right.planted},maxReachError,reachErrors},root:nodes.root,aftermath:state.done?clamp((frame-state.frame)/84,0,1):0};
}
