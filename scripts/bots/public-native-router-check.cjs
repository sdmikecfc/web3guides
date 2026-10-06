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
 console.log('PASS native router purchase: pinned runtime, 1/2-hop exact-output route, exact ETH wrap/refund, declared output fee, factory pools, token/native conservation and adversarial rejection.');
 if(process.argv[2]==='--public-fixture'){
  const b=JSON.parse(require('node:fs').readFileSync(process.argv[3],'utf8')),native=nativeSettlement(b.transaction,b.receipt,b.traces.items);
  // This offline receipt test pins the observed pools. The live source adapter
  // independently queries the historical factory before admitting the ledger.
  const poolFor=async(a,q,fee)=>a===token&&q===USDC&&fee===3000?'0x15d316e4d0a309608c0fa47a8b9419077a6b4e12':a===USDC&&q===WETH&&fee===500?'0xe8e9ca039b1a9467ed32e8b2337f657c8c794754':addr(0);
  const r=await verifyNativeRouterPurchase({transaction:b.transaction,receipt:b.receipt,native,wallet:b.transaction.from,codeHash:b.runtimeHash,poolFor});
  assert.equal(r.units,'100000000');assert.equal(r.nativeSpent,'214880117132687');assert.equal(r.nativeRefund,'3769154048095');assert.equal(r.domainQuoteUnits,'628587');
  console.log('PASS saved public native purchase receipt: net token units, pool quote, output fee and native refund reconcile.');
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={nativeRouterFixture};
