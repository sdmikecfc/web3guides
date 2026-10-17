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

// Generated identities/amounts only: no participant receipts or Strategy data.
function extendedFixture({buy=true,inputFee=0n,outputFee=0n,refund=0n,via=false,shape='mixed'}={}){
 const splitSell=!buy&&shape.startsWith('split-');
 const wallet=addr(11),domain=addr(12),pools=buy?(shape==='direct'?[addr(13),addr(15)]:[addr(13),addr(14),addr(15)]):splitSell?(shape==='split-direct'?[addr(13),addr(15)]:[addr(13),addr(14),addr(15)]):[addr(15),addr(14)],feeTo=addr(16),keeper=addr(17),tx='0x'+(buy?'c':'d').repeat(64),bh='0x'+(buy?'e':'f').repeat(64),block=buy?'0x101':'0x102',at=buy?'2026-10-07T07:01:00.000Z':'2026-10-07T07:02:00.000Z';
 const inputToken=buy?USDC:domain,outputToken=buy?domain:USDC,input=buy?200000n:2000n,output=buy?2000n:220000n,recipient=outputFee?ROUTER:wallet;
 const paths=buy?(shape==='direct'?[[USDC,domain],[USDC,domain]]:shape==='reversed'?[[USDC,WETH,domain],[USDC,domain]]:[[USDC,domain],[USDC,WETH,domain]]):splitSell?(shape==='split-direct'?[[domain,USDC],[domain,USDC]]:shape==='split-reversed'?[[domain,WETH,USDC],[domain,USDC]]:[[domain,USDC],[domain,WETH,USDC]]):[[domain,WETH,USDC]],routeFees=buy?(shape==='direct'?[[100],[3000]]:shape==='reversed'?[[100,500],[500]]:[[500],[100,500]]):splitSell?(shape==='split-direct'?[[100],[3000]]:shape==='split-reversed'?[[500,100],[500]]:[[500],[500,100]]):[[500,100]],amounts=buy?[80000n,120000n]:splitSell?[800n,1200n]:[2000n],outputs=buy?[800n,1200n]:splitSell?[88000n,132000n]:[220000n];
 const inputs=paths.map((tokens,i)=>{const path=tokens[0]+tokens.slice(1).map((t,j)=>routeFees[i][j].toString(16).padStart(6,'0')+t.slice(2)).join('');return v.encodeAbiParameters(types('address','uint256','uint256','bytes','bool'),[recipient,amounts[i],outputs[i]-1n,path,true]);});
 const inner=v.encodeFunctionData({abi:innerAbi,functionName:'execute',args:['0x'+'00'.repeat(inputs.length),inputs,2000000000n]});
 const command=(commandType,names,values)=>({commandType,data:v.encodeAbiParameters(types(...names),values)});
 const commands=[command(0,['address','address','uint256'],[inputToken,wallet,input+inputFee+refund]),command(2,['address','address','uint256'],[inputToken,UNIVERSAL,input]),command(3,['address','bytes','uint256'],[UNIVERSAL,inner,0n]),command(4,['address','address','uint256'],[inputToken,wallet,0n])];
 const feeCommand=(token,units)=>command(3,['address','bytes','uint256'],[token,v.encodeFunctionData({abi:v.parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),functionName:'transfer',args:[feeTo,units]}),0n]);
 if(inputFee)commands.push(feeCommand(inputToken,inputFee));if(outputFee){commands.push(feeCommand(outputToken,outputFee));commands.push(command(4,['address','address','uint256'],[outputToken,wallet,0n]));}
 const logs=[],add=l=>logs.push({...l,logIndex:v.toHex(logs.length),transactionHash:tx,blockHash:bh,blockNumber:block});
 const transfer=(token,from,to,units)=>add({address:token,topics:[TRANSFER,v.pad(from),v.pad(to)],data:v.toHex(units,{size:32})});
 const poolLog=(pool,input,output,paid,received,to)=>add({address:pool,topics:v.encodeEventTopics({abi:swapAbi,eventName:'Swap',args:{sender:UNIVERSAL,recipient:to}}),data:v.encodeAbiParameters(types('int256','int256','uint160','uint128','int24'),[BigInt(input)<BigInt(output)?paid:-received,BigInt(input)<BigInt(output)?-received:paid,1n,1n,0])});
 transfer(inputToken,wallet,ROUTER,input+inputFee+refund);
 if(via)transfer(inputToken,ROUTER,UNIVERSAL,input);
 let poolIndex=0;
 for(let i=0;i<paths.length;i++){
  const tokens=paths[i],hopOutputs=tokens.length===2?[outputs[i]]:[57n,outputs[i]];
  for(let h=0;h<tokens.length-1;h++){
   const pool=pools[poolIndex++],paid=h===0?amounts[i]:hopOutputs[h-1],received=hopOutputs[h],to=h===tokens.length-2?recipient:UNIVERSAL;
   transfer(tokens[h],h===0?(via?UNIVERSAL:ROUTER):UNIVERSAL,pool,paid);transfer(tokens[h+1],pool,to,received);poolLog(pool,tokens[h],tokens[h+1],paid,received,to);
  }
 }
 if(inputFee)transfer(inputToken,ROUTER,feeTo,inputFee);if(refund)transfer(inputToken,ROUTER,wallet,refund);if(outputFee){transfer(outputToken,ROUTER,feeTo,outputFee);transfer(outputToken,ROUTER,wallet,output-outputFee);}
 add({address:ROUTER,topics:v.encodeEventTopics({abi:outerAbi,eventName:'OrderExecuted',args:{executionId:91n}}),data:'0x'});
 const transaction={hash:tx,from:keeper,to:ROUTER,chainId:'0x17cc5',value:'0x0',blockHash:bh,blockNumber:block,input:v.encodeFunctionData({abi:outerAbi,functionName:'execute',args:[91n,commands]})},receipt={transactionHash:tx,status:'0x1',blockHash:bh,blockNumber:block,transactionIndex:'0x0',logs};
 const base={wallet,domain,tx,side:buy?'buy':'sell',executedAt:at,decimals:6,priceUsd:100},swaps=buy?paths.map((tokens,i)=>({...base,quote:tokens.length===2?USDC:WETH,domainUnits:outputs[i].toString(),quoteUnits:(tokens.length===2?amounts[i]:57n).toString()})):paths.map((tokens,i)=>({...base,quote:tokens.length===2?USDC:WETH,domainUnits:amounts[i].toString(),quoteUnits:(tokens.length===2?outputs[i]:57n).toString()}));
 const refs=[{id:'synthetic:'+tx,revision:1,status:'verified',wallet,transactionHash:tx,domainToken:domain,quoteToken:USDC,domainUnits:'2000',quoteUnits:(buy?input:output).toString(),side:base.side,executedAt:at}];
 const poolFor=async(a,b,f)=>{let index=0;for(let i=0;i<paths.length;i++)for(let h=0;h<paths[i].length-1;h++){const p=pools[index++];if(a===paths[i][h]&&b===paths[i][h+1]&&f===routeFees[i][h])return p;}return addr(0);};
 return {swaps,refs,transaction,receipt,implementation:IMPLEMENTATION,codeAt:async a=>codes[a],poolFor,wallet,domain,pools,commands,transfer,inputToken,outputToken,feeTo};
}
function inputChange(c,index,change){innerChange(c,args=>{const p=v.decodeAbiParameters(types('address','uint256','uint256','bytes','bool'),args[1][index]);change(p);args[1][index]=v.encodeAbiParameters(types('address','uint256','uint256','bytes','bool'),p);});}
function swapLogs(c){return c.receipt.logs.filter(l=>l.topics[0]===v.toEventSelector(swapAbi[0]));}
function changePool(c,index,change){const l=swapLogs(c)[index],a=v.decodeEventLog({abi:swapAbi,data:l.data,topics:l.topics}).args;change(a);l.topics=v.encodeEventTopics({abi:swapAbi,eventName:'Swap',args:{sender:a.sender,recipient:a.recipient}});l.data=v.encodeAbiParameters(types('int256','int256','uint160','uint128','int24'),[a.amount0,a.amount1,a.sqrtPriceX96,a.liquidity,a.tick]);}
async function extendedTests(){
 for(const buy of [true,false])for(const via of [false,true])for(const fees of [false,true]){
  const c=extendedFixture({buy,via,inputFee:fees?11n:0n,outputFee:fees?7n:0n,refund:fees?5n:0n}),p=await verifyOrderRoute(c);
  assert.equal(p.swap.quote,USDC);assert.equal(p.swap.domainUnits,'2000');assert.equal(p.swap.quoteUnits,buy?'200000':'220000');assert.equal(p.volumeMicros,buy?200000n:220000n);
  assert.equal(p.amounts.walletDomainUnits,(buy?2000n-(fees?7n:0n):2000n+(fees?11n:0n)).toString());assert.equal(p.amounts.walletQuoteUnits,(buy?200000n+(fees?11n:0n):220000n-(fees?7n:0n)).toString());
  assert.equal(p.amounts.routerFeeUnits,(fees?(buy?11n:7n):0n).toString());assert.equal(p.amounts.routerDomainFeeUnits,(fees?(buy?7n:11n):0n).toString());
  c.swaps.reverse();assert.equal((await verifyOrderRoute(c)).volumeMicros,p.volumeMicros,'public index row order is immaterial');
 }
 const mutations=[
  ['runtime',c=>c.codeAt=async()=> '0x'],['implementation',c=>c.implementation=addr(99)],['chain',c=>c.transaction.chainId='0x1'],['receipt status',c=>c.receipt.status='0x0'],['tx identity',c=>c.receipt.transactionHash='0x'+'9'.repeat(64)],['removed log',c=>c.receipt.logs[0].removed=true],
  ['indexed amount',c=>c.swaps.at(-1).quoteUnits='58'],['duplicate index',c=>c.swaps.push({...c.swaps[0]})],['wrong index wallet',c=>c.swaps[0].wallet=addr(99)],['wrong index time',c=>c.swaps.at(-1).executedAt='2026-10-07T07:03:00.000Z'],['wrong quote',c=>c.swaps.at(-1).quote=USDC],
  ['unknown pool',c=>c.poolFor=async()=>addr(0)],['reused pool',c=>c.poolFor=async()=>c.pools[0]],['missing pool event',c=>c.receipt.logs=c.receipt.logs.filter(l=>l!==swapLogs(c)[0])],['extra pool event',c=>c.receipt.logs.push({...swapLogs(c)[0]})],['duplicate log index',c=>swapLogs(c)[1].logIndex=swapLogs(c)[0].logIndex],['pool recipient',c=>changePool(c,0,a=>a.recipient=addr(99))],['pool sender',c=>changePool(c,0,a=>a.sender=addr(99))],['pool chained amount',c=>changePool(c,1,a=>a.amount0+=1n)],
  ['unsupported command',c=>innerChange(c,a=>a[0]='0x80')],['extra Universal call',c=>{c.commands.push(c.commands[2]);reencode(c)}],['third route',c=>innerChange(c,a=>{a[0]='0x000000';a[1].push(a[1][0])})],['payer flag',c=>inputChange(c,0,p=>p[4]=false)],['input amount',c=>inputChange(c,0,p=>p[1]+=1n)],['minimum output',c=>inputChange(c,0,p=>p[2]=999999n)],['path token',c=>inputChange(c,0,p=>p[3]=addr(99)+p[3].slice(42))],['path fee',c=>inputChange(c,0,p=>p[3]=p[3].slice(0,42)+'000001'+p[3].slice(48))],
  ['unexplained debit',c=>c.transfer(USDC,c.wallet,addr(99),1n)],['missing transfer',c=>c.receipt.logs.splice(1,1)],['extra transfer',c=>c.transfer(WETH,UNIVERSAL,c.wallet,1n)],['malformed transfer',c=>c.receipt.logs[0].data='0x01'],['wrong pull amount',c=>c.receipt.logs[0].data=v.toHex(999999n,{size:32})],
  ['missing input fee',c=>c.receipt.logs=c.receipt.logs.filter(l=>!(l.address===c.inputToken&&l.topics[2]===v.pad(c.feeTo)))],['missing output fee',c=>c.receipt.logs=c.receipt.logs.filter(l=>!(l.address===c.outputToken&&l.topics[2]===v.pad(c.feeTo)))],['fee recipient',c=>{const l=c.receipt.logs.find(l=>l.address===c.outputToken&&l.topics[2]===v.pad(c.feeTo));l.topics[2]=v.pad(addr(99));}],['sweep amount',c=>{const l=c.receipt.logs.find(l=>l.address===c.outputToken&&l.topics[1]===v.pad(ROUTER)&&l.topics[2]===v.pad(c.wallet));l.data=v.toHex(1n,{size:32});}],['refund amount',c=>{const l=c.receipt.logs.find(l=>l.address===c.inputToken&&l.topics[1]===v.pad(ROUTER)&&l.topics[2]===v.pad(c.wallet));l.data=v.toHex(6n,{size:32});}],
  ['reference quote',c=>c.refs[0].quoteToken=WETH],['reference amount',c=>c.refs[0].quoteUnits='1'],['reference domain amount',c=>c.refs[0].domainUnits='1'],['duplicate reference',c=>c.refs.push({...c.refs[0]})],['reference wallet net instead of gross',c=>c.refs[0].quoteUnits=c.swaps[0].side==='buy'?'200011':'219993'],
 ];
 for(const buy of [true,false])for(const[label,change]of mutations){const c=extendedFixture({buy,inputFee:11n,outputFee:7n,refund:5n});change(c);await assert.rejects(()=>verifyOrderRoute(c),/ORDER_ROUTE_/,label+' '+(buy?'buy':'sell'));}
 const split=extendedFixture();innerChange(split,a=>a[1].reverse());assert.equal((await verifyOrderRoute(split)).volumeMicros,200000n,'the order of independently proved paths does not change economic volume');
 const buy=extendedFixture({shape:'direct',inputFee:1000n}),sell=extendedFixture({buy:false,shape:'split-mixed',outputFee:2000n}),all=[buy,sell],byTx=new Map(all.map(c=>[c.transaction.hash,c]));
 const started='2026-10-07T00:00:00Z',cutoff='2026-10-07T08:00:00Z';
 const rows=all.flatMap(c=>c.swaps.map(s=>({txHash:s.tx,date:s.executedAt,userAddress:s.wallet,contractType:'UNISWAP_V3_POOL',fractionalTokenAmount:(s.side==='buy'?'':'-')+s.domainUnits,quoteTokenAmount:(s.side==='buy'?'-':'')+s.quoteUnits,priceUsd:100,fractionalToken:{address:s.domain,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:s.quote===USDC?'USDC.e':'WETH',decimals:s.quote===USDC?6:18}})));
 const snapshot={manifest:{campaign:{id:'test',state:'active',starts_at:started,ends_at:'2026-11-04T00:00:00Z'},participants:[{participant:'synthetic',entered_at:started}],markets:[{domain_token:buy.domain,quote_token:USDC},{domain_token:buy.domain,quote_token:WETH}]},accounts:[{participant:'synthetic',coverage:{complete:true,coverage_from:started,confirmed_through:cutoff,updated_at:cutoff}}],wallets:[{participant:'synthetic',trade_wallet:buy.wallet,agent:false}],references:all.map(c=>({participant:'synthetic',ref:c.refs[0]})),fills:[]};
 const source={finalized:async()=>({number:'0x200',timestamp:cutoff}),indexStatus:async()=>true,transfers:async()=>all.map(c=>({token:{address_hash:c.domain},transaction_hash:c.transaction.hash,timestamp:c.swaps[0].executedAt})),swaps:async()=>rows,receipt:async tx=>byTx.get(tx).receipt,block:async n=>{const c=all.find(c=>c.receipt.blockNumber===n);return {hash:c.receipt.blockHash,timestamp:c.swaps[0].executedAt}},orderRouterSettlement:async(swaps,refs)=>verifyOrderRoute({...byTx.get(swaps[0].tx),swaps,refs})};
 const result=await collect(snapshot,source,{now:Date.parse(cutoff)+120000});assert.equal(result.report.complete,true);assert.equal(result.packet.fills.length,2,'split routes are one economic fill, not one fill per indexed leg');assert.equal(result.report.counts.volumeUsd,'0.420000');assert.ok(result.packet.fills.every(f=>f.quoteToken===USDC&&f.source==='strategy'));
 assert.deepEqual((await collect({...snapshot,fills:result.packet.fills},source,{now:Date.parse(cutoff)+120000})).packet.fills,result.packet.fills);
 const missing=structuredClone(snapshot);missing.manifest.markets.pop();assert.equal((await collect(missing,source,{now:Date.parse(cutoff)+120000})).report.complete,false);
 const wrongRef=structuredClone(snapshot);wrongRef.references[0].ref.quoteUnits='200001';assert.equal((await collect(wrongRef,source,{now:Date.parse(cutoff)+120000})).report.complete,false);
 const manual=await collect({...snapshot,references:[]},{...source,orderRouterSettlement:async()=>{throw Error('MANUAL_PROOF_SHOULD_NOT_RUN')}},{now:Date.parse(cutoff)+120000});assert.equal(manual.packet.fills.length,0);assert.equal(manual.report.complete,true);
 const ledger=await require('./lib/public-accounting.cjs').reconstruct({participant:'synthetic',wallets:[buy.wallet],from:Date.parse(started),through:Date.parse(cutoff),markets:snapshot.manifest.markets,references:snapshot.references,eligible:result.packet.fills,source:{...source,blockAt:async t=>({number:t<Date.parse(started)?'0x10':'0x200'}),nativeBalance:async()=>0n,nativeHistory:async()=>[],nativeTransaction:async()=>({moves:[],fee:0n,payer:addr(17)}),hasCode:async()=>false,balance:async(w,t,b)=>t===USDC?(b==='0x10'?1000000n:1017000n):0n,valueUsd:async(t,n)=>{assert.equal(t,USDC);return n;}}});
 assert.equal(ledger.complete,true);assert.equal(ledger.events.length,4);assert.equal(ledger.events.find(e=>e.kind==='buy'&&e.token===buy.domain).usd,'0.201000');assert.equal(ledger.events.find(e=>e.kind==='sell').usd,'0.218000');assert.equal(ledger.events.find(e=>e.kind==='sell').notionalUsd,'0.220000');assert.equal(ledger.events.find(e=>e.kind==='sell').units,'2000');assert.ok([...ledger.events,...ledger.openingLots].every(e=>e.token!==WETH));assert.ok(ledger.events.every(e=>!['in','deposit','withdrawal'].includes(e.kind)));
 console.log('PASS generated OrderRouter split-buy/reverse-sell: 8 fee/refund/funding variants, '+(mutations.length*2)+' hostile mutations, exact indexed-leg aggregation, replay, manual exclusion, fee-inclusive FIFO roundtrip and no intermediate WETH capital.');
}


