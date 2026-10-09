'use strict';
// Reviewed, deliberately narrow ERC-4337 route: EntryPoint v0.8 ->
// Simple7702Account.execute / approval batch -> UniversalRouter V3 exact-input swaps.
// Verified source/runtime evidence: explorer.doma.xyz/api/v2/smart-contracts/
// followed by the pinned addresses below (fee/permit path reviewed 2026-10-09).
// Fee routes allow one exact-input pool, optional Permit2 single permit, output fee and sweep.
// Batch support is limited to one exact input-token approval followed by that route.
const {CHAIN,USDC,WETH,TRANSFER,receiptFlows,key,volume}=require('./public-trade-worker.cjs');
const ENTRY='0x4337084d9e255ff0702461cf8895ce9e3b5ff108';
const ACCOUNT='0x4cd241e8d1510e30b2076397afc7508ae59c66c9';
const ROUTER='0x5089863e97196773038f98459262d866f2281f58';
const PERMIT2='0x000000000022d473030f116ddee9f6b43ac78ba3';
const PERMIT2_HASH='0xef1ed184f18f79781d7abbb97561b742b149c59c424a2a9d4d7f8a4190db6830';
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
// ERC-4337 EIP-7702 marker only: no factory and no account initialization data.
// Existing delegate/runtime and historical UserOp hash/signature proofs apply.
const EIP7702_INIT_CODE='0x7702'+'00'.repeat(18);
async function verifySmartWalletSettlement({swaps,transaction:tx,receipt,codeAt,poolFor,userOperationHash}){
 if(lower(tx?.to)!==ENTRY)return null;
 const {parseAbi,parseAbiParameters,decodeFunctionData,encodeFunctionData,decodeAbiParameters,encodeAbiParameters,decodeEventLog,toEventSelector,keccak256,recoverAddress,recoverTypedDataAddress}=require('viem');
 if(!swaps.length||new Set(swaps.map(key)).size!==swaps.length)fail('DUPLICATE_INDEX_ROW');
 const first=swaps[0],wallet=addr(first.wallet),domain=addr(first.domain);
 if(!wallet||!domain||[USDC,WETH,zero].includes(domain)||swaps.some(s=>s.wallet!==wallet||s.tx!==first.tx||s.domain!==domain||s.side!==first.side||s.executedAt!==first.executedAt))fail('AMBIGUOUS_ECONOMIC_FILL');
 if(Number(BigInt(tx.chainId))!==CHAIN||BigInt(tx.value)!==0n||receipt?.status!=='0x1'||lower(tx.hash)!==first.tx||lower(receipt.transactionHash)!==first.tx||lower(receipt.blockHash)!==lower(tx.blockHash)||BigInt(receipt.blockNumber)!==BigInt(tx.blockNumber)||lower(receipt.to)!==ENTRY)fail('TRANSACTION_MISMATCH');
 for(const address of [ENTRY,ACCOUNT,ROUTER])if(keccak256(await codeAt(address,receipt.blockNumber))!==HASHES[address])fail('UNREVIEWED_RUNTIME');
 if(lower(await codeAt(wallet,receipt.blockNumber))!=='0xef0100'+ACCOUNT.slice(2))fail('UNREVIEWED_ACCOUNT');
 const decode=(abi,data)=>{try{const c=decodeFunctionData({abi,data});if(lower(encodeFunctionData({abi,functionName:c.functionName,args:c.args}))!==lower(data))fail('CALLDATA_INVALID');return c.args;}catch{fail('CALLDATA_INVALID');}};
 const [ops]=decode(parseAbi([`function handleOps(${OP}[] ops,address beneficiary)`]),tx.input);
 if(ops.length!==1)fail('MULTIPLE_OPERATIONS');
 const op=ops[0];if(lower(op.sender)!==wallet||!['0x',EIP7702_INIT_CODE].includes(lower(op.initCode)))fail('OPERATION_MISMATCH');
 let target,value,data,approval=null,allowance=null;
 if(lower(op.callData).startsWith('0x34fcd5be')){
  const [calls]=decode(parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),op.callData);
  if(![2,3].includes(calls.length)||calls.some(c=>c.value!==0n))fail('UNSUPPORTED_ACCOUNT_BATCH');
  const [spender,amount]=decode(parseAbi(['function approve(address spender,uint256 amount)']),calls[0].data);
  if(lower(spender)!==PERMIT2||amount<=0n)fail('UNSUPPORTED_APPROVAL');
  approval={token:lower(calls[0].target),amount};
  if(calls.length===3){
   if(lower(calls[1].target)!==PERMIT2)fail('UNSUPPORTED_ACCOUNT_BATCH');
   const [token,spender,amount,expiration]=decode(parseAbi(['function approve(address token,address spender,uint160 amount,uint48 expiration)']),calls[1].data);
   if(lower(spender)!==ROUTER||amount<=0n||expiration<BigInt(Math.floor(Date.parse(first.executedAt)/1000))||lower(token)!==approval.token)fail('UNSUPPORTED_ALLOWANCE');
   allowance={token:lower(token),amount,expiration};
  }
  ({target,value,data}=calls.at(-1));
 }else [target,value,data]=decode(parseAbi(['function execute(address target,uint256 value,bytes data)']),op.callData);
 if(lower(target)!==ROUTER||value!==0n)fail('UNSUPPORTED_ACCOUNT_CALL');
 const [commands,allInputs,deadline]=decode(parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable','function execute(bytes commands,bytes[] inputs) payable']),data);
 if(deadline!==undefined&&deadline<BigInt(Math.floor(Date.parse(first.executedAt)/1000)))fail('EXPIRED_DEADLINE');
 const withPermit=commands==='0x0a000604',withFee=withPermit||commands==='0x000604';
 if(!(withFee||/^0x(?:00){1,2}$/.test(commands))||allInputs.length!==(commands.length-2)/2||approval&&!withPermit&&!allowance||allowance&&!/^0x(?:00){1,2}$/.test(commands))fail('UNSUPPORTED_COMMANDS');
 const inputs=withFee?[allInputs[withPermit?1:0]]:allInputs;
 const logs=receipt.logs||[],seen=new Set();
 for(const l of logs){if(l.removed||lower(l.transactionHash)!==first.tx||lower(l.blockHash)!==lower(receipt.blockHash)||BigInt(l.blockNumber)!==BigInt(receipt.blockNumber)||!/^0x[0-9a-f]+$/i.test(l.logIndex)||seen.has(BigInt(l.logIndex).toString()))fail('LOG_IDENTITY_INVALID');seen.add(BigInt(l.logIndex).toString());}
 const eventAbi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
 const opLogs=logs.filter(l=>lower(l.topics?.[0])===lower(toEventSelector(eventAbi[0])));
 if(opLogs.length!==1||lower(opLogs[0].address)!==ENTRY)fail('OPERATION_EVENT_MISMATCH');
 let event;try{event=decodeEventLog({abi:eventAbi,data:opLogs[0].data,topics:opLogs[0].topics,strict:true}).args;}catch{fail('OPERATION_EVENT_INVALID');}
 const paymaster=op.paymasterAndData==='0x'?zero:lower(op.paymasterAndData.slice(0,42));
 if(!event.success||lower(event.sender)!==wallet||event.nonce!==op.nonce||lower(event.paymaster)!==paymaster||lower(event.userOpHash)!==lower(await userOperationHash(op,receipt.blockNumber)))fail('OPERATION_EVENT_MISMATCH');
 if(lower(await recoverAddress({hash:event.userOpHash,signature:op.signature}))!==wallet)fail('OPERATION_SIGNATURE_MISMATCH');
 if(allowance){
  if(keccak256(await codeAt(PERMIT2,receipt.blockNumber))!==PERMIT2_HASH)fail('UNREVIEWED_PERMIT2');
  const approvalAbi=parseAbi(['event Approval(address indexed owner,address indexed token,address indexed spender,uint160 amount,uint48 expiration)']);
  const events=logs.filter(l=>lower(l.address)===PERMIT2&&lower(l.topics?.[0])===lower(toEventSelector(approvalAbi[0])));
  if(events.length!==1)fail('ALLOWANCE_EVENT_MISMATCH');
  let actual;try{actual=decodeEventLog({abi:approvalAbi,data:events[0].data,topics:events[0].topics,strict:true}).args;}catch{fail('ALLOWANCE_EVENT_MISMATCH');}
  if(lower(actual.owner)!==wallet||lower(actual.token)!==allowance.token||lower(actual.spender)!==ROUTER||actual.amount!==allowance.amount||actual.expiration!==allowance.expiration)fail('ALLOWANCE_EVENT_MISMATCH');
  const ercAbi=parseAbi(['event Approval(address indexed owner,address indexed spender,uint256 value)']);
  const ercEvents=logs.filter(l=>lower(l.address)===approval.token&&lower(l.topics?.[0])===lower(toEventSelector(ercAbi[0])));
  if(ercEvents.length!==1)fail('APPROVAL_EVENT_MISMATCH');
  let erc;try{erc=decodeEventLog({abi:ercAbi,data:ercEvents[0].data,topics:ercEvents[0].topics,strict:true}).args;}catch{fail('APPROVAL_EVENT_MISMATCH');}
  if(lower(erc.owner)!==wallet||lower(erc.spender)!==PERMIT2||erc.value!==approval.amount)fail('APPROVAL_EVENT_MISMATCH');
 }
 const paramsDecode=(params,data)=>{try{const p=decodeAbiParameters(params,data);if(lower(encodeAbiParameters(params,p))!==lower(data))fail('CALLDATA_INVALID');return p;}catch{fail('CALLDATA_INVALID');}};
 const types=(...names)=>names.map(type=>({type})),resolve=a=>BigInt(a)===1n?wallet:BigInt(a)===2n?ROUTER:lower(a);
 let permit=null,feeCommand=null,sweepCommand=null,totalFee=0n;
 if(withFee){
  if(keccak256(await codeAt(PERMIT2,receipt.blockNumber))!==PERMIT2_HASH)fail('UNREVIEWED_PERMIT2');
  feeCommand=paramsDecode(types('address','address','uint256'),allInputs[withPermit?2:1]);
  sweepCommand=paramsDecode(types('address','address','uint256'),allInputs[withPermit?3:2]);
 }
 if(withPermit){
  const [p,signature]=paramsDecode(parseAbiParameters('((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline) permit,bytes signature'),allInputs[0]);permit=p;
  const at=BigInt(Math.floor(Date.parse(first.executedAt)/1000));
  if(lower(p.spender)!==ROUTER||BigInt(p.details.expiration)<at||p.sigDeadline<at)fail('PERMIT_MISMATCH');
  let signer;try{signer=await recoverTypedDataAddress({domain:{name:'Permit2',chainId:CHAIN,verifyingContract:PERMIT2},types:{PermitDetails:[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}],PermitSingle:[{name:'details',type:'PermitDetails'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}]},primaryType:'PermitSingle',message:p,signature});}catch{fail('PERMIT_SIGNATURE_INVALID');}
  if(lower(signer)!==wallet)fail('PERMIT_SIGNATURE_MISMATCH');
  const permitAbi=parseAbi(['event Permit(address indexed owner,address indexed token,address indexed spender,uint160 amount,uint48 expiration,uint48 nonce)']);
  const ls=logs.filter(l=>lower(l.address)===PERMIT2&&lower(l.topics?.[0])===lower(toEventSelector(permitAbi[0])));
  if(ls.length!==1)fail('PERMIT_EVENT_MISMATCH');
  const actual=decodeEventLog({abi:permitAbi,data:ls[0].data,topics:ls[0].topics,strict:true}).args;
  if(lower(actual.owner)!==wallet||lower(actual.token)!==lower(p.details.token)||lower(actual.spender)!==ROUTER||actual.amount!==p.details.amount||actual.expiration!==p.details.expiration||actual.nonce!==p.details.nonce)fail('PERMIT_EVENT_MISMATCH');
 }
 const swapAbi=parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
 const swapLogs=logs.filter(l=>lower(l.topics?.[0])===lower(toEventSelector(swapAbi[0]))),used=new Set(),paths=[],expectedTransfers=[],legs=[];
 const params=['address','uint256','uint256','bytes','bool'].map(type=>({type}));
 let walletDomain=0n,walletQuote=0n,quote=null;
 for(const input of inputs){
  let p;try{p=decodeAbiParameters(params,input);if(lower(encodeAbiParameters(params,p))!==lower(input))fail('CALLDATA_INVALID');}catch{fail('CALLDATA_INVALID');}
  const [recipient,amountIn,minOut,path,payer]=p;
  if(!payer||resolve(recipient)!==(withFee?ROUTER:wallet)||amountIn<=0n)fail('COMMAND_MISMATCH');
  if(!/^0x[0-9a-f]+$/.test(path)||![88,134].includes(path.length))fail('UNSUPPORTED_PATH');
  const tokens=['0x'+path.slice(2,42)],fees=[];
  for(let i=42;i<path.length;i+=46){fees.push(parseInt(path.slice(i,i+6),16));tokens.push('0x'+path.slice(i+6,i+46));}
  const buy=first.side==='buy',q=buy?tokens[0]:tokens.at(-1);
  if(![USDC,WETH].includes(q)||(quote&&quote!==q)||(buy?tokens.at(-1):tokens[0])!==domain||new Set(tokens).size!==tokens.length||fees.some(f=>![100,500,3000,10000].includes(f))||(tokens.length===3&&(q!==USDC||tokens[1]!==WETH)))fail('UNSUPPORTED_PATH');
  quote=q;let inputUnits=amountIn,domainLeg;
  if(withFee&&tokens.length!==2)fail('UNSUPPORTED_PATH');
  if(permit&&(lower(permit.details.token)!==tokens[0]||permit.details.amount<amountIn))fail('PERMIT_MISMATCH');
  if(approval&&(approval.token!==tokens[0]||approval.amount<amountIn))fail('UNSUPPORTED_APPROVAL');
  if(allowance&&(allowance.token!==tokens[0]||allowance.amount<amountIn))fail('UNSUPPORTED_ALLOWANCE');
  const pools=[];
  for(let i=0;i<fees.length;i++){
   const pool=addr(await poolFor(tokens[i],tokens[i+1],fees[i],receipt.blockNumber));
   if(!pool||[zero,wallet,ROUTER,...tokens,...pools].includes(pool))fail('UNREGISTERED_POOL');pools.push(pool);
   const matches=swapLogs.filter(l=>!used.has(l)&&lower(l.address)===pool);
   if(matches.length!==1)fail('AMBIGUOUS_POOL');const log=matches[0];used.add(log);
   let s;try{s=decodeEventLog({abi:swapAbi,data:log.data,topics:log.topics,strict:true}).args;}catch{fail('SWAP_EVENT_INVALID');}
   const input0=BigInt(tokens[i])<BigInt(tokens[i+1]),actualIn=input0?s.amount0:s.amount1,output=-(input0?s.amount1:s.amount0),to=i===fees.length-1&&!withFee?wallet:ROUTER;
   if(actualIn!==inputUnits||output<=0n||lower(s.sender)!==ROUTER||lower(s.recipient)!==to)fail('POOL_AMOUNT_MISMATCH');
   expectedTransfers.push({token:tokens[i],from:i===0?wallet:ROUTER,to:pool,units:actualIn.toString()},{token:tokens[i+1],from:pool,to,units:output.toString()});
   if(tokens[i]===domain||tokens[i+1]===domain)domainLeg={quote:tokens[i]===domain?tokens[i+1]:tokens[i],domainUnits:(tokens[i]===domain?actualIn:output).toString(),quoteUnits:(tokens[i]===domain?output:actualIn).toString(),pool};
   inputUnits=output;
  }
  if(inputUnits<minOut||!domainLeg)fail('MINIMUM_OUTPUT_MISMATCH');
  if(withFee){
   const output=tokens.at(-1),feeTo=resolve(feeCommand[1]),bips=feeCommand[2];
   if(lower(feeCommand[0])!==output||bips<=0n||bips>=10000n||[zero,wallet,ROUTER,PERMIT2,...tokens,...pools].includes(feeTo))fail('INVALID_FEE');
   totalFee=inputUnits*bips/10000n;const received=inputUnits-totalFee;
   if(lower(sweepCommand[0])!==output||resolve(sweepCommand[1])!==wallet||sweepCommand[2]>received)fail('SWEEP_MISMATCH');
   if(totalFee)expectedTransfers.push({token:output,from:ROUTER,to:feeTo,units:totalFee.toString()});
   expectedTransfers.push({token:output,from:ROUTER,to:wallet,units:received.toString()});inputUnits=received;
  }
  walletDomain+=buy?inputUnits:amountIn;walletQuote+=buy?amountIn:inputUnits;
  legs.push(domainLeg);paths.push({tokens,fees,pools});
 }
 if(used.size!==swapLogs.length)fail('UNEXPLAINED_POOL');
 const totalInput=first.side==='buy'?walletQuote:walletDomain;
 if(approval&&approval.amount<totalInput)fail('UNSUPPORTED_APPROVAL');
 if(allowance&&allowance.amount<totalInput)fail('UNSUPPORTED_ALLOWANCE');
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
 const amounts={walletDomainUnits:swap.domainUnits,walletQuoteUnits:swap.quoteUnits,routerFeeUnits:(first.side==='sell'?totalFee:0n).toString(),...(withFee?{routerDomainFeeUnits:(first.side==='buy'?totalFee:0n).toString(),route:withPermit?'SMART_PERMIT_EXACT_INPUT_PORTION_SWEEP_1':'SMART_EXACT_INPUT_PORTION_SWEEP_1'}:{}),...(allowance?{route:'SMART_ALLOWANCE_EXACT_INPUT_1'}:{}),router:ROUTER,entryPoint:ENTRY,accountImplementation:ACCOUNT,userOperationHash:event.userOpHash,paths,poolLegs:legs,routerRuntimeHash:HASHES[ROUTER]};
 return {swap,amounts,volumeMicros};
}
module.exports={verifySmartWalletSettlement,ENTRY,ACCOUNT,ROUTER,HASHES,HASH_ABI,PERMIT2,PERMIT2_HASH,EIP7702_INIT_CODE};
