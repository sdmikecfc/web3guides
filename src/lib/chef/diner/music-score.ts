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
export interface MixMusicTrack extends MusicLoop {mode:'mix';title?:string;crossfadeSeconds?:number;layers:{mix:string}}
export type MusicTrack = StemMusicTrack | MixMusicTrack;
export type MusicScene = 'home'|'truck';
export type MusicManifest = {version:1;tracks:Partial<Record<MusicScene,MusicTrack>>} | {version:2;playlists:Record<MusicScene,MixMusicTrack[]>};
export function musicPlaylist(manifest:MusicManifest,scene:MusicScene):MusicTrack[]{
  return manifest.version===2?manifest.playlists[scene]:manifest.tracks[scene]?[manifest.tracks[scene]!]:[];
}
export const musicTrackKey=(track:MusicTrack):string=>Object.values(track.layers).join('|');
/** Play every song once before reshuffling, without repeating the last song at
 * a bag boundary (or after reopening the game with saved listening history). */
export function shuffledMusic(tracks:MusicTrack[],last:string|null,random= Math.random):MusicTrack[]{
  const bag=[...tracks];
  for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}
  if(bag.length>1&&musicTrackKey(bag[0])===last){const j=1+Math.floor(random()*(bag.length-1));[bag[0],bag[j]]=[bag[j],bag[0]];}
  return bag;
}
export function validMusicManifest(value: unknown): value is MusicManifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as MusicManifest;
  const validTrack=(t:MusicTrack)=>{
    if(!t||typeof t!=='object'||Array.isArray(t)||!Number.isFinite(t.loopStart)||t.loopStart<0||!Number.isFinite(t.loopEnd)||t.loopEnd<=t.loopStart||t.loopEnd>600||!t.layers||typeof t.layers!=='object'||Array.isArray(t.layers))return false;
    const paths=Object.entries(t.layers);if(!paths.length||!paths.every(([,path])=>typeof path==='string'&&/^\/diner-audio\/[a-z0-9/_-]+\.(ogg|mp3|wav)$/.test(path)))return false;
    if(t.mode==='mix')return paths.length===1&&typeof t.layers.mix==='string'&&(t.title===undefined||typeof t.title==='string'&&t.title.length<=100)&&(t.crossfadeSeconds===undefined||Number.isFinite(t.crossfadeSeconds)&&t.crossfadeSeconds>=.05&&t.crossfadeSeconds<=10&&t.crossfadeSeconds<=(t.loopEnd-t.loopStart)/2);
    return (t.mode===undefined||t.mode==='stems')&&Number.isFinite(t.bpm)&&t.bpm>=40&&t.bpm<=240&&[3,4].includes(t.beatsPerBar)&&typeof t.layers.harmony==='string'&&paths.every(([name])=>['harmony','bass','percussion','lift'].includes(name));
  };
  if(m.version===2)return !!m.playlists&&typeof m.playlists==='object'&&!Array.isArray(m.playlists)&&Object.keys(m.playlists).length===2&&['home','truck'].every(id=>{
    const list=m.playlists[id as MusicScene];return Array.isArray(list)&&list.length>0&&list.length<=12&&list.every(t=>!!t&&t.mode==='mix'&&validTrack(t))&&new Set(list.map(musicTrackKey)).size===list.length;
  });
  return m.version===1&&!!m.tracks&&typeof m.tracks==='object'&&!Array.isArray(m.tracks)&&Object.entries(m.tracks).every(([id,t])=>['home','truck'].includes(id)&&validTrack(t));
}
export function layerGain(context: MusicContext, layer: MusicLayer): number {
  if(layer==='mix')return context==='truck-prep'?.65:.8;
  if (layer === 'harmony') return .8;
  if (layer === 'bass') return context === 'truck-prep' ? .3 : .8;
  if (layer === 'percussion') return context === 'truck-prep' ? 0 : context === 'home' ? .38 : .65;
  return context === 'truck-busy' ? .55 : 0;
}
