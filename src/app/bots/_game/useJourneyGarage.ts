"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { freshWorkshop, type Fight8, type Workshop8 } from '@/lib/bots/workshop8/state';

export type GarageSummary={id:string;name:string;robots:{id:string;name:string}[];activeFight:string|null};
type Packet={serverNow?:number;ok:boolean;error?:string;state:Workshop8|null;garageId:string|null;garages:GarageSummary[];days:Record<string,number>;session:{kind:'guest'|'wallet';address?:string}|null};
const PENDING='mk8.journey.pending.1',ACTIVE='mk8.journey.active.1';
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
 callbacks.current={onState,onFinished};
 const headers=useCallback(()=>({...(token.current?{Authorization:`Bearer ${token.current}`}:{ }), 'Content-Type':'application/json'}),[]);
 const accept=useCallback((data:Packet)=>{
  if(!alive.current)return data;
  const before=latest.current;
  if(before?.garageId===data.garageId&&before?.state&&data.state&&data.state.revision<before.state.revision)return before;
  if(before?.state?.active&&!data.state?.active){const completed=data.state?.history.find(f=>f.id===before.state!.active!.id);if(completed)callbacks.current.onFinished(completed);}
  latest.current=data;setPacket(data);if(Number.isFinite(data.serverNow))setServerOffset(data.serverNow!-Date.now());callbacks.current.onState(data.state??freshWorkshop());setStatus(data.state?'saved':'browsing');setError('');
  if(data.garageId)try{sessionStorage.setItem(ACTIVE,data.garageId)}catch{}
  return data;
 },[]);
 const read=useCallback(async(garage?:string|null)=>{
  const id=garage===undefined?latest.current?.garageId:garage,epoch=++readEpoch.current;reading.current++;try{
  const response=await request(`/api/bots/workshop${id?`?garage=${encodeURIComponent(id)}`:''}`,{headers:headers(),cache:'no-store'}),data=await response.json();
  if(!response.ok||!data.ok)throw Error(data.error||'Your garage could not load.');return epoch===readEpoch.current?accept(data):latest.current??data;}finally{reading.current--}
 },[accept,headers]);
 const ensure=useCallback(async()=>{
  if(latest.current?.state)return latest.current;
  const response=await request('/api/bots/workshop/session',{method:'POST',headers:headers()}),data=await response.json();
  if(!response.ok||!data.ok||!data.enabled)throw Error(data.error||'Saving is unavailable. You can still watch and try unsaved practice.');
  if(token.current){const claim=await request('/api/bots/workshop/claim',{method:'POST',headers:headers()}),result=await claim.json();if(!claim.ok||!result.ok)throw Error(result.error||'Your new garage could not link.');}
  return read(null);
 },[headers,read]);
 const execute=useCallback(async(job:{requestId:string;action:unknown;garageId:string|null})=>{
  inFlight.current=true;readEpoch.current++;setStatus('saving');setError('');
  try{
   const current=await ensure();
   if(job.garageId&&job.garageId!==current.garageId)throw Error('Open the original garage before retrying this save.');
   job.garageId=current.garageId;failed.current=job;
   try{sessionStorage.setItem(PENDING,JSON.stringify(job))}catch{}
   const response=await request('/api/bots/workshop',{method:'POST',headers:headers(),body:JSON.stringify({...job,revision:current.state!.revision})}),data=await response.json();
   if(!response.ok||!data.ok){if(response.status>=400&&response.status<500&&response.status!==409){failed.current=null;try{sessionStorage.removeItem(PENDING)}catch{}}if(response.status===409)await read(current.garageId);throw Error(data.error||'Your change could not save. Retry to keep it.');}
   failed.current=null;try{sessionStorage.removeItem(PENDING)}catch{}
   return accept(data).state!;
  }catch(e){setStatus('error');setError((e as Error).message);throw e}finally{inFlight.current=false}
 },[accept,ensure,headers,read]);
 const mutate=useCallback((action:unknown,requestId=crypto.randomUUID())=>{
  const job={action,requestId,garageId:latest.current?.garageId??null};
  const next=tail.current.catch(()=>{}).then(()=>{if(failed.current)throw Error('Retry the unsaved change before making another.');return execute(job)});
  tail.current=next;return next;
 },[execute]);
 const retry=useCallback(async()=>{if(failed.current)return execute(failed.current);return read();},[execute,read]);
 const connect=useCallback(async(value:string)=>{const previous=token.current;token.current=value;try{return await read(null)}catch(e){token.current=previous;throw e}},[read]);
 const claim=useCallback(async(value:string)=>{
  const previous=token.current,garage=latest.current?.garageId;token.current=value;try{
  const response=await request('/api/bots/workshop/claim',{method:'POST',headers:headers()}),data=await response.json();if(!response.ok||!data.ok){const recovery=await request('/api/bots/workshop',{headers:headers(),cache:'no-store'}),saved=await recovery.json();if(recovery.ok&&garage&&saved.garages?.some((g:GarageSummary)=>g.id===garage))return accept(saved);throw Error(data.error||'Your garage could not link.');}return accept(data);}catch(e){token.current=previous;throw e}
 },[accept,headers]);
 const select=useCallback(async(id:string)=>{
  if(inFlight.current||failed.current)throw Error('Finish saving before switching garages.');
  inFlight.current=true;readEpoch.current++;setStatus('saving');
  try{const response=await request('/api/bots/workshop/select',{method:'POST',headers:headers(),body:JSON.stringify({garageId:id})}),data=await response.json();
   if(!response.ok||!data.ok)throw Error(data.error||'Your garage could not open.');return accept(data);
  }catch(e){setStatus('error');setError((e as Error).message);throw e}finally{inFlight.current=false}
 },[accept,headers]);
 useEffect(()=>{
  if(!enabled)return;alive.current=true;
  void(async()=>{try{
   const saved=JSON.parse(sessionStorage.getItem('mk8.wallet-session.v1')||'null');token.current=saved?.token??'';
   const response=await request('/api/bots/workshop/session',{cache:'no-store'}),data=await response.json();if(!response.ok||!data.enabled)throw Error(data.error||'Server saves are unavailable. You can still browse and watch fights.');
   const savedGarage=sessionStorage.getItem(ACTIVE);
   try{await read(savedGarage)}catch{await read(null)}
   const pending=JSON.parse(sessionStorage.getItem(PENDING)||'null');if(pending?.requestId&&pending?.action){failed.current=pending;setStatus('error');setError('Your last change needs a retry. It will not be charged twice.');}
  }catch(e){if(alive.current){setStatus('error');setError((e as Error).message);callbacks.current.onState(freshWorkshop())}}})();
  const refresh=()=>{if(document.hidden||reading.current>0||inFlight.current||failed.current)return;void read().catch(e=>{setStatus('error');setError((e as Error).message)})};
  let lastRefresh=0;const timer=setInterval(()=>{const t=Date.now();if(t-lastRefresh<(latest.current?.state?.active?2500:30000))return;lastRefresh=t;refresh()},2500);document.addEventListener('visibilitychange',refresh);
  return()=>{alive.current=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh)};
 },[enabled,read]);
 return {packet,status,error,serverOffset,mutate,retry,connect,claim,select,read,ensure,hasSave:!!packet?.state};
}
