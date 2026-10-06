'use client';
import {useEffect,useRef} from 'react';
import type {DomainId} from '@/lib/chef/diner/domain-worlds';
import {cinematicRevealPhase,CINEMATIC_SPEED,type RevealPhase} from '@/lib/chef/diner/pack-experience';
import type {CollectibleRarity} from '@/lib/chef/diner/collectible-packs-v1';
import css from './pack-experience.module.css';

/** The film is presentation only. The frozen receipt supplies every rarity cue and reward. */
export default function CinematicOpening({domain,rarity,onPhase,onFinish,onFallback}:{domain:DomainId;rarity:CollectibleRarity;onPhase:(phase:RevealPhase)=>void;onFinish:()=>void;onFallback:()=>void}){
 const video=useRef<HTMLVideoElement>(null),callbacks=useRef({onPhase,onFinish,onFallback});
 callbacks.current={onPhase,onFinish,onFallback};
 useEffect(()=>{
  const element=video.current;if(!element)return;
  // Strict Mode replays effects after cleanup, which releases the previous source.
  element.src=`/api/chef/pack-cinematics/${domain}.mp4`;
  let disposed=false,finished=false,lastProgress=performance.now(),lastTime=0,started=false;
  const fail=()=>{if(disposed||finished)return;finished=true;element.pause();callbacks.current.onFallback();};
  const play=()=>{if(disposed||finished||document.hidden)return;void element.play().catch(fail);};
  const progress=()=>{
   if(finished||disposed)return;
   if(element.currentTime!==lastTime){lastTime=element.currentTime;lastProgress=performance.now();}
   if(Number.isFinite(element.duration)&&element.duration>0)callbacks.current.onPhase(cinematicRevealPhase(element.currentTime/element.duration));
  };
  const playing=()=>{started=true;lastProgress=performance.now();};
  const ended=()=>{if(finished||disposed)return;finished=true;callbacks.current.onFinish();};
  const visibility=()=>{lastProgress=performance.now();if(document.hidden)element.pause();else play();};
  element.playbackRate=CINEMATIC_SPEED[rarity];
  element.addEventListener('timeupdate',progress);element.addEventListener('playing',playing);element.addEventListener('ended',ended);element.addEventListener('error',fail);
  document.addEventListener('visibilitychange',visibility);
  // Loading/decoding problems return to the lightweight opening, never strand the receipt.
  const watchdog=window.setInterval(()=>{if(!document.hidden&&!finished&&performance.now()-lastProgress>(started?5000:8000))fail();},500);
  play();
  return()=>{disposed=true;clearInterval(watchdog);document.removeEventListener('visibilitychange',visibility);element.removeEventListener('timeupdate',progress);element.removeEventListener('playing',playing);element.removeEventListener('ended',ended);element.removeEventListener('error',fail);element.pause();element.removeAttribute('src');element.load();};
 },[domain,rarity]);
 return <div className={css.cinemaFilm} aria-hidden="true">
  <div className={css.filmBackdrop} style={{backgroundImage:`url(/api/chef/pack-cinematics/${domain}.jpg)`}}/>
  <video ref={video} src={`/api/chef/pack-cinematics/${domain}.mp4`} poster={`/api/chef/pack-cinematics/${domain}.jpg`} muted playsInline preload="auto" disablePictureInPicture disableRemotePlayback/>
  <div className={css.filmShade}/><div className={css.filmOmen}/><div className={css.filmHalo}/>
 </div>;
}
