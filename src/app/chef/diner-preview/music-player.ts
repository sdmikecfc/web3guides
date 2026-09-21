import { DINER_MUSIC_SCORE, layerGain, validMusicManifest, type MusicContext, type MusicManifest, type MusicTrack, type MusicLayer } from '@/lib/chef/diner/music-score';

type TrackId='home'|'truck';
type Decoded={layer:MusicLayer;buffer:AudioBuffer};
type Voice={source:AudioBufferSourceNode;envelope:GainNode;gain:GainNode;layer:MusicLayer;start:number;session:number;retiring?:boolean};
type Session={id:TrackId;spec:MusicTrack;decoded:Decoded[];epoch:number;serial:number;nextStart:number};

/** One audio clock. Stems share their beat grid; full mixes overlap at their
 * real audio boundaries and never borrow an unverified BPM from a prompt. */
export function createDinerMusic(){
  let context:AudioContext|null=null,bus:GainNode|null=null,enabled=true,volume=.35,active=false,disposed=false,hidden=false;
  let scene:MusicContext='home',manifest:MusicManifest={version:1,tracks:{}},manifestLoaded=false,manifestLoading=false;
  let current:Session|null=null,pending:(Session&{at:number})|null=null,loading:TrackId|null=null,generation=0,serial=0;
  let timer:ReturnType<typeof setInterval>|null=null,nextNote=0,noteIndex=0,fallback=true;
  const voices=new Set<Voice>(),notes=new Set<{source:OscillatorNode;gain:GainNode}>(),buffers=new Map<string,Promise<AudioBuffer>>(),abort=new AbortController();
  const trackId=():TrackId=>scene==='home'?'home':'truck';
  const visible=()=>!hidden&&(typeof document==='undefined'||!document.hidden);
  const playable=()=>!disposed&&active&&enabled&&visible();
  // Mastered recordings already have controlled loudness. Preserve the older
  // synth/stem balance locally instead of attenuating every source at the bus.
  const legacyGain=.32;
  const amplitude=()=>enabled?volume:0;
  const assetGain=(layer:MusicLayer)=>layerGain(scene,layer)*(layer==='mix'?1:legacyGain);
  function ramp(node:GainNode,value:number,at:number,seconds:number){
    const param=node.gain;
    if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(at);
    else{const held=param.value;param.cancelScheduledValues(at);param.setValueAtTime(held,at);}
    param.linearRampToValueAtTime(value,at+seconds);
  }
  function removeVoice(voice:Voice){voices.delete(voice);voice.source.disconnect();voice.envelope.disconnect();voice.gain.disconnect();}
  function stopVoice(voice:Voice,at:number,fade:number){
    // A source scheduled for a later scene must never wake after switching back.
    if(voice.start>context!.currentTime+.001){try{voice.source.stop();}catch{}removeVoice(voice);return;}
    if(voice.retiring)return;voice.retiring=true;
    ramp(voice.envelope,0,at,fade);try{voice.source.stop(at+fade+.01);}catch{removeVoice(voice);}
  }
  function silenceNotes(at:number,fade=.08){
    for(const note of notes){ramp(note.gain,0,at,fade);try{note.source.stop(at+fade+.01);}catch{note.source.disconnect();note.gain.disconnect();notes.delete(note);}}
  }
  function tone(midi:number,at:number,duration:number,level:number){
    if(!context||!bus)return;const source=context.createOscillator(),gain=context.createGain(),note={source,gain};source.type='triangle';source.frequency.value=440*2**((midi-69)/12);
    gain.gain.setValueAtTime(.0001*legacyGain,at);gain.gain.exponentialRampToValueAtTime(level*legacyGain,at+.025);gain.gain.exponentialRampToValueAtTime(.0001*legacyGain,at+duration);source.connect(gain);gain.connect(bus);notes.add(note);
    source.onended=()=>{notes.delete(note);source.disconnect();gain.disconnect();};source.start(at);source.stop(at+duration+.05);
  }
  function crossfade(spec:MusicTrack){return spec.mode==='mix'?Math.min(spec.crossfadeSeconds??1.5,(spec.loopEnd-spec.loopStart)/2):1.5;}
  function addVoice(session:Session,entry:Decoded,at:number,fadeIn:number){
    if(!context||!bus)return;const source=context.createBufferSource(),envelope=context.createGain(),gain=context.createGain(),voice={source,envelope,gain,layer:entry.layer,start:at,session:session.serial};
    source.buffer=entry.buffer;source.connect(envelope);envelope.connect(gain);gain.connect(bus);gain.gain.value=assetGain(entry.layer);envelope.gain.setValueAtTime(0,at);envelope.gain.linearRampToValueAtTime(1,at+fadeIn);
    const spec=session.spec;source.onended=()=>removeVoice(voice);voices.add(voice);
    if(spec.mode==='mix'){
      const length=spec.loopEnd-spec.loopStart,fade=crossfade(spec);envelope.gain.setValueAtTime(1,at+length-fade);envelope.gain.linearRampToValueAtTime(0,at+length);source.start(at,spec.loopStart,length);
    }else{source.loop=true;source.loopStart=spec.loopStart;source.loopEnd=spec.loopEnd;source.start(at,spec.loopStart);}
  }
  function phraseBoundary(session:Session){
    if(session.spec.mode==='mix')return context!.currentTime+.04;
    const phrase=4*session.spec.beatsPerBar*60/session.spec.bpm;return session.epoch+Math.ceil(Math.max(0,context!.currentTime+.03-session.epoch)/phrase)*phrase;
  }
  function begin(next:Session&{at:number}){
    if(!context||!playable())return;const fade=(next.spec.mode==='mix'||current?.spec.mode==='mix') ? .8 : 1.5;
    for(const voice of voices)stopVoice(voice,next.at,fade);
    silenceNotes(next.at);fallback=false;current={...next,epoch:next.at,nextStart:next.at};pending=null;
    for(const entry of next.decoded)addVoice(current,entry,next.at,Math.min(fade,(next.spec.loopEnd-next.spec.loopStart)/4));
    if(next.spec.mode==='mix')current.nextStart=next.at+next.spec.loopEnd-next.spec.loopStart-crossfade(next.spec);
  }
  function updateLayers(){
    if(!context||!current)return;const at=current.spec.mode==='mix'?context.currentTime:phraseBoundary(current),seconds=current.spec.mode==='mix'?.35:60/current.spec.bpm;
    for(const voice of voices)if(voice.session===current.serial)ramp(voice.gain,assetGain(voice.layer),at,seconds);
  }
  function schedule(){
    if(!context||!playable()||context.state!=='running')return;const now=context.currentTime;
    if(pending&&pending.at<now+.3)begin({...pending,at:Math.max(pending.at,now+.015)});
    if(current?.spec.mode==='mix'&&!fallback){
      if(current.nextStart<now-.3)current.nextStart=now+.03;
      while(current.nextStart<now+.3){for(const entry of current.decoded)addVoice(current,entry,current.nextStart,crossfade(current.spec));current.nextStart+=current.spec.loopEnd-current.spec.loopStart-crossfade(current.spec);}
    }
    if(!fallback)return;if(nextNote<now-.5)nextNote=now+.03;
    while(nextNote<now+.3){tone(DINER_MUSIC_SCORE.melody[noteIndex%24],nextNote,.56,.24);if(noteIndex%3===0)tone(DINER_MUSIC_SCORE.bass[Math.floor(noteIndex/6)%4],nextNote,1.4,scene==='truck-prep'?.1:.18);noteIndex++;nextNote+=DINER_MUSIC_SCORE.noteSeconds;}
  }
  function decode(url:string,ctx:AudioContext){
    let result=buffers.get(url);if(result)return result;
    result=(async()=>{const response=await fetch(url,{signal:abort.signal});if(!response.ok)throw new Error('Music unavailable');const bytes=await response.arrayBuffer();if(disposed||ctx!==context)throw new Error('Music session ended');return ctx.decodeAudioData(bytes);})();
    buffers.set(url,result);void result.catch(()=>{if(buffers.get(url)===result)buffers.delete(url);});return result;
  }
  async function selectTrack(){
    if(!context||!bus||!manifestLoaded||!playable()||context.state!=='running')return;
    const id=trackId();if(current?.id===id){pending=null;updateLayers();return;}if(loading===id||pending?.id===id)return;
    const spec=manifest.tracks[id],request=++generation,ctx=context;loading=id;
    if(!spec){for(const voice of voices)stopVoice(voice,ctx.currentTime,.2);current=null;pending=null;loading=null;fallback=true;nextNote=ctx.currentTime+.03;return;}
    try{
      const decoded=await Promise.all((Object.entries(spec.layers) as [MusicLayer,string][]).map(async([layer,url])=>{const buffer=await decode(url,ctx);if(!Number.isFinite(buffer.duration)||buffer.duration+.005<spec.loopEnd)throw new Error('Music loop exceeds its audio');return {layer,buffer};}));
      if(disposed||request!==generation||ctx!==context||!playable()||ctx.state!=='running')return;
      const at=current&&current.spec.mode!=='mix'&&spec.mode!=='mix'?phraseBoundary(current):ctx.currentTime+.04;
      pending={id,spec,decoded,at,epoch:at,serial:++serial,nextStart:at};schedule();
    }catch{if(request===generation&&!disposed&&context){for(const voice of voices)stopVoice(voice,context.currentTime,.2);current=null;pending=null;fallback=true;nextNote=context.currentTime+.03;schedule();}}
    finally{if(request===generation)loading=null;}
  }
  async function syncContext(){
    const ctx=context;if(!ctx||disposed)return;
    try{if(playable()){await ctx.resume();if(disposed||ctx!==context)return;if(!playable()){await ctx.suspend();return;}if(bus)ramp(bus,amplitude(),ctx.currentTime,.15);void selectTrack();schedule();}else await ctx.suspend();}catch{/* A browser audio restriction must not interrupt play. */}
  }
  function cancelSelection(){generation++;loading=null;pending=null;}
  async function activate(){
    if(disposed)return;active=true;if(!enabled||!visible())return;
    try{
      if(!context){context=new AudioContext();bus=context.createGain();bus.gain.value=amplitude();bus.connect(context.destination);nextNote=context.currentTime+.03;timer=setInterval(schedule,100);}
      await syncContext();
      if(!manifestLoaded&&!manifestLoading){manifestLoading=true;void fetch('/diner-audio/manifest.json',{signal:abort.signal}).then(r=>r.ok?r.json():null).then(value=>{if(disposed)return;manifestLoaded=true;if(validMusicManifest(value))manifest=value;void selectTrack();}).catch(()=>{if(!disposed)manifestLoaded=true;}).finally(()=>{manifestLoading=false;});}
    }catch{/* Unsupported or suspended audio must never interrupt the restaurant. */}
  }
  return {
    activate,
    setContext(value:MusicContext){const changed=trackId()!==(value==='home'?'home':'truck');scene=value;if(changed){cancelSelection();if(context){for(const voice of voices)if(voice.start>context.currentTime+.001)stopVoice(voice,context.currentTime,0);if(current&&current.epoch>context.currentTime+.001)current=null;}void selectTrack();}else updateLayers();},
    setVolume(value:number){volume=Math.max(0,Math.min(1,Number.isFinite(value)?value:.35));if(bus&&context)ramp(bus,amplitude(),context.currentTime,.2);},
    setEnabled(value:boolean){if(enabled===value)return;enabled=value;if(!value)cancelSelection();if(bus&&context)ramp(bus,amplitude(),context.currentTime,.05);if(value&&active)void activate();else void syncContext();},
    setHidden(value:boolean){hidden=value;if(value)cancelSelection();void syncContext();},
    destroy(){if(disposed)return;disposed=true;cancelSelection();abort.abort();if(timer)clearInterval(timer);for(const voice of voices){try{voice.source.stop();}catch{}removeVoice(voice);}for(const note of notes){try{note.source.stop();}catch{}note.source.disconnect();note.gain.disconnect();}notes.clear();if(bus)bus.disconnect();if(context)void context.close().catch(()=>{});buffers.clear();},
  };
}
