import * as T from 'three';
export type HeroStyle='speed'|'ranged';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),ease=(t:number)=>{t=T.MathUtils.clamp(t,0,1);return t*t*(3-2*t)};
const quat=(x=0,y=0,z=0)=>new T.Quaternion().setFromEuler(new T.Euler(x,y,z,'YXZ'));
function frame(axis:T.Vector3,normal:T.Vector3){const z=axis.clone().normalize(),x=normal.clone().addScaledVector(z,-normal.dot(z)).normalize(),y=new T.Vector3().crossVectors(z,x).normalize();return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z))}
type Bind={node:T.Object3D;position:T.Vector3;q:T.Quaternion;world:T.Vector3;worldQ:T.Quaternion};
export const HERO_DURATION=4.2;
export function createHeroMotion(model:T.Group,style:HeroStyle){
 model.updateMatrixWorld(true);const binds=new Map<string,Bind>();model.traverse(node=>{if(!(node as T.Mesh).isMesh)binds.set(node.name,{node,position:node.position.clone(),q:node.quaternion.clone(),world:node.getWorldPosition(V()),worldQ:node.getWorldQuaternion(new T.Quaternion())})});
 const get=(name:string)=>{const b=binds.get(name);if(!b)throw Error('Missing hero mount '+name);return b};
 const chains=['armL','armR','legL','legR'].map(key=>{const arm=key.startsWith('arm'),s=key.slice(-1),a=get((arm?'shoulder':'hip')+s),b=get((arm?'elbow':'knee')+s),c=get((arm?'wrist':'ankle')+s),ab=b.world.clone().sub(a.world),bc=c.world.clone().sub(b.world);return {key,a,b,c,ab,bc,l1:ab.length(),l2:bc.length(),normal:new T.Vector3().crossVectors(ab,bc).normalize()}});
 const grip=get('gripR').world,axis=get('weaponAxis').world.clone().sub(grip).normalize(),normal=get('weaponNormal').world.clone().sub(grip).normalize();
 const handGripR=get('handGripR').world,handGripL=get('handGripL').world;
 const handAxisL=get('handAxisL').world.clone().sub(handGripL).normalize(),handPalmL=get('handPalmL').world.clone().sub(handGripL).normalize();
 const wristOffsetR=handGripR.clone().sub(get('wristR').world),wristOffsetL=handGripL.clone().sub(get('wristL').world);
 const support=style==='ranged'?get('supportGrip').world.clone().sub(grip):V();
 const rotate=(b:Bind,q:T.Quaternion)=>{const p=b.node.parent?.getWorldQuaternion(new T.Quaternion())??new T.Quaternion();b.node.quaternion.copy(p.invert().multiply(q));b.node.updateWorldMatrix(false,true)};
 function solve(key:string,target:T.Vector3,pole:T.Vector3){const c=chains.find(c=>c.key===key)!,p=c.a.node.getWorldPosition(V()),delta=target.clone().sub(p),reach=delta.length(),length=T.MathUtils.clamp(reach,Math.abs(c.l1-c.l2)+.000001,c.l1+c.l2-.000001),direction=delta.normalize(),perp=pole.clone().sub(p);perp.addScaledVector(direction,-perp.dot(direction)).normalize();const d=(c.l1*c.l1-c.l2*c.l2+length*length)/(2*length),mid=p.clone().addScaledVector(direction,d).addScaledVector(perp,Math.sqrt(Math.max(0,c.l1*c.l1-d*d))),end=p.clone().addScaledVector(direction,length),a=mid.clone().sub(p),b=end.clone().sub(mid),n=new T.Vector3().crossVectors(a,b).normalize();rotate(c.a,frame(a,n).multiply(frame(c.ab,c.normal).invert()).multiply(c.a.worldQ));rotate(c.b,frame(b,n).multiply(frame(c.bc,c.normal).invert()).multiply(c.b.worldQ));return {reach,limit:c.l1+c.l2,error:c.c.node.getWorldPosition(V()).distanceTo(target)}}
 let report:any={};
 function pose(seconds:number){const t=T.MathUtils.clamp(seconds,0,HERO_DURATION);binds.forEach(b=>{b.node.position.copy(b.position);b.node.quaternion.copy(b.q)});model.updateMatrixWorld(true);
  const shotTimes=[1.24,2.40];let recoil=0;for(const at of shotTimes){const age=t-at;if(age>=0&&age<.55)recoil+=Math.exp(-age*11)*Math.sin(Math.min(1,age/.045)*Math.PI/2)}
  const load=ease((t-.42)/.55)*(1-ease((t-1.32)/.7));const thrust=t<1.17?ease((t-1.02)/.15):1-ease((t-1.38)/.55);
  const step=style==='speed'?(t<1.3?ease((t-.78)/.38):1-ease((t-2.15)/.7)):0;
  const pelvis=get('pelvis'),chest=get('chest');pelvis.node.position.y-=style==='speed'?.08+.11*step:.10;pelvis.node.position.z+=style==='speed'?.26*step:-.035*recoil;pelvis.node.quaternion.multiply(quat(0,style==='speed'?.17*load-.21*thrust:-.20,0));chest.node.quaternion.multiply(quat(style==='speed'?.045*thrust:-.055*recoil,style==='speed'?.18*load-.33*thrust:-.30,0));get('head').node.quaternion.multiply(quat(.02,style==='speed'?-.04:.34,0));model.updateMatrixWorld(true);
  const errors:Record<string,any>={};
  for(const side of ['L','R']){const foot=get('ankle'+side),target=foot.world.clone();if(style==='speed'&&side==='R'){target.z+=.52*step;const lift=t<1.16?Math.sin(ease((t-.78)/.38)*Math.PI):t>2.15?Math.sin(ease((t-2.15)/.7)*Math.PI):0;target.y+=.11*lift}if(style==='ranged'&&side==='R')target.z-=.16;errors['leg'+side]=solve('leg'+side,target,V(side==='L'?.7:-.7,1.4,2));rotate(foot,foot.worldQ.clone())}
  let desired:T.Vector3,delta:T.Quaternion;
  if(style==='speed'){
   desired=V(-.56,2.91,.48).add(V(.04*thrust,-.09*thrust,-.19*load+.77*thrust));const dir=V(-.035,.13*(1-thrust)-.026*thrust,1).normalize();delta=frame(dir,V(0,1,0)).multiply(frame(axis,normal).invert());
  }else{desired=V(-.38,3.04,.43-.12*recoil);delta=quat(-.055*recoil,0,0)}
  const wristR=desired.clone().sub(wristOffsetR.clone().applyQuaternion(delta));errors.armR=solve('armR',wristR,V(-1.7,2.9,-.25));rotate(get('wristR'),delta.clone().multiply(get('wristR').worldQ));rotate(get('handR'),delta.clone().multiply(get('handR').worldQ));
  let desiredL:T.Vector3,leftDelta:T.Quaternion;
  if(style==='ranged'){desiredL=desired.clone().add(support.clone().applyQuaternion(delta));leftDelta=delta.clone()}
  else{desiredL=V(.62,2.84,.60+.15*thrust);leftDelta=quat(.12,-.13,0)}
  errors.armL=solve('armL',desiredL.clone().sub(wristOffsetL.clone().applyQuaternion(leftDelta)),V(1.50,2.7,-.12));rotate(get('wristL'),leftDelta.clone().multiply(get('wristL').worldQ));rotate(get('handL'),leftDelta.clone().multiply(get('handL').worldQ));
  model.updateMatrixWorld(true);
  const actual=get('gripR').node.getWorldPosition(V()),actualL=get('handGripL').node.getWorldPosition(V()),endpoint=get(style==='speed'?'weaponTip':'muzzle').node.getWorldPosition(V());
  report={time:t,style,phase:style==='speed'?(t<.42?'Spear and shield · ready':t<1.02?'Point aligned · rear foot loads':t<1.17?'Step and thrust':t<1.38?'Full extension':t<2.9?'Retract · recover the guard':'Back to guard'):(t<.6?'Track the target':t<1.24?'Settle the rifle':t<1.75?'First shot · recoil':t<2.4?'Reacquire aim':t<2.95?'Second shot · recoil':'Hold the firing line'),errors,gripErrorR:actual.distanceTo(desired),gripErrorL:actualL.distanceTo(desiredL),endpoint:endpoint.toArray(),gripR:actual.toArray(),gripL:actualL.toArray(),shotTimes,recoil};return report;
 }
 function rest(){binds.forEach(b=>{b.node.position.copy(b.position);b.node.quaternion.copy(b.q)});model.updateMatrixWorld(true)}
 pose(0);return {pose,rest,inspect:()=>report};
}