async function splitTopologyTests(){
 for(const shape of ['reversed','direct'])for(const via of [false,true])for(const fees of [false,true]){
  const c=extendedFixture({shape,via,inputFee:fees?11n:0n,outputFee:fees?7n:0n,refund:fees?5n:0n}),p=await verifyOrderRoute(c);
  assert.equal(p.swap.quote,USDC);assert.equal(p.swap.quoteUnits,'200000');assert.equal(p.swap.domainUnits,'2000');assert.equal(p.volumeMicros,200000n);assert.equal(p.amounts.walletQuoteUnits,fees?'200011':'200000');assert.equal(p.amounts.walletDomainUnits,fees?'1993':'2000');assert.equal(p.amounts.pools.length,shape==='direct'?2:3);
  c.swaps.reverse();const reordered=await verifyOrderRoute(c);assert.equal(reordered.swap.quoteUnits,p.swap.quoteUnits);assert.deepEqual(reordered.amounts,p.amounts);
 }
 const mutations=[
  ['foreign path endpoint',c=>inputChange(c,0,p=>p[3]=p[3].slice(0,-40)+addr(99).slice(2))],
  ['foreign path input',c=>inputChange(c,0,p=>p[3]=addr(99)+p[3].slice(42))],
  ['shared pool reused',c=>c.poolFor=async()=>c.pools[0]],
  ['declared duplicate route',c=>innerChange(c,a=>a[1][1]=a[1][0])],
  ['false indexed quote',c=>c.swaps[0].quote=c.swaps[0].quote===USDC?WETH:USDC],
  ['duplicate indexed leg',c=>c.swaps[1]={...c.swaps[0]}],
  ['changed index domain',c=>c.swaps[0].domain=addr(99)],
  ['changed index recipient',c=>c.swaps[0].wallet=addr(99)],
  ['missing second pool event',c=>c.receipt.logs=c.receipt.logs.filter(l=>l!==swapLogs(c).at(-1))],
  ['extra pool event',c=>c.receipt.logs.push({...swapLogs(c)[0]})],
  ['missing domain payment',c=>c.receipt.logs=c.receipt.logs.filter(l=>!(l.address===c.domain&&l.topics[1]===v.pad(c.pools[0])))],
  ['third route',c=>innerChange(c,a=>{a[0]='0x000000';a[1].push(a[1][0]);})],
  ['one route omitted',c=>innerChange(c,a=>a[1].pop())],
  ['fee not paid',c=>c.receipt.logs=c.receipt.logs.filter(l=>l.topics[2]!==v.pad(c.feeTo))],
  ['fee target mismatch',c=>{const l=c.receipt.logs.find(l=>l.topics[2]===v.pad(c.feeTo));l.topics[2]=v.pad(addr(99));}],
  ['extra refund',c=>c.transfer(USDC,ROUTER,c.wallet,1n)],
  ['unexplained intermediate credit',c=>c.transfer(WETH,UNIVERSAL,c.wallet,1n)],
  ['false Strategy aggregate',c=>c.refs[0].domainUnits='1993'],
  ['false Strategy cost',c=>c.refs[0].quoteUnits='200011'],
 ];
 for(const shape of ['reversed','direct'])for(const[label,change]of mutations){const c=extendedFixture({shape,inputFee:11n,outputFee:7n,refund:5n});
  // Both topologies contain a final domain transfer, at different pool positions.
  if(label==='missing domain payment')c.receipt.logs=c.receipt.logs.filter(l=>!(l.address===c.domain&&l.topics[1]===v.pad(c.pools.at(-1))));else change(c);
  await assert.rejects(()=>verifyOrderRoute(c),/ORDER_ROUTE_/,shape+' '+label);
 }
 console.log('PASS OrderRouter split topology: reversed direct/WETH order and two direct fee-tier pools; 8 generated fee/refund/funding variants and '+(mutations.length*2)+' hostile cases.');
}


