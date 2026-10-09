'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto'),v=require('viem');
const {reconstruct}=require('./lib/public-accounting.cjs'),{nativeLedgerFixture,NATIVE}=require('./public-native-accounting-check.cjs'),{USDC,WETH,TRANSFER}=require('./lib/public-trade-worker.cjs');
const a=n=>'0x'+String(n).padStart(40,'0'),wallet=a(1),agent=a(2),pool=a(4),external=a(5),isolated=a(6),hex=n=>'0x'+BigInt(n).toString(16),topic=s=>'0x'+s.slice(2).padStart(64,'0'),at=n=>new Date(Date.UTC(2026,9,1,0,0,n)).toISOString();
const log=(token,from,to,units)=>({address:token,topics:[TRANSFER,topic(from),topic(to)],data:topic(hex(units))});
function projectionFixture({currentDeposit=false}={}){
 const f=nativeLedgerFixture(),originalRows=[...f.rows],oldBalance=f.source.balance,oldSwaps=f.source.swaps;
 f.source.blockAt=async time=>{const n=time<f.options.from?29:50;return {number:hex(n),hash:topic(hex(n+100))};};
 f.options.markets.push({domain_token:isolated,quote_token:USDC});
 function add(n,logs){const t={n,tx:topic(hex(n)),block:hex(n),blockHash:topic(hex(n+100)),fee:0n,payer:external,moves:[],logs};f.rows.push(t);return t;}
 const deposit=add(currentDeposit?31:15,[log(isolated,external,wallet,8000000n)]);
 add(33,[log(isolated,wallet,agent,3000000n)]);add(34,[log(isolated,agent,external,1000000n)]);
 const sale=add(35,[log(isolated,wallet,pool,2000000n),log(USDC,pool,wallet,3000000n)]);
 const buy=add(41,[log(USDC,wallet,pool,2000000n),log(isolated,pool,wallet,2000000n)]);
 add(42,[log(isolated,wallet,external,1000000n)]);
 f.source.balance=async(w,t,b)=>t===isolated?(b===hex(29)?(!currentDeposit&&w===wallet?8000000n:0n):w===wallet?4000000n:2000000n):t===USDC&&w===wallet&&b===hex(50)?103000000n:oldBalance(w,t,b);
 f.source.swaps=async w=>[...(await oldSwaps(w)).filter(s=>originalRows.some(t=>t.tx===s.txHash)),...(w===wallet?[{n:sale.n,tx:sale.tx,side:'sell'},{n:buy.n,tx:buy.tx,side:'buy'}].map(t=>({txHash:t.tx,date:at(t.n),userAddress:wallet,contractType:'UNISWAP_V3_POOL',fractionalToken:{address:isolated,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:'USDC.e',decimals:6},fractionalTokenAmount:t.side==='buy'?'2000000':'-2000000',quoteTokenAmount:t.side==='buy'?'-2000000':'3000000',priceUsd:1})):[])];
 f.options.eligible.push({economicId:'isolated-buy',wallet,transactionHash:buy.tx,domainToken:isolated,quoteToken:USDC,volumeUsd:'2.000000',side:'buy',executedAt:at(41)});
 f.source.transaction=async tx=>({hash:tx,from:external,to:isolated,chainId:'0x17cc5',blockNumber:deposit.block,blockHash:deposit.blockHash,value:'0x0',input:v.encodeFunctionData({abi:v.parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),functionName:'transfer',args:[wallet,8000000n]})});
 return {...f,sale,buy,isolated};
}
function componentFixture({bridge=null}={}){
 const f=projectionFixture(),priorSwaps=f.source.swaps,priorBalance=f.source.balance;
 for(let i=f.rows.length-1;i>=0;i--)if([33,34].includes(f.rows[i].n))f.rows.splice(i,1);
 const add=(n,logs)=>{const r={n,tx:topic(hex(n)),block:hex(n),blockHash:topic(hex(n+100)),fee:0n,payer:external,moves:[],logs};f.rows.push(r);return r;};
 const bought=add(18,[log(USDC,agent,pool,5000000n),log(isolated,pool,agent,5000000n)]),sold=add(48,[log(isolated,agent,pool,2000000n),log(USDC,pool,agent,3000000n)]);
 f.source.swaps=async w=>[...(await priorSwaps(w)),...(w===agent?[{row:bought,buy:true},{row:sold,buy:false}].map(({row,buy})=>({txHash:row.tx,date:at(row.n),userAddress:agent,contractType:'UNISWAP_V3_POOL',fractionalToken:{address:isolated,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:'USDC.e',decimals:6},fractionalTokenAmount:buy?'5000000':'-2000000',quoteTokenAmount:buy?'-5000000':'3000000',priceUsd:1})):[])];
 f.options.eligible.push({economicId:'agent-sale',wallet:agent,transactionHash:sold.tx,domainToken:isolated,quoteToken:USDC,volumeUsd:'3.000000',executedAt:at(48)});
 if(bridge)add(49,[log(bridge==='unrelated'?USDC:isolated,bridge==='reverse'?agent:wallet,bridge==='reverse'?wallet:agent,1n)]);
 f.source.balance=async(w,t,b)=>{if(t===isolated){let n=b===hex(29)?(w===wallet?8000000n:5000000n):(w===wallet?7000000n:3000000n);if(b===hex(50)&&bridge&&bridge!=='unrelated')n+=(bridge==='reverse'?1n:-1n)*(w===wallet?1n:-1n);return n;}
  if(t===USDC&&b===hex(50)){let n=w===agent?3000000n:103000000n;if(bridge==='unrelated')n+=w===agent?1n:-1n;return n;}return priorBalance(w,t,b);};
 return f;
}
const canonical=value=>JSON.stringify(value,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const micros=x=>{const [a,b='']=String(x).split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'));};
// Independent score oracle: fully known lot costs only, never projection logic.
function scoreKnown(p){let capital=0n,profit=0n,proceeds=0n;const lots=[];
 for(const l of p.openingLots){capital+=micros(l.valueUsd);lots.push({...l,units:BigInt(l.units),cost:micros(l.costUsd)});}
 for(const e of p.events){const qty=BigInt(e.units);if(e.kind==='in')capital+=micros(e.usd);
  if(['in','buy'].includes(e.kind)){lots.push({...e,units:qty,cost:micros(e.kind==='in'?e.costUsd:e.usd),acquiredAt:e.executedAt});continue;}
  let need=qty,cost=0n;for(const l of lots.filter(l=>l.wallet===e.wallet&&l.token===e.token&&l.units>0n).sort((a,b)=>a.acquiredAt.localeCompare(b.acquiredAt)||(a.acquisitionOrder??0)-(b.acquisitionOrder??0))){const take=need<l.units?need:l.units,basis=take===l.units?l.cost:l.cost*take/l.units;l.units-=take;l.cost-=basis;need-=take;cost+=basis;if(e.kind==='transfer')lots.push({...l,wallet:e.toWallet,units:take,cost:basis});if(!need)break;}assert.equal(need,0n);
  if(e.kind==='sell'&&e.economicId){profit+=micros(e.usd)-cost;proceeds+=micros(e.usd);}
 }return {capital:String(capital),profit:String(profit),proceeds:String(proceeds)};
}
function known(p,cost){return {...p,openingLots:p.openingLots.map(l=>l.costKnown===false?{...l,costKnown:true,costUsd:cost}:l),events:p.events.map(e=>e.costKnown===false?{...e,costKnown:true,costUsd:cost}:e)};}
async function main(){
 for(const currentDeposit of [false,true]){
  const f=projectionFixture({currentDeposit}),p=await reconstruct(f.options),full=p.fullReconciliation,meta=p.scoringProjection;
  assert.equal(meta.version,'mk-isolated-unscored-components-2');assert.deepEqual(meta.isolatedBuckets,[{wallet,token:isolated},{wallet:agent,token:isolated}]);assert.equal(meta.fullLedgerSha256,createHash('sha256').update(canonical(full)).digest('hex'));
  assert.deepEqual(full.openingLots,p.openingLots);assert.equal(full.closingBalances.length,f.options.wallets.length*new Set(f.options.markets.flatMap(m=>[m.domain_token,m.quote_token]).concat(NATIVE)).size);
  assert.equal(full.closingBalances.find(b=>b.wallet===wallet&&b.token===isolated).units,'4000000');assert.equal(full.closingBalances.find(b=>b.wallet===agent&&b.token===isolated).units,'2000000');
  assert.ok(full.events.some(e=>e.token===isolated&&e.kind==='transfer'));assert.ok(full.events.some(e=>e.token===isolated&&e.kind==='sell'));assert.ok(!p.events.some(e=>e.token===isolated&&['sell','out','transfer'].includes(e.kind)));
  assert.deepEqual(p.events.filter(e=>e.token!==isolated),full.events.filter(e=>e.token!==isolated));assert.deepEqual(p.events.filter(e=>['in','buy'].includes(e.kind)),full.events.filter(e=>['in','buy'].includes(e.kind)));assert.deepEqual(p.events.filter(e=>e.economicId),full.events.filter(e=>e.economicId));
  assert.ok((currentDeposit?full.events:full.openingLots).some(l=>l.token===isolated&&l.costKnown===false&&!Object.hasOwn(l,'costUsd')),'real unknown purchase cost remains absent');
  const scores=['0.000001','100.000000','9999.999999'].map(cost=>scoreKnown(known(full,cost)));assert.deepEqual(scores[0],scores[1]);assert.deepEqual(scores[0],scores[2]);assert.deepEqual(scoreKnown(known(p,'1.000000')),scores[0]);assert.equal(scores[0].profit,'1999992');assert.equal(scores[0].capital,'108099995');
  if(process.env.MK_PROJECTION_SQL_CHECK==='1'){
   if(!process.env.MK_PROJECTION_PGLITE)throw Error('MK_PROJECTION_PGLITE_MODULE_REQUIRED');const {PGlite}=require(process.env.MK_PROJECTION_PGLITE),db=new PGlite();try{const sql=fs.readFileSync(require('node:path').join(__dirname,'../sql/bots-token-zone-opening-basis.sql'),'utf8'),start=sql.indexOf('create or replace function public.mkz_fifo_calculate'),end=sql.indexOf('end $$;',start)+7;await db.exec(sql.slice(start,end));const eligible=p.events.filter(e=>e.economicId).map(e=>({economicId:e.economicId,wallet:e.wallet,domainToken:e.token,executedAt:e.executedAt}));const calc=async ledger=>(await db.query('select mkz_fifo_calculate($1,$2) v',[JSON.stringify({...p,...ledger}),JSON.stringify(eligible)])).rows[0].v;const result=await calc(p);for(const cost of ['0.000001','100.000000','9999.999999'])assert.deepEqual(await calc(known(full,cost)),{...result,events:full.events.length});}finally{await db.close();}
  }
 }
 const component=await reconstruct(componentFixture().options);assert.deepEqual(component.scoringProjection.isolatedBuckets,[{wallet,token:isolated}]);assert.ok(component.events.some(e=>e.economicId==='agent-sale'),'same-token sale in independent wallet remains fully scored');
 const componentScores=['0.000001','100.000000','9999.999999'].map(cost=>scoreKnown(known(component.fullReconciliation,cost)));assert.deepEqual(componentScores[0],componentScores[1]);assert.deepEqual(componentScores[0],componentScores[2]);assert.deepEqual(scoreKnown(known(component,'1.000000')),componentScores[0]);assert.equal(componentScores[0].profit,'2999992');assert.equal(componentScores[0].capital,'113099995');
 for(const bridge of ['forward','reverse'])await assert.rejects(()=>reconstruct(componentFixture({bridge}).options),/ACCOUNTING_OPENING_BASIS_REQUIRED/,'even a later '+bridge+' transfer joins scored inventory');
 assert.ok((await reconstruct(componentFixture({bridge:'unrelated'}).options)).scoringProjection,'quote-token transfer cannot connect separate domain FIFO');
 let missing=projectionFixture();for(const fill of missing.options.eligible)delete fill.side;assert.ok((await reconstruct(missing.options)).scoringProjection,'receipt-proven buys permit projection even when packet direction is absent');
 let f=projectionFixture();f.options.eligible.push({economicId:'late-sale',wallet:agent,domainToken:isolated,side:'sell',executedAt:at(49)});await assert.rejects(()=>reconstruct(f.options),/ACCOUNTING_FILL_MISSING/,'an unproved later eligible sell cannot permit a projected ledger');
 f=projectionFixture();f.options.eligible.push({economicId:'ambiguous',wallet:agent,domainToken:isolated});await assert.rejects(()=>reconstruct(f.options),/ACCOUNTING_FILL_MISSING/,'missing direction never permits an unmatched eligible event');
 f=projectionFixture();f.options.eligible[0].side='buy';await assert.rejects(()=>reconstruct(f.options),/ACCOUNTING_FILL_MISSING/,'explicit direction cannot contradict the proven receipt');
 f=projectionFixture();f.options.eligible[0].executedAt=at(39);await assert.rejects(()=>reconstruct(f.options),/ACCOUNTING_FILL_MISSING/,'eligible timestamp must equal actual chain execution');
 f=projectionFixture();delete f.options.eligible[0].executedAt;await assert.rejects(()=>reconstruct(f.options),/ACCOUNTING_FILL_MISSING/,'actual eligibility requires a timestamp');
 f=projectionFixture();const balance=f.source.balance;f.source.balance=async(w,t,b)=>t===isolated&&w===agent&&b===hex(50)?1n:balance(w,t,b);await assert.rejects(()=>reconstruct(f.options),/CLOSING_BALANCE_MISMATCH/,'projection cannot mask a real closing mismatch');
 f=projectionFixture();f.source.hasCode=async x=>x===external;await assert.rejects(()=>reconstruct(f.options),/UNSUPPORTED_CONTRACT_OR_LP_FLOW/,'current contract disposals remain rejected before projection');
 console.log('PASS isolated unscored inventory: full linked FIFO/closing proof, capital and eligible events preserved, canonical evidence hash, partial disposals, equal scores for arbitrary known costs, later eligible sale and inconsistent closing rejected.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={projectionFixture,componentFixture};