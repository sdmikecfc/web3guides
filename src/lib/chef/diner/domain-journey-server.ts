import 'server-only';
import {dinerDb,dinerPlayer,dinerFingerprint,dinerServerEnabled} from './server';
import {requireDinerWalletSession} from './wallet-auth-server';
import {DOMAIN_SEASONS,journeyEntryOpen} from './domain-seasons';
import {isDomainId} from './domain-worlds';
import {createDomainJourney,replayDomainJourney,validateJourneyEnvelope,type DomainJourneyAttempt} from './domain-journeys';
import {DinerAuthorityError} from './authority';
const enabled=()=>process.env.DINER_DOMAIN_JOURNEYS_ENABLED==='true'&&process.env.DINER_DOMAIN_JOURNEYS_VERIFIED==='true'&&dinerServerEnabled();
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const unavailable=()=>new DinerAuthorityError('journey_unavailable','Domain journeys are being prepared. Your restaurant is unchanged.',503);
async function readBody(req:Request){const reader=req.body?.getReader();if(!reader)throw new DinerAuthorityError('invalid_input','Send journey actions.');const decoder=new TextDecoder();let bytes=0,text='';for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>48000){await reader.cancel();throw new DinerAuthorityError('too_large','Send a smaller batch of actions.',413);}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();try{return JSON.parse(text);}catch{throw new DinerAuthorityError('invalid_input','Send valid journey actions.');}}
export async function domainJourneyEndpoint(req:Request,mode:'status'|'start'|'current'|'commands'|'rewards'){
 try{
  if(!enabled()){if(mode==='status')return response({ok:true,enabled:false,seasons:[]});throw unavailable();}
  const db=dinerDb(),now=Date.now();
  if(mode==='status')return response({ok:true,enabled:true,seasons:DOMAIN_SEASONS.map(s=>({id:s.id,domain:s.domain,startsAt:s.startsAt,endsAt:s.endsAt,open:journeyEntryOpen(s,now)}))});
  const player=await dinerPlayer(req),token=req.headers.get('authorization')!.slice(7),{wallet}=await requireDinerWalletSession(db,token,player);
  if(mode==='rewards'){const result=await db.from('diner_domain_journey_rewards').select('domain,milestone,receipt_key,earned_at').eq('wallet',wallet);if(result.error)throw unavailable();return response({ok:true,wallet,rewards:result.data});}
  if(mode==='current'){const result=await db.from('diner_domain_journey_attempts').select('record').eq('player_id',player).eq('wallet',wallet).eq('status','active').maybeSingle();if(result.error)throw unavailable();return response({ok:true,attempt:result.data?.record??null});}
  const raw=await readBody(req);
  if(mode==='start'){
   if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['id','domain','practice'].includes(k))||!isDomainId(raw.domain)||raw.practice!==undefined&&typeof raw.practice!=='boolean')throw new DinerAuthorityError('invalid_input','Choose a domain journey.');
   const season=DOMAIN_SEASONS.find(s=>s.domain===raw.domain&&journeyEntryOpen(s,now));if(!season)throw new DinerAuthorityError('season_closed','This journey is not accepting new attempts.',409);
   const record=createDomainJourney(raw.id,wallet,season,now,raw.practice===true),result=await db.rpc('diner_domain_journey_start',{p_player:player,p_wallet:wallet,p_record:record});if(result.error)throw unavailable();return response({ok:true,attempt:result.data});
  }
  const envelope=validateJourneyEnvelope(raw),fingerprint=dinerFingerprint({attemptId:envelope.attemptId,revision:envelope.revision,commands:envelope.commands});
  const [receipt,current]=await Promise.all([db.from('diner_domain_journey_commands').select('attempt_id,fingerprint').eq('player_id',player).eq('command_id',envelope.id).maybeSingle(),db.from('diner_domain_journey_attempts').select('record').eq('player_id',player).eq('wallet',wallet).eq('id',envelope.attemptId).maybeSingle()]);
  if(receipt.error||current.error)throw unavailable();if(!current.data)throw new DinerAuthorityError('not_found','This wallet has no such journey.',404);
  if(receipt.data){if(receipt.data.fingerprint!==fingerprint||receipt.data.attempt_id!==envelope.attemptId)throw new DinerAuthorityError('id_reused','This request ID belongs to other actions.',409);return response({ok:true,attempt:current.data.record,duplicate:true});}
  const replay=replayDomainJourney(current.data.record as DomainJourneyAttempt,envelope,now),commit=await db.rpc('diner_domain_journey_commit',{p_player:player,p_command:envelope.id,p_fingerprint:fingerprint,p_expected_revision:envelope.revision,p_record:replay.attempt,p_commands:replay.accepted});
  if(commit.error)throw new DinerAuthorityError('save_uncertain','Retry these saved actions. They may already have been accepted.',503);
  if(!commit.data?.ok)throw new DinerAuthorityError('journey_conflict','The journey changed in another window.',409);
  // A racing retry returns the stored canonical record, never our stale prediction.
  return response({ok:true,attempt:commit.data.record??replay.attempt,duplicate:!!commit.data.duplicate,interrupted:replay.interrupted});
 }catch(error){return response({ok:false,error:error instanceof DinerAuthorityError?error.message:'The journey could not be reached.',...(error instanceof DinerAuthorityError&&error.retryAfterMs?{retryAfterMs:error.retryAfterMs}:{})},error instanceof DinerAuthorityError?error.status:503);}
}
