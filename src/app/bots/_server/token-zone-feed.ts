import 'server-only';
import {createHash} from 'node:crypto';
import {Refusal, type BotsDb} from './db';
import {ZONE_CAMPAIGN, ZONE_RULES, decimalUnits} from '@/lib/bots/token-zones';

const address=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v)&&!/^0x0{40}$/.test(v);
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===(v.includes('.')?v:v.replace('Z','.000Z'));
const score=(v:unknown)=>v===null||(typeof v==='string'&&/^-?\d{1,40}(\.\d{1,36})?$/.test(v));
const evidence=(v:unknown)=>typeof v==='string'&&v.trim().length>0&&v.length<=1000;
const invalid=():never=>{throw new Refusal(400,'Invalid trade batch. Use the documented contract.');};

/** Shared by ingestion and the read-only rehearsal; neither can accept a different wire format. */
export async function readZoneBatch(req:Request){
 if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new Refusal(415,'Send application/json.');
 const reader=req.body?.getReader();if(!reader)throw new Refusal(400,'Missing batch.');let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>2_000_000){await reader.cancel();throw new Refusal(413,'Batch exceeds 2 MB.');}chunks.push(r.value);}}finally{reader.releaseLock();}
 let p:any;try{p=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{invalid();}
 if(!p||p.schemaVersion!==1||p.rules!==ZONE_RULES||p.campaignId!==ZONE_CAMPAIGN||typeof p.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.requestId)||!date(p.coverageFrom)||!date(p.confirmedThrough)||Date.parse(p.coverageFrom)>Date.parse(p.confirmedThrough)||Date.parse(p.confirmedThrough)>Date.now()+60_000||typeof p.complete!=='boolean'||typeof p.financialComplete!=='boolean'||!Array.isArray(p.fills)||p.fills.length>2000||!Array.isArray(p.financials)||p.financials.length>20000)invalid();
 const fills=new Set<string>(),participants=new Set<string>();
 for(const f of p.fills){
  if(!f||f.chainId!==97477||typeof f.economicId!=='string'||!f.economicId.trim()||f.economicId.length>160||!Number.isSafeInteger(f.revision)||f.revision<1||!address(f.wallet)||!address(f.domainToken)||!address(f.quoteToken)||f.domainToken===f.quoteToken||typeof f.transactionHash!=='string'||!/^0x[0-9a-f]{64}$/.test(f.transactionHash)||!date(f.executedAt)||Date.parse(f.executedAt)>Date.parse(p.confirmedThrough)||typeof f.volumeUsd!=='string'||!/^\d{1,34}(\.\d{1,6})?$/.test(f.volumeUsd)||decimalUnits(f.volumeUsd)<=BigInt(0)||!['verified','revoked'].includes(f.status)||!['strategy','agent_wallet'].includes(f.source)||!evidence(f.evidence)||fills.has(f.economicId))invalid();
  fills.add(f.economicId);
 }
 if(p.financialComplete&&(typeof p.methodology!=='string'||!p.methodology.trim()||p.methodology.length>160))invalid();
 if(!p.financialComplete&&p.financials.length)invalid(); // Otherwise SQL deliberately ignores these rows.
 for(const f of p.financials){if(!f||typeof f.participant!=='string'||!/^\d{1,30}$/.test(f.participant)||!score(f.roi)||!score(f.profit)||!evidence(f.evidence)||participants.has(f.participant))invalid();participants.add(f.participant);}
 return p;
}

// Explicit pagination avoids treating Supabase's default row limit as complete coverage.
async function readPages(db:BotsDb,table:string,columns:string,order:string[],max:number,filter?:[string,string]){
 const rows:any[]=[];let expected:number|undefined;
 while(true){
  let q=db.from(table).select(columns,{count:'exact'});if(filter)q=q.eq(...filter);
  for(const key of order)q=q.order(key);
  const r=await q.range(rows.length,rows.length+499);
  if(r.error||!Array.isArray(r.data)||r.count===null||r.count>max||(expected!==undefined&&expected!==r.count))throw new Refusal(503,'Tracking registry unavailable or changed during reading. Retry.');
  expected=r.count;rows.push(...r.data);
  if(rows.length===expected)return rows;
  if(!r.data.length||rows.length>expected)throw new Refusal(503,'Tracking registry read is incomplete.');
 }
}
export async function readFeedRegistry(db:BotsDb){
 const [markets,entries]=await Promise.all([
  readPages(db,'mkz_markets','*',['chain_id','domain_token','quote_token'],10000),
  readPages(db,'mkz_entries','participant,wallet,entered_at',['participant'],20000,['campaign_id',ZONE_CAMPAIGN]),
 ]);
 return {markets,entries};
}

