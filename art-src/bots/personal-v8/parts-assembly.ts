import * as T from 'three';
import {equipmentPose,type EquipmentMotion} from './equipment-pose';
export const SLOTS=['head','torso','armL','armR','legL','legR','weapon'] as const;
export type Slot=typeof SLOTS[number];
export type Entry={id:string;style:'tank'|'speed'|'ranged';family:string;tier:number;name:string;description:string;url:string;sha256:string;approval:string;weapon:string;hands?:number;thumbnailRoot?:string;offhand:boolean;slots:Slot[]};
export type Choices=Record<Slot,string>;
const ROOT:Record<Exclude<Slot,'torso'|'weapon'>,string>={head:'head',armL:'shoulderL',armR:'shoulderR',legL:'hipL',legR:'hipR'};
const V=()=>new T.Vector3();
function requireNode(m:T.Object3D,name:string){const o=m.getObjectByName(name);if(!o)throw Error('Missing attachment: '+name);return o}
export function prepareLibrary(model:T.Group){
 model.updateMatrixWorld(true);
 if(!model.getObjectByName('handGripR')){
  model.userData.openLeftHand=true;
  // Explicit sockets recovered from the approved Warden authoring constants.
  const grip=requireNode(model,'gripR').getWorldPosition(V()),axis=new T.Vector3(1.05,-.89,1.06).normalize(),front=new T.Vector3(0,0,1).addScaledVector(axis,-axis.z).normalize();
  for(const side of ['R','L']){const hand=requireNode(model,'hand'+side),p=side==='R'?grip:new T.Vector3(1.53,1.46,.30);
   for(const [prefix,world]of [['handGrip',p],['handAxis',p.clone().add(side==='R'?axis:new T.Vector3(0,1,0))],['handPalm',p.clone().add(side==='R'?front:new T.Vector3(0,0,1))]] as const){const marker=new T.Object3D();marker.name=prefix+side;marker.position.copy(hand.worldToLocal(world.clone()));hand.add(marker)}
  }
 }
 model.updateMatrixWorld(true);
}
function gripFrame(model:T.Object3D,side:string){const p=requireNode(model,'handGrip'+side).getWorldPosition(V()),z=requireNode(model,'handAxis'+side).getWorldPosition(V()).sub(p).normalize(),x=requireNode(model,'handPalm'+side).getWorldPosition(V()).sub(p);x.addScaledVector(z,-x.dot(z)).normalize();const y=new T.Vector3().crossVectors(z,x).normalize();return new T.Matrix4().makeBasis(x,y,z).setPosition(p)}
/** Clone nodes, share immutable meshes/materials. No changes to donor masters. */
export function assemble(choices:Choices,library:Map<string,T.Group>){
 const donor=(slot:Slot)=>{const m=library.get(choices[slot]);if(!m)throw Error('Part library is not loaded');return m};
 const model=donor('torso').clone(true);model.name='assembled';model.updateMatrixWorld(true);
 // The weapon and offhand belong to the kit, never to an arm purchase.
 for(const name of ['weaponR','weaponL','shieldL','pauldronL','pauldronR'])model.getObjectByName(name)?.removeFromParent();
 const installed:Partial<Record<Slot,T.Object3D[]>>={};
 for(const slot of ['head','armL','armR','legL','legR'] as const){
  const old=requireNode(model,ROOT[slot]),parent=old.parent!,piece=requireNode(donor(slot),ROOT[slot]).clone(true);
  piece.position.copy(old.position);piece.quaternion.copy(old.quaternion);piece.scale.copy(old.scale);
  for(const name of ['weaponR','weaponL','shieldL'])piece.getObjectByName(name)?.removeFromParent();
  old.removeFromParent();parent.add(piece);installed[slot]=[piece];
  if(slot==='armL'||slot==='armR'){
   const cap=donor(slot).getObjectByName('pauldron'+slot.slice(-1));if(cap){const clone=cap.clone(true);clone.position.copy(piece.position).add(cap.position.clone().sub(requireNode(donor(slot),ROOT[slot]).position));parent.add(clone);installed[slot]!.push(clone)}
  }
 }
 if(donor('armL').userData.openLeftHand&&library.has('__support')){
  const left=requireNode(model,'handL');left.clear();const support=library.get('__support')!.clone(true);left.add(support);
  for(const [from,to]of [['supportGrip','handGripL'],['supportShaft','handAxisL'],['supportPalm','handPalmL']])requireNode(support,from).name=to;
 }
 model.updateMatrixWorld(true);
 const hand=requireNode(model,'handR'),sourceWeapon=requireNode(donor('weapon'),'weaponR'),weapon=sourceWeapon.clone(true);hand.add(weapon);model.updateMatrixWorld(true);
 // Both libraries declare actual hand and weapon grips, so unlike models do not
 // rely on an arbitrary visible handle centre or a guessed hand offset.
 const world=gripFrame(model,'R').multiply(gripFrame(donor('weapon'),'R').invert()).multiply(sourceWeapon.matrixWorld);
 new T.Matrix4().copy(hand.matrixWorld).invert().multiply(world).decompose(weapon.position,weapon.quaternion,weapon.scale);
 installed.weapon=[weapon];
 const shield=donor('weapon').getObjectByName('shieldL')??donor('weapon').getObjectByName('weaponL');
 if(shield){const copy=shield.clone(true),left=requireNode(model,'handL');left.add(copy);const world=gripFrame(model,'L').multiply(gripFrame(donor('weapon'),'L').invert()).multiply(shield.matrixWorld);if(choices.weapon.startsWith('kit1.')&&shield.name==='shieldL'){const clearance=requireNode(model,'handPalmL').getWorldPosition(V()).sub(requireNode(model,'handGripL').getWorldPosition(V())).normalize().multiplyScalar(.18);world.setPosition(new T.Vector3().setFromMatrixPosition(world).add(clearance));}new T.Matrix4().copy(left.matrixWorld).invert().multiply(world).decompose(copy.position,copy.quaternion,copy.scale);installed.weapon.push(copy)}
 installed.torso=[requireNode(model,'pelvis'),requireNode(model,'chest')];
 model.updateMatrixWorld(true);
 // A shorter leg sets hip height; the longer leg bends to its planted foot.
 const footData=['L','R'].map(s=>{const foot=requireNode(model,'ankle'+s),box=new T.Box3().setFromObject(foot,true);return {s,foot,min:box.min.y,q:foot.getWorldQuaternion(new T.Quaternion())}});
 const pelvis=requireNode(model,'pelvis');pelvis.position.y+=.03-Math.max(...footData.map(f=>f.min));model.updateMatrixWorld(true);
 for(const f of footData){const box=new T.Box3().setFromObject(f.foot,true),target=f.foot.getWorldPosition(V());target.y+=.03-box.min.y;solveTwoLink(model,'hip'+f.s,'knee'+f.s,'ankle'+f.s,target,new T.Vector3(f.s==='L'?1:-1,1,3));setWorldQ(f.foot,f.q)}
 model.updateMatrixWorld(true);
 model.userData.weaponKind=donor('weapon').userData.weaponKind;model.userData.weaponHands=donor('weapon').userData.weaponHands;
 const stance=equipmentPose(model);const rest=()=>{stance.pose(0)};
 const articulate=(value:number,motion?:EquipmentMotion)=>{stance.pose(value,motion)};rest();
 function inspect(){model.updateMatrixWorld(true);const gripError=requireNode(model,'handGripR').getWorldPosition(V()).distanceTo(requireNode(model,'gripR').getWorldPosition(V()));
  const feet=['L','R'].map(s=>({side:s,minY:new T.Box3().setFromObject(requireNode(model,'ankle'+s),true).min.y}));
  let meshes=0,triangles=0,finite=true;model.traverse(o=>{finite&&=o.matrixWorld.elements.every(Number.isFinite);const m=o as T.Mesh;if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3}});
  return {choices:{...choices},gripError,feet,meshes,triangles,finite,weaponCount:installed.weapon!.length,stance:stance.inspect()};
 }
 return {model,installed,rest,articulate,inspect};
}
export function setWorldQ(o:T.Object3D,q:T.Quaternion){o.quaternion.copy(o.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));o.updateWorldMatrix(false,true)}
export function solveTwoLink(model:T.Object3D,aName:string,bName:string,cName:string,target:T.Vector3,pole:T.Vector3){
 const a=requireNode(model,aName),b=requireNode(model,bName),c=requireNode(model,cName),p=a.getWorldPosition(V()),q=b.getWorldPosition(V()),r=c.getWorldPosition(V()),ab=q.clone().sub(p),bc=r.clone().sub(q),l1=ab.length(),l2=bc.length();
 if(r.distanceTo(target)<1e-6)return;
 const d=target.clone().sub(p),len=T.MathUtils.clamp(d.length(),Math.abs(l1-l2)+1e-5,l1+l2-1e-5);d.normalize();const normal=pole.clone().sub(p).addScaledVector(d,-pole.clone().sub(p).dot(d)).normalize();const x=(l1*l1-l2*l2+len*len)/(2*len),mid=p.clone().addScaledVector(d,x).addScaledVector(normal,Math.sqrt(Math.max(0,l1*l1-x*x)));
 const qa=new T.Quaternion().setFromUnitVectors(ab.normalize(),mid.clone().sub(p).normalize()).multiply(a.getWorldQuaternion(new T.Quaternion()));setWorldQ(a,qa);
 const nb=b.getWorldPosition(V()),nc=c.getWorldPosition(V());setWorldQ(b,new T.Quaternion().setFromUnitVectors(nc.sub(nb).normalize(),target.clone().sub(nb).normalize()).multiply(b.getWorldQuaternion(new T.Quaternion())));
}
