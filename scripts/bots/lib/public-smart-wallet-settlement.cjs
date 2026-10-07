'use strict';
// Reviewed, deliberately narrow ERC-4337 route: EntryPoint v0.8 ->
// Simple7702Account.execute -> UniversalRouter V3 exact-input swaps.
// Verified source/runtime evidence: explorer.doma.xyz/api/v2/smart-contracts/
// followed by the three pinned addresses below (reviewed 2026-10-07).
// No other account implementation, batch call, router command or fee is inferred.
const {CHAIN,USDC,WETH,TRANSFER,receiptFlows,key,volume}=require('./public-trade-worker.cjs');
const ENTRY='0x4337084d9e255ff0702461cf8895ce9e3b5ff108';
const ACCOUNT='0x4cd241e8d1510e30b2076397afc7508ae59c66c9';
const ROUTER='0x5089863e97196773038f98459262d866f2281f58';
const HASHES={
 [ENTRY]:'0xa5cad34161f9f9136442e82e95306ba5ae4aad426137dab1c3fb0975c1e25674',
 [ACCOUNT]:'0x82c1e6c0f83d22eef579344e8eff26baf24db4dabe5408d681b00d0512bc3ec4',
 [ROUTER]:'0xe16c4e73f116df542880bac897fef57f4162c2c916de66e4f97f7a938e63170f',
};
const OP='(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)';
const HASH_ABI=`function getUserOpHash(${OP} userOp) view returns(bytes32)`;
const lower=x=>String(x||'').toLowerCase();
const fail=c=>{throw Error('SMART_ROUTER_'+c);};
const addr=x=>/^0x[0-9a-f]{40}$/.test(lower(x))?lower(x):null;
const zero='0x'+'0'.repeat(40);
async function verifySmartWalletSettlement({swaps,transaction:tx,receipt,codeAt,poolFor,userOperationHash}){
 if(lower(tx?.to)!==ENTRY)return null;
 const {parseAbi,decodeFunctionData,encodeFunctionData,decodeAbiParameters,encodeAbiParameters,decodeEventLog,toEventSelector,keccak256,recoverAddress}=require('viem');
 if(!swaps.length||new Set(swaps.map(key)).size!==swaps.length)fail('DUPLICATE_INDEX_ROW');
 const first=swaps[0],wallet=addr(first.wallet),domain=addr(first.domain);
 if(!wallet||!domain||[USDC,WETH,zero].includes(domain)||swaps.some(s=>s.wallet!==wallet||s.tx!==first.tx||s.domain!==domain||s.side!==first.side||s.executedAt!==first.executedAt))fail('AMBIGUOUS_ECONOMIC_FILL');
 if(Number(BigInt(tx.chainId))!==CHAIN||BigInt(tx.value)!==0n||receipt?.status!=='0x1'||lower(tx.hash)!==first.tx||lower(receipt.transactionHash)!==first.tx||lower(receipt.blockHash)!==lower(tx.blockHash)||BigInt(receipt.blockNumber)!==BigInt(tx.blockNumber)||lower(receipt.to)!==ENTRY)fail('TRANSACTION_MISMATCH');
 for(const address of [ENTRY,ACCOUNT,ROUTER])if(keccak256(await codeAt(address,receipt.blockNumber))!==HASHES[address])fail('UNREVIEWED_RUNTIME');
 if(lower(await codeAt(wallet,receipt.blockNumber))!=='0xef0100'+ACCOUNT.slice(2))fail('UNREVIEWED_ACCOUNT');
 const decode=(abi,data)=>{try{const c=decodeFunctionData({abi,data});if(lower(encodeFunctionData({abi,functionName:c.functionName,args:c.args}))!==lower(data))fail('CALLDATA_INVALID');return c.args;}catch{fail('CALLDATA_INVALID');}};
 const [ops]=decode(parseAbi([`function handleOps(${OP}[] ops,address beneficiary)`]),tx.input);
 if(ops.length!==1)fail('MULTIPLE_OPERATIONS');
 const op=ops[0];if(lower(op.sender)!==wallet||op.initCode!=='0x')fail('OPERATION_MISMATCH');
 const [target,value,data]=decode(parseAbi(['function execute(address target,uint256 value,bytes data)']),op.callData);
 if(lower(target)!==ROUTER||value!==0n)fail('UNSUPPORTED_ACCOUNT_CALL');
 const [commands,inputs]=decode(parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']),data);
 if(!/^0x(?:00){1,2}$/.test(commands)||inputs.length!==(commands.length-2)/2)fail('UNSUPPORTED_COMMANDS');
 const logs=receipt.logs||[],seen=new Set();
 for(const l of logs){if(l.removed||lower(l.transactionHash)!==first.tx||lower(l.blockHash)!==lower(receipt.blockHash)||BigInt(l.blockNumber)!==BigInt(receipt.blockNumber)||!/^0x[0-9a-f]+$/i.test(l.logIndex)||seen.has(BigInt(l.logIndex).toString()))fail('LOG_IDENTITY_INVALID');seen.add(BigInt(l.logIndex).toString());}
 const eventAbi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
 const opLogs=logs.filter(l=>lower(l.topics?.[0])===lower(toEventSelector(eventAbi[0])));
 if(opLogs.length!==1||lower(opLogs[0].address)!==ENTRY)fail('OPERATION_EVENT_MISMATCH');
 let event;try{event=decodeEventLog({abi:eventAbi,data:opLogs[0].data,topics:opLogs[0].topics,strict:true}).args;}catch{fail('OPERATION_EVENT_INVALID');}
 const paymaster=op.paymasterAndData==='0x'?zero:lower(op.paymasterAndData.slice(0,42));
 if(!event.success||lower(event.sender)!==wallet||event.nonce!==op.nonce||lower(event.paymaster)!==paymaster||lower(event.userOpHash)!==lower(await userOperationHash(op,receipt.blockNumber)))fail('OPERATION_EVENT_MISMATCH');
 if(lower(await recoverAddress({hash:event.userOpHash,signature:op.signature}))!==wallet)fail('OPERATION_SIGNATURE_MISMATCH');
 const swapAbi=parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
 const swapLogs=logs.filter(l=>lower(l.topics?.[0])===lower(toEventSelector(swapAbi[0]))),used=new Set(),paths=[],expectedTransfers=[],legs=[];
 const params=['address','uint256','uint256','bytes','bool'].map(type=>({type}));
 let walletDomain=0n,walletQuote=0n,quote=null;
 for(const input of inputs){
  let p;try{p=decodeAbiParameters(params,input);if(lower(encodeAbiParameters(params,p))!==lower(input))fail('CALLDATA_INVALID');}catch{fail('CALLDATA_INVALID');}
  const [recipient,amountIn,minOut,path,payer]=p;
  if(!payer||![wallet,'0x'+'1'.padStart(40,'0')].includes(lower(recipient))||amountIn<=0n)fail('COMMAND_MISMATCH');
  if(!/^0x[0-9a-f]+$/.test(path)||![88,134].includes(path.length))fail('UNSUPPORTED_PATH');
  const tokens=['0x'+path.slice(2,42)],fees=[];
  for(let i=42;i<path.length;i+=46){fees.push(parseInt(path.slice(i,i+6),16));tokens.push('0x'+path.slice(i+6,i+46));}
  const buy=first.side==='buy',q=buy?tokens[0]:tokens.at(-1);
  if(![USDC,WETH].includes(q)||(quote&&quote!==q)||(buy?tokens.at(-1):tokens[0])!==domain||new Set(tokens).size!==tokens.length||fees.some(f=>![100,500,3000,10000].includes(f))||(tokens.length===3&&(q!==USDC||tokens[1]!==WETH)))fail('UNSUPPORTED_PATH');
  quote=q;let inputUnits=amountIn,domainLeg;
  const pools=[];
  for(let i=0;i<fees.length;i++){
   const pool=addr(await poolFor(tokens[i],tokens[i+1],fees[i],receipt.blockNumber));
   if(!pool||[zero,wallet,ROUTER,...tokens,...pools].includes(pool))fail('UNREGISTERED_POOL');pools.push(pool);
   const matches=swapLogs.filter(l=>!used.has(l)&&lower(l.address)===pool);
   if(matches.length!==1)fail('AMBIGUOUS_POOL');const log=matches[0];used.add(log);
   let s;try{s=decodeEventLog({abi:swapAbi,data:log.data,topics:log.topics,strict:true}).args;}catch{fail('SWAP_EVENT_INVALID');}
   const input0=BigInt(tokens[i])<BigInt(tokens[i+1]),actualIn=input0?s.amount0:s.amount1,output=-(input0?s.amount1:s.amount0),to=i===fees.length-1?wallet:ROUTER;
   if(actualIn!==inputUnits||output<=0n||lower(s.sender)!==ROUTER||lower(s.recipient)!==to)fail('POOL_AMOUNT_MISMATCH');
   expectedTransfers.push({token:tokens[i],from:i===0?wallet:ROUTER,to:pool,units:actualIn.toString()},{token:tokens[i+1],from:pool,to,units:output.toString()});
   if(tokens[i]===domain||tokens[i+1]===domain)domainLeg={quote:tokens[i]===domain?tokens[i+1]:tokens[i],domainUnits:(tokens[i]===domain?actualIn:output).toString(),quoteUnits:(tokens[i]===domain?output:actualIn).toString(),pool};
   inputUnits=output;
  }
  if(inputUnits<minOut||!domainLeg)fail('MINIMUM_OUTPUT_MISMATCH');
  walletDomain+=buy?inputUnits:amountIn;walletQuote+=buy?amountIn:inputUnits;
  legs.push(domainLeg);paths.push({tokens,fees,pools});
 }
 if(used.size!==swapLogs.length)fail('UNEXPLAINED_POOL');
 const transferKey=t=>[t.token,t.from,t.to,t.units].join(':');
 const transfers=logs.filter(l=>lower(l.topics?.[0])===TRANSFER).map(l=>{
  if(l.topics.length!==3||!/^0x[0-9a-f]{64}$/i.test(l.data)||l.topics.slice(1).some(t=>!/^0x0{24}[0-9a-f]{40}$/i.test(t)))fail('TRANSFER_INVALID');
  return {token:lower(l.address),from:'0x'+l.topics[1].slice(-40).toLowerCase(),to:'0x'+l.topics[2].slice(-40).toLowerCase(),units:BigInt(l.data).toString()};
 });
 if(transfers.length!==expectedTransfers.length||transfers.map(transferKey).sort().join('|')!==expectedTransfers.map(transferKey).sort().join('|'))fail('UNEXPLAINED_TRANSFER');
 const net=receiptFlows(receipt,wallet),sign=first.side==='buy'?1n:-1n;
 if(net.size!==2||net.get(domain)!==sign*walletDomain||net.get(quote)!==-sign*walletQuote)fail('WALLET_NOT_RECONCILED');
 // Match each indexed domain-pool leg exactly once. Quote/quote routing legs
 // are verified above but never create eligible fills or add volume.
 const legKey=s=>[s.quote,s.domainUnits,s.quoteUnits].join(':'),indexed=new Map(swaps.map(s=>[legKey(s),s]));
 if(indexed.size!==legs.length||legs.some(l=>!indexed.has(legKey(l))))fail('INDEX_MISMATCH');
 const volumeMicros=legs.reduce((sum,l)=>sum+volume(indexed.get(legKey(l))),0n);
 const swap={...first,quote,domainUnits:walletDomain.toString(),quoteUnits:walletQuote.toString()};
 const amounts={walletDomainUnits:swap.domainUnits,walletQuoteUnits:swap.quoteUnits,routerFeeUnits:'0',router:ROUTER,entryPoint:ENTRY,accountImplementation:ACCOUNT,userOperationHash:event.userOpHash,paths,poolLegs:legs,routerRuntimeHash:HASHES[ROUTER]};
 return {swap,amounts,volumeMicros};
}
module.exports={verifySmartWalletSettlement,ENTRY,ACCOUNT,ROUTER,HASHES,HASH_ABI};
