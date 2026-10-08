// Run on Model Kombat's own host with its existing server .env.local.
// Default: read-only rehearsal. --write enables game-only scoring when active.
// --watch repeats every four hours; it does not install or alter a scheduler.
'use strict';
const path=require('node:path'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
require('@next/env').loadEnvConfig(root,false,{info(){},error(){throw Error('EXISTING_SERVER_CONFIGURATION_UNAVAILABLE');}});
const {collect}=require('./lib/public-trade-worker.cjs'),{publicSource}=require('./lib/public-trade-source.cjs');
const {accountingCycle}=require('./lib/accounting-cycle.cjs');
const {openAccountingCache}=require('./lib/accounting-cache.cjs');
const {rpcFailure,preflightWorkerPacket}=require('./lib/worker-contract.cjs');
const safeCode=code=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{2,100}$/.test(code)?code:'SOURCE_UNAVAILABLE';
const workerVersion='mk-public-worker-8-eligible-accounting';
let runStartedAt;
const output=process.env.MK_WORKER_STATE_DIR||(process.platform==='win32'?'D:/Temp/modelkombat-tracking-review':path.join(process.env.TMPDIR||'/tmp','modelkombat-tracking-review'));
const pollMinutes=Number(process.env.MK_WORKER_POLL_MINUTES||240);
if(!Number.isInteger(pollMinutes)||pollMinutes<5||pollMinutes>240)throw Error('INVALID_WORKER_POLL_MINUTES');
function saveReport(report){fs.mkdirSync(output,{recursive:true});const dest=path.join(output,'backend-worker-last-run.json'),temporary=dest+'.tmp';fs.writeFileSync(temporary,JSON.stringify(report,null,2),{mode:0o600});fs.renameSync(temporary,dest);}
async function progress(phase,detail={},report={}){const status={workerVersion,phase,runStartedAt,updatedAt:new Date().toISOString(),...detail};fs.mkdirSync(output,{recursive:true});const file=path.join(output,'backend-worker-status.json');fs.writeFileSync(file+'.tmp',JSON.stringify(status,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);console.log(JSON.stringify(status));
 if(args.has('--write')){const p=require('./lib/worker-health.cjs').healthPayload(status,report);try{await rpc('mkz_worker_health',{p});return true;}catch{console.error('PRIVATE_WORKER_STATUS_UNAVAILABLE');return false;}}
 return false;
}
const args=new Set(process.argv.slice(2));
if([...args].some(a=>!['--write','--watch','--allow-old-schema-rehearsal','--test-linked-agent-only'].includes(a)))throw Error('Use --write and/or --watch; omit both for a read-only check.');
if(args.has('--test-linked-agent-only')&&(args.has('--write')||args.has('--watch')))throw Error('Single test wallet checks are read-only and run once.');
const db=require('@supabase/supabase-js').createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function rpc(name,p={}){const r=await db.rpc(name,p).abortSignal(AbortSignal.timeout(30000));if(r.error)throw rpcFailure(name,r.error);return r.data;}
async function legacyReadOnly(){
 // Only for pre-install testing. This fallback can NEVER write results.
 const manifest=await rpc('mkz_collector_manifest'),rows=[];let after=null;
 do{const p=await rpc('mkz_collector_wallets',{p_scope:'monitor',p_after:after});rows.push(...p.wallets);after=p.nextCursor;}while(after);
 const links=await db.from('mkz_all_links').select('wallet,mcp_wallet,doma_user_id,status');if(links.error)throw Error('LINK_READ_FAILED');
 const accounts=[],wallets=[];
 for(const l of links.data.filter(l=>l.status==='linked')){
  if(!accounts.some(a=>a.participant===l.doma_user_id))accounts.push({participant:l.doma_user_id,coverage:null});
  for(const w of rows.find(r=>r.wallet===l.wallet)?.tradeWallets||[l.wallet,l.mcp_wallet])if(w&&!wallets.some(a=>a.trade_wallet===w))wallets.push({participant:l.doma_user_id,trade_wallet:w,agent:w===l.mcp_wallet});
 }
 return {manifest,accounts,wallets,references:[],fills:[],fingerprint:null};
}
async function run(){
 runStartedAt=new Date().toISOString();
 await progress('READING_REGISTRY');
 let snapshot;
 try{snapshot=await rpc('mkz_worker_snapshot');}catch(e){if(!args.has('--allow-old-schema-rehearsal')||args.has('--write'))throw e;snapshot=await legacyReadOnly();}
 if(args.has('--test-linked-agent-only')){
  const agents=snapshot.wallets.filter(w=>w.agent);
  if(agents.length!==1)throw Error('SINGLE_APPROVED_TEST_AGENT_REQUIRED');
  snapshot={...snapshot,wallets:agents,accounts:snapshot.accounts.filter(a=>a.participant===agents[0].participant),references:[],fills:[]};
 }
 await progress('VERIFYING_PUBLIC_TRADES');
 const source=publicSource({apiKey:process.env.DOMA_API_KEY}),result=await collect(snapshot,source);let accounting=[],confirmAccountingCommit=null;
 if(args.has('--write'))await preflightWorkerPacket(result.packet,rpc);
 result.report.accountingProblems=[];
 if(result.packet.complete&&!args.has('--test-linked-agent-only')){
  await progress('RECONSTRUCTING_ACCOUNTING');
  try{
   const capabilities=await rpc('mkz_accounting_capabilities');
   if(capabilities?.openingBasis!=='deferred-untouched-2'||capabilities?.verifiedFinancials!=='per-account-current-cutoff-1'||capabilities?.financialScope!=='eligible-traders-1')throw Error('ACCOUNTING_SCHEMA_UPDATE_REQUIRED');
   const cache=openAccountingCache({directory:path.join(output,'accounting-cache'),chainId:97477});
   const cycle=await accountingCycle({snapshot,packet:result.packet,cache,
    sourceFactory:options=>publicSource({apiKey:process.env.DOMA_API_KEY,...options}),
    anchorAt:(time,deadline)=>source.withDeadline(deadline,()=>source.blockAt(time))});
   accounting=cycle.ledgers;confirmAccountingCommit=cycle.confirmCommit;result.report.accountingProblems=cycle.problems;
   result.report.accountingScope={verified:cycle.completed,noEligibleTrades:cycle.noTrades,notStarted:cycle.notStarted,total:cycle.total};
   if(cycle.complete){result.packet.financialComplete=true;result.packet.methodology='mk-fifo-realized-capital-1';result.report.financialComplete=true;result.report.warnings=[];}
  }catch(e){result.report.accountingProblems.push({code:safeCode(e.message)});}
 }
 // Console/disk reports intentionally omit account IDs, wallet addresses,
 // transaction hashes, source references and all secrets.
 const report={workerVersion,...result.report,problems:result.report.problems.map(({code})=>({code:safeCode(code)})),databaseWrites:false};
 report.scope=args.has('--test-linked-agent-only')?'approved_single_agent_wallet_only':'all_enrolled_linked_wallets';
 if(args.has('--test-linked-agent-only'))report.accountingProblems.push({code:'ACCOUNT_LEVEL_ACCOUNTING_NOT_TESTED_IN_SINGLE_WALLET_MODE'});
 if(args.has('--write')&&['active','closed'].includes(snapshot.manifest.campaign.state)){
  if(!snapshot.fingerprint)throw Error('DISCOVERY_SETUP_REQUIRED');
  // Never advance behind an existing checkpoint after a stale read.
  if(Date.parse(result.packet.confirmedThrough)<Date.parse(snapshot.manifest.campaign.confirmed_through||0))throw Error('SOURCE_BEHIND_SAVED_CHECKPOINT');
  await rpc('mkz_worker_commit',{p:{requestId:randomUUID(),fingerprint:snapshot.fingerprint,packet:result.packet,accounting,report}});report.databaseWrites=true;
  // A durable sweep acknowledgement is earned only by this successful commit.
  // Failure to save it merely forces fresh reconstruction on the next cycle.
  try{if(confirmAccountingCommit)await confirmAccountingCommit();}catch{console.error('ACCOUNTING_CHECKPOINT_UNAVAILABLE');}
 }
 report.status=result.packet.financialComplete?'TRACKING_VERIFIED':result.packet.complete?'VOLUME_VERIFIED_FINANCIALS_PENDING':'PENDING';
 report.scoreWrites=report.databaseWrites;
 report.healthReportSaved=await progress('AUDIT_COMPLETE',{status:report.status,nextCheckMinutes:pollMinutes},report);
 report.databaseWrites=report.scoreWrites||report.healthReportSaved;
 saveReport(report);
 console.log(JSON.stringify(report,null,2));return report;
}
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
async function main(){do{try{await run();}catch(e){const failure={workerVersion,status:'FAILED',code:/^[A-Z0-9_:a-z]+$/.test(e.message)?e.message:'WORKER_FAILED',checkedAt:new Date().toISOString(),scoresConfirmed:false};failure.healthReportSaved=await progress('AUDIT_FAILED',{code:failure.code},failure);saveReport(failure);console.error(JSON.stringify(failure));if(!args.has('--watch')){process.exitCode=1;return;}}
 if(!args.has('--watch')||stopping)return;
 const end=Date.now()+pollMinutes*60000;while(!stopping&&Date.now()<end)await new Promise(r=>setTimeout(r,Math.min(1000,end-Date.now())));
}while(!stopping);}
main().catch(()=>{console.error('WORKER_FAILED');process.exitCode=1;});
