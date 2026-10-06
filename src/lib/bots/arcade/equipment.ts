import {aggregateEquipment,ENTRY_MAP,legalChoices,preset,SLOTS,type Choices} from '../workshop8/catalogue';
import type {Build,Style,Tier} from './types';
export const tierForGP=(gp:number):Tier=>gp>=500?4:gp>=350?3:gp>=200?2:1;
/** A mode adapter only: the existing catalogue and historical stats stay unchanged. */
export function arcadeBuild(choices:Choices,name:string):Build{
 if(!legalChoices(choices))throw Error('This equipment cannot enter Arcade. Choose a temporary fighter.');
 const {stats,gp}=aggregateEquipment(choices,ENTRY_MAP);
 const durability=SLOTS.filter(s=>s!=='weapon').reduce((n,s)=>n+stats.durability[s],0);
 return {name:name.slice(0,32),style:ENTRY_MAP.get(choices.torso)!.style,tier:tierForGP(gp),gp,
  health:Math.round(durability/(1-stats.plating)*1.22),damage:stats.power,
  speed:Math.max(2.8,Math.min(6.7,3.3+stats.speed*.64)),
  handling:Math.max(.94,Math.min(1.13,1+(stats.attackSpeed-1)*.28)),
  guard:Math.round(100+Math.sqrt(stats.guardScale)*24),precision:stats.precision};
}
export const loaner=(style:Style,tier:Tier=1):Build=>arcadeBuild(preset(style,tier),{tank:'Boiler',speed:'Voltage',ranged:'Deadbolt'}[style]);
