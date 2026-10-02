// Read-only, credential-safe production audit. No source identifiers are printed.
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'../..');
require('@next/env').loadEnvConfig(root,false,{info(){},error(){throw Error('Local configuration could not be loaded.');}});
const {createClient}=require('@supabase/supabase-js');
async function main(){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const report={checkedAt:new Date().toISOString(),database:{},publicEndpoints:[]};
 // Registered-wallet storage intentionally has no direct service-role SELECT;
 // discovery is the supported read view, counted below.
 for(const table of ['mkz_reward_assets','mkz_markets','mkz_entries','mkz_batches','mkz_fills']){
  const r=await db.from(table).select('*',{count:'exact',head:true});report.database[table]=r.error?{available:false,code:r.error.code}:{rows:r.count};
 }
 const campaign=await db.from('mkz_campaigns').select('state,starts_at,ends_at,confirmed_through,complete,financial_complete,financial_method').eq('id','model-kombat-zones-1').maybeSingle();
 report.database.campaign=campaign.error?{available:false,code:campaign.error.code}:campaign.data;
 for(const status of ['pending','linked','not_found']){const r=await db.from('mkz_wallet_discovery').select('*',{count:'exact',head:true}).eq('status',status);report.database['wallets_'+status]=r.error?{available:false,code:r.error.code}:{rows:r.count};}
 for(const route of ['/api/bots/campaign/zones','/api/bots/tracking/zones','/api/bots/tracking/wallets?scope=pending']){
  const r=await fetch('https://www.modelkombat.xyz'+route,{signal:AbortSignal.timeout(20000)}),data=await r.json();
  report.publicEndpoints.push({route,status:r.status,...(route==='/api/bots/campaign/zones'?{available:data.available,state:data.state,complete:data.complete,fresh:data.fresh,issues:data.issues}:{error:data.error,code:data.code})});
 }
 const out='D:/Temp/modelkombat-tracking-review';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'live-status.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(()=>{console.error('Read-only tracking audit failed. No database changes were made.');process.exitCode=1;});
