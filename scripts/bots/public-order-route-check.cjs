'use strict';
const assert=require('node:assert/strict'),v=require('viem');
const {verifyOrderRoute}=require('./lib/public-order-route.cjs'),{ROUTER,IMPLEMENTATION,UNIVERSAL}=require('./lib/public-router-settlement.cjs');
const {USDC,WETH,TRANSFER,collect}=require('./lib/public-trade-worker.cjs');
const codes=require('./fixtures/order-route-runtimes.json').codes,addr=n=>'0x'+String(n).padStart(40,'0'),types=(...names)=>names.map(type=>({type}));
const outerAbi=v.parseAbi(['function execute(uint256 executionId,(uint8 commandType,bytes data)[] commands)','event OrderExecuted(uint256 indexed executionId)']);
const innerAbi=v.parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline)']);
const swapAbi=v.parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
function fixture({fee=0n,refund=0n}={}){
 const wallet=addr(1),domain=addr(2),pools=[addr(3),addr(4)],keeper=addr(5),feeTo=addr(6),tx='0x'+'a'.repeat(64),bh='0x'+'b'.repeat(64),at='2026-10-07T07:00:37.000Z';
 const logs=[],add=l=>logs.push({...l,logIndex:v.toHex(logs.length),transactionHash:tx,blockHash:bh,blockNumber:'0x100'});
 const transfer=(token,from,to,units)=>add({address:token,topics:[TRANSFER,v.pad(from),v.pad(to)],data:v.toHex(units,{size:32})});
 const poolLog=(index,input,output,paid,received,recipient)=>add({address:pools[index],topics:v.encodeEventTopics({abi:swapAbi,eventName:'Swap',args:{sender:UNIVERSAL,recipient}}),data:v.encodeAbiParameters(types('int256','int256','uint160','uint128','int24'),[BigInt(input)<BigInt(output)?paid:-received,BigInt(input)<BigInt(output)?-received:paid,1n,1n,0])});
 const path=USDC+'000064'+WETH.slice(2)+'0001f4'+domain.slice(2),input=v.encodeAbiParameters(types('address','uint256','uint256','bytes','bool'),[wallet,200000n,1900n,path,true]);
 const inner=v.encodeFunctionData({abi:innerAbi,functionName:'execute',args:['0x00',[input],2000000000n]});
 const commands=[{commandType:0,data:v.encodeAbiParameters(types('address','address','uint256'),[USDC,wallet,200000n+fee+refund])},{commandType:2,data:v.encodeAbiParameters(types('address','address','uint256'),[USDC,UNIVERSAL,200000n])},{commandType:3,data:v.encodeAbiParameters(types('address','bytes','uint256'),[UNIVERSAL,inner,0n])},{commandType:4,data:v.encodeAbiParameters(types('address','address','uint256'),[USDC,wallet,0n])}];
 if(fee){const data=v.encodeFunctionData({abi:v.parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),functionName:'transfer',args:[feeTo,fee]});commands.push({commandType:3,data:v.encodeAbiParameters(types('address','bytes','uint256'),[USDC,data,0n])});}
 transfer(USDC,wallet,ROUTER,200000n+fee+refund);transfer(USDC,ROUTER,pools[0],200000n);transfer(WETH,pools[0],UNIVERSAL,57n);poolLog(0,USDC,WETH,200000n,57n,UNIVERSAL);transfer(WETH,UNIVERSAL,pools[1],57n);transfer(domain,pools[1],wallet,2000n);poolLog(1,WETH,domain,57n,2000n,wallet);if(fee)transfer(USDC,ROUTER,feeTo,fee);if(refund)transfer(USDC,ROUTER,wallet,refund);
 add({address:ROUTER,topics:v.encodeEventTopics({abi:outerAbi,eventName:'OrderExecuted',args:{executionId:91n}}),data:'0x'});
 const transaction={hash:tx,from:keeper,to:ROUTER,chainId:'0x17cc5',value:'0x0',blockHash:bh,blockNumber:'0x100',input:v.encodeFunctionData({abi:outerAbi,functionName:'execute',args:[91n,commands]})};
 const receipt={transactionHash:tx,status:'0x1',blockHash:bh,blockNumber:'0x100',transactionIndex:'0x0',logs};
 const swap={wallet,domain,quote:WETH,domainUnits:'2000',quoteUnits:'57',tx,side:'buy',executedAt:at,decimals:6,priceUsd:100};
 const ref={id:'isolated:91',revision:1,status:'verified',wallet,transactionHash:tx,domainToken:domain,quoteToken:USDC,domainUnits:'2000',quoteUnits:'200000',side:'buy',executedAt:at};
 return {swaps:[swap],refs:[ref],transaction,receipt,implementation:IMPLEMENTATION,codeAt:async a=>codes[a],poolFor:async(a,b,f)=>a===USDC&&b===WETH&&f===100?pools[0]:a===WETH&&b===domain&&f===500?pools[1]:addr(0),wallet,domain,pools,commands,transfer};
}
function reencode(c){c.transaction.input=v.encodeFunctionData({abi:outerAbi,functionName:'execute',args:[91n,c.commands]});}
function innerChange(c,change){const args=v.decodeAbiParameters(types('address','bytes','uint256'),c.commands[2].data),inner=v.decodeFunctionData({abi:innerAbi,data:args[1]}).args;change(inner);args[1]=v.encodeFunctionData({abi:innerAbi,functionName:'execute',args:inner});c.commands[2].data=v.encodeAbiParameters(types('address','bytes','uint256'),args);reencode(c);}
async function main(){
 let c=fixture({fee:1000n,refund:500n}),p=await verifyOrderRoute(c);assert.equal(p.swap.quote,USDC);assert.equal(p.volumeMicros,200000n);assert.equal(p.amounts.walletQuoteUnits,'201000');assert.equal(p.amounts.routerFeeUnits,'1000');assert.equal(p.amounts.walletDomainUnits,'2000');
 const mutations=[
  ['runtime',c=>c.codeAt=async()=> '0x',/UNREVIEWED_RUNTIME/],['implementation',c=>c.implementation=addr(9),/UNREVIEWED_IMPLEMENTATION/],
  ['chain',c=>c.transaction.chainId='0x1',/TRANSACTION_MISMATCH/],['failed',c=>c.receipt.status='0x0',/TRANSACTION_MISMATCH/],
  ['removed',c=>c.receipt.logs[0].removed=true,/LOG_IDENTITY_INVALID/],['index amount',c=>c.swaps[0].quoteUnits='58',/POOL_AMOUNTS_MISMATCH/],
  ['duplicated index',c=>c.swaps.push({...c.swaps[0]}),/INDEX_AMBIGUOUS/],['unverified pool',c=>c.poolFor=async()=>addr(0),/POOL_UNVERIFIED/],
  ['missing pool',c=>c.receipt.logs.splice(3,1),/POOL_EVENTS_AMBIGUOUS/],['duplicate pool',c=>c.receipt.logs.push({...c.receipt.logs[3]}),/POOL_EVENTS_AMBIGUOUS/],
  ['same index',c=>c.receipt.logs[6].logIndex=c.receipt.logs[3].logIndex,/LOG_IDENTITY_INVALID/],
  ['unrelated debit',c=>c.transfer(USDC,c.wallet,addr(9),1n),/UNEXPLAINED_TRANSFER/],['unpaid fee',c=>c.receipt.logs.splice(7,1),/FEE_NOT_PAID/],
  ['intermediate transfer',c=>c.receipt.logs[4].data=v.toHex(58n,{size:32}),/POOL_TRANSFERS_MISMATCH/],
  ['wrong ref quote',c=>c.refs[0].quoteToken=WETH,/STRATEGY_ATTRIBUTION_MISMATCH/],['wrong ref amount',c=>c.refs[0].quoteUnits='200001',/STRATEGY_ATTRIBUTION_MISMATCH/],
  ['duplicate ref',c=>c.refs.push({...c.refs[0]}),/STRATEGY_ATTRIBUTION_MISMATCH/],['unsupported command',c=>innerChange(c,a=>a[0]='0x80'),/COMMANDS_UNSUPPORTED/],
  ['extra route',c=>{c.commands.push(c.commands[2]);reencode(c)},/MULTIPLE_ROUTES/],
 ];
 for(const[label,change,error]of mutations){c=fixture({fee:1000n,refund:500n});change(c);await assert.rejects(()=>verifyOrderRoute(c),error,label);}
 c=fixture({fee:1000n});
 const started='2026-10-07T00:00:00Z',cutoff='2026-10-07T08:00:00Z',row={txHash:c.transaction.hash,date:c.swaps[0].executedAt,userAddress:c.wallet,contractType:'UNISWAP_V3_POOL',fractionalTokenAmount:'2000',quoteTokenAmount:'-57',priceUsd:100,fractionalToken:{address:c.domain,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:'WETH',decimals:18}};
 const snapshot={manifest:{campaign:{id:'model-kombat-zones-1',state:'active',starts_at:started,ends_at:'2026-11-04T00:00:00Z'},participants:[{participant:'123',entered_at:started}],markets:[{domain_token:c.domain,quote_token:USDC},{domain_token:c.domain,quote_token:WETH}]},accounts:[{participant:'123',coverage:{complete:true,coverage_from:started,confirmed_through:cutoff,updated_at:cutoff}}],wallets:[{participant:'123',trade_wallet:c.wallet,agent:false}],references:[{participant:'123',ref:c.refs[0]}],fills:[]};
 const source={finalized:async()=>({number:'0x200',timestamp:cutoff}),indexStatus:async()=>true,transfers:async()=>[{token:{address_hash:c.domain},transaction_hash:c.transaction.hash,timestamp:row.date}],swaps:async()=>[row],receipt:async()=>c.receipt,block:async()=>({hash:c.receipt.blockHash,timestamp:row.date}),orderRouterSettlement:async(swaps,refs)=>verifyOrderRoute({...c,swaps,refs})};
 const result=await collect(snapshot,source,{now:Date.parse(cutoff)+120000});assert.equal(result.report.complete,true);assert.equal(result.packet.fills.length,1);assert.equal(result.packet.fills[0].quoteToken,USDC);assert.equal(result.packet.fills[0].source,'strategy');assert.equal(result.packet.fills[0].volumeUsd,'0.200000');
 const retried=await collect({...snapshot,fills:result.packet.fills},source,{now:Date.parse(cutoff)+120000});assert.deepEqual(retried.packet.fills,result.packet.fills);
 const manual=await collect({...snapshot,references:[]},{...source,orderRouterSettlement:async()=>{throw Error('MANUAL_PROOF_SHOULD_NOT_RUN');}},{now:Date.parse(cutoff)+120000});assert.equal(manual.packet.fills.length,0,'external manual route stays ineligible');assert.equal(manual.report.complete,true,'unsupported manual route cannot block verified trading volume');
 const missingMarket=structuredClone(snapshot);missingMarket.manifest.markets.pop();assert.equal((await collect(missingMarket,source,{now:Date.parse(cutoff)+120000})).report.complete,false);
 const ledgerSource={...source,blockAt:async at=>({number:at<Date.parse(started)?'0x10':'0x200'}),nativeHistory:async()=>[],nativeTransaction:async()=>({moves:[],fee:0n,payer:addr(5)}),nativeBalance:async()=>0n,hasCode:async()=>false,balance:async(w,t,b)=>t===USDC?(b==='0x10'?1000000n:799000n):t===c.domain&&b!=='0x10'?2000n:0n,valueUsd:async(t,n)=>{assert.equal(t,USDC);return n;}};
 const ledger=await require('./lib/public-accounting.cjs').reconstruct({participant:'123',wallets:[c.wallet],from:Date.parse(started),through:Date.parse(cutoff),markets:snapshot.manifest.markets,references:snapshot.references,eligible:result.packet.fills,source:ledgerSource});
 assert.equal(ledger.events.length,2);assert.equal(ledger.events[0].usd,'0.201000');assert.equal(ledger.events[0].notionalUsd,'0.200000');assert.equal(ledger.events[1].token,USDC);assert.equal(ledger.events[1].units,'201000');
 console.log('PASS two-hop OrderRouter: pinned runtimes, exact pool and fee conservation, USDC economic quote, one Strategy fill, manual exclusion, idempotency, FIFO wallet cost and adversarial rejection.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture};
