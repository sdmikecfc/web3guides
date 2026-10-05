import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {assemble,prepareLibrary,SLOTS,type Choices,type Entry} from './parts-assembly';
import {paintAssembly,parseAppearance,defaultAppearance} from './paint';
import {gameBridge} from './game-bridge';
import {createBanner,readBanner} from './banner';
import {presentationSettings} from './presentation-settings';

/** One renderer for a build or all five stands. Saved choices are the only model source. */
export async function startGameDisplay(){
 const bridge=gameBridge();if(!bridge)throw Error('Open this room from your garage.');
 document.querySelector('.studio')!.innerHTML='<canvas id="game-model" aria-label="Your saved robot models. Drag to turn the view."></canvas><p id="game-model-status" role="status">Opening your workshop…</p>';
 document.body.classList.add('game-display');document.documentElement.style.colorScheme='light';document.querySelector('meta[name="color-scheme"]')?.setAttribute('content','light');
 const payload=await bridge.initial,canvas=document.getElementById('game-model') as HTMLCanvasElement,status=document.getElementById('game-model-status')!;
 const manifests=await Promise.all(['/assets/catalogue-2/manifest.json','/assets/weapon-kits-1/manifest.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('Parts could not load');return r.json()}));
 const entries=new Map<string,Entry>(manifests.flatMap(m=>m.entries).map((e:Entry)=>[e.id,e]));
 const robots=(Array.isArray(payload.robots)?payload.robots:[]).slice(0,5).filter((r:any)=>r.choices&&SLOTS.every(s=>entries.get(r.choices[s])?.slots.includes(s)));
 const preferences=presentationSettings();let currentPayload=payload,selectionTime=0;const garage=payload.room==='garage',renderer=new T.WebGLRenderer({canvas,antialias:!preferences.low,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,preferences.low?1:1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=!preferences.low;renderer.shadowMap.type=T.PCFSoftShadowMap;
 const scene=new T.Scene(),camera:T.PerspectiveCamera|T.OrthographicCamera=garage?new T.OrthographicCamera(-15,15,6,-6,.1,160):new T.PerspectiveCamera(35,1,.1,160),controls=new OrbitControls(camera,canvas);controls.enablePan=false;controls.enableDamping=true;controls.minPolarAngle=.7;controls.maxPolarAngle=1.48;controls.minDistance=6;controls.maxDistance=garage?36:18;controls.enabled=!garage;
 const studio=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(studio,.08);scene.environment=environment.texture;scene.environmentIntensity=.45;pmrem.dispose();studio.dispose();renderer.setClearColor(0x000000,0);
 scene.add(new T.HemisphereLight(0xffead0,0x514332,1.2));
 const key=new T.DirectionalLight(0xffe2bb,3.5);key.position.set(5,14,10);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-14,right:14,top:12,bottom:-8,near:1,far:45});key.shadow.normalBias=.025;scene.add(key);
 const rim=new T.DirectionalLight(0xa8c9da,1.1);rim.position.set(-6,8,-4);scene.add(rim);
 const library=new Map<string,T.Group>(),loader=new GLTFLoader(),owned:T.Object3D[]=[],painters:ReturnType<typeof paintAssembly>[]=[],assemblies:ReturnType<typeof assemble>[]=[];
 const assembledRobots:any[]=[],banners:ReturnType<typeof createBanner>[]=[],bannerIds:(string|undefined)[]=[];let alive=true,frame=0;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const ground=new T.Mesh(new T.PlaneGeometry(80,80),new T.ShadowMaterial({opacity:.27}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);owned.push(ground);
 function stand(x:number,z:number,chosen:boolean){const group=new T.Group();group.position.set(x,0,z);scene.add(group);owned.push(group);const deck=new T.Mesh(new T.CylinderGeometry(2.5,2.65,.25,48),new T.MeshStandardMaterial({color:chosen?0xbd9957:0x716351,metalness:.35,roughness:.6}));deck.position.y=.34;deck.castShadow=true;deck.receiveShadow=true;group.add(deck);for(const dx of [-1.6,1.6])for(const dz of [-1.2,1.2]){const wheel=new T.Mesh(new T.CylinderGeometry(.24,.24,.20,12),new T.MeshStandardMaterial({color:0x252a2b,roughness:.8}));wheel.rotation.z=Math.PI/2;wheel.position.set(dx,.18,dz);group.add(wheel)}return group}
 const stands:T.Group[]=[];
 const unsubscribe=bridge.subscribe(next=>{if(next.selected!==currentPayload.selected)selectionTime=performance.now();currentPayload=next;key.color.set(next.lighting==='arena'?0xe2f3ff:0xffe2bb);renderer.toneMappingExposure=next.lighting==='arena'?.94:1.12;painters.forEach((p,i)=>{const robot=next.robots?.find((r:any)=>r.id===assembledRobots[i]?.id),appearance=parseAppearance(robot?.appearance);if(appearance){p.apply(appearance);banners[i]?.visible(appearance.banner);if(bannerIds[i]!==appearance.bannerId){bannerIds[i]=appearance.bannerId;void (appearance.bannerId?readBanner(appearance.bannerId):Promise.resolve(null)).then(blob=>{if(alive)return banners[i]?.load(blob)}).catch(()=>{})}}});stands.forEach((s,i)=>{const deck=s.children[0] as T.Mesh<T.CylinderGeometry,T.MeshStandardMaterial>;deck.material.color.set(robots[i]?.id===next.selected?0xbd9957:0x716351)});draw()});
 function layout(){const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);const aspect=width/height,mobile=width<650;if(camera instanceof T.PerspectiveCamera)camera.aspect=aspect;else{const span=Math.max(mobile?12:9,(mobile?17:28)/aspect);camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;}camera.updateProjectionMatrix();
   if(garage){stands.forEach((s,i)=>s.position.set(mobile?(i<3?(i-1)*5.1:(i-3.5)*5.4):(i-2)*5.1,0,mobile?(i<3?-3.2:3.1):0));camera.position.set(mobile?0:1,mobile?14:9,mobile?24:24);controls.target.set(0,3.2,0);camera.lookAt(controls.target)}
   else{camera.position.set(7.4,4.9,9.6);controls.target.set(0,2.7,0);controls.update();}draw();}
 function draw(){if(alive)renderer.render(scene,camera)}
 function animate(time:number){frame=0;if(!alive||document.hidden)return;if(!preferences.reduced()){assemblies.forEach((a,i)=>{const robot=currentPayload.robots?.find((r:any)=>r.id===assembledRobots[i].id)??assembledRobots[i],selected=robot.id===currentPayload.selected,head=a.model.getObjectByName('head'),ack=selected?Math.max(0,1-(time-selectionTime)/1100):0;if(head)head.rotation.y=Math.sin(time*.00028+i)*.035+ack*.09;a.model.rotation.y=Math.sin(time*.00017+i)*.018+(currentPayload.returning===robot.id ? .04 : 0);banners[i]?.pose(time/1000,false);});controls.update();}draw();if(!preferences.reduced())frame=requestAnimationFrame(animate)}
 const visibility=()=>{cancelAnimationFrame(frame);frame=0;if(!document.hidden)frame=requestAnimationFrame(animate)};
 function dispose(){if(!alive)return;alive=false;unsubscribe();cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener('change',visibility);controls.dispose();painters.forEach(p=>p.dispose());banners.forEach(b=>b.dispose());const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();[scene,...library.values()].forEach(root=>root.traverse(o=>{const m=o as T.Mesh;if(m.isMesh){geometries.add(m.geometry);for(const mat of Array.isArray(m.material)?m.material:[m.material]){materials.add(mat);Object.values(mat).forEach(v=>{if(v?.isTexture)textures.add(v)})}}}));geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());environment.dispose();key.shadow.map?.dispose();renderer.dispose();}
 const observer=new ResizeObserver(layout);observer.observe(canvas);window.addEventListener('pagehide',dispose,{once:true});document.addEventListener('visibilitychange',visibility);reduced.addEventListener('change',visibility);controls.addEventListener('change',draw);
 try{
  const failures=new Set<string>();
  await Promise.all([...new Set<string>(robots.flatMap((r:any)=>Object.values(r.choices) as string[]))].map(async id=>{try{const model=(await loader.loadAsync(entries.get(id)!.url)).scene;if(!alive)return;model.userData.weaponKind=entries.get(id)!.weapon;model.userData.weaponHands=entries.get(id)!.hands;prepareLibrary(model);library.set(id,model)}catch{failures.add(id)}}));
  try{library.set('__support',(await loader.loadAsync('/assets/warden-support-hand.glb')).scene)}catch{failures.add('__support')}
  for(let i=0;i<(garage?5:1);i++){
   const platform=stand(0,0,robots[i]?.id===payload.selected);stands.push(platform);const robot=robots[i];if(!robot)continue;
   if(failures.has('__support')||Object.values(robot.choices).some(id=>failures.has(id as string))){
    const placeholder=new T.Mesh(new T.IcosahedronGeometry(.65,0),new T.MeshStandardMaterial({color:0x78878c,wireframe:true}));placeholder.position.y=2;platform.add(placeholder);
    const retry=document.createElement('button');retry.textContent=`Retry ${robot.name||'robot'}`;retry.style.cssText=`position:absolute;bottom:${10+i*40}px;left:12px;z-index:8`;retry.onclick=()=>location.reload();document.querySelector('.studio')!.append(retry);continue;
   }
   const a=assemble(robot.choices as Choices,library);a.model.traverse(o=>{const m=o as T.Mesh;if(m.isMesh){m.castShadow=true;m.receiveShadow=true}});a.articulate(0);
   // Only a genuinely free support hand may leave its grip in a cosmetic pose.
   const weapon=entries.get(robot.choices.weapon)!;
   if(weapon.hands===1&&!['sword_shield','spear_shield','rifle','precision_rifle','rotary','dual_blades'].includes(weapon.weapon??'')&&robot.repairUntil<Date.now()){
    const shoulder=a.model.getObjectByName('shoulderL'),elbow=a.model.getObjectByName('elbowL');
    if(shoulder&&robot.career?.pose==='fist'){shoulder.rotation.x=-1.25;if(elbow)elbow.rotation.x=-.8}
    if(shoulder&&robot.career?.pose==='salute'){shoulder.rotation.z=-.5;shoulder.rotation.x=-.9;if(elbow)elbow.rotation.x=-1.1}
   }
   if(Array.isArray(payload.visibleSlots)){for(const slot of SLOTS)if(!payload.visibleSlots.includes(slot))for(const node of a.installed[slot]??[])node.visible=false;}
   a.model.position.y+=.48;platform.add(a.model);const painter=paintAssembly(a.model,a.installed);painter.apply(parseAppearance(robot.appearance)??defaultAppearance(entries.get(robot.choices.torso)!.family));painters.push(painter);assemblies.push(a);assembledRobots.push(robot);
   const banner=createBanner();banners.push(banner);bannerIds.push(robot.appearance?.bannerId);platform.add(banner.garage);banner.garage.position.set(-1.9,.5,-1.2);banner.visible(robot.appearance?.banner===true);banner.pose(0,true);void (robot.appearance?.bannerId?readBanner(robot.appearance.bannerId):Promise.resolve(null)).then(blob=>{if(alive)return banner.load(blob)}).catch(()=>{});
   if(robot.career?.showMarks)for(const mark of (robot.career.marks??[]).slice(-5)){const target=a.model.getObjectByName(mark.node);if(!target||!Array.isArray(mark.local)||mark.local.length!==3)continue;const chip=new T.Mesh(new T.CircleGeometry(.045,7),new T.MeshStandardMaterial({color:0x39332e,roughness:1,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2}));chip.position.fromArray(mark.local);const normal=chip.position.clone().normalize();chip.position.addScaledVector(normal,.005);chip.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal.lengthSq()?normal:new T.Vector3(0,0,1));target.add(chip);}
  }
  status.hidden=true;layout();canvas.dataset.ready='true';frame=requestAnimationFrame(animate);bridge.send('loaded');
 }catch(error){status.textContent='The robot picture could not load. Your parts are saved.';bridge.send('error',{message:(error as Error).message});}
}
