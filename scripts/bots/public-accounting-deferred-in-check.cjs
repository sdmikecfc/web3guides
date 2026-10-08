'use strict';
const assert=require('node:assert/strict'),v=require('viem'),{fixture}=require('./public-accounting-check.cjs'),{scoped}=require('./public-accounting-scoped-check.cjs'),{reconstruct}=require('./lib/public-accounting.cjs'),{USDC,TRANSFER}=require('./lib/public-trade-worker.cjs');
const addr=n=>'0x'+String(n).padStart(40,'0'),at=n=>new Date(Date.UTC(2026,9,1,0,0,n)).toISOString();
function depositFixture({sameBlock=false,unknownFirst=false}={}){
 const f=fixture(),wallet=f.options.wallets[0],token=f.options.markets[0].domain_token,sender=addr(8),time=sameBlock?20:35;
 const deposit={at:time,hash:'0x'+'0'.repeat(63)+'9',block:sameBlock?'0x11':'0x12',blockHash:sameBlock?f.transactions[1].blockHash:'0x'+'8'.repeat(64),logs:[{address:token,topics:[TRANSFER,v.pad(sender),v.pad(wallet)],data:v.toHex(5000000n,{size:32})}]};
 f.transactions[2].block='0x30';f.transactions.push(deposit);
 const oldReceipt=f.source.receipt;
 f.source.receipt=async tx=>{const rc=await oldReceipt(tx);return {...rc,transactionHash:tx,transactionIndex:sameBlock&&(tx===deposit.hash?!unknownFirst:unknownFirst)?'0x1':'0x0'};};
 f.source.transaction=async tx=>({hash:tx,from:sender,to:token,chainId:'0x17cc5',blockNumber:deposit.block,blockHash:deposit.blockHash,value:'0x0',input:v.encodeFunctionData({abi:v.parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),functionName:'transfer',args:[wallet,5000000n]})});
 if(sameBlock)f.options.from=Date.parse(at(15));
 f.source.blockAt=async time=>({number:time<f.options.from?'0x10':'0x40'});
 f.source.balance=async(w,t,b)=>t===USDC?(b==='0x10'?(sameBlock?100000000n:90000000n):102000000n):t===token?(b==='0x10'?(sameBlock?0n:10000000n):5000000n):0n;
 return {...scoped(f),wallet,token,deposit,sender};
}
async function main(){
 const f=depositFixture(),ledger=await reconstruct(f.options),incoming=ledger.events.find(e=>e.kind==='in');
 assert.equal(incoming.costKnown,false);assert.equal(Object.hasOwn(incoming,'costUsd'),false);assert.equal(incoming.usd,'5.000000');assert.equal(ledger.events.find(e=>e.economicId==='sale').usd,'12.000000');
 const same=depositFixture({sameBlock:true}),sameLedger=await reconstruct(same.options);assert.ok(sameLedger.events.find(e=>e.kind==='buy'&&e.token===same.token).acquisitionOrder<sameLedger.events.find(e=>e.kind==='in').acquisitionOrder);
 const early=depositFixture({sameBlock:true,unknownFirst:true});await assert.rejects(()=>reconstruct(early.options),/ACCOUNTING_OPENING_BASIS_REQUIRED/);
 const malformed=[
  ['sender',tx=>tx.from=addr(9)],['recipient',tx=>{tx.input=v.encodeFunctionData({abi:v.parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),functionName:'transfer',args:[addr(9),5000000n]});}],
  ['amount',tx=>{tx.input=v.encodeFunctionData({abi:v.parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),functionName:'transfer',args:[f.wallet,5000001n]});}],
  ['value',tx=>tx.value='0x1'],['wrong token',tx=>tx.to=USDC],['chain',tx=>tx.chainId='0x1'],['block',tx=>tx.blockHash='0x'+'f'.repeat(64)],['appended calldata',tx=>tx.input+='00'],
 ];
 for(const[label,change]of malformed){const bad=depositFixture(),read=bad.source.transaction;bad.source.transaction=async tx=>{const proof=await read(tx);change(proof);return proof;};await assert.rejects(()=>reconstruct(bad.options),/EXTERNAL_DOMAIN_TRANSFER_UNPROVEN/,label);}
 const other=depositFixture();other.deposit.logs.push({address:USDC,topics:[TRANSFER,v.pad(addr(9)),v.pad(addr(8))],data:v.toHex(1n,{size:32})});await assert.rejects(()=>reconstruct(other.options),/EXTERNAL_DOMAIN_TRANSFER_UNPROVEN/);
 const missingNative=depositFixture();missingNative.source.nativeTransaction=async()=>null;await assert.rejects(()=>reconstruct(missingNative.options),/NATIVE_TRANSACTION_PROOF_UNAVAILABLE/);
 console.log('PASS deferred inbound basis: exact direct-transfer proof, actual capital value, no invented cost, known older FIFO first including equal block time, unknown consumption and malformed transfers rejected.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={depositFixture};
