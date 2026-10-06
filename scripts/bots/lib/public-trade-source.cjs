'use strict';
const {scanPages,hash,CHAIN,USDC,WETH}=require('./public-trade-worker.cjs');
// Preserve integer JSON literals before JSON.parse can round token base units.
function lossless(text){
 let out='',i=0;
 while(i<text.length){const ch=text[i];
  if(ch==='"'){const start=i++;while(i<text.length){if(text[i]==='\\'){i+=2;continue;}if(text[i++]==='"')break;}out+=text.slice(start,i);}
  else if(ch==='-'||/\d/.test(ch)){const match=text.slice(i).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);if(!match)throw Error('PUBLIC_JSON_INVALID');const n=match[0];out+=/^-?\d+$/.test(n)&&!Number.isSafeInteger(Number(n))?JSON.stringify(n):n;i+=n.length;}
  else {out+=ch;i++;}
 }
 return JSON.parse(out);
}
function publicSource({apiKey,fetcher=fetch,delay=300,maxPages=1000}){
 if(!apiKey)throw Error('EXISTING_DOMA_API_KEY_REQUIRED');
 let last=0,seq=0;const receipts=new Map(),blocks=new Map(),calls=new Map(),atBlocks=new Map(),balances=new Map(),transactions=new Map(),implementations=new Map(),native=new Map(),codes=new Map(),nativePurchases=new Map();
 async function request(url,body,headers={}){
  for(let attempt=0;attempt<4;attempt++){
   const wait=Math.max(0,last+delay-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));last=Date.now();
   const r=await fetcher(url,{method:body?'POST':'GET',redirect:'error',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
   if(r.status===429||r.status>=500){await new Promise(r=>setTimeout(r,1000*2**attempt));continue;}
   if(!r.ok)throw Error('PUBLIC_HTTP_'+r.status);return lossless(await r.text());
  }
  throw Error('PUBLIC_RETRIES_EXHAUSTED');
 }
 async function rpc(method,params){const p=await request('https://rpc.doma.xyz',{jsonrpc:'2.0',id:++seq,method,params});if(p.error||!p.result)throw Error('PUBLIC_RPC_UNAVAILABLE');return p.result;}
 async function code(address,at){const k=address.toLowerCase()+':'+at;if(!codes.has(k))codes.set(k,await rpc('eth_getCode',[address,at]));return codes.get(k);}
 const blockValue=b=>({...b,timestamp:new Date(Number(BigInt(b.timestamp))*1000).toISOString()});
 async function block(number){if(!blocks.has(number))blocks.set(number,blockValue(await rpc('eth_getBlockByNumber',[number,false])));return blocks.get(number);}
 async function gql(query,variables){const p=await request('https://api.doma.xyz/graphql',{query,variables},{'Api-Key':apiKey});if(p.errors||!p.data)throw Error('PUBLIC_GRAPHQL_UNAVAILABLE');return p.data;}
 async function read(address,definition,functionName,args,at){
  const {parseAbi,encodeFunctionData,decodeFunctionResult}=require('viem'),abi=parseAbi([definition]);
  const data=encodeFunctionData({abi,functionName,args}),k=address+':'+data+':'+at;
  if(!calls.has(k))calls.set(k,decodeFunctionResult({abi,functionName,data:await rpc('eth_call',[{to:address,data},at])}));return calls.get(k);
 }
 async function blockAt(time){
  if(atBlocks.has(time))return atBlocks.get(time);
  let lo=0n,hi=BigInt((await block('finalized')).number);
  while(lo<hi){const mid=(lo+hi+1n)/2n,b=await block('0x'+mid.toString(16));if(Date.parse(b.timestamp)<=time)lo=mid;else hi=mid-1n;}
  const b=await block('0x'+lo.toString(16));atBlocks.set(time,b);return b;
 }
 const factory='0x2e50b586d5bcd04cb6125e028a6a669f7f3cf1c2';
 async function valueUsd(token,units,at){
  if(token===USDC)return units;
  // Exact integer conversion from an evidenced historical pool observation.
  // Missing/illiquid quotes leave accounting pending; no current-price fallback.
  let best=null;
  for(const fee of [100,500,3000,10000]){
   const pool=await read(factory,'function getPool(address,address,uint24) view returns(address)','getPool',[token,USDC,fee],at);
   if(/^0x0{40}$/i.test(pool))continue;
   const liquidity=await read(pool,'function liquidity() view returns(uint128)','liquidity',[],at);
   if(liquidity>0n&&(!best||liquidity>best.liquidity))best={pool,liquidity};
  }
  if(!best)throw Error('HISTORICAL_LIQUID_USDC_PRICE_UNAVAILABLE');
  const t0=(await read(best.pool,'function token0() view returns(address)','token0',[],at)).toLowerCase();
  const slot=await read(best.pool,'function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)','slot0',[],at),ratio=slot[0]*slot[0];
  if(!ratio)throw Error('HISTORICAL_PRICE_INVALID');
  return t0===token?units*ratio/(1n<<192n):units*(1n<<192n)/ratio;
 }
 async function primeBalances(wallet,tokens,at){
  const {parseAbi,encodeFunctionData,decodeFunctionResult}=require('viem');
  const erc=parseAbi(['function balanceOf(address) view returns(uint256)']);
  const data=encodeFunctionData({abi:erc,functionName:'balanceOf',args:[wallet]});
  const missing=tokens.filter(t=>!balances.has(wallet+':'+t+':'+at));
  for(let i=0;i<missing.length;i+=64){const chunk=missing.slice(i,i+64);
   const result=await read('0xca11bde05977b3631167028862be2a173976ca11','function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns((bool success,bytes returnData)[] returnData)','aggregate3',[chunk.map(target=>({target,allowFailure:true,callData:data}))],at);
   for(let j=0;j<chunk.length;j++){
    let n;if(result[j].success&&result[j].returnData!=='0x')n=decodeFunctionResult({abi:erc,functionName:'balanceOf',data:result[j].returnData});
    else if(await code(chunk[j],at)==='0x')n=0n;else throw Error('HISTORICAL_BALANCE_UNAVAILABLE');
    balances.set(wallet+':'+chunk[j]+':'+at,n);
   }
  }
 }
 const fields='txHash date contractType buyerAddress originAddress userAddress fractionalTokenAmount quoteTokenAmount priceUsd fractionalToken { address chain { networkId } params { decimals } } quoteToken {symbol decimals}';
 async function swaps(wallet,from,through){
  if(!/^0x[0-9a-f]{40}$/.test(wallet))throw Error('INVALID_WALLET');
  const page=async skip=>(await gql(`{ fractionalTokenSwaps(skip:${skip},take:100,address:"eip155:${CHAIN}:${wallet}",sortOrder:DESC) { totalCount items { ${fields} } } }`)).fractionalTokenSwaps;
  const first=await page(0),fingerprint=hash(first);let p=first,previous=Infinity;const rows=[];
  for(let i=0;i<maxPages;i++){
   if(!p||!Array.isArray(p.items)||p.totalCount!==first.totalCount)throw Error('SWAP_INDEX_CHANGED');
   for(const row of p.items){const at=Date.parse(row.date);if(!Number.isFinite(at)||at>previous)throw Error('SWAP_HISTORY_ORDER');previous=at;if(at>=from&&at<=through)rows.push(row);}
   if(previous<from||i*100+p.items.length===p.totalCount){if(hash(await page(0))!==fingerprint)throw Error('SWAP_INDEX_CHANGED');return rows;}
   if(!p.items.length)throw Error('SWAP_HISTORY_INCOMPLETE');p=await page((i+1)*100);
  }
  throw Error('SWAP_HISTORY_PAGE_LIMIT');
 }
 async function transfers(wallet,from,through){
  if(!/^0x[0-9a-f]{40}$/.test(wallet))throw Error('INVALID_WALLET');
  const base='https://explorer.doma.xyz/api/v2/addresses/'+wallet+'/token-transfers';let first;
  // Token prices, holder counts and reputations change between reads. Only
  // immutable transfer identity/amount/order belong in the pagination anchor.
  const anchor=p=>hash({next:p.next_page_params,items:p.items?.map(t=>[t.block_hash,t.block_number,t.transaction_hash,t.log_index,t.timestamp,t.from?.hash,t.to?.hash,t.token?.address_hash,t.total])});
  const fetchPage=async params=>{
   const keys=Object.keys(params);if(keys.some(k=>!['block_number','index','items_count','batch_block_hash','batch_transaction_hash','batch_log_index','index_in_batch','token_contract_address_hash','token_id','type'].includes(k)))throw Error('UNKNOWN_EXPLORER_CURSOR');
   const url=new URL(base);url.searchParams.set('type','ERC-20');for(const [k,v]of Object.entries(params))if(v!==null)url.searchParams.set(k,String(v));
   const p=await request(url.toString());if(!keys.length)first=anchor(p);return p;
  };
  const rows=await scanPages(fetchPage,{from,through,maxPages});const current=await request(base+'?type=ERC-20');
  if(anchor(current)!==first)throw Error('TRANSFER_INDEX_CHANGED');return rows;
 }
 async function hasNativeActivity(wallet,through){
  if(!/^0x[0-9a-f]{40}$/.test(wallet))throw Error('INVALID_WALLET');
  for(const kind of ['transactions','internal-transactions']){
   const rows=await scanPages(async params=>{
    const u=new URL('https://explorer.doma.xyz/api/v2/addresses/'+wallet+'/'+kind);
    for(const [k,v]of Object.entries(params)){if(!/^[a-z_]+$/.test(k))throw Error('UNKNOWN_EXPLORER_CURSOR');if(v!==null)u.searchParams.set(k,String(v));}
    return request(u.toString());
   },{from:0,through,maxPages});
   for(const t of rows){
    if(t.value==null)throw Error('NATIVE_HISTORY_UNAVAILABLE');
    if(BigInt(t.value)!==0n)return true;
    if(kind==='transactions'&&t.from?.hash?.toLowerCase()===wallet){
     const fee=t.fee?.value;if(fee==null)throw Error('NATIVE_FEE_HISTORY_UNAVAILABLE');if(BigInt(fee)!==0n)return true;
    }
   }
  }
  return false;
 }
 async function nativeHistory(wallet,through){
  if(!/^0x[0-9a-f]{40}$/.test(wallet))throw Error('INVALID_WALLET');
  const found=new Map();
  for(const kind of ['transactions','internal-transactions']){
   const base='https://explorer.doma.xyz/api/v2/addresses/'+wallet+'/'+kind;let first;
   const anchor=p=>hash({next:p.next_page_params,items:p.items?.map(t=>[t.hash||t.transaction_hash,t.block_number,t.index,t.timestamp,t.from?.hash,t.to?.hash,t.value,t.status,t.success,t.error])});
   const page=async params=>{const u=new URL(base);for(const[k,v]of Object.entries(params)){if(!/^[a-z_]+$/.test(k))throw Error('UNKNOWN_EXPLORER_CURSOR');if(v!==null)u.searchParams.set(k,String(v));}const p=await request(u.toString());if(!Object.keys(params).length)first=anchor(p);return p;};
   const rows=await scanPages(page,{from:0,through,maxPages});
   if(anchor(await request(base))!==first)throw Error('NATIVE_INDEX_CHANGED');
   for(const t of rows){const tx=(t.hash||t.transaction_hash)?.toLowerCase();if(!/^0x[0-9a-f]{64}$/.test(tx))throw Error('NATIVE_HISTORY_INVALID');found.set(tx,{tx,at:Date.parse(t.timestamp)});}
  }
  return [...found.values()];
 }
 async function nativeTransaction(tx,receipt){
  if(native.has(tx))return native.get(tx);
  if(!transactions.has(tx))transactions.set(tx,await rpc('eth_getTransactionByHash',[tx]));
  const base='https://explorer.doma.xyz/api/v2/transactions/'+tx+'/internal-transactions',rows=[],seen=new Set();let params={},first;
  const anchor=p=>hash({next:p.next_page_params,items:p.items?.map(t=>[t.transaction_hash,t.block_number,t.index,t.from?.hash,t.to?.hash,t.created_contract?.hash,t.type,t.value,t.success,t.error])});
  for(let i=0;i<maxPages;i++){
   const u=new URL(base);for(const[k,v]of Object.entries(params)){if(!/^[a-z_]+$/.test(k))throw Error('UNKNOWN_EXPLORER_CURSOR');if(v!==null)u.searchParams.set(k,String(v));}
   const p=await request(u.toString());if(!Array.isArray(p.items))throw Error('NATIVE_TRACES_UNAVAILABLE');if(!i)first=anchor(p);rows.push(...p.items);
   if(!p.next_page_params){if(anchor(await request(base))!==first)throw Error('NATIVE_TRACE_INDEX_CHANGED');const result=require('./public-native-accounting.cjs').nativeSettlement(transactions.get(tx),receipt,rows);native.set(tx,result);return result;}
   const k=hash(p.next_page_params);if(seen.has(k)||!p.items.length)throw Error('NATIVE_TRACE_CURSOR_REPEATED');seen.add(k);params=p.next_page_params;
  }
  throw Error('NATIVE_TRACE_PAGE_LIMIT');
 }
 async function nativeRouterPurchase(tx,receipt,nativeFlow,wallets){
  const {UNIVERSAL}=require('./public-router-settlement.cjs');
  if(!transactions.has(tx))transactions.set(tx,await rpc('eth_getTransactionByHash',[tx]));
  const transaction=transactions.get(tx),wallet=transaction.from?.toLowerCase();
  if(transaction.to?.toLowerCase()!==UNIVERSAL||BigInt(transaction.value||0)===0n||!wallets.includes(wallet))return null;
  if(!nativePurchases.has(tx)){
   const {keccak256}=require('viem');
   const result=await require('./public-native-router.cjs').verifyNativeRouterPurchase({transaction,receipt,native:nativeFlow,wallet,
    codeHash:keccak256(await code(UNIVERSAL,receipt.blockNumber)),
    poolFor:(a,b,fee)=>read(factory,'function getPool(address,address,uint24) view returns(address)','getPool',[a,b,fee],receipt.blockNumber)});
   nativePurchases.set(tx,result);
  }
  return nativePurchases.get(tx);
 }
 return {
  async routerSettlement(s,receipt){
   const {verifyRouterSettlement,ROUTER,IMPLEMENTATION_SLOT}=require('./public-router-settlement.cjs');
   if(!transactions.has(s.tx))transactions.set(s.tx,await rpc('eth_getTransactionByHash',[s.tx]));
   const transaction=transactions.get(s.tx);
   if(transaction.to?.toLowerCase()===require('./public-router-settlement.cjs').UNIVERSAL&&BigInt(transaction.value||0)>0n){
    const purchase=await nativeRouterPurchase(s.tx,receipt,await nativeTransaction(s.tx,receipt),[s.wallet]);
    if(!purchase||s.side!=='buy'||s.domain!==purchase.token||s.quote!==purchase.domainQuoteToken||s.domainUnits!==purchase.domainPoolUnits||s.quoteUnits!==purchase.domainQuoteUnits)throw Error('NATIVE_ROUTER_INDEX_MISMATCH');
    return {walletDomainUnits:purchase.units,walletQuoteUnits:purchase.nativeSpent,walletQuoteToken:require('./public-native-accounting.cjs').NATIVE,nativeCostWei:purchase.nativeSpent,router:purchase.router,pools:purchase.pools,routerFeeUnits:'0',routerDomainFeeUnits:(BigInt(purchase.domainPoolUnits)-BigInt(purchase.units)).toString()};
   }
   if(!implementations.has(receipt.blockNumber))implementations.set(receipt.blockNumber,'0x'+(await rpc('eth_getStorageAt',[ROUTER,IMPLEMENTATION_SLOT,receipt.blockNumber])).slice(-40));
   return verifyRouterSettlement(s,receipt,{transaction:transactions.get(s.tx),implementation:implementations.get(receipt.blockNumber),poolFor:(a,b,fee,at)=>read(factory,'function getPool(address,address,uint24) view returns(address)','getPool',[a,b,fee],at)});
  },
  async finalized(){if(Number(BigInt(await rpc('eth_chainId',[])))!==CHAIN)throw Error('WRONG_PUBLIC_CHAIN');return block('finalized');},
  async indexStatus(final){
   const p=await request('https://explorer.doma.xyz/api/v2/main-page/indexing-status');
   const head=await request('https://explorer.doma.xyz/api/v2/main-page/blocks');
   // Ratios and block height are necessary, not substitutes for the per-wallet
   // completed pagination and receipt checks performed by the worker.
   return p.finished_indexing===true&&Number(p.indexed_blocks_ratio)===1&&Number(p.indexed_internal_transactions_ratio)===1&&head[0]?.height!=null&&BigInt(head[0].height)>=BigInt(final.number);
  },
  receipt:async tx=>{if(!/^0x[0-9a-f]{64}$/.test(tx))throw Error('INVALID_TRANSACTION_HASH');if(!receipts.has(tx))receipts.set(tx,await rpc('eth_getTransactionReceipt',[tx]));return receipts.get(tx);},
  block,blockAt,swaps,transfers,valueUsd,primeBalances,hasNativeActivity,nativeHistory,nativeTransaction,nativeRouterPurchase,
  nativeBalance:async(wallet,at)=>BigInt(await rpc('eth_getBalance',[wallet,at])),
  balance:async(wallet,token,at)=>{await primeBalances(wallet,[token],at);return balances.get(wallet+':'+token+':'+at);},
  hasCode:async(address,at)=>(await code(address,at))!=='0x',
 };
}
module.exports={publicSource,lossless};
