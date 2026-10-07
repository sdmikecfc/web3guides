'use strict';
const assert=require('node:assert/strict');
const {parseAbi,encodeFunctionData,decodeFunctionData,encodeAbiParameters,decodeAbiParameters,toEventSelector}=require('viem');
const {verifyNativeRouterPurchase,ROUTER,RUNTIME_HASH}=require('./lib/public-native-router.cjs');
const {nativeSettlement}=require('./lib/public-native-accounting.cjs');
const {CHAIN,USDC,WETH,TRANSFER}=require('./lib/public-trade-worker.cjs');
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),word=x=>'0x'+BigInt(x).toString(16).padStart(64,'0');
const wallet=addr(11),feeTo=addr(12),pools=[addr(13),addr(14)],abi=parseAbi(['function execute(bytes commands,bytes[] inputs) payable']);
const enc=(names,args)=>encodeAbiParameters(names.map(type=>({type})),args);
function nativeQuoteFixture({split=true,withFee=true,refund=true}={}){
 const value=10000n,spent=refund?9800n:value,total=withFee?90100000n:90000000n,fee=withFee?100000n:0n;
 const rows=split?[{pool:pools[0],fee:3000,output:60000000n,input:6000n,max:6000n},{pool:pools[1],fee:500,output:total-60000000n,input:spent-6000n,max:4000n}]:[{pool:pools[0],fee:3000,output:total,input:spent,max:value}];
 const inputs=[enc(['address','uint256'],[addr(2),value])];
 for(const r of rows)inputs.push(enc(['address','uint256','uint256','bytes','bool'],[addr(2),r.output,r.max,USDC+r.fee.toString(16).padStart(6,'0')+WETH.slice(2),false]));
 if(withFee)inputs.push(enc(['address','address','uint256'],[USDC,feeTo,fee]));
 inputs.push(enc(['address','address','uint256'],[USDC,addr(1),total-fee]),enc(['address','uint256'],[addr(1),0n]));
 const tx={hash:word(77),blockHash:word(88),blockNumber:'0x10',chainId:'0x'+CHAIN.toString(16),from:wallet,to:ROUTER,value:'0x'+value.toString(16),input:encodeFunctionData({abi,functionName:'execute',args:['0x0b'+'01'.repeat(rows.length)+(withFee?'05':'')+'040c',inputs]})};
 const receipt={transactionHash:tx.hash,blockHash:tx.blockHash,blockNumber:tx.blockNumber,status:'0x1',logs:[]};
 const add=(address,topics,data)=>receipt.logs.push({address,topics,data,removed:false,transactionHash:tx.hash,blockHash:tx.blockHash,logIndex:'0x'+receipt.logs.length.toString(16)});
 const transfer=(token,from,to,n)=>add(token,[TRANSFER,word(from),word(to)],word(n));
 add(WETH,[toEventSelector('Deposit(address,uint256)'),word(ROUTER)],word(value));
 for(const r of rows){transfer(USDC,r.pool,ROUTER,r.output);transfer(WETH,ROUTER,r.pool,r.input);const input0=BigInt(WETH)<BigInt(USDC);add(r.pool,[toEventSelector('Swap(address,address,int256,int256,uint160,uint128,int24)'),word(ROUTER),word(ROUTER)],enc(['int256','int256','uint160','uint128','int24'],[input0?r.input:-r.output,input0?-r.output:r.input,1n<<96n,100000n,0]));}
 if(withFee)transfer(USDC,ROUTER,feeTo,fee);transfer(USDC,ROUTER,wallet,total-fee);
 if(refund)add(WETH,[toEventSelector('Withdrawal(address,uint256)'),word(ROUTER)],word(value-spent));
 const native={payer:wallet,fee:7n,moves:[{from:wallet,to:ROUTER,units:value},{from:ROUTER,to:WETH,units:value}]};
 if(refund)native.moves.push({from:WETH,to:ROUTER,units:value-spent},{from:ROUTER,to:wallet,units:value-spent});
 return {transaction:tx,receipt,native,wallet,codeHash:RUNTIME_HASH,poolFor:async(a,b,f,block)=>{assert.equal(block,receipt.blockNumber);return a===USDC&&b===WETH?rows.find(r=>r.fee===f)?.pool||addr(0):addr(0)}};
}
function change(f,index,names,mutate){const c=decodeFunctionData({abi,data:f.transaction.input}),v=[...decodeAbiParameters(names.map(type=>({type})),c.args[1][index])];mutate(v);c.args[1][index]=enc(names,v);f.transaction.input=encodeFunctionData({abi,functionName:'execute',args:c.args});}
async function main(){
 for(const split of [false,true])for(const withFee of [false,true])for(const refund of [false,true]){const f=nativeQuoteFixture({split,withFee,refund}),p=await verifyNativeRouterPurchase(f);assert.equal(p.kind,'quote_conversion');assert.equal(p.token,USDC);assert.equal(p.units,'90000000');assert.equal(p.nativeSpent,refund?'9800':'10000');assert.equal(p.nativeRefund,refund?'200':'0');assert.equal(p.pools.length,split?2:1);assert.equal(p.domainQuoteToken,undefined);}
 const bad=async mutate=>{const f=nativeQuoteFixture();mutate(f);await assert.rejects(()=>verifyNativeRouterPurchase(f),/NATIVE_(QUOTE_)?ROUTER_/);};
 await bad(f=>f.codeHash=word(1));await bad(f=>f.receipt.status='0x0');
 await bad(f=>change(f,1,['address','uint256','uint256','bytes','bool'],p=>p[2]=5999n));
 await bad(f=>change(f,1,['address','uint256','uint256','bytes','bool'],p=>p[4]=true));
 await bad(f=>change(f,2,['address','uint256','uint256','bytes','bool'],p=>p[3]=addr(99)+'0001f4'+WETH.slice(2)));
 await bad(f=>change(f,2,['address','uint256','uint256','bytes','bool'],p=>p[2]=5000n));
 await bad(f=>change(f,3,['address','address','uint256'],p=>p[2]++));
 await bad(f=>change(f,3,['address','address','uint256'],p=>p[1]=wallet));
 await bad(f=>change(f,4,['address','address','uint256'],p=>p[1]=feeTo));
 await bad(f=>change(f,5,['address','uint256'],p=>p[0]=feeTo));
 await bad(f=>f.poolFor=async()=>pools[0]);await bad(f=>f.poolFor=async()=>addr(0));
 await bad(f=>f.native.moves[3].units--);await bad(f=>f.native.moves.push({from:wallet,to:feeTo,units:1n}));
 await bad(f=>f.receipt.logs[1].data=word(1));await bad(f=>f.receipt.logs[1].removed=true);await bad(f=>f.receipt.logs[1].logIndex=f.receipt.logs[0].logIndex);
 const {reconstruct}=require('./lib/public-accounting.cjs');
 const {options}=await require('./native-purchase-ledger-check.cjs').nativePurchaseLedgerFixture(nativeQuoteFixture());
 await assert.rejects(()=>reconstruct(options),/ACCOUNTING_FILL_MISSING/,'quote conversion cannot validate a supplied eligible fill');
 options.eligible=[];
 const ledger=await reconstruct(options),buy=ledger.events.find(e=>e.kind==='buy');
 assert.equal(buy.units,'90000000');assert.equal(buy.usd,'0.009807','cost is actual native debit plus gas, not max input');
 assert.equal(buy.token,USDC);assert.equal(buy.economicId,undefined,'even an invalid caller-supplied quote fill is not rewardable');assert.equal(buy.notionalUsd,undefined);
 assert.equal(ledger.events.filter(e=>e.kind==='in').length,0,'refund is not new capital');
 options.source.balance=async()=>0n;await assert.rejects(()=>reconstruct(options),/CLOSING_BALANCE_MISMATCH/);
 console.log('PASS native quote conversion: pinned runtime, one/split pool exact-output, paid fee, exact refunds, pool limits and conservation; malformed flows rejected.');
 if(process.argv[2]==='--public-fixture'){
  const b=JSON.parse(require('fs').readFileSync(process.argv[3],'utf8'));
  const p=await verifyNativeRouterPurchase({transaction:b.transaction,receipt:b.receipt,native:nativeSettlement(b.transaction,b.receipt,b.traces),wallet:b.transaction.from,codeHash:b.runtimeHash,poolFor:async(a,q,fee)=>a===USDC&&q===WETH?b.pools.find(p=>p.fee===fee)?.address||addr(0):addr(0)});
  assert.equal(p.kind,'quote_conversion');assert.equal(p.units,'90000000');assert.equal(p.nativeSpent,'30779947337913841');assert.equal(p.nativeRefund,'769498683447846');assert.equal(p.outputFeeUnits,'90000');
  console.log('PASS saved public split ETH/USDC conversion: 90 USDC received; 0.09 USDC fee and all ETH movements reconcile.');
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={nativeQuoteFixture};
