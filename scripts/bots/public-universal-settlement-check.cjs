'use strict';
const assert=require('node:assert/strict'),v=require('viem');
const {verifyUniversalSettlement,verifyUniversalRoute,ROUTER,RUNTIME_HASH}=require('./lib/public-universal-settlement.cjs');
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
function addPermit(c,change=()=>{}){
 const ts=v.parseAbiParameters('((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline) permit, bytes signature');
 const path=v.decodeAbiParameters(types('address','uint256','uint256','bytes','bool'),c.inputs[0])[3];
 const permit=[{details:{token:path.slice(0,42),amount:(1n<<160n)-1n,expiration:2000000000,nonce:0},spender:ROUTER,sigDeadline:2000000000n},'0x'+'1'.repeat(130)];
 change(permit);command(c,a=>{a[0]='0x0a'+a[0].slice(2);a[1].unshift(v.encodeAbiParameters(ts,permit));});
}
function routeFixture({side='buy',hops=[1,2],exactOut=false,permit=true}={}){
 const {WETH}=require('./lib/public-trade-worker.cjs');const wallet=addr(1),domain=addr(2),feeTo=addr(4),input=side==='buy'?USDC:domain,output=side==='buy'?domain:USDC;
 const hash='0x'+(side==='buy'?'b':'c').repeat(64),bh='0x'+'a'.repeat(64),block=side==='buy'?'0x111':'0x112',at=side==='buy'?'2026-10-07T01:00:00.000Z':'2026-10-07T01:00:01.000Z',logs=[],orders=[],swaps=[],pools=new Map(),pathPools=[];let spent=0n,gross=0n;
 const add=l=>logs.push({...l,transactionHash:hash,blockHash:bh,blockNumber:block,logIndex:v.toHex(logs.length)});
 const transfer=(token,from,to,units)=>add({address:token,topics:[TRANSFER,v.pad(from),v.pad(to)],data:v.toHex(units,{size:32})});
 for(let n=0;n<hops.length;n++){
  const tokens=hops[n]===2?[input,WETH,output]:[input,output],ps=tokens.slice(1).map((_,j)=>addr(100+n*3+j));pathPools.push(ps);const initial=1000000n*BigInt(n+1),final=initial*3n,amounts=hops[n]===2?[[initial,initial*2n],[initial*2n,final]]:[[initial,final]];
  const encodedTokens=exactOut?[...tokens].reverse():tokens,path=encodedTokens.map((t,i)=>(i?'0001f4':'0x')+t.slice(2)).join('');
  orders.push(v.encodeAbiParameters(types('address','uint256','uint256','bytes','bool'),[addr(2),exactOut?final:initial,exactOut?initial+1n:final-1n,path,true]));
  for(let i=0;i<amounts.length;i++){
   const [a,b]=amounts[i],recipient=exactOut&&i<amounts.length-1?ps[i+1]:ROUTER;pools.set([tokens[i],tokens[i+1]].sort().join(':'),ps[i]);
   transfer(tokens[i+1],ps[i],recipient,b);if(i===0)transfer(tokens[0],wallet,ps[0],a);else if(!exactOut)transfer(tokens[i],ROUTER,ps[i],a);
   const input0=BigInt(tokens[i])<BigInt(tokens[i+1]);add({address:ps[i],topics:v.encodeEventTopics({abi:swapAbi,eventName:'Swap',args:{sender:ROUTER,recipient}}),data:v.encodeAbiParameters(types('int256','int256','uint160','uint128','int24'),[input0?a:-b,input0?-b:a,1n,1n,0])});
   if(tokens[i]===domain||tokens[i+1]===domain)swaps.push({wallet,domain,quote:tokens[i]===domain?tokens[i+1]:tokens[i],side,tx:hash,executedAt:at,domainUnits:(tokens[i]===domain?a:b).toString(),quoteUnits:(tokens[i]===domain?b:a).toString(),decimals:6,priceUsd:1});
  }
  spent+=initial;gross+=final;
 }
 const fee=exactOut?1000n:gross/1000n,received=gross-fee;transfer(output,ROUTER,feeTo,fee);transfer(output,ROUTER,wallet,received);
 const inputs=[...orders,v.encodeAbiParameters(types('address','address','uint256'),[output,feeTo,exactOut?fee:10n]),v.encodeAbiParameters(types('address','address','uint256'),[output,wallet,received])];
 let commands='0x'+(exactOut?'01':'00').repeat(hops.length)+(exactOut?'05':'06')+'04';
 if(permit){const ts=v.parseAbiParameters('((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline) permit, bytes signature');inputs.unshift(v.encodeAbiParameters(ts,[{details:{token:input,amount:(1n<<160n)-1n,expiration:2000000000,nonce:0},spender:ROUTER,sigDeadline:2000000000n},'0x'+'1'.repeat(130)]));commands='0x0a'+commands.slice(2);}
 const transaction={hash,from:wallet,to:ROUTER,value:'0x0',chainId:'0x17cc5',blockNumber:block,blockHash:bh,input:v.encodeFunctionData({abi,functionName:'execute',args:[commands,inputs]})};
 const receipt={transactionHash:hash,to:ROUTER,status:'0x1',blockNumber:block,blockHash:bh,transactionIndex:'0x0',logs};
 return {swaps,transaction,receipt,codeHash:RUNTIME_HASH,poolFor:async(a,b,fee,at)=>{assert.equal(fee,500);assert.equal(at,block);return pools.get([a,b].sort().join(':'));},spent,gross,received,fee,transfer,inputs,commands,side,wallet,domain,pathPools};
}
async function checkCanonicalRoutes(){
 let tested=0;const verify=c=>verifyUniversalRoute(c);
 for(const side of ['buy','sell'])for(const exactOut of [false,true])for(const hops of [[1],[2],[1,2]])for(const permit of [false,true]){
  const c=routeFixture({side,exactOut,hops,permit}),p=await verify(c);assert.equal(p.swap.quote,USDC);assert.equal(p.swap.domainUnits,(side==='buy'?c.gross:c.spent).toString());assert.equal(p.swap.quoteUnits,(side==='buy'?c.spent:c.gross).toString());assert.equal(p.amounts.walletDomainUnits,(side==='buy'?c.received:c.spent).toString());assert.equal(p.amounts.walletQuoteUnits,(side==='buy'?c.spent:c.received).toString());tested++;
 }
 const mutateCommand=(c,fn)=>{const args=v.decodeFunctionData({abi,data:c.transaction.input}).args;fn(args);c.transaction.input=v.encodeFunctionData({abi,functionName:'execute',args});};
 for(const[name,change,error]of [
  ['indexed path missing',c=>c.swaps.pop(),/INDEX_AMOUNT_MISMATCH/],['index invented amount',c=>c.swaps[0].domainUnits='1',/INDEX_AMOUNT_MISMATCH/],['wrong domain',c=>c.swaps[0].domain=addr(9),/INDEX_INVALID/],
  ['wrong runtime',c=>c.codeHash='0x'+'0'.repeat(64),/UNREVIEWED_RUNTIME/],['wrong factory pool',c=>c.poolFor=async()=>addr(999),/UNREGISTERED_POOL|AMBIGUOUS_POOL/],
  ['unpaid output fee',c=>c.receipt.logs.splice(-2,1),/UNEXPLAINED_TRANSFER/],['extra debit',c=>c.transfer(USDC,c.wallet,addr(99),1n),/UNEXPLAINED_TRANSFER/],['inflated sweep',c=>c.receipt.logs.at(-1).data=v.toHex(c.received+1n,{size:32}),/UNEXPLAINED_TRANSFER/],
  ['failed receipt',c=>c.receipt.status='0x0',/TRANSACTION_MISMATCH/],['wrong chain',c=>c.transaction.chainId='0x1',/TRANSACTION_MISMATCH/],['reorged log',c=>c.receipt.logs[0].removed=true,/LOG_IDENTITY_INVALID/],
  ['duplicate pool swap',c=>{const l=c.receipt.logs.find(l=>l.topics[0]===v.toEventSelector(swapAbi[0]));c.receipt.logs.push({...l,logIndex:'0xff'});},/AMBIGUOUS_POOL/],
  ['allow revert',c=>mutateCommand(c,a=>a[0]='0x8a'+a[0].slice(4)),/UNSUPPORTED_COMMANDS/],['trailing command',c=>mutateCommand(c,a=>{a[0]+='04';a[1].push(a[1].at(-1));}),/UNSUPPORTED_COMMANDS/],
  ['wrong payer',c=>mutateCommand(c,a=>{const p=v.decodeAbiParameters(types('address','uint256','uint256','bytes','bool'),a[1][1]);p[4]=false;a[1][1]=v.encodeAbiParameters(types('address','uint256','uint256','bytes','bool'),p);}),/UNSUPPORTED_PATH/],
  ['excess input',c=>mutateCommand(c,a=>{const p=v.decodeAbiParameters(types('address','uint256','uint256','bytes','bool'),a[1][1]);p[1]+=1n;a[1][1]=v.encodeAbiParameters(types('address','uint256','uint256','bytes','bool'),p);}),/COMMAND_AMOUNT_MISMATCH/]
 ]){const c=routeFixture();change(c);await assert.rejects(()=>verify(c),error,name);tested++;}
 // The canonical quote is the actual wallet quote, even when a domain pool
 // uses WETH internally. FIFO uses exact net proceeds, never intermediate units.
 const pair=[routeFixture({side:'buy'}),routeFixture({side:'sell',exactOut:true})],buy=pair[0],sell=pair[1],start='2026-10-07T00:00:00.000Z',end='2026-10-07T02:00:00.000Z';
 const rows=pair.flatMap(c=>c.swaps.map(s=>({txHash:s.tx,date:s.executedAt,userAddress:s.wallet,contractType:'UNISWAP_V3_POOL',fractionalTokenAmount:(s.side==='buy'?'':'-')+s.domainUnits,quoteTokenAmount:(s.side==='buy'?'-':'')+s.quoteUnits,priceUsd:1,fractionalToken:{address:s.domain,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:s.quote===USDC?'USDC.e':'WETH',decimals:s.quote===USDC?6:18}})));
 const source={blockAt:async at=>({number:at<Date.parse(start)?'0x10':'0x200'}),transfers:async()=>pair.map(c=>({token:{address_hash:c.domain},transaction_hash:c.transaction.hash,timestamp:c.swaps[0].executedAt})),swaps:async()=>rows,receipt:async tx=>pair.find(c=>c.transaction.hash===tx).receipt,block:async number=>{const c=pair.find(c=>c.receipt.blockNumber===number);return {hash:c.receipt.blockHash,timestamp:c.swaps[0].executedAt};},universalRouterSettlement:async swaps=>{const c=pair.find(c=>c.transaction.hash===swaps[0].tx);return verifyUniversalRoute({...c,swaps});},nativeHistory:async()=>[],nativeTransaction:async()=>({moves:[],fee:0n,payer:buy.wallet}),nativeBalance:async()=>0n,balance:async(w,t,b)=>t===USDC?(b==='0x10'?5000000n:5000000n-buy.spent+sell.received):t===buy.domain?(b==='0x10'?0n:buy.received-sell.spent):0n,valueUsd:async(t,n)=>{assert.equal(t,USDC);return n;}};
 const ledger=await require('./lib/public-accounting.cjs').reconstruct({participant:'123',wallets:[buy.wallet],from:Date.parse(start),through:Date.parse(end),markets:[{domain_token:buy.domain,quote_token:USDC}],eligible:[],source});
 assert.equal(ledger.events.find(e=>e.kind==='buy'&&e.token===buy.domain).usd,'3.000000');assert.equal(ledger.events.find(e=>e.kind==='buy'&&e.token===buy.domain).units,buy.received.toString());assert.equal(ledger.events.find(e=>e.kind==='sell').usd,'8.999000');assert.equal(ledger.events.some(e=>e.economicId),false,'manual historical routes do not earn competition rewards');
 return tested;
}

