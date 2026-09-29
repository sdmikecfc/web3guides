// Read-only visibility check in the game's configured database. No Doma/Reporter jobs.
// node scripts/bots/workshop-attribution-preflight.cjs 0x... [0x...]
const fs=require('node:fs'),path=require('node:path');
const wallets=process.argv.slice(2).map(w=>w.toLowerCase());
if(!wallets.length||wallets.length>10||wallets.some(w=>!/^0x[0-9a-f]{40}$/.test(w)))throw Error('Supply 1–10 wallet addresses');
const env={...process.env},file=path.resolve(__dirname,'../../.env.local');
if(fs.existsSync(file))for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_][A-Z_0-9]*)=(.*)$/);if(m&&!env[m[1]])env[m[1]]=m[2].replace(/^(["'])(.*)\1$/,'$2');}
async function main(){
 const url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Read credentials unavailable');
 const rows=[];
 for(const wallet of wallets){const counts={};
  for(const [label,table,extra]of[
   ['observedBuyerFills','battle_bots_fills',{role:'eq.buyer'}],
   ['verifiedMcpReceipts','battle_bots_execution_receipts',{status:'eq.verified'}],
   ['rejectedMcpReceipts','battle_bots_execution_receipts',{status:'eq.rejected'}],
   ['creditedStrategyFills','battle_bots_campaign_fills',{automation_source:'eq.keeper'}],
   ['creditedMcpFills','battle_bots_campaign_fills',{automation_source:'eq.doma_mcp'}]
  ]){const q=new URLSearchParams({select:'id',wallet:`eq.${wallet}`,limit:'0',...extra});
   // campaign_fills has a composite key; fill_id is its stable source reference.
   if(table==='battle_bots_campaign_fills')q.set('select','fill_id');
   try{const r=await fetch(`${url}/rest/v1/${table}?${q}`,{headers:{apikey:key,Authorization:`Bearer ${key}`,Prefer:'count=exact'},signal:AbortSignal.timeout(15000)});
    const total=r.headers.get('content-range')?.split('/')[1];counts[label]=r.ok&&/^\d+$/.test(total||'')?Number(total):{unavailable:true,http:r.status};
   }catch{counts[label]={unavailable:true};}
  }
  try{const q=new URLSearchParams({select:'reason',wallet:`eq.${wallet}`,status:'eq.rejected',limit:'100'});
   const r=await fetch(`${url}/rest/v1/battle_bots_execution_receipts?${q}`,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
   if(r.ok){const reasons={};for(const row of await r.json()){const reason=/^[a-z_]{1,80}$/.test(row.reason||'')?row.reason:'other_or_unspecified';reasons[reason]=(reasons[reason]||0)+1;}counts.rejectedReasonsSample=reasons;}
  }catch{}
  rows.push({wallet,...counts});
 }
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),readOnly:true,scope:'Game database only. Counts are not independent Doma execution verification or cross-wallet identity proof.',rows},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
