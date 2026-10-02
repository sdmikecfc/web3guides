"use client";

/** One physical miniature set. Models arrive as complete synchronous assemblies;
 * the scene reads the recorded fight and never alters its state or outcomes. */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { createToy, TOY_BIND, type Toy3D } from "./toy3d";
import type { Build, FightEvent, Side } from "../_engine/parts";
import type { FightState } from "../_engine/resolve";
import type { BotLook } from "./look";
import type { Socket } from "@/lib/bots/fixtures";
import { settleFightFx, tumbleKey, type FightFx } from "./fightfx";

export interface FightSceneOpts { small: boolean; fightSeed: number; showroom?: boolean }
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
interface Impact { frame: number; side: Side; height: number; strong: boolean }

export async function buildFightScene(canvas: HTMLCanvasElement, opts: FightSceneOpts): Promise<FightSceneHandle> {
  RectAreaLightUniformsLib.init();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.10;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  renderer.setClearColor(0x17120f);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x17120f);
  scene.fog = new THREE.FogExp2(0x17120f, .032);
  const environment = studioEnvironment(renderer); scene.environment = environment.texture;
  scene.environmentIntensity = .36;
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, .1, 65);
  const target = new THREE.Vector3(0, 1.82, 0);
  camera.position.set(0, 4.65, 13.7); camera.lookAt(target);

  const hemi = new THREE.HemisphereLight(0xe8dac3, 0x4c3222, .38); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe2b7, 5.5); key.position.set(-3, 8, -4);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -7; key.shadow.camera.right = 7; key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  key.shadow.camera.near = .5; key.shadow.camera.far = 25; key.shadow.normalBias = .025; key.shadow.bias = -.00015;
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.radius = 7; key.shadow.blurSamples = 8; scene.add(key);
  const soft = new THREE.RectAreaLight(0xffead1, 3.1, 7, 6); soft.position.set(-3.5, 5, 7); soft.lookAt(0, 2, 0); scene.add(soft);
  const fill = new THREE.RectAreaLight(0xc3d9e3, 1.1, 5, 5); fill.position.set(5, 4, 4); fill.lookAt(0, 2, 0); scene.add(fill);
  const faceLight=new THREE.DirectionalLight(0xfff3e2,2.3);faceLight.position.set(1.5,4.5,7);scene.add(faceLight);
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

  stage.scale.set(.76,1,.76);
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
  function placeContacts(toy:Toy3D,i:number) {
    toy.root.updateMatrixWorld(true);
    footPoint.set(0,.65,0).applyMatrix4(toy.sockets.torso.matrixWorld);
    contacts[i].position.set(footPoint.x,.027,footPoint.z);
    (contacts[i].material as THREE.MeshBasicMaterial).opacity=footPoint.y<1.2?1.35:1;
    for(let n=0;n<2;n++){
      const socket=n===0?"legL":"legR", foot=footContacts[i*2+n];
      foot.visible=toy.sockets[socket].visible;
      footPoint.set(0,-TOY_BIND[socket][1],.12).applyMatrix4(toy.sockets[socket].matrixWorld);
      foot.position.set(footPoint.x,.029,footPoint.z);
      (foot.material as THREE.MeshBasicMaterial).opacity=Math.max(0,.90-Math.max(0,footPoint.y)*2);
    }
  }
  let toys: Toy3D[]=[];
  let extraHeight=0;
  const broken: BreakShot[]=[];
  const impacts: Impact[]=[];
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
    object.traverseVisible(o=>{if(o instanceof THREE.Mesh){const a=o.geometry.getAttribute("position"),m=o.matrixWorld.elements;if(a)for(let n=0;n<a.count;n++)bottom=Math.min(bottom,m[1]*a.getX(n)+m[5]*a.getY(n)+m[9]*a.getZ(n)+m[13]);}});
    return bottom;
  }
  function keepAboveMat(toy:Toy3D){
    bodyBox.makeEmpty();toy.root.updateMatrixWorld(true);
    toy.root.traverseVisible(o=>{if(o instanceof THREE.Mesh){if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();if(o.geometry.boundingBox){pieceBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);bodyBox.union(pieceBox);}}});
    if(Number.isFinite(bodyBox.min.y)&&bodyBox.min.y<.025)toy.root.position.y+=.025-bodyBox.min.y;
  }
  let dead=false, phone=opts.small, lastFrame=0, renderSamples=0, renderTotal=0;

  function basePose(i:number) {
    const toy=toys[i];toy.resetPose();toy.root.position.set(X[i],0,i===0?.08:-.08);
    toy.root.rotation.set(0,i===0?.32:-.32,0);toy.root.scale.set(i===0?1:-1,1,1);
  }
  function cleanDebris(){for(const b of broken)scene.remove(b.group);broken.length=0;impacts.length=0;settledGround.clear();}
  function recordBreak(e: Extract<FightEvent,{t:"break"}>, st: FightState, fx: FightFx) {
    if(e.part===1 || !toys[e.who] || broken.some(b=>b.side===e.who&&b.socket===SOCKETS[e.part]))return;
    const toy=toys[e.who],socket=SOCKETS[e.part];
    // Capture the same meshes, materials and paint once. No texture loads or
    // smaller replacement drawing can appear when a piece leaves its socket.
    pose(st,fx);toy.root.updateMatrixWorld(true);
    const source=toy.sockets[socket]; const group=source.clone(true);group.visible=true;
    const start=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
    source.matrixWorld.decompose(start,rotation,scale);
    group.position.copy(start);group.quaternion.copy(rotation);group.scale.copy(scale);scene.add(group);
    broken.push({side:e.who,socket,frame:e.f,key:tumbleKey(opts.fightSeed,e.f,e.who,e.part),group,start,rotation,scale});
  }
  function onEvent(e:FightEvent,st:FightState,fx:FightFx){
    if(opts.showroom)return;
    if(e.t==="hit"){
      const victim=e.who===0?1:0;fx.sides[victim].recoil=0;fx.sides[victim].recoilPiece=e.part;
      fx.sides[e.who].recover=0;fx.sides[e.who].overRotate=0;
      impacts.push({frame:e.f,side:victim as Side,height:e.part===0?3.3:e.part<4?2.1:.7,strong:!!e.crit});
    }else if(e.t==="miss"){
      fx.sides[e.who===0?1:0].lean=0;fx.sides[e.who].recover=0;fx.sides[e.who].overRotate=1;
    }else if(e.t==="block"){
      fx.sides[e.who].block=0;fx.sides[e.who].blockArm=e.arm;fx.sides[e.who===0?1:0].recover=0;
      impacts.push({frame:e.f,side:e.who,height:2.2,strong:false});
    }else if(e.t==="break"){
      fx.sides[e.who].gone[e.part]=1;fx.sides[e.who].crack=0;fx.sides[e.who].crackPiece=e.part;
      fx.hitStop=.08;fx.shake=.12;fx.shakeAmp=3;recordBreak(e,st,fx);
    }else if(e.t==="ko"){
      fx.ko=0;fx.hitStop=.10;fx.sides[e.winner===0?1:0].sit=0;fx.sides[e.winner].armsUp=0;
    }else if(e.t==="timeout"){fx.timeout=0;fx.sides[e.winner].armsUp=0;}
  }
  function pose(st:FightState,fx:FightFx){
    for(let i=0;i<toys.length;i++){
      const toy=toys[i],s=st.sides[i],v=fx.sides[i],dir=i===0?1:-1;
      basePose(i);
      const now=opts.showroom?fx.time:st.frame/60;
      const breath=Math.sin(now*1.65+i*1.4)*.012;
      toy.sockets.torso.scale.y*=1+breath;
      toy.sockets.head.rotation.y=Math.sin(now*.65+i)*.035;
      toy.sockets.head.position.y+=breath*.4;
      if(opts.showroom){
        toy.root.rotation.y+=Math.sin(now*.25+i)*.075;
        toy.sockets.armL.rotation.z+=Math.sin(now*.9+i)*.025;
        toy.sockets.armR.rotation.z-=Math.sin(now*.9+i)*.025;
        placeContacts(toy,i);continue;
      }
      for(let p=0;p<6;p++)toy.sockets[SOCKETS[p]].visible=p===1 || s.armor[p]>0;
      toy.sockets.weapon.visible=s.armor[3]>0;
      const sw=s.swingT;
      let reach=0;
      if(!st.done && s.staggerT===0 && sw>0 && sw<=14){
        if(sw>6){const t=(14-sw)/8;toy.sockets.armR.rotation.z=-.22-.68*t;toy.root.rotation.z=.05*dir*t;}
        else{reach=smooth((6-sw)/6);toy.sockets.armR.rotation.z=-.9+2.0*reach;toy.sockets.armR.rotation.x=-.35*reach;}
      }
      if(v.recover>=0&&v.recover<.24){const k=1-smooth(v.recover/.24);reach=Math.max(reach,k);toy.sockets.armR.rotation.z+=1.08*k;}
      toy.root.position.x+=dir*reach*.83;toy.root.position.y+=Math.sin(reach*Math.PI)*.16;
      toy.root.rotation.z-=dir*reach*.07;
      toy.sockets.legL.rotation.x+=reach*.18;toy.sockets.legR.rotation.x-=reach*.16;
      const recoil=pulse(v.recoil,.22);toy.root.position.x-=dir*recoil*.16;toy.root.rotation.z+=dir*recoil*.10;
      const dodge=pulse(v.lean,.38);toy.root.rotation.z+=dir*dodge*.16;
      if(v.block>=0&&v.block<.32)toy.sockets[v.blockArm===2?"armL":"armR"].rotation.x=-.65*Math.sin(v.block/.32*Math.PI);
      const lostLegs=Number(s.armor[4]<=0)+Number(s.armor[5]<=0);
      if(lostLegs===1){toy.root.position.y-=.13;toy.root.rotation.z+=s.armor[4]<=0?-.10:.10;}
      if(lostLegs===2)toy.root.position.y-=.95;
      if(v.sit>=0){
        const k=smooth(v.sit/.65);toy.root.rotation.z+=dir*1.30*k;toy.root.rotation.x-=.25*k;toy.root.position.x+=dir*1.8*Math.sin(1.30*k);
        toy.root.position.y-=.46*k;toy.root.position.x-=dir*.20*k;toy.root.position.z-=.30*k;
      }
      if(v.armsUp>=0){const k=smooth(v.armsUp/.5);toy.sockets.armL.rotation.z-=1.95*k;toy.sockets.armR.rotation.z+=1.10*k;toy.sockets.head.rotation.x-=.08*k;}
      if(v.sit>=0){
        let lift=settledGround.get(toy);if(lift===undefined){lift=.025-surfaceFloor(toy.root);if(v.sit>=.65)settledGround.set(toy,lift);}toy.root.position.y+=lift;
      }else if(lostLegs)keepAboveMat(toy);
      contacts[i].position.x=toy.root.position.x;contacts[i].scale.setScalar(1-reach*.06);placeContacts(toy,i);
    }
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
          d.position.set(X[p.side]+(p.side===0?.55:-.55)+Math.cos(a)*age*.75,p.height+Math.sin(a)*age*.50+age*.12,.42+n*.018);
          d.scale.setScalar(.10+age*.50);d.material.opacity=.42*Math.pow(1-age/.65,2);d.material.rotation=a+age;
        }
      }
      if(age<0||age>.25)continue;
      for(let n=0;n<6&&sparkIndex<sparks.length;n++){
        const s=sparks[sparkIndex++],a=n/6*Math.PI*2;s.visible=true;
        s.position.set(X[p.side]+(p.side===0?.55:-.55)+Math.cos(a)*age*1.7,p.height+Math.sin(a)*age*1.7-age*age*2,.48+(n%2)*age);
        s.scale.setScalar((p.strong?1.5:1)*(1-age/.25));
      }
    }
    const shake=opts.showroom?0:fx.shake>0?Math.sin(st.frame*2.5)*.018*(fx.shake/.12):0;
    camera.position.x=shake;camera.lookAt(target);renderer.render(scene,camera);
    if(process.env.NODE_ENV!=="production"){renderTotal+=performance.now()-drawStart;renderSamples++;if(renderSamples>=30){canvas.dataset.renderMs=(renderTotal/renderSamples).toFixed(2);renderSamples=0;renderTotal=0;}canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);canvas.dataset.renderer="physical-toys";}
  }
  return {
    plate:true,
    async setBuilds(a,b,looks){
      if(dead)return;const next=[createToy(a,looks[0]),createToy(b,looks[1])];
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
    resize(w,h,dpr){if(dead||w<=0||h<=0)return;phone=w/h<1.35;renderer.setPixelRatio(Math.min(dpr,phone?1.5:1.75));renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=(phone?31:28)+Math.min(5,extraHeight*6);camera.position.set(0,phone?3.8:3.4,phone?14.1:13.7);target.y=phone?1.7:1.77;camera.lookAt(target);camera.updateProjectionMatrix();},
    destroy(){
      if(dead)return;dead=true;cleanDebris();for(const t of toys){scene.remove(t.root);t.dispose();}toys=[];
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
      scene.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));}if(o instanceof THREE.Sprite)materials.add(o.material);});
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());
      key.shadow.dispose();environment.dispose();renderer.dispose();
    },
  };
}
