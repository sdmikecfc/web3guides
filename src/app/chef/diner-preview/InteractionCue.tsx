"use client";
import {useEffect,useRef,useState} from 'react';
import type {ServiceIntent} from '@/lib/chef/diner/service';
import type {SceneAnchor} from './scene-types';
import {stationActionPosition} from './StationAction';
import css from './interaction-cue.module.css';

/** A single, short explanation beside the selected object, with a safe dock
 * fallback when an offscreen object cannot support a readable callout. */
export function InteractionCue({anchor,intent,onRecover}:{anchor?:SceneAnchor;intent:ServiceIntent;onRecover:(id:string)=>void}){
  const layer=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:0,height:0});
  useEffect(()=>{const el=layer.current;if(!el)return;const observer=new ResizeObserver(()=>setSize({width:el.clientWidth,height:el.clientHeight}));observer.observe(el);return()=>observer.disconnect();},[]);
  const position=anchor?.visible&&size.width?stationActionPosition(anchor,size,{width:190,height:intent.recovery?94:52}):null;
  const overlap=position&&anchor&&Math.hypot(position.edgeX-anchor.x,position.edgeY-anchor.y)<32;
  return <div ref={layer} className={css.layer}><aside className={css.cue} data-docked={!position||overlap} style={position&&!overlap?{left:position.x,top:position.y}:undefined} role="status"><span>{intent.reason??intent.label}</span>{intent.recovery&&<button onClick={()=>onRecover(intent.recovery!.targetId)}>{intent.recovery.label}</button>}</aside></div>;
}
