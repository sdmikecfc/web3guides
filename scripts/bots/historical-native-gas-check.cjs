'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {reconstruct}=require('./lib/public-accounting.cjs');
const {nativeSettlement}=require('./lib/public-native-accounting.cjs');
const {publicSource}=require('./lib/public-trade-source.cjs');
const {nativeLedgerFixture}=require('./public-native-accounting-check.cjs');
const semantic=ledger=>{const {requestId,...rest}=ledger;return rest;};
function optimized(f,{nonzero=false,mutate=x=>x}={}){
 const original=f.source.nativeTransaction,full=[],gas=[];
 f.source.nativeTransaction=async(tx,rc)=>{full.push(tx);return original(tx,rc);};
 f.source.historicalNativeGas=async(tx,rc)=>{gas.push(tx);if(nonzero)return null;const n=await original(tx,rc);return mutate({transactionHash:tx,blockHash:rc.blockHash,blockNumber:rc.blockNumber,value:'0',fee:n.fee,payer:n.payer});};
 return {full,gas};
}
async function main(){
 for(const sponsor of [false,true]){
  const baseline=nativeLedgerFixture();if(sponsor)baseline.rows.find(t=>t.n===20).payer='0x'+String(9).padStart(40,'0');
  const expected=await reconstruct(baseline.options),f=nativeLedgerFixture();if(sponsor)f.rows.find(t=>t.n===20).payer='0x'+String(9).padStart(40,'0');const reads=optimized(f),actual=await reconstruct(f.options);
  assert.deepEqual(semantic(actual),semantic(expected),'opening FIFO, own/sponsored gas, realized proceeds, capital and scored volume remain identical');
  assert.ok(reads.gas.includes(f.rows.find(t=>t.n===20).tx));assert.ok(!reads.full.includes(f.rows.find(t=>t.n===20).tx),'zero-value historical purchase needs no internal traces');assert.ok(reads.full.includes(f.rows.find(t=>t.n===40).tx),'current sale still uses full native proof');assert.ok(!reads.gas.includes(f.rows.find(t=>t.n===40).tx),'current-period transaction never receives historical gas shortcut');
 }
 let f=nativeLedgerFixture(),reads=optimized(f,{nonzero:true});await reconstruct(f.options);assert.ok(reads.full.includes(f.rows.find(t=>t.n===20).tx),'nonzero historical transaction retains its full native proof');
 f=nativeLedgerFixture();optimized(f);f.source.nativeTransaction=async()=>{throw Error('CURRENT_NATIVE_PROOF_REQUIRED');};await assert.rejects(()=>reconstruct(f.options),/CURRENT_NATIVE_PROOF_REQUIRED/);
 for(const mutate of [g=>({...g,value:'1'}),g=>({...g,transactionHash:'0x'+'f'.repeat(64)}),g=>({...g,blockHash:'0x'+'f'.repeat(64)}),g=>({...g,blockNumber:'0x999'}),g=>({...g,moves:[]}),g=>({...g,fee:-1n})]){f=nativeLedgerFixture();optimized(f,{mutate});await assert.rejects(()=>reconstruct(f.options),/HISTORICAL_NATIVE_GAS_PROOF_INVALID/);}
 // Real sponsored receipts: the optimization must retain every gas/L1/operator
 // fee check and must identify the sponsor, never charge its fee to the player.
 for(const name of ['a80aed76','4e9590d2','3dfb75e1','permit-portion-sweep','portion-sweep']){
  const {transaction:tx,receipt:rc}=JSON.parse(fs.readFileSync(__dirname+'/fixtures/smart-wallet/'+name+'.json','utf8'));let traceReads=0;
  const api=publicSource({apiKey:'fixture',delay:0,fetcher:async(url,options)=>{assert.equal(url,'https://rpc.doma.xyz','gas proof requires no Explorer query');const q=JSON.parse(options.body);let result;if(q.method==='eth_getTransactionByHash')result=tx;else if(q.method==='eth_getBlockByNumber')result={number:rc.blockNumber,hash:rc.blockHash,timestamp:'0x1'};else{traceReads++;throw Error('UNEXPECTED_RPC');}return {ok:true,status:200,text:async()=>JSON.stringify({result})};}});
  const gas=await api.historicalNativeGas(tx.hash,rc),native=nativeSettlement(tx,rc,[]);assert.equal(gas.fee,native.fee);assert.equal(gas.payer,native.payer);assert.equal(gas.transactionHash,tx.hash.toLowerCase());assert.equal(gas.value,'0');assert.ok(!Object.hasOwn(gas,'moves'));assert.equal(traceReads,0);
  await assert.rejects(()=>api.historicalNativeGas(tx.hash,{...rc,l1Fee:undefined}),/AMOUNT_UNAVAILABLE/);
 }
 console.log('PASS historical gas proof: identical FIFO/capital/realized events, sponsor exclusion and real receipt fees; only pre-entry zero-value transactions skip unused traces; current/native-value proofs and malformed-proof rejection remain intact.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
