import * as T from 'three';
import {setWorldQ} from '../workshop8/runtime/parts-assembly';
import type {Fighter} from './types';
import {indexedBounds} from './weapon-carry';
import {attackStep} from './motion';

const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const smooth=(x:number)=>{x=T.MathUtils.clamp(x,0,1);return x*x*(3-2*x)};
const lerp=T.MathUtils.lerp;
type Joint={o:T.Object3D;p:T.Vector3;q:T.Quaternion;world:T.Vector3;rotation:T.Quaternion};

/** A frame has an explicit hinge axis. Unlike shortest-arc rotations from the
 * previous weapon pose, this cannot inherit arbitrary elbow/knee roll. */
function frame(direction:T.Vector3,hinge:T.Vector3){
 const y=direction.clone().normalize(),x=hinge.clone().addScaledVector(y,-hinge.dot(y)).normalize();
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,v().crossVectors(x,y).normalize()));
}
export const kicking=(motion:string)=>['kick','airKick','airHeavy','low','slide','stomp'].includes(motion);
export const strikingJoint=(motion:string)=>kicking(motion)?'pitSoleR':motion==='jab'?'pitFistL':'pitFistR';

/** Construct once in the assembly's anatomical bind, never its equipment pose.
 * Authored phases drive feet, pelvis, chest, elbows and fists together. */
