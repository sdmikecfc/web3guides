'use strict';
const assert=require('node:assert/strict');
const {historicalValueUsd}=require('./lib/historical-price.cjs');
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),token=addr(9),quote=addr(1),factory=addr(2),pools=[addr(10),addr(11),addr(12),'0x'+'0'.repeat(40)],at='0x123';
function fixture(){
 const state={cache:new Map(),batches:[],poolCalls:0,failures:new Set(),missing:false,liquidity:[10n,20n,20n],token0:[token,quote,token],sqrt:[1n<<96n,2n<<96n,4n<<96n]};
 const key=s=>s.address+':'+s.functionName+':'+JSON.stringify(s.args);
 state.readMany=async(specs,block,{cacheOnly=false}={})=>{assert.equal(block,at);if(cacheOnly)return specs.map(s=>state.cache.get(key(s))||null);const missing=specs.filter(s=>!state.cache.has(key(s)));if(missing.length)state.batches.push(missing.length);return specs.map(s=>{const k=key(s);if(state.cache.has(k))return state.cache.get(k);let value;const i=pools.indexOf(s.address);if(s.functionName==='getPool'){state.poolCalls++;value=state.missing?'0x'+'0'.repeat(40):pools[[100,500,3000,10000].indexOf(s.args[2])];}else if(s.functionName==='liquidity')value=state.liquidity[i];else if(s.functionName==='token0')value=state.token0[i];else if(s.functionName==='slot0')value=[state.sqrt[i],0,0,0,0,0,true];else throw Error('Unexpected getter');const result=state.failures.has(s.functionName+':'+i)?{success:false}:{success:true,value};if(result.success)state.cache.set(k,result);return result;});};
 state.value=(units=4000000n)=>historicalValueUsd({token,units,at,quote,factory,readMany:state.readMany});return state;
}
(async()=>{
 let f=fixture();assert.equal(await f.value(),1000000n,'earlier fee wins equal-liquidity tie; token1 uses exact reciprocal');assert.deepEqual(f.batches,[4,9],'two bounded cold call stages');const previous=f.batches.length;assert.equal(await f.value(4n),1n);assert.equal(f.batches.length,previous,'different amounts reuse the same exact historical observations');
 f=fixture();f.liquidity=[30n,20n,10n];assert.equal(await f.value(),4000000n,'token0 uses exact squared ratio');
 f=fixture();f.sqrt[1]=3n<<96n;assert.equal(await f.value(10n),1n,'integer remainder floors exactly');
 f=fixture();f.missing=true;await assert.rejects(()=>f.value(),/HISTORICAL_LIQUID_USDC_PRICE_UNAVAILABLE/);
 f=fixture();f.liquidity=[0n,0n,0n];await assert.rejects(()=>f.value(),/HISTORICAL_LIQUID_USDC_PRICE_UNAVAILABLE/);
 for(const item of ['liquidity:0','token0:1','slot0:1']){f=fixture();f.failures.add(item);await assert.rejects(()=>f.value(),/HISTORICAL_PRICE_.*_UNAVAILABLE/);}
 f=fixture();f.failures.add('slot0:0');assert.equal(await f.value(),1000000n,'unused pool price failure cannot change the legacy selected pool');
 f=fixture();f.sqrt[1]=0n;await assert.rejects(()=>f.value(),/HISTORICAL_PRICE_INVALID/);
 f=fixture();assert.equal(await historicalValueUsd({token:quote,units:17n,at,quote,factory,readMany:()=>{throw Error('USDC never needs a price call')}}),17n);
 console.log('PASS historical price batching: same four fees, highest-liquidity pool and tie order, exact reciprocal/integer conversion, two bounded call stages, cached reuse, missing and invalid observations fail closed, unused-pool failure does not change selected price.');
})().catch(e=>{console.error(e);process.exitCode=1});