/** SELECT-only diagnostic. It never calls ingestion, inserts receipts, or changes campaign state. */
export async function checkZoneBatch(p:any,db:BotsDb){
 const [read,registry,links]=await Promise.all([
  db.from('mkz_campaigns').select('*').eq('id',ZONE_CAMPAIGN).maybeSingle(),
  readFeedRegistry(db),
  readPages(db,'mkz_all_links','wallet,mcp_wallet,doma_user_id,status',['wallet'],20000),
 ]);
 if(read.error||!read.data)throw new Refusal(503,'Campaign setup is unavailable.');
 const c=read.data,issues:{code:string;economicId?:string;message:string}[]=[],warnings:string[]=[];
 const issue=(code:string,message:string,economicId?:string)=>issues.push({code,message,...(economicId?{economicId}:{})});
 const walletParticipants=new Map<string,Set<string>>(),agents=new Set<string>();
 for(const l of links.filter(l=>l.status==='linked')){
  agents.add(l.mcp_wallet);
  for(const w of [l.wallet,l.mcp_wallet]){const ids=walletParticipants.get(w)??new Set<string>();ids.add(l.doma_user_id);walletParticipants.set(w,ids);}
 }
 const markets=new Set(registry.markets.map(m=>`${m.chain_id}:${m.domain_token}:${m.quote_token}`)),entries=new Map(registry.entries.map(e=>[e.participant,e]));
 let mapped=0,registered=0,eligible=0;
 for(const f of p.fills){
  const ids=walletParticipants.get(f.wallet),uid=ids?.size===1?[...ids][0]:undefined;
  if(!uid)issue('wallet_unmapped','Resolve this execution wallet to one registered Doma account first.',f.economicId);else mapped++;
  const market=markets.has(`${f.chainId}:${f.domainToken}:${f.quoteToken}`);
  if(!market)issue('market_unverified','This domain/quote pair is not in the verified market registry.',f.economicId);else registered++;
  const source=f.source!=='agent_wallet'||agents.has(f.wallet);
  if(!source)issue('agent_wallet_unverified','The reported agent wallet is not the verified embedded wallet.',f.economicId);
  const entry=uid?entries.get(uid):undefined;
  if(c.state!=='draft'&&!entry)issue('participant_not_enrolled','The participant has not entered this competition.',f.economicId);
  if(entry&&market&&source&&f.status==='verified'&&Date.parse(f.executedAt)>=Math.max(Date.parse(entry.entered_at),Date.parse(c.starts_at))&&Date.parse(f.executedAt)<Date.parse(c.ends_at))eligible++;
 }
 if(c.state!=='draft'&&(Date.parse(p.coverageFrom)!==Date.parse(c.starts_at)||Date.parse(p.confirmedThrough)<Date.parse(c.confirmed_through??c.starts_at)))issue('coverage_invalid','Coverage must start at campaign opening and cannot go backwards.');
 if(p.financialComplete){
  if(!c.financial_method||p.methodology!==c.financial_method)issue('financial_method','Use the configured, reviewed participant-level accounting methodology.');
  if(p.financials.length!==entries.size||p.financials.some((f:any)=>!entries.has(f.participant)))issue('financial_coverage','The financial snapshot must include every enrolled participant exactly once.');
 }
 if(c.state==='draft')warnings.push('Competition is draft. Historical samples are diagnostic only; this request records no trades or awards.');
 if(!p.fills.length)warnings.push('No real trade sample was supplied. This does not prove trade attribution.');
 warnings.push('Source evidence and completeness are collector attestations, not independently verified by this route. Revision conflicts and transactional acceptance are checked only by live ingestion.');
 return {ok:issues.length===0,mode:'read_only',writesPerformed:0,competitionState:c.state,
  requestId:p.requestId,payloadSha256:createHash('sha256').update(JSON.stringify(p)).digest('hex'),
  checked:{fills:p.fills.length,mappedFills:mapped,registeredMarketFills:registered,currentlyEligibleFills:eligible,financials:p.financials.length},
  ingestionOpen:['active','closed'].includes(c.state),issues,warnings};
}
