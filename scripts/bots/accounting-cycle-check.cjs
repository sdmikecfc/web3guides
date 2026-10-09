'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {accountingCycle,exactStart,eligibleCompetitionFills}=require('./lib/accounting-cycle.cjs');
const start='2026-10-06T14:00:00Z',entry='2026-10-06T14:00:00.000739Z',through='2026-10-07T06:00:00Z';
function memory(){const spaces=new Map();return {namespace(config){const id=JSON.stringify(config);if(!spaces.has(id))spaces.set(id,new Map());const rows=spaces.get(id);return {getCheckpoint:k=>rows.get(JSON.stringify(k)),setCheckpoint:(k,v)=>{rows.set(JSON.stringify(k),JSON.parse(JSON.stringify(v)));return true;}};}};}
const wallet=i=>'0x'+i.toString(16).padStart(40,'0');
const market={chain_id:97477,domain_token:wallet(90),quote_token:wallet(91)};
const fill=i=>({chainId:97477,domainToken:market.domain_token,quoteToken:market.quote_token,status:'verified',wallet:wallet(i),executedAt:'2026-10-06T20:00:00Z',economicId:'fill-'+i,revision:1});
const snapshot={manifest:{campaign:{state:'active',ends_at:'2026-11-03T14:00:00Z'},participants:[1,2,3,4].map(i=>({participant:String(i),entered_at:entry})),markets:[market]},accounts:[1,2,3,4].map(i=>({participant:String(i)})),wallets:[1,2,3,4].map(i=>({participant:String(i),trade_wallet:wallet(i)})),references:[],accountingRevisions:{}};
const packet={coverageFrom:start,confirmedThrough:through,complete:true,fills:[1,2,3,4].map(fill)};
const anchor={number:'0x100',hash:'0x'+'a'.repeat(64)};
function sweepFixture(){
 const state={clock:1000,snapshot:structuredClone(snapshot),packet:structuredClone(packet),cache:memory(),fail:null,anchor,checks:0,calls:[],serial:0};
 state.run=(options={})=>accountingCycle({snapshot:state.snapshot,packet:state.packet,cache:state.cache,budgetMs:120,sliceMs:60,now:()=>state.clock,anchorAt:async()=>state.anchor,
  sourceFactory:()=>({block:async()=>{state.checks++;return state.anchor;},withDeadline:async(deadline,task)=>{try{return await task();}finally{if(state.clock>deadline)throw Error('ACCOUNTING_TIME_BUDGET_EXCEEDED');}}}),
  reconstructLedger:async p=>{state.calls.push(p.participant);state.clock+=60;if(p.participant===state.fail)throw Error('PUBLIC_HISTORY_CORRECTED');return {participant:p.participant,periodStart:p.periodStart,confirmedThrough:new Date(p.through).toISOString(),requestId:'request-'+(++state.serial),revision:p.priorRevision+1,complete:true,openingLots:[],events:[]};},...options});
 state.commit=result=>{for(const l of result.ledgers)state.snapshot.accountingRevisions[l.participant]=l.revision;result.confirmCommit();};
 return state;
}
async function sweepChecks(){
 let s=sweepFixture(),a=await s.run();assert.equal(a.complete,false);assert.equal(a.ledgers.length,2);s.commit(a);
 const priorChecks=s.checks;s.calls=[];let b=await s.run();assert.deepEqual(s.calls,['3','4'],'restart progresses to remaining participants');assert.equal(b.ledgers.length,2);assert.equal(b.completed,4);assert.equal(b.complete,true,'prior committed fresh verification and current ledgers form one exact-cutoff sweep');assert.ok(s.checks>priorChecks+2,'prior marker anchor was freshly revalidated');s.commit(b);
 s.calls=[];const c=await s.run();assert.deepEqual(s.calls,['1'],'a fully verified sweep still makes one fresh reconstruction attempt before stopping');assert.equal(c.complete,true);assert.equal(c.confirmCommit(),1);assert.equal(c.confirmCommit(),0,'acknowledgement is idempotent');
 s=sweepFixture();a=await s.run();s.commit(a);s.calls=[];
 b=await s.run({budgetMs:180,reconstructLedger:async p=>{s.calls.push(p.participant);if(p.participant==='1'){s.clock+=61;throw Error('ACCOUNTING_TIME_BUDGET_EXCEEDED');}s.clock+=10;return {participant:p.participant,periodStart:p.periodStart,confirmedThrough:new Date(p.through).toISOString(),requestId:'request-'+(++s.serial),revision:p.priorRevision+1,complete:true,openingLots:[],events:[]};}});
 assert.equal(b.complete,true);assert.deepEqual(s.calls,['3','4'],'finishing the last missing account stops before an unnecessary recheck can time out and invalidate another good marker');
 // Simulate a failed commit followed by another writer using those revisions.
 s=sweepFixture();a=await s.run();for(const l of a.ledgers)s.snapshot.accountingRevisions[l.participant]=l.revision;
 b=await s.run();assert.equal(b.complete,false,'revision equality cannot acknowledge a failed or read-only commit');
 // An acknowledged marker cannot survive a later DB revision or source change.
 s=sweepFixture();a=await s.run();s.commit(a);s.snapshot.accountingRevisions['1']++;b=await s.run();assert.equal(b.complete,false);
 for(const change of [
  s=>s.packet.fills.push({...fill(1),economicId:'correction',revision:2}),
  s=>s.snapshot.references.push({participant:'1',ref:{executedAt:'2026-10-06T20:00:00Z',revision:2}}),
  s=>{s.snapshot.wallets.find(w=>w.participant==='1').trade_wallet=wallet(9);s.packet.fills[0].wallet=wallet(9);},
  s=>s.snapshot.manifest.markets.push({domain_token:wallet(90),quote_token:wallet(91)}),
  s=>s.clock+=4*60*60*1000+1,
  s=>s.anchor={...anchor,hash:'0x'+'b'.repeat(64)},
 ]){s=sweepFixture();a=await s.run();s.commit(a);change(s);b=await s.run();assert.equal(b.complete,false,'correction, identity, age or anchor changes invalidate prior verification');}
 s=sweepFixture();a=await s.run();s.commit(a);b=await s.run();s.commit(b);s.fail='1';let failed=await s.run();assert.equal(failed.complete,false,'fresh failed verification invalidates an older good marker');s.commit(failed);
 failed=await s.run();assert.equal(failed.complete,false,'failure invalidation survives the next process/cursor cycle');
 s=sweepFixture();a=await s.run();s.commit(a);s.packet={...s.packet,confirmedThrough:'2026-10-07T10:00:00Z'};b=await s.run();assert.equal(b.complete,false,'old-cutoff markers never confirm a newer batch');s.commit(b);a=await s.run();assert.equal(a.complete,true,'all participants can independently catch up to the same new cutoff');
 s=sweepFixture();a=await s.run();s.commit(a);s.clock+=4*60*60*1000-100;b=await s.run();assert.equal(b.complete,false,'marker freshness is rechecked after work, including expiry during the cycle');
 s=sweepFixture();a=await s.run();s.commit(a);s.clock+=2*60*60*1000;b=await s.run();assert.equal(b.complete,true,'a bounded fixed-cutoff sweep can finish across slow trade-scan cycles');
 // A callback from an old operation cannot acknowledge a replacement marker.
 s=sweepFixture();a=await s.run();await s.run();await s.run();assert.equal(a.confirmCommit(),0);
 s=sweepFixture();const invalid=await s.run({reconstructLedger:async p=>{s.clock+=60;return {participant:p.participant,periodStart:p.periodStart,confirmedThrough:new Date(p.through).toISOString(),requestId:'bad',revision:99,complete:true};}});assert.equal(invalid.ledgers.length,0);assert.equal(invalid.complete,false);assert.ok(invalid.problems.some(p=>p.code==='ACCOUNTING_LEDGER_IDENTITY_INVALID'));
 console.log('PASS accounting verification sweep: partial committed runs, restart, exact revisions/cutoff, failed commit collision, correction/identity/freshness/reorg invalidation, fresh failures and stale acknowledgement rejection.');
}
async function main(){
 assert.equal(exactStart(start,entry),entry,'never truncate enrollment microseconds');
 assert.equal(exactStart('2026-10-06T14:00:00.000800Z',entry),'2026-10-06T14:00:00.000800Z','later campaign microseconds win too');
 let clock=0,calls=[],cached=memory(),blocked=true;
 const run=overrides=>accountingCycle({snapshot,packet,cache:cached,budgetMs:180,sliceMs:60,now:()=>clock,anchorAt:async()=>anchor,
  sourceFactory:()=>({block:async()=>anchor,withDeadline:async(deadline,task)=>{try{return await task();}finally{if(clock>deadline)throw Error('ACCOUNTING_TIME_BUDGET_EXCEEDED');}}}),
  reconstructLedger:async p=>{calls.push(p.participant);assert.equal(p.periodStart,entry);clock+=blocked?60:1;if(blocked)throw Error('ACCOUNTING_TIME_BUDGET_EXCEEDED');return {participant:p.participant,periodStart:p.periodStart,confirmedThrough:new Date(p.through).toISOString(),requestId:'old',revision:1,complete:true,openingLots:[],events:[]};},...overrides});
 let result=await run();assert.deepEqual(calls,['1','2','3']);assert.equal(result.complete,false);
 calls=[];result=await run();assert.deepEqual(calls,['4','1','2'],'restart resumes fair account order instead of starving later accounts');
 blocked=false;calls=[];result=await run();assert.equal(result.complete,true);assert.equal(result.ledgers.length,4);
 calls=[];result=await run();assert.equal(result.complete,true);assert.equal(calls.length,4,'completed ledgers still recheck public history even when private evidence and anchor match');
 assert.ok(result.ledgers.every(l=>l.participant&&l.revision===1));
 const corrected={...packet,fills:packet.fills.map(f=>f.wallet===wallet(2)?{...f,revision:2}:f)};
 calls=[];await run({packet:corrected});assert.equal(calls.length,4,'private and public corrections both require reconstruction from verified evidence');
 // Old pending jobs may finish, but cannot confirm newer volume coverage.
 cached=memory();blocked=true;calls=[];await run();blocked=false;calls=[];
 const advanced={...packet,confirmedThrough:'2026-10-07T10:00:00Z'};
 result=await run({packet:advanced});assert.equal(result.complete,false);assert.ok(result.ledgers.some(l=>l.confirmedThrough===new Date(through).toISOString()));
 result=await run({packet:advanced});assert.equal(result.complete,true);
 const future={...snapshot,manifest:{...snapshot.manifest,participants:snapshot.manifest.participants.map(e=>({...e,entered_at:'2026-10-08T00:00:00Z'}))}};
 calls=[];result=await run({snapshot:future});assert.equal(result.notStarted,4);assert.equal(result.complete,false);assert.deepEqual(calls,[]);
 result=await run({sourceFactory:()=>({block:async()=>({...anchor,hash:'0x'+'b'.repeat(64)}),withDeadline:async(_d,task)=>task()})});assert.equal(result.complete,false);assert.ok(result.problems.every(p=>p.code==='ACCOUNTING_ANCHOR_CHANGED'));
 await sweepChecks();
 await scopeChecks();
 await isolationChecks();
 await defaultBudgetChecks();
 await upgradeChecks();
 console.log('PASS accounting scheduling: exact entry timestamp, restart fairness, bounded slices, fresh public-history verification, correction invalidation, cutoff catch-up, future entries and anchor rejection.');
}
async function upgradeChecks(){
 const later='2026-10-07T10:00:00Z',oldAnchor={number:'0xf0',hash:'0x'+'c'.repeat(64)};
 for(const finished of [false,true]){
  const s=sweepFixture();s.packet.confirmedThrough=later;
  const jobs=s.cache.namespace({kind:'accounting',scope:{purpose:'mk-accounting-jobs-1',engine:'mk-accounting-resumable-1'}});
  jobs.setCheckpoint({wallets:[wallet(1)],periodStart:entry},{through,anchor:oldAnchor,priorAnchors:[],fingerprint:'prior-private-evidence',finished});
  const sources=[];const r=await s.run({sourceFactory:options=>{sources.push(options);return {block:async()=>options.accountingAnchor,withDeadline:async(_deadline,task)=>task()};}});
  assert.equal(r.ledgers[0].confirmedThrough,new Date(finished?later:through).toISOString());
  if(finished)assert.deepEqual(sources[0].accountingPriorAnchors,[oldAnchor],'finished v7 pointer forwards its immutable-evidence anchor to the newer cutoff');
  else assert.deepEqual(sources[0].accountingAnchor,oldAnchor,'pending v7 job resumes its exact saved cutoff and anchor');
 }
 const s=sweepFixture();s.snapshot.accountingRevisions['1']=1;
 const old=s.cache.namespace({kind:'accounting',scope:{purpose:'mk-accounting-verification-1',engine:'mk-accounting-resumable-1',campaign:'model-kombat-zones-1'}});
 const fingerprint=createHash('sha256').update(JSON.stringify({periodStart:entry,through,wallets:[wallet(1)],markets:s.snapshot.manifest.markets,references:[],eligible:[fill(1)]})).digest('hex');
 old.setCheckpoint('1',{participant:'1',periodStart:entry,through,anchor,fingerprint,ledgerRevision:1,requestId:'old-committed',checkedAt:s.clock,committed:true});
 const r=await s.run({budgetMs:60});assert.deepEqual(s.calls,['1']);assert.equal(r.ledgers[0].revision,2);assert.equal(r.completed,1);assert.equal(old.getCheckpoint('1').ledgerRevision,1,'worker8 leaves old acknowledgements unused and reconstructs anew');
 console.log('PASS worker7 upgrade: pending cutoff and prior anchors preserve raw cache reuse; old completion acknowledgements cannot certify the new financial scope.');
}
async function defaultBudgetChecks(){
 const s=sweepFixture();
 const reconstructLedger=async p=>{s.calls.push(p.participant);s.clock+=15*60*1000;return {participant:p.participant,periodStart:p.periodStart,confirmedThrough:new Date(p.through).toISOString(),requestId:'long-'+(++s.serial),revision:p.priorRevision+1,complete:true};};
 let r=await s.run({budgetMs:undefined,sliceMs:undefined,reconstructLedger});assert.equal(r.ledgers.length,2);assert.equal(r.complete,false);assert.deepEqual(s.calls,['1','2'],'thirty-minute total budget remains bounded while a fifteen-minute account can finish');s.commit(r);
 s.calls=[];r=await s.run({budgetMs:undefined,sliceMs:undefined,reconstructLedger});assert.deepEqual(s.calls,['3','4']);assert.equal(r.complete,true,'fair restart reaches remaining accounts inside bounded verification freshness');
 const slow=sweepFixture();r=await slow.run({budgetMs:undefined,sliceMs:undefined,reconstructLedger:async p=>{slow.clock+=20*60*1000+1;return {participant:p.participant,periodStart:p.periodStart,confirmedThrough:new Date(p.through).toISOString(),requestId:'too-slow',revision:1,complete:true};}});assert.equal(r.ledgers.length,0);assert.equal(r.complete,false);assert.ok(r.problems.some(p=>p.code==='ACCOUNTING_TIME_BUDGET_EXCEEDED'),'twenty-minute per-account limit still rejects late results');
 console.log('PASS production accounting budgets: finite twenty-minute account / thirty-minute cycle limits allow measured long histories, retain cancellation and rotate fairly.');
}
async function scopeChecks(){
 let s=sweepFixture();s.packet.fills=[];
 let r=await s.run();assert.equal(r.complete,true);assert.equal(r.noTrades,4);assert.equal(r.completed,0);assert.deepEqual(r.ledgers,[]);assert.deepEqual(s.calls,[],'proven non-traders do not reconstruct unrelated portfolios');
 s.packet.fills=[fill(1)];r=await s.run();assert.equal(r.complete,true);assert.equal(r.noTrades,3);assert.deepEqual(s.calls,['1'],'a newly discovered eligible buy needs accounting even with no eligible sales');s.commit(r);
 s.packet.fills=[{...fill(1),status:'revoked',revision:2}];s.calls=[];r=await s.run();assert.equal(r.completed,0);assert.equal(r.noTrades,4);assert.deepEqual(s.calls,[],'revoking all activity removes rather than reuses its prior score marker');
 s.packet.fills=[{...fill(1),revision:3}];s.fail='1';r=await s.run();assert.equal(r.complete,false);assert.equal(r.noTrades,3);assert.equal(r.completed,0,'restored activity cannot inherit the zero-trade disposition');
 for(const change of [s=>s.packet.complete=false,s=>s.snapshot.manifest.campaign.state='draft',s=>s.snapshot.manifest.campaign.ends_at=null,s=>s.snapshot.wallets=[]]){s=sweepFixture();s.packet.fills=[];change(s);r=await s.run();assert.equal(r.noTrades,0,'incomplete coverage, draft, missing end or missing wallet association never proves no trades');}
 s=sweepFixture();s.packet.fills=[];s.snapshot.manifest.participants[0].entered_at='2026-10-08T00:00:00Z';r=await s.run();assert.equal(r.complete,false);assert.equal(r.notStarted,1);assert.equal(r.noTrades,3);
 const boundary={...packet,confirmedThrough:'2026-10-06T14:00:00.001000Z',fills:[
  {...fill(1),executedAt:'2026-10-06T14:00:00.000738Z'},
  {...fill(1),executedAt:entry},
  {...fill(1),executedAt:'2026-10-06T14:00:00.001000Z'},
  {...fill(1),executedAt:'2026-10-06T14:00:00.001001Z'},
  {...fill(1),executedAt:entry,chainId:1},
  {...fill(1),executedAt:entry,quoteToken:wallet(92)},
  {...fill(1),executedAt:entry,wallet:wallet(2)},
  {...fill(1),executedAt:entry,status:'revoked'},
 ]};
 assert.equal(eligibleCompetitionFills(snapshot,boundary,[wallet(1)],entry,boundary.confirmedThrough).length,2,'precise entry, cutoff, wallet, registered pair, chain and revocation rules match SQL');
 const closed=structuredClone(snapshot);closed.manifest.campaign.ends_at=boundary.confirmedThrough;
 assert.equal(eligibleCompetitionFills(closed,boundary,[wallet(1)],entry,boundary.confirmedThrough).length,1,'closing time is exclusive');
 console.log('PASS financial scope: complete zero-trade accounts remain unranked without history reads; new/corrected activity, missing coverage, future entries and exact eligible boundaries require independent verification.');
}
async function isolationChecks(){
 const s=sweepFixture();s.packet.complete=false;
 const coverage=[1,2,3,4].map(i=>({participant:String(i),coverageFrom:start,confirmedThrough:through,complete:i!==2,problems:i===2?['SMART_ROUTER_CALLDATA_INVALID']:[]}));
 let r=await s.run({accountCoverage:coverage,budgetMs:1000});
 assert.deepEqual(s.calls,['1','3','4']);assert.equal(r.ledgers.length,3);assert.equal(r.completed,3);assert.equal(r.complete,false,'partial results never finalize all financial awards');s.commit(r);
 s.calls=[];s.packet.fills=[];r=await s.run({accountCoverage:coverage,budgetMs:1000});assert.equal(r.noTrades,3);assert.deepEqual(s.calls,[]);assert.equal(r.complete,false,'failed trade coverage never becomes a confirmed zero-trade account');
 s.packet.fills=[fill(1),fill(2),fill(3),fill(4)];s.fail='3';s.calls=[];r=await s.run({accountCoverage:coverage,budgetMs:1000});assert.equal(r.ledgers.length,2);assert.deepEqual(r.ledgers.map(l=>l.participant),['1','4'],'independent FIFO failure cannot remove successful accounts');
 for(const changed of [coverage.map(a=>({...a,confirmedThrough:'2026-10-07T07:00:00Z'})),[...coverage,coverage[0]],coverage.map(a=>a.participant==='1'?{...a,problems:['BAD']}:a)])await assert.rejects(()=>s.run({accountCoverage:changed}),/ACCOUNTING_COVERAGE_INVALID/);
 const missing=sweepFixture();missing.packet.complete=false;const pending=await missing.run();assert.equal(pending.ledgers.length,0,'partial batch without per-account proof never grants verification');
 const reject=sweepFixture(),staged=await reject.run();
 assert.equal(staged.confirmCommit(['1']),1,'SQL rejection acknowledges only successfully saved ledgers');
 reject.snapshot.accountingRevisions['2']=1;reject.calls=[];
 const after=await reject.run();assert.equal(after.completed,3);assert.equal(after.complete,false,'rejected account cannot form a completed sweep from a failed submission');
 console.log('PASS independent accounting: only complete participant windows are reconstructed; good ledgers survive other trade/FIFO failures; no zero-score exemption or final-award bypass.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
