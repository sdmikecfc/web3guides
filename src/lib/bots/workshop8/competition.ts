import { CAMPAIGN_PRIZES, type CampaignPeriod } from '../campaign-view';

export const COMPETITION_RULES = 'workshop-house-1';
export const COMPETITION_POOL = Object.values(CAMPAIGN_PRIZES).reduce((sum,p) => sum + 2*p.weekly.reduce((a,b)=>a+b,0) + p.final.reduce((a,b)=>a+b,0),0);
export const COMPETITION_DRAFT_TEXT = 'Start date to be announced. Play now; competition scoring has not started.';
export type FightCompetition = { rules:string; status:'reserved'|'settled'|'not_scored'; reason:string; points:number|null; campaignId?:string; period?:'week1'|'week2' };
export type QualificationWeek = {days:number|null; status:'upcoming'|'checking'|'in_progress'|'qualified'|'ineligible'|'unavailable'};
export interface WorkshopCompetition {
 enabled:boolean; available:boolean; state:'draft'|'active'|'closed'|'frozen'|'unavailable';
 pool:number; split:{roi:number;profit:number;battles:number}; rules:string;
 startsAt:string|null; endsAt:string|null; connected:boolean;
 enrollment:'not_open'|'not_entered'|'entered'|'unavailable';
 weeks:[QualificationWeek,QualificationWeek]; finalQualified:boolean|null;
 points:number|null; attemptsRemaining:number|null; updatedAt:string|null;
 categories:Record<'roi'|'profit'|'battles',{score:number|null;rank:number|null;provisional:boolean}>;
 nextAction:'play'|'connect'|'enroll'|'check'|'fight';
}
export function emptyCompetition(connected=false,enabled=true):WorkshopCompetition {
 return {enabled,available:false,state:'unavailable',pool:COMPETITION_POOL,split:{roi:800,profit:800,battles:400},rules:COMPETITION_RULES,startsAt:null,endsAt:null,connected,enrollment:'unavailable',weeks:[{days:null,status:'unavailable'},{days:null,status:'unavailable'}],finalQualified:null,points:null,attemptsRemaining:null,updatedAt:null,categories:{roi:{score:null,rank:null,provisional:true},profit:{score:null,rank:null,provisional:true},battles:{score:null,rank:null,provisional:true}},nextAction:'check'};
}

/** Evidence contract: a complete, fresh set of canonical Strategy fills, including
 * corrected/revoked rows. Never use receipt timestamps or coin grants as trade days. */
export function strategyQualification(raw:unknown,startsAt:string,endsAt:string,now=Date.now()):[QualificationWeek,QualificationWeek] {
 const unavailable=():[QualificationWeek,QualificationWeek]=>[{days:null,status:'unavailable'},{days:null,status:'unavailable'}];
 if(!raw||typeof raw!=='object')return unavailable();
 const r=raw as Record<string,any>,start=Date.parse(startsAt),end=Date.parse(endsAt),through=Date.parse(r.confirmedThrough);
 if(r.schemaVersion!==1||r.source!=='doma_strategy'||r.complete!==true||!Array.isArray(r.fills)||!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(through)||through>now+60000||Math.min(now,end)-through>1800000)return unavailable();
 const canonical=new Map<string,any>();
 for(const f of r.fills){
  if(!f||typeof f.id!=='string'||!Number.isInteger(f.revision)||f.revision<0||!['verified','pending','revoked'].includes(f.status)||!Number.isFinite(Date.parse(f.executedAt)))return unavailable();
  const prior=canonical.get(f.id);
  if(prior&&prior.revision===f.revision&&(prior.status!==f.status||prior.executedAt!==f.executedAt))return unavailable();
  if(!prior||prior.revision<f.revision)canonical.set(f.id,f);
 }
 return [0,1].map(w=>{
  const from=start+w*7*86400000,to=Math.min(end,from+7*86400000);
  if(now<from)return {days:null,status:'upcoming'};
  const days=new Set<string>();let pending=false;
  for(const f of canonical.values()){const at=Date.parse(f.executedAt);if(at<from||at>=to||at>through)continue;if(f.status==='verified')days.add(new Date(at).toISOString().slice(0,10));if(f.status==='pending')pending=true;}
  return {days:days.size,status:days.size>=3?'qualified':pending?'checking':now>=to?'ineligible':'in_progress'};
 }) as [QualificationWeek,QualificationWeek];
}
export function competitionPeriod(start:string,completed:number):Exclude<CampaignPeriod,'final'>{return completed<Date.parse(start)+7*86400000?'week1':'week2'}
