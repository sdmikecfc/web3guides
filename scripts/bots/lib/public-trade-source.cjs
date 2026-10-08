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
function publicSource({apiKey,fetcher=fetch,delay=300,maxPages=1000,accountingCache=null,accountingAnchor=null,accountingPriorAnchors=[]}){
 if(!apiKey)throw Error('EXISTING_DOMA_API_KEY_REQUIRED');
 const validAnchor=a=>a&&/^0x[0-9a-f]+$/i.test(a.number)&&/^0x[0-9a-f]{64}$/i.test(a.hash);
 if(accountingCache&&(!validAnchor(accountingAnchor)||!Array.isArray(accountingPriorAnchors)||accountingPriorAnchors.length>4||accountingPriorAnchors.some(a=>!validAnchor(a))))throw Error('INVALID_ACCOUNTING_ANCHOR');
 const anchors=accountingCache?[accountingAnchor,...accountingPriorAnchors.filter(a=>BigInt(a.number)<=BigInt(accountingAnchor.number))].map(a=>({number:'0x'+BigInt(a.number).toString(16),hash:a.hash.toLowerCase()})):[];
 const anchorChecks=new Map(),evidence=anchors.map(anchor=>accountingCache.namespace({kind:'finalized-rpc',scope:{anchor}}));
 let deadline=Infinity,budgetController=null;
 const checkBudget=()=>{if(Date.now()>=deadline||budgetController?.signal.aborted)throw Error('ACCOUNTING_TIME_BUDGET_EXCEEDED');};
 const pause=ms=>new Promise((resolve,reject)=>{
  const signal=budgetController?.signal;
  const done=()=>{signal?.removeEventListener('abort',cancel);resolve();};
  const timer=setTimeout(done,ms);
  const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(Error('ACCOUNTING_TIME_BUDGET_EXCEEDED'));};
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
 });
 let last=0,seq=0,requestGate=Promise.resolve();const receipts=new Map(),blocks=new Map(),calls=new Map(),atBlocks=new Map(),balances=new Map(),transactions=new Map(),implementations=new Map(),native=new Map(),codes=new Map(),nativePurchases=new Map();
 async function startRequest(run){
  // Reserve before awaiting, then space actual starts. Responses overlap, but
  // late timers cannot bunch reserved requests into a catch-up burst.
  const prior=requestGate;let release;requestGate=new Promise(resolve=>{release=resolve;});await prior;
  try{checkBudget();const wait=Math.max(0,last+delay-Date.now());if(wait)await pause(wait);checkBudget();last=Date.now();return run();}
  finally{release();}
 }
 async function request(url,body,headers={}){
  for(let attempt=0;attempt<4;attempt++){
   checkBudget();
   const signals=[AbortSignal.timeout(30000)];if(budgetController)signals.push(budgetController.signal);
   let r,text;
   try{r=await startRequest(()=>fetcher(url,{method:body?'POST':'GET',redirect:'error',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.any(signals)}));text=await r.text();}
   catch(error){checkBudget();const timeout=['AbortError','TimeoutError'].includes(error.name),network=error instanceof TypeError&&/fetch|network/i.test(error.message);
    if(!timeout&&!network)throw error;
    if(attempt===3)throw Error(timeout?'PUBLIC_REQUEST_TIMEOUT':'PUBLIC_NETWORK_UNAVAILABLE');
    await pause(1000*2**attempt);continue;
   }
   checkBudget();
   if(r.status===429||r.status>=500){await pause(1000*2**attempt);continue;}
   if(!r.ok)throw Error('PUBLIC_HTTP_'+r.status);return lossless(text);
  }
  throw Error('PUBLIC_RETRIES_EXHAUSTED');
 }
 async function rawRpc(method,params){const p=await request('https://rpc.doma.xyz',{jsonrpc:'2.0',id:++seq,method,params});if(p.error||!p.result)throw Error('PUBLIC_RPC_UNAVAILABLE');return p.result;}
 async function checkAnchor(index=0){
  if(!accountingCache)return;checkBudget();const anchor=anchors[index],key=anchor.number+':'+anchor.hash;
  if(!anchorChecks.has(key)){
   const proof=(async()=>{
    let finalized;
    if(index===0){if(Number(BigInt(await rawRpc('eth_chainId',[])))!==CHAIN)throw Error('WRONG_PUBLIC_CHAIN');finalized=await rawRpc('eth_getBlockByNumber',['finalized',false]);if(BigInt(finalized.number)<BigInt(anchor.number))throw Error('ACCOUNTING_ANCHOR_NOT_FINALIZED');}
    const block=await rawRpc('eth_getBlockByNumber',[anchor.number,false]);
    if(block.number?.toLowerCase()!==anchor.number||block.hash?.toLowerCase()!==anchor.hash)throw Error('ACCOUNTING_ANCHOR_REORG');
    return {block,finalized};
   })();anchorChecks.set(key,proof);proof.catch(()=>anchorChecks.delete(key));
  }
  const verified=await anchorChecks.get(key);checkBudget();return verified;
 }
 function rpcBlock(method,params,value){
  const at=method==='eth_getBlockByNumber'?params[0]:['eth_call','eth_getCode','eth_getBalance'].includes(method)?params[1]:method==='eth_getStorageAt'?params[2]:['eth_getTransactionReceipt','eth_getTransactionByHash'].includes(method)?value?.blockNumber:null;
  return typeof at==='string'&&/^0x[0-9a-f]+$/i.test(at)?BigInt(at):null;
 }
 async function rpc(method,params){
  const eligible=['eth_getBlockByNumber','eth_call','eth_getCode','eth_getBalance','eth_getStorageAt','eth_getTransactionReceipt','eth_getTransactionByHash'].includes(method);
  // Alias reads are deliberately never persisted, including finalized/latest.
  const transaction=['eth_getTransactionReceipt','eth_getTransactionByHash'].includes(method);
  const requestedBlock=rpcBlock(method,params);
  if(!accountingCache||!eligible||(!transaction&&(requestedBlock===null||requestedBlock>BigInt(anchors[0].number))))return rawRpc(method,params);
  await checkAnchor();const identity={method,params};
  for(let i=0;i<evidence.length;i++){
   if(!transaction&&requestedBlock>BigInt(anchors[i].number))continue;
   const value=evidence[i].get(identity);if(value===undefined)continue;const at=rpcBlock(method,params,value);
   if(at===null||at>BigInt(anchors[i].number)||at>BigInt(anchors[0].number))continue;
   await checkAnchor(i);return value;
  }
  const value=await rawRpc(method,params),at=rpcBlock(method,params,value);
  if(at!==null&&at<=BigInt(anchors[0].number)){
   if(transaction){
    const id=method==='eth_getTransactionReceipt'?value.transactionHash:value.hash;
    if(id?.toLowerCase()!==params[0].toLowerCase()||!/^0x[0-9a-f]{64}$/i.test(value.blockHash))throw Error('ACCOUNTING_CACHED_TRANSACTION_INVALID');
    const canonical=await rpc('eth_getBlockByNumber',[value.blockNumber,false]);if(canonical.hash?.toLowerCase()!==value.blockHash.toLowerCase())throw Error('TRANSACTION_REORG');
   }
   evidence[0].set(identity,value);
  }
  return value;
 }
 async function code(address,at){if(!/^0x[0-9a-f]+$/i.test(at))return rpc('eth_getCode',[address,at]);const k=address.toLowerCase()+':'+at;if(!codes.has(k))codes.set(k,await rpc('eth_getCode',[address,at]));return codes.get(k);}
 const blockValue=b=>({...b,timestamp:new Date(Number(BigInt(b.timestamp))*1000).toISOString()});
 async function block(number){if(!/^0x[0-9a-f]+$/i.test(number))return blockValue(await rpc('eth_getBlockByNumber',[number,false]));if(!blocks.has(number))blocks.set(number,blockValue(await rpc('eth_getBlockByNumber',[number,false])));return blocks.get(number);}
 async function gql(query,variables){const p=await request('https://api.doma.xyz/graphql',{query,variables},{'Api-Key':apiKey});if(p.errors||!p.data)throw Error('PUBLIC_GRAPHQL_UNAVAILABLE');return p.data;}
 async function read(address,definition,functionName,args,at){
  const {parseAbi,encodeFunctionData,decodeFunctionResult}=require('viem'),abi=parseAbi([definition]);
  const data=encodeFunctionData({abi,functionName,args}),k=address+':'+data+':'+at;
  if(!/^0x[0-9a-f]+$/i.test(at))return decodeFunctionResult({abi,functionName,data:await rpc('eth_call',[{to:address,data},at])});
  if(!calls.has(k))calls.set(k,decodeFunctionResult({abi,functionName,data:await rpc('eth_call',[{to:address,data},at])}));return calls.get(k);
 }
 async function blockAt(time){
  if(!Number.isFinite(time))throw Error('INVALID_BLOCK_TIME');
  if(atBlocks.has(time))return atBlocks.get(time);
  let upper;
  if(accountingCache){
   const verified=await checkAnchor();upper=blockValue(verified.block);blocks.set(anchors[0].number,upper);
   // A stable finalized upper bound preserves the binary-search path across
   // restarts. A millisecond cutoff may lie just after its whole-second block.
   if(time>Date.parse(upper.timestamp)){
    const next=BigInt(upper.number)+1n;
    if(next>BigInt(verified.finalized.number))throw Error('ACCOUNTING_TIME_OUTSIDE_ANCHOR');
    const boundary=await block('0x'+next.toString(16));
    if(!/^0x[0-9a-f]+$/i.test(boundary.number)||BigInt(boundary.number)!==next||!Number.isFinite(Date.parse(boundary.timestamp)))throw Error('ACCOUNTING_BLOCK_BOUNDARY_INVALID');
    if(boundary.parentHash&&boundary.parentHash.toLowerCase()!==anchors[0].hash)throw Error('ACCOUNTING_ANCHOR_REORG');
    if(time>=Date.parse(boundary.timestamp))throw Error('ACCOUNTING_TIME_OUTSIDE_ANCHOR');
    atBlocks.set(time,upper);return upper;
   }
  }else upper=await block('finalized');
  if(time===Date.parse(upper.timestamp)){atBlocks.set(time,upper);return upper;}
  let lo=0n,hi=BigInt(upper.number);
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
  const missing=/^0x[0-9a-f]+$/i.test(at)?tokens.filter(t=>!balances.has(wallet+':'+t+':'+at)):tokens;
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
 // Checkpoints retain validated page boundaries, not a claim of completeness.
 // Both passes still make independent HTTP reads; only interrupted work resumes.
 async function fixedWindow(scopes,{wallet,from,through,proof,identityOf,changed,kind}){
  if(!/^0x[0-9a-f]{40}$/.test(wallet))throw Error('INVALID_WALLET');
  if(!Number.isFinite(from)||!Number.isFinite(through))throw Error('INVALID_TRANSFER_WINDOW');
  if(from>through)return [];
  if(accountingCache)await checkAnchor();
  const cache=accountingCache?.namespace({kind:'history-checkpoint',scope:{anchor:anchors[0],wallet,from,through,kind,queries:scopes.map(s=>s.id)}});
  async function scan(scope,pass){
   const identity={scope:scope.id,pass},rows=[],seen=new Set(),events=new Set();let params={},previous=Infinity,pageCount=0,lastPage=null;
   const append=p=>{
    if(!p||!Array.isArray(p.items))throw Error('PUBLIC_HISTORY_UNAVAILABLE');
    const within=[];
    for(const row of p.items){checkBudget();scope.validate?.(row);const at=Date.parse(row.timestamp);if(!Number.isFinite(at))throw Error('PUBLIC_HISTORY_TIMESTAMP_INVALID');if(at>previous)throw Error('PUBLIC_HISTORY_ORDER_CHANGED');previous=at;if(at>=from&&at<=through)within.push(row);}
    for(const row of proof(within)){const id=identityOf(row);if(events.has(id))throw Error(kind==='native'?'NATIVE_HISTORY_DUPLICATE':'TRANSFER_HISTORY_DUPLICATE');events.add(id);}rows.push(...within);
    const done=previous<from||!p.next_page_params;
    if(!done){if(!p.items.length)throw Error('PUBLIC_HISTORY_EMPTY_PAGE');const cursor=hash(p.next_page_params);if(seen.has(cursor))throw Error('PUBLIC_HISTORY_CURSOR_REPEATED');seen.add(cursor);}
    return done;
   };
   // The verification pass must read its entire window afresh. Reusing its
   // saved prefix together with scan A could hide a correction to both copies.
   const saved=pass==='a'?cache?.getCheckpoint({...identity,kind:'cursor'}):undefined;
   if(saved&&Number.isSafeInteger(saved.pages)&&saved.pages>=0&&saved.pages<=maxPages){
    for(let i=0;i<saved.pages;i++){
     const page=cache.getCheckpoint({...identity,kind:'page',index:i});
     if(!page||hash(page.params)!==hash(params)){cache.clear();throw Error('ACCOUNTING_HISTORY_CHECKPOINT_INCOMPLETE');}
     const done=append(page.response);lastPage=page;params=page.response.next_page_params??{};pageCount++;if(done&&i+1!==saved.pages)throw Error('ACCOUNTING_HISTORY_CHECKPOINT_INVALID');
    }
    // Re-read the last saved keyset boundary before trusting the continuation.
    if(lastPage){
     const fresh=await scope.page(lastPage.params);if(!Array.isArray(fresh?.items))throw Error('PUBLIC_HISTORY_UNAVAILABLE');let order=Infinity;
     for(const row of fresh.items){scope.validate?.(row);const at=Date.parse(row.timestamp);if(!Number.isFinite(at))throw Error('PUBLIC_HISTORY_TIMESTAMP_INVALID');if(at>order)throw Error('PUBLIC_HISTORY_ORDER_CHANGED');order=at;}
     const window=p=>({rows:proof(p.items.filter(r=>Date.parse(r.timestamp)>=from&&Date.parse(r.timestamp)<=through)),next:p.next_page_params??null});if(hash(window(fresh))!==hash(window(lastPage.response)))throw Error(changed);
    }
    if(saved.done){proof(rows);return rows;}
   }
   while(pageCount<maxPages){
    checkBudget();const requested=params,p=await scope.page(params),done=append(p);
    // A duplicate never becomes an ignored/deduplicated historical transfer.
    pageCount++;params=p.next_page_params??{};
    if(pass==='a'&&cache?.setCheckpoint({...identity,kind:'page',index:pageCount-1},{params:requested,response:p}))cache.setCheckpoint({...identity,kind:'cursor'},{pages:pageCount,done});
    if(done)return rows;
   }
   throw Error('PUBLIC_HISTORY_PAGE_LIMIT');
  }
  async function scanAll(pass,first){
   const result=new Array(scopes.length);let cursor=0,failure;
   // Different token filters/native indexes are independent. Drain the whole
   // pass before starting fresh verification; never substitute A's data for B.
   await Promise.allSettled(Array.from({length:Math.min(3,scopes.length)},async()=>{
    try{while(cursor<scopes.length&&!failure){checkBudget();const index=cursor++,rows=await scan(scopes[index],pass);
     if(first&&hash(proof(rows))!==hash(proof(first[index])))throw Error(changed);result[index]=rows;
    }}catch(error){failure??=error;}
   }));
   if(failure)throw failure;checkBudget();return result;
  }
  try{
   const first=await scanAll('a'),rows=(await scanAll('b',first)).flat();
   checkBudget();cache?.clear();return rows;
  }catch(error){if(/(?:INDEX_CHANGED|DUPLICATE|ORDER_CHANGED|CURSOR_REPEATED|_INVALID|PAGE_LIMIT)$/.test(error.message))cache?.clear();throw error;}
 }
 const transferProof=rows=>{
   const seen=new Set(),hex=(v,n)=>{if(typeof v!=='string'||!new RegExp('^0x[0-9a-fA-F]{'+n+'}$').test(v))throw Error('TRANSFER_HISTORY_INVALID');return v.toLowerCase();};
   const integer=v=>{if((typeof v==='number'&&!Number.isSafeInteger(v))||!/^\d+$/.test(String(v)))throw Error('TRANSFER_HISTORY_INVALID');return BigInt(v).toString();};
   return rows.map(t=>{
    checkBudget();
    const tx=hex(t.transaction_hash,64),log=integer(t.log_index),id=tx+':'+log;
    if(seen.has(id))throw Error('TRANSFER_HISTORY_DUPLICATE');seen.add(id);
    return [hex(t.block_hash,64),integer(t.block_number),tx,log,Date.parse(t.timestamp),hex(t.from?.hash,40),hex(t.to?.hash,40),hex(t.token?.address_hash,40),integer(t.total?.value),t.total?.decimals==null?null:integer(t.total.decimals)];
   });
 };
 function transferScope(wallet,token=null){return {id:token??'all',validate:row=>{if(token&&row.token?.address_hash?.toLowerCase()!==token)throw Error('TRANSFER_TOKEN_FILTER_MISMATCH');},page:async params=>{
   const keys=Object.keys(params);if(keys.some(k=>!['block_number','index','items_count','batch_block_hash','batch_transaction_hash','batch_log_index','index_in_batch','token_contract_address_hash','token_id','type'].includes(k)))throw Error('UNKNOWN_EXPLORER_CURSOR');
   const url=new URL('https://explorer.doma.xyz/api/v2/addresses/'+wallet+'/token-transfers');for(const [k,v]of Object.entries(params))if(v!==null)url.searchParams.set(k,String(v));url.searchParams.set('type','ERC-20');if(token)url.searchParams.set('token',token);
   const p=await request(url.toString());
   if(p?.next_page_params)p.next_page_params=Object.fromEntries(Object.entries(p.next_page_params).sort(([a],[b])=>a.localeCompare(b)));
   return p;
  }};}
 const transferIdentity=row=>row[2]+':'+row[3];
 async function transfers(wallet,from,through){return fixedWindow([transferScope(wallet)],{wallet,from,through,proof:transferProof,identityOf:transferIdentity,changed:'TRANSFER_INDEX_CHANGED',kind:'erc20'});}
 async function transfersForTokens(wallet,tokens,from,through){
  if(!Array.isArray(tokens)||tokens.some(t=>typeof t!=='string'||!/^0x[0-9a-f]{40}$/.test(t)))throw Error('INVALID_TRANSFER_TOKEN_FILTER');
  const rows=await fixedWindow([...new Set(tokens)].sort().map(token=>transferScope(wallet,token)),{wallet,from,through,proof:transferProof,identityOf:transferIdentity,changed:'TRANSFER_INDEX_CHANGED',kind:'erc20-filtered'});transferProof(rows);return rows;
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
 async function nativeHistory(wallet,through,from=0){
  const proof=rows=>{const seen=new Set();return rows.map(t=>{
   checkBudget();const tx=(t.hash||t.transaction_hash)?.toLowerCase(),id=tx+':'+(t.index??'transaction');if(!/^0x[0-9a-f]{64}$/.test(tx))throw Error('NATIVE_HISTORY_INVALID');if(seen.has(id))throw Error('NATIVE_HISTORY_DUPLICATE');seen.add(id);
   return [tx,t.block_hash??null,t.block_number==null?null:String(t.block_number),t.index==null?null:String(t.index),t.timestamp,t.from?.hash?.toLowerCase()??null,t.to?.hash?.toLowerCase()??null,t.value==null?null:String(t.value),t.fee?.value==null?null:String(t.fee.value),t.status??null,t.success??null,t.error??null];
  });};
  const scopes=['transactions','internal-transactions'].map(kind=>({id:kind,page:async params=>{
   const u=new URL('https://explorer.doma.xyz/api/v2/addresses/'+wallet+'/'+kind);for(const[k,v]of Object.entries(params)){if(!/^[a-z_]+$/.test(k))throw Error('UNKNOWN_EXPLORER_CURSOR');if(v!==null)u.searchParams.set(k,String(v));}const p=await request(u.toString());if(p?.next_page_params)p.next_page_params=Object.fromEntries(Object.entries(p.next_page_params).sort(([a],[b])=>a.localeCompare(b)));return p;
  }}));
  const rows=await fixedWindow(scopes,{wallet,from,through,proof,identityOf:row=>row[0]+':'+row[3],changed:'NATIVE_INDEX_CHANGED',kind:'native'}),found=new Map();
  for(const t of rows){const tx=(t.hash||t.transaction_hash).toLowerCase();found.set(tx,{tx,at:Date.parse(t.timestamp)});}
  return [...found.values()];
 }
 async function nativeTransaction(tx,receipt){
  if(native.has(tx))return native.get(tx);
  if(!transactions.has(tx))transactions.set(tx,await rpc('eth_getTransactionByHash',[tx]));
  // A failed transaction reverted every nested value transfer. Its canonical
  // receipt still proves the paid fees; no mutable trace listing is needed.
  if(receipt.status==='0x0'){
   const result=require('./public-native-accounting.cjs').nativeSettlement(transactions.get(tx),receipt,[]);native.set(tx,result);return result;
  }
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
  checkBudget,
  async withDeadline(at,task){
   if(budgetController||!Number.isFinite(at))throw Error('INVALID_ACCOUNTING_BUDGET');
   deadline=at;budgetController=new AbortController();
   const timer=setTimeout(()=>budgetController?.abort(),Math.max(0,at-Date.now()));
   try{checkBudget();const result=await task();checkBudget();return result;}
   finally{clearTimeout(timer);budgetController=null;deadline=Infinity;}
  },
  async smartWalletSettlement(swaps){
   if(!swaps.length)return null;
   const tx=swaps[0].tx;
   if(!transactions.has(tx))transactions.set(tx,await rpc('eth_getTransactionByHash',[tx]));
   const adapter=require('./public-smart-wallet-settlement.cjs'),transaction=transactions.get(tx);
   if(transaction.to?.toLowerCase()!==adapter.ENTRY)return null;
   if(!receipts.has(tx))receipts.set(tx,await rpc('eth_getTransactionReceipt',[tx]));
   return adapter.verifySmartWalletSettlement({swaps,transaction,receipt:receipts.get(tx),codeAt:code,
    poolFor:(a,b,fee,at)=>read(factory,'function getPool(address,address,uint24) view returns(address)','getPool',[a,b,fee],at),
    userOperationHash:(op,at)=>read(adapter.ENTRY,adapter.HASH_ABI,'getUserOpHash',[op],at)});
  },
  async orderRouterSettlement(swaps,refs=[]){
   if(!swaps.length)return null;
   const tx=swaps[0].tx,{ROUTER,IMPLEMENTATION_SLOT}=require('./public-router-settlement.cjs');
   if(!/^0x[0-9a-f]{64}$/.test(tx))throw Error('INVALID_TRANSACTION_HASH');
   if(!transactions.has(tx))transactions.set(tx,await rpc('eth_getTransactionByHash',[tx]));
   const transaction=transactions.get(tx);if(transaction.to?.toLowerCase()!==ROUTER)return null;
   if(!receipts.has(tx))receipts.set(tx,await rpc('eth_getTransactionReceipt',[tx]));
   const receipt=receipts.get(tx);
   if(!implementations.has(receipt.blockNumber))implementations.set(receipt.blockNumber,'0x'+(await rpc('eth_getStorageAt',[ROUTER,IMPLEMENTATION_SLOT,receipt.blockNumber])).slice(-40));
   return require('./public-order-route.cjs').verifyOrderRoute({swaps,refs,transaction,receipt,implementation:implementations.get(receipt.blockNumber),codeAt:code,
    poolFor:(a,b,fee,at)=>read(factory,'function getPool(address,address,uint24) view returns(address)','getPool',[a,b,fee],at)});
  },
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
  transaction:async tx=>{
   if(!/^0x[0-9a-f]{64}$/.test(tx))throw Error('INVALID_TRANSACTION_HASH');
   if(!transactions.has(tx))transactions.set(tx,await rpc('eth_getTransactionByHash',[tx]));
   const value=transactions.get(tx);
   if(value.hash?.toLowerCase()!==tx||!/^0x[0-9a-f]+$/i.test(value.blockNumber)||!/^0x[0-9a-f]{64}$/i.test(value.blockHash))throw Error('ACCOUNTING_TRANSACTION_INVALID');
   if(accountingCache&&BigInt(value.blockNumber)>BigInt(anchors[0].number))throw Error('ACCOUNTING_TRANSACTION_OUTSIDE_ANCHOR');
   return value;
  },
  block,blockAt,swaps,transfers,transfersForTokens,valueUsd,primeBalances,hasNativeActivity,nativeHistory,nativeTransaction,nativeRouterPurchase,
  nativeBalance:async(wallet,at)=>BigInt(await rpc('eth_getBalance',[wallet,at])),
  balance:async(wallet,token,at)=>{await primeBalances(wallet,[token],at);return balances.get(wallet+':'+token+':'+at);},
  hasCode:async(address,at)=>(await code(address,at))!=='0x',
 };
}
module.exports={publicSource,lossless};
