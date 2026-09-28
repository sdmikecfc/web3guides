import * as T from 'three';
import type {ActionPath} from './weapon-actions';
export type EquipmentMotion={path:ActionPath;phase:number;mount?:'L'|'R';recoil?:number;contactHeight?:number;contactTarget?:number[];travel?:number[];gait?:number;burst?:boolean;overdrive?:boolean;reaction?:number[];brace?:boolean;shieldGuard?:number};
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
function frame(axis:T.Vector3,normal:T.Vector3){const z=axis.clone().normalize(),x=normal.clone().addScaledVector(z,-normal.dot(z)).normalize(),y=new T.Vector3().crossVectors(z,x).normalize();return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z))}
/** Weapon-led display poses. Both arms solve to a single rigid weapon, so a
 * support hand cannot drift away when a different body's proportions are used. */
export function equipmentPose(model:T.Group){
 const get=(name:string)=>{const o=model.getObjectByName(name);if(!o)throw Error('Missing equipment socket '+name);return o};
 model.updateMatrixWorld(true);
 const bind=new Map<T.Object3D,{p:T.Vector3;q:T.Quaternion;world:T.Vector3;worldQ:T.Quaternion}>();model.traverse(o=>{if(!(o as T.Mesh).isMesh)bind.set(o,{p:o.position.clone(),q:o.quaternion.clone(),world:o.getWorldPosition(V()),worldQ:o.getWorldQuaternion(new T.Quaternion())})});
 const b=(name:string)=>bind.get(get(name))!;
 const kind=model.getObjectByName('muzzle')?'rifle':model.getObjectByName('hammerHeadCentre')?'hammer':model.getObjectByName('twoHandGrip')?'greatsword':model.userData.weaponKind==='spear'?'spear':'sword';
 const twoHanded=model.userData.weaponHands!==undefined?model.userData.weaponHands===2:kind==='rifle'||kind==='hammer'||kind==='greatsword';
 const grip=b('gripR').world,shaft=kind==='hammer'?b('hammerHeadCentre').world.clone().sub(grip).normalize():b('weaponAxis').world.clone().sub(grip).normalize(),normal=kind==='hammer'?b('hammerFace').world.clone().sub(b('hammerHeadCentre').world).normalize():b('weaponNormal').world.clone().sub(grip).normalize();
 const chains=['L','R'].map(s=>{const a=b('shoulder'+s),c=b('elbow'+s),d=b('wrist'+s),ab=c.world.clone().sub(a.world),bc=d.world.clone().sub(c.world);return {s,a:get('shoulder'+s),c:get('elbow'+s),d:get('wrist'+s),ab,bc,l1:ab.length(),l2:bc.length(),normal:new T.Vector3().crossVectors(ab,bc).normalize(),qa:a.worldQ,qb:c.worldQ}});
 const handFrames=Object.fromEntries(['L','R'].map(s=>{const p=b('handGrip'+s).world,axis=b('handAxis'+s).world.clone().sub(p),palm=b('handPalm'+s).world.clone().sub(p);return [s,{frame:frame(axis,palm),offset:p.clone().sub(b('wrist'+s).world)}]}));
 const supportMarker=model.getObjectByName('supportGrip')?'supportGrip':model.getObjectByName('twoHandGrip')?'twoHandGrip':null;
 const supportOffset=supportMarker?b(supportMarker).world.clone().sub(grip):shaft.clone().multiplyScalar(.53);
 const wide=Math.abs(b('shoulderL').world.x-b('shoulderR').world.x)>1.7,shoulderY=(b('shoulderL').world.y+b('shoulderR').world.y)/2;
 function worldQ(o:T.Object3D,q:T.Quaternion){o.quaternion.copy(o.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));o.updateWorldMatrix(false,true)}
 function solve(s:string,target:T.Vector3,q:T.Quaternion){const c=chains.find(c=>c.s===s)!,p=c.a.getWorldPosition(V()),raw=target.clone().sub(p),reach=raw.length(),len=T.MathUtils.clamp(reach,Math.abs(c.l1-c.l2)+1e-5,c.l1+c.l2-1e-5),dir=raw.normalize(),pole=V(s==='L'?2.2:-2.2,shoulderY-.55,-.30),perp=pole.sub(p).addScaledVector(dir,-pole.dot(dir)).normalize(),x=(c.l1*c.l1-c.l2*c.l2+len*len)/(2*len),mid=p.clone().addScaledVector(dir,x).addScaledVector(perp,Math.sqrt(Math.max(0,c.l1*c.l1-x*x))),end=p.clone().addScaledVector(dir,len),a=mid.clone().sub(p),d=end.clone().sub(mid),n=new T.Vector3().crossVectors(a,d).normalize();
  worldQ(c.a,frame(a,n).multiply(frame(c.ab,c.normal).invert()).multiply(c.qa));worldQ(c.c,frame(d,n).multiply(frame(c.bc,c.normal).invert()).multiply(c.qb));worldQ(c.d,q.clone().multiply(b('wrist'+s).worldQ));worldQ(get('hand'+s),q.clone().multiply(b('hand'+s).worldQ));return Math.max(0,reach-(c.l1+c.l2));
 }
 let report:any={};
 function pose(value=0,motion?:EquipmentMotion){bind.forEach((b,o)=>{o.position.copy(b.p);o.quaternion.copy(b.q)});const wave=Math.sin(value*Math.PI*2),amount=.10*wave;
  // Apply body mechanics BEFORE solving the hands to their grips.
  if(motion?.travel){
   const [x,,z]=motion.travel,speed=Math.hypot(x,z),moving=Math.min(1,speed/1.8),gait=motion.gait??0;
   const pelvis=get('pelvis'),chest=get('chest'),r=motion.reaction??[0,0];
   const stride=Math.sin(gait*4.7);
   pelvis.position.y-=Math.abs(stride)*.08*moving+(motion.burst?.14:0)+(motion.overdrive?.10:0);
   pelvis.rotateZ(T.MathUtils.clamp(-x*.08,-.24,.24));pelvis.rotateX(T.MathUtils.clamp(z*.065,-.20,.20));
   pelvis.rotateY(stride*.06*moving);
   chest.rotateX(T.MathUtils.clamp(z*.035,-.10,.12)+r[1]*.23+(motion.brace?.07:0));
   chest.rotateZ(-r[0]*.25);chest.rotateY(r[0]*.12);
   get('head').rotateZ(r[0]*.10);get('head').rotateX(-r[1]*.12);
  }
  if(motion?.path==='punch'){
   const p=T.MathUtils.clamp(motion.phase,0,1),mount=motion.mount??'R',sign=mount==='R'?-1:1,load=T.MathUtils.smoothstep(p,0,.30)*(1-T.MathUtils.smoothstep(p,.30,.50)),strike=T.MathUtils.smoothstep(p,.30,.56)*(1-T.MathUtils.smoothstep(p,.65,1));
   get('chest').rotateY(sign*(.14*load-.38*strike));get('chest').rotateX(.16*strike);get('pelvis').position.z+=.18*strike;model.updateMatrixWorld(true);
   const target=motion.contactTarget?V().fromArray(motion.contactTarget):V(0,shoulderY-.4,2.4),aim=target.clone().sub(V(sign*.55,shoulderY-.40,.65)).normalize();
   const handTarget=V(sign*(wide?.70:.48),shoulderY-.42,.65-.22*load).lerp(target.addScaledVector(aim,-.35),strike),rotation=new T.Quaternion().setFromUnitVectors(handFrames[mount].offset.clone().normalize(),aim);
   const reach=solve(mount,handTarget.clone().sub(handFrames[mount].offset.clone().applyQuaternion(rotation)),rotation);model.updateMatrixWorld(true);report={kind:'backup',twoHanded:false,mount,reach,phase:p};return report;
  }
  if(kind==='rifle')get('chest').rotateY(motion?-.18:-.42);
  if(motion&&motion.path!=='ready'&&kind!=='rifle'){const p=motion.phase,load=Math.sin(Math.min(1,p/.40)*Math.PI/2)*(1-T.MathUtils.smoothstep(p,.40,1));get('chest').rotateY(-.32*load+.30*Math.sin(Math.max(0,p-.4)*Math.PI*2));get('chest').rotateX(.26*Math.sin(p*Math.PI));}
  get('head').rotateY(kind==='rifle'?(motion?.18:.92):.07*wave);
  if(['spear_shield','long_spear'].includes(model.userData.weaponKind)&&motion?.path==='butt'){const p=motion.phase,choke=(model.userData.weaponKind==='long_spear'?1.0:.88)*Math.min(1,p/.30,(1-p)/.35),weapon=get('weaponR'),parentBind=bind.get(weapon.parent!)!;weapon.position.addScaledVector(shaft.clone().applyQuaternion(parentBind.worldQ.clone().invert()),-choke);for(const name of ['gripR','weaponAxis','weaponNormal',...(model.userData.weaponKind==='long_spear'?['twoHandGrip']:[])]){const marker=get(name),parent=bind.get(marker.parent!)!;marker.position.addScaledVector(shaft.clone().applyQuaternion(parent.worldQ.clone().invert()),choke);}}
  model.updateMatrixWorld(true);
  let direction:T.Vector3,face:T.Vector3,right:T.Vector3;
  if(kind==='rifle'){direction=V(.62,-.04+amount,1).normalize();face=V(0,1,0);right=V(wide?-.42:-.34,shoulderY-.43,wide?.78:.62)}
  else if(kind==='hammer'){direction=V(.22,.91,.33+amount).normalize();face=V(0,-.34,1);right=V(-.20,shoulderY-.50,wide?.87:.71)}
  else if(kind==='greatsword'){direction=V(.40,.90,.17+amount).normalize();face=V(0,0,1);right=V(-.20,shoulderY-.40,wide?.86:.69)}
  else{direction=kind==='spear'?V(-.10,.98,.12+amount).normalize():V(-.15,.88,.45+amount).normalize();face=V(0,0,1);right=V(wide?-.84:-.63,shoulderY-.72,wide?.83:.61)}
  if(motion&&motion.path!=='ready'){
   const p=T.MathUtils.clamp(motion.phase,0,1),lerp=T.MathUtils.lerp,ease=(v:number)=>{v=T.MathUtils.clamp(v,0,1);return v*v*(3-2*v)},path=motion.path;
   const attack=ease((p-.30)/.28),back=ease((p-.65)/.35),load=ease(p/.30)*(1-attack),release=attack*(1-back),ready=right.clone();
   if(kind==='rifle'){
    direction=V(0,-.025,1);face=V(0,1,0);right.set(-.25,shoulderY-.40,.67-(motion.recoil??0)*.16);
   }else if(path==='guard'){direction=V(1,.35,.10).normalize();face=V(0,0,1);right.set(-.50,shoulderY-.25,.90);
   }else if(['thrust','beat','butt','riposte'].includes(path)){
    const short=path==='butt';direction.lerp(V(path==='beat'?.10:0,short?-.10:-.03,1).normalize(),Math.max(load,release));right.add(V(.16*release,-.07*release,(short?-.19:.30)*release-.62*load));face=V(0,1,0);if(path==='beat'){right.x+=.22*load+.16*release;right.y+=.16*load;}if(short&&model.userData.weaponKind==='long_spear'){direction.lerp(V(0,.04,-1),Math.max(load,release)).normalize();right.z+=.25*release;}
   }else if(path==='shield'){
    direction=V(-.4,.8,.24).normalize();right.add(V(-.15,-.05,-.08));
   }else{
    const over=path==='overhead',rise=path==='rise',reverse=path==='reverse',swing=reverse?-1:1;
    const loaded=over?V(.08,.91,-.40):rise?V(-.50,-.76,.20):V(-swing*.92,.27,.07);
    const contact=over?V(.02,-.10,1):rise?V(.10,.43,1):V(swing*.17,-.10,1);
    const follow=over?V(.08,-.87,.40):rise?V(.42,.88,.17):V(swing*.94,-.20,.17);
    direction.lerp(loaded.normalize(),ease(p/.28));
    if(p>.30)direction.copy(loaded).lerp(contact,ease((p-.30)/.18));
    if(p>.48)direction.copy(contact).lerp(follow,ease((p-.48)/.18));
    direction.lerp(V(.22,.91,.33),back).normalize();
    right.copy(ready).add(V(-.08*load,.29*(over?load:rise?-load:0)-.25*(over?release:0),-.19*load+.44*release));
    face=over?V(0,-direction.z,direction.y):V(0,1,0);
    if(model.userData.weaponKind==='axe'&&path==='cross'){
     // The single cutting edge is local +X; weaponNormal is local -Y.
     // Lead with that edge along the swing tangent, not with the counterweight.
     const cuttingPlane=V(0,-1,0);
     face=V(0,0,1).lerp(cuttingPlane,ease(p/.25)*(1-back)).normalize();
    }
   }
  }
  if(motion?.contactHeight!==undefined&&kind!=='rifle'){const p=motion.phase,blend=Math.sin(Math.PI*T.MathUtils.clamp((p-.15)/.70,0,1)),tip=bind.get(model.getObjectByName(model.userData.weaponKind==='hammer'?'hammerFace':'weaponTip')!)?.world,reach=tip?tip.distanceTo(grip):1;right.y+=T.MathUtils.clamp(motion.contactHeight-(right.y+direction.y*reach),-.65,.65)*blend;}
  // Converge the actual bore/point toward the chosen world-space target.
  // Root turning is still bounded by simulation; this is a small aiming correction.
  if(motion?.contactTarget){
   const p=motion.phase,thrust=['thrust','beat','riposte'].includes(motion.path)||motion.path==='butt'&&model.userData.weaponKind==='spear_shield';
   if(kind==='rifle'||thrust){const target=V().fromArray(motion.contactTarget),blend=kind==='rifle'?1:T.MathUtils.smoothstep(p,.14,.30)*(1-T.MathUtils.smoothstep(p,.65,1));let aim=target.clone().sub(right).normalize();
    if(kind==='rifle'){const muzzleOffset=b('muzzle').world.clone().sub(grip);for(let n=0;n<2;n++){const rotation=frame(aim,face).multiply(frame(shaft,normal).invert());aim.copy(target).sub(right).sub(muzzleOffset.clone().applyQuaternion(rotation)).normalize();}}
    const yaw=T.MathUtils.clamp(Math.atan2(aim.x,aim.z),-.30,.30),pitch=T.MathUtils.clamp(Math.asin(aim.y),-.35,.35);aim.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));direction.lerp(aim,blend).normalize();
   }
  }
  const delta=frame(direction,face).multiply(frame(shaft,normal).invert());
  const left=twoHanded?right.clone().add(supportOffset.clone().applyQuaternion(delta)):V(wide?.88:.64,shoulderY-.63,wide?.79:.65);
  let leftDelta=kind==='rifle'?frame(V(0,1,0),direction).multiply(handFrames.L.frame.clone().invert()):twoHanded?frame(direction,V(0,0,1)).multiply(handFrames.L.frame.clone().invert()):frame(V(0,1,0),V(0,0,1)).multiply(handFrames.L.frame.clone().invert());
  if(!twoHanded&&model.getObjectByName('shieldL')&&motion?.shieldGuard){left.lerp(V(.20,shoulderY-.35,1.03),T.MathUtils.clamp(motion.shieldGuard,0,1));}
  if(motion?.path==='shield'){left.z+=.28*Math.sin(motion.phase*Math.PI);left.y+=.10;}
  if(model.getObjectByName('weaponL')&&motion&&(motion.path==='combo'||motion.mount==='L')){const p=motion.phase,active=T.MathUtils.smoothstep(p,.40,.65)*(1-T.MathUtils.smoothstep(p,.74,1));left.z+=.24*active;leftDelta=frame(V(-.25*active,1-active,active).normalize(),V(0,0,1)).multiply(handFrames.L.frame.clone().invert())}
  // Choose a shared small translation that is reachable by BOTH installed arms.
  // Every candidate keeps the weapon orientation and the exact grip separation.
  const starts=new Map(chains.map(c=>[c.s,c.a.getWorldPosition(V())]));
  let best={cost:Infinity,shift:V()};
  search:for(const dx of [0,-.15,.15,-.3,.3,-.45,.45])for(const dy of [0,-.15,.15,.30,.45,-.30,-.45])for(const dz of [0,-.12,.12,-.24,-.36,-.48]){const shift=V(dx,dy,dz);let cost=shift.lengthSq()*.002;
   for(const s of ['R','L']){if(!twoHanded&&s==='L')continue;const desired=(s==='R'?right:left).clone().add(shift),d=s==='R'?delta:leftDelta,wrist=desired.sub(handFrames[s].offset.clone().applyQuaternion(d)),c=chains.find(c=>c.s===s)!;cost+=Math.max(0,wrist.distanceTo(starts.get(s)!)-c.l1-c.l2+.015)**2*100}
   if(cost<best.cost)best={cost,shift};if(cost<1e-12)break search;
  }
  // Project the common grip translation into both arms' reachable spheres.
  // This refines coarse candidates continuously; the rigid weapon never stretches.
  for(let pass=0;pass<24;pass++){let error=0;for(const side of twoHanded?['R','L']:['R']){const c=chains.find(c=>c.s===side)!,q=side==='R'?delta:leftDelta,wrist=(side==='R'?right:left).clone().add(best.shift).sub(handFrames[side].offset.clone().applyQuaternion(q)),offset=wrist.sub(starts.get(side)!),distance=offset.length(),excess=distance-(c.l1+c.l2-.006);if(excess>0){best.shift.addScaledVector(offset,-excess/distance);error+=excess;}}if(error<.00001)break;}
  right.add(best.shift);if(twoHanded)left.add(best.shift);
  const reachR=solve('R',right.clone().sub(handFrames.R.offset.clone().applyQuaternion(delta)),delta),reachL=solve('L',left.clone().sub(handFrames.L.offset.clone().applyQuaternion(leftDelta)),leftDelta);
  const chain=model.getObjectByName('flailChain');if(chain){const base=bind.get(chain)!;const cast=motion?Math.sin(Math.PI*T.MathUtils.smoothstep(motion.phase,.18,.78)):0;const desired=V(.14,-1,.10).lerp(direction,cast).normalize();worldQ(chain,new T.Quaternion().setFromUnitVectors(shaft,desired).multiply(base.worldQ));}
  model.updateMatrixWorld(true);const actualR=get('handGripR').getWorldPosition(V()),actualL=get('handGripL').getWorldPosition(V()),actualWeapon=get('gripR').getWorldPosition(V());
  const actualSupport=supportMarker?get(supportMarker).getWorldPosition(V()):actualWeapon.clone().addScaledVector(model.getObjectByName('hammerHeadCentre')?.getWorldPosition(V()).sub(actualWeapon).normalize()??direction,.53);
  report={kind:model.userData.weaponKind??kind,twoHanded,gripErrorR:actualR.distanceTo(actualWeapon),supportError:twoHanded?actualL.distanceTo(actualSupport):0,targetErrorR:actualR.distanceTo(right),targetErrorL:actualL.distanceTo(left),reachR,reachL,weaponForward:direction.toArray()};return report;
 }
 return {pose,inspect:()=>report};
}
