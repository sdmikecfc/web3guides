'use strict';
const assert=require('node:assert/strict'),v=require('viem');
const {verifyUniversalSettlement,ROUTER,RUNTIME_HASH}=require('./lib/public-universal-settlement.cjs');
const {USDC,TRANSFER,collect}=require('./lib/public-trade-worker.cjs');
const addr=n=>'0x'+String(n).padStart(40,'0'),types=(...names)=>names.map(type=>({type}));
const abi=v.parseAbi(['function execute(bytes commands,bytes[] inputs) payable']);
const swapAbi=v.parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
function fixture({side='buy',inputUnits=1000000n,outputUnits=2000000n,bips=10n,sequence=0}={}){
 const wallet=addr(1),domain=addr(2),pool=addr(3),feeTo=addr(4),input=side==='buy'?USDC:domain,output=side==='buy'?domain:USDC;
 const tx='0x'+String(sequence+7).repeat(64),bh='0x'+'a'.repeat(64),block=v.toHex(100+sequence),at=new Date(Date.UTC(2026,9,7,1,0,sequence)).toISOString();
 const outputFee=outputUnits*bips/10000n,received=outputUnits-outputFee,logs=[];
 const add=l=>logs.push({...l,transactionHash:tx,blockHash:bh,blockNumber:block,logIndex:v.toHex(logs.length)});
 const transfer=(token,from,to,units)=>add({address:token,topics:[TRANSFER,v.pad(from),v.pad(to)],data:v.toHex(units,{size:32})});
 transfer(input,wallet,pool,inputUnits);transfer(output,pool,ROUTER,outputUnits);
 add({address:pool,topics:v.encodeEventTopics({abi:swapAbi,eventName:'Swap',args:{sender:ROUTER,recipient:ROUTER}}),data:v.encodeAbiParameters(types('int256','int256','uint160','uint128','int24'),[BigInt(input)<BigInt(output)?inputUnits:-outputUnits,BigInt(input)<BigInt(output)?-outputUnits:inputUnits,1n,1n,0])});
 transfer(output,ROUTER,feeTo,outputFee);transfer(output,ROUTER,wallet,received);
 const inputs=[v.encodeAbiParameters(types('address','uint256','uint256','bytes','bool'),[addr(2),inputUnits,0n,input+'0001f4'+output.slice(2),true]),v.encodeAbiParameters(types('address','address','uint256'),[output,feeTo,bips]),v.encodeAbiParameters(types('address','address','uint256'),[output,wallet,received])];
 const transaction={hash:tx,from:wallet,to:ROUTER,value:'0x0',chainId:'0x17cc5',blockNumber:block,blockHash:bh,input:v.encodeFunctionData({abi,functionName:'execute',args:['0x000604',inputs]})};
 const receipt={transactionHash:tx,to:ROUTER,status:'0x1',blockNumber:block,blockHash:bh,transactionIndex:'0x0',logs};
 const swap={wallet,domain,quote:USDC,tx,executedAt:at,side,domainUnits:(side==='buy'?outputUnits:inputUnits).toString(),quoteUnits:(side==='buy'?inputUnits:outputUnits).toString(),decimals:6,priceUsd:1};
 const options={transaction,codeHash:RUNTIME_HASH,poolFor:async(a,b,fee,at)=>{assert.equal(a,input);assert.equal(b,output);assert.equal(fee,500);assert.equal(at,block);return pool;}};
 return {swap,receipt,options,transaction,inputs,transfer,wallet,domain,pool,outputFee,received};
}
const verify=c=>verifyUniversalSettlement(c.swap,c.receipt,c.options);
function command(c,change){const args=v.decodeFunctionData({abi,data:c.transaction.input}).args;change(args);c.transaction.input=v.encodeFunctionData({abi,functionName:'execute',args});}
async function main(){
 let c=fixture(),p=await verify(c);assert.equal(p.walletDomainUnits,'1998000');assert.equal(p.walletQuoteUnits,'1000000');assert.equal(p.routerDomainFeeUnits,'2000');
 c=fixture({side:'sell',inputUnits:1998000n,outputUnits:1200000n});p=await verify(c);assert.equal(p.walletDomainUnits,'1998000');assert.equal(p.walletQuoteUnits,'1198800');assert.equal(p.routerFeeUnits,'1200');
 c=fixture({outputUnits:999n});assert.equal((await verify(c)).walletDomainUnits,'999','zero-rounded fee is not fabricated');
 const changes=[
  ['runtime',c=>c.options.codeHash='0x'+'0'.repeat(64),/UNREVIEWED_RUNTIME/],['wrong sender',c=>c.transaction.from=addr(8),/TRANSACTION_MISMATCH/],
  ['chain',c=>c.transaction.chainId='0x1',/TRANSACTION_MISMATCH/],['native value',c=>c.transaction.value='0x1',/TRANSACTION_MISMATCH/],['failed',c=>c.receipt.status='0x0',/TRANSACTION_MISMATCH/],
  ['block',c=>c.transaction.blockHash='0x'+'b'.repeat(64),/TRANSACTION_MISMATCH/],['receipt target',c=>c.receipt.to=addr(9),/TRANSACTION_MISMATCH/],
  ['malformed identity',c=>{c.swap.tx='0x1';c.transaction.hash='0x1';c.receipt.transactionHash='0x1';},/TRANSACTION_MISMATCH/],
  ['appended calldata',c=>c.transaction.input+='00',/CALLDATA_INVALID/],['extra command',c=>command(c,a=>{a[0]+='00';a[1].push(a[1][0]);}),/UNSUPPORTED_COMMANDS/],
  ['allow revert',c=>command(c,a=>a[0]='0x800604'),/UNSUPPORTED_COMMANDS/],['wrong indexed output',c=>c.swap.domainUnits='2000001',/POOL_AMOUNT_MISMATCH/],
  ['wrong indexed input',c=>c.swap.quoteUnits='1000001',/COMMAND_AMOUNT_MISMATCH/],['unregistered pool',c=>c.options.poolFor=async()=>addr(0),/UNREGISTERED_POOL/],
  ['missing fee',c=>c.receipt.logs.splice(3,1),/UNEXPLAINED_TRANSFER/],['wrong fee',c=>c.receipt.logs[3].data=v.toHex(2001n,{size:32}),/UNEXPLAINED_TRANSFER/],
  ['inflated sweep',c=>c.receipt.logs[4].data=v.toHex(1998001n,{size:32}),/UNEXPLAINED_TRANSFER/],['extra debit',c=>c.transfer(USDC,c.wallet,addr(9),1n),/UNEXPLAINED_TRANSFER/],
  ['duplicate pool',c=>{const l={...c.receipt.logs[2],logIndex:'0x10'};c.receipt.logs.push(l);},/AMBIGUOUS_POOL/],['duplicate log',c=>c.receipt.logs[4].logIndex='0x3',/LOG_IDENTITY_INVALID/],
  ['removed log',c=>c.receipt.logs[0].removed=true,/LOG_IDENTITY_INVALID/],['wrong log block',c=>c.receipt.logs[0].blockHash='0x'+'b'.repeat(64),/LOG_IDENTITY_INVALID/],
  ['wrong log tx',c=>c.receipt.logs[0].transactionHash='0x'+'b'.repeat(64),/LOG_IDENTITY_INVALID/],
 ];
 for(const[name,change,error]of changes){c=fixture();change(c);await assert.rejects(()=>verify(c),error,name);}
 c=fixture();c.transaction.to=addr(9);assert.equal(await verify(c),null,'unrelated route is not verified');
 const buy=fixture(),sell=fixture({side:'sell',inputUnits:1998000n,outputUnits:1200000n,sequence:1}),fixtures=[buy,sell];
 const started='2026-10-07T00:00:00.000Z',cutoff='2026-10-07T02:00:00.000Z';
 const rows=fixtures.map(c=>({txHash:c.swap.tx,date:c.swap.executedAt,userAddress:c.wallet,contractType:'UNISWAP_V3_POOL',fractionalTokenAmount:(c.swap.side==='buy'?'':'-')+c.swap.domainUnits,quoteTokenAmount:(c.swap.side==='buy'?'-':'')+c.swap.quoteUnits,priceUsd:1,fractionalToken:{address:c.domain,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:'USDC.e',decimals:6}}));
 const snapshot={manifest:{campaign:{id:'model-kombat-zones-1',state:'active',starts_at:started,ends_at:'2026-11-04T00:00:00Z'},participants:[{participant:'123',entered_at:started}],markets:[{domain_token:buy.domain,quote_token:USDC}]},accounts:[{participant:'123',coverage:{complete:true,coverage_from:started,confirmed_through:cutoff,updated_at:cutoff}}],wallets:[{participant:'123',trade_wallet:buy.wallet,agent:true}],references:[],fills:[]};
 const source={finalized:async()=>({number:'0x200',timestamp:cutoff}),indexStatus:async()=>true,transfers:async()=>rows.map(r=>({token:{address_hash:buy.domain},transaction_hash:r.txHash,timestamp:r.date})),swaps:async()=>rows,receipt:async tx=>fixtures.find(c=>c.swap.tx===tx).receipt,block:async block=>({hash:buy.receipt.blockHash,timestamp:fixtures.find(c=>c.receipt.blockNumber===block).swap.executedAt}),routerSettlement:async(s,r)=>verifyUniversalSettlement(s,r,fixtures.find(c=>c.swap.tx===s.tx).options)};
 const result=await collect(snapshot,source,{now:Date.parse(cutoff)+120000});assert.equal(result.report.complete,true);assert.equal(result.packet.fills.length,2);assert.equal(result.report.counts.volumeUsd,'2.200000','pool volume excludes output fees');
 const manual=await collect({...snapshot,wallets:[{...snapshot.wallets[0],agent:false}]},source,{now:Date.parse(cutoff)+120000});assert.equal(manual.packet.fills.length,0,'manual wallet route proof does not confer eligibility');
 const ledgerSource={...source,blockAt:async at=>({number:at<Date.parse(started)?'0x10':'0x200'}),nativeHistory:async()=>[],nativeTransaction:async()=>({moves:[],fee:0n,payer:buy.wallet}),nativeBalance:async()=>0n,balance:async(w,t,b)=>t===USDC?(b==='0x10'?5000000n:5198800n):0n,valueUsd:async(t,n)=>{assert.equal(t,USDC);return n;}};
 const options={participant:'123',wallets:[buy.wallet],from:Date.parse(started),through:Date.parse(cutoff),markets:snapshot.manifest.markets,eligible:result.packet.fills,source:ledgerSource};
 const ledger=await require('./lib/public-accounting.cjs').reconstruct(options);
 assert.equal(ledger.events.find(e=>e.kind==='buy'&&e.token===buy.domain).units,'1998000');assert.equal(ledger.events.find(e=>e.kind==='buy'&&e.token===buy.domain).usd,'1.000000');assert.equal(ledger.events.find(e=>e.kind==='sell').usd,'1.198800');
 const manualLedger=await require('./lib/public-accounting.cjs').reconstruct({...options,eligible:[]});assert.equal(manualLedger.events.some(e=>e.economicId),false,'manual trades reconcile inventory without eligible profit');
 console.log('PASS direct UniversalRouter: pinned runtime, exact fee/sweep/pool conservation, buys/sells, zero-rounded fee, hostile receipt rejection, pool-only volume, unchanged manual exclusion and fee-inclusive FIFO.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture};
