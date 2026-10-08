'use strict';
// Reviewed direct UniversalRouter ERC20 V3 exact-input -> PAY_PORTION -> SWEEP.
// This proves wallet cost/proceeds; it does not establish MCP/Strategy eligibility.
// Pinned Dispatcher/Payments/V3SwapRouter source: Doma Explorer, reviewed 2026-10-08.
const {CHAIN,USDC,WETH,TRANSFER,receiptFlows}=require('./public-trade-worker.cjs');
const ROUTER='0x5089863e97196773038f98459262d866f2281f58';
const RUNTIME_HASH='0xe16c4e73f116df542880bac897fef57f4162c2c916de66e4f97f7a938e63170f';
const lower=x=>String(x||'').toLowerCase(),zero='0x'+'0'.repeat(40);
const addr=x=>/^0x[0-9a-f]{40}$/.test(lower(x))?lower(x):null;
const fail=code=>{throw Error('UNIVERSAL_ROUTER_'+code);};
const types=(...names)=>names.map(type=>({type}));
async function verifyUniversalSettlement(s,receipt,{transaction:tx,codeHash,poolFor}){
 if(lower(tx?.to)!==ROUTER)return null;
 if(lower(codeHash)!==RUNTIME_HASH)fail('UNREVIEWED_RUNTIME');
 const wallet=addr(s.wallet),domain=addr(s.domain),quote=addr(s.quote);
 if(!wallet||!domain||![USDC,WETH].includes(quote)||[USDC,WETH,zero].includes(domain)||!['buy','sell'].includes(s.side))fail('INDEX_INVALID');
 if(!/^0x[0-9a-f]{64}$/.test(s.tx)||!/^0x[0-9a-f]{64}$/.test(lower(tx.blockHash))||Number(BigInt(tx.chainId))!==CHAIN||BigInt(tx.value)!==0n||receipt?.status!=='0x1'||lower(tx.hash)!==s.tx||lower(receipt.transactionHash)!==s.tx||lower(tx.from)!==wallet||lower(receipt.to)!==ROUTER||lower(receipt.blockHash)!==lower(tx.blockHash)||BigInt(receipt.blockNumber)!==BigInt(tx.blockNumber))fail('TRANSACTION_MISMATCH');
 const {parseAbi,decodeFunctionData,encodeFunctionData,decodeAbiParameters,encodeAbiParameters,decodeEventLog,toEventSelector}=require('viem');
 const abi=parseAbi(['function execute(bytes commands,bytes[] inputs) payable']);
 let call;try{call=decodeFunctionData({abi,data:tx.input});if(lower(encodeFunctionData({abi,functionName:call.functionName,args:call.args}))!==lower(tx.input))fail('CALLDATA_INVALID');}catch{fail('CALLDATA_INVALID');}
 const [commands,inputs]=call.args;
 if(commands!=='0x000604'||inputs.length!==3)fail('UNSUPPORTED_COMMANDS');
 const decode=(names,data)=>{try{const ts=types(...names),p=decodeAbiParameters(ts,data);if(lower(encodeAbiParameters(ts,p))!==lower(data))fail('CALLDATA_INVALID');return p;}catch{fail('CALLDATA_INVALID');}};
 const resolve=a=>BigInt(a)===1n?wallet:BigInt(a)===2n?ROUTER:lower(a);
 const [recipient,amount,minimum,path,payer]=decode(['address','uint256','uint256','bytes','bool'],inputs[0]);
 const [feeToken,feeRecipient,bips]=decode(['address','address','uint256'],inputs[1]);
 const [sweepToken,sweepRecipient,sweepMinimum]=decode(['address','address','uint256'],inputs[2]);
 const buy=s.side==='buy',input=buy?quote:domain,output=buy?domain:quote;
 const inputUnits=BigInt(buy?s.quoteUnits:s.domainUnits),outputUnits=BigInt(buy?s.domainUnits:s.quoteUnits);
 if(inputUnits<=0n||outputUnits<=0n||!payer||resolve(recipient)!==ROUTER||amount!==inputUnits||minimum>outputUnits)fail('COMMAND_AMOUNT_MISMATCH');
 if(!/^0x[0-9a-f]+$/.test(path)||path.length!==88||'0x'+path.slice(2,42)!==input||'0x'+path.slice(48)!==output)fail('UNSUPPORTED_PATH');
 const fee=Number.parseInt(path.slice(42,48),16),feeTo=resolve(feeRecipient);
 if(![100,500,3000,10000].includes(fee)||lower(feeToken)!==output||bips<=0n||bips>=10000n||[zero,wallet,ROUTER,input,output].includes(feeTo))fail('INVALID_FEE');
 const outputFee=outputUnits*bips/10000n,received=outputUnits-outputFee;
 if(lower(sweepToken)!==output||resolve(sweepRecipient)!==wallet||sweepMinimum>received)fail('SWEEP_MISMATCH');
 const pool=addr(await poolFor(input,output,fee,receipt.blockNumber));
 if(!pool||[zero,wallet,ROUTER,input,output,feeTo].includes(pool))fail('UNREGISTERED_POOL');
 const logs=receipt.logs||[],seen=new Set();
 for(const l of logs){if(l.removed||lower(l.transactionHash)!==s.tx||lower(l.blockHash)!==lower(receipt.blockHash)||BigInt(l.blockNumber)!==BigInt(receipt.blockNumber)||!/^0x[0-9a-f]+$/i.test(l.logIndex)||seen.has(BigInt(l.logIndex).toString()))fail('LOG_IDENTITY_INVALID');seen.add(BigInt(l.logIndex).toString());}
 const swapAbi=parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
 const swaps=logs.filter(l=>lower(l.topics?.[0])===lower(toEventSelector(swapAbi[0])));
 if(swaps.length!==1||lower(swaps[0].address)!==pool)fail('AMBIGUOUS_POOL');
 let actual;try{actual=decodeEventLog({abi:swapAbi,data:swaps[0].data,topics:swaps[0].topics,strict:true}).args;}catch{fail('SWAP_EVENT_INVALID');}
 const input0=BigInt(input)<BigInt(output);
 if(lower(actual.sender)!==ROUTER||lower(actual.recipient)!==ROUTER||(input0?actual.amount0:actual.amount1)!==inputUnits||(input0?actual.amount1:actual.amount0)!==-outputUnits)fail('POOL_AMOUNT_MISMATCH');
 const transfers=logs.filter(l=>lower(l.topics?.[0])===TRANSFER).map(l=>{if(l.topics.length!==3||!/^0x[0-9a-f]{64}$/i.test(l.data)||l.topics.slice(1).some(t=>!/^0x0{24}[0-9a-f]{40}$/i.test(t)))fail('TRANSFER_INVALID');return {token:lower(l.address),from:'0x'+l.topics[1].slice(-40).toLowerCase(),to:'0x'+l.topics[2].slice(-40).toLowerCase(),units:BigInt(l.data)};}).filter(t=>t.units!==0n);
 // PAY_PORTION acts on router balance. Exact pool-output, fee and sweep logs
 // must conserve that output: existing router funds cannot inflate proceeds.
 const expected=[{token:input,from:wallet,to:pool,units:inputUnits},{token:output,from:pool,to:ROUTER,units:outputUnits},{token:output,from:ROUTER,to:wallet,units:received}];
 if(outputFee)expected.push({token:output,from:ROUTER,to:feeTo,units:outputFee});
 const key=t=>[t.token,t.from,t.to,t.units.toString()].join(':');
 if(transfers.length!==expected.length||transfers.map(key).sort().join('|')!==expected.map(key).sort().join('|'))fail('UNEXPLAINED_TRANSFER');
 const net=receiptFlows(receipt,wallet);
 if(net.size!==2||net.get(input)!==-inputUnits||net.get(output)!==received)fail('WALLET_NOT_RECONCILED');
 return {walletDomainUnits:(buy?received:inputUnits).toString(),walletQuoteUnits:(buy?inputUnits:received).toString(),routerFeeUnits:(buy?0n:outputFee).toString(),routerDomainFeeUnits:(buy?outputFee:0n).toString(),router:ROUTER,routerRuntimeHash:RUNTIME_HASH,pool,swapLogIndex:swaps[0].logIndex,route:'DIRECT_ERC20_EXACT_INPUT_PORTION_SWEEP_1'};
}
module.exports={verifyUniversalSettlement,ROUTER,RUNTIME_HASH};
