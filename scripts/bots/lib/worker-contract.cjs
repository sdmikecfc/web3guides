'use strict';
const {createHash,randomUUID}=require('node:crypto');
const PROOF_LIMIT=1000;
function serializeEvidence(proof){
 const full=JSON.stringify(proof);
 if(full.length<=PROOF_LIMIT)return full;
 // Commit to the complete verified proof; never truncate it. Transaction and
 // token identities remain on the enclosing fill. Public receipts/calldata,
 // pinned verifier and operation hash reproduce the route evidence exactly.
 const compact={version:3,proofVersion:proof.version,proofSha256:createHash('sha256').update(full).digest('hex')};
 for(const k of ['blockHash','blockNumber','source','strategy','strategyRevision','walletDomainUnits','walletQuoteUnits','walletQuoteToken','routerFeeUnits','routerDomainFeeUnits','userOperationHash','router','routerRuntimeHash','entryPoint','accountImplementation'])if(proof[k]!=null)compact[k]=proof[k];
 const encoded=JSON.stringify(compact);
 if(encoded.length>PROOF_LIMIT)throw Error('WORKER_EVIDENCE_CONTRACT_EXCEEDED');
 return encoded;
}
const operations={mkz_worker_snapshot:'SNAPSHOT',mkz_worker_commit:'COMMIT',mkz_worker_health:'HEALTH',mkz_collector_check:'PREFLIGHT',mkz_collector_manifest:'MANIFEST',mkz_collector_wallets:'WALLETS'};
const messages=new Set(['MKZ_BATCH_INVALID','MKZ_SETUP_MISSING','MK_WORKER_INVALID','MK_WORKER_REQUEST_CONFLICT','MK_WORKER_SOURCE_CHANGED','MK_WORKER_USE_VERIFIED_ACCOUNTING','MK_WORKER_PAGE_LIMIT','CAMPAIGN_NOT_ACCEPTING','COVERAGE_INVALID','FILLS_INVALID','FILL_EVIDENCE_INVALID','WALLET_NOT_ENROLLED','AGENT_WALLET_UNVERIFIED','FILL_REVISION_CONFLICT','ACCOUNTING_PACKET_INVALID','ACCOUNTING_REVISION_CONFLICT','ACCOUNTING_COVERAGE_REQUIRED','ACCOUNTING_FILL_COVERAGE_INCOMPLETE','FINANCIAL_COVERAGE_INCOMPLETE','FINANCIAL_METHOD_MISMATCH','BATCH_CONFLICT']);
function rpcFailure(name,error){
 const operation=operations[name]||'UNKNOWN';
 const reason=messages.has(error?.message)?error.message:/^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(error?.code||'')?'SQL_'+error.code:'UNAVAILABLE';
 return Error('WORKER_'+operation+'_'+reason);
}
const issues=new Set(['wallet_unmapped','market_unverified','agent_wallet_unverified','participant_not_enrolled','coverage_invalid','financial_method','financial_scores_are_server_calculated','financial_coverage']);
async function preflightWorkerPacket(packet,rpc){
 const fills=packet.fills;
 if(!Array.isArray(fills))throw Error('WORKER_PREFLIGHT_PACKET_INVALID');
 // Mirror the existing transactional SQL's count-based chunks and final empty
 // packet. This catches the deployed byte/evidence/schema limits before FIFO.
 const chunks=[];for(let i=0;i<fills.length;i+=2000)chunks.push(fills.slice(i,i+2000));chunks.push([]);
 for(const chunk of chunks){
  const payload={...packet,requestId:randomUUID(),fills:chunk,complete:chunk.length?false:packet.complete,financialComplete:false,financials:[]};
  const checked=await rpc('mkz_collector_check',{p_payload:payload});
  if(checked?.mode!=='read_only'||checked?.writesPerformed!==0)throw Error('WORKER_PREFLIGHT_RESPONSE_INVALID');
  if(!checked.ok){const code=checked.issues?.find(i=>issues.has(i.code))?.code;throw Error(code?'WORKER_PREFLIGHT_'+code.toUpperCase():'WORKER_PREFLIGHT_REJECTED');}
 }
 return {chunks:chunks.length,fills:fills.length,writesPerformed:0};
}
module.exports={serializeEvidence,rpcFailure,preflightWorkerPacket,PROOF_LIMIT};
