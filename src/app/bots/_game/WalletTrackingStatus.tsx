'use client';
import { useEffect, useState } from 'react';

type Activity={link:{status:'pending'|'not_found'|'linked';mcpWallet:string|null;checkedAt:string|null}|null;wallets:string[];recentObservedTrades:{id:string;txHash:string;executedAt:string}[]};
const short=(s:string)=>`${s.slice(0,6)}…${s.slice(-4)}`;
export default function WalletTrackingStatus({connected}:{connected:boolean}){
 const [data,setData]=useState<Activity|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  setData(null);setError('');if(!connected)return;
  let stopped=false;const controller=new AbortController();
  const refresh=async()=>{try{
   const session=JSON.parse(sessionStorage.getItem('mk8.wallet-session.v1')||'null');
   if(!session?.token)throw Error('Sign in to check your linked trading wallets.');
   const r=await fetch('/api/bots/tracking/activity',{headers:{Authorization:`Bearer ${session.token}`},cache:'no-store',signal:controller.signal}),v=await r.json();
   if(!r.ok||!v.ok)throw Error(v.error||'Wallet tracking could not load.');
   if(!stopped){setData(v);setError('')}
  }catch(e){if(!stopped){setData(null);setError((e as Error).message)}}};
  void refresh();const timer=setInterval(()=>{if(!document.hidden)void refresh()},60000);
  return()=>{stopped=true;controller.abort();clearInterval(timer)};
 },[connected,retry]);
 if(!connected)return null;
 const linked=data?.link?.status==='linked',conflict=linked&&!data?.wallets.includes(data.link!.mcpWallet!);
 return <div aria-label="Linked trading wallets" aria-live="polite">
  <p><strong>{error?'Wallet tracking unavailable':!data?'Checking linked wallets…':conflict?'Wallet link needs review':linked?'MCP wallet linked':'MCP wallet lookup pending'}</strong></p>
  {error?<><small>{error}</small><button onClick={()=>setRetry(n=>n+1)}>Retry wallet check</button></>:data&&<>
   <small>{conflict?'This address overlaps another game account. It is withheld from tracking until reviewed.':linked?`Monitoring ${data.wallets.map(short).join(' and ')} for Gochujang activity.`:data.link?.status==='not_found'?'No MCP wallet found on the last check. Lookups repeat every four hours.':'Your Doma account is queued for the next four-hour wallet lookup.'}</small>
   {data.link?.checkedAt&&<small>Last wallet lookup: {new Date(data.link.checkedAt).toLocaleString()}.</small>}
   <small>{data.recentObservedTrades.length?`${data.recentObservedTrades.length} recent trade records found.`:'No trade records available yet. This does not confirm zero trading activity.'} Wallet linking does not confirm competition entry or rewards.</small>
  </>}
 </div>;
}
