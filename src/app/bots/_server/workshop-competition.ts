import 'server-only';
import { botsDb, Refusal, type BotsDb } from './db';
import { sessionFromRequest } from './session';
import { campaignEnrollment } from './campaign-enrollment';
import { sameOrigin } from './workshop-journey';
import { emptyCompetition, strategyQualification, type WorkshopCompetition } from '@/lib/bots/workshop8/competition';
import { campaignSnapshotAvailable, type CampaignPeriod, type CampaignStanding } from '@/lib/bots/campaign-view';
import { reporterQualification } from '@/lib/bots/workshop8/reporter-evidence';
export const competitionEnabled=()=>process.env.BOTS_WORKSHOP_COMPETITION==='1'&&process.env.BOTS_WORKSHOP_JOURNEY==='1';

export async function workshopCompetition(req:Request,period:CampaignPeriod):Promise<{competition:WorkshopCompetition;standings:CampaignStanding[];sourceCampaignId:string|null}> {
 const auth=sessionFromRequest(req),out=emptyCompetition(!!auth,competitionEnabled()),result={competition:out,standings:[] as CampaignStanding[],sourceCampaignId:null as string|null};
 if(!out.enabled)return result;
 try {
  const db=botsDb(),{data:c,error}=await db.from('mk8_competitions').select('id,campaign_id,state,starts_at,ends_at,rules,pool_cents').eq('id','workshop-competition-1').single();
  if(error||!c)return result;
  result.sourceCampaignId=c.campaign_id;out.available=true;out.state=c.state;out.startsAt=c.starts_at;out.endsAt=c.ends_at;out.updatedAt=new Date().toISOString();
  if(c.state==='draft'){
   out.startsAt=null;out.endsAt=null;out.enrollment='not_open';out.weeks=[{days:null,status:'upcoming'},{days:null,status:'upcoming'}];out.nextAction='play';return result;
  }
  const [entry,scores,snapshot]=await Promise.all([
   auth?db.from('mk8_competition_entries').select('entered_at').eq('competition_id',c.id).eq('wallet',auth.wallet).maybeSingle():Promise.resolve({data:null,error:null}),
   db.rpc('mk8_competition_scores',{p_id:c.id,p_wallet:auth?.wallet??null,p_period:period}),
   db.from('battle_bots_campaign_snapshots').select('payload,frozen').eq('campaign_id',c.campaign_id).eq('period_key',period).order('as_of',{ascending:false}).limit(1).maybeSingle()
  ]);
  out.enrollment=entry.error?'unavailable':entry.data?'entered':'not_entered';
  if(!scores.error){result.standings=Array.isArray(scores.data?.standings)?scores.data.standings:[];if(auth&&entry.data){out.points=scores.data.points;out.attemptsRemaining=scores.data.remaining;out.categories.battles={score:out.points,rank:scores.data.rank??null,provisional:true};}}
  else out.available=false;
  const payload=snapshot.data?.payload;
  if(auth&&!snapshot.error&&campaignSnapshotAvailable(payload,c.campaign_id,period,snapshot.data?.frozen===true)){
   const own=payload.players?.[auth.wallet];
   if(own?.strategyEvidence)out.weeks=strategyQualification(own.strategyEvidence,c.starts_at,c.ends_at);
   else {
    const evidence=await db.rpc('mk8_reporter_evidence',{p_campaign:c.campaign_id,p_wallet:auth.wallet});
    if(!evidence.error)out.weeks=reporterQualification(evidence.data,c.campaign_id,auth.wallet,c.starts_at,c.ends_at).weeks;
   }
   out.finalQualified=out.weeks.some(w=>w.days===null)?null:out.weeks.every(w=>w.status==='qualified');
   for(const category of ['roi','profit'] as const){
    const row=Array.isArray(payload.standings?.[category])?payload.standings[category].find((r:any)=>r.wallet===auth.wallet):null;
    if(row&&Number.isFinite(row.score)&&Number.isInteger(row.rank)&&row.rank>0)out.categories[category]={score:row.score,rank:row.rank,provisional:!(snapshot.data?.frozen&&row.status==='frozen')};
   }
  }
  out.nextAction=!auth?'connect':out.enrollment==='not_entered'?'enroll':out.enrollment==='unavailable'?'check':'fight';
  if(c.state!=='active'||Date.now()<Date.parse(c.starts_at)||Date.now()>=Date.parse(c.ends_at))out.nextAction='play';
  return result;
 }catch{return {...result,competition:{...out,available:false,state:'unavailable',nextAction:'check'}}}
}

export async function enrollWorkshopCompetition(req:Request){
 sameOrigin(req);
 if(!competitionEnabled())throw new Refusal(409,'Competition enrollment is not open.');
 const auth=sessionFromRequest(req);if(!auth)throw new Refusal(401,'Sign in to your wallet to enter.');
 if(auth.isTest)throw new Refusal(403,'Test accounts cannot enter the cash competition.');
 const db=botsDb(),{data:c,error}=await db.from('mk8_competitions').select('id,campaign_id,state,starts_at,ends_at').eq('id','workshop-competition-1').single();
 if(error)throw new Refusal(503,'Competition information is unavailable. Try again.');
 if(!c||c.state!=='active'||Date.now()<Date.parse(c.starts_at)||Date.now()>=Date.parse(c.ends_at))throw new Refusal(409,'Start date to be announced. Competition enrollment has not opened.');
 const {data:prior,error:priorError}=await db.from('mk8_competition_entries').select('entered_at').eq('competition_id',c.id).eq('wallet',auth.wallet).maybeSingle();
 if(priorError)throw new Refusal(503,'Enrollment could not be checked. Retry safely.');
 if(prior)return {ok:true,...await workshopCompetition(req,'final')};
 // Inspect the existing service's campaign before requesting any mutation.
 const current=await campaignEnrollment(db,auth.wallet);
 if(current.campaignId!==c.campaign_id||current.campaignStatus!=='active')throw new Refusal(503,'Competition setup is being checked.');
 const {data:player,error:playerError}=await db.from('battle_bots_players').select('is_operator,is_test').eq('wallet',auth.wallet).maybeSingle();
 if(playerError)throw new Refusal(503,'Account eligibility could not be checked.');
 if(player?.is_operator||player?.is_test)throw new Refusal(403,'This account cannot enter the cash competition.');
 const enrolled=await campaignEnrollment(db,auth.wallet,true,auth.isTest);
 if(enrolled.campaignId!==c.campaign_id||enrolled.campaignStatus!=='active')throw new Refusal(503,'Enrollment could not be confirmed. Retry safely.');
 const {data:confirmed,error:confirmError}=await db.from('battle_bots_campaign_enrollments').select('snapshot_status').eq('campaign_id',c.campaign_id).eq('wallet',auth.wallet).maybeSingle();
 if(confirmError||!confirmed)throw new Refusal(503,'Enrollment is not confirmed yet. Retry safely.');
 const {error:saveError}=await db.rpc('mk8_competition_enter',{p_id:c.id,p_wallet:auth.wallet,p_campaign:c.campaign_id});
 if(saveError)throw new Refusal(503,'Enrollment could not be saved. Retry safely.');
 return {ok:true,...await workshopCompetition(req,'final')};
}
