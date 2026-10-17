'use strict';
const assert=require('node:assert/strict'),{reconstruct}=require('./lib/public-accounting.cjs'),{TRANSFER,USDC}=require('./lib/public-trade-worker.cjs');
const addr=n=>'0x'+String(n).padStart(40,'0'),wallet=addr(1),token=addr(2),pool=addr(3),outside=addr(4),topic=a=>'0x'+a.slice(2).padStart(64,'0');
const log=(token,from,to,qty)=>({address:token,topics:[TRANSFER,topic(from),topic(to)],data:'0x'+BigInt(qty).toString(16).padStart(64,'0')});
const time=n=>new Date(Date.UTC(2026,9,1,0,0,n)).toISOString();
function fixture(){
 const transactions=[
  {at:10,logs:[log(USDC,outside,wallet,100000000)]},
  {at:20,logs:[log(USDC,wallet,pool,10000000),log(token,pool,wallet,10000000)]},
  {at:40,logs:[log(token,wallet,pool,10000000),log(USDC,pool,wallet,12000000)]}
 ].map((t,i)=>({...t,hash:'0x'+String(i+1).repeat(64),block:'0x'+String(i+10),blockHash:'0x'+String(i+4).repeat(64)}));
 const rows=transactions.slice(1).map((t,i)=>({txHash:t.hash,date:time(t.at),userAddress:wallet,buyerAddress:wallet,originAddress:wallet,contractType:'UNISWAP_V3_POOL',fractionalToken:{address:token,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:'USDC.e',decimals:6},fractionalTokenAmount:i===0?'10000000':'-10000000',quoteTokenAmount:i===0?'-10000000':'12000000',priceUsd:i===0?1:1.2}));
 const source={
  transfers:async()=>transactions.flatMap(t=>t.logs.map(l=>({token:{address_hash:l.address},transaction_hash:t.hash,timestamp:time(t.at)}))),
  swaps:async()=>rows,blockAt:async t=>({number:t<Date.parse(time(30))?'0x11':'0x20'}),
  nativeBalance:async()=>0n,hasNativeActivity:async()=>false,
  receipt:async tx=>{const t=transactions.find(t=>t.hash===tx);return {status:'0x1',blockNumber:t.block,transactionIndex:'0x0',blockHash:t.blockHash,logs:t.logs};},
  block:async n=>{const t=transactions.find(t=>t.block===n);return {hash:t.blockHash,timestamp:time(t.at)};},
  hasCode:async()=>false,valueUsd:async(t,n)=>n,
  balance:async(w,t,at)=>at==='0x11'?(t===USDC?90000000n:10000000n):(t===USDC?102000000n:0n),
 };
 const options={participant:'123',wallets:[wallet],from:Date.parse(time(30)),through:Date.parse(time(50)),markets:[{domain_token:token,quote_token:USDC}],eligible:[{economicId:'sale',wallet,transactionHash:transactions[2].hash,domainToken:token,quoteToken:USDC,volumeUsd:'12.000000',executedAt:time(40)}],source};
 return {options,source,transactions};
}
async function main(){let f=fixture(),r=await reconstruct(f.options);
 assert.equal(r.openingLots.length,2);assert.equal(r.openingLots.find(l=>l.token===token).costUsd,'10.000000');assert.equal(r.openingLots.find(l=>l.token===USDC).units,'90000000');assert.equal(r.events.length,2);assert.equal(r.events[0].economicId,'sale');assert.equal(r.events[0].usd,'12.000000');
 // Public swap units exclude the router fee; cost and proceeds must follow the
 // independently reconciled wallet amount, while scored volume stays separate.
 f=fixture();f.transactions[1].logs[0]=log(USDC,wallet,pool,10100000);f.transactions[2].logs[1]=log(USDC,pool,wallet,11900000);
 f.source.routerSettlement=async(s)=>({walletDomainUnits:s.domainUnits,walletQuoteUnits:s.side==='buy'?'10100000':'11900000',routerFeeUnits:'100000'});
 f.source.balance=async(w,t,at)=>at==='0x11'?(t===USDC?89900000n:10000000n):(t===USDC?101800000n:0n);
 r=await reconstruct(f.options);assert.equal(r.openingLots.find(l=>l.token===token).costUsd,'10.100000');assert.equal(r.events[0].usd,'11.900000');assert.equal(r.events[0].notionalUsd,'12.000000');assert.equal(r.events[1].units,'11900000');
 f=fixture();f.source.hasCode=async()=>true;r=await reconstruct(f.options);assert.equal(r.openingLots.find(l=>l.token===USDC).units,'90000000','pure quote funding may originate from a contract');
 // Earlier quote funding provenance is irrelevant once its exact entry-block
 // balance/value is evidenced; the same unexplained exchange after entry fails.
 f=fixture();f.transactions[0].logs.push(log(addr(9),wallet,outside,1));r=await reconstruct(f.options);assert.equal(r.openingLots.find(l=>l.token===USDC).units,'90000000');
 f=fixture();f.transactions[2].block='0x30';f.transactions.push({at:35,hash:'0x'+'9'.repeat(64),block:'0x20',blockHash:'0x'+'8'.repeat(64),logs:[log(USDC,outside,wallet,1000000),log(addr(9),wallet,outside,1)]});await assert.rejects(()=>reconstruct(f.options),/QUOTE_DEPOSIT_EXCHANGE_REVIEW_REQUIRED/);
 f=fixture();f.source.nativeBalance=async()=>1n;await assert.rejects(()=>reconstruct(f.options),/NATIVE_CAPITAL_LEDGER_REQUIRED/);
 f=fixture();const priorBalance=f.source.balance;f.source.balance=async(w,t,at)=>t===token&&at==='0x11'?11000000n:priorBalance(w,t,at);await assert.rejects(()=>reconstruct(f.options),/OPENING_BALANCE_MISMATCH/);
 f=fixture();f.transactions[0].logs=[log(token,outside,wallet,100000000)];await assert.rejects(()=>reconstruct(f.options),/OPENING_BALANCE_MISMATCH/);
 f=fixture();f.transactions[0].logs.push(log(token,outside,wallet,100000000));const evidencedBalance=f.source.balance;f.source.balance=async(w,t,at)=>t===token?(at==='0x11'?110000000n:100000000n):evidencedBalance(w,t,at);await assert.rejects(()=>reconstruct(f.options),/ACCOUNTING_OPENING_BASIS_REQUIRED/,'a surviving unexplained lot cannot fund a scored sale');
 await concurrentReadChecks();
 await unregisteredAssetChecks();
 console.log('PASS independent accounting reconstruction: public FIFO history, fee-inclusive cost, quote funding, balance reconciliation, and rejection of unknown basis or unsupported exchange flows.');
}
async function unregisteredAssetChecks(){
 const f=fixture(),newToken=addr(8),fee=addr(9),baseSwaps=f.source.swaps,baseBalance=f.source.balance;
 f.transactions[2].block='0x14';
 const buy={at:35,hash:'0x'+'a'.repeat(64),block:'0x13',blockHash:'0x'+'b'.repeat(64),logs:[log(USDC,wallet,pool,4950000),log(USDC,wallet,fee,50000),log(newToken,pool,wallet,2000000)]};
 const sell={at:45,hash:'0x'+'c'.repeat(64),block:'0x15',blockHash:'0x'+'d'.repeat(64),logs:[log(newToken,wallet,pool,2000000),log(USDC,pool,wallet,6000000)]};
 f.transactions.push(buy,sell);
 const rows=[buy,sell].map((t,i)=>({txHash:t.hash,date:time(t.at),userAddress:wallet,contractType:'LAUNCHPAD',fractionalToken:{address:newToken,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:'USDC.e',decimals:6},fractionalTokenAmount:i===0?'2000000':'-2000000',quoteTokenAmount:i===0?'-5000000':'6000000',priceUsd:i===0?2.5:3}));
 f.source.swaps=async()=>[...await baseSwaps(),...rows];
 f.source.balance=async(w,t,b)=>t===newToken?0n:t===USDC&&b==='0x20'?103000000n:baseBalance(w,t,b);
 const r=await reconstruct(f.options),newEvents=r.events.filter(e=>e.token===newToken);
 const unfiltered=f.source.transfers,tokenQueries=[];
 f.source.transfers=async()=>{throw Error('UNSCOPED_HISTORY_READ_FORBIDDEN');};
 f.source.periodTransfersForTokens=f.source.transfersForTokens=async(w,tokens,lo,hi)=>{tokenQueries.push({tokens,lo,hi});return(await unfiltered()).filter(t=>tokens.includes(t.token.address_hash)&&Date.parse(t.timestamp)>=lo&&Date.parse(t.timestamp)<=hi);};
 const filtered=await reconstruct(f.options),strip=x=>{const {requestId,...body}=x;return body;};
 assert.deepEqual(strip(filtered),strip(r),'filtering before source receipt work preserves full FIFO, funding, fees and unscored inventory');
 assert.ok(tokenQueries.filter(q=>q.lo===f.options.from).every(q=>q.tokens.includes(newToken)&&q.tokens.includes(token)&&q.tokens.includes(USDC)),'current discovery includes newly launched manual inventory, eligible domains and quote capital');
 assert.ok(tokenQueries.every(q=>!q.tokens.includes('0x'+'0'.repeat(40))),'native capital and gas remain exclusively in the complete native history');
 delete f.source.transfersForTokens;delete f.source.periodTransfersForTokens;f.source.transfers=unfiltered;
 assert.equal(newEvents.length,2);assert.equal(newEvents[0].kind,'buy');assert.equal(newEvents[0].usd,'5.000000','manual launchpad cost includes its separately paid fee');assert.equal(newEvents[1].kind,'sell');assert.equal(newEvents[1].usd,'6.000000');
 assert.ok(newEvents.every(e=>!e.economicId&&!e.notionalUsd),'discovering an inventory asset does not register a competition market or score manual trading');
 assert.deepEqual(r.events.filter(e=>e.economicId).map(e=>e.economicId),['sale'],'only the original verified eligible fill is scored');
 assert.equal(r.events.filter(e=>e.kind==='in').length,0,'manual sale proceeds remain owned quote inventory rather than new external capital');
 f.source.balance=async(w,t,b)=>t===newToken&&b==='0x20'?1n:t===newToken?0n:t===USDC&&b==='0x20'?103000000n:baseBalance(w,t,b);
 await assert.rejects(()=>reconstruct(f.options),/CLOSING_BALANCE_MISMATCH/,'discovered inventory must reconcile its actual closing chain balance');
 f.source.balance=async(w,t,b)=>t===newToken?0n:t===USDC&&b==='0x20'?103000000n:baseBalance(w,t,b);
 f.source.swaps=async()=>[...await baseSwaps(),...rows.map(r=>({...r,fractionalToken:{...r.fractionalToken,chain:{networkId:'eip155:1'}}}))];
 await assert.rejects(()=>reconstruct(f.options),/ACCOUNTING_COMPLEX_TRANSFER_REQUIRED|UNSUPPORTED_CONTRACT_OR_LP_FLOW/,'another-chain index cannot supply local domain inventory evidence');
 console.log('PASS unregistered accounting assets: receipt-proven manual launchpad cost/fees and resale, no extra scoring or external capital, exact closing balance and chain checks.');
}
async function concurrentReadChecks(){
 const baseline=await reconstruct(fixture().options),strip=r=>{const {requestId,...rest}=r;return rest;};
 const f=fixture();let active=0,peak=0;const completed=[];
 for(const method of ['receipt','block']){const read=f.source[method];f.source[method]=async key=>{
  active++;peak=Math.max(peak,active);
  try{await new Promise(resolve=>setTimeout(resolve,key.endsWith('10')?12:3));return await read(key);}
  finally{active--;completed.push(method+':'+key);}
 };}
 assert.deepEqual(strip(await reconstruct(f.options)),strip(baseline),'out-of-order proof reads preserve exact chronological FIFO, fees and output');
 assert.ok(peak>1&&peak<=3,'independent immutable reads overlap within three requests');assert.equal(active,0);
 const broken=fixture(),block=broken.source.block;active=0;peak=0;let resolved=0;
 broken.source.block=async key=>{active++;peak=Math.max(peak,active);try{await new Promise(resolve=>setTimeout(resolve,key===broken.transactions[1].block?2:8));if(key===broken.transactions[1].block)throw Error('PUBLIC_REQUEST_TIMEOUT');return await block(key);}finally{active--;resolved++;}};
 await assert.rejects(()=>reconstruct(broken.options),/PUBLIC_REQUEST_TIMEOUT/);assert.equal(active,0,'a failed prefetch drains every started read before returning');
 const settled=resolved;await new Promise(resolve=>setTimeout(resolve,15));assert.equal(resolved,settled,'no orphan read survives a rejected reconstruction');
 const stopped=fixture();let reads=0,cancelled=false;const oldReceipt=stopped.source.receipt;
 stopped.source.checkBudget=()=>{if(cancelled)throw Error('ACCOUNTING_TIME_BUDGET_EXCEEDED');};
 stopped.source.receipt=async key=>{reads++;cancelled=true;return oldReceipt(key);};
 await assert.rejects(()=>reconstruct(stopped.options),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);assert.equal(reads,1,'cancellation prevents starting later phases');
 console.log('PASS accounting prefetch: bounded concurrent receipt/block reads, identical FIFO after reordered completions, drained errors and cancellation.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture};
