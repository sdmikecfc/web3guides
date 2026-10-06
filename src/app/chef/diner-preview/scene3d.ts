import {pickMountSurface,mountSurfaceHighlights} from './placement-surfaces';
import {roomChairSelection} from './room-selection';
import {createDiscoveryEffects} from './discovery-effects';
import {createEquipmentAppearance} from './models';
import {animateCollection} from './collection-assets';
import {COLLECTION_SPOT_BY_ID} from '@/lib/chef/diner/collection-display-spots';
import {createDomainStudy} from './domain-assets';
import {domainRoomShell,domainRoomPiece,domainDecoration} from './domain-room-renderer';
import {DOMAIN_ROOM_STUDIES} from '@/lib/chef/diner/domain-room-studies';
import type {DestinationController} from './living-destinations';
import {createRouteEnvironment,dressCustomer} from './route-environments';
import * as THREE from 'three';
import {initialQuality,qualitySample,QUALITY_BUDGETS,observeAction,type RenderQuality,type PresentationAction} from './presentation';
import { animateCharacter,box,cylinder,createModel,createFoodModel,disposeObject,material,PALETTE,configureRoomMount,holdingCounterSlotPositions,type CharacterRig } from './models';
import { setupCinematicLighting } from './cinematic-lighting';
import { createContactShadows } from './contact-shadows';
import { createOrderBubble,updateOrderBubble } from './order-bubble';
import type { DinerSceneData,DinerSceneProps,SceneFood,ScenePerson,SceneObject,SceneTable } from './scene-types';
import { homeSpatial, homeSupportAt, HOME_TERRACE_ELEVATION } from '../../../lib/chef/diner/home-spatial';
import { createHomeBoard } from './home-board';
import { createCafeWallLight,createHomeAmbience,type HomeAmbience } from './home-ambience';
import { HOME_GESTURE_RULES,homeSpillScale } from '../../../lib/chef/diner/home-gesture';
import { firstVisibleSceneSurface,resolveTableSurfaceTarget,setActorPicking } from './scene-picking';
import { createCookingEffects,type CookingEffects } from './cooking-effects';
import { createHomeCameraBounds,fitHomeCamera,homeCameraPresentation,type HomeCameraBounds } from './home-camera';
import { createEquipmentTrailer } from './trailer';
import { createPlacementGhost,projectPlacementTile } from './placement-ghost';
import { createRoomShell,updateRoomShell,roomColors } from './room-shell';
import { diningPlaceSettings,diningFoodPoint } from './table-presentation';

type ScenePick={id:string;seatId?:string};
type PersonView={action?:PresentationAction;root:THREE.Group;body:THREE.Group;previous:THREE.Vector3;destination:THREE.Vector3;changed:number;angle:number;foodKey:string;person:ScenePerson;order:THREE.Group|null;orderKey:string;uniform:string};
type StationView={root:THREE.Group;model:THREE.Group;food:THREE.Group;foodKey:string;progress:THREE.Mesh;halo:THREE.Mesh;steam:THREE.Group;cooking:CookingEffects|null;kind:string};
type TableView={root:THREE.Group;key:string;food:THREE.Group;foodKey:string;halo:THREE.Mesh};
export interface DinerSceneController {setScene:(scene:DinerSceneData)=>void;setRotation:(rotation:number)=>void;setEditing:(editing:boolean)=>void;zoomBy:(factor:number)=>void;resetCamera:()=>void;dispose:()=>void}
type SceneCallbacks=Pick<DinerSceneProps,'onConstruction'|'onCameraDisplaced'|'onMountSurface'|'onTarget'|'onTile'|'onHoverTile'|'onHomeGesture'|'onPerformance'|'onError'|'onAnchors'>;
const ELEVATION=35*Math.PI/180;
const point3=(x:number,y:number,height=0)=>new THREE.Vector3(x,height,y);
import {sceneFoodKey as foodKey} from './scene-types';
const rotationAngle=(facing:number)=>Math.PI-facing*Math.PI/2;
const tableShape=(table:SceneTable)=>{const raw=table.footprint??[table.capacity===4?2:1,table.capacity===1?1:2];return (table.rotation??0)%2?[raw[1],raw[0]]:raw;};
const tableCenter=(table:SceneTable)=>{const [w,h]=tableShape(table);return {x:table.x+(w-1)/2,y:table.y+(h-1)/2};};
const cosmetics:Record<string,string>={cream:PALETTE.cream,mint:PALETTE.mint,rose:'#e5b9a9',tomato:PALETTE.tomato,cherry:PALETTE.tomato,sage:PALETTE.sage,sky:'#8cabb8',buttercream:'#eacb85',classic:PALETTE.sage};

