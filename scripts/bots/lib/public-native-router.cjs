'use strict';
// Narrow historical basis adapter for the reviewed UniversalRouter native-ETH
// exact-output purchase. This does not create an eligible competition fill.
// Reviewed source: deployed Dispatcher, Payments and V3SwapRouter at
// explorer.doma.xyz/address/0x5089863e97196773038f98459262d866f2281f58.
const {CHAIN,USDC,WETH,TRANSFER,receiptFlows}=require('./public-trade-worker.cjs');
const ROUTER='0x5089863e97196773038f98459262d866f2281f58';
const RUNTIME_HASH='0xe16c4e73f116df542880bac897fef57f4162c2c916de66e4f97f7a938e63170f';
const lower=x=>String(x||'').toLowerCase();
const address=x=>/^0x[0-9a-f]{40}$/.test(lower(x))?lower(x):null;
const fail=code=>{throw Error('NATIVE_ROUTER_'+code);};
const types=(...names)=>names.map(type=>({type}));
async function verifyNativeRouterPurchase({transaction:tx,receipt,native,wallet,codeHash,poolFor}){
 if(lower(tx?.to)!==ROUTER)return null;
 let value;try{value=BigInt(tx.value);}catch{fail('TRANSACTION_INVALID');}
 if(value===0n)return null;
 wallet=address(wallet);
 if(!wallet||lower(tx.from)!==wallet)return null;
 if(lower(codeHash)!==RUNTIME_HASH)fail('UNREVIEWED_RUNTIME');
 if(value<0n||Number(BigInt(tx.chainId))!==CHAIN||receipt?.status!=='0x1'||lower(receipt.transactionHash)!==lower(tx.hash)||lower(receipt.blockHash)!==lower(tx.blockHash)||BigInt(receipt.blockNumber)!==BigInt(tx.blockNumber)||lower(native?.payer)!==wallet)fail('TRANSACTION_MISMATCH');
 const {parseAbi,decodeFunctionData,encodeFunctionData,decodeAbiParameters,encodeAbiParameters,decodeEventLog,toEventSelector}=require('viem');
 const abi=parseAbi(['function execute(bytes commands,bytes[] inputs) payable']);
 let call;try{call=decodeFunctionData({abi,data:tx.input});if(lower(encodeFunctionData({abi,functionName:call.functionName,args:call.args}))!==lower(tx.input))fail('CALLDATA_INVALID');}catch{fail('CALLDATA_INVALID');}
 const [commands,inputs]=call.args,withFee=commands==='0x0b0105040c';
 if(!withFee&&commands!=='0x0b01040c'||inputs.length!==(withFee?5:4))fail('UNSUPPORTED_COMMANDS');
 const params=(names,data)=>{try{const ts=types(...names),p=decodeAbiParameters(ts,data);if(lower(encodeAbiParameters(ts,p))!==lower(data))fail('CALLDATA_INVALID');return p;}catch{fail('CALLDATA_INVALID');}};
 const resolve=x=>BigInt(x)===1n?wallet:BigInt(x)===2n?ROUTER:lower(x);
 const [wrapTo,wrapAmount]=params(['address','uint256'],inputs[0]);
 const [swapTo,outputAmount,inputMax,path,payerIsUser]=params(['address','uint256','uint256','bytes','bool'],inputs[1]);
 if(resolve(wrapTo)!==ROUTER||wrapAmount!==value||resolve(swapTo)!==ROUTER||inputMax!==value||payerIsUser||outputAmount<=0n)fail('COMMAND_AMOUNT_MISMATCH');
 if(!/^0x[0-9a-f]+$/.test(path)||![88,134].includes(path.length))fail('UNSUPPORTED_PATH');
 const tokens=['0x'+path.slice(2,42)],fees=[];
 for(let offset=42;offset<path.length;offset+=46){fees.push(Number.parseInt(path.slice(offset,offset+6),16));tokens.push('0x'+path.slice(offset+6,offset+46));}
 if(tokens[tokens.length-1]!==WETH||tokens.length===3&&tokens[1]!==USDC||[USDC,WETH,'0x'+'0'.repeat(40)].includes(tokens[0])||new Set(tokens).size!==tokens.length||fees.some(f=>![100,500,3000,10000].includes(f)))fail('UNSUPPORTED_PATH');
 const token=tokens[0],feeCommand=withFee?params(['address','address','uint256'],inputs[2]):null;
 const [sweepToken,sweepTo,sweepMin]=params(['address','address','uint256'],inputs[withFee?3:2]);
 const [unwrapTo,unwrapMin]=params(['address','uint256'],inputs[withFee?4:3]);
 if(lower(sweepToken)!==token||resolve(sweepTo)!==wallet||resolve(unwrapTo)!==wallet||unwrapMin!==0n)fail('RECIPIENT_MISMATCH');
 const outputFee=feeCommand?.[2]||0n,feeTo=feeCommand?resolve(feeCommand[1]):null;
 if(feeCommand&&(lower(feeCommand[0])!==token||outputFee<=0n||outputFee>=outputAmount||[wallet,ROUTER,WETH,USDC,'0x'+'0'.repeat(40)].includes(feeTo)))fail('INVALID_OUTPUT_FEE');
 const received=outputAmount-outputFee;
 if(sweepMin>received)fail('SWEEP_AMOUNT_MISMATCH');
 const pools=[];
 for(let i=0;i<fees.length;i++){const pool=address(await poolFor(tokens[i],tokens[i+1],fees[i],receipt.blockNumber));if(!pool||pool==='0x'+'0'.repeat(40)||[wallet,ROUTER,feeTo,...tokens,...pools].includes(pool))fail('UNREGISTERED_POOL');pools.push(pool);}
 const swapAbi=parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
 const swapTopic=lower(toEventSelector(swapAbi[0])),deposit=lower(toEventSelector('Deposit(address,uint256)')),withdrawal=lower(toEventSelector('Withdrawal(address,uint256)'));
 const logs=receipt.logs||[],seen=new Set();
 for(const l of logs){if(l.removed||lower(l.transactionHash)!==lower(tx.hash)||lower(l.blockHash)!==lower(receipt.blockHash)||!/^0x[0-9a-f]+$/i.test(l.logIndex)||seen.has(BigInt(l.logIndex).toString()))fail('LOG_IDENTITY_INVALID');seen.add(BigInt(l.logIndex).toString());}
 const swapLogs=logs.filter(l=>lower(l.topics?.[0])===swapTopic);
 if(swapLogs.length!==pools.length)fail('AMBIGUOUS_POOL');
 const amounts=[];
 for(let i=0;i<pools.length;i++){
  const ls=swapLogs.filter(l=>lower(l.address)===pools[i]);if(ls.length!==1)fail('AMBIGUOUS_POOL');
  let s;try{s=decodeEventLog({abi:swapAbi,data:ls[0].data,topics:ls[0].topics,strict:true}).args;}catch{fail('SWAP_EVENT_INVALID');}
  const input0=BigInt(tokens[i+1])<BigInt(tokens[i]);
  const input=input0?s.amount0:s.amount1,output=-(input0?s.amount1:s.amount0);
  if(input<=0n||output<=0n||lower(s.sender)!==ROUTER||lower(s.recipient)!==(i===0?ROUTER:pools[i-1])||(i===0?output!==outputAmount:output!==amounts[i-1].input))fail('POOL_AMOUNT_MISMATCH');
  amounts.push({input,output});
 }
 const spent=amounts[amounts.length-1].input,refund=value-spent;
 if(spent<=0n||refund<0n)fail('INPUT_AMOUNT_MISMATCH');
 const expectedNative=[{from:wallet,to:ROUTER,units:value},{from:ROUTER,to:WETH,units:value}];
 if(refund)expectedNative.push({from:WETH,to:ROUTER,units:refund},{from:ROUTER,to:wallet,units:refund});
 const nativeKey=m=>[lower(m.from),lower(m.to),String(m.units)].join(':');
 if(!Array.isArray(native.moves)||native.moves.length!==expectedNative.length||native.moves.map(nativeKey).sort().join('|')!==expectedNative.map(nativeKey).sort().join('|'))fail('NATIVE_FLOW_MISMATCH');
 const wrapLogs=logs.filter(l=>lower(l.address)===WETH&&[deposit,withdrawal].includes(lower(l.topics?.[0])));
 const expectedWrap=[deposit+':'+value];if(refund)expectedWrap.push(withdrawal+':'+refund);
 const actualWrap=wrapLogs.map(l=>{if(l.topics.length!==2||lower(l.topics[1])!=='0x'+ROUTER.slice(2).padStart(64,'0')||!/^0x[0-9a-f]{64}$/i.test(l.data))fail('WRAP_EVENT_INVALID');return lower(l.topics[0])+':'+BigInt(l.data);});
 if(actualWrap.sort().join('|')!==expectedWrap.sort().join('|'))fail('WRAP_AMOUNT_MISMATCH');
 const expectedTransfers=[];
 for(let i=0;i<pools.length;i++)expectedTransfers.push({token:tokens[i],from:pools[i],to:i===0?ROUTER:pools[i-1],amount:amounts[i].output});
 expectedTransfers.push({token:WETH,from:ROUTER,to:pools[pools.length-1],amount:spent},{token,from:ROUTER,to:wallet,amount:received});
 if(outputFee)expectedTransfers.push({token,from:ROUTER,to:feeTo,amount:outputFee});
 const transfers=logs.filter(l=>lower(l.topics?.[0])===TRANSFER).map(l=>{if(l.topics.length!==3||!/^0x[0-9a-f]{64}$/i.test(l.data)||l.topics.slice(1).some(t=>!/^0x0{24}[0-9a-f]{40}$/i.test(t)))fail('TRANSFER_INVALID');return {token:lower(l.address),from:'0x'+l.topics[1].slice(-40).toLowerCase(),to:'0x'+l.topics[2].slice(-40).toLowerCase(),amount:BigInt(l.data)};});
 const transferKey=t=>[t.token,t.from,t.to,String(t.amount)].join(':');
 if(transfers.length!==expectedTransfers.length||transfers.map(transferKey).sort().join('|')!==expectedTransfers.map(transferKey).sort().join('|'))fail('UNEXPLAINED_TRANSFER');
 const net=receiptFlows(receipt,wallet);if(net.size!==1||net.get(token)!==received)fail('WALLET_NOT_RECONCILED');
 return {wallet,token,units:received.toString(),nativeSpent:spent.toString(),router:ROUTER,pools,routerRuntimeHash:RUNTIME_HASH,transactionHash:lower(tx.hash),nativeInput:value.toString(),nativeRefund:refund.toString(),poolOutput:outputAmount.toString(),domainPoolUnits:outputAmount.toString(),domainQuoteToken:tokens[1],domainQuoteUnits:amounts[0].input.toString(),outputFeeUnits:outputFee.toString(),path:tokens,pathFees:fees};
}
module.exports={verifyNativeRouterPurchase,ROUTER,RUNTIME_HASH};
