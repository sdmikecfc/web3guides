import 'server-only';
import {NextResponse} from 'next/server';
import {dinerDb,dinerPlayer,dinerFingerprint,dinerServerEnabled} from './server';
import {requireDinerWalletSession} from './wallet-auth-server';
import {createRankedAttempt,replayRanked,validateRankedEnvelope,RANKED_RULES,type RankedAttempt} from './ranked-rally';
import {rallyWeek} from './rally';
import {DinerAuthorityError} from './authority';
export const rankedEnabled=()=>process.env.DINER_RANKED_RALLY_ENABLED==='true'&&dinerServerEnabled();
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
const unavailable=()=>new DinerAuthorityError('ranked_unavailable','Verified rallies are being prepared. Your local practice and restaurant remain available.',503);
async function body(req:Request){const text=await req.text();if(text.length>RANKED_RULES.maxBytes)throw new DinerAuthorityError('too_large','Send a shorter input batch.',413);try{return JSON.parse(text);}catch{throw new DinerAuthorityError('invalid_json','Send valid rally inputs.');}}
export async function rankedEndpoint(req:Request,mode:'start'|'current'|'commands'|'standings'){
 try{
  if(!rankedEnabled()){if(mode==='standings')return response({ok:true,enabled:false,weekId:rallyWeek(Date.now()),standings:[]});throw unavailable();}
  const db=dinerDb(),now=Date.now();
  if(mode==='standings'){const week=rallyWeek(now),rows=await db.rpc('diner_ranked_standings',{p_week:week});if(rows.error)throw unavailable();return response({ok:true,enabled:true,weekId:week,standings:rows.data});}
  const player=await dinerPlayer(req),token=req.headers.get('authorization')!.slice(7),{wallet}=await requireDinerWalletSession(db,token,player);
  const entitlements=await db.from('diner_ranked_entitlements').select('first_completion').eq('player_id',player).maybeSingle();if(entitlements.error)throw unavailable();
  const profile=async()=>{const bests=await db.from('diner_ranked_bests').select('week_id,score,completed').eq('player_id',player).order('week_id',{ascending:false}).limit(20);if(bests.error)throw unavailable();return {bests:bests.data,trophy:!!entitlements.data};};
  if(mode==='current'){const row=await db.from('diner_ranked_attempts').select('record').eq('player_id',player).eq('status','active').maybeSingle();if(row.error)throw unavailable();return response({ok:true,attempt:row.data?.record??null,...await profile()});}
  const raw=await body(req);
  if(mode==='start'){if(!raw||typeof raw!=='object'||Object.keys(raw).some(k=>k!=='id'))throw new DinerAuthorityError('invalid_start','Starting needs only a request ID.');const record=createRankedAttempt(raw.id,wallet,now),started=await db.rpc('diner_ranked_start',{p_player:player,p_wallet:wallet,p_record:record});if(started.error)throw unavailable();return response({ok:true,attempt:started.data,...await profile()});}
  const envelope=validateRankedEnvelope(raw),fingerprint=dinerFingerprint({attemptId:envelope.attemptId,revision:envelope.revision,commands:envelope.commands});
  const [receipt,current]=await Promise.all([db.from('diner_ranked_commands').select('fingerprint,attempt_id').eq('player_id',player).eq('command_id',envelope.id).maybeSingle(),db.from('diner_ranked_attempts').select('record').eq('player_id',player).eq('id',envelope.attemptId).maybeSingle()]);
  if(receipt.error||current.error)throw unavailable();if(!current.data)throw new DinerAuthorityError('rally_not_found','This wallet has no such attempt.',404);
  if(receipt.data){if(receipt.data.fingerprint!==fingerprint||receipt.data.attempt_id!==envelope.attemptId)throw new DinerAuthorityError('id_reused','This action ID was already used for different inputs.',409);return response({ok:true,attempt:current.data.record,duplicate:true});}
  const replay=replayRanked(current.data.record as RankedAttempt,envelope,now);
  const commit=await db.rpc('diner_ranked_commit',{p_player:player,p_command:envelope.id,p_fingerprint:fingerprint,p_expected_revision:envelope.revision,p_record:replay.attempt,p_commands:replay.accepted});
  if(commit.error)throw new DinerAuthorityError('save_uncertain','Retry this same saved request; its result may already be recorded.',503);
  if(!commit.data?.ok)throw new DinerAuthorityError('rally_conflict','This attempt changed in another window. Refresh it.',409);
  return response({ok:true,attempt:replay.attempt,interrupted:replay.interrupted,trophy:replay.attempt.status==='complete'&&replay.attempt.service.phase==='complete'||!!entitlements.data});
 }catch(error){return response({ok:false,code:error instanceof DinerAuthorityError?error.code:'ranked_unavailable',error:error instanceof DinerAuthorityError?error.message:'The verified rally could not be reached.',...(error instanceof DinerAuthorityError&&error.retryAfterMs?{retryAfterMs:error.retryAfterMs}:{})},error instanceof DinerAuthorityError?error.status:503);}
}
