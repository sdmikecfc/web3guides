'use strict';
// Historical native-ETH -> USDC conversion, including a split across fee pools.
// Called only after the UniversalRouter transaction/runtime identity is pinned.
// This is capital accounting; quote/quote conversions never earn domain volume.
const {USDC,WETH,TRANSFER,receiptFlows}=require('./public-trade-worker.cjs');
const lower=x=>String(x||'').toLowerCase();
const fail=code=>{throw Error('NATIVE_QUOTE_ROUTER_'+code);};
const types=(...names)=>names.map(type=>({type}));
async function verifyNativeQuoteConversion({transaction:tx,receipt,native,wallet,router,value,commands,inputs,poolFor}){
 const operations=commands.slice(2).match(/../g)||[];
 const split=operations.filter(c=>c==='01').length;
 const withFee=operations.includes('05');
 if(![1,2].includes(split)||commands!=='0x0b'+'01'.repeat(split)+(withFee?'05':'')+'040c'||inputs.length!==split+(withFee?4:3))return null;
 const {decodeAbiParameters,encodeAbiParameters,decodeEventLog,parseAbi,toEventSelector}=require('viem');
 function params(names,data){try{const p=decodeAbiParameters(types(...names),data);if(lower(encodeAbiParameters(types(...names),p))!==lower(data))fail('CALLDATA_INVALID');return p;}catch{fail('CALLDATA_INVALID');}}
 const swaps=inputs.slice(1,1+split).map(data=>params(['address','uint256','uint256','bytes','bool'],data));
 // Leave domain purchases to the separate domain adapter. Mixed paths fail.
 if(swaps.every(p=>lower(p[3].slice(0,42))!==USDC))return null;
 const resolve=a=>BigInt(a)===1n?wallet:BigInt(a)===2n?router:lower(a);
 const [wrapTo,wrapAmount]=params(['address','uint256'],inputs[0]);
 if(resolve(wrapTo)!==router||wrapAmount!==value)fail('WRAP_AMOUNT_MISMATCH');
 const pools=[],orders=[];
 let output=0n,maximum=0n;
 for(const [to,amount,maxInput,path,payer]of swaps){
  if(resolve(to)!==router||payer||amount<=0n||maxInput<=0n||maxInput>value||!/^0x[0-9a-f]{86}$/.test(path)||path.slice(0,42)!==USDC||'0x'+path.slice(48)!==WETH)fail('UNSUPPORTED_SWAP');
  const fee=Number.parseInt(path.slice(42,48),16);
  if(![100,500,3000,10000].includes(fee))fail('UNSUPPORTED_FEE');
  const pool=lower(await poolFor(USDC,WETH,fee,receipt.blockNumber));
  if(!/^0x[0-9a-f]{40}$/.test(pool)||[wallet,router,USDC,WETH,'0x'+'0'.repeat(40),...pools].includes(pool))fail('UNREGISTERED_POOL');
  pools.push(pool);orders.push({pool,amount,maxInput});output+=amount;maximum+=maxInput;
 }
 if(maximum>value)fail('INPUT_LIMIT_MISMATCH');
 const feeInput=withFee?params(['address','address','uint256'],inputs[1+split]):null;
 const feeAmount=feeInput?.[2]||0n,feeTo=feeInput?resolve(feeInput[1]):null;
 if(feeInput&&(lower(feeInput[0])!==USDC||feeAmount<=0n||feeAmount>=output||[wallet,router,USDC,WETH,'0x'+'0'.repeat(40),...pools].includes(feeTo)))fail('INVALID_OUTPUT_FEE');
 const received=output-feeAmount;
 const [sweepToken,sweepTo,sweepMin]=params(['address','address','uint256'],inputs[1+split+(withFee?1:0)]);
 const [unwrapTo,unwrapMin]=params(['address','uint256'],inputs[2+split+(withFee?1:0)]);
 if(lower(sweepToken)!==USDC||resolve(sweepTo)!==wallet||sweepMin>received||resolve(unwrapTo)!==wallet||unwrapMin!==0n)fail('RECIPIENT_MISMATCH');
 const logs=receipt.logs||[],seen=new Set();
 for(const l of logs){if(l.removed||lower(l.transactionHash)!==lower(tx.hash)||lower(l.blockHash)!==lower(receipt.blockHash)||!/^0x[0-9a-f]+$/i.test(l.logIndex)||seen.has(BigInt(l.logIndex).toString()))fail('LOG_IDENTITY_INVALID');seen.add(BigInt(l.logIndex).toString());}
 const swapAbi=parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
 const swapTopic=lower(toEventSelector(swapAbi[0])),deposit=lower(toEventSelector('Deposit(address,uint256)')),withdrawal=lower(toEventSelector('Withdrawal(address,uint256)'));
 const swapLogs=logs.filter(l=>lower(l.topics?.[0])===swapTopic),transfers=[];
 if(swapLogs.length!==orders.length)fail('AMBIGUOUS_POOL');
 let spent=0n;
 for(const order of orders){
  const matches=swapLogs.filter(l=>lower(l.address)===order.pool);if(matches.length!==1)fail('AMBIGUOUS_POOL');
  let swap;try{swap=decodeEventLog({abi:swapAbi,data:matches[0].data,topics:matches[0].topics,strict:true}).args;}catch{fail('SWAP_EVENT_INVALID');}
  const input0=BigInt(WETH)<BigInt(USDC),input=input0?swap.amount0:swap.amount1,actualOutput=-(input0?swap.amount1:swap.amount0);
  if(input<=0n||input>order.maxInput||actualOutput!==order.amount||lower(swap.sender)!==router||lower(swap.recipient)!==router)fail('POOL_AMOUNT_MISMATCH');
  spent+=input;
  transfers.push({token:WETH,from:router,to:order.pool,amount:input},{token:USDC,from:order.pool,to:router,amount:actualOutput});
 }
 const refund=value-spent;if(refund<0n)fail('INPUT_AMOUNT_MISMATCH');
 const expectedNative=[{from:wallet,to:router,units:value},{from:router,to:WETH,units:value}];
 if(refund)expectedNative.push({from:WETH,to:router,units:refund},{from:router,to:wallet,units:refund});
 const nativeKey=m=>[lower(m.from),lower(m.to),String(m.units)].join(':');
 if(!Array.isArray(native.moves)||native.moves.length!==expectedNative.length||native.moves.map(nativeKey).sort().join('|')!==expectedNative.map(nativeKey).sort().join('|'))fail('NATIVE_FLOW_MISMATCH');
 const expectedWrap=[deposit+':'+value];if(refund)expectedWrap.push(withdrawal+':'+refund);
 const wrapLogs=logs.filter(l=>lower(l.address)===WETH&&[deposit,withdrawal].includes(lower(l.topics?.[0])));
 const actualWrap=wrapLogs.map(l=>{if(l.topics.length!==2||lower(l.topics[1])!=='0x'+router.slice(2).padStart(64,'0')||!/^0x[0-9a-f]{64}$/i.test(l.data))fail('WRAP_EVENT_INVALID');return lower(l.topics[0])+':'+BigInt(l.data);});
 if(actualWrap.sort().join('|')!==expectedWrap.sort().join('|'))fail('WRAP_AMOUNT_MISMATCH');
 transfers.push({token:USDC,from:router,to:wallet,amount:received});if(feeAmount)transfers.push({token:USDC,from:router,to:feeTo,amount:feeAmount});
 const actualTransfers=logs.filter(l=>lower(l.topics?.[0])===TRANSFER).map(l=>{if(l.topics.length!==3||!/^0x[0-9a-f]{64}$/i.test(l.data)||l.topics.slice(1).some(t=>!/^0x0{24}[0-9a-f]{40}$/i.test(t)))fail('TRANSFER_INVALID');return {token:lower(l.address),from:'0x'+l.topics[1].slice(-40).toLowerCase(),to:'0x'+l.topics[2].slice(-40).toLowerCase(),amount:BigInt(l.data)};});
 const transferKey=t=>[t.token,t.from,t.to,String(t.amount)].join(':');
 if(transfers.length!==actualTransfers.length||transfers.map(transferKey).sort().join('|')!==actualTransfers.map(transferKey).sort().join('|'))fail('UNEXPLAINED_TRANSFER');
 const net=receiptFlows(receipt,wallet);if(net.size!==1||net.get(USDC)!==received)fail('WALLET_NOT_RECONCILED');
 return {kind:'quote_conversion',wallet,token:USDC,units:received.toString(),nativeSpent:spent.toString(),nativeInput:value.toString(),nativeRefund:refund.toString(),outputFeeUnits:feeAmount.toString(),router,pools,transactionHash:lower(tx.hash)};
}
module.exports={verifyNativeQuoteConversion};
