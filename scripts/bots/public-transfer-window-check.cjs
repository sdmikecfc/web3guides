'use strict';
const assert=require('node:assert/strict');
const {publicSource}=require('./lib/public-trade-source.cjs');
const wallet='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),token='0x'+'c'.repeat(40);
const from=Date.parse('2026-10-07T00:00:00Z'),through=from+6*3600000;
const at=hours=>new Date(from+hours*3600000).toISOString();
const hex=n=>'0x'+n.toString(16).padStart(64,'0');
const transfer=(id,hours)=>({block_hash:hex(id),block_number:id,transaction_hash:hex(id+100),log_index:0,timestamp:at(hours),from:{hash:wallet},to:{hash:other},token:{address_hash:token},total:{value:'10000000000000000001',decimals:'18'}});
const newest=transfer(9,9),head=transfer(8,8),a=transfer(5,5),b=transfer(3,3),old=transfer(1,-1);
const copy=x=>JSON.parse(JSON.stringify(x));
const page=(items,cursor=null)=>({items,next_page_params:cursor});
const full=()=>[page(copy([head,a]),{block_number:5,index:1}),page(copy([b,old]))];
const single=items=>[page(copy(items))];
function fixture(scans,{maxPages=1000}={}){
 let scan=-1,offset=0,calls=0;
 const source=publicSource({apiKey:'test-only',delay:0,maxPages,fetcher:async url=>{
  calls++;const u=new URL(url);assert.equal(u.searchParams.get('type'),'ERC-20');
  if(!u.searchParams.has('block_number')){scan++;offset=0;}
  const response=scans[scan]?.[offset++];assert.ok(response,'unexpected extra page');
  if(response instanceof Error)throw response;
  return new Response(JSON.stringify(response),{status:200});
 }});
 return {source,calls:()=>calls};
}
async function rejected(scans,code,options){const f=fixture(scans,options);await assert.rejects(()=>f.source.transfers(wallet,from,through),new RegExp(code));return f;}
async function main(){
 // A newer head can shift every page boundary. Both complete scans must still
 // return exactly the same ordered transfers inside the fixed window.
 const shifted=[page(copy([newest,head]),{block_number:8,index:1}),page(copy([a,b]),{block_number:3,index:2}),page(copy([old]))];
 const changing=fixture([full(),shifted]);assert.deepEqual(await changing.source.transfers(wallet,from,through),[a,b]);assert.equal(changing.calls(),5);
 const stable=fixture([full(),full()]);assert.deepEqual(await stable.source.transfers(wallet,from,through),[a,b]);assert.equal(stable.calls(),4);
 // Exact integer strings and address casing normalize; unrelated market/token
 // metadata does not establish historical transfer completeness.
 const canonical=copy([a,b]);canonical[0].total.decimals=18;canonical[0].block_number='5';canonical[0].log_index='0';canonical[0].from.hash='0x'+'A'.repeat(40);canonical[0].token.exchange_rate='99';canonical[0].to.name='new label';
 assert.equal((await fixture([single([a,b]),single(canonical)]).source.transfers(wallet,from,through)).length,2);
 const unknown=copy(a);unknown.total.decimals=null;
 const absent=copy(unknown);delete absent.total.decimals;
 assert.equal((await fixture([single([unknown]),single([absent])]).source.transfers(wallet,from,through)).length,1);
 // Inclusive boundaries and empty future-entry windows are intentional.
 const boundaries=[transfer(6,6),transfer(2,0)];assert.equal((await fixture([single(boundaries),single(boundaries)]).source.transfers(wallet,from,through)).length,2);
 const future=fixture([]);assert.deepEqual(await future.source.transfers(wallet,through+1,through),[]);assert.equal(future.calls(),0);
 await assert.rejects(()=>future.source.transfers(wallet,NaN,through),/INVALID_TRANSFER_WINDOW/);
 // Insertions, deletions, reordered equal-time events, changed units and reorgs
 // inside the window all discard the scan instead of hiding/deduplicating rows.
 await rejected([single([a,b]),single([a,transfer(4,4),b])],'TRANSFER_INDEX_CHANGED');
 await rejected([full(),single([a,old])],'TRANSFER_INDEX_CHANGED');
 for(const mutate of [r=>{r.total.value='10000000000000000002';},r=>{r.block_hash=hex(900);},r=>{r.to.hash=wallet;},r=>{r.log_index=1;},r=>{r.total.decimals='6';}]){const changed=copy(b);mutate(changed);await rejected([full(),single([a,changed,old])],'TRANSFER_INDEX_CHANGED');}
 const tied=transfer(4,5);await rejected([single([a,tied]),single([tied,a])],'TRANSFER_INDEX_CHANGED');
 await rejected([single([b,a]),full()],'PUBLIC_HISTORY_ORDER_CHANGED');
 await rejected([full(),single([b,a])],'PUBLIC_HISTORY_ORDER_CHANGED');
 await rejected([single([a,a,b]),full()],'TRANSFER_HISTORY_DUPLICATE');
 await rejected([full(),[page(copy([a]),{block_number:5,index:1}),page(copy([a,b,old]))]],'TRANSFER_HISTORY_DUPLICATE');
 const nonInteger=copy(a);nonInteger.total.value='1.5';await rejected([single([nonInteger]),full()],'TRANSFER_HISTORY_INVALID');
 // Bounds/cursor guards apply independently to both complete scans.
 const repeated=[page(copy([head]),{block_number:8,index:1}),page(copy([transfer(7,7)]),{index:1,block_number:8})];
 await rejected([repeated],'PUBLIC_HISTORY_CURSOR_REPEATED');
 await rejected([full(),[page(copy([head]),{block_number:8,unexpected:'bad'})]],'UNKNOWN_EXPLORER_CURSOR');
 await rejected([full(),[page(copy([head]),{block_number:8,index:1}),page(copy([a]),{block_number:5,index:2})]],'PUBLIC_HISTORY_PAGE_LIMIT',{maxPages:2});
 await rejected([full(),[Error('TEST_SOURCE_UNAVAILABLE')]],'TEST_SOURCE_UNAVAILABLE');
 // Cancelling the second scan leaves no orphan request and returns no first-
 // scan result. Use the existing source deadline rather than Promise.race.
 let calls=0,active=0,aborted=0;
 const cancellable=publicSource({apiKey:'test-only',delay:0,fetcher:async(_url,options)=>{
  if(++calls===1)return new Response(JSON.stringify(page(copy([a,b]))),{status:200});
  active++;return new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>{active--;aborted++;reject(new DOMException('aborted','AbortError'));},{once:true});});
 }});
 await assert.rejects(()=>cancellable.withDeadline(Date.now()+50,()=>cancellable.transfers(wallet,from,through)),/ACCOUNTING_TIME_BUDGET_EXCEEDED/);
 assert.equal(calls,2);assert.equal(active,0);assert.equal(aborted,1);
 console.log('PASS transfer coverage: two complete fixed-window scans, moving-head/page shifts, exact immutable comparisons, duplicates/corrections/reorg rejection, ordering/cursor/page bounds, future entrants and real cancellation.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
