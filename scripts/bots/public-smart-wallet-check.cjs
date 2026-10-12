'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const v=require('viem'),adapter=require('./lib/public-smart-wallet-settlement.cjs');
const {collect,normalizePublicSwap,USDC,WETH,TRANSFER}=require('./lib/public-trade-worker.cjs');
const dir=path.join(__dirname,'fixtures/smart-wallet'),codes=JSON.parse(fs.readFileSync(path.join(dir,'runtime-code.json')));
const fixtures=['a80aed76','4e9590d2','3dfb75e1'].map(n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'))));
const feeFixtures=['permit-portion-sweep','portion-sweep'].map(n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'))));
const clone=structuredClone,lower=x=>x.toLowerCase();
const OP='(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)';
const entryAbi=v.parseAbi([`function handleOps(${OP}[] ops,address beneficiary)`]);
const eventAbi=v.parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)']);
const replacer=(_,value)=>typeof value==='bigint'?value.toString():value;
function context(f){
 const wallet=normalizePublicSwap(f.rows[0]).wallet,op=v.decodeFunctionData({abi:entryAbi,data:f.transaction.input}).args[0][0];
 const pools=new Map();for(const p of f.expected.paths)for(let i=0;i<p.fees.length;i++)pools.set([...[p.tokens[i],p.tokens[i+1]].sort(),p.fees[i]].join(':'),p.pools[i]);
 return {swaps:f.rows.map(normalizePublicSwap),transaction:f.transaction,receipt:f.receipt,
  codeAt:async address=>lower(address)===wallet?'0xef0100'+adapter.ACCOUNT.slice(2):codes[lower(address)]||'0x',
  poolFor:async(a,b,fee)=>pools.get([...[a,b].sort(),fee].join(':'))||'0x'+'0'.repeat(40),
  userOperationHash:async actual=>{assert.equal(JSON.stringify(actual,replacer),JSON.stringify(op,replacer),'historical getUserOpHash receives the entire exact operation');return f.expected.userOperationHash;}};
}
async function rejected(label,change,code){const f=clone(fixtures[0]),c=context(f);change(c,f);await assert.rejects(()=>adapter.verifySmartWalletSettlement(c),code,label);}
function alterOp(c,change){const decoded=v.decodeFunctionData({abi:entryAbi,data:c.transaction.input});change(decoded.args[0][0],decoded.args);c.transaction.input=v.encodeFunctionData({abi:entryAbi,functionName:'handleOps',args:decoded.args});}
function mockSource(fsx){const byTx=new Map(fsx.map(f=>[f.transaction.hash,f])),byBlock=new Map(fsx.map(f=>[f.receipt.blockNumber,f]));return {
 finalized:async()=>({number:'0xffffff',timestamp:'2026-10-07T00:00:00Z'}),indexStatus:async()=>true,
 transfers:async()=>[],swaps:async()=>fsx.flatMap(f=>f.rows),
 receipt:async tx=>byTx.get(tx).receipt,
 block:async n=>({hash:byBlock.get(n).receipt.blockHash,timestamp:normalizePublicSwap(byBlock.get(n).rows[0]).executedAt}),
 smartWalletSettlement:async swaps=>adapter.verifySmartWalletSettlement({...context(byTx.get(swaps[0].tx)),swaps}),
 };}
function snapshot(){const w=normalizePublicSwap(fixtures[0].rows[0]).wallet,d=normalizePublicSwap(fixtures[0].rows[0]).domain;return {manifest:{campaign:{id:'model-kombat-zones-1',state:'active',starts_at:'2026-10-06T14:00:00Z',ends_at:'2026-11-03T14:00:00Z'},participants:[{participant:'test',entered_at:'2026-10-06T22:14:50Z'}],markets:[{domain_token:d,quote_token:USDC},{domain_token:d,quote_token:WETH}]},accounts:[{participant:'test',coverage:{complete:true,coverage_from:'2026-10-06T14:00:00Z',confirmed_through:'2026-10-06T23:00:00Z',updated_at:'2026-10-06T23:00:00Z'}}],wallets:[{participant:'test',trade_wallet:w,agent:true}],references:[],fills:[]};}

async function feeRejected(index,label,change,code){const f=clone(feeFixtures[index]),c=context(f);change(c,f);await assert.rejects(()=>adapter.verifySmartWalletSettlement(c),code,label);}
function feeIntent(c,f,change){
 const op=v.decodeFunctionData({abi:entryAbi,data:c.transaction.input}).args[0][0];
 const batch=op.callData.startsWith('0x34fcd5be'),account=v.parseAbi([batch?'function executeBatch((address target,uint256 value,bytes data)[] calls)':'function execute(address target,uint256 value,bytes data)']);
 const a=v.decodeFunctionData({abi:account,data:op.callData}).args,calls=batch?a[0]:[{target:a[0],value:a[1],data:a[2]}];
 const router=v.parseAbi(['function execute(bytes commands,bytes[] inputs) payable']),r=v.decodeFunctionData({abi:router,data:calls.at(-1).data}).args;
 change(calls,r);calls.at(-1).data=v.encodeFunctionData({abi:router,functionName:'execute',args:r});
 op.callData=v.encodeFunctionData({abi:account,functionName:batch?'executeBatch':'execute',args:batch?[calls]:[calls[0].target,calls[0].value,calls[0].data]});
 alterOp(c,target=>Object.assign(target,op));
 // Isolate route validation after the separately tested historical UserOp hash
 // and signature boundary. Production still reads getUserOpHash for this op.
 c.userOperationHash=async()=>f.expected.userOperationHash;
}
async function feeTests(){
 for(const f of feeFixtures){const r=await adapter.verifySmartWalletSettlement(context(f));assert.equal(r.swap.domainUnits,f.expected.domainUnits);assert.equal(r.swap.quoteUnits,f.expected.quoteUnits);assert.equal(r.volumeMicros.toString(),f.expected.volumeMicros);assert.equal(r.amounts.routerFeeUnits,f.expected.routerFeeUnits);assert.equal(r.amounts.routerDomainFeeUnits,f.expected.routerDomainFeeUnits);assert.equal(r.amounts.route,f.expected.route);
  const s=normalizePublicSwap(f.rows[0]),at=Date.parse(s.executedAt),from=new Date(at-60000).toISOString(),through=new Date(at+60000).toISOString(),snap={manifest:{campaign:{id:'test',state:'active',starts_at:from,ends_at:new Date(at+3600000).toISOString()},participants:[{participant:'test',entered_at:from}],markets:[{domain_token:s.domain,quote_token:s.quote}]},accounts:[{participant:'test',coverage:{complete:true,coverage_from:from,confirmed_through:through,updated_at:through}}],wallets:[{participant:'test',trade_wallet:s.wallet,agent:true}],references:[],fills:[]};
  const source={...mockSource([f]),finalized:async()=>({number:'0xffffff',timestamp:through})};let result=await collect(snap,source,{now:at+120000});assert.equal(result.report.complete,true);assert.equal(result.packet.fills.length,1);assert.equal(result.packet.fills[0].source,'agent_wallet');const prior=clone(result.packet.fills);result=await collect({...snap,fills:prior},source,{now:at+120000});assert.deepEqual(result.packet.fills,prior);
  result=await collect({...snap,wallets:[{...snap.wallets[0],agent:false}]},source,{now:at+120000});assert.equal(result.packet.fills.length,0,'wallet association does not turn external manual trading into MCP');
 }
 await feeRejected(0,'unknown Permit2 runtime',c=>{const prev=c.codeAt;c.codeAt=async a=>a===adapter.PERMIT2?'0x':prev(a)},/UNREVIEWED_PERMIT2/);
 await feeRejected(0,'extra batch call',(c,f)=>feeIntent(c,f,calls=>calls.splice(0,0,clone(calls[0]))),/UNSUPPORTED_ACCOUNT_BATCH/);
 await feeRejected(0,'native value in approval',(c,f)=>feeIntent(c,f,calls=>calls[0].value=1n),/UNSUPPORTED_ACCOUNT_BATCH/);
 await feeRejected(0,'approval to unreviewed spender',(c,f)=>feeIntent(c,f,calls=>{calls[0].data=v.encodeFunctionData({abi:v.parseAbi(['function approve(address,uint256)']),functionName:'approve',args:[adapter.ROUTER,1n]});}),/UNSUPPORTED_APPROVAL/);
 await feeRejected(0,'approval to wrong token',(c,f)=>feeIntent(c,f,calls=>calls[0].target=USDC),/UNSUPPORTED_APPROVAL/);
 await feeRejected(0,'approval insufficient',(c,f)=>feeIntent(c,f,calls=>{calls[0].data=v.encodeFunctionData({abi:v.parseAbi(['function approve(address,uint256)']),functionName:'approve',args:[adapter.PERMIT2,1n]});}),/UNSUPPORTED_APPROVAL/);
 const permitParams=v.parseAbiParameters('((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline) permit,bytes signature');
 for(const [label,change,code]of [['expired permit',p=>p[0].sigDeadline=0n,/PERMIT_MISMATCH/],['wrong permit spender',p=>p[0].spender=adapter.PERMIT2,/PERMIT_MISMATCH/],['tampered permit token',p=>p[0].details.token=USDC,/PERMIT_SIGNATURE_MISMATCH/],['tampered permit amount',p=>p[0].details.amount=1n,/PERMIT_SIGNATURE_MISMATCH/],['tampered permit signature',p=>p[1]='0x'+'11'.repeat(64)+'1b',/PERMIT_SIGNATURE_MISMATCH|signature|point/i]])await feeRejected(0,label,(c,f)=>feeIntent(c,f,(_,r)=>{const p=v.decodeAbiParameters(permitParams,r[1][0]);change(p);r[1][0]=v.encodeAbiParameters(permitParams,p);}),code);
 const permitEvent=v.toEventSelector('Permit(address,address,address,uint160,uint48,uint48)');
 await feeRejected(0,'missing Permit event',c=>c.receipt.logs=c.receipt.logs.filter(l=>l.topics[0]!==permitEvent),/PERMIT_EVENT_MISMATCH/);
 await feeRejected(0,'wrong Permit nonce',c=>{const l=c.receipt.logs.find(l=>l.topics[0]===permitEvent),ts=v.parseAbiParameters('uint160,uint48,uint48'),d=v.decodeAbiParameters(ts,l.data);d[2]++;l.data=v.encodeAbiParameters(ts,d);},/PERMIT_EVENT_MISMATCH/);
 for(const index of [0,1]){
  await feeRejected(index,'unpaid fee',c=>{const transfer=c.receipt.logs.find(l=>l.topics[0]===TRANSFER&&l.topics[1].slice(-40).toLowerCase()===adapter.ROUTER.slice(2));transfer.data=v.toHex(BigInt(transfer.data)+1n,{size:32});},/UNEXPLAINED_TRANSFER/);
  await feeRejected(index,'wrong sweep recipient',(c,f)=>feeIntent(c,f,(_,r)=>{const n=r[1].length-1,ts=v.parseAbiParameters('address,address,uint256'),p=v.decodeAbiParameters(ts,r[1][n]);p[1]=adapter.PERMIT2;r[1][n]=v.encodeAbiParameters(ts,p);}),/SWEEP_MISMATCH/);
  await feeRejected(index,'excessive fee',(c,f)=>feeIntent(c,f,(_,r)=>{const n=r[1].length-2,ts=v.parseAbiParameters('address,address,uint256'),p=v.decodeAbiParameters(ts,r[1][n]);p[2]=10000n;r[1][n]=v.encodeAbiParameters(ts,p);}),/INVALID_FEE/);
  await feeRejected(index,'duplicate pool',c=>{const l=clone(c.receipt.logs.find(l=>l.topics[0]===v.toEventSelector('Swap(address,address,int256,int256,uint160,uint128,int24)')));l.logIndex='0xffff';c.receipt.logs.push(l);},/AMBIGUOUS_POOL/);
 }
}


// Exercise the allowance route independently of the already tested signature
// oracle, as feeIntent does above. Both real signed initializer variants are
// additionally verified against historical RPC facts in private launch proofs.
function allowanceContext(){
 const f=clone(fixtures[0]),c=context(f),op=v.decodeFunctionData({abi:entryAbi,data:f.transaction.input}).args[0][0];
 const [target,value,data]=v.decodeFunctionData({abi:v.parseAbi(['function execute(address target,uint256 value,bytes data)']),data:op.callData}).args;
 const router=v.decodeFunctionData({abi:v.parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']),data}).args;
 const total=router[1].reduce((sum,input)=>sum+v.decodeAbiParameters(v.parseAbiParameters('address,uint256,uint256,bytes,bool'),input)[1],0n),token=USDC,expiration=BigInt(Math.floor(Date.parse(c.swaps[0].executedAt)/1000)+3600);
 const calls=[{target:token,value:0n,data:v.encodeFunctionData({abi:v.parseAbi(['function approve(address spender,uint256 amount)']),functionName:'approve',args:[adapter.PERMIT2,total]})},{target:adapter.PERMIT2,value:0n,data:v.encodeFunctionData({abi:v.parseAbi(['function approve(address token,address spender,uint160 amount,uint48 expiration)']),functionName:'approve',args:[token,adapter.ROUTER,total,expiration]})},{target,value,data}];
 alterOp(c,op=>op.callData=v.encodeFunctionData({abi:v.parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),functionName:'executeBatch',args:[calls]}));
 const envelope=clone(c.receipt.logs[0]),wallet=c.swaps[0].wallet;
 c.receipt.logs.push({...envelope,address:token,logIndex:'0xff01',topics:[v.toEventSelector('Approval(address,address,uint256)'),v.pad(wallet),v.pad(adapter.PERMIT2)],data:v.encodeAbiParameters(v.parseAbiParameters('uint256'),[total])});
 c.receipt.logs.push({...envelope,address:adapter.PERMIT2,logIndex:'0xff02',topics:[v.toEventSelector('Approval(address,address,address,uint160,uint48)'),v.pad(wallet),v.pad(token),v.pad(adapter.ROUTER)],data:v.encodeAbiParameters(v.parseAbiParameters('uint160,uint48'),[total,expiration])});
 c.userOperationHash=async()=>f.expected.userOperationHash;return {f,c,total,expiration};
}
function alterAllowance(c,change){const op=v.decodeFunctionData({abi:entryAbi,data:c.transaction.input}).args[0][0],abi=v.parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),calls=v.decodeFunctionData({abi,data:op.callData}).args[0];change(calls);alterOp(c,op=>op.callData=v.encodeFunctionData({abi,functionName:'executeBatch',args:[calls]}));}
async function allowanceTests(){
 for(const initCode of ['0x',adapter.EIP7702_INIT_CODE]){const {f,c}=allowanceContext();alterOp(c,op=>op.initCode=initCode);const proof=await adapter.verifySmartWalletSettlement(c);assert.equal(proof.amounts.route,'SMART_ALLOWANCE_EXACT_INPUT_1');assert.equal(proof.amounts.walletQuoteUnits,f.expected.quoteUnits);assert.equal(proof.swap.domainUnits,f.expected.domainUnits);assert.equal(proof.volumeMicros.toString(),f.expected.volumeMicros);}
 const approveAbi=v.parseAbi(['function approve(address token,address spender,uint160 amount,uint48 expiration)']);
 const modify=(c,change)=>alterAllowance(c,calls=>{const args=v.decodeFunctionData({abi:approveAbi,data:calls[1].data}).args;change(args);calls[1].data=v.encodeFunctionData({abi:approveAbi,functionName:'approve',args});});
 const cases=[
  ['wrong token',({c})=>modify(c,args=>args[0]=WETH),/UNSUPPORTED_ALLOWANCE/],
  ['wrong spender',({c})=>modify(c,args=>args[1]=adapter.ENTRY),/UNSUPPORTED_ALLOWANCE/],
  ['expired allowance',({c})=>modify(c,args=>args[3]=0n),/UNSUPPORTED_ALLOWANCE/],
  ['extra call',({c})=>alterAllowance(c,calls=>calls.push(clone(calls[0]))),/UNSUPPORTED_ACCOUNT_BATCH/],
  ['native approval value',({c})=>alterAllowance(c,calls=>calls[1].value=1n),/UNSUPPORTED_ACCOUNT_BATCH/],
  ['missing allowance event',({c})=>c.receipt.logs=c.receipt.logs.filter(l=>l.logIndex!=='0xff02'),/ALLOWANCE_EVENT_MISMATCH/],
  ['wrong allowance event owner',({c})=>c.receipt.logs.find(l=>l.logIndex==='0xff02').topics[1]=v.pad(adapter.ENTRY),/ALLOWANCE_EVENT_MISMATCH/],
  ['missing ERC20 approval',({c})=>c.receipt.logs=c.receipt.logs.filter(l=>l.logIndex!=='0xff01'),/APPROVAL_EVENT_MISMATCH/],
  ['wrong approved amount',({c})=>c.receipt.logs.find(l=>l.logIndex==='0xff01').data=v.toHex(1n,{size:32}),/APPROVAL_EVENT_MISMATCH/],
  ['unknown Permit2',({c})=>{const original=c.codeAt;c.codeAt=async a=>a===adapter.PERMIT2?'0x':original(a);},/UNREVIEWED_PERMIT2/],
  ['wrong UserOp hash',({c})=>c.userOperationHash=async()=> '0x'+'0'.repeat(64),/OPERATION_EVENT_MISMATCH/],
  ['wrong signature',({c})=>alterOp(c,op=>op.signature=v.decodeFunctionData({abi:entryAbi,data:fixtures[1].transaction.input}).args[0][0].signature),/OPERATION_SIGNATURE_MISMATCH/],
 ];
 for(const [label,change,code]of cases){const f=allowanceContext();change(f);await assert.rejects(()=>adapter.verifySmartWalletSettlement(f.c),code,label);}
 for(const amount of [1n,allowanceContext().total-1n]){const {c,expiration}=allowanceContext();modify(c,args=>args[2]=amount);c.receipt.logs.find(l=>l.logIndex==='0xff02').data=v.encodeAbiParameters(v.parseAbiParameters('uint160,uint48'),[amount,expiration]);await assert.rejects(()=>adapter.verifySmartWalletSettlement(c),/UNSUPPORTED_ALLOWANCE/,'the full split route must fit the granted allowance');}
}


// Generated identities and freshly signed operations; no participant receipts.
async function twoHopFeeFixture(side='buy',changeRoute=null,withPermit=true){
 const signer=require('viem/accounts').privateKeyToAccount('0x'+'1'.repeat(64));
 const wallet=signer.address.toLowerCase(),domain='0x'+'11'.repeat(20),feeTo='0x'+'bb'.repeat(20),outside='0x'+'dd'.repeat(20);
 const buy=side==='buy',tokens=buy?[USDC,WETH,domain]:[domain,WETH,USDC],fees=buy?[100,500]:[500,100],pools=['0x'+'aa'.repeat(19)+'01','0x'+'aa'.repeat(19)+'02'];
 const amountIn=buy?2000000n:13039919n,intermediate=buy?802290685459543n:800687868121909n,gross=buy?13052971n:1995705n,fee=gross/1000n,net=gross-fee;
 const executedAt=buy?'2026-10-10T00:00:20.000Z':'2026-10-10T00:00:40.000Z',tx='0x'+(buy?'3':'4').repeat(64),blockHash='0x'+(buy?'5':'6').repeat(64),blockNumber=buy?'0x10':'0x20';
 const permit={details:{token:tokens[0],amount:amountIn,expiration:2000000000,nonce:1},spender:adapter.ROUTER,sigDeadline:2000000000n};
 const permitTypes={PermitDetails:[{name:'token',type:'address'},{name:'amount',type:'uint160'},{name:'expiration',type:'uint48'},{name:'nonce',type:'uint48'}],PermitSingle:[{name:'details',type:'PermitDetails'},{name:'spender',type:'address'},{name:'sigDeadline',type:'uint256'}]};
 const signature=await signer.signTypedData({domain:{name:'Permit2',chainId:97477,verifyingContract:adapter.PERMIT2},types:permitTypes,primaryType:'PermitSingle',message:permit});
 const path='0x'+tokens[0].slice(2)+fees.map((fee,i)=>fee.toString(16).padStart(6,'0')+tokens[i+1].slice(2)).join('');
 const inputs=[...(withPermit?[v.encodeAbiParameters(v.parseAbiParameters('((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline),bytes'),[permit,signature])]:[]),v.encodeAbiParameters(v.parseAbiParameters('address,uint256,uint256,bytes,bool'),['0x'+'0'.repeat(39)+'2',amountIn,0n,path,true]),v.encodeAbiParameters(v.parseAbiParameters('address,address,uint256'),[tokens[2],feeTo,10n]),v.encodeAbiParameters(v.parseAbiParameters('address,address,uint256'),[tokens[2],wallet,net])];
 const route=[withPermit?'0x0a000604':'0x000604',inputs];if(changeRoute)changeRoute(route,{tokens,fees,wallet,domain,withPermit});
 const routerData=v.encodeFunctionData({abi:v.parseAbi(['function execute(bytes commands,bytes[] inputs) payable']),functionName:'execute',args:route});
 const op={sender:wallet,nonce:1n,initCode:'0x',callData:v.encodeFunctionData({abi:v.parseAbi(['function execute(address target,uint256 value,bytes data)']),functionName:'execute',args:[adapter.ROUTER,0n,routerData]}),accountGasLimits:'0x'+'0'.repeat(64),preVerificationGas:1n,gasFees:'0x'+'0'.repeat(64),paymasterAndData:'0x',signature:'0x'};
 // The RPC is an exact operation-bound mock. Production still calls the pinned
 // EntryPoint's historical getUserOpHash; actual on-chain cases are read-tested.
 const operationHash=actual=>v.keccak256(v.encodeAbiParameters(v.parseAbiParameters(OP),[{...actual,signature:'0x'}]));
 const userOpHash=operationHash(op);op.signature=await signer.sign({hash:userOpHash});
 const transaction={hash:tx,chainId:v.toHex(97477),value:'0x0',to:adapter.ENTRY,blockHash,blockNumber,input:v.encodeFunctionData({abi:entryAbi,functionName:'handleOps',args:[[op],outside]})};
 const logs=[],refs={};
 const log=(name,address,topics,data)=>{const row={address,topics,data,removed:false,transactionHash:tx,blockHash,blockNumber,transactionIndex:'0x0',logIndex:v.toHex(logs.length)};logs.push(row);refs[name]=row;return row;};
 const transfer=(name,token,from,to,units)=>log(name,token,[TRANSFER,v.pad(from),v.pad(to)],v.toHex(units,{size:32}));
 const swapEvent=v.parseAbi(['event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)']);
 function swap(name,i,input,output){const input0=BigInt(tokens[i])<BigInt(tokens[i+1]);log(name,pools[i],v.encodeEventTopics({abi:swapEvent,eventName:'Swap',args:{sender:adapter.ROUTER,recipient:adapter.ROUTER}}),v.encodeAbiParameters(v.parseAbiParameters('int256,int256,uint160,uint128,int24'),[input0?input:-output,input0?-output:input,1n,1n,0]));}
 if(withPermit)log('permit',adapter.PERMIT2,v.encodeEventTopics({abi:v.parseAbi(['event Permit(address indexed owner,address indexed token,address indexed spender,uint160 amount,uint48 expiration,uint48 nonce)']),eventName:'Permit',args:{owner:wallet,token:tokens[0],spender:adapter.ROUTER}}),v.encodeAbiParameters(v.parseAbiParameters('uint160,uint48,uint48'),[amountIn,2000000000,1]));
 transfer('input',tokens[0],wallet,pools[0],amountIn);swap('hop0',0,amountIn,intermediate);transfer('middleOut',WETH,pools[0],adapter.ROUTER,intermediate);transfer('middleIn',WETH,adapter.ROUTER,pools[1],intermediate);swap('hop1',1,intermediate,gross);transfer('gross',tokens[2],pools[1],adapter.ROUTER,gross);transfer('fee',tokens[2],adapter.ROUTER,feeTo,fee);transfer('sweep',tokens[2],adapter.ROUTER,wallet,net);
 log('operation',adapter.ENTRY,v.encodeEventTopics({abi:eventAbi,eventName:'UserOperationEvent',args:{userOpHash,sender:wallet,paymaster:'0x'+'0'.repeat(40)}}),v.encodeAbiParameters(v.parseAbiParameters('uint256,bool,uint256,uint256'),[1n,true,1n,1n]));
 const row={txHash:tx,date:executedAt,userAddress:wallet,buyerAddress:wallet,contractType:'UNISWAP_V3_POOL',fractionalToken:{address:domain,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:'WETH',decimals:18},fractionalTokenAmount:(buy?gross:-amountIn).toString(),quoteTokenAmount:(buy?-intermediate:intermediate).toString(),priceUsd:buy?0.15319853234945516:0.1530455058808264};
 const receipt={status:'0x1',transactionHash:tx,to:adapter.ENTRY,blockHash,blockNumber,transactionIndex:'0x0',logs};
 const poolKeys=new Map(fees.map((fee,i)=>[[...tokens.slice(i,i+2)].sort().join(':')+':'+fee,pools[i]]));
 const c={swaps:[normalizePublicSwap(row)],transaction,receipt,codeAt:async a=>a===wallet?'0xef0100'+adapter.ACCOUNT.slice(2):codes[a]||'0x',poolFor:async(a,b,fee)=>poolKeys.get([a,b].sort().join(':')+':'+fee)||'0x'+'0'.repeat(40),userOperationHash:async actual=>operationHash(actual)};
 return {c,row,refs,wallet,domain,side,fee,net,amountIn,intermediate,gross,executedAt,tx,outside,swapEvent};
}
async function twoHopFeeTests(){
 const buy=await twoHopFeeFixture('buy'),sell=await twoHopFeeFixture('sell');
 for(const f of [buy,sell,await twoHopFeeFixture('buy',null,false),await twoHopFeeFixture('sell',null,false)]){const proof=await adapter.verifySmartWalletSettlement(f.c);assert.equal(proof.swap.quote,USDC);assert.equal(proof.amounts.paths[0].tokens.length,3);assert.equal(proof.amounts.poolLegs.length,1);assert.equal(proof.swap.domainUnits,'13039919');assert.equal(proof.swap.quoteUnits,f.side==='buy'?'2000000':'1993710');assert.equal(proof.volumeMicros.toString(),f.side==='buy'?'1999696':'1995700');assert.equal(proof.amounts.routerFeeUnits,f.side==='sell'?'1995':'0');assert.equal(proof.amounts.routerDomainFeeUnits,f.side==='buy'?'13052':'0');}
 const mutations=[
  ['intermediate transfer amount',f=>{f.refs.middleIn.data=v.toHex(f.intermediate+1n,{size:32});},/UNEXPLAINED_TRANSFER/],
  ['intermediate hop amount',f=>{const a=v.decodeAbiParameters(v.parseAbiParameters('int256,int256,uint160,uint128,int24'),f.refs.hop1.data);const positive=a[0]>0n?0:1;a[positive]++;f.refs.hop1.data=v.encodeAbiParameters(v.parseAbiParameters('int256,int256,uint160,uint128,int24'),a);},/POOL_AMOUNT_MISMATCH/],
  ['intermediate recipient',f=>{f.refs.hop0.topics[2]=v.pad(f.wallet);},/POOL_AMOUNT_MISMATCH/],
  ['unregistered intermediate pool',f=>{f.c.poolFor=async()=> '0x'+'0'.repeat(40);},/UNREGISTERED_POOL/],
  ['missing pool hop',f=>{f.c.receipt.logs=f.c.receipt.logs.filter(l=>l!==f.refs.hop1);},/AMBIGUOUS_POOL/],
  ['fee token',f=>{f.refs.fee.address=WETH;},/UNEXPLAINED_TRANSFER/],
  ['fee amount',f=>{f.refs.fee.data=v.toHex(f.fee+1n,{size:32});},/UNEXPLAINED_TRANSFER/],
  ['fee recipient',f=>{f.refs.fee.topics[2]=v.pad(f.outside);},/UNEXPLAINED_TRANSFER/],
  ['sweep quantity',f=>{f.refs.sweep.data=v.toHex(f.net+1n,{size:32});},/UNEXPLAINED_TRANSFER/],
  ['missing intermediate transfer',f=>{f.c.receipt.logs=f.c.receipt.logs.filter(l=>l!==f.refs.middleOut);},/UNEXPLAINED_TRANSFER/],
  ['extra transfer',f=>{f.c.receipt.logs.push({...clone(f.refs.input),logIndex:'0xffff'});},/UNEXPLAINED_TRANSFER/],
  ['fake indexed WETH leg',f=>{f.c.swaps[0].quoteUnits=(f.intermediate+1n).toString();},/INDEX_MISMATCH/],
  ['fake indexed domain amount',f=>{f.c.swaps[0].domainUnits='1';},/INDEX_MISMATCH/],
 ];
 for(const side of ['buy','sell'])for(const[label,change,code]of mutations){const f=await twoHopFeeFixture(side);change(f);await assert.rejects(()=>adapter.verifySmartWalletSettlement(f.c),code,side+': '+label);}
 for(const [label,change]of [['unreviewed middle token',(path)=>path.slice(0,48)+'22'.repeat(20)+path.slice(88)],['third hop',path=>path+'000064'+'22'.repeat(20)]]){const f=await twoHopFeeFixture('buy',(r)=>{const a=v.decodeAbiParameters(v.parseAbiParameters('address,uint256,uint256,bytes,bool'),r[1][1]);a[3]=change(a[3]);r[1][1]=v.encodeAbiParameters(v.parseAbiParameters('address,uint256,uint256,bytes,bool'),a);});await assert.rejects(()=>adapter.verifySmartWalletSettlement(f.c),/UNSUPPORTED_PATH/,label);}
 const from=Date.parse('2026-10-10T00:00:15.000Z'),through=Date.parse('2026-10-10T00:00:50.000Z'),all=[buy,sell],byTx=new Map(all.map(f=>[f.tx,f]));
 const source={finalized:async()=>({number:'0xff',timestamp:new Date(through).toISOString()}),indexStatus:async()=>true,swaps:async()=>all.map(f=>f.row),transfers:async()=>all.map(f=>({token:{address_hash:f.domain},transaction_hash:f.tx,timestamp:f.executedAt})),receipt:async tx=>byTx.get(tx).c.receipt,block:async n=>{const f=all.find(f=>f.c.receipt.blockNumber===n);return {hash:f.c.receipt.blockHash,timestamp:f.executedAt};},smartWalletSettlement:async swaps=>adapter.verifySmartWalletSettlement({...byTx.get(swaps[0].tx).c,swaps})};
 const snap={manifest:{campaign:{id:'test',state:'active',starts_at:new Date(from).toISOString(),ends_at:'2026-10-11T00:00:00.000Z'},participants:[{participant:'synthetic',entered_at:new Date(from).toISOString()}],markets:[{domain_token:buy.domain,quote_token:USDC},{domain_token:buy.domain,quote_token:WETH}]},accounts:[{participant:'synthetic',coverage:{complete:true,coverage_from:new Date(from).toISOString(),confirmed_through:new Date(through).toISOString(),updated_at:new Date(through).toISOString()}}],wallets:[{participant:'synthetic',trade_wallet:buy.wallet,agent:true}],references:[],fills:[]};
 const result=await collect(snap,source,{now:through+120000});assert.equal(result.report.complete,true);assert.equal(result.packet.fills.length,2);assert.equal(result.report.counts.volumeUsd,'3.995396');assert.ok(result.packet.fills.every(f=>f.quoteToken===USDC));
 const ledger=await require('./lib/public-accounting.cjs').reconstruct({participant:'synthetic',wallets:[buy.wallet],from,through,markets:snap.manifest.markets,references:[],eligible:result.packet.fills,source:{...source,blockAt:async t=>({number:t<from?'0x1':'0xff'}),nativeBalance:async()=>0n,nativeHistory:async()=>[],nativeTransaction:async()=>({moves:[],fee:0n,payer:buy.outside}),hasCode:async()=>false,balance:async(w,t,at)=>t===USDC?(at==='0x1'?10000000n:9993710n):0n,valueUsd:async(t,n)=>{assert.equal(t,USDC);return n;}}});
 assert.equal(ledger.complete,true);assert.equal(ledger.events.length,4);assert.equal(ledger.events.find(e=>e.kind==='buy'&&e.token===buy.domain).usd,'2.000000');assert.equal(ledger.events.find(e=>e.kind==='sell').usd,'1.993710');assert.ok([...ledger.events,...ledger.openingLots].every(e=>e.token!==WETH),'routing WETH creates no wallet inventory or capital');assert.equal(ledger.events.find(e=>e.kind==='sell').units,'13039919');assert.ok(ledger.events.every(e=>!['in','deposit','withdrawal'].includes(e.kind)));
 console.log('PASS synthetic two-hop smart-wallet fees: signed permit/direct buy/sell, exact per-hop conservation, output fees/sweep, 28 hostile mutations, canonical USDC fills, pool-only volume and fee-inclusive closed-roundtrip FIFO without intermediate WETH capital.');
}

async function main(){
 await twoHopFeeTests();
 await feeTests();
 await allowanceTests();
 for(const f of fixtures){const result=await adapter.verifySmartWalletSettlement(context(f));assert.equal(result.swap.domainUnits,f.expected.domainUnits);assert.equal(result.amounts.walletQuoteUnits,f.expected.quoteUnits);assert.equal(result.volumeMicros.toString(),f.expected.volumeMicros);assert.equal(result.swap.quote,USDC);assert.equal(result.amounts.paths.length,f.rows.length);}
 await rejected('unknown runtime',c=>{c.codeAt=async()=>codes[adapter.ACCOUNT]},/UNREVIEWED_RUNTIME/);
 await rejected('unknown account delegation',c=>{const previous=c.codeAt;c.codeAt=async a=>a===c.swaps[0].wallet?'0xef0100'+'0'.repeat(40):previous(a)},/UNREVIEWED_ACCOUNT/);
 await rejected('failed receipt',c=>c.receipt.status='0x0',/TRANSACTION_MISMATCH/);
 await rejected('wrong receipt identity',c=>c.receipt.transactionHash='0x'+'1'.repeat(64),/TRANSACTION_MISMATCH/);
 await rejected('removed log',c=>c.receipt.logs[1].removed=true,/LOG_IDENTITY_INVALID/);
 await rejected('duplicate log identity',c=>c.receipt.logs.push(clone(c.receipt.logs[1])),/LOG_IDENTITY_INVALID/);
 await rejected('multiple operations',c=>alterOp(c,(_,args)=>args[0].push(clone(args[0][0]))),/MULTIPLE_OPERATIONS/);
 for(const initCode of ['0x7703'+'00'.repeat(18),adapter.EIP7702_INIT_CODE+'00','0x7702','0x'+'11'.repeat(20)])await rejected('noncanonical initialization rejected',c=>alterOp(c,op=>op.initCode=initCode),/OPERATION_MISMATCH/);
 await rejected('marker cannot authorize wrong delegate',c=>{alterOp(c,op=>op.initCode=adapter.EIP7702_INIT_CODE);const previous=c.codeAt;c.codeAt=async a=>a===c.swaps[0].wallet?'0xef0100'+'1'.repeat(40):previous(a);},/UNREVIEWED_ACCOUNT/);
 await rejected('forged operation signature',(c,f)=>{alterOp(c,op=>op.signature=v.decodeFunctionData({abi:entryAbi,data:fixtures[1].transaction.input}).args[0][0].signature);c.userOperationHash=async()=>f.expected.userOperationHash;},/OPERATION_SIGNATURE_MISMATCH/);
 await rejected('wrong operation hash',c=>c.userOperationHash=async()=> '0x'+'0'.repeat(64),/OPERATION_EVENT_MISMATCH/);
 await rejected('wrong operation nonce',c=>alterOp(c,op=>op.nonce++),/OPERATION_EVENT_MISMATCH/);
 await rejected('failed user operation',c=>{const l=c.receipt.logs.find(l=>l.topics[0]===v.toEventSelector(eventAbi[0]));const e=v.decodeEventLog({abi:eventAbi,data:l.data,topics:l.topics}).args;l.data=v.encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[e.nonce,false,e.actualGasCost,e.actualGasUsed]);},/OPERATION_EVENT_MISMATCH/);
 await rejected('unsupported commands',c=>alterOp(c,op=>{const abi=v.parseAbi(['function execute(address target,uint256 value,bytes data)']),a=v.decodeFunctionData({abi,data:op.callData}).args,router=v.parseAbi(['function execute(bytes commands,bytes[] inputs,uint256 deadline) payable']),r=v.decodeFunctionData({abi:router,data:a[2]}).args;r[0]='0x0004';a[2]=v.encodeFunctionData({abi:router,functionName:'execute',args:r});op.callData=v.encodeFunctionData({abi,functionName:'execute',args:a});}),/UNSUPPORTED_COMMANDS/);
 await rejected('unpaid or extra fee transfer',c=>{const t=clone(c.receipt.logs.find(l=>l.topics[0]===TRANSFER));t.logIndex='0xffff';t.data=v.toHex(1n,{size:32});c.receipt.logs.push(t)},/UNEXPLAINED_TRANSFER/);
 await rejected('unregistered pool',c=>c.poolFor=async()=> '0x'+'0'.repeat(40),/UNREGISTERED_POOL/);
 await rejected('fake indexed amount',c=>c.swaps[0].quoteUnits='1',/INDEX_MISMATCH/);
 await rejected('missing split leg',c=>c.swaps.pop(),/INDEX_MISMATCH/);
 await rejected('duplicate indexed leg',c=>c.swaps.push(clone(c.swaps[0])),/DUPLICATE_INDEX_ROW/);
 const now=Date.parse('2026-10-06T23:02:00Z'),snap=snapshot();
 let result=await collect(snap,mockSource(fixtures),{now});assert.equal(result.report.complete,true);assert.equal(result.packet.fills.length,3);assert.equal(result.report.counts.volumeUsd,'33.988254');assert.equal(new Set(result.packet.fills.map(f=>f.economicId)).size,3);
 // Identical replay changes neither identity nor revision or accounting cost.
 const prior=clone(result.packet.fills);result=await collect({...snap,fills:prior},mockSource(fixtures),{now});assert.deepEqual(result.packet.fills,prior);
 const bad=clone(fixtures);bad[0].receipt.logs[1].removed=true;result=await collect(snap,mockSource(bad),{now});assert.equal(result.report.complete,false);assert.equal(result.packet.fills.length,2);
 const leg=normalizePublicSwap(fixtures[0].rows[0]),ref={id:'strategy-test',revision:1,status:'verified',wallet:leg.wallet,transactionHash:leg.tx,domainToken:leg.domain,quoteToken:leg.quote,side:leg.side,domainUnits:leg.domainUnits,quoteUnits:leg.quoteUnits,executedAt:leg.executedAt};
 result=await collect({...snap,references:[{participant:'test',ref}]},mockSource(fixtures),{now});assert.equal(result.report.complete,false);assert.ok(result.report.problems.some(p=>p.code==='SMART_ROUTER_STRATEGY_ATTRIBUTION_REVIEW_REQUIRED'));
 const canonical=await adapter.verifySmartWalletSettlement(context(fixtures[0]));Object.assign(ref,{domainUnits:canonical.swap.domainUnits,quoteUnits:canonical.swap.quoteUnits,quoteToken:canonical.swap.quote});
 result=await collect({...snap,references:[{participant:'test',ref}]},mockSource(fixtures),{now});assert.equal(result.report.complete,true);assert.equal(result.packet.fills.find(f=>f.transactionHash===leg.tx).source,'strategy');
 // FIFO consumes the canonical wallet cost, while the verified domain legs
 // remain the volume source. A private aggregate reference is not a third swap.
 const f=fixtures[0],s=canonical.swap,funding='0x'+'a'.repeat(64),fundingHash='0x'+'b'.repeat(64),outside='0x'+'c'.repeat(40),opened=Date.parse('2026-10-06T22:14:50Z'),cutoff=Date.parse('2026-10-06T23:00:00Z');
 const fundReceipt={status:'0x1',transactionHash:funding,blockHash:fundingHash,blockNumber:'0x1',transactionIndex:'0x0',logs:[{address:USDC,topics:[TRANSFER,v.pad(outside),v.pad(s.wallet)],data:v.toHex(100000000n,{size:32})}]};
 const accountingSource={...mockSource([f]),
  blockAt:async time=>({number:time<opened?'0x2':'0xffffff'}),
  block:async n=>n==='0x1'?{hash:fundingHash,timestamp:'2026-10-06T22:00:00Z'}:{hash:f.receipt.blockHash,timestamp:s.executedAt},
  receipt:async tx=>tx===funding?fundReceipt:f.receipt,
  transfers:async()=>[{token:{address_hash:USDC},transaction_hash:funding,timestamp:'2026-10-06T22:00:00Z'},{token:{address_hash:s.domain},transaction_hash:s.tx,timestamp:s.executedAt}],
  nativeHistory:async()=>[],nativeTransaction:async()=>({moves:[],fee:0n,payer:outside}),nativeBalance:async()=>0n,hasCode:async()=>false,
  balance:async(wallet,token,at)=>token===USDC?(at==='0x2'?100000000n:85500000n):token===s.domain&&at!=='0x2'?47018799n:0n,
  valueUsd:async(token,units)=>{assert.equal(token,USDC);return units;},
 };
 const ledger=await require('./lib/public-accounting.cjs').reconstruct({participant:'test',wallets:[s.wallet],from:opened,through:cutoff,markets:snap.manifest.markets,references:[{ref}],eligible:result.packet.fills.filter(fill=>fill.transactionHash===s.tx),source:accountingSource});
 assert.equal(ledger.complete,true);assert.equal(ledger.openingLots.length,1);assert.equal(ledger.events.length,2);assert.equal(ledger.events[0].usd,'14.500000');assert.equal(ledger.events[0].units,'47018799');assert.equal(ledger.events[0].notionalUsd,'14.501921');assert.equal(ledger.events[1].units,'14500000');
 console.log('PASS smart-wallet settlement: five real sponsored receipts, exact approval/Permit2 signature and fee/sweep paths, historical contract pins, UserOp hash/signature, exact split-path conservation, pool-only volume, canonical economic fills, stable retries, Strategy attribution and fail-closed adversarial cases.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={fixtures,context,mockSource,snapshot};
