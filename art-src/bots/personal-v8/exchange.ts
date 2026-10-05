import * as T from 'three';
import {createHammerMotion} from './hammer-motion';

export const EXCHANGE_DURATION=11.5;
export const EXCHANGE_VERSION='warden-contact-proof-1';
type Side=0|1;
type Tuple=[number,number,number];
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const ease=(v:number)=>{v=T.MathUtils.clamp(v,0,1);return v*v*(3-2*v)};
const blend=(a:number,b:number,t:number)=>T.MathUtils.lerp(a,b,ease(t));
const attacks=[{side:0 as Side,start:1.2},{side:1 as Side,start:3.0},{side:0 as Side,start:6.8}];
export type Contact={id:number;time:number;attack:number;attacker:Side;defender:Side;attackTime:number;mesh:number;part:string;point:Tuple;localPoint:Tuple;localNormal:Tuple;normal:Tuple;incoming:Tuple};
type Actor={root:T.Group;model:T.Group;motion:ReturnType<typeof createHammerMotion>;meshes:T.Mesh[];face:T.Object3D;head:T.Object3D;grip:T.Object3D};
function partOf(object:T.Object3D){let current:T.Object3D|null=object;while(current){if(current.name==='weaponR')return 'weapon';if(current.name==='head')return 'head';if(/^(hand|wrist|elbow|shoulder)[LR]$/.test(current.name))return current.name.endsWith('L')?'left arm':'right arm';if(/^(ankle|knee|hip)[LR]$/.test(current.name))return current.name.endsWith('L')?'left leg':'right leg';if(current.name==='chest')return 'body';current=current.parent}return 'body'}
function makeActor(source:T.Group,support:T.Group,scene:T.Scene):Actor{
 const model=source.clone(true),root=new T.Group();scene.add(root);root.add(model);
 const motion=createHammerMotion(model,scene,support.clone(true),{target:false,fit:false});
 const meshes:T.Mesh[]=[];model.traverseVisible(o=>{const m=o as T.Mesh;if(m.isMesh&&partOf(m)!=='weapon')meshes.push(m)});
 return{root,model,motion,meshes,face:model.getObjectByName('hammerFace')!,head:model.getObjectByName('hammerHeadCentre')!,grip:model.getObjectByName('gripR')!};
}

