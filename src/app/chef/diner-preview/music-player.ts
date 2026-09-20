import { DINER_MUSIC_SCORE, layerGain, validMusicManifest, type MusicContext, type MusicManifest, type MusicTrack, type MusicLayer } from '@/lib/chef/diner/music-score';

/** One music clock. Loaded stems always share their start time and loop points. */
export function createDinerMusic() {
  let context: AudioContext | null = null, bus: GainNode | null = null, enabled = true, volume = .35, active = false, disposed = false;
  let scene: MusicContext = 'home', manifest: MusicManifest = {version:1,tracks:{}}, loadedManifest = false;
  let currentTrack: 'home'|'truck'|null = null, epoch = 0, timer: ReturnType<typeof setInterval>|null = null, generation = 0;
  let nextNote = 0, noteIndex = 0, fallback = true;
  const stems: {source:AudioBufferSourceNode; gain:GainNode; layer:MusicLayer}[] = [];
  const retiring = new Set<{source:AudioBufferSourceNode;gain:GainNode}>();
  const pendingNotes = new Set<OscillatorNode>();
  const buffers = new Map<string,AudioBuffer>();
  const abort = new AbortController();
  const targetTrack = () => scene === 'home' ? 'home' : 'truck';
  const amplitude = () => enabled ? volume * .32 : 0;
  function ramp(gain: GainNode, value: number, at: number, seconds: number) {
    gain.gain.cancelScheduledValues(at); gain.gain.setValueAtTime(gain.gain.value, at); gain.gain.linearRampToValueAtTime(value, at + seconds);
  }
  function tone(midi:number, at:number, duration:number, level:number) {
    if (!context || !bus) return;
    const osc=context.createOscillator(), gain=context.createGain(); osc.type='triangle';osc.frequency.value=440*2**((midi-69)/12);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(level,at+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain);gain.connect(bus);pendingNotes.add(osc);osc.onended=()=>{pendingNotes.delete(osc);osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+duration+.05);
  }
  function schedule() {
    if (!context || !active || disposed || context.state !== 'running' || !fallback || !enabled) return;
    if (nextNote < context.currentTime - .5) nextNote = context.currentTime + .03;
    while (nextNote < context.currentTime + .3) {
      tone(DINER_MUSIC_SCORE.melody[noteIndex % 24],nextNote,.56,.24);
      if (noteIndex%3===0) tone(DINER_MUSIC_SCORE.bass[Math.floor(noteIndex/6)%4],nextNote,1.4,scene==='truck-prep'?.1:.18);
      noteIndex++;nextNote+=DINER_MUSIC_SCORE.noteSeconds;
    }
  }
  function boundary(track:MusicTrack) {
    const phrase = 4 * track.beatsPerBar * 60 / track.bpm;
    return epoch + Math.ceil(Math.max(0,context!.currentTime+.03-epoch)/phrase)*phrase;
  }
  function updateLayers() {
    const track=manifest.tracks[targetTrack()]; if (!context || !track) return;
    const at=boundary(track); for(const stem of stems) ramp(stem.gain,layerGain(scene,stem.layer),at,60/track.bpm);
  }
  async function selectTrack() {
    if (!context || !bus || disposed) return;
    const id=targetTrack(), spec=manifest.tracks[id],request=++generation;
    if (currentTrack===id) { updateLayers();return; }
    if (!spec) { stopStems();currentTrack=null;fallback=true;nextNote=context.currentTime+.03;return; }
    try {
      const entries=Object.entries(spec.layers) as [MusicLayer,string][];
      const decoded=await Promise.all(entries.map(async ([layer,url])=>{
        let buffer=buffers.get(url);if(!buffer){const response=await fetch(url,{signal:abort.signal});if(!response.ok)throw new Error('Music unavailable');buffer=await context!.decodeAudioData(await response.arrayBuffer());buffers.set(url,buffer);}
        if(buffer.duration+.01<spec.loopEnd)throw new Error('Music loop exceeds its audio');return {layer,buffer};
      }));
      if(disposed || request!==generation || !context || !bus)return;
      const previous=currentTrack&&manifest.tracks[currentTrack],start=previous?boundary(previous):context.currentTime+.08;
      stopStems(start,1.5);fallback=false;currentTrack=id;epoch=start;
      for(const {layer,buffer} of decoded){const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.loop=true;source.loopStart=spec.loopStart;source.loopEnd=spec.loopEnd;gain.gain.value=0;gain.gain.linearRampToValueAtTime(layerGain(scene,layer),epoch+1.5);source.connect(gain);gain.connect(bus);source.start(epoch,spec.loopStart);stems.push({source,gain,layer});}
    } catch { if(request===generation&&!disposed){stopStems();currentTrack=null;fallback=true;nextNote=context!.currentTime+.03;} }
  }
  function stopStems(at?:number,fade=0){for(const stem of stems){if(at!==undefined&&fade>0){retiring.add(stem);ramp(stem.gain,0,at,fade);stem.source.onended=()=>{retiring.delete(stem);stem.source.disconnect();stem.gain.disconnect();};try{stem.source.stop(at+fade+.02);}catch{retiring.delete(stem);stem.source.disconnect();stem.gain.disconnect();}}else{try{stem.source.stop();}catch{}stem.source.disconnect();stem.gain.disconnect();}}stems.length=0;}
  async function activate(){
    if(disposed)return;active=true;
    try{
      if(!context){context=new AudioContext();bus=context.createGain();bus.gain.value=amplitude();bus.connect(context.destination);nextNote=context.currentTime+.03;timer=setInterval(schedule,100);}
      if(enabled&&typeof document!=='undefined'&&!document.hidden)await context.resume();
      if(!loadedManifest){loadedManifest=true;void fetch('/diner-audio/manifest.json',{signal:abort.signal}).then(r=>r.ok?r.json():null).then(value=>{if(!disposed&&validMusicManifest(value)){manifest=value;void selectTrack();}}).catch(()=>{});}
      schedule();
    }catch{/* Unsupported or suspended audio must never interrupt the restaurant. */}
  }
  return {
    activate,
    setContext(value:MusicContext){const changed=targetTrack()!==(value==='home'?'home':'truck');scene=value;if(changed)void selectTrack();else updateLayers();},
    setVolume(value:number){volume=Math.max(0,Math.min(1,Number.isFinite(value)?value:.35));if(bus&&context)ramp(bus,amplitude(),context.currentTime,.2);},
    setEnabled(value:boolean){enabled=value;if(bus&&context)ramp(bus,amplitude(),context.currentTime,.3);if(value&&active)void activate();},
    setHidden(value:boolean){if(!context)return;if(value)void context.suspend();else if(active&&enabled)void context.resume().catch(()=>{});},
    destroy(){disposed=true;generation++;abort.abort();if(timer)clearInterval(timer);stopStems();for(const stem of retiring){try{stem.source.stop();}catch{}stem.source.disconnect();stem.gain.disconnect();}retiring.clear();for(const note of pendingNotes){try{note.stop();}catch{}note.disconnect();}pendingNotes.clear();if(bus)bus.disconnect();if(context)void context.close().catch(()=>{});buffers.clear();},
  };
}
