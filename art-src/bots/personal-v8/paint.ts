import * as T from 'three';
import {SLOTS, type Slot} from './parts-assembly';
export type Paint={primary:string;secondary:string;trim:string};
export type Appearance={version:1;parts:Record<Slot,Paint>;banner:boolean;bannerId?:string};
export const PALETTES:Record<string,Paint>={
 warden:{primary:'#126c70',secondary:'#eee4ca',trim:'#bf934c'},revenant:{primary:'#7d263e',secondary:'#30343d',trim:'#ae894e'},harrow:{primary:'#c56329',secondary:'#343d43',trim:'#bac4c8'},
 duelist:{primary:'#254fba',secondary:'#eee8d9',trim:'#c78052'},legion:{primary:'#ad283b',secondary:'#ece3cb',trim:'#5c7180'},hunter:{primary:'#454483',secondary:'#2b3543',trim:'#e87f72'},
 tracker:{primary:'#68754a',secondary:'#ccb88c',trim:'#dcaa45'},sentinel:{primary:'#264d70',secondary:'#d1d9da',trim:'#dca84a'},specter:{primary:'#225b68',secondary:'#303b46',trim:'#bd8b69'},
};
export function defaultAppearance(family='warden'):Appearance{return {version:1,parts:Object.fromEntries(SLOTS.map(s=>[s,{...(PALETTES[family]??PALETTES.warden)}])) as Record<Slot,Paint>,banner:true}}
export function parseAppearance(v:unknown):Appearance|null{const a=v as Appearance;if(a?.version!==1||typeof a.banner!=='boolean'||!SLOTS.every(s=>a.parts?.[s]&&['primary','secondary','trim'].every(k=>/^#[0-9a-f]{6}$/i.test((a.parts[s] as any)[k]))))return null;if(a.bannerId!==undefined&&!/^[0-9a-f]{64}$/.test(a.bannerId))return null;return structuredClone(a)}
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
