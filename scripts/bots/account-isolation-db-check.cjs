'use strict';
// Fixed loopback PostgreSQL only. No production credentials, writes or RPC calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require(process.env.MK_ACCOUNT_ISOLATION_PGLITE||'./postgres-test-adapter.cjs'),{cases}=require('./public-accounting-scoped-check.cjs');
const migrations=['bots-workshop-v8','bots-workshop-journey','bots-workshop-competition','bots-workshop-wallet-links','bots-token-zones','bots-token-zone-wallets','bots-token-zone-payout-policy','bots-token-zone-collector','bots-token-zone-accounting','bots-token-zone-discovery','bots-token-zone-opening-basis','bots-token-zone-financial-scope','bots-token-zone-account-isolation'];
async function main(){const db=new PGlite();try{
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const call=async(name,p)=>(await q('select '+name+'($1::jsonb) v',[JSON.stringify(p)]))[0].v;
 const read=async name=>(await q('select '+name+'() v'))[0].v;
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test boolean default false,is_operator boolean default false)');
 for(const m of migrations)await db.exec(fs.readFileSync(path.join(__dirname,'../sql',m+'.sql'),'utf8'));
 const u=(await cases()).untouched,cid='model-kombat-zones-1',start='2026-10-01T00:00:00Z',entry='2026-10-01T00:00:15.000739Z',cutoff=u.ledger.confirmedThrough;
 const addr=n=>'0x'+n.toString(16).padStart(40,'0'),wallets={a:u.active,b:u.inactive,c:addr(80),d:addr(81),e:addr(82),f:addr(83)};
 const resolve=(participant,wallet,agent,revision=0)=>call('mkz_collector_resolve',{schemaVersion:1,requestId:randomUUID(),wallet,mcpWallet:agent,domaUserId:participant,privyDid:null,status:'linked',checkedAt:new Date().toISOString(),expectedRevision:revision});
 for(const[p,w,a]of [['123',wallets.a,wallets.b],['456',wallets.c,wallets.d],['789',wallets.e,wallets.f]]){await q('select mkz_register_wallet($1)',[w]);await resolve(p,w,a);}
 await q('alter table mkz_campaigns disable trigger mkz_campaign_guard');
 await q("update mkz_campaigns set state='active',starts_at=$1,ends_at=$1::timestamptz+interval '28 days',financial_method='mk-fifo-realized-capital-1'",[start]);
 await q('alter table mkz_campaigns enable trigger mkz_campaign_guard');
 for(const[p,w]of [['123',wallets.a],['456',wallets.c],['789',wallets.e]])await q('insert into mkz_entries values($1,$2,$3,$4)',[cid,p,w,entry]);
 for(const m of u.options.markets)await q('insert into mkz_markets values(97477,$1,$2,$3,$4,$5,now())',[m.domain_token,m.quote_token,'fixture.test','USDC','isolated account scope']);
 const refs=(participant,refs=[],confirmedThrough=cutoff,complete=true)=>call('mkz_discovery_references',{schemaVersion:1,requestId:randomUUID(),participant,coverageFrom:start,confirmedThrough,complete,problem:complete?null:'test source unavailable',refs});
 for(const p of ['123','456','789'])await refs(p);
 const fills=u.options.eligible.map((f,i)=>({chainId:97477,economicId:f.economicId,revision:1,wallet:f.wallet,transactionHash:f.transactionHash,domainToken:f.domainToken,quoteToken:f.quoteToken,executedAt:u.ledger.events.find(e=>e.economicId===f.economicId).executedAt,volumeUsd:f.volumeUsd,source:'strategy',status:'verified',evidence:'isolated fill '+i}));
 const mapWallet=w=>w===wallets.a?wallets.c:w===wallets.b?wallets.d:w;
 const fillsB=fills.map(f=>({...f,wallet:mapWallet(f.wallet),economicId:'b-'+f.economicId,transactionHash:'0x'+'a'.repeat(64)}));
 const packet={schemaVersion:1,rules:'mk-token-zones-1',campaignId:cid,requestId:randomUUID(),coverageFrom:start,confirmedThrough:cutoff,complete:false,financialComplete:false,financials:[],fills:[...fills,...fillsB]};
 const cov=(failed=['456'])=>['123','456','789'].map(participant=>({participant,coverageFrom:start,confirmedThrough:cutoff,complete:!failed.includes(participant),problems:failed.includes(participant)?['SOURCE_FAILED']:[]}));
 const ledgerA={...u.ledger,periodStart:entry};
 const ledgerB=JSON.parse(JSON.stringify(ledgerA));ledgerB.participant='456';ledgerB.requestId=randomUUID();for(const e of [...ledgerB.openingLots,...ledgerB.events]){e.wallet=mapWallet(e.wallet);if(e.toWallet)e.toWallet=mapWallet(e.toWallet);if(e.economicId)e.economicId='b-'+e.economicId;}
 const command=async(p=packet,accounting=[],accountCoverage=cov())=>({requestId:randomUUID(),fingerprint:(await read('mkz_worker_snapshot')).fingerprint,packet:{...p,requestId:randomUUID()},accounting,accountCoverage,report:{complete:p.complete,financialComplete:p.financialComplete}});
 const commit=async(p=packet,ledgers=[],coverage=cov())=>call('mkz_worker_commit',await command(p,ledgers,coverage));
 const scope=async p=>(await q('select mkz_financial_scope($1,$2,$3::timestamptz) v',[cid,p,cutoff]))[0].v;
 const board=async()=>(await q('select mkz_read(null) v'))[0].v;
 assert.equal((await scope('123')).status,'pending');
 await commit(packet,[ledgerA]);
 let financial=await read('mkz_verified_financials');assert.equal(financial.available,true);assert.equal(financial.checked,1);assert.equal(financial.pending,1);assert.equal(financial.noTrades,1);assert.equal(financial.rows[0].participant,'123');assert.equal(Number(financial.rows[0].profit),2);
 let view=await board(),good=view.participants.find(p=>p.participant==='123'),bad=view.participants.find(p=>p.participant==='456');
 assert.equal(view.accountScope,'per-account-coverage-1');assert.equal(view.campaign.complete,false);assert.equal(good.tradeComplete,true);assert.equal(bad.tradeComplete,false);assert.equal(bad.tradeProblem,true);assert.equal(bad.volume,null);assert.equal(view.volume,good.volume);assert.deepEqual(bad.times,[]);assert.equal(view.participants.find(p=>p.participant==='789').volume,'0');
 assert.equal((await scope('789')).status,'no_trades');assert.equal((await scope('456')).status,'pending');
 // A fresh heartbeat and future references do not invalidate verified history.
 await refs('123',[],'2026-10-01T01:00:00.000Z');assert.equal((await scope('123')).status,'trader');assert.equal((await read('mkz_verified_financials')).checked,1);
 const ref={id:'strategy:1',revision:1,chainId:97477,wallet:wallets.a,strategyId:'1',orderId:'1',transactionHash:'0x'+'8'.repeat(64),domainToken:fills[0].domainToken,quoteToken:fills[0].quoteToken,domainUnits:'1',quoteUnits:'1',side:'buy',executedAt:'2026-10-01T00:30:00.000Z',status:'verified',evidence:'isolated execution reference'};
 await refs('123',[ref],'2026-10-01T01:00:00.000Z');assert.equal((await scope('123')).status,'trader','future same-wallet reference leaves cutoff proof intact');
 // The same id corrected into verified coverage invalidates only its participant.
 await refs('123',[{...ref,revision:2,executedAt:fills[0].executedAt}],'2026-10-01T01:00:00.000Z');assert.equal((await scope('123')).status,'pending');assert.equal((await scope('789')).status,'no_trades');
 // Recheck with one invalid accounting ledger must keep the other's valid ledger.
 const badLedger={...ledgerA,requestId:randomUUID(),revision:2,events:ledgerA.events.map((e,i)=>i?e:{...e,kind:'made_up'})};
 const rejectedCommand=await command({...packet,complete:true},[badLedger,ledgerB],cov([]));
 let result=await call('mkz_worker_commit',rejectedCommand);
 assert.deepEqual((await call('mkz_worker_commit',rejectedCommand)).accountingRejected,result.accountingRejected,'idempotent retry must retain the rejected-ledger receipt');
 assert.equal(result.accountingRejected.length,1);assert.equal(result.accountingRejected[0].participant,'123');
 financial=await read('mkz_verified_financials');assert.equal(financial.checked,1);assert.equal(financial.rows[0].participant,'456');assert.equal(financial.pending,1);
 view=await board();assert.equal(view.participants.find(p=>p.participant==='123').financialProblem,true);assert.equal(view.participants.find(p=>p.participant==='123').tradeComplete,true);
 // Merely repeating complete trade coverage cannot erase a rejected ledger flag.
 await commit({...packet,complete:true},[],cov([]));assert.equal((await read('mkz_verified_financials')).rows[0].participant,'456');
 // A valid replacement restores only that account; complete finalization unchanged.
 const nextA={...ledgerA,requestId:randomUUID(),revision:2};await commit({...packet,complete:true},[nextA],cov([]));financial=await read('mkz_verified_financials');assert.equal(financial.checked,2);assert.equal(financial.noTrades,1);
 await commit({...packet,complete:true,fills:[],financialComplete:true,methodology:'mk-fifo-realized-capital-1'},[],cov([]));
 assert.equal((await board()).campaign.financial_complete,true);
 await refs('123',[],'2026-10-01T02:00:00.000Z');view=await board();assert.equal(view.campaign.complete,true);assert.equal(view.campaign.financial_complete,true,'unchanged heartbeat does not reset global finalization');
 // Current private coverage failure affects only the failed participant.
 await refs('123',[],'2026-10-01T02:00:00.000Z',false);financial=await read('mkz_verified_financials');assert.equal(financial.rows.length,1);assert.equal(financial.rows[0].participant,'456');assert.equal((await scope('789')).status,'no_trades');
 await refs('123',[],'2026-10-01T02:00:00.000Z',true);await commit({...packet,complete:true},[],cov([]));
 // No-change resolver heartbeat preserves proofs; a newly linked wallet does not.
 await resolve('456',wallets.c,wallets.d,1);assert.equal((await scope('456')).status,'trader');
 await q('select mkz_register_wallet($1)',[addr(91)]);await resolve('456',addr(91),wallets.d);
 assert.equal((await scope('456')).status,'pending');assert.equal((await scope('123')).status,'trader');assert.equal((await read('mkz_verified_financials')).checked,1);
 // Missing rows, wrong cutoff, stale source fingerprint and forged participant
 // identities are malformed whole-batch requests and must be atomic.
 const before=await q('select * from mkz_account_coverage order by participant');
 await assert.rejects(()=>commit(packet,[],cov().slice(0,2)),/MK_ACCOUNT_COVERAGE_MISSING/);
 assert.deepEqual(await q('select * from mkz_account_coverage order by participant'),before);
 const wrong=cov();wrong[0].confirmedThrough='2026-10-01T00:00:39.000Z';await assert.rejects(()=>commit(packet,[],wrong),/MK_ACCOUNT_COVERAGE_INVALID/);
 const stale=await command();stale.fingerprint='wrong';await assert.rejects(()=>call('mkz_worker_commit',stale),/MK_WORKER_SOURCE_CHANGED/);
 await assert.rejects(()=>commit(packet,[{...nextA,participant:'999'}]),/MK_ACCOUNT_LEDGER_INVALID/);
 await assert.rejects(()=>commit({...packet,complete:true},[],cov()),/MK_ACCOUNT_GLOBAL_COMPLETE_INVALID/);
 // Fresh registry changes invalidate existing account proofs until rescanned.
 await q('begin');await q('insert into mkz_markets values(97477,$1,$2,$3,$4,$5,now())',[addr(95),fills[0].quoteToken,'new.test','USDC','isolated market']);assert.equal((await scope('123')).status,'pending');await q('rollback');
 // A later entrant is pending, not a verified zero or a review failure.
 await q('begin');await q("update mkz_entries set entered_at=$1::timestamptz+interval '1 hour' where participant='789'",[cutoff]);
 assert.equal((await scope('789')).status,'not_started');view=await board();assert.equal(view.participants.find(p=>p.participant==='789').volume,null);assert.equal(view.participants.find(p=>p.participant==='789').tradeProblem,false);await q('rollback');
 // A healthy older coverage cutoff is syncing, not a failed-account diagnosis.
 await q('begin');await q("update mkz_campaigns set confirmed_through=$1::timestamptz+interval '1 minute'",[cutoff]);view=await board();assert.equal(view.participants.find(p=>p.participant==='123').tradeProblem,false);await q('rollback');
 // A resumable ledger from the previous cutoff may be stored but cannot be
 // published as a current-cutoff result. This preserves worker upgrade jobs.
 await q('begin');const laterCutoff=new Date(Date.parse(cutoff)+60000).toISOString();
 const oldLedger={...ledgerA,requestId:randomUUID(),revision:3};
 const laterCoverage=cov(['456','789']).map(a=>({...a,confirmedThrough:laterCutoff}));
 const resumed=await commit({...packet,confirmedThrough:laterCutoff},[oldLedger],laterCoverage);assert.deepEqual(resumed.accountingRejected,[]);
 assert.equal((await read('mkz_verified_financials')).checked,0);await q('rollback');
 // Final awards stay blocked if one account has stale evidence, even when old
 // global flags incorrectly remain complete. Ordinary partial reads still work.
 await q('begin');await q('alter table mkz_campaigns disable trigger mkz_campaign_guard');
 await assert.rejects(()=>q("update mkz_campaigns set state='frozen',complete=true,financial_complete=true"),/ACCOUNT_RECONCILIATION_INCOMPLETE/);await q('rollback');
 // Historical frozen scores never depend on the newly introduced coverage rows.
 await q('begin');await q('alter table mkz_campaigns disable trigger mkz_campaign_guard');await q('alter table mkz_campaigns disable trigger mkz_account_freeze_guard');await q("update mkz_campaigns set state='frozen',complete=true,financial_complete=true");await q('delete from mkz_account_coverage');
 view=await board();assert.ok(view.participants.every(p=>p.tradeComplete===true));assert.equal(Number(view.participants.find(p=>p.participant==='123').profit),2);assert.equal(view.participants.find(p=>p.participant==='123').financialProblem,false);await q('rollback');
 const cap=await read('mkz_accounting_capabilities');assert.equal(cap.financialScope,'eligible-traders-2');assert.equal(cap.accountIsolation,'per-account-coverage-1');
 for(const role of ['anon','authenticated']){await q('set role '+role);await assert.rejects(()=>read('mkz_verified_financials'),/permission denied/);await assert.rejects(()=>q('select * from mkz_account_coverage'),/permission denied/);await q('reset role');}
 await q('set role service_role');await assert.rejects(()=>q('select mkz_discovery_references_before_isolation($1::jsonb)',[JSON.stringify({})]),/permission denied/);assert.equal((await read('mkz_verified_financials')).checked,1);await q('reset role');
 const history=await q('select * from mkz_accounting_snapshots order by participant');await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-account-isolation.sql'),'utf8'));assert.deepEqual(await q('select * from mkz_accounting_snapshots order by participant'),history);
 console.log(JSON.stringify({passed:true,database:db.database,partialVolume:true,independentRoi:true,failedAccountsUnranked:true,accountingRejectionIsolated:true,heartbeatStable:true,referenceCorrectionsLocal:true,ownershipInvalidation:true,privateGrants:true,finalAwardGateUnchanged:true,productionWrites:0}));
 }finally{await db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
