'use strict';
const assert=require('node:assert/strict'),v=require('viem');
const {verifyNativeQuoteOutput}=require('./lib/public-native-quote-output.cjs');
const {ROUTER,RUNTIME_HASH}=require('./lib/public-native-router.cjs');
const {CHAIN,USDC,WETH,TRANSFER}=require('./lib/public-trade-worker.cjs');
const a=n=>'0x'+n.toString(16).padStart(40,'0'),word=n=>'0x'+BigInt(n).toString(16).padStart(64,'0'),wallet=a(11),feeTo=a(12),pool=a(13);
const abi=v.parseAbi(['function execute(bytes commands,bytes[] inputs) payable']),enc=(ts,ps)=>v.encodeAbiParameters(ts.map(type=>({type})),ps);
function fixture(){
 const input=1000000n,output=1000000000n,fee=1000000n,received=output-fee;
 const inputs=[enc(['address','uint256','uint256','bytes','bool'],[a(2),input,output,USDC+'000064'+WETH.slice(2),true]),enc(['address','address','uint256'],[WETH,feeTo,10n]),enc(['address','uint256'],[wallet,received])];
 const transaction={hash:word(77),blockHash:word(88),blockNumber:'0x10',chainId:'0x'+CHAIN.toString(16),from:wallet,to:ROUTER,value:'0x0',input:v.encodeFunctionData({abi,functionName:'execute',args:['0x00060c',inputs]})};
 const receipt={transactionHash:transaction.hash,blockHash:transaction.blockHash,blockNumber:transaction.blockNumber,transactionIndex:'0x0',to:ROUTER,status:'0x1',logs:[]};
 const add=(address,topics,data)=>receipt.logs.push({address,topics,data,removed:false,transactionHash:transaction.hash,blockHash:transaction.blockHash,blockNumber:transaction.blockNumber,logIndex:'0x'+receipt.logs.length.toString(16)});
 const transfer=(token,from,to,n)=>add(token,[TRANSFER,word(from),word(to)],word(n));
 transfer(USDC,wallet,pool,input);transfer(WETH,pool,ROUTER,output);
 const input0=BigInt(USDC)<BigInt(WETH);
 add(pool,[v.toEventSelector('Swap(address,address,int256,int256,uint160,uint128,int24)'),word(ROUTER),word(ROUTER)],enc(['int256','int256','uint160','uint128','int24'],[input0?input:-output,input0?-output:input,1n<<96n,10000n,0]));
 transfer(WETH,ROUTER,feeTo,fee);add(WETH,[v.toEventSelector('Withdrawal(address,uint256)'),word(ROUTER)],word(received));
 return {transaction,receipt,native:{payer:wallet,fee:7n,moves:[{from:WETH,to:ROUTER,units:received},{from:ROUTER,to:wallet,units:received}]},wallets:[wallet],codeHash:RUNTIME_HASH,poolFor:async(x,y,f,b)=>{assert.equal(b,receipt.blockNumber);return x===USDC&&y===WETH&&f===100?pool:a(0);}};
}
function change(f,index,types,mutate){const c=v.decodeFunctionData({abi,data:f.transaction.input});const p=[...v.decodeAbiParameters(types.map(type=>({type})),c.args[1][index])];mutate(p);c.args[1][index]=enc(types,p);f.transaction.input=v.encodeFunctionData({abi,functionName:'execute',args:c.args});}
(async()=>{
 const proof=await verifyNativeQuoteOutput(fixture());assert.equal(proof.kind,'native_quote_conversion');assert.equal(proof.inputUnits,'1000000');assert.equal(proof.nativeReceived,'999000000');assert.equal(proof.economicId,undefined);
 let checks=0;const bad=async edit=>{const f=fixture();edit(f);await assert.rejects(()=>verifyNativeQuoteOutput(f),/NATIVE_QUOTE_OUTPUT_/);checks++;};
 await bad(f=>f.codeHash=word(1));await bad(f=>f.receipt.status='0x0');await bad(f=>f.receipt.blockHash=word(1));await bad(f=>f.receipt.logs[0].removed=true);await bad(f=>f.receipt.logs[1].logIndex=f.receipt.logs[0].logIndex);
 await bad(f=>f.poolFor=async()=>a(0));await bad(f=>f.native.moves.pop());await bad(f=>f.native.moves[1].units--);await bad(f=>f.native.moves.push({from:wallet,to:feeTo,units:1n}));await bad(f=>f.native.payer=feeTo);await bad(f=>f.receipt.logs[0].data=word(1));await bad(f=>f.receipt.logs[3].data=word(1));await bad(f=>f.receipt.logs[4].data=word(1));
 await bad(f=>change(f,0,['address','uint256','uint256','bytes','bool'],p=>p[1]++));await bad(f=>change(f,0,['address','uint256','uint256','bytes','bool'],p=>p[4]=false));await bad(f=>change(f,0,['address','uint256','uint256','bytes','bool'],p=>p[3]=a(22)+'000064'+WETH.slice(2)));
 await bad(f=>change(f,1,['address','address','uint256'],p=>p[2]++));await bad(f=>change(f,1,['address','address','uint256'],p=>p[1]=wallet));await bad(f=>change(f,2,['address','uint256'],p=>p[1]++));await bad(f=>change(f,2,['address','uint256'],p=>p[0]=feeTo));
 assert.equal(await verifyNativeQuoteOutput({...fixture(),transaction:{...fixture().transaction,to:a(9)}}),null);
 console.log('PASS native quote output: exact USDC debit, WETH fee, native unwrap, canonical factory pool and '+checks+' adversarial mutations; no trading reward.');
})().catch(e=>{console.error(e);process.exitCode=1});
module.exports={nativeQuoteOutputFixture:fixture};
