import {RECIPE_BY_ID} from './content';
export const SERVER_PRIORITIES={balanced:'Balance orders, delivery and clearing.',serve:'Deliver ready meals first.',clear:'Clear finished tables first.'} as const;
export type ServerPriority=keyof typeof SERVER_PRIORITIES;
export const SIGNATURE_STYLES={cream:'#ead8b7',cherry:'#b94e43',sage:'#719884'} as const;
export interface SignatureDish {version:1;recipeId:string;name:string;style:keyof typeof SIGNATURE_STYLES}
export type Introduction='controls'|'report'|'crew'|'signature'|'quiet'|'community'|'discovery'|'project';
export const INTRODUCTIONS:Introduction[]=['controls','report','crew','signature','quiet','community','discovery','project'];
export interface PersonalTouches {communityPlaque?:boolean;version:1;signature:SignatureDish|null;introductions:Introduction[];lastSuggestionVisit:string|null;discoveries:string[]}
export const newPersonalTouches=():PersonalTouches=>({version:1,signature:null,introductions:[],lastSuggestionVisit:null,discoveries:[]});
export function cleanPersonalName(raw:string,max:number):string{return raw.normalize('NFC').replace(/[\p{Cc}\p{Cf}<>]/gu,'').trim().slice(0,max);}
export function validSignature(value:unknown):value is SignatureDish {const s=value as SignatureDish;return !!s&&s.version===1&&Object.hasOwn(RECIPE_BY_ID,s.recipeId)&&typeof s.name==='string'&&s.name.length>0&&s.name===cleanPersonalName(s.name,24)&&Object.hasOwn(SIGNATURE_STYLES,s.style);}
export function validPersonalTouches(p:PersonalTouches):boolean{return p?.version===1&&(p.communityPlaque===undefined||typeof p.communityPlaque==='boolean')&&(p.signature===null||validSignature(p.signature))&&Array.isArray(p.introductions)&&p.introductions.length<=8&&p.introductions.every(id=>INTRODUCTIONS.includes(id))&&(p.lastSuggestionVisit===null||typeof p.lastSuggestionVisit==='string'&&p.lastSuggestionVisit.length<=160)&&Array.isArray(p.discoveries)&&p.discoveries.length<=4&&p.discoveries.every(id=>['window_garden','coffee_pie','welcome_bear','radio_mascot'].includes(id));}
export function dishPresentationName(id:string,signature?:SignatureDish|null):string{return signature?.recipeId===id?`${signature.name} · ${RECIPE_BY_ID[id]?.name??id}`:RECIPE_BY_ID[id]?.name??id;}
