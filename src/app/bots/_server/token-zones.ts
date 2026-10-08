import 'server-only';
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {botsDb,Refusal} from './db';
import {sessionFromRequest} from './session';
import {sameOrigin} from './workshop-journey';
import {trackingCredential} from './tracking-credential';
import {readZoneBatch,readFeedRegistry} from './token-zone-feed';
import {TOKEN_ACCOUNTING} from '@/lib/bots/token-zone-accounting';
import {emptyZoneView,ZONE_CAMPAIGN,ZONE_RULES,ZONE_FRESH_MS,ZONE_CATEGORIES,REWARD_ZONES,DAY,decimalUnits,unitsDecimal,ranked,qualificationDays,tokenAwards,type ZoneScore,type ZoneView,type ZoneAsset} from '@/lib/bots/token-zones';
export const tokenZonesEnabled=()=>process.env.BOTS_TOKEN_ZONES==='1';
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
  // The optional read adapter verifies each ledger against current fills and
  // cutoff. A pending account must not hide another account's verified result.
  // Final reward allocation still requires the original global completion gate.
  const verified=new Map<string,{roi:string|null;profit:string|null}>();
  if(c.financial_complete)for(const p of participants)verified.set(p.participant,{roi:p.roi,profit:p.profit});
  else if(out.complete){
   const {data:financial,error:financialError}=await botsDb().rpc('mkz_verified_financials');
   if(!financialError&&financial?.available===true&&financial?.schemaVersion===1&&financial?.methodology===TOKEN_ACCOUNTING.id&&financial?.confirmedThrough===c.confirmed_through&&Array.isArray(financial.rows)){
    for(const p of financial.rows)if(participants.some(x=>x.participant===p.participant))verified.set(p.participant,{roi:p.roi,profit:p.profit});
   }
  }
  out.financials={verified:verified.size,total:participants.filter(p=>!date(p.entered_at)||Date.parse(p.entered_at)<=Date.parse(c.confirmed_through)).length,complete:c.financial_complete===true,confirmedThrough:c.confirmed_through};
  const scores:ZoneScore[]=participants.map(p=>({id:publicId(p.participant),name:`Trader ${publicId(p.participant).slice(0,6).toUpperCase()}`,qualified:qualificationDays(p.times,c.starts_at,c.ends_at).some(n=>n>=3),scores:{volume:p.volume,roi:verified.get(p.participant)?.roi??null,profit:verified.get(p.participant)?.profit??null,battles:p.battles}}));
  // Incomplete source coverage is never presented as confirmed absence/qualification.
  if(out.complete){
   out.volumeUsd=r.volume;let total=BigInt(0);
   out.history=[{day:0,volumeUsd:'0'},...r.days.map((d:any)=>{total+=decimalUnits(d.volume);return {day:Math.min(d.day+1,(Math.min(Date.parse(c.confirmed_through),Date.parse(c.ends_at))-Date.parse(c.starts_at))/DAY),volumeUsd:unitsDecimal(total,6)};})];
   for(const category of ZONE_CATEGORIES)out.standings[category]=ranked(scores,category).slice(0,100).map(s=>({id:s.id,name:s.name,rank:s.rank,score:category==='profit'?null:s.scores[category]!,qualified:s.qualified}));
  }
  const own=participants.find(p=>p.participant===r.own);
  if(out.personal&&own){out.personal.entered=true;out.personal.attemptsRemaining=own.remaining;
   if(out.complete){const weeks=qualificationDays(own.times,c.starts_at,c.ends_at);out.personal.weeks=weeks;out.personal.qualified=weeks.some(n=>n>=3);out.personal.volumeUsd=own.volume;
    out.personal.scores={volume:own.volume,roi:verified.get(own.participant)?.roi??null,profit:verified.get(own.participant)?.profit??null,battles:own.battles};
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
 const token=trackingCredential(process.env),header=req.headers.get('authorization')??'';
 if(!token)throw new Refusal(503,'Trade-feed credential is not configured.');
 const hash=(s:string)=>createHash('sha256').update(s).digest();
 if(header.length>520||!header.startsWith('Bearer ')||!timingSafeEqual(hash(header.slice(7)),hash(token)))throw new Refusal(401,'Invalid feed credential.');
}
export async function zoneFeedGet(req:Request){
 authorizeFeed(req);const db=botsDb();const {data,error}=await db.rpc('mkz_read',{p_wallet:null});if(error||!data?.campaign)throw new Refusal(503,'Apply the token-zone setup first.');
 const registry=await readFeedRegistry(db);
 return {schemaVersion:1,campaign:data.campaign,markets:registry.markets,participants:registry.entries,intervalHours:4,
  accountingContract:data.campaign.financial_method===TOKEN_ACCOUNTING.id?{...TOKEN_ACCOUNTING,mode:'server_fifo',rpc:'mkz_collector_accounting',input:'Complete opening FIFO lots and chronological raw asset movements. No precomputed scores.'}:null,
  preflightPath:'/api/bots/tracking/zones/check',
  setupIssues:[...(!registry.markets.length?['No eligible trading markets have been verified.']:[]),...(!data.campaign.financial_method?['ROI/profit methodology is not configured.']:[]),...((data.assets??[]).length!==9?['The nine reward assets have not all been registered.']:[])],
  walletLookup:{path:'/api/bots/tracking/wallets',scopes:['pending','all','monitor'],pagination:'Follow nextCursor as the after query parameter until null.',post:{schemaVersion:1,requestId:'UUID; keep exact request and ID on retries',wallet:'Registered connected wallet, lowercase',mcpWallet:'Verified embedded execution wallet, lowercase; null if not_found',domaUserId:'Doma account ID as a decimal string; null if not_found',privyDid:'Verified did:privy identifier or null',status:'linked | not_found',checkedAt:'Current UTC timestamp in YYYY-MM-DDTHH:mm:ss.SSSZ format',expectedRevision:'The exact revision returned by GET'}},
  instructions:'Read-only Doma source access. Discover registered wallets through /api/bots/tracking/wallets, following every nextCursor. Group by Doma user ID, not address equality. Do not trade, approve, transfer, modify Reporter or open a campaign. While draft, validate attribution and report blockers; do not submit scoring. For active/closed campaigns, submit canonical completed economic fills through this endpoint. Reuse the same requestId and exact body on retries. Corrections retain economicId with a higher revision. Never claim complete coverage without reconciling all enrolled linked wallets and corrections. Missing or undefined ROI may be null with source evidence; do not sum wallet percentages.',
  batchContract:{schemaVersion:1,requestId:'UUID, stable across identical retries',campaignId:ZONE_CAMPAIGN,rules:ZONE_RULES,coverageFrom:'Campaign opening ISO timestamp',confirmedThrough:'Audited coverage ISO timestamp, monotonic',complete:'boolean: complete reconciled trade coverage',financialComplete:'boolean: complete participant-level accounting snapshot',methodology:'Exact campaign.financial_method identifier',fills:[{chainId:97477,economicId:'Stable source economic-fill identity shared by Strategy/agent evidence; not each router hop',revision:'Positive integer',wallet:'Lowercase verified execution wallet',transactionHash:'Lowercase 0x transaction hash',domainToken:'Registered domain-token address',quoteToken:'Registered USDC/ETH representation',executedAt:'Authoritative completion ISO timestamp',volumeUsd:'Positive decimal string, up to 6 fractional digits; one economic trade counted once',source:'strategy | agent_wallet',status:'verified | revoked',evidence:'Source records, attribution and correction reference'}],financials:[]},
  limits:{maxBytes:2000000,maxFills:2000,maxFinancials:20000},
  batching:'Submit fill chunks with complete:false and financialComplete:false, financials:[]. After the full trade coverage audit succeeds, publish an empty volume completion batch with complete:true and financialComplete:false, fills:[] and financials:[]. Accounting gaps do not block independently verified volume. Send every complete account raw snapshot through mkz_collector_accounting using the existing scoped database connection. Once all snapshots cover the same cutoff, send a separate empty financial final batch with both completeness flags true. Missing trade or accounting coverage must keep its respective flag false.',
 };
}
export async function zoneFeedPost(req:Request){
 authorizeFeed(req);const p=await readZoneBatch(req);
 const {data,error}=await botsDb().rpc('mkz_collector_ingest',{p_payload:p});if(error)throw new Refusal(409,'Batch rejected: coverage, registry, identity or revision needs review. Nothing was partially applied.');return data;
}
export async function zoneFeedCheck(req:Request){
 authorizeFeed(req);const p=await readZoneBatch(req);
 const {data,error}=await botsDb().rpc('mkz_collector_check',{p_payload:p});
 if(error)throw new Refusal(409,'The read-only check rejected this batch. Check the collector contract.');return data;
}
