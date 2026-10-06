import type {Build,Move,MoveId} from './types';

const normal = (id:MoveId,name:string,startup:number,damage:number,x:number,y:number,extra:Partial<Move>={}):Move => ({id,name,startup,active:3,recovery:15,damage,stun:20,block:11,push:16,level:'mid',limb:'hand',target:{x,y},radius:27,advance:0,cost:0,cancels:[],...extra});
export function moveFor(id:MoveId,b:Build):Move {
 const table:Record<MoveId,Move>={
  jab:normal('jab','Piston jab',8,57,132,179,{level:'high',cancels:['cross','heavy','advance','special']}),
  cross:normal('cross','Cross',9,65,142,171,{advance:1.6,cancels:['heavy','advance','special']}),
  heavy:normal('heavy','Crushing straight',19,113,164,170,{active:4,recovery:26,stun:30,block:16,push:37,advance:1.9,cancels:['advance','special','super']}),
  low:normal('low','Low check',9,48,127,95,{level:'low',limb:'foot',recovery:17,stun:18,cancels:['heavy','ground']}),
  launcher:normal('launcher','Rising piston',19,86,110,250,{active:5,recovery:25,launch:13,stun:29,cancels:['airLight']}),
  step:normal('step','Step-in strike',12,68,141,162,{advance:3.2,recovery:20,cancels:['heavy','special']}),
  overhead:normal('overhead','Hammerfist',23,107,143,145,{level:'overhead',active:4,recovery:30,stun:29,knockdown:true,push:29}),
  airLight:normal('airLight','Aerial check',8,54,126,142,{recovery:15,stun:25,cancels:['airHeavy']}),
  airHeavy:normal('airHeavy','Diving heel',17,98,151,69,{limb:'foot',level:'overhead',recovery:25,knockdown:true,stun:32,push:26}),
  special:normal('special','Hydraulic crusher',16,108,176,159,{limb:'weapon',active:5,recovery:28,stun:29,push:30,cancels:['super']}),
  advance:normal('advance','Armoured advance',21,127,172,161,{advance:5.4,active:6,recovery:33,stun:31,armour:true,knockdown:true}),
  ground:normal('ground','Seismic stomp',23,97,171,20,{limb:'foot',level:'low',radius:46,active:6,recovery:28,stun:29,knockdown:true}),
  throw:normal('throw','Core clinch',7,126,85,155,{level:'throw',active:3,recovery:34,stun:40,push:100,knockdown:true}),
  super:normal('super','Reactor breaker',15,249,188,162,{active:8,recovery:42,advance:7,cost:2000,armour:true,knockdown:true,stun:45,push:100})
 };
 let m={...table[id],target:{...table[id].target}};
 if(b.style==='speed'){
  m.damage*=.91;
  if(id==='special')m={...m,name:'Arc slash',startup:13,target:{x:191,y:164},damage:101,recovery:25};
  if(id==='advance')m={...m,name:'Needle lunge',startup:17,advance:7,armour:false,recovery:33,damage:108,target:{x:187,y:162}};
  if(id==='ground')m={...m,name:'Volt slide',startup:16,advance:6.2,damage:81,target:{x:139,y:31},radius:31};
  if(id==='super')m={...m,name:'Flash rupture',advance:8.2,damage:235};
 }
 if(b.style==='ranged'){
  if(id==='special')m={...m,name:'Core shot',startup:17,active:1,recovery:28,projectile:true,damage:82,target:{x:103,y:166}};
  if(id==='advance')m={...m,name:'Suppression burst',startup:22,active:10,recovery:36,advance:-1.5,armour:false,projectile:true,damage:49,target:{x:103,y:166}};
  if(id==='ground')m={...m,name:'Ground charge',startup:20,active:1,recovery:29,projectile:true,damage:84,advance:0,target:{x:100,y:59}};
  if(id==='super')m={...m,name:'Solar cannon',projectile:true,advance:0,active:1,damage:241,target:{x:103,y:166}};
 }
 if(b.boss){
  if(id==='advance')m={...m,name:'Sovereign ram',startup:24,recovery:38,advance:5.8};
  if(id==='ground')m={...m,name:'Crownquake',startup:26,recovery:34,radius:52};
  if(id==='super')m={...m,name:b.tier===4?'Overload judgement':'Royal demolition',startup:22,recovery:46};
  if(b.tier===4&&id==='special')m={...m,name:'Reactor lance',startup:25,active:1,recovery:35,projectile:true,target:{x:135,y:159},damage:90};
 }
 // Equipment changes handling, but never doubles the gap between archetypes.
 m.startup=Math.max(6,Math.round(m.startup/b.handling));
 m.recovery=Math.max(10,Math.round(m.recovery/b.handling));
 m.damage=Math.round(m.damage*b.damage);
 return m;
}
export const isSignature=(id:MoveId)=>['special','advance','ground','super'].includes(id);
export const totalFrames=(m:Move)=>m.startup+m.active+m.recovery;
