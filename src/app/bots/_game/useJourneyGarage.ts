"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { freshWorkshop, type Fight8, type Workshop8 } from '@/lib/bots/workshop8/state';

export type GarageSummary={id:string;name:string;robots:{id:string;name:string}[];activeFight:string|null};
type Packet={serverNow?:number;ok:boolean;error?:string;state:Workshop8|null;garageId:string|null;garages:GarageSummary[];days:Record<string,number>;session:{kind:'guest'|'wallet';address?:string}|null};
const PENDING='mk8.journey.pending.1',ACTIVE='mk8.journey.active.1',SCOPE='mk8.journey.scope.1';
async function request(url:string,options:RequestInit={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{return await fetch(url,{...options,signal:controller.signal})}
 catch(error){if(controller.signal.aborted)throw Error('The connection took too long. Retry to check your save; it will not be charged twice.');throw error}
 finally{clearTimeout(timer)}
}
export default function useJourneyGarage(enabled:boolean,onState:(state:Workshop8)=>void,onFinished:(fight:Fight8)=>void){
 const [packet,setPacket]=useState<Packet|null>(null),[status,setStatus]=useState<'loading'|'saved'|'saving'|'error'|'browsing'>('loading'),[error,setError]=useState('');
 const latest=useRef<Packet|null>(null),callbacks=useRef({onState,onFinished}),token=useRef(''),alive=useRef(true),inFlight=useRef(false),tail=useRef<Promise<unknown>>(Promise.resolve());
 const [serverOffset,setServerOffset]=useState(0);
 const reading=useRef(0),readEpoch=useRef(0);
 const failed=useRef<{requestId:string;action:unknown;garageId:string|null}|null>(null);
 const sessionReady=useRef(false),bootstrapReady=useRef(false),bootstrap=useRef<Promise<void>|null>(null);
 const browserGarages=useRef<string[]>([]),walletToken=useRef('');
 const [guestGarageIds,setGuestGarageIds]=useState<string[]>([]),[hasWalletSession,setHasWalletSession]=useState(false);
 callbacks.current={onState,onFinished};
 const headers=useCallback(()=>({...(token.current?{Authorization:`Bearer ${token.current}`}:{ }), 'Content-Type':'application/json'}),[]);
 const accept=useCallback((data:Packet)=>{
  if(!alive.current)return data;
  const before=latest.current;
  if(before?.garageId===data.garageId&&before?.state&&data.state&&data.state.revision<before.state.revision)return before;
  if(before?.state?.active&&!data.state?.active){const completed=data.state?.history.find(f=>f.id===before.state!.active!.id);if(completed)callbacks.current.onFinished(completed);}
  latest.current=data;setPacket(data);if(Number.isFinite(data.serverNow))setServerOffset(data.serverNow!-Date.now());callbacks.current.onState(data.state??freshWorkshop());setStatus(failed.current?'error':data.state?'saved':'browsing');setError(failed.current?'Your last change needs a retry. It will not be charged twice.':'');
  if(data.garageId)try{sessionStorage.setItem(ACTIVE,data.garageId)}catch{}
  return data;
 },[]);
 const read=useCallback(async(garage?:string|null)=>{
  const id=garage===undefined?latest.current?.garageId:garage,epoch=++readEpoch.current,requestedWallet=!!token.current;reading.current++;try{
  const response=await request(`/api/bots/workshop${id?`?garage=${encodeURIComponent(id)}`:''}`,{headers:headers(),cache:'no-store'}),data=await response.json();
  if(!response.ok||!data.ok)throw Object.assign(Error(data.error||'Your garage could not load.'),{status:response.status});
  if(requestedWallet&&data.session?.kind!=='wallet')throw Object.assign(Error('Sign in again to open your wallet garage. Your saved robots are unchanged.'),{status:401});
  if(id&&!data.session)throw Object.assign(Error('Your saved garage needs a fresh sign-in. Reconnect before starting another build.'),{status:401});
  return epoch===readEpoch.current?accept(data):latest.current??data;}finally{reading.current--}
 },[accept,headers]);
 const initialize=useCallback(()=>{
  const work=(async()=>{
   sessionReady.current=false;bootstrapReady.current=false;
   const saved=JSON.parse(sessionStorage.getItem('mk8.wallet-session.v1')||'null');walletToken.current=saved?.token??'';setHasWalletSession(!!walletToken.current);token.current=sessionStorage.getItem(SCOPE)==='guest'?'':walletToken.current;
   const sessionCheck=(async()=>{const response=await request('/api/bots/workshop/session',{cache:'no-store'}),data=await response.json();if(!response.ok||!data.enabled)throw Error(data.error||'Server saves are unavailable. Try the free arcade while we reconnect.');browserGarages.current=Array.isArray(data.guestGarageIds)?data.guestGarageIds.filter((id:unknown):id is string=>typeof id==='string'):[];setGuestGarageIds(browserGarages.current);sessionReady.current=true;})();
   const restore=(async()=>{try{await read(sessionStorage.getItem(ACTIVE))}catch(e){if((e as {status?:number}).status!==404)throw e;await read(null)}})();
   // The session read only prepares a cookie; it never enrolls a guest. Existing
   // wallet/guest identity is resolved independently using the original credentials.
   const results=await Promise.allSettled([sessionCheck,restore]);
   const failure=results.find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failure)throw failure.reason;bootstrapReady.current=true;
   const pending=JSON.parse(sessionStorage.getItem(PENDING)||'null');if(pending?.requestId&&pending?.action){failed.current=pending;setStatus('error');setError('Your last change needs a retry. It will not be charged twice.');}
  })();
  bootstrap.current=work;return work;
 },[read]);
 const ensure=useCallback(async()=>{
  await bootstrap.current;
  if(!sessionReady.current||!latest.current)throw Error('Reconnect your saved garage before building. Your earlier progress has not changed.');
  const retryingWalletSave=!!latest.current.state&&failed.current?.garageId===latest.current.garageId&&!browserGarages.current.includes(latest.current.garageId??'');
  if(token.current&&browserGarages.current.length&&!retryingWalletSave)throw Error('Choose whether to save this browser’s garage to your wallet or keep it here. Open Wallet & garages to continue.');
  if(latest.current?.state)return latest.current;
  const response=await request('/api/bots/workshop/session',{method:'POST',headers:headers()}),data=await response.json();
  if(!response.ok||!data.ok||!data.enabled)throw Error(data.error||'Saving is unavailable. You can still watch and try unsaved practice.');
  if(token.current){const claim=await request('/api/bots/workshop/claim',{method:'POST',headers:headers()}),result=await claim.json();if(!claim.ok||!result.ok)throw Error(result.error||'Your new garage could not link.');}
  return read(null);
 },[headers,read]);
 const execute=useCallback(async(job:{requestId:string;action:unknown;garageId:string|null})=>{
  inFlight.current=true;readEpoch.current++;setStatus('saving');setError('');
  let refreshFight:string|undefined;
  try{
   const current=await ensure();
   if(job.garageId&&job.garageId!==current.garageId)throw Error('Open the original garage before retrying this save.');
   job.garageId=current.garageId;failed.current=job;
   try{sessionStorage.setItem(PENDING,JSON.stringify(job))}catch{}
   const response=await request('/api/bots/workshop',{method:'POST',headers:headers(),body:JSON.stringify({...job,revision:current.state!.revision})}),data=await response.json();
   if(!response.ok||!data.ok){if(response.status>=400&&response.status<500&&response.status!==409&&response.status!==408){failed.current=null;try{sessionStorage.removeItem(PENDING)}catch{}}if(response.status===409)await read(current.garageId);throw Object.assign(Error(data.error||'Your change could not save. Retry to keep it.'),{status:response.status});}
   failed.current=null;try{sessionStorage.removeItem(PENDING)}catch{}
   if((job.action as {kind?:string})?.kind==='special')refreshFight=data.state?.active?.id;
   return accept(data).state!;
  }catch(e){setStatus('error');setError((e as Error).message);throw e}finally{
   inFlight.current=false;
   // A Special can overlap and suppress the regular poll. Resume coverage now
   // instead of waiting another 2.5 seconds. This read cannot undo an ACKed save.
   if(refreshFight)setTimeout(()=>{
    if(!alive.current||document.hidden||inFlight.current||failed.current||reading.current>0||latest.current?.garageId!==job.garageId||latest.current?.state?.active?.id!==refreshFight)return;
    void read(job.garageId).catch(()=>{if(alive.current&&!inFlight.current&&!failed.current&&latest.current?.garageId===job.garageId&&latest.current?.state?.active?.id===refreshFight){setStatus('error');setError('Your Special was saved. Fight updates are delayed; retry to reconnect.');}});
   },0);
  }
 },[accept,ensure,headers,read]);
 const mutate=useCallback((action:unknown,requestId=crypto.randomUUID())=>{
  const job={action,requestId,garageId:latest.current?.garageId??null};
  const next=tail.current.catch(()=>{}).then(()=>{if(failed.current)throw Error('Retry the unsaved change before making another.');return execute(job)});
  tail.current=next;return next;
 },[execute]);
 const retry=useCallback(async()=>{try{if(!bootstrapReady.current)return await initialize();if(failed.current)return await execute(failed.current);return await read();}catch(e){setStatus('error');setError((e as Error).message);throw e}},[execute,read,initialize]);
 const connect=useCallback(async(value:string)=>{const previous=token.current;token.current=value;try{const data=await read(null);walletToken.current=value;setHasWalletSession(true);sessionStorage.removeItem(SCOPE);return data}catch(e){token.current=previous;throw e}},[read]);
 const claim=useCallback(async(value:string)=>{
  if(inFlight.current)throw Error('Finish saving before linking your garage.');
  const previous=token.current,expected=browserGarages.current.length?browserGarages.current:latest.current?.session?.kind==='guest'&&latest.current.garageId?[latest.current.garageId]:[];token.current=value;inFlight.current=true;readEpoch.current++;
  const pendingGarage=failed.current?.garageId,keepGarage=pendingGarage&&(expected.includes(pendingGarage)||latest.current?.garages.some(g=>g.id===pendingGarage))?pendingGarage:latest.current?.session?.kind==='guest'?latest.current.garageId:null;
  const query=keepGarage?`?garage=${encodeURIComponent(keepGarage)}`:'';
  try{
   let linked:Packet;
   try{const response=await request(`/api/bots/workshop/claim${query}`,{method:'POST',headers:headers()}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Your garage could not link.');linked=data;}
   catch(error){const recovery=await request(`/api/bots/workshop${query}`,{headers:headers(),cache:'no-store'}),saved=await recovery.json();if(!recovery.ok||!saved.ok||saved.session?.kind!=='wallet'||!expected.length||!expected.every(id=>saved.garages?.some((g:GarageSummary)=>g.id===id)))throw error;linked=saved;}
   walletToken.current=value;setHasWalletSession(true);browserGarages.current=[];setGuestGarageIds([]);sessionStorage.removeItem(SCOPE);return accept(linked);
  }catch(e){token.current=previous;throw e}finally{inFlight.current=false}
 },[accept,headers]);
 const claimBrowser=useCallback(async()=>{if(!walletToken.current)throw Error('Sign in to your wallet first.');return claim(walletToken.current)},[claim]);
 const keepBrowser=useCallback(async()=>{
  await bootstrap.current;
  if(inFlight.current)throw Error('Finish saving before switching garages.');
  if(!browserGarages.current.length)throw Error('This browser’s saved garage is no longer available. Refresh to check your wallet.');
  if(failed.current?.garageId&&!browserGarages.current.includes(failed.current.garageId))throw Error('Retry your pending wallet save before opening this browser’s garage.');
  const previous=token.current;token.current='';inFlight.current=true;
  try{const data=await read(browserGarages.current.includes(latest.current?.garageId??'')?latest.current!.garageId:browserGarages.current[0]);if(data.session?.kind!=='guest')throw Error('This browser’s saved garage could not open.');sessionStorage.setItem(SCOPE,'guest');return data;}catch(e){token.current=previous;throw e}finally{inFlight.current=false}
 },[read]);
 const select=useCallback(async(id:string)=>{
  if(inFlight.current||failed.current)throw Error('Finish saving before switching garages.');
  inFlight.current=true;readEpoch.current++;setStatus('saving');
  try{const response=await request('/api/bots/workshop/select',{method:'POST',headers:headers(),body:JSON.stringify({garageId:id})}),data=await response.json();
   if(!response.ok||!data.ok)throw Error(data.error||'Your garage could not open.');return accept(data);
  }catch(e){setStatus('error');setError((e as Error).message);throw e}finally{inFlight.current=false}
 },[accept,headers]);
 useEffect(()=>{
  if(!enabled)return;alive.current=true;
  void initialize().catch(e=>{if(alive.current){setStatus('error');setError((e as Error).message)}});
  const refresh=()=>{
   if(!sessionReady.current||!latest.current||document.hidden||reading.current>0||inFlight.current)return;
   const pending=failed.current?.action as {kind?:string;fightId?:string}|undefined;
   // An uncertain Special still needs its original request ID retried, but
   // reading that fight is safe and may confirm its authoritative settlement.
   if(failed.current&&(pending?.kind!=='special'||pending.fightId!==latest.current.state?.active?.id))return;
   void read().catch(e=>{setStatus('error');setError((e as Error).message)});
  };
  let lastRefresh=0;const timer=setInterval(()=>{const t=Date.now();if(t-lastRefresh<(latest.current?.state?.active?2500:30000))return;lastRefresh=t;refresh()},2500);document.addEventListener('visibilitychange',refresh);
  return()=>{alive.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh)};
 },[enabled,read,initialize]);
 return {packet,status,error,serverOffset,mutate,retry,connect,claim,claimBrowser,keepBrowser,select,read,ensure,hasSave:!!packet?.state,hasWalletSession,hasUnlinkedGuest:!!guestGarageIds.length&&packet?.session?.kind==='wallet'};
}
