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
 const options={participant:'123',wallets:[wallet],from:Date.parse(time(30)),through:Date.parse(time(50)),markets:[{domain_token:token,quote_token:USDC}],eligible:[{economicId:'sale',wallet,transactionHash:transactions[2].hash,domainToken:token,quoteToken:USDC,volumeUsd:'12.000000'}],source};
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
 f=fixture();f.transactions[0].logs=[log(token,outside,wallet,100000000)];await assert.rejects(()=>reconstruct(f.options),/EXTERNAL_DOMAIN_COST_BASIS_REQUIRED/);
 console.log('PASS independent accounting reconstruction: public FIFO history, fee-inclusive cost, quote funding, balance reconciliation, and rejection of unknown basis or unsupported exchange flows.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture};
