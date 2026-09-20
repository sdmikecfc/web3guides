"use client";
import { useEffect, useRef, useState } from 'react';
import { createHomeWorld, stepHomeWorld, type HomeWorld } from '@/lib/chef/diner/home-simulation';
import { homeSimulationConfig, type DinerState } from '@/lib/chef/diner/progression';

export { homeScene } from './home-scene';

/** Rendering advances the same physical room used to measure settlement rates. */
export function useHomeWorld(state:DinerState|null) {
  const world=useRef<HomeWorld|null>(null),[frame,setFrame]=useState<HomeWorld|null>(null);
  const config=state?homeSimulationConfig(state):null;
  const signature=JSON.stringify(config);
  useEffect(()=>{
    if(!config){world.current=null;setFrame(null);return;}
    const next=createHomeWorld(config);world.current=next;setFrame({...next});
    // Config is intentionally keyed by value, not the 20 Hz service checkpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature]);
  useEffect(()=>{const interval=setInterval(()=>{if(world.current&&document.visibilityState==='visible'&&!state?.run&&!state?.rally?.service){stepHomeWorld(world.current,1);setFrame({...world.current});}},50);return()=>clearInterval(interval);},[!!state?.run,!!state?.rally?.service]);
  return frame;
}
