import * as T from 'three';

const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const clamp=T.MathUtils.clamp;
const ease=(x:number)=>{x=clamp(x,0,1);return x*x*(3-2*x)};
const quaternion=(x=0,y=0,z=0)=>new T.Quaternion().setFromEuler(new T.Euler(x,y,z,'YXZ'));
function frame(axis:T.Vector3,normal:T.Vector3) {
 const z=axis.clone().normalize(),x=normal.clone().addScaledVector(z,-normal.dot(z)).normalize(),y=new T.Vector3().crossVectors(z,x).normalize();
 return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
}
type Bind={node:T.Object3D;position:T.Vector3;quaternion:T.Quaternion;world:T.Vector3;worldQ:T.Quaternion};
type Chain={upper:Bind;middle:Bind;tip:Bind;a:T.Vector3;b:T.Vector3;l1:number;l2:number;normal:T.Vector3};
export const HAMMER_DURATION=3.3;
export const HAMMER_CONTACT=1.36;
export type HammerPoseOptions={contactAt?:number;walk?:number;walkDirection?:{x:number;z:number};reaction?:number};
export function createHammerMotion(model:T.Group,scene:T.Scene,support:T.Group,settings:{target?:boolean;fit?:boolean}={}) {
 model.updateMatrixWorld(true);
 const binds=new Map<string,Bind>();
 model.traverse(node=>{if(!('isMesh'in node))binds.set(node.name,{node,position:node.position.clone(),quaternion:node.quaternion.clone(),world:node.getWorldPosition(new T.Vector3()),worldQ:node.getWorldQuaternion(new T.Quaternion())})});
 const get=(name:string)=>{const b=binds.get(name);if(!b)throw Error('Missing motion joint '+name);return b};
 const handL=get('handL');const originalLeft=[...handL.node.children];
 handL.node.add(support);
 const supportGrip=support.getObjectByName('supportGrip');
 const supportShaft=support.getObjectByName('supportShaft');
 const supportPalm=support.getObjectByName('supportPalm');
 if(!supportGrip||!supportShaft||!supportPalm)throw Error('Support hand needs authored grip frames');
 model.updateMatrixWorld(true);
 const leftRestGrip=supportGrip.getWorldPosition(new T.Vector3());
 const leftS=supportShaft.getWorldPosition(new T.Vector3()).sub(leftRestGrip).normalize();
 const leftP=supportPalm.getWorldPosition(new T.Vector3()).sub(leftRestGrip).normalize();
 const gripRest=get('gripR').world.clone(),headRest=get('hammerHeadCentre').world.clone();
 const shaft=headRest.clone().sub(gripRest);const shaftLength=shaft.length();shaft.normalize();
 const faceN=get('hammerFace').world.clone().sub(headRest).normalize();
 const faceLength=get('hammerFace').world.distanceTo(headRest);
 const restFrame=frame(shaft,faceN);const leftFrame=frame(leftS,leftP);
 const chains=new Map<string,Chain>();
 for(const side of ['L','R'])for(const limb of ['arm','leg']){
  const upper=get((limb==='arm'?'shoulder':'hip')+side),middle=get((limb==='arm'?'elbow':'knee')+side),tip=get((limb==='arm'?'wrist':'ankle')+side);
  const a=middle.world.clone().sub(upper.world),b=tip.world.clone().sub(middle.world);
  chains.set(limb+side,{upper,middle,tip,a,b,l1:a.length(),l2:b.length(),normal:new T.Vector3().crossVectors(a,b).normalize()});
 }
 const wristToGripR=gripRest.clone().sub(get('wristR').world);
 const wristToGripL=leftRestGrip.clone().sub(get('wristL').world);
 const owned:T.Object3D[]=[];const materials:T.Material[]=[];const geometries:T.BufferGeometry[]=[];
 const mat=(color:string,metalness=.5,roughness=.5)=>{const m=new T.MeshStandardMaterial({color,metalness,roughness});materials.push(m);return m};
 const box=(size:T.Vector3,material:T.Material,parent:T.Object3D)=>{const g=new T.BoxGeometry(size.x,size.y,size.z);geometries.push(g);const m=new T.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m};
 const target=new T.Group();scene.add(target);owned.push(target);
 const padPivot=new T.Group();target.add(padPivot);
 const pad=box(V(.98,.80,.21),mat('#745d42',.1,.8),padPivot);pad.position.z=-.105;
 const rim=box(V(1.12,.94,.10),mat('#343a3b',.75,.4),padPivot);rim.position.z=-.23;
 const stem=box(V(.35,1.58,.36),mat('#353b3a',.75,.5),target);
 const base=box(V(.95,.12,.85),mat('#242929',.7,.55),target);base.position.y=.085;
 const targetRotation=new T.Quaternion();let impactPoint=new T.Vector3();
 const chips=new T.Group();scene.add(chips);owned.push(chips);
 const chipMat=mat('#b8945e',.1,.8);const chipMeshes:T.Mesh[]=[];
 for(let i=0;i<12;i++){const chip=box(V(.018+(i%3)*.007,.018,.033),chipMat,chips);chipMeshes.push(chip)}
 let active=true;let lastReport:any={};
 const worldRotate=(b:Bind,q:T.Quaternion)=>{const parent=b.node.parent?.getWorldQuaternion(new T.Quaternion())||new T.Quaternion();b.node.quaternion.copy(parent.invert().multiply(q));b.node.updateWorldMatrix(false,true)};
 function solve(chain:Chain,tipTarget:T.Vector3,pole:T.Vector3) {
  const start=chain.upper.node.getWorldPosition(new T.Vector3());const delta=tipTarget.clone().sub(start);const reach=delta.length();
  const margin=chain.upper.node.name.startsWith('hip')?.000001:.015;
  const length=clamp(reach,Math.abs(chain.l1-chain.l2)+.0001,chain.l1+chain.l2-margin);const axis=delta.normalize();
  let perpendicular=pole.clone().sub(start).addScaledVector(axis,-pole.clone().sub(start).dot(axis));
  if(perpendicular.lengthSq()<.0001)perpendicular=V(0,0,1).addScaledVector(axis,-axis.z);
  perpendicular.normalize();const along=(chain.l1*chain.l1-chain.l2*chain.l2+length*length)/(2*length);
  const elbow=start.clone().addScaledVector(axis,along).addScaledVector(perpendicular,Math.sqrt(Math.max(0,chain.l1*chain.l1-along*along)));
  const end=start.clone().addScaledVector(axis,length);const a=elbow.clone().sub(start),b=end.clone().sub(elbow);
  const normal=new T.Vector3().crossVectors(a,b).normalize();
  const qUpper=frame(a,normal).multiply(frame(chain.a,chain.normal).invert());
  const qLower=frame(b,normal).multiply(frame(chain.b,chain.normal).invert());
  worldRotate(chain.upper,qUpper.multiply(chain.upper.worldQ));worldRotate(chain.middle,qLower.multiply(chain.middle.worldQ));
  return {reach,limit:chain.l1+chain.l2-margin,error:chain.tip.node.getWorldPosition(new T.Vector3()).distanceTo(tipTarget)};
 }
 function restore(){binds.forEach(b=>{b.node.position.copy(b.position);b.node.quaternion.copy(b.quaternion)});model.updateMatrixWorld(true)}
 function weapon(t:number) {
  // A real overhead arc, with an upper hand that slides toward the butt hand.
  // Angles describe the shaft in the swing plane, not a head-down translation.
  const ready=V(-.02,2.60,.70),loaded=V(.40,3.65,.70),contact=V(.05,1.45,1.65);
  let grip=ready.clone(),angle=62,gap=.90,drive=0,load=0;
  if(t<1.18){load=ease((t-.15)/.90);grip.lerp(loaded,load);angle=T.MathUtils.lerp(62,155,load);gap=T.MathUtils.lerp(.90,.96,load)}
  else if(t<HAMMER_CONTACT){load=1;const elapsed=clamp((t-1.18)/.18,0,1);drive=Math.pow(elapsed,1.4);grip.copy(loaded).lerp(contact,drive);angle=T.MathUtils.lerp(155,-25,drive);gap=T.MathUtils.lerp(.96,.40,ease(elapsed))}
  else if(t<1.65){const rebound=Math.sin(clamp((t-HAMMER_CONTACT)/.29,0,1)*Math.PI);load=1;drive=1;grip.copy(contact).add(V(0,.055*rebound,0));angle=-25+5*rebound;gap=.40}
  else {const recovery=ease((t-1.65)/(HAMMER_DURATION-1.65));load=1-recovery;drive=1-recovery;grip.copy(contact).lerp(ready,recovery);angle=T.MathUtils.lerp(-25,62,recovery);gap=T.MathUtils.lerp(.40,.90,recovery*recovery)}
  const theta=T.MathUtils.degToRad(angle),horizontal=V(-.32,0,1).normalize();
  const s=horizontal.clone().multiplyScalar(Math.cos(theta)).add(V(0,Math.sin(theta),0));
  const n=horizontal.clone().multiplyScalar(Math.sin(theta)).add(V(0,-Math.cos(theta),0));
  const orientation=frame(s,n);const delta=orientation.clone().multiply(restFrame.clone().invert());
  return{grip,s,n,delta,load,drive,gap,angle};
 }
 const contactPose=weapon(HAMMER_CONTACT);
 impactPoint=contactPose.grip.clone().addScaledVector(contactPose.s,shaftLength).addScaledVector(contactPose.n,faceLength);
 target.position.set(impactPoint.x,0,impactPoint.z);
 padPivot.position.set(0,impactPoint.y,0);targetRotation.setFromUnitVectors(V(0,0,1),contactPose.n.clone().negate());padPivot.quaternion.copy(targetRotation);
 stem.position.set(0,(impactPoint.y-.24)/2,0);stem.scale.y=(impactPoint.y-.24)/1.58;
 function pose(seconds:number,options:HammerPoseOptions={}) {
  if(!active)return lastReport;
  const t=clamp(seconds,0,HAMMER_DURATION);let w=weapon(t);restore();
  let step=t<1.36?ease((t-.70)/.60):1-ease((t-2.0)/1.30);
  if(options.contactAt!==undefined&&t>=options.contactAt){
   const stopped=clamp(options.contactAt,1.18,HAMMER_CONTACT),elapsed=t-stopped;
   if(elapsed<.18){w=weapon(stopped-.010*Math.sin(elapsed/.18*Math.PI));step=ease((stopped-.70)/.60)}
   else{const r=ease((elapsed-.18)/1.05),at=weapon(stopped),end=weapon(0);w={...at,grip:at.grip.clone().lerp(end.grip,r),s:at.s.clone().lerp(end.s,r).normalize(),n:at.n.clone().lerp(end.n,r).normalize(),load:at.load*(1-r),drive:at.drive*(1-r),gap:T.MathUtils.lerp(at.gap,end.gap,r*r),angle:T.MathUtils.lerp(at.angle,end.angle,r)};w.n.addScaledVector(w.s,-w.n.dot(w.s)).normalize();w.delta=frame(w.s,w.n).multiply(restFrame.clone().invert());step=ease((stopped-.70)/.60)*(1-r)}
  }
  const reaction=clamp(options.reaction??0,0,1);
  w.grip.add(V(0,-.10*reaction,-.09*reaction));
  const pelvis=get('pelvis'),chest=get('chest');
  pelvis.node.position.y-=.04*w.load+.65*w.drive+.12*step;
  pelvis.node.position.z+=.62*w.drive+.15*step;
  pelvis.node.position.y-=.10*reaction;
  if(options.walk!==undefined)pelvis.node.position.y-=.045;
  pelvis.node.quaternion.multiply(quaternion(.24*w.drive,.35*w.load-.48*w.drive,0));
  chest.node.quaternion.multiply(quaternion(-.06*w.load+.65*w.drive,.12*w.load-.22*w.drive,-.025*w.drive));
  chest.node.quaternion.multiply(quaternion(-.18*reaction,0,.035*reaction));
  get('head').node.quaternion.multiply(quaternion(.08,.10,0));model.updateMatrixWorld(true);
  const errors:any={};
  const footTargets=new Map<string,T.Vector3>();
  for(const side of ['L','R']){
   const chain=chains.get('leg'+side)!;
   const foot=chain.tip.world.clone();if(side==='R'){foot.z+=.85*step;foot.y+=.12*Math.sin(step*Math.PI)}
   if(options.walk!==undefined){const phase=((options.walk+(side==='R'?.5:0))%1+1)%1,direction=options.walkDirection??{x:0,z:1},offset=phase<.6?.22-.44*phase/.6:-.22+.44*ease((phase-.6)/.4);foot.z+=offset*direction.z;foot.x+=offset*direction.x;foot.y+=phase<.6?0:.12*Math.sin((phase-.6)/.4*Math.PI)}
   footTargets.set(side,foot);
   errors['leg'+side]=solve(chain,foot,V(side==='L'?.75:-.75,1.0,1.7));worldRotate(chain.tip,chain.tip.worldQ);
   const tasset=binds.get('tasset'+side);if(tasset)tasset.node.quaternion.multiply(quaternion(-.07*w.drive,0,0));
  }
  // Shells ride a restrained shoulder mechanism, not the upper-arm swing.
  for(const side of ['L','R']){const b=binds.get('pauldron'+side);if(b)b.node.quaternion.multiply(quaternion(.06*w.load,0,(side==='L'?-1:1)*.05*w.load))}
  model.updateMatrixWorld(true);
  const desiredR=w.grip.clone();const desiredL=w.grip.clone().addScaledVector(w.s,w.gap);
  const palm=new T.Vector3().crossVectors(w.n,w.s).normalize();
  const leftDelta=frame(w.s,palm.negate()).multiply(leftFrame.clone().invert());
  for(const side of ['L','R']){
   const delta=side==='R'?w.delta:leftDelta,grip=side==='R'?desiredR:desiredL,offset=side==='R'?wristToGripR:wristToGripL;
   const wristTarget=grip.clone().sub(offset.clone().applyQuaternion(delta));
   errors['arm'+side]=solve(chains.get('arm'+side)!,wristTarget,V(side==='L'?2.2:-2.2,2.55,.3));
   const wrist=get('wrist'+side);worldRotate(wrist,delta.clone().multiply(wrist.worldQ));
  }
  model.updateMatrixWorld(true);
  const actualR=get('gripR').node.getWorldPosition(new T.Vector3()),actualL=supportGrip!.getWorldPosition(new T.Vector3());
  const actualFace=get('hammerFace').node.getWorldPosition(new T.Vector3()),actualHead=get('hammerHeadCentre').node.getWorldPosition(new T.Vector3());
  const actualNormal=actualFace.clone().sub(actualHead).normalize();
  const elapsed=t-HAMMER_CONTACT,compression=elapsed>=0?.025*Math.exp(-elapsed*12)*Math.sin(Math.min(1,elapsed/.07)*Math.PI/2):0;
  padPivot.position.y=impactPoint.y-compression;
  chips.visible=settings.target!==false&&elapsed>=0&&elapsed<.5;
  chipMeshes.forEach((chip,i)=>{const a=i*2.39996,rad=.5+(i%4)*.12;chip.position.copy(impactPoint).add(V(Math.cos(a)*rad*elapsed,(.5+(i%3)*.15)*elapsed-3*elapsed*elapsed,Math.sin(a)*rad*elapsed));chip.rotation.set(i+elapsed*6,i*.7+elapsed*5,i);chip.scale.setScalar(Math.max(0,1-elapsed*1.8))});
  const phase=t<.15?'Ready':t<1.18?'Load and step':t<HAMMER_CONTACT?'Drive the hammer down':t<1.65?'Impact and settle':t<3?'Recover':'Ready again';
  lastReport={time:t,phase,handSeparation:w.gap,shaftAngleDegrees:w.angle,desiredGripR:desiredR.toArray(),desiredGripL:desiredL.toArray(),gripR:actualR.toArray(),gripL:actualL.toArray(),gripErrorR:actualR.distanceTo(desiredR),gripErrorL:actualL.distanceTo(desiredL),chainErrors:errors,face:actualFace.toArray(),faceNormal:actualNormal.toArray(),target:impactPoint.toArray(),targetNormal:contactPose.n.clone().negate().toArray(),contactDistance:actualFace.distanceTo(impactPoint),step,footTargets:Object.fromEntries([...footTargets].map(([key,p])=>[key,p.toArray()])),groundedFeet:['L','R'].map(side=>get('ankle'+side).node.getWorldPosition(new T.Vector3()).distanceTo(footTargets.get(side)!))};
  return lastReport;
 }
 function setActive(value:boolean){active=value;originalLeft.forEach(o=>o.visible=!value);support.visible=value;target.visible=value&&settings.target!==false;chips.visible=false;if(value)pose(0);else restore()}
 setActive(true);
 const viewBounds=new T.Box3(),points:number[]=[],p=new T.Vector3();
 const collect=(root:T.Object3D)=>root.traverseVisible(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;const pos=mesh.geometry.attributes.position;for(let i=0;i<pos.count;i+=4){p.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);viewBounds.expandByPoint(p);points.push(p.x,p.y,p.z)}});
 if(settings.fit!==false){for(const time of [0,.45,.8,1.05,1.18,1.24,1.28,1.32,1.36,1.5,1.65,2.2,2.7,3.3]){pose(time);collect(model)}target.updateMatrixWorld(true);collect(target)}pose(0);
 const viewPoints=new Float32Array(points);
 return{duration:HAMMER_DURATION,contact:HAMMER_CONTACT,pose,setActive,inspect:()=>lastReport,impact:impactPoint,viewBounds,viewPoints,dispose(){setActive(false);owned.forEach(o=>o.removeFromParent());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())}};
}


