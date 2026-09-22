import {add,canonical,cloneV6,deepFreeze,hashV6,inverseQuatV6,multiplyQuatV6,rotateQuatV6,subtract,type Vec3} from '@/lib/bots/v6/math';
import type {HeroRigV7,NodeTransformV7,RigManifestV7} from './types';
const manifests=new Map<string,Readonly<RigManifestV7>>();
let defaultVersion='';
const vec=(v:unknown,n:number)=>Array.isArray(v)&&v.length===n&&v.every(x=>typeof x==='number'&&Number.isFinite(x));
/** The rest hierarchy is authored data, never inferred from an asset's bounding box. */
export function validateRigV7(rig:HeroRigV7):boolean {
  if(!rig?.nodes?.root||rig.nodes.root.parent!==null||!rig.proxies?.length)return false;
  for(const [name,node] of Object.entries(rig.nodes)){
    if(!vec(node.position,3)||!vec(node.quaternion,4)||Math.abs(Math.hypot(...node.quaternion)-1)>.001)return false;
    const visited=new Set([name]);let p=node.parent;
    while(p){if(visited.has(p)||!rig.nodes[p])return false;visited.add(p);p=rig.nodes[p].parent;}
  }
  return rig.proxies.every(p=>!!rig.nodes[p.node]&&vec(p.center,3)&&vec(p.half,3)&&p.half.every(n=>n>0)&&(!p.a||vec(p.a,3))&&(!p.b||vec(p.b,3)))&&Object.values(rig.markers).every(m=>!!rig.nodes[m.node]&&vec(m.position,3));
}
export function registerRigManifestV7(manifest:RigManifestV7):Readonly<RigManifestV7>{
  if(!manifest||manifest.units!=='millimetres'||!['tank','speed','ranged'].every(s=>validateRigV7(manifest.heroes[s as keyof typeof manifest.heroes])))throw new Error('The remaster rig manifest is incomplete.');
  const prior=manifests.get(manifest.version);if(prior&&hashV6(prior)!==hashV6(manifest))throw new Error('An installed rig version cannot change.');
  const saved=prior??deepFreeze(cloneV6(manifest));manifests.set(manifest.version,saved);defaultVersion=manifest.version;return saved;
}
export function rigManifestV7(version=defaultVersion):Readonly<RigManifestV7>{const m=manifests.get(version);if(!m)throw new Error('The authored remaster rig is not installed.');return m;}
export function composeV7(a:NodeTransformV7,b:NodeTransformV7):NodeTransformV7{return {position:add(a.position,rotateQuatV6(b.position,a.quaternion)),quaternion:multiplyQuatV6(a.quaternion,b.quaternion)};}
export function inversePointV7(frame:NodeTransformV7,point:Vec3):Vec3{return rotateQuatV6(subtract(point,frame.position),inverseQuatV6(frame.quaternion));}
export function transformPointV7(frame:NodeTransformV7,point:Vec3):Vec3{return add(frame.position,rotateQuatV6(point,frame.quaternion));}
export function restNodesV7(rig:HeroRigV7):Record<string,NodeTransformV7>{return Object.fromEntries(Object.entries(rig.nodes).map(([key,n])=>[key,{position:[...n.position],quaternion:[...n.quaternion]}]));}
export function worldNodesV7(rig:HeroRigV7,nodes:Record<string,NodeTransformV7>):Record<string,NodeTransformV7>{const world:Record<string,NodeTransformV7>={};function visit(key:string):NodeTransformV7{if(world[key])return world[key];const parent=rig.nodes[key].parent;return world[key]=parent?composeV7(visit(parent),nodes[key]):nodes[key];}Object.keys(nodes).forEach(visit);return world;}
export function markerV7(rig:HeroRigV7,world:Record<string,NodeTransformV7>,name:string):Vec3 {const m=rig.markers[name];if(!m)throw new Error(`Missing authored marker ${name}.`);return transformPointV7(world[m.node],m.position);}
export const equalSnapshotV7=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
