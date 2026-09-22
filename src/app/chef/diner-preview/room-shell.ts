import * as THREE from 'three';
import type { RoomPlan } from '../../../lib/chef/diner/room-plan';
import { roomZoneAt, ROOM_FIXTURES, roomModuleGeometry } from '../../../lib/chef/diner/room-plan';
import { RECIPE_BY_ID } from '../../../lib/chef/diner/content';
import { ROOM_PALETTES } from '../../../lib/chef/diner/collections';
import { homeSpatial,HOME_TERRACE_ELEVATION } from '../../../lib/chef/diner/home-spatial';
import { box,cylinder,material,PALETTE } from './models';
import type { DinerSceneData } from './scene-types';
import { createDiningFloorFinish,dressRoomWall } from './room-materials';

const CREAM='#fff1d8',RED='#b94f43',WOOD='#745038',TILE='#a6c9bb';
export const ROOM_FINISH_COLORS:Record<string,string>={rose:'#e5b9a9',sky:'#8caeb9',wood:'#c39468',oak:'#c39468',caramel:'#b88c55',buttercream:'#ebd29f',...Object.fromEntries(Object.values(ROOM_PALETTES).flat().map(palette=>[palette.id,palette.color]))};
export const roomColors=(data:Pick<DinerSceneData,'roomFinishes'>)=>({counter:ROOM_FINISH_COLORS[data.roomFinishes?.counter??'tomato']??RED,worktop:ROOM_FINISH_COLORS[data.roomFinishes?.worktop??'porcelain']??CREAM,upholstery:ROOM_FINISH_COLORS[data.roomFinishes?.upholstery??'cherry']??RED});
function lettering(lines:string[],width:number,height:number,background=RED,color=CREAM){
  const board=new THREE.Mesh<THREE.PlaneGeometry,THREE.Material>(new THREE.PlaneGeometry(width,height),material(background));
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=Math.round(1200*height/width);const ctx=canvas.getContext('2d');
    if(ctx){ctx.fillStyle=background;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;const row=canvas.height/(lines.length+1);lines.forEach((line,index)=>{ctx.font=`800 ${Math.round(Math.min(row*.58,130))}px "Baloo 2","Arial Rounded MT Bold",sans-serif`;ctx.fillText(line,600,row*(index+1),1100);});const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;board.material=new THREE.MeshBasicMaterial({map:texture});}
  }
  return board;
}
function menuBoard(ids:string[],width=3.3,height=1.18){
 const board=new THREE.Mesh<THREE.PlaneGeometry,THREE.Material>(new THREE.PlaneGeometry(width,height),material('#fff5df'));
 if(typeof document==='undefined')return board;
 const canvas=document.createElement('canvas');canvas.width=1320;canvas.height=472;const c=canvas.getContext('2d');if(!c)return board;
 c.fillStyle='#fff5df';c.fillRect(0,0,1320,472);c.strokeStyle=RED;c.lineWidth=15;c.strokeRect(14,14,1292,444);
 c.textAlign='left';c.textBaseline='middle';c.fillStyle=RED;c.font='900 50px "Baloo 2",sans-serif';c.fillText('THE HOUSE MENU',400,76);
 const names=ids.map(id=>RECIPE_BY_ID[id]?.name).filter(Boolean).slice(0,4);c.fillStyle=WOOD;names.forEach((name,i)=>{c.font=`800 ${names.length>2?39:51}px "Baloo 2",sans-serif`;c.fillText(name,405,160+i*(names.length>2?62:79),850);});
 c.fillStyle='#997654';c.font='700 24px sans-serif';c.fillText('COOKED FRESH  •  MADE WITH CARE',405,417);
 // Flat illustrated house burger, drawn on the menu paper itself.
 c.fillStyle='#f0d9b2';c.beginPath();c.ellipse(207,252,157,161,0,0,Math.PI*2);c.fill();
 const round=(x:number,y:number,w:number,h:number,r:number,color:string)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();};
 round(72,307,273,24,12,'#bc5546');round(91,291,235,34,17,'#c88942');round(90,257,237,38,18,'#62402b');
 c.fillStyle='#70a260';c.beginPath();c.moveTo(73,252);for(let i=0;i<9;i++)c.lineTo(75+i*33,245+(i%2)*14);c.lineTo(336,268);c.lineTo(76,267);c.closePath();c.fill();round(88,236,242,20,10,'#ce604a');
 c.fillStyle='#dfaa5d';c.beginPath();c.ellipse(208,229,124,104,0,Math.PI,Math.PI*2);c.closePath();c.fill();c.fillStyle='#fff1c7';for(const [x,y,r]of[[155,171,-.3],[205,154,.3],[260,180,-.4],[210,202,.4],[116,203,.2]]){c.save();c.translate(x,y);c.rotate(r);c.beginPath();c.ellipse(0,0,9,4,0,0,Math.PI*2);c.fill();c.restore();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;board.material=new THREE.MeshBasicMaterial({map:texture});return board;
}
function shopWindow(width:number,height:number,frameColor=RED){
 const group=new THREE.Group();group.add(box(width+.18,height+.18,.10,WOOD,0,0,0,.04),box(width+.11,height+.11,.12,CREAM,0,0,.016,.025),box(width,height,.018,'#abd2cf',0,0,.085,.018));
 for(const x of [-width/2,width/2])group.add(box(.07,height+.05,.08,frameColor,x,0,.104,.014));for(const y of [-height/2,height/2])group.add(box(width+.08,.07,.08,frameColor,0,y,.104,.014));
 group.add(box(.060,height,.073,CREAM,0,0,.117,.010),box(width,.050,.06,CREAM,0,-.05,.115,.010),box(width+.27,.105,.32,WOOD,0,-height/2-.065,.14,.025));
 const gleam=box(width*.30,.034,.007,'#deeee0',width*.24,height*.25,.098,.006);gleam.rotation.z=.70;gleam.material=new THREE.MeshStandardMaterial({color:'#deeee0',roughness:.3,transparent:true,opacity:.45,depthWrite:false});gleam.userData.inputPassthrough=true;group.add(gleam);
 return group;
}
/** Structural walls are cut into a permanent low plinth and a retractable upper
 * section. Their logical boundary always comes from the same navigation edge. */
