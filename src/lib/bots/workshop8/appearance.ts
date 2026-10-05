import {SLOTS,type Slot} from './equipment-types';
export type Paint={primary:string;secondary:string;trim:string};
export type Appearance={version:1;parts:Record<Slot,Paint>;banner:boolean;bannerId?:string};
export const PALETTES:Record<string,Paint>={
 warden:{primary:'#126c70',secondary:'#eee4ca',trim:'#bf934c'},revenant:{primary:'#7d263e',secondary:'#30343d',trim:'#ae894e'},harrow:{primary:'#c56329',secondary:'#343d43',trim:'#bac4c8'},
 duelist:{primary:'#254fba',secondary:'#eee8d9',trim:'#c78052'},legion:{primary:'#ad283b',secondary:'#ece3cb',trim:'#5c7180'},hunter:{primary:'#454483',secondary:'#2b3543',trim:'#e87f72'},
 tracker:{primary:'#68754a',secondary:'#ccb88c',trim:'#dcaa45'},sentinel:{primary:'#264d70',secondary:'#d1d9da',trim:'#dca84a'},specter:{primary:'#225b68',secondary:'#303b46',trim:'#bd8b69'},
};
export function defaultAppearance(family='warden'):Appearance{return {version:1,parts:Object.fromEntries(SLOTS.map(s=>[s,{...(PALETTES[family]??PALETTES.warden)}])) as Record<Slot,Paint>,banner:true}}
export function parseAppearance(v:unknown):Appearance|null{const a=v as Appearance;if(a?.version!==1||typeof a.banner!=='boolean'||!SLOTS.every(s=>a.parts?.[s]&&['primary','secondary','trim'].every(k=>/^#[0-9a-f]{6}$/i.test((a.parts[s] as any)[k]))))return null;if(a.bannerId!==undefined&&!/^[0-9a-f]{64}$/.test(a.bannerId))return null;return structuredClone(a)}
