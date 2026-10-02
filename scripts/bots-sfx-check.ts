import assert from "node:assert/strict";
import { createBotsSfx, savedBotsSound, weaponSound } from "../src/app/bots/_view/sfx";
const contexts:any[]=[], listeners=new Map<string,Set<Function>>(),storage=new Map<string,string>();
const add=(k:string,f:Function)=>{if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k)!.add(f);};
const remove=(k:string,f:Function)=>listeners.get(k)?.delete(f);
const param=()=>({value:1,setValueAtTime(v:number){this.value=v;},cancelScheduledValues(){},linearRampToValueAtTime(v:number){this.value=v;}});
class Node {gain=param();pan=param();threshold=param();knee=param();ratio=param();attack=param();release=param();disconnected=false;connect(){}disconnect(){this.disconnected=true;}}
class Context {
 sampleRate=44100;currentTime=1;state="running";destination={};buffers:any[]=[];sources:any[]=[];nodes:Node[]=[];
 constructor(){contexts.push(this);} createGain(){const n=new Node();this.nodes.push(n);return n;}createStereoPanner(){return this.createGain();}createDynamicsCompressor(){return this.createGain();}
 createBuffer(channels:number,length:number,sampleRate:number){const rows=Array.from({length:channels},()=>new Float32Array(length));const b={numberOfChannels:channels,length,sampleRate,getChannelData:(i:number)=>rows[i]};this.buffers.push(b);return b;}
 createBufferSource(){const n:any=new Node();n.playbackRate=param();n.start=()=>{n.started=true;};n.stop=()=>n.onended?.();this.sources.push(n);return n;}
 resume(){this.state="running";return Promise.resolve();}close(){this.state="closed";return Promise.resolve();}
}
const activation={isActive:false,hasBeenActive:false};
Object.defineProperty(globalThis,"navigator",{value:{userActivation:activation},configurable:true});
Object.assign(globalThis,{window:{AudioContext:Context,addEventListener:add,removeEventListener:remove,localStorage:{getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v)}},document:{hidden:false,addEventListener:add,removeEventListener:remove}});
const initial=createBotsSfx(true);initial.play("bell");initial.unlock();assert.equal(contexts.length,0,"no context before gesture");initial.dispose();
const s=createBotsSfx(false);s.play("bell");assert.equal(contexts.length,0);
activation.isActive=activation.hasBeenActive=true;s.setMuted(false);assert.equal(savedBotsSound(),true);assert.equal(contexts.length,1);
const c=contexts[0],start=performance.now();
for(const cue of ["tick","whoosh","clank","crunch","clang-tumble","crack","bell"] as const){s.play(cue);s.stop();}
for(const id of ["weapon.sparkDrill","weapon.pistonHammer","weapon.rustySpanner","weapon.steelSaw"]){s.impact(id,{side:0});s.stop();}
s.impact("weapon.sparkDrill",{move:"punch"});s.stop();s.impact("weapon.sparkDrill",{move:"kick"});s.stop();
s.windup("beginner.v1.weapon.sparkDrill",1);s.stop();s.footstep(0);s.stop();s.footstep(1,"track");s.stop();s.crowd("break");s.stop();s.crowd("ko");s.stop();
assert.equal(c.buffers.length,17);const renderedMs=performance.now()-start;
for(const b of c.buffers)for(let ch=0;ch<b.numberOfChannels;ch++){const data=b.getChannelData(ch);assert(data[0] === 0);assert(data.some((x:number)=>Math.abs(x)>.001));assert(data.every((x:number)=>Number.isFinite(x)&&Math.abs(x)<=.921));assert(Math.abs(data[data.length-1])<.01);}
const sources=c.sources.length;for(let i=0;i<100;i++)s.play("tick");assert.equal(c.sources.length-sources,14,"voice cap");assert.equal(c.buffers.length,17,"reuses bank");s.stop();
const n=c.sources.length;s.footstep(0);s.footstep(0);assert.equal(c.sources.length,n+1,"footstep rate limit");s.stop();
s.play("bell");s.setMuted(true);assert.equal(savedBotsSound(),false);const mutedCount=c.sources.length;s.play("bell");s.impact("weapon.sparkDrill");assert.equal(c.sources.length,mutedCount);assert(c.sources.every((x:any)=>x.disconnected));
s.dispose();s.dispose();s.setMuted(false);s.unlock();s.play("bell");assert.equal(contexts.length,1,"disposed API cannot resurrect context");assert.equal(c.state,"closed");assert(c.nodes.every((n:Node)=>n.disconnected));assert(Array.from(listeners.values()).every(s=>s.size===0));
assert.equal(weaponSound("beginner.v1.weapon.sparkDrill"),"drill");assert.equal(weaponSound("weapon.pistonHammer"),"hammer");assert.equal(weaponSound("weapon.rustySpanner"),"wrench");
console.log(`SFX lifecycle/buffer checks passed;17-cue44100Hz bank rendered in ${Math.round(renderedMs)}ms locally, once then reused.`);