function textPlane(text:string,w:number,h:number,color=PALETTE.porcelain,bg=PALETTE.sage){
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=bg;ctx.beginPath();ctx.roundRect(0,0,1024,256,48);ctx.fill();ctx.fillStyle=color;ctx.textBaseline='middle';ctx.textAlign='center';ctx.font='800 104px "Baloo 2","Arial Rounded MT Bold",sans-serif';ctx.fillText(text,512,140,910);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,transparent:true}));return plane;
}
function lineBetween(a:THREE.Vector3,b:THREE.Vector3,color:string,radius=.015){const length=a.distanceTo(b),m=cylinder(radius,radius,length,color);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());return m;}
function wall(w:number,h:number,d:number,color:string,x:number,y:number,z:number,normal:THREE.Vector3){const m=box(w,h,d,color,x,y,z);m.material=material(color).clone();m.material.userData.sharedKitResource=false;m.userData.wallNormal=normal;m.userData.originalOpacity=1;return m;}
function truckShell(width:number,height:number,sign:string,paint:string){
  const g=new THREE.Group(),color=paint||PALETTE.tomato,centerX=(width-1)/2,centerZ=(height-1)/2;
  g.add(box(width+.17,.27,height+.16,PALETTE.steel,centerX,.24,centerZ,.08));
  // Floor and perimeter are one physical chassis. The near side has a real doorway.
  g.add(box(width+.12,.17,.13,color,centerX,.40,-.56),box(.13,.29,height+.18,color,-.57,.37,centerZ));
  g.add(box(1.05,.29,.12,color,-.04,.37,height-.46),box(Math.max(.35,width-2),.29,.12,color,(width+1)/2,.37,height-.46));
  g.add(wall(width+.12,1.27,.09,PALETTE.cream,centerX,1.13,-.54,new THREE.Vector3(0,0,-1)));
  g.add(box(width+.16,.30,.10,color,centerX,.64,-.485));
  for(const x of [-.54,width-.46])g.add(cylinder(.024,.024,1.84,PALETTE.oak,x,1.39,-.57));
  // Canvas canopy, seam stripes, scalloped valance and its supporting poles.
  g.add(box(width+.32,.07,1.12,PALETTE.porcelain,centerX,2.31,-.59,.025));
  const stripes=Math.ceil((width+.3)/.46);for(let i=0;i<stripes;i++)g.add(box(.225,.013,1.10,color,-.54+i*.46,2.354,-.59,.003));
  g.add(box(width+.32,.15,.055,color,centerX,2.23,-.04,.018));
  const signBoard=box(Math.min(2.75,width-.25),.49,.075,PALETTE.oak,centerX,1.86,-.465,.07);g.add(signBoard);
  const lettering=textPlane(sign||'The Little Diner',Math.min(2.6,width-.4),.37);lettering.position.set(centerX,1.86,-.417);g.add(lettering);
  // Cabin faces +X: a solid connected roof, windscreen, nose, doors and bumpers.
  const cabX=width+.30,cabZ=.72;
  g.add(box(1.65,1.05,2.14,color,cabX,.78,cabZ,.19),box(1.21,.84,2.02,PALETTE.porcelain,cabX-.22,1.47,cabZ,.15));
  const windscreen=box(.042,.53,1.66,'#a8c7bc',cabX+.405,1.53,cabZ,.025);windscreen.rotation.z=-.15;g.add(windscreen);
  g.add(box(.91,.49,.036,'#bdd8cb',cabX-.26,1.55,cabZ+1.025,.05),box(.91,.49,.036,'#bdd8cb',cabX-.26,1.55,cabZ-1.025,.05));
  g.add(box(1.33,.14,2.11,PALETTE.porcelain,cabX-.20,1.94,cabZ,.075),box(.17,.19,2.10,PALETTE.metal,cabX+.83,.54,cabZ,.065));
  g.add(box(.027,.25,.76,PALETTE.dark,cabX+.837,.89,cabZ,.035));
  for(const z of [cabZ-.72,cabZ+.72]){const light=cylinder(.115,.115,.034,'#ffe9a8',cabX+.84,.96,z);light.rotation.z=Math.PI/2;g.add(light);g.add(box(.20,.045,.05,PALETTE.steel,cabX-.52,1.09,z>cabZ?cabZ+1.085:cabZ-1.085,.015));}
  const wheel=(x:number,z:number)=>{const tire=cylinder(.32,.32,.17,PALETTE.dark,x,.31,z,16);tire.rotation.x=Math.PI/2;const hub=cylinder(.18,.18,.19,PALETTE.metal,x,.31,z,12);hub.rotation.x=Math.PI/2;g.add(tire,hub);};
  wheel(.20,-.61);wheel(.20,height-.39);wheel(width-.60,-.61);wheel(width-.60,height-.39);wheel(cabX+.04,cabZ+1.08);wheel(cabX+.04,cabZ-1.08);
  // Ground remains lower than the truck. This ramp physically joins both floors.
  const ramp=box(.96,.10,1.15,PALETTE.metal,1,.255,height,.02);ramp.rotation.x=Math.atan(.36);g.add(ramp);
  for(let i=0;i<5;i++){const grip=box(.79,.014,.026,PALETTE.steel,1,.455-i*.075,height-.45+i*.225,.003);grip.rotation.x=Math.atan(.36);g.add(grip);}
  return g;
}
function homeShell(width:number,height:number,sign:string,wallColor:string){
  const g=new THREE.Group(),back=new THREE.Group(),side=new THREE.Group(),h=2.42,cream='#fff8e9',teal='#365f55',mint='#94b9a2',coral='#bd654e',wood='#876647';
  // The cutaway is a cafe interior: broad quiet plaster, framed lower panels and a solid cornice.
  back.add(box(width+.25,h,.14,wallColor,(width-1)/2,h/2,-.56,.028),box(width+.28,.14,.23,cream,(width-1)/2,h-.015,-.53,.026));
  side.add(box(.14,h,height+.2,wallColor,-.56,h/2,(height-1)/2,.028),box(.23,.14,height+.22,cream,-.53,h-.015,(height-1)/2,.026));
  back.add(box(width+.22,.78,.055,mint,(width-1)/2,.49,-.456,.009),box(width+.22,.095,.10,teal,(width-1)/2,.16,-.418,.012),box(width+.23,.075,.11,cream,(width-1)/2,.915,-.419,.013));
  side.add(box(.055,.78,height+.17,mint,-.456,.49,(height-1)/2,.009),box(.10,.095,height+.18,teal,-.418,.16,(height-1)/2,.012),box(.11,.075,height+.2,cream,-.419,.915,(height-1)/2,.013));
  for(let x=0;x<width;x+=1.3)back.add(box(.045,.59,.03,'#719a84',x,.50,-.414,.006));
  for(let z=0;z<height;z+=1.3)side.add(box(.03,.59,.045,'#719a84',-.414,.50,z,.006));
  const arch=(w:number,hh:number,color:string)=>{const s=new THREE.Shape(),r=w/2,base=-hh/2,shoulder=hh/2-r;s.moveTo(-r,base);s.lineTo(r,base);s.lineTo(r,shoulder);s.absarc(0,shoulder,r,0,Math.PI,false);s.lineTo(-r,base);const m=new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:.045,bevelEnabled:true,bevelThickness:.012,bevelSize:.016,bevelSegments:1,steps:1,curveSegments:12}),material(color));m.castShadow=true;m.receiveShadow=true;return m;};
  const windowKit=()=>{const kit=new THREE.Group(),frame=arch(1.48,1.22,teal),glass=arch(1.23,.99,'#a8d1ca');(glass as THREE.Mesh<THREE.BufferGeometry,THREE.Material>).material=new THREE.MeshBasicMaterial({color:'#beded1'});glass.position.set(0,.014,.06);kit.add(frame,glass);
    kit.add(box(.055,.97,.045,cream,0,-.005,.127,.008),box(1.20,.045,.045,cream,0,-.15,.129,.007),box(1.60,.12,.27,cream,0,-.64,.10,.024));
    const highlight=box(.035,.53,.012,'#def1e4',-.34,.10,.128,.004);highlight.rotation.z=-.29;kit.add(highlight);
    // A folded striped blind at the shoulder gives each window a friendly rounded silhouette.
    kit.add(box(1.5,.10,.19,wood,0,.20,.10,.023));for(let i=0;i<6;i++)kit.add(box(.225,.15,.10,i%2?cream:coral,-.59+i*.238,.13,.19,.025));return kit;};
  for(const x of [1.05,width-2.05]){const window=windowKit();window.position.set(x,1.63,-.44);back.add(window);}
  const sideWindow=windowKit();sideWindow.rotation.y=Math.PI/2;sideWindow.position.set(-.44,1.63,Math.min(height-2,2.1));side.add(sideWindow);
  const signFrame=box(2.46,.54,.11,wood,width/2-.5,1.98,-.43,.08),signText=textPlane(sign||'The Little Diner',2.28,.40,cream,teal);signText.position.set(width/2-.5,1.99,-.365);back.add(signFrame,signText);
  for(const x of [width/2-1.99,width/2+.99]){const lamp=createCafeWallLight();lamp.position.set(x,2.10,-.43);back.add(lamp);}
  // A little shelf of cream crockery is part of the wall kit, clear of station worktops.
  const shelfX=width/2-.5;back.add(box(1.60,.09,.25,wood,shelfX,1.40,-.33,.024));
  for(const x of [shelfX-.59,shelfX+.59])back.add(box(.075,.24,.13,teal,x,1.24,-.35,.012));
  for(let i=0;i<3;i++){const plate=cylinder(.115,.115,.032,cream,shelfX-.39,1.47+i*.033,-.31,18);back.add(plate);}
  for(let i=0;i<2;i++){back.add(cylinder(.095,.080,.20,i?coral:mint,shelfX+.05+i*.25,1.54,-.32,14));const handle=new THREE.Mesh(new THREE.TorusGeometry(.056,.019,5,10),material(cream));handle.position.set(shelfX+.14+i*.25,1.56,-.31);back.add(handle);}
  // Wall details fade as one construction when the camera comes round to that side.
  const fadeAssembly=(assembly:THREE.Group,normal:THREE.Vector3)=>{assembly.traverse(object=>{if(!(object instanceof THREE.Mesh))return;const source=object.material as THREE.Material;object.material=source.clone();object.material.userData.sharedKitResource=false;object.userData.wallNormal=normal;if(!source.userData.sharedKitResource)source.dispose();});g.add(assembly);};
  fadeAssembly(back,new THREE.Vector3(0,0,-1));fadeAssembly(side,new THREE.Vector3(-1,0,0));
  // An actual supported shopfront, rather than an isolated pair of bare door posts.
  // Everything stays on the perimeter or terrace: the owned room and doorway remain free.
  const doorX=homeSpatial(width,height).door.x,frontZ=height-.47,entry=new THREE.Group();
  entry.add(box(1.02,.012,.43,teal,doorX,.102,height-.72,.035));
  for(const x of [doorX-.70,doorX+.70]){entry.add(box(.23,2.09,.22,teal,x,1.115,frontZ,.033),box(.29,.12,.29,cream,x,.17,frontZ,.025),box(.29,.095,.27,cream,x,2.07,frontZ,.025));}
  entry.add(box(1.69,.30,.23,teal,doorX,2.21,frontZ,.048),box(1.80,.09,.32,cream,doorX,2.41,frontZ,.024));
  const entrySign=textPlane('HELLO, HUNGRY!',1.42,.19,cream,teal);entrySign.position.set(doorX,2.23,frontZ+.124);entry.add(entrySign);
  // Sloping fabric panels meet their valance; diagonal brackets visibly support the canopy.
  const canopy=new THREE.Group();canopy.position.set(doorX,2.12,frontZ+.41);canopy.rotation.x=.13;
  for(let i=0;i<8;i++){const x=-.84+i*.24;canopy.add(box(.241,.065,.83,i%2?cream:coral,x,0,0,.013),box(.238,.18,.065,i%2?cream:coral,x,-.085,.412,.045));}entry.add(canopy);
  for(const x of [doorX-.71,doorX+.71])entry.add(lineBetween(new THREE.Vector3(x,1.65,frontZ+.13),new THREE.Vector3(x,2.07,frontZ+.75),teal,.024));
  for(const [x,w] of [[(doorX-.91-.52)/2,doorX-.91+.52],[(doorX+.91+width-.48)/2,width-.48-doorX-.91]])if(w>.1){entry.add(box(w,.27,.12,mint,x,.245,frontZ,.018),box(w+.03,.06,.18,cream,x,.410,frontZ,.016));}
  g.add(entry);
  for(const x of [0,width-1]){const p=createModel('plant');p.position.set(x,HOME_TERRACE_ELEVATION,height);g.add(p);}
  return g;
}

