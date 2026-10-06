'use client';
import {useEffect,useState} from 'react';
import ArcadeKombat from './ArcadeKombat';
import {readWorkshop,SAVE_KEY,type Robot8} from '@/lib/bots/workshop8/state';
/** Reads the existing garage. Merely entering Arcade never creates an account. */
export default function ArcadeGarage(){
 const [robots,setRobots]=useState<Robot8[]>([]),[scope,setScope]=useState('loaners'),[message,setMessage]=useState('Loading your garage…');
 useEffect(()=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);let alive=true;
  void(async()=>{try{const session=JSON.parse(sessionStorage.getItem('mk8.wallet-session.v1')??'null'),garage=sessionStorage.getItem('mk8.journey.active.1');
   const res=await fetch(`/api/bots/workshop${garage?`?garage=${encodeURIComponent(garage)}`:''}`,{headers:session?.token?{Authorization:`Bearer ${session.token}`}:{},cache:'no-store',signal:controller.signal});
   const data=await res.json();if(!res.ok||!data.ok)throw Error(data.error||'Garage could not load.');
   if(!alive)return;const state=data.state?readWorkshop(JSON.stringify(data.state)):null;
   if(state?.robots.length){setRobots(state.robots);setScope(data.garageId??`wallet:${data.wallet??session?.address??'current'}`);setMessage('Use your own robot or pick a free fighter.');return;}
   const local=readWorkshop(localStorage.getItem(SAVE_KEY));if(local?.robots.length){setRobots(local.robots);setScope('device-garage');setMessage('Your saved robots are ready. Arcade progress stays on this device.');return;}
   setMessage('No robot needed. Pick a free fighter to start.');
  }catch(e){if(alive){try{const local=readWorkshop(localStorage.getItem(SAVE_KEY));if(local?.robots.length){setRobots(local.robots);setScope('device-garage');setMessage('Your device garage is ready. Online saves are unavailable.');return;}}catch{}setMessage('Your garage could not load. Free fighters are ready to play.');}}})();
  return()=>{alive=false;clearTimeout(timeout);controller.abort();};
 },[]);
 return <ArcadeKombat ownedRobots={robots} saveScope={scope} garageMessage={message}/>;
}
