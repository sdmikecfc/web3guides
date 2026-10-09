'use strict';
// Fixed loopback PostgreSQL only. No production credentials, writes or RPC calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require(process.env.MK_ACCOUNT_ISOLATION_PGLITE||'./postgres-test-adapter.cjs'),{cases}=require('./public-accounting-scoped-check.cjs');
const migrations=['bots-workshop-v8','bots-workshop-journey','bots-workshop-competition','bots-workshop-wallet-links','bots-token-zones','bots-token-zone-wallets','bots-token-zone-payout-policy','bots-token-zone-collector','bots-token-zone-accounting','bots-token-zone-discovery','bots-token-zone-opening-basis','bots-token-zone-financial-scope','bots-token-zone-account-isolation','bots-token-zone-result-publication'];
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

 // Start with two independently accepted trader results and one zero-trade account.
 const initial=await command({...packet,complete:true},[ledgerA,ledgerB],cov([]));
 const first=await call('mkz_worker_commit',initial);
 assert.match(first.nextFingerprint,/^[0-9a-f]{32}$/);
 assert.equal(first.nextFingerprint,(await read('mkz_worker_snapshot')).fingerprint);
 let view=await board(),finance=await read('mkz_verified_financials');
 assert.equal(view.accountScope,'retained-account-results-1');assert.equal(finance.financialScope,'retained-account-financials-1');
 assert.equal(finance.checked,2);assert.ok(finance.rows.every(r=>r.current&&!r.retained));
 assert.equal(view.volume,'24.000000');assert.equal(view.participants.find(p=>p.participant==='789').volume,'0');
 // Newer unavailable scans do not overwrite the last verified publication.
 const later='2026-10-01T00:10:00.000Z';
 const delayedCoverage=cov(['123','456','789']).map(a=>({...a,confirmedThrough:later,problems:['STRATEGY_COVERAGE_MISSING']}));
 const delayedPacket={...packet,confirmedThrough:later,fills:[],complete:false};
 await commit(delayedPacket,[],delayedCoverage);
 view=await board();finance=await read('mkz_verified_financials');
 assert.equal(Date.parse(view.campaign.confirmed_through),Date.parse(later));
 assert.equal(view.volume,'24.000000');assert.equal(finance.checked,2);
 assert.ok(view.participants.every(p=>p.tradeVerified&&!p.tradeComplete&&p.tradeDelayed));
 assert.ok(finance.rows.every(r=>r.retained&&!r.current));
 assert.equal(view.retainedAsOf.oldest,view.participants[0].tradeThrough);
 assert.equal(finance.rows[0].confirmedThrough,view.participants.find(p=>p.participant===finance.rows[0].participant).financialThrough);
 assert.equal((await q('select financial_complete from mkz_campaigns'))[0].financial_complete,false);
 // Replay returns its stored post-commit CAS, never adopts the current snapshot.
 assert.equal((await call('mkz_worker_commit',initial)).nextFingerprint,first.nextFingerprint);
 assert.notEqual(first.nextFingerprint,(await read('mkz_worker_snapshot')).fingerprint);
 const stale=await command(delayedPacket,[],delayedCoverage);stale.fingerprint=first.nextFingerprint;
 await assert.rejects(()=>call('mkz_worker_commit',stale),/MK_WORKER_SOURCE_CHANGED/);
 // A future same-wallet reference leaves past proof unchanged. A correction
 // into that published prefix invalidates only its account.
 const ref={id:'strategy:retained',revision:1,chainId:97477,wallet:wallets.a,strategyId:'1',orderId:'1',transactionHash:'0x'+'8'.repeat(64),domainToken:fills[0].domainToken,quoteToken:fills[0].quoteToken,domainUnits:'1',quoteUnits:'1',side:'buy',executedAt:'2026-10-01T00:05:00.000Z',status:'verified',evidence:'isolated retained reference'};
 await refs('123',[ref],'2026-10-01T01:00:00.000Z');
 assert.equal((await read('mkz_verified_financials')).checked,2);
 await refs('123',[{...ref,revision:2,executedAt:fills[0].executedAt}],'2026-10-01T01:00:00.000Z');
 view=await board();finance=await read('mkz_verified_financials');
 assert.equal(finance.checked,1);assert.equal(finance.rows[0].participant,'456');
 assert.equal(view.participants.find(p=>p.participant==='123').tradeVerified,false);
 assert.equal(view.participants.find(p=>p.participant==='123').volume,null);
 assert.equal(view.volume,'12.000000');
 // Account 456's proof remains valid across ordinary source failure, but not
 // explicit reorg evidence. This cannot remove account 123's independent state.
 await q('begin');await q("update mkz_account_coverage set problems='[\"TRANSACTION_REORG\"]' where participant='456'");
 assert.equal((await read('mkz_verified_financials')).checked,0);await q('rollback');
 // Current source coverage can safely publish an older accepted ledger prefix.
 for(const id of ['123','456','789'])await refs(id,[],'2026-10-01T01:00:00.000Z');
 const currentCoverage=cov([]).map(a=>({...a,confirmedThrough:later}));
 await commit({...delayedPacket,complete:true},[],currentCoverage);
 view=await board();finance=await read('mkz_verified_financials');
 assert.ok(view.participants.every(p=>p.tradeComplete&&p.tradeCurrent&&p.tradeVerified));
 assert.equal(finance.checked,2);assert.ok(finance.rows.every(r=>r.retained));
 assert.ok(view.participants.filter(p=>p.participant!=='789').every(p=>p.financialDelayed));
 // A fill correction invalidates both saved trade and financial values only
 // for its owner. A genuinely new later fill does not rewrite an older prefix.
 await q('begin');await q("update mkz_fills set payload=jsonb_set(payload,'{volumeUsd}','\"13.000000\"'),volume_usd=13 where economic_id=$1",[fills[0].economicId]);
 assert.equal((await read('mkz_verified_financials')).checked,1);assert.equal((await read('mkz_verified_financials')).rows[0].participant,'456');await q('rollback');
 // Invalidate latest trade proof after the old financial cutoff. The retained
 // financial prefix must supply matching times, volume and an older as-of date.
 const futureFill={...fills[0],economicId:'later-fill',revision:1,transactionHash:'0x'+'9'.repeat(64),executedAt:'2026-10-01T00:08:00.000Z',volumeUsd:'5.000000'};
 await commit({...delayedPacket,complete:true,fills:[futureFill]},[],currentCoverage);
 view=await board();assert.equal(view.participants.find(p=>p.participant==='123').volume,'17.000000');
  await refs('123',[{...ref,id:'new-future-reference',executedAt:'2026-10-01T00:06:00.000Z'}],'2026-10-01T01:00:00.000Z');
 view=await board();finance=await read('mkz_verified_financials');
 assert.equal(view.participants.find(p=>p.participant==='123').volume,'12.000000','old financial prefix supplies the matching earlier volume');
 assert.equal(view.participants.find(p=>p.participant==='123').tradeThrough,view.participants.find(p=>p.participant==='123').financialThrough);
 assert.equal(finance.checked,2,'a correction only after the older financial cutoff leaves that older proof intact');
