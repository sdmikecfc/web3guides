'use strict';
const assert=require('node:assert/strict');
const {parseAbi,encodeFunctionData,decodeFunctionData,encodeAbiParameters,decodeAbiParameters,toEventSelector}=require('viem');
const {verifyNativeRouterPurchase,ROUTER,RUNTIME_HASH}=require('./lib/public-native-router.cjs');
const {nativeSettlement}=require('./lib/public-native-accounting.cjs');
const {CHAIN,USDC,WETH,TRANSFER}=require('./lib/public-trade-worker.cjs');
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),word=x=>'0x'+BigInt(x).toString(16).padStart(64,'0'),types=(...names)=>names.map(type=>({type}));
const wallet=addr(11),token='0xa100000000f5b8b5267929ca39e610fd36162561',feeTo=addr(12),domainPool=addr(13),quotePool=addr(14);
const abi=parseAbi(['function execute(bytes commands,bytes[] inputs) payable']);
const enc=(names,args)=>encodeAbiParameters(types(...names),args);
function nativeRouterFixture({twoHop=true,withFee=true,refund=true}={}){
 const value=10000n,spent=refund?9800n:value,output=withFee?100100000n:100000000n,quote=twoHop?627563n:spent,fee=withFee?100000n:0n;
 const path=token+'000bb8'+(twoHop?USDC.slice(2)+'0001f4':'')+WETH.slice(2);
 const inputs=[enc(['address','uint256'],[addr(2),value]),enc(['address','uint256','uint256','bytes','bool'],[addr(2),output,value,path,false])];
 if(withFee)inputs.push(enc(['address','address','uint256'],[token,feeTo,fee]));
 inputs.push(enc(['address','address','uint256'],[token,addr(1),output-fee]),enc(['address','uint256'],[addr(1),0n]));
 const transaction={hash:word(77),blockHash:word(88),blockNumber:'0x10',chainId:'0x'+CHAIN.toString(16),from:wallet,to:ROUTER,value:'0x'+value.toString(16),input:encodeFunctionData({abi,functionName:'execute',args:[withFee?'0x0b0105040c':'0x0b01040c',inputs]})};
 const receipt={transactionHash:transaction.hash,blockHash:transaction.blockHash,blockNumber:transaction.blockNumber,status:'0x1',logs:[]};
 const add=(address,topics,data)=>receipt.logs.push({address,topics,data,removed:false,transactionHash:transaction.hash,blockHash:transaction.blockHash,logIndex:'0x'+receipt.logs.length.toString(16)});
 const transfer=(asset,from,to,n)=>add(asset,[TRANSFER,word(from),word(to)],word(n));
 const swap=(pool,input,outputToken,amountIn,amountOut,recipient)=>{const input0=BigInt(input)<BigInt(outputToken);add(pool,[toEventSelector('Swap(address,address,int256,int256,uint160,uint128,int24)'),word(ROUTER),word(recipient)],enc(['int256','int256','uint160','uint128','int24'],[input0?amountIn:-amountOut,input0?-amountOut:amountIn,1n<<96n,100000n,0]));};
 add(WETH,[toEventSelector('Deposit(address,uint256)'),word(ROUTER)],word(value));
 transfer(token,domainPool,ROUTER,output);
 if(twoHop)transfer(USDC,quotePool,domainPool,quote);
 transfer(WETH,ROUTER,twoHop?quotePool:domainPool,spent);
 if(twoHop)swap(quotePool,WETH,USDC,spent,quote,domainPool);
 swap(domainPool,twoHop?USDC:WETH,token,quote,output,ROUTER);
 if(withFee)transfer(token,ROUTER,feeTo,fee);
 transfer(token,ROUTER,wallet,output-fee);
 if(refund)add(WETH,[toEventSelector('Withdrawal(address,uint256)'),word(ROUTER)],word(value-spent));
 const native={payer:wallet,fee:7n,moves:[{from:wallet,to:ROUTER,units:value},{from:ROUTER,to:WETH,units:value}]};
 if(refund)native.moves.push({from:WETH,to:ROUTER,units:value-spent},{from:ROUTER,to:wallet,units:value-spent});
 const poolFor=async(a,b,feeAt,block)=>{assert.equal(block,receipt.blockNumber);if(a===token&&b===(twoHop?USDC:WETH)&&feeAt===3000)return domainPool;if(twoHop&&a===USDC&&b===WETH&&feeAt===500)return quotePool;return addr(0);};
 return {transaction,receipt,native,wallet,codeHash:RUNTIME_HASH,poolFor};
}
function changeInput(f,index,names,change){const c=decodeFunctionData({abi,data:f.transaction.input});const p=[...decodeAbiParameters(types(...names),c.args[1][index])];change(p);c.args[1][index]=enc(names,p);f.transaction.input=encodeFunctionData({abi,functionName:'execute',args:c.args});}
function nativeExactInputFixture({output=100000000n,bips=10n}={}){
 const f=nativeRouterFixture({twoHop:true,withFee:true,refund:false}),fee=output*bips/10000n,received=output-fee;
 const swapTopic=toEventSelector('Swap(address,address,int256,int256,uint160,uint128,int24)');
 for(const l of f.receipt.logs){
  if(l.topics[0]===TRANSFER&&l.address===token){if(l.topics[1]===word(domainPool))l.data=word(output);else if(l.topics[2]===word(feeTo))l.data=word(fee);else l.data=word(received);}
  if(l.topics[0]===TRANSFER&&l.address===USDC)l.topics[2]=word(ROUTER);
  if(l.topics[0]===swapTopic&&l.address===quotePool)l.topics[2]=word(ROUTER);
  if(l.topics[0]===swapTopic&&l.address===domainPool){const p=[...decodeAbiParameters(types('int256','int256','uint160','uint128','int24'),l.data)];p[1]=-output;l.data=enc(['int256','int256','uint160','uint128','int24'],p);}
 }
 f.receipt.logs.push({...f.receipt.logs.find(l=>l.topics[0]===TRANSFER&&l.address===USDC),topics:[TRANSFER,word(ROUTER),word(domainPool)],logIndex:'0xff'});
 const path=WETH+'0001f4'+USDC.slice(2)+'000bb8'+token.slice(2);
 const inputs=[enc(['address','uint256'],[addr(2),10000n]),enc(['address','uint256','uint256','bytes','bool'],[addr(2),10000n,output,path,false]),enc(['address','address','uint256'],[token,feeTo,bips]),enc(['address','address','uint256'],[token,addr(1),received])];
 f.transaction.input=encodeFunctionData({abi,functionName:'execute',args:['0x0b000604',inputs]});
 f.poolFor=async(a,b,feeAt,block)=>{assert.equal(block,f.receipt.blockNumber);return a===WETH&&b===USDC&&feeAt===500?quotePool:a===USDC&&b===token&&feeAt===3000?domainPool:addr(0);};
 return f;
}
async function main(){
 for(const twoHop of [false,true])for(const withFee of [false,true])for(const refund of [false,true]){
  const f=nativeRouterFixture({twoHop,withFee,refund}),r=await verifyNativeRouterPurchase(f);
  assert.equal(r.units,'100000000');assert.equal(r.nativeSpent,refund?'9800':'10000');assert.equal(r.nativeRefund,refund?'200':'0');assert.equal(r.domainPoolUnits,withFee?'100100000':'100000000');assert.equal(r.domainQuoteToken,twoHop?USDC:WETH);assert.equal(r.domainQuoteUnits,twoHop?'627563':r.nativeSpent);assert.equal(r.pools.length,twoHop?2:1);
 }
 const bad=async mutate=>{const f=nativeRouterFixture();mutate(f);await assert.rejects(()=>verifyNativeRouterPurchase(f),/NATIVE_ROUTER_/);};
 await bad(f=>{f.codeHash=word(1);});
 await bad(f=>{f.receipt.status='0x0';});
 await bad(f=>{f.receipt.blockHash=word(90);});
 await bad(f=>{f.transaction.chainId='0x1';});
 await bad(f=>{f.transaction.input+='00';});
 await bad(f=>{const c=decodeFunctionData({abi,data:f.transaction.input});c.args[0]='0x8b0105040c';f.transaction.input=encodeFunctionData({abi,functionName:'execute',args:c.args});});
 await bad(f=>changeInput(f,0,['address','uint256'],p=>p[1]--));
 await bad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[4]=true));
 await bad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[0]=wallet));
 await bad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[1]++));
 await bad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[2]--));
 await bad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[3]=token+'000bb8'+addr(99).slice(2)+'0001f4'+WETH.slice(2)));
 await bad(f=>changeInput(f,2,['address','address','uint256'],p=>p[2]=0n));
 await bad(f=>changeInput(f,2,['address','address','uint256'],p=>p[2]++));
 await bad(f=>changeInput(f,2,['address','address','uint256'],p=>p[1]=wallet));
 await bad(f=>changeInput(f,3,['address','address','uint256'],p=>p[1]=feeTo));
 await bad(f=>changeInput(f,3,['address','address','uint256'],p=>p[2]++));
 await bad(f=>changeInput(f,4,['address','uint256'],p=>p[0]=feeTo));
 await bad(f=>{f.poolFor=async()=>addr(99);});
 await bad(f=>{f.poolFor=async()=>domainPool;});
 await bad(f=>{f.native.moves[3].units--;});
 await bad(f=>{f.native.moves.push({from:wallet,to:feeTo,units:1n});});
 await bad(f=>{f.receipt.logs[0].data=word(9999);});
 await bad(f=>{f.receipt.logs[0].removed=true;});
 await bad(f=>{f.receipt.logs[0].transactionHash=word(99);});
 await bad(f=>{f.receipt.logs[1].logIndex=f.receipt.logs[0].logIndex;});
 await bad(f=>{const l=f.receipt.logs.find(l=>l.topics[0]===TRANSFER&&l.topics[2]===word(feeTo));l.data=word(99999);});
 await bad(f=>{const l={...f.receipt.logs[1],topics:[TRANSFER,word(wallet),word(feeTo)],logIndex:'0xff',data:word(1)};f.receipt.logs.push(l);});
 await bad(f=>{const l=f.receipt.logs.find(l=>l.address===domainPool&&l.topics.length===3);f.receipt.logs.push({...l,logIndex:'0xff'});});
 await bad(f=>{const l=f.receipt.logs.find(l=>l.address===domainPool&&l.topics.length===3);l.topics[2]=word(wallet);});
 let f=nativeRouterFixture();f.transaction.to=addr(99);assert.equal(await verifyNativeRouterPurchase(f),null);
 f=nativeRouterFixture();f.transaction.value='0x0';assert.equal(await verifyNativeRouterPurchase(f),null);
 for(const output of [100000000n,999n]){
  const r=await verifyNativeRouterPurchase(nativeExactInputFixture({output}));
  assert.equal(r.nativeSpent,'10000');assert.equal(r.nativeRefund,'0');assert.equal(r.domainPoolUnits,output.toString());assert.equal(r.domainQuoteToken,USDC);assert.equal(r.domainQuoteUnits,'627563');assert.equal(r.units,(output-output*10n/10000n).toString());
 }
 const swapTopic=toEventSelector('Swap(address,address,int256,int256,uint160,uint128,int24)');
 const exactBad=async mutate=>{const f=nativeExactInputFixture();mutate(f);await assert.rejects(()=>verifyNativeRouterPurchase(f),/NATIVE_ROUTER_/);};
 await exactBad(f=>{f.codeHash=word(1);});
 await exactBad(f=>{f.receipt.status='0x0';});
 await exactBad(f=>{f.receipt.blockHash=word(90);});
 await exactBad(f=>{f.transaction.chainId='0x1';});
 await exactBad(f=>{f.transaction.value='0x270f';});
 await exactBad(f=>{f.transaction.input+='00';});
 await exactBad(f=>{const c=decodeFunctionData({abi,data:f.transaction.input});c.args[0]='0x0b800604';f.transaction.input=encodeFunctionData({abi,functionName:'execute',args:c.args});});
 await exactBad(f=>changeInput(f,0,['address','uint256'],p=>p[1]--));
 await exactBad(f=>changeInput(f,0,['address','uint256'],p=>p[0]=wallet));
 await exactBad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[1]--));
 await exactBad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[2]++));
 await exactBad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[4]=true));
 await exactBad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[0]=wallet));
 await exactBad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[3]=WETH+'000bb8'+token.slice(2)));
 await exactBad(f=>changeInput(f,1,['address','uint256','uint256','bytes','bool'],p=>p[3]=WETH+'0001f4'+addr(99).slice(2)+'000bb8'+token.slice(2)));
 await exactBad(f=>changeInput(f,2,['address','address','uint256'],p=>p[2]++));
 await exactBad(f=>changeInput(f,2,['address','address','uint256'],p=>p[2]=10000n));
 await exactBad(f=>changeInput(f,2,['address','address','uint256'],p=>p[1]=wallet));
 await exactBad(f=>changeInput(f,3,['address','address','uint256'],p=>p[2]++));
 await exactBad(f=>changeInput(f,3,['address','address','uint256'],p=>p[1]=feeTo));
 await exactBad(f=>{f.poolFor=async()=>addr(99);});
 await exactBad(f=>{f.poolFor=async()=>domainPool;});
 await exactBad(f=>{f.native.moves.push({from:ROUTER,to:wallet,units:1n});});
 await exactBad(f=>{f.native.moves[1].units--;});
 await exactBad(f=>{f.receipt.logs[0].data=word(9999);});
 await exactBad(f=>{f.receipt.logs.push({...f.receipt.logs[0],logIndex:'0xfe'});});
 await exactBad(f=>{f.receipt.logs[0].removed=true;});
 await exactBad(f=>{f.receipt.logs[0].blockNumber='0x11';});
 await exactBad(f=>{f.receipt.logs[0].transactionHash=word(99);});
 await exactBad(f=>{f.receipt.logs[1].logIndex=f.receipt.logs[0].logIndex;});
 await exactBad(f=>{const l=f.receipt.logs.find(l=>l.address===USDC&&l.topics[1]===word(ROUTER));l.data=word(627562);});
 await exactBad(f=>{const l=f.receipt.logs.find(l=>l.address===token&&l.topics[2]===word(wallet));l.data=word(99900001);});
 await exactBad(f=>{const l=f.receipt.logs.find(l=>l.address===token&&l.topics[2]===word(feeTo));l.data=word(100001);});
 await exactBad(f=>{const l=f.receipt.logs.find(l=>l.address===quotePool&&l.topics[0]===swapTopic);l.topics[2]=word(domainPool);});
 await exactBad(f=>{const l=f.receipt.logs.find(l=>l.address===quotePool&&l.topics[0]===swapTopic);const p=[...decodeAbiParameters(types('int256','int256','uint160','uint128','int24'),l.data)];p[0]=-627562n;l.data=enc(['int256','int256','uint160','uint128','int24'],p);});
 await exactBad(f=>{f.receipt.logs.push({...f.receipt.logs.find(l=>l.topics[0]===TRANSFER),logIndex:'0xfe',topics:[TRANSFER,word(wallet),word(feeTo)],data:word(1)});});
 console.log('PASS native router purchase: pinned runtime, 1/2-hop exact-output route, exact ETH wrap/refund, declared output fee, factory pools, token/native conservation and adversarial rejection.');
 console.log('PASS native exact-input purchase: pinned two-hop wrap/swap/portion/sweep, gross versus net output, zero-rounded fee, full native/token conservation and hostile route/amount rejection.');
 if(process.argv[2]==='--public-fixture'){
  const b=JSON.parse(require('node:fs').readFileSync(process.argv[3],'utf8')),native=nativeSettlement(b.transaction,b.receipt,b.traces.items);
  // This offline receipt test pins the observed pools. The live source adapter
  // independently queries the historical factory before admitting the ledger.
  const poolFor=async(a,q,fee)=>a===token&&q===USDC&&fee===3000?'0x15d316e4d0a309608c0fa47a8b9419077a6b4e12':a===USDC&&q===WETH&&fee===500?'0xe8e9ca039b1a9467ed32e8b2337f657c8c794754':addr(0);
  const r=await verifyNativeRouterPurchase({transaction:b.transaction,receipt:b.receipt,native,wallet:b.transaction.from,codeHash:b.runtimeHash,poolFor});
  assert.equal(r.units,'100000000');assert.equal(r.nativeSpent,'214880117132687');assert.equal(r.nativeRefund,'3769154048095');assert.equal(r.domainQuoteUnits,'628587');
  console.log('PASS saved public native purchase receipt: net token units, pool quote, output fee and native refund reconcile.');
 }
 if(process.argv[2]==='--exact-input-fixture'){
  const b=JSON.parse(require('node:fs').readFileSync(process.argv[3],'utf8')),v=require('viem');
  const block=b.calls.find(c=>c.method==='eth_getBlockByNumber'&&c.params[0]===b.receipt.blockNumber)?.result;
  const final=b.calls.find(c=>c.method==='eth_getBlockByNumber'&&c.params[0]==='finalized')?.result;
  assert.equal(block?.hash,b.receipt.blockHash);assert.ok(BigInt(final.number)>=BigInt(block.number));
  const code=b.calls.find(c=>c.method==='eth_getCode'&&c.params[0]===ROUTER&&c.params[1]===b.receipt.blockNumber)?.result;
  assert.equal(v.keccak256(code),RUNTIME_HASH);
  assert.equal(b.explorer.length,2);assert.deepEqual(b.explorer[0].data,b.explorer[1].data);assert.equal(b.explorer[0].data.next_page_params,null);
  const native=nativeSettlement(b.transaction,b.receipt,b.explorer[0].data.items);
  const factoryAbi=parseAbi(['function getPool(address,address,uint24) view returns(address)']);
  const poolFor=async(a,q,fee,at)=>{const data=encodeFunctionData({abi:factoryAbi,functionName:'getPool',args:[a,q,fee]});const c=b.calls.find(c=>c.method==='eth_call'&&c.params[0].to==='0x2e50b586d5bcd04cb6125e028a6a669f7f3cf1c2'&&c.params[0].data===data&&c.params[1]===at);assert.ok(c,'historical factory proof must exist');return v.decodeFunctionResult({abi:factoryAbi,functionName:'getPool',data:c.result});};
  const r=await verifyNativeRouterPurchase({transaction:b.transaction,receipt:b.receipt,native,wallet:b.transaction.from,codeHash:v.keccak256(code),poolFor});
  assert.deepEqual(r,b.result);
  console.log('PASS saved public exact-input receipt: independently reconstructed native traces, historical runtime/factory, finalized block and complete native/token conservation.');
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={nativeRouterFixture,nativeExactInputFixture};
