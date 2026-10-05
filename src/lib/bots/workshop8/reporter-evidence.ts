import { campaignSnapshotAvailable } from '../campaign-view';
import { strategyQualification, type QualificationWeek } from './competition';

/** Read-only projection of Reporter's canonical fills, never its coin ledger.
 * A fresh full-campaign snapshot must reconcile with the current source rows.
 * Rejected attribution or an in-flight correction makes qualification unknown. */
export function reporterQualification(raw: any, campaign: string, wallet: string, start: string, end: string, now = Date.now()) {
  const unknown = { weeks: [{days:null,status:'unavailable'},{days:null,status:'unavailable'}] as [QualificationWeek,QualificationWeek], strategyFills:null as number|null, mcpFills:null as number|null, confirmedThrough:null as string|null };
  const p=raw?.snapshot, e=raw?.enrollment, own=p?.players?.[wallet];
  if (!raw || raw.truncated || !campaignSnapshotAvailable(p,campaign,'final',false,now)
    || p.campaign.startsAt!==start || p.campaign.endsAt!==end
    || e?.snapshot_status!=='ready' || e?.eligibility_status!=='eligible' || e?.is_test!==false
    || own?.snapshotStatus!=='ready' || own.accountingPending!==false || own.exclusion
    || own.pendingFillCount!==0 || !Number.isInteger(own.confirmedFillCount) || !Number.isInteger(own.confirmedTradeDays)
    || !Array.isArray(raw.fills) || !Number.isFinite(Date.parse(e.credit_from_at))) return unknown;
  const seen=new Map<string,string>(), days=new Set<string>(), fills:any[]=[];
  let mcp=0, latest=-Infinity;
  for(const f of raw.fills){
    const at=Date.parse(f.executedAt), canonical=JSON.stringify(f);
    if(typeof f.id!=='string'||!f.id||!['keeper','doma_mcp'].includes(f.source)||f.verified!==true
      ||!Number.isFinite(at)||at<Math.max(Date.parse(start),Date.parse(e.credit_from_at))||at>=Math.min(Date.parse(end),Date.parse(p.provenance.confirmedThrough)))return unknown;
    if(seen.has(f.id)){if(seen.get(f.id)!==canonical)return unknown;continue;}
    seen.set(f.id,canonical);days.add(new Date(at).toISOString().slice(0,10));latest=Math.max(latest,at);
    if(f.source==='keeper')fills.push({id:f.id,revision:0,status:'verified',executedAt:f.executedAt});else mcp++;
  }
  if(seen.size!==own.confirmedFillCount||days.size!==own.confirmedTradeDays
    || (seen.size ? Date.parse(own.lastConfirmedFillAt)!==latest : own.lastConfirmedFillAt!==null))return unknown;
  return {weeks:strategyQualification({schemaVersion:1,source:'doma_strategy',complete:true,confirmedThrough:p.provenance.confirmedThrough,fills},start,end,now),strategyFills:fills.length,mcpFills:mcp,confirmedThrough:p.provenance.confirmedThrough as string};
}
