"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDiner, dispatchDiner, sanitizeDinerSave, DINER_SAVE_KEY, dinerTickCommand, dinerPauseCommand, dinerCommandTicks, activeDinerMode, type DinerCommand, type DinerState } from '@/lib/chef/diner/progression';
import type { DinerSocialCommand } from '@/lib/chef/diner/social';
import { DinerSync, type SyncStatus, type DinerSession, type DinerSnapshot } from './diner-sync';

const SOCIAL_PENDING_KEY='diner_preview_social_pending_v1';

/** Guest checkpoints and canonical accounts never share an ownership source. */
export function useDiner(){
  const [state,setState]=useState<DinerState|null>(null),live=useRef<DinerState|null>(null);
  const [message,setMessage]=useState<{text:string;error:boolean}|null>(null),[syncStatus,setSyncStatus]=useState<SyncStatus>('guest'),[serverEnabled,setServerEnabled]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),dirty=useRef(false),sync=useRef<DinerSync|null>(null),guestWritable=useRef(true),externalBusy=useRef(false);
  const announce=useCallback((text:string,error=false)=>{setMessage({text,error});if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(null),error?6000:3600);},[]);
  const write=useCallback(()=>{if(!live.current||!dirty.current||sync.current?.session||!guestWritable.current)return;try{localStorage.setItem(DINER_SAVE_KEY,JSON.stringify(live.current));dirty.current=false;}catch{announce('Your browser could not save this diner. Keep this tab open.',true);}},[announce]);
  const replace=useCallback((next:DinerState)=>{live.current=next;setState(next);dirty.current=true;},[]);
  const send=useCallback((command:DinerCommand):boolean=>{
    if(!live.current||externalBusy.current)return false;
    if(sync.current?.session)return sync.current.send(command);
    const next=dispatchDiner(live.current,command,{now:Date.now(),online:document.visibilityState==='visible'});
    if(next.error){announce(next.error,true);return false;}replace(next.state);
    // Pointer samples remain ordered in memory; the regular checkpoint saves them.
    // Gesture start/end and completed parcel actions still persist immediately.
    if(!dinerCommandTicks(command)&&!(command.type==='homeTaskInput'&&command.action.type==='stroke'))write();return true;
  },[announce,replace,write]);
  const connect=useCallback(async()=>{
    write();if(!sync.current)sync.current=new DinerSync({state:replace,status:setSyncStatus,message:text=>announce(text,true)},localStorage);
    return sync.current.connect();
  },[write,replace,announce]);
  const read=useCallback(async(path:string,body?:unknown):Promise<unknown>=>{
    if(sync.current?.session)return sync.current.read(path,body);
    const response=await fetch(`/api/chef/diner/${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store'});
    const result=await response.json();if(!response.ok)throw new Error(result.error??'The diner service is unavailable.');return result;
  },[]);
  const acceptSession=useCallback(async(session:DinerSession)=>{
    const pending=JSON.parse(localStorage.getItem(SOCIAL_PENDING_KEY)||'null');
    if(pending&&pending.playerId!==session.playerId)throw new Error('Finish saving the current diner’s pending street action before switching accounts.');
    write();sync.current??=new DinerSync({state:replace,status:setSyncStatus,message:text=>announce(text,true)},localStorage);
    return sync.current.adoptSession(session);
  },[write,replace,announce]);
  const social=useCallback(async(command:DinerSocialCommand):Promise<unknown>=>{
    const client=sync.current;if(!client?.session||!client.canonical)throw new Error('Connect your diner first.');
    if(externalBusy.current)throw new Error('Your previous street action is still saving.');
    const pause=live.current?dinerPauseCommand(live.current):null;if(pause)client.send(pause);
    externalBusy.current=true;
    try{
      const deadline=Date.now()+8000;
      do{await client.flush();if(!client.busy&&!client.flight&&!client.queue.length)break;await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<deadline);
      if(client.busy||client.flight||client.queue.length)throw new Error('Finish saving your diner before a street action.');
      if(client.session.expiresAt*1000<Date.now()+30000){if(!await client.connect())throw new Error('Reconnect before retrying your saved street action.');}
      const raw=localStorage.getItem(SOCIAL_PENDING_KEY),pending=raw?JSON.parse(raw):null;
      const envelope=pending?.playerId===client.session.playerId?pending.envelope:{id:crypto.randomUUID(),revision:client.revision,command};
      const resumedDifferentCommand=pending?.playerId===client.session.playerId&&JSON.stringify(envelope.command)!==JSON.stringify(command);
      localStorage.setItem(SOCIAL_PENDING_KEY,JSON.stringify({playerId:client.session.playerId,envelope}));
      setSyncStatus('saving');
      const result=await client.read('social',envelope) as DinerSnapshot;
      if(!client.acceptSnapshot(result))throw new Error('This street action is saved; its diner snapshot will be refreshed on reconnect.');
      localStorage.removeItem(SOCIAL_PENDING_KEY);client.blocked=false;setSyncStatus('saved');
      if(resumedDifferentCommand)throw new Error('Your earlier street action finished saving. Review it, then choose this new action again.');
      return result;
    }catch(error){
      const failure=error as Error&{status?:number;data?:DinerSnapshot};
      if(failure.status&&failure.status<500&&failure.status!==401&&failure.status!==429){if(failure.data?.state&&!client.acceptSnapshot({...failure.data,ok:true})){client.blocked=true;setSyncStatus('offline');throw new Error('The diner changed elsewhere. Reconnect to load its saved version before continuing.');}localStorage.removeItem(SOCIAL_PENDING_KEY);client.blocked=false;setSyncStatus('saved');}
      else if(localStorage.getItem(SOCIAL_PENDING_KEY)){client.blocked=true;setSyncStatus('offline');}
      if(failure.status===401&&client.session)client.session.expiresAt=0;
      throw error;
    }finally{externalBusy.current=false;}
  },[]);
  useEffect(()=>{if(syncStatus!=='saved'||externalBusy.current)return;try{const pending=JSON.parse(localStorage.getItem(SOCIAL_PENDING_KEY)||'null');if(pending?.playerId===sync.current?.session?.playerId)void social(pending.envelope.command).catch(error=>announce(error instanceof Error?error.message:'The pending street action is still waiting.',true));}catch{}},[syncStatus,social,announce]);
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      void fetch('/api/chef/diner/status',{cache:'no-store'}).then(r=>r.json()).then(s=>{if(active)setServerEnabled(s.enabled===true);}).catch(()=>{});
      let hasSession=false;try{hasSession=DinerSync.hasSession(localStorage);}catch{}
      if(hasSession){
        sync.current=new DinerSync({state:replace,status:setSyncStatus,message:text=>announce(text,true)},localStorage);
        const restored=await sync.current.connect(true);if(restored||!active||sync.current.canonical)return;
        if(sync.current.session)announce('Your online diner is waiting for a connection. Retry from Settings.',true);
      }
      if(!active)return;
      const now=Date.now();let loaded=createDiner(now,crypto.randomUUID());
      try{const raw=localStorage.getItem(DINER_SAVE_KEY);if(raw){const candidate=sanitizeDinerSave(raw);
        if(candidate){const settled=dispatchDiner(candidate,{type:'settle'},{now});if(!settled.error)loaded=settled.state;}
        else {try{localStorage.setItem(`${DINER_SAVE_KEY}_recovery_${now}`,raw);}catch{guestWritable.current=false;}announce('The earlier checkpoint needs recovery. A backup has been preserved; this preview starts separately.',true);}
      }}catch{guestWritable.current=false;announce('Browser storage is unavailable. This session cannot be saved yet.',true);}
      replace(loaded);
    };
    void load();
    const tick=setInterval(()=>{if(live.current&&document.visibilityState==='visible'&&!sync.current?.blocked&&!externalBusy.current){const command=dinerTickCommand(live.current,1);if(command)send(command);}},50);
    const save=setInterval(()=>{if(sync.current?.session)sync.current.checkpoint();else write();},750);
    const settle=setInterval(()=>{if(document.visibilityState==='visible'&&live.current&&!activeDinerMode(live.current))send({type:'settle'});},15000);
    const hidden=()=>{
      if(live.current&&!sync.current?.session){const settled=dispatchDiner(live.current,{type:'settle'},{now:Date.now(),online:document.visibilityState!=='visible'});if(!settled.error)replace(settled.state);}
      if(document.visibilityState!=='visible'){const pause=live.current?dinerPauseCommand(live.current):null;if(pause)send(pause);if(sync.current?.session)sync.current.checkpoint();else write();}
    };
    const pageHide=()=>{hidden();write();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pageHide);
    return()=>{active=false;clearInterval(tick);clearInterval(save);clearInterval(settle);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pageHide);write();sync.current?.dispose();sync.current=null;if(timer.current)clearTimeout(timer.current);};
  },[announce,replace,send,write]);
  return {state,send,announce,message,replace,syncStatus,serverEnabled,connect,read,social,acceptSession};
}
