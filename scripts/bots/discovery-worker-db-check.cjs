'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require('./postgres-test-adapter.cjs');
const migrations=['bots-workshop-v8','bots-workshop-journey','bots-workshop-competition','bots-workshop-wallet-links','bots-token-zones','bots-token-zone-wallets','bots-token-zone-payout-policy','bots-token-zone-collector','bots-token-zone-accounting','bots-token-zone-discovery'];
const addr=n=>'0x'+String(n).padStart(40,'0');
async function main(){const db=new PGlite();try{
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const call=async(n,p)=>(await q(`select ${n}($1::jsonb) v`,[JSON.stringify(p)]))[0].v;
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test boolean default false,is_operator boolean default false)');
 await db.exec("do $$begin if not exists(select from pg_roles where rolname='doma_ai_mk') then create role doma_ai_mk nologin;end if;end $$");
 for(const m of migrations)await db.exec(fs.readFileSync(path.join(__dirname,'../sql',m+'.sql'),'utf8'));
 const now=Date.now(),at=n=>new Date(now+n*1000).toISOString(),wallet=addr(1),agent=addr(2),strategyWallet=addr(3);
 for(const w of [wallet,addr(4)])await q('select mkz_register_wallet($1)',[w]);
 await q("update mkz_registered_wallets set registered_at=now()-interval '2 days'");
 const link={schemaVersion:1,requestId:randomUUID(),wallet,mcpWallet:null,domaUserId:'123',privyDid:null,status:'linked',checkedAt:at(0),expectedRevision:0};
 await q('set role doma_ai_mk');
 assert.equal((await call('mkz_collector_resolve',link)).ok,true,'Strategy-only identity does not require invented MCP wallet');
 assert.equal((await call('mkz_collector_resolve',link)).replayed,true);
 await call('mkz_collector_resolve',{...link,requestId:randomUUID(),mcpWallet:agent,expectedRevision:1});
 const manifest=(await q('select mkz_discovery_manifest() v'))[0].v;assert.equal(manifest.mode,'identity_and_strategy_references_only');assert.equal(manifest.accounting.aiCalculatesScores,false);
 const ref={id:'order:123:fill:1',revision:1,chainId:97477,wallet:strategyWallet,strategyId:'215',orderId:'123',transactionHash:'0x'+'f'.repeat(64),domainToken:addr(6),quoteToken:addr(7),domainUnits:'9007199254740993123',quoteUnits:'12000000',side:'buy',executedAt:at(-600),status:'verified',evidence:'Source order foreign key and completed settlement.'};
 const p={schemaVersion:1,requestId:randomUUID(),participant:'123',coverageFrom:at(-3*86400),confirmedThrough:at(-120),complete:true,problem:null,refs:[ref]};
 assert.equal((await call('mkz_discovery_references',p)).ok,true);assert.equal((await call('mkz_discovery_references',p)).replayed,true);
 await assert.rejects(()=>call('mkz_discovery_references',{...p,complete:false,problem:'failed'}),/REQUEST_CONFLICT/);
 for(const bad of [{...p,requestId:randomUUID(),refs:[ref,ref]},{...p,requestId:randomUUID(),refs:[{...ref,domainUnits:9000}]},{...p,requestId:randomUUID(),refs:[{...ref,chainId:1}]},{...p,requestId:randomUUID(),refs:[{...ref,volumeUsd:'100'}]}])await assert.rejects(()=>call('mkz_discovery_references',bad),/INVALID/);
 await assert.rejects(()=>call('mkz_discovery_references',{...p,requestId:randomUUID(),refs:[{...ref,quoteUnits:'99'}]}),/REVISION_CONFLICT/);
 await assert.rejects(()=>call('mkz_discovery_references',{...p,requestId:randomUUID(),coverageFrom:at(-60),confirmedThrough:at(0),refs:[]}),/COVERAGE_GAP/);
 await call('mkz_discovery_references',{...p,requestId:randomUUID(),complete:false,problem:'Source temporarily unavailable',refs:[]});
 const cv=(await q('select mkz_discovery_accounts() v'))[0].v[0].coverage;assert.equal(cv.complete,false);
 await call('mkz_discovery_references',{...p,requestId:randomUUID(),refs:[{...ref,revision:2,status:'revoked'}]});
 for(const sql of ["select mkz_collector_ingest('{}')","select mkz_collector_accounting('{}')","select mkz_worker_snapshot()","select * from mkz_strategy_references","update mkz_campaigns set state='active'"])await assert.rejects(()=>q(sql),/permission denied/);
 await q('reset role');
 assert.equal((await q('select participant from mkz_wallets where trade_wallet=$1',[strategyWallet]))[0].participant,'123');
 await assert.rejects(()=>call('mkz_collector_resolve',{...link,requestId:randomUUID(),wallet:addr(4),domaUserId:'999',mcpWallet:strategyWallet,expectedRevision:0}),/REVIEW_REQUIRED/);
 for(const role of ['anon','authenticated']){await q('set role '+role);await assert.rejects(()=>q('select mkz_discovery_accounts()'),/permission denied/);await assert.rejects(()=>q('select mkz_worker_snapshot()'),/permission denied/);await q('reset role');}
 const snap=(await q('select mkz_worker_snapshot() v'))[0].v;
 assert.equal(snap.references.length,1);assert.equal(snap.wallets.length,3);assert.match(snap.fingerprint,/^[a-f0-9]{32}$/);
 assert.equal(snap.manifest.campaign.state,'draft');
 const command={requestId:randomUUID(),fingerprint:snap.fingerprint,packet:{schemaVersion:1,rules:'mk-token-zones-1',campaignId:'model-kombat-zones-1',requestId:randomUUID(),coverageFrom:at(-86400),confirmedThrough:at(-120),complete:false,financialComplete:false,financials:[],fills:[]},report:{complete:false}};
 await assert.rejects(()=>call('mkz_worker_commit',command),/CAMPAIGN_NOT_ACCEPTING/);
 await assert.rejects(()=>call('mkz_worker_commit',{...command,fingerprint:'old'}),/SOURCE_CHANGED/);
 for(const table of ['mkz_fills','mkz_financials','mkz_entries','mkz_worker_runs','mk8_garages'])assert.equal((await q(`select count(*)::int n from ${table}`))[0].n,0);
 // Idempotent install preserves identity, private evidence and campaign state.
 await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-discovery.sql'),'utf8'));
 assert.equal((await q('select mkz_worker_snapshot() v'))[0].v.fingerprint,snap.fingerprint);
 // Active scoring exists only inside this disposable database fixture.
 await q('alter table mkz_campaigns disable trigger mkz_campaign_guard');
 await q("update mkz_campaigns set state='active',starts_at=$1,ends_at=$1::timestamptz+interval '28 days',financial_method='mk-fifo-realized-capital-1'",[at(-86400)]);
 await q('alter table mkz_campaigns enable trigger mkz_campaign_guard');
 await q('insert into mkz_entries values($1,$2,$3,$4)',['model-kombat-zones-1','123',wallet,at(-86400)]);
 await q('insert into mkz_markets values(97477,$1,$2,$3,$4,$5,now())',[addr(6),addr(7),'fixture.test','USDC','isolated fixture']);
 const fill={chainId:97477,economicId:'public:fixture',revision:1,wallet:agent,transactionHash:ref.transactionHash,domainToken:addr(6),quoteToken:addr(7),executedAt:at(-600),volumeUsd:'12.000000',source:'agent_wallet',status:'verified',evidence:'Finalized fixture receipt'};
 let active={...command,requestId:randomUUID(),fingerprint:(await q('select mkz_worker_snapshot() v'))[0].v.fingerprint,packet:{...command.packet,complete:true,fills:[fill]}};
 await call('mkz_worker_commit',active);assert.equal((await call('mkz_worker_commit',active)).replayed,true);
 await assert.rejects(()=>call('mkz_worker_commit',{...active,report:{changed:true}}),/REQUEST_CONFLICT/);
 assert.equal(Number((await q('select mkz_read(null) v'))[0].v.volume),12);
 const ledger={schemaVersion:1,campaignId:'model-kombat-zones-1',methodology:'mk-fifo-realized-capital-1',participant:'123',requestId:randomUUID(),revision:1,periodStart:at(-86400),confirmedThrough:at(-120),complete:true,evidence:'Independent fixture history',openingLots:[{id:'opening',wallet:agent,token:addr(6),units:'100',costUsd:'10.000000',valueUsd:'10.000000',acquiredAt:at(-2*86400),evidence:'historical lot'}],events:[{id:'sale',kind:'sell',wallet:agent,token:addr(6),units:'100',usd:'12.000000',notionalUsd:'12.000000',economicId:fill.economicId,executedAt:at(-600),order:1,evidence:'same fill'}]};
 active={...active,requestId:randomUUID(),fingerprint:(await q('select mkz_worker_snapshot() v'))[0].v.fingerprint,accounting:[ledger],packet:{...active.packet,financialComplete:true,methodology:ledger.methodology}};
 await call('mkz_worker_commit',active);assert.equal((await call('mkz_worker_commit',active)).replayed,true);
 const scored=(await q('select mkz_read(null) v'))[0].v;assert.equal(scored.campaign.financial_complete,true);assert.equal(Number(scored.participants[0].profit),2);assert.equal(Number(scored.participants[0].roi),20);
 const before=(await q('select count(*)::int n from mkz_fills'))[0].n;
 const bad={...active,requestId:randomUUID(),fingerprint:(await q('select mkz_worker_snapshot() v'))[0].v.fingerprint,accounting:[{...ledger,requestId:randomUUID(),revision:2,events:[]}],packet:{...active.packet,fills:[{...fill,economicId:'public:second'}]}};
 await assert.rejects(()=>call('mkz_worker_commit',bad),/FILL_COVERAGE_INCOMPLETE/);
 assert.equal((await q('select count(*)::int n from mkz_fills'))[0].n,before,'ledger failure rolls back trade changes too');
 const bundlePath='D:/Temp/modelkombat-launch-guide/01-workshop-setup.sql';
 if(fs.existsSync(bundlePath)){
  const priorCampaign=(await q('select * from mkz_campaigns'))[0],priorFill=(await q('select * from mkz_fills'))[0];
  // Test the exact one-paste handoff, including its setup queries, twice.
  for(let n=0;n<2;n++)await db.exec(fs.readFileSync(bundlePath,'utf8'));
  assert.deepEqual((await q('select * from mkz_campaigns'))[0],priorCampaign);
  assert.deepEqual((await q('select * from mkz_fills'))[0],priorFill);
  assert.equal((await q("select has_function_privilege('doma_ai_mk','mkz_collector_ingest(jsonb)','EXECUTE') allowed"))[0].allowed,false);
  console.log('PASS exact packaged SQL twice: active campaign, scored fills and reduced AI permissions preserved.');
 }
 console.log('PASS PostgreSQL discovery: Strategy-only accounts, later MCP attachment, private references, source coverage failures, correction/revocation, retry conflicts, no AI scoring rights, no public identity access, draft writes refused, repeat-safe setup.');
 console.log('PASS atomic backend settlement: volume, server-calculated FIFO ROI/profit, retry conflict, replay and full rollback on missing accounting evidence.');
 }finally{await db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
