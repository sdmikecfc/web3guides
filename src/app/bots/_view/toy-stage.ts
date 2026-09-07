"use client";

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Build, Slot } from "../_engine/parts";
import type { Socket } from "@/lib/bots/fixtures";
import { EQUIPMENT_KIND, EQUIPMENT_SOCKETS } from "@/lib/bots/equipment";
import type { BotLook } from "./look";
import { createCombatToy, type CombatToy } from "./combat-toy";
import { ART_VERSION } from "./art-version";

export type ToyStageVariant = "cream" | "dark" | "workshop";
export interface ToyStage {
  /** False means a newer request or disposal superseded this load. */
  setToy(build: Build, look: BotLook, selected?: Socket | null, rotation?: number, partSocket?: Socket, variant?: ToyStageVariant): Promise<boolean>;
  setVariant(variant: ToyStageVariant): void;
  resize(width: number, height: number, pixelRatio?: number): void;
  render(time?: number): void;
  hitSocket(x: number, y: number, kind?: Slot, radius?: number): Socket | null;
  snapshot(target: HTMLCanvasElement): void;
  dispose(discardCanvas?: boolean): void;
}

/** One quiet product studio, shared by the workbench and gallery photographs. */
export function createToyStage(canvas: HTMLCanvasElement, variant: ToyStageVariant = "cream"): ToyStage {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:"low-power"});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3,3,3,-3,0.1,100);
  camera.position.set(6.6,5.2,11);
  camera.lookAt(0,2.08,0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room,0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.36;
  room.dispose();
  pmrem.dispose();

  const ambient=new THREE.HemisphereLight(0xffefcf,0x56504a,1.65);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffddb0,4.1);
  key.position.set(-3.5,8,-3.8);
  key.target.position.set(0,1.8,0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-6,right:6,top:7,bottom:-5,near:0.5,far:30});
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.00018;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 4;
  scene.add(key,key.target);
  const softbox = new THREE.DirectionalLight(0xfff3e2,2.3);
  softbox.position.set(1.5,4.5,7);
  scene.add(softbox);
  const edge = new THREE.DirectionalLight(0xffce91,1.9);
  edge.position.set(4,5,-2);
  scene.add(edge);

  const floorMaterial = new THREE.MeshStandardMaterial({color:0xebe1cf,roughness:0.96});
  const floor = new THREE.Mesh<THREE.PlaneGeometry,THREE.MeshStandardMaterial|THREE.ShadowMaterial>(new THREE.PlaneGeometry(200,200),floorMaterial);
  floor.rotation.x = -Math.PI/2;
  floor.position.y = -0.24;
  floor.receiveShadow = true;
  scene.add(floor);
  const plinthMaterial = new THREE.MeshStandardMaterial({color:0xe7ddc9,roughness:0.7,metalness:0.08});
  const plinth = new THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>(new THREE.CylinderGeometry(2.25,2.32,0.2,96),plinthMaterial);
  const roundPlinth=plinth.geometry, timberPlinth=new THREE.BoxGeometry(5.25,0.2,3.8);
  plinth.position.y = -0.1;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  scene.add(plinth);
  const trimMaterial = new THREE.MeshStandardMaterial({color:0x8d7250,roughness:0.34,metalness:0.62});
  const trim = new THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>(new THREE.CylinderGeometry(2.32,2.32,0.035,96),trimMaterial);
  const roundTrim=trim.geometry, timberTrim=new THREE.BoxGeometry(5.28,0.035,3.83);
  trim.position.y = -0.185;
  trim.receiveShadow = true;
  scene.add(trim);

  // A physical timber top receives the toy's shadows; the photographed room
  // stays behind it. A transparent shadow floor keeps the room's own floor.
  const woodCanvas=document.createElement("canvas");woodCanvas.width=512;woodCanvas.height=256;
  const wood=woodCanvas.getContext("2d")!;
  wood.fillStyle="#a0784e";wood.fillRect(0,0,512,256);
  for(let y=0;y<256;y+=3){
    wood.strokeStyle=`rgba(67,38,18,${.035+(y%7)*.012})`;wood.lineWidth=y%4===0?1.1:.5;
    wood.beginPath();wood.moveTo(0,y);
    for(let x=0;x<=512;x+=16)wood.lineTo(x,y+Math.sin(x*.019+y*.8)*1.5+Math.sin(x*.008+y)*1.8);
    wood.stroke();
  }
  for(const y of [84,170]){wood.fillStyle="rgba(42,24,12,.22)";wood.fillRect(0,y,512,1);}
  const woodTexture=new THREE.CanvasTexture(woodCanvas);woodTexture.colorSpace=THREE.SRGBColorSpace;
  woodTexture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  const roomShadowMaterial=new THREE.ShadowMaterial({color:0x302113,opacity:.20});

  // An ambient contact layer complements the cast shadow under both feet.
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width=128; shadowCanvas.height=128;
  const shadowContext=shadowCanvas.getContext("2d")!;
  const gradient=shadowContext.createRadialGradient(64,64,8,64,64,63);
  gradient.addColorStop(0,"rgba(50,34,20,.26)");
  gradient.addColorStop(0.45,"rgba(50,34,20,.13)");
  gradient.addColorStop(1,"rgba(50,34,20,0)");
  shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,128,128);
  const contactTexture=new THREE.CanvasTexture(shadowCanvas);
  const contactMaterial=new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false});
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(3.8,2.6),contactMaterial);
  contact.rotation.x=-Math.PI/2;contact.position.y=0.004;
  scene.add(contact);

  let toy: CombatToy | null = null;
  let isolated=false;
  let isolatedSocket:Socket|undefined;
  let width=1,height=1;
  let disposed=false;
  let activeVariant=variant;
  let workshopTexture:THREE.Texture|null=null;
  let workshopReady:Promise<void>|null=null;
  let cancelWorkshopLoad:(()=>void)|null=null;
  const loadWorkshop=()=>{
    if(workshopReady)return workshopReady;
    workshopReady=new Promise<void>(resolve=>{
      let finished=false;
      const finish=(texture?:THREE.Texture)=>{
        if(finished){texture?.dispose();return;}
        finished=true;clearTimeout(timer);cancelWorkshopLoad=null;
        if(texture&&!disposed){texture.colorSpace=THREE.SRGBColorSpace;workshopTexture=texture;}else texture?.dispose();
        resolve();
      };
      // Failure chooses one warm studio fallback for this stage's lifetime.
      // A delayed network response can never replace that already-shown room.
      const timer=setTimeout(()=>finish(),8000);
      cancelWorkshopLoad=()=>finish();
      try{new THREE.TextureLoader().load(`/bots-art/plates/workshop-interior.png?v=${ART_VERSION}`,texture=>finish(texture),undefined,()=>finish());}catch{finish();}
    });
    return workshopReady;
  };
  const cropWorkshop=()=>{
    if(!workshopTexture)return;
    const image=workshopTexture.image as {width:number;height:number};
    const imageAspect=image.width/image.height,aspect=width/height;
    const x=Math.min(1,aspect/imageAspect),y=Math.min(1,imageAspect/aspect);
    workshopTexture.repeat.set(x,y);workshopTexture.offset.set((1-x)/2,(1-y)/2);workshopTexture.updateMatrix();
  };
  let loadRevision=0;
  let idleRest: { head: THREE.Quaternion; torso: THREE.Quaternion } | null=null;
  const idleQuaternion=new THREE.Quaternion();
  const idleAxisY=new THREE.Vector3(0,1,0),idleAxisZ=new THREE.Vector3(0,0,1);
  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  const point=new THREE.Vector3();
  const bounds=new THREE.Box3();
  const meshBounds=new THREE.Box3();
  const visibleBounds=(object:THREE.Object3D,socket?:Socket)=>{
    bounds.makeEmpty();object.updateWorldMatrix(true,true);
    object.traverseVisible(child=>{
      const mesh=child as THREE.Mesh;
      if(!mesh.isMesh||(socket&&mesh.userData.socket!==socket))return;
      if(mesh instanceof THREE.SkinnedMesh){
        mesh.skeleton.update();mesh.computeBoundingBox();
        if(mesh.boundingBox)bounds.union(meshBounds.copy(mesh.boundingBox).applyMatrix4(mesh.matrixWorld));
      }else{
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
        if(mesh.geometry.boundingBox)bounds.union(meshBounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
      }
    });
    return bounds;
  };
  const fit=()=>{
    const aspect=width/height;
    let vertical=isolated?4.25:activeVariant==="workshop"?6.1:5.6;
    if(toy){
      visibleBounds(toy.root,isolatedSocket);
      const size=bounds.getSize(new THREE.Vector3());
      vertical=Math.max(vertical,size.y+0.75,(size.x*0.92+size.z*0.4+0.6)/aspect);
    }
    camera.left=-vertical*aspect/2;camera.right=vertical*aspect/2;
    camera.top=vertical/2;camera.bottom=-vertical/2;
    camera.updateProjectionMatrix();
  };
  const setVariant=(next:ToyStageVariant)=>{
    activeVariant=next;
    const dark=next==="dark",workshop=next==="workshop";
    const color=workshop?0x4d3826:dark?0x302a26:0xece3d3;
    scene.background=workshop&&workshopTexture?workshopTexture:new THREE.Color(color);
    scene.fog=workshop&&workshopTexture?null:new THREE.Fog(color,20,55);
    floor.material=workshop&&workshopTexture?roomShadowMaterial:floorMaterial;
    floorMaterial.color.setHex(workshop?0x786049:dark?0x3b332c:0xebe1cf);
    plinth.geometry=workshop?timberPlinth:roundPlinth;trim.geometry=workshop?timberTrim:roundTrim;
    plinthMaterial.map=workshop?woodTexture:null;plinthMaterial.needsUpdate=true;
    plinthMaterial.color.setHex(workshop?0xe5cfb1:dark?0x635444:0xe7ddc9);
    plinthMaterial.roughness=workshop?.86:.7;plinthMaterial.metalness=workshop?0:.08;
    trimMaterial.color.setHex(workshop?0x66452b:0x8d7250);trimMaterial.metalness=workshop?.12:.62;
    ambient.intensity=workshop?1.1:1.65;softbox.intensity=workshop?1.55:2.3;
    key.position.set(workshop?4.5:-3.5,8,-3.8);key.intensity=workshop?4.3:4.1;
    edge.position.set(workshop?-4:4,5,-2);edge.intensity=workshop?1.2:1.9;
    camera.lookAt(0,isolated?1.42:workshop?2.3:2.08,0);
    renderer.toneMappingExposure=workshop?1.04:dark?1.12:1.18;
    cropWorkshop();
  };
  setVariant(variant);
  const renderFrame=(time=0)=>{
    if(disposed||renderer.getContext().isContextLost())throw new Error("Toy studio context unavailable");
    if(toy&&idleRest&&!isolated){
      toy.sockets.head.quaternion.copy(idleRest.head).multiply(idleQuaternion.setFromAxisAngle(idleAxisY,Math.sin(time*.9)*.027));
      toy.sockets.torso.quaternion.copy(idleRest.torso).multiply(idleQuaternion.setFromAxisAngle(idleAxisZ,Math.sin(time*.72)*.007));
    }
    renderer.render(scene,camera);
  };
  return {
    async setToy(build,look,selected=null,rotation=-0.12,partSocket,nextVariant=activeVariant){
      const revision=++loadRevision;
      const [next]=await Promise.all([createCombatToy(build,look,false,"inspection"),nextVariant==="workshop"?loadWorkshop():Promise.resolve()]);
      if(disposed||revision!==loadRevision){next.dispose();return false;}
      // One complete reveal. A late loader is disposed before it can enter
      // the scene, and the existing picture remains valid while assets load.
      next.resetPose();
      if(!partSocket)next.applyClip("guard",0.5,1,["armL","armR","elbowL","elbowR","wristL","wristR"]);
      isolated=!!partSocket;
      isolatedSocket=partSocket;
      next.root.rotation.y=rotation;
      if(partSocket){
        // The Blender meshes live beside the rig, not below their bones.
        // The native fallback's held weapon is the only nested render tree.
        if(!next.blender && partSocket==="weapon")next.root.attach(next.sockets.weapon);
        for(const socket of EQUIPMENT_SOCKETS)next.setVisible(socket,socket===partSocket);
        next.root.updateMatrixWorld(true);
        visibleBounds(next.root,partSocket);
        if(bounds.isEmpty()){next.dispose();throw new Error("This part has no visible geometry");}
        const center=bounds.getCenter(new THREE.Vector3());
        const size=bounds.getSize(new THREE.Vector3());
        const scale=3.05/Math.max(size.x,size.y,size.z,0.1);
        next.root.scale.setScalar(scale);
        next.root.position.set(-center.x*scale,-bounds.min.y*scale+0.025,-center.z*scale);
      }
      setVariant(nextVariant);
      // Selection belongs to the DOM socket rail. Never recolour a shared
      // material here: doing so would change other parts wearing that paint.
      const previous=toy;
      scene.add(next.root);toy=next;
      idleRest={head:next.sockets.head.quaternion.clone(),torso:next.sockets.torso.quaternion.clone()};
      if(previous){scene.remove(previous.root);previous.dispose();}
      scene.updateMatrixWorld(true);fit();
      return true;
    },
    setVariant,
    resize(w,h,pixelRatio=1){
      width=Math.max(1,w);height=Math.max(1,h);
      cropWorkshop();
      const ratio=Math.min(2,pixelRatio);
      renderer.setPixelRatio(ratio);
      renderer.setSize(width,height,false);
      const pixels=Math.max(width,height)*ratio;
      const shadowSize=pixels>=900?2048:pixels>=360?1024:512;
      if(key.shadow.mapSize.x!==shadowSize){
        key.shadow.map?.dispose();key.shadow.map=null;
        key.shadow.mapSize.set(shadowSize,shadowSize);key.shadow.needsUpdate=true;
      }
      fit();
    },
    render:renderFrame,
    hitSocket(x,y,kind,radius=60){
      if(!toy||x<0||x>width||y<0||y>height)return null;
      pointer.set(x/width*2-1,1-y/height*2);
      raycaster.setFromCamera(pointer,camera);
      const eligible=(socket:Socket)=>!kind||EQUIPMENT_KIND[socket]===kind;
      for(const hit of raycaster.intersectObject(toy.root,true)){
        const socket=hit.object.userData.socket as Socket|undefined;
        if(hit.object.visible&&socket&&eligible(socket))return socket;
      }
      let closest:Socket|null=null,distance=radius;
      for(const socket of EQUIPMENT_SOCKETS){
        if(!eligible(socket))continue;
        visibleBounds(toy.root,socket);
        if(bounds.isEmpty())toy.sockets[socket].getWorldPosition(point);else bounds.getCenter(point);
        point.project(camera);
        const d=Math.hypot((point.x+1)*width/2-x,(1-point.y)*height/2-y);
        if(d<distance){distance=d;closest=socket;}
      }
      return closest;
    },
    snapshot(target){
      target.width=canvas.width;target.height=canvas.height;
      renderFrame();
      const context=target.getContext("2d");
      context?.clearRect(0,0,target.width,target.height);
      context?.drawImage(canvas,0,0);
    },
    dispose(discardCanvas=false){
      if(disposed)return;disposed=true;loadRevision++;
      cancelWorkshopLoad?.();workshopTexture?.dispose();workshopTexture=null;
      toy?.dispose();toy=null;
      for(const geometry of [floor.geometry,roundPlinth,timberPlinth,roundTrim,timberTrim,contact.geometry])geometry.dispose();
      floorMaterial.dispose();roomShadowMaterial.dispose();plinthMaterial.dispose();trimMaterial.dispose();woodTexture.dispose();contactMaterial.dispose();contactTexture.dispose();
      environment.dispose();key.shadow.dispose();renderer.dispose();
      // React may immediately reuse an interactive canvas in StrictMode.
      // Only lose a context when its offscreen canvas is discarded for good.
      if(discardCanvas)renderer.forceContextLoss();
    },
  };
}

