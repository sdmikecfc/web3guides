'use strict';
const assert=require('node:assert/strict');
const {accountingCycle,exactStart}=require('./lib/accounting-cycle.cjs');
const start='2026-10-06T14:00:00Z',entry='2026-10-06T14:00:00.000739Z',through='2026-10-07T06:00:00Z';
function memory(){const spaces=new Map();return {namespace(config){const id=JSON.stringify(config);if(!spaces.has(id))spaces.set(id,new Map());const rows=spaces.get(id);return {getCheckpoint:k=>rows.get(JSON.stringify(k)),setCheckpoint:(k,v)=>{rows.set(JSON.stringify(k),JSON.parse(JSON.stringify(v)));return true;}};}};}
const wallet=i=>'0x'+i.toString(16).padStart(40,'0');
const snapshot={manifest:{campaign:{state:'active'},participants:[1,2,3,4].map(i=>({participant:String(i),entered_at:entry})),markets:[]},accounts:[1,2,3,4].map(i=>({participant:String(i)})),wallets:[1,2,3,4].map(i=>({participant:String(i),trade_wallet:wallet(i)})),references:[],accountingRevisions:{}};
const packet={coverageFrom:start,confirmedThrough:through,fills:[]};
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
  s=>s.packet.fills.push({status:'verified',wallet:wallet(1),executedAt:'2026-10-06T20:00:00Z',economicId:'correction',revision:2}),
  s=>s.snapshot.references.push({participant:'1',ref:{executedAt:'2026-10-06T20:00:00Z',revision:2}}),
  s=>s.snapshot.wallets.find(w=>w.participant==='1').trade_wallet=wallet(9),
  s=>s.snapshot.manifest.markets.push({domain_token:wallet(90),quote_token:wallet(91)}),
  s=>s.clock+=60*60*1000+1,
  s=>s.anchor={...anchor,hash:'0x'+'b'.repeat(64)},
 ]){s=sweepFixture();a=await s.run();s.commit(a);change(s);b=await s.run();assert.equal(b.complete,false,'correction, identity, age or anchor changes invalidate prior verification');}
 s=sweepFixture();a=await s.run();s.commit(a);b=await s.run();s.commit(b);s.fail='1';let failed=await s.run();assert.equal(failed.complete,false,'fresh failed verification invalidates an older good marker');s.commit(failed);
 failed=await s.run();assert.equal(failed.complete,false,'failure invalidation survives the next process/cursor cycle');
 s=sweepFixture();a=await s.run();s.commit(a);s.packet={...s.packet,confirmedThrough:'2026-10-07T10:00:00Z'};b=await s.run();assert.equal(b.complete,false,'old-cutoff markers never confirm a newer batch');s.commit(b);a=await s.run();assert.equal(a.complete,true,'all participants can independently catch up to the same new cutoff');
 s=sweepFixture();a=await s.run();s.commit(a);s.clock+=60*60*1000-100;b=await s.run();assert.equal(b.complete,false,'marker freshness is rechecked after work, including expiry during the cycle');
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
 const corrected={...packet,fills:[{status:'verified',wallet:wallet(2),executedAt:'2026-10-06T20:00:00Z',economicId:'correction',revision:2}]};
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
 console.log('PASS accounting scheduling: exact entry timestamp, restart fairness, bounded slices, fresh public-history verification, correction invalidation, cutoff catch-up, future entries and anchor rejection.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
