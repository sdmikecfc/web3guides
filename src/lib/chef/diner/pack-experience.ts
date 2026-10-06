import {DOMAIN_COLLECTIBLE_BY_ID,domainPackItems,isDomainId,type DomainId,type DomainCollectible} from './domain-worlds';
import {hasDomainArtStudy} from './domain-art-studies';
import type {PackKind,CollectibleRarity} from './collectible-packs-v1';

/** Launch proposal v2. The immutable v3 catalogue's historical weights stay intact. */
export const DOMAIN_ODDS_VERSION=2 as const;
export const DOMAIN_ODDS_V2:Record<CollectibleRarity,number>={common:1200,uncommon:900,rare:600,epic:400,legendary:350,mythic:250};
export function experiencePackItems(domain:DomainId,pack:PackKind){return domainPackItems(domain,pack).map(item=>({...item,weight:DOMAIN_ODDS_V2[item.rarity]}));}
export function experienceItemAtTicket(domain:DomainId,pack:PackKind,ticket:number){
 if(!isDomainId(domain)||!['regular','super'].includes(pack)||!Number.isInteger(ticket)||ticket<0||ticket>=10000)throw new Error('Invalid v2 odds ticket');
 let end=0;for(const item of experiencePackItems(domain,pack)){end+=item.weight;if(ticket<end)return item;}throw new Error('Incomplete odds table');
}
export const RARITY_PRESENTATION:Record<CollectibleRarity,{color:string;marks:number;duration:number;hint:string}>={
 common:{color:'#c4d8bd',marks:1,duration:3000,hint:'A little character is on its way.'},
 uncommon:{color:'#7de0b3',marks:2,duration:3300,hint:'Something with a little extra character.'},
 rare:{color:'#89c8ff',marks:3,duration:3900,hint:'A rare arrival.'},
 epic:{color:'#c8a5ff',marks:4,duration:4300,hint:'An extraordinary delivery.'},
 legendary:{color:'#ffd58a',marks:5,duration:4800,hint:'Something legendary has arrived.'},
 mythic:{color:'#ffb3ba',marks:6,duration:5300,hint:'A world of its own. A Mythic arrival.'},
};
export type RevealPhase='arrival'|'hint'|'unseal'|'revealed';
/** Film speed builds a little more anticipation for the actual higher-rarity result. */
export const CINEMATIC_SPEED:Record<CollectibleRarity,number>={common:1,uncommon:1,rare:.94,epic:.9,legendary:.85,mythic:.8};
export function cinematicRevealPhase(progress:number):RevealPhase{
 return progress<.3?'arrival':progress<.75?'hint':'unseal';
}
export function revealPhase(elapsed:number,rarity:CollectibleRarity,reduced=false):RevealPhase{
 if(reduced||elapsed>=RARITY_PRESENTATION[rarity].duration)return 'revealed';
 return elapsed<850?'arrival':elapsed<1900?'hint':'unseal';
}

/** Disposable presentation data only. Never accepted by canonicalDomainOpenings. */
export interface PreviewOpening {id:string;source:'preview';domain:DomainId;pack:PackKind;itemId:string;sequence:number}
export interface PackPreviewSession {version:1;openings:PreviewOpening[];pending:PreviewOpening|null}
export const PACK_PREVIEW_KEY='domain_kitchen_pack_screen_preview_v1';
export const emptyPackPreview=():PackPreviewSession=>({version:1,openings:[],pending:null});
function validPreview(value:unknown):value is PreviewOpening{
 if(!value||typeof value!=='object')return false;const r=value as PreviewOpening,item=DOMAIN_COLLECTIBLE_BY_ID[r.itemId];
 return r.source==='preview'&&isDomainId(r.domain)&&['regular','super'].includes(r.pack)&&Number.isSafeInteger(r.sequence)&&r.sequence>0&&r.sequence<=10000&&r.id===`preview:${r.sequence}`&&!!item&&item.domain===r.domain&&item.pack===r.pack&&hasDomainArtStudy(item.id);
}
export function restorePackPreview(raw:string|null):PackPreviewSession{
 try{if(!raw||raw.length>100000)return emptyPackPreview();const value=JSON.parse(raw);if(value?.version!==1||!Array.isArray(value.openings))return emptyPackPreview();
 const seen=new Set<string>(),openings:PreviewOpening[]=[];for(const r of value.openings.slice(0,200)){if(validPreview(r)&&!seen.has(r.id)){seen.add(r.id);openings.push({id:r.id,source:'preview',domain:r.domain,pack:r.pack,itemId:r.itemId,sequence:r.sequence});}}
 return {version:1,openings,pending:validPreview(value.pending)?{id:value.pending.id,source:'preview',domain:value.pending.domain,pack:value.pending.pack,itemId:value.pending.itemId,sequence:value.pending.sequence}:null};
 }catch{return emptyPackPreview();}
}
export function beginPackPreview(state:PackPreviewSession,domain:DomainId,pack:PackKind):PackPreviewSession{
 if(state.pending||!isDomainId(domain)||!['regular','super'].includes(pack))return state;
 const built=domainPackItems(domain,pack).filter(i=>hasDomainArtStudy(i.id)),count=state.openings.filter(r=>r.domain===domain&&r.pack===pack).length;
 // Curated art tour, explicitly labelled, not a simulation of paid probabilities.
 const order=['common','uncommon','legendary'] as const,preferred=built.filter(i=>i.rarity===order[count%order.length]);
 const item=(preferred.length?preferred:built)[Math.floor(count/3)%(preferred.length||built.length)];if(!item)return state;
 const sequence=Math.max(0,...state.openings.map(r=>r.sequence))+1;if(sequence>10000)return state;
 return {...state,pending:{id:`preview:${sequence}`,source:'preview',domain,pack,itemId:item.id,sequence}};
}
export function finishPackPreview(state:PackPreviewSession):PackPreviewSession{
 if(!state.pending)return state;return {...state,openings:state.openings.some(r=>r.id===state.pending!.id)?state.openings:[...state.openings,state.pending].slice(-200),pending:null};
}
export function previewDiscoveries(state:PackPreviewSession,domain:DomainId){return new Set(state.openings.filter(r=>r.domain===domain).map(r=>r.itemId));}
export function placementCopy(item:DomainCollectible){return item.machine?'Use on compatible equipment, or place as a nonfunctional display.':`A ${item.mount==='counter'?'countertop':item.mount} piece for your restaurant.`;}
