import * as T from 'three';
import {SLOTS, type Slot} from './parts-assembly';
import type {Paint,Appearance} from '../../../src/lib/bots/workshop8/appearance';
export {PALETTES,defaultAppearance,parseAppearance,type Paint,type Appearance} from '../../../src/lib/bots/workshop8/appearance';
/** Material assignment is the mask. Only armour/ivory/brass are paintable;
 * structural metal, blades, lenses, joints and shader effects retain their material. */
export function paintAssembly(model:T.Group,installed:Partial<Record<Slot,T.Object3D[]>>){
 const owners=new Map<T.Object3D,Slot>();for(const s of SLOTS)for(const root of installed[s]??[])root.traverse(o=>{if(!owners.has(o)||s!=='torso')owners.set(o,s)});
 const edits:{material:T.MeshStandardMaterial;slot:Slot;channel:keyof Paint}[]=[],originals:{mesh:T.Mesh;material:T.Material|T.Material[]}[]=[];
 model.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;originals.push({mesh,material:mesh.material});const slot=owners.get(o)??'torso';
  const copy=(source:T.Material)=>{const m=source as T.MeshStandardMaterial;const name=m.name.replace(/_\d+$/,'');const channel=name==='armour'?'primary':name==='ivory'?'secondary':name==='brass'?'trim':null;if(!channel||!m.isMeshStandardMaterial)return source;
   const next=m.clone(),base=name==='armour'?.12:name==='ivory'?.64:.30;
   next.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\n#ifdef USE_MAP\n diffuseColor.rgb = diffuse * clamp(dot(sampledDiffuseColor.rgb, vec3(.2126,.7152,.0722)) / ${base.toFixed(2)}, .30, 1.30);\n#endif`)};
   next.customProgramCacheKey=()=>`mk-paint-1-${name}`;edits.push({material:next,slot,channel});return next;
  };mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);
 });
 return {apply(a:Appearance){for(const e of edits)e.material.color.set(a.parts[e.slot][e.channel])},inspect(){return {paintedMaterials:edits.length,slots:[...new Set(edits.map(e=>e.slot))],colours:edits.map(e=>({slot:e.slot,channel:e.channel,hex:'#'+e.material.color.getHexString()}))}},dispose(){for(const o of originals)o.mesh.material=o.material;for(const e of edits)e.material.dispose()}};
}
