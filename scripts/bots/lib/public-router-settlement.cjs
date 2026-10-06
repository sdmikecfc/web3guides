'use strict';
// Independently reconcile the reviewed Doma Order Router's single-pool path.
// Never infer a fee from a percentage or accept unexplained wallet deltas.
const {receiptFlows,TRANSFER}=require('./public-trade-worker.cjs');
const ROUTER='0xd00000000054ec160026ddcc2b1cfff4938cddf5';
const IMPLEMENTATION='0x45c2f8d18212eabd2cecfe831a0d27e255b0e0c5';
const UNIVERSAL='0x5089863e97196773038f98459262d866f2281f58';
const IMPLEMENTATION_SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const lower=s=>String(s).toLowerCase();
const fail=code=>{throw Error('ROUTER_'+code);};
const types=(...names)=>names.map(type=>({type}));
async function verifyRouterSettlement(s,receipt,{transaction,implementation,poolFor}){
 const {parseAbi,decodeFunctionData,decodeAbiParameters,decodeEventLog,toEventSelector}=require('viem');
 const routerAbi=parseAbi(['function execute(uint256 executionId,(uint8 commandType,bytes data)[] commands)','event OrderExecuted(uint256 indexed executionId)']);
 const universalAbi=parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline)']);
 const swapAbi=parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
 if(lower(transaction?.to)!==ROUTER||lower(implementation)!==IMPLEMENTATION)fail('UNREVIEWED_IMPLEMENTATION');
 if(lower(transaction.hash)!==s.tx||lower(transaction.blockHash)!==lower(receipt.blockHash)||BigInt(transaction.value)!==0n)fail('TRANSACTION_MISMATCH');
 const net=receiptFlows(receipt,s.wallet);
 const decode=(abi,data)=>{try{return decodeFunctionData({abi,data});}catch{fail('UNSUPPORTED_COMMAND');}};
 const params=(ts,data)=>{try{return decodeAbiParameters(types(...ts),data);}catch{fail('UNSUPPORTED_COMMAND');}};
 const outer=decode(routerAbi,transaction.input),commands=outer.args[1];
 if(outer.functionName!=='execute'||commands.length>12)fail('UNSUPPORTED_COMMAND');
 const events=receipt.logs.filter(l=>lower(l.address)===ROUTER&&lower(l.topics?.[0])===lower(toEventSelector(routerAbi[1])));
 if(events.length!==1||decodeEventLog({abi:routerAbi,data:events[0].data,topics:events[0].topics}).args.executionId!==outer.args[0])fail('EXECUTION_EVENT_MISMATCH');
 const input=s.side==='buy'?s.quote:s.domain,output=s.side==='buy'?s.domain:s.quote;
 const inputUnits=BigInt(s.side==='buy'?s.quoteUnits:s.domainUnits),outputUnits=BigInt(s.side==='buy'?s.domainUnits:s.quoteUnits);
 let pull=null,swap=null;const fees=[],sweeps=[];let approvals=0;
 for(const c of commands){
  const kind=Number(c.commandType);
  if(kind===0){const [t,w,n]=params(['address','address','uint256'],c.data);if(pull||lower(t)!==input||lower(w)!==s.wallet||n<=0n)fail('AMBIGUOUS_PULL');pull=n;}
  else if(kind===1||kind===2){const [t,to,n]=params(['address','address','uint256'],c.data);if(lower(t)!==input||lower(to)!==UNIVERSAL||n<inputUnits)fail('UNSUPPORTED_APPROVAL');approvals++;}
  else if(kind===4){const [t,to]=params(['address','address','uint256'],c.data);if(![input,output].includes(lower(t))||lower(to)!==s.wallet)fail('UNSUPPORTED_SWEEP');sweeps.push(lower(t));}
  else if(kind===3){
   const [to,data,value]=params(['address','bytes','uint256'],c.data);if(value!==0n)fail('NATIVE_VALUE_UNSUPPORTED');
   if(lower(to)===UNIVERSAL){
    if(swap)fail('MULTI_SWAP_UNSUPPORTED');const inner=decode(universalAbi,data);
    // Only an exact-input, single-hop V3 swap. No hidden subplans, allow-revert,
    // Permit2 transfers, nested swaps or commands that could allocate twice.
    if(inner.args[0]!=='0x00'||inner.args[1].length!==1)fail('UNSUPPORTED_SWAP_PATH');
    const [recipient,amount,minimum,path,payer]=params(['address','uint256','uint256','bytes','bool'],inner.args[1][0]);
    if(path.length!==88||!payer||amount!==inputUnits||('0x'+path.slice(2,42))!==input||('0x'+path.slice(48))!==output)fail('UNSUPPORTED_SWAP_PATH');
    if(![s.wallet,ROUTER].includes(lower(recipient))||minimum>outputUnits)fail('RECIPIENT_MISMATCH');
    swap={recipient:lower(recipient),fee:Number.parseInt(path.slice(42,48),16)};
   }else if([input,output].includes(lower(to))&&data.slice(0,10)==='0xa9059cbb'){
    const d=decode(parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),data),target=lower(d.args[0]),amount=d.args[1];
    if([s.wallet,ROUTER,UNIVERSAL].includes(target)||amount<=0n)fail('UNSUPPORTED_FEE');fees.push({token:lower(to),target,amount});
   }else fail('UNSUPPORTED_EXECUTE');
  }else fail('UNSUPPORTED_COMMAND');
 }
 if(!pull||!swap||!approvals)fail('MISSING_SWAP');
 const pool=lower(await poolFor(input,output,swap.fee,receipt.blockNumber));
 if(!/^0x[0-9a-f]{40}$/.test(pool)||/^0x0{40}$/.test(pool)||fees.some(f=>f.target===pool))fail('UNREGISTERED_POOL');
 const swaps=receipt.logs.filter(l=>lower(l.topics?.[0])===lower(toEventSelector(swapAbi[0])));
 if(swaps.length!==1||lower(swaps[0].address)!==pool)fail('AMBIGUOUS_POOL');
 const actual=decodeEventLog({abi:swapAbi,data:swaps[0].data,topics:swaps[0].topics}).args;
 const input0=BigInt(input)<BigInt(output);
 if(lower(actual.sender)!==UNIVERSAL||lower(actual.recipient)!==swap.recipient||(input0?actual.amount0:actual.amount1)!==inputUnits||(input0?actual.amount1:actual.amount0)!==-outputUnits)fail('POOL_AMOUNT_MISMATCH');
 const transfers=receipt.logs.filter(l=>lower(l.topics?.[0])===TRANSFER&&l.topics.length===3).map(l=>({token:lower(l.address),from:'0x'+l.topics[1].slice(-40).toLowerCase(),to:'0x'+l.topics[2].slice(-40).toLowerCase(),amount:BigInt(l.data)}));
 const sum=(token,from,to)=>transfers.filter(t=>t.token===token&&t.from===from&&t.to===to).reduce((n,t)=>n+t.amount,0n);
 const declaredFees=new Map();for(const f of fees){const key=f.token+':'+f.target;declaredFees.set(key,(declaredFees.get(key)||0n)+f.amount);}
 for(const [key,amount]of declaredFees){const [token,target]=key.split(':');if(sum(token,ROUTER,target)!==amount)fail('FEE_NOT_PAID');}
 const inputFee=fees.filter(f=>f.token===input).reduce((n,f)=>n+f.amount,0n),outputFee=fees.filter(f=>f.token===output).reduce((n,f)=>n+f.amount,0n);
 const refund=sum(input,ROUTER,s.wallet);
 if(sum(input,s.wallet,ROUTER)!==pull||pull-refund!==inputUnits+inputFee||outputFee>=outputUnits)fail('PULL_NOT_RECONCILED');
 if(refund&&!sweeps.includes(input))fail('UNDECLARED_REFUND');
 if(swap.recipient===s.wallet&&outputFee!==0n)fail('OUTPUT_FEE_MISMATCH');
 if(swap.recipient===ROUTER&&(!sweeps.includes(output)||sum(output,ROUTER,s.wallet)!==outputUnits-outputFee))fail('OUTPUT_NOT_RECONCILED');
 const allowed=(t)=>{
  if(t.token===input&&((t.from===s.wallet&&t.to===ROUTER)||(t.from===ROUTER&&t.to===s.wallet)||(t.from===ROUTER&&[UNIVERSAL,pool].includes(t.to))||(t.from===UNIVERSAL&&t.to===pool)))return true;
  if(t.token===output&&((t.from===pool&&t.to===swap.recipient)||(t.from===ROUTER&&t.to===s.wallet)))return true;
  return t.from===ROUTER&&declaredFees.has(t.token+':'+t.to);
 };
 // Additional cash flows in the same transaction cannot be hidden as a fee.
 if(transfers.some(t=>[s.wallet,ROUTER,UNIVERSAL,pool].some(a=>a===t.from||a===t.to)&&!allowed(t)))fail('UNEXPLAINED_TRANSFER');
 if(net.size!==2||net.get(input)!==-(inputUnits+inputFee)||net.get(output)!==outputUnits-outputFee)fail('WALLET_NOT_RECONCILED');
 return {walletDomainUnits:(s.side==='buy'?outputUnits-outputFee:inputUnits+inputFee).toString(),walletQuoteUnits:(s.side==='buy'?inputUnits+inputFee:outputUnits-outputFee).toString(),routerFeeUnits:(s.side==='buy'?inputFee:outputFee).toString(),routerDomainFeeUnits:(s.side==='buy'?outputFee:inputFee).toString(),router:ROUTER,routerImplementation:IMPLEMENTATION,pool,swapLogIndex:swaps[0].logIndex,executionId:outer.args[0].toString()};
}
module.exports={verifyRouterSettlement,ROUTER,IMPLEMENTATION,UNIVERSAL,IMPLEMENTATION_SLOT};
