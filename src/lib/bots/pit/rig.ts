import * as T from 'three';
import {assemble} from '../workshop8/runtime/parts-assembly';
import {SLOTS} from '../workshop8/catalogue';
import type {Appearance,Paint} from '../workshop8/appearance';
import type {Spec,Fighter} from './types';
import {motionPhase,strikePoint} from './motion';
import {moves} from './moves';
import type {ActionPath} from '../workshop8/runtime/weapon-actions';
import {weaponCarry} from './weapon-carry';
import {brawlPose} from './brawl-pose';
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=T.MathUtils.clamp;
function paint(model:T.Group,installed:ReturnType<typeof assemble>['installed'],appearance:Appearance){
 const owned=new Map<T.Object3D,string>();for(const s of SLOTS)for(const root of installed[s]??[])root.traverse(o=>owned.set(o,s));
 model.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;const slot=(owned.get(o)??'torso') as keyof Appearance['parts'];
 const copy=(source:T.Material)=>{const m=source as T.MeshStandardMaterial;if(!m.isMeshStandardMaterial)return source;const n=m.clone(),name=n.name.replace(/_\d+$/,''),channel=({armour:'primary',ivory:'secondary',brass:'trim'} as Record<string,keyof Paint>)[name];
 if(channel){n.color.set(appearance.parts[slot][channel]);const base=name==='armour'?.12:name==='ivory'?.64:.30;n.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\n#ifdef USE_MAP\n diffuseColor.rgb = diffuse * clamp(dot(sampledDiffuseColor.rgb, vec3(.2126,.7152,.0722)) / ${base}, .30, 1.30);\n#endif`)};n.customProgramCacheKey=()=>`pit-paint-${name}`;}return n;};
 mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);mesh.castShadow=true;mesh.receiveShadow=true;
 });
}
export function robotRig(assembly:ReturnType<typeof assemble>,spec:Spec){
 const model=assembly.model,root=new T.Group();root.add(model);paint(model,assembly.installed,spec.appearance);assembly.rest();model.updateMatrixWorld(true);
 const joints=new Map<string,{o:T.Object3D;p:T.Vector3;q:T.Quaternion;world:T.Vector3;worldQ:T.Quaternion}>();
 model.traverse(o=>{if(!(o as T.Mesh).isMesh)joints.set(o.name,{o,p:o.position.clone(),q:o.quaternion.clone(),world:o.getWorldPosition(V()),worldQ:o.getWorldQuaternion(new T.Quaternion())})});
 const get=(name:string)=>joints.get(name)!;
 const weapons=(assembly.installed.weapon??[]).filter(w=>w.parent&&w!==model);
 const carry=weaponCarry(model,weapons);
 assembly.bind();const brawl=brawlPose(model);assembly.rest();
 const finishingMove={...moves(spec).throw,startup:75,active:150,recovery:75};
 const stance=(a:Fighter,tick:number,finisher:number,losing:boolean)=>{
  // The grip and joint solvers work in the assembly's canonical frame.
  root.scale.setScalar(1);root.position.set(0,0,0);root.rotation.set(0,0,0);root.updateMatrixWorld(true);
  for(const j of joints.values()){j.o.position.copy(j.p);j.o.quaternion.copy(j.q);}model.updateMatrixWorld(true);
  const attack=a.attack,m=attack?.move,weapon=!!m?.motion.startsWith('weapon'),phase=attack?motionPhase(attack):0;
  let draw=0;if(weapon&&attack){draw=attack.frame<attack.move.startup?clamp(attack.frame/(attack.move.startup*.55),0,1):attack.frame>attack.move.startup+attack.move.active?1-clamp((attack.frame-attack.move.startup-attack.move.active-attack.move.recovery*.55)/(attack.move.recovery*.45),0,1):1;
   const path:Record<string,ActionPath>={weaponCross:'cross',weaponOverhead:'overhead',weaponThrust:'thrust',weaponShot:'shot',weaponButt:'butt',weaponShield:'shield',weaponFlail:'cross',weaponBlades:'combo'};
   const [x,y]=strikePoint(attack.move,attack.frame);assembly.articulate(0,{path:path[m!.motion],phase,mount:'R',contactTarget:[0,y/820,x/820],contactHeight:y/820,manual:{tick,style:spec.style,guard:0,deflect:0,dodge:0,counter:false}});
  }else{brawl.pose(finisher>0&&!losing?{...a,attack:{move:finishingMove,frame:Math.round(finisher*300),facing:a.facing,instance:0,hits:[],enhanced:false,shots:0}}:a,tick);}
  model.updateMatrixWorld(true);
  carry.pose(draw);
  root.scale.setScalar(.82);root.position.set(a.x/1000,a.y/1000,0);root.rotation.set(0,a.facing*Math.PI/2,0);
  if(a.down){root.rotation.z=-a.facing*1.45*Math.sin(Math.min(1,(39-a.down)/10)*Math.PI/2);root.position.y+=.28;}
  if(finisher>0&&losing){root.rotation.z=-a.facing*Math.min(1.4,finisher*2);root.position.y+=.3;for(const name of ['shoulderL','shoulderR','head']){const j=get(name);if(j&&finisher>.36){j.o.position.x+=name.endsWith('L')?-(finisher-.36)*3:(finisher-.36)*3;j.o.position.y-=Math.max(0,finisher-.6)*3;j.o.rotateZ(finisher*3);}}}
  model.updateMatrixWorld(true);
 };
 return {root,model,stance,inspect:carry.inspect,anatomy:brawl.inspect};
}
