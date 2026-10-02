"use client";
import {useEffect,useRef,useState} from 'react';
import css from './animated-fighter.module.css';
import {PRESENTATION_KEY,readPresentation} from '@/lib/bots/workshop8/presentation';

/** Decorative style footage; never replaces the actual equipment preview. */
export default function AnimatedFighter({style,paused=false}:{style:'tank'|'speed'|'ranged';paused?:boolean}){
 const root=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null);
 const [visible,setVisible]=useState(false),[reduced,setReduced]=useState(true),[hidden,setHidden]=useState(false),[failed,setFailed]=useState(false),[playing,setPlaying]=useState(false);
 useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>{let local=false;try{local=readPresentation(JSON.parse(localStorage.getItem(PRESENTATION_KEY)||'null')).reducedMotion}catch{}setReduced(q.matches||local)},visibility=()=>setHidden(document.hidden);motion();visibility();q.addEventListener('change',motion);window.addEventListener('storage',motion);window.addEventListener('mk8-presentation-change',motion);document.addEventListener('visibilitychange',visibility);const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.15});if(root.current)observer.observe(root.current);return()=>{q.removeEventListener('change',motion);window.removeEventListener('storage',motion);window.removeEventListener('mk8-presentation-change',motion);document.removeEventListener('visibilitychange',visibility);observer.disconnect()}},[]);
 useEffect(()=>{const node=video.current;if(!node)return;if(visible&&!hidden&&!paused&&!reduced&&!failed)void node.play().catch(()=>setPlaying(false));else node.pause();return()=>node.pause()},[visible,hidden,paused,reduced,failed]);
 return <div className={css.media} ref={root} aria-hidden="true"><img src={`/bots-playtest/intro/${style}.png`} alt="" className={css.poster}/>{!reduced&&!failed&&visible&&<video ref={video} src={`/bots-playtest/intro/animated/${style}.mp4`} className={css.video} data-playing={playing} muted loop playsInline preload="none" onPlaying={()=>setPlaying(true)} onError={()=>{setFailed(true);setPlaying(false)}}/>}</div>;
}
