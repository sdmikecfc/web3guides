'use strict';
const assert=require('node:assert/strict');
const {NATIVE,nativeSettlement}=require('./lib/public-native-accounting.cjs');
const {reconstruct}=require('./lib/public-accounting.cjs');
const {publicSource}=require('./lib/public-trade-source.cjs');
const {USDC,WETH,TRANSFER}=require('./lib/public-trade-worker.cjs');
const {toEventSelector}=require('viem');
const a=n=>'0x'+String(n).padStart(40,'0'),wallet=a(1),agent=a(2),token=a(3),pool=a(4),external=a(5);
const topic=s=>'0x'+s.slice(2).padStart(64,'0'),hex=n=>'0x'+BigInt(n).toString(16);
const log=(asset,from,to,units)=>({address:asset,topics:[TRANSFER,topic(from),topic(to)],data:topic(hex(units))});
const at=n=>new Date(Date.UTC(2026,9,1,0,0,n)).toISOString();
function nativeLedgerFixture(){
 const rows=[
  {n:10,moves:[{from:external,to:wallet,units:100000n}],fee:0n,payer:external,logs:[]},
  {n:11,moves:[],fee:0n,payer:external,logs:[log(USDC,external,wallet,100000000)]},
  {n:20,moves:[],fee:3n,payer:wallet,logs:[log(USDC,wallet,pool,10000000),log(token,pool,wallet,10000000)],side:'buy'},
  {n:25,moves:[{from:wallet,to:agent,units:1000n}],fee:2n,payer:wallet,logs:[]},
  {n:40,moves:[],fee:5n,payer:wallet,logs:[log(token,wallet,pool,10000000),log(USDC,pool,wallet,12000000)],side:'sell'},
 ].map(t=>({...t,tx:topic(hex(t.n)),block:hex(t.n),blockHash:topic(hex(t.n+100))}));
 const source={
  blockAt:async t=>({number:t<Date.parse(at(30))?hex(29):hex(50)}),
  block:async b=>{const t=rows.find(t=>t.block===b);return {hash:t.blockHash,timestamp:at(t.n)};},
  nativeHistory:async()=>rows.map(t=>({tx:t.tx,at:Date.parse(at(t.n))})),
  nativeTransaction:async tx=>rows.find(t=>t.tx===tx),
  transfers:async()=>rows.flatMap(t=>t.logs.map(l=>({token:{address_hash:l.address},transaction_hash:t.tx,timestamp:at(t.n)}))),
  swaps:async w=>w!==wallet?[]:rows.filter(t=>t.side).map(t=>({txHash:t.tx,date:at(t.n),userAddress:wallet,contractType:'UNISWAP_V3_POOL',fractionalToken:{address:token,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:'USDC.e',decimals:6},fractionalTokenAmount:t.side==='buy'?'10000000':'-10000000',quoteTokenAmount:t.side==='buy'?'-10000000':'12000000',priceUsd:1})),
  receipt:async tx=>{const t=rows.find(t=>t.tx===tx);return {status:t.status||'0x1',transactionHash:tx,blockHash:t.blockHash,blockNumber:t.block,transactionIndex:'0x0',logs:t.logs};},
  nativeBalance:async(w,b)=>w===agent?1000n:b===hex(29)?98995n:98990n,
  balance:async(w,t,b)=>w===agent?0n:t===WETH?0n:b===hex(29)?t===USDC?90000000n:10000000n:t===USDC?102000000n:0n,
  hasCode:async()=>false,valueUsd:async(t,n)=>n,
 };
 const options={participant:'123',wallets:[wallet,agent],from:Date.parse(at(30)),through:Date.parse(at(50)),markets:[{domain_token:token,quote_token:USDC},{domain_token:token,quote_token:WETH}],eligible:[{economicId:'sale',wallet,transactionHash:rows[4].tx,domainToken:token,quoteToken:USDC,volumeUsd:'12.000000'}],source};
 return {rows,source,options};
}
async function main(){
 const tx={hash:topic('0x1'),blockHash:topic('0x2'),from:wallet,to:agent,type:'0x2',value:hex(100)};
 const rc={transactionHash:tx.hash,blockHash:tx.blockHash,blockNumber:'0x10',status:'0x1',gasUsed:hex(10),effectiveGasPrice:hex(2),l1Fee:hex(3)};
 const trace=(index,type,from,to,value)=>({transaction_hash:tx.hash,block_number:16,index,type,from:{hash:from},to:{hash:to},value:String(value),success:true,error:null});
 let n=nativeSettlement(tx,rc,[trace(0,'call',wallet,agent,100),trace(1,'delegatecall',agent,pool,100),trace(2,'call',agent,wallet,7)]);
 assert.equal(n.fee,23n);assert.equal(n.moves.length,2,'root and delegated msg.value are never counted twice');
 n=nativeSettlement(tx,{...rc,status:'0x0'},[trace(2,'call',agent,wallet,7)]);assert.equal(n.moves.length,0);assert.equal(n.fee,23n,'a reverted transaction still pays gas');
 assert.throws(()=>nativeSettlement(tx,{...rc,l1Fee:undefined},[]),/AMOUNT_UNAVAILABLE/);
 assert.throws(()=>nativeSettlement(tx,rc,[trace(2,'call',agent,wallet,7),trace(2,'call',agent,wallet,7)]),/TRACE_MISMATCH/);
 assert.throws(()=>nativeSettlement({...tx,type:'0x7e'},rc,[]),/DEPOSIT_FLOW_REVIEW_REQUIRED/);
 assert.equal(nativeSettlement(tx,{...rc,operatorFeeScalar:'0x0',operatorFeeConstant:'0x0'},[]).fee,23n);
 assert.equal(nativeSettlement(tx,{...rc,daFootprintGasScalar:'0x190',blobGasUsed:'0x20850'},[]).fee,23n,'OP DA footprint is already covered by l1Fee');
 assert.equal(nativeSettlement(tx,{...rc,daFootprintGasScalar:'0x190',operatorFeeScalar:'0x2',operatorFeeConstant:'0x3'},[]).fee,2026n);
 assert.throws(()=>nativeSettlement(tx,{...rc,blobGasUsed:'0x100',blobGasPrice:'0x2'},[]),/FEE_TYPE_UNSUPPORTED/);
 assert.throws(()=>nativeSettlement(tx,{...rc,blockHash:topic('0x3')},[]),/RECEIPT_MISMATCH/);
 let f=nativeLedgerFixture(),r=await reconstruct(f.options);
 assert.equal(r.openingLots.find(l=>l.token===token).costUsd,'10.000003');
 assert.equal(r.openingLots.filter(l=>l.token===NATIVE).reduce((v,l)=>v+BigInt(l.units),0n),99995n);
 assert.equal(r.events.find(e=>e.economicId==='sale').usd,'11.999995');
 assert.equal(r.events.find(e=>e.economicId==='sale').notionalUsd,'12.000000','gas changes profit, not scored volume');
 assert.equal(r.events.filter(e=>e.token===NATIVE).length,1,'gas consumed once');
 // External fee sponsorship is not charged to the trader.
 f=nativeLedgerFixture();f.rows[4].payer=external;f.source.nativeBalance=async(w,b)=>w===agent?1000n:98995n;
 r=await reconstruct(f.options);assert.equal(r.events.find(e=>e.economicId==='sale').usd,'12.000000');
 // Missing a native deposit cannot turn native holdings into zero capital.
 f=nativeLedgerFixture();f.rows[0].moves=[];await assert.rejects(()=>reconstruct(f.options),/HISTORICAL_COST_BASIS_MISSING/);
 f=nativeLedgerFixture();f.source.nativeBalance=async()=>1n;await assert.rejects(()=>reconstruct(f.options),/NATIVE_OPENING_BALANCE_MISMATCH/);
 f=nativeLedgerFixture();
 // Isolate a native sponsor deposit from the unrelated USDC deposit fixture.
 f.rows[0].moves[0].from=a(8);f.source.hasCode=async address=>address===a(8);r=await reconstruct(f.options);assert.equal(r.openingLots.filter(l=>l.token===NATIVE).reduce((v,l)=>v+BigInt(l.units),0n),99995n);
 f.rows[0].logs=[log(token,wallet,a(8),100)];await assert.rejects(()=>reconstruct(f.options),/NATIVE_CONTRACT_FLOW_REVIEW_REQUIRED/);
 f=nativeLedgerFixture();f.rows.push({n:41,tx:topic(hex(41)),block:hex(41),blockHash:topic(hex(141)),fee:7n,payer:wallet,moves:[],status:'0x0',logs:[]});
 f.source.nativeBalance=async(w,b)=>w===agent?1000n:b===hex(29)?98995n:98983n;
 r=await reconstruct(f.options);assert.equal(r.events.filter(e=>e.token===NATIVE&&e.kind==='out').length,2,'failed transaction fee is reconciled as an outflow');assert.equal(r.events.find(e=>e.economicId==='sale').usd,'11.999995');
 // Deposit and withdrawal preserve capital and score neither trading volume
 // nor a second inbound deposit. WETH9 uses these logs, not mint Transfers.
 f=nativeLedgerFixture();
 for(const [number,deposit]of [[35,true],[36,false]])f.rows.push({n:number,tx:topic(hex(number)),block:hex(number),blockHash:topic(hex(number+100)),fee:0n,payer:wallet,moves:[{from:deposit?wallet:WETH,to:deposit?WETH:wallet,units:500n}],logs:[{address:WETH,topics:[toEventSelector(deposit?'Deposit(address,uint256)':'Withdrawal(address,uint256)'),topic(wallet)],data:topic(hex(500))}]});
 r=await reconstruct(f.options);assert.equal(r.events.filter(e=>e.kind==='in').length,0);assert.equal(r.events.filter(e=>e.token===WETH&&e.kind==='buy').length,1);
 f.rows.find(t=>t.n===35).moves[0].units=499n;await assert.rejects(()=>reconstruct(f.options),/WRAP_NATIVE_TRANSFER_MISMATCH/);
 // Actual source adapter: public receipts and fully paginated explorer traces.
 const api=publicSource({apiKey:'fixture',delay:0,fetcher:async(url,options)=>{let body;
  if(url==='https://rpc.doma.xyz'){assert.equal(JSON.parse(options.body).method,'eth_getTransactionByHash');body={result:tx};}
  else{assert.equal(url,'https://explorer.doma.xyz/api/v2/transactions/'+tx.hash+'/internal-transactions');body={items:[trace(2,'call',agent,wallet,7)],next_page_params:null};}
  return {ok:true,status:200,text:async()=>JSON.stringify(body)};
 }});
 n=await api.nativeTransaction(tx.hash,rc);assert.equal(n.fee,23n);assert.equal(n.moves.length,2);
 let pages=0;
 const history=publicSource({apiKey:'fixture',delay:0,fetcher:async url=>{
  const u=new URL(url),internal=u.pathname.endsWith('/internal-transactions');let body;
  if(internal)body={items:[],next_page_params:null};
  else if(u.searchParams.has('block_number'))body={items:[{hash:topic('0x2'),timestamp:at(10),from:{hash:external},to:{hash:wallet},value:'100'}],next_page_params:null};
  else body={items:[{hash:tx.hash,timestamp:at(20),from:{hash:wallet},to:{hash:agent},value:'100'}],next_page_params:{block_number:20,index:0,items_count:1}};
  pages++;return {ok:true,status:200,text:async()=>JSON.stringify(body)};
 }});
 assert.equal((await history.nativeHistory(wallet,Date.parse(at(30)))).length,2);assert.equal(pages,5,'history and immutable pagination anchors are checked');
 console.log('PASS native ETH accounting: exact gas/L1 fees, failed calls, sponsor exclusion, linked transfers, separate native/WETH capital, wrapping, missing history, balance reconciliation and unchanged volume.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={nativeLedgerFixture,NATIVE};
