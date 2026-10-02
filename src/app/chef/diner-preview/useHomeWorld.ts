"use client";
import { useEffect, useRef, useState } from 'react';
import { createHomeWorld, stepHomeWorld, setHomeFixtureCondition, type HomeWorld } from '@/lib/chef/diner/home-simulation';
import { homeSimulationConfig, type DinerState } from '@/lib/chef/diner/progression';

export { homeScene } from './home-scene';

/** Rendering advances the same physical room used to measure settlement rates. */
export function useHomeWorld(state:DinerState|null) {
  const world=useRef<HomeWorld|null>(null),[frame,setFrame]=useState<HomeWorld|null>(null);
  const canonicalConditions=useRef<Record<string,number>>({});
  const config=state?homeSimulationConfig(state):null;
  const signature=JSON.stringify(config,(key,value)=>key==='condition'?undefined:value);
  useEffect(()=>{
    if(!config){world.current=null;setFrame(null);return;}
    const next=createHomeWorld(config);world.current=next;canonicalConditions.current=Object.fromEntries((config.roomPlan?.modules??[]).filter(m=>m.condition!==undefined).map(m=>[m.id,m.condition!]));setFrame({...next});
    // Config is intentionally keyed by value, not the 20 Hz service checkpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature]);
  const conditionSignature=JSON.stringify(config?.roomPlan?.modules.map(m=>[m.id,m.condition])??[]);
  useEffect(()=>{
    if(!world.current)return;let changed=false;
    for(const module of config?.roomPlan?.modules??[]){if(module.condition===undefined||canonicalConditions.current[module.id]===module.condition)continue;setHomeFixtureCondition(world.current,module.id,module.condition);canonicalConditions.current[module.id]=module.condition;changed=true;}
    if(changed)setFrame({...world.current});
    // A settlement updates condition without resetting customers or kitchen jobs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[conditionSignature]);
  useEffect(()=>{const interval=setInterval(()=>{if(world.current&&document.visibilityState==='visible'&&!state?.run&&!state?.rally?.service){stepHomeWorld(world.current,1);setFrame({...world.current});}},50);return()=>clearInterval(interval);},[!!state?.run,!!state?.rally?.service]);
  return frame;
}
