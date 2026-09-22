if(new URLSearchParams(location.search).get('embedded')==='1')document.body.classList.add('embedded-preview');
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createHammerMotion, HAMMER_DURATION, HAMMER_CONTACT } from './hammer-motion';

type View = 'front' | 'three-quarter' | 'back' | 'side';
type Joint = 'head' | 'elbowL' | 'elbowR';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('model-canvas');
const status = $('load-status');
const select = $<HTMLSelectElement>('joint-select');
const slider = $<HTMLInputElement>('joint-angle');
const value = $<HTMLOutputElement>('joint-value');
const resetButton = $<HTMLButtonElement>('reset-pose');
const conceptButton = $<HTMLButtonElement>('concept-toggle');
const conceptPanel = $('concept-panel');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const playStrike=$<HTMLButtonElement>('play-strike');
const motionTime=$<HTMLInputElement>('motion-time');
const motionPhase=$<HTMLOutputElement>('motion-phase');
const jointSpecs: Record<Joint, { title: string; min: number; max: number; axis: THREE.Vector3 }> = {
  head: { title: 'Head turn', min: -30, max: 30, axis: new THREE.Vector3(0, 1, 0) },
  elbowL: { title: 'Left elbow', min: 0, max: 35, axis: new THREE.Vector3(-1, 0, 0) },
  elbowR: { title: 'Right elbow', min: 0, max: 20, axis: new THREE.Vector3(-1, 0, 0) },
};

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach(material => {
      materials.add(material);
      Object.values(material).forEach(item => { if (item?.isTexture) textures.add(item); });
    });
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}

