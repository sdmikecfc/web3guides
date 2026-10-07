'use strict';
// Reconstruct a complete supported-asset ledger on our host. Unknown basis and
// contract flows are explicit failures, never deposits with an invented cost.
const {randomUUID}=require('node:crypto');
const {normalizePublicSwap,receiptFlows,settlement,key,referenceSwap,USDC,WETH,TRANSFER}=require('./public-trade-worker.cjs');
const {NATIVE}=require('./public-native-accounting.cjs');
const usd=n=>(n/1000000n)+'.'+String(n%1000000n).padStart(6,'0');
const micros=s=>{if(!/^\d+\.\d{6}$/.test(s))throw Error('ACCOUNTING_VALUE_INVALID');return BigInt(s.replace('.',''));};
const abs=n=>n<0n?-n:n;
function disposesExternalAsset(receipt,walletSet){return (receipt.logs||[]).some(l=>l.topics?.[0]===TRANSFER&&l.topics.length>=3&&walletSet.has(('0x'+l.topics[1].slice(-40)).toLowerCase())&&!walletSet.has(('0x'+l.topics[2].slice(-40)).toLowerCase())&&(l.topics.length===4||BigInt(l.data)!==0n));}
async function reconstruct({participant,wallets,from,through,markets,references=[],eligible=[],source,priorRevision=0}){
 const check=()=>source.checkBudget?.();check();
 const supported=new Set([...markets.flatMap(m=>[m.domain_token,m.quote_token]),NATIVE]),walletSet=new Set(wallets);
 const valueUsd=(token,qty,at)=>qty===0n?Promise.resolve(0n):source.valueUsd(token===NATIVE?WETH:token,qty,at);
 const chainBalance=(wallet,token,at)=>token===NATIVE?source.nativeBalance(wallet,at):source.balance(wallet,token,at);
 const start=await source.blockAt(from-1),end=await source.blockAt(through),all=new Map(),publicSwaps=new Map(),indexedSwaps=new Map();
 for(const wallet of wallets){check();await source.primeBalances?.(wallet,[...supported].filter(t=>t!==NATIVE),start.number);await source.primeBalances?.(wallet,[...supported].filter(t=>t!==NATIVE),end.number);}
 for(const wallet of wallets){
  check();
  // A complete lifetime transfer history establishes FIFO basis. Missing
  // pagination or unpriced flows throws before any accounting snapshot is sent.
  const transfers=await source.transfers(wallet,0,through);
  for(const t of transfers){const token=t.token?.address_hash?.toLowerCase();if(supported.has(token))all.set(t.transaction_hash,{tx:t.transaction_hash,at:Date.parse(t.timestamp)});}
  for(const s of await source.swaps(wallet,0,through)){const n=normalizePublicSwap(s);if(n&&n.wallet===wallet){if(indexedSwaps.has(key(n)))throw Error('ACCOUNTING_DUPLICATE_INDEX_ROW');publicSwaps.set(key(n),n);indexedSwaps.set(key(n),n);}}
  if(source.nativeHistory&&source.nativeTransaction){for(const t of await source.nativeHistory(wallet,through))all.set(t.tx,t);}
  else if(await source.nativeBalance(wallet,start.number)!==0n||await source.nativeBalance(wallet,end.number)!==0n||await source.hasNativeActivity(wallet,through))throw Error('NATIVE_CAPITAL_LEDGER_REQUIRED');
 }
 for(const {ref}of references)if(ref.status==='verified'&&walletSet.has(ref.wallet)&&Date.parse(ref.executedAt)<=through){const r=referenceSwap(ref);if(!publicSwaps.has(key(r)))publicSwaps.set(key(r),r);}
 const events=[],lots=[],opening=[],tokens=new Set();let order=0,opened=false;
 const balances=new Map();
 function replay(e){
  check();
  const qty=BigInt(e.units);tokens.add(e.token);const bucket=e.wallet+':'+e.token;
  if(['in','buy'].includes(e.kind)){
   balances.set(bucket,(balances.get(bucket)||0n)+qty);
   lots.push({id:e.id,wallet:e.wallet,token:e.token,units:qty,cost:micros(e.kind==='in'?e.costUsd:e.usd),acquiredAt:e.executedAt});return;
  }
  balances.set(bucket,(balances.get(bucket)||0n)-qty);let need=qty;
  for(const l of lots.filter(l=>l.wallet===e.wallet&&l.token===e.token&&l.units>0n).sort((a,b)=>a.acquiredAt.localeCompare(b.acquiredAt)||a.id.localeCompare(b.id))){
   check();
   const take=need<l.units?need:l.units,cost=take===l.units?l.cost:l.cost*take/l.units;
   l.units-=take;l.cost-=cost;need-=take;
   if(e.kind==='transfer')lots.push({...l,id:e.id+':'+l.id,wallet:e.toWallet,units:take,cost});
   if(!need)break;
  }
  if(need)throw Error('HISTORICAL_COST_BASIS_MISSING');
  if(e.kind==='transfer')balances.set(e.toWallet+':'+e.token,(balances.get(e.toWallet+':'+e.token)||0n)+qty);
 }
 async function captureOpening(){if(opened)return;opened=true;
  for(const l of lots.filter(l=>l.units>0n)){check();const value=await valueUsd(l.token,l.units,start.number);opening.push({id:l.id,wallet:l.wallet,token:l.token,units:l.units.toString(),costUsd:usd(l.cost),valueUsd:usd(value),acquiredAt:l.acquiredAt,evidence:'Public lifetime transfers/FIFO; opening finalized block '+start.number});}
  for(const wallet of wallets)for(const token of supported){check();if(await chainBalance(wallet,token,start.number)!==(balances.get(wallet+':'+token)||0n))throw Error(token===NATIVE?'NATIVE_OPENING_BALANCE_MISMATCH':'OPENING_BALANCE_MISMATCH');}
 }
 function event(tx,at,body){return {id:'chain:'+tx+':'+order,executedAt:new Date(at).toISOString(),order:order++,evidence:'Finalized public receipt '+tx,...body};}
 const transactions=[];for(const t of all.values()){check();const receipt=await source.receipt(t.tx);transactions.push({...t,receipt});}
 transactions.sort((a,b)=>Number(BigInt(a.receipt.blockNumber)-BigInt(b.receipt.blockNumber))||Number(BigInt(a.receipt.transactionIndex)-BigInt(b.receipt.transactionIndex)));
 for(const t of transactions){
  check();
  if(t.at>=from)await captureOpening();
  const receipt=t.receipt,block=await source.block(receipt.blockNumber);
  if(block.hash!==receipt.blockHash||Date.parse(block.timestamp)!==t.at||BigInt(receipt.blockNumber)>BigInt(end.number))throw Error('ACCOUNTING_RECEIPT_MISMATCH');
  const batch=[],matched=new Set(),native=source.nativeTransaction?await source.nativeTransaction(t.tx,receipt):{moves:[],fee:0n,payer:null};
  const successful=receipt.status==='0x1';
  if(!successful&&receipt.status!=='0x0')throw Error('ACCOUNTING_RECEIPT_STATUS_INVALID');
  const nativePurchase=successful&&source.nativeRouterPurchase?await source.nativeRouterPurchase(t.tx,receipt,native,wallets):null;
  const paidGas=walletSet.has(native.payer)?native.fee:0n;
  const gasUsd=paidGas?await valueUsd(NATIVE,paidGas,receipt.blockNumber):0n;
  if(nativePurchase){
   const p=nativePurchase;
   const quoteConversion=p.kind==='quote_conversion'&&p.token===USDC;
   if(!walletSet.has(p.wallet)||!supported.has(p.token)||(!quoteConversion&&[USDC,WETH,NATIVE].includes(p.token))||wallets.some(w=>w!==p.wallet&&receiptFlows(receipt,w).size))throw Error('NATIVE_PURCHASE_ACCOUNT_MISMATCH');
   const cost=await valueUsd(NATIVE,BigInt(p.nativeSpent),receipt.blockNumber);
   const eligibleFill=quoteConversion?null:eligible.find(f=>f.wallet===p.wallet&&f.transactionHash===t.tx&&f.domainToken===p.token&&f.quoteToken===p.domainQuoteToken);
   batch.push(event(t.tx,t.at,{wallet:p.wallet,token:NATIVE,units:p.nativeSpent,kind:'out'}));
   if(paidGas)batch.push(event(t.tx,t.at,{wallet:native.payer,token:NATIVE,units:paidGas.toString(),kind:'out'}));
   batch.push(event(t.tx,t.at,{wallet:p.wallet,token:p.token,units:p.units,kind:'buy',usd:usd(cost+(native.payer===p.wallet?gasUsd:0n)),...(eligibleFill?{economicId:eligibleFill.economicId,notionalUsd:eligibleFill.volumeUsd}:{})}));
   for(const e of batch){replay(e);if(t.at>=from)events.push(e);}
   continue;
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
   if(!flows.size)continue;
   let swaps=[...publicSwaps.values()].filter(s=>s.tx===t.tx&&s.wallet===wallet);
   const smart=swaps.length&&source.smartWalletSettlement?await source.smartWalletSettlement([...indexedSwaps.values()].filter(s=>s.tx===t.tx&&s.wallet===wallet)):null;
   if(smart)swaps=[smart.swap];
   if(swaps.length>1)throw Error('ACCOUNTING_MULTI_FILL_ALLOCATION_REQUIRED');
   if(swaps.length){const s=swaps[0];if(flows.size!==2)throw Error('ACCOUNTING_COMPLEX_SWAP');
    const amounts=smart?smart.amounts:await settlement(s,receipt,source);
    const money=s.quote===USDC?BigInt(amounts.walletQuoteUnits):await valueUsd(s.quote,BigInt(amounts.walletQuoteUnits),receipt.blockNumber);
    const costGas=wallet===native.payer?gasUsd:0n;
    if(s.side==='sell'&&money<costGas)throw Error('GAS_EXCEEDS_SWAP_PROCEEDS');
    const netMoney=s.side==='buy'?money+costGas:money-costGas;
    const f=eligible.find(f=>f.wallet===wallet&&f.transactionHash===t.tx&&f.domainToken===s.domain&&f.quoteToken===s.quote);
    batch.push(event(t.tx,t.at,{wallet,token:s.domain,units:amounts.walletDomainUnits,kind:s.side==='buy'?'buy':'sell',usd:usd(netMoney),...(f?{economicId:f.economicId,notionalUsd:f.volumeUsd}:{})}));
    batch.push(event(t.tx,t.at,{wallet,token:s.quote,units:amounts.walletQuoteUnits,kind:s.side==='buy'?'out':'buy',...(s.side==='sell'?{usd:usd(money)}:{})}));
    continue;
   }
   // Non-swap token movements must be a simple evidenced transfer. LP,
   // router and contract interactions cannot masquerade as withdrawals.
   for(const [token,delta]of flows){const marker=wallet+':'+token;if(matched.has(marker))continue;
    const counter=wallets.find(w=>w!==wallet&&(receiptFlows(receipt,w).get(token)||0n)===-delta);
    if(counter){const fromWallet=delta<0n?wallet:counter,toWallet=delta<0n?counter:wallet;
     matched.add(wallet+':'+token);matched.add(counter+':'+token);batch.push(event(t.tx,t.at,{wallet:fromWallet,toWallet,token,units:abs(delta).toString(),kind:'transfer'}));continue;
    }
    const tokenLogs=(receipt.logs||[]).filter(l=>l.address.toLowerCase()===token&&l.topics?.length===3);
    const endpoints=tokenLogs.filter(l=>('0x'+l.topics[delta>0n?2:1].slice(-40)).toLowerCase()===wallet).map(l=>('0x'+l.topics[delta>0n?1:2].slice(-40)).toLowerCase());
    if(delta>0n&&![USDC,WETH].includes(token))throw Error('EXTERNAL_DOMAIN_COST_BASIS_REQUIRED');
    if(delta>0n){
     // A pure quote deposit has known USD value, even when sent by a funding
     // contract. Do not mislabel a token/NFT disposal or redemption as funding.
     if(disposesExternalAsset(receipt,walletSet)||native.moves.some(m=>walletSet.has(m.from)&&!walletSet.has(m.to)))throw Error('QUOTE_DEPOSIT_EXCHANGE_REVIEW_REQUIRED');
    }else if(endpoints.length!==1||await source.hasCode(endpoints[0],receipt.blockNumber))throw Error('UNSUPPORTED_CONTRACT_OR_LP_FLOW');
    const money=delta>0n?await valueUsd(token,delta,receipt.blockNumber):0n;
    batch.push(event(t.tx,t.at,{wallet,token,units:abs(delta).toString(),kind:delta>0n?'in':'out',...(delta>0n?{usd:usd(money),costUsd:usd(money)}:{})}));
   }
  }
  for(const e of batch){replay(e);if(t.at>=from)events.push(e);}
 }
 await captureOpening();
 for(const wallet of wallets)for(const token of supported){check();if(await chainBalance(wallet,token,end.number)!==(balances.get(wallet+':'+token)||0n))throw Error(token===NATIVE?'NATIVE_CLOSING_BALANCE_MISMATCH':'CLOSING_BALANCE_MISMATCH');}
 if(eligible.some(f=>!events.some(e=>e.economicId===f.economicId)))throw Error('ACCOUNTING_FILL_MISSING');
 return {schemaVersion:1,campaignId:'model-kombat-zones-1',methodology:'mk-fifo-realized-capital-1',participant,requestId:randomUUID(),revision:priorRevision+1,periodStart:new Date(from).toISOString(),confirmedThrough:new Date(through).toISOString(),complete:true,evidence:'Independent public chain reconstruction; opening '+start.number+' closing '+end.number,openingLots:opening,events};
}
module.exports={reconstruct};
