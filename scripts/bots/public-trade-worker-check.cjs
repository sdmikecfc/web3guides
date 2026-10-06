'use strict';
const assert=require('node:assert/strict');
const {collect,scanPages,receiptFlows,USDC,TRANSFER,hash}=require('./lib/public-trade-worker.cjs');
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
 f=fixture({agent:false});r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.fills.length,0,'manual external trades do not earn prizes');
 const ref={id:'order:1:fill:1',revision:1,wallet,transactionHash:tx,domainToken:domain,quoteToken:USDC,domainUnits:'10000000',quoteUnits:'5000000',side:'buy',executedAt:at(-600),status:'verified'};
 f=fixture({agent:false,refs:[{participant:'123',ref}]});f.source.swaps=async()=>[];
 r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.fills.length,1);assert.equal(r.packet.fills[0].source,'strategy','missing wallet-axis Strategy index is recovered from private reference + receipt');
 f.snapshot.fills=r.packet.fills;f.snapshot.references[0].ref={...ref,revision:2,status:'revoked'};r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.fills[0].status,'revoked');assert.equal(r.packet.fills[0].revision,2);
 f.snapshot.accounts[0].coverage.complete=false;r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.complete,false);assert.equal(r.packet.fills.length,0,'failed private query cannot erase prior scores');
 f=fixture();f.snapshot.accounts[0].coverage.updated_at=at(-6*3600);r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.complete,false,'older than five hours is pending');
 f=fixture();f.source.block=async()=>({hash:'0x'+'a'.repeat(64),timestamp:f.row.date});r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.complete,false,'reorg detected');
 f=fixture();f.source.transfers=async()=>{throw Error('PUBLIC_HISTORY_PAGE_LIMIT')};r=await collect(f.snapshot,f.source,{now});assert.equal(r.packet.complete,false,'bounded work does not imply complete history');
 const rows=await scanPages(async p=>p.page?{items:[{timestamp:at(-400)}],next_page_params:null}:{items:[{timestamp:at(-200)}],next_page_params:{page:1}},{from:now-500000,through:now-100000});assert.equal(rows.length,2);
 await assert.rejects(()=>scanPages(async()=>({items:[{timestamp:at(-200)}],next_page_params:{page:1}}),{from:now-500000,through:now-100000}),/CURSOR_REPEATED/);
 console.log('PASS public collector: integer precision, receipt amounts, finalized blocks, keeper Strategy references, manual exclusion, common coverage cutoff, duplicate/ambiguous batches, corrections, failed-source preservation, stale data, reorgs and pagination.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
