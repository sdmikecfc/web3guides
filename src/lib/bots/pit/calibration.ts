import * as T from 'three';
import {PitEngine} from './engine';
import {moves} from './moves';
import {strikingJoint} from './brawl-pose';
import type {robotRig} from './rig';
import type {Spec} from './types';

/** Both browser and verification sample the same actual articulated geometry.
 * Samples are frozen before the match and included in the replay packet. */
export function calibrateRig(rig:ReturnType<typeof robotRig>,spec:Spec){
 const actor=new PitEngine([spec,spec]).actors[0],table=moves(spec);
 const pose=(move:typeof table.light,frame:number,y=0)=>rig.stance({...actor,x:0,y,facing:1,attack:{move,frame,facing:1,instance:0,hits:[],enhanced:false,shots:0}},0,0,false);
 const point=(name:string)=>rig.model.getObjectByName(name)?.getWorldPosition(new T.Vector3()).multiplyScalar(1000).toArray().map(Math.round) as [number,number,number]|undefined;
 pose(table.special,table.special.startup);const muzzle=table.special.projectile?point('muzzle'):undefined;
 pose(table.super,table.super.startup);const superMuzzle=table.super.projectile?point('handR'):undefined;
 const contacts:NonNullable<Spec['contacts']>={};
 for(const move of Object.values(table)){
  if(move.projectile||move.id==='bodySpecial'||move.id==='throw')continue;
  const marker=move.motion.startsWith('weapon')?(move.motion==='weaponShield'?'handL':spec.weapon==='hammer'?'hammerFace':'weaponTip'):strikingJoint(move.motion);
  if(!rig.model.getObjectByName(marker))continue;
  contacts[move.id]=[];
  for(let f=0;f<move.active;f++){const y=move.id.startsWith('air')?1:0;pose(move,move.startup+f,y);const p=point(marker)!;contacts[move.id]!.push([p[0],p[1]-y]);}
 }
 return {muzzle,superMuzzle,contacts};
}
