'use strict';
// Always uses the fixed loopback PostgreSQL adapter, never a production DSN.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const {PGlite}=require('./postgres-test-adapter.cjs');
const {collect}=require('./lib/public-trade-worker.cjs');
const {verifySmartWalletSettlement}=require('./lib/public-smart-wallet-settlement.cjs');
const {serializeEvidence,rpcFailure,preflightWorkerPacket}=require('./lib/worker-contract.cjs');
const {fixtures,context,mockSource,snapshot}=require('./public-smart-wallet-check.cjs');
const migrations=['bots-workshop-v8','bots-workshop-journey','bots-workshop-competition','bots-workshop-wallet-links','bots-token-zones','bots-token-zone-wallets','bots-token-zone-payout-policy','bots-token-zone-collector','bots-token-zone-accounting','bots-token-zone-discovery'];
const wallet='0x'+'1'.padStart(40,'0'),participant='123';
async function main(){
 const actualPath=process.argv[2];
 const three=(await collect(snapshot(),mockSource(fixtures),{now:Date.parse('2026-10-06T23:02:00Z')})).packet;
 const packet=actualPath?JSON.parse(fs.readFileSync(actualPath,'utf8')):{...three,fills:[...Array.from({length:13},(_,i)=>({...three.fills[0],economicId:'public:preexisting-'+i,transactionHash:'0x'+(100+i).toString(16).padStart(64,'0'),volumeUsd:'1.000000',evidence:'Pre-existing isolated fixture'})),...three.fills]};
 packet.complete=true;
 assert.equal(packet.fills.length,16);assert.ok(packet.fills.every(f=>f.evidence.length<=1000));
 const newIds=new Set(three.fills.map(f=>f.economicId)),baseline=packet.fills.filter(f=>!newIds.has(f.economicId));assert.equal(baseline.length,13);
 const fullProofs=new Map();
 for(const f of fixtures){const p=await verifySmartWalletSettlement(context(f)),proof={version:2,blockHash:f.receipt.blockHash,blockNumber:f.receipt.blockNumber,source:'public_receipt',strategy:null,strategyRevision:null,...p.amounts};const full=JSON.stringify(proof),compact=JSON.parse(serializeEvidence(proof));assert.ok(full.length>1000);assert.equal(compact.proofSha256,createHash('sha256').update(full).digest('hex'));fullProofs.set(f.transaction.hash,full);}
 const db=new PGlite();
 try{
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const call=async(name,body)=>(await q(`select ${name}($1::jsonb) v`,[JSON.stringify(body)]))[0].v;
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test boolean default false,is_operator boolean default false)');
  for(const name of migrations)await db.exec(fs.readFileSync(path.join(__dirname,'../sql',name+'.sql'),'utf8'));
  const agent=packet.fills[0].wallet;assert.ok(packet.fills.every(f=>f.wallet===agent));
  await q('select mkz_register_wallet($1)',[wallet]);
  await call('mkz_collector_resolve',{schemaVersion:1,requestId:randomUUID(),wallet,mcpWallet:agent,domaUserId:participant,privyDid:null,status:'linked',checkedAt:new Date().toISOString(),expectedRevision:0});
  await q('alter table mkz_campaigns disable trigger mkz_campaign_guard');
  await q("update mkz_campaigns set state='active',starts_at=$1,ends_at=$1::timestamptz+interval '28 days',financial_method='mk-fifo-realized-capital-1'",[packet.coverageFrom]);
  await q('alter table mkz_campaigns enable trigger mkz_campaign_guard');
  await q('insert into mkz_entries values($1,$2,$3,$4)',[packet.campaignId,participant,wallet,packet.coverageFrom]);
  const markets=new Map(packet.fills.map(f=>[f.domainToken+':'+f.quoteToken,f]));
  for(const f of markets.values())await q('insert into mkz_markets values(97477,$1,$2,$3,$4,$5,now())',[f.domainToken,f.quoteToken,'fixture.test','USDC','isolated actual packet']);
  const command=async(p,accounting=[])=>({requestId:randomUUID(),fingerprint:(await q('select mkz_worker_snapshot() v'))[0].v.fingerprint,packet:{...p,requestId:randomUUID()},accounting,report:{complete:p.complete,financialComplete:false}});
  await call('mkz_worker_commit',await command({...packet,fills:baseline,complete:false}));
  await q('insert into mkz_financials values($1,$2,$3,$4,$5,$6)',[packet.campaignId,participant,'10','2','mk-fifo-realized-capital-1','previous verified fixture']);
  await q('insert into mkz_accounting_snapshots values($1,$2,1,$3,$4,now())',[packet.campaignId,participant,randomUUID(),JSON.stringify({confirmedThrough:packet.coverageFrom,complete:true,evidence:'retained earlier snapshot'})]);
  const retained=(await q('select * from mkz_accounting_snapshots'))[0],financial=(await q('select * from mkz_financials'))[0];
  const oversized={...packet,fills:packet.fills.map(f=>fullProofs.has(f.transactionHash)?{...f,evidence:fullProofs.get(f.transactionHash)}:f)};
  const oldCommand=await command(oversized);await assert.rejects(()=>call('mkz_worker_commit',oldCommand),/MKZ_BATCH_INVALID/);
  assert.equal((await q('select count(*)::int n from mkz_fills'))[0].n,13);
  // Failure after inserting the new fills must roll the entire transaction back.
  const failedFinal=await command({...packet,financialComplete:true,methodology:'mk-fifo-realized-capital-1'});
  await assert.rejects(()=>call('mkz_worker_commit',failedFinal),/FINANCIAL_COVERAGE_INCOMPLETE/);
  assert.equal((await q('select count(*)::int n from mkz_fills'))[0].n,13);
  const checks=await preflightWorkerPacket(packet,async(name,args)=>call(name,args.p_payload));assert.equal(checks.writesPerformed,0);
  const good=await command(packet);assert.equal((await call('mkz_worker_commit',good)).ok,true);assert.equal((await call('mkz_worker_commit',good)).replayed,true);
  assert.equal((await q('select count(*)::int n from mkz_fills'))[0].n,16);
  assert.deepEqual((await q('select * from mkz_accounting_snapshots'))[0],retained);assert.deepEqual((await q('select * from mkz_financials'))[0],financial);
  assert.equal((await q('select financial_complete from mkz_campaigns'))[0].financial_complete,false);
  const corrected={...packet,fills:[{...packet.fills[15],revision:packet.fills[15].revision+1,status:'revoked'}]};
  await call('mkz_worker_commit',await command(corrected));assert.equal((await q("select count(*)::int n from mkz_fills where status='verified'"))[0].n,15);
  const error=rpcFailure('mkz_worker_commit',{code:'P0001',message:'MKZ_BATCH_INVALID'});assert.equal(error.message,'WORKER_COMMIT_MKZ_BATCH_INVALID');
  const safe=require('./lib/worker-health.cjs').healthPayload({workerVersion:'test',phase:'AUDIT_FAILED'},{code:error.message});assert.equal(safe.code,error.message);
  assert.equal(rpcFailure('mkz_worker_commit',{code:'P0001',message:'private contents must not escape'}).message,'WORKER_COMMIT_SQL_P0001');
  console.log(JSON.stringify({passed:true,isolatedDatabase:db.database,actualPacket:!!actualPath,baseline:13,committed:16,oldProofRejected:'MKZ_BATCH_INVALID',duplicateReplay:true,correction:true,rollback:true,priorFinancialsPreserved:true,productionWrites:0}));
 }finally{await db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