async function main(){
 const routeChecks=await checkCanonicalRoutes();
 let c=fixture(),p=await verify(c);assert.equal(p.walletDomainUnits,'1998000');assert.equal(p.walletQuoteUnits,'1000000');assert.equal(p.routerDomainFeeUnits,'2000');
 c=fixture({side:'sell',inputUnits:1998000n,outputUnits:1200000n});p=await verify(c);assert.equal(p.walletDomainUnits,'1998000');assert.equal(p.walletQuoteUnits,'1198800');assert.equal(p.routerFeeUnits,'1200');
 c=fixture({outputUnits:999n});assert.equal((await verify(c)).walletDomainUnits,'999','zero-rounded fee is not fabricated');
 c=fixture();addPermit(c);p=await verify(c);assert.equal(p.walletDomainUnits,'1998000');assert.equal(p.walletQuoteUnits,'1000000');
 for(const change of [p=>p[0].details.token=addr(9),p=>p[0].spender=addr(9),p=>p[0].details.amount=1n,p=>p[0].sigDeadline=1n,p=>p[0].details.expiration=1,p=>p[1]='0x1234']){c=fixture();addPermit(c,change);await assert.rejects(()=>verify(c),/PERMIT_MISMATCH/);}
 c=fixture();addPermit(c);c.receipt.logs.splice(3,1);await assert.rejects(()=>verify(c),/UNEXPLAINED_TRANSFER/,'permit never excuses an unpaid fee');

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
 console.log('PASS UniversalRouter ('+routeChecks+' canonical route cases): pinned runtime, exact fee/sweep/pool conservation, buys/sells, zero-rounded fee, hostile receipt rejection, pool-only volume, unchanged manual exclusion and fee-inclusive FIFO.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture,routeFixture};
