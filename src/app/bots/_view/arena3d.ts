"use client";

/** One physical miniature set. Models preload as complete assemblies;
 * the scene reads the recorded fight and never alters its state or outcomes. */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { TOY_BIND, type Toy3D } from "./toy3d";
import { createCombatToy, type CombatToy } from "./combat-toy";
import { directFight, activeAttack, actionTime, ringPosition, type FightDirection, type DirectedAttack } from "./fight-director";
import type { Build, FightEvent, Side } from "../_engine/parts";
import type { FightState } from "../_engine/resolve";
import type { BotLook } from "./look";
import type { Socket } from "@/lib/bots/fixtures";
import { CRIT_CAMERA_S, HIT_STOP_S, SHAKE_S, settleFightFx, tumbleKey, type FightFx } from "./fightfx";

export interface FightSceneOpts { small: boolean; fightSeed: number; showroom?: boolean; log?: readonly FightEvent[]; reducedMotion?: boolean }
export interface FightSceneHandle {
  plate: boolean;
  setBuilds(a: Build, b: Build, looks: readonly [BotLook, BotLook]): Promise<void>;
  onEvent(e: FightEvent, st: FightState, fx: FightFx): void;
  reset(): void;
  settle(fx: FightFx): void;
  glint(side: Side): void;
  render(st: FightState, fx: FightFx): void;
  resize(w: number, h: number, dpr: number): void;
  snapshot(st:FightState,fx:FightFx):HTMLCanvasElement;
  destroy(): void;
}

const SOCKETS: Socket[] = ["head", "torso", "armL", "armR", "legL", "legR"];
const X = [-1.92, 1.92];

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const pulse = (t: number, duration: number) => t >= 0 && t < duration ? Math.sin(Math.PI * t / duration) : 0;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!; draw(ctx);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** The same soft studio reflections used in the parts cabinet. */
function studioEnvironment(renderer: THREE.WebGLRenderer) {
  const room = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const result = pmrem.fromScene(room,.04);room.dispose();pmrem.dispose();return result;
}

interface BreakShot { side: Side; socket: Socket; frame: number; key: number; group: THREE.Group; start: THREE.Vector3; rotation: THREE.Quaternion; scale: THREE.Vector3; restY?: number }
interface Impact { frame: number; side: Side; point: THREE.Vector3; strong: boolean }

