// Read-only API discovery. Does not execute Reporter, write a database or expose keys/wallets.
const fs=require('node:fs'),path=require('node:path');
async function main(){
 const raw=fs.readFileSync('C:/Users/Mike/Desktop/trading-bot/doma-reporter/.env','utf8');
 const setting=k=>raw.match(new RegExp('^'+k+'=(.*)$','m'))?.[1].trim().replace(/^(["'])(.*)\1$/,'$2');
 const endpoint=new URL(setting('DOMA_API_URL')||'https://api.doma.xyz/graphql'),key=setting('DOMA_API_KEY');
 if(endpoint.protocol!=='https:'||endpoint.hostname!=='api.doma.xyz'||!key)throw Error('Existing Doma read configuration unavailable');
 if(process.argv.includes('--v1'))endpoint.pathname='/v1/graphql';
 async function query(query){
  const r=await fetch(endpoint,{method:'POST',redirect:'error',headers:{'Api-Key':key,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Read-only API HTTP '+r.status);
  const data=await r.json();if(data.errors)throw Error('Read-only schema query rejected: '+data.errors.map(e=>e.message).join('; '));return data.data;
 }
 const schema=await query('{ __schema { queryType { fields { name args { name type { kind name ofType { kind name ofType { kind name } } } } type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } } }');
 const fields=schema.__schema.queryType.fields.filter(f=>/strateg|order|swap/i.test(f.name));
 const report={checkedAt:new Date().toISOString(),endpoint:endpoint.toString(),fields,types:[],sample:null};
 const unwrap=t=>{if(!t)throw Error('API type wrapper exceeds inspected schema');return t.name||unwrap(t.ofType)};
 const swap=fields.find(f=>f.name==='fractionalTokenSwaps');
 if(swap){
  const type=await query(`{ __type(name:${JSON.stringify(unwrap(swap.type))}) { name fields { name type { kind name ofType { kind name ofType {kind name ofType {kind name}} } } } } }`);
  report.types.push(type.__type);
  const item=type.__type.fields.find(f=>f.name==='items');
  if(item){const detail=await query(`{ __type(name:${JSON.stringify(unwrap(item.type))}) { name fields { name type { kind name ofType { kind name } } } } }`);report.types.push(detail.__type);}
  const page=(await query('{ fractionalTokenSwaps(take:30,skip:0,sortOrder:DESC) { totalCount items { date buyerAddress originAddress fractionalTokenAmount quoteTokenAmount priceUsd contractType } } }')).fractionalTokenSwaps;
  report.sample={rows:page.items.length,totalCount:page.totalCount,distinctExecutionRoles:page.items.filter(r=>r.buyerAddress&&r.originAddress&&r.buyerAddress.toLowerCase()!==r.originAddress.toLowerCase()).length,contractTypes:[...new Set(page.items.map(r=>r.contractType))],newest:page.items[0]?.date,oldest:page.items.at(-1)?.date};
 }
 for(const fieldName of ['defiStrategies','defiStrategyEvents','limitOrder','defiStrategyAllocation']){
  const f=fields.find(f=>f.name===fieldName);if(!f)continue;
  const type=(await query(`{ __type(name:${JSON.stringify(unwrap(f.type))}) { name fields { name args {name} type { kind name ofType { kind name ofType {kind name ofType {kind name}} } } } } }`)).__type;
  report.types.push(type);
  const item=type.fields.find(f=>f.name==='items');
  if(item)report.types.push((await query(`{ __type(name:${JSON.stringify(unwrap(item.type))}) { name fields { name args {name} type {kind name ofType {kind name ofType {kind name ofType {kind name}}}} } } }`)).__type);
 }
 const strategy=report.types.find(t=>t.name==='DeFiStrategyModel');
 const orders=strategy?.fields.find(f=>f.name==='orders');
 if(orders)report.types.push((await query(`{ __type(name:${JSON.stringify(unwrap(orders.type))}) { name fields {name type {kind name ofType {kind name}}} } }`)).__type);
 try{
  const page=(await query('{ defiStrategies(take:3,skip:0) { totalCount items { id walletAddress networkId roiBps realizedPnl } } }')).defiStrategies;
  report.strategyAccess={ok:true,rows:page.items.length,totalCount:page.totalCount,withWallet:page.items.filter(s=>!!s.walletAddress).length,withRoi:page.items.filter(s=>s.roiBps!==null).length,withRealizedPnl:page.items.filter(s=>s.realizedPnl!==null).length};
 }catch(e){report.strategyAccess={ok:false,reason:e.message};}
 report.individualStrategyChecks=[];
 for(const [name,q] of [
  ['strategy',{query:'{ defiStrategy(id:215) { id walletAddress roiBps realizedPnl orders { orderId status fillTransactionHashes } } }',field:'defiStrategy'}],
  ['events',{query:'{ defiStrategyEvents(strategyId:215,take:1,skip:0) { totalCount items {id type} } }',field:'defiStrategyEvents'}]
 ]){try{const data=(await query(q.query))[q.field];report.individualStrategyChecks.push({name,ok:true,returned:!!data,orders:data.orders?.length,ordersWithFills:data.orders?.filter(o=>o.fillTransactionHashes?.length).length,eventCount:data.totalCount});}catch(e){report.individualStrategyChecks.push({name,ok:false,reason:e.message});}}
 const out='D:/Temp/modelkombat-tracking-review';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,process.argv.includes('--v1')?'strategy-source-probe-v1.json':'strategy-source-probe.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({checkedAt:report.checkedAt,endpoint:report.endpoint,queryNames:fields.map(f=>f.name),sample:report.sample,strategyAccess:report.strategyAccess,individualStrategyChecks:report.individualStrategyChecks},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
