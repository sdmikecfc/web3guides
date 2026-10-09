'use strict';
// Reviewed UniversalRouter ERC20 V3 settlement with explicit output fee/sweep.
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
 let [commands,inputs]=call.args;
 const permit=commands.startsWith('0x0a')?inputs[0]:null;
 if(permit){commands='0x'+commands.slice(4);inputs=inputs.slice(1);}
 if(commands!=='0x000604'||inputs.length!==3)fail('UNSUPPORTED_COMMANDS');
 const decode=(names,data)=>{try{const ts=types(...names),p=decodeAbiParameters(ts,data);if(lower(encodeAbiParameters(ts,p))!==lower(data))fail('CALLDATA_INVALID');return p;}catch{fail('CALLDATA_INVALID');}};
 const resolve=a=>BigInt(a)===1n?wallet:BigInt(a)===2n?ROUTER:lower(a);
 const [recipient,amount,minimum,path,payer]=decode(['address','uint256','uint256','bytes','bool'],inputs[0]);
 const [feeToken,feeRecipient,bips]=decode(['address','address','uint256'],inputs[1]);
 const [sweepToken,sweepRecipient,sweepMinimum]=decode(['address','address','uint256'],inputs[2]);
 const buy=s.side==='buy',input=buy?quote:domain,output=buy?domain:quote;
 const inputUnits=BigInt(buy?s.quoteUnits:s.domainUnits),outputUnits=BigInt(buy?s.domainUnits:s.quoteUnits);
 if(permit){
  // PERMIT2_PERMIT only changes allowance. Receipt success plus the unchanged
  // exact wallet/pool transfers below proves use by the signed transaction.
  const ts=require('viem').parseAbiParameters('((address token, uint160 amount, uint48 expiration, uint48 nonce) details, address spender, uint256 sigDeadline) permit, bytes signature');
  let p;try{p=decodeAbiParameters(ts,permit);if(lower(encodeAbiParameters(ts,p))!==lower(permit))fail('CALLDATA_INVALID');}catch{fail('CALLDATA_INVALID');}
  const [grant,signature]=p,at=Math.floor(Date.parse(s.executedAt)/1000);
  if(lower(grant.details.token)!==input||lower(grant.spender)!==ROUTER||grant.details.amount<inputUnits||!/^0x[0-9a-f]{128,130}$/i.test(signature)
   ||!Number.isFinite(at)||grant.sigDeadline<BigInt(at)||(BigInt(grant.details.expiration)!==0n&&BigInt(grant.details.expiration)<BigInt(at)))fail('PERMIT_MISMATCH');
 }
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
// Whole economic ERC20 route: one or two exact-input/output V3 paths, each
// direct or quote-bridged, followed by its explicit output fee and sweep.
// The deployed verified source was re-read 2026-10-10. No native flow is inferred.
async function verifyUniversalRoute({swaps,transaction:tx,receipt,codeHash,poolFor}){
 if(lower(tx?.to)!==ROUTER||BigInt(tx.value||0)>0n)return null;
 if(lower(codeHash)!==RUNTIME_HASH)fail('UNREVIEWED_RUNTIME');
 if(!Array.isArray(swaps)||!swaps.length||swaps.length>4)fail('INDEX_INVALID');
 const wallet=addr(tx.from),hash=lower(tx.hash),blockHash=lower(tx.blockHash);
 if(!wallet||!/^0x[0-9a-f]{64}$/.test(hash)||!/^0x[0-9a-f]{64}$/.test(blockHash)||Number(BigInt(tx.chainId))!==CHAIN||BigInt(tx.value)!==0n||receipt?.status!=='0x1'||lower(receipt.to)!==ROUTER||lower(receipt.transactionHash)!==hash||lower(receipt.blockHash)!==blockHash||BigInt(receipt.blockNumber)!==BigInt(tx.blockNumber))fail('TRANSACTION_MISMATCH');
 const v=require('viem'),abi=v.parseAbi(['function execute(bytes commands,bytes[] inputs) payable']);
 let decoded;try{decoded=v.decodeFunctionData({abi,data:tx.input});if(lower(v.encodeFunctionData({abi,functionName:decoded.functionName,args:decoded.args}))!==lower(tx.input))fail('CALLDATA_INVALID');}catch{fail('CALLDATA_INVALID');}
 let [commands,inputs]=decoded.args;
 // Native unwrap belongs to the separately reconciled native-output adapter.
 if(commands==='0x00060c')return null;
 const permit=commands.startsWith('0x0a')?inputs[0]:null;if(permit){commands='0x'+commands.slice(4);inputs=inputs.slice(1);}
 const ops=commands.slice(2).match(/../g)||[],exactOut=ops[0]==='01',swapOp=exactOut?'01':'00',legs=ops.filter(c=>c===swapOp).length,feeOp=exactOut?'05':'06';
 if(![1,2].includes(legs)||commands!=='0x'+swapOp.repeat(legs)+feeOp+'04'||inputs.length!==legs+2)fail('UNSUPPORTED_COMMANDS');
 const decode=(names,data)=>{try{const ts=types(...names),p=v.decodeAbiParameters(ts,data);if(lower(v.encodeAbiParameters(ts,p))!==lower(data))fail('CALLDATA_INVALID');return p;}catch{fail('CALLDATA_INVALID');}};
 const resolve=a=>BigInt(a)===1n?wallet:BigInt(a)===2n?ROUTER:lower(a);
 const routes=[];let inputToken,outputToken;
 for(const data of inputs.slice(0,legs)){
  const [to,amount,limit,path,payer]=decode(['address','uint256','uint256','bytes','bool'],data);
  if(resolve(to)!==ROUTER||!payer||amount<=0n||amount>=(1n<<255n)||limit<0n||!/^0x[0-9a-f]+$/.test(path)||![88,134].includes(path.length))fail('UNSUPPORTED_PATH');
  let tokens=['0x'+path.slice(2,42)],fees=[];for(let at=42;at<path.length;at+=46){fees.push(Number.parseInt(path.slice(at,at+6),16));tokens.push('0x'+path.slice(at+6,at+46));}
  if(exactOut){tokens.reverse();fees.reverse();}
  if(new Set(tokens).size!==tokens.length||tokens.includes(zero)||fees.some(f=>![100,500,3000,10000].includes(f))||tokens.length===3&&![USDC,WETH].includes(tokens[1]))fail('UNSUPPORTED_PATH');
  inputToken??=tokens[0];outputToken??=tokens.at(-1);if(inputToken!==tokens[0]||outputToken!==tokens.at(-1))fail('MIXED_ROUTE');
  routes.push({tokens,fees,amount,limit,pools:[],amounts:[]});
 }
 const buy=[USDC,WETH].includes(inputToken),domain=buy?outputToken:inputToken,quote=buy?inputToken:outputToken;
 if(![USDC,WETH].includes(quote)||[USDC,WETH,zero].includes(domain))fail('INDEX_INVALID');
 if(swaps.some(s=>s.wallet!==wallet||s.tx!==hash||s.domain!==domain||s.side!==(buy?'buy':'sell')||![USDC,WETH].includes(s.quote)||s.executedAt!==swaps[0].executedAt))fail('INDEX_INVALID');
 const [feeToken,feeRecipient,feeValue]=decode(['address','address','uint256'],inputs[legs]),feeTo=resolve(feeRecipient);
 if(lower(feeToken)!==outputToken||feeValue<=0n||!exactOut&&feeValue>=10000n||[zero,wallet,ROUTER,inputToken,outputToken,USDC,WETH].includes(feeTo))fail('INVALID_FEE');
 const [sweepToken,sweepTo,sweepMin]=decode(['address','address','uint256'],inputs[legs+1]);if(lower(sweepToken)!==outputToken||resolve(sweepTo)!==wallet)fail('SWEEP_MISMATCH');
 const usedPools=new Set();for(const route of routes)for(let i=0;i<route.fees.length;i++){
  const pool=addr(await poolFor(route.tokens[i],route.tokens[i+1],route.fees[i],receipt.blockNumber));
  if(!pool||usedPools.has(pool)||[zero,wallet,ROUTER,feeTo,...route.tokens].includes(pool))fail('UNREGISTERED_POOL');usedPools.add(pool);route.pools.push(pool);
 }
 const logs=receipt.logs||[],seen=new Set();for(const l of logs){if(l.removed||lower(l.transactionHash)!==hash||lower(l.blockHash)!==blockHash||BigInt(l.blockNumber)!==BigInt(receipt.blockNumber)||!/^0x[0-9a-f]+$/i.test(l.logIndex)||seen.has(BigInt(l.logIndex).toString()))fail('LOG_IDENTITY_INVALID');seen.add(BigInt(l.logIndex).toString());}
 const swapAbi=v.parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
 const swapLogs=logs.filter(l=>lower(l.topics?.[0])===lower(v.toEventSelector(swapAbi[0])));if(swapLogs.length!==usedPools.size)fail('AMBIGUOUS_POOL');
 const transfers=[],domainLegs=[];let spent=0n,gross=0n;
 for(const route of routes){
  for(let i=0;i<route.pools.length;i++){
   const matches=swapLogs.filter(l=>lower(l.address)===route.pools[i]);if(matches.length!==1)fail('AMBIGUOUS_POOL');let a;try{a=v.decodeEventLog({abi:swapAbi,data:matches[0].data,topics:matches[0].topics,strict:true}).args;}catch{fail('SWAP_EVENT_INVALID');}
   const in0=BigInt(route.tokens[i])<BigInt(route.tokens[i+1]),input=in0?a.amount0:a.amount1,output=-(in0?a.amount1:a.amount0),recipient=exactOut&&i<route.pools.length-1?route.pools[i+1]:ROUTER;
   if(input<=0n||output<=0n||lower(a.sender)!==ROUTER||lower(a.recipient)!==recipient)fail('POOL_AMOUNT_MISMATCH');
   if(i&&route.amounts[i-1].output!==input)fail('POOL_AMOUNT_MISMATCH');route.amounts.push({input,output});
   transfers.push({token:route.tokens[i+1],from:route.pools[i],to:recipient,units:output});
   if(i===0)transfers.push({token:route.tokens[0],from:wallet,to:route.pools[0],units:input});else if(!exactOut)transfers.push({token:route.tokens[i],from:ROUTER,to:route.pools[i],units:input});
   if(route.tokens[i]===domain||route.tokens[i+1]===domain)domainLegs.push({quote:route.tokens[i]===domain?route.tokens[i+1]:route.tokens[i],domainUnits:route.tokens[i]===domain?input:output,quoteUnits:route.tokens[i]===domain?output:input});
  }
  const first=route.amounts[0].input,last=route.amounts.at(-1).output;
  if(exactOut?(last!==route.amount||first>route.limit):(first!==route.amount||last<route.limit))fail('COMMAND_AMOUNT_MISMATCH');spent+=first;gross+=last;
 }
 const indexed=swaps.map(s=>[s.quote,BigInt(s.domainUnits).toString(),BigInt(s.quoteUnits).toString()].join(':')).sort(),actual=domainLegs.map(s=>[s.quote,s.domainUnits.toString(),s.quoteUnits.toString()].join(':')).sort();
 if(indexed.join('|')!==actual.join('|'))fail('INDEX_AMOUNT_MISMATCH');
 if(permit){const ts=v.parseAbiParameters('((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline) permit, bytes signature');let p;try{p=v.decodeAbiParameters(ts,permit);if(lower(v.encodeAbiParameters(ts,p))!==lower(permit))fail('CALLDATA_INVALID');}catch{fail('CALLDATA_INVALID');}
  const [grant,signature]=p,at=Math.floor(Date.parse(swaps[0].executedAt)/1000);if(lower(grant.details.token)!==inputToken||lower(grant.spender)!==ROUTER||grant.details.amount<spent||!/^0x(?:[0-9a-f]{128}|[0-9a-f]{130})$/i.test(signature)||!Number.isFinite(at)||grant.sigDeadline<BigInt(at)||(BigInt(grant.details.expiration)!==0n&&BigInt(grant.details.expiration)<BigInt(at)))fail('PERMIT_MISMATCH');}
 const outputFee=exactOut?feeValue:gross*feeValue/10000n,received=gross-outputFee;if(received<=0n||sweepMin>received)fail('SWEEP_MISMATCH');
 if(outputFee)transfers.push({token:outputToken,from:ROUTER,to:feeTo,units:outputFee});transfers.push({token:outputToken,from:ROUTER,to:wallet,units:received});
 const actualTransfers=logs.filter(l=>lower(l.topics?.[0])===TRANSFER).map(l=>{if(l.topics.length!==3||!/^0x[0-9a-f]{64}$/i.test(l.data)||l.topics.slice(1).some(t=>!/^0x0{24}[0-9a-f]{40}$/i.test(t)))fail('TRANSFER_INVALID');return {token:lower(l.address),from:'0x'+l.topics[1].slice(-40).toLowerCase(),to:'0x'+l.topics[2].slice(-40).toLowerCase(),units:BigInt(l.data)};}).filter(t=>t.units!==0n);
 const key=t=>[t.token,t.from,t.to,t.units.toString()].join(':');if(transfers.length!==actualTransfers.length||transfers.map(key).sort().join('|')!==actualTransfers.map(key).sort().join('|'))fail('UNEXPLAINED_TRANSFER');
 const net=receiptFlows(receipt,wallet);if(net.size!==2||net.get(inputToken)!==-spent||net.get(outputToken)!==received)fail('WALLET_NOT_RECONCILED');
 const swap={...swaps[0],domain,quote,domainUnits:(buy?gross:spent).toString(),quoteUnits:(buy?spent:gross).toString(),side:buy?'buy':'sell'};
 const amounts={walletDomainUnits:(buy?received:spent).toString(),walletQuoteUnits:(buy?spent:received).toString(),routerFeeUnits:(buy?0n:outputFee).toString(),routerDomainFeeUnits:(buy?outputFee:0n).toString(),router:ROUTER,routerRuntimeHash:RUNTIME_HASH,pools:[...usedPools],route:'DIRECT_ERC20_CANONICAL_V3_1'};
 return {swap,amounts};
}

module.exports={verifyUniversalSettlement,verifyUniversalRoute,ROUTER,RUNTIME_HASH};