export function brawlPose(model:T.Group){
 const joints=new Map<string,Joint>();
 model.traverse(o=>{if(!(o as T.Mesh).isMesh)joints.set(o.name,{o,p:o.position.clone(),q:o.quaternion.clone(),world:o.getWorldPosition(v()),rotation:o.getWorldQuaternion(new T.Quaternion())})});
 const j=(name:string)=>joints.get(name)!;
 const world=(name:string)=>j(name).o.getWorldPosition(v());
 const localBounds=(root:T.Object3D)=>{const bounds=new T.Box3(),inverse=root.matrixWorld.clone().invert();root.traverse(o=>{const m=o as T.Mesh;if(m.isMesh&&!m.name.startsWith('pit-'))bounds.union(indexedBounds(m.geometry).clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld)))});return bounds;};
 for(const side of ['L','R']){
  const foot=j('ankle'+side).o,box=localBounds(foot),sole=new T.Object3D();sole.name='pitSole'+side;sole.position.copy(box.getCenter(v()));sole.position.y=box.min.y+.02;foot.add(sole);
  const hand=j('hand'+side).o,blocked=new Set<T.Object3D>();for(const child of hand.children)if(['weaponR','weaponL','shieldL'].includes(child.name))child.traverse(o=>blocked.add(o));
  const b=new T.Box3(),inverse=hand.matrixWorld.clone().invert();hand.traverse(o=>{const mesh=o as T.Mesh;if(mesh.isMesh&&!blocked.has(o))b.union(indexedBounds(mesh.geometry).clone().applyMatrix4(inverse.clone().multiply(mesh.matrixWorld)))});
  const axis=j('hand'+side).world.clone().sub(j('wrist'+side).world).normalize().applyQuaternion(j('hand'+side).rotation.clone().invert()),centre=b.getCenter(v());
  let end=-Infinity;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])end=Math.max(end,v(x,y,z).dot(axis));
  const fist=new T.Object3D();fist.name='pitFist'+side;fist.position.copy(centre).addScaledVector(axis,end-centre.dot(axis)-.02);hand.add(fist);
 }
 const chains=new Map<string,{a:Joint;b:Joint;c:Joint;l1:number;l2:number;basisA:T.Quaternion;basisB:T.Quaternion;hinge:T.Vector3}>();
 for(const side of ['L','R'])for(const leg of [false,true]){
  const a=j((leg?'hip':'shoulder')+side),b=j((leg?'knee':'elbow')+side),c=j((leg?'ankle':'wrist')+side);
  const ab=b.world.clone().sub(a.world),bc=c.world.clone().sub(b.world),hinge=v(leg?1:-1,0,0);
  chains.set((leg?'leg':'arm')+side,{a,b,c,l1:ab.length(),l2:bc.length(),basisA:frame(ab,hinge).invert().multiply(a.rotation),basisB:frame(bc,hinge).invert().multiply(b.rotation),hinge});
 }
 function solve(name:string,target:T.Vector3,hinge:T.Vector3){
  const c=chains.get(name)!,p=c.a.o.getWorldPosition(v()),d=target.clone().sub(p),distance=T.MathUtils.clamp(d.length(),Math.abs(c.l1-c.l2)+.04,c.l1+c.l2-.025);d.normalize();
  // Positive knee flexion for the entire kick, including chamber and retract.
  // Arms use the opposite hinge so elbows remain below the fists.
  const bend=v().crossVectors(d,hinge).normalize(),along=(c.l1*c.l1-c.l2*c.l2+distance*distance)/(2*distance);
  const mid=p.clone().addScaledVector(d,along).addScaledVector(bend,Math.sqrt(Math.max(0,c.l1*c.l1-along*along))),end=p.clone().addScaledVector(d,distance);
  setWorldQ(c.a.o,frame(mid.clone().sub(p),hinge).multiply(c.basisA));
  setWorldQ(c.b.o,frame(end.sub(mid),hinge).multiply(c.basisB));
 }
 const hands=new Map<string,{direction:T.Vector3;palm:T.Vector3;bind:T.Quaternion;basis:T.Quaternion}>();
 for(const side of ['L','R']){
  const wrist=j('wrist'+side),hand=j('hand'+side),direction=hand.world.clone().sub(wrist.world).normalize();
  // Hand length is an anatomical axis. Grip-shaft sockets are deliberately NOT
  // used: the approved hammer glove has a diagonal shaft through its palm.
  const palm=v(0,0,1),basis=frame(direction,palm).invert().multiply(wrist.rotation);
  hands.set(side,{direction,palm,bind:wrist.rotation,basis});
 }
 function fist(side:string){
  const forearm=world('wrist'+side).sub(world('elbow'+side)).normalize();
  const palm=v(0,-1,0);if(Math.abs(forearm.dot(palm))>.94)palm.set(0,0,1);
  setWorldQ(j('wrist'+side).o,frame(forearm,palm).multiply(hands.get(side)!.basis));
 }
 const pelvis=j('pelvis'),chest=j('chest'),head=j('head'),height=j('shoulderR').world.y;
 const width=Math.abs(j('shoulderR').world.x),hipHeight=j('hipR').world.y;
 const excluded=new Set<T.Object3D>();for(const name of ['shoulderL','shoulderR','hipL','hipR','head','pit-carry-mount-0','pit-carry-mount-1'])model.getObjectByName(name)?.traverse(o=>excluded.add(o));
 const torsoBox=new T.Box3();model.traverse(o=>{const mesh=o as T.Mesh;if(mesh.isMesh&&!excluded.has(o))torsoBox.union(indexedBounds(mesh.geometry).clone().applyMatrix4(mesh.matrixWorld));});
 const breastplate=Math.min(.78,torsoBox.max.z);
 // Clips have separate load, acceleration, contact, retract and settle poses.
 function pose(a:Fighter,tick:number){
  for(const n of joints.values()){n.o.position.copy(n.p);n.o.quaternion.copy(n.q)}model.updateMatrixWorld(true);
  const attack=a.attack,m=attack?.move,f=attack?.frame??0,guard=a.held.has('guard')&&!attack&&!a.dash&&a.y===0&&!a.stun&&!a.down&&!a.throwHold;
  const prep=attack?smooth(f/Math.max(1,m!.startup*.65)):0;
  // Contact begins while the fist is travelling, not after it has already
  // passed through a close opponent. Full extension lands at the final active frame.
  const drive=attack?smooth((f-m!.startup*.80)/Math.max(1,m!.startup*.20+m!.active-1)):0;
  const returnT=attack?smooth((f-m!.startup-m!.active)/Math.max(1,m!.recovery*.72)):0;
  const extension=drive*(1-returnT),load=prep*(1-drive),kick=!!m&&kicking(m.motion),air=a.y>0;
  const crouch=a.crouch||m?.motion==='low'||m?.motion==='slide';
  const direction=Number(a.held.has('right'))-Number(a.held.has('left'));
  const moving=!attack&&!a.stun&&!a.blockstun&&!a.down&&!crouch&&(a.dash>0||(direction!==0&&(!guard||direction===-a.facing)));
  // Distance drives foot travel. During the stance portion the foot moves
  // backward exactly as far as the root travels forward, keeping it planted.
  const gait=a.x*a.facing/(1000*.82*1.5),bob=moving?Math.abs(Math.sin(gait*Math.PI*2))*.025:Math.sin(tick*.035)*.008;
  const compression=crouch?1.20:air?.12:guard?.34:moving?.29:.19;
  pelvis.o.position.y-=compression+bob;
  // Rear shoulder drives the cross; the head keeps its sightline on the rival.
  const twist=m?.motion==='jab'?-.18*extension:m?.motion==='cross'||m?.motion==='super'?.36*extension-.12*load:0;
  chest.o.rotation.y=twist;pelvis.o.rotation.y=twist*.3;head.o.rotation.y=-twist*.65;
  chest.o.rotation.x=crouch?.08:guard?.12:kick?-.13*extension:.045*extension;
  pelvis.o.position.z+=kick?-.08*extension:.22*extension;
  if(m?.motion==='stomp'){pelvis.o.position.y-=.12*extension;chest.o.rotation.x=.10*extension;}
  if(a.stun||a.blockstun||a.throwHold){chest.o.rotation.x+=a.blockstun?-.06:a.reaction==='low'?.14:-.14;head.o.rotation.x-=a.reaction==='high'?.12:0}
  model.updateMatrixWorld(true);
  for(const side of ['L','R']){
   const sign=side==='L'?1:-1,foot=j('ankle'+side),target=foot.world.clone();
   target.z+=side==='L'?.30:-.25;
   if(m?.stepIn&&!air){
    const scale=attack?.stepScale??1,total=m.stepIn*scale/(1000*.82),root=attackStep(m,f)*scale/(1000*.82);
    const stepping=scale<0?side==='R':side==='L';
    const progress=smooth(stepping?f/Math.max(1,m.startup*.65):(f-m.startup-m.active)/Math.max(1,m.recovery*.75));
    target.z+=total*progress-root;target.y+=Math.sin(progress*Math.PI)*.14;
   }
   if(moving&&!air){const cycle=((gait+(side==='L'?0:.5))%1+1)%1;if(cycle<.6)target.z+=.45-cycle*1.5;else{const swing=(cycle-.6)/.4;target.z+=lerp(-.45,.45,smooth(swing));target.y+=Math.sin(swing*Math.PI)*.20}}
   if(air){target.y+=side==='R'?.45:.2;target.z+=side==='R'?.15:-.08}
   let anklePitch=0;
   if(m?.motion==='stomp'&&side==='R'){
    target.y+=.50*load;anklePitch=-.12*load;
   }else if(kick&&side==='R'){
    // A front kick folds at the knee before extending. It retracts through that
    // same chamber, instead of dragging an upright boot through the target.
    const low=m!.motion==='low'||m!.motion==='slide',lowY=foot.world.y+.18;
    const chamber=v(-Math.max(.34,Math.abs(j('hipR').world.x)),low?hipHeight-compression+.15:hipHeight-.18,.52);
    const contact=v(chamber.x,low?lowY:air?hipHeight-.08:hipHeight+.25,low?1.35:1.64);
    const chamberIn=smooth(f/Math.max(1,m!.startup*.65));
    const retract=smooth((f-m!.startup-m!.active)/Math.max(1,m!.recovery*.45));
    const settle=smooth((f-m!.startup-m!.active-m!.recovery*.45)/Math.max(1,m!.recovery*.55));
    target.lerp(chamber,chamberIn).lerp(contact,drive*(1-retract)).lerp(foot.world.clone().add(v(0,0,-.25)),settle);
    anklePitch=-Math.PI*.49*extension; // sole faces the opponent, toe remains up
   }
   solve('leg'+side,target,v(1,0,0));
   setWorldQ(foot.o,new T.Quaternion().setFromEuler(new T.Euler(anklePitch,0,sign*.015)).multiply(foot.rotation));
  }
  model.updateMatrixWorld(true);
  for(const side of ['L','R']){
   const sign=side==='L'?1:-1,lead=side==='L',shoulder=world('shoulder'+side);
   // Keep each fist on its own side of the sternum. Elbows hang under it;
   // targets are scaled from this assembly, not one fixed doll's proportions.
   const target=v(sign*Math.max(.46,width*1.04),height-compression+(guard?.34:lead?.20:.29),breastplate+(lead?.06:0));
   if(guard){target.z=breastplate+.24;target.y+=.16;}
   const striking=m?.motion==='jab'?lead:side==='R';
   if(attack&&striking&&!kick){
    const length=chains.get('arm'+side)!.l1+chains.get('arm'+side)!.l2;
    const contact=v(shoulder.x*.92,shoulder.y-.12,shoulder.z+Math.min(length*.96,1.65));
    if(m!.motion==='uppercut'){const t=T.MathUtils.clamp((f-m!.startup)/Math.max(1,m!.active-1),0,1);contact.y=lerp(height-.78,height+.13,t);contact.z=length*.70;}
    if(m!.motion==='overhead'){contact.y=height-.65;contact.z=length*.82;target.y+=.48*load;target.z-=.12*load;}
    else{target.z-=.16*load;target.y-=.05*load;}
    target.lerp(contact,extension);
   }
   if(m?.motion==='throw')target.lerp(v(sign*.38,height-compression-.32,1.0),extension);
   // The kick's opposite hand stays high; no accompanying phantom punch.
   if(kick&&side==='R')target.y-=.1*extension;
   solve('arm'+side,target,v(-1,0,sign*.10));fist(side);
  }
  model.updateMatrixWorld(true);
 }
 function inspect(){
  const record:Record<string,{wrist:number[];elbow:number[];shoulder:number[];ankle:number[];knee:number[];hip:number[];toe:number[];sole:number[];handAxis:number[]}>= {};
  for(const side of ['L','R']){
   const q=j('ankle'+side).o.getWorldQuaternion(new T.Quaternion()),wq=j('wrist'+side).o.getWorldQuaternion(new T.Quaternion());
   const localHand=hands.get(side)!.direction.clone().applyQuaternion(hands.get(side)!.bind.clone().invert());
   record[side]={wrist:world('wrist'+side).toArray(),elbow:world('elbow'+side).toArray(),shoulder:world('shoulder'+side).toArray(),ankle:world('ankle'+side).toArray(),knee:world('knee'+side).toArray(),hip:world('hip'+side).toArray(),toe:v(0,0,1).applyQuaternion(q).toArray(),sole:v(0,-1,0).applyQuaternion(q).toArray(),handAxis:localHand.applyQuaternion(wq).toArray()};
  }return record;
 }
 return {pose,inspect};
}
