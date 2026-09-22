"use client";
import { useEffect, useRef, useState } from 'react';
import { HoldAction } from './HoldAction';
import type { SceneAnchor } from './scene-types';
import css from './station-action.module.css';

type Size={width:number;height:number};
export interface StationActionProps {
  anchor?:SceneAnchor|null;
  label:string;
  active:boolean;
  onHold:(active:boolean)=>void;
  /** Completion of a real manual hold/wash job, normalized to 0–1. */
  progress?:number;
  disabled?:boolean;
}

/** Find the nearest clear edge of the station, then keep the whole touch target
 * inside the play area. Coordinates use the same full-size parent as the canvas. */
export function stationActionPosition(anchor:{x:number;y:number},viewport:Size,card:Size={width:124,height:48}){
  const mobile=viewport.width<=700,gap=44,left=12,right=mobile?12:68;
  const top=Math.min(124,viewport.height*.22),bottom=Math.min(mobile?248:180,viewport.height*.32);
  const maxX=Math.max(left,viewport.width-right-card.width),maxY=Math.max(top,viewport.height-bottom-card.height);
  const clamp=(n:number,min:number,max:number)=>Math.min(max,Math.max(min,n));
  const candidates=[
    {x:anchor.x-card.width/2,y:anchor.y-gap-card.height},
    {x:anchor.x-gap-card.width,y:anchor.y-card.height/2},
    {x:anchor.x+gap,y:anchor.y-card.height/2},
    {x:anchor.x-card.width/2,y:anchor.y+gap},
  ].map((candidate,index)=>{
    const x=clamp(candidate.x,left,maxX),y=clamp(candidate.y,top,maxY);
    const edgeX=clamp(anchor.x,x,x+card.width),edgeY=clamp(anchor.y,y,y+card.height);
    const distance=Math.hypot(anchor.x-edgeX,anchor.y-edgeY);
    const shift=Math.hypot(x-candidate.x,y-candidate.y);
    return {x,y,edgeX,edgeY,score:shift*2+Math.abs(distance-gap)+(distance<32?500:0)+index*.25};
  });
  return candidates.sort((a,b)=>a.score-b.score)[0];
}

/** Mounted only for a manual station job. Merely showing the control never works. */
export function StationAction({anchor,label,active,onHold,progress,disabled=false}:StationActionProps){
  const layer=useRef<HTMLDivElement>(null),card=useRef<HTMLElement>(null);
  const [viewport,setViewport]=useState<Size>({width:0,height:0}),[cardSize,setCardSize]=useState<Size>({width:124,height:48});
  const heldPosition=useRef<ReturnType<typeof stationActionPosition>|null>(null);
  const shown=!!anchor?.visible&&Number.isFinite(anchor.x)&&Number.isFinite(anchor.y);
  useEffect(()=>{
    const node=layer.current;if(!node)return;
    const measure=()=>{const rect=node.getBoundingClientRect();setViewport(old=>old.width===rect.width&&old.height===rect.height?old:{width:rect.width,height:rect.height});};
    measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const node=card.current;if(!node)return;
    const measure=()=>{const rect=node.getBoundingClientRect();setCardSize(old=>old.width===rect.width&&old.height===rect.height?old:{width:rect.width,height:rect.height});};
    measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
  },[shown,viewport.width>0]);
  const position=shown&&viewport.width>0?stationActionPosition(anchor!,viewport,cardSize):null;
  // Keep a captured finger on a steady control while simulation/anchors update.
  if(!active)heldPosition.current=position;
  const placed=active?(heldPosition.current??position):position;
  const ratio=progress===undefined||!Number.isFinite(progress)?undefined:Math.min(1,Math.max(0,progress));
  return <div ref={layer} className={css.layer}>
    {shown&&placed&&<>
      <svg className={css.tether} aria-hidden="true"><path d={`M${anchor!.x},${anchor!.y} L${placed.edgeX},${placed.edgeY}`}/><circle cx={anchor!.x} cy={anchor!.y} r="4"/></svg>
      <section ref={card} className={`${css.card} ${active?css.active:''}`} style={{left:placed.x,top:placed.y}} aria-label="Selected station work" data-station-action={anchor!.id}>
        <HoldAction active={active} label={label} onHold={onHold} disabled={disabled}/>
        {ratio!==undefined&&<div className={css.progress} role="progressbar" aria-label="Station work progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio*100)}><i style={{width:`${ratio*100}%`}}/></div>}
      </section>
    </>}
  </div>;
}
