'use strict';
// Fixed loopback PostgreSQL only; no production DSN or public network calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require('./postgres-test-adapter.cjs'),{cases}=require('./public-accounting-scoped-check.cjs');
const migrations=['bots-workshop-v8','bots-workshop-journey','bots-workshop-competition','bots-workshop-wallet-links','bots-token-zones','bots-token-zone-wallets','bots-token-zone-payout-policy','bots-token-zone-collector','bots-token-zone-accounting','bots-token-zone-discovery','bots-token-zone-opening-basis','bots-token-zone-financial-scope'];
async function main(){const db=new PGlite();try{
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const call=async(name,p)=>(await q(`select ${name}($1::jsonb) v`,[JSON.stringify(p)]))[0].v;
 const read=async name=>(await q(`select ${name}() v`))[0].v;
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test boolean default false,is_operator boolean default false)');
 for(const name of migrations){
  if(name==='bots-token-zone-opening-basis'){
   await assert.rejects(()=>db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-financial-scope.sql'),'utf8')),/FINANCIAL_SCOPE_PREREQUISITE_REQUIRED/);await q('rollback');
   assert.equal((await q("select to_regprocedure('public.mkz_financial_scope(text,text,timestamptz)') v"))[0].v,null,'out-of-order installation must not advertise or create the new scope');
  }
  await db.exec(fs.readFileSync(path.join(__dirname,'../sql',name+'.sql'),'utf8'));
 }
 const u=(await cases()).untouched,cid='model-kombat-zones-1',start='2026-10-01T00:00:00Z',entry='2026-10-01T00:00:15.000739Z',cutoff=u.ledger.confirmedThrough;
 const address=n=>'0x'+n.toString(16).padStart(40,'0'),wallets={trader:u.active,agent:u.inactive,other:address(80),otherAgent:address(81),future:address(82),futureAgent:address(83)};
 for(const[participant,wallet,agent]of [['123',wallets.trader,wallets.agent],['456',wallets.other,wallets.otherAgent],['789',wallets.future,wallets.futureAgent]]){
  await q('select mkz_register_wallet($1)',[wallet]);
  await call('mkz_collector_resolve',{schemaVersion:1,requestId:randomUUID(),wallet,mcpWallet:agent,domaUserId:participant,privyDid:null,status:'linked',checkedAt:new Date().toISOString(),expectedRevision:0});
 }
 await q('alter table mkz_campaigns disable trigger mkz_campaign_guard');
 await q("update mkz_campaigns set state='active',starts_at=$1,ends_at=$1::timestamptz+interval '28 days',financial_method='mk-fifo-realized-capital-1'",[start]);
 await q('alter table mkz_campaigns enable trigger mkz_campaign_guard');
 for(const[participant,wallet,when]of [['123',wallets.trader,entry],['456',wallets.other,entry],['789',wallets.future,'2026-10-01T00:01:00Z']])await q('insert into mkz_entries values($1,$2,$3,$4)',[cid,participant,wallet,when]);
 for(const m of u.options.markets)await q('insert into mkz_markets values(97477,$1,$2,$3,$4,$5,now())',[m.domain_token,m.quote_token,'fixture.test','USDC','isolated financial scope']);
 const fills=u.options.eligible.map((f,i)=>({chainId:97477,economicId:f.economicId,revision:1,wallet:f.wallet,transactionHash:f.transactionHash,domainToken:f.domainToken,quoteToken:f.quoteToken,executedAt:u.ledger.events.find(e=>e.economicId===f.economicId).executedAt,volumeUsd:f.volumeUsd,source:'strategy',status:'verified',evidence:'isolated verified fill '+i}));
 const packet={schemaVersion:1,rules:'mk-token-zones-1',campaignId:cid,requestId:randomUUID(),coverageFrom:start,confirmedThrough:cutoff,complete:true,financialComplete:false,financials:[],fills};
 const command=async(p,accounting=[])=>({requestId:randomUUID(),fingerprint:(await read('mkz_worker_snapshot')).fingerprint,packet:{...p,requestId:randomUUID()},accounting,report:{complete:p.complete,financialComplete:p.financialComplete}});
 const commit=async(p,accounting=[])=>call('mkz_worker_commit',await command(p,accounting));
 const scope=async(participant,through=cutoff)=>(await q('select mkz_financial_scope($1,$2,$3::timestamptz) v',[cid,participant,through]))[0].v;
 const final=extra=>({...packet,fills:[],financialComplete:true,methodology:'mk-fifo-realized-capital-1',...extra});
 assert.equal((await scope('456')).status,'pending','missing coverage is not a confirmed no-trades result');
 await commit(packet,[{...u.ledger,periodStart:entry}]);
 assert.equal((await scope('123')).status,'trader');assert.equal((await scope('456')).status,'no_trades');assert.equal((await scope('789')).status,'not_started');
 assert.equal((await scope('456','2026-10-01T00:00:39Z')).status,'pending','different cutoff cannot use the existing coverage');
 let summary=await read('mkz_verified_financials');assert.equal(summary.financialScope,'eligible-traders-1');assert.equal(summary.checked,1);assert.equal(summary.noTrades,1);assert.equal(summary.pending,0);assert.equal(summary.notStarted,1);assert.equal(summary.tradingAccounts,1);assert.equal(summary.scopePending,0);assert.equal(summary.rows.length,1);assert.equal(Number(summary.rows[0].profit),2);
 const before=await q('select count(*)::int n from mkz_batches');await assert.rejects(()=>commit(final()),/FINANCIAL_COVERAGE_INCOMPLETE/);assert.deepEqual(await q('select count(*)::int n from mkz_batches'),before,'future-entry failure rolls back staged completeness');
 await q("delete from mkz_entries where participant='789'");
 const done=await command(final());assert.equal((await call('mkz_worker_commit',done)).ok,true);assert.equal((await call('mkz_worker_commit',done)).replayed,true);
 let financial=await q('select participant,roi,profit from mkz_financials order by participant');assert.equal(financial.length,2);assert.equal(Number(financial[0].profit),2);assert.equal(financial[1].roi,null);assert.equal(financial[1].profit,null,'non-trader is unranked, never a made-up zero');
 assert.equal((await q('select financial_complete from mkz_campaigns'))[0].financial_complete,true);
 await assert.rejects(()=>commit(final({complete:false})),/FINANCIAL_TRADE_COVERAGE_REQUIRED/);
 await q('update mkz_campaigns set complete=false');assert.equal((await scope('456')).status,'pending');summary=await read('mkz_verified_financials');assert.equal(summary.available,false);assert.equal(summary.noTrades,0);assert.equal(summary.pending,2);assert.equal(summary.scopePending,2);assert.equal(summary.tradingAccounts,0);await q('update mkz_campaigns set complete=true');
 // A stale financial/accounting row cannot turn a confirmed non-trader into a
 // calculated/ranked result. The service read derives scope before reading it.
 await q("update mkz_financials set roi=999,profit=999 where participant='456'");
 await q('insert into mkz_accounting_snapshots values($1,$2,1,$3,$4,now())',[cid,'456',randomUUID(),JSON.stringify({...u.ledger,participant:'456',periodStart:entry})]);
 summary=await read('mkz_verified_financials');assert.equal(summary.noTrades,1);assert.equal(summary.rows.some(r=>r.participant==='456'),false);
 await commit(final());financial=await q("select roi,profit from mkz_financials where participant='456'");assert.equal(financial[0].roi,null);assert.equal(financial[0].profit,null,'final output overwrites stale score with null');
 // A newly eligible trade atomically removes the exemption. The intentionally
 // stale/mismapped ledger must fail, never get accepted because scope was cached.
 const incoming={...fills[0],economicId:'new-eligible',wallet:wallets.otherAgent,transactionHash:'0x'+'9'.repeat(64)};
 const fillCount=(await q('select count(*)::int n from mkz_fills'))[0].n;
 await assert.rejects(()=>commit(final({fills:[incoming]})),/ACCOUNTING_WALLET_UNMAPPED|ACCOUNTING_FILL_COVERAGE_INCOMPLETE/);
 assert.equal((await q('select count(*)::int n from mkz_fills'))[0].n,fillCount,'failed financial finalization rolls back newly submitted fills');
 await commit({...packet,fills:[incoming]});assert.equal((await scope('456')).status,'trader');summary=await read('mkz_verified_financials');assert.equal(summary.noTrades,0);assert.equal(summary.pending,1);assert.equal(summary.checked,1);assert.equal(summary.tradingAccounts,2);assert.equal(summary.scopePending,0);
 await commit(final({fills:[{...incoming,revision:2,status:'revoked'}]}));assert.equal((await scope('456')).status,'no_trades');assert.equal((await q("select profit from mkz_financials where participant='456'"))[0].profit,null);
 // Revoke the real trader's last fill: retain historical ledger unchanged, but
 // suppress its old positive result. Reinstatement immediately requires proof.
 const snapshotBefore=await q("select payload from mkz_accounting_snapshots where participant='123'");
 await commit(final({fills:fills.map(f=>({...f,revision:2,status:'revoked'}))}));
 summary=await read('mkz_verified_financials');assert.equal(summary.checked,0);assert.equal(summary.noTrades,2);assert.deepEqual(summary.rows,[]);assert.deepEqual(await q("select payload from mkz_accounting_snapshots where participant='123'"),snapshotBefore);assert.ok((await q('select roi,profit from mkz_financials')).every(r=>r.roi===null&&r.profit===null));
 const corrected={...fills[0],revision:3,volumeUsd:'13.000000'};await assert.rejects(()=>commit(final({fills:[corrected]})),/ACCOUNTING_FILL_COVERAGE_INCOMPLETE/);await commit({...packet,fills:[corrected]});summary=await read('mkz_verified_financials');assert.equal(summary.pending,1);assert.equal(summary.noTrades,1);assert.equal(summary.checked,0);
 // The exact enrollment microseconds, common cutoff, current pair registry and
 // linked ownership define scope, independently of prior financial snapshots.
 await q('update mkz_fills set executed_at=$1 where economic_id=$2',['2026-10-01T00:00:15.000Z',corrected.economicId]);assert.equal((await scope('123')).status,'no_trades');
 await q('update mkz_fills set executed_at=$1 where economic_id=$2',[corrected.executedAt,corrected.economicId]);assert.equal((await scope('123')).status,'trader');
 await q("update mkz_fills set executed_at=$1::timestamptz+interval '1 second' where economic_id=$2",[cutoff,corrected.economicId]);assert.equal((await scope('123')).status,'no_trades');
 await q('update mkz_fills set executed_at=$1 where economic_id=$2',[corrected.executedAt,corrected.economicId]);
 await q('begin');await assert.rejects(()=>q('delete from mkz_markets'),/foreign key constraint/);await q('rollback');assert.equal((await scope('123')).status,'trader','a registered market cannot disappear underneath stored eligible fills');
 await q('begin');await q("update mkz_wallet_links set status='not_found' where doma_user_id='123'");assert.equal((await scope('123')).status,'pending');await q('rollback');
 const cap=await read('mkz_accounting_capabilities');assert.equal(cap.financialScope,'eligible-traders-1');assert.equal(cap.openingBasis,'deferred-untouched-2');
 for(const role of ['anon','authenticated']){await q('set role '+role);await assert.rejects(()=>scope('123'),/permission denied/);await assert.rejects(()=>read('mkz_verified_financials'),/permission denied/);await q('reset role');}
 await q('set role service_role');assert.equal((await scope('456')).status,'no_trades');await q('reset role');
 const preserved=await q('select * from mkz_accounting_snapshots order by participant');await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-financial-scope.sql'),'utf8'));assert.deepEqual(await q('select * from mkz_accounting_snapshots order by participant'),preserved);
 console.log(JSON.stringify({passed:true,isolatedDatabase:db.database,prerequisiteEnforced:true,completeCoverageOnly:true,nonTraderScoresNull:true,traderFormulaUnchanged:true,postCorrectionScope:true,futureEntriesPending:true,atomicRollback:true,exactEnrollment:true,currentOwnershipAndMarkets:true,sqlTradingDenominator:true,privateGrants:true,rerunPreservesHistory:true,productionWrites:0}));
 }finally{await db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
