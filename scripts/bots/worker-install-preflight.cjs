'use strict';
// Invoked before switching the service. Reuses the uploaded environment file;
// never evaluates shell text, prints settings, or writes database records.
const fs=require('node:fs'),{createClient}=require('@supabase/supabase-js');
async function main(){
 const lines=fs.readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/),config={};
 for(const line of lines){const index=line.indexOf('=');if(index<1)throw Error('WORKER_CONFIGURATION_INVALID');const key=line.slice(0,index);if(!['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DOMA_API_KEY'].includes(key))throw Error('WORKER_CONFIGURATION_INVALID');config[key]=line.slice(index+1);}
 if(Object.values(config).some(v=>!v)||Object.keys(config).length!==3)throw Error('WORKER_CONFIGURATION_INVALID');
 const db=createClient(config.NEXT_PUBLIC_SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 for(const name of ['mkz_worker_snapshot','mkz_worker_health']){const r=await db.rpc(name,name==='mkz_worker_health'?{p:null}:{}).abortSignal(AbortSignal.timeout(20000));if(r.error||name==='mkz_worker_health'&&r.data?.nativeAccountingReady!==true)throw Error('Apply the consolidated tracking-update.sql patch before updating. Existing service was not replaced.');}
 const capabilities=await db.rpc('mkz_accounting_capabilities').abortSignal(AbortSignal.timeout(20000));
 if(capabilities.error||capabilities.data?.openingBasis!=='deferred-untouched-2'||capabilities.data?.verifiedFinancials!=='per-account-current-cutoff-1')throw Error('Apply scripts/sql/bots-token-zone-opening-basis.sql before updating. Existing service was not replaced.');
 console.log('Database preflight passed. Existing collector can now be updated.');
}
main().catch(e=>{console.error(e.message.startsWith('Apply ')?e.message:'Collector database preflight failed. Existing service was not replaced.');process.exitCode=1;});
