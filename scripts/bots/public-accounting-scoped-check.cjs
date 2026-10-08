'use strict';
const assert=require('node:assert/strict'),{reconstruct,accountingStartMillis}=require('./lib/public-accounting.cjs');
const {fixture}=require('./public-accounting-check.cjs'),{nativeLedgerFixture}=require('./public-native-accounting-check.cjs');
const {USDC,TRANSFER}=require('./lib/public-trade-worker.cjs');
const address=n=>'0x'+String(n).padStart(40,'0');
const transfer=(token,from,to,units)=>({address:token,topics:[TRANSFER,'0x'+from.slice(2).padStart(64,'0'),'0x'+to.slice(2).padStart(64,'0')],data:'0x'+BigInt(units).toString(16).padStart(64,'0')});
function scoped(f){
 const calls=[],s=f.source,transfers=s.transfers,swaps=s.swaps,native=s.nativeHistory;
 const inWindow=(t,lo,hi)=>Date.parse(t.timestamp)>=lo&&Date.parse(t.timestamp)<=hi;
 s.transfers=async(w,lo,hi)=>{calls.push({method:'transfers',wallet:w,lo,hi});return(await transfers(w,lo,hi)).filter(t=>inWindow(t,lo,hi));};
 s.transfersForTokens=async(w,tokens,lo,hi)=>{calls.push({method:'tokenHistory',wallet:w,tokens,lo,hi});return(await transfers(w,lo,hi)).filter(t=>tokens.includes(t.token.address_hash)&&inWindow(t,lo,hi));};
 s.swaps=async(w,lo,hi)=>(await swaps(w,lo,hi)).filter(t=>Date.parse(t.date)>=lo&&Date.parse(t.date)<=hi);
 if(native)s.nativeHistory=async(w,hi,lo)=>{calls.push({method:'nativeHistory',wallet:w,lo,hi});return(await native(w,hi,lo)).filter(t=>t.at>=lo&&t.at<=hi);};
 return {...f,calls};
}
function untouchedFixture(){
 const f=fixture(),active=f.options.wallets[0],inactive=address(8),token=f.options.markets[0].domain_token;
 f.options.from=Date.parse('2026-10-01T00:00:15Z');f.options.wallets.push(inactive);
 f.source.blockAt=async t=>({number:t<f.options.from?'0x10':'0x20'});
 f.source.balance=async(w,t,block)=>w===inactive?(t===token?50000000n:t===USDC?20000000n:0n):(t===USDC?(block==='0x10'?100000000n:102000000n):0n);
 return {...scoped(f),active,inactive,token};
}
async function cases(){
 const basic=scoped(fixture()),native=scoped(nativeLedgerFixture()),untouched=untouchedFixture();
 return {basic:{...basic,ledger:await reconstruct(basic.options)},native:{...native,ledger:await reconstruct(native.options)},untouched:{...untouched,ledger:await reconstruct(untouched.options)}};
}
async function main(){
 const c=await cases();
 for(const f of [c.basic,c.native]){
  assert.ok(f.calls.some(x=>x.method==='tokenHistory'));
  assert.ok(f.calls.filter(x=>x.method==='tokenHistory').every(x=>x.tokens.length===1&&x.tokens[0]===f.options.markets[0].domain_token&&x.hi===f.options.from-1));
  assert.ok(f.calls.filter(x=>x.method==='transfers'||x.method==='nativeHistory').every(x=>x.lo===f.options.from&&x.hi===f.options.through));
 }
 assert.equal(c.basic.ledger.openingLots.find(x=>x.token===c.basic.options.markets[0].domain_token).costUsd,'10.000000');
 assert.equal(c.native.ledger.openingLots.find(x=>x.token===c.native.options.markets[0].domain_token).costUsd,'10.000003');
 assert.equal(c.native.ledger.events.find(x=>x.economicId==='sale').usd,'11.999995');
 // An agent's new trades do not consume an external wallet's old same-token
 // position. It contributes exact opening value without an invented cost.
 const u=c.untouched,old=u.ledger.openingLots.find(x=>x.wallet===u.inactive&&x.token===u.token);
 assert.equal(old.costKnown,false);assert.equal(Object.hasOwn(old,'costUsd'),false);assert.equal(old.valueUsd,'50.000000');
 assert.equal(u.calls.some(x=>x.method==='tokenHistory'),false);
 assert.equal(u.ledger.events.find(x=>x.economicId==='sale').usd,'12.000000');
 assert.equal(u.ledger.events.filter(x=>x.token===u.token&&x.kind==='buy')[0].usd,'10.000000');
 // A later buy must not bypass preexisting FIFO inventory on the SAME wallet.
 const consumes=untouchedFixture(),before=consumes.source.balance;
 consumes.source.balance=async(w,t,b)=>w===consumes.active&&t===consumes.token?10000000n:before(w,t,b);
 await assert.rejects(()=>reconstruct(consumes.options),/OPENING_BALANCE_MISMATCH/);
 assert.ok(consumes.calls.some(x=>x.method==='tokenHistory'));
 // Missing historical basis remains explicit for a consumed opening position.
 const missing=scoped(fixture());missing.source.transfersForTokens=async()=>[];
 await assert.rejects(()=>reconstruct(missing.options),/OPENING_BALANCE_MISMATCH/);
 const exact=scoped(fixture());exact.options.periodStart='2026-10-01T00:00:30.000739Z';
 exact.source.blockAt=async at=>({number:at<=exact.options.from?'0x11':'0x20'});
 const precise=await reconstruct(exact.options);assert.equal(precise.periodStart,exact.options.periodStart);
 assert.equal(accountingStartMillis(exact.options.periodStart),exact.options.from+1);
 assert.equal(accountingStartMillis('2026-10-01T00:00:30.000000+00:00'),exact.options.from);
 assert.ok(exact.calls.filter(x=>x.method==='transfers').every(x=>x.lo===exact.options.from+1));
 assert.ok(exact.calls.filter(x=>x.method==='tokenHistory').every(x=>x.hi===exact.options.from));
 // A purchase on the floored millisecond belongs to opening FIFO, not the
 // post-entry event stream. Its true historical cost is still reconstructed.
 const boundary=scoped(fixture());boundary.options.periodStart=exact.options.periodStart;
 const boundaryRows=await boundary.source.swaps(boundary.options.wallets[0],0,boundary.options.through);
  boundary.transactions[1].at=30;boundary.source.blockAt=exact.source.blockAt;
 boundaryRows[0].date='2026-10-01T00:00:30.000Z';boundary.source.swaps=async()=>boundaryRows;
 const boundaryLedger=await reconstruct(boundary.options);
 assert.equal(boundaryLedger.openingLots.find(l=>l.token===boundary.options.markets[0].domain_token).costUsd,'10.000000');
 assert.ok(boundaryLedger.events.every(e=>e.executedAt==='2026-10-01T00:00:40.000Z'));
 assert.ok(boundary.calls.some(x=>x.method==='tokenHistory'&&x.hi===boundary.options.from));
 // Raw round trips can change FIFO even with unchanged end balances. Reject
 // them before empty net flows bypass either the opening or period replay.
 for(const at of [25,35]){
  const roundtrip=scoped(fixture()),w=roundtrip.options.wallets[0],t=roundtrip.options.markets[0].domain_token,p=address(3);
  roundtrip.transactions[2].block='0x30';roundtrip.transactions.push({at,hash:'0x'+'9'.repeat(64),block:'0x20',blockHash:'0x'+'8'.repeat(64),logs:[transfer(t,w,p,10000000),transfer(USDC,p,w,12000000),transfer(t,p,w,10000000),transfer(USDC,w,p,12000000)]});
  await assert.rejects(()=>reconstruct(roundtrip.options),/ACCOUNTING_NET_ZERO_DOMAIN_FLOW_REVIEW_REQUIRED/);
 }
 // Unequal out-and-back legs cannot be netted into one linked transfer: that
 // would reorder remaining lots. Reject the generic fallback in both periods.
 for(const at of [25,35]){
  const turns=scoped(fixture()),w=turns.options.wallets[0],other=address(8),t=turns.options.markets[0].domain_token;
  turns.options.wallets.push(other);turns.transactions[2].block='0x30';
  turns.transactions.push({at,hash:'0x'+'9'.repeat(64),block:'0x20',blockHash:'0x'+'8'.repeat(64),logs:[transfer(t,w,other,5000000),transfer(t,other,w,2000000)]});
  // Fixture balances belong only to the first wallet.
  const originalBalance=turns.source.balance;turns.source.balance=async(wallet,token,block)=>wallet===other?0n:originalBalance(wallet,token,block);
  await assert.rejects(()=>reconstruct(turns.options),/ACCOUNTING_COMPLEX_TRANSFER_REQUIRED/);
 }
 const quoteRoundtrip=scoped(fixture()),qw=quoteRoundtrip.options.wallets[0],external=address(9);
 quoteRoundtrip.transactions[2].block='0x30';quoteRoundtrip.transactions.push({at:35,hash:'0x'+'9'.repeat(64),block:'0x20',blockHash:'0x'+'8'.repeat(64),logs:[transfer(USDC,qw,external,10000000),transfer(USDC,external,qw,10000000)]});
 await assert.rejects(()=>reconstruct(quoteRoundtrip.options),/ACCOUNTING_NET_ZERO_ASSET_FLOW_REVIEW_REQUIRED/);
 // Opposite linked-wallet balances do not prove a direct transfer. External
 // legs must never inherit another wallet's FIFO basis by coincidence.
 for(const at of [25,35]){
  const indirect=scoped(fixture()),w=indirect.options.wallets[0],other=address(8),t=indirect.options.markets[0].domain_token;
  indirect.options.wallets.push(other);indirect.transactions[2].block='0x30';
  indirect.transactions.push({at,hash:'0x'+'9'.repeat(64),block:'0x20',blockHash:'0x'+'8'.repeat(64),logs:[transfer(t,w,external,5000000),transfer(t,external,other,5000000)]});
  const originalBalance=indirect.source.balance;indirect.source.balance=async(wallet,token,block)=>wallet===other?0n:originalBalance(wallet,token,block);
  await assert.rejects(()=>reconstruct(indirect.options),/EXTERNAL_DOMAIN_COST_BASIS_REQUIRED/);
 }
 // A self-transfer is not a disposal and must not manufacture a pending basis.
 const self=scoped(fixture()),sw=self.options.wallets[0],st=self.options.markets[0].domain_token;
 self.transactions[2].logs.push(transfer(st,sw,sw,1));
 assert.equal((await reconstruct(self.options)).events.find(e=>e.economicId==='sale').usd,'12.000000');
 const future=scoped(fixture());future.options.from=future.options.through+1;
 await assert.rejects(()=>reconstruct(future.options),/ACCOUNTING_PERIOD_NOT_REACHED/);assert.equal(future.calls.length,0);
 const futureFraction=scoped(fixture());futureFraction.options.periodStart=exact.options.periodStart;futureFraction.options.through=futureFraction.options.from;
 await assert.rejects(()=>reconstruct(futureFraction.options),/ACCOUNTING_PERIOD_NOT_REACHED/);assert.equal(futureFraction.calls.length,0);
 // No trades is verified from the full period, not inferred from an empty
 // eligible list. A pure quote balance can have zero realized gain.
 const empty=untouchedFixture();empty.options.eligible=[];empty.source.transfers=async()=>[];empty.source.swaps=async()=>[];
 empty.source.balance=async(w,t)=>w===empty.active&&t===USDC?100000000n:0n;
 const zero=await reconstruct(empty.options);assert.equal(zero.events.length,0);assert.equal(zero.openingLots.length,1);assert.equal(zero.openingLots[0].valueUsd,'100.000000');
 // Trace I/O is bounded at three concurrent calls; chronological FIFO output
 // is identical even when calls resolve in a different order.
 const parallel=scoped(nativeLedgerFixture()),nativeRead=parallel.source.nativeTransaction;let active=0,peak=0,started=0;
 parallel.source.nativeTransaction=async(...args)=>{active++;peak=Math.max(peak,active);const n=started++;try{await new Promise(r=>setTimeout(r,n%2?1:8));return await nativeRead(...args);}finally{active--;}};
 const parallelLedger=await reconstruct(parallel.options);assert.ok(peak>1&&peak<=3);assert.equal(active,0);assert.deepEqual(parallelLedger.events,c.native.ledger.events);assert.deepEqual(parallelLedger.openingLots,c.native.ledger.openingLots);
 const cancelled=scoped(nativeLedgerFixture());let pending=0,completed=0,launched=0;
 cancelled.source.nativeTransaction=async()=>{pending++;const n=launched++;try{await new Promise(r=>setTimeout(r,n===0?1:12));if(n===0)throw Error('ACCOUNTING_TIME_BUDGET_EXCEEDED');return {moves:[],fee:0n,payer:null};}finally{pending--;completed++;}};
 await assert.rejects(()=>reconstruct(cancelled.options),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);assert.equal(pending,0);assert.equal(completed,launched);assert.ok(launched<=3,'failure prevents new trace jobs');
 console.log('PASS scoped accounting: exact entry capital, consumed opening FIFO and fees, untouched unknown basis, separate linked-wallet holdings, period-only native/transfer reads, zero-trade evidence and exact enrollment precision.');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={cases,scoped,untouchedFixture};
