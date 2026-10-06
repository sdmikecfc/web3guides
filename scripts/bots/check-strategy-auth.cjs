// Bounded, read-only check of existing Doma credentials. Never prints credentials or customer records.
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const endpoint='https://api.doma.xyz/graphql';
 const locations=[['workshop','C:/Users/Mike/Desktop/web3guides/.env.local'],['reporter','C:/Users/Mike/Desktop/trading-bot/doma-reporter/.env']];
 const report={checkedAt:new Date().toISOString(),endpoint,checks:[],frontend:{source:'https://app.doma.xyz/auto-trading',tokenProvider:'usePrivy().getAccessToken()',strategyHeader:'Authorization: Bearer <Privy access token>',strategyListEnabled:'ready && authenticated',sourceFiles:['3ayt1m2qvzklb.js','0_eu661yuqo_9.js'],inspection:'Doma public application bundles; no browser sessions or stored login tokens accessed'}};
 for(const [source,file]of locations){
  const raw=fs.readFileSync(file,'utf8'),key=raw.match(/^\s*DOMA_API_KEY\s*=\s*(.*)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/,'$2');
  if(!key){report.checks.push({source,configured:false});continue;}
  for(const [name,query]of [
   ['public_swap_control','{ fractionalTokenSwaps(take:1) { totalCount } }'],
   ['strategy_list','{ defiStrategies(take:1) { totalCount } }'],
   ['strategy_detail','{ defiStrategy(id:215) { id } }'],
   ['strategy_events','{ defiStrategyEvents(strategyId:215,take:1) { totalCount } }']
  ]){
   const response=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'Api-Key':key,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(20000)});
   const body=await response.json();
   const errors=(body.errors||[]).map(e=>({message:e.message,code:e.extensions?.code,status:e.extensions?.originalError?.statusCode}));
   report.checks.push({source,name,httpStatus:response.status,success:response.ok&&!errors.length&&body.data!==null,errors});
  }
 }
 const out='D:/Temp/modelkombat-tracking-review';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'strategy-auth-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
