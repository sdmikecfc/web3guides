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
const tick=(v:string)=>BigInt(Date.parse(v))*BigInt(1000000)+BigInt((((v.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1]??'').slice(3))+'000000').slice(0,6));
const throughRange=(values:string[])=>{const sorted=values.filter(date).sort((a,b)=>tick(a)<tick(b)?-1:tick(a)>tick(b)?1:0);return {oldestThrough:sorted[0]??null,newestThrough:sorted[sorted.length-1]??null}};
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
  const participants=r.participants as any[];if(!Array.isArray(participants)||participants.length>20000)throw Error('Participant read incomplete');
  // Saved results are displayed only when SQL revalidates their historical
  // proof. A newer cutoff is never assigned to an older verified result.
  const retainedContract=r.accountScope==='retained-account-results-1';
  const retainedShape=retainedContract&&date(c.confirmed_through)&&participants.every(p=>typeof p.tradeComplete==='boolean'&&typeof p.tradeCurrent==='boolean'&&p.tradeComplete===p.tradeCurrent&&typeof p.tradeVerified==='boolean'&&typeof p.tradeDelayed==='boolean'&&(!p.tradeCurrent||p.tradeVerified)&&p.tradeDelayed===(p.tradeVerified&&!p.tradeCurrent)&&(!p.tradeVerified||(date(p.tradeThrough)&&tick(p.tradeThrough)<=tick(c.confirmed_through)&&tick(p.tradeThrough)>=tick(c.starts_at)))&&(!p.tradeCurrent||p.tradeThrough===c.confirmed_through));
  const isolated=retainedShape||(r.accountScope==='per-account-coverage-1'&&date(c.confirmed_through)&&participants.every(p=>typeof p.tradeComplete==='boolean'&&(!p.tradeComplete||(date(p.tradeThrough)&&p.tradeThrough===c.confirmed_through))));
  if(r.accountScope!==undefined&&!isolated)throw Error('Account coverage contract invalid');
  const tradeVerified=new Set<string>(participants.filter(p=>retainedShape?p.tradeVerified:isolated?p.tradeComplete:out.complete).map(p=>p.participant));
  const tradeCurrent=new Set<string>(participants.filter(p=>isolated?p.tradeComplete:out.complete).map(p=>p.participant));
  if(isolated&&tradeCurrent.size!==participants.length)out.complete=false;
  const retainedTrades=retainedShape&&tradeVerified.size>tradeCurrent.size;
  const sourceFresh=out.fresh;
  const showTrades=isolated?(tradeVerified.size>0||participants.length===0):out.complete;
  if(isolated)out.tracking={verified:tradeVerified.size,total:participants.length,current:tradeCurrent.size,partial:!out.complete,retained:retainedTrades,...throughRange(participants.filter(p=>tradeVerified.has(p.participant)).map(p=>p.tradeThrough))};
  if(!showTrades)out.issues.push('Trade history is syncing. Check your account status below.');
  else if(retainedTrades)out.issues.push('Showing last verified results while newer trades sync.');
  else if(!out.complete)out.issues.push('Verified results so far. Some accounts are still syncing.');
  if(!sourceFresh)out.issues.push('Trading updates are delayed.');
  const traders=new Set<string>(participants.filter(p=>tradeVerified.has(p.participant)&&Array.isArray(p.times)&&p.times.some((t:unknown)=>date(t)&&tick(t as string)<=tick(isolated?p.tradeThrough:c.confirmed_through))).map(p=>p.participant));
  const verified=new Map<string,{roi:string|null;profit:string|null;through:string;retained:boolean}>();
  let financialTotal:number|null=traders.size,financialKnown=false;
  if(c.financial_complete&&out.complete){for(const p of participants)if(traders.has(p.participant))verified.set(p.participant,{roi:p.roi,profit:p.profit,through:c.confirmed_through,retained:false});financialKnown=true;}
  if(c.state!=='frozen'){
   const {data:financial,error:financialError}=await botsDb().rpc('mkz_verified_financials');
   if(!financialError&&financial?.available===true&&financial?.schemaVersion===1&&financial?.methodology===TOKEN_ACCOUNTING.id&&financial?.confirmedThrough===c.confirmed_through&&Array.isArray(financial.rows)){
    const saved=retainedShape&&financial.financialScope==='retained-account-financials-1';
    const perAccount=isolated&&financial.financialScope==='eligible-traders-2';
    const exactScope=(saved||perAccount||(out.complete&&financial.financialScope==='eligible-traders-1'))&&Number.isSafeInteger(financial.tradingAccounts)&&financial.tradingAccounts>=0&&financial.tradingAccounts<=participants.length;
    if(exactScope){verified.clear();financialTotal=financial.scopePending>0?null:financial.tradingAccounts;financialKnown=true;}
    if(exactScope||(out.complete&&!c.financial_complete)){
     financialKnown=true;
     for(const p of financial.rows){
      const owner=participants.find(x=>x.participant===p.participant);
      if(!owner||!tradeVerified.has(p.participant)||(!exactScope&&!traders.has(p.participant)))continue;
      if(saved&&(!date(p.confirmedThrough)||p.confirmedThrough!==owner.financialThrough||tick(p.confirmedThrough)>tick(owner.tradeThrough)||tick(p.confirmedThrough)<tick(c.starts_at)||typeof p.current!=='boolean'||typeof p.retained!=='boolean'||p.retained===p.current||(p.current&&p.confirmedThrough!==c.confirmed_through)))continue;
      verified.set(p.participant,{roi:p.roi,profit:p.profit,through:saved?p.confirmedThrough:c.confirmed_through,retained:saved&&p.retained});
     }
    }
   }
  }
  const retainedFinancials=[...verified.values()].some(p=>p.retained);
  if(retainedTrades||retainedFinancials){out.fresh=false;out.complete=false;}
  out.financials={verified:financialKnown?verified.size:null,total:financialKnown?financialTotal:null,complete:c.financial_complete===true&&out.complete,confirmedThrough:c.confirmed_through,retained:retainedFinancials,...throughRange([...verified.values()].map(p=>p.through))};
  if(retainedFinancials&&!retainedTrades)out.issues.push('Showing last verified ROI while newer trades sync.');
  else if(!c.financial_complete&&showTrades&&!retainedFinancials)out.issues.push(verified.size?'Verified ROI results are shown while the remaining accounts are checked.':'ROI calculations are still syncing.');
  const scores:ZoneScore[]=participants.map(p=>({id:publicId(p.participant),name:`Trader ${publicId(p.participant).slice(0,6).toUpperCase()}`,qualified:tradeVerified.has(p.participant)&&qualificationDays(p.times,c.starts_at,c.ends_at).some(n=>n>=3),scores:{volume:tradeVerified.has(p.participant)?p.volume:null,roi:verified.get(p.participant)?.roi??null,profit:verified.get(p.participant)?.profit??null,battles:tradeVerified.has(p.participant)?p.battles:null}}));
  if(showTrades){
   out.volumeUsd=r.volume;let total=BigInt(0);const chartThrough=out.tracking?.newestThrough??c.confirmed_through;
   out.history=[{day:0,volumeUsd:'0'},...r.days.map((d:any)=>{total+=decimalUnits(d.volume);return {day:Math.min(d.day+1,(Math.min(Date.parse(chartThrough),Date.parse(c.ends_at))-Date.parse(c.starts_at))/DAY),volumeUsd:unitsDecimal(total,6)};})];
   for(const category of ZONE_CATEGORIES)out.standings[category]=ranked(scores,category).slice(0,100).map(s=>{const owner=participants.find(p=>publicId(p.participant)===s.id);return {id:s.id,name:s.name,rank:s.rank,score:category==='profit'?null:s.scores[category]!,qualified:s.qualified,verifiedThrough:owner&&category!=='battles'?((category==='roi'||category==='profit')?verified.get(owner.participant)?.through??null:isolated?owner.tradeThrough:c.confirmed_through):null}});
  }
  const own=participants.find(p=>p.participant===r.own);
  if(out.personal&&own){out.personal.entered=true;out.personal.attemptsRemaining=own.remaining;
   out.personal.tradeThrough=tradeVerified.has(own.participant)?(isolated?own.tradeThrough:c.confirmed_through):null;out.personal.financialThrough=verified.get(own.participant)?.through??null;out.personal.resultsDelayed=!!(retainedShape&&own.tradeDelayed)||verified.get(own.participant)?.retained===true;
   out.personal.syncStatus=isolated&&own.tradeProblem?'review':tradeVerified.has(own.participant)?'verified':'syncing';
   out.personal.financialStatus=isolated&&own.financialProblem?'review':verified.has(own.participant)?'verified':tradeVerified.has(own.participant)&&!traders.has(own.participant)?'no_trades':'syncing';
   if(tradeVerified.has(own.participant)){const weeks=qualificationDays(own.times,c.starts_at,c.ends_at);out.personal.weeks=weeks;out.personal.qualified=weeks.some(n=>n>=3);out.personal.volumeUsd=own.volume;
    out.personal.scores={volume:own.volume,roi:verified.get(own.participant)?.roi??null,profit:verified.get(own.participant)?.profit??null,battles:own.battles};
    for(const category of ZONE_CATEGORIES)out.personal.ranks[category]=ranked(scores,category).find(s=>s.id===publicId(r.own))?.rank??null;
    out.personal.challenges=[...(own.times.length?['First verified trade']:[]),...(weeks.some(n=>n>=3)?['First qualifying week']:[]),...(own.domains>=3?['Three domains']:[]),...(weeks.every(n=>n>=3)?['Four-week trader']:[])];
    if(c.state==='frozen')out.personal.awards=r.awards.filter((a:any)=>a.participant===r.own).map((a:any)=>({id:publicId(r.own),symbol:a.symbol,units:a.units}));
    else if(out.complete&&out.fresh&&c.financial_complete&&out.assets.length===9){
     // Partial rankings must never become final or estimated token entitlements.
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
