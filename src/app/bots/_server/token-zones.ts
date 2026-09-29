import 'server-only';
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {botsDb,Refusal} from './db';
import {sessionFromRequest} from './session';
import {sameOrigin} from './workshop-journey';
import {emptyZoneView,ZONE_CAMPAIGN,ZONE_RULES,ZONE_FRESH_MS,ZONE_CATEGORIES,REWARD_ZONES,DAY,decimalUnits,unitsDecimal,ranked,qualificationDays,tokenAwards,type ZoneScore,type ZoneView,type ZoneAsset} from '@/lib/bots/token-zones';
export const tokenZonesEnabled=()=>process.env.BOTS_TOKEN_ZONES==='1';
const numberString=(v:unknown)=>typeof v==='string'&&/^-?\d{1,34}(\.\d{1,6})?$/.test(v);
const scoreString=(v:unknown)=>typeof v==='string'&&/^-?\d{1,40}(\.\d{1,36})?$/.test(v);
const address=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v);
const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v));
export async function readTokenZones(req:Request):Promise<ZoneView>{
 const out=emptyZoneView();if(!tokenZonesEnabled())return out;
 const auth=sessionFromRequest(req);
 try{
  const {data:r,error}=await botsDb().rpc('mkz_read',{p_wallet:auth?.wallet??null});if(error||!r?.campaign)throw Error('Setup missing');
  const c=r.campaign;if(c.rules!==ZONE_RULES||!['draft','active','closed','frozen'].includes(c.state))throw Error('Rules mismatch');
  const secret=process.env.BB_SESSION_SECRET;if(!secret||secret.length<32)throw Error('Identity configuration missing');
  const publicId=(uid:string)=>createHmac('sha256',secret).update(`${ZONE_CAMPAIGN}:${uid}`).digest('hex').slice(0,20);
  out.available=true;out.state=c.state;out.issues=[];
  out.assets=(r.assets??[]).filter((a:any)=>REWARD_ZONES.some(z=>z.symbol===a.symbol)).map((a:any):ZoneAsset=>({symbol:a.symbol,chainId:a.chain_id,address:a.address,decimals:a.decimals,fundedUnits:a.funded_units,verifiedAt:a.verified_at,liquidPair:a.liquid_pair,priceUsd:a.price_usd,priceAt:a.price_at}));
  if(auth){
   const link=await botsDb().from('mkz_wallet_discovery').select('status').eq('wallet',auth.wallet).maybeSingle();
   if(link.error)throw Error('Wallet discovery unavailable');
   out.personal={id:r.own?publicId(r.own):null,connected:true,linkStatus:r.own?'linked':link.data?.status??'pending',entered:false,weeks:[null,null,null,null],qualified:null,volumeUsd:null,attemptsRemaining:null,awards:[],challenges:[],ranks:{volume:null,roi:null,profit:null,battles:null}};
  }
  if(c.state==='draft')return out;
  if(!date(c.starts_at)||!date(c.ends_at)||Date.parse(c.ends_at)-Date.parse(c.starts_at)!==28*DAY)throw Error('Dates invalid');
  out.startsAt=c.starts_at;out.endsAt=c.ends_at;out.confirmedThrough=c.confirmed_through;
  out.complete=c.complete===true;out.fresh=c.state==='frozen'||(date(c.confirmed_through)&&Math.min(Date.now(),Date.parse(c.ends_at))-Date.parse(c.confirmed_through)<=ZONE_FRESH_MS);
  if(!out.complete)out.issues.push('Trade coverage is incomplete. Totals and rewards are not confirmed.');
  if(!out.fresh)out.issues.push('Trading updates are delayed. Last verified progress is shown.');
  if(!c.financial_complete)out.issues.push('ROI and realized profit are awaiting complete accounting.');
  const participants=r.participants as any[];if(!Array.isArray(participants)||participants.length>20000)throw Error('Participant read incomplete');
  const scores:ZoneScore[]=participants.map(p=>({id:publicId(p.participant),name:`Trader ${publicId(p.participant).slice(0,6).toUpperCase()}`,qualified:qualificationDays(p.times,c.starts_at,c.ends_at).some(n=>n>=3),scores:{volume:p.volume,roi:c.financial_complete?p.roi:null,profit:c.financial_complete?p.profit:null,battles:p.battles}}));
  // Incomplete source coverage is never presented as confirmed absence/qualification.
  if(out.complete){
   out.volumeUsd=r.volume;let total=BigInt(0);
   out.history=[{day:0,volumeUsd:'0'},...r.days.map((d:any)=>{total+=decimalUnits(d.volume);return {day:Math.min(d.day+1,(Math.min(Date.parse(c.confirmed_through),Date.parse(c.ends_at))-Date.parse(c.starts_at))/DAY),volumeUsd:unitsDecimal(total,6)};})];
   for(const category of ZONE_CATEGORIES)out.standings[category]=ranked(scores,category).slice(0,100).map(s=>({id:s.id,name:s.name,rank:s.rank,score:s.scores[category]!,qualified:s.qualified}));
  }
  const own=participants.find(p=>p.participant===r.own);
  if(out.personal&&own){out.personal.entered=true;out.personal.attemptsRemaining=own.remaining;
   if(out.complete){const weeks=qualificationDays(own.times,c.starts_at,c.ends_at);out.personal.weeks=weeks;out.personal.qualified=weeks.some(n=>n>=3);out.personal.volumeUsd=own.volume;
    out.personal.scores={volume:own.volume,roi:c.financial_complete?own.roi:null,profit:c.financial_complete?own.profit:null,battles:own.battles};
    for(const category of ZONE_CATEGORIES)out.personal.ranks[category]=ranked(scores,category).find(s=>s.id===publicId(r.own))?.rank??null;
    out.personal.challenges=[...(own.times.length?['First verified trade']:[]),...(weeks.some(n=>n>=3)?['First qualifying week']:[]),...(own.domains>=3?['Three domains']:[]),...(weeks.every(n=>n>=3)?['Four-week trader']:[])];
    if(c.state==='frozen')out.personal.awards=r.awards.filter((a:any)=>a.participant===r.own).map((a:any)=>({id:publicId(r.own),symbol:a.symbol,units:a.units}));
    else if(out.fresh&&c.financial_complete&&out.assets.length===9){
     // The allocator uses immutable account IDs for rounding, just like finalization.
     // Public pseudonyms must not change which participant receives a remainder unit.
     const allocationScores=scores.map((s,i)=>({...s,id:participants[i].participant}));
     out.personal.awards=tokenAwards(r.volume,out.assets,allocationScores).filter(a=>a.id===r.own).map(a=>({...a,id:publicId(a.id)}));
    }
   }
  }
  return out;
 }catch{return {...emptyZoneView(),personal:auth?{id:null,connected:true,linkStatus:'unavailable',entered:false,weeks:[null,null,null,null],qualified:null,volumeUsd:null,attemptsRemaining:null,awards:[],challenges:[],ranks:{volume:null,roi:null,profit:null,battles:null}}:null};}
}
export async function enterTokenZones(req:Request){
 sameOrigin(req);if(!tokenZonesEnabled())throw new Refusal(409,'Competition setup is not enabled.');
 const auth=sessionFromRequest(req);if(!auth)throw new Refusal(401,'Connect and sign in to enter.');if(auth.isTest)throw new Refusal(403,'Test accounts cannot enter.');
 const {error}=await botsDb().rpc('mkz_enter',{p_wallet:auth.wallet});
 if(error)throw new Refusal(error.message.includes('NOT_OPEN')?409:503,error.message.includes('WALLET_LINK')?'Your Doma wallet link is still being checked.':'Competition entry is unavailable or has not opened.');
 return {ok:true,zones:await readTokenZones(req)};
}
function authorizeFeed(req:Request){
 if(!tokenZonesEnabled())throw new Refusal(503,'Token-zone tracking is not enabled.');
 const token=process.env.MK_MCP_INGEST_TOKEN,header=req.headers.get('authorization')??'';
 if(!token||token.length<32)throw new Refusal(503,'Trade-feed credential is not configured.');
 const hash=(s:string)=>createHash('sha256').update(s).digest();
 if(header.length>520||!header.startsWith('Bearer ')||!timingSafeEqual(hash(header.slice(7)),hash(token)))throw new Refusal(401,'Invalid feed credential.');
}
export async function zoneFeedGet(req:Request){
 authorizeFeed(req);const db=botsDb();const {data,error}=await db.rpc('mkz_read',{p_wallet:null});if(error||!data?.campaign)throw new Refusal(503,'Apply the token-zone setup first.');
 const markets=await db.from('mkz_markets').select('*').limit(10001);if(markets.error||markets.data.length>10000)throw new Refusal(503,'Market registry unavailable or incomplete.');
 const entries=await db.from('mkz_entries').select('participant,wallet,entered_at').eq('campaign_id',ZONE_CAMPAIGN).limit(20001);if(entries.error||entries.data.length>20000)throw new Refusal(503,'Participant registry incomplete.');
 return {schemaVersion:1,campaign:data.campaign,markets:markets.data,participants:entries.data,intervalHours:4,
  instructions:'Read-only Doma source access. Discover registered wallets through /api/bots/tracking/wallets, following every nextCursor. Group by Doma user ID, not address equality. Do not trade, approve, transfer, modify Reporter or open a campaign. While draft, validate attribution and report blockers; do not submit scoring. For active/closed campaigns, submit canonical completed economic fills through this endpoint. Reuse the same requestId and exact body on retries. Corrections retain economicId with a higher revision. Never claim complete coverage without reconciling all enrolled linked wallets and corrections. Missing or undefined ROI may be null with source evidence; do not sum wallet percentages.',
  batchContract:{schemaVersion:1,requestId:'UUID, stable across identical retries',campaignId:ZONE_CAMPAIGN,rules:ZONE_RULES,coverageFrom:'Campaign opening ISO timestamp',confirmedThrough:'Audited coverage ISO timestamp, monotonic',complete:'boolean: complete reconciled trade coverage',financialComplete:'boolean: complete participant-level accounting snapshot',methodology:'Exact campaign.financial_method identifier',fills:[{chainId:97477,economicId:'Stable source economic-fill identity shared by Strategy/agent evidence; not each router hop',revision:'Positive integer',wallet:'Lowercase verified execution wallet',transactionHash:'Lowercase 0x transaction hash',domainToken:'Registered domain-token address',quoteToken:'Registered USDC/ETH representation',executedAt:'Authoritative completion ISO timestamp',volumeUsd:'Positive decimal string, up to 6 fractional digits; one economic trade counted once',source:'strategy | agent_wallet',status:'verified | revoked',evidence:'Source records, attribution and correction reference'}],financials:[{participant:'Verified Doma account ID',roi:'Unrounded existing-method decimal string or null if undefined',profit:'Existing-method decimal string or null if undefined',evidence:'Accounting coverage and method reference'}]},
  limits:{maxBytes:2000000,maxFills:2000,maxFinancials:20000},
 };
}
export async function zoneFeedPost(req:Request){
 authorizeFeed(req);if(req.headers.get('content-type')?.split(';')[0]!=='application/json')throw new Refusal(415,'Send application/json.');
 const reader=req.body?.getReader();if(!reader)throw new Refusal(400,'Missing batch.');let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>2_000_000){await reader.cancel();throw new Refusal(413,'Batch exceeds 2 MB.');}chunks.push(r.value);}}finally{reader.releaseLock();}
 let p:any;try{p=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new Refusal(400,'Invalid JSON.');}
 const invalid=()=>{throw new Refusal(400,'Invalid trade batch. Use the documented contract.');};
 if(!p||p.schemaVersion!==1||p.rules!==ZONE_RULES||p.campaignId!==ZONE_CAMPAIGN||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.requestId)||!date(p.coverageFrom)||!date(p.confirmedThrough)||typeof p.complete!=='boolean'||typeof p.financialComplete!=='boolean'||!Array.isArray(p.fills)||p.fills.length>2000||!Array.isArray(p.financials)||p.financials.length>20000)invalid();
 for(const f of p.fills){if(!f||f.chainId!==97477||typeof f.economicId!=='string'||f.economicId.length<1||f.economicId.length>160||!Number.isSafeInteger(f.revision)||f.revision<1||!address(f.wallet)||!address(f.domainToken)||!address(f.quoteToken)||! /^0x[0-9a-f]{64}$/.test(f.transactionHash)||!date(f.executedAt)||!numberString(f.volumeUsd)||decimalUnits(f.volumeUsd)<=BigInt(0)||!['verified','revoked'].includes(f.status)||!['strategy','agent_wallet'].includes(f.source)||typeof f.evidence!=='string'||!f.evidence.length||f.evidence.length>1000)invalid();}
 for(const f of p.financials){if(!f||typeof f.participant!=='string'||(f.roi!==null&&!scoreString(f.roi))||(f.profit!==null&&!scoreString(f.profit))||typeof f.evidence!=='string'||!f.evidence.length||f.evidence.length>1000)invalid();}
 const {data,error}=await botsDb().rpc('mkz_ingest',{p_payload:p});if(error)throw new Refusal(409,'Batch rejected: coverage, registry, identity or revision needs review. Nothing was partially applied.');return data;
}