/** Gallery cards share one WebGL context and retain only a 2D photograph. */
let photographStage:ToyStage|null=null;
let photographUsers=0;
const photographRestored=new Set<()=>void>();
const photographs=new Map<string,HTMLCanvasElement>();
let photographPixels=0;
let photographRevision=0;
let photographQueue:Promise<void>=Promise.resolve();
export function retainToyPhotographs(onRestored?:()=>void):()=>void{
  photographUsers++;
  if(onRestored)photographRestored.add(onRestored);
  let released=false;
  return ()=>{
    if(released)return;released=true;
    if(onRestored)photographRestored.delete(onRestored);
    photographUsers=Math.max(0,photographUsers-1);
    if(photographUsers===0){photographRevision++;photographStage?.dispose(true);photographStage=null;}
  };
}
export async function photographToy(canvas:HTMLCanvasElement,build:Build,look:BotLook,variant:ToyStageVariant,width:number,height:number,rotation=-0.12,partSocket?:Socket,accept:()=>boolean=()=>true):Promise<boolean>{
  const ratio=Math.min(1.5,window.devicePixelRatio||1);
  const key=JSON.stringify({build,look,variant,width,height,rotation,partSocket,ratio});
  const copy=(photo:HTMLCanvasElement)=>{
    if(!accept())return false;
    canvas.width=photo.width;canvas.height=photo.height;
    const context=canvas.getContext("2d");
    if(!context)throw new Error("Toy photograph canvas unavailable");
    context.drawImage(photo,0,0);return true;
  };
  const cached=photographs.get(key);
  if(cached){
    photographs.delete(key);photographs.set(key,cached);
    return copy(cached);
  }
  const revision=photographRevision;
  let copied=false;
  // Exactly one caller can use the shared WebGL studio, including its await.
  // A rejected task is not allowed to poison all subsequent gallery cards.
  const task=photographQueue.catch(()=>{}).then(async()=>{
    if(!accept()||revision!==photographRevision)return;
    const again=photographs.get(key);
    if(again){copied=copy(again);return;}
    if(!photographStage){
      const offscreen=document.createElement("canvas");
      photographStage=createToyStage(offscreen,variant);
      offscreen.addEventListener("webglcontextlost",event=>event.preventDefault());
      offscreen.addEventListener("webglcontextrestored",()=>photographRestored.forEach(redraw=>redraw()));
    }
    const owned=photographStage;
    if(!await owned.setToy(build,look,null,rotation,partSocket,variant))return;
    if(!accept()||revision!==photographRevision||photographStage!==owned)return;
    owned.setVariant(variant);owned.resize(width,height,ratio);
    const photo=document.createElement("canvas");
    owned.snapshot(photo);
    if(!accept()||revision!==photographRevision)return;
    photographs.set(key,photo);photographPixels+=photo.width*photo.height;
    copied=copy(photo);
    while(photographs.size>80||photographPixels>8_000_000){
      const oldest=photographs.entries().next().value;
      if(!oldest)break;
      photographs.delete(oldest[0]);photographPixels-=oldest[1].width*oldest[1].height;
      oldest[1].width=0;oldest[1].height=0;
    }
  });
  photographQueue=task.then(()=>{},()=>{});
  await task;return copied;
}
