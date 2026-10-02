import {ENTRY_MAP,aggregateEquipment,legalChoices,preset,practiceOpponent,defaultAppearance,type Choices,type Appearance} from '../workshop8/catalogue';
import type {Style,Spec,InputMove,Move,Motion} from './types';
export const KIT_MOVES:Record<string,[[string,Motion],[string,Motion]]>={
 hammer:[['Compact cross strike','weaponCross'],['Stepping overhead crush','weaponOverhead']],
 greatsword:[['Diagonal cut','weaponCross'],['Advancing thrust','weaponThrust']],
 axe:[['Horizontal sweep','weaponCross'],['Advancing chop','weaponOverhead']],
 flail:[['Side cast','weaponFlail'],['Descending cast','weaponOverhead']],
 sword_shield:[['Covered thrust','weaponThrust'],['Shield rush','weaponShield']],
 spear_shield:[['Set thrust','weaponThrust'],['Stepping thrust','weaponThrust']],
 long_spear:[['Measured thrust','weaponThrust'],['Advancing butt strike','weaponButt']],
 dual_blades:[['Lead slash','weaponCross'],['Alternating cuts','weaponBlades']],
 rifle:[['Settled shot','weaponShot'],['Rifle-butt check','weaponButt']],
 precision_rifle:[['Braced shot','weaponShot'],['Retreat and set','weaponShot']],
 rotary:[['Braced burst','weaponShot'],['Barrel check','weaponButt']],
 arm_cannon:[['Direct pulse','weaponShot'],['Cannon strike','weaponButt']],
};
const reference=aggregateEquipment(preset('ranged'),ENTRY_MAP);
const health=(a:ReturnType<typeof aggregateEquipment>)=>Object.entries(a.stats.durability).filter(([s])=>s!=='weapon').reduce((n,[,v])=>n+v,0);
export function fighter(name:string,choices:Choices,appearance?:Appearance,loaner=false):Spec{
 if(!legalChoices(choices))throw Error('Historical equipment is not supported in Reactor Pit. Choose a free loaner.');
 const body=ENTRY_MAP.get(choices.torso)!,weapon=ENTRY_MAP.get(choices.weapon)!.weapon;
 if(!KIT_MOVES[weapon])throw Error('This weapon has no Reactor Pit moveset. Choose a free loaner.');
 const a=aggregateEquipment(choices,ENTRY_MAP),clamp=(v:number,l:number,h:number)=>Math.max(l,Math.min(h,v));
 return {name:name.slice(0,40),style:body.style,weapon,gp:a.gp,choices:{...choices},appearance:appearance??defaultAppearance(body.family),loaner,
 hp:Math.round(1000*health(a)/health(reference)),power:a.stats.power,plating:a.stats.plating,
 speed:Math.round(51*Math.pow(a.stats.speed/reference.stats.speed,.45)),handling:clamp(1+(a.stats.attackSpeed-1)*.35,.95,1.10),
 guard:Math.round(100*Math.pow(a.stats.guardScale,.18)),precision:a.stats.precision};
}
export function loaner(style:Style){return fighter({tank:'Warden',speed:'Duelist',ranged:'Tracker'}[style],preset(style),undefined,true)}
export function rivalFor(a:Spec,style:Style){const result=fighter({tank:'Iron Marshal',speed:'Voltage',ranged:'Dead Circuit'}[style],practiceOpponent(a.choices,style));if(Math.abs(result.gp/a.gp-1)>.1)return {...a,name:'Equal-equipment sparring rival'};return result;}
function base(id:InputMove,name:string,motion:Motion,values:Partial<Move>):Move{return {id,name,motion,startup:9,active:4,recovery:15,damage:65,hitstun:24,blockstun:10,push:170,level:'mid',reach:1350,height:2350,radius:340,launch:0,knockdown:false,travel:0,cost:0,cancel:[],hitstop:4,...values}}
export function moves(spec:Spec):Record<InputMove,Move>{
 const t=spec.style==='tank',s=spec.style==='speed',kit=KIT_MOVES[spec.weapon];
 const hitPower=t?1.10:s?.93:1,rate=(n:number)=>Math.max(1,Math.round(n/spec.handling));
 const result={
 light:base('light',t?'Piston jab':s?'Needle strike':'Checking jab','jab',{startup:t?10:s?8:9,damage:76,height:2700,level:'high',stepIn:380,cancel:['light','heavy'],recovery:19}),
 heavy:base('heavy',t?'Hydraulic cross':s?'Driving kick':'Servo cross',s?'kick':'cross',{startup:t?20:s?17:18,active:5,recovery:23,damage:142,hitstun:32,push:250,reach:1650,stepIn:s?650:560,cancel:['forwardSpecial','super'],hitstop:7}),
 low:base('low','Low check','low',{startup:10,damage:50,level:'low',height:410,reach:1500,recovery:17,hitstun:20,cancel:['heavy']}),
 launcher:base('launcher',t?'Piston uppercut':'Rising strike','uppercut',{startup:14,active:7,recovery:27,damage:86,height:2150,radius:650,reach:1150,launch:165,hitstun:30,cancel:['airLight','airHeavy'],hitstop:7}),
 advance:base('advance','Step-in jab','jab',{startup:12,recovery:23,damage:75,stepIn:820,reach:1650,cancel:['light','heavy']}),
 overhead:base('overhead',t?'Breaker fist':'Descending fist','overhead',{startup:26,active:5,recovery:28,damage:108,level:'overhead',height:1400,radius:600,reach:1550,knockdown:true,hitstop:7}),
 airLight:base('airLight','Aerial check','airKick',{startup:6,active:9,recovery:12,damage:66,level:'overhead',height:750,reach:1650,radius:520,hitstun:25,cancel:['airHeavy']}),
 airHeavy:base('airHeavy','Descending blow','airHeavy',{startup:10,active:12,recovery:22,damage:100,level:'overhead',height:320,reach:1500,radius:750,knockdown:true,hitstop:7}),
 special:base('special',kit[0][0],kit[0][1],{startup:18,active:7,recovery:30,damage:114,reach:2250,height:1800,hitstun:28,hitstop:7}),
 forwardSpecial:base('forwardSpecial',kit[1][0],kit[1][1],{startup:23,active:8,recovery:32,damage:130,reach:1800,travel:28,hitstun:32,knockdown:true,hitstop:8}),
 bodySpecial:base('bodySpecial',t?'Seismic stomp':s?'Energy slide':'Ground pulse',t?'stomp':s?'slide':'pulse',{startup:t?25:s?16:22,active:8,recovery:32,damage:t?118:92,level:'low',height:360,reach:t?2300:s?1500:2400,radius:420,travel:s?75:0,knockdown:true,hitstop:6}),
 throw:base('throw',t?'Crushing clinch':s?'Servo toss':'Magnetic throw','throw',{startup:7,active:2,recovery:30,damage:118,level:'throw',reach:1400,height:1300,radius:400,knockdown:true,hitstop:6}),
 super:base('super',t?'Reactor ram':s?'Perfect circuit':'Focused barrage','super',{startup:15,active:12,recovery:40,damage:280,hitstun:44,reach:1700,radius:850,height:1700,travel:t?65:s?85:0,cost:200,knockdown:true,hitstop:10})
 } satisfies Record<InputMove,Move>;
 for(const id of ['special','forwardSpecial'] as const){const m=result[id];if(m.motion==='weaponShot'){
  Object.assign(m,{startup:spec.weapon==='precision_rifle'?32:spec.weapon==='rotary'?22:18,active:spec.weapon==='rotary'?16:3,recovery:spec.weapon==='precision_rifle'?36:30,travel:id==='forwardSpecial'?-35:0,damage:spec.weapon==='rotary'?44:125,projectile:{speed:spec.weapon==='arm_cannon'?180:270,life:55,count:spec.weapon==='rotary'?3:1}});
 }else if(m.motion==='weaponOverhead')Object.assign(m,{level:'overhead',startup:27,height:1450,radius:650});else if(m.motion==='weaponBlades')Object.assign(m,{damage:80,active:10,hitFrames:[0,5]});}
 if(spec.style==='speed')Object.assign(result.super,{damage:108,active:15,push:80,hitFrames:[0,5,10]});
 if(spec.style==='ranged')Object.assign(result.super,{projectile:{speed:235,life:60,count:3},damage:100,active:18});
 for(const m of Object.values(result)){m.startup=rate(m.startup);m.recovery=rate(m.recovery);m.damage=Math.round(m.damage*hitPower);}
 return result;
}
