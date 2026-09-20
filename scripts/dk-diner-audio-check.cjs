/** No-browser checks of the diner-owned synth's buses and teardown. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('../node_modules/typescript/lib/typescript.js');
const filename=path.resolve(__dirname,'../src/app/chef/diner-preview/audio.ts');
const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;

function fixture(available=true){
  const contexts=[],timers=new Map();let timerId=0,cleared=0;
  class Param {
    constructor(value=0){this.value=value;this.events=[];}
    setValueAtTime(value,time){this.value=value;this.events.push(['set',value,time]);}
    linearRampToValueAtTime(value,time){this.value=value;this.events.push(['linear',value,time]);}
    exponentialRampToValueAtTime(value,time){this.value=value;this.events.push(['exponential',value,time]);}
    cancelScheduledValues(time){this.events.push(['cancel',time]);}
  }
  class Node {
    constructor(){this.outputs=[];this.starts=[];this.stops=[];this.disconnected=false;}
    connect(target){this.outputs.push(target);return target;}
    disconnect(){this.disconnected=true;this.outputs=[];}
    start(time){this.starts.push(time??0);}
    stop(time){this.stops.push(time??0);}
  }
  class AudioContext {
    constructor(){this.currentTime=10;this.sampleRate=100;this.state='running';this.destination=new Node();this.gains=[];this.oscillators=[];this.buffers=[];this.compressors=[];this.closeCalls=0;this.resumeCalls=0;contexts.push(this);}
    createGain(){const node=new Node();node.gain=new Param(1);this.gains.push(node);return node;}
    createOscillator(){const node=new Node();node.frequency=new Param();node.detune=new Param();this.oscillators.push(node);return node;}
    createBufferSource(){const node=new Node();this.buffers.push(node);return node;}
    createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)};}
    createBiquadFilter(){const node=new Node();node.frequency=new Param();node.Q=new Param();return node;}
    createDynamicsCompressor(){const node=new Node();for(const name of ['threshold','knee','ratio','attack','release'])node[name]=new Param();this.compressors.push(node);return node;}
    resume(){this.resumeCalls++;this.state='running';return Promise.resolve();}
    close(){this.closeCalls++;this.state='closed';return Promise.resolve();}
  }
  const module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,window:available?{AudioContext}:{},console,Math,Float32Array,setInterval(callback){const id=++timerId;timers.set(id,callback);return id;},clearInterval(id){assert(timers.has(id),'timer cleared more than once');timers.delete(id);cleared++;}},{filename});
  const advance=()=>{for(const context of contexts)context.currentTime+=1;for(const callback of [...timers.values()])callback();};
  const buses=()=>{const context=contexts[0];return {music:context.gains.find(gain=>gain.outputs.includes(context.destination)),effects:context.gains.find(gain=>gain.outputs.includes(context.compressors[0]))};};
  return {create:module.exports.createDkSfx,contexts,timers,advance,buses,get cleared(){return cleared;}};
}
let groups=0;
function test(name,run){run();groups++;console.log(`PASS ${name}`);}

test('audio stays lazy and a muted start cannot allocate a context or start sounds',()=>{
  const f=fixture(),audio=f.create(false);assert(audio.muted());assert(audio.musicMuted());audio.play('serve');assert.equal(f.contexts.length,0);assert.equal(f.timers.size,0);
  audio.setMuted(false);audio.play('serve');assert.equal(f.contexts.length,1);assert.equal(f.timers.size,1);assert(f.contexts[0].oscillators.length>0);audio.destroy();
});
test('the diner master toggle mutes both buses and re-enables them without duplicate music schedulers',()=>{
  const f=fixture(),audio=f.create(true);assert.equal(f.contexts.length,0);audio.play('serve');const context=f.contexts[0],{music,effects}=f.buses();assert(music);assert(effects);
  assert.equal(music.gain.value,.14);assert.equal(effects.gain.value,.9);const before=context.oscillators.length;
  audio.setMuted(true);assert(audio.muted());assert(audio.musicMuted());assert.equal(music.gain.value,0);assert.equal(effects.gain.value,0);audio.play('kaching');assert.equal(context.oscillators.length,before,'muted effects cannot allocate voices');
  f.advance();assert.equal(music.gain.value,0,'the existing score remains inaudible through its muted bus');assert.equal(effects.gain.value,0);
  context.state='suspended';audio.setMuted(false);assert(!audio.muted());assert(!audio.musicMuted());assert.equal(context.resumeCalls,1);assert.equal(music.gain.value,.14);assert.equal(effects.gain.value,.9);assert.equal(f.timers.size,1);
  const resumed=context.oscillators.length;audio.play('heart');assert(context.oscillators.length>resumed);assert.equal(f.contexts.length,1);audio.destroy();
});
test('individual controls remain separate while the master toggle still silences both',()=>{
  const f=fixture(),audio=f.create(true);audio.play('bus');const {music,effects}=f.buses();audio.setEffectsMuted(true);assert.equal(effects.gain.value,0);assert.equal(music.gain.value,.14);
  audio.setEffectsMuted(false);audio.setMusicMuted(true);assert.equal(effects.gain.value,.9);assert.equal(music.gain.value,0);audio.setMuted(true);assert.equal(effects.gain.value,0);assert.equal(music.gain.value,0);audio.destroy();
});
test('destroy clears the interval, stops ambience, closes once, and rejects sound even from a stale callback',()=>{
  const f=fixture(),audio=f.create(true);audio.play('serve');const context=f.contexts[0],ambience=context.buffers.find(buffer=>buffer.loop),lateCallbacks=[...f.timers.values()];assert(ambience);assert.equal(ambience.starts.length,1);
  audio.destroy();assert.equal(f.timers.size,0);assert.equal(f.cleared,1);assert.equal(context.closeCalls,1);assert.equal(context.state,'closed');assert.equal(ambience.stops.length,1);
  const voices=context.oscillators.length,sources=context.buffers.length;audio.play('serve');audio.setMuted(false);audio.setMusicMuted(false);audio.setEffectsMuted(false);audio.play('bus');for(const callback of lateCallbacks)callback();f.advance();audio.destroy();
  assert.equal(context.oscillators.length,voices);assert.equal(context.buffers.length,sources);assert.equal(f.contexts.length,1);assert.equal(f.timers.size,0);assert.equal(f.cleared,1);assert.equal(context.closeCalls,1);
});
test('unavailable Web Audio remains safe across toggles and teardown',()=>{
  const f=fixture(false),audio=f.create(true);audio.play('serve');audio.setMuted(true);audio.setMuted(false);audio.destroy();audio.play('heart');assert.equal(f.contexts.length,0);assert.equal(f.timers.size,0);
});
console.log(`${groups} diner audio lifecycle groups passed. No playback quality or browser-autoplay claim.`);
