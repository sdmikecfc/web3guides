// READ ONLY. Credentials stay in memory; output is aggregate health, never secrets/wallets.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const env={...process.env};
for(const line of fs.readFileSync(path.join(root,'.env.local'),'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);if(m&&!env[m[1]])env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}
async function main(){
 const url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw Error('Local read credentials unavailable');
 const report={checkedAt:new Date().toISOString(),readOnly:true,localConfig:Object.fromEntries(['BB_SESSION_SECRET','BB_CARD_SECRET','BB_FIGHT_SALT','BOTS_WORKSHOP_JOURNEY','BOTS_WORKSHOP_COMPETITION','NEXT_PUBLIC_BOTS_WORKSHOP_V1'].map(k=>[k,env[k]?k.includes('SECRET')||k.includes('SALT')?'present':env[k]:'absent (production settings not inferred)'])),tables:[]};
 for(const [table,select] of [['mk8_players','id'],['mk8_garages','revision'],['mk8_competitions','id,state,starts_at,ends_at,pool_cents,campaign_id'],['mk8_competition_attempts','rules'],['battle_bots_campaigns','id,status,starts_at,ends_at,rules_version'],['battle_bots_campaign_snapshots','period_key,as_of,frozen'],['battle_bots_campaign_fills','automation_source'],['battle_bots_execution_receipts','status'],['mk_mcp_batches','complete,window_end']]){
  try{const r=await fetch(`${url}/rest/v1/${table}?select=${select}&limit=5`,{headers:{apikey:key,Authorization:`Bearer ${key}`,Prefer:'count=exact'},signal:AbortSignal.timeout(20000)});const rows=await r.json();report.tables.push({table,status:r.status,count:r.headers.get('content-range'),...(r.ok?{sample:rows}: {code:rows.code??'unknown'})});}catch{report.tables.push({table,status:'connection failed'})}
 }
 console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