await refs('123',[{...ref,revision:3,executedAt:'2026-10-01T00:06:00.000Z'}],'2026-10-01T01:00:00.000Z');
 // Moving the old reference out changes the historical fingerprint, so both
 // proofs correctly require a fresh check rather than retaining stale facts.
 assert.equal((await read('mkz_verified_financials')).rows.some(r=>r.participant==='123'),false);
 // Ownership change invalidates that account's retained snapshots.
 await q('select mkz_register_wallet($1)',[addr(91)]);await resolve('456',addr(91),wallets.d);
 assert.equal((await read('mkz_verified_financials')).rows.some(r=>r.participant==='456'),false);
 // Final awards stay blocked while any current account evidence is incomplete.
 await q('begin');await q('alter table mkz_campaigns disable trigger mkz_campaign_guard');
 await assert.rejects(()=>q("update mkz_campaigns set state='frozen',complete=true,financial_complete=true"),/ACCOUNT_RECONCILIATION_INCOMPLETE/);await q('rollback');
 const cap=await read('mkz_accounting_capabilities');assert.equal(cap.financialScope,'eligible-traders-2');assert.equal(cap.resultPublication,'per-account-retained-1');
 for(const role of ['anon','authenticated','service_role']){await q('set role '+role);await assert.rejects(()=>q('select * from mkz_account_publications'),/permission denied/);await assert.rejects(()=>q('select mkz_capture_publications()'),/permission denied/);await q('reset role');}
 const history=await q('select * from mkz_account_publications order by participant,kind');
 await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-result-publication.sql'),'utf8'));
 assert.deepEqual(await q('select * from mkz_account_publications order by participant,kind'),history);
 console.log(JSON.stringify({passed:true,runtime:'embedded PostgreSQL',delayedScoresRetained:true,ownCutoffLabels:true,correctionsInvalidateOwner:true,casReplayStable:true,olderLedgerPrefix:true,noFakeZero:true,privatePublications:true,finalAwardsBlocked:true,productionWrites:0}));
 }finally{await db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
