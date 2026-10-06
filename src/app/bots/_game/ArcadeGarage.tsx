'use client';
import {useEffect,useState} from 'react';
import ArcadeKombat from './ArcadeKombat';
import {readWorkshop,SAVE_KEY,type Workshop8} from '../../../lib/bots/workshop8/state';
type GarageRead={state:Workshop8|null;scope:string;message:string};
/** Mirrors the workshop's explicit guest preference and stale active-garage recovery. */
export async function readArcadeGarage(session:Pick<Storage,'getItem'>,local:Pick<Storage,'getItem'>,request:typeof fetch,signal?:AbortSignal):Promise<GarageRead>{
 let saved:{token?:string;address?:string}|null=null;try{saved=JSON.parse(session.getItem('mk8.wallet-session.v1')??'null');}catch{}
 const token=session.getItem('mk8.journey.scope.1')==='guest'?'':saved?.token??'',garage=session.getItem('mk8.journey.active.1');
 const read=async(id:string|null)=>{const res=await request(`/api/bots/workshop${id?`?garage=${encodeURIComponent(id)}`:''}`,{headers:token?{Authorization:`Bearer ${token}`}:{},cache:'no-store',signal}),data=await res.json();return{res,data};};
 let result=await read(garage);if(result.res.status===404&&garage)result=await read(null);
 if(!result.res.ok||!result.data.ok)throw Error(result.res.status===401?'Sign in again to load your wallet robot.':'Your saved garage could not load. Retry or open your garage.');
 const data=result.data,state=data.state?readWorkshop(JSON.stringify(data.state)):null;
 const legacyWallet=data.journey!==true&&typeof data.wallet==='string'&&/^0x[0-9a-f]{40}$/i.test(data.wallet)&&(!saved?.address||data.wallet.toLowerCase()===saved.address.toLowerCase());
 if(token&&data.session?.kind!=='wallet'&&!legacyWallet)throw Error('Sign in again to open your wallet garage. Your saved robots are unchanged.');
 if(garage&&!data.session&&!legacyWallet)throw Error('Your saved garage needs a fresh sign-in. Open your garage to reconnect.');
 if(data.state&&!state)throw Error('Your saved robot could not be read. Open your garage to check it.');
 if(state?.robots.length||data.garageId)return{state,scope:data.garageId??`wallet:${data.wallet??saved?.address??'current'}`,message:state?.robots.length?'Your saved robot is ready. Its equipped parts set your Arcade stats.':'No robot built yet. Free Tier 1 fighters are ready.'};
 // Legacy device robots are considered only when no online garage or wallet was selected.
 if(!token&&!garage){const legacy=readWorkshop(local.getItem(SAVE_KEY));if(legacy?.robots.length)return{state:legacy,scope:'device-garage',message:'Using your saved device robot and its equipped parts.'};}
 return{state:null,scope:'loaners',message:'No robot needed. Pick a free Tier 1 fighter to start.'};
}
/** Reads the existing garage. Merely entering Arcade never creates an account. */
export default function ArcadeGarage(){
 const [garage,setGarage]=useState<GarageRead>({state:null,scope:'loaners',message:'Loading your garage…'}),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);let alive=true;
  setLoading(true);setError('');void Promise.resolve().then(()=>readArcadeGarage(sessionStorage,localStorage,fetch,controller.signal)).then(value=>{if(alive)setGarage(value);}).catch(e=>{if(alive)setError(e?.name==='AbortError'?'Your garage took too long to load. Retry or open your garage.':e?.message??'Your garage could not load.');}).finally(()=>{clearTimeout(timeout);if(alive)setLoading(false);});
  return()=>{alive=false;clearTimeout(timeout);controller.abort();};
 },[attempt]);
 return <ArcadeKombat ownedRobots={garage.state?.robots??[]} preferredRobotId={garage.state?.selected??undefined} saveScope={garage.scope} garageMessage={loading?'Loading your garage…':error?'Free Tier 1 fighters remain available.':garage.message} garageError={error} garageLoading={loading} onRetryGarage={()=>setAttempt(n=>n+1)}/>;
}
