import {CAMPAIGN_PRIZES,type CampaignPeriod} from '../campaign-view';
import type {QualificationWeek} from './competition';

/** Operator review only: no transfers, frozen awards, or changes to Reporter.
 * Supply server-ledger totals and reconciled Strategy qualification, never
 * client-submitted wins or the classic ledger's battle_points. */
export function battleAwardReview(period:CampaignPeriod,rows:{wallet:string;points:number;weeks:[QualificationWeek,QualificationWeek];excluded:boolean}[]){
 const wallets=new Set<string>();
 const relevant=(r:typeof rows[number])=>period==='final'?r.weeks: [r.weeks[period==='week1'?0:1]];
 for(const r of rows){if(!/^0x[0-9a-f]{40}$/.test(r.wallet)||wallets.has(r.wallet)||!Number.isSafeInteger(r.points)||r.points<0)throw Error('Invalid or duplicate ledger row');wallets.add(r.wallet);if(!r.excluded&&relevant(r).some(w=>w.days===null||w.status==='checking'||w.status==='upcoming'||w.status==='unavailable'))throw Error('Qualification is not ready for award review');}
 const ranked=rows.filter(r=>!r.excluded&&relevant(r).every(w=>w.status==='qualified')).sort((a,b)=>b.points-a.points||a.wallet.localeCompare(b.wallet)).map(r=>({wallet:r.wallet,score:r.points,rank:0,prizeCents:0}));
 const prizes=(period==='final'?CAMPAIGN_PRIZES.battles.final:CAMPAIGN_PRIZES.battles.weekly).map(n=>n*100);
 for(let i=0;i<ranked.length;){let end=i+1;while(end<ranked.length&&ranked[end].score===ranked[i].score)end++;const count=end-i,pool=prizes.slice(i,end).reduce((a,b)=>a+b,0),each=Math.floor(pool/count),extra=pool%count;for(let j=i;j<end;j++){ranked[j].rank=i+1;ranked[j].prizeCents=each+(j-i<extra?1:0)}i=end;}
 return {purpose:'award-review-only' as const,transfersExecuted:false,period,totalCents:ranked.reduce((n,r)=>n+r.prizeCents,0),rows:ranked};
}
