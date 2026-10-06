import {Assets,Rectangle,Texture} from 'pixi.js';
import packed from '../../../../public/bots-arcade/packed-v2/index.json';

export type Atlas={referenceHeight:number;texture:string;frames:{file:string;w:number;h:number;pivotX:number;pivotY:number;x:number;y:number}[]};
const BASE='/bots-arcade/packed-v2/';
const index=packed as {sheets:Record<string,string>;arenas:Record<string,string>};
type Lease={refs:number;promise:Promise<Texture>;unload?:Promise<void>};
const leases=new Map<string,Lease>();
/** Only live views own GPU sources. Browser HTTP caching keeps rematches fast. */
function retain(url:string){
 let entry=leases.get(url);
 if(!entry){entry={refs:0,promise:Assets.load<Texture>(url)};leases.set(url,entry);}
 else if(entry.refs===0&&entry.unload){entry.promise=entry.unload.then(()=>Assets.load<Texture>(url));entry.unload=undefined;}
 entry.refs++;
 let released=false;
 return {promise:entry.promise,release(){if(released)return;released=true;const current=leases.get(url);if(current!==entry)return;if(--current.refs===0){const unload=current.promise.then(()=>Assets.unload(url)).catch(()=>{});current.unload=unload;void unload.then(()=>{if(current.refs===0&&current.unload===unload&&leases.get(url)===current)leases.delete(url)});}}};
}
export async function loadArcadeAtlases(keys:string[],arenaFile:string,progress:(n:number)=>void){
 const owned:ReturnType<typeof retain>[]=[],frames:Texture[]=[];
 let released=false;
 const release=()=>{if(released)return;released=true;frames.forEach(t=>t.destroy(false));owned.forEach(a=>a.release());};
 const load=(url:string)=>{const lease=retain(url);owned.push(lease);return lease.promise;};
 try{
  const atlas:Record<string,Atlas>={},textures:Record<string,Texture[]>={};
  const background=await load(index.arenas[arenaFile]?BASE+index.arenas[arenaFile]:'/bots-arcade/v1/'+arenaFile);
  let cursor=0,done=0;
  const results=await Promise.allSettled(Array.from({length:Math.min(3,keys.length)},async()=>{
   while(cursor<keys.length){const key=keys[cursor++],file=index.sheets[key];if(!file)throw Error('This fighter artwork is not available. Choose another fighter.');
    const response=await fetch(BASE+file);if(!response.ok)throw Error('Fighter artwork could not load. Please retry.');
    const sheet:Atlas=await response.json(),texture=await load(BASE+sheet.texture);
    atlas[key]=sheet;textures[key]=sheet.frames.map(f=>{const t=new Texture({source:texture.source,frame:new Rectangle(f.x,f.y,f.w,f.h)});frames.push(t);return t;});progress(++done/keys.length);
   }
  }));
  const failed=results.find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failed)throw failed.reason;
  return {atlas,textures,background,release};
 }catch(error){release();throw error;}
}
