// Disposable loopback PostgreSQL only. Never reads production credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require('./postgres-test-adapter.cjs');
async function main(){const db=new PGlite();try{
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const call=async(name,p)=>(await q(`select ${name}($1::jsonb) v`,[JSON.stringify(p)]))[0].v;
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test boolean default false,is_operator boolean default false)');
 await db.exec("do $$begin if not exists(select from pg_roles where rolname='doma_ai_mk') then create role doma_ai_mk nologin;end if;end $$");
 for(const file of ['bots-workshop-v8','bots-workshop-journey','bots-workshop-competition','bots-workshop-wallet-links','bots-token-zones','bots-token-zone-wallets','bots-token-zone-payout-policy','bots-token-zone-collector','bots-token-zone-accounting'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql',file+'.sql'),'utf8'));
 const wallet='0x'+'a'.repeat(40),agent='0x'+'b'.repeat(40),token='0x'+'c'.repeat(40),quote='0x'+'d'.repeat(40);
 const start=new Date(Date.now()-86400000).toISOString(),time=new Date(Date.now()-43200000).toISOString(),cutoff=new Date().toISOString();
 const base={schemaVersion:1,campaignId:'model-kombat-zones-1',methodology:'mk-fifo-realized-capital-1',participant:'123',requestId:randomUUID(),revision:1,periodStart:start,confirmedThrough:cutoff,complete:true,evidence:'isolated full ledger',openingLots:[{id:'lot1',wallet,token,units:'100',costUsd:'100',valueUsd:'120',acquiredAt:start,evidence:'opening position'}],events:[]};
 const event=(id,kind,units,usd,extra={})=>({id,kind,wallet,token,units,usd,executedAt:time,order:Number(id.slice(1)),evidence:'isolated event',...extra});
 const eligibility={economicId:'sale',wallet:agent,domainToken:token,executedAt:time};
 const fifo=async(p,eligible=[])=>(await q('select mkz_fifo_calculate($1,$2) v',[JSON.stringify(p),JSON.stringify(eligible)]))[0].v;
 const raw={...base,events:[event('e1','transfer','60',undefined,{toWallet:agent}),event('e2','sell','40','80',{wallet:agent,economicId:'sale'})]};
 let r=await fifo(raw,[eligibility]);assert.equal(Number(r.profit),40);assert.equal(Number(r.capitalUsd),120);assert(Math.abs(Number(r.roi)-100/3)<1e-10);
 r=await fifo({...base,events:[event('e1','out','60'),event('e2','sell','40','80',{economicId:'sale'})]},[{...eligibility,wallet}]);assert.equal(Number(r.profit),40);assert.equal(Number(r.capitalUsd),120);
 r=await fifo({...base,events:[event('e1','in','50','100',{costUsd:'50'}),event('e2','sell','100','150',{economicId:'sale'})]},[{...eligibility,wallet}]);assert.equal(Number(r.capitalUsd),220);assert.equal(Number(r.profit),50);
 assert.equal(Number((await fifo({...base,events:[event('e1','sell','100','150')]})).profit),0,'manual sales consume inventory without prize profit');
 await assert.rejects(()=>fifo({...base,events:[event('e1','sell','101','150')]}),/MISSING_BASIS/);
 await assert.rejects(()=>fifo({...base,complete:false}),/COVERAGE_REQUIRED/);
 await assert.rejects(()=>fifo({...base,events:[event('e1','buy','1','2'),event('e1','buy','1','2')]}),/EVENT_INVALID/);
 assert.equal((await fifo({...base,openingLots:[]})).roi,null);
 // Feed a reconstructed native-gas history through the real PostgreSQL FIFO.
 const {nativeLedgerFixture,NATIVE}=require('./public-native-accounting-check.cjs');
 const nativeFixture=nativeLedgerFixture(),nativeLedger=await require('./lib/public-accounting.cjs').reconstruct(nativeFixture.options);
 const nativeSale=nativeLedger.events.find(e=>e.economicId==='sale');
 r=await fifo(nativeLedger,[{economicId:'sale',wallet:nativeSale.wallet,domainToken:nativeSale.token,executedAt:nativeSale.executedAt}]);
 assert.equal(Number(r.profit),1.999992,'buy and sell gas reduce profit once; token volume is unchanged');
 assert.equal(Number(r.capitalUsd),100.099995,'both native and token opening capital are included, linked transfers add none');
 // Cost rounding must conserve the original lot through fractional disposal.
 r=await fifo({...base,openingLots:[{...base.openingLots[0],units:'3',costUsd:'0.000001',valueUsd:'1'}],events:[event('e1','out','1'),event('e2','sell','2','1',{economicId:'sale'})]},[{...eligibility,wallet}]);assert.equal(Number(r.profit),.999999);
 await q('select mkz_register_wallet($1)',[wallet]);await q('insert into mkz_markets values(97477,$1,$2,$3,$4,$5,now())',[token,quote,'fixture.example','USDC','test registry']);
 await call('mkz_collector_resolve',{schemaVersion:1,requestId:randomUUID(),wallet,mcpWallet:agent,domaUserId:'123',privyDid:null,status:'linked',checkedAt:cutoff,expectedRevision:0});
 await q("update mkz_campaigns set financial_method='mk-fifo-realized-capital-1'");
 // The incremental patch only replaces asset validation. It must not restore
 // the internal AI's previously revoked accounting capability or alter state.
 await q('revoke execute on function mkz_collector_accounting(jsonb) from doma_ai_mk');
 for(let i=0;i<2;i++)await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-native-eth.sql'),'utf8'));
 const bundledPatch=fs.readFileSync('D:/Temp/modelkombat-tracking-update-20261006/tracking-update.sql','utf8');
 for(let i=0;i<2;i++)await db.exec(bundledPatch);
 assert.equal((await call('mkz_worker_health',null)).nativeAccountingReady,true,'exact delivered repair passes installer preflight');
 assert.equal((await q("select has_function_privilege('doma_ai_mk','mkz_collector_accounting(jsonb)','execute') v"))[0].v,false);
 assert.equal((await q('select state from mkz_campaigns'))[0].state,'draft');
 const nativeOpening={...base,openingLots:[{...base.openingLots[0],token:NATIVE,units:'1000000000000000',valueUsd:'3',costUsd:'3'}]};
 r=await call('mkz_collector_accounting',nativeOpening);assert.equal(Number(r.result.capitalUsd),3);assert.equal(r.writesPerformed,0);
 await q('grant execute on function mkz_collector_accounting(jsonb) to doma_ai_mk'); // legacy-role fixtures below
 await q('set role doma_ai_mk');r=await call('mkz_collector_accounting',raw);assert.equal(r.writesPerformed,0);await q('reset role');
 assert.equal((await q('select count(*)::int n from mkz_accounting_snapshots'))[0].n,0);
 // Activate only this disposable fixture; no production connection exists here.
 await q('alter table mkz_campaigns disable trigger mkz_campaign_guard');await q("update mkz_campaigns set state='active',starts_at=$1,ends_at=$1::timestamptz+interval '28 days'",[start]);await q('alter table mkz_campaigns enable trigger mkz_campaign_guard');
 await q('insert into mkz_entries values($1,$2,$3,$4)',[base.campaignId,'123',wallet,start]);
 const fill={chainId:97477,economicId:'sale',revision:1,wallet:agent,transactionHash:'0x'+'e'.repeat(64),domainToken:token,quoteToken:quote,executedAt:time,volumeUsd:'80',source:'agent_wallet',status:'verified',evidence:'settlement'};
 const packet={schemaVersion:1,rules:'mk-token-zones-1',campaignId:base.campaignId,requestId:randomUUID(),coverageFrom:start,confirmedThrough:cutoff,complete:false,financialComplete:false,financials:[],fills:[fill]};
 await q('set role doma_ai_mk');await call('mkz_collector_ingest',packet);
 // A complete fill audit is useful even while historical basis/quote ledgers are pending.
 const volumeFinal={...packet,requestId:randomUUID(),fills:[],complete:true,financialComplete:false};
 await call('mkz_collector_ingest',volumeFinal);assert.equal((await call('mkz_collector_ingest',volumeFinal)).replayed,true);
 await assert.rejects(()=>call('mkz_collector_ingest',{...volumeFinal,requestId:randomUUID(),financialComplete:true,methodology:base.methodology}),/FINANCIAL_COVERAGE_INCOMPLETE/);
 await q('reset role');
 r=(await q('select mkz_read(null) v'))[0].v;
 assert.equal(r.campaign.complete,true);assert.equal(r.campaign.financial_complete,false);assert.equal(Number(r.volume),80);
 assert.equal((await q('select count(*)::int n from mkz_accounting_snapshots'))[0].n,0);
 assert.equal((await q('select count(*)::int n from mkz_financials'))[0].n,0,'pending accounting cannot publish invented zero ROI/profit');
 await q('set role doma_ai_mk');
 await assert.rejects(()=>call('mkz_collector_accounting',raw),/FILL_COVERAGE_INCOMPLETE/);
 raw.events[1].notionalUsd='80';await call('mkz_collector_accounting',raw);assert.equal((await call('mkz_collector_accounting',raw)).replayed,true);
 const final={...packet,requestId:randomUUID(),fills:[],complete:true,financialComplete:true,methodology:base.methodology};
 await call('mkz_collector_ingest',final);assert.equal((await call('mkz_collector_ingest',final)).replayed,true);
 await assert.rejects(()=>call('mkz_collector_ingest',{...final,financials:[{participant:'123',profit:'9999',roi:'999',evidence:'invented'}]}),/BATCH_CONFLICT/);
 await q('reset role');r=(await q('select roi,profit from mkz_financials'))[0];assert.equal(Number(r.profit),40);assert.equal(Number((await q('select mkz_read(null) v'))[0].v.volume),80);
 // Same pool notional, smaller actual wallet proceeds after a router fee.
 // The fee changes realized profit, never the independently verified volume.
 const feeLedger={...raw,requestId:randomUUID(),revision:2,events:[raw.events[0],{...raw.events[1],usd:'79.6'}]};
 await call('mkz_collector_accounting',feeLedger);await call('mkz_collector_ingest',{...final,requestId:randomUUID()});assert.equal(Number((await q('select profit from mkz_financials'))[0].profit),39.6);assert.equal(Number((await q('select mkz_read(null) v'))[0].v.volume),80);
 // Revoking a fill must remove its profit even with the same raw ledger.
 await q('set role doma_ai_mk');await call('mkz_collector_ingest',{...packet,requestId:randomUUID(),fills:[{...fill,revision:2,status:'revoked'}]});await call('mkz_collector_ingest',{...final,requestId:randomUUID()});await q('reset role');assert.equal(Number((await q('select profit from mkz_financials'))[0].profit),0);
 for(const role of ['anon','authenticated']){await q('set role '+role);await assert.rejects(()=>call('mkz_collector_accounting',raw),/permission denied/);await q('reset role');}
 r=await call('mkz_collector_accounting',raw);assert.equal(r.replayed,true);assert.equal(Number(r.result.profit),40,'receipt returns its original result; corrected leaderboard remains zero');
 await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-accounting.sql'),'utf8'));assert.equal(Number((await q('select profit from mkz_financials'))[0].profit),0,'reapplying setup preserves existing results');
 console.log('PASS PostgreSQL account FIFO: links, internal transfers, capital, manual sells, micro-USD basis conservation, missing evidence, draft no-write, verified volume with pending accounting, server-only scores, replay retries, revoked-fill corrections and additive migration rerun.');
 }finally{await db.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
