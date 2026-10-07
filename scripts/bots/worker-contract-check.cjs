'use strict';
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {serializeEvidence,rpcFailure,preflightWorkerPacket}=require('./lib/worker-contract.cjs');
const {fixtures,context}=require('./public-smart-wallet-check.cjs');
const {verifySmartWalletSettlement}=require('./lib/public-smart-wallet-settlement.cjs');
async function main(){
 const lengths=[];
 for(const f of fixtures){const p=await verifySmartWalletSettlement(context(f)),proof={version:2,blockHash:f.receipt.blockHash,blockNumber:f.receipt.blockNumber,source:'public_receipt',strategy:null,strategyRevision:null,...p.amounts},full=JSON.stringify(proof),serialized=serializeEvidence(proof),compact=JSON.parse(serialized);
  lengths.push([full.length,serialized.length]);assert.ok(full.length>1000&&serialized.length<=1000);assert.equal(compact.proofSha256,createHash('sha256').update(full).digest('hex'));
  for(const k of ['blockHash','blockNumber','source','walletDomainUnits','walletQuoteUnits','routerFeeUnits','userOperationHash','routerRuntimeHash','entryPoint','accountImplementation'])assert.deepEqual(compact[k],proof[k]);
  assert.notEqual(JSON.parse(serializeEvidence({...proof,paths:[...proof.paths].reverse(),extra:'mutation'})).proofSha256,compact.proofSha256);
 }
 const legacy={version:2,blockHash:'0x123',walletQuoteUnits:'100'};assert.equal(serializeEvidence(legacy),JSON.stringify(legacy));
 const calls=[],packet={complete:true,financialComplete:false,financials:[],fills:Array.from({length:2001},(_,i)=>({id:i}))};
 const result=await preflightWorkerPacket(packet,async(name,args)=>{assert.equal(name,'mkz_collector_check');calls.push(args.p_payload);return {ok:true,mode:'read_only',writesPerformed:0}});
 assert.deepEqual(calls.map(c=>c.fills.length),[2000,1,0]);assert.deepEqual(calls.map(c=>c.complete),[false,false,true]);assert.ok(calls.every(c=>!c.financialComplete&&c.financials.length===0));assert.equal(result.writesPerformed,0);
 await assert.rejects(()=>preflightWorkerPacket(packet,async()=>({ok:false,mode:'read_only',writesPerformed:0,issues:[{code:'wallet_unmapped',economicId:'private'}]})),/WORKER_PREFLIGHT_WALLET_UNMAPPED/);
 await assert.rejects(()=>preflightWorkerPacket(packet,async()=>({ok:true,mode:'write',writesPerformed:1})),/WORKER_PREFLIGHT_RESPONSE_INVALID/);
 assert.equal(rpcFailure('mkz_worker_commit',{code:'P0001',message:'MKZ_BATCH_INVALID'}).message,'WORKER_COMMIT_MKZ_BATCH_INVALID');
 assert.equal(rpcFailure('mkz_worker_commit',{code:'P0001',message:'secret or wallet info'}).message,'WORKER_COMMIT_SQL_P0001');
 assert.equal(rpcFailure('mkz_worker_commit',{code:'token-secret',message:'token-secret'}).message,'WORKER_COMMIT_UNAVAILABLE');
 const health=require('./lib/worker-health.cjs').healthPayload({workerVersion:'test',phase:'AUDIT_FAILED'},{code:rpcFailure('mkz_worker_commit',{code:'P0001',message:'MKZ_BATCH_INVALID'}).message});assert.equal(health.code,'WORKER_COMMIT_MKZ_BATCH_INVALID');
 console.log('PASS worker contract: exact full-proof commitments '+JSON.stringify(lengths)+', unchanged short evidence, SQL-shaped read-only preflight before FIFO, and safe actionable database diagnostics.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
