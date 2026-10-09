'use strict';
const assert=require('node:assert/strict');const {rpcErc20History,TRANSFER}=require('./lib/public-erc20-log-history.cjs');
const hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),address=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),hex=n=>'0x'+BigInt(n).toString(16),clone=x=>JSON.parse(JSON.stringify(x));
const wallet=address(1),other=address(2),tokenA=address(3),tokenB=address(4),base=Date.parse('2026-10-07T00:00:00.000Z'),from=base+5000,through=base+12000;
const chainBlock=n=>({number:hex(n),hash:hash(n+1000),parentHash:hash(n+999),timestamp:hex(BigInt(base/1000)+BigInt(n))});
const transfer=(n,token,sender,recipient,value=1n,index=0)=>({address:token,blockHash:hash(n+1000),blockNumber:hex(n),transactionHash:hash(n+100),transactionIndex:'0x0',logIndex:hex(index),removed:false,topics:[TRANSFER,hash(BigInt(sender)),hash(BigInt(recipient))],data:hash(value)});
function fixture(options={}){
 const logs=options.logs||[transfer(4,tokenA,other,wallet),transfer(5,tokenA,other,wallet,10000000000000000001n),transfer(7,tokenA,wallet,wallet,0n),{...transfer(8,tokenB,other,wallet),topics:[TRANSFER,hash(BigInt(other)),hash(BigInt(wallet)),hash(9)],data:'0x'},transfer(12,tokenB,wallet,other,42n),transfer(13,tokenA,other,wallet)];
 const calls=[],store=new Map();let reads=0;
 const rpc=async(method,params)=>{calls.push({method,params:clone(params)});let value;
  if(method==='eth_chainId')value=hex(97477);
  else if(method==='eth_getBlockByNumber')value=chainBlock(params[0]==='finalized'?20:Number(BigInt(params[0])));
  else if(method==='eth_getLogs'){reads++;const p=params[0];value=logs.filter(l=>BigInt(l.blockNumber)>=BigInt(p.fromBlock)&&BigInt(l.blockNumber)<=BigInt(p.toBlock)&&(!p.address||p.address.includes(l.address))&&p.topics.every((t,i)=>t===null||t===l.topics[i]));}
  else throw Error('UNEXPECTED_RPC');
  value=clone(value);return options.rpc?options.rpc({method,params,value,reads,calls}):value;
 };
 const receipt=async tx=>{const group=logs.filter(l=>l.transactionHash===tx);assert.ok(group.length);const l=group[0],value={transactionHash:tx,blockHash:l.blockHash,blockNumber:l.blockNumber,transactionIndex:l.transactionIndex,status:'0x1',logs:clone(group)};return options.receipt?options.receipt(value):value;};
 const cacheFor=options.cache?()=>({get:k=>store.get(JSON.stringify(k)),set:(k,v)=>{store.set(JSON.stringify(k),clone(v));return true;}}):null;
 const transfers=rpcErc20History({rpc,receipt,blockAt:async time=>chainBlock(Math.max(0,Math.min(20,Math.floor((time-base)/1000)))),decimals:options.decimals||(async()=>18),checkBudget:options.checkBudget||(()=>{}),cacheFor,maxBlockRange:options.maxBlockRange||4,maxRanges:options.maxRanges||20,maxLogs:options.maxLogs||50,maxResponseLogs:options.maxResponseLogs||20});
 return {transfers,rpc,receipt,calls,store,get reads(){return reads;}};
}
async function rejects(options,code){const f=fixture(options);await assert.rejects(()=>f.transfers(wallet,from,through),new RegExp(code));}
async function main(){
 const f=fixture(),rows=await f.transfers(wallet,from,through);assert.equal(rows.length,3);assert.deepEqual(rows.map(r=>r.block_number),['12','7','5']);assert.equal(rows[2].total.value,'10000000000000000001');assert.equal(rows[1].total.value,'0');assert.equal(rows[1].from.hash,rows[1].to.hash,'self transfer appears once');assert.equal(rows[0].total.decimals,null);assert.ok(f.calls.filter(c=>c.method==='eth_getLogs').every(c=>BigInt(c.params[0].toBlock)-BigInt(c.params[0].fromBlock)<4n));
 assert.equal((await fixture().transfers(wallet,from+1,through-1)).length,1,'timestamp boundaries remain exact');
 assert.equal((await fixture().transfers(wallet,from,through,[tokenA,tokenA])).length,2,'token scope and duplicate requested tokens');
 const empty=fixture();assert.deepEqual(await empty.transfers(wallet,through+1,through),[]);assert.equal(empty.calls.length,0);assert.deepEqual(await empty.transfers(wallet,from,through,[]),[]);assert.equal(empty.calls.length,0);
 const zero=fixture({logs:[]});assert.deepEqual(await zero.transfers(wallet,from,through),[]);assert.ok(zero.calls.filter(c=>c.method==='eth_getBlockByNumber'&&c.params[0]===hex(12)).length>=2,'even empty results recheck upper anchor');
 assert.equal((await fixture({decimals:async()=>{throw Error('METADATA_MUST_NOT_BE_QUERIED');}}).transfers(wallet,from,through))[0].total.decimals,null,'optional metadata never changes raw units or blocks discovery');
 await rejects({rpc:({method,value,reads})=>method==='eth_getLogs'&&reads===2?[]:value},'LOG_SET_CHANGED');
 await rejects({rpc:({method,value})=>method==='eth_getLogs'&&value.length?[...value,value[0]]:value},'DUPLICATE_LOG');
 await rejects({rpc:({method,value})=>method==='eth_getLogs'?null:value},'INVALID_RESPONSE');
 await rejects({rpc:({method,value})=>{if(method==='eth_getLogs'&&value.length)value[0].removed=true;return value;}},'INVALID_LOG');
 await rejects({rpc:({method,value})=>{if(method==='eth_getLogs'&&value.some(l=>l.topics.length===3))value.find(l=>l.topics.length===3).data='0x1';return value;}},'INVALID_LOG');
 await rejects({rpc:({method,value})=>{if(method==='eth_getLogs'&&value.length)value[0].blockNumber='0xffff';return value;}},'FILTER_MISMATCH');
 await rejects({rpc:({method,value})=>{if(method==='eth_getLogs'&&value.length)value[0].topics[1]=hash(555);return value;}},'FILTER_MISMATCH|LOG_SET_CHANGED');
 await rejects({receipt:r=>({...r,status:'0x0'})},'INVALID_RECEIPT');
 await rejects({receipt:r=>{r.logs[0].data=hash(999);return r;}},'RECEIPT_MISMATCH');
 await rejects({receipt:r=>({...r,blockHash:hash(999)})},'RECEIPT_MISMATCH');
 await rejects({receipt:r=>({...r,logs:[]})},'RECEIPT_MISMATCH');
 const twin=[transfer(5,tokenA,other,wallet,2n),transfer(5,tokenA,other,wallet,3n,1)];
 await rejects({logs:twin,rpc:({method,value})=>method==='eth_getLogs'?value.filter(l=>l.logIndex==='0x0'):value},'MISSING_RECEIPT_LOG');
 await rejects({rpc:({method,value,params})=>{if(method==='eth_getBlockByNumber'&&params[0]===hex(7))value.hash=hash(9999);return value;}},'REORG');
 let anchors=0;await rejects({rpc:({method,value,params})=>{if(method==='eth_getBlockByNumber'&&params[0]===hex(12)&&++anchors===2)value.hash=hash(8888);return value;}},'ANCHOR_CHANGED');
 await rejects({rpc:({method,value})=>method==='eth_chainId'?'0x1':value},'WRONG_CHAIN');
 await rejects({rpc:({method,value,params})=>{if(method==='eth_getBlockByNumber'&&params[0]==='finalized')value.timestamp=hex(base/1000+10);return value;}},'UNFINALIZED_WINDOW');
 await rejects({maxRanges:1},'RANGE_LIMIT');await rejects({maxLogs:2},'LOG_LIMIT');await rejects({maxResponseLogs:1},'LOG_LIMIT');

 await rejects({rpc:({method,value})=>{if(method==='eth_getLogs')throw Error('BOUNDED_RPC_FAILURE');return value;}},'BOUNDED_RPC_FAILURE');
 const cached=fixture({cache:true});assert.equal((await cached.transfers(wallet,from,through)).length,3);const readCount=cached.reads;assert.equal((await cached.transfers(wallet,from,through)).length,3);assert.equal(cached.reads,readCount,'only checked anchored ranges resume');
 let budget=0;await rejects({checkBudget:()=>{if(++budget>5)throw Error('ACCOUNTING_TIME_BUDGET_EXCEEDED');}},'ACCOUNTING_TIME_BUDGET_EXCEEDED');
 // Exercise the real publicSource option, including metadata and cancellation.
 const {publicSource}=require('./lib/public-trade-source.cjs');
 function sourceFixture(mode='normal',accountingCache=null){
  const data=fixture();let active=0,aborted=0,metadata=0;
  const source=publicSource({apiKey:'test-only',erc20History:'rpc',delay:0,accountingCache,accountingAnchor:accountingCache?{number:hex(12),hash:hash(1012)}:null,fetcher:async(url,options)=>{
   assert.equal(new URL(url).hostname,'rpc.doma.xyz','RPC mode never silently falls back to Explorer');const q=JSON.parse(options.body);let result;
   if(q.method==='eth_getLogs'&&mode==='rpc-failed')return new Response(JSON.stringify({error:{code:-32000,message:'backend unavailable'}}));
   if(q.method==='eth_getLogs'&&mode==='cancel'){
    active++;return new Promise((_resolve,reject)=>{const abort=()=>{active--;aborted++;reject(new DOMException('aborted','AbortError'));};if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});});
   }
   if(q.method==='eth_call'){metadata++;if(mode==='metadata-missing')return new Response(JSON.stringify({error:{code:-32000,message:'execution reverted'}}));if(mode==='rpc-failed')return new Response(JSON.stringify({error:{code:-32000,message:'backend unavailable'}}));result=hash(18);}
   else if(q.method==='eth_getTransactionReceipt')result=await data.receipt(q.params[0]);else result=await data.rpc(q.method,q.params);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  }});
  return {source,get active(){return active;},get aborted(){return aborted;},get metadata(){return metadata;},get logReads(){return data.reads;}};
 }
 const integrated=sourceFixture();assert.equal((await integrated.source.transfers(wallet,from,through)).length,3);assert.equal(integrated.metadata,0);
 const missingMetadata=sourceFixture('metadata-missing');assert.ok((await missingMetadata.source.transfers(wallet,from,through)).every(r=>r.total.decimals===null));
 await assert.rejects(()=>sourceFixture('rpc-failed').source.transfers(wallet,from,through),/PUBLIC_RPC_UNAVAILABLE/);
 // Explicit hybrid selection: short account history uses RPC; targeted old
 // token history uses its unchanged two-pass Explorer proof. Neither failure
 // is permission to silently switch provider or accept an incomplete result.
 function hybridFixture(failure=null){
  const data=fixture(),routes=[];
  const source=publicSource({apiKey:'test-only',erc20History:'hybrid',delay:0,fetcher:async(url,options)=>{
   const u=new URL(url);routes.push(u.hostname);
   if(u.hostname==='explorer.doma.xyz'){
    assert.equal(u.searchParams.get('token'),tokenA);assert.equal(u.searchParams.get('type'),'ERC-20');
    if(failure==='explorer')return new Response('{}',{status:400});
    return new Response(JSON.stringify({items:[rows[2]],next_page_params:null}));
   }
   assert.equal(u.hostname,'rpc.doma.xyz');const q=JSON.parse(options.body);
   if(failure==='rpc')return new Response(JSON.stringify({error:{code:-32000,message:'backend unavailable'}}));
   const result=q.method==='eth_getTransactionReceipt'?await data.receipt(q.params[0]):await data.rpc(q.method,q.params);
   return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result}));
  }});
  return {source,routes};
 }
 const hybrid=hybridFixture();assert.equal((await hybrid.source.transfers(wallet,from,through)).length,3);assert.ok(hybrid.routes.every(host=>host==='rpc.doma.xyz'));const beforeFiltered=hybrid.routes.length;
 assert.equal((await hybrid.source.transfersForTokens(wallet,[tokenA],from,through)).length,1);assert.deepEqual(hybrid.routes.slice(beforeFiltered),['explorer.doma.xyz','explorer.doma.xyz']);
 const rpcFailure=hybridFixture('rpc');await assert.rejects(()=>rpcFailure.source.transfers(wallet,from,through),/PUBLIC_RPC_UNAVAILABLE/);assert.deepEqual(rpcFailure.routes,['rpc.doma.xyz']);
 const explorerFailure=hybridFixture('explorer');await assert.rejects(()=>explorerFailure.source.transfersForTokens(wallet,[tokenA],from,through),/PUBLIC_HTTP_400/);assert.deepEqual(explorerFailure.routes,['explorer.doma.xyz']);
 // The real disk cache has stricter namespace and checkpoint APIs than mocks.
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{openAccountingCache}=require('./lib/accounting-cache.cjs');
 const cacheRoot=process.platform==='win32'?'D:/Temp':os.tmpdir();fs.mkdirSync(cacheRoot,{recursive:true});
 const cachePath=fs.mkdtempSync(path.join(cacheRoot,'mk-erc20-cache-check-'));
 try{
  const disk=openAccountingCache({directory:cachePath,chainId:97477}),first=sourceFixture('normal',disk);
  assert.equal((await first.source.transfers(wallet,from,through)).length,3);assert.ok(first.logReads>0);assert.ok(disk.stats().entries>0);
  const reopened=openAccountingCache({directory:cachePath,chainId:97477}),second=sourceFixture('normal',reopened);
  assert.equal((await second.source.transfers(wallet,from,through)).length,3);assert.equal(second.logReads,0,'restarted source reuses validated anchored checkpoints through real cache API');
 }finally{
  const target=path.resolve(cachePath);if(path.dirname(target)!==path.resolve(cacheRoot)||!path.basename(target).startsWith('mk-erc20-cache-check-'))throw Error('TEST_CACHE_PATH_UNSAFE');
  fs.rmSync(target,{recursive:true,force:true});
 }
 const cancelled=sourceFixture('cancel');await assert.rejects(()=>cancelled.source.withDeadline(Date.now()+100,()=>cancelled.source.transfers(wallet,from,through)),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);assert.equal(cancelled.active,0);assert.ok(cancelled.aborted>=1);
 console.log('PASS RPC ERC20 history: bounded full/split queries, exact integer units, ERC721 exclusion, self-transfer deduplication, receipts, timestamps, finalized anchors, corrections, omissions, limits, cancellation and anchored cache reuse.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
