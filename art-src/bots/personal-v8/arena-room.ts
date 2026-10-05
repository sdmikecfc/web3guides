import * as T from 'three';
import {arenaAtmosphere} from './arena-atmosphere';
export const ARENAS=[
 {id:'spaceship',name:'Starship',note:'Planet-side fight deck',key:'#e7f4ff',rim:'#62b9f2'},
 {id:'colosseum',name:'Colosseum',note:'Sunlit sand & stone',key:'#fff0d2',rim:'#a8ccff'},
 {id:'basement',name:'Underground',note:'After-hours basement fights',key:'#fff0dd',rim:'#72cfc6'},
] as const;
/** Approved 2.5D preview stage with one active Higgsfield loop.
 * A fixed projection keeps the photographed architecture grounded. Combat coordinates
 * and collision bounds are unchanged; this only gives the arena more screen space. */
export function arenaRoom(scene:T.Scene,key:T.DirectionalLight,rim:T.DirectionalLight,redraw:()=>void){
 let current='',texture:T.Texture|null=null,videoTexture:T.VideoTexture|null=null,video:HTMLVideoElement|null=null,generation=0,disposed=false,aspect=1,motion=false,frameId:number|undefined,playError='',playPending=false,frames=0;
 const atmosphere=arenaAtmosphere(scene);let ambientTime=0;
 const geometry=new T.PlaneGeometry(28,28),material=new T.ShadowMaterial({opacity:.29});
 const ground=new T.Mesh(geometry,material);ground.rotation.x=-Math.PI/2;ground.position.y=-.025;ground.receiveShadow=true;scene.add(ground);
 async function choose(id:string){const spec=ARENAS.find(a=>a.id===id)??ARENAS[0],token=++generation;
  const next=await new T.TextureLoader().loadAsync(`/assets/arenas-1/${spec.id}.png`);
  if(disposed||token!==generation){next.dispose();return}next.colorSpace=T.SRGBColorSpace;releaseVideo();texture?.dispose();texture=next;atmosphere.setTexture(next);current=spec.id;
  key.color.set(spec.key);key.intensity=2.35;rim.color.set(spec.rim);rim.intensity=1.6;
  playError='';frames=0;playPending=false;video=document.createElement('video');video.hidden=true;video.dataset.arenaSource=spec.id;document.body.append(video);video.muted=true;video.loop=true;video.playsInline=true;video.preload='auto';video.src=`/assets/arenas-1/${spec.id}.mp4`;
  videoTexture=new T.VideoTexture(video);videoTexture.colorSpace=T.SRGBColorSpace;fit(aspect);
  const source=video;
  const nextFrame=()=>{if(disposed||token!==generation)return;frames++;redraw();frameId=source.requestVideoFrameCallback(nextFrame)};
  frameId=source.requestVideoFrameCallback(nextFrame);
  video.oncanplay=video.onloadeddata=()=>{if(token===generation&&motion){setMotion(true);redraw()}};video.onerror=()=>{if(token===generation){playError=source.error?.message||`Video error ${source.error?.code}`;atmosphere.setTexture(texture);redraw()}};
 }
 function fit(value:number){aspect=value;for(const t of [texture,videoTexture]){if(!t)continue;const ratio=t===videoTexture&&video?.videoWidth?video.videoWidth/video.videoHeight:1672/941;t.repeat.set(Math.min(1,aspect/ratio),Math.min(1,ratio/aspect));t.offset.set((1-t.repeat.x)/2,(1-t.repeat.y)/2);}}
 function setMotion(on:boolean){
  motion=on;if(!video)return;
  // A looping video's readyState can briefly fall during the seek to zero.
  // Pausing during that seek deadlocks ambient playback on some browsers.
  if(!on){video.pause();if(matchMedia('(prefers-reduced-motion: reduce)').matches)atmosphere.setTexture(texture);return}
  if(video.readyState<2)return;
  atmosphere.setTexture(videoTexture);fit(aspect);
  if(video.paused&&!playPending&&!playError){
   const source=video;playPending=true;
   void source.play().catch(error=>{if(video===source){playError=String(error);atmosphere.setTexture(texture);redraw()}})
    .finally(()=>{if(video===source)playPending=false});
  }
 }
 function releaseVideo(){if(video){if(frameId!==undefined)video.cancelVideoFrameCallback(frameId);frameId=undefined;video.pause();video.oncanplay=video.onloadeddata=video.onerror=null;video.removeAttribute('src');video.load();video.remove();video=null}videoTexture?.dispose();videoTexture=null;}
 return {choose,fit,setMotion,animate(time:number){ambientTime=time;atmosphere.update(current,time,motion)},get current(){return current},inspect:()=>({arena:current,videoReady:video?.readyState,videoTime:video?.currentTime,paused:video?.paused,frames,playError,showingVideo:atmosphere.map===videoTexture,ambientTime,ambientMotion:motion,width:video?.videoWidth,height:video?.videoHeight}),dispose(){disposed=true;generation++;releaseVideo();atmosphere.dispose();ground.removeFromParent();geometry.dispose();material.dispose();texture?.dispose()}};
}
