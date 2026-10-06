import {recipePrice} from './content';
import type {CustomerType} from './types';
import type {AudienceType} from './community-customers';
export type AudienceMix=Record<AudienceType,number>;
export const DEFAULT_AUDIENCE:AudienceMix={local:100,party:0,business:0};
export const CUSTOMER_TRAITS={party:{price:1.35,walk:1,eat:1,patience:1,tip:.12},business:{price:1,walk:1.25,eat:.7,patience:.8,tip:.22},local:{price:1,walk:1,eat:1,patience:1,tip:.12}} as const;
export const audienceType=(type:CustomerType):AudienceType=>type==='party'||type==='business'?type:'local';
export const customerTraits=(type:CustomerType)=>CUSTOMER_TRAITS[audienceType(type)];
export function validAudience(raw:unknown,wins:readonly string[]):raw is AudienceMix {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;const mix=raw as AudienceMix;
  return Object.keys(mix).length===3&&['local','party','business'].every(k=>Number.isInteger(mix[k as AudienceType])&&mix[k as AudienceType]>=0&&mix[k as AudienceType]<=100)&&mix.local+mix.party+mix.business===100&&(!mix.party||wins.includes('festival'))&&(!mix.business||wins.includes('business_center'));
}
export function drawAudience(mix:AudienceMix,roll:number):CustomerType {return roll*100<mix.local?'walk_in':roll*100<mix.local+mix.party?'party':'business';}
export function businessOrder(menu:readonly string[],levels:Record<string,number>,roll:number,recent:readonly string[],price:(id:string)=>number=id=>recipePrice(id,levels[id])):string {
  const top=[...menu].sort((a,b)=>price(b)-price(a)||a.localeCompare(b)).slice(0,3);
  const avoid=recent.length>=2&&recent.at(-1)===recent.at(-2)?recent.at(-1):null;
  const weights=top.length===2?[.6,.4]:[.5,.3,.2];const options=top.map((id,i)=>({id,weight:weights[i]})).filter(x=>top.length===1||x.id!==avoid);
  let cursor=roll*options.reduce((n,x)=>n+x.weight,0);for(const x of options){cursor-=x.weight;if(cursor<0)return x.id;}return options.at(-1)!.id;
}
