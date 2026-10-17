'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {openTradeSourceCache}=require('./lib/trade-source-cache.cjs'),{publicSource}=require('./lib/public-trade-source.cjs'),{rpcErc20History,TRANSFER}=require('./lib/public-erc20-log-history.cjs');
const hex=n=>'0x'+BigInt(n).toString(16),hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),address=n=>'0x'+BigInt(n).toString(16).padStart(40,'0'),copy=x=>JSON.parse(JSON.stringify(x));
const wallet=address(1),other=address(2),token=address(3),base=Date.parse('2026-10-07T00:00:00Z');
const block=(n,reorg=false)=>({number:hex(n),hash:hash(n+(reorg?2000:1000)),parentHash:hash(n+(reorg?1999:999)),timestamp:hex(base/1000+n)});
const response=result=>new Response(JSON.stringify({jsonrpc:'2.0',result}));
async function main(){
 const root=process.platform==='win32'?'D:/Temp':os.tmpdir();fs.mkdirSync(root,{recursive:true});const directory=fs.mkdtempSync(path.join(root,'mk-trade-source-cache-check-'));
 try{
  const cache=openTradeSourceCache({directory,maxBytes:4*1024*1024,maxEntries:2000});let calls=0,reorg=false,tip=100;
  const fetcher=async(url,options)=>{
   assert.equal(new URL(url).hostname,'rpc.doma.xyz');calls++;await new Promise(r=>setTimeout(r,2));const q=JSON.parse(options.body);
   if(q.method==='eth_chainId')return response(hex(97477));
   if(q.method==='eth_getBlockByNumber')return response(block(q.params[0]==='finalized'?tip:Number(BigInt(q.params[0])),reorg));
   if(['eth_getTransactionReceipt','eth_getTransactionByHash'].includes(q.method)){
    const at=BigInt(q.params[0])-100n; // test transaction hashes encode block + 100
    const b=block(Number(at),reorg);return response({hash:q.params[0],transactionHash:q.params[0],blockNumber:b.number,blockHash:b.hash,status:'0x1',logs:[]});
   }
   if(q.method==='eth_getCode')return response('0x6000');
   if(q.method==='eth_getBalance')return response('0x1234');
   throw Error('UNEXPECTED_RPC_'+q.method);
  };
  // Use several public RPC kinds across a restart, with a later finalized tip.
  const make=()=>publicSource({apiKey:'test-only',tradeCache:openTradeSourceCache({directory,maxBytes:4*1024*1024,maxEntries:2000}),delay:0,fetcher});
  const sample=async source=>{const values=[];for(let n=5;n<25;n++){values.push(await source.receipt(hash(n+100)));values.push(await source.transaction(hash(n+100)));values.push(await source.block(hex(n)));values.push(await source.hasCode(wallet,hex(n)));values.push(String(await source.nativeBalance(wallet,hex(n))));}return values;};
  const first=make(),started=Date.now(),cold=await sample(first),coldMs=Date.now()-started,coldCalls=calls;tip=101;calls=0;
  const second=make(),warmStarted=Date.now(),warm=await sample(second),warmMs=Date.now()-warmStarted,warmCalls=calls;
  assert.deepEqual(warm,cold);assert.ok(warmCalls<=4);assert.ok(coldCalls>=100);assert.ok(warmMs<coldMs);assert.equal(second.metrics().factMisses,0);assert.ok(second.metrics().factHits>=100);
  // Aliases are always live, and old evidence is rejected on a canonical reorg.
  const beforeAlias=calls;await second.hasCode(wallet,'latest');await second.hasCode(wallet,'latest');assert.equal(calls-beforeAlias,2);
  assert.equal(await second.verifyFinalizedEvidence(),true);
  reorg=true;await assert.rejects(()=>second.verifyFinalizedEvidence(),/TRADE_CACHE_ANCHOR_REORG/,'reorg after the last cached read blocks publication');
  reorg=false;await sample(make());reorg=true;await assert.rejects(()=>make().receipt(hash(105)),/TRADE_CACHE_ANCHOR_REORG/);
  assert.equal((await make().receipt(hash(105))).blockHash,block(5,true).hash,'invalidated namespace permits recovery');
  reorg=false;
  const accountingOnly=publicSource({apiKey:'test-only',delay:0,fetcher,accountingCache:{namespace:()=>({get:()=>undefined,set:()=>true})},accountingAnchor:{number:hex(50),hash:block(50).hash}});
  await accountingOnly.block(hex(5));assert.equal(await accountingOnly.verifyFinalizedEvidence(),true);
  reorg=true;await assert.rejects(()=>accountingOnly.verifyFinalizedEvidence(),/ACCOUNTING_ANCHOR_REORG/,'warm accounting-only evidence also gets a fresh final anchor check');

  // Moving cutoffs retain completed exact block ranges. Raw index queries are
  // never cached; each new range is independently queried whole and split.
  const log=n=>({address:token,blockHash:block(n).hash,blockNumber:hex(n),transactionHash:hash(n+100),transactionIndex:'0x0',logIndex:'0x0',removed:false,topics:[TRANSFER,hash(BigInt(other)),hash(BigInt(wallet))],data:hash(n)});
  const logs=[5,7,12,16].map(log);let logReads=0,rangeReorg=false,omit=false;
  const rpc=async(method,params)=>{
   if(method==='eth_chainId')return hex(97477);
   if(method==='eth_getBlockByNumber'){const n=params[0]==='finalized'?20:Number(BigInt(params[0]));return block(n,rangeReorg&&n===7);}
   if(method==='eth_getLogs'){logReads++;const f=params[0];return copy(logs.filter(l=>BigInt(l.blockNumber)>=BigInt(f.fromBlock)&&BigInt(l.blockNumber)<=BigInt(f.toBlock)&&f.topics.every((t,i)=>t===null||t===l.topics[i])).filter(l=>!omit||l.blockNumber!=='0x10'));}
   throw Error('UNEXPECTED_RANGE_RPC');
  };
  const receipt=async tx=>{const l=logs.find(l=>l.transactionHash===tx);return {transactionHash:tx,blockHash:l.blockHash,blockNumber:l.blockNumber,transactionIndex:'0x0',status:'0x1',logs:[copy(l)]};};
  const history=()=>rpcErc20History({rpc,receipt,blockAt:async t=>block(Math.floor((t-base)/1000)),rangeCacheFor:scope=>cache.ranges(scope),maxBlockRange:4});
  const a=await history()(wallet,base+5000,base+12000),firstQueries=logReads;assert.equal(a.length,3);
  logReads=0;const b=await history()(wallet,base+5000,base+16000),incrementalQueries=logReads;assert.equal(b.length,4);assert.ok(incrementalQueries<firstQueries);
  logReads=0;assert.deepEqual(await history()(wallet,base+5000,base+16000),b);assert.equal(logReads,0,'same finalized window requires no repeated log queries');
  rangeReorg=true;await assert.rejects(()=>history()(wallet,base+5000,base+16000),/ANCHOR_CHANGED/);rangeReorg=false;
  // A failed receipt never turns a partially scanned range into cached proof.
  let failedReads=0;const badScope={wallet:address(9),tokens:null},badCache=cache.ranges(badScope);
  const badHistory=rpcErc20History({rpc:async(m,p)=>{if(m==='eth_getLogs')failedReads++;return rpc(m,p);},receipt:async()=>{throw Error('RECEIPT_UNAVAILABLE');},blockAt:async t=>block(Math.floor((t-base)/1000)),rangeCacheFor:()=>badCache,maxBlockRange:4});
  await assert.rejects(()=>badHistory(wallet,base+5000,base+12000),/RECEIPT_UNAVAILABLE/);assert.equal(badCache.get({fromBlock:'0x5',toBlock:'0x7'}),undefined);assert.ok(failedReads>0);
  // Storage remains bounded and refuses secret-bearing records.
  assert.ok(cache.stats().bytes<=4*1024*1024);assert.throws(()=>cache.facts.set({method:'test',params:[]},{secret:'not allowed'}),/PRIVATE_FIELD/);
  console.log('PASS trade source cache: finalized facts survive restart, aliases stay live, reorgs invalidate and recover, moving-cutoff ranges reuse only completed receipt-proven history, failed scans do not persist ranges, bounded private-safe storage.');
  console.log(JSON.stringify({benchmark:{cold:{requests:coldCalls,elapsedMs:coldMs},warm:{requests:warmCalls,elapsedMs:warmMs},requestReductionPercent:Math.round((1-warmCalls/coldCalls)*100)},rangeQueries:{cold:firstQueries,incremental:incrementalQueries,warm:0}}));
 }finally{const target=path.resolve(directory);if(path.dirname(target)!==path.resolve(root)||!path.basename(target).startsWith('mk-trade-source-cache-check-'))throw Error('TEST_CACHE_PATH_UNSAFE');fs.rmSync(target,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
