'use strict';
const assert=require('node:assert/strict');
const {collect,scanPages,receiptFlows,USDC,WETH,TRANSFER,hash}=require('./lib/public-trade-worker.cjs');
const {lossless}=require('./lib/public-trade-source.cjs');
const addr=n=>'0x'+String(n).padStart(40,'0'),tx='0x'+'f'.repeat(64),bh='0x'+'e'.repeat(64),wallet=addr(1),domain=addr(2),pool=addr(3);
const now=Date.now(),at=n=>new Date(now+n*1000).toISOString();
const topic=w=>'0x'+w.slice(2).padStart(64,'0');
const log=(token,from,to,units)=>({address:token,topics:[TRANSFER,topic(from),topic(to)],data:'0x'+BigInt(units).toString(16).padStart(64,'0')});
function fixture({agent=true,refs=[]}={}){
 const snapshot={manifest:{campaign:{id:'model-kombat-zones-1',state:'active',starts_at:at(-86400),ends_at:at(27*86400)},participants:[{participant:'123',entered_at:at(-86400)}],markets:[{domain_token:domain,quote_token:USDC}]},accounts:[{participant:'123',coverage:{complete:true,coverage_from:at(-86400),confirmed_through:at(-180),updated_at:at(-60)}}],wallets:[{participant:'123',trade_wallet:wallet,agent}],references:refs,fills:[]};
 const row={txHash:tx,date:at(-600),buyerAddress:'eip155:97477:'+wallet,userAddress:'eip155:97477:'+wallet,originAddress:'eip155:97477:'+addr(9),contractType:'UNISWAP_V3_POOL',fractionalTokenAmount:'10000000',quoteTokenAmount:'-5000000',priceUsd:0.5,fractionalToken:{address:domain,chain:{networkId:'eip155:97477'},params:{decimals:6}},quoteToken:{symbol:'USDC.e',decimals:6}};
 const rc={status:'0x1',blockNumber:'0x100',blockHash:bh,logs:[log(domain,pool,wallet,10000000),log(USDC,wallet,pool,5000000)]};
 const source={finalized:async()=>({number:'0x200',timestamp:at(-120)}),indexStatus:async()=>true,swaps:async()=>[row],transfers:async()=>[{transaction_hash:tx,token:{address_hash:domain}}],receipt:async()=>rc,block:async()=>({hash:bh,timestamp:row.date})};
 return {snapshot,source,row,rc};
}
async function main(){
 assert.equal(lossless('{"amount":9007199254740993123,"price":0.3,"text":"12345"}').amount,'9007199254740993123');
 assert.equal(lossless('{"text":"\\\" 9999999999999999999","n":2}').n,2);
 let f=fixture(),r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.complete,true);assert.equal(r.report.counts.volumeUsd,'5.000000');assert.equal(r.packet.confirmedThrough,at(-180),'common private/public cutoff');assert.equal(r.packet.financialComplete,false);
 const draft=fixture();draft.snapshot.manifest.campaign.state='draft';draft.snapshot.accounts[0].reference_since=at(-86400);const dr=await collect(draft.snapshot,draft.source,{now});assert.equal(dr.packet.complete,true);assert.equal(dr.packet.coverageFrom,at(-86400),'draft rehearsal respects installed registration coverage rather than demanding unrequested older references');
 const fill=r.packet.fills[0];f.snapshot.fills=[Object.fromEntries(Object.entries(fill).reverse())];r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.fills[0].revision,1,'JSONB key ordering must not create corrections');
 assert.equal(receiptFlows(f.rc,wallet).get(USDC),-5000000n);
 f.rc.logs[1]=log(USDC,wallet,pool,6000000);r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.complete,false);assert.equal(r.packet.fills.length,0,'mismatched index amount cannot score');
 f=fixture();f.rc.status='0x0';r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.complete,false);assert.equal(r.packet.fills.length,0);
 f=fixture();f.source.swaps=async()=>[f.row,f.row];r=await collect(f.snapshot,f.source,{now});assert.ok(r.report.problems.some(p=>p.code==='AMBIGUOUS_ECONOMIC_FILL'));
 f=fixture();f.source.swaps=async()=>[];r=await collect(f.snapshot,f.source,{now});assert.ok(r.report.problems.some(p=>p.code==='AGENT_SWAP_MISSING_FROM_PUBLIC_INDEX'));
 f=fixture({agent:false});f.source.transfers=async()=>{throw Error('UNNEEDED_MANUAL_TRANSFER_SCAN')};f.source.swaps=async()=>{throw Error('UNNEEDED_MANUAL_SWAP_SCAN')};r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.fills.length,0,'manual external trades do not earn prizes');assert.equal(r.packet.complete,true,'no-reference manual history is irrelevant once private coverage is complete');
 const ref={id:'order:1:fill:1',revision:1,wallet,transactionHash:tx,domainToken:domain,quoteToken:USDC,domainUnits:'10000000',quoteUnits:'5000000',side:'buy',executedAt:at(-600),status:'verified'};
 f=fixture({agent:false,refs:[{participant:'123',ref}]});f.source.transfers=async()=>{throw Error('UNNEEDED_MANUAL_TRANSFER_SCAN')};f.source.swaps=async()=>[];
 r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.fills.length,1);assert.equal(r.packet.fills[0].source,'strategy','missing wallet-axis Strategy index is recovered from private reference + receipt');
 const extraLeg=fixture({agent:false,refs:[{participant:'123',ref}]});extraLeg.source.transfers=async()=>{throw Error('UNNEEDED_MANUAL_TRANSFER_SCAN')};
 extraLeg.source.swaps=async()=>[extraLeg.row,{...extraLeg.row,fractionalTokenAmount:'10000001'}];
 const ambiguous=await collect(extraLeg.snapshot,extraLeg.source,{now});assert.equal(ambiguous.packet.complete,false);assert.equal(ambiguous.packet.fills.length,0,'all public legs of referenced transaction remain subject to ambiguity checks');
 f.snapshot.fills=r.packet.fills;f.snapshot.references[0].ref={...ref,revision:2,status:'revoked'};r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.fills[0].status,'revoked');assert.equal(r.packet.fills[0].revision,2);
 f.snapshot.accounts[0].coverage.complete=false;await assert.rejects(()=>collect(f.snapshot,f.source,{now}),/PRIVATE_COVERAGE_PENDING/,'failed private query cannot advance coverage or erase prior scores');
 f=fixture();f.snapshot.accounts[0].coverage.updated_at=at(-6*3600);f.snapshot.accounts[0].coverage.confirmed_through=at(-6*3600);f.row.date=at(-7*3600);r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.complete,true,'late heartbeat does not revoke completed historical coverage');assert.equal(r.packet.confirmedThrough,at(-6*3600));assert.equal(r.packet.fills.length,1);assert.ok(r.report.warnings.some(w=>w.includes('delayed')));
 f=fixture();const beyond={...f.row,date:at(-100)},originalSwaps=f.source.swaps;f.source.swaps=async()=>[...(await originalSwaps()),beyond];f.snapshot.accounts[0].coverage.updated_at=at(-6*3600);r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.fills.length,1,'late heartbeat never admits activity after proved private cutoff');assert.equal(r.packet.confirmedThrough,at(-180));
 for(const change of [
  f=>f.snapshot.accounts[0].coverage.complete=false,
  f=>f.snapshot.accounts[0].coverage.confirmed_through=at(1),
  f=>f.snapshot.accounts[0].coverage.coverage_from=at(-500),
  f=>{f.snapshot.manifest.campaign.confirmed_through=at(-150);},
  f=>{f.snapshot.accounts=[];f.snapshot.wallets=[];},
 ]){f=fixture();change(f);let reads=0;f.source.indexStatus=async()=>{reads++;return true};f.source.swaps=async()=>{reads++;return []};f.source.transfers=async()=>{reads++;return []};await assert.rejects(()=>collect(f.snapshot,f.source,{now}),/PRIVATE_COVERAGE_PENDING/);assert.equal(reads,0,'no usable private window exits before costly public history scans');}
 f=fixture();f.source.block=async()=>({hash:'0x'+'a'.repeat(64),timestamp:f.row.date});r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.complete,false,'reorg detected');
 f=fixture();f.source.transfers=async()=>{throw Error('PUBLIC_HISTORY_PAGE_LIMIT')};r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.complete,false,'bounded work does not imply complete history');
 // Two actual collection paths: a rejected smart-wallet trade must not block
 // another participant's verified fill, correction or source cutoff.
 const multi=fixture(),other=addr(4),otherTx='0x'+'b'.repeat(64);
 multi.snapshot.manifest.participants.push({participant:'456',entered_at:at(-86400)});
 multi.snapshot.accounts.push({participant:'456',coverage:{...multi.snapshot.accounts[0].coverage}});
 multi.snapshot.wallets.push({participant:'456',trade_wallet:other,agent:true});
 const otherRow={...multi.row,txHash:otherTx,userAddress:'eip155:97477:'+other,buyerAddress:'eip155:97477:'+other};
 multi.source.swaps=async w=>[w===wallet?multi.row:otherRow];
 multi.source.transfers=async w=>[{transaction_hash:w===wallet?tx:otherTx,token:{address_hash:domain}}];
 multi.source.receipt=async id=>id===tx?multi.rc:{...multi.rc,logs:[log(domain,pool,other,10000000),log(USDC,other,pool,5000000)]};
 let both=await collect(multi.snapshot,multi.source,{now});assert.equal(both.packet.complete,true);assert.equal(both.packet.fills.length,2);
 multi.snapshot.fills=both.packet.fills;
 multi.source.smartWalletSettlement=async rows=>{if(rows[0].wallet===other)throw Error('SMART_ROUTER_CALLDATA_INVALID');return null;};
 let isolated=await collect(multi.snapshot,multi.source,{now});
 assert.equal(isolated.packet.complete,false);assert.equal(isolated.accountCoverage.find(a=>a.participant==='123').complete,true);
 assert.equal(isolated.accountCoverage.find(a=>a.participant==='456').complete,false);assert.equal(isolated.packet.fills.length,1);
 assert.equal(isolated.packet.fills[0].wallet,wallet);assert.equal(isolated.packet.fills[0].status,'verified');
 multi.source.swaps=async w=>w===wallet?[]:[otherRow];multi.source.transfers=async w=>w===wallet?[]:[{transaction_hash:otherTx,token:{address_hash:domain}}];
 isolated=await collect(multi.snapshot,multi.source,{now});
 assert.equal(isolated.packet.fills.length,1);assert.equal(isolated.packet.fills[0].wallet,wallet);assert.equal(isolated.packet.fills[0].status,'revoked','healthy-account correction proceeds despite another account failure');
 assert.ok(!isolated.packet.fills.some(f=>f.wallet===other),'failed account retains prior stored fills without silent revocation');
 multi.snapshot.accounts[1].coverage.complete=false;multi.source.smartWalletSettlement=async()=>null;
 const seenWallets=[];multi.source.swaps=async w=>{seenWallets.push(w);return w===wallet?[]:[otherRow]};
 isolated=await collect(multi.snapshot,multi.source,{now});
 assert.equal(isolated.packet.confirmedThrough,at(-180));assert.equal(isolated.accountCoverage.find(a=>a.participant==='123').complete,true,'failed private coverage cannot push healthy accounts beyond their verified cutoff');assert.deepEqual(seenWallets,[wallet],'known incomplete private owner does not slow healthy account by scanning its history');
 multi.snapshot.accounts[1].coverage.complete=true;
 multi.snapshot.manifest.campaign.confirmed_through=at(-360);
 multi.snapshot.accounts[1].coverage.confirmed_through=at(-720);
 isolated=await collect(multi.snapshot,multi.source,{now});assert.equal(isolated.packet.confirmedThrough,at(-180));assert.equal(isolated.accountCoverage.find(a=>a.participant==='123').complete,true,'backlogged participant cannot move the shared cutoff backwards');
 multi.snapshot.accounts[1].coverage.confirmed_through=at(-90000);
 isolated=await collect(multi.snapshot,multi.source,{now});assert.equal(isolated.accountCoverage.find(a=>a.participant==='123').complete,true,'pre-campaign private history cannot abort the healthy account scan');
 multi.snapshot.accounts[1].coverage.confirmed_through=at(-180);multi.snapshot.accounts[1].coverage.coverage_from=at(-500);
 isolated=await collect(multi.snapshot,multi.source,{now});assert.equal(isolated.accountCoverage.find(a=>a.participant==='123').complete,true);assert.equal(isolated.accountCoverage.find(a=>a.participant==='456').complete,false);
 multi.source.indexStatus=async()=>false;isolated=await collect(multi.snapshot,multi.source,{now});assert.ok(isolated.accountCoverage.every(a=>!a.complete),'shared index outage is not participant-local');
 multi.source.indexStatus=async()=>true;multi.snapshot.manifest.participants.push({participant:'789',entered_at:at(-86400)});
 isolated=await collect(multi.snapshot,multi.source,{now});assert.deepEqual(isolated.accountCoverage.find(a=>a.participant==='789').problems,['ACCOUNT_LINK_PENDING']);
 console.log('PASS participant isolation: rejected trades and incomplete private coverage affect only their owner; delayed heartbeats preserve verified historical windows; healthy corrections proceed; shared source failures and unlinked entries stay pending.');
 // An absent registry identity is participant-local pending, never a silent
 // zero or an excuse to revoke the owner's previously verified fills.
 const registry=fixture(),missingDomain=addr(8);
 registry.snapshot.manifest.participants.push({participant:'456',entered_at:at(-86400)});
 registry.snapshot.accounts.push({participant:'456',coverage:{...registry.snapshot.accounts[0].coverage}});
 registry.snapshot.wallets.push({participant:'456',trade_wallet:other,agent:true});
 registry.snapshot.manifest.markets.push({domain_token:missingDomain,quote_token:USDC});
 const missingRow={...registry.row,txHash:otherTx,userAddress:'eip155:97477:'+other,buyerAddress:'eip155:97477:'+other,fractionalToken:{...registry.row.fractionalToken,address:missingDomain}};
 registry.source.swaps=async w=>[w===wallet?registry.row:missingRow];
 registry.source.transfers=async w=>[{transaction_hash:w===wallet?tx:otherTx,token:{address_hash:w===wallet?domain:missingDomain}}];
 registry.source.receipt=async id=>id===tx?registry.rc:{...registry.rc,logs:[log(missingDomain,pool,other,10000000),log(USDC,other,pool,5000000)]};
 const registered=await collect(registry.snapshot,registry.source,{now});assert.equal(registered.packet.complete,true);assert.equal(registered.packet.fills.length,2);
 registry.snapshot.fills=registered.packet.fills;const missingPair=registry.snapshot.manifest.markets.pop();
 const absent=await collect(registry.snapshot,registry.source,{now});
 assert.deepEqual(absent.report.problems,[{code:'MARKET_REGISTRY_MISSING',participant:'456',transactionHash:otherTx,domainToken:missingDomain,quoteTokens:[USDC]}]);
 assert.deepEqual(absent.diagnostics.marketRegistryMissing,absent.report.problems,'exact repair details persist only in private diagnostics');
 assert.equal(absent.packet.complete,false);assert.equal(absent.accountCoverage.find(a=>a.participant==='123').complete,true);
 assert.deepEqual(absent.accountCoverage.find(a=>a.participant==='456').problems,['MARKET_REGISTRY_MISSING']);
 assert.equal(absent.packet.fills.length,1);assert.equal(absent.packet.fills[0].wallet,wallet);assert.equal(absent.packet.fills[0].status,'verified');
 assert(!absent.packet.fills.some(f=>f.wallet===other),'missing-market owner keeps old fills without false revocation');
 registry.snapshot.manifest.markets.push(missingPair);const recovered=await collect(registry.snapshot,registry.source,{now});
 assert.equal(recovered.packet.complete,true);assert.deepEqual(recovered.packet.fills,registered.packet.fills,'reviewed additive registration recovers exact stable receipt proofs');
 const strategyMissing=fixture({agent:false,refs:[{participant:'123',ref}]});strategyMissing.snapshot.manifest.markets=[];
 strategyMissing.source.swaps=async()=>[];strategyMissing.source.transfers=async()=>{throw Error('MANUAL_TRANSFERS_MUST_NOT_SCAN')};
 const absentStrategy=await collect(strategyMissing.snapshot,strategyMissing.source,{now});assert.equal(absentStrategy.packet.complete,false);assert.equal(absentStrategy.packet.fills.length,0);
 assert.equal(absentStrategy.report.problems[0].code,'MARKET_REGISTRY_MISSING','receipt-only private Strategy reference cannot disappear because its pair is unregistered');
 const manualMissing=fixture({agent:false});manualMissing.snapshot.manifest.markets=[];manualMissing.source.swaps=async()=>{throw Error('MANUAL_SWAPS_MUST_NOT_SCAN')};
 assert.equal((await collect(manualMissing.snapshot,manualMissing.source,{now})).packet.complete,true,'unregistered manual activity remains excluded from eligibility');
 const mixedManual=fixture({agent:false,refs:[{participant:'123',ref}]});mixedManual.source.swaps=async()=>[mixedManual.row,{...missingRow,userAddress:'eip155:97477:'+wallet,buyerAddress:'eip155:97477:'+wallet}];
 assert.equal((await collect(mixedManual.snapshot,mixedManual.source,{now})).packet.complete,true,'unrelated manual transaction does not acquire Strategy intent from the wallet');
 const routedMissing=fixture();routedMissing.source.orderRouterSettlement=async rows=>({swap:rows[0]});
 const absentRoute=await collect(routedMissing.snapshot,routedMissing.source,{now});assert.equal(absentRoute.packet.complete,false);assert.equal(absentRoute.packet.fills.length,0);
 assert.deepEqual(absentRoute.report.problems[0],{code:'MARKET_REGISTRY_MISSING',participant:'123',transactionHash:tx,domainToken:domain,quoteTokens:[WETH]},'routed dual-market guard reports the exact missing quote without publishing a leg');
 console.log('PASS market registry gaps: eligible agent/Strategy trades stay pending only for their owner, private exact pair diagnostics, prior fills preserved, additive recovery, manual exclusion and routed dual-market enforcement.');
 // Candidate discovery is not a receipt proof. In particular, a quote-only
 // raw log result must not hide a missing indexed domain swap.
 function candidateFixture({indexed=false}={}){
  const value=fixture(),candidate={transactionHash:tx,blockNumber:value.rc.blockNumber,blockHash:bh,tokens:[USDC]};let receiptReads=0;
  value.source.tradeCandidates=async()=>[candidate];value.source.transfers=async()=>{throw Error('EAGER_TRANSFER_SCAN_FORBIDDEN')};
  value.source.swaps=async()=>indexed?[value.row]:[];
  value.source.receipt=async()=>{receiptReads++;return {...value.rc,transactionHash:tx};};
  return {...value,candidate,receiptReads:()=>receiptReads};
 }
 let discovered=candidateFixture(),discovery=await collect(discovered.snapshot,discovered.source,{now});
 assert.equal(discovery.packet.complete,false);assert.equal(discovery.packet.fills.length,0);assert.equal(discovered.receiptReads(),1);
 assert.equal(discovery.report.problems[0].code,'AGENT_SWAP_MISSING_FROM_PUBLIC_INDEX','quote-only discovery still reads the complete receipt and finds its hidden domain leg');
 discovered=candidateFixture({indexed:true});discovery=await collect(discovered.snapshot,discovered.source,{now});
 assert.equal(discovery.packet.complete,true);assert.equal(discovery.packet.fills.length,1);assert.equal(discovered.receiptReads(),1,'indexed settlement verifies once; discovery does not re-read that receipt');
 const previouslyVerified=discovery.packet.fills;
 discovered=candidateFixture();discovered.rc.logs=[log(USDC,pool,wallet,5000000)];discovery=await collect(discovered.snapshot,discovered.source,{now});
 assert.equal(discovery.packet.complete,true);assert.equal(discovery.packet.fills.length,0);assert.equal(discovered.receiptReads(),1,'an irrelevant quote transfer is receipt-proven, never scored as a fill');
 discovered=candidateFixture();discovered.candidate.tokens=[domain];discovered.rc.logs=[log(domain,pool,wallet,10000000)];discovery=await collect(discovered.snapshot,discovered.source,{now});
 assert.equal(discovery.packet.complete,true);assert.equal(discovery.packet.fills.length,0,'an incoming domain transfer without exchanged quote is not an invented trade');
 const discoveryFailures=[
  [f=>f.candidate.blockHash='0x'+'1'.repeat(64),'AGENT_CANDIDATE_RECEIPT_MISMATCH'],
  [f=>f.candidate.blockNumber='0xff','AGENT_CANDIDATE_RECEIPT_MISMATCH'],
  [f=>f.source.receipt=async()=>({...f.rc,transactionHash:otherTx}),'AGENT_CANDIDATE_RECEIPT_MISMATCH'],
  [f=>f.source.block=async()=>({hash:'0x'+'2'.repeat(64),timestamp:f.row.date}),'TRANSACTION_REORG'],
  [f=>f.source.block=async()=>({hash:bh,timestamp:at(-100)}),'AGENT_CANDIDATE_OUTSIDE_WINDOW'],
  [f=>f.source.block=async()=>({hash:bh,timestamp:at(-90000)}),'AGENT_CANDIDATE_OUTSIDE_WINDOW'],
  [f=>f.rc.blockNumber='0x201','TRANSACTION_NOT_FINALIZED'],
  [f=>f.rc.logs=[log(domain,pool,wallet,10000000)],'AGENT_CANDIDATE_RECEIPT_MISMATCH'],
  [f=>f.rc.status='0x0','TRANSACTION_NOT_SUCCESSFUL'],
  [f=>f.candidate.tokens=[null],'AGENT_CANDIDATE_INVALID'],
  [f=>f.source.receipt=async()=>{throw Error('PUBLIC_RPC_UNAVAILABLE')},'PUBLIC_RPC_UNAVAILABLE'],
 ];
 for(const [change,code] of discoveryFailures){discovered=candidateFixture();discovered.snapshot.fills=previouslyVerified;change(discovered);discovery=await collect(discovered.snapshot,discovered.source,{now});
  assert.equal(discovery.packet.complete,false,code);assert.equal(discovery.packet.fills.length,0,'unproven absence cannot revoke previous fills');assert.ok(discovery.report.problems.some(p=>p.code===code),code);
 }
 const legacyDiscovery=fixture();legacyDiscovery.source.swaps=async()=>[];legacyDiscovery.source.transfers=async()=>[{transaction_hash:tx,token:{address_hash:USDC}}];
 assert.ok((await collect(legacyDiscovery.snapshot,legacyDiscovery.source,{now})).report.problems.some(p=>p.code==='AGENT_SWAP_MISSING_FROM_PUBLIC_INDEX'),'legacy transfers fallback also scans quote-only candidates');
 const manualDiscovery=fixture({agent:false,refs:[{participant:'123',ref}]});manualDiscovery.source.tradeCandidates=async()=>{throw Error('MANUAL_DISCOVERY_FORBIDDEN')};
 assert.equal((await collect(manualDiscovery.snapshot,manualDiscovery.source,{now})).packet.complete,true);
 console.log('PASS trade candidate discovery: every unindexed transaction gets full receipt/canonical checks, quote-only omissions stay pending, irrelevant transfers never score, indexed receipts are not duplicated, 11 hostile failures retain prior results and legacy/manual paths stay compatible.');
 // Parallel wallets stay bounded, deterministic and isolated when the shared
 // source expires. A fixed-window index drift gets a fresh bounded attempt.
 const parallel=fixture();let inFlight=0,peak=0;
 parallel.snapshot.manifest.participants.push({participant:'456',entered_at:at(-86400)});
 parallel.snapshot.accounts.push({participant:'456',coverage:{...parallel.snapshot.accounts[0].coverage}});
 parallel.snapshot.wallets.push({participant:'456',trade_wallet:other,agent:true});
 parallel.source.transfers=async()=>[];
 parallel.source.swaps=async w=>{inFlight++;peak=Math.max(peak,inFlight);await new Promise(r=>setTimeout(r,w===wallet?20:2));inFlight--;return [w===wallet?parallel.row:otherRow];};
 parallel.source.receipt=multi.source.receipt;
 const serial=await collect(parallel.snapshot,parallel.source,{now,concurrency:1});
 const concurrent=await collect(parallel.snapshot,parallel.source,{now,concurrency:2});
 assert.equal(peak,2);assert.deepEqual(concurrent.packet.fills,serial.packet.fills);assert.deepEqual(concurrent.accountCoverage,serial.accountCoverage);
 let attempts=0;parallel.source.swaps=async w=>{if(w===other&&++attempts<3)throw Error('SWAP_INDEX_CHANGED');return [w===wallet?parallel.row:otherRow];};
 assert.equal((await collect(parallel.snapshot,parallel.source,{now})).packet.complete,true);assert.equal(attempts,3);
 parallel.snapshot.fills=concurrent.packet.fills;
 parallel.source.swaps=async w=>{if(w===other)throw Error('TRADE_SCAN_TIME_BUDGET_EXCEEDED');return [parallel.row];};
 const bounded=await collect(parallel.snapshot,parallel.source,{now});
 assert.equal(bounded.accountCoverage.find(x=>x.participant==='123').complete,true);assert.equal(bounded.accountCoverage.find(x=>x.participant==='456').complete,false);
 assert(!bounded.packet.fills.some(x=>x.wallet===other),'timed-out account cannot revoke prior results');
 const expired=await collect(parallel.snapshot,parallel.source,{now,deadline:Date.now()-1});
 assert(expired.accountCoverage.every(x=>!x.complete&&x.problems.includes('TRADE_SCAN_TIME_BUDGET_EXCEEDED')));assert.equal(expired.packet.fills.length,0);
 const orderSeen=[];parallel.source.swaps=async w=>{orderSeen.push(w);await new Promise(r=>setTimeout(r,20));return [w===wallet?parallel.row:otherRow];};
 const firstSlice=await collect(parallel.snapshot,parallel.source,{now,concurrency:1,deadline:Date.now()+10});
 assert.deepEqual(orderSeen,[wallet]);assert.equal(firstSlice.diagnostics.nextWalletOffset,1);
 orderSeen.length=0;await collect(parallel.snapshot,parallel.source,{now,concurrency:1,walletOffset:firstSlice.diagnostics.nextWalletOffset});assert.equal(orderSeen[0],other,'next slice starts after prior attempted wallet');
 assert.equal(inFlight,0);
 console.log('PASS concurrent collector: bounded parallelism, deterministic proofs, fixed-window retry and partial deadline results preserve failed accounts.');
 const rows=await scanPages(async p=>p.page?{items:[{timestamp:at(-400)}],next_page_params:null}:{items:[{timestamp:at(-200)}],next_page_params:{page:1}},{from:now-500000,through:now-100000});assert.equal(rows.length,2);
 await assert.rejects(()=>scanPages(async()=>({items:[{timestamp:at(-200)}],next_page_params:{page:1}}),{from:now-500000,through:now-100000}),/CURSOR_REPEATED/);
 console.log('PASS public collector: integer precision, receipt amounts, finalized blocks, keeper Strategy references, manual exclusion, common coverage cutoff, duplicate/ambiguous batches, corrections, failed-source preservation, stale data, reorgs and pagination.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
