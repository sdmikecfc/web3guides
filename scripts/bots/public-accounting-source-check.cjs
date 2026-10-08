'use strict';
// Public-source fixtures only. No keys, network, database or real account writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {publicSource}=require('./lib/public-trade-source.cjs'),{openAccountingCache}=require('./lib/accounting-cache.cjs');
const {CHAIN}=require('./lib/public-trade-worker.cjs');
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),hex=n=>'0x'+n.toString(16),hash=n=>'0x'+n.toString(16).padStart(64,'0');
const wallet=addr(1),token=addr(2),other=addr(3),secondToken=addr(4),baseTime=Date.parse('2026-10-07T00:00:00Z'),at=h=>new Date(baseTime+h*3600000).toISOString();
const start=baseTime,through=baseTime+6*3600000,anchor={number:hex(100),hash:hash(100)},response=data=>new Response(JSON.stringify(data),{status:200}),copy=x=>structuredClone(x);
const transfer=(n,h,t=token)=>({block_hash:hash(n),block_number:n,transaction_hash:hash(1000+n),log_index:0,timestamp:at(h),from:{hash:wallet},to:{hash:other},token:{address_hash:t},total:{value:'10000000000000000001',decimals:'18'}});
const page=(items,next=null)=>({items,next_page_params:next});
const tempBase=process.platform==='win32'?'D:/Temp':os.tmpdir(),directory=fs.mkdtempSync(path.join(tempBase,'mk-accounting-source-check-'));
let serial=0;
function cache(){return openAccountingCache({directory:path.join(directory,'case-'+(++serial)),chainId:CHAIN,maxBytes:8*1024*1024,maxEntries:300});}
function rpcFixture(){
 const calls=[],overrides=new Map();let final=200;
 return {calls,overrides,setFinal:n=>{final=n},async reply(options){const {method,params}=JSON.parse(options.body);calls.push({method,params});
  if(method==='eth_chainId')return response({result:hex(CHAIN)});
  if(method==='eth_getBlockByNumber'){const n=params[0]==='finalized'?final:Number(BigInt(params[0]));return response({result:{number:hex(n),hash:overrides.get(n)??hash(n),timestamp:hex(n)}});}
  if(method==='eth_getBalance')return response({result:'0x20000000000001'});
  if(method==='eth_getTransactionReceipt')return response({result:{transactionHash:params[0],blockNumber:hex(40),blockHash:hash(40),status:'0x1',logs:[]}});
  if(method==='eth_getTransactionByHash')return response({result:{hash:params[0],blockNumber:hex(40),blockHash:hash(40),from:wallet,to:token,value:'0x0',input:'0x'}});
  throw Error('Unexpected fixture RPC: '+method);
 }};
}
async function filteredChecks(){
 const calls=[];const source=publicSource({apiKey:'fixture',delay:0,fetcher:async url=>{const u=new URL(url),t=u.searchParams.get('token');assert.equal(u.searchParams.get('type'),'ERC-20');assert.ok([token,secondToken].includes(t));calls.push(t);return response(page([transfer(t===token?4:5,4,t)]));}});
 const rows=await source.transfersForTokens(wallet,[secondToken,token,token],start,through);assert.equal(rows.length,2);assert.deepEqual(calls,[token,secondToken,token,secondToken]);
 const wrong=publicSource({apiKey:'fixture',delay:0,fetcher:async()=>response(page([transfer(9,9,secondToken)]))});await assert.rejects(()=>wrong.transfersForTokens(wallet,[token],start,through),/TRANSFER_TOKEN_FILTER_MISMATCH/);
 let reads=0;const corrected=publicSource({apiKey:'fixture',delay:0,fetcher:async()=>{const row=transfer(4,4);if(++reads===2)row.total.value='10000000000000000002';return response(page([row]));}});await assert.rejects(()=>corrected.transfersForTokens(wallet,[token],start,through),/TRANSFER_INDEX_CHANGED/);
 const crossTokenDuplicate=publicSource({apiKey:'fixture',delay:0,fetcher:async url=>response(page([transfer(4,4,new URL(url).searchParams.get('token'))]))});await assert.rejects(()=>crossTokenDuplicate.transfersForTokens(wallet,[token,secondToken],start,through),/TRANSFER_HISTORY_DUPLICATE/);
 assert.deepEqual(await source.transfersForTokens(wallet,[],start,through),[]);assert.deepEqual(await source.transfersForTokens(wallet,[token],through+1,through),[]);
 console.log('PASS token-filtered coverage: exact token query, both independent scans, integer precision, wrong-token rejection even outside window and corrections');
}
async function nativeChecks(){
 const counts={transactions:0,'internal-transactions':0};
 const tx=(n,h)=>({hash:hash(n),block_hash:hash(n+100),block_number:n,timestamp:at(h),from:{hash:wallet},to:{hash:other},value:'10000000000000000001',fee:{value:'5'},status:'ok'});
 const source=publicSource({apiKey:'fixture',delay:0,fetcher:async url=>{const u=new URL(url),kind=u.pathname.split('/').at(-1);assert.equal(u.search,'','Scan stops once it passes the requested beginning');const read=++counts[kind];return response(kind==='transactions'?page([tx(read===1?9:10,read===1?9:10),tx(4,4),tx(1,-1)],{block_number:1,index:0}):page([]));}});
 assert.deepEqual(await source.nativeHistory(wallet,through,start),[{tx:hash(4),at:Date.parse(at(4))}]);assert.deepEqual(counts,{transactions:2,'internal-transactions':2});
 let reads=0;const changed=publicSource({apiKey:'fixture',delay:0,fetcher:async url=>{if(url.endsWith('/internal-transactions'))return response(page([]));const row=tx(4,4);if(++reads===2)row.fee.value='6';return response(page([row]));}});await assert.rejects(()=>changed.nativeHistory(wallet,through,start),/NATIVE_INDEX_CHANGED/);
 const duplicates=publicSource({apiKey:'fixture',delay:0,fetcher:async()=>response(page([tx(4,4),tx(4,4)]))});await assert.rejects(()=>duplicates.nativeHistory(wallet,through,start),/NATIVE_HISTORY_DUPLICATE/);
 console.log('PASS bounded native coverage: fresh window comparisons ignore newer head activity, stop before entry, preserve fees and reject duplicates/corrections');
}
async function immutableChecks(){
 const store=cache(),network=rpcFixture(),fetcher=(url,options)=>{assert.equal(url,'https://rpc.doma.xyz');return network.reply(options)},options={apiKey:'fixture-read-secret',delay:0,fetcher,accountingCache:store,accountingAnchor:anchor};
 let source=publicSource(options);assert.equal(await source.nativeBalance(wallet,hex(40)),9007199254740993n);await source.receipt(hash(2000));assert.equal((await source.transaction(hash(2000))).hash,hash(2000));
 const balances=()=>network.calls.filter(c=>c.method==='eth_getBalance').length,receipts=()=>network.calls.filter(c=>c.method==='eth_getTransactionReceipt').length;assert.equal(balances(),1);assert.equal(receipts(),1);
 source=publicSource(options);assert.equal(await source.nativeBalance(wallet,hex(40)),9007199254740993n);await source.receipt(hash(2000));await source.transaction(hash(2000));assert.equal(balances(),1);assert.equal(receipts(),1);assert.equal(network.calls.filter(c=>c.method==='eth_getTransactionByHash').length,1,'Proof accessor reuses canonical transaction across restarts');
 const before=network.calls.length;await source.block('finalized');await source.block('finalized');assert.equal(network.calls.length,before+2,'Mutable aliases cannot be memoized');
 source=publicSource({...options,accountingAnchor:{number:hex(200),hash:hash(200)},accountingPriorAnchors:[anchor]});await source.nativeBalance(wallet,hex(40));assert.equal(balances(),1,'Finalized evidence reuses validated prior anchor');
 await source.nativeBalance(wallet,hex(150));assert.equal(balances(),2,'A request newer than prior anchor must not query that namespace');
 await source.nativeBalance(wallet,hex(300));await source.nativeBalance(wallet,hex(300));assert.equal(balances(),4,'Unfinalized numeric reads are not persisted');
 network.overrides.set(100,hash(999));source=publicSource({...options,accountingAnchor:{number:hex(200),hash:hash(200)},accountingPriorAnchors:[anchor]});await assert.rejects(()=>source.nativeBalance(wallet,hex(40)),/ACCOUNTING_ANCHOR_REORG/);assert.equal(balances(),4);
 source=publicSource(options);await assert.rejects(()=>source.receipt(hash(2000)),/ACCOUNTING_ANCHOR_REORG/);network.overrides.clear();network.setFinal(99);await assert.rejects(()=>publicSource(options).nativeBalance(wallet,hex(40)),/ACCOUNTING_ANCHOR_NOT_FINALIZED/);
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);for(const file of walk(directory))assert.equal(fs.readFileSync(file,'utf8').includes('fixture-read-secret'),false);
 console.log('PASS durable immutable reads: restart reuse, exact integers, prior-anchor revalidation, reorg rejection, numeric finality bounds, uncached aliases and no key persistence');
}
async function transactionProofChecks(){
 const valid={hash:hash(3000),blockHash:hash(40),blockNumber:hex(40)};
 for(const value of [{...valid,hash:hash(3001)},{...valid,blockNumber:null},{...valid,blockHash:'0x0'}]){
  const source=publicSource({apiKey:'fixture',delay:0,fetcher:async()=>response({result:value})});await assert.rejects(()=>source.transaction(valid.hash),/ACCOUNTING_TRANSACTION_INVALID/);
 }
 const network=rpcFixture(),source=publicSource({apiKey:'fixture',delay:0,accountingCache:cache(),accountingAnchor:anchor,fetcher:async(url,options)=>JSON.parse(options.body).method==='eth_getTransactionByHash'?response({result:{...valid,blockNumber:hex(101),blockHash:hash(101)}}):network.reply(options)});
 await assert.rejects(()=>source.transaction(valid.hash),/ACCOUNTING_TRANSACTION_OUTSIDE_ANCHOR/);
 console.log('PASS transaction proof accessor: canonical persisted reuse and rejection of wrong identity, pending metadata and transactions newer than the accounting anchor');
}
async function blockLookupChecks(){
 const store=cache(),calls=[];let finalized=200,reorg=false,wrongBoundary=false,wrongParent=false;
 const fetcher=async(_url,options)=>{const {method,params}=JSON.parse(options.body);calls.push({method,params});
  if(method==='eth_chainId')return response({result:hex(CHAIN)});
  assert.equal(method,'eth_getBlockByNumber');const n=params[0]==='finalized'?finalized:Number(BigInt(params[0]));
  return response({result:{number:hex(wrongBoundary&&n===101?102:n),hash:hash(reorg&&n===100?999:n),parentHash:hash(wrongParent&&n===101?999:Math.max(0,n-1)),timestamp:hex(n*30)}});
 };
 const options={apiKey:'fixture',delay:0,fetcher,accountingCache:store,accountingAnchor:anchor};
 let source=publicSource(options);assert.equal((await source.blockAt(40*30000+999)).number,hex(40));
 assert.ok(calls.filter(c=>c.method==='eth_getBlockByNumber'&&c.params[0]!=='finalized').every(c=>BigInt(c.params[0])<=100n),'Earlier search stays within the pinned anchor');
 finalized=250;const before=calls.length;source=publicSource(options);assert.equal((await source.blockAt(40*30000+999)).number,hex(40));
 assert.equal(calls.length-before,3,'Restart only revalidates chain/finality/anchor; advancing head cannot invalidate search cache');
 const atAnchor=calls.length;assert.equal((await source.blockAt(100*30000)).number,hex(100));assert.equal(calls.length,atAnchor,'Exact anchor uses its already validated block');
 assert.equal((await source.blockAt(100*30000+558)).number,hex(100),'Subsecond cutoff follows anchor, before next finalized block');
 assert.equal(calls.at(-1).params[0],hex(101),'Next numeric block proves the exact interval');
 assert.equal((await source.blockAt(100*30000+29999)).number,hex(100),'Whole 30-second block interval is supported');
 await assert.rejects(()=>source.blockAt(101*30000),/ACCOUNTING_TIME_OUTSIDE_ANCHOR/);
 await assert.rejects(()=>source.blockAt(150*30000),/ACCOUNTING_TIME_OUTSIDE_ANCHOR/);
 finalized=100;await assert.rejects(()=>publicSource(options).blockAt(100*30000+558),/ACCOUNTING_TIME_OUTSIDE_ANCHOR/);
 finalized=250;reorg=true;await assert.rejects(()=>publicSource(options).blockAt(40*30000+999),/ACCOUNTING_ANCHOR_REORG/);reorg=false;
 wrongBoundary=true;await assert.rejects(()=>publicSource(options).blockAt(100*30000+558),/ACCOUNTING_BLOCK_BOUNDARY_INVALID/);wrongBoundary=false;
 wrongParent=true;await assert.rejects(()=>publicSource(options).blockAt(100*30000+558),/ACCOUNTING_ANCHOR_REORG/);wrongParent=false;
 assert.equal((await publicSource({apiKey:'fixture',delay:0,fetcher}).blockAt(150*30000+558)).number,hex(150),'Uncached volume source retains its finalized-head search');
 console.log('PASS anchored block lookup: stable cached search across head movement, exact/subsecond/30-second cutoff boundaries, outside-anchor rejection and reorg validation');
}
async function failedNativeChecks(){
 const transaction={hash:hash(3000),blockHash:hash(40),blockNumber:hex(40),from:wallet,to:other,value:'0x100',type:'0x2'};
 const receipt={transactionHash:transaction.hash,blockHash:transaction.blockHash,blockNumber:transaction.blockNumber,status:'0x0',gasUsed:'0x2',effectiveGasPrice:'0x3',l1Fee:'0x4',logs:[]};
 let reads=0;
 const source=(tx=transaction)=>publicSource({apiKey:'fixture',delay:0,fetcher:async(url,options)=>{assert.equal(url,'https://rpc.doma.xyz','Failed transactions never request Explorer traces');assert.equal(JSON.parse(options.body).method,'eth_getTransactionByHash');reads++;return response({result:tx});}});
 const first=source(),result=await first.nativeTransaction(transaction.hash,receipt);assert.equal(result.fee,10n);assert.equal(result.payer,wallet);assert.deepEqual(result.moves,[]);assert.equal(reads,1);
 await first.nativeTransaction(transaction.hash,receipt);assert.equal(reads,1,'Validated failed transaction result is reused within the source');
 await assert.rejects(()=>source().nativeTransaction(transaction.hash,{...receipt,blockHash:hash(41)}),/NATIVE_RECEIPT_MISMATCH/);
 await assert.rejects(()=>source({...transaction,type:'0x7e'}).nativeTransaction(transaction.hash,receipt),/NATIVE_DEPOSIT_FLOW_REVIEW_REQUIRED/);
 await assert.rejects(()=>source().nativeTransaction(transaction.hash,{...receipt,l1Fee:undefined}),/NATIVE_AMOUNT_UNAVAILABLE/);
 console.log('PASS failed native transaction: zero Explorer reads, exact execution/L1 fees, no reverted value movements and unchanged identity/type/fee guards');
}
async function concurrentRequestChecks(){
 const starts=[];let active=0,peak=0;
 const source=publicSource({apiKey:'fixture',delay:40,fetcher:async()=>{starts.push(Date.now());active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,160));active--;return response({result:'0x1'});}});
 assert.deepEqual(await Promise.all([wallet,other,secondToken].map(w=>source.nativeBalance(w,hex(40)))),[1n,1n,1n]);
 assert.equal(peak,3);assert.equal(active,0);assert.equal(starts.length,3);
 assert.ok(starts[1]-starts[0]>=30&&starts[2]-starts[1]>=30,'Concurrent requests reserve separate launch slots instead of bursting together');
 let cancelled=0,live=0,launched=0;
 const interrupted=publicSource({apiKey:'fixture',delay:1000,fetcher:async(_url,options)=>{launched++;live++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{live--;cancelled++;reject(new DOMException('aborted','AbortError'));},{once:true}));}});
 await assert.rejects(()=>interrupted.withDeadline(Date.now()+200,async()=>{
  const result=await Promise.allSettled([wallet,other,secondToken].map(w=>interrupted.nativeBalance(w,hex(40))));
  assert.ok(result.every(r=>r.status==='rejected'&&r.reason.message==='ACCOUNTING_TIME_BUDGET_EXCEEDED'));
 }),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);
 assert.equal(launched,1);assert.equal(cancelled,1);assert.equal(live,0);
 await new Promise(resolve=>setTimeout(resolve,50));assert.equal(launched,1,'Cancelled reserved slots never launch after the deadline');
 console.log('PASS concurrent source requests: three overlapping reads retain rate spacing; deadline aborts in-flight and queued requests with no orphan work');
}
async function parallelWindowChecks(){
 const tokens=[addr(10),addr(11),addr(12),addr(13)],counts=new Map();let active=0,peak=0,finishedA=0;
 const source=publicSource({apiKey:'fixture',delay:0,fetcher:async url=>{
  const t=new URL(url).searchParams.get('token'),index=tokens.indexOf(t),pass=(counts.get(t)||0)+1;counts.set(t,pass);assert.ok(pass<=2);
  if(pass===2)assert.equal(finishedA,tokens.length,'Every initial scope finishes before any verification scope starts');
  active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,[60,20,40,5][index]));active--;if(pass===1)finishedA++;
  return response(page([transfer(20+index,4,t)]));
 }});
 const rows=await source.transfersForTokens(wallet,[...tokens].reverse(),start,through);
 assert.equal(active,0);assert.equal(peak,3);assert.deepEqual(rows.map(r=>r.token.address_hash),tokens,'Independent completion order cannot reorder scope results');assert.ok([...counts.values()].every(n=>n===2));
 let pending=0,started=0;
 const failed=publicSource({apiKey:'fixture',delay:0,fetcher:async url=>{
  const t=new URL(url).searchParams.get('token');started++;pending++;await new Promise(resolve=>setTimeout(resolve,t===tokens[0]?5:35));pending--;
  if(t===tokens[0])throw Error('FIXTURE_SCOPE_FAILURE');return response(page([transfer(30+tokens.indexOf(t),4,t)]));
 }});
 await assert.rejects(()=>failed.transfersForTokens(wallet,tokens,start,through),/FIXTURE_SCOPE_FAILURE/);assert.equal(pending,0);assert.equal(started,3,'Scope failure drains started reads and prevents additional scopes or pass B');
 let cancelled=0,live=0;
 const interrupted=publicSource({apiKey:'fixture',delay:0,fetcher:async(_url,options)=>{live++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{live--;cancelled++;reject(new DOMException('aborted','AbortError'));},{once:true}));}});
 await assert.rejects(()=>interrupted.withDeadline(Date.now()+150,()=>interrupted.transfersForTokens(wallet,tokens,start,through)),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);assert.equal(live,0);assert.equal(cancelled,3);
 console.log('PASS parallel history scopes: concurrency3, complete A-before-B barrier, deterministic ordering, fresh independent reads and drained failures/deadlines');
}
async function resumableChecks(){
 const a=transfer(5,5),b=transfer(3,3),c=transfer(2,2),old=transfer(1,-1),pages=[page([a],{block_number:5,index:0}),page([b,c],{block_number:2,index:0}),page([old])];
 function fixture(store,{abortAt=-1,correct=false,reorg=false}={}){
  const network=rpcFixture(),calls=[];if(reorg)network.overrides.set(100,hash(999));let active=0,aborted=0;
  const source=publicSource({apiKey:'fixture',delay:0,accountingCache:store,accountingAnchor:anchor,fetcher:async(url,options)=>{
   if(url==='https://rpc.doma.xyz')return network.reply(options);
   const u=new URL(url);assert.equal(u.searchParams.get('token'),token);const n=u.searchParams.get('block_number'),index=n==='5'?1:n==='2'?2:0;calls.push(index);
   if(calls.length===abortAt){active++;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{active--;aborted++;reject(new DOMException('aborted','AbortError'))},{once:true}));}
   const p=copy(pages[index]);if(correct&&index===0)p.items[0].total.value='10000000000000000002';return response(p);
  }});return{source,calls,active:()=>active,aborted:()=>aborted};
 }
 const firstCache=cache(),first=fixture(firstCache,{abortAt:3});await assert.rejects(()=>first.source.withDeadline(Date.now()+400,()=>first.source.transfersForTokens(wallet,[token],start,through)),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);assert.equal(first.active(),0);assert.equal(first.aborted(),1);
 const resumed=fixture(firstCache);assert.deepEqual(await resumed.source.transfersForTokens(wallet,[token],start,through),[a,b,c]);assert.deepEqual(resumed.calls,[1,2,0,1,2],'Resume validates last boundary and continues; second pass always starts fresh');
 const fresh=fixture(firstCache,{correct:true});assert.equal((await fresh.source.transfersForTokens(wallet,[token],start,through))[0].total.value,'10000000000000000002');assert.deepEqual(fresh.calls,[0,1,2,0,1,2],'Completed scans cannot hide later source corrections');
 const secondCache=cache(),interrupted=fixture(secondCache,{abortAt:5});await assert.rejects(()=>interrupted.source.withDeadline(Date.now()+400,()=>interrupted.source.transfersForTokens(wallet,[token],start,through)),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);assert.equal(interrupted.active(),0);assert.equal(interrupted.aborted(),1);
 const continuing=fixture(secondCache);assert.deepEqual(await continuing.source.transfersForTokens(wallet,[token],start,through),[a,b,c]);assert.deepEqual(continuing.calls,[2,0,1,2],'Cancelled second pass resumes without treating pass A as pass B');
 const changedCache=cache(),beforeCorrection=fixture(changedCache,{abortAt:3});await assert.rejects(()=>beforeCorrection.source.withDeadline(Date.now()+400,()=>beforeCorrection.source.transfersForTokens(wallet,[token],start,through)),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);await assert.rejects(()=>fixture(changedCache,{correct:true}).source.transfersForTokens(wallet,[token],start,through),/TRANSFER_INDEX_CHANGED/);
 const recovered=fixture(changedCache,{correct:true});assert.equal((await recovered.source.transfersForTokens(wallet,[token],start,through))[0].total.value,'10000000000000000002');assert.deepEqual(recovered.calls,[0,1,2,0,1,2]);
 const deepCache=cache(),bothPrefixes=fixture(deepCache,{abortAt:6});await assert.rejects(()=>bothPrefixes.source.withDeadline(Date.now()+400,()=>bothPrefixes.source.transfersForTokens(wallet,[token],start,through)),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);
 const deepCorrection=fixture(deepCache,{correct:true});await assert.rejects(()=>deepCorrection.source.transfersForTokens(wallet,[token],start,through),/TRANSFER_INDEX_CHANGED/);assert.deepEqual(deepCorrection.calls,[2,0,1,2],'Completed A and interrupted B cannot reuse the same stale prefix');
 const reorgCache=cache(),beforeReorg=fixture(reorgCache,{abortAt:3});await assert.rejects(()=>beforeReorg.source.withDeadline(Date.now()+400,()=>beforeReorg.source.transfersForTokens(wallet,[token],start,through)),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);const reorg=fixture(reorgCache,{reorg:true});await assert.rejects(()=>reorg.source.transfersForTokens(wallet,[token],start,through),/ACCOUNTING_ANCHOR_REORG/);assert.equal(reorg.calls.length,0);
 console.log('PASS durable pagination: real cancellation in either scan, restart cursor/order verification, fully fresh second pass including interrupted prefixes, corrections discard checkpoints, reorg rejects reuse and no partial coverage returned');
}
async function main(){try{await filteredChecks();await nativeChecks();await immutableChecks();await transactionProofChecks();await blockLookupChecks();await failedNativeChecks();await concurrentRequestChecks();await parallelWindowChecks();await resumableChecks();console.log('Offline source checks complete.')}finally{const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(tempBase));assert.ok(path.basename(resolved).startsWith('mk-accounting-source-check-'));fs.rmSync(resolved,{recursive:true,force:true});}}
main().catch(error=>{console.error(error);process.exitCode=1});
