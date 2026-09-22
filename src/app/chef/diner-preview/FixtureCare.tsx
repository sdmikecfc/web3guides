"use client";
import { useEffect, useRef, useState } from 'react';
import type { RoomModule } from '@/lib/chef/diner/room-plan';
import type { DinerCommand } from '@/lib/chef/diner/progression';
import { RENOVATION_RULES } from '@/lib/chef/diner/renovation';
import { StationAction } from './StationAction';
import type { SceneAnchor } from './scene-types';

/** Short, captured press on the actual fixture; releasing never submits a chore. */
export function FixtureCare({module,anchor,coins,send}:{module:RoomModule;anchor?:SceneAnchor;coins:number;send:(c:DinerCommand)=>boolean}){
  const [held,setHeld]=useState(false),[progress,setProgress]=useState(0),start=useRef(0),complete=useRef(false),condition=module.condition??100,broken=condition<=20;
  useEffect(()=>{if(!held)return;start.current=performance.now();complete.current=false;const timer=setInterval(()=>{const p=Math.min(1,(performance.now()-start.current)/1200);setProgress(p);if(p===1&&!complete.current){complete.current=true;setHeld(false);setProgress(0);send({type:broken?'repairHomeFixture':'cleanHomeFixture',moduleId:module.id});}},40);return()=>clearInterval(timer);},[held,broken,module.id,send]);
  return <StationAction anchor={anchor} active={held} progress={progress} disabled={condition>=99.9||(broken&&coins<RENOVATION_RULES.maintenance.repair)} label={condition>=99.9?'Sparkling clean':broken?`Hold to repair · ${RENOVATION_RULES.maintenance.repair} coins`:'Hold to wipe · 1 sec'} onHold={value=>{setHeld(value);if(!value)setProgress(0);}}/>;
}
