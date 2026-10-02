import * as T from 'three';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
/** Authored supplementary kit. It is dormant unless the body's recorded
 * finisher phase is active; emissions and damage are owned by the simulation. */
export function installSpecialEquipment(model:T.Group,source:T.Group){
 const guns=['R','L'].map(side=>{const gun=source.getObjectByName('specialPistol'+side)!.clone(true);model.add(gun);gun.visible=false;return gun});
 const blade=source.getObjectByName('specialBlade')!.clone(true);model.add(blade);blade.visible=false;
 const setWorld=(node:T.Object3D,position:T.Vector3,q:T.Quaternion)=>{model.updateMatrixWorld(true);node.position.copy(model.worldToLocal(position.clone()));node.quaternion.copy(model.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));node.updateMatrixWorld(true)};
 return {guns,blade,pose(kind:'tank'|'speed'|'ranged',progress:number,arms:[boolean,boolean],target?:number[]){
  const active=progress>=0&&progress<=1,draw=active?Math.min(1,progress/.24,(1-progress)/.17):0;
  guns.forEach((g,i)=>{g.visible=active&&kind==='ranged'&&arms[i===0?1:0]&&draw>0;const side=i?'L':'R',hand=model.getObjectByName('handGrip'+side)!,p=hand.getWorldPosition(V());p.y-=.43*(1-draw);const direction=target?V().fromArray(target).sub(p).normalize():V(0,0,1),yaw=T.MathUtils.clamp(Math.atan2(direction.x,direction.z),-.30,.30),pitch=T.MathUtils.clamp(Math.asin(direction.y),-.35,.35),q=new T.Quaternion().setFromUnitVectors(V(0,0,1),V(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch))).multiply(new T.Quaternion().setFromAxisAngle(V(1,0,0),.5*(1-draw)));setWorld(g,p,q)});
  blade.visible=active&&kind==='speed'&&arms[1]&&draw>0;if(blade.visible){const p=model.getObjectByName('handGripR')!.getWorldPosition(V());setWorld(blade,p,new T.Quaternion().setFromAxisAngle(V(1,0,0),Math.PI/2));blade.scale.setScalar(draw)}
  if(active&&kind==='ranged')for(const name of ['weaponR','weaponL','shieldL']){const primary=model.getObjectByName(name);if(!primary)continue;const p=primary.getWorldPosition(V()),belt=model.getObjectByName('pelvis')!.getWorldPosition(V()).add(V(name==='weaponR'?-.75:.75,0,-.60));p.lerp(belt,draw);primary.position.copy(primary.parent!.worldToLocal(p));primary.rotateX(-draw*.60)}
 },muzzle(side:'L'|'R'){return model.getObjectByName('specialMuzzle'+side)!.getWorldPosition(V())},direction(side:'L'|'R'){return V(0,0,1).applyQuaternion(model.getObjectByName('specialMuzzle'+side)!.getWorldQuaternion(new T.Quaternion())).normalize()},bladeTip(){return blade.localToWorld(V(0,.66,0))}};
}
