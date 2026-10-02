// Exercise the built API on loopback with a temporary test credential.
// Existing production DB credentials stay in memory; only SELECT-only routes are called.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),{randomBytes,randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=process.env.MK_RELEASE_DIR;
if(!out||!/^D:[/\\]Temp[/\\]modelkombat-release-[\w-]+$/.test(out))throw Error('Use the isolated D-drive release directory.');
require('@next/env').loadEnvConfig(root,false,{info(){},error(){throw Error('Existing settings could not be loaded.');}});
async function main(){
 const candidate=path.join(out,'candidate'),base='http://127.0.0.1:3194',token=randomBytes(32).toString('hex'),log=fs.openSync(path.join(out,'tracking-http-check.log'),'w');
 const env={...process.env,NODE_ENV:'production',DK_PREVIEW_DIST:'.mk-token-build',BOTS_TOKEN_ZONES:'1',MK_WALLET_TRACKING_ENABLED:'1',MK_WALLET_RESOLVER_TOKEN:token};delete env.MK_MCP_INGEST_TOKEN;
 const server=cp.spawn(process.execPath,[path.join(candidate,'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p','3194'],{cwd:candidate,env,stdio:['ignore',log,log],windowsHide:true});
 let failed=false;server.on('error',()=>{failed=true;});
 try{
  let ready=false;for(let i=0;i<60;i++){if(failed||server.exitCode!==null)throw Error('Local server failed to start.');try{const r=await fetch(base+'/api/bots/tracking/zones',{signal:AbortSignal.timeout(1000)});if(r.status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
  assert.ok(ready,'built server becomes ready and rejects unauthenticated feed access');
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const manifest=await fetch(base+'/api/bots/tracking/zones',{headers});assert.equal(manifest.status,200);const spec=await manifest.json();assert.equal(spec.campaign.state,'draft');assert.ok(spec.walletLookup);assert.equal(spec.preflightPath,'/api/bots/tracking/zones/check');
  const wallets=await fetch(base+'/api/bots/tracking/wallets?scope=pending',{headers});assert.equal(wallets.status,200);const discovery=await wallets.json();assert.equal(discovery.schemaVersion,1);
  const end=Date.now()-60000,stamp=new Date(end).toISOString(),address=n=>'0x'+n.repeat(40);
  const sample={schemaVersion:1,requestId:randomUUID(),campaignId:'model-kombat-zones-1',rules:'mk-token-zones-1',coverageFrom:new Date(end-3600000).toISOString(),confirmedThrough:stamp,complete:false,financialComplete:false,financials:[],fills:[{chainId:97477,economicId:'synthetic-preflight-never-ingest',revision:1,wallet:address('1'),transactionHash:'0x'+'1'.repeat(64),domainToken:address('2'),quoteToken:address('3'),executedAt:stamp,volumeUsd:'0.5',source:'agent_wallet',status:'verified',evidence:'Synthetic negative diagnostic. Not a real trade and never submitted to ingestion.'}]};
  const response=await fetch(base+'/api/bots/tracking/zones/check',{method:'POST',headers,body:JSON.stringify(sample)});assert.equal(response.status,200);const check=await response.json();assert.equal(check.writesPerformed,0);assert.equal(check.ingestionOpen,false);assert.equal(check.ok,false);assert.ok(check.issues.some(i=>i.code==='wallet_unmapped'));assert.ok(check.issues.some(i=>i.code==='market_unverified'));
  const after=await (await fetch(base+'/api/bots/tracking/zones',{headers})).json();assert.deepEqual(after.campaign,spec.campaign,'diagnostic does not change campaign or coverage');
  const report={checkedAt:new Date().toISOString(),scope:'Built Next.js server on loopback; real database reads only; generated local credential, not the production secret.',authenticatedManifest:manifest.status,walletDiscovery:wallets.status,pendingWallets:discovery.wallets.length,setupIssues:spec.setupIssues,diagnostic:{http:response.status,writesPerformed:check.writesPerformed,issues:check.issues.map(i=>i.code)},campaignUnchanged:true,liveDeploymentVerified:false};
  fs.writeFileSync(path.join(out,'tracking-http-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{server.kill();fs.closeSync(log);}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
