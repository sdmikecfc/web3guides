'use strict';
const assert=require('node:assert/strict');
const {nativeRouterFixture}=require('./public-native-router-check.cjs');
const {verifyNativeRouterPurchase}=require('./lib/public-native-router.cjs');
const {reconstruct}=require('./lib/public-accounting.cjs');
const {NATIVE}=require('./lib/public-native-accounting.cjs');
const {USDC,WETH}=require('./lib/public-trade-worker.cjs');
const at=n=>new Date(Date.UTC(2026,9,1,0,0,n)).toISOString();
async function fixture(){
 const f=nativeRouterFixture(),p=await verifyNativeRouterPurchase(f);
 f.receipt.transactionIndex='0x0';
 const fund={tx:'0x'+'a'.repeat(64),blockHash:'0x'+'b'.repeat(64),blockNumber:'0xa',status:'0x1',transactionIndex:'0x0',logs:[]};
 const source={
  blockAt:async time=>({number:time<Date.parse(at(45))?'0xf':'0x20'}),
  block:async block=>({hash:block==='0xa'?fund.blockHash:f.receipt.blockHash,timestamp:at(block==='0xa'?10:40)}),
  transfers:async()=>f.receipt.logs.map(l=>({token:{address_hash:l.address},transaction_hash:f.transaction.hash,timestamp:at(40)})),swaps:async()=>[],
  nativeHistory:async()=>[{tx:fund.tx,at:Date.parse(at(10))},{tx:f.transaction.hash,at:Date.parse(at(40))}],
  receipt:async tx=>tx===fund.tx?fund:f.receipt,
  nativeTransaction:async tx=>tx===fund.tx?{moves:[{from:'0x'+'c'.repeat(40),to:f.wallet,units:10000n}],fee:0n,payer:'0x'+'c'.repeat(40)}:f.native,
  nativeRouterPurchase:async tx=>tx===fund.tx?null:p,
  hasCode:async()=>false,valueUsd:async(token,units)=>units,
  nativeBalance:async(wallet,block)=>block==='0xf'?10000n:193n,
  balance:async(wallet,token,block)=>token===p.token&&block!=='0xf'?100000000n:0n,
 };
 return {p,options:{participant:'123',wallets:[f.wallet],from:Date.parse(at(30)),through:Date.parse(at(50)),markets:[{domain_token:p.token,quote_token:USDC},{domain_token:p.token,quote_token:WETH}],source,eligible:[{economicId:'native-buy',wallet:f.wallet,transactionHash:f.transaction.hash,domainToken:p.token,quoteToken:USDC,volumeUsd:'0.627563'}]}};
}
async function main(){
 const {p,options}=await fixture(),ledger=await reconstruct(options),buy=ledger.events.find(e=>e.kind==='buy');
 assert.equal(buy.units,'100000000');assert.equal(buy.usd,'0.009807','actual ETH spent plus own gas, with the returned change excluded');
 assert.equal(buy.economicId,'native-buy');assert.equal(buy.notionalUsd,'0.627563','pool volume remains separate from wallet funding');
 assert.equal(ledger.events.filter(e=>e.token===NATIVE&&e.kind==='out').reduce((n,e)=>n+BigInt(e.units),0n),9807n);
 assert.equal(ledger.events.filter(e=>e.kind==='in').length,0,'router refund never becomes new capital');
 assert.equal(ledger.events.filter(e=>[USDC,WETH].includes(e.token)).length,0,'intermediate hops never become wallet holdings');
 assert.equal(ledger.openingLots[0].valueUsd,'0.010000');
 options.source.nativeBalance=async(wallet,block)=>block==='0xf'?10000n:194n;
 await assert.rejects(()=>reconstruct(options),/NATIVE_CLOSING_BALANCE_MISMATCH/);
 console.log('PASS native purchase ledger: exact spend plus gas, no refund capital, no intermediate wallet holdings, pool-only volume and closing reconciliation.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={nativePurchaseLedgerFixture:fixture};
