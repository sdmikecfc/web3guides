import {DOMAIN_IDS,type DomainId} from './domain-worlds';
import type {DecorDef} from './collections';
/** Earned architecture and ordinary furnishings, never NFT/pack pool entries. */
export const DOMAIN_KIT_PARTS=['wall','counter','chair','stool','table','plant','sign','lamp','feature'] as const;
export type DomainKitPart=typeof DOMAIN_KIT_PARTS[number];
export type DomainRoomAppearance={version:1;floor?:DomainId;pieces:Record<string,{domain:DomainId;part:DomainKitPart}>};
export const domainKitAsset=(domain:DomainId,part:DomainKitPart)=>`domain_kit_${domain}_${part}`;
export const DOMAIN_KIT_ASSETS=new Set(DOMAIN_IDS.flatMap(d=>DOMAIN_KIT_PARTS.map(p=>domainKitAsset(d,p))));
export const DOMAIN_KIT_DECOR:DecorDef[]=DOMAIN_IDS.flatMap(domain=>[
 {id:domainKitAsset(domain,'plant'),name:domain==='smoothie'?'Fruit Club palm':'House brass planter',footprint:[1,1],price:0,setId:`journey_${domain}`,memento:true},
 {id:domainKitAsset(domain,'feature'),name:domain==='gochujang'?'Fireant welcome host':domain==='smoothie'?'Fruit market display':'Velvet Cellar tasting cabinet',footprint:[1,1],price:0,setId:`journey_${domain}`,memento:true},
 {id:domainKitAsset(domain,'sign'),name:domain==='gochujang'?'Fireant Ramyeon Club sign':domain==='smoothie'?'Tropical Fruit Club sign':'Velvet Cellar sign',footprint:[4,1],price:0,setId:`journey_${domain}`,memento:true,wall:true},
 {id:domainKitAsset(domain,'lamp'),name:domain==='gochujang'?'Spice Street lantern':'House brass pendant',footprint:[1,1],price:0,setId:`journey_${domain}`,memento:true,wall:true},
]);
