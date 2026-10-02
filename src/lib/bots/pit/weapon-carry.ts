import * as T from 'three';
import {solveTwoLink,setWorldQ} from '../workshop8/runtime/parts-assembly';
const V=()=>new T.Vector3(),Q=()=>new T.Quaternion(),M=()=>new T.Matrix4();
const geometryBounds=new WeakMap<T.BufferGeometry,T.Box3>();
// GLB material primitives can share the whole model's vertex buffer. Only
// indexed vertices belong to this mesh; the generic geometry bounds include
// unrelated parts and put a holstered rifle several feet behind its wearer.
export function indexedBounds(geometry:T.BufferGeometry){
 let box=geometryBounds.get(geometry);if(box)return box;box=new T.Box3();const position=geometry.getAttribute('position'),index=geometry.index,point=V();
 for(let i=0;i<(index?.count??position.count);i++)box.expandByPoint(point.fromBufferAttribute(position,index?index.getX(i):i));geometryBounds.set(geometry,box);return box;
}
/** One physical mesh, unchanged size. Mounts are derived from actual equipment
 * bounds; a rifle never inherits a sword's arbitrary holster offset. */
export function weaponCarry(model:T.Group,weapons:T.Object3D[]){
 const chest=model.getObjectByName('chest')!,restChest=chest.matrixWorld.clone().invert();
 const excluded=new Set<T.Object3D>();weapons.forEach(w=>w.traverse(o=>excluded.add(o)));
 for(const name of ['shoulderL','shoulderR','hipL','hipR','pauldronL','pauldronR'])model.getObjectByName(name)?.traverse(o=>excluded.add(o));
 const body=new T.Box3(),bodyMeshes:T.Mesh[]=[];model.traverse(o=>{const m=o as T.Mesh;if(!m.isMesh||excluded.has(o))return;bodyMeshes.push(m);body.union(indexedBounds(m.geometry).clone().applyMatrix4(m.matrixWorld));});
 const mounts=weapons.map((weapon,index)=>{
  const inverse=weapon.matrixWorld.clone().invert(),geometry:{box:T.Box3;matrix:T.Matrix4}[]=[];
  weapon.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;geometry.push({box:indexedBounds(mesh.geometry).clone(),matrix:inverse.clone().multiply(mesh.matrixWorld)});});
  const bounds=(matrix:T.Matrix4)=>{const box=new T.Box3();for(const g of geometry)box.union(g.box.clone().applyMatrix4(matrix.clone().multiply(g.matrix)));return box;};
  const p=V(),q=Q(),scale=V();weapon.matrixWorld.decompose(p,q,scale);
  const grip=weapon.getObjectByName('gripR'),head=weapon.getObjectByName('hammerHeadCentre'),axis=head??weapon.getObjectByName('weaponAxis'),normalMarker=weapon.getObjectByName('hammerFace')??weapon.getObjectByName('weaponNormal');
  if(grip&&axis&&normalMarker){
   const frame=(shaft:T.Vector3,normal:T.Vector3)=>{const z=shaft.normalize(),x=normal.addScaledVector(z,-normal.dot(z)).normalize(),y=V().crossVectors(z,x);return Q().setFromRotationMatrix(M().makeBasis(x,y,z));};
   const shaft=axis.getWorldPosition(V()).sub(grip.getWorldPosition(V())),normal=normalMarker.getWorldPosition(V()).sub((head??grip).getWorldPosition(V()));
   // Lay the weapon's broad plane across the back. Simply pointing the barrel
   // upward leaves the hammer head or receiver pointing through the spine.
   q.premultiply(frame(new T.Vector3(-.12,1,0),new T.Vector3(1,.12,0)).multiply(frame(shaft,normal).invert()));
  }
  // The mounting plane sits beyond the deepest body part, including backpacks.
  const matrix=M().compose(V(),q,scale),box=bounds(matrix),centre=box.getCenter(V());
  matrix.setPosition(new T.Vector3((index?.42:-.35)-centre.x,Math.max(.45,body.max.y*.65-box.getSize(V()).y*.5)-box.min.y,body.min.z-.08-box.max.z-index*.12));
  const mount=restChest.clone().multiply(matrix);
  const rail=new T.Mesh(new T.CylinderGeometry(.07,.07,1,8),new T.MeshStandardMaterial({color:'#414c52',metalness:.8,roughness:.4}));rail.name='pit-carry-mount-'+index;model.add(rail);
  return {weapon,mount,bounds,rail,side:index?'L':'R',secondary:!!index};
 });
 let gripError=0,stowedClearance=0;
 function pose(draw:number){
  gripError=0;stowedClearance=Infinity;
  // Capture all destinations before solving either arm (the offhand is parented
  // to the other wrist). No duplicated sockets can pollute muzzle/contact lookup.
  const targets=mounts.map(h=>h.weapon.matrixWorld.clone());
  const currentBody=new T.Box3();for(const mesh of bodyMeshes)currentBody.union(indexedBounds(mesh.geometry).clone().applyMatrix4(mesh.matrixWorld));
  mounts.forEach((h,i)=>{
   if(draw>=.999)return;
   const mounted=chest.matrixWorld.clone().multiply(h.mount),target=targets[i];
   const clearance=currentBody.min.z-.08-h.bounds(mounted).max.z;if(clearance<0)mounted.elements[14]+=clearance;
   const mountedBox=h.bounds(mounted),end=mountedBox.getCenter(V());end.z=mountedBox.max.z;
   const start=chest.getWorldPosition(V());start.y=end.y;start.x*=.5;
   h.rail.position.copy(start).lerp(end,.5);h.rail.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.clone().sub(start).normalize());h.rail.scale.y=start.distanceTo(end);h.rail.visible=draw<.65;
   if(draw<=0){apply(h.weapon,mounted);stowedClearance=Math.min(stowedClearance,currentBody.min.z-h.bounds(mounted).max.z);return;}
   const p0=V(),q0=Q(),s0=V(),p1=V(),q1=Q(),s1=V();mounted.decompose(p0,q0,s0);target.decompose(p1,q1,s1);
   // Sweep outside the shoulder, with most rotation occurring outboard. The old
   // straight line from the backpack to the grip crossed the chest and head.
   const side=h.secondary?1:-1,edge=side*(Math.max(Math.abs(body.min.x),Math.abs(body.max.x))+.38),t=draw*draw*(3-2*draw);
   const p=p0.clone().lerp(p1,t);p.x+=side*Math.sin(Math.PI*t)*Math.max(.85,Math.abs(edge-(p0.x+p1.x)/2));p.y+=Math.sin(Math.PI*t)*.24;
   const q=q0.clone().slerp(q1,t),desired=M().compose(p,q,s0);
   // The drawing hand follows the visible grip. The support hand joins on the
   // forward half of the draw; during the active attack both use the kit solver.
   const hands=h.secondary?['L']:model.userData.weaponHands===2&&draw>.70?['R','L']:['R'];
   const wrists=hands.map(side=>{const wrist=model.getObjectByName('wrist'+side)!;return {side,wrist,relative:target.clone().invert().multiply(wrist.matrixWorld),shoulder:model.getObjectByName('shoulder'+side)!,elbow:model.getObjectByName('elbow'+side)!};});
   // Translate the complete rigid weapon into the drawing arm's reach sphere.
   // This maintains its dimensions and the separation between two grips.
   for(let pass=0;pass<8;pass++)for(const hand of wrists){const w=desired.clone().multiply(hand.relative),end=new T.Vector3().setFromMatrixPosition(w),shoulder=hand.shoulder.getWorldPosition(V()),max=shoulder.distanceTo(hand.elbow.getWorldPosition(V()))+hand.elbow.getWorldPosition(V()).distanceTo(hand.wrist.getWorldPosition(V()))-.002,delta=end.clone().sub(shoulder);if(delta.length()>max){p.add(shoulder.add(delta.setLength(max)).sub(end));desired.setPosition(p);}}
   for(const hand of wrists){const matrix=desired.clone().multiply(hand.relative),end=V(),rotation=Q();matrix.decompose(end,rotation,V());solveTwoLink(model,'shoulder'+hand.side,'elbow'+hand.side,'wrist'+hand.side,end,new T.Vector3(hand.side==='L'?2.3:-2.3,body.max.y-.8,-.3));setWorldQ(hand.wrist,rotation);gripError=Math.max(gripError,hand.wrist.getWorldPosition(V()).distanceTo(end));}
   apply(h.weapon,desired);
  });
  model.updateMatrixWorld(true);
 }
 function apply(object:T.Object3D,world:T.Matrix4){object.parent!.updateWorldMatrix(true,false);object.parent!.matrixWorld.clone().invert().multiply(world).decompose(object.position,object.quaternion,object.scale);object.updateWorldMatrix(false,true);}
 return {pose,inspect:()=>({gripError,stowedClearance})};
}
