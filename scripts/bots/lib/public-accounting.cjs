'use strict';
// Reconstruct a complete supported-asset ledger on our host. Unknown basis and
// contract flows are explicit failures, never deposits with an invented cost.
const {randomUUID,createHash}=require('node:crypto');
const {normalizePublicSwap,receiptFlows,settlement,key,referenceSwap,USDC,WETH,TRANSFER}=require('./public-trade-worker.cjs');
const {NATIVE}=require('./public-native-accounting.cjs');
const usd=n=>(n/1000000n)+'.'+String(n%1000000n).padStart(6,'0');
const micros=s=>{if(!/^\d+\.\d{6}$/.test(s))throw Error('ACCOUNTING_VALUE_INVALID');return BigInt(s.replace('.',''));};
const abs=n=>n<0n?-n:n;
const canonicalJson=value=>JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function accountingStartMillis(timestamp){
 const floor=Date.parse(timestamp);if(!Number.isFinite(floor))throw Error('ACCOUNTING_PERIOD_INVALID');
 const fraction=String(timestamp).match(/T\d{2}:\d{2}:\d{2}\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i)?.[1]||'';
 return floor+(/[1-9]/.test(fraction.slice(3))?1:0);
}
function disposesExternalAsset(receipt,walletSet){return (receipt.logs||[]).some(l=>l.topics?.[0]===TRANSFER&&l.topics.length>=3&&walletSet.has(('0x'+l.topics[1].slice(-40)).toLowerCase())&&!walletSet.has(('0x'+l.topics[2].slice(-40)).toLowerCase())&&(l.topics.length===4||BigInt(l.data)!==0n));}
function rejectNetZeroAssetMovement(receipt,wallet,assets,code='ACCOUNTING_NET_ZERO_DOMAIN_FLOW_REVIEW_REQUIRED'){
 const flows=receiptFlows(receipt,wallet);
 for(const l of receipt.logs||[]){const token=l.address?.toLowerCase();if(!assets.has(token)||l.topics?.[0]!==TRANSFER||l.topics.length!==3||BigInt(l.data)===0n)continue;
  const from=('0x'+l.topics[1].slice(-40)).toLowerCase(),to=('0x'+l.topics[2].slice(-40)).toLowerCase();
  // Net balances cannot describe a sell/rebuy or an out-and-back transfer:
  // either can change FIFO ordering and basis despite restoring the balance.
  if(from!==to&&(from===wallet||to===wallet)&&(flows.get(token)||0n)===0n)throw Error(code);
 }
}
function requireSingleTransfer(receipt,wallet,token){
 const touches=(receipt.logs||[]).filter(l=>{if(l.address?.toLowerCase()!==token||l.topics?.[0]!==TRANSFER||l.topics.length!==3||BigInt(l.data)===0n)return false;
  const from=('0x'+l.topics[1].slice(-40)).toLowerCase(),to=('0x'+l.topics[2].slice(-40)).toLowerCase();return from!==to&&(from===wallet||to===wallet);
 });
 // Netting multiple raw legs loses FIFO order, even between linked wallets.
 // Verified swap adapters handle their own full receipts before this fallback.
 if(touches.length!==1)throw Error('ACCOUNTING_COMPLEX_TRANSFER_REQUIRED');
 const l=touches[0];return {from:('0x'+l.topics[1].slice(-40)).toLowerCase(),to:('0x'+l.topics[2].slice(-40)).toLowerCase(),units:BigInt(l.data)};
}
function linkedCounterparty(receipt,wallet,token,delta,walletSet){
 const leg=requireSingleTransfer(receipt,wallet,token),counter=delta<0n?leg.to:leg.from;
 if(leg.units!==abs(delta))throw Error('ACCOUNTING_COMPLEX_TRANSFER_REQUIRED');
 if(!walletSet.has(counter))return null;
 const other=requireSingleTransfer(receipt,counter,token);
 if(other.from!==leg.from||other.to!==leg.to||other.units!==leg.units||(receiptFlows(receipt,counter).get(token)||0n)!==-delta)throw Error('ACCOUNTING_COMPLEX_TRANSFER_REQUIRED');
 return counter;
}
async function proveDirectDeposit(source,txHash,receipt,wallet,token,units,native){
 if(!source.transaction)throw Error('EXTERNAL_DOMAIN_COST_BASIS_REQUIRED');
 const tx=await source.transaction(txHash),{parseAbi,decodeFunctionData,encodeFunctionData}=require('viem');
 const transfers=(receipt.logs||[]).filter(l=>l.topics?.[0]===TRANSFER);
 if(receipt.status!=='0x1'||tx?.hash?.toLowerCase()!==txHash||tx.to?.toLowerCase()!==token||tx.blockHash?.toLowerCase()!==receipt.blockHash?.toLowerCase()||BigInt(tx.blockNumber)!==BigInt(receipt.blockNumber)||BigInt(tx.chainId)!==97477n||BigInt(tx.value)!==0n||native.moves.length||transfers.length!==1)throw Error('EXTERNAL_DOMAIN_TRANSFER_UNPROVEN');
 const leg=requireSingleTransfer(receipt,wallet,token);
 if(leg.from!==tx.from?.toLowerCase()||leg.to!==wallet||leg.units!==units)throw Error('EXTERNAL_DOMAIN_TRANSFER_UNPROVEN');
 try{const abi=parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),call=decodeFunctionData({abi,data:tx.input});if(call.functionName!=='transfer'||call.args[0].toLowerCase()!==wallet||call.args[1]!==units||encodeFunctionData({abi,functionName:call.functionName,args:call.args}).toLowerCase()!==tx.input.toLowerCase())throw Error('invalid');}
 catch{throw Error('EXTERNAL_DOMAIN_TRANSFER_UNPROVEN');}
}
async function reconstruct({participant,wallets,from,through,periodStart,markets,references=[],eligible=[],source,priorRevision=0}){
 if(!Number.isFinite(from)||!Number.isFinite(through))throw Error('ACCOUNTING_PERIOD_INVALID');
 if(from>through)throw Error('ACCOUNTING_PERIOD_NOT_REACHED');
 // Keep the database's exact enrollment timestamp, including microseconds.
 // Numeric millisecond bounds are only for chain/history comparisons.
 const exactStart=periodStart??new Date(from).toISOString();
 if(Date.parse(exactStart)!==from)throw Error('ACCOUNTING_PERIOD_INVALID');
 from=accountingStartMillis(exactStart);
 if(from>through)throw Error('ACCOUNTING_PERIOD_NOT_REACHED');
 const check=()=>source.checkBudget?.();check();
 const supported=new Set([...markets.flatMap(m=>[m.domain_token,m.quote_token]),NATIVE]),walletSet=new Set(wallets);
 const domains=new Set(markets.map(m=>m.domain_token)),openingBalances=new Map(),historicalDomains=new Set();
 const valueUsd=(token,qty,at)=>qty===0n?Promise.resolve(0n):source.valueUsd(token===NATIVE?WETH:token,qty,at);
 const chainBalance=(wallet,token,at)=>token===NATIVE?source.nativeBalance(wallet,at):source.balance(wallet,token,at);
 const start=await source.blockAt(from-1),end=await source.blockAt(through),all=new Map(),publicSwaps=new Map(),indexedSwaps=new Map();
 for(const wallet of wallets){check();await source.primeBalances?.(wallet,[...supported].filter(t=>t!==NATIVE),start.number);await source.primeBalances?.(wallet,[...supported].filter(t=>t!==NATIVE),end.number);}
 for(const wallet of wallets)for(const token of supported){check();const units=await chainBalance(wallet,token,start.number);if(units<0n)throw Error('OPENING_BALANCE_INVALID');openingBalances.set(wallet+':'+token,units);}
 for(const wallet of wallets){
  check();
  for(const t of await source.transfers(wallet,from,through)){check();const token=t.token?.address_hash?.toLowerCase(),at=Date.parse(t.timestamp);if(supported.has(token)&&at>=from&&at<=through)all.set(t.transaction_hash,{tx:t.transaction_hash,at});}
  if(source.nativeHistory&&source.nativeTransaction){for(const t of await source.nativeHistory(wallet,through,from))if(t.at>=from&&t.at<=through)all.set(t.tx,t);}
  else if(await source.nativeBalance(wallet,start.number)!==0n||await source.nativeBalance(wallet,end.number)!==0n||await source.hasNativeActivity(wallet,through))throw Error('NATIVE_CAPITAL_LEDGER_REQUIRED');
 }
 // Inspect every post-entry raw transfer, not only net flow: an outgoing leg
 // can consume opening FIFO even when another leg restores the final balance.
 const receiptCache=new Map();
 for(const t of all.values()){
  check();const receipt=await source.receipt(t.tx);receiptCache.set(t.tx,receipt);
  for(const l of receipt.logs||[]){const token=l.address?.toLowerCase();if(!domains.has(token)||l.topics?.[0]!==TRANSFER||l.topics.length!==3)continue;
   const owner=('0x'+l.topics[1].slice(-40)).toLowerCase(),to=('0x'+l.topics[2].slice(-40)).toLowerCase();
   if(owner!==to&&walletSet.has(owner)&&(openingBalances.get(owner+':'+token)||0n)>0n&&BigInt(l.data)>0n)historicalDomains.add(token);
  }
 }
 // Untouched domain holdings retain evidenced entry value in capital, but no
 // invented cost basis. Backfill consumed opening positions across linked
 // wallets only; quote/native historic acquisition costs do not affect profit.
 if(historicalDomains.size)for(const wallet of wallets){check();
  const history=source.transfersForTokens?await source.transfersForTokens(wallet,[...historicalDomains],0,from-1):await source.transfers(wallet,0,from-1);
  for(const t of history){check();const token=t.token?.address_hash?.toLowerCase(),at=Date.parse(t.timestamp);if(historicalDomains.has(token)&&at<from)all.set(t.transaction_hash,{tx:t.transaction_hash,at});}
 }
 const swapFrom=[...all.values()].reduce((earliest,t)=>Math.min(earliest,t.at),from);
 for(const wallet of wallets)for(const s of await source.swaps(wallet,swapFrom,through)){check();const n=normalizePublicSwap(s);if(n&&n.wallet===wallet&&all.has(n.tx)){if(indexedSwaps.has(key(n)))throw Error('ACCOUNTING_DUPLICATE_INDEX_ROW');publicSwaps.set(key(n),n);indexedSwaps.set(key(n),n);}}
 for(const {ref}of references)if(ref.status==='verified'&&walletSet.has(ref.wallet)&&all.has(ref.transactionHash)&&Date.parse(ref.executedAt)<=through){const r=referenceSwap(ref);if(!publicSwaps.has(key(r)))publicSwaps.set(key(r),r);}
 // Direction and FIFO connectivity come from the full receipt-proven ledger.
 const unknownConsumedBuckets=new Set();
 const events=[],lots=[],opening=[],tokens=new Set();let order=1,opened=false;
 const balances=new Map();
 function replay(e){
  check();
  const qty=BigInt(e.units);tokens.add(e.token);const bucket=e.wallet+':'+e.token;
  if(['in','buy'].includes(e.kind)){
   balances.set(bucket,(balances.get(bucket)||0n)+qty);
   lots.push({id:e.id,wallet:e.wallet,token:e.token,units:qty,cost:e.kind==='in'&&e.costKnown===false?null:micros(e.kind==='in'?e.costUsd:e.usd),acquiredAt:e.executedAt,acquisitionOrder:e.acquisitionOrder??e.order??0});return;
  }
  balances.set(bucket,(balances.get(bucket)||0n)-qty);let need=qty;
  for(const l of lots.filter(l=>l.wallet===e.wallet&&l.token===e.token&&l.units>0n).sort((a,b)=>a.acquiredAt.localeCompare(b.acquiredAt)||a.acquisitionOrder-b.acquisitionOrder)){
   check();
   // Pre-entry inventory may be exhausted without its old cost affecting a
   // competition result. Preserve null basis, never invent a zero cost.
   // Any eligible sale of a surviving unknown lot still fails.
   if(l.cost==null&&Date.parse(e.executedAt)>=from){
    // Defer only unscored domain consumption, retaining real null-cost FIFO.
    // Full transfer connectivity and all proven sales are checked before a
    // score-only view can isolate this inventory from scored inventory.
    if(!domains.has(e.token)||[USDC,WETH,NATIVE].includes(e.token)||e.economicId)throw Error('ACCOUNTING_OPENING_BASIS_REQUIRED');
    unknownConsumedBuckets.add(e.wallet+':'+e.token);
   }
   const take=need<l.units?need:l.units,cost=l.cost==null?null:take===l.units?l.cost:l.cost*take/l.units;
   l.units-=take;if(l.cost!=null)l.cost-=cost;need-=take;
   if(e.kind==='transfer')lots.push({...l,id:e.id+':'+l.id,wallet:e.toWallet,units:take,cost});
   if(!need)break;
  }
  if(need)throw Error('HISTORICAL_COST_BASIS_MISSING');
  if(e.kind==='transfer')balances.set(e.toWallet+':'+e.token,(balances.get(e.toWallet+':'+e.token)||0n)+qty);
 }
 async function captureOpening(){if(opened)return;opened=true;
  for(const wallet of wallets)for(const token of supported){check();if(historicalDomains.has(token))continue;const units=openingBalances.get(wallet+':'+token)||0n;if(!units)continue;
   if(domains.has(token)){balances.set(wallet+':'+token,units);lots.push({id:'opening:'+wallet+':'+token,wallet,token,units,cost:null,acquiredAt:new Date(from-1).toISOString(),acquisitionOrder:0});}
   else{const value=await valueUsd(token,units,start.number);replay({id:'opening:'+wallet+':'+token,wallet,token,units:units.toString(),kind:'in',costUsd:usd(value),executedAt:exactStart});}
  }
  for(const l of lots.filter(l=>l.units>0n)){check();const value=await valueUsd(l.token,l.units,start.number);opening.push({id:l.id,wallet:l.wallet,token:l.token,units:l.units.toString(),...(l.cost==null?{costKnown:false}:{costUsd:usd(l.cost)}),valueUsd:usd(value),acquiredAt:l.acquiredAt,acquisitionOrder:l.acquisitionOrder,evidence:(l.cost==null?'Finalized untouched opening holding; basis pending; ':domains.has(l.token)?'Public domain-token history/FIFO; ':'Finalized opening balance and price; ')+'opening block '+start.number});}
  for(const wallet of wallets)for(const token of supported){check();if(openingBalances.get(wallet+':'+token)!==(balances.get(wallet+':'+token)||0n))throw Error(token===NATIVE?'NATIVE_OPENING_BALANCE_MISMATCH':'OPENING_BALANCE_MISMATCH');}
 }
 function event(tx,at,body){const index=order++;return {id:'chain:'+tx+':'+index,executedAt:new Date(at).toISOString(),order:index,acquisitionOrder:index,evidence:'Finalized public receipt '+tx,...body};}
 const transactions=[];for(const t of all.values()){check();const receipt=receiptCache.get(t.tx)||await source.receipt(t.tx);transactions.push({...t,receipt});}
 transactions.sort((a,b)=>Number(BigInt(a.receipt.blockNumber)-BigInt(b.receipt.blockNumber))||Number(BigInt(a.receipt.transactionIndex)-BigInt(b.receipt.transactionIndex)));
 // Independent trace reads may overlap; FIFO replay below remains strictly
 // chronological. Wait for every started task, including deadline failures.
 if(source.nativeTransaction){let cursor=0,failure;
  await Promise.allSettled(Array.from({length:Math.min(3,transactions.length)},async()=>{
   try{while(cursor<transactions.length&&!failure){check();const t=transactions[cursor++];
    // Before entry, only consumed domain lots and their own gas are replayed.
    // A pinned zero-value transaction cannot use the native-purchase path; its
    // fee is proved by the transaction/receipt without claiming native moves.
    if(t.at<from&&source.historicalNativeGas){
     const gas=await source.historicalNativeGas(t.tx,t.receipt);
     if(gas!==null){
      if(!gas||gas.transactionHash?.toLowerCase()!==t.tx.toLowerCase()||gas.blockHash?.toLowerCase()!==t.receipt.blockHash?.toLowerCase()
       ||!/^0x[0-9a-f]+$/i.test(gas.blockNumber||'')||BigInt(gas.blockNumber)!==BigInt(t.receipt.blockNumber)||gas.value!=='0'
       ||typeof gas.fee!=='bigint'||gas.fee<0n||!/^0x[0-9a-f]{40}$/.test(gas.payer||'')||Object.hasOwn(gas,'moves'))throw Error('HISTORICAL_NATIVE_GAS_PROOF_INVALID');
      t.historicalGas=gas;continue;
     }
    }
    t.native=await source.nativeTransaction(t.tx,t.receipt);if(!t.native||!Array.isArray(t.native.moves)||typeof t.native.fee!=='bigint'||t.native.fee<0n)throw Error('NATIVE_TRANSACTION_PROOF_UNAVAILABLE');}}
   catch(e){failure??=e;}
  }));
  if(failure)throw failure;check();
 }
 for(const t of transactions){
  check();
  if(t.at>=from)await captureOpening();
  const receipt=t.receipt,block=await source.block(receipt.blockNumber);
  if(block.hash!==receipt.blockHash||Date.parse(block.timestamp)!==t.at||BigInt(receipt.blockNumber)>BigInt(end.number))throw Error('ACCOUNTING_RECEIPT_MISMATCH');
  if(t.historicalGas&&t.at>=from)throw Error('HISTORICAL_NATIVE_GAS_AFTER_ENTRY');
  const batch=[],matched=new Set(),native=t.historicalGas||t.native||{moves:[],fee:0n,payer:null};
  const successful=receipt.status==='0x1';
  if(!successful&&receipt.status!=='0x0')throw Error('ACCOUNTING_RECEIPT_STATUS_INVALID');
  if(successful)for(const wallet of wallets)rejectNetZeroAssetMovement(receipt,wallet,t.at<from?historicalDomains:domains);
  const nativePurchase=successful&&!t.historicalGas&&source.nativeRouterPurchase?await source.nativeRouterPurchase(t.tx,receipt,native,wallets):null;
  const paidGas=walletSet.has(native.payer)?native.fee:0n;
  let pricedGas;const gasUsd=()=>pricedGas??=(paidGas?valueUsd(NATIVE,paidGas,receipt.blockNumber):Promise.resolve(0n));
  if(nativePurchase){
   const p=nativePurchase;
   const quoteConversion=p.kind==='quote_conversion'&&p.token===USDC;
   if(!walletSet.has(p.wallet)||!supported.has(p.token)||(!quoteConversion&&[USDC,WETH,NATIVE].includes(p.token))||wallets.some(w=>w!==p.wallet&&receiptFlows(receipt,w).size))throw Error('NATIVE_PURCHASE_ACCOUNT_MISMATCH');
   const cost=await valueUsd(NATIVE,BigInt(p.nativeSpent),receipt.blockNumber);
   const eligibleFill=quoteConversion?null:eligible.find(f=>f.wallet===p.wallet&&f.transactionHash===t.tx&&f.domainToken===p.token&&f.quoteToken===p.domainQuoteToken);
   batch.push(event(t.tx,t.at,{wallet:p.wallet,token:NATIVE,units:p.nativeSpent,kind:'out'}));
   if(paidGas)batch.push(event(t.tx,t.at,{wallet:native.payer,token:NATIVE,units:paidGas.toString(),kind:'out'}));
   batch.push(event(t.tx,t.at,{wallet:p.wallet,token:p.token,units:p.units,kind:'buy',usd:usd(cost+(native.payer===p.wallet?await gasUsd():0n)),...(eligibleFill?{economicId:eligibleFill.economicId,notionalUsd:eligibleFill.volumeUsd}:{})}));
   for(const e of batch){if(t.at<from&&!historicalDomains.has(e.token))continue;replay(e);if(t.at>=from)events.push(e);}
   continue;
  }
  const nativeQuoteOutput=successful&&!t.historicalGas&&source.nativeQuoteOutput?await source.nativeQuoteOutput(t.tx,receipt,native,wallets):null;
  if(nativeQuoteOutput){
   const p=nativeQuoteOutput;
   if(!walletSet.has(p.wallet)||p.kind!=='native_quote_conversion'||p.inputToken!==USDC
    ||!/^\d+$/.test(String(p.inputUnits))||BigInt(p.inputUnits)<=0n||!/^\d+$/.test(String(p.nativeReceived))||BigInt(p.nativeReceived)<=0n
    ||wallets.some(w=>w!==p.wallet&&(receiptFlows(receipt,w).size||native.moves.some(m=>m.from===w||m.to===w))))throw Error('NATIVE_QUOTE_ACCOUNT_MISMATCH');
   // Quote conversions create neither a domain fill nor an external deposit.
   // Pre-entry quote funding is already proved by entry-block balances.
   if(t.at>=from){
    batch.push(event(t.tx,t.at,{wallet:p.wallet,token:USDC,units:String(p.inputUnits),kind:'out'}));
    if(paidGas)batch.push(event(t.tx,t.at,{wallet:native.payer,token:NATIVE,units:paidGas.toString(),kind:'out'}));
    batch.push(event(t.tx,t.at,{wallet:p.wallet,token:NATIVE,units:String(p.nativeReceived),kind:'buy',usd:usd(BigInt(p.inputUnits))}));
    for(const e of batch){replay(e);events.push(e);}
   }
   continue;
  }
  if(t.at<from){
   // Reconstruct actual domain lots without inventing a pre-entry quote/native
   // funding ledger. Every historical purchase still proves its full receipt,
   // fee-inclusive cost and own gas; linked transfers retain the original lot.
   for(const wallet of wallets){
    const flows=new Map([...receiptFlows(receipt,wallet)].filter(([token])=>historicalDomains.has(token)));if(!flows.size)continue;
    let swaps=[...publicSwaps.values()].filter(s=>s.tx===t.tx&&s.wallet===wallet);
    const smart=swaps.length&&source.smartWalletSettlement?await source.smartWalletSettlement([...indexedSwaps.values()].filter(s=>s.tx===t.tx&&s.wallet===wallet)):null;
    const route=!smart&&swaps.length&&source.orderRouterSettlement?await source.orderRouterSettlement([...indexedSwaps.values()].filter(s=>s.tx===t.tx&&s.wallet===wallet),references.filter(r=>r.ref.status==='verified'&&r.ref.wallet===wallet&&r.ref.transactionHash===t.tx).map(r=>r.ref)):null;
    const universal=!smart&&!route&&swaps.length&&source.universalRouterSettlement?await source.universalRouterSettlement([...indexedSwaps.values()].filter(s=>s.tx===t.tx&&s.wallet===wallet)):null;
    const proof=smart||route||universal;if(proof)swaps=[proof.swap];
    if(swaps.length>1)throw Error('ACCOUNTING_MULTI_FILL_ALLOCATION_REQUIRED');
    if(swaps.length){const s=swaps[0];if(flows.size!==1||!flows.has(s.domain)||new Map([...receiptFlows(receipt,wallet)].filter(([token])=>supported.has(token))).size!==2)throw Error('ACCOUNTING_COMPLEX_SWAP');
     const amounts=proof?proof.amounts:await settlement(s,receipt,source);
     // Historical disposals consume FIFO quantities only. Their proceeds and
     // gas never enter competition profit or the remaining opening lot cost.
     if(s.side==='sell'){batch.push(event(t.tx,t.at,{wallet,token:s.domain,units:amounts.walletDomainUnits,kind:'sell'}));continue;}
     const money=s.quote===USDC?BigInt(amounts.walletQuoteUnits):await valueUsd(s.quote,BigInt(amounts.walletQuoteUnits),receipt.blockNumber),costGas=wallet===native.payer?await gasUsd():0n;
     batch.push(event(t.tx,t.at,{wallet,token:s.domain,units:amounts.walletDomainUnits,kind:'buy',usd:usd(money+costGas)}));continue;
    }
    for(const[token,delta]of flows){const marker=wallet+':'+token;if(matched.has(marker))continue;
     const counter=linkedCounterparty(receipt,wallet,token,delta,walletSet);
     if(counter){matched.add(marker);matched.add(counter+':'+token);batch.push(event(t.tx,t.at,{wallet:delta<0n?wallet:counter,toWallet:delta<0n?counter:wallet,token,units:abs(delta).toString(),kind:'transfer'}));continue;}
     if(delta>0n){
      // A canonical receipt proves incoming quantity, not acquisition cost.
      requireSingleTransfer(receipt,wallet,token);
      batch.push(event(t.tx,t.at,{wallet,token,units:delta.toString(),kind:'in',costKnown:false}));continue;
     }
     const endpoints=(receipt.logs||[]).filter(l=>l.address.toLowerCase()===token&&l.topics?.[0]===TRANSFER&&l.topics.length===3&&('0x'+l.topics[1].slice(-40)).toLowerCase()===wallet).map(l=>('0x'+l.topics[2].slice(-40)).toLowerCase());
     // Before entry an exact single outgoing leg only disposes quantity.
     // A later contract/LP return remains unknown basis, never a new purchase.
     if(endpoints.length!==1)throw Error('UNSUPPORTED_CONTRACT_OR_LP_FLOW');
     batch.push(event(t.tx,t.at,{wallet,token,units:abs(delta).toString(),kind:'out'}));
    }
   }
   for(const e of batch)replay(e);continue;
  }
  // WETH deposit/withdrawal logs are required to identify wrapping. A wrap is
  // conversion of existing capital, never a second external deposit or trade.
  const wraps=[],wrapDeltas=new Map();
  if(successful&&supported.has(WETH)){
   const {toEventSelector}=require('viem'),deposit=toEventSelector('Deposit(address,uint256)'),withdrawal=toEventSelector('Withdrawal(address,uint256)');
   for(const l of receipt.logs||[]){if(l.address.toLowerCase()!==WETH||![deposit,withdrawal].includes(l.topics?.[0]))continue;
    if(l.removed||l.topics.length!==2||!/^0x[0-9a-f]{64}$/i.test(l.data))throw Error('WRAP_EVENT_INVALID');
    const wallet=('0x'+l.topics[1].slice(-40)).toLowerCase();if(!walletSet.has(wallet))continue;
    const qty=BigInt(l.data),isDeposit=l.topics[0]===deposit;
    const move=native.moves.find(m=>!wraps.includes(m)&&m.units===qty&&m.from===(isDeposit?wallet:WETH)&&m.to===(isDeposit?WETH:wallet));
    if(!qty||!move)throw Error('WRAP_NATIVE_TRANSFER_MISMATCH');wraps.push(move);
    wrapDeltas.set(wallet,(wrapDeltas.get(wallet)||0n)+(isDeposit?qty:-qty));
    const value=await valueUsd(WETH,qty,receipt.blockNumber);
    batch.push(event(t.tx,t.at,{wallet,token:isDeposit?NATIVE:WETH,units:qty.toString(),kind:'out'}));
    batch.push(event(t.tx,t.at,{wallet,token:isDeposit?WETH:NATIVE,units:qty.toString(),kind:'buy',usd:usd(value)}));
   }
  }
  for(const move of native.moves){if(wraps.includes(move)||move.from===move.to)continue;
   const ownFrom=walletSet.has(move.from),ownTo=walletSet.has(move.to);if(!ownFrom&&!ownTo)continue;
   if(ownFrom&&ownTo){batch.push(event(t.tx,t.at,{wallet:move.from,toWallet:move.to,token:NATIVE,units:move.units.toString(),kind:'transfer'}));continue;}
   const counter=ownFrom?move.to:move.from;
   if(await source.hasCode(counter,receipt.blockNumber)){
    // A finalized, unsolicited ETH deposit (including gas sponsorship) is
    // inbound quote capital regardless of whether its sender is a contract.
    // A token disposal/redemption in the same transaction is not a deposit.
    const disposesTokens=successful&&disposesExternalAsset(receipt,walletSet);
    if(!ownTo||disposesTokens)throw Error('NATIVE_CONTRACT_FLOW_REVIEW_REQUIRED');
   }
   const value=ownTo?await valueUsd(NATIVE,move.units,receipt.blockNumber):0n;
   batch.push(event(t.tx,t.at,{wallet:ownTo?move.to:move.from,token:NATIVE,units:move.units.toString(),kind:ownTo?'in':'out',...(ownTo?{usd:usd(value),costUsd:usd(value)}:{})}));
  }
  if(paidGas)batch.push(event(t.tx,t.at,{wallet:native.payer,token:NATIVE,units:paidGas.toString(),kind:'out'}));
  for(const wallet of wallets){
   if(!successful)continue; // failed calls affect gas only, never token inventory
   const flows=new Map([...receiptFlows(receipt,wallet)].filter(([token])=>supported.has(token)));
   if(wrapDeltas.has(wallet)){
    // WETH9 emits Deposit/Withdrawal instead of mint/burn Transfer logs.
    // Direct wrapping with an additional token operation needs a separate path.
    if(flows.size)throw Error('WRAP_MIXED_TOKEN_FLOW_UNSUPPORTED');
    continue;
   }
   let swaps=[...publicSwaps.values()].filter(s=>s.tx===t.tx&&s.wallet===wallet);
   const smart=swaps.length&&source.smartWalletSettlement?await source.smartWalletSettlement([...indexedSwaps.values()].filter(s=>s.tx===t.tx&&s.wallet===wallet)):null;
   const route=!smart&&swaps.length&&source.orderRouterSettlement?await source.orderRouterSettlement([...indexedSwaps.values()].filter(s=>s.tx===t.tx&&s.wallet===wallet),references.filter(r=>r.ref.status==='verified'&&r.ref.wallet===wallet&&r.ref.transactionHash===t.tx).map(r=>r.ref)):null;
   const universal=!smart&&!route&&swaps.length&&source.universalRouterSettlement?await source.universalRouterSettlement([...indexedSwaps.values()].filter(s=>s.tx===t.tx&&s.wallet===wallet)):null;
    const proof=smart||route||universal;if(proof)swaps=[proof.swap];
   if(swaps.length>1)throw Error('ACCOUNTING_MULTI_FILL_ALLOCATION_REQUIRED');
   if(swaps.length){const s=swaps[0];if(flows.size!==2)throw Error('ACCOUNTING_COMPLEX_SWAP');
    const amounts=proof?proof.amounts:await settlement(s,receipt,source);
    const money=s.quote===USDC?BigInt(amounts.walletQuoteUnits):await valueUsd(s.quote,BigInt(amounts.walletQuoteUnits),receipt.blockNumber);
    const costGas=wallet===native.payer?await gasUsd():0n;
    if(s.side==='sell'&&money<costGas)throw Error('GAS_EXCEEDS_SWAP_PROCEEDS');
    const netMoney=s.side==='buy'?money+costGas:money-costGas;
    const f=eligible.find(f=>f.wallet===wallet&&f.transactionHash===t.tx&&f.domainToken===s.domain&&f.quoteToken===s.quote);
    batch.push(event(t.tx,t.at,{wallet,token:s.domain,units:amounts.walletDomainUnits,kind:s.side==='buy'?'buy':'sell',usd:usd(netMoney),...(f?{economicId:f.economicId,notionalUsd:f.volumeUsd}:{})}));
    batch.push(event(t.tx,t.at,{wallet,token:s.quote,units:amounts.walletQuoteUnits,kind:s.side==='buy'?'out':'buy',...(s.side==='sell'?{usd:usd(money)}:{})}));
    continue;
   }
   // Unexplained quote withdrawals followed by deposits also change external
   // capital even when their final net balance is unchanged.
   rejectNetZeroAssetMovement(receipt,wallet,supported,'ACCOUNTING_NET_ZERO_ASSET_FLOW_REVIEW_REQUIRED');
   if(!flows.size)continue;
   // Non-swap token movements must be a simple evidenced transfer. LP,
   // router and contract interactions cannot masquerade as withdrawals.
   for(const [token,delta]of flows){const marker=wallet+':'+token;if(matched.has(marker))continue;
    const counter=linkedCounterparty(receipt,wallet,token,delta,walletSet);
    if(counter){const fromWallet=delta<0n?wallet:counter,toWallet=delta<0n?counter:wallet;
     matched.add(wallet+':'+token);matched.add(counter+':'+token);batch.push(event(t.tx,t.at,{wallet:fromWallet,toWallet,token,units:abs(delta).toString(),kind:'transfer'}));continue;
    }
    const tokenLogs=(receipt.logs||[]).filter(l=>l.address.toLowerCase()===token&&l.topics?.length===3);
    const endpoints=tokenLogs.filter(l=>('0x'+l.topics[delta>0n?2:1].slice(-40)).toLowerCase()===wallet).map(l=>('0x'+l.topics[delta>0n?1:2].slice(-40)).toLowerCase());
    const deferredBasis=delta>0n&&![USDC,WETH].includes(token);
    if(deferredBasis)await proveDirectDeposit(source,t.tx,receipt,wallet,token,delta,native);
    if(delta>0n){
     // A pure quote deposit has known USD value, even when sent by a funding
     // contract. Do not mislabel a token/NFT disposal or redemption as funding.
     if(disposesExternalAsset(receipt,walletSet)||native.moves.some(m=>walletSet.has(m.from)&&!walletSet.has(m.to)))throw Error('QUOTE_DEPOSIT_EXCHANGE_REVIEW_REQUIRED');
    }else if(endpoints.length!==1||await source.hasCode(endpoints[0],receipt.blockNumber))throw Error('UNSUPPORTED_CONTRACT_OR_LP_FLOW');
    const money=delta>0n?await valueUsd(token,delta,receipt.blockNumber):0n;
    batch.push(event(t.tx,t.at,{wallet,token,units:abs(delta).toString(),kind:delta>0n?'in':'out',...(delta>0n?{usd:usd(money),...(deferredBasis?{costKnown:false}:{costUsd:usd(money)})}:{})}));
   }
  }
  for(const e of batch){replay(e);if(t.at>=from)events.push(e);}
 }
 await captureOpening();
 const closingBalances=[];
 for(const wallet of wallets)for(const token of supported){check();const units=await chainBalance(wallet,token,end.number);if(units!==(balances.get(wallet+':'+token)||0n))throw Error(token===NATIVE?'NATIVE_CLOSING_BALANCE_MISMATCH':'CLOSING_BALANCE_MISMATCH');closingBalances.push({wallet,token,units:units.toString()});}
 if(eligible.some(f=>events.filter(e=>e.economicId===f.economicId&&e.wallet===f.wallet&&e.token===f.domainToken&&['buy','sell'].includes(e.kind)&&Date.parse(e.executedAt)===Date.parse(f.executedAt)&&e.notionalUsd===f.volumeUsd&&(f.side===undefined||f.side===e.kind)).length!==1))throw Error('ACCOUNTING_FILL_MISSING');
 let scoringEvents=events,projection={};
 if(unknownConsumedBuckets.size){
  // A token's wallet inventories are coupled only by actual linked transfers.
  // Include EVERY current transfer, including bridges later than a disposal,
  // so a later connection to scored inventory disables the entire component.
  const parent=new Map(),bucket=(wallet,token)=>wallet+':'+token;
  const find=k=>{if(!parent.has(k))parent.set(k,k);let r=k;while(parent.get(r)!==r)r=parent.get(r);while(parent.get(k)!==k){const next=parent.get(k);parent.set(k,r);k=next;}return r;};
  for(const wallet of wallets)for(const token of domains)find(bucket(wallet,token));
  for(const e of events)if(e.kind==='transfer'&&domains.has(e.token)){const a=find(bucket(e.wallet,e.token)),b=find(bucket(e.toWallet,e.token));if(a!==b)parent.set(b,a);}
  const isolatedRoots=new Set([...unknownConsumedBuckets].map(find));
  const isolated=e=>domains.has(e.token)&&isolatedRoots.has(find(bucket(e.wallet,e.token)));
  if(events.some(e=>e.kind==='sell'&&e.economicId&&isolated(e)))throw Error('ACCOUNTING_OPENING_BASIS_REQUIRED');
  const omitted=events.filter(e=>isolated(e)&&['sell','out','transfer'].includes(e.kind));
  const isolatedBuckets=[...parent.keys()].filter(k=>isolatedRoots.has(find(k))).sort().map(k=>{const[wallet,token]=k.split(':');return {wallet,token};});
  if(omitted.some(e=>e.economicId)||isolatedBuckets.some(b=>!domains.has(b.token)||[USDC,WETH,NATIVE].includes(b.token)))throw Error('ACCOUNTING_PROJECTION_INVALID');
  // This is a score-only view for the existing SQL calculator, never inventory.
  // Keep the full, reconciled events and exact closing balances as evidence.
  // All entry values and incoming capital remain, so the denominator is intact.
  const fullReconciliation={version:'mk-full-quantity-ledger-1',periodStart:exactStart,confirmedThrough:new Date(through).toISOString(),openingBlock:{number:start.number,hash:start.hash},closingBlock:{number:end.number,hash:end.hash},openingLots:opening,events,closingBalances};
  const omittedIds=new Set(omitted.map(e=>e.id));scoringEvents=events.filter(e=>!omittedIds.has(e.id));
  projection={scoringProjection:{version:'mk-isolated-unscored-components-2',isolatedBuckets,omittedEventIds:[...omittedIds],fullLedgerSha256:createHash('sha256').update(canonicalJson(fullReconciliation)).digest('hex')},fullReconciliation};
 }
 return {schemaVersion:1,campaignId:'model-kombat-zones-1',methodology:'mk-fifo-realized-capital-1',participant,requestId:randomUUID(),revision:priorRevision+1,periodStart:exactStart,confirmedThrough:new Date(through).toISOString(),complete:true,evidence:'Independent public chain reconstruction; entry balances, opening domain FIFO; opening '+start.number+' closing '+end.number+(unknownConsumedBuckets.size?'; Score-sufficient projection; full quantity ledger and reconciled closing balances retained in fullReconciliation.':''),openingLots:opening,events:scoringEvents,...projection};
}
module.exports={reconstruct,accountingStartMillis};
