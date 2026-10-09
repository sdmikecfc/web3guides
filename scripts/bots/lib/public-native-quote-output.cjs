'use strict';
// Exact public proof for the observed zero-value USDC -> WETH -> native ETH
// UniversalRouter conversion. This moves capital; it creates no eligible fill.
const {CHAIN,USDC,WETH,TRANSFER,receiptFlows}=require('./public-trade-worker.cjs');
const {ROUTER,RUNTIME_HASH}=require('./public-native-router.cjs');
const lower=x=>String(x||'').toLowerCase(),zero='0x'+'0'.repeat(40);
const fail=c=>{throw Error('NATIVE_QUOTE_OUTPUT_'+c);};
async function verifyNativeQuoteOutput({transaction:tx,receipt,native,wallets,codeHash,poolFor}){
 if(lower(tx?.to)!==ROUTER||BigInt(tx.value)!==0n||!wallets.includes(lower(tx.from)))return null;
 const v=require('viem'),abi=v.parseAbi(['function execute(bytes commands,bytes[] inputs) payable']);
 let call;try{call=v.decodeFunctionData({abi,data:tx.input});}catch{return null;}
 if(call.args[0]!=='0x00060c')return null;
 const wallet=lower(tx.from),inputs=call.args[1];
 if(lower(codeHash)!==RUNTIME_HASH)fail('UNREVIEWED_RUNTIME');
 if(inputs.length!==3||lower(v.encodeFunctionData({abi,functionName:call.functionName,args:call.args}))!==lower(tx.input))fail('CALLDATA_INVALID');
 if(!/^0x[0-9a-f]{64}$/.test(lower(tx.hash))||!/^0x[0-9a-f]{64}$/.test(lower(tx.blockHash))||Number(BigInt(tx.chainId))!==CHAIN||receipt?.status!=='0x1'||lower(receipt.transactionHash)!==lower(tx.hash)||lower(receipt.blockHash)!==lower(tx.blockHash)||BigInt(receipt.blockNumber)!==BigInt(tx.blockNumber)||lower(receipt.to)!==ROUTER||lower(native?.payer)!==wallet||typeof native.fee!=='bigint'||native.fee<0n)fail('TRANSACTION_MISMATCH');
 const params=(types,data)=>{try{const ts=types.map(type=>({type})),r=v.decodeAbiParameters(ts,data);if(lower(v.encodeAbiParameters(ts,r))!==lower(data))fail('CALLDATA_INVALID');return r;}catch{fail('CALLDATA_INVALID');}};
 const resolve=a=>BigInt(a)===1n?wallet:BigInt(a)===2n?ROUTER:lower(a);
 const [recipient,input,minimum,path,payer]=params(['address','uint256','uint256','bytes','bool'],inputs[0]);
 const [feeToken,feeRecipient,bips]=params(['address','address','uint256'],inputs[1]);
 const [unwrapRecipient,unwrapMinimum]=params(['address','uint256'],inputs[2]);
 if(!/^0x[0-9a-f]{86}$/.test(path)||'0x'+path.slice(2,42)!==USDC||'0x'+path.slice(48)!==WETH)fail('UNSUPPORTED_PATH');
 const fee=Number.parseInt(path.slice(42,48),16),feeTo=resolve(feeRecipient);
 if(![100,500,3000,10000].includes(fee)||!payer||input<=0n||resolve(recipient)!==ROUTER||resolve(unwrapRecipient)!==wallet)fail('COMMAND_MISMATCH');
 if(lower(feeToken)!==WETH||bips<=0n||bips>=10000n||[zero,wallet,ROUTER,USDC,WETH,...wallets].includes(feeTo))fail('INVALID_FEE');
 const pool=lower(await poolFor(USDC,WETH,fee,receipt.blockNumber));
 if(!/^0x[0-9a-f]{40}$/.test(pool)||[zero,ROUTER,USDC,WETH,feeTo,...wallets].includes(pool))fail('UNREGISTERED_POOL');
 const logs=receipt.logs||[],seen=new Set();
 for(const l of logs){if(l.removed||lower(l.transactionHash)!==lower(tx.hash)||lower(l.blockHash)!==lower(receipt.blockHash)||BigInt(l.blockNumber)!==BigInt(receipt.blockNumber)||!/^0x[0-9a-f]+$/i.test(l.logIndex)||seen.has(BigInt(l.logIndex).toString()))fail('LOG_IDENTITY_INVALID');seen.add(BigInt(l.logIndex).toString());}
 const swapAbi=v.parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']),swapTopic=lower(v.toEventSelector(swapAbi[0]));
 const swaps=logs.filter(l=>lower(l.topics?.[0])===swapTopic);if(swaps.length!==1||lower(swaps[0].address)!==pool)fail('AMBIGUOUS_POOL');
 let s;try{s=v.decodeEventLog({abi:swapAbi,data:swaps[0].data,topics:swaps[0].topics,strict:true}).args;}catch{fail('SWAP_EVENT_INVALID');}
 const input0=BigInt(USDC)<BigInt(WETH),actualInput=input0?s.amount0:s.amount1,output=-(input0?s.amount1:s.amount0);
 if(actualInput!==input||output<=0n||output<minimum||lower(s.sender)!==ROUTER||lower(s.recipient)!==ROUTER)fail('POOL_AMOUNT_MISMATCH');
 const feeUnits=output*bips/10000n,received=output-feeUnits;if(received<unwrapMinimum)fail('UNWRAP_MINIMUM');
 const withdrawal=lower(v.toEventSelector('Withdrawal(address,uint256)')),deposit=lower(v.toEventSelector('Deposit(address,uint256)'));
 const wrapLogs=logs.filter(l=>lower(l.address)===WETH&&[withdrawal,deposit].includes(lower(l.topics?.[0])));
 if(wrapLogs.length!==1||lower(wrapLogs[0].topics[0])!==withdrawal||wrapLogs[0].topics.length!==2||lower(wrapLogs[0].topics[1])!=='0x'+ROUTER.slice(2).padStart(64,'0')||!/^0x[0-9a-f]{64}$/i.test(wrapLogs[0].data)||BigInt(wrapLogs[0].data)!==received)fail('UNWRAP_EVENT_MISMATCH');
 const transfers=logs.filter(l=>lower(l.topics?.[0])===TRANSFER).map(l=>{if(l.topics.length!==3||!/^0x[0-9a-f]{64}$/i.test(l.data)||l.topics.slice(1).some(t=>!/^0x0{24}[0-9a-f]{40}$/i.test(t)))fail('TRANSFER_INVALID');return {token:lower(l.address),from:'0x'+l.topics[1].slice(-40).toLowerCase(),to:'0x'+l.topics[2].slice(-40).toLowerCase(),units:BigInt(l.data)};}).filter(t=>t.units!==0n);
 const expected=[{token:USDC,from:wallet,to:pool,units:input},{token:WETH,from:pool,to:ROUTER,units:output}];if(feeUnits)expected.push({token:WETH,from:ROUTER,to:feeTo,units:feeUnits});
 const key=t=>[t.token,t.from,t.to,String(t.units)].join(':');
 if(transfers.length!==expected.length||transfers.map(key).sort().join('|')!==expected.map(key).sort().join('|'))fail('UNEXPLAINED_TRANSFER');
 const expectedMoves=[{from:WETH,to:ROUTER,units:received},{from:ROUTER,to:wallet,units:received}],nk=m=>[lower(m.from),lower(m.to),String(m.units)].join(':');
 if(!Array.isArray(native.moves)||native.moves.length!==2||native.moves.map(nk).sort().join('|')!==expectedMoves.map(nk).sort().join('|'))fail('NATIVE_FLOW_MISMATCH');
 const flows=receiptFlows(receipt,wallet);if(flows.size!==1||flows.get(USDC)!==-input||wallets.some(w=>w!==wallet&&receiptFlows(receipt,w).size))fail('WALLET_NOT_RECONCILED');
 return {kind:'native_quote_conversion',wallet,inputToken:USDC,inputUnits:input.toString(),nativeReceived:received.toString(),router:ROUTER,pool,routerRuntimeHash:RUNTIME_HASH,feeUnits:feeUnits.toString()};
}
module.exports={verifyNativeQuoteOutput};
