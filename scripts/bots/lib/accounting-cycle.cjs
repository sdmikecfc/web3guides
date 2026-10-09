'use strict';
const {createHash}=require('node:crypto');
const {reconstruct,accountingStartMillis}=require('./public-accounting.cjs');
const ENGINE_VERSION='mk-accounting-resumable-2';
const JOBS_VERSION='mk-accounting-resumable-1';
const VERIFICATION_MAX_AGE_MS=4*60*60*1000;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const code=e=>/^[A-Z][A-Z0-9_]{2,100}$/.test(e?.message)?e.message:'ACCOUNTING_SOURCE_UNAVAILABLE';
const instant=value=>{
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('ACCOUNTING_PERIOD_INVALID');
 return BigInt(Date.parse(value))*1000000n+BigInt(((value.match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1]||'').padEnd(9,'0').slice(3,9))||'0');
};
function exactStart(campaignStart,enteredAt){
 if(!Number.isFinite(Date.parse(campaignStart))||!Number.isFinite(Date.parse(enteredAt)))throw Error('ACCOUNTING_PERIOD_INVALID');
 const precise=value=>BigInt(Date.parse(value))*1000000n+BigInt(((String(value).match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1]||'').padEnd(9,'0').slice(3,9))||'0');
 return precise(enteredAt)>=precise(campaignStart)?enteredAt:campaignStart;
}
function eligibleCompetitionFills(snapshot,packet,wallets,periodStart,through){
 const lower=instant(periodStart),upper=instant(through),close=snapshot.manifest.campaign.ends_at;
 const markets=new Set(snapshot.manifest.markets.map(m=>`${m.chain_id}:${m.domain_token}:${m.quote_token}`));
 return packet.fills.filter(f=>f.status==='verified'&&wallets.includes(f.wallet)&&markets.has(`${f.chainId}:${f.domainToken}:${f.quoteToken}`)&&instant(f.executedAt)>=lower&&instant(f.executedAt)<=upper&&(!close||instant(f.executedAt)<instant(close)));
}
// Per-account work survives process restarts. Raw evidence lives in a separate
// bounded cache; this checkpoint cannot certify incomplete financial results.
// The observed 870-transaction trader needs over eight minutes of fresh trace
// reads even with immutable facts cached. A five-minute slice can never finish.
// Keep both limits finite, preserve fair rotation and abort all work at deadline.
async function accountingCycle({snapshot,packet,accountCoverage=null,cache,sourceFactory,anchorAt,budgetMs=1800000,sliceMs=1200000,now=Date.now,reconstructLedger=reconstruct}){
 // Preserve v7 pending cutoff/anchor pointers, not its completion claims. Raw
 // finalized evidence can then be reused while sweep2 requires fresh validation.
 const jobs=cache.namespace({kind:'accounting',scope:{purpose:'mk-accounting-jobs-1',engine:JOBS_VERSION}});
 const campaign=snapshot.manifest.campaign.id||packet.campaignId||'model-kombat-zones-1';
 const sweep=cache.namespace({kind:'accounting',scope:{purpose:'mk-accounting-verification-1',engine:ENGINE_VERSION,campaign}});
 const entries=new Map(snapshot.manifest.participants.map(e=>[e.participant,e]));
 const accounts=snapshot.accounts.filter(a=>snapshot.manifest.campaign.state==='draft'||entries.has(a.participant)).sort((a,b)=>a.participant.localeCompare(b.participant));
 const coverage=new Map();
 if(accountCoverage!==null){
  if(!Array.isArray(accountCoverage))throw Error('ACCOUNTING_COVERAGE_INVALID');
  for(const row of accountCoverage){
   if(!row||typeof row.participant!=='string'||coverage.has(row.participant)||typeof row.complete!=='boolean'||!Array.isArray(row.problems)||instant(row.coverageFrom)!==instant(packet.coverageFrom)||instant(row.confirmedThrough)!==instant(packet.confirmedThrough)||row.complete&&row.problems.length)throw Error('ACCOUNTING_COVERAGE_INVALID');
   coverage.set(row.participant,row);
  }
 }
 const accountReady=participant=>accountCoverage===null?packet.complete===true:coverage.get(participant)?.complete===true;
 const ledgers=[],problems=[],end=now()+budgetMs,target=Date.parse(packet.confirmedThrough);
 if(!Number.isFinite(target))throw Error('ACCOUNTING_PERIOD_INVALID');
 const initial=jobs.getCheckpoint('cursor'),offset=Number.isInteger(initial?.next)?initial.next%Math.max(accounts.length,1):0;
 let attempted=0,notStarted=0;
 const noTrades=new Set();
 const verified=new Map(),staged=[],anchorChecks=new Map();
 const evidenceFor=(a,wallets,periodStart,through)=>{
  const eligible=eligibleCompetitionFills(snapshot,packet,wallets,periodStart,through);
  const references=snapshot.references.filter(r=>r.participant===a.participant&&Date.parse(r.ref.executedAt)<=Date.parse(through));
  return {eligible,references,fingerprint:hash({periodStart,through,wallets,markets:snapshot.manifest.markets,references,eligible})};
 };
 const contexts=accounts.map(a=>{
  const periodStart=exactStart(packet.coverageFrom,entries.get(a.participant)?.entered_at||packet.coverageFrom);
  const wallets=snapshot.wallets.filter(w=>w.participant===a.participant).map(w=>w.trade_wallet).sort();
  return {a,periodStart,wallets,identity:{wallets,periodStart},...evidenceFor(a,wallets,periodStart,packet.confirmedThrough)};
 });
 // Complete trade coverage can prove an entrant has no qualifying activity.
 // Keep them NULL/unranked instead of inventing a zero return or reconstructing
 // an unrelated personal portfolio. SQL independently repeats this classification
 // against the post-correction fill set; no client exemption list is submitted.
 for(const c of contexts)if(accountReady(c.a.participant)&&['active','closed'].includes(snapshot.manifest.campaign.state)&&snapshot.manifest.campaign.ends_at&&c.wallets.length&&instant(c.periodStart)<=instant(packet.confirmedThrough)&&c.eligible.length===0){
  noTrades.add(c.a.participant);sweep.setCheckpoint(c.a.participant,null);
 }
 const allCovered=()=>verified.size+noTrades.size===accounts.length;
 const validAnchor=a=>a&&/^0x[0-9a-f]+$/i.test(a.number)&&/^0x[0-9a-f]{64}$/i.test(a.hash);
 async function verifyAnchor(anchor){
  const key=anchor.number+':'+anchor.hash;
  if(!anchorChecks.has(key))anchorChecks.set(key,(async()=>{
   const source=sourceFactory({accountingCache:cache,accountingAnchor:anchor,accountingPriorAnchors:[]});
   return source.withDeadline(end,async()=>{const canonical=await source.block(anchor.number);if(canonical.hash!==anchor.hash)throw Error('ACCOUNTING_ANCHOR_CHANGED');});
  })());
  return anchorChecks.get(key);
 }
 // A marker is only an acknowledgement of previously committed, freshly
 // verified evidence. It stores no ledger or score and expires after four hours.
 // A live trade scan can take twenty minutes before each bounded accounting
 // slice. Keep the sweep finite without expiring its first accounts mid-sweep.
 // Exact DB revision plus our post-commit acknowledgement prevents another
 // worker's same-revision write from validating an uncommitted local result.
 for(const context of contexts){
  const {a,periodStart,fingerprint}=context,marker=sweep.getCheckpoint(a.participant);
  if(!accountReady(a.participant)){sweep.setCheckpoint(a.participant,null);continue;}
  if(noTrades.has(a.participant))continue;
  if(!marker)continue;
  const age=now()-marker.checkedAt;
  if(marker.committed!==true||marker.participant!==a.participant||marker.periodStart!==periodStart||accountingStartMillis(periodStart)>target||marker.through!==packet.confirmedThrough||marker.fingerprint!==fingerprint||!Number.isFinite(age)||age<0||age>VERIFICATION_MAX_AGE_MS||!Number.isSafeInteger(marker.ledgerRevision)||Number(snapshot.accountingRevisions?.[a.participant]||0)!==marker.ledgerRevision||!validAnchor(marker.anchor)){
   sweep.setCheckpoint(a.participant,null);continue;
  }
  try{await verifyAnchor(marker.anchor);verified.set(a.participant,marker);}
  catch{sweep.setCheckpoint(a.participant,null);}
 }
 const anchors=new Map();
 async function getAnchor(through){if(!anchors.has(through))anchors.set(through,await anchorAt(Date.parse(through),end));return anchors.get(through);}
 for(let n=0;n<accounts.length;n++){
  const index=(offset+n)%accounts.length,{a,periodStart,wallets,identity}=contexts[index];
  if(!accountReady(a.participant)){problems.push({code:'ACCOUNT_TRADE_COVERAGE_PENDING'});continue;}
  if(noTrades.has(a.participant))continue;
  if(instant(periodStart)>instant(packet.confirmedThrough)){notStarted++;continue;}
  if(now()>=end){if(!allCovered())problems.push({code:'ACCOUNTING_TIME_BUDGET_EXCEEDED'});break;}
  const previous=jobs.getCheckpoint(identity);
  let job=previous&&Number.isFinite(Date.parse(previous.through))&&Date.parse(previous.through)>=Date.parse(periodStart)&&Date.parse(previous.through)<=target?previous:null;
  const priorAnchors=job?.priorAnchors||[];
  if(job?.finished&&job.through!==packet.confirmedThrough){priorAnchors.unshift(job.anchor);job=null;}
  const through=job?.through||packet.confirmedThrough;
  const {eligible,references,fingerprint}=evidenceFor(a,wallets,periodStart,through);
  // A new attempt must stand on its own. A timeout, correction or source error
  // cannot leave an earlier successful marker confirming this account.
  verified.delete(a.participant);sweep.setCheckpoint(a.participant,null);
  try{
   // A chain anchor pins blocks, not Explorer index completeness. Even a
   // previously finished ledger needs fresh public-history verification.
   const anchor=job?.anchor||await getAnchor(through);
   const prior=[...new Map(priorAnchors.filter(Boolean).map(x=>[x.hash,x])).values()].slice(0,4);
   const source=sourceFactory({accountingCache:cache,accountingAnchor:anchor,accountingPriorAnchors:prior});
   attempted++;jobs.setCheckpoint('cursor',{next:(index+1)%Math.max(accounts.length,1)});
   if(!job||job.fingerprint!==fingerprint){job={through,anchor,priorAnchors:prior,fingerprint,finished:false};jobs.setCheckpoint(identity,job);}
   const deadline=Math.min(end,now()+sliceMs);
   const ledger=await source.withDeadline(deadline,async()=>{
    // Explicit numeric block read forces the source's saved-anchor check even
    // when the ledger itself is already reconstructed.
    const canonical=await source.block(anchor.number);
    if(canonical.hash!==anchor.hash)throw Error('ACCOUNTING_ANCHOR_CHANGED');
    return reconstructLedger({participant:a.participant,wallets,from:Date.parse(periodStart),periodStart,through:Date.parse(through),
     markets:snapshot.manifest.markets,references,eligible,source,priorRevision:snapshot.accountingRevisions?.[a.participant]||0});
   });
   // Persist scheduling/progress only. RPC facts remain cached independently;
   // derived scores never substitute for checking corrected public evidence.
   jobs.setCheckpoint(identity,{through,anchor,priorAnchors:prior,fingerprint,finished:true});
   if(ledger.complete!==true||ledger.participant!==a.participant||ledger.periodStart!==periodStart||Date.parse(ledger.confirmedThrough)!==Date.parse(through)||!Number.isSafeInteger(ledger.revision)||ledger.revision!==Number(snapshot.accountingRevisions?.[a.participant]||0)+1||typeof ledger.requestId!=='string')throw Error('ACCOUNTING_LEDGER_IDENTITY_INVALID');
   if(through===packet.confirmedThrough){
    const marker={participant:a.participant,periodStart,through,anchor,fingerprint,ledgerRevision:ledger.revision,requestId:ledger.requestId,checkedAt:now(),committed:false};
    sweep.setCheckpoint(a.participant,marker);staged.push(marker);verified.set(a.participant,marker);
   }
   ledgers.push(ledger);
   // Once a fresh attempt completes the sweep, do not spend the remaining
   // slice replacing another valid marker and risk undoing the completed set.
   if(allCovered())break;
  }catch(e){
   if(['ACCOUNTING_ANCHOR_CHANGED','ACCOUNTING_CACHE_ANCHOR_CHANGED','ACCOUNTING_ANCHOR_REORG'].includes(e.message))jobs.setCheckpoint(identity,{through:packet.confirmedThrough,finished:false,priorAnchors:[]});
   problems.push({code:code(e)});
  }
 }
 // Every entrant still needs an exact-cutoff disposition. Only independently
 // verified zero-trade accounts may have NULL scores without an accounting ledger.
 for(const [participant,marker]of verified){const age=now()-marker.checkedAt;
  if(!Number.isFinite(age)||age<0||age>VERIFICATION_MAX_AGE_MS){verified.delete(participant);sweep.setCheckpoint(participant,null);}
 }
 function confirmCommit(rejectedParticipants=[]){
  const rejected=new Set(rejectedParticipants);
  let confirmed=0;
  for(const marker of staged){const current=sweep.getCheckpoint(marker.participant);
   if(current?.committed===false&&hash(current)===hash(marker)){
    if(rejected.has(marker.participant)){sweep.setCheckpoint(marker.participant,null);continue;}
    sweep.setCheckpoint(marker.participant,{...marker,committed:true});confirmed++;
   }
  }
  return confirmed;
 }
 const entrantsPresent=snapshot.manifest.campaign.state==='draft'||accounts.length===entries.size;
 return {ledgers,problems,complete:packet.complete===true&&accounts.length>0&&entrantsPresent&&allCovered(),attempted,completed:verified.size,noTrades:noTrades.size,notStarted,total:entries.size||accounts.length,confirmCommit};
}
module.exports={accountingCycle,exactStart,eligibleCompetitionFills};
