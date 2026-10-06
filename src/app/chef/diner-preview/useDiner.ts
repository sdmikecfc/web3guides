"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDiner, dispatchDiner, sanitizeDinerSave, DINER_SAVE_KEY, dinerTickCommand, dinerPauseCommand, dinerCommandTicks, activeDinerMode, type DinerCommand, type DinerState } from '@/lib/chef/diner/progression';
import type { DinerSocialCommand } from '@/lib/chef/diner/social';
import { DinerSync, type SyncStatus, type DinerSession, type DinerSnapshot } from './diner-sync';
import { useDinerAccess } from './DinerAccess';
import {gameplayRecorder} from './gameplay-recorder';
import {clearLocalDiagnostics} from './local-diagnostics';
import { betaStorageKeys } from './beta-access';
import { claimCollectionRestaurant } from '@/lib/chef/gacha/collection-client';
import type { DomainId } from '@/lib/chef/diner/domain-worlds';
import {attachJourneyRewards} from '@/lib/chef/diner/domain-journey-rewards';

const SOCIAL_PENDING_KEY='diner_preview_social_pending_v1';

/** Beta/guest browser checkpoints and canonical accounts never share storage. */
export function useDiner(){
  const access=useDinerAccess(),requiredWallet=access?.mode==='wallet'?access.wallet:undefined,localAllowed=access?.mode==='local'||access?.mode==='beta';
  const localSaveKey=access?.mode==='beta'?betaStorageKeys(access.wallet).save:DINER_SAVE_KEY;
  const accessRef=useRef(access);accessRef.current=access;
  const mounted=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const reauthenticate=access?.mode==='wallet'?access.reauthenticate:undefined;
  const socialPendingKey=requiredWallet?`${SOCIAL_PENDING_KEY}:${requiredWallet}`:SOCIAL_PENDING_KEY;
  const [state,setState]=useState<DinerState|null>(null),live=useRef<DinerState|null>(null);
  const [message,setMessage]=useState<{text:string;error:boolean}|null>(null),[syncStatus,setSyncStatus]=useState<SyncStatus>('guest'),[serverEnabled,setServerEnabled]=useState(false);
  const [localSaveError,setLocalSaveError]=useState<string|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),dirty=useRef(false),sync=useRef<DinerSync|null>(null),guestWritable=useRef(true),externalBusy=useRef(false);
  const announce=useCallback((text:string,error=false)=>{setMessage({text,error});if(timer.current)clearTimeout(timer.current);timer.current=null;if(!error||live.current)timer.current=setTimeout(()=>setMessage(null),error?6000:3600);},[]);
  const write=useCallback(()=>{if(!localAllowed||!live.current||!dirty.current||sync.current?.session||!guestWritable.current)return;try{localStorage.setItem(localSaveKey,JSON.stringify(live.current));dirty.current=false;setLocalSaveError(null);}catch{setLocalSaveError('Your browser could not save this diner. Keep this tab open and allow browser storage to save your progress.');}},[localAllowed,localSaveKey]);
  const replace=useCallback((next:DinerState)=>{if(!live.current){setMessage(null);if(timer.current)clearTimeout(timer.current);timer.current=null;}live.current=next;setState(next);dirty.current=true;},[]);
  const send=useCallback((command:DinerCommand):boolean=>{
    if(!live.current||externalBusy.current)return false;
    const recorded=live.current.run?.service??live.current.rally?.service;
    if(recorded&&(command.type==='service'||command.type==='rallyService'))gameplayRecorder.before(recorded,command.action);
    if(sync.current?.session)return sync.current.send(command);
    if(!localAllowed)return false;
    // Pack samples are private development fixtures. Public beta/local play never
    // supplies a ticket, so replaying an old previewPack command cannot grant one.
    const next=dispatchDiner(live.current,command,{now:Date.now(),online:document.visibilityState==='visible'});
    if(next.error){announce(next.error,true);return false;}replace(next.state);
    // Pointer samples remain ordered in memory; the regular checkpoint saves them.
    // Gesture start/end and completed parcel actions still persist immediately.
    if(!dinerCommandTicks(command)&&!(command.type==='homeTaskInput'&&command.action.type==='stroke'))write();return true;
  },[announce,replace,write,localAllowed]);
  const connect=useCallback(async()=>{
    if(!requiredWallet){announce('This diner is saved in this browser. Cloud accounts are separate from beta progress.');return false;}
    if(!sync.current)sync.current=new DinerSync({state:replace,status:setSyncStatus,message:text=>announce(text,true)},localStorage,fetch,requiredWallet);
    const client=sync.current,connected=await client.connect(!client.session);
    if(!client.stopped&&!connected&&client.needsSignature)reauthenticate?.();return connected;
  },[replace,announce,requiredWallet,reauthenticate]);
  const read=useCallback(async(path:string,body?:unknown):Promise<unknown>=>{
    if(sync.current?.session)return sync.current.read(path,body);
    throw new Error('Online friends and cloud saves are not available in this beta.');
  },[]);
  const signOut=useCallback(async()=>{
    const client=sync.current;if(!client?.session||externalBusy.current)return false;
    externalBusy.current=true;
    try{if(!await client.signOut())return false;reauthenticate?.('Signed out on this device. Your diner and pending actions are saved for this wallet.');return true;}
    catch(error){announce(error instanceof Error?error.message:'Sign-out could not be confirmed. Please retry.',true);return false;}
    finally{externalBusy.current=false;}
  },[announce,reauthenticate]);
  const acceptSession=useCallback(async(session:DinerSession)=>{
    const pending=JSON.parse(localStorage.getItem(socialPendingKey)||'null');
    if(pending&&pending.playerId!==session.playerId)throw new Error('Finish saving the current diner’s pending street action before switching accounts.');
    if(!requiredWallet||session.wallet?.toLowerCase()!==requiredWallet)throw new Error('Reconnect the same wallet to open its diner.');
    sync.current??=new DinerSync({state:replace,status:setSyncStatus,message:text=>announce(text,true)},localStorage,fetch,requiredWallet);
    return sync.current.adoptSession(session);
  },[replace,announce,requiredWallet,socialPendingKey]);
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
      const raw=localStorage.getItem(socialPendingKey),pending=raw?JSON.parse(raw):null;
      const envelope=pending?.playerId===client.session.playerId?pending.envelope:{id:crypto.randomUUID(),revision:client.revision,command};
      const resumedDifferentCommand=pending?.playerId===client.session.playerId&&JSON.stringify(envelope.command)!==JSON.stringify(command);
      localStorage.setItem(socialPendingKey,JSON.stringify({playerId:client.session.playerId,envelope}));
      setSyncStatus('saving');
      const result=await client.read('social',envelope) as DinerSnapshot;
      if(!client.acceptSnapshot(result))throw new Error('This street action is saved; its diner snapshot will be refreshed on reconnect.');
      localStorage.removeItem(socialPendingKey);client.blocked=false;setSyncStatus('saved');
      if(resumedDifferentCommand)throw new Error('Your earlier street action finished saving. Review it, then choose this new action again.');
      return result;
    }catch(error){
      const failure=error as Error&{status?:number;data?:DinerSnapshot};
      if(failure.status&&failure.status<500&&failure.status!==401&&failure.status!==429){if(failure.data?.state&&!client.acceptSnapshot({...failure.data,ok:true})){client.blocked=true;setSyncStatus('offline');throw new Error('The diner changed elsewhere. Reconnect to load its saved version before continuing.');}localStorage.removeItem(socialPendingKey);client.blocked=false;setSyncStatus('saved');}
      else if(localStorage.getItem(socialPendingKey)){client.blocked=true;setSyncStatus('offline');}
      if(failure.status===401&&client.session)client.session.expiresAt=0;
      throw error;
    }finally{externalBusy.current=false;}
  },[socialPendingKey]);
  useEffect(()=>{if(syncStatus!=='saved'||externalBusy.current)return;try{const pending=JSON.parse(localStorage.getItem(socialPendingKey)||'null');if(pending?.playerId===sync.current?.session?.playerId)void social(pending.envelope.command).catch(error=>announce(error instanceof Error?error.message:'The pending street action is still waiting.',true));}catch{}},[syncStatus,social,announce,socialPendingKey]);
  useEffect(()=>{
    let active=true;
    const load=async()=>{
      if(requiredWallet){
        void fetch('/api/chef/diner/status',{cache:'no-store'}).then(r=>r.json()).then(s=>{if(active)setServerEnabled(s.enabled===true);}).catch(()=>{});
        sync.current=new DinerSync({state:replace,status:setSyncStatus,message:text=>announce(text,true)},localStorage,fetch,requiredWallet);
        const restored=await sync.current.connect(true);if(!active)return;if(!restored&&sync.current.needsSignature){reauthenticate?.();return;}if(restored||sync.current.canonical)return;
        announce('Your wallet account could not load. Reconnect to retry; your diner has not been replaced.',true);return;
      }
      if(!active||!localAllowed)return;
      const now=Date.now();let loaded=createDiner(now,crypto.randomUUID()),recoveryNotice='';
      try{const raw=localStorage.getItem(localSaveKey);if(raw){const candidate=sanitizeDinerSave(raw);
        if(candidate){const settled=dispatchDiner(candidate,{type:'settle'},{now});if(!settled.error)loaded=settled.state;}
        else {try{localStorage.setItem(`${localSaveKey}_recovery_${now}`,raw);recoveryNotice='The earlier checkpoint needs recovery. A backup has been preserved; this preview starts separately.';}catch{guestWritable.current=false;setLocalSaveError('Your earlier save could not be backed up. It has been left untouched; this session cannot be saved.');}}
      }}catch{guestWritable.current=false;setLocalSaveError('Browser storage is unavailable. This session cannot be saved. Allow browser storage and reload to save progress.');}
      replace(loaded);
      if(recoveryNotice)announce(recoveryNotice,true);
    };
    void load();
    const tick=setInterval(()=>{if(live.current&&document.visibilityState==='visible'&&!sync.current?.blocked&&!externalBusy.current){const command=dinerTickCommand(live.current,1);if(command)send(command);}},50);
    const save=setInterval(()=>{if(sync.current?.session)sync.current.checkpoint();else write();},750);
    const settle=setInterval(()=>{if(document.visibilityState==='visible'&&live.current&&!activeDinerMode(live.current))send({type:'settle'});},15000);
    const hidden=()=>{
      if(localAllowed&&live.current&&!sync.current?.session){const settled=dispatchDiner(live.current,{type:'settle'},{now:Date.now(),online:document.visibilityState!=='visible'});if(!settled.error)replace(settled.state);}
      if(document.visibilityState!=='visible'){const pause=live.current?dinerPauseCommand(live.current):null;if(pause)send(pause);if(sync.current?.session)sync.current.checkpoint();else write();}
    };
    const pageHide=()=>{hidden();write();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pageHide);
    return()=>{active=false;clearInterval(tick);clearInterval(save);clearInterval(settle);document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pageHide);const pause=live.current?dinerPauseCommand(live.current):null;if(pause)send(pause);write();gameplayRecorder.clear();clearLocalDiagnostics();sync.current?.dispose();sync.current=null;if(timer.current)clearTimeout(timer.current);};
  },[announce,replace,send,write,requiredWallet,localAllowed,localSaveKey,reauthenticate]);
  // Receipt delivery is independent of cloud-save adoption. Fetch again on a
  // return home; an interrupted response cannot change another wallet's save.
  const journeyChecked=useRef<string|null>(null);
  useEffect(()=>{if(access?.mode!=='wallet'||syncStatus!=='saved'||journeyChecked.current===access.wallet)return;const wallet=access.wallet;journeyChecked.current=wallet;void read('journey/rewards').then(data=>{const result=data as {wallet?:string;rewards?:unknown[]};if(accessRef.current?.mode==='wallet'&&accessRef.current.wallet===wallet&&result.wallet===wallet&&result.rewards?.length)send({type:'claimDomainJourneyRewards'});}).catch(()=>{});},[access,syncStatus,read,send]);
  useEffect(()=>{
    if(access?.mode!=='beta'||!state||journeyChecked.current===access.wallet)return;
    const wallet=access.wallet;journeyChecked.current=wallet;const abort=new AbortController();
    void (async()=>{try{
      const session=JSON.parse(localStorage.getItem(DinerSync.sessionKey(wallet))??'null') as DinerSession|null;
      if(session?.wallet!==wallet||session.expiresAt*1000<Date.now()+30000)return;
      const response=await fetch('/api/chef/diner/journey/rewards',{headers:{Authorization:`Bearer ${session.accessToken}`},cache:'no-store',signal:abort.signal});if(!response.ok)return;
      const data=await response.json(),current=accessRef.current;
      if(abort.signal.aborted||!mounted.current||!live.current||current?.mode!=='beta'||current.wallet!==wallet||sync.current?.session||!guestWritable.current)return;
      const next=attachJourneyRewards(live.current,data,wallet),before=live.current.domainJourneyRewards?.receipts.length??0;
      if(next.domainJourneyRewards!.receipts.length===before)return;
      localStorage.setItem(localSaveKey,JSON.stringify(next));replace(next);dirty.current=false;
      announce('Your journey rewards are home. Décor is in Storage; earned dishes are in Menu & recipes.');
    }catch(error){if(!abort.signal.aborted)announce('Journey rewards could not be saved yet. Return home to retry.',true);}})();
    // Do not cancel when ordinary ticks render a newer state.
    return undefined;
  },[access,state,localSaveKey,replace,announce]);
  const refreshRallyTrophy=useCallback(async(session:DinerSession)=>{
    const wallet=access?.mode==='beta'||access?.mode==='wallet'?access.wallet:null;if(!wallet||wallet!==session.wallet?.toLowerCase())return;
    const response=await fetch('/api/chef/diner/ranked/current',{headers:{Authorization:`Bearer ${session.accessToken}`},cache:'no-store'});if(!response.ok)return;const data=await response.json();const currentAccess=accessRef.current;if(!data.trophy||!live.current||currentAccess?.mode!==access?.mode||!currentAccess||!('wallet' in currentAccess)||currentAccess.wallet!==wallet)return;
    if(sync.current?.session){send({type:'claimRallyTrophy'});return;}
    if(access?.mode==='beta'){const result=dispatchDiner(live.current,{type:'claimRallyTrophy'},{now:Date.now(),verifiedRallyTrophy:true});if(!result.error){replace(result.state);write();}}
  },[access,send,replace,write]);
  const refreshCommunityPlaque=useCallback(async(session:DinerSession)=>{
    const wallet=access?.mode==='beta'||access?.mode==='wallet'?access.wallet:null;if(!wallet||wallet!==session.wallet?.toLowerCase())throw new Error('Reconnect the wallet that cooked for the picnic.');
    const response=await fetch('/api/chef/diner/community/current',{headers:{Authorization:`Bearer ${session.accessToken}`},cache:'no-store'});if(!response.ok)throw new Error('The picnic reward could not be verified yet.');const data=await response.json(),currentAccess=accessRef.current;
    if(!data.entitled||!live.current||!currentAccess||!('wallet' in currentAccess)||currentAccess.wallet!==wallet)throw new Error('Your plaque is not ready for this wallet.');
    if(sync.current?.session){send({type:'claimCommunityPlaque'});return;}
    if(access?.mode==='beta'){const result=dispatchDiner(live.current,{type:'claimCommunityPlaque'},{now:Date.now(),verifiedCommunityPlaque:true});if(result.error)throw new Error(result.error);replace(result.state);write();}
  },[access,send,replace,write]);
  const refreshCollectionRoom=useCallback(async(session:DinerSession,domain:DomainId,signal:AbortSignal)=>{
    const wallet=access?.mode==='beta'?access.wallet:null;
    if(!wallet||session.wallet?.toLowerCase()!==wallet||sync.current?.session)throw new Error('Open the beta restaurant for this wallet first.');
    await claimCollectionRestaurant({wallet,domain,session,signal,current:()=>{
      const current=accessRef.current;
      return mounted.current&&live.current&&current?.mode==='beta'&&!sync.current?.session?{wallet:current.wallet,state:live.current}:null;
    },persist:next=>{
      if(!guestWritable.current)throw new Error('Allow browser storage before attaching your restaurant kit.');
      // Persist before reporting success. Retry can re-deliver the same receipt.
      try{localStorage.setItem(localSaveKey,JSON.stringify(next));}catch{throw new Error('Your browser could not save the kit. Allow storage, then claim again.');}
      replace(next);dirty.current=false;setLocalSaveError(null);
    }});
  },[access,localSaveKey,replace]);
  return {state,send,announce,message,replace,refreshCollectionRoom,refreshCommunityPlaque,refreshRallyTrophy,syncStatus,serverEnabled,localSaveError,connect,read,social,acceptSession,signOut};
}
