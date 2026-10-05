"use client";
import { useCallback, useEffect, useRef } from 'react';
import { MUSIC_SETTINGS } from './workshop-soundtrack';

/** A short, quiet workshop chime. No audio starts before a player gesture. */
export default function useWorkshopCelebration(){
 const context=useRef<AudioContext|null>(null);
 useEffect(()=>{
  const unlock=()=>{try{context.current??=new AudioContext();if(context.current.state==='suspended')void context.current.resume().catch(()=>{})}catch{}};
  window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);
  return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);void context.current?.close().catch(()=>{});context.current=null};
 },[]);
 return useCallback((kind:'built'|'special'|'earned')=>{
  const audio=context.current;if(!audio||audio.state!=='running')return;
  let volume=.3;try{const saved=JSON.parse(localStorage.getItem(MUSIC_SETTINGS)||'null');if(saved?.enabled===false)return;if(typeof saved?.volume==='number')volume=Math.max(0,Math.min(.8,saved.volume))}catch{}
  const notes=kind==='special'?[440,660]:kind==='built'?[330,440,660]:[440,550,880];
  notes.forEach((frequency,index)=>{const oscillator=audio.createOscillator(),gain=audio.createGain(),start=audio.currentTime+index*.085;
   oscillator.type='triangle';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume*.15,start+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+.22);
   oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(start);oscillator.stop(start+.24);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()};
  });
 },[]);
}
