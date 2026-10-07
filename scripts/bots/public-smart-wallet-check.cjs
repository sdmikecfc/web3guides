'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const v=require('viem'),adapter=require('./lib/public-smart-wallet-settlement.cjs');
const {collect,normalizePublicSwap,USDC,WETH,TRANSFER}=require('./lib/public-trade-worker.cjs');
const dir=path.join(__dirname,'fixtures/smart-wallet'),codes=JSON.parse(fs.readFileSync(path.join(dir,'runtime-code.json')));
const fixtures=['a80aed76','4e9590d2','3dfb75e1'].map(n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'))));
const clone=structuredClone,lower=x=>x.toLowerCase();
const OP='(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)';
const entryAbi=v.parseAbi([`function handleOps(${OP}[] ops,address beneficiary)`]);
const eventAbi=v.parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
const replacer=(_,value)=>typeof value==='bigint'?value.toString():value;
function context(f){
 const wallet=normalizePublicSwap(f.rows[0]).wallet,op=v.decodeFunctionData({abi:entryAbi,data:f.transaction.input}).args[0][0];
 const pools=new Map();for(const p of f.expected.paths)for(let i=0;i<p.fees.length;i++)pools.set([...[p.tokens[i],p.tokens[i+1]].sort(),p.fees[i]].join(':'),p.pools[i]);
 return {swaps:f.rows.map(normalizePublicSwap),transaction:f.transaction,receipt:f.receipt,
  codeAt:async address=>lower(address)===wallet?'0xef0100'+adapter.ACCOUNT.slice(2):codes[lower(address)]||'0x',
  poolFor:async(a,b,fee)=>pools.get([...[a,b].sort(),fee].join(':'))||'0x'+'0'.repeat(40),
  userOperationHash:async actual=>{assert.equal(JSON.stringify(actual,replacer),JSON.stringify(op,replacer),'historical getUserOpHash receives the entire exact operation');return f.expected.userOperationHash;}};
}
async function rejected(label,change,code){const f=clone(fixtures[0]),c=context(f);change(c,f);await assert.rejects(()=>adapter.verifySmartWalletSettlement(c),code,label);}
function alterOp(c,change){const decoded=v.decodeFunctionData({abi:entryAbi,data:c.transaction.input});change(decoded.args[0][0],decoded.args);c.transaction.input=v.encodeFunctionData({abi:entryAbi,functionName:'handleOps',args:decoded.args});}
function mockSource(fsx){const byTx=new Map(fsx.map(f=>[f.transaction.hash,f])),byBlock=new Map(fsx.map(f=>[f.receipt.blockNumber,f]));return {
 finalized:async()=>({number:'0xffffff',timestamp:'2026-10-07T00:00:00Z'}),indexStatus:async()=>true,
 transfers:async()=>[],swaps:async()=>fsx.flatMap(f=>f.rows),
 receipt:async tx=>byTx.get(tx).receipt,
 block:async n=>({hash:byBlock.get(n).receipt.blockHash,timestamp:normalizePublicSwap(byBlock.get(n).rows[0]).executedAt}),
 smartWalletSettlement:async swaps=>adapter.verifySmartWalletSettlement({...context(byTx.get(swaps[0].tx)),swaps}),
 };}
function snapshot(){const w=normalizePublicSwap(fixtures[0].rows[0]).wallet,d=normalizePublicSwap(fixtures[0].rows[0]).domain;return {manifest:{campaign:{id:'model-kombat-zones-1',state:'active',starts_at:'2026-10-06T14:00:00Z',ends_at:'2026-11-03T14:00:00Z'},participants:[{participant:'test',entered_at:'2026-10-06T22:14:50Z'}],markets:[{domain_token:d,quote_token:USDC},{domain_token:d,quote_token:WETH}]},accounts:[{participant:'test',coverage:{complete:true,coverage_from:'2026-10-06T14:00:00Z',confirmed_through:'2026-10-06T23:00:00Z',updated_at:'2026-10-06T23:00:00Z'}}],wallets:[{participant:'test',trade_wallet:w,agent:true}],references:[],fills:[]};}
async function main(){
 for(const f of fixtures){const result=await adapter.verifySmartWalletSettlement(context(f));assert.equal(result.swap.domainUnits,f.expected.domainUnits);assert.equal(result.amounts.walletQuoteUnits,f.expected.quoteUnits);assert.equal(result.volumeMicros.toString(),f.expected.volumeMicros);assert.equal(result.swap.quote,USDC);assert.equal(result.amounts.paths.length,f.rows.length);}
 await rejected('unknown runtime',c=>{c.codeAt=async()=>codes[adapter.ACCOUNT]},/UNREVIEWED_RUNTIME/);
 await rejected('unknown account delegation',c=>{const previous=c.codeAt;c.codeAt=async a=>a===c.swaps[0].wallet?'0xef0100'+'0'.repeat(40):previous(a)},/UNREVIEWED_ACCOUNT/);
 await rejected('failed receipt',c=>c.receipt.status='0x0',/TRANSACTION_MISMATCH/);
 await rejected('wrong receipt identity',c=>c.receipt.transactionHash='0x'+'1'.repeat(64),/TRANSACTION_MISMATCH/);
 await rejected('removed log',c=>c.receipt.logs[1].removed=true,/LOG_IDENTITY_INVALID/);
 await rejected('duplicate log identity',c=>c.receipt.logs.push(clone(c.receipt.logs[1])),/LOG_IDENTITY_INVALID/);
 await rejected('multiple operations',c=>alterOp(c,(_,args)=>args[0].push(clone(args[0][0]))),/MULTIPLE_OPERATIONS/);
 await rejected('wrong operation hash',c=>c.userOperationHash=async()=> '0x'+'0'.repeat(64),/OPERATION_EVENT_MISMATCH/);
 await rejected('wrong operation nonce',c=>alterOp(c,op=>op.nonce++),/OPERATION_EVENT_MISMATCH/);
 await rejected('failed user operation',c=>{const l=c.receipt.logs.find(l=>l.topics[0]===v.toEventSelector(eventAbi[0]));const e=v.decodeEventLog({abi:eventAbi,data:l.data,topics:l.topics}).args;l.data=v.encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[e.nonce,false,e.actualGasCost,e.actualGasUsed]);},/OPERATION_EVENT_MISMATCH/);
 await rejected('unsupported commands',c=>alterOp(c,op=>{const abi=v.parseAbi(['function execute(address target,uint256 value,bytes data)']),a=v.decodeFunctionData({abi,data:op.callData}).args,router=v.parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']),r=v.decodeFunctionData({abi:router,data:a[2]}).args;r[0]='0x0004';a[2]=v.encodeFunctionData({abi:router,functionName:'execute',args:r});op.callData=v.encodeFunctionData({abi,functionName:'execute',args:a});}),/UNSUPPORTED_COMMANDS/);
 await rejected('unpaid or extra fee transfer',c=>{const t=clone(c.receipt.logs.find(l=>l.topics[0]===TRANSFER));t.logIndex='0xffff';t.data=v.toHex(1n,{size:32});c.receipt.logs.push(t)},/UNEXPLAINED_TRANSFER/);
 await rejected('unregistered pool',c=>c.poolFor=async()=> '0x'+'0'.repeat(40),/UNREGISTERED_POOL/);
 await rejected('fake indexed amount',c=>c.swaps[0].quoteUnits='1',/INDEX_MISMATCH/);
 await rejected('missing split leg',c=>c.swaps.pop(),/INDEX_MISMATCH/);
 await rejected('duplicate indexed leg',c=>c.swaps.push(clone(c.swaps[0])),/DUPLICATE_INDEX_ROW/);
 const now=Date.parse('2026-10-06T23:02:00Z'),snap=snapshot();
 let result=await collect(snap,mockSource(fixtures),{now});assert.equal(result.report.complete,true);assert.equal(result.packet.fills.length,3);assert.equal(result.report.counts.volumeUsd,'33.988254');assert.equal(new Set(result.packet.fills.map(f=>f.economicId)).size,3);
 // Identical replay changes neither identity nor revision or accounting cost.
 const prior=clone(result.packet.fills);result=await collect({...snap,fills:prior},mockSource(fixtures),{now});assert.deepEqual(result.packet.fills,prior);
 const bad=clone(fixtures);bad[0].receipt.logs[1].removed=true;result=await collect(snap,mockSource(bad),{now});assert.equal(result.report.complete,false);assert.equal(result.packet.fills.length,2);
 const leg=normalizePublicSwap(fixtures[0].rows[0]),ref={id:'strategy-test',revision:1,status:'verified',wallet:leg.wallet,transactionHash:leg.tx,domainToken:leg.domain,quoteToken:leg.quote,side:leg.side,domainUnits:leg.domainUnits,quoteUnits:leg.quoteUnits,executedAt:leg.executedAt};
 result=await collect({...snap,references:[{participant:'test',ref}]},mockSource(fixtures),{now});assert.equal(result.report.complete,false);assert.ok(result.report.problems.some(p=>p.code==='SMART_ROUTER_STRATEGY_ATTRIBUTION_REVIEW_REQUIRED'));
 const canonical=await adapter.verifySmartWalletSettlement(context(fixtures[0]));Object.assign(ref,{domainUnits:canonical.swap.domainUnits,quoteUnits:canonical.swap.quoteUnits,quoteToken:canonical.swap.quote});
 result=await collect({...snap,references:[{participant:'test',ref}]},mockSource(fixtures),{now});assert.equal(result.report.complete,true);assert.equal(result.packet.fills.find(f=>f.transactionHash===leg.tx).source,'strategy');
 // FIFO consumes the canonical wallet cost, while the verified domain legs
 // remain the volume source. A private aggregate reference is not a third swap.
 const f=fixtures[0],s=canonical.swap,funding='0x'+'a'.repeat(64),fundingHash='0x'+'b'.repeat(64),outside='0x'+'c'.repeat(40),opened=Date.parse('2026-10-06T22:14:50Z'),cutoff=Date.parse('2026-10-06T23:00:00Z');
 const fundReceipt={status:'0x1',transactionHash:funding,blockHash:fundingHash,blockNumber:'0x1',transactionIndex:'0x0',logs:[{address:USDC,topics:[TRANSFER,v.pad(outside),v.pad(s.wallet)],data:v.toHex(100000000n,{size:32})}]};
 const accountingSource={...mockSource([f]),
  blockAt:async time=>({number:time<opened?'0x2':'0xffffff'}),
  block:async n=>n==='0x1'?{hash:fundingHash,timestamp:'2026-10-06T22:00:00Z'}:{hash:f.receipt.blockHash,timestamp:s.executedAt},
  receipt:async tx=>tx===funding?fundReceipt:f.receipt,
  transfers:async()=>[{token:{address_hash:USDC},transaction_hash:funding,timestamp:'2026-10-06T22:00:00Z'},{token:{address_hash:s.domain},transaction_hash:s.tx,timestamp:s.executedAt}],
  nativeHistory:async()=>[],nativeTransaction:async()=>({moves:[],fee:0n,payer:outside}),nativeBalance:async()=>0n,hasCode:async()=>false,
  balance:async(wallet,token,at)=>token===USDC?(at==='0x2'?100000000n:85500000n):token===s.domain&&at!=='0x2'?47018799n:0n,
  valueUsd:async(token,units)=>{assert.equal(token,USDC);return units;},
 };
 const ledger=await require('./lib/public-accounting.cjs').reconstruct({participant:'test',wallets:[s.wallet],from:opened,through:cutoff,markets:snap.manifest.markets,references:[{ref}],eligible:result.packet.fills.filter(fill=>fill.transactionHash===s.tx),source:accountingSource});
 assert.equal(ledger.complete,true);assert.equal(ledger.openingLots.length,1);assert.equal(ledger.events.length,2);assert.equal(ledger.events[0].usd,'14.500000');assert.equal(ledger.events[0].units,'47018799');assert.equal(ledger.events[0].notionalUsd,'14.501921');assert.equal(ledger.events[1].units,'14500000');
 console.log('PASS smart-wallet settlement: three real sponsored receipts, historical contract pins, UserOp hash/signature, exact split-path conservation, pool-only volume, canonical economic fills, stable retries, Strategy attribution and fail-closed adversarial cases.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
