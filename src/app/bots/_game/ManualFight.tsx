'use client';
import {useEffect,useMemo,useState} from 'react';
import ConnectedModelRoom from './ConnectedModelRoom';
import {ENTRY_MAP,legalChoices,practiceOpponent} from '@/lib/bots/workshop8/catalogue';
import type {Robot8} from '@/lib/bots/workshop8/state';
import css from './manual-fight.module.css';

/** No progression mutation callbacks: practice cannot settle a house fight. */
export default function ManualFight({robot,arena,onClose}:{robot:Robot8;arena:string;onClose():void}){
 const [round,setRound]=useState(0),[seed,setSeed]=useState(()=>crypto.getRandomValues(new Uint32Array(1))[0]);
 const supported=legalChoices(robot.choices)&&ENTRY_MAP.get(robot.choices.weapon)?.weapon;
 const payload=useMemo(()=>({id:`manual-${robot.id}-${round}`,manual:true,name:robot.name,choices:structuredClone(robot.choices),appearance:structuredClone(robot.appearance),rival:supported?practiceOpponent(robot.choices,(['tank','speed','ranged'] as const)[round%3]):robot.choices,seed,arena}),[robot,round,seed,arena,supported]);
 useEffect(()=>{const pause=()=>{if(document.hasFocus()&&!document.hidden)return;document.querySelectorAll('iframe').forEach(frame=>frame.contentWindow?.postMessage({type:'manual-pause'},location.origin));};const hidden=()=>{if(document.hidden)pause();};window.addEventListener('blur',pause);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',hidden);};},[]);
 return <section className={css.room}><header><div><strong>{robot.name} · Take control</strong><small>Practice: no coins, repairs or competition points</small></div><button onClick={onClose}>Back to fights</button></header>{supported?<div className={css.arena}><ConnectedModelRoom view="practice" title="Take control practice arena" payload={payload} onEvent={type=>{if(type==='manual-change'){setRound(n=>n+1);setSeed(crypto.getRandomValues(new Uint32Array(1))[0]);}}}/></div>:<p>This robot uses historical equipment that is not supported by manual practice. Its equipment has not been replaced. Choose a robot with a current weapon kit.</p>}</section>;
}
