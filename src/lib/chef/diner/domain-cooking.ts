/** Finite machine contents, separate from individual serving vessels. */
export type DomainBatch={version:1;recipeId:'steamed_mandu'|'house_red';total:number;remaining:number;createdTick:number;ready:boolean};
export const DOMAIN_COOKING_VERSION=1 as const;
export const DOMAIN_MACHINE_IDS=['steamer','griddle','juicer','wine_station'] as const;
export function domainBatchSpec(recipeId:string,station:string):{total:number;hot:boolean}|null{
  return recipeId==='steamed_mandu'&&station==='steamer'?{total:3,hot:true}:recipeId==='house_red'&&station==='wine_station'?{total:6,hot:false}:null;
}
export function createDomainBatch(recipeId:string,station:string,tick:number):DomainBatch|null{
  const spec=domainBatchSpec(recipeId,station);return spec?{version:1,recipeId:recipeId as DomainBatch['recipeId'],total:spec.total,remaining:spec.total,createdTick:tick,ready:false}:null;
}
export function validDomainBatch(raw:unknown,station:string):raw is DomainBatch{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
  const b=raw as DomainBatch,spec=domainBatchSpec(b.recipeId,station);
  const keys=['version','recipeId','total','remaining','createdTick','ready'];
  return !!spec&&Object.keys(b).length===keys.length&&keys.every(key=>Object.hasOwn(b,key))&&b.version===1&&b.total===spec.total&&Number.isSafeInteger(b.remaining)&&b.remaining>=1&&b.remaining<=b.total&&Number.isSafeInteger(b.createdTick)&&b.createdTick>=0&&typeof b.ready==='boolean'&&(b.ready||b.remaining===b.total);
}
export function takeDomainPortion(batch:DomainBatch):DomainBatch|null{
  if(!batch.ready)throw new Error('This batch is not ready.');
  return batch.remaining>1?{...batch,remaining:batch.remaining-1}:null;
}
