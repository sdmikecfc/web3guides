import * as T from 'three';
import {sideStageMedia} from './side-stage-media';

export const SIDE_STAGES=[
 {id:'spaceship',name:'Orbital Foundry',note:'A steel catwalk above an alien world'},
 {id:'colosseum',name:'The Last Gate',note:'A torchlit duelling terrace beneath the stands'},
 {id:'basement',name:'Boiler Room',note:'An illegal fight beneath the city'},
] as const;

/** Function-review scene, opt-in only. All dressing is outside the x-only fight lane.
 * No new assets, video, collision or simulation decisions. The old rooms remain intact.
 */
export function sideStage(scene:T.Scene,key:T.DirectionalLight,rim:T.DirectionalLight){
 const media=sideStageMedia(scene);let selection=0;
 const root=new T.Group();root.name='side-stage-layout-review';scene.add(root);
 const box=new T.BoxGeometry(1,1,1),cylinder=new T.CylinderGeometry(1,1,1,16),sphere=new T.SphereGeometry(1,32,20);
 const geometries=new Set<T.BufferGeometry>([box,cylinder,sphere]),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
 const moving:{node:T.Object3D;kind:'fan'|'flame'|'light';phase:number}[]=[];
 let current='spaceship',motion=false,time=0,frames=0;
 const previousBackground=scene.background,previousFog=scene.fog;
 function mat(color:string,metalness=0,emissive?:string){const m=new T.MeshStandardMaterial({color,roughness:metalness?.54:.9,metalness,envMapIntensity:.18,emissive:emissive??'#000000',emissiveIntensity:emissive?1.5:0});if(!emissive)m.color.multiplyScalar(.6);materials.add(m);return m;}
 function block(x:number,y:number,z:number,w:number,h:number,d:number,m:T.Material){const o=new T.Mesh(box,m);o.position.set(x,y,z);o.scale.set(w,h,d);o.receiveShadow=true;root.add(o);return o;}
 function tube(x:number,y:number,z:number,r:number,h:number,m:T.Material){const o=new T.Mesh(cylinder,m);o.position.set(x,y,z);o.scale.set(r,h,r);root.add(o);return o;}
 function ball(x:number,y:number,z:number,r:number,m:T.Material){const o=new T.Mesh(sphere,m);o.position.set(x,y,z);o.scale.setScalar(r);root.add(o);return o;}
 function ring(x:number,y:number,z:number,r:number,thick:number,m:T.Material,arc=Math.PI*2){const g=new T.TorusGeometry(r,thick,8,40,arc);geometries.add(g);const o=new T.Mesh(g,m);o.position.set(x,y,z);root.add(o);return o;}
 function floorTexture(stone:boolean){const c=document.createElement('canvas');c.width=c.height=512;const p=c.getContext('2d')!;p.fillStyle=stone?'#8c8475':'#737e83';p.fillRect(0,0,512,512);let s=721;const rand=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};for(let i=0;i<9000;i++){p.fillStyle=`rgba(${rand()>.5?'240,229,207':'21,28,31'},${rand()*.1})`;p.fillRect(rand()*512,rand()*512,rand()*4+1,rand()*3+1);}p.strokeStyle=stone?'#5e5b54':'#475258';p.lineWidth=stone?3:2;for(let row=0;row<4;row++){const y=row*128;p.beginPath();p.moveTo(0,y);p.lineTo(512,y);p.stroke();for(let col=0;col<4;col++){const x=col*128+(stone&&row%2?64:0);p.beginPath();p.moveTo(x,y);p.lineTo(x,y+128);p.stroke();if(!stone){p.fillStyle='#465259';p.fillRect(x+8,y+8,4,4);p.fillRect(x+116,y+116,4,4);}}}const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(3,1);textures.add(t);return t;}
 function torch(x:number,z:number,m:T.Material,glow:T.Material){tube(x,2,z,.16,1.7,m);tube(x,2.8,z,.44,.2,m);const flame=ball(x,3.16,z,.33,glow);flame.scale.y=.65;moving.push({node:flame,kind:'flame',phase:x});const light=new T.PointLight('#ff9f45',6,7,2);light.position.set(x,3.5,z+.3);root.add(light);moving.push({node:light,kind:'light',phase:x});}
 function clear(){root.clear();for(const g of geometries)if(g!==box&&g!==cylinder&&g!==sphere){g.dispose();geometries.delete(g);}materials.forEach(m=>m.dispose());materials.clear();textures.forEach(t=>t.dispose());textures.clear();moving.length=0;}
 async function choose(id:string){const token=++selection;clear();current=SIDE_STAGES.some(a=>a.id===id)?id:'spaceship';const stone=current==='colosseum',ship=current==='spaceship';
  scene.background=new T.Color(ship?'#101b2d':stone?'#292338':'#171f23');scene.fog=new T.Fog(scene.background,36,85);
  key.color.set(stone?'#ffe3c0':'#e3f4ff');key.intensity=2.8;rim.color.set(ship?'#79d9ee':stone?'#f4a85b':'#79c5b9');rim.intensity=1.9;
  const floor=mat(stone?'#c0b9a6':'#adb9bc',ship?.55:.15);floor.map=floorTexture(stone);
  const dark=mat(ship?'#273c4d':stone?'#45434a':'#344447',.45),trim=mat(stone?'#8a7859':'#53696f',.65),light=mat(ship?'#8be3f0':'#edb86b',.2,ship?'#4fc4db':'#d18432');
  // Shared support and physical end markers. Robot centres stop at +/-6.8;
  // weapons and bodies have 1.6 units of clearance before the end structures.
  block(0,-1.12,0,80,.25,70,dark);block(0,-.20,0,19,.38,5.5,floor);block(0,-.68,.2,19, .55,5.2,dark);
  block(0,-.32,2.8,19,.15,.12,trim);block(0,-.43,2.88,18.8,.055,.035,light);
  for(const side of [-1,1]){block(side*8.9,.75,0,.7,1.5,5.4,dark);block(side*8.5,.045,0,.09,.04,5.3,light);block(side*6.8,.012,1.7,.09,.025,1.6,light);for(const z of [-2.3,2.3]){block(side*8.9,2.7,z,.6,3.9,.55,trim);block(side*8.88,2.6,z+.29,.10,2.8,.025,light);}}
  if(ship){
   const hull=mat('#2b4053',.7),panel=mat('#223446',.55),planet=mat('#3d697d',.1,'#123540'),orange=mat('#d6985b',.35,'#996327');
   ball(4,11,-37,12,planet);ring(4,11,-36,12.5,.09,light);block(0,-3,-16,65,5,20,panel);
   // Framed observation opening: a true empty bay with exterior depth.
   for(const x of [-17,-9,9,17]){block(x,7,-8,1,15,1.2,hull);block(x,7,-7.35,.12,12,.08,light);const brace=block(x>0?x-1:x+1,12.5,-8,.5,4,1,hull);brace.rotation.z=x>0?-.6:.6;}
   block(0,14,-8,40,1.3,1.5,hull);block(0,1,-8,40,2,1.5,hull);block(0,2.08,-7.2,40,.09,.12,light);
   for(let x=-20;x<=20;x+=4){block(x,0,-5,3.85,.5,4,panel);block(x,1,-5.7,2.8,1.1,.3,hull);for(let j=0;j<4;j++)block(x-1+j*.6,1,-5.5,.22,.7,.05,trim);}
   for(const side of [-1,1]){block(side*12,3,-5,3.2,4,3,hull);ring(side*12,3,-3.45,1.15,.14,trim);const fan=new T.Group();fan.position.set(side*12,3,-3.3);root.add(fan);for(let n=0;n<5;n++){const blade=new T.Mesh(box,trim);blade.scale.set(.35,1,.08);blade.position.set(Math.sin(n*1.257)*.6,Math.cos(n*1.257)*.6,0);blade.rotation.z=-n*1.257+.4;fan.add(blade);}moving.push({node:fan,kind:'fan',phase:side});block(side*12,5.3,-3.4,1.6,.1,.1,orange);}
   // Sparse fixed stars, never simulated projectiles.
   const starMat=new T.MeshBasicMaterial({color:'#a5becf'});materials.add(starMat);for(let i=0;i<45;i++)ball(((i*31)%71)-35,4+((i*17)%23),-50-((i*7)%12),.035+(i%3)*.012,starMat);
  }else if(stone){
   const stoneMat=mat('#74675f'),pale=mat('#9b8b72'),recess=mat('#292932'),iron=mat('#282d32',.65),flame=mat('#ffc473',0,'#ff9b32'),cloth=mat('#632c35');
   block(0,3,-10,60,8,2,stoneMat);
   // Recessed closed gates. No false paths out of the one-dimensional lane.
   for(const x of [-14,0,14]){block(x,2.3,-8.95,5,4.6,.12,recess);ring(x,4.6,-8.75,2.5,.35,pale,Math.PI);for(const sx of [-1,1])block(x+sx*2.5,2.3,-8.75,.7,4.6,.6,pale);for(let j=-2;j<=2;j++)block(x+j*.78,2.3,-8.6,.10,4.6,.15,iron);block(x,2.5,-8.4,4.4,.1,.14,iron);}
   for(const x of [-23.5,-17,-10.5,-4,4,10.5,17,23.5]){block(x,4,-8.1,1.2,8.2,1.2,pale);block(x,7.9,-8.1,1.7,.4,1.7,pale);block(x,.2,-8.1,1.6,.5,1.7,pale);}
   block(0,8.6,-10,60,1,3,stoneMat);for(let row=0;row<4;row++){block(0,9+row*.65,-11-row*1.4,60,.5,1.5,pale);for(let j=0;j<34;j++){const x=-29+j*1.75+(row%2)*.7;ball(x,9.45+row*.65,-11-row*1.4,.23,iron);}}
   for(const x of [-7,7]){block(x,6.7,-7.3,.10,2.5,.1,iron);block(x,5.8,-7.25,1.5,2.9,.08,cloth);block(x,7.25,-7.2,1.75,.09,.09,trim);torch(x,-5,iron,flame);}
   // Terrace balustrade behind the fighters; foreground stays unobstructed.
   block(0,.45,-4.8,25,.9,.65,stoneMat);block(0,.96,-4.8,25,.13,.9,pale);
  }else{
   const wall=mat('#514d45'),brick=mat('#665b4d'),rust=mat('#75513b',.6),black=mat('#1a282d',.5),red=mat('#de754e',0,'#913519'),lamp=mat('#ffe4ab',0,'#ffb964');
   block(0,6,-9,64,15,1,wall);for(let row=0;row<13;row++)for(let col=0;col<22;col++){const x=-27+col*2.5+(row%2)*1.25;block(x,row*.72+.3,-8.44,2.36,.59,.08,row%3===0?wall:brick);}
   for(const x of [-15,15]){tube(x,3.4,-6,2,6.5,rust);tube(x,6.5,-6,2.15,.25,black);tube(x,.4,-6,2.15,.25,black);for(const y of [1.4,4.8])tube(x,y,-6,2.06,.17,trim);const pipe=tube(x*.66,7.5,-7,.23,13,trim);pipe.rotation.z=Math.PI/2;}
   for(const x of [-7,7]){block(x,6,-5.5,.16,5,.16,black);block(x,3.5,-5.5,2,.17,.6,black);block(x,3.39,-5.5,1.75,.045,.45,lamp);const l=new T.PointLight('#ffc779',7,10,2);l.position.set(x,3.2,-4.8);root.add(l);}
   // Closed service shutter behind the lane, recessed under its lintel.
   block(0,3,-8.3,7,6,.2,black);for(let y=.2;y<5.9;y+=.32)block(0,y,-8.1,6.7,.23,.1,trim);block(0,6.2,-8,7.6,.5,.6,black);
   for(const side of [-1,1]){block(side*5,1.6,-5,2.7,3.2,.24,black);for(let i=0;i<9;i++){const wire=block(side*5+(i-4)*.3,1.6,-4.84,.025,3.2,.02,trim);wire.rotation.z=.26;}block(side*5,3.3,-4.9,3,.12,.3,rust);block(side*8,5.2,-7.9,1.1,.32,.1,red);}
   for(let x=-8;x<=8;x+=2){const stripe=block(x,.012,2.35,.65,.018,.35,light);stripe.rotation.y=-.55;}
  }
  if(await media.choose(current)&&token===selection){
   // Keep the physical platform and its lane markers. Scenery belongs to the
   // plate; duplicate blockout pillars and the giant ground slab obscure it.
   for(const child of root.children)if(child.position.z<-3||child.position.y>.05||(child.scale.x>40&&child.position.y<0))child.visible=false;
  }
 }
 return{choose,fit(_aspect:number){},setMotion(on:boolean){motion=on;media.setMotion(on);},animate(t:number){time=t;frames++;for(const item of moving){const v=motion?t:0;if(item.kind==='fan')item.node.rotation.z=v*.32*item.phase;else if(item.kind==='flame'){item.node.scale.y=.65+(motion?Math.sin(v*6+item.phase)*.10:0);item.node.rotation.z=motion?Math.sin(v*4+item.phase)*.08:0;}else (item.node as T.PointLight).intensity=6+(motion?Math.sin(v*6+item.phase)*.6:0);}},get current(){return current;},inspect:()=>({arena:current,ambientTime:time,ambientMotion:motion,stageReview:true,...media.inspect()}),dispose(){selection++;media.dispose();clear();root.removeFromParent();box.dispose();cylinder.dispose();sphere.dispose();scene.background=previousBackground;scene.fog=previousFog;}};
}
