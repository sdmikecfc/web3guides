"use client";
import {useState} from 'react';
import type {DinerState,DinerCommand} from '@/lib/chef/diner/progression';
import {DEFAULT_AUDIENCE,validAudience,type AudienceMix} from '@/lib/chef/diner/customer-traits';
import css from './diner.module.css';
const types=[{id:'local',name:'Neighbourhood locals',route:null,detail:'Your familiar neighbourhood crowd.'},{id:'party',name:'Party people',route:'festival',detail:'Pay 35% more. Sometimes leave a mess; each uncleared mess drains patience 10% faster. Servers clean up, or you can help.'},{id:'business',name:'Business crowd',route:'business_center',detail:'Walk 25% faster, eat 30% faster and have 20% less patience. Order among your three priciest dishes. A 22% base tip rate from the diner stage.'}] as const;
export function CustomersPanel({state,send}:{state:DinerState;send:(command:DinerCommand)=>boolean}){
  const [mix,setMix]=useState<AudienceMix>({...DEFAULT_AUDIENCE,...state.audience}),[saved,setSaved]=useState(false);
  const total=mix.local+mix.party+mix.business,available=types.filter(t=>!t.route||state.collections.routeWins.includes(t.route));
  return <section><p>Choose who visits your restaurant. Named regulars still make their own visits. New crowds start at 0% until you invite them.</p>
    {types.map(t=>{const unlocked=!t.route||state.collections.routeWins.includes(t.route);return <article className={css.card} key={t.id} style={{padding:16,marginBottom:12}}><label><strong>{t.name}</strong><p>{t.detail}</p><input style={{minHeight:44,width:90}} type="number" min="0" max="100" step="1" disabled={!unlocked} aria-label={`${t.name} percentage`} value={mix[t.id]} onChange={e=>{setSaved(false);setMix({...mix,[t.id]:Math.max(0,Math.min(100,Math.round(Number(e.target.value)||0)))});}}/> %</label>{!unlocked&&<p>Clear {t.route==='festival'?'Music Festival':'Business Center'} to invite these guests.</p>}</article>;})}
    <p role="status">{saved?'Customer mix saved. Arriving guests use your new mix.':`${total}% selected · ${100-total}% remaining`}</p>
    <div className={css.actions}><button className={css.button} onClick={()=>{const next={local:0,party:0,business:0},each=Math.floor(100/available.length);available.forEach((t,i)=>{next[t.id]=i===0?100-each*(available.length-1):each;});setMix(next);setSaved(false);}}>Even mix</button><button className={css.primary} disabled={!validAudience(mix,state.collections.routeWins)} onClick={()=>{if(send({type:'setAudience',mix}))setSaved(true);}}>Confirm customer mix</button></div>
  </section>;
}