function partition(length:number,height:number,color:string,normal:THREE.Vector3,low=.63){
  const root=new THREE.Group(),upper=new THREE.Group();root.add(box(length,low,.10,color,0,low/2,0,.012));upper.position.y=low;
  upper.add(box(length,height-low,.10,CREAM,0,(height-low)/2,0,.012));root.add(upper);
  const cap=box(length+.025,.065,.145,WOOD,0,height+.015,0,.014);root.add(cap);
  root.add(box(length,.055,.132,WOOD,0,.12,0,.010));root.userData.cutaway={upper,cap,normal,height,low};return root;
}
export function createRoomShell(plan:RoomPlan,data:Pick<DinerSceneData,'sign'|'menu'|'floor'|'wall'|'roomFinishes'>){
  const root=new THREE.Group();root.name=`restaurant-shell:${plan.stage}`;const colors=roomColors(data),wallColor=data.wall==='deco'?'#e9e4d5':data.wall==='diner_panel'?'#d7c3a1':ROOM_FINISH_COLORS[data.wall??'cream']??CREAM;
  // The front apron is real supported pavement, not an oversized doorway prop.
  const space=homeSpatial(plan.w,plan.h),depth=plan.h+space.terrace.h;
  root.add(box(plan.w+.28,.21,depth+.28,'#c2b7a2',(plan.w-1)/2,-.10,(depth-1)/2,.065));
  const cells:Array<{x:number;y:number;h:number;color:string}>=[];
  for(let y=0;y<plan.h;y++)for(let x=0;x<plan.w;x++){
    const zone=roomZoneAt(plan,{x,y})?.kind,checker=(x+y)%2;
    const color=zone==='bathroom'?(checker?'#d8e7da':'#bfdbce'):zone==='kitchen'?(checker?'#efe7d5':'#e4ddc9'):data.floor==='terracotta'?(checker?'#cc9274':'#dfae8b'):data.floor==='cream'?'#f2e5ce':checker?'#efe4d0':'#ded1b5';cells.push({x,y,h:.095,color});
  }
  for(let y=plan.h;y<depth;y++)for(let x=0;x<plan.w;x++)cells.push({x,y,h:HOME_TERRACE_ELEVATION,color:x===space.door.x||x===space.door.x-1?'#e5ddcc':(Math.floor(x/2)+y)%2?'#c8cbbf':'#d5d6ca'});
  const tiles=new THREE.InstancedMesh(new THREE.BoxGeometry(.99,.06,.99),new THREE.MeshStandardMaterial({color:'#fff',roughness:.82}),cells.length),matrix=new THREE.Matrix4();tiles.name='room-supported-floor';tiles.userData.tiles=cells;tiles.receiveShadow=true;cells.forEach((cell,i)=>{matrix.makeTranslation(cell.x,cell.h-.03,cell.y);tiles.setMatrixAt(i,matrix);tiles.setColorAt(i,new THREE.Color(cell.color));});root.add(tiles);
  root.add(createDiningFloorFinish(plan,data.floor));
  root.add(box(plan.w+.25,.11,.12,'#aea994',(plan.w-1)/2,.01,depth-.40,.022));
  const back=partition(plan.w+.12,2.78,colors.counter,new THREE.Vector3(0,0,-1),.85);back.name='room-wall:outer-back';back.position.set((plan.w-1)/2,.095,-.55);root.add(back);
  const side=partition(plan.h+.12,2.40,colors.counter,new THREE.Vector3(-1,0,0),.85);side.name='room-wall:outer-side';side.rotation.y=Math.PI/2;side.position.set(-.55,.095,(plan.h-1)/2);root.add(side);
  // Broad plaster and orderly dado rails replace the tiny decorative wall clutter.
  for(const panel of [back,side]){const u=panel.userData.cutaway.upper as THREE.Group;for(const child of u.children)if(child instanceof THREE.Mesh)child.material=material(wallColor);}
  dressRoomWall(back,plan.w+.12,data.wall);dressRoomWall(side,plan.h+.12,data.wall);
  for(const edge of plan.edges){
    const x=(edge.a.x+edge.b.x)/2,y=(edge.a.y+edge.b.y)/2,dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y;
    if(edge.kind==='staff_gate'||edge.kind==='hatch')continue;
    const bathroom=roomZoneAt(plan,edge.a)?.kind==='bathroom'||roomZoneAt(plan,edge.b)?.kind==='bathroom';
    const color=bathroom?TILE:colors.counter,height=bathroom?1.92:plan.stage==='burger_shop'?1.11:2.50;
    if(edge.kind==='door'){
      const door=new THREE.Group();door.name=`room-door:${edge.id}`;door.position.set(x,.095,y);door.rotation.y=dx?Math.PI/2:0;
      const entrance=(roomZoneAt(plan,edge.a)?.kind==='bathroom')!==(roomZoneAt(plan,edge.b)?.kind==='bathroom');
      const aperture=bathroom?1.91:2.35;
      for(const px of [-.45,.45])door.add(box(.09,aperture,.115,WOOD,px,aperture/2,0,.015));door.add(box(.98,.10,.13,WOOD,0,aperture+.02,0,.018));
      const hinge=new THREE.Group();hinge.name='room-door-hinge';hinge.position.set(-.40,.12,0);hinge.add(box(.80,1.55,.06,bathroom?TILE:CREAM,.40,.775,0,.025),box(.027,.11,.024,WOOD,.72,.86,-.047,.009));
      if(entrance){
        door.userData.bathroomEntrance=true;
        door.add(box(.78,.025,.32,CREAM,0,.012,0,.01));
        // Keep the real doorway readable when its neighbouring walls cut away.
        const plaque=lettering(['WC'],.40,.23,CREAM,WOOD);plaque.name='bathroom-entry-sign';plaque.position.set(.40,1.26,.038);hinge.add(plaque);
        const reverse=plaque.clone();reverse.rotation.y=Math.PI;reverse.position.z=-.038;hinge.add(reverse);
        hinge.add(box(.25,.045,.025,PALETTE.metal,.60,.91,.049,.006));
      }
      door.add(hinge);door.userData.doorEdge=edge;door.userData.doorNormal=new THREE.Vector3(dx,0,dy);door.userData.pick={id:`edge:${edge.id}`};root.add(door);
    }else{
      const backedByBar=plan.modules.some(module=>module.kind==='chef_bar'&&roomModuleGeometry(module).cells.some(cell=>cell.x===edge.a.x&&cell.y===edge.a.y));
      const panel=partition(1.01,height,color,new THREE.Vector3(dx,0,dy),backedByBar?1.11:Math.min(.63,height));
      if(backedByBar){const base=panel.children[0];base.visible=false;panel.userData.cutaway.cap.material=material(colors.worktop);}
      if(!bathroom&&plan.stage==='burger_shop')panel.userData.cutaway.cap.material=material(colors.worktop);
      panel.position.set(x,.095,y);panel.rotation.y=dx?Math.PI/2:0;panel.name=`room-wall:${edge.id}`;panel.userData.pick={id:`edge:${edge.id}`};root.add(panel);
    }
  }
  // Keep the actual menu over the kitchen, with the name above the bathroom wing.
  const kitchen=plan.zones.find(zone=>zone.kind==='kitchen'),cx=(kitchen?.w??5)/2-.5;
  const signColor=ROOM_FINISH_COLORS[data.roomFinishes?.sign??'cream']??CREAM;
  const bathroom=plan.zones.find(zone=>zone.kind==='bathroom'),signX=bathroom?bathroom.x+(bathroom.w-1)/2:plan.w-2,signWidth=Math.min(4.4,(bathroom?.w??3)-.25);
  const frame=box(signWidth+.16,.85,.11,WOOD,signX,2.18,-.485,.035);frame.name='restaurant-name-frame';frame.userData.wallOwner=back;root.add(frame);
  const brand=lettering([data.sign??'My little diner'],signWidth,.65,signColor,data.roomFinishes?.sign==='coral'||data.roomFinishes?.sign==='sage'?CREAM:RED);brand.name='restaurant-name-sign';brand.position.set(signX,2.19,-.420);brand.userData.wallOwner=back;root.add(brand);
  const menu=menuBoard(data.menu??['classic_burger']);menu.position.set(cx,1.56,-.476);menu.userData.pick={id:'home-binder'};menu.userData.wallOwner=back;root.add(menu);
  for(const trim of [box(3.38,.09,.15,WOOD,cx,2.79,-.49,.026),box(3.43,.06,.10,WOOD,cx,.94,-.49,.016)]){trim.userData.wallOwner=back;root.add(trim);}
  // Real framed shop windows give the cutaway restaurant a recognisable frontage.
  for(const y of [Math.max(2.25,plan.h-5.35),plan.h-2.25]){const window=shopWindow(2.02,1.03,data.wall==='deco'?'#a98d58':data.wall==='diner_panel'?'#795232':RED);window.rotation.y=Math.PI/2;window.position.set(-.476,1.58,y);window.userData.wallOwner=side;root.add(window);}
  // A wall console touches this low perimeter dado; the public aisle stays clear.
  root.add(box(.13,1.03,plan.h-3.8,colors.counter,plan.w-.49,.095+1.03/2,(plan.h+3)/2,.025),box(.18,.065,plan.h-3.7,WOOD,plan.w-.49,1.145,(plan.h+3)/2,.016));
  // A glazed shop front is suggested by its jambs, striped canopy and entrance mat.
  const doorX=Math.floor(plan.w/2),front=plan.h-.46;
  for(const x of [doorX-.70,doorX+.70])root.add(box(.14,2.05,.15,colors.counter,x,1.12,front,.027));
  root.add(box(1.58,.15,.18,colors.counter,doorX,2.16,front,.025),box(1.02,.018,.52,'#886341',doorX,.10,plan.h-.77,.03));
  for(let i=0;i<8;i++){const panel=box(.224,.065,.60,i%2?CREAM:colors.counter,doorX-.785+i*.224,2.20,front+.26,.020);panel.rotation.x=.12;root.add(panel,box(.219,.15,.065,i%2?CREAM:colors.counter,doorX-.785+i*.224,2.11,front+.55,.033));}
  root.add(box(plan.w+.12,.11,.65,'#d7ccba',(plan.w-1)/2,.035,plan.h-.10,.025));
  for(const [x,length]of [[(doorX-1.6)/2,Math.max(.2,doorX-.8)],[(doorX+.8+plan.w-.5)/2,Math.max(.2,plan.w-doorX-1.3)]]){const frontage=partition(length,.70,colors.counter,new THREE.Vector3(0,0,1),.24);frontage.position.set(x,.095,front);const upper=frontage.userData.cutaway.upper as THREE.Group;for(const part of upper.children)if(part instanceof THREE.Mesh)part.material=material(colors.counter);root.add(frontage);}
  for(const x of [-.52,plan.w-.48])root.add(box(.12,.16,plan.h+.08,colors.counter,x,.19,(plan.h-1)/2,.018));
  // Thin in-room floor lines are an editor aid only.
  const positions:number[]=[];for(let x=0;x<=plan.w;x++)positions.push(x-.5,.101,-.5,x-.5,.101,plan.h-.5);for(let y=0;y<=plan.h;y++)positions.push(-.5,.101,y-.5,plan.w-.5,.101,y-.5);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const grid=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#644c35',transparent:true,opacity:.28}));grid.userData.editorGrid=true;grid.visible=false;grid.raycast=()=>{};root.add(grid);
  return root;
}

export function updateRoomShell(root:THREE.Object3D,data:DinerSceneData,toCamera:THREE.Vector3,dt:number){
  root.traverse(object=>{
    if(object.userData.wallOwner)object.visible=object.userData.wallOwner.userData.cutaway.upper.scale.y>.80;
    const cut=object.userData.cutaway;if(cut){const near=toCamera.dot(cut.normal)>.05,target=near?0:1;cut.upper.scale.y+=(target-cut.upper.scale.y)*Math.min(1,dt*12);cut.upper.visible=cut.upper.scale.y>.015;cut.cap.position.y=cut.low+(cut.height-cut.low)*cut.upper.scale.y+.015;}
    const edge=object.userData.doorEdge;if(edge){object.scale.y=1;const hinge=object.getObjectByName('room-door-hinge');if(hinge){const moving=data.people.some(person=>person.pose==='walk'&&Math.hypot(person.x-(edge.a.x+edge.b.x)/2,person.y-(edge.a.y+edge.b.y)/2)<.85);hinge.rotation.y+=((moving?-1.40:0)-hinge.rotation.y)*Math.min(1,dt*10);}}
  });
}
