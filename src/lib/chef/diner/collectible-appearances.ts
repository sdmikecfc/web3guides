import {COLLECTIBLE_BY_ID} from './collectible-packs';
import type {DinerState} from './progression';
export interface CollectibleAppearances {version:1;home:Record<string,string>;truck:Record<string,string>}
export type AppearanceLocation='home'|'truck';
export const emptyAppearances=():CollectibleAppearances=>({version:1,home:{},truck:{}});
/** Retain access to saved samples without advertising unreleased appearances. */
export function ownedEquipmentAppearances(state:DinerState,kind:string|undefined){
 return Object.values(COLLECTIBLE_BY_ID).filter(item=>!!item.equipmentKind&&item.equipmentKind===kind&&(state.decorOwned[item.id]??0)>0);
}
export function appearanceTargets(state:DinerState,location:AppearanceLocation){
 return location==='home'?state.home.layout.map(p=>({id:p.id,kind:p.equipmentId})):state.truckConfig.stations.map(p=>({id:p.id,kind:p.kind}));
}
export function assignedCopies(state:DinerState,skinId:string){return Object.values(state.collectibleAppearances?.home??{}).concat(Object.values(state.collectibleAppearances?.truck??{})).filter(id=>id===skinId).length;}
export function appearanceError(state:DinerState,location:AppearanceLocation,targetId:string,skinId:string|null){
 if(!['home','truck'].includes(location)||!appearanceTargets(state,location).some(p=>p.id===targetId))return 'Choose a placed machine first.';
 if(skinId===null)return null;
 const skin=COLLECTIBLE_BY_ID[skinId],target=appearanceTargets(state,location).find(p=>p.id===targetId)!;
 if(!skin?.equipmentKind||skin.equipmentKind!==target.kind)return 'This appearance needs a compatible machine.';
 const current=state.collectibleAppearances?.[location][targetId]===skinId?1:0;
 if(assignedCopies(state,skinId)-current>=(state.decorOwned[skinId]??0))return 'Every owned copy is already in use. Remove it from its other machine first.';
 return null;
}
export function validAppearances(state:DinerState):boolean{
 const a=state.collectibleAppearances;if(a===undefined)return true;
 if(!a||a.version!==1||Object.keys(a).some(k=>!['version','home','truck'].includes(k)))return false;
 for(const location of ['home','truck'] as const){if(!a[location]||typeof a[location]!=='object'||Array.isArray(a[location])||Object.keys(a[location]).length>200)return false;
  for(const [target,skin] of Object.entries(a[location]))if(typeof skin!=='string'||appearanceError(state,location,target,skin))return false;
 }return true;
}
/** Storing/replacing a machine releases its appearance; it never deletes ownership. */
export function releaseMissingAppearances(state:DinerState){
 if(!state.collectibleAppearances)return;
 for(const location of ['home','truck'] as const){const targets=appearanceTargets(state,location);
  for(const [id,skin] of Object.entries(state.collectibleAppearances[location]))if(!targets.some(t=>t.id===id&&t.kind===COLLECTIBLE_BY_ID[skin]?.equipmentKind))delete state.collectibleAppearances[location][id];
 }
}
