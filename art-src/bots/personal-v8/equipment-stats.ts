import type {Choices,Entry,Slot} from './parts-assembly';
import {SLOTS} from './parts-assembly';

export const ITEM_STATS_VERSION='mk8-items-1';
const GP=[0,100,200,350,500];
const HEALTH=[0,1,1.85,2.85,4];
const DAMAGE=[0,1,1.7,2.5,3.4];
const MOBILITY=[0,1,1.06,1.12,1.18];
const HANDLING=[0,1,1.04,1.08,1.12];
const WEIGHT:Record<Slot,number>={head:.2,torso:.2,weapon:.2,armL:.1,armR:.1,legL:.1,legR:.1};
const HEALTH_SHARE:Record<Slot,number>={head:.60,torso:1,armL:.49,armR:.49,legL:.58,legR:.58,weapon:0};
const ARMOUR_SHARE:Record<Slot,number>={head:.15,torso:.35,armL:.125,armR:.125,legL:.125,legR:.125,weapon:0};
export type ItemStats8={gearPoints:number;health:number;armour:number;movement:number;attackSpeed:number;power:number;turning:number;precision:number;guardScale:number};

/** Canonical slot-specific values. Family and paint never introduce hidden bonuses. */
export function itemStats(entry:Entry,slot:Slot):ItemStats8{
 if(!entry.slots.includes(slot)||!Number.isInteger(entry.tier)||entry.tier<1||entry.tier>4)throw Error('Invalid item stats');
 const t=entry.tier,s=entry.style,arm=slot==='armL'||slot==='armR',leg=slot==='legL'||slot==='legR';
 return {gearPoints:GP[t]*WEIGHT[slot],health:170*HEALTH[t]*({tank:1.18,speed:.84,ranged:1}[s])*HEALTH_SHARE[slot],
  armour:slot==='weapon'?0:({tank:.18,speed:.08,ranged:.13}[s])+[0,0,.04,.075,.10][t],
  movement:leg?({tank:.78,speed:1.48,ranged:1}[s])*MOBILITY[t]:slot==='torso'?({tank:.80,speed:1.15,ranged:1}[s]):0,
  attackSpeed:arm?({tank:.90,speed:1.16,ranged:1}[s])*HANDLING[t]:slot==='weapon'?HANDLING[t]:0,
  power:arm?({tank:1.12,speed:.96,ranged:1}[s])*(1+.06*(t-1)):slot==='weapon'?DAMAGE[t]:0,
  turning:slot==='head'?({tank:.86,speed:1.24,ranged:1.10}[s])*MOBILITY[t]:0,
  precision:slot==='head'?({tank:.90,speed:1,ranged:1.24}[s])*(1+.08*(t-1)):0,
  guardScale:arm?HEALTH[t]:0};
}

export function aggregateEquipment(choices:Choices,entries:Map<string,Entry>){
 const items=Object.fromEntries(SLOTS.map(slot=>[slot,itemStats(entries.get(choices[slot])!,slot)])) as Record<Slot,ItemStats8>;
 const arms=(key:keyof ItemStats8)=>(items.armL[key]+items.armR[key])/2;
 const durability=Object.fromEntries(SLOTS.map(slot=>[slot,slot==='weapon'?1:items[slot].health])) as Record<Slot,number>;
 return {version:ITEM_STATS_VERSION,items,gp:SLOTS.reduce((n,s)=>n+items[s].gearPoints,0),stats:{
  body:durability.torso,durability,
  speed:2.15*((items.legL.movement+items.legR.movement)/2*.85+items.torso.movement*.15),
  turn:2.35*items.head.turning,
  plating:Math.min(.35,SLOTS.reduce((n,s)=>n+items[s].armour*ARMOUR_SHARE[s],0)),
  power:items.weapon.power*arms('power'),attackSpeed:items.weapon.attackSpeed*arms('attackSpeed'),
  precision:items.head.precision,guardScale:arms('guardScale'),backupPower:arms('power')*Math.pow(arms('guardScale'),.8)
 }};
}
