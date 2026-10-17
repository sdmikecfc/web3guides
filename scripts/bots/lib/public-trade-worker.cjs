'use strict';
// Model Kombat's collector. No Reporter import, private Doma endpoint or trading.
const {createHash,randomUUID}=require('node:crypto');
const {serializeEvidence}=require('./worker-contract.cjs');
const CHAIN=97477, USDC='0x31eef89d5215c305304a2fa5376a1f1b6c5dc477', WETH='0x4200000000000000000000000000000000000006';
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const equivalent=(a,b)=>JSON.stringify(Object.fromEntries(Object.entries(a).sort()))===JSON.stringify(Object.fromEntries(Object.entries(b).sort()));
const address=x=>typeof x==='string'&&/^0x[0-9a-fA-F]{40}$/.test(x)?x.toLowerCase():null;
const caip=x=>address(String(x||'').replace(/^eip155:97477:/,''));
const integer=x=>{if(typeof x==='number'&&!Number.isSafeInteger(x))throw Error('UNSAFE_PUBLIC_AMOUNT');if(!/^-?\d{1,78}$/.test(String(x)))throw Error('INVALID_PUBLIC_AMOUNT');return BigInt(x);};
const abs=x=>x<0n?-x:x;
const decimal=x=>{const s=String(x);if(!/^\d+(\.\d+)?$/.test(s))throw Error('MISSING_EXECUTION_PRICE');const [a,b='']=s.split('.');return {n:BigInt(a+b),d:10n**BigInt(b.length)};};
const dollars=n=>(n/1000000n)+'.'+String(n%1000000n).padStart(6,'0');
function timestamp(x){const n=Date.parse(x);if(!Number.isFinite(n))throw Error('INVALID_SOURCE_TIME');return n;}
function receiptFlows(receipt,wallet){
 if(!receipt||!['0x1',1,'success'].includes(receipt.status))throw Error('TRANSACTION_NOT_SUCCESSFUL');
 const net=new Map();
 for(const l of receipt.logs||[]){
  if(l.removed)throw Error('REORG_LOG');
  if(l.topics?.[0]?.toLowerCase()!==TRANSFER||l.topics.length!==3)continue;
  if(!/^0x[0-9a-fA-F]{64}$/.test(l.data))throw Error('INVALID_TRANSFER_LOG');
  const from=address('0x'+l.topics[1].slice(-40)),to=address('0x'+l.topics[2].slice(-40)),token=address(l.address);
  if(!token||!from||!to)throw Error('INVALID_TRANSFER_LOG');
  const units=BigInt(l.data),delta=(to===wallet?units:0n)-(from===wallet?units:0n);
  if(delta)net.set(token,(net.get(token)||0n)+delta);
 }
 return new Map([...net].filter(([,v])=>v!==0n));
}
function normalizePublicSwap(s){
 if(s.fractionalToken?.chain?.networkId!=='eip155:97477')return null;
 const wallet=caip(s.userAddress)||caip(s.buyerAddress),domain=address(s.fractionalToken.address);
 // Currency symbols alone never establish a contract. The receipt below must
 // contain the actual registered quote contract and exact units, with any
 // routing fee independently reconciled against the executed commands.
 const quote=s.quoteToken?.symbol==='USDC.e'&&s.quoteToken.decimals===6?USDC:
  ['WETH','ETH'].includes(s.quoteToken?.symbol)&&s.quoteToken.decimals===18?WETH:null;
 if(!wallet||!domain||!quote)return null;
 const d=integer(s.fractionalTokenAmount),q=integer(s.quoteTokenAmount);
 if(!d||!q||(d>0n)===(q>0n))throw Error('INVALID_SWAP_SIGNS');
 const decimals=s.fractionalToken.params?.decimals;
 if(!Number.isInteger(decimals)||decimals<0||decimals>36)throw Error('INVALID_TOKEN_PRECISION');
 if(!/^0x[0-9a-fA-F]{64}$/.test(s.txHash))throw Error('INVALID_TRANSACTION_HASH');
 return {wallet,domain,quote,domainUnits:abs(d).toString(),quoteUnits:abs(q).toString(),side:d>0n?'buy':'sell',
  tx:s.txHash.toLowerCase(),executedAt:new Date(timestamp(s.date)).toISOString(),decimals,priceUsd:s.priceUsd,contractType:s.contractType};
}
function key(s){return [s.wallet,s.tx,s.domain,s.quote,s.side,s.domainUnits,s.quoteUnits].join(':');}
function referenceSwap(r){return {wallet:r.wallet,tx:r.transactionHash,domain:r.domainToken,quote:r.quoteToken,side:r.side,domainUnits:r.domainUnits,quoteUnits:r.quoteUnits,executedAt:r.executedAt};}
function volume(s){
 if(s.quote===USDC)return integer(s.quoteUnits); // six on-chain decimals, never a floating-point multiplication
 const price=decimal(s.priceUsd),units=integer(s.domainUnits);
 const v=units*price.n*1000000n/(10n**BigInt(s.decimals)*price.d);
 if(v<=0n)throw Error('MISSING_EXECUTION_PRICE');return v;
}
function chainMatch(s,receipt){
 const net=receiptFlows(receipt,s.wallet),d=net.get(s.domain)||0n,q=net.get(s.quote)||0n;
 if((s.side==='buy'?d:-d)!==integer(s.domainUnits)||(s.side==='buy'?-q:q)!==integer(s.quoteUnits))return false;
 // A batched transaction with several economic swaps cannot be silently
 // reduced to a single net fill. Public rows/references must be unambiguous.
 return true;
}
async function settlement(s,receipt,source){
 if(chainMatch(s,receipt))return {walletDomainUnits:s.domainUnits,walletQuoteUnits:s.quoteUnits,routerFeeUnits:'0'};
 if(source.routerSettlement)return source.routerSettlement(s,receipt);
 throw Error('NET_FILL_NEEDS_EXACT_ALLOCATION');
}
async function scanPages(fetchPage,{from,through,maxPages=1000}){
 const rows=[],seen=new Set();let params={},previous=Infinity;
 for(let i=0;i<maxPages;i++){
  const p=await fetchPage(params);
  if(!p||!Array.isArray(p.items))throw Error('PUBLIC_HISTORY_UNAVAILABLE');
  for(const r of p.items){const at=timestamp(r.timestamp);if(at>previous)throw Error('PUBLIC_HISTORY_ORDER_CHANGED');previous=at;if(at>=from&&at<=through)rows.push(r);}
  if(previous<from||!p.next_page_params)return rows;
  if(!p.items.length)throw Error('PUBLIC_HISTORY_EMPTY_PAGE');
  const cursor=hash(p.next_page_params);if(seen.has(cursor))throw Error('PUBLIC_HISTORY_CURSOR_REPEATED');seen.add(cursor);params=p.next_page_params;
 }
 throw Error('PUBLIC_HISTORY_PAGE_LIMIT');
}
// Failed accounts stay pending; independently verified accounts can publish.
function accountCoverage(snapshot,packet,problems){
 const ids=snapshot.manifest.campaign.state==='draft'?snapshot.accounts.map(a=>a.participant):snapshot.manifest.participants.map(e=>e.participant);
 const global=problems.filter(p=>!p.participant);
 return [...new Set(ids)].map(participant=>{
  const own=[...global,...problems.filter(p=>p.participant===participant)].map(p=>/^[A-Z][A-Z0-9_]{2,100}$/.test(p.code)?p.code:'SOURCE_UNAVAILABLE');
  if(!snapshot.accounts.some(a=>a.participant===participant)||!snapshot.wallets.some(w=>w.participant===participant))own.push('ACCOUNT_LINK_PENDING');
  return {participant,coverageFrom:packet.coverageFrom,confirmedThrough:packet.confirmedThrough,complete:own.length===0,problems:[...new Set(own)].sort()};
 });
}
async function collect(snapshot,source,{now=Date.now(),lookbackDays=60,concurrency=3,deadline=Infinity,walletOffset=0,onProgress=null}={}){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8||!Number.isSafeInteger(walletOffset)||walletOffset<0||!(deadline===Infinity||Number.isFinite(deadline)))throw Error('INVALID_TRADE_SCAN_OPTIONS');
 const started=Date.now(),walletTimings=[];let finishedWallets=0;
 const checkScan=()=>{if(Date.now()>=deadline)throw Error('TRADE_SCAN_TIME_BUDGET_EXCEEDED');source.checkBudget?.();};
 const c=snapshot.manifest.campaign,draft=c.state==='draft';
 const referenceStarts=snapshot.accounts.map(a=>a.reference_since).filter(Boolean).map(timestamp);
 const from=draft?Math.max(now-lookbackDays*86400000,referenceStarts.length?Math.min(...referenceStarts):-Infinity):timestamp(c.starts_at);
 const final=await source.finalized();
 let through=Math.min(now-120000,timestamp(final.timestamp),draft?Infinity:timestamp(c.ends_at));
 if(through<from)throw Error('NO_FINALIZED_COMPETITION_WINDOW');
 const problems=[],warnings=[],fills=[],raw=[],references=snapshot.references||[];
 const entries=new Map(snapshot.manifest.participants.map(e=>[e.participant,e]));
 const accounts=snapshot.accounts.filter(a=>draft||entries.has(a.participant));
 if(!draft)for(const [participant]of entries)if(!accounts.some(a=>a.participant===participant))problems.push({code:'ACCOUNT_LINK_PENDING',participant});
 // Public trades may arrive between private discovery runs. Score only through
 // the common completed cutoff; do not pretend newer Strategy intent is known.
 const savedCutoff=Date.parse(c.confirmed_through||'');
 const coverageReady=(account,minimum)=>{
  const cv=account.coverage,required=Math.max(from,draft?(account.reference_since?timestamp(account.reference_since):from):timestamp(entries.get(account.participant).entered_at));
  return cv?.complete===true&&Date.parse(cv.coverage_from)<=required
   &&Date.parse(cv.confirmed_through)>=Math.max(required,minimum)&&Date.parse(cv.confirmed_through)<=now;
 };
 // A delayed discovery heartbeat does not invalidate its completed historical
 // window. Never pretend newer Strategy intent is known by advancing to now.
 const readyCoverage=accounts.filter(a=>coverageReady(a,Number.isFinite(savedCutoff)?savedCutoff:from));
 if(!readyCoverage.length)throw Error('PRIVATE_COVERAGE_PENDING');
 through=Math.min(through,...readyCoverage.map(a=>timestamp(a.coverage.confirmed_through)));
 if(readyCoverage.some(a=>!Number.isFinite(Date.parse(a.coverage.updated_at))||now-Date.parse(a.coverage.updated_at)>5*3600000||Date.parse(a.coverage.updated_at)>now))warnings.push('Trading updates are delayed. Verified historical results remain available through the last completed source window.');
 if(through<from)throw Error('PRIVATE_COVERAGE_BEFORE_COMPETITION');
 const registryWallets=snapshot.wallets.filter(w=>accounts.some(a=>a.participant===w.participant));
 const offset=walletOffset%Math.max(1,registryWallets.length),wallets=[...registryWallets.slice(offset),...registryWallets.slice(0,offset)];
 let nextWalletOffset=offset,startedWallets=0;
 const markets=new Set(snapshot.manifest.markets.map(m=>m.domain_token+':'+m.quote_token));
 const indexed=await source.indexStatus(final);
 if(!indexed)problems.push({code:'PUBLIC_INDEX_INCOMPLETE'});
 const receiptCache=new Map(),blockCache=new Map();
 async function receipt(tx){if(!receiptCache.has(tx))receiptCache.set(tx,Promise.resolve().then(()=>source.receipt(tx)));return receiptCache.get(tx);}
 async function block(n){if(!blockCache.has(n))blockCache.set(n,Promise.resolve().then(()=>source.block(n)));return blockCache.get(n);}
 for(const account of accounts){
  if(!coverageReady(account,through))
   problems.push({code:'STRATEGY_COVERAGE_PENDING',participant:account.participant});
 }
 const processed=new Set(),txCounts=new Map(),unverified=new Set();
 async function scanWallet(w){
  if(problems.some(p=>p.participant===w.participant&&p.code==='STRATEGY_COVERAGE_PENDING'))return;
  checkScan();
  const account=accounts.find(a=>a.participant===w.participant);
  const required=Math.max(from,draft?(account.reference_since?timestamp(account.reference_since):from):timestamp(entries.get(w.participant).entered_at));
  const refs=references.filter(x=>x.participant===w.participant&&x.ref.wallet===w.trade_wallet&&timestamp(x.ref.executedAt)>=required&&timestamp(x.ref.executedAt)<=through);
  const strategyTransactions=new Set(refs.filter(x=>x.ref.status==='verified').map(x=>x.ref.transactionHash));
  // Complete private discovery establishes eligible Strategy intent. Manual
  // activity on a non-agent wallet is not eligible; its balance history is
  // independently reconstructed by accounting, not the volume collector.
  if(!w.agent&&!strategyTransactions.size)return;
  let swaps,history;const discoversCandidates=w.agent&&typeof source.tradeCandidates==='function';
  try{
   // Receipt discovery is wallet-wide, so a keeper's origin address cannot hide
   // an external-wallet Strategy execution from the completeness check.
   // Independent reads share the source's bounded request gate. Join both
   // before finishing this wallet, including failure, to avoid orphan requests.
   const reads=await Promise.allSettled([w.agent?(discoversCandidates?source.tradeCandidates(w.trade_wallet,required,through):source.transfers(w.trade_wallet,required,through)):Promise.resolve([]),(async()=>{
    for(let attempt=0;;attempt++){checkScan();try{return await source.swaps(w.trade_wallet,required,through);}
     catch(e){if(e.message!=='SWAP_INDEX_CHANGED'||attempt>=2)throw e;}}
   })()]);
   const failed=reads.find(r=>r.status==='rejected');if(failed)throw failed.reason;
   [history,swaps]=reads.map(r=>r.value);
  }catch(e){problems.push({code:e.message,participant:w.participant});return;}
  const local=[];
  for(const row of swaps){if(!w.agent&&!strategyTransactions.has(String(row.txHash).toLowerCase()))continue;try{const s=normalizePublicSwap(row);if(s&&s.wallet===w.trade_wallet&&timestamp(s.executedAt)>=required&&timestamp(s.executedAt)<=through)local.push(s);}catch(e){problems.push({code:e.message,participant:w.participant});}}
  const grouped=new Map();for(const s of local){const k=key(s);grouped.set(k,[...(grouped.get(k)||[]),s]);txCounts.set(s.tx+':'+s.wallet,(txCounts.get(s.tx+':'+s.wallet)||0)+1);}
  // Direct receipt verification supplies Strategy fills omitted by a wallet API
  // query. It never assumes the keeper's entire transaction belongs to a player.
  for(const {ref:r} of refs){if(r.status!=='verified')continue;const s=referenceSwap(r);if(!grouped.has(key(s)))grouped.set(key(s),[s]);}
  const smartProofs=new Map();
  function missingMarket(s,quotes=[s.quote]){
   const missing=quotes.filter(quote=>!markets.has(s.domain+':'+quote));if(!missing.length)return false;
   // Identity discovery can lag a legitimate eligible trade. Keep its owner
   // pending with exact private repair details; never confirm a silent zero.
   unverified.add(s.tx+':'+w.trade_wallet);
   problems.push({code:'MARKET_REGISTRY_MISSING',participant:w.participant,transactionHash:s.tx,domainToken:s.domain,quoteTokens:missing});return true;
  }
  if(w.agent&&source.smartWalletSettlement){
   const transactions=new Map();for(const rows of grouped.values())for(const s of rows)transactions.set(s.tx,[...(transactions.get(s.tx)||[]),s]);
   for(const [tx,rows]of transactions){
    checkScan();
    try{const proof=await source.smartWalletSettlement(local.filter(s=>s.tx===tx));if(!proof)continue;
     const intent=refs.filter(x=>x.ref.status==='verified'&&x.ref.transactionHash===tx);
     // A leg-level private reference does not establish the intent of the
     // entire aggregate route. Preserve attribution or explicitly leave it pending.
     if(intent.length&&(intent.length!==1||key(referenceSwap(intent[0].ref))!==key(proof.swap)))throw Error('SMART_ROUTER_STRATEGY_ATTRIBUTION_REVIEW_REQUIRED');
     for(const s of rows)grouped.delete(key(s));
     const k=key(proof.swap);grouped.set(k,[proof.swap]);smartProofs.set(k,proof);
    }catch(e){for(const s of rows)grouped.delete(key(s));unverified.add(tx+':'+w.trade_wallet);problems.push({code:e.message,participant:w.participant,transactionHash:tx});}
   }
  }
  if(source.orderRouterSettlement){
   const transactions=new Map();for(const rows of grouped.values())for(const s of rows)transactions.set(s.tx,[...(transactions.get(s.tx)||[]),s]);
   for(const [tx,rows]of transactions){
    checkScan();
    const intent=refs.filter(x=>x.ref.status==='verified'&&x.ref.transactionHash===tx).map(x=>x.ref);
    if(!w.agent&&!intent.length)continue; // manual activity is accounting-only
    try{const proof=await source.orderRouterSettlement(local.filter(s=>s.tx===tx),intent);if(!proof)continue;
     // Both the actual domain/WETH pool and canonical domain/USDC economic
     // quote must be registered. The quote-only conversion is never a fill.
     if(missingMarket(proof.swap,[WETH,USDC])){for(const s of rows)grouped.delete(key(s));continue;}
     for(const s of rows)grouped.delete(key(s));const k=key(proof.swap);grouped.set(k,[proof.swap]);smartProofs.set(k,proof);
    }catch(e){for(const s of rows)grouped.delete(key(s));unverified.add(tx+':'+w.trade_wallet);problems.push({code:e.message,participant:w.participant,transactionHash:tx});}
   }
  }
  for(const [k,rows] of grouped){
   checkScan();
   const s=rows[0],matching=refs.filter(x=>key(referenceSwap(x.ref))===k),valid=matching.filter(x=>x.ref.status==='verified');
   if(!w.agent&&valid.length===0)continue;
   if(missingMarket(s))continue;
   if(rows.length!==1||valid.length>1){problems.push({code:'AMBIGUOUS_ECONOMIC_FILL',participant:w.participant});continue;}
   try{
    const rc=await receipt(s.tx);if(!rc||BigInt(rc.blockNumber)>BigInt(final.number))throw Error('TRANSACTION_NOT_FINALIZED');
    const b=await block(rc.blockNumber);if(b.hash.toLowerCase()!==rc.blockHash.toLowerCase())throw Error('TRANSACTION_REORG');
    if(timestamp(b.timestamp)!==timestamp(s.executedAt))throw Error('SETTLEMENT_TIME_MISMATCH');
    const smart=smartProofs.get(k),amounts=smart?smart.amounts:await settlement(s,rc,source);
    if(!smart&&(txCounts.get(s.tx+':'+s.wallet)||0)>1)throw Error('MULTI_FILL_TRANSACTION_REQUIRES_REVIEW');
    // References corroborate execution intent; the chain independently proves
    // amounts. For WETH, a historical public execution quote is also required.
    const usd=smart?smart.volumeMicros:volume(s);if(usd<=0n)throw Error('VOLUME_BELOW_PRECISION');
    const economicId='public:'+hash([CHAIN,s.wallet,s.tx,s.domain,s.quote]).slice(0,56);
    if(processed.has(economicId))throw Error('DUPLICATE_ECONOMIC_FILL');processed.add(economicId);
    const proof={version:2,blockHash:rc.blockHash,blockNumber:rc.blockNumber,source:'public_receipt',strategy:valid[0]?.ref.id||null,strategyRevision:valid[0]?.ref.revision||null,...amounts};
    const fill={chainId:CHAIN,economicId,revision:1,wallet:s.wallet,transactionHash:s.tx,domainToken:s.domain,quoteToken:s.quote,executedAt:s.executedAt,volumeUsd:dollars(usd),source:valid.length?'strategy':'agent_wallet',status:'verified',evidence:serializeEvidence(proof)};
    fills.push(fill);raw.push({...s,...amounts,participant:w.participant,economicId,volumeUsd:fill.volumeUsd});
   }catch(e){unverified.add(s.tx+':'+s.wallet);problems.push({code:e.message,participant:w.participant,transactionHash:s.tx});}
  }
  // Discovery includes every asset. A quote-only candidate may hide a domain
  // leg omitted by the raw log query, so every unindexed transaction still
  // needs a complete receipt before this owner can be called fully scanned.
  if(w.agent){const domains=new Set(snapshot.manifest.markets.map(m=>m.domain_token)),candidates=new Map();
   for(const item of history){
    const candidate=discoversCandidates?item:{transactionHash:item.transaction_hash,blockNumber:item.block_number??null,blockHash:item.block_hash??null};
    const tx=candidate?.transactionHash;
    if(typeof tx!=='string'||!/^0x[0-9a-f]{64}$/.test(tx)
     ||(discoversCandidates&&(!/^0x[0-9a-f]+$/.test(candidate.blockNumber)||!/^0x[0-9a-f]{64}$/.test(candidate.blockHash)||!Array.isArray(candidate.tokens)||!candidate.tokens.length||candidate.tokens.some(t=>!address(t)||address(t)!==t))))throw Error('AGENT_CANDIDATE_INVALID');
    const prior=candidates.get(tx);if(prior&&(prior.blockNumber!==candidate.blockNumber||prior.blockHash!==candidate.blockHash))throw Error('AGENT_CANDIDATE_RECEIPT_MISMATCH');candidates.set(tx,candidate);
   }
   for(const [tx,candidate] of candidates){checkScan();if(local.some(s=>s.tx===tx)||fills.some(f=>f.transactionHash===tx&&f.wallet===w.trade_wallet))continue;
    try{
     const rc=await receipt(tx);
     if(!rc||BigInt(rc.blockNumber)>BigInt(final.number))throw Error('TRANSACTION_NOT_FINALIZED');
     if(((discoversCandidates||rc.transactionHash!=null)&&rc.transactionHash?.toLowerCase()!==tx)
      ||(candidate.blockNumber!=null&&BigInt(candidate.blockNumber)!==BigInt(rc.blockNumber))
      ||(candidate.blockHash!=null&&candidate.blockHash.toLowerCase()!==rc.blockHash?.toLowerCase()))throw Error('AGENT_CANDIDATE_RECEIPT_MISMATCH');
     const b=await block(rc.blockNumber);if(b.hash.toLowerCase()!==rc.blockHash.toLowerCase())throw Error('TRANSACTION_REORG');
     if(timestamp(b.timestamp)<required||timestamp(b.timestamp)>through)throw Error('AGENT_CANDIDATE_OUTSIDE_WINDOW');
     const net=receiptFlows(rc,w.trade_wallet);
     if(discoversCandidates){
      const receiptTokens=new Set((rc.logs||[]).filter(l=>l.topics?.[0]?.toLowerCase()===TRANSFER&&l.topics.length===3&&[l.topics[1],l.topics[2]].some(t=>address('0x'+t.slice(-40))===w.trade_wallet)).map(l=>address(l.address)));
      if(candidate.tokens.some(t=>!receiptTokens.has(t)))throw Error('AGENT_CANDIDATE_RECEIPT_MISMATCH');
     }
     const ds=[...net].filter(([token])=>domains.has(token)),qs=[...net].filter(([token])=>[USDC,WETH].includes(token));
     if(ds.some(([,d])=>qs.some(([,q])=>(d>0n)!==(q>0n))))problems.push({code:'AGENT_SWAP_MISSING_FROM_PUBLIC_INDEX',participant:w.participant,transactionHash:tx});
    }catch(e){problems.push({code:e.message,participant:w.participant,transactionHash:tx});}
   }
  }
 }
 // Multiple wallets share one rate-limited source. A wallet failure never
 // cancels the other accounts; only fully scanned owners may advance.
 let nextWallet=0;
 const workers=await Promise.allSettled(Array.from({length:Math.min(concurrency,wallets.length)},async()=>{
  while(nextWallet<wallets.length){const index=nextWallet++,w=wallets[index],start=Date.now();
   if(start<deadline){nextWalletOffset=(offset+index+1)%Math.max(1,wallets.length);startedWallets++;}
   try{await scanWallet(w);}catch(e){problems.push({code:e.message,participant:w.participant});}
   walletTimings.push({participant:w.participant,wallet:w.trade_wallet,elapsedMs:Date.now()-start});finishedWallets++;
   if(onProgress)await onProgress({finishedWallets,totalWallets:wallets.length,verifiedFills:fills.length,elapsedMs:Date.now()-started});
  }
 }));
 const failedWorker=workers.find(r=>r.status==='rejected');if(failedWorker)throw failedWorker.reason;
 // Completion order cannot change proof fingerprints or correction revisions.
 fills.sort((a,b)=>a.economicId.localeCompare(b.economicId));raw.sort((a,b)=>a.economicId.localeCompare(b.economicId));
 problems.sort((a,b)=>String(a.participant||'').localeCompare(String(b.participant||''))||String(a.code).localeCompare(String(b.code)));
 const existing=snapshot.fills||[],updated=[];
 for(const f of fills){const old=existing.find(x=>x.economicId===f.economicId&&x.chainId===f.chainId);if(old){f.revision=old.revision; if(!equivalent({...old,revision:0},{...f,revision:0}))f.revision=old.revision+1;}updated.push(f);}
 if(existing.some(f=>!f.economicId.startsWith('public:')&&f.status==='verified'))problems.push({code:'LEGACY_FEED_RECONCILIATION_REQUIRED'});
 const scopes=accountCoverage(snapshot,{coverageFrom:new Date(from).toISOString(),confirmedThrough:new Date(through).toISOString()},problems);
 const completeAccounts=new Set(scopes.filter(s=>s.complete).map(s=>s.participant));
 // Reconcile each complete account independently. A failed account keeps its
 // prior fills pending; it cannot prevent another account's valid correction.
 for(const old of existing){if(!old.economicId.startsWith('public:')||old.status==='revoked'||fills.some(f=>f.economicId===old.economicId))continue;
  const owners=snapshot.wallets.filter(w=>w.trade_wallet===old.wallet).map(w=>w.participant);
  if(owners.length!==1||!completeAccounts.has(owners[0]))continue;
  updated.push({...old,revision:old.revision+1,status:'revoked'});
 }
 warnings.push('ROI/profit pending: complete opening cost basis, quote capital, transfers and LP reconciliation must be independently evidenced. Trade receipts alone are insufficient.');
 const packet={schemaVersion:1,rules:'mk-token-zones-1',campaignId:c.id,requestId:randomUUID(),coverageFrom:new Date(from).toISOString(),confirmedThrough:new Date(through).toISOString(),complete:problems.length===0&&scopes.every(s=>s.complete),financialComplete:false,financials:[],fills:updated};
 const counts={accounts:accounts.length,wallets:wallets.length,verifiedFills:fills.length,volumeUsd:dollars(fills.reduce((n,f)=>n+decimal(f.volumeUsd).n*1000000n/decimal(f.volumeUsd).d,0n)),strategyFills:fills.filter(f=>f.source==='strategy').length,agentFills:fills.filter(f=>f.source==='agent_wallet').length};
 const report={checkedAt:new Date(now).toISOString(),state:c.state,coverageFrom:packet.coverageFrom,confirmedThrough:packet.confirmedThrough,complete:packet.complete,financialComplete:false,counts,problems,warnings};
 return {packet,report,raw,accountCoverage:scopes,diagnostics:{elapsedMs:Date.now()-started,walletTimings,source:source.metrics?.()||null,nextWalletOffset,startedWallets,marketRegistryMissing:problems.filter(p=>p.code==='MARKET_REGISTRY_MISSING')}};
}
module.exports={collect,scanPages,normalizePublicSwap,receiptFlows,chainMatch,settlement,volume,key,referenceSwap,hash,integer,CHAIN,USDC,WETH,TRANSFER,accountCoverage};
