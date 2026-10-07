'use strict';
const assert=require('node:assert/strict'),{publicSource}=require('./lib/public-trade-source.cjs');
const wallet='0x'+'a'.repeat(40),receipt='0x'+'b'.repeat(64);
const response=data=>new Response(JSON.stringify(data),{status:200});
async function main(){
 let active=0,aborted=0,requests=0,late=0,mode='blocked';
 const source=publicSource({apiKey:'test-only',delay:0,fetcher:async(url,options)=>{
  requests++;if(mode==='ready')return response({jsonrpc:'2.0',result:{status:'0x1',transactionHash:receipt}});
  active++;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{late++;active--;resolve(response({items:[],next_page_params:null}));},1000);
   options.signal.addEventListener('abort',()=>{clearTimeout(timer);active--;aborted++;reject(new DOMException('aborted','AbortError'));},{once:true});
  });
 }});
 const start=Date.now();
 await assert.rejects(()=>source.withDeadline(Date.now()+45,()=>source.transfers(wallet,0,Date.now())),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);
 assert.ok(Date.now()-start<400);assert.equal(active,0);assert.equal(aborted,1);assert.equal(requests,1);
 await new Promise(r=>setTimeout(r,80));assert.equal(requests,1);assert.equal(late,0);
 // Expired global-cycle budget skips later accounts without starting I/O.
 await assert.rejects(()=>source.withDeadline(Date.now()-1,()=>source.transfers(wallet,0,Date.now())),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);assert.equal(requests,1);
 // Cached/CPU work also notices the absolute deadline without waiting for
 // a timer callback or starting another request.
 const cachedDeadline=Date.now()+5;
 await assert.rejects(()=>source.withDeadline(cachedDeadline,async()=>{while(Date.now()<=cachedDeadline){}source.checkBudget();}),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);assert.equal(requests,1);
 // Cancellation is scoped to accounting; the already collected packet can
 // still commit, and the source remains usable in a subsequent cycle.
 mode='ready';assert.equal((await source.receipt(receipt)).status,'0x1');assert.equal(requests,2);
 let tries=0;
 const retry=publicSource({apiKey:'test-only',delay:0,fetcher:async()=>{tries++;if(tries===1)throw new DOMException('timeout','TimeoutError');return response({jsonrpc:'2.0',result:{status:'0x1'}})}});
 assert.equal((await retry.receipt(receipt)).status,'0x1');assert.equal(tries,2);
 let backoffCalls=0;
 const backoff=publicSource({apiKey:'test-only',delay:0,fetcher:async()=>{backoffCalls++;return new Response('{}',{status:503})}});
 const before=Date.now();await assert.rejects(()=>backoff.withDeadline(Date.now()+40,()=>backoff.receipt(receipt)),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);assert.ok(Date.now()-before<400);assert.equal(backoffCalls,1);
 console.log('PASS accounting budget: real in-flight abort, cancelled backoff, no orphan requests or partial result, expired global budget skips work, source recovers, and bounded transient read retry.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
