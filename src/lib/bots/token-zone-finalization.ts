import {ZONE_RULES,ZONE_CAMPAIGN,DAY,REWARD_ZONES,qualificationDays,tokenAwards,type ZoneAsset,type ZoneScore} from './token-zones';

/** Shared by the operator's dry run and finalization. Never receives public ranks. */
export function finalAwardsFromSnapshot(snapshot:any,now=Date.now()){
 const c=snapshot?.campaign;
 if(c?.id!==ZONE_CAMPAIGN||c.rules!==ZONE_RULES||c.state!=='closed'||!c.complete||!c.financial_complete||c.disputes!==0||now<Date.parse(c.ends_at)+2*DAY||!Number.isFinite(Date.parse(c.confirmed_through))||Date.parse(c.confirmed_through)<Date.parse(c.ends_at))throw Error('Reconciliation is incomplete');
 if(!Array.isArray(snapshot.assets)||snapshot.assets.length!==9||!Array.isArray(snapshot.participants))throw Error('Incomplete snapshot');
 const assets:ZoneAsset[]=snapshot.assets.map((a:any)=>({symbol:a.symbol,chainId:a.chain_id,address:a.address,decimals:a.decimals,fundedUnits:a.funded_units,verifiedAt:a.verified_at,liquidPair:a.liquid_pair,priceUsd:a.price_usd,priceAt:a.price_at}));
 if(new Set(assets.map(a=>a.symbol)).size!==9||REWARD_ZONES.some(z=>!assets.some(a=>a.symbol===z.symbol)))throw Error('Incomplete reward basket');
 const rows:ZoneScore[]=snapshot.participants.map((p:any)=>({id:p.participant,name:p.participant,qualified:qualificationDays(p.times,c.starts_at,c.ends_at).some(n=>n>=3),scores:{volume:p.volume,roi:p.roi,profit:p.profit,battles:p.battles}}));
 return tokenAwards(snapshot.volume,assets,rows).sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.id.localeCompare(b.id));
}
