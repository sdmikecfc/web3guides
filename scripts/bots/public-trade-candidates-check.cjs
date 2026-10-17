'use strict';
const assert=require('node:assert/strict'),{rpcErc20History,TRANSFER}=require('./lib/public-erc20-log-history.cjs');
const hex=n=>'0x'+BigInt(n).toString(16),hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),address=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),clone=x=>JSON.parse(JSON.stringify(x));
const wallet=address(1),outside=address(2),domain=address(3),quote=address(4),base=Date.parse('2026-10-07T00:00:00Z');
const block=n=>({number:hex(n),hash:hash(n+10000),parentHash:hash(n+9999),timestamp:hex(base/1000+n)});
const log=(n,token=domain,index=0)=>({address:token,blockHash:block(n).hash,blockNumber:hex(n),transactionHash:hash(n+100000),transactionIndex:'0x0',logIndex:hex(index),removed:false,topics:[TRANSFER,hash(BigInt(outside)),hash(BigInt(wallet))],data:hash(1)});
function fixture({count=1000,mutate=null,logs=null}={}){
 const data=logs||Array.from({length:count},(_,i)=>log(i+1,i%2?domain:quote)),calls=[],ranges=new Map();let receipts=0;
 const rpc=async(method,params)=>{
  calls.push({method,params});let result;
  if(method==='eth_chainId')result=hex(97477);
  else if(method==='eth_getBlockByNumber')result=block(params[0]==='finalized'?2000:Number(BigInt(params[0])));
  else if(method==='eth_getLogs'){const f=params[0];result=data.filter(l=>BigInt(l.blockNumber)>=BigInt(f.fromBlock)&&BigInt(l.blockNumber)<=BigInt(f.toBlock)&&f.topics.every((t,i)=>t===null||t===l.topics[i]));}
  else throw Error('UNEXPECTED_RPC');
  result=clone(result);return mutate?mutate({method,params,result,calls}):result;
 };
 const receipt=async tx=>{receipts++;const own=data.filter(l=>l.transactionHash===tx),first=own[0];return {transactionHash:tx,blockHash:first.blockHash,blockNumber:first.blockNumber,transactionIndex:'0x0',status:'0x1',logs:clone(own)};};
 const rangeCacheFor=scope=>{const k=JSON.stringify(scope);if(!ranges.has(k))ranges.set(k,new Map());const store=ranges.get(k);return {get:key=>store.get(JSON.stringify(key)),set:(key,value)=>store.set(JSON.stringify(key),clone(value)),clear:()=>store.clear()};};
 const make=(purpose='trade-candidates',extras={})=>rpcErc20History({rpc,receipt,blockAt:async t=>block(Math.floor((t-base)/1000)),rangeCacheFor,maxBlockRange:100,purpose,...extras});
 return {make,rpc,receipt,calls,ranges,get receipts(){return receipts;}};
}
async function main(){
 const cold=fixture(),found=await cold.make()(wallet,base+1000,base+1000000),candidateCalls=cold.calls.length;
 assert.equal(found.length,1000);assert.equal(cold.receipts,0,'discovery never eagerly fetches receipts');
 assert.ok(found.every(c=>/^0x[0-9a-f]+$/.test(c.blockNumber)&&c.tokens.length===1&&!Object.hasOwn(c,'timestamp')&&!Object.hasOwn(c,'amount')),'candidates do not claim derived amounts or timestamps');
 const full=fixture();assert.equal((await full.make('accounting')(wallet,base+1000,base+1000000)).length,1000);
 const fullCalls=full.calls.length+full.receipts;
 assert.equal(full.receipts,1000,'accounting still independently validates every receipt');assert.ok(candidateCalls<fullCalls/10,'candidate discovery removes at least 90% of the synthetic cold proof requests');
 cold.calls.length=0;assert.deepEqual(await cold.make()(wallet,base+1000,base+1000000),found);assert.equal(cold.calls.filter(c=>c.method==='eth_getLogs').length,0,'warm discovery reuses only its own finalized range namespace');
 assert.equal(cold.receipts,0);
 cold.calls.length=0;await cold.make('accounting')(wallet,base+1000,base+1000000);assert.ok(cold.calls.some(c=>c.method==='eth_getLogs'),'candidate cache cannot certify accounting history');assert.equal(cold.receipts,1000);
 await assert.rejects(()=>cold.make()(wallet,base+1000,base+2000,[domain]),/CANDIDATE_TOKEN_FILTER_FORBIDDEN/);
 const boundary=fixture({count:3});assert.deepEqual((await boundary.make()(wallet,base+1001,base+2999)).map(c=>c.blockNumber),['0x2'],'fractional boundary excludes the entire earlier lower block');
 const missing=fixture({logs:[log(2,domain),log(2,quote,1)],mutate:({method,result})=>method==='eth_getLogs'?result.filter(l=>l.address===quote):result});
 const quoteOnly=await missing.make()(wallet,base+1000,base+3000);assert.equal(quoteOnly.length,1);assert.deepEqual(quoteOnly[0].tokens,[quote],'a missing domain leg still yields the quote-only transaction for collector receipt verification');
 await assert.rejects(()=>missing.make('accounting')(wallet,base+1000,base+3000),/MISSING_RECEIPT_LOG/,'full accounting omission detection is unchanged');
 const capped=fixture({count:3});assert.deepEqual(await capped.make('trade-candidates',{maxResponseLogs:2})(wallet,base+1000,base+3000),await fixture({count:3}).make()(wallet,base+1000,base+3000),'capped candidate discovery splits and proves the same complete window');assert.equal(capped.receipts,0);
 const singleBlockCap=fixture({logs:[log(2,domain,0),log(2,quote,1)]});await assert.rejects(()=>singleBlockCap.make('trade-candidates',{maxResponseLogs:2})(wallet,base+1000,base+3000),/LOG_LIMIT/);assert.ok([...singleBlockCap.ranges.values()].every(m=>m.size===0),'single-block overflow cannot save partial discovery ranges');
 const changed=fixture({count:3,mutate:({method,result,calls})=>method==='eth_getLogs'&&calls.filter(c=>c.method==='eth_getLogs').length===2?[]:result});await assert.rejects(()=>changed.make()(wallet,base+1000,base+3000),/LOG_SET_CHANGED/);
 const duplicates=fixture({count:3,mutate:({method,result})=>method==='eth_getLogs'&&result.length?[...result,result[0]]:result});await assert.rejects(()=>duplicates.make()(wallet,base+1000,base+3000),/DUPLICATE_LOG/);
 let boundaryReads=0;const reorg=fixture({count:3,mutate:({method,params,result})=>{if(method==='eth_getBlockByNumber'&&params[0]==='0x3'&&++boundaryReads>=4)result.hash=hash(999);return result;}});
 await assert.rejects(()=>reorg.make()(wallet,base+1000,base+3000),/ANCHOR_CHANGED/);assert.ok([...reorg.ranges.values()].every(m=>m.size===0),'failed final anchor never persists discovery ranges');
 let checks=0;const stopped=fixture({count:3});await assert.rejects(()=>stopped.make('trade-candidates',{checkBudget:()=>{if(++checks>12)throw Error('TRADE_SCAN_TIME_BUDGET_EXCEEDED');}})(wallet,base+1000,base+3000),/TRADE_SCAN_TIME_BUDGET_EXCEEDED/);assert.ok([...stopped.ranges.values()].every(m=>m.size===0));
 // Exercise the real source API and its cancellation, not only the helper.
 const {publicSource}=require('./lib/public-trade-source.cjs');let active=0,aborted=0,cancel=false;
 const api=fixture({count:3}),source=publicSource({apiKey:'test-only',delay:0,erc20History:'hybrid',fetcher:async(_url,options)=>{
  const q=JSON.parse(options.body);if(cancel&&q.method==='eth_getLogs'){active++;return new Promise((_resolve,reject)=>{const stop=()=>{active--;aborted++;reject(new DOMException('aborted','AbortError'));};if(options.signal.aborted)stop();else options.signal.addEventListener('abort',stop,{once:true});});}
  if(q.method==='eth_getTransactionReceipt')return new Response(JSON.stringify({result:await api.receipt(q.params[0])}));return new Response(JSON.stringify({result:await api.rpc(q.method,q.params)}));
 }});
 assert.equal((await source.tradeCandidates(wallet,base+1000,base+3000)).length,3);assert.equal(api.receipts,0);
 assert.equal((await source.transfers(wallet,base+1000,base+3000)).length,3);assert.equal(api.receipts,3);
 cancel=true;await assert.rejects(()=>source.withDeadline(Date.now()+80,()=>source.tradeCandidates(wallet,base+1000,base+3000),{errorCode:'TRADE_SCAN_TIME_BUDGET_EXCEEDED'}),/TRADE_SCAN_TIME_BUDGET_EXCEEDED/);assert.equal(active,0);assert.ok(aborted>=1);
 console.log('PASS trade-only discovery: all-asset whole/split RPC windows, exact boundaries, quote-only candidates retained, separate cache, unchanged full accounting proofs, caps, mutations, reorgs and drained deadline cancellation.');
 console.log(JSON.stringify({syntheticColdRequests:{fullAccounting:fullCalls,tradeCandidates:candidateCalls,reductionPercent:Math.round((1-candidateCalls/fullCalls)*100)}}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