export async function buildFightScene(canvas: HTMLCanvasElement, opts: FightSceneOpts): Promise<FightSceneHandle> {
  RectAreaLightUniformsLib.init();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.setClearColor(0x17120f);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17120f);
  scene.fog = new THREE.FogExp2(0x17120f, .032);
  const environment = studioEnvironment(renderer); scene.environment = environment.texture;
  scene.environmentIntensity = .30;
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, .1, 65);
  const target = new THREE.Vector3(0, 1.10, 0);
  camera.position.set(0, 3.90, 14.5); camera.lookAt(target);
  let baseCameraY=3.90,baseCameraZ=14.5;

  const hemi = new THREE.HemisphereLight(0xe8dac3, 0x4c3222, .20); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffd99b, 4.5); key.position.set(-3, 7, -4);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  key.shadow.camera.near = .5; key.shadow.camera.far = 25; key.shadow.normalBias = .025; key.shadow.bias = -.00015;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.radius = 7; key.shadow.blurSamples = 8; scene.add(key);
  const soft = new THREE.RectAreaLight(0xffead1, 1.8, 7, 6); soft.position.set(-3.5, 5, 7); soft.lookAt(0, 2, 0); scene.add(soft);
  const fill = new THREE.RectAreaLight(0xc3d9e3, .65, 5, 5); fill.position.set(5, 4, 4); fill.lookAt(0, 2, 0); scene.add(fill);
  const faceLight=new THREE.DirectionalLight(0xfff3e2,.9);faceLight.position.set(1.5,4.5,7);scene.add(faceLight);
  const rim = new THREE.DirectionalLight(0xffc370, 2.5); rim.position.set(5, 6, -3); scene.add(rim);

  const stage = new THREE.Group(); scene.add(stage);
  const ownedTextures: THREE.Texture[] = [];
  const mat = (color: number, roughness = .65, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const timber = mat(0x35221b, .48), rubber = mat(0x24221e, .75), brass = mat(0xb68c48, .28, .8);
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x=0, y=0, z=0, parent: THREE.Object3D = stage) {
    const m = new THREE.Mesh(geometry, material); m.position.set(x,y,z); m.receiveShadow = true; parent.add(m); return m;
  }
  mesh(new THREE.CylinderGeometry(6.2, 6.3, .38, 96), timber, 0, -.23, 0);
  const floorTex = canvasTexture(512, 512, c => {
    c.fillStyle = "#cbb898"; c.fillRect(0,0,512,512);
    for (let i=0;i<18000;i++) { const x=(i*97)%512, y=(i*173+Math.floor(i/512)*37)%512;
      c.fillStyle = i%2 ? "rgba(255,250,230,.035)" : "rgba(65,42,25,.023)"; c.fillRect(x,y,1,1); }
    c.strokeStyle = "rgba(106,75,39,.18)"; c.lineWidth=1.2;
    c.beginPath(); c.arc(256,256,218,0,Math.PI*2); c.stroke();
    c.strokeStyle = "rgba(106,75,39,.055)"; c.lineWidth=2;
    c.beginPath(); c.arc(256,256,104,0,Math.PI*2); c.stroke();
  }); ownedTextures.push(floorTex);
  const floorMat = new THREE.MeshStandardMaterial({color:0xfff5df, map:floorTex, roughness:.86});
  mesh(new THREE.CylinderGeometry(5.86,5.86,.055,96), floorMat,0,-.01,0);
  const ring = mesh(new THREE.TorusGeometry(5.98,.14,12,96),rubber,0,.035,0); ring.rotation.x=Math.PI/2;
  const trim = mesh(new THREE.TorusGeometry(6.2,.035,8,96),brass,0,-.12,0); trim.rotation.x=Math.PI/2;

  // Amber bulbs are geometry, with a soft halo only on the lamp itself.
  const haloTex = canvasTexture(64,64,c=>{const g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,"rgba(255,207,125,.6)");g.addColorStop(.2,"rgba(255,171,61,.15)");g.addColorStop(1,"rgba(255,147,35,0)");c.fillStyle=g;c.fillRect(0,0,64,64);});
  ownedTextures.push(haloTex);
  const bulbGeo = new THREE.SphereGeometry(.075,12,8), socketGeo=new THREE.CylinderGeometry(.105,.095,.075,12);
  const lamp = new THREE.MeshStandardMaterial({color:0xffe1ad,emissive:0xffbc59,emissiveIntensity:1.8,roughness:.22});
  const haloMat=new THREE.SpriteMaterial({map:haloTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const bulbInstances=new THREE.InstancedMesh(bulbGeo,lamp,44), socketInstances=new THREE.InstancedMesh(socketGeo,brass,44);
  stage.add(bulbInstances,socketInstances);const lampPose=new THREE.Matrix4();
  for(let i=0;i<44;i++){const a=i/44*Math.PI*2,x=Math.sin(a)*6.13,z=Math.cos(a)*6.13;
    lampPose.makeTranslation(x,.05,z);socketInstances.setMatrixAt(i,lampPose);
    lampPose.makeTranslation(x,.12,z);bulbInstances.setMatrixAt(i,lampPose);
    const halo=new THREE.Sprite(haloMat); halo.position.set(x,.14,z); halo.scale.setScalar(.65); stage.add(halo);
  }
  // Back rail only: the foreground remains open enough to see every foot.
  const railPoints:THREE.Vector3[]=[];
  for(let i=0;i<=48;i++){const a=Math.PI/2+i/48*Math.PI;railPoints.push(new THREE.Vector3(Math.sin(a)*6.12,.85,Math.cos(a)*6.12));}
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPoints),64,.055,8,false),timber);
  for(let i=0;i<7;i++){const a=Math.PI/2+i/6*Math.PI;mesh(new THREE.CylinderGeometry(.055,.085,.9,10),brass,Math.sin(a)*6.12,.40,Math.cos(a)*6.12);}

  stage.scale.set(.94,1,.94);
  // A low-detail, instanced toy audience stays in shadow behind the sharp stage.
  const headGeo=new THREE.SphereGeometry(1,12,8), coatGeo=new THREE.SphereGeometry(1,12,8);
  const audienceMat = new THREE.MeshStandardMaterial({color:0xffffff,roughness:.96});
  const audienceSteps: THREE.Mesh[]=[];
  const count=102, heads=new THREE.InstancedMesh(headGeo,audienceMat,count), coats=new THREE.InstancedMesh(coatGeo,audienceMat,count);
  stage.add(heads,coats); const dummy=new THREE.Object3D(); const col=new THREE.Color();
  const audienceColors=[0x46645f,0x725141,0xbaa174,0x654d60,0x3a4657,0x776b4a];
  let index=0;
  for(let row=0;row<3;row++){
    const radius=7.15+row*1.05;
    const step=mesh(new THREE.TorusGeometry(radius,.22,8,64,Math.PI),mat(0x2b211a),0,.20+row*.58,0);step.rotation.x=-Math.PI/2;step.castShadow=false;audienceSteps.push(step);
    for(let j=0;j<34;j++){const a=Math.PI/2+.08+(j/33)*(Math.PI-.16),x=Math.sin(a)*radius,z=Math.cos(a)*radius,y=.48+row*.60;
      dummy.position.set(x,y+.26,z);dummy.rotation.set(0,a,0);dummy.scale.set(.23,.34,.2);dummy.updateMatrix();coats.setMatrixAt(index,dummy.matrix);
      col.setHex(audienceColors[(j*7+row*3)%audienceColors.length]);coats.setColorAt(index,col);
      dummy.position.y=y+.69;dummy.scale.set(.17,.2,.17);dummy.updateMatrix();heads.setMatrixAt(index,dummy.matrix);
      col.setHex([0xb48b65,0x9c7353,0xc19c72][j%3]);heads.setColorAt(index,col);index++;
    }
  }
  heads.instanceMatrix.needsUpdate=true;coats.instanceMatrix.needsUpdate=true;
  // A soft photographic audience is a single background surface. Resolve it
  // before exposing the stage: it never swaps in during a fight.
  try {
    const backdrop=await new THREE.TextureLoader().loadAsync("/bots-art/plates/arena-evening.png");
    backdrop.colorSpace=THREE.SRGBColorSpace;backdrop.repeat.set(1,.46);backdrop.offset.set(0,.54);ownedTextures.push(backdrop);
    const audience=mesh(new THREE.PlaneGeometry(34,8.8),new THREE.MeshBasicMaterial({map:backdrop,color:0xa89c88,toneMapped:false}),0,4.85,-8.3);
    scene.attach(audience);audience.scale.set(1,1,1);audience.position.set(0,3.6,-8.3);
    audience.receiveShadow=false;heads.visible=false;coats.visible=false;audienceSteps.forEach(step=>{step.visible=false;});
  } catch { /* The complete physical audience is available without a download. */ }


  const contactTex = canvasTexture(128,128,c=>{const g=c.createRadialGradient(64,64,4,64,64,64);g.addColorStop(0,"rgba(32,22,14,.45)");g.addColorStop(.45,"rgba(32,22,14,.16)");g.addColorStop(1,"rgba(32,22,14,0)");c.fillStyle=g;c.fillRect(0,0,128,128);});
  ownedTextures.push(contactTex);
  const contacts = X.map(x=>{const m=mesh(new THREE.PlaneGeometry(2.6,1.7),new THREE.MeshBasicMaterial({map:contactTex,transparent:true,depthWrite:false}),x,.025,0);m.rotation.x=-Math.PI/2;scene.attach(m);m.scale.set(1,1,1);m.position.set(x,.027,0);return m;});
  // Small occlusion directly beneath each foot anchors mixed wheels and boots.
  const footContacts = Array.from({length:4},()=>{
    const m=mesh(new THREE.PlaneGeometry(.92,.88),new THREE.MeshBasicMaterial({map:contactTex,transparent:true,depthWrite:false,opacity:.9}));
    scene.attach(m);m.scale.set(1,1,1);m.rotation.x=-Math.PI/2;return m;
  });
  const footPoint=new THREE.Vector3();
  function placeContacts(toy:CombatToy,i:number) {
    toy.root.updateMatrixWorld(true);
    footPoint.set(0,.65,0).applyMatrix4(toy.sockets.torso.matrixWorld);
    contacts[i].position.set(footPoint.x,.027,footPoint.z);
    (contacts[i].material as THREE.MeshBasicMaterial).opacity=footPoint.y<1.2?1.35:1;
    for(let n=0;n<2;n++){
      const socket=n===0?"legL":"legR", foot=footContacts[i*2+n];
      foot.visible=toy.sockets[socket].userData.visible !== false && toy.sockets[socket].visible;
      if(toy.blender)footPoint.set(0,-.14,.07).applyMatrix4(toy.bones[n===0?"ankleL":"ankleR"].matrixWorld);
      else footPoint.set(0,-TOY_BIND[socket][1],.12).applyMatrix4(toy.sockets[socket].matrixWorld);
      foot.position.set(footPoint.x,.029,footPoint.z);
      (foot.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.90-Math.max(0,footPoint.y)*2);
    }
  }
  let toys: CombatToy[]=[];
  let direction: FightDirection = {attacks:[],breakFrames:[],finalFrame:0};
  let extraHeight=0;
  const broken: BreakShot[]=[];
  const impacts: Impact[]=[];
  const reportedContacts=new Set<number>();
  const dustGroup=new THREE.Group();scene.add(dustGroup);
  const sparkGeo=new THREE.SphereGeometry(.024,6,4),sparkMat=new THREE.MeshBasicMaterial({color:0xffd996});
  const sparks:THREE.Mesh[]=[];
  for(let i=0;i<24;i++){const s=mesh(sparkGeo,sparkMat,0,0,0,dustGroup);s.visible=false;sparks.push(s);}
  const dustTex=canvasTexture(64,64,c=>{const g=c.createRadialGradient(32,32,1,32,32,31);g.addColorStop(0,"rgba(255,235,190,.55)");g.addColorStop(.45,"rgba(240,204,151,.23)");g.addColorStop(1,"rgba(235,196,135,0)");c.fillStyle=g;c.fillRect(0,0,64,64);});
  ownedTextures.push(dustTex);
  const dust=Array.from({length:18},()=>{const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:dustTex,transparent:true,depthWrite:false,opacity:0}));sprite.visible=false;scene.add(sprite);return sprite;});
  const bodyBox=new THREE.Box3(),pieceBox=new THREE.Box3();
  const settledGround=new Map<Toy3D,number>();
  // Rotated bounding-box corners contain empty space. A settled rounded toy
  // rests on its actual surface, so measure vertices once for its final pose.
  function surfaceFloor(object:THREE.Object3D){
    let bottom=Infinity;object.updateMatrixWorld(true);
    const v=new THREE.Vector3();
    object.traverseVisible(o=>{if(o instanceof THREE.Mesh){const a=o.geometry.getAttribute("position");if(o instanceof THREE.SkinnedMesh)o.skeleton.update();if(a)for(let n=0;n<a.count;n++){v.fromBufferAttribute(a,n);if(o instanceof THREE.SkinnedMesh)o.applyBoneTransform(n,v);v.applyMatrix4(o.matrixWorld);bottom=Math.min(bottom,v.y);}}});
    return bottom;
  }
  function keepAboveMat(toy:Toy3D){
    bodyBox.makeEmpty();toy.root.updateMatrixWorld(true);
    toy.root.traverseVisible(o=>{if(o instanceof THREE.Mesh){if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();if(o.geometry.boundingBox){pieceBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);bodyBox.union(pieceBox);}}});
    if(Number.isFinite(bodyBox.min.y)&&bodyBox.min.y<.025)toy.root.position.y+=.025-bodyBox.min.y;
  }
  let dead=false, phone=opts.small, lastFrame=0, renderSamples=0, renderTotal=0, lastPerformanceReport=-600;

  function basePose(i:number) {
    const toy=toys[i];toy.resetPose();toy.root.position.set(X[i],0,i===0?.08:-.08);
    toy.root.rotation.set(0,i===0?1.20:-1.20,0);toy.root.scale.setScalar(opts.showroom?.83:.68);
  }
  function cleanDebris(){for(const b of broken){scene.remove(b.group);b.group.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}broken.length=0;impacts.length=0;settledGround.clear();}
  function recordBreak(e: Extract<FightEvent,{t:"break"}>, st: FightState, fx: FightFx) {
    if(e.part===1 || !toys[e.who] || broken.some(b=>b.side===e.who&&b.socket===SOCKETS[e.part]))return;
    const toy=toys[e.who],socket=SOCKETS[e.part];
    // Capture the same meshes, materials and paint once. No texture loads or
    // smaller replacement drawing can appear when a piece leaves its socket.
    pose(st,fx);toy.root.updateMatrixWorld(true);
    const group=toy.freezePart(socket);group.visible=true;
    const start=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
    group.updateMatrixWorld(true);group.matrixWorld.decompose(start,rotation,scale);
    group.position.copy(start);group.quaternion.copy(rotation);group.scale.copy(scale);scene.add(group);
    broken.push({side:e.who,socket,frame:e.f,key:tumbleKey(opts.fightSeed,e.f,e.who,e.part),group,start,rotation,scale});
  }
  function onEvent(e:FightEvent,st:FightState,fx:FightFx){
    if(opts.showroom)return;
    if(e.t==="hit"){
      const victim=e.who===0?1:0;fx.sides[victim].recoil=0;fx.sides[victim].recoilPiece=e.part;
      fx.sides[victim].recoilPower=e.crit?2.35:1;
      fx.sides[e.who].recover=0;fx.sides[e.who].overRotate=0;
      fx.hitStop=Math.max(fx.hitStop,e.crit?HIT_STOP_S:.045);
      fx.shake=Math.max(fx.shake,e.crit?SHAKE_S*1.65:.055);fx.shakeAmp=e.crit?3.2:1.05;
      if(e.crit){fx.critical=0;fx.criticalSide=victim as Side;}
      pose(st,fx);
      impacts.push({frame:e.f,side:victim as Side,point:toys[victim].target(SOCKETS[e.part],new THREE.Vector3()),strong:!!e.crit});
    }else if(e.t==="miss"){
      fx.sides[e.who===0?1:0].lean=0;fx.sides[e.who].recover=0;fx.sides[e.who].overRotate=1;
    }else if(e.t==="block"){
      fx.sides[e.who].block=0;fx.sides[e.who].blockArm=e.arm;fx.sides[e.who===0?1:0].recover=0;
      pose(st,fx);
      impacts.push({frame:e.f,side:e.who,point:toys[e.who].target(SOCKETS[e.arm],new THREE.Vector3()),strong:false});
    }else if(e.t==="break"){
      fx.sides[e.who].gone[e.part]=1;fx.sides[e.who].crack=0;fx.sides[e.who].crackPiece=e.part;
      fx.hitStop=.08;fx.shake=.12;fx.shakeAmp=3;recordBreak(e,st,fx);
    }else if(e.t==="ko"){
      fx.ko=0;fx.hitStop=.10;fx.sides[e.winner===0?1:0].sit=0;fx.sides[e.winner].armsUp=0;
    }else if(e.t==="timeout"){fx.timeout=0;fx.sides[e.winner].armsUp=0;}
  }
  const armMask=["armL","elbowL","wristL","armR","elbowR","wristR"];
  const legMask=["legL","kneeL","ankleL","legR","kneeR","ankleR"];
  const hitTarget=new THREE.Vector3(),jointPos=new THREE.Vector3(),tipPos=new THREE.Vector3(),from=new THREE.Vector3(),toward=new THREE.Vector3();
  const worldQ=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),deltaQ=new THREE.Quaternion();
  const fallAxis=new THREE.Vector3(0,0,1),fallQ=new THREE.Quaternion();
  const reachA=new THREE.Vector3(),reachB=new THREE.Vector3(),reachC=new THREE.Vector3();
  function approachContact(toy:CombatToy,action:DirectedAttack,victim:CombatToy,amount:number){
    if(amount<=0||action.move==="shove")return;
    const kick=action.move==="kick",side=action.move==="punch"?"L":kick&&action.mirror?"L":"R";
    toy.root.updateMatrixWorld(true);
    const upper=toy.bones[(kick?"leg":"arm")+side],middle=toy.bones[(kick?"knee":"elbow")+side],lower=toy.bones[(kick?"ankle":"wrist")+side];
    upper.getWorldPosition(reachA);middle.getWorldPosition(reachB);lower.getWorldPosition(reachC);
    const end=kick?tipPos.set(0,-.10,.28).applyMatrix4(lower.matrixWorld):action.move==="punch"?toy.hand("L",tipPos):toy.tip(tipPos);
    const reach=(reachA.distanceTo(reachB)+reachB.distanceTo(reachC)+reachC.distanceTo(end))*.94;
    victim.target(SOCKETS[action.part],hitTarget);
    if(action.outcome==="miss")hitTarget.z-=.55;
    const dy=hitTarget.y-reachA.y;
    const allowed=Math.sqrt(Math.max(.08,reach*reach-dy*dy));
    toward.copy(hitTarget).sub(reachA);toward.y=0;const distance=toward.length();
    if(distance>allowed){toy.root.position.addScaledVector(toward,(distance-allowed)/distance*amount);toy.root.updateMatrixWorld(true);}
  }
  function correctContact(toy:CombatToy, action:DirectedAttack, victim:CombatToy, amount:number){
    if(amount<=0 || action.move==="shove")return;
    const side=action.move==="punch"?"L":action.move==="kick"&&action.mirror?"L":"R";
    const kick=action.move==="kick";
    const chain=kick?["ankle"+side,"knee"+side,"leg"+side]:["wrist"+side,"elbow"+side,"arm"+side];
    victim.target(SOCKETS[action.part],hitTarget);
    if(action.outcome==="miss"){
      // The weapon crosses the space the defender just left, visibly clear.
      hitTarget.z-=.55;hitTarget.y+=action.index%2?.16:-.16;
    }
    const end=()=>kick?tipPos.set(0,-.10,.28).applyMatrix4(toy.bones["ankle"+side].matrixWorld):action.move==="punch"?toy.hand("L",tipPos):toy.tip(tipPos);
    for(let pass=0;pass<18;pass++)for(const name of chain){
      const bone=toy.bones[name];if(!bone)continue;
      toy.root.updateMatrixWorld(true);end();bone.getWorldPosition(jointPos);
      from.copy(tipPos).sub(jointPos);toward.copy(hitTarget).sub(jointPos);
      if(from.lengthSq()<1e-7||toward.lengthSq()<1e-7)continue;
      deltaQ.setFromUnitVectors(from.normalize(),toward.normalize());
      const angle=2*Math.acos(Math.min(1,Math.abs(deltaQ.w)));
      if(angle>.48)deltaQ.slerp(new THREE.Quaternion(),1-.48/angle);
      bone.getWorldQuaternion(worldQ);bone.parent?.getWorldQuaternion(parentQ);
      worldQ.premultiply(deltaQ);worldQ.premultiply(parentQ.invert());bone.quaternion.slerp(worldQ,amount);
    }
  }
  function pose(st:FightState,fx:FightFx){
    // stepFight leaves frame pointing at the NEXT beat; the visible pose is
    // the beat that just emitted its events.
    const eventFrame=Math.max(0,st.frame-1);
    // The engine stops at the result. Its last swing still needs to recover,
    // so only animation/contact time advances with the existing result clock.
    const frame=eventFrame+(st.done?Math.max(0,fx.ko,fx.timeout)*60:0);
    const actions:(DirectedAttack|undefined)[]=[];
    for(let i=0;i<toys.length;i++){
      const toy=toys[i],s=st.sides[i],v=fx.sides[i],dir=i===0?1:-1;
      basePose(i);
      const now=opts.showroom?fx.time:frame/60;
      const pos=ringPosition(direction,i as Side,eventFrame,opts.fightSeed);
      toy.root.position.set(pos.x,.025,pos.z);toy.root.rotation.y=pos.yaw;
      if(opts.showroom){toy.root.rotation.y=(i===0?.25:-.25)+Math.sin(now*.25+i)*.075;toy.root.position.x=X[i];placeContacts(toy,i);continue;}
      toy.applyClip("guard",0,1,armMask);
      const lostLegs=Number(s.armor[4]<=0)+Number(s.armor[5]<=0);
      const action=activeAttack(direction,i as Side,frame);actions[i]=action;
      const step=(pos.stride%1+1)%1;
      if(!st.done&&lostLegs===0){
        toy.applyClip("advance",step,.75,legMask);
        for(const side of ["L","R"] as const){
          const n=side==="L"?0:1;
          if(toy.movement[n]==="wheel"){
            toy.bones["leg"+side].rotation.set(0,0,0);toy.bones["knee"+side].rotation.set(0,0,0);if(toy.bones["wheel"+side])toy.bones["wheel"+side].rotation.x=-now*2.4;
          }
        }
      }
      // Weight stays on the mat: only the swing foot gets a small lift.
      toy.root.position.y+=Math.sin(now*2+i)*.007;
      toy.bones.head.rotation.y+=Math.sin(now*.7+i)*.025;
      if(action){
        const phase=actionTime(action,frame);
        if(action.move==="shove")toy.bones.torso.rotation.x=-Math.sin(phase*Math.PI)*.16;
        else toy.applyClip(action.move,phase,1,action.move==="kick"?legMask:armMask,action.mirror);
        const push=phase<.5?smooth(phase*2):1-smooth((phase-.5)*2);
        toy.root.position.x+=dir*push*.18;
        toy.bones.torso.rotation.y+=Math.sin(phase*Math.PI)*(action.move==="backhand"?-.12:.10);
      }else if(!st.done){
        // Quiet guard feints have no contact cue and never invent an event.
        const feint=Math.pow(Math.max(0,Math.sin(now*3.4+i*2.1+opts.fightSeed*.03)),5);
        toy.bones.armL.rotation.x-=feint*.12;toy.bones.torso.rotation.y+=feint*.035;
      }
      // Read both sides' timelines before they reach contact so a dodge is
      // anticipation and escape, not a bend that begins after the miss.
      const incoming=direction.attacks.find(a=>a.defender===i&&a.outcome!=="hit"&&frame>=a.frame-13&&frame<=a.frame+16);
      if(incoming){
        const u=(frame-incoming.frame+13)/29,k=Math.sin(Math.PI*Math.max(0,Math.min(1,u)));
        if(incoming.outcome==="miss"){
          toy.applyClip("slip",u,1,["torso","head"]);toy.root.position.z+=.48*k;toy.root.position.x-=dir*.17*k;toy.root.position.y-=.08*k;
        }else toy.applyClip("block",u,1,armMask,incoming.part===3);
      }
      const recoil=pulse(v.recoil,.24),recoilPower=v.recoilPower;toy.root.position.x-=dir*recoil*.12*recoilPower;toy.root.position.z+=recoil*.035*recoilPower;toy.bones.torso.rotation.z+=dir*recoil*.11*recoilPower;
      if(lostLegs===1){
        toy.root.position.y-=.07;toy.root.rotation.z+=s.armor[4]<=0?-.09:.09;
        const remaining=s.armor[4]>0?"L":"R";toy.bones["leg"+remaining].rotation.x+=Math.sin(now*7)*.09;
      }
      if(lostLegs===2){toy.root.position.y-=.68;toy.root.rotation.x=.12;}
      if(v.sit>=0){
        const k=smooth(v.sit/.65);toy.applyClip("knockout",k,1,armMask);
        // Fall across the mat in camera space; rolling a side-facing robot
        // around its local Z would tip it into depth and hide the fall.
        toy.root.quaternion.premultiply(fallQ.setFromAxisAngle(fallAxis,dir*1.48*k));
        toy.root.position.x-=dir*.42*k;toy.root.position.z-=.18*k;
      }
      if(v.armsUp>=0){const k=smooth(v.armsUp/.55);toy.bones.armL.rotation.z-=1.60*k;toy.bones.armR.rotation.z+=1.45*k;toy.bones.head.rotation.x-=.08*k;}
      if(toy.bones.mechanism&&!st.done)toy.bones.mechanism.rotation.y=now*22;
      for(let p=0;p<6;p++)toy.setVisible(SOCKETS[p],p===1||s.armor[p]>0);
      toy.setVisible("weapon",s.armor[3]>0);
      toy.root.updateMatrixWorld(true);
      if(toy.blender && v.sit<0 && lostLegs<2) {
        // A boot's sole remains level under the moving knee. Keep one support
        // on the floor; wheels rotate about their own axle instead.
        let floor=Infinity;
        for(const side of ["L","R"] as const) {
          const n=side==="L"?0:1;
          if(s.armor[4+n]<=0 || (action?.move==="kick" && side===(action.mirror?"L":"R")))continue;
          const ankle=toy.bones["ankle"+side];
          if(toy.movement[n]!=="wheel") {
            ankle.parent!.getWorldQuaternion(parentQ); toy.root.getWorldQuaternion(worldQ);
            ankle.quaternion.copy(parentQ.invert().multiply(worldQ));
          }
          toy.root.updateMatrixWorld(true);
          floor=Math.min(floor,tipPos.set(0,-.16,0).applyMatrix4(ankle.matrixWorld).y);
        }
        if(Number.isFinite(floor))toy.root.position.y+=.028-floor;
      } else if(v.sit>=0 || lostLegs===2) {
        const floor=surfaceFloor(toy.root);
        if(Number.isFinite(floor))toy.root.position.y+=.028-floor;
      }
      toy.root.updateMatrixWorld(true);
    }
    if(!opts.showroom)for(let i=0;i<toys.length;i++){
      const a=actions[i];if(!a||fx.sides[i].sit>=0)continue;
      const delta=frame-a.frame;
      const amount=delta<=-3?smooth((delta+22)/19):delta<=0?1:1-smooth(delta/17);
      approachContact(toys[i],a,toys[i===0?1:0],amount);
    }
    if(!opts.showroom)for(let sweep=0;sweep<2;sweep++)for(let i=0;i<toys.length;i++){
      const a=actions[i];
      if(a&&frame<a.end&&fx.sides[i].sit<0){
        const delta=frame-a.frame;
        const amount=delta<=0?smooth((delta+11)/11):1-smooth(delta/12);
        correctContact(toys[i],a,toys[i===0?1:0],amount);
        if(process.env.NODE_ENV!=="production" && sweep===1 && delta===0 && a.outcome!=="miss" && a.move!=="shove") {
          const toy=toys[i],victim=toys[i===0?1:0];toy.root.updateMatrixWorld(true);
          const side=a.mirror?"L":"R";
          const end=a.move==="kick"?tipPos.set(0,-.10,.28).applyMatrix4(toy.bones["ankle"+side].matrixWorld):a.move==="punch"?toy.hand("L",tipPos):toy.tip(tipPos);
          victim.target(SOCKETS[a.part],hitTarget);
          const report={frame,move:a.move,error:+end.distanceTo(hitTarget).toFixed(4)};
          canvas.parentElement?.setAttribute("data-contact",JSON.stringify(report));
          if(!reportedContacts.has(a.index)){reportedContacts.add(a.index);console.info("[toy-contact]",JSON.stringify(report));}
        }
      }
    }
    for(let i=0;i<toys.length;i++)placeContacts(toys[i],i);
  }
  function render(st:FightState,fx:FightFx){
    if(dead||toys.length!==2)return;const drawStart=performance.now();lastFrame=st.frame;pose(st,fx);
    for(const b of broken){
      const age=Math.max(0,fx.time-b.frame/60),dir=b.side===0?-1:1;
      const land=.62,fly=Math.min(age,land),extra=Math.max(0,age-land);
      const vx=dir*(.8+(b.key%100)/250),vz=.65+(b.key%71)/150;
      b.group.position.copy(b.start);b.group.position.x+=vx*fly+dir*.18*(1-Math.exp(-extra*5));b.group.position.z+=vz*fly;
      const resting=.18+(b.socket==="head"?.48:b.socket.startsWith("arm")?.20:.14);
      const drop=b.start.y-resting;
      b.group.position.y=resting+Math.max(0,drop*(1-fly/land)+.9*Math.sin(fly/land*Math.PI))+(extra<.35?.10*Math.sin(extra/.35*Math.PI):0);
      b.group.quaternion.copy(b.rotation);b.group.rotateZ(dir*(fly*4.6+Math.min(extra,.35)*.5));b.group.rotateX(Math.min(fly*2.3,1.42));
      if(age>.97){
        if(b.restY===undefined)b.restY=b.group.position.y+.035-surfaceFloor(b.group);
        b.group.position.y=b.restY;
      }
      // Debris persists on the mat until an explicit replay restart.
    }
    sparks.forEach(s=>{s.visible=false;});dust.forEach(s=>{s.visible=false;});let sparkIndex=0,dustIndex=0;
    for(let i=impacts.length-1;i>=0&&sparkIndex<sparks.length;i--){const p=impacts[i],age=fx.time-p.frame/60;
      if(age>=0&&age<.65){
        for(let n=0;n<6&&dustIndex<dust.length;n++){
          const d=dust[dustIndex++],a=n/6*Math.PI*2;d.visible=true;
          d.position.copy(p.point);d.position.x+=Math.cos(a)*age*.75;d.position.y+=Math.sin(a)*age*.50+age*.12;d.position.z+=n*.018;
          d.scale.setScalar(.10+age*.50);d.material.opacity=.42*Math.pow(1-age/.65,2);d.material.rotation=a+age;
        }
      }
      if(age<0||age>.25)continue;
      for(let n=0;n<6&&sparkIndex<sparks.length;n++){
        const s=sparks[sparkIndex++],a=n/6*Math.PI*2;s.visible=true;
        s.position.copy(p.point);s.position.x+=Math.cos(a)*age*1.7;s.position.y+=Math.sin(a)*age*1.7-age*age*2;s.position.z+=(n%2)*age;
        s.scale.setScalar((p.strong?1.5:1)*(1-age/.25));
      }
    }
    const critical=opts.reducedMotion?0:pulse(fx.critical,CRIT_CAMERA_S);
    const emphasis=opts.reducedMotion?0:Math.max(pulse(fx.ko,.8),pulse(fx.sides[0].crack,.45),pulse(fx.sides[1].crack,.45),critical*1.35);
    const midpoint=(toys[0].root.position.x+toys[1].root.position.x)*.5;
    const shake=opts.reducedMotion||fx.shake<=0?0:Math.min(1,fx.shake/SHAKE_S)*fx.shakeAmp;
    const phase=fx.time*74+opts.fightSeed*.017;
    const focus=critical*toys[fx.criticalSide].root.position.x*.09;
    camera.position.x=opts.reducedMotion?0:midpoint*.16+focus+Math.sin(phase*2.17)*shake*.012;
    camera.position.y=baseCameraY+Math.cos(phase*2.83)*shake*.009;
    camera.position.z=baseCameraZ;
    target.x=focus*.42;
    camera.zoom=1+emphasis*.068;camera.updateProjectionMatrix();camera.lookAt(target);renderer.render(scene,camera);
    if(process.env.NODE_ENV!=="production"){
      renderTotal+=performance.now()-drawStart;renderSamples++;
      if(renderSamples>=30){
        canvas.dataset.renderMs=(renderTotal/renderSamples).toFixed(2);
        if(st.frame-lastPerformanceReport>=600){
          console.info("[toy-performance]",JSON.stringify({frame:st.frame,cpuRenderMs:+canvas.dataset.renderMs,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio(),phoneLayout:phone}));
          lastPerformanceReport=st.frame;
        }
        renderSamples=0;renderTotal=0;
      }
      canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);canvas.dataset.renderer=toys.every(t=>t.blender)?"blender-toys":"articulated-toys";canvas.dataset.moves=direction.attacks.filter(a=>Math.abs(a.frame-st.frame)<10).map(a=>a.move).join(",");
    }
  }
  return {
    plate:true,
    async setBuilds(a,b,looks){
      if(dead)return;const next=await Promise.all([createCombatToy(a,looks[0]),createCombatToy(b,looks[1])]);
      if(dead){next.forEach(t=>t.dispose());return;}
      direction=directFight(opts.log??[],[a,b]);
      cleanDebris();for(const t of toys){scene.remove(t.root);t.dispose();}toys=next;extraHeight=Math.max(0,...toys.map(toy=>toy.height-4.1));
      toys.forEach((t,i)=>{scene.add(t.root);basePose(i);});
      await renderer.compileAsync(scene,camera);
    },
    snapshot(st,fx){
      if(dead)throw new Error("The ring is closed.");
      const size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();
      const picture=document.createElement("canvas");picture.style.setProperty("--font-bots-toy",getComputedStyle(canvas).getPropertyValue("--font-bots-toy"));picture.width=1600;picture.height=Math.round(1600*size.y/Math.max(1,size.x));
      const context=picture.getContext("2d");if(!context)throw new Error("The picture could not be saved.");
      try {renderer.setPixelRatio(1);renderer.setSize(picture.width,picture.height,false);render(st,fx);context.drawImage(canvas,0,0);}
      finally {renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);render(st,fx);}
      return picture;
    },
    onEvent,
    reset(){cleanDebris();toys.forEach((_,i)=>basePose(i));lastFrame=0;},
    settle(fx){settleFightFx(fx);},
    glint(){ /* The enamel catches the real light as the hand turns. */ },
    render,
    resize(w,h,dpr){if(dead||w<=0||h<=0)return;phone=w/h<1.35;renderer.setPixelRatio(Math.min(dpr,phone?1.35:1.75));renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=phone?Math.max(32,2*Math.atan(3.05/(12.5*camera.aspect))*180/Math.PI):30;baseCameraY=phone?3.45:3.9;baseCameraZ=phone?12.5:14.5;camera.position.set(0,baseCameraY,baseCameraZ);target.set(0,1.10,0);camera.lookAt(target);camera.updateProjectionMatrix();},
    destroy(){
      if(dead)return;dead=true;cleanDebris();for(const t of toys){scene.remove(t.root);t.dispose();}toys=[];
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
      scene.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}if(o instanceof THREE.Sprite)materials.add(o.material);});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());
      key.shadow.dispose();environment.dispose();renderer.dispose();
    },
  };
}