async function splitSellTests(){
 for(const shape of ['split-mixed','split-reversed','split-direct'])for(const fees of [false,true]){
  const c=extendedFixture({buy:false,shape,inputFee:fees?11n:0n,outputFee:fees?7n:0n,refund:fees?5n:0n,via:fees}),p=await verifyOrderRoute(c);
  assert.equal(p.swap.domainUnits,'2000');assert.equal(p.swap.quoteUnits,'220000');assert.equal(p.volumeMicros,220000n);assert.equal(p.amounts.walletDomainUnits,fees?'2011':'2000');assert.equal(p.amounts.walletQuoteUnits,fees?'219993':'220000');assert.equal(p.amounts.route,'DOMAIN_SPLIT_USDC_EXACT_INPUT_V1');
  c.swaps.reverse();assert.deepEqual((await verifyOrderRoute(c)).amounts,p.amounts);
 }
 const mutations=[
  ['wrong input path',c=>inputChange(c,0,p=>p[3]=addr(99)+p[3].slice(42))],
  ['wrong terminal quote',c=>inputChange(c,0,p=>p[3]=p[3].slice(0,-40)+addr(99).slice(2))],
  ['duplicate indexed leg',c=>c.swaps[1]={...c.swaps[0]}],
  ['wrong indexed quote',c=>c.swaps[0].quote=c.swaps[0].quote===USDC?WETH:USDC],
  ['wrong indexed amount',c=>c.swaps[0].domainUnits='1'],
  ['minimum not reached',c=>inputChange(c,0,p=>p[2]=999999n)],
  ['reused pool',c=>c.poolFor=async()=>c.pools[0]],
  ['missing pool',c=>c.receipt.logs=c.receipt.logs.filter(l=>l!==swapLogs(c)[0])],
  ['wrong pool recipient',c=>changePool(c,0,a=>a.recipient=addr(99))],
  ['missing fee',c=>c.receipt.logs=c.receipt.logs.filter(l=>l.topics[2]!==v.pad(c.feeTo))],
  ['extra refund',c=>c.transfer(c.domain,ROUTER,c.wallet,1n)],
  ['extra route',c=>innerChange(c,a=>{a[0]='0x000000';a[1].push(a[1][0]);})],
  ['wallet proceeds used as Strategy notional',c=>c.refs[0].quoteUnits='219993'],
  ['wallet domain fee used as Strategy amount',c=>c.refs[0].domainUnits='2011'],
 ];
 for(const shape of ['split-mixed','split-reversed','split-direct'])for(const[label,change]of mutations){const c=extendedFixture({buy:false,shape,inputFee:11n,outputFee:7n,refund:5n});change(c);await assert.rejects(()=>verifyOrderRoute(c),/ORDER_ROUTE_/,shape+' '+label);}
 console.log('PASS OrderRouter split sells: direct/WETH in either order and two direct fee tiers, 6 fee/refund cases and '+mutations.length*3+' hostile cases.');
}

async function main(){
 await splitSellTests();
 await splitTopologyTests();
 await extendedTests();
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
module.exports={fixture,extendedFixture};
