'use strict';
// Fixed loopback PostgreSQL only. No production settings or network APIs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require('./postgres-test-adapter.cjs'),{cases}=require('./public-accounting-scoped-check.cjs');
async function main(){const db=new PGlite();try{
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const call=async(name,p)=>(await q(`select ${name}($1::jsonb) v`,[JSON.stringify(p)]))[0].v;
 const read=async name=>(await q(`select ${name}() v`))[0].v;
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test boolean default false,is_operator boolean default false)');
 for(const name of ['bots-workshop-v8','bots-workshop-journey','bots-workshop-competition','bots-workshop-wallet-links','bots-token-zones','bots-token-zone-wallets','bots-token-zone-payout-policy','bots-token-zone-collector','bots-token-zone-accounting','bots-token-zone-opening-basis'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql',name+'.sql'),'utf8'));
 const fifo=async(p,eligible=[])=>(await q('select mkz_fifo_calculate($1::jsonb,$2::jsonb) v',[JSON.stringify(p),JSON.stringify(eligible)]))[0].v;
 const fixtures=await cases(),results={};
 for(const[name,f]of Object.entries(fixtures)){
  const eligible=f.options.eligible.map(e=>({...e,executedAt:f.ledger.events.find(x=>x.economicId===e.economicId).executedAt}));
  results[name]=await fifo(f.ledger,eligible);
 }
 assert.equal(Number(results.basic.profit),2);assert.equal(Number(results.basic.capitalUsd),100);assert.equal(Number(results.basic.roi),2);
 assert.equal(Number(results.native.profit),1.999992);assert.equal(Number(results.native.capitalUsd),100.099995);
 assert.equal(Number(results.untouched.profit),2);assert.equal(Number(results.untouched.capitalUsd),170);
 const {depositFixture}=require('./public-accounting-deferred-in-check.cjs'),{reconstruct}=require('./lib/public-accounting.cjs');
 const d=depositFixture(),dl=await reconstruct(d.options),de=d.options.eligible.map(e=>({...e,executedAt:dl.events.find(x=>x.economicId===e.economicId).executedAt}));
 const dr=await fifo(dl,de);assert.equal(Number(dr.profit),2);assert.equal(Number(dr.capitalUsd),105,'untouched direct deposit adds historical value, not a zero or guessed basis');
 for(const kind of ['sell','out','transfer']){const e={id:'unknown-disposal',wallet:d.wallet,token:d.token,kind,units:'1',usd:'1',executedAt:'2026-10-01T00:00:45Z',order:999,acquisitionOrder:999,evidence:'isolated unknown disposal',...(kind==='transfer'?{toWallet:'0x'+'8'.padStart(40,'0')}:{})};await assert.rejects(()=>fifo({...dl,events:[...dl.events,e]},de),/ACCOUNTING_OPENING_BASIS_REQUIRED/);}
 const malformedIn=structuredClone(dl);malformedIn.events.find(e=>e.kind==='in').costUsd='0';await assert.rejects(()=>fifo(malformedIn,de),/ACCOUNTING_UNKNOWN_BASIS_INVALID/);
 const equal=depositFixture({sameBlock:true}),el=await reconstruct(equal.options),ee=equal.options.eligible.map(e=>({...e,executedAt:el.events.find(x=>x.economicId===e.economicId).executedAt}));
 assert.equal(Number((await fifo(el,ee)).profit),2,'known buy stays first despite lexically smaller later transfer id');
 const reversed=structuredClone(el),deposit=reversed.events.find(e=>e.kind==='in');reversed.events=reversed.events.filter(e=>e!==deposit);reversed.events.unshift(deposit);reversed.events.forEach((e,i)=>{e.order=i+1;e.acquisitionOrder=i+1;});
 await assert.rejects(()=>fifo(reversed,ee),/ACCOUNTING_OPENING_BASIS_REQUIRED/,'unknown transfer really first cannot be bypassed');
 // Optional D-only old complete-history ledgers prove equal SQL results using
 // the previous implementation, without vendoring a second accounting engine.
 if(process.argv[2]){const old=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));for(const name of ['basic','native']){const p=old[name].ledger,eligible=fixtures[name].options.eligible.map(e=>({...e,executedAt:p.events.find(x=>x.economicId===e.economicId).executedAt}));const before=await fifo(p,eligible);for(const field of ['profit','roi','capitalUsd','eligibleProceedsUsd','eligibleSales'])assert.equal(results[name][field],before[field],name+':'+field);}}
 const u=fixtures.untouched,unknown=u.ledger.openingLots.find(x=>x.costKnown===false),last='2026-10-01T00:00:45Z';
 const consume=(kind,extra={})=>({...u.ledger,events:[...u.ledger.events,{id:'consume',wallet:unknown.wallet,token:unknown.token,kind,units:'1',usd:'1',executedAt:last,order:999,evidence:'isolated consumption',...extra}]});
 for(const kind of ['sell','out','transfer'])await assert.rejects(()=>fifo(consume(kind,kind==='transfer'?{toWallet:u.active}:{})),/ACCOUNTING_OPENING_BASIS_REQUIRED/);
 const later=consume('out');later.events.splice(-1,0,{id:'later-buy',wallet:unknown.wallet,token:unknown.token,kind:'buy',units:'1',usd:'1',executedAt:'2026-10-01T00:00:44Z',order:998,evidence:'new buy cannot skip old FIFO'});
 await assert.rejects(()=>fifo(later),/ACCOUNTING_OPENING_BASIS_REQUIRED/);
 await assert.rejects(()=>fifo({...u.ledger,openingLots:u.ledger.openingLots.map(l=>l===unknown?{...l,costUsd:'0'}:l)}),/ACCOUNTING_UNKNOWN_BASIS_INVALID/);
 await assert.rejects(()=>fifo({...u.ledger,openingLots:u.ledger.openingLots.map(l=>l===unknown?{...l,acquiredAt:u.ledger.periodStart}:l)}),/ACCOUNTING_LOT_DATE/);
 await assert.rejects(()=>fifo({...u.ledger,openingLots:Array(5001).fill(unknown)}),/ACCOUNTING_COVERAGE_REQUIRED/);
 await assert.rejects(()=>fifo({...u.ledger,events:Array(10001).fill(u.ledger.events[0])}),/ACCOUNTING_COVERAGE_REQUIRED/);
 await assert.rejects(()=>call('mkz_accounting_result',{...u.ledger,evidence:'x'.repeat(4000001)}),/ACCOUNTING_PACKET_INVALID/);
 const zero=await fifo({...u.ledger,openingLots:[],events:[]});assert.equal(zero.roi,null);assert.equal(Number(zero.profit),0);
 const cid='model-kombat-zones-1',start='2026-10-01T00:00:00Z',entry='2026-10-01T00:00:15.000739Z',cutoff=u.ledger.confirmedThrough;
 await q('alter table mkz_campaigns disable trigger mkz_campaign_guard');await q("update mkz_campaigns set state='active',starts_at=$1,ends_at=$1::timestamptz+interval '28 days',financial_method='mk-fifo-realized-capital-1',complete=true,financial_complete=false,confirmed_through=$2",[start,cutoff]);await q('alter table mkz_campaigns enable trigger mkz_campaign_guard');
 await q("insert into mkz_wallet_links(wallet,mcp_wallet,doma_user_id,status,revision,checked_at) values($1,$2,'123','linked',1,now())",[u.active,u.inactive]);
 await q('insert into mkz_entries values($1,$2,$3,$4)',[cid,'123',u.active,entry]);
 for(const[participant,when]of [['456','2026-10-01T00:00:20Z'],['789','2026-10-01T00:01:00Z']])await q('insert into mkz_entries values($1,$2,$3,$4)',[cid,participant,'0x'+participant.padStart(40,'0'),when]);
 for(const m of u.options.markets)await q('insert into mkz_markets values(97477,$1,$2,$3,$4,$5,now())',[m.domain_token,m.quote_token,'fixture.test','USDC','isolated accounting test']);
 const sale=u.ledger.events.find(e=>e.economicId==='sale'),f=u.options.eligible[0];
 const fill={chainId:97477,economicId:'sale',revision:1,wallet:f.wallet,transactionHash:f.transactionHash,domainToken:f.domainToken,quoteToken:f.quoteToken,executedAt:sale.executedAt,volumeUsd:f.volumeUsd,source:'strategy',status:'verified',evidence:'isolated verified sale'};
 const packet={schemaVersion:1,rules:'mk-token-zones-1',campaignId:cid,requestId:randomUUID(),coverageFrom:start,confirmedThrough:cutoff,complete:true,financialComplete:false,financials:[],fills:[fill]};
 await call('mkz_collector_ingest',packet);
 const ledger={...u.ledger,periodStart:entry};await assert.rejects(()=>call('mkz_accounting_result',u.ledger),/ACCOUNTING_PERIOD_INVALID/);
 await call('mkz_collector_accounting',ledger);
 const cap=await read('mkz_accounting_capabilities');assert.equal(cap.openingBasis,'deferred-untouched-2');assert.equal(cap.incomingBasis,'deferred-direct-transfer-1');
 const summary=await read('mkz_verified_financials');assert.equal(summary.available,true);assert.equal(summary.checked,1);assert.equal(summary.pending,1);assert.equal(summary.notStarted,1);assert.equal(Number(summary.rows[0].profit),2);assert.equal(summary.rows[0].participant,'123');
 assert.equal((await q('select financial_complete from mkz_campaigns'))[0].financial_complete,false,'provisional read does not finalize awards');
 await q("update mkz_fills set payload=jsonb_set(payload,'{volumeUsd}','\"13.000000\"'::jsonb),volume_usd=13");assert.equal((await read('mkz_verified_financials')).checked,0,'new corrected fill must revalidate the ledger');
 await q("update mkz_fills set payload=jsonb_set(payload,'{volumeUsd}','\"12.000000\"'::jsonb),volume_usd=12");
 await q('update mkz_wallet_links set mcp_wallet=null');assert.equal((await read('mkz_verified_financials')).checked,0,'current ownership is rechecked');await q('update mkz_wallet_links set mcp_wallet=$1',[u.inactive]);
 await q("update mkz_campaigns set confirmed_through=confirmed_through+interval '1 second'");assert.equal((await read('mkz_verified_financials')).checked,0,'stale snapshot is not a current result');await q('update mkz_campaigns set confirmed_through=$1',[cutoff]);
 await q('update mkz_campaigns set complete=false');assert.equal((await read('mkz_verified_financials')).available,false);await q('update mkz_campaigns set complete=true');
 for(const role of ['anon','authenticated']){await q('set role '+role);await assert.rejects(()=>read('mkz_verified_financials'),/permission denied/);await assert.rejects(()=>read('mkz_accounting_capabilities'),/permission denied/);await q('reset role');}
 await q('set role service_role');assert.equal((await read('mkz_verified_financials')).checked,1);await q('reset role');
 const before=await q('select * from mkz_accounting_snapshots');await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-opening-basis.sql'),'utf8'));assert.deepEqual(await q('select * from mkz_accounting_snapshots'),before);
 console.log(JSON.stringify({passed:true,isolatedDatabase:db.database,legacyFormulaComparison:!!process.argv[2],unknownConsumptionRejected:true,feesAndCapitalUnchanged:true,exactEnrollment:true,perAccountRead:true,correctionAndOwnership:true,privateGrants:true,rerunPreservesState:true,productionWrites:0}));
 }finally{await db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
