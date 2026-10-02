import {PitEngine} from './engine';
import type {Action,Spec} from './types';
/** The same drills run against the assembled, replay-pinned contact paths. */
export function verifyDrills(spec:Spec){
 function run(kind:'string'|'air'|'signature'){
  const e=new PitEngine([spec,spec],{training:true,dummy:'idle'});e.phase='fight';
  // Verify the ground string at ordinary striking distance, not overlapping
  // bodies. Launchers and kit confirms still have their own close-in range.
  const gap=kind==='string'?2500:1800;e.actors[0].x=-gap/2;e.actors[1].x=gap/2;
  const press=(action:Action)=>{e.input(0,action);e.input(0,action,false);e.step()};
  const hit=()=>{const before=e.events.filter(v=>v.kind==='hit').length;for(let i=0;i<90;i++){e.step();if(e.events.filter(v=>v.kind==='hit').length>before)return true}return false};
  if(kind==='string'){press('light');if(!hit())return null;press('light');if(!hit())return null;press('heavy');if(!hit())return null;}
  if(kind==='air'){e.input(0,'down');press('heavy');if(!hit())return null;e.input(0,'down',false);press('up');press('light');if(!hit())return null;press('heavy');if(!hit())return null;}
  if(kind==='signature'){press('heavy');if(!hit())return null;e.input(0,'right');press('special');if(!hit())return null;}
  return {hits:e.actors[1].combo,damage:Math.round(e.actors[1].comboDamage/spec.hp*100)};
 }
 return {string:run('string'),air:run('air'),signature:run('signature')};
}
