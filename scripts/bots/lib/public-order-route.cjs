'use strict';
// Reviewed OrderRouter exact-input USDC -> WETH -> domain purchase only.
// The outer economic quote and final indexed pool leg are different evidence;
// neither is an extra trade. No generic multicall or route inference is allowed.
const {CHAIN,USDC,WETH,TRANSFER,receiptFlows,key,referenceSwap}=require('./public-trade-worker.cjs');
const {ROUTER,IMPLEMENTATION,UNIVERSAL}=require('./public-router-settlement.cjs');
const PINS={
 [ROUTER]:'0x864cc9ad53b338b82da1f7cab85ab0b3d5c8861acb422b6fec63cf36234f36a6',
 [IMPLEMENTATION]:'0x4ee19c6dd46a84bee5ab8dae021f7cded93284b863c40ff0df4d6d1dda929d23',
 [UNIVERSAL]:'0xe16c4e73f116df542880bac897fef57f4162c2c916de66e4f97f7a938e63170f',
};
const lower=x=>String(x||'').toLowerCase(),types=(...names)=>names.map(type=>({type}));
const fail=code=>{throw Error('ORDER_ROUTE_'+code);};
async function verifyLegacyOrderRoute({swaps,refs=[],transaction:tx,receipt,implementation,codeAt,poolFor}){
 if(lower(tx?.to)!==ROUTER)return null;
 const {parseAbi,decodeFunctionData,encodeFunctionData,decodeAbiParameters,encodeAbiParameters,decodeEventLog,toEventSelector,keccak256}=require('viem');
 const outerAbi=parseAbi(['function execute(uint256 executionId,(uint8 commandType,bytes data)[] commands)','event OrderExecuted(uint256 indexed executionId)']);
 const innerAbi=parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline)']);
 const decode=(abi,data)=>{try{const call=decodeFunctionData({abi,data});if(lower(encodeFunctionData({abi,functionName:call.functionName,args:call.args}))!==lower(data))fail('NONCANONICAL_CALLDATA');return call;}catch{fail('CALLDATA_INVALID');}};
 const params=(names,data)=>{try{const ts=types(...names),value=decodeAbiParameters(ts,data);if(lower(encodeAbiParameters(ts,value))!==lower(data))fail('NONCANONICAL_CALLDATA');return value;}catch{fail('CALLDATA_INVALID');}};
 const outer=decode(outerAbi,tx.input),commands=outer.args[1];
 // Leave existing single-pool handling intact; once a two-hop path is present,
 // any unrecognized companion command must fail rather than fall back to netting.
 let candidate=false,universalCalls=0;
 for(const c of commands)if(Number(c.commandType)===3){const [to,data]=params(['address','bytes','uint256'],c.data);if(lower(to)!==UNIVERSAL)continue;if(++universalCalls!==1)fail('MULTIPLE_ROUTES');const inner=decode(innerAbi,data);
  if(inner.args[0]!=='0x00'||inner.args[1].length!==1)fail('COMMANDS_UNSUPPORTED');const p=params(['address','uint256','uint256','bytes','bool'],inner.args[1][0]);if(![88,134].includes(p[3].length))fail('PATH_UNSUPPORTED');candidate=p[3].length===134;
 }
 if(!candidate)return null;
 if(lower(implementation)!==IMPLEMENTATION)fail('UNREVIEWED_IMPLEMENTATION');
 if(receipt?.status!=='0x1'||Number(BigInt(tx.chainId))!==CHAIN||BigInt(tx.value)!==0n||lower(tx.hash)!==lower(receipt.transactionHash)||lower(tx.blockHash)!==lower(receipt.blockHash)||BigInt(tx.blockNumber)!==BigInt(receipt.blockNumber))fail('TRANSACTION_MISMATCH');
 for(const [address,pin]of Object.entries(PINS))if(keccak256(await codeAt(address,receipt.blockNumber))!==pin)fail('UNREVIEWED_RUNTIME');
 if(commands.length>12||!Array.isArray(swaps)||swaps.length!==1)fail('INDEX_AMBIGUOUS');
 const indexed=swaps[0],wallet=lower(indexed.wallet),domain=lower(indexed.domain);
 if(!/^0x[0-9a-f]{40}$/.test(wallet)||!/^0x[0-9a-f]{40}$/.test(domain)||[USDC,WETH].includes(domain)||indexed.side!=='buy'||indexed.quote!==WETH||lower(indexed.tx)!==lower(tx.hash))fail('INDEX_MISMATCH');
 let pull=null,route=null,approval=0;const fees=[],sweeps=[];
 for(const c of commands){const kind=Number(c.commandType);
  if(kind===0){const [token,from,units]=params(['address','address','uint256'],c.data);if(pull!==null||lower(token)!==USDC||lower(from)!==wallet||units<=0n)fail('PULL_INVALID');pull=units;}
  else if(kind===1||kind===2){const [token,to,units]=params(['address','address','uint256'],c.data);if(lower(token)!==USDC||lower(to)!==UNIVERSAL||units<=0n||++approval!==1)fail('APPROVAL_INVALID');}
  else if(kind===4){const [token,to]=params(['address','address','uint256'],c.data);if(![USDC,domain].includes(lower(token))||lower(to)!==wallet||sweeps.includes(lower(token)))fail('SWEEP_INVALID');sweeps.push(lower(token));}
  else if(kind===3){const [to,data,value]=params(['address','bytes','uint256'],c.data);if(value!==0n)fail('NATIVE_VALUE_UNSUPPORTED');
   if(lower(to)===UNIVERSAL){if(route)fail('MULTIPLE_ROUTES');const inner=decode(innerAbi,data);if(inner.args[0]!=='0x00'||inner.args[1].length!==1)fail('COMMANDS_UNSUPPORTED');
    const [recipient,amount,minimum,path,payer]=params(['address','uint256','uint256','bytes','bool'],inner.args[1][0]);
    if(path.length!==134||!payer||amount<=0n||!['0x'+path.slice(2,42),'0x'+path.slice(48,88),'0x'+path.slice(94)].every((t,i)=>t===[USDC,WETH,domain][i]))fail('PATH_UNSUPPORTED');
    const routeFees=[Number.parseInt(path.slice(42,48),16),Number.parseInt(path.slice(88,94),16)];if(routeFees.some(f=>![100,500,3000,10000].includes(f))||![wallet,ROUTER].includes(lower(recipient)))fail('PATH_UNSUPPORTED');
    route={recipient:lower(recipient),amount,minimum,fees:routeFees};
   }else if([USDC,domain].includes(lower(to))&&data.slice(0,10)==='0xa9059cbb'){const d=decode(parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),data),target=lower(d.args[0]),amount=d.args[1];if([wallet,ROUTER,UNIVERSAL].includes(target)||amount<=0n)fail('FEE_INVALID');fees.push({token:lower(to),target,amount});}
   else fail('COMMANDS_UNSUPPORTED');
  }else fail('COMMANDS_UNSUPPORTED');
 }
 if(!pull||!route||approval!==1)fail('COMMANDS_INCOMPLETE');
 const pools=[lower(await poolFor(USDC,WETH,route.fees[0],receipt.blockNumber)),lower(await poolFor(WETH,domain,route.fees[1],receipt.blockNumber))];
 if(new Set(pools).size!==2||pools.some(p=>!/^0x[0-9a-f]{40}$/.test(p)||/^0x0{40}$/.test(p))||fees.some(f=>pools.includes(f.target)))fail('POOL_UNVERIFIED');
 const swapAbi=parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
 const logs=receipt.logs||[];
 for(const l of logs)if(l.removed||l.transactionHash&&lower(l.transactionHash)!==lower(tx.hash)||l.blockHash&&lower(l.blockHash)!==lower(receipt.blockHash)||l.blockNumber&&BigInt(l.blockNumber)!==BigInt(receipt.blockNumber))fail('LOG_IDENTITY_INVALID');
 const swapLogs=logs.filter(l=>lower(l.topics?.[0])===lower(toEventSelector(swapAbi[0])));
 if(swapLogs.length!==2||pools.some(p=>swapLogs.filter(l=>lower(l.address)===p).length!==1))fail('POOL_EVENTS_AMBIGUOUS');
 if(swapLogs.some(l=>!/^0x[0-9a-f]+$|^\d+$/i.test(String(l.logIndex)))||new Set(swapLogs.map(l=>BigInt(l.logIndex).toString())).size!==2)fail('LOG_IDENTITY_INVALID');
 const legs=pools.map((p,i)=>{const log=swapLogs.find(l=>lower(l.address)===p),a=decodeEventLog({abi:swapAbi,data:log.data,topics:log.topics}).args,input=i?WETH:USDC,output=i?domain:WETH,input0=BigInt(input)<BigInt(output),paid=input0?a.amount0:a.amount1,received=-(input0?a.amount1:a.amount0);
  if(lower(a.sender)!==UNIVERSAL||lower(a.recipient)!==(i?route.recipient:UNIVERSAL)||paid<=0n||received<=0n)fail('POOL_EVENT_MISMATCH');return {paid,received,index:log.logIndex};});
 if(legs[0].paid!==route.amount||legs[0].received!==legs[1].paid||legs[1].received<BigInt(route.minimum)||legs[1].paid!==BigInt(indexed.quoteUnits)||legs[1].received!==BigInt(indexed.domainUnits))fail('POOL_AMOUNTS_MISMATCH');
 const execution=logs.filter(l=>lower(l.address)===ROUTER&&lower(l.topics?.[0])===lower(toEventSelector(outerAbi[1])));
 if(execution.length!==1||decodeEventLog({abi:outerAbi,data:execution[0].data,topics:execution[0].topics}).args.executionId!==outer.args[0])fail('EXECUTION_MISMATCH');
 const transfers=logs.filter(l=>lower(l.topics?.[0])===TRANSFER&&l.topics.length===3).map(l=>({token:lower(l.address),from:'0x'+l.topics[1].slice(-40).toLowerCase(),to:'0x'+l.topics[2].slice(-40).toLowerCase(),units:BigInt(l.data)}));
 const sum=(token,from,to)=>transfers.filter(t=>t.token===token&&t.from===from&&t.to===to).reduce((n,t)=>n+t.units,0n);
 const declared=new Map();for(const f of fees){const k=f.token+':'+f.target;declared.set(k,(declared.get(k)||0n)+f.amount);}for(const[k,n]of declared){const [token,to]=k.split(':');if(sum(token,ROUTER,to)!==n)fail('FEE_NOT_PAID');}
 const inputFee=fees.filter(f=>f.token===USDC).reduce((n,f)=>n+f.amount,0n),outputFee=fees.filter(f=>f.token===domain).reduce((n,f)=>n+f.amount,0n),refund=sum(USDC,ROUTER,wallet),output=legs[1].received;
 if(sum(USDC,wallet,ROUTER)!==pull||pull-refund!==route.amount+inputFee||refund&&!sweeps.includes(USDC)||outputFee>=output)fail('PULL_NOT_RECONCILED');
 if(sum(USDC,ROUTER,pools[0])+sum(USDC,UNIVERSAL,pools[0])!==route.amount||sum(USDC,ROUTER,UNIVERSAL)!==sum(USDC,UNIVERSAL,pools[0])||sum(WETH,pools[0],UNIVERSAL)!==legs[0].received||sum(WETH,UNIVERSAL,pools[1])!==legs[1].paid||sum(domain,pools[1],route.recipient)!==output)fail('POOL_TRANSFERS_MISMATCH');
 if(route.recipient===wallet&&outputFee!==0n||route.recipient===ROUTER&&(!sweeps.includes(domain)||sum(domain,ROUTER,wallet)!==output-outputFee))fail('OUTPUT_NOT_RECONCILED');
 const allowed=t=>t.token===USDC&&((t.from===wallet&&t.to===ROUTER)||(t.from===ROUTER&&[wallet,UNIVERSAL,pools[0]].includes(t.to))||(t.from===UNIVERSAL&&t.to===pools[0]))||t.token===WETH&&((t.from===pools[0]&&t.to===UNIVERSAL)||(t.from===UNIVERSAL&&t.to===pools[1]))||t.token===domain&&((t.from===pools[1]&&t.to===route.recipient)||(t.from===ROUTER&&t.to===wallet))||t.from===ROUTER&&declared.has(t.token+':'+t.to);
 if(transfers.some(t=>[wallet,ROUTER,UNIVERSAL,...pools].some(a=>a===t.from||a===t.to)&&!allowed(t)))fail('UNEXPLAINED_TRANSFER');
 const net=receiptFlows(receipt,wallet);if(net.size!==2||net.get(USDC)!==-(route.amount+inputFee)||net.get(domain)!==output-outputFee)fail('WALLET_NOT_RECONCILED');
 const swap={...indexed,quote:USDC,quoteUnits:route.amount.toString(),domainUnits:output.toString()};
 if(refs.length&&(refs.length!==1||refs[0].status!=='verified'||key(referenceSwap(refs[0]))!==key(swap)||Date.parse(refs[0].executedAt)!==Date.parse(swap.executedAt)))fail('STRATEGY_ATTRIBUTION_MISMATCH');
 return {swap,volumeMicros:route.amount,amounts:{walletDomainUnits:(output-outputFee).toString(),walletQuoteUnits:(route.amount+inputFee).toString(),walletQuoteToken:USDC,routerFeeUnits:inputFee.toString(),routerDomainFeeUnits:outputFee.toString(),router:ROUTER,routerImplementation:IMPLEMENTATION,routerRuntimeHashes:PINS,pools,swapLogIndices:legs.map(l=>l.index),executionId:outer.args[0].toString(),route:'USDC_WETH_DOMAIN_EXACT_INPUT_V1'}};
}


