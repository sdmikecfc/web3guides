"use client";
import { useEffect, useRef, useState } from 'react';
import { createHomeWorld, stepHomeWorld, setHomeFixtureCondition, type HomeWorld } from '@/lib/chef/diner/home-simulation';
import { regularVisitWorld } from '@/lib/chef/diner/regular-stories';
import { atRestaurant, homeSimulationConfig, type DinerState } from '@/lib/chef/diner/progression';

export { homeScene } from './home-scene';

/** Rendering advances the same physical room used to measure settlement rates. */
export function useHomeWorld(state:DinerState|null) {
  const world=useRef<HomeWorld|null>(null),[frame,setFrame]=useState<HomeWorld|null>(null);
  const canonicalConditions=useRef<Record<string,number>>({});
  const visit=state?.regularStories?.pending;
  const config=visit?.config??(state?homeSimulationConfig(state):null);
  const signature=JSON.stringify(config,(key,value)=>['condition','crew','signature','staffPolicyVersion'].includes(key)?undefined:value);
  useEffect(()=>{
    if(!config){world.current=null;setFrame(null);return;}
    const next=state?.homeAudience?structuredClone(state.homeAudience.world):createHomeWorld(config);world.current=next;canonicalConditions.current=Object.fromEntries((config.roomPlan?.modules??[]).filter(m=>m.condition!==undefined).map(m=>[m.id,m.condition!]));setFrame({...next});
    // Config is intentionally keyed by value, not the 20 Hz service checkpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[signature,state?.homeAudience?.world.tick]);
  useEffect(()=>{if(visit&&!state?.homeAudience){const next=regularVisitWorld(visit);world.current=next;setFrame({...next});}},[visit?.id,visit?.ticks]);
  const crewSignature=JSON.stringify([config?.crew,config?.staffPolicyVersion,config?.signature]);
  useEffect(()=>{if(world.current&&config){world.current.config.crew=structuredClone(config.crew);world.current.config.staffPolicyVersion=config.staffPolicyVersion;world.current.config.signature=structuredClone(config.signature);setFrame({...world.current});}},[crewSignature]);
  const conditionSignature=JSON.stringify(config?.roomPlan?.modules.map(m=>[m.id,m.condition])??[]);
  useEffect(()=>{
    if(!world.current)return;let changed=false;
    for(const module of config?.roomPlan?.modules??[]){if(module.condition===undefined||canonicalConditions.current[module.id]===module.condition)continue;setHomeFixtureCondition(world.current,module.id,module.condition);canonicalConditions.current[module.id]=module.condition;changed=true;}
    if(changed)setFrame({...world.current});
    // A settlement updates condition without resetting customers or kitchen jobs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[conditionSignature]);
  useEffect(()=>{const interval=setInterval(()=>{if(world.current&&document.visibilityState==='visible'&&state&&atRestaurant(state)){stepHomeWorld(world.current,1);setFrame({...world.current});}},50);return()=>clearInterval(interval);},[!!state?.run,state?.run?.location,!!state?.rally?.service]);
  return frame;
}
