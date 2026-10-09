'use strict';
// Same historical four-fee/highest-liquidity methodology as the sequential
// source. Only the transport is batched; integer arithmetic and tie order stay.
const fees=[100,500,3000,10000];
const spec=(address,definition,functionName,args=[])=>({address,definition,functionName,args});
const get=(row,code)=>{if(!row?.success)throw Error(code);return row.value;};
async function historicalValueUsd({token,units,at,quote,factory,readMany}){
 if(token===quote)return units;
 const pools=await readMany(fees.map(fee=>spec(factory,'function getPool(address,address,uint24) view returns(address)','getPool',[token,quote,fee])),at);
 const nonzero=[];for(let i=0;i<pools.length;i++){const pool=get(pools[i],'HISTORICAL_PRICE_FACTORY_UNAVAILABLE');if(typeof pool!=='string'||!/^0x[0-9a-f]{40}$/i.test(pool))throw Error('HISTORICAL_PRICE_FACTORY_INVALID');if(!/^0x0{40}$/i.test(pool))nonzero.push({pool,fee:fees[i]});}
 if(!nonzero.length)throw Error('HISTORICAL_LIQUID_USDC_PRICE_UNAVAILABLE');
 const liquidity=nonzero.map(p=>spec(p.pool,'function liquidity() view returns(uint128)','liquidity'));
 let observations=await readMany(liquidity,at,{cacheOnly:true}),all;
 // Warm pre-existing caches already contain all liquidity observations and
 // the chosen pool's price: reuse those exact single-call identities.
 if(observations.some(v=>v===null)){
  all=await readMany(nonzero.flatMap(p=>[spec(p.pool,'function liquidity() view returns(uint128)','liquidity'),spec(p.pool,'function token0() view returns(address)','token0'),spec(p.pool,'function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)','slot0')]),at);
  observations=nonzero.map((_,i)=>all[i*3]);
 }
 let best=-1,bestLiquidity=0n;
 for(let i=0;i<nonzero.length;i++){const n=get(observations[i],'HISTORICAL_PRICE_LIQUIDITY_UNAVAILABLE');if(typeof n!=='bigint'||n<0n)throw Error('HISTORICAL_PRICE_LIQUIDITY_INVALID');if(n>bestLiquidity){best=i;bestLiquidity=n;}}
 if(best<0)throw Error('HISTORICAL_LIQUID_USDC_PRICE_UNAVAILABLE');
 const selected=all?[all[best*3+1],all[best*3+2]]:await readMany([spec(nonzero[best].pool,'function token0() view returns(address)','token0'),spec(nonzero[best].pool,'function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)','slot0')],at);
 const token0=get(selected[0],'HISTORICAL_PRICE_TOKEN0_UNAVAILABLE'),slot=get(selected[1],'HISTORICAL_PRICE_SLOT0_UNAVAILABLE');
 if(typeof token0!=='string'||!/^0x[0-9a-f]{40}$/i.test(token0)||!Array.isArray(slot)||typeof slot[0]!=='bigint')throw Error('HISTORICAL_PRICE_INVALID');
 const ratio=slot[0]*slot[0];if(!ratio)throw Error('HISTORICAL_PRICE_INVALID');
 return token0.toLowerCase()===token?units*ratio/(1n<<192n):units*(1n<<192n)/ratio;
}
module.exports={historicalValueUsd};
