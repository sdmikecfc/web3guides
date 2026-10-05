import * as T from 'three';
import {robotRig} from './rig';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {assemble,prepareLibrary} from '../workshop8/runtime/parts-assembly';
import {ENTRY_MAP} from '../workshop8/catalogue';
import {PitEngine} from './engine';
import {moves} from './moves';
import type {Spec,Side,InputMove} from './types';
import {contactPoint} from './motion';
import {calibrateRig} from './calibration';
export type ViewSettings={quality:'auto'|'standard'|'low';shake:number;flashes:boolean;reduced:boolean;hitboxes:boolean;effectsVolume:number;musicVolume:number};
export type MotionReview={move:'guard'|InputMove;frame:number;front:boolean};
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z),clamp=T.MathUtils.clamp;
const colors={tank:'#eeb564',speed:'#61ddd4',ranged:'#af9bff'};
function releaseTrees(roots:T.Object3D[]){const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();for(const root of roots)root.traverse(o=>{const m=o as T.Mesh;if(m.isMesh||o instanceof T.Line){if(m.geometry)geometries.add(m.geometry);for(const mat of Array.isArray(m.material)?m.material:[m.material]){if(!mat)continue;materials.add(mat);for(const v of Object.values(mat))if(v instanceof T.Texture)textures.add(v);}}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
export async function createPitView(canvas:HTMLCanvasElement,specs:[Spec,Spec],progress:(value:number)=>void,settings:()=>ViewSettings){
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;renderer.shadowMap.type=T.PCFSoftShadowMap;
 const scene=new T.Scene();scene.background=new T.Color('#0b1118');scene.fog=new T.Fog('#101920',24,70);
 const camera=new T.PerspectiveCamera(33,1,.1,120);camera.position.set(0,3.6,17);
 const environment=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromScene(environment,.03);scene.environment=env.texture;environment.dispose();pmrem.dispose();
 scene.add(new T.HemisphereLight('#dbe9ec','#302c2a',1.4));const key=new T.DirectionalLight('#ffe3b3',2.6);key.position.set(-2,9,8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-12,right:12,top:10,bottom:-8,near:.1,far:35});key.shadow.bias=-.0005;scene.add(key);const rim=new T.DirectionalLight('#70afc5',3);rim.position.set(2,6,-6);scene.add(rim);
 const metal=new T.MeshStandardMaterial({color:'#333e47',metalness:.7,roughness:.6}),floor=new T.MeshStandardMaterial({color:'#4a5055',metalness:.35,roughness:.8}),dark=new T.MeshStandardMaterial({color:'#111a22',metalness:.7,roughness:.7}),amber=new T.MeshStandardMaterial({color:'#e9a856',emissive:'#ff9f36',emissiveIntensity:2}),teal=new T.MeshStandardMaterial({color:'#4ec4ca',emissive:'#39bbcf',emissiveIntensity:2});
 // A small shared material texture adds wear without another download.
 const surface=document.createElement('canvas');surface.width=surface.height=256;const ctx=surface.getContext('2d')!;ctx.fillStyle='#8b918c';ctx.fillRect(0,0,256,256);let textureSeed=39;
 const random=()=>{textureSeed=(Math.imul(textureSeed,1664525)+1013904223)>>>0;return textureSeed/4294967296};
 for(let i=0;i<2200;i++){const gray=80+Math.floor(random()*105);ctx.fillStyle=`rgba(${gray},${gray},${gray},.32)`;ctx.fillRect(random()*256,random()*256,random()*3+1,random()*2+1);}
 for(let i=0;i<180;i++){ctx.strokeStyle='rgba(24,29,26,.28)';ctx.beginPath();const x=random()*256,y=random()*256;ctx.moveTo(x,y);ctx.lineTo(x+random()*19,y+random()*4);ctx.stroke();}
 const wear=new T.CanvasTexture(surface);wear.wrapS=wear.wrapT=T.RepeatWrapping;wear.repeat.set(5,3);wear.colorSpace=T.SRGBColorSpace;floor.map=wear;metal.map=wear;floor.roughnessMap=wear;metal.roughnessMap=wear;
 const box=new T.BoxGeometry(1,1,1),cylinder=new T.CylinderGeometry(1,1,1,24),sphere=new T.SphereGeometry(1,12,8),moving:T.Object3D[]=[];
 const block=(x:number,y:number,z:number,w:number,h:number,d:number,mat:T.Material)=>{const m=new T.Mesh(box,mat);m.position.set(x,y,z);m.scale.set(w,h,d);m.receiveShadow=true;scene.add(m);return m;};
 const tube=(x:number,y:number,z:number,r:number,h:number,mat:T.Material)=>{const m=new T.Mesh(cylinder,mat);m.position.set(x,y,z);m.scale.set(r,h,r);scene.add(m);return m;};
 block(0,-.22,0,16,.4,5,floor);block(0,-.65,0,17,.5,5.4,dark);block(0,-.18,2.6,16,.07,.05,amber);
 for(const side of [-1,1]){block(side*7.1,.13,0,.12,.25,5.2,amber);block(side*7.65,.30,0,.38,.65,4.9,metal);for(const z of [-2.3,2.3]){block(side*7.65,2.4,z,.3,2.8,.3,metal);block(side*7.63,2.4,z+.2,.07,2.0,.05,amber);}}
 for(let i=-7;i<=7;i++){block(i,.004,0,.012,.01,4.9,dark);if(i%2===0)for(const z of [-1.9,1.9]){const stripe=block(i,.015,z,.5,.014,.16,amber);stripe.rotation.y=.5;}}
 // Reuse the approved industrial stage as distant scenery. The fighting deck,
 // shadows, boundary lamps and drones remain three-dimensional.
 const backdropMaterial=new T.MeshBasicMaterial({color:0xb7c5c5,toneMapped:false,fog:false});
 const backdrop=new T.Mesh(new T.PlaneGeometry(42,20),backdropMaterial);backdrop.position.set(0,7,-10);scene.add(backdrop);
 let stagePoster:T.Texture|null=null,stageVideoTexture:T.VideoTexture|null=null,stageVideo:HTMLVideoElement|null=null,stageMoving=false;
 const cropStage=(texture:T.Texture)=>{texture.colorSpace=T.SRGBColorSpace;texture.offset.set(0,.38);texture.repeat.set(1,.62);return texture;};
 try{stagePoster=cropStage(await new T.TextureLoader().loadAsync('/bots-playtest/assets/side-arenas-2/basement.webp'));backdropMaterial.map=stagePoster;backdropMaterial.needsUpdate=true;}catch{backdropMaterial.color.set('#17282c');}
 // The poster stays visible until a decoded video frame is ready. Playback is
 // user-initiated, pauses with the match, and reduced motion uses the poster.
 function startStage(){if(settings().reduced||settings().quality==='low')return;
  if(!stageVideo){stageVideo=document.createElement('video');stageVideo.muted=true;stageVideo.loop=true;stageVideo.playsInline=true;stageVideo.preload='none';stageVideo.src='/bots-playtest/assets/side-arenas-2/basement-720.mp4';stageVideoTexture=cropStage(new T.VideoTexture(stageVideo)) as T.VideoTexture;}
  stageMoving=true;void stageVideo.play().catch(()=>{stageMoving=false;});
 }
 // Brushed deck panels, inset hazard markers and visible edge bumpers.
 for(const x of [-6,-3,0,3,6])for(const z of [-1.55,1.55]){block(x,.014,z,2.9,.018,1.0,metal);for(const dx of [-1.28,1.28]){const bolt=tube(x+dx,.035,z,.035,.035,dark);bolt.scale.y=.035;}}
 const drones=[-1,1].map(side=>{const group=new T.Group(),body=new T.Mesh(sphere,metal),eye=new T.Mesh(sphere,amber);body.scale.set(.5,.18,.28);eye.scale.set(.08,.08,.08);eye.position.z=.27;group.add(body,eye);group.position.set(side*5,5.6,-4);scene.add(group);return group;});
 const steamMaterial=new T.MeshBasicMaterial({color:'#c4d5dc',transparent:true,opacity:.045,depthWrite:false}),steam=Array.from({length:12},(_,i)=>{const m=new T.Mesh(sphere,steamMaterial);m.position.set((i%2?1:-1)*6,1+i*.2,-5);m.scale.set(.4,.6,.4);scene.add(m);return m;});
 const loader=new GLTFLoader(),library=new Map<string,T.Group>(),ids=[...new Set(specs.flatMap(s=>Object.values(s.choices)))];let loaded=0;
 // Two assemblies share immutable source geometry and textures; paint is cloned.
 try{for(const id of ids){const entry=ENTRY_MAP.get(id)!;const gltf=await loader.loadAsync(entry.url);prepareLibrary(gltf.scene);library.set(id,gltf.scene);progress(++loaded/(ids.length+1));}
 if([...library.values()].some(m=>m.userData.openLeftHand)){const support=await loader.loadAsync('/bots-playtest/assets/warden-support-hand.glb');library.set('__support',support.scene);}}
 catch(error){releaseTrees([scene,...library.values()]);env.dispose();renderer.dispose();if(!canvas.isConnected)renderer.forceContextLoss();throw error;}
 const rigs=specs.map(s=>robotRig(assemble(s.choices,library),s));for(const rig of rigs)scene.add(rig.root);progress(1);
 // Resolve the assembled muzzle once before combat. Pin these rounded coordinates
 // in the replay specification; no rendered frame can choose a shot's outcome.
 const calibrated=rigs.map((rig,i)=>calibrateRig(rig,specs[i])),muzzles=calibrated.map(c=>c.muzzle),superMuzzles=calibrated.map(c=>c.superMuzzle),contacts=calibrated.map(c=>c.contacts);
 const effects=Array.from({length:64},()=>{const mat=new T.MeshBasicMaterial({color:'#ffca70',transparent:true}),o=new T.Mesh(sphere,mat);o.visible=false;scene.add(o);return {o,life:0,v:V(),mat};});
 const bullets=Array.from({length:12},()=>{const o=new T.Mesh(new T.SphereGeometry(.10,8,6),new T.MeshBasicMaterial({color:'#ffdd88'}));o.visible=false;scene.add(o);return o;});
 const boxes=rigs.map(()=>{const o=new T.Mesh(box,new T.MeshBasicMaterial({color:'#54ffff',wireframe:true,depthTest:false}));scene.add(o);return o;});
 const hitboxes=rigs.map(()=>{const o=new T.Mesh(sphere,new T.MeshBasicMaterial({color:'#ff9933',wireframe:true,depthTest:false}));scene.add(o);return o;});
 const core=new T.Mesh(new T.SphereGeometry(.32,16,12),new T.MeshBasicMaterial({color:'#ffc262'}));core.visible=false;scene.add(core);
 const signals=specs.map(s=>{const ring=new T.Mesh(new T.TorusGeometry(1,.025,8,48),new T.MeshBasicMaterial({color:colors[s.style],transparent:true,opacity:.7}));ring.rotation.x=Math.PI/2;scene.add(ring);return ring;});
 const marks:T.Mesh[][]=[[],[]];let eventAt=0,shakeUntil=0,lastTick=-1,lastRound=1,lastStep=-1,adaptiveLow=false,lastQuality=settings().quality,disposed=false,accFrames:number[]=[],lastDraw=0;
 function clearMarks(){for(const group of marks){for(const mark of group){mark.removeFromParent();mark.geometry.dispose();(mark.material as T.Material).dispose();}group.length=0;}}
 let audio:AudioContext|null=null,noise:AudioBuffer|null=null;const music=new Audio('/Combat%20Loop.mp3');music.loop=true;music.preload='none';
 function unlock(){startStage();audio??=new AudioContext();void audio.resume();if(settings().musicVolume>0){music.volume=settings().musicVolume;void music.play().catch(()=>{});}}
 function sound(kind:string,amount=0){if(!audio||audio.state!=='running'||settings().effectsVolume<=0||!['shot','hit','block','land','guardBreak','finish','super','step'].includes(kind))return;const at=audio.currentTime,o=audio.createOscillator(),g=audio.createGain(),volume=settings().effectsVolume*(kind==='step'?.035:.2);o.type=kind==='block'?'triangle':'sine';o.frequency.setValueAtTime(kind==='shot'?220:kind==='block'?700:kind==='land'||kind==='step'?70:110+Math.min(100,amount),at);o.frequency.exponentialRampToValueAtTime(32,at+.18);g.gain.setValueAtTime(.001,at);g.gain.exponentialRampToValueAtTime(volume,at+.004);g.gain.exponentialRampToValueAtTime(.001,at+.22);o.connect(g).connect(audio.destination);o.start();o.stop(at+.23);o.onended=()=>{o.disconnect();g.disconnect()};
  noise??=audio.createBuffer(1,audio.sampleRate*.20,audio.sampleRate);if(!noise.getChannelData(0)[1]){const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.sin(i*714.132)*Math.cos(i*73.333);}
  const burst=audio.createBufferSource(),filter=audio.createBiquadFilter(),envelope=audio.createGain();burst.buffer=noise;filter.type='bandpass';filter.frequency.value=kind==='block'?2400:kind==='shot'?1200:480;filter.Q.value=.8;envelope.gain.setValueAtTime(volume*.6,at);envelope.gain.exponentialRampToValueAtTime(.001,at+.17);burst.connect(filter).connect(envelope).connect(audio.destination);burst.start();burst.onended=()=>{burst.disconnect();filter.disconnect();envelope.disconnect()};
 }
 function resize(){const r=canvas.getBoundingClientRect();renderer.setPixelRatio(Math.min(devicePixelRatio,settings().quality==='low'||adaptiveLow?1:1.5));renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=Math.max(.2,r.width/Math.max(1,r.height));camera.updateProjectionMatrix();renderer.shadowMap.enabled=settings().quality!=='low'&&!adaptiveLow;}
 function render(engine:PitEngine,review?:MotionReview){if(disposed)return;const pref=settings();const showVideo=stageMoving&&!pref.reduced&&pref.quality!=='low'&&!!stageVideo&&stageVideo.readyState>=2;const backgroundMap=showVideo?stageVideoTexture:stagePoster;if(backdropMaterial.map!==backgroundMap){backdropMaterial.map=backgroundMap;backdropMaterial.needsUpdate=true;}if(pref.reduced||pref.quality==='low'){stageVideo?.pause();stageMoving=false;}if(pref.quality!==lastQuality){lastQuality=pref.quality;adaptiveLow=false;resize();}if(pref.quality==='auto'&&!adaptiveLow&&accFrames.length>=180&&accFrames.slice(-120).filter(f=>f>24).length>80){adaptiveLow=true;resize();}if(engine.clock!==lastStep){lastStep=engine.clock;if(engine.clock%18===0&&engine.actors.some(a=>a.y===0&&!a.attack&&!a.stun&&(a.held.has('left')!==a.held.has('right'))))sound('step');}const elapsed=Math.max(0,Math.min(8,engine.tick-lastTick));if(engine.events.length<eventAt||engine.tick<lastTick){eventAt=0;clearMarks();}if(engine.round!==lastRound){clearMarks();lastRound=engine.round;}lastTick=engine.tick;
  while(eventAt<engine.events.length){const e=engine.events[eventAt++];sound(e.kind,e.amount);if(['hit','block','guardBreak','finish'].includes(e.kind)){
   shakeUntil=engine.tick+(e.kind==='finish'?30:6);const count=pref.quality==='low'?5:14;for(let i=0;i<count;i++){const p=effects.find(p=>!p.life);if(!p)break;p.life=18+i%7;p.o.visible=true;p.o.position.set(e.x/1000,e.y/1000,.3);p.o.scale.setScalar(.025+(i%3)*.018);p.v.set(Math.sin(i*2.4)*.08,.08+Math.abs(Math.cos(i))*.10,Math.cos(i*2.4)*.07);p.mat.color.set(e.kind==='block'?'#73dddf':'#ffbc65');}
   if(e.kind==='hit'&&e.target!==undefined&&marks[e.target].length<12){const mark=new T.Mesh(new T.CircleGeometry(.07,7),new T.MeshStandardMaterial({color:'#181d22',roughness:1,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2}));const chest=rigs[e.target].model.getObjectByName('chest')!;chest.add(mark);mark.position.set(((e.id*17)%9-4)*.09,.15+((e.id*13)%5)*.1,.57);marks[e.target].push(mark);}
  }if(e.kind==='round'){for(const group of marks){for(const mark of group){mark.removeFromParent();mark.geometry.dispose();(mark.material as T.Material).dispose();}group.length=0;}}
  }
  core.visible=engine.phase==='finisher';
  for(const side of [0,1] as Side[]){const a=engine.actors[side],fin=engine.phase==='finisher'?engine.phaseFrame/300:engine.phase==='result'&&engine.events.some(e=>e.kind==='finish')?1:0;
   const signal=signals[side],move=a.attack?.move,signalActive=!!move&&(move.id==='bodySpecial'||move.id==='super'||a.attack!.enhanced);signal.visible=signalActive;
   if(signalActive){const progress=clamp((a.attack!.frame-move!.startup)/move!.active,0,1);signal.position.set(a.x/1000,.035,0);signal.scale.setScalar(.35+progress*(move!.id==='bodySpecial'?move!.reach/1000:1.2));(signal.material as T.MeshBasicMaterial).opacity=pref.flashes?.70:.32;}
   let presented=a;if(a.hp===0&&!fin)presented={...a,attack:null,down:Math.max(1,38-engine.phaseFrame)};
   if(fin&&engine.winner===side){const rival=engine.actors[1-side],t=Math.min(1,fin*5),x=a.x+(rival.x-a.facing*1400-a.x)*t;presented={...a,x};core.position.set((x+rival.x)/2000,1.8+(a.spec.style==='speed'?Math.sin(fin*Math.PI)*.6:0),.25);const squeeze=a.spec.style==='tank'?1-Math.min(.9,Math.max(0,fin-.4)*2):a.spec.style==='ranged'?1+fin:1;core.scale.setScalar(squeeze*(pref.flashes?1+Math.sin(fin*80)*.08:1));(core.material as T.MeshBasicMaterial).color.set(colors[a.spec.style]);}
   rigs[side].root.visible=!review||side===0;
   if(review&&side===0){const move=review.move==='guard'?null:moves(a.spec)[review.move];presented={...a,x:0,y:review.move.startsWith('air')?900:0,facing:1,down:0,stun:0,blockstun:0,throwHold:null,crouch:review.move==='low',held:new Set(review.move==='guard'?['guard']:[]),attack:move?{move,frame:review.frame,facing:1,instance:1,hits:[],enhanced:false,shots:0}:null};}
   rigs[side].stance(presented,review?0:engine.clock,review?0:fin,engine.winner!==side);
   if(review&&side===0){rigs[0].root.rotation.y=review.front?0:Math.PI/2;rigs[0].root.updateMatrixWorld(true);}
   boxes[side].visible=pref.hitboxes;const height=a.crouch?1.95:3.2;boxes[side].position.set(a.x/1000,a.y/1000+height/2,0);boxes[side].scale.set(.9,height,.75);
   const r=a.attack;hitboxes[side].visible=pref.hitboxes&&!!r&&r.frame>=r.move.startup&&r.frame<r.move.startup+r.move.active;
   if(r){const [x,y]=contactPoint(a.spec,r.move,r.frame);hitboxes[side].position.set((a.x+x*r.facing)/1000,(a.y+y)/1000,0);hitboxes[side].scale.setScalar(r.move.radius/1000);}
  }
  const midpoint=(engine.actors[0].x+engine.actors[1].x)/2000,width=Math.abs(engine.actors[1].x-engine.actors[0].x)/1000+6,maxY=Math.max(...engine.actors.map(a=>a.y/1000));
  const z=Math.max(9.1+maxY*1.1,width/(2*Math.tan(T.MathUtils.degToRad(16.5))*camera.aspect));camera.position.lerp(V(midpoint,2.8+maxY*.25,z),pref.reduced?1:.10);const shake=!pref.reduced&&pref.shake>0&&engine.tick<shakeUntil?Math.sin(engine.tick*3.3)*.025*pref.shake:0;camera.position.x+=shake;camera.lookAt(midpoint,1.65+maxY*.3,0);
  if(!pref.reduced){moving.forEach((m,i)=>m.rotation.z=engine.clock*.003*(i%2?1:-1));drones.forEach((d,i)=>{d.position.x=(i?1:-1)*5+Math.sin(engine.clock*.008+i)*.65;d.position.y=5.6+Math.sin(engine.clock*.011+i)*.13;});steam.forEach((s,i)=>{s.position.y=.4+((engine.clock*.018+i*.45)%4);s.scale.setScalar(.25+s.position.y*.15);});}
  for(const p of effects)if(p.life>0){p.life=Math.max(0,p.life-elapsed);p.o.position.addScaledVector(p.v,elapsed);p.v.y-=.008*elapsed;p.mat.opacity=p.life/25;p.o.visible=p.life>0;}
  bullets.forEach((o,i)=>{const p=engine.projectiles[i];o.visible=!!p;if(p)o.position.set(p.x/1000,p.y/1000,p.z/1000)});music.volume=pref.musicVolume;
  if(review){camera.position.set(0,2.5,10);camera.lookAt(0,1.75,0);boxes.forEach(o=>o.visible=false);hitboxes.forEach(o=>o.visible=false);signals.forEach(o=>o.visible=false);}
  renderer.render(scene,camera);const now=performance.now();if(lastDraw){accFrames.push(now-lastDraw);if(accFrames.length>600)accFrames.shift();}lastDraw=now;
 }
 function dispose(){if(disposed)return;disposed=true;stageVideo?.pause();stageVideo?.removeAttribute('src');stageVideo?.load();stageVideoTexture?.dispose();stagePoster?.dispose();music.pause();music.removeAttribute('src');music.load();if(audio)void audio.close();releaseTrees([scene,...library.values()]);key.shadow.map?.dispose();env.dispose();renderer.dispose();if(!canvas.isConnected)renderer.forceContextLoss();}
 resize();return {render,resize,unlock,muzzles,superMuzzles,contacts,pause(){stageVideo?.pause();stageMoving=false;music.pause();void audio?.suspend();},dispose,metrics(){const sorted=accFrames.slice().sort((a,b)=>a-b);return {quality:adaptiveLow?'low (auto)':settings().quality,frames:sorted.length,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],...renderer.info.memory};}};
}