// This is an explicit sparring choreography, with independently measured contacts.
// It does not run the ranked engine or award damage, wins, currency or inventory.
export function createExchange(source:T.Group,support:T.Group,scene:T.Scene){
 const actors=[makeActor(source,support,scene),makeActor(source,support,scene)];
 const contacts:Contact[]=[];const ray=new T.Raycaster();
 let damageCount=-1;
 const damageMeshes=new Map<string,{mesh:T.Mesh;geometry:T.BufferGeometry;base:Float32Array}>();
 function path(side:Side,t:number){
  let x=0,z=side===0?blend(-3.8,-1.9,t/1.15):blend(3.6,1.9,t/1.15);
  // The rival leaves the first overhead strike's lane, then closes for a counter.
  if(side===1){x=t<3?blend(0,2.1,(t-2.05)/.40):t<3.5?blend(2.1,.3,(t-3)/.5):t<5.8?.3:blend(.3,0,(t-5.8)/.7);}
  if(side===0&&t>5.3)z=blend(-1.9,-1.72,(t-5.3)/1.2);
  const heading=side===0?0:Math.PI;
  let reaction=0;
  for(const hit of contacts)if(hit.defender===side&&t>=hit.time){const age=t-hit.time,recover=1-ease((age-.35)/1.05);reaction=Math.max(reaction,(1-Math.exp(-age*45))*Math.max(0,recover));const recoil=.62*ease(age/.22)*(1-ease((age-.50)/1.0));z+=(side===0?-1:1)*recoil;}
  return{x,z,heading,reaction};
 }
 function activeAttack(side:Side,t:number){return attacks.map((a,index)=>({...a,index})).find(a=>a.side===side&&t>=a.start&&t<a.start+3.3)}
 function poseActor(side:Side,t:number){
  const actor=actors[side],p=path(side,t),action=activeAttack(side,t),hit=action&&contacts.find(c=>c.attack===action.index);
  actor.root.position.set(0,0,0);actor.root.quaternion.identity();actor.root.updateMatrixWorld(true);
  const prev=path(side,Math.max(0,t-.01)),travel=Math.hypot(p.x-prev.x,p.z-prev.z);
  const strikeTime=action?t-action.start:0;
  const walk=travel>.001&&!action?distanceAt(side,t)/(.44/.6):undefined;
  const delta=V(p.x-prev.x,0,p.z-prev.z).normalize().applyAxisAngle(V(0,1,0),-p.heading);
  actor.motion.pose(strikeTime,{contactAt:hit?.attackTime,walk,walkDirection:{x:delta.x,z:delta.z},reaction:p.reaction});
  actor.root.position.set(p.x,0,p.z);actor.root.rotation.y=p.heading;actor.root.updateMatrixWorld(true);
 }
 function poseBoth(t:number){poseActor(0,t);poseActor(1,t)}
 const travelPaths=[new Float32Array(Math.ceil(EXCHANGE_DURATION*120)+1),new Float32Array(Math.ceil(EXCHANGE_DURATION*120)+1)];
 for(const side of [0,1] as Side[])for(let i=1;i<travelPaths[side].length;i++){const a=path(side,(i-1)/120),b=path(side,i/120);travelPaths[side][i]=travelPaths[side][i-1]+Math.hypot(b.x-a.x,b.z-a.z)}
 function distanceAt(side:Side,t:number){const a=travelPaths[side],i=Math.min(a.length-2,Math.floor(t*120));return T.MathUtils.lerp(a[i],a[i+1],t*120-i)}
 function facePoints(side:Side){const a=actors[side],center=a.face.getWorldPosition(V()),head=a.head.getWorldPosition(V()),grip=a.grip.getWorldPosition(V()),s=head.clone().sub(grip).normalize(),n=center.clone().sub(head).normalize(),cross=new T.Vector3().crossVectors(n,s).normalize();const points:T.Vector3[]=[];for(const u of [-.19,0,.19])for(const v of [-.19,0,.19])points.push(center.clone().addScaledVector(s,u).addScaledVector(cross,v));return points}
 // Plan at a fixed 240 Hz, before any deformation. Render frame rate is irrelevant.
 for(let attack=0;attack<attacks.length;attack++){
  const action=attacks[attack],other=(1-action.side) as Side;let previous:T.Vector3[]|null=null;
  for(let tick=0;tick<=45;tick++){
   const local=1.175+tick/240,time=action.start+local;poseBoth(time);const points=facePoints(action.side);
   let found:{hit:T.Intersection<T.Object3D>;direction:T.Vector3;distance:number}|null=null;
   if(previous)for(let point=0;point<points.length;point++){
    const direction=points[point].clone().sub(previous[point]),length=direction.length();if(length<1e-7)continue;
    ray.set(previous[point],direction.clone().normalize());ray.near=0;ray.far=length;
    const hit=ray.intersectObjects(actors[other].meshes,false)[0];
    if(hit&&(!found||hit.distance<found.distance))found={hit,direction:direction.normalize(),distance:hit.distance};
   }
   if(found){const {hit,direction}=found,mesh=hit.object as T.Mesh,localPoint=mesh.worldToLocal(hit.point.clone()),localNormal=hit.face?.normal.clone()??V(0,1,0),normal=localNormal.clone().applyMatrix3(new T.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize();
    contacts.push({id:contacts.length,time,attack,attacker:action.side,defender:other,attackTime:local,mesh:actors[other].meshes.indexOf(mesh),part:partOf(mesh),point:hit.point.toArray() as Tuple,localPoint:localPoint.toArray() as Tuple,localNormal:localNormal.toArray() as Tuple,normal:normal.toArray() as Tuple,incoming:direction.toArray() as Tuple});break;
   }previous=points;
  }
 }
 // Refine only hit regions of one robot's geometry, leaving the shared source alone.
 function refine(mesh:T.Mesh,centers:T.Vector3[]){
  const original=mesh.geometry,geometry=original.index?original.toNonIndexed():original.clone(),attributes=Object.entries(geometry.attributes),result:Record<string,number[]>={};attributes.forEach(([key])=>result[key]=[]);
  const read=(i:number)=>Object.fromEntries(attributes.map(([key,a])=>[key,Array.from({length:a.itemSize},(_,n)=>n===0?a.getX(i):n===1?a.getY(i):n===2?a.getZ(i):a.getW(i))])) as Record<string,number[]>;
  const middle=(a:Record<string,number[]>,b:Record<string,number[]>)=>Object.fromEntries(attributes.map(([key])=>[key,a[key].map((x,i)=>(x+b[key][i])/2)]));
  function triangle(a:Record<string,number[]>,b:Record<string,number[]>,c:Record<string,number[]>,depth:number){
   const pa=V().fromArray(a.position),pb=V().fromArray(b.position),pc=V().fromArray(c.position),tri=new T.Triangle(pa,pb,pc),near=centers.some(p=>tri.closestPointToPoint(p,V()).distanceTo(p)<.36);
   if(near&&depth<4&&Math.max(pa.distanceTo(pb),pb.distanceTo(pc),pc.distanceTo(pa))>.065){const ab=middle(a,b),bc=middle(b,c),ca=middle(c,a);triangle(a,ab,ca,depth+1);triangle(ab,b,bc,depth+1);triangle(ca,bc,c,depth+1);triangle(ab,bc,ca,depth+1);return}
   for(const v of [a,b,c])for(const [key]of attributes)result[key].push(...v[key]);
  }
  for(let i=0;i<geometry.attributes.position.count;i+=3)triangle(read(i),read(i+1),read(i+2),0);
  const refined=new T.BufferGeometry();for(const [key,a]of attributes)refined.setAttribute(key,new T.Float32BufferAttribute(result[key],a.itemSize));geometry.dispose();mesh.geometry=refined;
  return{mesh,geometry:refined,base:new Float32Array(refined.attributes.position.array)};
 }
 for(const hit of contacts){const key=hit.defender+':'+hit.mesh;if(!damageMeshes.has(key)){const centers=contacts.filter(c=>c.defender===hit.defender&&c.mesh===hit.mesh).map(c=>V().fromArray(c.localPoint));damageMeshes.set(key,refine(actors[hit.defender].meshes[hit.mesh],centers))}}
 function damage(t:number){const count=contacts.filter(c=>c.time<=t).length;if(count===damageCount)return;damageCount=count;
  for(const [key,item]of damageMeshes){const a=item.geometry.attributes.position as T.BufferAttribute;a.array.set(item.base);for(const hit of contacts.filter(c=>c.time<=t&&c.defender+':'+c.mesh===key)){const center=V().fromArray(hit.localPoint),n=V().fromArray(hit.localNormal);for(let i=0;i<a.count;i++){const point=V().fromBufferAttribute(a,i),distance=point.distanceTo(center);if(distance>.30)continue;const depth=.095*Math.pow(1-distance/.30,2);point.addScaledVector(n,-depth);a.setXYZ(i,point.x,point.y,point.z)}}a.needsUpdate=true;item.geometry.computeVertexNormals();item.geometry.computeBoundingSphere();item.geometry.computeBoundingBox()}
 }
 const sparkGeometry=new T.BoxGeometry(.025,.025,.12),sparkMaterial=new T.MeshBasicMaterial({color:'#ffd28a'}),sparks=new T.InstancedMesh(sparkGeometry,sparkMaterial,24);sparks.frustumCulled=false;scene.add(sparks);const dummy=new T.Object3D();
 function pose(t:number){t=T.MathUtils.clamp(t,0,EXCHANGE_DURATION);poseBoth(t);damage(t);const latest=[...contacts].reverse().find(c=>c.time<=t),age=latest?t-latest.time:100;sparks.visible=age<.24;
  if(latest&&age<.24){for(let i=0;i<24;i++){const a=i*2.39996,s=1+(i%4)*.5;dummy.position.fromArray(latest.point).add(V(Math.cos(a)*s*age,(1.5+(i%3)) *age-9*age*age,Math.sin(a)*s*age));dummy.rotation.set(a,age*9,i);dummy.scale.setScalar(1-age/.24);dummy.updateMatrix();sparks.setMatrixAt(i,dummy.matrix)}sparks.instanceMatrix.needsUpdate=true}
  let phase=t<1.2?'Closing the distance':t<3.3?'Warden commits · rival steps out':t<6.8?'Rival counters the recovery':t<10?'Warden answers':'Back to guard';
  if(latest&&age<1.2)phase=`${latest.attacker===0?'Warden':'Rival'} connects · ${latest.part}`;
  return{time:t,phase,contactCount:damageCount,actors:actors.map(a=>({position:a.root.position.toArray(),motion:a.motion.inspect()}))};
 }
 pose(0);
 return{pose,contacts,actors,attacks,duration:EXCHANGE_DURATION,damageMeshes,dispose(){actors.forEach(a=>{a.motion.dispose();a.root.removeFromParent()});damageMeshes.forEach(d=>d.geometry.dispose());sparks.removeFromParent();sparkGeometry.dispose();sparkMaterial.dispose()}};
}
