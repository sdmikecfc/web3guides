import {presetV6} from '@/lib/bots/v6/build';
import {cloneV6,deepFreeze,hashV6} from '@/lib/bots/v6/math';
import type {BuildV7,StyleV7} from './types';
import {equalSnapshotV7,rigManifestV7} from './rig';
import './default-rig';
export const RULES_VERSION_V7='mk7-proof-3' as const;
export function createHeroBuildV7(style:StyleV7,rigVersion?:string):BuildV7{
  if(!['tank','speed','ranged'].includes(style))throw new Error('Choose Tank, Speed, or Ranged.');
  const m=rigManifestV7(rigVersion),rig=m.heroes[style],old=presetV6(style,3,{weapon:rig.weapon.kind,signature:false}),stats=cloneV6(old.stats);stats.armour[0]=Math.round(stats.armour[1]*.65);
  return deepFreeze({version:7,rulesVersion:RULES_VERSION_V7,rigVersion:m.version,motionVersion:m.motionVersion,collisionVersion:m.collisionVersion,presentationVersion:m.presentationVersion,manifestHash:hashV6(m),style,tier:3,name:style==='tank'?'Boiler Knight':style==='speed'?'Roller Daredevil':'Owl Ranger',gp:350,stats,rig:cloneV6(rig),capabilities:{special:cloneV6(old.capabilities.special),tier3:true,weapon:rig.weapon.kind,paired:rig.weapon.kind==='paired_blades',mount:rig.weapon.kind==='shoulder_cannon'?'shoulder':'right',weaponDefinition:cloneV6(old.capabilities.weaponDefinition)}} as BuildV7);
}
export function validBuildV7(raw:unknown):raw is BuildV7{try{const b=raw as BuildV7;return b?.version===7&&equalSnapshotV7(b,createHeroBuildV7(b.style,b.rigVersion));}catch{return false;}}
