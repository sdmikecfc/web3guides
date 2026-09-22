/** Procedural miniature-workshop audio; cue buffers are cached for the context's
 * lifetime. No sounds or random choices enter the deterministic combat engine. */
export type BotsSfxName = "tick" | "whoosh" | "clank" | "crunch" | "clang-tumble" | "crack" | "bell";
type Cue = BotsSfxName | "drill-turn" | "drill-hit" | "hammer-hit" | "wrench-hit" | "punch" | "kick" | "step" | "roll" | "crowd-break" | "crowd-ko";
export type BotsWeaponSound = "drill" | "hammer" | "wrench" | "blade";
export interface BotsImpactOptions { blocked?: boolean; critical?: boolean; side?: 0 | 1; move?: string }
const SOUND_KEY="bots:sound:v1", MAX_VOICES=14, MASTER_LEVEL=.65, TAU=Math.PI*2;
const DURATIONS:Record<Cue,number>={tick:.055,whoosh:.18,clank:.32,crunch:.18,"clang-tumble":.69,crack:.64,bell:1.15,"drill-turn":.28,"drill-hit":.23,"hammer-hit":.38,"wrench-hit":.48,punch:.16,kick:.20,step:.095,roll:.14,"crowd-break":.95,"crowd-ko":1.75};
const LEVELS:Record<Cue,number>={tick:.16,whoosh:.32,clank:.44,crunch:.48,"clang-tumble":.44,crack:.50,bell:.38,"drill-turn":.25,"drill-hit":.45,"hammer-hit":.59,"wrench-hit":.43,punch:.42,kick:.48,step:.17,roll:.11,"crowd-break":.105,"crowd-ko":.15};
/** Preference only; restoring it never bypasses browser gesture activation. */
export function savedBotsSound():boolean{
  try{return typeof window!=="undefined"&&window.localStorage.getItem(SOUND_KEY)==="on";}catch{return false;}
}
export function weaponSound(id=""):BotsWeaponSound{
  if(/drill/i.test(id))return "drill";if(/hammer|mallet|club/i.test(id))return "hammer";
  if(/wrench|spanner/i.test(id))return "wrench";return "blade";
}
const wave=(hz:number,decay:number,t:number,amount=1)=>Math.sin(TAU*hz*t)*Math.exp(-decay*t)*amount;
const metal=(hz:number,decay:number,t:number)=>wave(hz,decay,t,.48)+wave(hz*1.483,decay*1.2,t,.24)+wave(hz*2.117,decay*1.7,t,.13)+wave(hz*2.73,decay*2,t,.06);
const thump=(hz:number,decay:number,t:number,duration:number)=>Math.sin(TAU*(hz*t-hz*.34*t*t/duration))*Math.exp(-decay*t);
/** Inharmonic resonances for metal, damped modes for rubber/wood, distant soft crowd texture. */
function renderCue(c:AudioContext,cue:Cue):AudioBuffer{
  const duration=DURATIONS[cue],length=Math.ceil(c.sampleRate*duration),crowd=cue.startsWith("crowd");
  const buffer=c.createBuffer(crowd?2:1,length,c.sampleRate);
  const lowRate=1-Math.exp(-TAU*1700/c.sampleRate),softRate=1-Math.exp(-TAU*360/c.sampleRate);
  for(let channel=0;channel<buffer.numberOfChannels;channel++){
    const data=buffer.getChannelData(channel);let seed=(0x4f19ab+channel*137+cue.length*92821)>>>0,low=0,soft=0;
    for(let i=0;i<length;i++){
      const t=i/c.sampleRate,u=t/duration;
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=seed/2147483648-1;low+=lowRate*(noise-low);soft+=softRate*(noise-soft);let sample=0;
      switch(cue){
        case "tick":sample=metal(1150,78,t)*.52;break;
        case "whoosh":sample=low*Math.sin(Math.PI*u)*.7+soft*.22;break;
        case "clank":sample=metal(1380,17,t)*.67+noise*Math.exp(-135*t)*.16;break;
        case "crunch":sample=thump(135,28,t,duration)*.50+low*Math.exp(-35*t)*.68;break;
        case "hammer-hit":sample=thump(83,17,t,duration)*.67+thump(147,28,t,duration)*.16+metal(690,21,t)*.22+low*Math.exp(-62*t)*.4;break;
        case "wrench-hit":sample=metal(720,9,t)*.82+metal(1760,26,t)*.15+noise*Math.exp(-105*t)*.14;break;
        case "drill-turn":{
          const motor=TAU*(155*t+110*t*t/duration);
          sample=(Math.sin(motor+.28*Math.sin(motor*5))*.25+Math.sin(motor*2.03)*.065+low*.24)*Math.sin(Math.PI*Math.pow(u,.7));break;
        }
        case "drill-hit":sample=thump(175,24,t,duration)*.25+metal(1070,20,t)*.30+(noise-low)*(.30+.16*Math.sin(TAU*73*t))*Math.exp(-15*t);break;
        case "punch":sample=thump(116,27,t,duration)*.62+low*Math.exp(-58*t)*.32;break;
        case "kick":sample=thump(91,22,t,duration)*.63+metal(420,35,t)*.12+low*Math.exp(-42*t)*.32;break;
        case "step":sample=thump(180,62,t,duration)*.38+low*Math.exp(-90*t)*.22;break;
        case "roll":sample=soft*Math.sin(Math.PI*u)*(.55+.18*Math.sin(TAU*39*t));break;
        case "clang-tumble":
          for(let n=0;n<3;n++){const q=t-(n===0?0:n===1?.20:.38);if(q>=0)sample+=(Math.sin(TAU*(880+n*270)*q)*.37+Math.sin(TAU*(1490+n*191)*q)*.15+low*.17)*Math.min(1,q/.002)*Math.exp(-q*(15+n*7))*Math.pow(.55,n);}break;
        case "crack":sample=thump(65,12,t,duration)*.52+low*Math.exp(-19*t)*.52+metal(570,24,t)*.18;break;
        case "bell":sample=metal(880,3.8,t)*.80+wave(2253,7.4,t,.08);break;
        case "crowd-break":case "crowd-ko":{
          const swell=Math.pow(Math.sin(Math.PI*u),1.7),murmur=Math.sin(TAU*(177+channel*9)*t+.18*Math.sin(TAU*3.1*t))*.15+Math.sin(TAU*(243-channel*7)*t)*.08;
          sample=(soft*1.6+low*.25+murmur)*swell*(.85+.15*Math.sin(TAU*5.2*t+channel));break;
        }
      }
      const edge=Math.min(1,t/.0025)*Math.min(1,(duration-t)/.018);
      data[i]=Math.max(-.92,Math.min(.92,sample*edge));
    }
  }return buffer;
}
export interface BotsSfx{
  play:(name:BotsSfxName)=>void;muted:()=>boolean;setMuted:(m:boolean)=>void;
  /** Call from Play/speaker gesture when restoring a saved on preference. */
  unlock:()=>void;
  impact:(weaponId?:string,options?:BotsImpactOptions)=>void;
  windup:(weaponId:string,side?:0|1)=>void;
  footstep:(side?:0|1,movement?:"boot"|"wheel"|"track")=>void;
  crowd:(moment:"break"|"ko")=>void;
  /** Cancel voices on pause, seek, replay reset or backgrounding. */
  stop:()=>void;dispose:()=>void;
}
export function createBotsSfx(startUnmuted:boolean):BotsSfx{
  let ctx:AudioContext|null=null,master:GainNode|null=null,compressor:DynamicsCompressorNode|null=null;
  let muted=!startUnmuted,disposed=false,warmTimer:ReturnType<typeof setTimeout>|undefined;
  const buffers=new Map<Cue,AudioBuffer>();
  const voices=new Set<{source:AudioBufferSourceNode;gain:GainNode;pan:StereoPannerNode|null;clean:()=>void}>();
  const lastStep=[-Infinity,-Infinity],lastWindup=[-Infinity,-Infinity];let lastCrowd=-Infinity;
  function bufferFor(cue:Cue){if(!ctx)return undefined;let b=buffers.get(cue);if(!b){b=renderCue(ctx,cue);buffers.set(cue,b);}return b;}
  function warmBank(){
    const remaining=(Object.keys(DURATIONS) as Cue[]).filter(k=>!buffers.has(k));
    const warm=()=>{warmTimer=undefined;if(disposed||!ctx||!remaining.length)return;try{bufferFor(remaining.shift()!);}catch{return;}if(remaining.length)warmTimer=setTimeout(warm,24);};
    if(warmTimer===undefined)warmTimer=setTimeout(warm,0);
  }
  function stop(delay=0):void{
    const t=(ctx?.currentTime??0)+delay;
    for(const v of Array.from(voices))try{v.source.stop(t);}catch{v.clean();}
    lastStep.fill(-Infinity);lastWindup.fill(-Infinity);lastCrowd=-Infinity;
  }
  function unlock():void{
    if(disposed||muted||typeof window==="undefined")return;
    try{
      if(!ctx){
        const activation=navigator.userActivation;if(activation&&!activation.isActive&&!activation.hasBeenActive)return;
        const AC=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!AC)return;
        ctx=new AC();master=ctx.createGain();compressor=ctx.createDynamicsCompressor();master.gain.value=MASTER_LEVEL;
        compressor.threshold.value=-19;compressor.knee.value=20;compressor.ratio.value=3.5;compressor.attack.value=.004;compressor.release.value=.20;
        master.connect(compressor);compressor.connect(ctx.destination);warmBank();
      }if(ctx.state==="suspended")void ctx.resume().catch(()=>undefined);
    }catch{/* Unsupported/blocked audio must never interrupt the fight. */}
  }
  function trigger(cue:Cue,level=1,side?:0|1):boolean{
    if(muted||disposed||!ctx||!master||ctx.state!=="running"||(typeof document!=="undefined"&&document.hidden)||voices.size>=MAX_VOICES)return false;
    let source:AudioBufferSourceNode|undefined,gain:GainNode|undefined,pan:StereoPannerNode|null=null,clean:(()=>void)|undefined;
    try{
      const buffer=bufferFor(cue);if(!buffer)return false;
      source=ctx.createBufferSource();gain=ctx.createGain();source.buffer=buffer;
      const time=ctx.currentTime;source.playbackRate.value=cue.startsWith("crowd")?1:.98+Math.random()*.04;
      gain.gain.setValueAtTime(LEVELS[cue]*Math.min(1.35,Math.max(0,level)),time);source.connect(gain);
      if(side!==undefined&&typeof ctx.createStereoPanner==="function"){pan=ctx.createStereoPanner();pan.pan.value=side===0?-.30:.30;gain.connect(pan);pan.connect(master);}else gain.connect(master);
      const v={source,gain,pan,clean:()=>{voices.delete(v);try{v.source.disconnect();v.gain.disconnect();v.pan?.disconnect();}catch{/* Already closed. */}}};
      clean=v.clean;voices.add(v);source.onended=v.clean;source.start(time);return true;
    }catch{clean?.();try{source?.disconnect();gain?.disconnect();pan?.disconnect();}catch{/* Partial construction. */}return false;}
  }
  function play(name:BotsSfxName){trigger(name);}
  function impact(id="",o:BotsImpactOptions={}){
    const family=weaponSound(id),cue:Cue=o.blocked?"clank":o.move==="kick"?"kick":o.move==="punch"||o.move==="shove"?"punch":family==="drill"?"drill-hit":family==="hammer"?"hammer-hit":family==="wrench"?"wrench-hit":"crunch";
    trigger(cue,o.critical&&!o.blocked?1.2:1,o.side);
  }
  function windup(id:string,side:0|1=0){const t=ctx?.currentTime??0;if(t-lastWindup[side]<.13)return;if(trigger(weaponSound(id)==="drill"?"drill-turn":"tick",1,side))lastWindup[side]=t;}
  function footstep(side:0|1=0,movement:"boot"|"wheel"|"track"="boot"){const t=ctx?.currentTime??0;if(t-lastStep[side]<.17)return;if(trigger(movement==="boot"?"step":"roll",movement==="track"?1.2:1,side))lastStep[side]=t;}
  function crowd(moment:"break"|"ko"){const t=ctx?.currentTime??0;if(moment!=="ko"&&t-lastCrowd<1.6)return;if(trigger(moment==="ko"?"crowd-ko":"crowd-break"))lastCrowd=t;}
  function setMuted(value:boolean){
    if(disposed)return;muted=value;try{window.localStorage.setItem(SOUND_KEY,value?"off":"on");}catch{/* Private storage. */}
    if(!value)unlock();
    if(master&&ctx)try{const t=ctx.currentTime;master.gain.cancelScheduledValues(t);master.gain.setValueAtTime(master.gain.value,t);master.gain.linearRampToValueAtTime(value?0:MASTER_LEVEL,t+.035);if(value)stop(.04);}catch{/* Context interrupted. */}
  }
  const onGesture=(e:Event)=>{if(e.isTrusted&&!muted)unlock();},onVisibility=()=>{if(document.hidden)stop();};
  if(typeof window!=="undefined"){window.addEventListener("pointerdown",onGesture,{passive:true});window.addEventListener("keydown",onGesture,{passive:true});document.addEventListener("visibilitychange",onVisibility);}
  function dispose(){
    if(disposed)return;disposed=true;
    if(typeof window!=="undefined"){window.removeEventListener("pointerdown",onGesture);window.removeEventListener("keydown",onGesture);document.removeEventListener("visibilitychange",onVisibility);}
    if(warmTimer!==undefined)clearTimeout(warmTimer);stop();for(const v of Array.from(voices))v.clean();buffers.clear();
    try{master?.disconnect();compressor?.disconnect();if(ctx&&ctx.state!=="closed")void ctx.close().catch(()=>undefined);}catch{/* Already closed. */}
    ctx=null;master=null;compressor=null;
  }
  return{play,muted:()=>muted,setMuted,unlock,impact,windup,footstep,crowd,stop,dispose};
}
