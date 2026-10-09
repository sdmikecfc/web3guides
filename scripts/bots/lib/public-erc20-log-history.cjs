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
function rpcErc20History({rpc,blockAt,receipt,checkBudget=()=>{},cacheFor=null,maxBlockRange=100000,maxRanges=1000,maxLogs=50000,maxResponseLogs=10000}){
 for(const x of [maxBlockRange,maxRanges,maxLogs,maxResponseLogs])if(!Number.isSafeInteger(x)||x<1)fail('INVALID_LIMIT');
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
 async function range(wallet,lo,hi,tokens){
  const topic='0x'+wallet.slice(2).padStart(64,'0'),filter={fromBlock:at(lo),toBlock:at(hi),...(tokens?{address:tokens}:{}),topics:null};
  const responses=await Promise.allSettled([[TRANSFER,topic],[TRANSFER,null,topic]].map(topics=>rpc('eth_getLogs',[{...filter,topics}])));
  const rejected=responses.find(r=>r.status==='rejected');if(rejected)throw rejected.reason;
  const seen=new Map();for(let d=0;d<responses.length;d++){
   checkBudget();const logs=responses[d].value;if(!Array.isArray(logs))fail('INVALID_RESPONSE');if(logs.length>=maxResponseLogs)fail('LOG_LIMIT');
   const own=new Set();for(const raw of logs){const row=normalize(raw,lo,hi,wallet,d===0?'out':'in',tokens);if(!row)continue;const key=id(row);if(own.has(key))fail('DUPLICATE_LOG');own.add(key);
    if(seen.has(key)){if(row.from!==wallet||row.to!==wallet||!isDeepStrictEqual(seen.get(key),row))fail('DUPLICATE_LOG');}else seen.set(key,row);
   }
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
  const count=(hi-lo)/BigInt(maxBlockRange)+1n;if(count>BigInt(maxRanges))fail('RANGE_LIMIT');
  const cache=cacheFor?.({wallet,from,through,tokens,anchor:{number:at(hi),hash:upper.hash}}),all=[],identities=new Set();
  for(let left=lo;left<=hi;left+=BigInt(maxBlockRange)){
   checkBudget();const right=left+BigInt(maxBlockRange)-1n>hi?hi:left+BigInt(maxBlockRange)-1n,key={fromBlock:at(left),toBlock:at(right)};
   let logs=cache?.get(key);
   if(logs!==undefined){
    if(!Array.isArray(logs)||logs.length>maxLogs)fail('CACHE_INVALID');
    // Cached rows were verified with the same finalized upper hash. Receipts
    // and canonical blocks are still checked below before any result returns.
    for(const l of logs)if(!l||!/^\d+$/.test(l.blockNumber)||BigInt(l.blockNumber)<left||BigInt(l.blockNumber)>right||!Array.isArray(l.topics))fail('CACHE_INVALID');
   }else{
    const first=await range(wallet,left,right,tokens),mid=(left+right)/2n;
    const second=left===right?await range(wallet,left,right,tokens):[...await range(wallet,left,mid,tokens),...await range(wallet,mid+1n,right,tokens)].sort(order);
    if(!isDeepStrictEqual(first,second))fail('LOG_SET_CHANGED');logs=first;
    cache?.set(key,logs);
   }
   for(const l of logs){const key=id(l);if(identities.has(key))fail('DUPLICATE_LOG');identities.add(key);all.push(l);if(all.length>maxLogs)fail('LOG_LIMIT');}
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
   if(!blocks.has(l.blockNumber))blocks.set(l.blockNumber,await canonical(BigInt(l.blockNumber)));const atBlock=blocks.get(l.blockNumber);
   if(atBlock.hash!==l.blockHash)fail('REORG');if(atBlock.timestamp<from||atBlock.timestamp>through)continue;
   // Decimals are optional display metadata. Consumers discover transactions
   // from these rows and price independently verified receipts/swaps; never
   // infer a decimal count or add a token metadata RPC per transfer event.
   output.push({block_hash:l.blockHash,block_number:l.blockNumber,transaction_hash:l.transactionHash,log_index:l.logIndex,timestamp:new Date(atBlock.timestamp).toISOString(),from:{hash:l.from},to:{hash:l.to},token:{address_hash:l.address,type:'ERC-20'},total:{value:BigInt(l.data).toString(),decimals:null}});
  }
  // A reorg during any read invalidates the entire result, including empties.
  if((await canonical(hi)).hash!==upper.hash)fail('ANCHOR_CHANGED');checkBudget();
  const positions=new Map(all.map(l=>[id(l),l]));output.sort((a,b)=>-order(positions.get(a.transaction_hash+':'+a.log_index),positions.get(b.transaction_hash+':'+b.log_index)));
  return output;
 };
}
module.exports={rpcErc20History,TRANSFER};
