'use strict';
// Complete ERC20 history from finalized JSON-RPC logs. No index pagination,
// symbol-based token assumptions, partial results, or Explorer fallback.
const {isDeepStrictEqual}=require('node:util');
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const fail=code=>{throw Error('ERC20_RPC_'+code);};
const hex=(x,n)=>{if(typeof x!=='string'||!new RegExp('^0x[0-9a-fA-F]{'+n+'}$').test(x))fail('INVALID_LOG');return x.toLowerCase();};
const quantity=x=>{if(typeof x!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(x))fail('INVALID_QUANTITY');return BigInt(x);};
const at=n=>'0x'+n.toString(16),id=l=>l.transactionHash+':'+l.logIndex;
const order=(a,b)=>{for(const k of ['blockNumber','transactionIndex','logIndex']){const x=BigInt(a[k]),y=BigInt(b[k]);if(x!==y)return x<y?-1:1;}return 0;};
function rpcErc20History({rpc,blockAt,receipt,checkBudget=()=>{},cacheFor=null,rangeCacheFor=null,cachedBlock=null,onRangeCache=()=>{},maxBlockRange=100000,maxRanges=1000,maxLogs=50000,maxResponseLogs=10000,maxLogQueries=maxRanges*8,purpose='accounting'}){
 if(!['accounting','trade-candidates'].includes(purpose))fail('INVALID_PURPOSE');
 const candidatesOnly=purpose==='trade-candidates';
 for(const x of [maxBlockRange,maxRanges,maxLogs,maxResponseLogs,maxLogQueries])if(!Number.isSafeInteger(x)||x<1)fail('INVALID_LIMIT');
 function block(value){
  if(!value||typeof value!=='object')fail('INVALID_BLOCK');const number=quantity(value.number),stamp=quantity(value.timestamp)*1000n;
  if(stamp>BigInt(Number.MAX_SAFE_INTEGER)||!Number.isFinite(new Date(Number(stamp)).getTime()))fail('INVALID_BLOCK');
  return {number,hash:hex(value.hash,64),timestamp:Number(stamp),parentHash:value.parentHash==null?null:hex(value.parentHash,64)};
 }
 async function canonical(number){checkBudget();const b=block(await rpc('eth_getBlockByNumber',[at(number),false]));if(b.number!==number)fail('INVALID_BLOCK');return b;}
 function normalize(raw,lo,hi,wallet,direction,tokens){
  if(!raw||raw.removed!==false||!Array.isArray(raw.topics)||raw.topics[0]?.toLowerCase()!==TRANSFER)fail('INVALID_LOG');
  const topics=raw.topics.map(t=>hex(t,64));if(topics.length!==3&&topics.length!==4)fail('INVALID_LOG');
  if(!/^0x0{24}[0-9a-f]{40}$/.test(topics[1])||!/^0x0{24}[0-9a-f]{40}$/.test(topics[2]))fail('INVALID_LOG');
  const from='0x'+topics[1].slice(-40),to='0x'+topics[2].slice(-40),address=hex(raw.address,40),number=quantity(raw.blockNumber);
  if(number<lo||number>hi||(direction==='out'?from:to)!==wallet)fail('FILTER_MISMATCH');
  if(tokens&&!tokens.includes(address))fail('TOKEN_FILTER_MISMATCH');
  if(topics.length===4)return null; // ERC721 Transfer, not an ERC20 balance movement.
  return {address,blockHash:hex(raw.blockHash,64),blockNumber:number.toString(),transactionHash:hex(raw.transactionHash,64),transactionIndex:quantity(raw.transactionIndex).toString(),logIndex:quantity(raw.logIndex).toString(),topics,data:hex(raw.data,64),from,to};
 }
 async function range(wallet,lo,hi,tokens,budget){
  checkBudget();if(budget.queries+2>maxLogQueries)fail('QUERY_LIMIT');budget.queries+=2;
  const topic='0x'+wallet.slice(2).padStart(64,'0'),filter={fromBlock:at(lo),toBlock:at(hi),...(tokens?{address:tokens}:{}),topics:null};
  const responses=await Promise.allSettled([[TRANSFER,topic],[TRANSFER,null,topic]].map(topics=>rpc('eth_getLogs',[{...filter,topics}])));
  // Both directions have drained before any adaptive work. An unrelated
  // provider/cancellation error must never be hidden by a sibling limit error.
  checkBudget();const rejected=responses.find(r=>r.status==='rejected'&&r.reason?.message!=='PUBLIC_RPC_LOG_LIMIT');if(rejected)throw rejected.reason;
  if(responses.some(r=>r.status==='fulfilled'&&!Array.isArray(r.value)))fail('INVALID_RESPONSE');
  const seen=new Map();for(let d=0;d<responses.length;d++){
   checkBudget();if(responses[d].status==='rejected')continue;const logs=responses[d].value;if(!Array.isArray(logs))fail('INVALID_RESPONSE');if(logs.length>maxLogs)fail('LOG_LIMIT');
   const own=new Set();for(const raw of logs){checkBudget();const row=normalize(raw,lo,hi,wallet,d===0?'out':'in',tokens);if(!row)continue;const key=id(row);if(own.has(key))fail('DUPLICATE_LOG');own.add(key);
    if(seen.has(key)){if(row.from!==wallet||row.to!==wallet||!isDeepStrictEqual(seen.get(key),row))fail('DUPLICATE_LOG');}else seen.set(key,row);
   }
  }
  const limited=responses.some(r=>r.status==='rejected'||r.value.length>=maxResponseLogs);
  if(limited){
   if(lo===hi)fail('LOG_LIMIT');const mid=(lo+hi)/2n;
   // Re-query both directions in exact disjoint halves. No parent response is
   // accepted, and the independent verification pass invokes this afresh.
   const left=await range(wallet,lo,mid,tokens,budget);checkBudget();
   const right=await range(wallet,mid+1n,hi,tokens,budget),joined=[...left,...right];if(joined.length>maxLogs)fail('LOG_LIMIT');return joined.sort(order);
  }
  return [...seen.values()].sort(order);
 }
 return async function transfers(wallet,from,through,requestedTokens=null){
  if(typeof wallet!=='string'||!/^0x[0-9a-f]{40}$/.test(wallet))fail('INVALID_WALLET');
  if(!Number.isFinite(from)||!Number.isFinite(through)||from<0)fail('INVALID_WINDOW');if(from>through)return [];
  if(requestedTokens!==null&&(!Array.isArray(requestedTokens)||requestedTokens.length>1000||requestedTokens.some(t=>typeof t!=='string'||!/^0x[0-9a-f]{40}$/.test(t))))fail('INVALID_TOKENS');
  const tokens=requestedTokens===null?null:[...new Set(requestedTokens)].sort();if(tokens?.length===0)return [];
  checkBudget();if(quantity(await rpc('eth_chainId',[]))!==97477n)fail('WRONG_CHAIN');
  const finalized=block(await rpc('eth_getBlockByNumber',['finalized',false]));if(through>finalized.timestamp)fail('UNFINALIZED_WINDOW');
  const [a,b]=await Promise.all([blockAt(from),blockAt(through)]),lo=quantity(a.number),hi=quantity(b.number);
  if(lo>hi||hi>finalized.number)fail('INVALID_WINDOW');
  const [lower,upper]=await Promise.all([canonical(lo),canonical(hi)]);
  if((lo!==0n&&lower.timestamp>from)||upper.timestamp>through||upper.hash!==hex(b.hash,64)||lower.hash!==hex(a.hash,64))fail('ANCHOR_CHANGED');
  if(hi<finalized.number){const next=await canonical(hi+1n);if(next.timestamp<=through||next.parentHash!==upper.hash)fail('INVALID_BOUNDARY');}
  const count=rangeCacheFor?hi/BigInt(maxBlockRange)-lo/BigInt(maxBlockRange)+1n:(hi-lo)/BigInt(maxBlockRange)+1n;if(count>BigInt(maxRanges))fail('RANGE_LIMIT');
  if(candidatesOnly&&tokens!==null)fail('CANDIDATE_TOKEN_FILTER_FORBIDDEN');
  const queryBudget={queries:0};
  const cache=candidatesOnly?null:cacheFor?.({wallet,from,through,tokens,anchor:{number:at(hi),hash:upper.hash}}),rangeCache=rangeCacheFor?.({wallet,tokens,...(candidatesOnly?{purpose:'trade-candidates'}:{})}),pendingRanges=[],all=[],identities=new Set();
  for(let left=lo;left<=hi;){
   checkBudget();const end=rangeCache?((left/BigInt(maxBlockRange)+1n)*BigInt(maxBlockRange)-1n):left+BigInt(maxBlockRange)-1n,right=end>hi?hi:end,key={fromBlock:at(left),toBlock:at(right)};
   let logs=cache?.get(key);
   if(logs===undefined&&rangeCache){
    const saved=rangeCache.get(key);
    if(saved){
     if(!saved.anchor||saved.anchor.number!==at(right)||!Array.isArray(saved.logs)){rangeCache.clear();fail('CACHE_INVALID');}
     // The query is a bounded exact block interval. Its endpoint hash is read
     // afresh even when empty; old ranges survive a moving campaign cutoff,
     // while a reorg invalidates them before any rows can be used.
     const endpoint=await canonical(right);
     if(endpoint.hash!==saved.anchor.hash){rangeCache.clear();fail('ANCHOR_CHANGED');}
     logs=saved.logs;onRangeCache(true);
    }else onRangeCache(false);
   }
   if(logs!==undefined){
    if(!Array.isArray(logs)||logs.length>maxLogs)fail('CACHE_INVALID');
    // Cached rows were verified with the same finalized upper hash. Receipts
    // and canonical blocks are still checked below before any result returns.
    for(const l of logs)if(!l||!/^\d+$/.test(l.blockNumber)||BigInt(l.blockNumber)<left||BigInt(l.blockNumber)>right||!Array.isArray(l.topics))fail('CACHE_INVALID');
   }else{
    const endpoint=rangeCache?await canonical(right):null;
    const first=await range(wallet,left,right,tokens,queryBudget),mid=(left+right)/2n;
    const second=left===right?await range(wallet,left,right,tokens,queryBudget):[...await range(wallet,left,mid,tokens,queryBudget),...await range(wallet,mid+1n,right,tokens,queryBudget)].sort(order);
    if(!isDeepStrictEqual(first,second))fail('LOG_SET_CHANGED');logs=first;
    cache?.set(key,logs);
    // A discovery range is saved only after every row/receipt/canonical block
    // in the complete wallet result passes below, never after a partial scan.
    if(rangeCache){if((await canonical(right)).hash!==endpoint.hash)fail('ANCHOR_CHANGED');pendingRanges.push({key,value:{anchor:{number:at(right),hash:endpoint.hash},logs}});}
   }
   for(const l of logs){const key=id(l);if(identities.has(key))fail('DUPLICATE_LOG');identities.add(key);all.push(l);if(all.length>maxLogs)fail('LOG_LIMIT');}
   left=right+1n;
  }
  if(candidatesOnly){
   // Discovery only: every emitted transaction must still be receipt-checked
   // by the collector before it can establish a fill or absence of a swap.
   // Keep ALL assets, including a quote-only row when a domain leg is absent.
   // Canonical boundary timestamps establish the window without fetching a
   // separate historical block for every unrelated transfer transaction.
   const candidates=new Map();
   for(const l of all){
    checkBudget();if(BigInt(l.blockNumber)===lo&&lower.timestamp<from)continue;
    const prior=candidates.get(l.transactionHash);
    if(prior&&(prior.blockNumber!==at(BigInt(l.blockNumber))||prior.blockHash!==l.blockHash||prior.transactionIndex!==l.transactionIndex))fail('CANDIDATE_TRANSACTION_MISMATCH');
    const value=prior||{transactionHash:l.transactionHash,blockNumber:at(BigInt(l.blockNumber)),blockHash:l.blockHash,transactionIndex:l.transactionIndex,tokens:new Set()};
    value.tokens.add(l.address);candidates.set(l.transactionHash,value);
   }
   if((await canonical(hi)).hash!==upper.hash)fail('ANCHOR_CHANGED');checkBudget();
   // A separate namespace prevents discovery records from being mistaken for
   // the receipt-proven history consumed by financial reconstruction.
   for(const entry of pendingRanges){checkBudget();rangeCache.set(entry.key,entry.value);}
   return [...candidates.values()].sort((a,b)=>BigInt(a.blockNumber)===BigInt(b.blockNumber)?Number(BigInt(b.transactionIndex)-BigInt(a.transactionIndex)):BigInt(a.blockNumber)<BigInt(b.blockNumber)?1:-1)
    .map(({transactionIndex,...c})=>({...c,tokens:[...c.tokens].sort()}));
  }
  const blocks=new Map([[lo.toString(),lower],[hi.toString(),upper]]),receipts=new Map();
  // Three independent receipt reads at a time; wait for all in-flight reads
  // before propagating failure so cancellation cannot leave orphan work.
  const transactions=[...new Set(all.map(l=>l.transactionHash))];let cursor=0,failure;
  await Promise.allSettled(Array.from({length:Math.min(3,transactions.length)},async()=>{try{while(cursor<transactions.length&&!failure){checkBudget();const tx=transactions[cursor++],r=await receipt(tx);if(!r||r.status!=='0x1'||hex(r.transactionHash,64)!==tx||!Array.isArray(r.logs))fail('INVALID_RECEIPT');receipts.set(tx,r);}}catch(e){failure??=e;}}));if(failure)throw failure;
  // Every matching ERC20 event in a discovered receipt must be present, not
  // merely the first event returned by a potentially truncated log query.
  for(const r of receipts.values())for(const raw of r.logs){
   if(raw.topics?.[0]?.toLowerCase()!==TRANSFER||raw.topics.length!==3)continue;
   const sender='0x'+String(raw.topics[1]).slice(-40).toLowerCase(),recipient='0x'+String(raw.topics[2]).slice(-40).toLowerCase();
   if(sender!==wallet&&recipient!==wallet)continue;if(tokens&&!tokens.includes(String(raw.address).toLowerCase()))continue;
   const row=normalize(raw,lo,hi,wallet,sender===wallet?'out':'in',tokens);if(!identities.has(id(row)))fail('MISSING_RECEIPT_LOG');
  }
  const output=[];for(const l of all){
   checkBudget();const r=receipts.get(l.transactionHash),matches=r.logs.filter(row=>quantity(row.logIndex).toString()===l.logIndex);
   if(matches.length!==1||hex(r.blockHash,64)!==l.blockHash||quantity(r.blockNumber).toString()!==l.blockNumber||quantity(r.transactionIndex).toString()!==l.transactionIndex)fail('RECEIPT_MISMATCH');
   const raw=matches[0],proof=normalize(raw,BigInt(l.blockNumber),BigInt(l.blockNumber),wallet,l.from===wallet?'out':'in',tokens);if(!isDeepStrictEqual(l,proof))fail('RECEIPT_MISMATCH');
   if(!blocks.has(l.blockNumber)){
    const value=cachedBlock?block(await cachedBlock(at(BigInt(l.blockNumber)))):await canonical(BigInt(l.blockNumber));if(value.number!==BigInt(l.blockNumber))fail('INVALID_BLOCK');blocks.set(l.blockNumber,value);
   }const atBlock=blocks.get(l.blockNumber);
   if(atBlock.hash!==l.blockHash)fail('REORG');if(atBlock.timestamp<from||atBlock.timestamp>through)continue;
   // Decimals are optional display metadata. Consumers discover transactions
   // from these rows and price independently verified receipts/swaps; never
   // infer a decimal count or add a token metadata RPC per transfer event.
   output.push({block_hash:l.blockHash,block_number:l.blockNumber,transaction_hash:l.transactionHash,log_index:l.logIndex,timestamp:new Date(atBlock.timestamp).toISOString(),from:{hash:l.from},to:{hash:l.to},token:{address_hash:l.address,type:'ERC-20'},total:{value:BigInt(l.data).toString(),decimals:null}});
  }
  // A reorg during any read invalidates the entire result, including empties.
  if((await canonical(hi)).hash!==upper.hash)fail('ANCHOR_CHANGED');checkBudget();
  for(const entry of pendingRanges){checkBudget();rangeCache.set(entry.key,entry.value);}
  const positions=new Map(all.map(l=>[id(l),l]));output.sort((a,b)=>-order(positions.get(a.transaction_hash+':'+a.log_index),positions.get(b.transaction_hash+':'+b.log_index)));
  return output;
 };
}
module.exports={rpcErc20History,TRANSFER};
