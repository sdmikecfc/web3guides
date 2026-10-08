'use strict';
const {createHash}=require('node:crypto');
const {reconstruct,accountingStartMillis}=require('./public-accounting.cjs');
const ENGINE_VERSION='mk-accounting-resumable-1';
const VERIFICATION_MAX_AGE_MS=60*60*1000;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const code=e=>/^[A-Z][A-Z0-9_]{2,100}$/.test(e?.message)?e.message:'ACCOUNTING_SOURCE_UNAVAILABLE';
function exactStart(campaignStart,enteredAt){
 if(!Number.isFinite(Date.parse(campaignStart))||!Number.isFinite(Date.parse(enteredAt)))throw Error('ACCOUNTING_PERIOD_INVALID');
 const precise=value=>BigInt(Date.parse(value))*1000000n+BigInt(((String(value).match(/\.(\d+)(?:Z|[+-]\d\d:\d\d)$/)?.[1]||'').padEnd(9,'0').slice(3,9))||'0');
 return precise(enteredAt)>=precise(campaignStart)?enteredAt:campaignStart;
}
// Per-account work survives process restarts. Raw evidence lives in a separate
// bounded cache; this checkpoint cannot certify incomplete financial results.
async function accountingCycle({snapshot,packet,cache,sourceFactory,anchorAt,budgetMs=360000,sliceMs=300000,now=Date.now,reconstructLedger=reconstruct}){
 const jobs=cache.namespace({kind:'accounting',scope:{purpose:'mk-accounting-jobs-1',engine:ENGINE_VERSION}});
 const campaign=snapshot.manifest.campaign.id||packet.campaignId||'model-kombat-zones-1';
 const sweep=cache.namespace({kind:'accounting',scope:{purpose:'mk-accounting-verification-1',engine:ENGINE_VERSION,campaign}});
 const entries=new Map(snapshot.manifest.participants.map(e=>[e.participant,e]));
 const accounts=snapshot.accounts.filter(a=>snapshot.manifest.campaign.state==='draft'||entries.has(a.participant)).sort((a,b)=>a.participant.localeCompare(b.participant));
 const ledgers=[],problems=[],end=now()+budgetMs,target=Date.parse(packet.confirmedThrough);
 if(!Number.isFinite(target))throw Error('ACCOUNTING_PERIOD_INVALID');
 const initial=jobs.getCheckpoint('cursor'),offset=Number.isInteger(initial?.next)?initial.next%Math.max(accounts.length,1):0;
 let attempted=0,notStarted=0;
 const verified=new Map(),staged=[],anchorChecks=new Map();
 const evidenceFor=(a,wallets,periodStart,through)=>{
  const eligible=packet.fills.filter(f=>f.status==='verified'&&wallets.includes(f.wallet)&&Date.parse(f.executedAt)>=accountingStartMillis(periodStart)&&Date.parse(f.executedAt)<=Date.parse(through));
  const references=snapshot.references.filter(r=>r.participant===a.participant&&Date.parse(r.ref.executedAt)<=Date.parse(through));
  return {eligible,references,fingerprint:hash({periodStart,through,wallets,markets:snapshot.manifest.markets,references,eligible})};
 };
 const contexts=accounts.map(a=>{
  const periodStart=exactStart(packet.coverageFrom,entries.get(a.participant)?.entered_at||packet.coverageFrom);
  const wallets=snapshot.wallets.filter(w=>w.participant===a.participant).map(w=>w.trade_wallet).sort();
  return {a,periodStart,wallets,identity:{wallets,periodStart},...evidenceFor(a,wallets,periodStart,packet.confirmedThrough)};
 });
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
 // verified evidence. It stores no ledger or score and expires after one hour.
 // Exact DB revision plus our post-commit acknowledgement prevents another
 // worker's same-revision write from validating an uncommitted local result.
 for(const context of contexts){
  const {a,periodStart,fingerprint}=context,marker=sweep.getCheckpoint(a.participant);
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
  if(now()>=end){if(verified.size!==accounts.length)problems.push({code:'ACCOUNTING_TIME_BUDGET_EXCEEDED'});break;}
  const index=(offset+n)%accounts.length,{a,periodStart,wallets,identity}=contexts[index];
  const lowerBound=accountingStartMillis(periodStart);
  if(lowerBound>target){notStarted++;continue;}
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
   if(verified.size===accounts.length)break;
  }catch(e){
   if(['ACCOUNTING_ANCHOR_CHANGED','ACCOUNTING_CACHE_ANCHOR_CHANGED','ACCOUNTING_ANCHOR_REORG'].includes(e.message))jobs.setCheckpoint(identity,{through:packet.confirmedThrough,finished:false,priorAnchors:[]});
   problems.push({code:code(e)});
  }
 }
 // Existing SQL intentionally requires all entrants at exactly one cutoff for
 // final/global financial completion. Partial ledgers remain independently useful.
 for(const [participant,marker]of verified){const age=now()-marker.checkedAt;
  if(!Number.isFinite(age)||age<0||age>VERIFICATION_MAX_AGE_MS){verified.delete(participant);sweep.setCheckpoint(participant,null);}
 }
 function confirmCommit(){
  let confirmed=0;
  for(const marker of staged){const current=sweep.getCheckpoint(marker.participant);
   if(current?.committed===false&&hash(current)===hash(marker)){sweep.setCheckpoint(marker.participant,{...marker,committed:true});confirmed++;}
  }
  return confirmed;
 }
 return {ledgers,problems,complete:accounts.length>0&&verified.size===accounts.length,attempted,completed:verified.size,notStarted,total:accounts.length,confirmCommit};
}
module.exports={accountingCycle,exactStart};
