import * as T from 'three';

/** One bounded backdrop decoder. No simulation, collision or replay decisions. */
export function sideStageMedia(scene:T.Scene){
 const geometry=new T.PlaneGeometry(2,2),material=new T.MeshBasicMaterial({fog:false,toneMapped:false,depthTest:false,depthWrite:false});
 material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','gl_Position = vec4(position.xy, 0.9999, 1.0);');};
 material.customProgramCacheKey=()=> 'mk-side-backdrop-2';
 const plane=new T.Mesh(geometry,material);plane.frustumCulled=false;plane.renderOrder=-10000;plane.visible=false;scene.add(plane);
 let poster:T.Texture|null=null,videoTexture:T.VideoTexture|null=null,video:HTMLVideoElement|null=null;
 let generation=0,motion=false,disposed=false,frames=0,error='',frameCallback:number|undefined;
 const configure=<Texture extends T.Texture>(texture:Texture):Texture=>{texture.colorSpace=T.SRGBColorSpace;texture.minFilter=T.LinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;texture.offset.y=.34;texture.repeat.y=.66;return texture;};
 const show=(texture:T.Texture|null)=>{material.map=texture;material.needsUpdate=true;plane.visible=!!texture;};
 const halt=()=>{if(video){video.pause();if(frameCallback!==undefined)video.cancelVideoFrameCallback?.(frameCallback);video.removeAttribute('src');video.load();video.remove();}video=null;frameCallback=undefined;videoTexture?.dispose();videoTexture=null;};
 function playback(){
  if(!video)return;
  if(!motion||document.hidden){video.pause();show(poster);return;}
  const playing=video,token=generation;
  void playing.play().then(()=>{if(token===generation&&!disposed&&motion&&!document.hidden&&videoTexture)show(videoTexture);}).catch(()=>{if(token===generation){error='Video unavailable; showing still arena.';show(poster);}});
 }
 document.addEventListener('visibilitychange',playback);
 return {
  async choose(id:string){
   const token=++generation;halt();poster?.dispose();poster=null;show(null);frames=0;error='';
   const base=`/assets/side-arenas-2/${id}`;
   try{const still=configure(await new T.TextureLoader().loadAsync(`${base}.webp`));if(disposed||token!==generation){still.dispose();return false;}poster=still;show(still);
    const el=document.createElement('video');video=el;el.muted=true;el.loop=true;el.playsInline=true;el.preload='metadata';el.setAttribute('playsinline','');el.hidden=true;el.dataset.arenaVideo=id;document.body.append(el);
    el.onloadeddata=()=>{if(token!==generation||disposed)return;videoTexture=configure(new T.VideoTexture(el));playback();};
    el.onerror=()=>{if(token===generation){error='Video unavailable; showing still arena.';show(poster);}};
    if(el.requestVideoFrameCallback){const frame=()=>{if(token!==generation||disposed)return;frames++;frameCallback=el.requestVideoFrameCallback(frame);};frameCallback=el.requestVideoFrameCallback(frame);}
    el.src=`${base}${matchMedia('(max-width: 800px)').matches?'-720':''}.mp4`;el.load();playback();return true;
   }catch{if(token===generation)error='Backdrop unavailable; showing local stage.';return false;}
  },
  setMotion(on:boolean){if(motion===on)return;motion=on;playback();},
  inspect:()=>({showingVideo:!!videoTexture&&material.map===videoTexture,paused:video?.paused??true,frames,playError:error,videoTime:video?.currentTime??0}),
  dispose(){disposed=true;generation++;halt();poster?.dispose();document.removeEventListener('visibilitychange',playback);plane.removeFromParent();geometry.dispose();material.dispose();},
 };
}
