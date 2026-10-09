'use strict';
const assert=require('node:assert/strict');
const {progressivePublication}=require('./lib/progressive-publication.cjs');
async function main(){
 const packet={confirmedThrough:'2026-10-09T06:09:55Z',complete:true,financialComplete:false,financials:[],fills:[{id:'actual-fill'}]},calls=[];
 let current='a'.repeat(32),serial=0;const coverage=[{participant:'1',complete:true},{participant:'2',complete:true}];
 const rpc=async(name,{p})=>{assert.equal(name,'mkz_worker_commit');assert.equal(p.fingerprint,current,'must use preceding own transaction fingerprint');calls.push(p);current=(++serial).toString(16).padStart(32,'0');return {ok:true,nextFingerprint:current,accountingRejected:p.accounting[0]?.participant==='2'?[{participant:'2',code:'ACCOUNTING_INVALID'}]:[]};};
 const pub=progressivePublication({snapshot:{fingerprint:current},packet,accountCoverage:coverage,rpc});
 await pub.start({});assert.equal(calls[0].packet.fills.length,1);assert.equal(calls[0].packet.financialComplete,false);
 assert.equal(await pub.ledger({participant:'1'}),true);assert.equal(pub.published,1);assert.equal(calls.length,2,'first account has already reached storage');assert.equal(calls[1].packet.fills.length,0);
 assert.equal(await pub.ledger({participant:'2'}),false);assert.equal(pub.published,1);packet.financialComplete=true;await pub.finish({});assert.equal(calls[3].packet.financialComplete,false,'one rejected account cannot finalize awards');
 await assert.rejects(()=>pub.finish({}),/PUBLICATION_STATE_INVALID/);assert.equal(new Set(calls.map(c=>c.requestId)).size,4);
 for(const mode of ['concurrent','network','bad-response']){
  let count=0;const p=progressivePublication({snapshot:{fingerprint:'a'.repeat(32)},packet:{...packet,financialComplete:false},accountCoverage:coverage,rpc:async()=>{if(++count===1)return {ok:true,nextFingerprint:'b'.repeat(32)};if(mode==='concurrent')throw Error('WORKER_COMMIT_MK_WORKER_SOURCE_CHANGED');if(mode==='network')throw Error('NETWORK_UNAVAILABLE');return {ok:true,nextFingerprint:'not-a-fingerprint'};}});
  await p.start({});await assert.rejects(()=>p.ledger({participant:'1'}));assert.equal(p.stopped,true);assert.equal(p.published,0);await assert.rejects(()=>p.finish({}));assert.equal(count,2,'never blindly adopt changed source evidence after a failed write');
 }
 console.log('PASS progressive publication: trades before accounting, each account saved immediately, exact transaction fingerprint chain, rejected-account isolation, no false finality, and stopped writes after concurrent change/network failure.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
