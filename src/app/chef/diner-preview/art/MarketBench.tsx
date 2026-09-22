"use client";
import { useState } from 'react';
import { createDiner, dispatchDiner, shopOffers, type DinerCommand } from '@/lib/chef/diner/progression';
import { RoadsideMarket } from '../RecipeLearning';

const time=1_800_000_000_000;
function marketFixture(visit:1|2){
  const started=dispatchDiner(createDiner(time,'market-art-bench'),{type:'startRun'},{now:time}).state;
  const run=started.run!,markets=run.map.filter(node=>node.kind==='shop');
  run.visited=markets.slice(0,visit-1).map(node=>node.id);
  run.position=markets[visit-1].id;run.available=[];run.haul=1000;
  run.offers=shopOffers(started);
  return started;
}

/** Isolated stock/purchase fixture. The parent page is development-only. */
export function MarketBench(){
  const [state,setState]=useState(()=>marketFixture(1)),[notice,setNotice]=useState('');
  const reset=(visit:1|2)=>{setState(marketFixture(visit));setNotice('');};
  const send=(command:DinerCommand)=>{const result=dispatchDiner(state,command,{now:time});if(result.error){setNotice(result.error);return false;}setState(result.state);setNotice('Saved in this test market only.');return true;};
  const button={minHeight:44,border:'1px solid #c5b695',borderRadius:12,padding:'8px 14px',background:'#fff4d5',color:'#365e4c',cursor:'pointer'};
  return <section aria-label="Roadside discovery preview" style={{margin:'24px 0',padding:18,borderRadius:24,background:'#fff8e9'}}>
    <h2>Find something for your next trip</h2>
    <p>Test stock only. Purchases here never change your restaurant.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button style={button} onClick={()=>reset(1)}>Preview first market</button><button style={button} onClick={()=>reset(2)}>Preview second market</button></div>
    <RoadsideMarket state={state} send={send}/>
    <p role="status">{notice}</p>
  </section>;
}
