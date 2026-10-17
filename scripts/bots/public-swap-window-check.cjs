'use strict';
const assert=require('node:assert/strict'),{publicSource}=require('./lib/public-trade-source.cjs');
const wallet='0x'+'1'.repeat(40),base=Date.parse('2026-10-07T00:00:00Z'),from=base+50000,through=base+250000;
const hash=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const original=()=>Array.from({length:250},(_,i)=>({txHash:hash(250-i),date:new Date(base+(250-i)*1000).toISOString(),fractionalTokenAmount:'100',quoteTokenAmount:'10',priceUsd:'1',buyerAddress:wallet}));
function fixture(mode){
 let rows=original(),calls=0,starts=0;const routes=[];
 const source=publicSource({apiKey:'test-only',delay:0,maxPages:10,fetcher:async(url,options)=>{
  assert.equal(url,'https://api.doma.xyz/graphql');const q=JSON.parse(options.body).query,skip=Number(q.match(/skip:(\d+)/)[1]);calls++;if(skip===0)starts++;routes.push(skip);
  if(mode==='insert'&&calls===2)rows.unshift({txHash:hash(999),date:new Date(through+1000).toISOString(),fractionalTokenAmount:'1',quoteTokenAmount:'1'});
  if(mode==='correction'&&starts===2&&skip===0)rows[150]={...rows[150],quoteTokenAmount:'999'};
  if(mode==='delete'&&calls===2)rows.splice(150,1);
  let page=rows.slice(skip,skip+100);
  if(mode==='boundary-change'&&calls===2)page[0]={...page[0],quoteTokenAmount:'999'};
  if(mode==='omit-first-pass'&&starts===1&&skip>0)page=page.filter(r=>r.txHash!==hash(100));
  if(mode==='invalid-count')return new Response(JSON.stringify({data:{fractionalTokenSwaps:{totalCount:'250',items:page}}}));
  return new Response(JSON.stringify({data:{fractionalTokenSwaps:{totalCount:rows.length,items:page}}}));
 }});
 return {source,routes,get calls(){return calls;}};
}
async function main(){
 const steady=fixture('steady'),expected=await steady.source.swaps(wallet,from,through);assert.equal(expected.length,201);assert.equal(steady.routes.filter(skip=>skip===0).length,2,'two independent full windows');
 const moving=fixture('insert');assert.deepEqual(await moving.source.swaps(wallet,from,through),expected);assert.ok(moving.routes.includes(91),'live head insertion realigns offset by exact count delta');
 for(const mode of ['correction','delete','boundary-change','omit-first-pass'])await assert.rejects(()=>fixture(mode).source.swaps(wallet,from,through),/SWAP_INDEX_CHANGED|SWAP_HISTORY_INCOMPLETE/);
 await assert.rejects(()=>fixture('invalid-count').source.swaps(wallet,from,through),/SWAP_HISTORY_INCOMPLETE/);
 const none=fixture('steady');assert.deepEqual(await none.source.swaps(wallet,through+1,through),[]);assert.equal(none.calls,0);
 console.log('PASS fixed swap windows: active head inserts realign through overlapping pages, independent complete-window reads detect older corrections/deletions/omissions, malformed counts fail, and empty windows avoid I/O.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
