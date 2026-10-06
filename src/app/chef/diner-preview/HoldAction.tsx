"use client";
import { useEffect, useRef } from 'react';
import css from './diner.module.css';
import {useControls} from './ControlPreferences';

/** Toggle is an input alternative; the parent owns the exact job lifetime. */
export function HoldAction({active,label,detail,onHold,disabled=false}:{active:boolean;label:string;detail?:string;onHold:(active:boolean)=>void;disabled?:boolean}) {
  const {controls}=useControls(),toggle=controls.work==='toggle';
  const pressed=useRef(false), latest=useRef(onHold);latest.current=onHold;
  const start=()=>{if(!disabled&&!pressed.current){pressed.current=true;latest.current(true);}};
  const stop=()=>{if(pressed.current){pressed.current=false;latest.current(false);}};
  useEffect(()=>{if(disabled)stop();},[disabled]);
  useEffect(()=>{if(!active)pressed.current=false;},[active]);
  useEffect(()=>()=>stop(),[toggle]);
  useEffect(()=>{const hidden=()=>{if(document.visibilityState!=='visible')stop();};window.addEventListener('blur',stop);document.addEventListener('visibilitychange',hidden);return()=>{stop();window.removeEventListener('blur',stop);document.removeEventListener('visibilitychange',hidden);};},[]);
  const action=label.replace(/^(?:Hold to |Press and hold to )/i,'');
  const text=/^(?:Hold to |Press and hold to )/i.test(label)?`${toggle?(active?'Tap to stop · ':'Tap to '):'Press and hold to '}${action}`:label;
  return <button type="button" data-work-control className={`${css.primary} ${css.workButton} ${active?css.holdActive:''}`} aria-pressed={active} disabled={disabled}
    onPointerDown={event=>{if(event.button!==0)return;event.currentTarget.focus();if(toggle)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);start();}}
    onPointerUp={()=>{if(!toggle)stop();}} onPointerCancel={stop} onLostPointerCapture={()=>{if(!toggle)stop();}} onBlur={stop}
    onKeyDown={event=>{if(!toggle&&['Enter',' ','e','E'].includes(event.key)){event.preventDefault();if(!event.repeat)start();}}}
    onKeyUp={event=>{if(!toggle&&['Enter',' ','e','E'].includes(event.key)){event.preventDefault();stop();}}}
    onClick={event=>{event.preventDefault();if(toggle){if(active){pressed.current=true;stop();}else start();}}}>{detail&&<small className={css.workContents}>{detail}</small>}<span>{text}</span>{!disabled&&<small className={css.workShortcut}>{toggle?'or press E':'or hold E'}</small>}</button>;
}