async function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = .90;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#242723');
  scene.fog = new THREE.Fog('#242723', 18, 44);
  const camera = new THREE.PerspectiveCamera(32, 1, .05, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = !reduced.matches;
  controls.dampingFactor = .12;
  controls.minPolarAngle = .18;
  controls.maxPolarAngle = Math.PI * .51;
  controls.minDistance = 3.4;
  controls.maxDistance = 19;
  controls.target.set(0, 2.05, .28);
  camera.position.set(-7, 4.5, 10);
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = pmrem.fromScene(environment, .045);
  scene.environment = environmentTarget.texture;
  disposeObject(environment);
  pmrem.dispose();

  const ambient = new THREE.HemisphereLight('#e5e0d4', '#24231e', .42);
  scene.add(ambient);
  const key = new THREE.DirectionalLight('#ffe8c9', 2.0);
  key.position.set(-4, 8, 6);
  key.target.position.set(0, 1.8, .2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4.5; key.shadow.camera.right = 4.5;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -4;
  key.shadow.camera.near = .1; key.shadow.camera.far = 24;
  key.shadow.bias = -.00015; key.shadow.normalBias = .028;
  key.shadow.radius = 3;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#d7e0e2', 1.25);
  rim.position.set(4, 5, -5); scene.add(rim);
  const fill = new THREE.DirectionalLight('#e9dfcc', .35);
  fill.position.set(5, 3, 7); scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({
    color: '#282925', roughness: .9, metalness: .02,
  }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  let model: THREE.Group | null = null;
  let ready = false, alive = true, epoch = 0, raf = 0, frameCount = 0;
  let currentView: View = 'three-quarter';
  let sourceHash: string | null = null;
  let loading: AbortController | null = null;
  let assetBytes = 0;
  let motion:ReturnType<typeof createHammerMotion>|null=null;
  let motionMode=true,playing=false,playhead=0,lastFrame:number|null=null;
  let audio:AudioContext|null=null;
  let fitPoints = new Float32Array(0);
  const modelBounds = new THREE.Box3();
  const bind = new Map<Joint, { object: THREE.Object3D; quaternion: THREE.Quaternion }>();
  const loader = new GLTFLoader();
  const requestDraw = () => {
    if (alive && !document.hidden && !raf) raf = requestAnimationFrame(draw);
  };
  function draw(now=performance.now()) {
    raf = 0;
    if (!alive || document.hidden) return;
    if(playing&&motion){
      const before=playhead;playhead=Math.min(HAMMER_DURATION,playhead+(lastFrame===null?0:Math.min(.04,(now-lastFrame)/1000)));lastFrame=now;
      showMotion(playhead);
      if(before<HAMMER_CONTACT&&playhead>=HAMMER_CONTACT)impactSound();
      if(playhead>=HAMMER_DURATION){playing=false;playStrike.textContent='Replay hammer strike';lastFrame=null}
    }
    controls.update();
    renderer.render(scene, camera);
    frameCount++;
    if(playing)requestDraw();
  }
  function impactSound(){
    if(!audio||audio.state!=='running')return;
    const time=audio.currentTime,b=audio.createBuffer(1,Math.floor(audio.sampleRate*.22),audio.sampleRate),d=b.getChannelData(0);
    let seed=71;for(let i=0;i<d.length;i++){seed=(seed*16807)%2147483647;d[i]=(seed/2147483647*2-1)*Math.exp(-i/(audio.sampleRate*.04))}
    const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=b;filter.type='lowpass';filter.frequency.value=1700;gain.gain.value=.28;source.connect(filter).connect(gain).connect(audio.destination);source.start(time);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
    const ring=audio.createOscillator(),rg=audio.createGain();ring.type='sine';ring.frequency.setValueAtTime(93,time);ring.frequency.exponentialRampToValueAtTime(43,time+.22);rg.gain.setValueAtTime(.12,time);rg.gain.exponentialRampToValueAtTime(.0001,time+.3);ring.connect(rg).connect(audio.destination);ring.start(time);ring.stop(time+.31);ring.onended=()=>{ring.disconnect();rg.disconnect()};
  }
  function showMotion(time:number){
    if(!motion)return;const state=motion.pose(time);motionTime.value=String(time);motionPhase.value=state.phase;renderer.shadowMap.needsUpdate=true;
  }
  function setMotionMode(enabled:boolean){
    motionMode=enabled;playing=false;lastFrame=null;playhead=0;
    motion?.setActive(enabled);$('motion-controls').hidden=!enabled;$('joint-controls').hidden=enabled;
    document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.mode==='motion')===enabled)));
    playStrike.textContent='Watch hammer strike';if(enabled)showMotion(0);else resetPose();setView(currentView);renderer.shadowMap.needsUpdate=true;requestDraw();
  }
  controls.addEventListener('change', requestDraw);
  const clearPreset = () => document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', 'false'));
  controls.addEventListener('start', clearPreset);
  function markPreset(view: View) {
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
  }
  function fit(direction: THREE.Vector3) {
    const box = motionMode&&motion ? motion.viewBounds : model ? modelBounds : new THREE.Box3(new THREE.Vector3(-2, 0, -.6), new THREE.Vector3(2, 4, 1.6));
    const target = box.getCenter(new THREE.Vector3());
    target.y += .045;
    const forward = direction.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let distance = 0;
    const include = (x: number, y: number, z: number) => {
      x -= target.x; y -= target.y; z -= target.z;
      const depth = x * forward.x + y * forward.y + z * forward.z;
      distance = Math.max(distance, depth + Math.abs(x * up.x + y * up.y + z * up.z) / tan,
        depth + Math.abs(x * right.x + y * right.y + z * right.z) / (tan * camera.aspect));
    };
    const points=motionMode&&motion?motion.viewPoints:fitPoints;
    if (points.length) {
      for (let i = 0; i < points.length; i += 3) include(points[i], points[i + 1], points[i + 2]);
    } else {
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) include(x, y, z);
    }
    // Fit actual geometry rather than the empty corners of one enclosing box.
    // Phone framing respects the complete shoulder/weapon width.
    distance *= motionMode&&motion ? 1.10 : camera.aspect < .9 ? 1.12 : 1.23;
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(forward, distance);
    controls.maxDistance = Math.max(19, distance * 1.65);
    camera.lookAt(target); controls.update(); requestDraw();
  }
  function setView(view: View) {
    currentView = view;
    fit(view === 'side' ? new THREE.Vector3(-1,.12,.08) : view === 'front' ? new THREE.Vector3(0, .13, 1) : view === 'back' ? new THREE.Vector3(0, .17, -1) : new THREE.Vector3(-.64, .23, 1));
    markPreset(view);
  }
  function resetPose() {
    if(motionMode&&motion){playing=false;playhead=0;lastFrame=null;showMotion(0);playStrike.textContent='Watch hammer strike';requestDraw();return}
    bind.forEach(({ object, quaternion }) => object.quaternion.copy(quaternion));
    slider.value = '0'; value.value = '0°';
    model?.updateMatrixWorld(true);
    renderer.shadowMap.needsUpdate = true;
    requestDraw();
  }
  function selectJoint(joint: Joint) {
    resetPose();
    select.value = joint;
    const spec = jointSpecs[joint];
    slider.min = String(spec.min); slider.max = String(spec.max);
    slider.setAttribute('aria-label', spec.title + ' angle');
    slider.disabled = !bind.has(joint);
  }
  function setJoint(joint: Joint, degrees: number) {
    if(motionMode)setMotionMode(false);
    if (!(joint in jointSpecs) || !Number.isFinite(degrees)) return;
    if (select.value !== joint) selectJoint(joint);
    const item = bind.get(joint);
    if (!item) return;
    const spec = jointSpecs[joint];
    degrees = THREE.MathUtils.clamp(degrees, spec.min, spec.max);
    item.object.quaternion.copy(item.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(spec.axis, THREE.MathUtils.degToRad(degrees)));
    slider.value = String(degrees); value.value = `${Math.round(degrees)}°`;
    model?.updateMatrixWorld(true);
    renderer.shadowMap.needsUpdate = true;
    requestDraw();
  }
  function resize() {
    const rect = canvas.parentElement!.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix();
    if(motionMode&&motion)setView(currentView);else fit(camera.position.clone().sub(controls.target));
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas.parentElement!);
  const visibility = () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0;lastFrame=null; }
    else requestDraw();
  };
  const motionPreference = () => { controls.enableDamping = !reduced.matches; requestDraw(); };
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', motionPreference);
  function setStatus(message: string) {
    status.textContent = message; status.classList.toggle('empty', !message);
  }
  async function load() {
    const mine = ++epoch;
    loading?.abort(); loading = new AbortController();
    $('retry').hidden = true;
    setStatus(model ? 'Loading the latest model…' : 'Loading Warden…');
    try {
      const response = await fetch(`/assets/tank-t3-warden-hammer-motion-2.glb?v=${Date.now()}`, { signal: loading.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Model request failed (${response.status}).`);
      const bytes = await response.arrayBuffer();
      const [gltf, digest,support] = await Promise.all([
        loader.parseAsync(bytes, new URL('/assets/', location.href).href),
        crypto.subtle.digest('SHA-256', bytes),
        loader.loadAsync('/assets/warden-support-hand.glb'),
      ]);
      if (!alive || mine !== epoch) { disposeObject(gltf.scene);disposeObject(support.scene); return; }
      const materialByName=new Map<string,THREE.Material>();
      gltf.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)(Array.isArray(m.material)?m.material:[m.material]).forEach(mat=>{if(!materialByName.has(mat.name))materialByName.set(mat.name,mat)})});
      support.scene.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){m.castShadow=true;m.receiveShadow=true;m.material=(Array.isArray(m.material)?m.material:[m.material]).map(mat=>{const reuse=materialByName.get(mat.name);if(reuse){mat.dispose();return reuse}return mat})}});
      gltf.scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true; mesh.receiveShadow = true;
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => {
          const pbr = material as THREE.MeshStandardMaterial;
          if (pbr.isMeshStandardMaterial) pbr.envMapIntensity = .68;
          Object.values(material).forEach(texture => {
            if (texture?.isTexture) texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
          });
        });
      });
      if (model) { motion?.dispose();motion=null;ready=false;playing=false;lastFrame=null;scene.remove(model); disposeObject(model); }
      model = gltf.scene; scene.add(model); model.updateMatrixWorld(true);
      modelBounds.setFromObject(model, true);
      const points: number[] = [];
      const point = new THREE.Vector3();
      model.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
          points.push(point.x, point.y, point.z);
        }
      });
      fitPoints = new Float32Array(points);
      let lowest = Infinity;
      for (let i = 1; i < fitPoints.length; i += 3) lowest = Math.min(lowest, fitPoints[i]);
      if (Number.isFinite(lowest)) floor.position.y = lowest;
      bind.clear();
      (Object.keys(jointSpecs) as Joint[]).forEach(name => {
        const object = model!.getObjectByName(name);
        if (object) bind.set(name, { object, quaternion: object.quaternion.clone() });
      });
      sourceHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      assetBytes = bytes.byteLength;
      select.disabled = false; resetButton.disabled = false;
      Array.from(select.options).forEach(option => option.disabled = !bind.has(option.value as Joint));
      selectJoint('head');
      motion=createHammerMotion(model,scene,support.scene);playStrike.disabled=false;motionTime.disabled=false;motionTime.max=String(HAMMER_DURATION);motionTime.step='.01';setMotionMode(motionMode);
      ready=true;
      renderer.shadowMap.needsUpdate = true;
      setStatus(''); requestDraw();
    } catch (error) {
      if (!alive || mine !== epoch || (error as Error).name === 'AbortError') return;
      setStatus(model ? 'The latest model could not load. You can still inspect this version.' : 'Warden could not load. Please try again.');
      $('retry').hidden = false;
      console.error('Tank viewer model load:', error);
    }
  }
  function concept(open: boolean) {
    conceptPanel.hidden = !open; conceptButton.setAttribute('aria-expanded', String(open));
    if (open) $('concept-close').focus(); else conceptButton.focus();
  }
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view as View)));
  select.addEventListener('change', () => selectJoint(select.value as Joint));
  slider.addEventListener('input', () => setJoint(select.value as Joint, Number(slider.value)));
  resetButton.addEventListener('click', resetPose);
  $('reload-model').addEventListener('click', () => void load());
  $('retry').addEventListener('click', () => void load());
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMotionMode(b.dataset.mode==='motion')));
  playStrike.addEventListener('click',()=>{
    if(!motion)return;if(!motionMode)setMotionMode(true);
    if(!audio)audio=new AudioContext();void audio.resume();
    if(playhead>=HAMMER_DURATION)playhead=0;playing=!playing;lastFrame=null;playStrike.textContent=playing?'Pause strike':'Continue strike';requestDraw();
  });
  motionTime.addEventListener('input',()=>{playing=false;lastFrame=null;playhead=Number(motionTime.value);showMotion(playhead);playStrike.textContent=playhead>=HAMMER_DURATION?'Replay hammer strike':'Continue strike';requestDraw()});
  conceptButton.addEventListener('click', () => concept(conceptPanel.hidden));
  $('concept-close').addEventListener('click', () => concept(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !conceptPanel.hidden) concept(false); });
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') { setView('three-quarter'); return; }
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    if (event.key === 'ArrowLeft') spherical.theta -= .1;
    if (event.key === 'ArrowRight') spherical.theta += .1;
    if (event.key === 'ArrowUp') spherical.phi -= .08;
    if (event.key === 'ArrowDown') spherical.phi += .08;
    if (event.key === '+' || event.key === '=') spherical.radius *= .92;
    if (event.key === '-') spherical.radius *= 1.08;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
    spherical.radius = THREE.MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update(); clearPreset(); requestDraw();
  });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); cancelAnimationFrame(raf); raf = 0;
    setStatus('The 3D view stopped. Reload this page to continue.');
  });
  function inspect() {
    let triangles = 0, meshes = 0;
    model?.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.isMesh) { meshes++; triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3; } });
    const screenBounds = { minX: 1, maxX: -1, minY: 1, maxY: -1 };
    camera.updateMatrixWorld();
    const projected = new THREE.Vector3();
    for (let i = 0; i < fitPoints.length; i += 3) {
      projected.set(fitPoints[i], fitPoints[i + 1], fitPoints[i + 2]).project(camera);
      screenBounds.minX = Math.min(screenBounds.minX, projected.x); screenBounds.maxX = Math.max(screenBounds.maxX, projected.x);
      screenBounds.minY = Math.min(screenBounds.minY, projected.y); screenBounds.maxY = Math.max(screenBounds.maxY, projected.y);
    }
    return { status: 'approved-model-motion-study', ready, sourceHash, assetBytes, triangles, meshes,motion:motion?.inspect(),motionMode,playing,duration:HAMMER_DURATION,contactTime:HAMMER_CONTACT,
      model: '/assets/tank-t3-warden-hammer-motion-2.glb', camera: { position: camera.position.toArray(), target: controls.target.toArray(), aspect: camera.aspect },
      framing: { ...screenBounds, restHeightFraction: (screenBounds.maxY - screenBounds.minY) / 2, restWidthFraction: (screenBounds.maxX - screenBounds.minX) / 2 },
      bounds: { min: modelBounds.min.toArray(), max: modelBounds.max.toArray() },
      studioFloorY: floor.position.y,
      joint: { name: select.value, degrees: Number(slider.value) },
      joints: Array.from(bind.keys()), renderer: { canvases: document.querySelectorAll('canvas').length, dpr: renderer.getPixelRatio(), draws: frameCount, info: renderer.info.render, memory: renderer.info.memory } };
  }
  (window as any).tankViewer = { get ready() { return ready; }, inspect, setView, setJoint, resetPose, reload: load,
    setMode:(mode:string)=>setMotionMode(mode==='motion'),seek:(time:number)=>{if(!Number.isFinite(time))return;if(!motionMode)setMotionMode(true);playing=false;lastFrame=null;playhead=THREE.MathUtils.clamp(time,0,HAMMER_DURATION);showMotion(playhead);playStrike.textContent=playhead>=HAMMER_DURATION?'Replay hammer strike':playhead===0?'Watch hammer strike':'Continue strike';requestDraw()},
    render: () => { controls.update(); renderer.render(scene, camera); },
    setClean: (clean: boolean) => { document.body.classList.toggle('clean', clean); resize(); },
    capturePng: () => { controls.update(); renderer.render(scene, camera); return canvas.toDataURL('image/png'); },
  };
  window.addEventListener('pagehide', () => {
    if (!alive) return;
    alive = false; epoch++; loading?.abort(); cancelAnimationFrame(raf);
    observer.disconnect(); controls.dispose();
    document.removeEventListener('visibilitychange', visibility);
    reduced.removeEventListener('change', motionPreference);
    motion?.dispose();if (model) disposeObject(model);void audio?.close();
    floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
    environmentTarget.dispose(); key.shadow.map?.dispose(); renderer.dispose();
  }, { once: true });
  resize(); setView('three-quarter'); await load();
  if(new URLSearchParams(location.search).get('inspect')==='1')setMotionMode(false);
}

document.getElementById('exchange-mode')!.onclick=()=>{location.href='/?view=exchange&revision=tank-exchange-1'};
void (new URLSearchParams(location.search).get('view')==='practice'?import('./practice-viewer').then(m=>m.startPractice()):new URLSearchParams(location.search).get('view')==='parts'?import('./parts-viewer').then(m=>m.startParts()):new URLSearchParams(location.search).get('view')==='heroes'?import('./heroes-viewer').then(m=>m.startHeroes()):new URLSearchParams(location.search).get('view')==='exchange'?import('./exchange-viewer').then(m=>m.startExchange()):start()).catch(error => {
  status.textContent = 'This browser could not start the 3D viewer. Try a browser with 3D support.';
  console.error('Tank viewer startup:', error);
});

