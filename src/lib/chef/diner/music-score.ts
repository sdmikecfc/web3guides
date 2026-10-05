/** Original diner sketch. Kept as data so the reference export and fallback agree. */
export const DINER_MUSIC_SCORE = {
  noteSeconds: .44,
  meter: [3, 4],
  melody: [72,76,79,76,74,71,67,71,69,72,76,72,74,77,76,71,72,79,76,74,71,67,69,71],
  bass: [48,48,53,55],
} as const;

export type MusicContext = 'home' | 'truck-prep' | 'truck-service' | 'truck-busy';
export type MusicLayer = 'harmony' | 'bass' | 'percussion' | 'lift' | 'mix';
interface MusicLoop {loopStart:number;loopEnd:number}
export interface StemMusicTrack extends MusicLoop {
  mode?: 'stems';
  bpm: number;
  beatsPerBar: number;
  loopStart: number;
  loopEnd: number;
  layers: Partial<Record<Exclude<MusicLayer,'mix'>, string>>;
}
/** Full recordings have no measured beat grid. Never infer tempo from a prompt. */
export interface MixMusicTrack extends MusicLoop {mode:'mix';crossfadeSeconds?:number;layers:{mix:string}}
export type MusicTrack = StemMusicTrack | MixMusicTrack;
export interface MusicManifest { version: 1; tracks: Partial<Record<'home'|'truck', MusicTrack>> }
export function validMusicManifest(value: unknown): value is MusicManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as MusicManifest;
  if (m.version !== 1 || !m.tracks || typeof m.tracks !== 'object' || Array.isArray(m.tracks)) return false;
  return Object.entries(m.tracks).every(([id,t])=>{
    if(!['home','truck'].includes(id)||!t||typeof t!=='object'||Array.isArray(t)||!Number.isFinite(t.loopStart)||t.loopStart<0||!Number.isFinite(t.loopEnd)||t.loopEnd<=t.loopStart||t.loopEnd>600||!t.layers||typeof t.layers!=='object'||Array.isArray(t.layers))return false;
    const paths=Object.entries(t.layers);if(!paths.length||!paths.every(([,path])=>typeof path==='string'&&/^\/diner-audio\/[a-z0-9/_-]+\.(ogg|mp3|wav)$/.test(path)))return false;
    if(t.mode==='mix')return paths.length===1&&typeof t.layers.mix==='string'&&(t.crossfadeSeconds===undefined||Number.isFinite(t.crossfadeSeconds)&&t.crossfadeSeconds>=.05&&t.crossfadeSeconds<=10&&t.crossfadeSeconds<=(t.loopEnd-t.loopStart)/2);
    return (t.mode===undefined||t.mode==='stems')&&Number.isFinite(t.bpm)&&t.bpm>=40&&t.bpm<=240&&[3,4].includes(t.beatsPerBar)&&typeof t.layers.harmony==='string'&&paths.every(([name])=>['harmony','bass','percussion','lift'].includes(name));
  });
}
export function layerGain(context: MusicContext, layer: MusicLayer): number {
  if(layer==='mix')return context==='truck-prep'?.65:.8;
  if (layer === 'harmony') return .8;
  if (layer === 'bass') return context === 'truck-prep' ? .3 : .8;
  if (layer === 'percussion') return context === 'truck-prep' ? 0 : context === 'home' ? .38 : .65;
  return context === 'truck-busy' ? .55 : 0;
}
