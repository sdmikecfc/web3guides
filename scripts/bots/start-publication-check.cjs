'use strict';
const assert=require('node:assert/strict');
const {startPublication}=require('./lib/start-publication.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),start='2026-10-06T14:00:00.000Z',cutoff='2026-10-09T13:00:00.000Z';
function fixture(){
 const wallet='0x'+'1'.repeat(40),snapshot={fingerprint:'a'.repeat(32),manifest:{campaign:{id:'model-kombat-zones-1',rules:'mk-token-zones-1',state:'active',starts_at:start,ends_at:'2026-11-03T14:00:00.000Z',confirmed_through:start,complete:false,financial_complete:false,financial_method:'mk-fifo-realized-capital-1'},participants:[{participant:'1',wallet,entered_at:start}],markets:[],rewardAssets:[],setupIssues:[]},accounts:[{participant:'1',registered_wallets:[wallet],agent_wallets:[],reference_since:start,coverage:{participant:'1',coverage_from:start,confirmed_through:cutoff,complete:true,updated_at:cutoff}}],wallets:[{participant:'1',trade_wallet:wallet,agent:false}],references:[],fills:[],accountingRevisions:{}};
 const packet={campaignId:snapshot.manifest.campaign.id,rules:snapshot.manifest.campaign.rules,coverageFrom:start,confirmedThrough:cutoff,complete:true,financialComplete:false,financials:[],fills:[{chainId:97477,economicId:'scan-result',revision:1}]},accountCoverage=[{participant:'1',coverageFrom:start,confirmedThrough:cutoff,complete:true,problems:[]}];
 return {snapshot,packet,accountCoverage};
}
function database(context,onRead,onCommit){
 let current=clone(context.snapshot),serial=20,reads=0,commits=0;const bodies=[];
 const advance=()=>{current.fingerprint=(++serial).toString(16).padStart(32,'0');};
 const rpc=async(name,args)=>{
  if(name==='mkz_worker_snapshot'){reads++;const value=clone(current);if(onRead)await onRead({current,value,advance,reads});return value;}
  assert.equal(name,'mkz_worker_commit');commits++;const body=args.p;bodies.push(clone(body));
  if(body.fingerprint!==current.fingerprint)throw Error('WORKER_COMMIT_MK_WORKER_SOURCE_CHANGED');
  if(onCommit)return onCommit({current,advance,body,commits});
  advance();return {ok:true,nextFingerprint:current.fingerprint,accountingRejected:[]};
 };
 return {rpc,bodies,get reads(){return reads;},get commits(){return commits;},get current(){return current;},advance};
}
async function main(){
 {
  const f=fixture(),before=clone(f),db=database(f);db.current.accounts[0].coverage.updated_at='2026-10-09T14:00:00.000Z';db.advance();
  const p=await startPublication({...f,rpc:db.rpc,report:{label:'first-publication'}});
  assert.equal(db.reads,1);assert.equal(db.commits,1);assert.equal(db.bodies[0].fingerprint,'00000000000000000000000000000015');assert.equal(db.bodies[0].report.label,'first-publication');assert.deepEqual(db.bodies[0].packet.fills,f.packet.fills);assert.deepEqual(f,before,'the original proof and scan remain unchanged');
  await p.ledger({participant:'1'});assert.equal(db.reads,1,'later commits use own exact returned fingerprint, not fresh registry reads');assert.equal(db.commits,2);assert.equal(db.bodies[1].packet.fills.length,0);
 }
 {
  const f=fixture(),db=database(f,({current,advance,reads})=>{if(reads===1){current.accounts[0].coverage.updated_at='2026-10-09T14:00:00.000Z';advance();}});
  await startPublication({...f,rpc:db.rpc});assert.equal(db.reads,2);assert.equal(db.commits,2,'a known SQL rejection can retry after harmless heartbeat race');assert.deepEqual(db.bodies[0].packet.fills,db.bodies[1].packet.fills);
 }
 {
  const f=fixture(),db=database(f);db.current.wallets[0].agent=true;db.advance();
  await assert.rejects(()=>startPublication({...f,rpc:db.rpc}),e=>e.message==='PUBLICATION_SOURCE_CHANGED'&&e.sourceReason==='WALLETS');assert.equal(db.commits,0,'changed attribution cannot reach SQL');
 }
 {
  const f=fixture(),db=database(f,({current,advance,reads})=>{if(reads===1){current.wallets[0].agent=true;advance();}});
  await assert.rejects(()=>startPublication({...f,rpc:db.rpc}),e=>e.message==='PUBLICATION_SOURCE_CHANGED'&&e.sourceReason==='WALLETS');assert.equal(db.reads,2);assert.equal(db.commits,1,'material change after first read is not blindly adopted on retry');
 }
 {
  const f=fixture(),db=database(f,({current,advance})=>{current.accounts[0].coverage.updated_at=new Date().toISOString();advance();});
  await assert.rejects(()=>startPublication({...f,rpc:db.rpc}),/WORKER_COMMIT_MK_WORKER_SOURCE_CHANGED/);assert.equal(db.reads,3);assert.equal(db.commits,3,'continually moving source stops after exactly three attempts');
 }
 for(const code of ['NETWORK_UNAVAILABLE','WORKER_COMMIT_MKZ_BATCH_INVALID','PUBLICATION_RESPONSE_INVALID']){
  const f=fixture(),db=database(f,null,({advance})=>{advance();if(code==='PUBLICATION_RESPONSE_INVALID')return {ok:true,nextFingerprint:'invalid'};throw Error(code);});
  await assert.rejects(()=>startPublication({...f,rpc:db.rpc}),new RegExp(code));assert.equal(db.reads,1);assert.equal(db.commits,1,'unknown or non-CAS outcomes must never generate another write');
 }
 {
  const f=fixture();let calls=0;await assert.rejects(()=>startPublication({...f,rpc:async()=>{calls++;throw Error('SNAPSHOT_READ_UNAVAILABLE');}}),/SNAPSHOT_READ_UNAVAILABLE/);assert.equal(calls,1);
 }
 console.log('PASS publication start: harmless preflight drift and atomic CAS races revalidated safely; material changes refused; three-attempt bound; original proof preserved; no retries after unknown outcomes; subsequent commits keep strict fingerprint chain.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
