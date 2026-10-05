"use client";
import { useEffect, useRef } from 'react';
import css from './diner.module.css';

/** Work lasts only while a pointer or keyboard key is physically held. */
export function HoldAction({active,label,onHold,disabled=false}:{active:boolean;label:string;onHold:(active:boolean)=>void;disabled?:boolean}) {
  const pressed=useRef(false), latest=useRef(onHold);latest.current=onHold;
  const start=()=>{if(!disabled&&!pressed.current){pressed.current=true;latest.current(true);}};
  const stop=()=>{if(pressed.current){pressed.current=false;latest.current(false);}};
  useEffect(()=>{const hidden=()=>{if(document.visibilityState!=='visible')stop();};window.addEventListener('blur',stop);document.addEventListener('visibilitychange',hidden);return()=>{stop();window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',hidden);};},[]);
  return <button type="button" className={`${css.primary} ${active?css.holdActive:''}`} aria-pressed={active} disabled={disabled}
    onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);start();}}
    onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
    onKeyDown={event=>{if(['Enter',' ','e','E'].includes(event.key)){event.preventDefault();if(!event.repeat)start();}}}
    onKeyUp={event=>{if(['Enter',' ','e','E'].includes(event.key)){event.preventDefault();stop();}}}
    onClick={event=>event.preventDefault()}>{label}</button>;
}