/** Renderer only: all positions, food and customer phases arrive from the simulation. */
export function createDinerScene(host:HTMLElement,mode:'truck'|'home',initial:DinerSceneData,callbacks:SceneCallbacks):DinerSceneController{
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.setClearColor('#f4e9dd');renderer.outputColorSpace=THREE.SRGBColorSpace;
  const canvas=renderer.domElement;canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none;outline:none';canvas.tabIndex=0;canvas.setAttribute('aria-label','Three-dimensional diner. Tap equipment or a table to interact. Drag to look around.');host.appendChild(canvas);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-7,7,7,-7,.1,100);scene.background=new THREE.Color('#f4e9dd');
  const lighting=setupCinematicLighting(scene,renderer,mode);
  const ground=new THREE.Mesh(new THREE.BoxGeometry(80,.10,80),new THREE.ShadowMaterial({color:'#685d50',opacity:.14}));ground.position.set(3,mode==='truck'?-.06:-.16,4);ground.castShadow=false;ground.receiveShadow=true;scene.add(ground);
  const staticRoot=new THREE.Group(),stationRoot=new THREE.Group(),tableRoot=new THREE.Group(),actorRoot=new THREE.Group(),overlayRoot=new THREE.Group();scene.add(staticRoot,stationRoot,tableRoot,actorRoot,overlayRoot);
  const contactShadows=createContactShadows();scene.add(contactShadows.root);
  const actorShadowPosition=new THREE.Vector3();
  const workArrowShape=new THREE.Shape();workArrowShape.moveTo(0,.22);workArrowShape.lineTo(.20,-.04);workArrowShape.lineTo(.07,-.04);workArrowShape.lineTo(.07,-.20);workArrowShape.lineTo(-.07,-.20);workArrowShape.lineTo(-.07,-.04);workArrowShape.lineTo(-.20,-.04);workArrowShape.closePath();
  const workArrow=new THREE.Mesh(new THREE.ShapeGeometry(workArrowShape),new THREE.MeshBasicMaterial({color:PALETTE.sage,side:THREE.DoubleSide,depthWrite:false}));workArrow.rotation.x=-Math.PI/2;overlayRoot.add(workArrow);workArrow.visible=false;
  const placementTiles=new THREE.Group();overlayRoot.add(placementTiles);let placementKey='';
  const selectionOutline=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color(PALETTE.mustard));selectionOutline.visible=false;selectionOutline.userData.inputPassthrough=true;(selectionOutline.material as THREE.LineBasicMaterial).depthTest=false;selectionOutline.renderOrder=20;overlayRoot.add(selectionOutline);
  const placementRoot=new THREE.Group();placementRoot.userData.inputPassthrough=true;overlayRoot.add(placementRoot);let ghostKey='',focusedDraft:string|null=null;
  let focusedEditorRequest:number|undefined;
  const discoveryEffects=createDiscoveryEffects(stationRoot);
  const stationViews=new Map<string,StationView>(),tableViews=new Map<string,TableView>(),personViews=new Map<string,PersonView>();
  let homeAmbience:HomeAmbience|null=null,destination:DestinationController|null=null,presentationTime=0;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let quality:RenderQuality=initialQuality(host.clientWidth,navigator.hardwareConcurrency??4),slowSamples=0,presentationKey='';
  let data=initial,staticKey='',width=1,height=1,rotation=0,targetRotation=0,zoom=1,editing=false,disposed=false,frame=0;
  let homeCameraBounds:HomeCameraBounds|null=null,homeCameraKey='';
  const focus=new THREE.Vector3(),baseFocus=new THREE.Vector3(),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),groundPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  let pointerMoved=false,lastFrame=performance.now(),statsAt=lastFrame,statsFrames=0,anchorsAt=0,actingTime=0,tiles:THREE.InstancedMesh|null=null;
  const pointers=new Map<number,{x:number;y:number}>();let pinchDistance=0,gestureStart={x:0,y:0};
  let homePointer:{incidentId:string;x:number;y:number}|null=null,scrubPointerId:number|null=null,lastHomeSample=0;
  const floorHeight=(x:number,y:number)=>mode==='home'?(homeSupportAt(data.width,data.height,x,y)?.elevation??-.11):(x>=-.5&&x<data.width-.5&&y>=-.5&&y<data.height-.5)?.455:(x>.48&&x<1.52&&y<data.height+.5)?Math.max(.06,.455-(y-data.height+.5)*.36):.065;
  function buildStatic(){
    const key=JSON.stringify([data.domainRoomStudy,data.journeyDomain,data.environment,data.characterReview,data.width,data.height,data.pavementWidth,data.pavementHeight,data.sign,data.paint,data.floor,data.wall,data.wrap,data.trailer,data.roomPlan&&{...data.roomPlan,modules:data.roomPlan.modules.map(({condition,...module})=>module)},data.roomFinishes,data.menu,data.signature]);if(key===staticKey)return;staticKey=key;
    const savedPan=editing&&data.buildEditor?focus.clone().sub(baseFocus):null;
    destination?.dispose();destination=null;disposeObject(staticRoot);staticRoot.clear();homeAmbience=null;
    lighting.setRoomBounds(data.width,data.height);
    if(process.env.NODE_ENV==='development'&&data.domainRoomStudy){
      const room=createDomainStudy(DOMAIN_ROOM_STUDIES[data.domainRoomStudy].asset);if(room)staticRoot.add(room);
      baseFocus.set((data.width-1)/2,.75,(data.height-1)/2);focus.copy(baseFocus);resize();return;
    }
    if(data.characterReview){
      staticRoot.add(box(data.width+.1,.15,data.height+.1,'#e8ddc6',(data.width-1)/2,.02,(data.height-1)/2,.08));
      baseFocus.set((data.width-1)/2,.75,(data.height-1)/2);focus.copy(baseFocus);resize();return;
    }
    if(process.env.NODE_ENV==='development'&&data.roomPlan?.appearance?.floor){
      staticRoot.add(domainRoomShell(data.roomPlan));baseFocus.set((data.width-1)/2,.75,(data.height-1)/2);focus.copy(baseFocus);resize();return;
    }
    staticRoot.add(mode==='truck'?truckShell(data.width,data.height,data.sign??'The Little Diner',cosmetics[data.wrap??'']??data.paint??PALETTE.tomato):data.roomPlan?createRoomShell(data.roomPlan,data):homeShell(data.width,data.height,data.sign??'The Little Diner',cosmetics[data.wall??'cream']??PALETTE.cream));
    if(mode==='home'){if(!data.roomPlan)staticRoot.add(createHomeBoard(data.width,data.height,data.floor));homeAmbience=createHomeAmbience(data.width,data.height);staticRoot.add(homeAmbience.root);}
    const coords:Array<{x:number;y:number;h:number;color:string}>=[];
    const floorColors=data.floor==='terracotta'?['#cb8c72','#dca68b']:data.floor==='cream'?['#f2ece0','#eee7da']:['#8eaf9b','#f5f0e6'];
    if(mode==='truck')for(let y=0;y<data.height;y++)for(let x=0;x<data.width;x++)coords.push({x,y,h:floorHeight(x,y),color:floorColors[(x+y)%2]});
    if(mode==='truck')for(let y=data.height+1;y<data.height+1+(data.pavementHeight??4);y++)for(let x=-1;x<(data.pavementWidth??7)-1;x++)coords.push({x,y,h:.06,color:(x+y)%2?'#d7d7c8':'#e2dfcf'});
    if(coords.length){const geometry=new THREE.BoxGeometry(.975,.075,.975),tileMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.84});tiles=new THREE.InstancedMesh(geometry,tileMaterial,coords.length);tiles.receiveShadow=true;tiles.userData.tiles=coords;const matrix=new THREE.Matrix4();
      coords.forEach((tile,i)=>{matrix.makeTranslation(tile.x,tile.h-.038,tile.y);tiles!.setMatrixAt(i,matrix);tiles!.setColorAt(i,new THREE.Color(tile.color));});tiles.instanceMatrix.needsUpdate=true;if(tiles.instanceColor)tiles.instanceColor.needsUpdate=true;staticRoot.add(tiles);}
    if(mode==='truck'){
      destination=createRouteEnvironment(data.environment??'street',data.width,data.height,data.journeyDomain);staticRoot.add(destination.root);
      const pavingW=data.pavementWidth??7,pavingH=data.pavementHeight??4;
      staticRoot.add(box(pavingW+.20,.14,pavingH+.2,'#c6cab7',(pavingW-3)/2,-.03,data.height+(pavingH+1)/2,.06));
      // An outlined pedestrian threshold, never another kitchen station.
      const threshold=box(.94,.055,.94,'#c1c9b9',1,.015,data.height,.03);threshold.userData.tile={x:1,y:data.height};staticRoot.add(threshold);
      // Destination scenery owns streets and verges. A second generic road
      // here used to cut through Downtown and leave disconnected empty slabs.
      for(const [x,y] of [[-1.7,data.height+1.2],[data.width+1.3,data.height+4.8]]){const plant=createModel('plant');plant.position.set(x,-.025,y);plant.scale.setScalar(1.15);staticRoot.add(plant);}
      if(data.trailer?.length)staticRoot.add(createEquipmentTrailer(data.trailer,data.width,data.height));
    }
    baseFocus.set((data.width-1)/2+(data.trailer?.length?1.15:0),.68,mode==='truck'?(data.height+(data.pavementHeight??4)-1)/2:(data.height-1)/2+.65);focus.copy(baseFocus);if(savedPan)focus.add(savedPan);resize();
  }
  function fitCamera(){
    camera.near=.1;
    const buildInsets=data.buildEditor?(width>=1000?{top:115,bottom:28,left:18,right:465}:height<500?{top:16,bottom:15,left:10,right:width*.5+14}:{top:72,bottom:height*.47+22,left:12,right:12}):null;
    if(data.buildView==='overhead'){
      const x=(data.width-1)/2+focus.x-baseFocus.x,z=(data.height-1)/2+focus.z-baseFocus.z;
      camera.up.set(0,0,-1);camera.position.set(x,24,z);camera.lookAt(x,0,z);camera.clearViewOffset();
      const inset=buildInsets??{top:100,bottom:data.previewInset??0,left:12,right:12},vertical=Math.max((data.height+1.5)*height/Math.max(130,height-inset.top-inset.bottom),(data.width+1.5)*height/Math.max(130,width-inset.left-inset.right))/zoom;
      camera.top=vertical/2;camera.bottom=-vertical/2;camera.left=-vertical*width/height/2;camera.right=vertical*width/height/2;
      camera.setViewOffset(width,height,(inset.right-inset.left)/2,(inset.bottom-inset.top)/2,width,height);camera.updateProjectionMatrix();camera.updateMatrixWorld();return;
    }
    camera.up.set(0,1,0);
    if(process.env.NODE_ENV==='development'&&data.reviewCamera){
      const shot=data.reviewCamera,distance=18;focus.set(shot.x,shot.y,shot.z);
      // Private wall-art close-ups cut away foreground rails without moving the room.
      if(shot.foregroundCutaway!==undefined)camera.near=distance-Math.max(.8,shot.foregroundCutaway);
      camera.position.set(shot.x+Math.sin(shot.azimuth)*Math.cos(shot.elevation)*distance,shot.y+Math.sin(shot.elevation)*distance,shot.z+Math.cos(shot.azimuth)*Math.cos(shot.elevation)*distance);camera.lookAt(focus);
      camera.clearViewOffset();camera.top=shot.vertical/2;camera.bottom=-shot.vertical/2;camera.left=-shot.vertical*width/height/2;camera.right=shot.vertical*width/height/2;camera.updateProjectionMatrix();camera.updateMatrixWorld();return;
    }
    if(mode==='home'){
      homeCameraBounds??=createHomeCameraBounds(data);
      const {azimuthOffset,insets,scaleBoost}=homeCameraPresentation(width,!!data.roomPlan,data.previewInset);
      if(buildInsets)Object.assign(insets,buildInsets);
      if(data.decoratingCatalogue)Object.assign(insets,width<=700?(height<500?{top:75,bottom:15,left:8,right:width*.5+12}:{top:75,bottom:height*.5+8,left:10,right:10}):{top:80,right:444,bottom:55,left:15});
      const fit=fitHomeCamera({bounds:homeCameraBounds,width,height,rotation,azimuthOffset,insets}),dx=focus.x-baseFocus.x,dz=focus.z-baseFocus.z;
      baseFocus.set(fit.focus.x,fit.focus.y,fit.focus.z);focus.set(baseFocus.x+dx,baseFocus.y,baseFocus.z+dz);
      const angle=rotation+azimuthOffset,distance=22;
      camera.position.set(focus.x+Math.sin(angle)*Math.cos(ELEVATION)*distance,focus.y+Math.sin(ELEVATION)*distance,focus.z+Math.cos(angle)*Math.cos(ELEVATION)*distance);camera.lookAt(focus);
      const vertical=fit.vertical/zoom/scaleBoost,{top,bottom,left,right}=fit.insets;
      camera.top=vertical/2;camera.bottom=-vertical/2;camera.left=-vertical*width/height/2;camera.right=vertical*width/height/2;
      camera.setViewOffset(width,height,width/2-(left+(width-left-right)/2),height/2-(top+(height-top-bottom)/2),width,height);camera.updateProjectionMatrix();camera.updateMatrixWorld();return;
    }
    const angle=rotation-Math.PI/4,distance=22;camera.position.set(focus.x+Math.sin(angle)*Math.cos(ELEVATION)*distance,focus.y+Math.sin(ELEVATION)*distance,focus.z+Math.cos(angle)*Math.cos(ELEVATION)*distance);camera.lookAt(focus);
    const maxZ=data.height+(data.pavementHeight??4)+.55,maxX=data.width+(data.trailer?.length?4.5:1.4),minX=-1.5;
    const right=new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion);let minPX=Infinity,maxPX=-Infinity,minPY=Infinity,maxPY=-Infinity;
    for(const x of [minX,maxX])for(const y of [0,2.55])for(const z of [-1.1,maxZ]){const p=new THREE.Vector3(x,y,z);const a=p.dot(right),b=p.dot(up);minPX=Math.min(minPX,a);maxPX=Math.max(maxPX,a);minPY=Math.min(minPY,b);maxPY=Math.max(maxPY,b);}
    const compactSetup=!!data.truckSetup;
    const landscape=width<=700&&height<500&&width>height&&!compactSetup;
    const insetTop=compactSetup?8:landscape?72:height<650?65:110,insetBottom=compactSetup?48:landscape?58:125,usableH=Math.max(160,height-insetTop-insetBottom),insetLeft=12,insetRight=landscape?230:width<700?12:58,usableW=Math.max(160,width-insetLeft-insetRight);
    // Portrait play should frame the working area, not a postcard of the entire
    // destination. Panning still exposes the cab, trailer and surrounding world.
    const framing=data.journeyDomain&&width<=700?1.08:width<=700&&height>width?1.38:landscape?1.26:1.06;
    const vertical=Math.max((maxPY-minPY)*height/usableH,(maxPX-minPX)*height/usableW)*1.04/(zoom*framing);
    camera.top=vertical/2;camera.bottom=-vertical/2;camera.left=-vertical*width/height/2;camera.right=vertical*width/height/2;
    camera.setViewOffset(width,height,width/2-(insetLeft+usableW/2),height/2-(insetTop+usableH/2),width,height);camera.updateProjectionMatrix();camera.updateMatrixWorld();
  }
  function resize(){width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);renderer.setSize(width,height,false);fitCamera();}
  const observer=new ResizeObserver(resize);observer.observe(host);
  const lowDetail=()=>data.quality==='low'||data.quality!=='high'&&quality==='low';
  const stationKey=(object:SceneObject)=>`${object.kind}:${object.label??''}:${object.appearance??''}:${object.tier}:${object.color}:${object.stock}:${object.supplyIngredients?.join(',')}:${object.footprint?.join(',')}:${JSON.stringify(data.roomFinishes)}:${JSON.stringify(data.roomPlan?.appearance?.pieces[object.id])}:${lowDetail()}`;
  function makeStation(object:SceneObject){
    const skin=process.env.NODE_ENV==='development'?data.roomPlan?.appearance?.pieces[object.id]:undefined;
    const themedModel=skin?.part==='counter'?domainRoomPiece(skin.domain,'counter',object.footprint?.[0]??1):domainDecoration(object.kind);
    const root=new THREE.Group(),model=themedModel??createEquipmentAppearance(object.kind,object.appearance,{lowDetail:lowDetail(),tier:object.tier,color:object.color,stock:object.stock,supplyIngredients:object.supplyIngredients,fixtureWidth:object.footprint?.[0],roomColors:roomColors(data)}),food=new THREE.Group();root.add(model,food);if(object.label){const label=textPlane(object.label,.48,.085,PALETTE.ink,PALETTE.cream);label.position.set(0,1.275,.433);label.rotation.y=Math.PI;model.add(label);}root.userData.pick={id:object.id} satisfies ScenePick;
    const halo=new THREE.Mesh(new THREE.RingGeometry(.48,.535,32),new THREE.MeshBasicMaterial({color:PALETTE.mustard,transparent:true,opacity:.85,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.y=.017;root.add(halo);
    const progress=new THREE.Mesh(new THREE.PlaneGeometry(.72,.055),new THREE.MeshBasicMaterial({color:PALETTE.sage,side:THREE.DoubleSide}));progress.position.set(0,object.kind==='spill'?.54:object.kind==='parcel'?.85:1.43,0);root.add(progress);
    const steam=new THREE.Group();
    if(object.kind==='spill'){
      for(let i=0;i<3;i++)steam.add(new THREE.Mesh(new THREE.SphereGeometry(.045,6,5),new THREE.MeshBasicMaterial({color:'#fffbea',transparent:true,opacity:.65,depthWrite:false})));
      steam.userData.scrubbing=true;const cloth=box(.19,.025,.14,PALETTE.porcelain,0,.055,0,.017);cloth.name='cleaning-cloth';steam.add(cloth);
    }root.add(steam);
    const cooking=['grill','prep','fryer','oven','blender','coffee','drinks','waffle','pass'].includes(object.kind)?createCookingEffects():null;
    if(cooking)root.add(cooking.group);
    for(const feedback of [progress,halo,steam])feedback.userData.inputPassthrough=true;
    const result={root,model,food,foodKey:'',progress,halo,steam,cooking,kind:stationKey(object)};stationRoot.add(root);stationViews.set(object.id,result);return result;
  }
  function syncObjects(){
    const ids=new Set(data.objects.map(o=>o.id));for(const [id,view] of stationViews)if(!ids.has(id)){view.cooking?.dispose();disposeObject(view.root);stationRoot.remove(view.root);stationViews.delete(id);}
    for(const object of data.objects){let view=stationViews.get(object.id);if(view&&view.kind!==stationKey(object)){view.cooking?.dispose();disposeObject(view.root);stationRoot.remove(view.root);stationViews.delete(object.id);view=undefined;}view??=makeStation(object);
      const footprint=object.footprint??(object.kind==='pass'||object.kind==='queue_bench'?[2,1]:[1,1]),facing=object.rotation??0;
      const fw=facing%2?footprint[1]:footprint[0],fh=facing%2?footprint[0]:footprint[1];
      const basket=view.model.getObjectByName('fryer-basket')??view.model.getObjectByName('boiler-basket');if(basket)basket.position.y=object.basketRaised?.22:0;view.food.position.y=object.basketRaised?.22:0;
      view.root.position.set(object.x+(fw-1)/2,object.elevation??floorHeight(object.x,object.y),object.y+(fh-1)/2);view.model.rotation.y=rotationAngle(facing);view.food.rotation.y=rotationAngle(facing);
      configureRoomMount(view.model,object);
      const gate=view.model.getObjectByName('lift-gate-leaf');if(gate)gate.userData.openAngle=object.gateOpen?1.48:0;
      const staffDoor=view.model.getObjectByName('staff-door-leaf');if(staffDoor)staffDoor.userData.openYaw=object.gateOpen?-1.45:0;
      const window=view.model.getObjectByName('hatch-window');if(window)window.userData.slideTarget=object.slots?.some(slot=>slot.food)?.34:0;
      const slots=object.slots?.length?object.slots:[{food:object.food}],key=slots.map(slot=>foodKey(slot.food)).join('|');
      if(view.foodKey!==key){view.food.clear();const counter=object.kind==='pass'?holdingCounterSlotPositions(slots.length):null;slots.forEach((slot,index)=>{if(!slot.food)return;const food=createFoodModel(slot.food),columns=slots.length>4?3:Math.min(2,slots.length),rows=Math.ceil(slots.length/columns),spot=counter?.[index];food.position.set(spot?.x??(index%columns-(columns-1)/2)*.28,(view.model.userData.surfaceHeight??.93)+.015,spot?.z??(Math.floor(index/columns)-(rows-1)/2)*.31);food.scale.setScalar(spot?.scale??(slots.length>2?.60:slots.length>1?.73:1));view.food.add(food);});view.foodKey=key;}
      const states=object.slots?.map(slot=>slot.state)??[object.state],burning=states.includes('burning'),ready=states.includes('ready'),working=states.includes('working'),progress=object.slots?.find(slot=>slot.state==='working')?.progress??object.progress;
      if(object.kind==='spill'){const remaining=homeSpillScale(object.progress??0);view.model.children.forEach((child,i)=>{if(child instanceof THREE.Mesh&&child.geometry.type==='SphereGeometry'){child.scale.set(remaining,.08,remaining*.7);child.position.x=Math.sin(i*1.8)*.18*remaining;child.position.z=Math.cos(i*1.8)*.15*remaining;}});}
      if(object.kind==='parcel'&&(object.id.startsWith('incident:')||object.id==='home-parcel')){
        const progress=object.progress??0,tape=view.model.getObjectByName('parcel-tape'),left=view.model.getObjectByName('parcel-left-flap'),right=view.model.getObjectByName('parcel-right-flap');
        if(tape){tape.visible=progress<1/3;tape.rotation.x=-Math.min(1,progress*3)*.5;tape.position.y=Math.min(1,progress*3)*.09;}
        // The default parcel faces the street (rotated by pi), so its local right hinge is screen/world left.
        const reversed=Math.cos(view.model.rotation.y)<0;
        const firstFlap=THREE.MathUtils.clamp(progress*3-1,0,1),secondFlap=THREE.MathUtils.clamp(progress*3-2,0,1);
        if(left)left.userData.openAngle=1.95*(reversed?secondFlap:firstFlap);
        if(right)right.userData.openAngle=-1.95*(reversed?firstFlap:secondFlap);
      }
      view.halo.visible=object.id===data.selectedId||object.id===data.guideTarget||!!data.compatibleTargets?.includes(object.id)||ready||burning;(view.halo.material as THREE.MeshBasicMaterial).color.set(burning?PALETTE.tomato:object.id===data.selectedId||object.id===data.guideTarget?PALETTE.mustard:PALETTE.sage);view.progress.visible=progress!=null&&working;view.progress.scale.x=Math.max(.03,progress??0);view.steam.visible=working&&object.kind==='spill';
      view.cooking?.setState(object,view.model.userData.surfaceHeight??.93);
    }
  }
  function syncTables(){
    const ids=new Set(data.tables.map(t=>t.id));for(const [id,view] of tableViews)if(!ids.has(id)){disposeObject(view.root);tableRoot.remove(view.root);tableViews.delete(id);}
    for(const table of data.tables){const key=JSON.stringify([table.x,table.y,table.capacity,table.rotation,table.kind,table.tableStyle,table.footprint,data.roomFinishes,data.roomPlan?.appearance?.pieces[table.id],table.seats.map(s=>[s.id,s.x,s.y,s.surface,s.style])]);let view=tableViews.get(table.id);
      const center=tableCenter(table),skin=process.env.NODE_ENV==='development'?data.roomPlan?.appearance?.pieces[table.id]:undefined;
      if(!view||view.key!==key){if(view){disposeObject(view.root);tableRoot.remove(view.root);}const root=new THREE.Group(),model=skin?domainRoomPiece(skin.domain,table.kind?'counter':'table',table.footprint?.[0]??1):createModel(table.kind==='booth'?'booth_2':table.kind??`table_${table.capacity}`,{roomColors:roomColors(data),tableStyle:table.tableStyle,placeSettings:diningPlaceSettings(table)}),food=new THREE.Group();if(skin&&!table.kind){const [w,h]=table.footprint??[table.capacity===4?2:1,table.capacity===1?1:2];model.scale.x=w;model.scale.z=h;}model.position.set(center.x,floorHeight(table.x,table.y),center.y);model.rotation.y=table.kind&&table.kind!=='booth'?rotationAngle(table.rotation??0):-(table.rotation??0)*Math.PI/2;model.userData.pick={id:table.id} satisfies ScenePick;root.add(model,food);
        if(table.kind!=='booth')for(const seat of table.seats){const chair=skin?domainRoomPiece(skin.domain,table.kind?'stool':'chair'):createModel(table.kind?'stool':'chair',{color:mode==='truck'?PALETTE.tomato:data.roomPlan?roomColors(data).upholstery:PALETTE.mint,roomColors:roomColors(data),seatStyle:seat.style??(table.kind==='chef_bar'?'diner':'classic')});chair.position.set(seat.x,floorHeight(seat.x,seat.y),seat.y);chair.lookAt(seat.surface?.x??center.x,chair.position.y,seat.surface?.y??center.y);chair.rotateY(Math.PI);chair.userData.pick={id:table.id,seatId:seat.id} satisfies ScenePick;root.add(chair);}
        const [tw,th]=tableShape(table),halo=new THREE.Mesh(new THREE.PlaneGeometry(tw-.02,th-.02),new THREE.MeshBasicMaterial({color:PALETTE.mustard,transparent:true,opacity:.32,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.set(center.x,floorHeight(table.x,table.y)+.006,center.y);root.add(halo);tableRoot.add(root);view={root,key,food,foodKey:'',halo};tableViews.set(table.id,view);}
      view.halo.userData.inputPassthrough=true;view.halo.visible=table.id===data.selectedId||table.id===data.guideTarget||!!data.compatibleTargets?.includes(table.id);(view.halo.material as THREE.MeshBasicMaterial).color.set(table.id===data.selectedId?PALETTE.mustard:PALETTE.sage);
      const keyFood=JSON.stringify(table.seats.map(s=>[s.id,foodKey(s.item),s.status]));if(view.foodKey!==keyFood){view.food.clear();for(const seat of table.seats){if(!seat.item)continue;const food=createFoodModel(seat.item);const dx=seat.x-center.x,dz=seat.y-center.y,setting=diningFoodPoint(table,seat);food.position.set(setting?.x??seat.surface?.x??center.x+(table.capacity===1?0:dx*((table.rotation??0)%2?.65:table.capacity===2?.16:.33)),floorHeight(table.x,table.y)+(table.surfaceHeight??.85),setting?.y??seat.surface?.y??center.y+(table.capacity===1?0:dz*((table.rotation??0)%2?(table.capacity===2?.16:.33):.65)));food.scale.setScalar(setting?.74:.80);food.userData.pick={id:table.id,seatId:seat.id} satisfies ScenePick;view.food.add(food);}view.foodKey=keyFood;}
    }
  }
  function syncPeople(){
    const ids=new Set(data.people.map(p=>p.id)),now=performance.now();for(const [id,view] of personViews)if(!ids.has(id)){disposeObject(view.root);actorRoot.remove(view.root);personViews.delete(id);}
    for(const person of data.people){let view=personViews.get(person.id);const destination=point3(person.x,person.y,floorHeight(person.x,person.y));
      const uniform=cosmetics[person.outfit??data.uniform??'classic']??PALETTE.sage;
      if(!view){const root=new THREE.Group(),body=createModel(person.role,{look:person.look??0,color:uniform});if(person.role==='customer')dressCustomer(body,person.customerType,person.look);if(data.rehearsal)body.traverse(o=>{if(o instanceof THREE.Mesh){const tint=(m:THREE.Material)=>{const next=m.clone();next.userData.sharedKitResource=false;next.transparent=true;next.opacity=.48;next.depthWrite=false;return next;};o.material=Array.isArray(o.material)?o.material.map(tint):tint(o.material);o.castShadow=false;}});root.add(body);root.position.copy(destination);actorRoot.add(root);view={root,body,previous:destination.clone(),destination:destination.clone(),changed:now,angle:rotationAngle(person.facing??0),foodKey:'',person,order:null,orderKey:'',uniform};personViews.set(person.id,view);}
      else if(view.uniform!==uniform&&person.role!=='customer'){disposeObject(view.body);view.root.remove(view.body);view.body=createModel(person.role,{look:person.look??0,color:uniform});view.root.add(view.body);view.uniform=uniform;view.foodKey='';}
      if(view.destination.distanceToSquared(destination)>0.00001){view.previous.copy(view.root.position);view.destination.copy(destination);view.changed=now;const delta=destination.clone().sub(view.previous);if(delta.lengthSq()>.00001)view.angle=Math.atan2(-delta.x,-delta.z);}
      // A work target can lie behind the current leg of a route. Face it only
      // after arriving; walking faces the actual rendered displacement below.
      if(person.target&&view.root.position.distanceToSquared(destination)<.00001&&Math.hypot(person.x-person.target.x,person.y-person.target.y)>.01)view.angle=Math.atan2(person.x-person.target.x,person.y-person.target.y);
      if(person.pose==='sit'||person.pose==='eat'){view.root.position.copy(destination);view.previous.copy(destination);const table=data.tables.find(t=>t.id===person.tableId);if(table){const center=table.seats.find(seat=>seat.id===person.seatId)?.surface??tableCenter(table);view.angle=Math.atan2(person.x-center.x,person.y-center.y);}}
      const rig=view.body.userData.rig as CharacterRig,key=foodKey(person.held);if(key!==view.foodKey){rig.held.clear();if(person.held){const held=createFoodModel(person.held);held.scale.setScalar(.75);rig.held.add(held);}view.foodKey=key;}
      const needsClear=!!person.tableId&&data.tables.find(table=>table.id===person.tableId)?.seats.find(seat=>seat.id===person.seatId)?.item?.kind==='dirty';
      const orderKey=person.order?`${person.order.recipeId}:${needsClear}`:'';if(orderKey!==view.orderKey){if(view.order){disposeObject(view.order);view.root.remove(view.order);}view.order=person.order?createOrderBubble(person.order.recipeId,needsClear):null;if(view.order)view.root.add(view.order);view.orderKey=orderKey;}
      if(view.order){view.order.position.y=2.26+(person.pose==='sit'||person.pose==='eat'?(person.work?.seatHeight??.48)-.63:0);updateOrderBubble(view.order,person.order?.patience??1);}
      const action=observeAction(view.person,person,actingTime);if(action)view.action=action;setActorPicking(view.root,mode,person);view.root.visible=!person.hidden;view.person=person;
    }
  }
  function editorObject(id:string|null|undefined){
    const chair=roomChairSelection(id),seat=chair?data.tables.find(t=>t.id===chair.tableId)?.seats[chair.index]:undefined;
    if(chair)return seat?tableViews.get(chair.tableId)?.root.children.find(o=>o.userData.pick?.seatId===seat.id):undefined;
    const surfaceName=id?.startsWith('edge:')?`room-wall:${id.slice(5)}`:id?.startsWith('entrance:')?`room-entry:${id.slice(9)}`:null;
    return id?(stationViews.get(id)?.model??tableViews.get(id)?.root??(surfaceName?staticRoot.getObjectByName(surfaceName):undefined)):undefined;
  }
  function syncEdit(){
    const selected=editorObject(data.selectedId);
    selectionOutline.visible=!!(editing&&data.buildEditor&&selected);if(selectionOutline.visible&&selected){selected.updateWorldMatrix(true,true);selectionOutline.box.setFromObject(selected).expandByScalar(.04);}
    (selectionOutline.material as THREE.LineBasicMaterial).color.set(data.selectedId===data.editorProblemTarget?PALETTE.tomato:PALETTE.mustard);
    if(editing&&data.buildEditor&&data.editorFocus&&focusedEditorRequest!==data.editorFocus.request){
      const target=editorObject(data.editorFocus.id);
      if(target){target.updateWorldMatrix(true,true);const center=new THREE.Box3().setFromObject(target).getCenter(new THREE.Vector3());
        if(data.buildView==='overhead')focus.set(baseFocus.x+center.x-(data.width-1)/2,baseFocus.y,baseFocus.z+center.z-(data.height-1)/2);
        else focus.set(center.x,baseFocus.y,center.z);
        zoom=Math.max(zoom,1.25);fitCamera();focusedEditorRequest=data.editorFocus.request;
      }
    }
    if(!data.buildEditor)focusedEditorRequest=undefined;
    for(const object of data.objects)if(object.mount?.kind==='ceiling'){const view=stationViews.get(object.id);if(view)view.model.userData.inputPassthrough=!editing;}
    const key=JSON.stringify([data.tileHighlights??[],data.serviceConnection??[]]);if(key!==placementKey){placementKey=key;disposeObject(placementTiles);placementTiles.clear();for(const tile of data.tileHighlights??[]){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.84,.84),new THREE.MeshBasicMaterial({color:tile.valid?'#f7cf6e':PALETTE.tomato,transparent:true,opacity:tile.valid?.30:.40,depthWrite:false,depthTest:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(tile.x,floorHeight(tile.x,tile.y)+.012,tile.y);mesh.renderOrder=17;placementTiles.add(mesh);if(!tile.valid){const cross=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-.22,0,-.22),new THREE.Vector3(.22,0,.22),new THREE.Vector3(-.22,0,.22),new THREE.Vector3(.22,0,-.22)]),new THREE.LineBasicMaterial({color:'#fff9ee',depthTest:false}));cross.position.copy(mesh.position);cross.position.y+=.005;cross.renderOrder=18;placementTiles.add(cross);}}if(data.serviceConnection?.length){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(data.serviceConnection.map(p=>new THREE.Vector3(p.x,1.25,p.y))),new THREE.LineDashedMaterial({color:'#33735c',dashSize:.22,gapSize:.10,depthTest:false}));line.computeLineDistances();line.renderOrder=21;line.userData.inputPassthrough=true;placementTiles.add(line);}}
    placementTiles.visible=editing;
    const nextGhostKey=editing&&data.placement?JSON.stringify(data.placement):'';
    if(nextGhostKey!==ghostKey){ghostKey=nextGhostKey;disposeObject(placementRoot);placementRoot.clear();if(editing&&data.placement){placementRoot.add(createPlacementGhost(data.placement,floorHeight,mode));if(data.placement.surfaces)placementRoot.add(mountSurfaceHighlights(data.placement.surfaces));}}
    placementRoot.visible=editing;
    const draft=data.placement?.object??data.placement?.table;
    if(editing&&draft&&focusedDraft!==draft.id){focusedDraft=draft.id;focus.set(draft.x,.85,draft.y);zoom=1.4;fitCamera();}
    if(!editing||!draft)focusedDraft=null;
    staticRoot.traverse(object=>{if(object.userData.editorGrid)object.visible=editing;});
    const object=data.objects.find(o=>o.id===data.selectedId);workArrow.visible=editing&&!!object&&['crate','fridge','plates','cups','boxes','bowls','boiler','grill','prep','fryer','sink','bin','oven','blender','coffee','drinks','waffle','pass'].includes(object.kind);
    if(!object||!workArrow.visible)return;const facing=object.rotation??0,footprint=object.footprint??(object.kind==='pass'?[2,1]:[1,1]),w=facing%2?footprint[1]:footprint[0],h=facing%2?footprint[0]:footprint[1];
    const target=facing===0?{x:object.x,y:object.y+h}:facing===1?{x:object.x-1,y:object.y}:facing===2?{x:object.x,y:object.y-1}:{x:object.x+w,y:object.y};
    workArrow.position.set(target.x,floorHeight(target.x,target.y)+.018,target.y);workArrow.rotation.z=-facing*Math.PI/2;
  }
  function syncPresentation(){
    const requested=data.quality??'auto',atmosphere=mode==='truck'&&data.environment==='night_market'?'night':data.atmosphere==='rain'?'rain':mode==='truck'&&data.environment==='festival'?'evening':data.atmosphere??'day';
    const chosen=requested==='auto'?quality:requested,key=chosen+':'+atmosphere;
    if(key!==presentationKey){presentationKey=key;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,QUALITY_BUDGETS[chosen].pixelRatio));lighting.setQuality(chosen);lighting.setAtmosphere(atmosphere);scene.background=new THREE.Color(atmosphere==='night'?'#344754':atmosphere==='evening'?'#ded8cd':atmosphere==='rain'?'#dce2df':'#f4e9dd');}
    // The receiver is only useful with a live shadow map. Hide it when maps
    // are disabled so a retained map cannot leave a rectangular shadow patch.
    // Local contact ellipses still ground furnishings on the low preset.
    ground.visible=QUALITY_BUDGETS[chosen].shadows;
    destination?.setQuality(chosen);staticRoot.traverse(object=>{if(object.name==='window-rain')object.visible=atmosphere==='rain';});
  }
  function syncScene(){
    if(mode==='home'){
      const key=JSON.stringify([data.characterReview,data.width,data.height,data.roomPlan?.stage,data.objects.filter(o=>!o.id.startsWith('incident:')&&o.kind!=='parcel'&&o.kind!=='spill').map(o=>[o.id,o.kind,o.x,o.y,o.rotation,o.footprint]),data.tables.map(t=>[t.id,t.x,t.y,t.rotation,t.capacity,t.footprint,t.seats.map(s=>[s.x,s.y])])]);
      if(key!==homeCameraKey){homeCameraBounds=data.characterReview?{boxes:[{min:{x:-.6,y:0,z:-.6},max:{x:data.width-.4,y:2.1,z:data.height-.4}}]}:createHomeCameraBounds(data);homeCameraKey=key;}
    }
    buildStatic();syncPresentation();syncObjects();syncTables();syncPeople();syncEdit();contactShadows.update(data,floorHeight);
  }
  function ndc(clientX:number,clientY:number){const rect=canvas.getBoundingClientRect();pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);}
  // Truck crew pass station selection through their whole rig. Furniture and
  // customers still occlude, and home staff retain their own selection targets.
  function visibleSurfaceAt(clientX:number,clientY:number){
    ndc(clientX,clientY);
    return firstVisibleSceneSurface(raycaster.intersectObjects([stationRoot,tableRoot,actorRoot,staticRoot],true));
  }
  function placementTileAt(clientX:number,clientY:number){ndc(clientX,clientY);return projectPlacementTile(raycaster.ray,mode,data.width,data.height);}
  function pickTarget(clientX:number,clientY:number){
    // A chosen furnishing stays chosen until Confirm or Cancel. Occupied cells
    // pin an invalid preview rather than silently replacing it with their owner.
    if(editing&&data.placement?.surfaces){ndc(clientX,clientY);const surface=pickMountSurface(raycaster.ray,data.placement.surfaces);if(surface)callbacks.onMountSurface?.(surface);return;}
    if(editing&&data.placement){const tile=placementTileAt(clientX,clientY);if(tile){canvas.dataset.lastTile=`${tile.x},${tile.y}`;callbacks.onTile(tile.x,tile.y);}return;}
    const hit=visibleSurfaceAt(clientX,clientY);
    const target=mode==='truck'&&!editing?resolveTableSurfaceTarget(hit,data.tables):hit?.target;
    if(target){canvas.dataset.lastTarget=target.id;canvas.dataset.lastSeat=target.seatId??'';callbacks.onTarget(target.id,target.seatId);}
    else if(hit?.tile){canvas.dataset.lastTile=`${hit.tile.x},${hit.tile.y}`;callbacks.onTile(hit.tile.x,hit.tile.y);}
  }
  function panBetween(previous:{x:number;y:number},next:{x:number;y:number}){const a=new THREE.Vector3(),b=new THREE.Vector3();ndc(previous.x,previous.y);if(!raycaster.ray.intersectPlane(groundPlane,a))return;ndc(next.x,next.y);if(!raycaster.ray.intersectPlane(groundPlane,b))return;focus.add(a.sub(b));focus.x=THREE.MathUtils.clamp(focus.x,baseFocus.x-(mode==='truck'?16:6),baseFocus.x+(mode==='truck'?16:6));focus.z=THREE.MathUtils.clamp(focus.z,baseFocus.z-(mode==='truck'?24:6),baseFocus.z+(mode==='truck'?12:6));callbacks.onCameraDisplaced?.(focus.distanceTo(baseFocus)>.8);fitCamera();}
  function homeFloorPoint(clientX:number,clientY:number){ndc(clientX,clientY);const point=new THREE.Vector3();return raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.095),point)?{x:Math.round(point.x*10000)/10000,y:Math.round(point.z*10000)/10000}:null;}
  let hoverKey='';
  function clearHover(){if(!hoverKey)return;hoverKey='';callbacks.onHoverTile?.(null,null);}
  function hoverTileAt(clientX:number,clientY:number){
    const tile=placementTileAt(clientX,clientY);if(!tile){clearHover();return;}
    const {x,y}=tile,key=`${x},${y}`;if(key!==hoverKey){hoverKey=key;callbacks.onHoverTile?.(x,y);}
  }
  function endHomeGesture(){const previous=homePointer;homePointer=null;scrubPointerId=null;if(previous){pointerMoved=true;callbacks.onHomeGesture?.({type:'end',incidentId:previous.incidentId});}}
  function parcelAt(clientX:number,clientY:number){
    const hit=visibleSurfaceAt(clientX,clientY),parcel=hit?.target&&data.objects.find(item=>item.id===hit.target!.id&&item.kind==='parcel'&&(item.id.startsWith('incident:')||item.id==='home-parcel'));return parcel&&hit?{parcel,point:hit.point}:null;
  }
  let cancelledConstruction=false;
  const onDown=(event:PointerEvent)=>{
    if(!pointers.size)cancelledConstruction=false;
    canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});gestureStart={x:event.clientX,y:event.clientY};pointerMoved=false;
    if(pointers.size===2){cancelledConstruction=true;endHomeGesture();const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);pointerMoved=true;return;}
    if(mode==='home'&&!editing&&callbacks.onHomeGesture){const surface=visibleSurfaceAt(event.clientX,event.clientY),point=homeFloorPoint(event.clientX,event.clientY),spill=point&&data.objects.find(item=>item.kind==='spill'&&item.id.startsWith('incident:')&&(surface?.target?.id===item.id||(!surface?.target&&surface?.tile))&&Math.hypot(item.x-point.x,item.y-point.y)<=HOME_GESTURE_RULES.startRadius);
      if(point&&spill){homePointer={incidentId:spill.id,...point};scrubPointerId=event.pointerId;lastHomeSample=performance.now();pointerMoved=true;callbacks.onHomeGesture({type:'begin',incidentId:spill.id,point});}
    }
  };
  const onMove=(event:PointerEvent)=>{
    if(editing&&!data.placement?.surfaces&&event.pointerType==='mouse'&&pointers.size===0&&event.buttons===0&&!canvas.hasPointerCapture(event.pointerId)){hoverTileAt(event.clientX,event.clientY);return;}
    const before=pointers.get(event.pointerId);if(!before)return;const after={x:event.clientX,y:event.clientY};pointers.set(event.pointerId,after);
    if(scrubPointerId===event.pointerId&&homePointer){const point=homeFloorPoint(event.clientX,event.clientY);if(point){homePointer={incidentId:homePointer.incidentId,...point};const now=performance.now();if(now-lastHomeSample>=HOME_GESTURE_RULES.sampleMs){lastHomeSample=now;callbacks.onHomeGesture?.({type:'stroke',incidentId:homePointer.incidentId,point});}}pointerMoved=true;return;}
    if(editing&&data.construction&&pointers.size===1){pointerMoved=Math.hypot(after.x-gestureStart.x,after.y-gestureStart.y)>6;return;}
    if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinchDistance>1)zoom=THREE.MathUtils.clamp(zoom*distance/pinchDistance,.65,2.4);pinchDistance=distance;pointerMoved=true;fitCamera();}else if(Math.hypot(after.x-gestureStart.x,after.y-gestureStart.y)>6||pointerMoved){panBetween(before,after);pointerMoved=true;}
  };
  const onUp=(event:PointerEvent)=>{
    const was=pointers.has(event.pointerId);pointers.delete(event.pointerId);if(event.type!=='pointerup')cancelledConstruction=true;if(scrubPointerId===event.pointerId)endHomeGesture();
    if(was&&editing&&data.construction&&event.type==='pointerup'&&!cancelledConstruction){const start=homeFloorPoint(gestureStart.x,gestureStart.y),end=homeFloorPoint(event.clientX,event.clientY);if(start&&end)callbacks.onConstruction?.(start,end);if(!pointers.size)pinchDistance=0;return;}
    if(was&&!pointerMoved&&event.type!=='pointercancel'&&event.type!=='lostpointercapture'){
      const picked=mode==='home'&&!editing&&callbacks.onHomeGesture?parcelAt(event.clientX,event.clientY):null;
      if(picked){const {parcel,point}=picked,localX=point.x-parcel.x,part=(parcel.progress??0)<1/3?(Math.abs(localX)<=.13?'tape':null):localX<-.04?'leftFlap':localX>.04?'rightFlap':null;if(data.selectedId!==parcel.id)callbacks.onTarget(parcel.id);if(part&&parcel.state!=='working')callbacks.onHomeGesture?.({type:'parcel',incidentId:parcel.id,part});}
      else pickTarget(event.clientX,event.clientY);
    }
    if(!pointers.size)pinchDistance=0;
  };
  const cancelPointerWork=()=>{cancelledConstruction=true;pointerMoved=true;pointers.clear();pinchDistance=0;endHomeGesture();};
  const onHidden=()=>{if(document.visibilityState!=='visible')cancelPointerWork();};
  let keyboardHomePoint:{incidentId:string;x:number;y:number}|null=null;
  const onKeyDown=(event:KeyboardEvent)=>{
    if(mode!=='home'||editing||!callbacks.onHomeGesture)return;
    const object=data.objects.find(item=>item.id===data.selectedId&&(item.id.startsWith('incident:')||item.id==='home-parcel'));if(!object)return;
    if(object.kind==='parcel'&&(event.key==='Enter'||event.key===' ')){event.preventDefault();if(!event.repeat&&object.state!=='working')callbacks.onHomeGesture({type:'parcel',incidentId:object.id,part:(object.progress??0)<1/3?'tape':(object.progress??0)<2/3?'leftFlap':'rightFlap'});return;}
    const direction:Record<string,[number,number]>={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,-.12],ArrowDown:[0,.12]};
    if(object.kind!=='spill'||!direction[event.key])return;event.preventDefault();
    if(!homePointer){const previous=keyboardHomePoint?.incidentId===object.id?keyboardHomePoint:{x:object.x,y:object.y};homePointer={incidentId:object.id,x:previous.x,y:previous.y};scrubPointerId=-1;callbacks.onHomeGesture({type:'begin',incidentId:object.id,point:{x:homePointer.x,y:homePointer.y}});}
    const [dx,dy]=direction[event.key],angle=targetRotation,x=dx*Math.cos(angle)+dy*Math.sin(angle),y=dy*Math.cos(angle)-dx*Math.sin(angle);
    const point={x:homePointer.x+x,y:homePointer.y+y},distance=Math.hypot(point.x-object.x,point.y-object.y);if(distance>.48){point.x=object.x+(point.x-object.x)*.48/distance;point.y=object.y+(point.y-object.y)*.48/distance;}
    homePointer={incidentId:object.id,...point};keyboardHomePoint={...homePointer};lastHomeSample=performance.now();callbacks.onHomeGesture({type:'stroke',incidentId:object.id,point});
  };
  const onKeyUp=(event:KeyboardEvent)=>{if(scrubPointerId===-1&&event.key.startsWith('Arrow'))endHomeGesture();};
  const onWheel=(event:WheelEvent)=>{event.preventDefault();zoom=THREE.MathUtils.clamp(zoom*Math.exp(-event.deltaY*.001),.65,2.4);fitCamera();};
  const onContextLost=(event:Event)=>{if(disposed)return;event.preventDefault();cancelAnimationFrame(frame);callbacks.onError?.('The browser lost its WebGL graphics context. Reload the scene to continue.');};
  canvas.addEventListener('webglcontextlost',onContextLost);
  canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerleave',clearHover);canvas.addEventListener('pointerup',onUp);canvas.addEventListener('pointercancel',onUp);canvas.addEventListener('lostpointercapture',onUp);canvas.addEventListener('wheel',onWheel,{passive:false});document.addEventListener('visibilitychange',onHidden);window.addEventListener('blur',cancelPointerWork);
  canvas.addEventListener('keydown',onKeyDown);canvas.addEventListener('keyup',onKeyUp);
  function animate(now:number){if(disposed)return;frame=requestAnimationFrame(animate);if(document.hidden){lastFrame=now;statsAt=now;statsFrames=0;return;}const delta=Math.min(.05,(now-lastFrame)/1000),time=now/1000;lastFrame=now;rotation+=(targetRotation-rotation)*Math.min(1,delta*10);fitCamera();
    if(!data.paused)presentationTime+=delta;destination?.update(delta,camera,reducedMotion,!!data.paused);
    homeAmbience?.update(time,!reducedMotion&&!data.paused);
    discoveryEffects.update(presentationTime,data.discoveries??[],!!data.discoveryPreview,reducedMotion,id=>stationViews.get(id)?.model);
    if(!data.paused)actingTime+=delta;
    for(const view of personViews.values()){
      const progress=Math.min(1,(now-view.changed)/50),oldX=view.root.position.x,oldZ=view.root.position.z;
      view.root.position.lerpVectors(view.previous,view.destination,progress);
      const dx=view.root.position.x-oldX,dz=view.root.position.z-oldZ,speed=delta>0?Math.hypot(dx,dz)/delta:0;
      const moving=!data.paused&&speed>.01&&view.person.pose!=='sit'&&view.person.pose!=='eat';
      if(moving)view.angle=Math.atan2(-dx,-dz);
      const angle=THREE.MathUtils.euclideanModulo(view.angle-view.body.rotation.y+Math.PI,Math.PI*2)-Math.PI;
      view.body.rotation.y+=angle*Math.min(1,delta*18);
      animateCharacter(view.body,actingTime,view.person.pose??'idle',!!view.person.held,moving,view.person.work,{delta:data.paused?0:delta,speed,reducedMotion,action:view.action,actionTime:actingTime,turn:angle});
      if(view.person.customerType==='party'&&view.person.pose==='idle'&&!reducedMotion&&!data.paused){const rig=view.body.userData.rig as CharacterRig;rig.body.rotation.z=Math.sin(actingTime*3+rig.phase)*.07;rig.arms.forEach((arm,i)=>{arm.rotation.z=Math.sin(actingTime*3+rig.phase+i)*.22;});}
      const rig=view.body.userData.rig as CharacterRig;
      actorShadowPosition.copy(rig.body.position).applyQuaternion(view.body.quaternion).add(view.root.position);
      contactShadows.setActorPosition(view.person.id,actorShadowPosition.x,actorShadowPosition.z,view.body.rotation.y+rig.body.rotation.y);
      if(view.order)view.order.quaternion.copy(camera.quaternion);
    }
    const toCamera=camera.position.clone().sub(focus).normalize();
    for(const [id,view] of stationViews){view.progress.quaternion.copy(camera.quaternion);
      view.cooking?.update(delta,!!data.paused,reducedMotion);
      if(view.steam.userData.scrubbing)view.steam.visible=homePointer?.incidentId===id;
      if(view.steam.visible)view.steam.children.forEach((p,i)=>{if(view.steam.userData.scrubbing&&homePointer){const cloth=p.name==='cleaning-cloth',x=homePointer.x-view.root.position.x,z=homePointer.y-view.root.position.z;p.visible=cloth||now-lastHomeSample<150;p.position.set(x+(cloth?0:Math.sin(time*4+i*2)*.065),cloth?.056:.078+Math.sin(time*4+i)*.012,z+(cloth?0:Math.cos(time*4+i*2)*.065));p.rotation.y=cloth?-.22:0;if(!cloth)p.scale.setScalar(.65+Math.sin(time*5+i)*.2);}else{p.position.y=1.22+((time*.24+i*.15)%.43);p.scale.setScalar(.6+((time*.6+i*.3)%1));}});
      for(const child of view.model.children){if(typeof child.userData.openAngle==='number')child.rotation.z+=(child.userData.openAngle-child.rotation.z)*Math.min(1,delta*12);if(typeof child.userData.slideTarget==='number')child.position.x+=(child.userData.slideTarget-child.position.x)*Math.min(1,delta*10);}
      const staffDoor=view.model.getObjectByName('staff-door-leaf'),doorAssembly=view.model.getObjectByName('staff-door-assembly');
      if(staffDoor)staffDoor.rotation.y+=((staffDoor.userData.openYaw??0)-staffDoor.rotation.y)*Math.min(1,delta*12);
      if(doorAssembly)doorAssembly.scale.y=1;
    }
    staticRoot.traverse(object=>{if(!object.userData.wallNormal||!(object instanceof THREE.Mesh))return;const near=toCamera.dot(object.userData.wallNormal)>.12,m=object.material as THREE.MeshToonMaterial;m.transparent=true;const target=near?.16:1;m.opacity+=(target-m.opacity)*Math.min(1,delta*8);m.depthWrite=!near;object.castShadow=!near;});
    if(data.roomPlan){updateRoomShell(staticRoot,data,toCamera,delta);for(const object of data.objects){if(object.mount?.kind!=='wall')continue;const view=stationViews.get(object.id),wall=staticRoot.getObjectByName(`room-wall:${object.mount.targetId}`);if(view)view.root.visible=!wall?.userData.cutaway||wall.userData.cutaway.upper.scale.y>.8;}}
    if(process.env.NODE_ENV==='development'&&(data.domainRoomStudy||data.roomPlan?.appearance)){
      animateCollection(staticRoot,presentationTime,true,reducedMotion);
      staticRoot.traverse(object=>{if(typeof object.userData.dkRoomWallX==='number')object.visible=toCamera.x*object.userData.dkRoomWallX+toCamera.z*object.userData.dkRoomWallZ<.15;});
    }
    for(const object of data.objects){const view=stationViews.get(object.id);if(view)animateCollection(view.model,presentationTime,!!COLLECTION_SPOT_BY_ID[object.kind]||object.state==='working'||!!object.slots?.some(s=>s.state==='working'),reducedMotion);}
    if(editing&&data.placement?.object?.appearance)animateCollection(placementRoot,presentationTime,true,reducedMotion);
    renderer.render(scene,camera);
    if(callbacks.onAnchors&&now-anchorsAt>=100){
      anchorsAt=now;const visibleAnchors=data.objects.filter(object=>mode==='truck'||object.kind==='spill'||object.kind==='parcel').map(object=>{
        const view=stationViews.get(object.id),p=(view?.root.position.clone()??point3(object.x,object.y)).add(new THREE.Vector3(0,mode==='truck'?1.2:object.kind==='spill'?.18:.65,0)).project(camera);
        const x=(p.x+1)*width/2,y=(1-p.y)*height/2;
        return {id:object.id,x,y,visible:!editing&&p.z>=-1&&p.z<=1&&(mode==='truck'?x>=0&&x<=width&&y>=0&&y<=height:x>28&&x<width-28&&y>165&&y<height-135)};
      });
      const preview=placementRoot.getObjectByName('placement-object')??placementRoot.getObjectByName('placement-table');
      if(editing&&preview){const p=new THREE.Box3().setFromObject(preview).getCenter(new THREE.Vector3()).project(camera),x=(p.x+1)*width/2,y=(1-p.y)*height/2;visibleAnchors.push({id:'placement-preview',x,y,visible:p.z>=-1&&p.z<=1&&x>12&&x<width-12&&y>90&&y<height-125});}
      callbacks.onAnchors(visibleAnchors);
    }
    statsFrames++;if(now-statsAt>=2000){if((data.quality??'auto')==='auto'){const sample=qualitySample(quality,slowSamples,statsFrames*1000/(now-statsAt),width<=700);quality=sample.quality;slowSamples=sample.slowSamples;syncPresentation();}callbacks.onPerformance?.({fps:Math.round(statsFrames*1000/(now-statsAt)),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,width,height});statsAt=now;statsFrames=0;}
  }
  function dispose(){
    if(disposed)return;endHomeGesture();disposed=true;cancelAnimationFrame(frame);observer.disconnect();
    canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointermove',onMove);canvas.removeEventListener('pointerup',onUp);canvas.removeEventListener('pointercancel',onUp);canvas.removeEventListener('wheel',onWheel);canvas.removeEventListener('webglcontextlost',onContextLost);
    canvas.removeEventListener('pointerleave',clearHover);
    canvas.removeEventListener('lostpointercapture',onUp);document.removeEventListener('visibilitychange',onHidden);window.removeEventListener('blur',cancelPointerWork);
    canvas.removeEventListener('keydown',onKeyDown);canvas.removeEventListener('keyup',onKeyUp);
    discoveryEffects.dispose();
    for(const view of stationViews.values())view.cooking?.dispose();
    destination?.dispose();destination=null;contactShadows.dispose();disposeObject(scene);lighting.dispose();renderer.dispose();renderer.forceContextLoss();canvas.remove();
  }
  try{syncScene();resize();frame=requestAnimationFrame(animate);}catch(error){dispose();throw error;}
  return {setScene(next){const reviewChanged=process.env.NODE_ENV==='development'&&JSON.stringify(data.reviewCamera)!==JSON.stringify(next.reviewCamera);data=next;if(homePointer&&!data.objects.some(item=>item.id===homePointer!.incidentId))endHomeGesture();syncScene();if(reviewChanged)fitCamera();},setRotation(value){const desired=Math.round(value)*Math.PI/2;targetRotation=rotation+Math.atan2(Math.sin(desired-rotation),Math.cos(desired-rotation));},setEditing(value){editing=value;if(value)endHomeGesture();else clearHover();syncEdit();},zoomBy(factor){zoom=THREE.MathUtils.clamp(zoom*factor,.65,2.4);fitCamera();},resetCamera(){focus.copy(baseFocus);zoom=1;callbacks.onCameraDisplaced?.(false);fitCamera();},dispose};
}