// Preserve the original proof byte-for-byte for its already reviewed buy shape.
// New shapes are bounded to one reverse two-hop sale, or one direct buy followed
// by one WETH buy in a single Universal call. Neither route becomes another fill.
async function verifyOrderRoute(context){
 const tx=context.transaction;if(lower(tx?.to)!==ROUTER)return null;
 const {parseAbi,decodeFunctionData,decodeAbiParameters}=require('viem');
 const outerAbi=parseAbi(['function execute(uint256 executionId,(uint8 commandType,bytes data)[] commands)']);
 const innerAbi=parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline)']);
 let extended=false;
 try{
  const outer=decodeFunctionData({abi:outerAbi,data:tx.input});
  for(const c of outer.args[1])if(Number(c.commandType)===3){
   const [to,data]=decodeAbiParameters(types('address','bytes','uint256'),c.data);if(lower(to)!==UNIVERSAL)continue;
   const inner=decodeFunctionData({abi:innerAbi,data});
   if(inner.args[0]==='0x0000')extended=true;
   if(inner.args[0]==='0x00'&&inner.args[1].length===1){
    const p=decodeAbiParameters(types('address','uint256','uint256','bytes','bool'),inner.args[1][0]);
    if(p[3].length===134&&lower('0x'+p[3].slice(94))===USDC)extended=true;
   }
  }
 }catch{fail('CALLDATA_INVALID');}
 return extended?verifyExtendedOrderRoute(context):verifyLegacyOrderRoute(context);
}
async function verifyExtendedOrderRoute({swaps,refs=[],transaction:tx,receipt,implementation,codeAt,poolFor}){
 const {parseAbi,decodeFunctionData,encodeFunctionData,decodeAbiParameters,encodeAbiParameters,decodeEventLog,toEventSelector,keccak256}=require('viem');
 const outerAbi=parseAbi(['function execute(uint256 executionId,(uint8 commandType,bytes data)[] commands)','event OrderExecuted(uint256 indexed executionId)']);
 const innerAbi=parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline)']);
 const decode=(abi,data)=>{try{const call=decodeFunctionData({abi,data});if(lower(encodeFunctionData({abi,functionName:call.functionName,args:call.args}))!==lower(data))fail('NONCANONICAL_CALLDATA');return call;}catch{fail('CALLDATA_INVALID');}};
 const params=(names,data)=>{try{const ts=types(...names),value=decodeAbiParameters(ts,data);if(lower(encodeAbiParameters(ts,value))!==lower(data))fail('NONCANONICAL_CALLDATA');return value;}catch{fail('CALLDATA_INVALID');}};
 const outer=decode(outerAbi,tx.input),commands=outer.args[1];
 if(lower(implementation)!==IMPLEMENTATION)fail('UNREVIEWED_IMPLEMENTATION');
 if(receipt?.status!=='0x1'||Number(BigInt(tx.chainId))!==CHAIN||BigInt(tx.value)!==0n||lower(tx.hash)!==lower(receipt.transactionHash)||lower(tx.blockHash)!==lower(receipt.blockHash)||BigInt(tx.blockNumber)!==BigInt(receipt.blockNumber))fail('TRANSACTION_MISMATCH');
 for(const[address,pin]of Object.entries(PINS))if(keccak256(await codeAt(address,receipt.blockNumber))!==pin)fail('UNREVIEWED_RUNTIME');
 if(commands.length>12||!Array.isArray(swaps)||![1,2].includes(swaps.length))fail('INDEX_AMBIGUOUS');
 const indexed=swaps[0],wallet=lower(indexed.wallet),domain=lower(indexed.domain),buy=indexed.side==='buy';
 if(!/^0x[0-9a-f]{40}$/.test(wallet)||!/^0x[0-9a-f]{40}$/.test(domain)||[USDC,WETH].includes(domain)||!['buy','sell'].includes(indexed.side)||swaps.some(s=>lower(s.wallet)!==wallet||lower(s.domain)!==domain||lower(s.tx)!==lower(tx.hash)||s.side!==indexed.side||s.executedAt!==indexed.executedAt||s.decimals!==indexed.decimals))fail('INDEX_MISMATCH');
 const inputToken=buy?USDC:domain,outputToken=buy?domain:USDC;
 let pull=null,approval=0,routeCall=null;const routes=[],fees=[],sweeps=[];
 for(const c of commands){
  const kind=Number(c.commandType);
  if(kind===0){const[token,from,units]=params(['address','address','uint256'],c.data);if(pull!==null||lower(token)!==inputToken||lower(from)!==wallet||units<=0n)fail('PULL_INVALID');pull=units;}
  else if(kind===1||kind===2){const[token,to,units]=params(['address','address','uint256'],c.data);if(lower(token)!==inputToken||lower(to)!==UNIVERSAL||units<=0n||++approval!==1)fail('APPROVAL_INVALID');}
  else if(kind===4){const[token,to]=params(['address','address','uint256'],c.data);if(![inputToken,outputToken].includes(lower(token))||lower(to)!==wallet||sweeps.includes(lower(token)))fail('SWEEP_INVALID');sweeps.push(lower(token));}
  else if(kind===3){const[to,data,value]=params(['address','bytes','uint256'],c.data);if(value!==0n)fail('NATIVE_VALUE_UNSUPPORTED');
   if(lower(to)===UNIVERSAL){
    if(routeCall)fail('MULTIPLE_ROUTES');routeCall=decode(innerAbi,data);
    if(routeCall.args[0]!== (buy?'0x0000':'0x00')||routeCall.args[1].length!==(buy?2:1))fail('COMMANDS_UNSUPPORTED');
    for(const [i,d] of routeCall.args[1].entries()){
     const[recipient,amount,minimum,path,payer]=params(['address','uint256','uint256','bytes','bool'],d);
     const tokens=buy?(i===0?[USDC,domain]:[USDC,WETH,domain]):[domain,WETH,USDC];
     if(path.length!==2+40*tokens.length+6*(tokens.length-1)||!payer||amount<=0n||![wallet,ROUTER].includes(lower(recipient)))fail('PATH_UNSUPPORTED');
     const routeFees=[];for(let h=0;h<tokens.length;h++){if(lower('0x'+path.slice(2+h*46,42+h*46))!==tokens[h])fail('PATH_UNSUPPORTED');if(h<tokens.length-1)routeFees.push(parseInt(path.slice(42+h*46,48+h*46),16));}
     if(routeFees.some(f=>![100,500,3000,10000].includes(f)))fail('PATH_UNSUPPORTED');
     routes.push({tokens,fees:routeFees,recipient:lower(recipient),amount,minimum});
    }
   }else if([inputToken,outputToken].includes(lower(to))&&data.slice(0,10)==='0xa9059cbb'){
    const d=decode(parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),data),target=lower(d.args[0]),amount=d.args[1];
    if([wallet,ROUTER,UNIVERSAL].includes(target)||/^0x0{40}$/.test(target)||amount<=0n)fail('FEE_INVALID');fees.push({token:lower(to),target,amount});
   }else fail('COMMANDS_UNSUPPORTED');
  }else fail('COMMANDS_UNSUPPORTED');
 }
 if(!pull||!routeCall||approval!==1)fail('COMMANDS_INCOMPLETE');
 if(swaps.length!==routes.length)fail('INDEX_AMBIGUOUS');
 if(routes.some(r=>r.recipient!==routes[0].recipient))fail('PATH_UNSUPPORTED');
 const pools=[];
 for(const r of routes){r.pools=[];for(let i=0;i<r.fees.length;i++){const p=lower(await poolFor(r.tokens[i],r.tokens[i+1],r.fees[i],receipt.blockNumber));r.pools.push(p);pools.push(p);}}
 if(new Set(pools).size!==pools.length||pools.some(p=>!/^0x[0-9a-f]{40}$/.test(p)||/^0x0{40}$/.test(p)||[wallet,ROUTER,UNIVERSAL,inputToken,outputToken,WETH].includes(p))||fees.some(f=>pools.includes(f.target)))fail('POOL_UNVERIFIED');
 const swapAbi=parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
 const logs=receipt.logs||[];
 for(const l of logs)if(l.removed||l.transactionHash&&lower(l.transactionHash)!==lower(tx.hash)||l.blockHash&&lower(l.blockHash)!==lower(receipt.blockHash)||l.blockNumber&&BigInt(l.blockNumber)!==BigInt(receipt.blockNumber))fail('LOG_IDENTITY_INVALID');
 const swapLogs=logs.filter(l=>lower(l.topics?.[0])===lower(toEventSelector(swapAbi[0])));
 if(swapLogs.length!==pools.length||pools.some(p=>swapLogs.filter(l=>lower(l.address)===p).length!==1))fail('POOL_EVENTS_AMBIGUOUS');
 if(swapLogs.some(l=>!/^0x[0-9a-f]+$|^\d+$/i.test(String(l.logIndex)))||new Set(swapLogs.map(l=>BigInt(l.logIndex).toString())).size!==pools.length)fail('LOG_IDENTITY_INVALID');
 const usedIndex=new Set(),legs=[];
 for(const r of routes){
  r.legs=r.pools.map((p,i)=>{const log=swapLogs.find(l=>lower(l.address)===p),a=decodeEventLog({abi:swapAbi,data:log.data,topics:log.topics}).args,input0=BigInt(r.tokens[i])<BigInt(r.tokens[i+1]),paid=input0?a.amount0:a.amount1,received=-(input0?a.amount1:a.amount0),recipient=i===r.pools.length-1?r.recipient:UNIVERSAL;
   if(lower(a.sender)!==UNIVERSAL||lower(a.recipient)!==recipient||paid<=0n||received<=0n)fail('POOL_EVENT_MISMATCH');return {paid,received,index:log.logIndex};});
  if(r.legs[0].paid!==r.amount||r.legs.some((l,i)=>i&&r.legs[i-1].received!==l.paid)||r.legs.at(-1).received<r.minimum)fail('POOL_AMOUNTS_MISMATCH');
  const domainLeg=buy?r.legs.at(-1):r.legs[0],quote=buy?r.tokens.at(-2):WETH;
  const matches=swaps.map((s,i)=>({s,i})).filter(({s})=>s.quote===quote&&BigInt(s.domainUnits)===(buy?domainLeg.received:domainLeg.paid)&&BigInt(s.quoteUnits)===(buy?domainLeg.paid:domainLeg.received));
  if(matches.length!==1||usedIndex.has(matches[0].i))fail('POOL_AMOUNTS_MISMATCH');usedIndex.add(matches[0].i);legs.push(...r.legs);
 }
 if(usedIndex.size!==swaps.length)fail('INDEX_AMBIGUOUS');
 const execution=logs.filter(l=>lower(l.address)===ROUTER&&lower(l.topics?.[0])===lower(toEventSelector(outerAbi[1])));
 if(execution.length!==1||decodeEventLog({abi:outerAbi,data:execution[0].data,topics:execution[0].topics}).args.executionId!==outer.args[0])fail('EXECUTION_MISMATCH');
 const transferLogs=logs.filter(l=>lower(l.topics?.[0])===TRANSFER);
 if(transferLogs.some(l=>l.topics.length!==3||!/^0x[0-9a-f]{64}$/i.test(l.data)))fail('TRANSFER_INVALID');
 const transfers=transferLogs.map(l=>({token:lower(l.address),from:'0x'+l.topics[1].slice(-40).toLowerCase(),to:'0x'+l.topics[2].slice(-40).toLowerCase(),units:BigInt(l.data)}));
 const sum=(token,from,to)=>transfers.filter(t=>t.token===token&&t.from===from&&t.to===to).reduce((n,t)=>n+t.units,0n);
 const expected=new Map(),actual=new Map(),add=(map,token,from,to,n)=>{if(n){const k=[token,from,to].join(':');map.set(k,(map.get(k)||0n)+n);}};
 const scoped=new Set([wallet,ROUTER,UNIVERSAL,...pools]);for(const t of transfers)if(scoped.has(t.from)||scoped.has(t.to))add(actual,t.token,t.from,t.to,t.units);
 const input=routes.reduce((n,r)=>n+r.amount,0n),output=routes.reduce((n,r)=>n+r.legs.at(-1).received,0n),inputFee=fees.filter(f=>f.token===inputToken).reduce((n,f)=>n+f.amount,0n),outputFee=fees.filter(f=>f.token===outputToken).reduce((n,f)=>n+f.amount,0n),refund=sum(inputToken,ROUTER,wallet),recipient=routes[0].recipient;
 if(pull!==input+inputFee+refund||refund&&!sweeps.includes(inputToken)||outputFee>=output)fail('PULL_NOT_RECONCILED');
 if(recipient===wallet&&outputFee!==0n||recipient===ROUTER&&!sweeps.includes(outputToken))fail('OUTPUT_NOT_RECONCILED');
 add(expected,inputToken,wallet,ROUTER,pull);add(expected,inputToken,ROUTER,wallet,refund);
 for(const r of routes){
  const direct=sum(inputToken,ROUTER,r.pools[0]),via=sum(inputToken,UNIVERSAL,r.pools[0]);if(direct+via!==r.amount)fail('POOL_TRANSFERS_MISMATCH');
  add(expected,inputToken,ROUTER,r.pools[0],direct);add(expected,inputToken,ROUTER,UNIVERSAL,via);add(expected,inputToken,UNIVERSAL,r.pools[0],via);
  for(let i=0;i<r.legs.length;i++){
   const outTo=i===r.legs.length-1?recipient:UNIVERSAL;add(expected,r.tokens[i+1],r.pools[i],outTo,r.legs[i].received);
   if(i+1<r.legs.length)add(expected,r.tokens[i+1],UNIVERSAL,r.pools[i+1],r.legs[i].received);
  }
 }
 for(const f of fees)add(expected,f.token,ROUTER,f.target,f.amount);
 if(recipient===ROUTER)add(expected,outputToken,ROUTER,wallet,output-outputFee);
 if(expected.size!==actual.size||[...expected].some(([k,n])=>actual.get(k)!==n))fail('TRANSFERS_NOT_RECONCILED');
 const net=receiptFlows(receipt,wallet);if(net.size!==2||net.get(inputToken)!==-(input+inputFee)||net.get(outputToken)!==output-outputFee)fail('WALLET_NOT_RECONCILED');
 const quote=buy?input:output,domainUnits=buy?output:input;
 const swap={...indexed,quote:USDC,quoteUnits:quote.toString(),domainUnits:domainUnits.toString()};
 if(refs.length&&(refs.length!==1||refs[0].status!=='verified'||key(referenceSwap(refs[0]))!==key(swap)||Date.parse(refs[0].executedAt)!==Date.parse(swap.executedAt)))fail('STRATEGY_ATTRIBUTION_MISMATCH');
 return {swap,volumeMicros:quote,amounts:{walletDomainUnits:(buy?output-outputFee:input+inputFee).toString(),walletQuoteUnits:(buy?input+inputFee:output-outputFee).toString(),walletQuoteToken:USDC,routerFeeUnits:(buy?inputFee:outputFee).toString(),routerDomainFeeUnits:(buy?outputFee:inputFee).toString(),router:ROUTER,routerImplementation:IMPLEMENTATION,routerRuntimeHashes:PINS,pools,swapLogIndices:legs.map(l=>l.index),executionId:outer.args[0].toString(),route:buy?'USDC_SPLIT_DOMAIN_EXACT_INPUT_V1':'DOMAIN_WETH_USDC_EXACT_INPUT_V1'}};
}
module.exports={verifyOrderRoute,PINS};
