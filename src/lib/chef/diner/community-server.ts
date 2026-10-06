import 'server-only';
import {dinerDb,dinerPlayer,dinerFingerprint,dinerServerEnabled} from './server';
import {requireDinerWalletSession} from './wallet-auth-server';
import {createCommunityAttempt,replayCommunity,communityMealIds,PICNIC,type CommunityAttempt} from './community-feast';
import {validateRankedEnvelope,RANKED_RULES} from './ranked-rally';
import {DinerAuthorityError} from './authority';
const enabled=()=>process.env.DINER_COMMUNITY_ENABLED==='true'&&process.env.DINER_COMMUNITY_VERIFIED==='true'&&dinerServerEnabled();
const response=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const unavailable=()=>new DinerAuthorityError('community_unavailable','The picnic kitchen is not ready yet. Your restaurant is unchanged.',503);
async function body(req:Request){const reader=req.body?.getReader();if(!reader)throw new DinerAuthorityError('invalid_input','Send cooking actions.');let bytes=0,text='';const decoder=new TextDecoder();while(true){const c=await reader.read();if(c.done)break;bytes+=c.value.byteLength;if(bytes>RANKED_RULES.maxBytes){await reader.cancel();throw new DinerAuthorityError('too_large','Send a shorter cooking batch.',413);}text+=decoder.decode(c.value,{stream:true});}text+=decoder.decode();try{return JSON.parse(text);}catch{throw new DinerAuthorityError('invalid_input','Send valid cooking actions.');}}
export async function communityEndpoint(req:Request,mode:'status'|'start'|'current'|'commands'|'claim'){
 try{
  if(!enabled()){if(mode==='status')return response({ok:true,enabled:false});throw unavailable();}
  const db=dinerDb(),now=Date.now(),event=await db.from('diner_community_events').select('meals').eq('id',PICNIC.id).maybeSingle();if(event.error||!event.data){if(mode==='status')return response({ok:true,enabled:false});throw unavailable();}
  const aggregate={eventId:PICNIC.id,name:PICNIC.name,total:event.data.meals,goal:PICNIC.goal};
  if(mode==='status')return response({ok:true,enabled:true,...aggregate});
  const player=await dinerPlayer(req),token=req.headers.get('authorization')!.slice(7),{wallet}=await requireDinerWalletSession(db,token,player);
  const progress=async()=>{const [meals,claim]=await Promise.all([db.from('diner_community_meals').select('id',{count:'exact',head:true}).eq('event_id',PICNIC.id).eq('wallet',wallet),db.from('diner_community_entitlements').select('event_id').eq('event_id',PICNIC.id).eq('wallet',wallet).maybeSingle()]);if(meals.error||claim.error)throw unavailable();return {personal:meals.count??0,entitled:!!claim.data};};
  if(mode==='current'){const current=await db.from('diner_community_attempts').select('record').eq('player_id',player).eq('status','active').maybeSingle();if(current.error)throw unavailable();return response({ok:true,enabled:true,...aggregate,...await progress(),attempt:current.data?.record??null});}
  if(mode==='claim'){const raw=await body(req);if(!raw||Object.keys(raw).length)throw new DinerAuthorityError('invalid_claim','The server checks the picnic reward.');const claim=await db.rpc('diner_community_claim',{p_player:player,p_wallet:wallet});if(claim.error)throw unavailable();return response({ok:true,...aggregate,...await progress(),entitled:claim.data===true});}
  const raw=await body(req);
  if(mode==='start'){if(!raw||Object.keys(raw).some(k=>k!=='id'))throw new DinerAuthorityError('invalid_start','Starting needs only a request ID.');const record=createCommunityAttempt(raw.id,wallet,now),started=await db.rpc('diner_community_start',{p_player:player,p_wallet:wallet,p_record:record});if(started.error)throw unavailable();return response({ok:true,attempt:started.data,...aggregate,...await progress()});}
  const envelope=validateRankedEnvelope(raw),fingerprint=dinerFingerprint({attemptId:envelope.attemptId,revision:envelope.revision,commands:envelope.commands});
  const [receipt,current]=await Promise.all([db.from('diner_community_commands').select('fingerprint,attempt_id').eq('player_id',player).eq('command_id',envelope.id).maybeSingle(),db.from('diner_community_attempts').select('record').eq('player_id',player).eq('id',envelope.attemptId).maybeSingle()]);
  if(receipt.error||current.error)throw unavailable();if(!current.data)throw new DinerAuthorityError('not_found','This wallet has no such picnic attempt.',404);
  if(receipt.data){if(receipt.data.fingerprint!==fingerprint||receipt.data.attempt_id!==envelope.attemptId)throw new DinerAuthorityError('id_reused','This request ID belongs to other inputs.',409);return response({ok:true,attempt:current.data.record,duplicate:true,...await progress()});}
  const replay=replayCommunity(current.data.record as CommunityAttempt,envelope,now),commit=await db.rpc('diner_community_commit',{p_player:player,p_command:envelope.id,p_fingerprint:fingerprint,p_expected_revision:envelope.revision,p_record:replay.attempt,p_commands:replay.accepted,p_meals:communityMealIds(replay.attempt)});
  if(commit.error)throw new DinerAuthorityError('save_uncertain','Retry the same saved request; its meals may already be counted.',503);if(!commit.data?.ok)throw new DinerAuthorityError('community_conflict','This attempt changed in another window.',409);
  return response({ok:true,attempt:replay.attempt,interrupted:replay.interrupted,...await progress()});
 }catch(error){return response({ok:false,error:error instanceof DinerAuthorityError?error.message:'The picnic kitchen could not be reached.',...(error instanceof DinerAuthorityError&&error.retryAfterMs?{retryAfterMs:error.retryAfterMs}:{})},error instanceof DinerAuthorityError?error.status:503);}
}
