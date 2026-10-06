import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type {RouteEnvironment} from '@/lib/chef/diner/routes';
import type {RenderQuality} from './presentation';
import type {DomainId} from '@/lib/chef/diner/domain-worlds';
import {buildSeasonalLandscape} from './seasonal-landscapes';

export const SCENERY_BUDGETS={low:{draws:25,triangles:40000},medium:{draws:45,triangles:90000},high:{draws:70,triangles:180000}} as const;
export interface DestinationController {root:T.Group;update:(delta:number,camera:T.Camera,reduced?:boolean,paused?:boolean)=>void;setQuality:(quality:RenderQuality)=>void;dispose:()=>void;stats:()=>{draws:number;triangles:number;event:string|null;time:number}}
type Motion={root:T.Group;step:(t:number)=>void;prominent?:boolean};
const C={cream:'#f4e8c9',red:'#bc5b49',jade:'#326c64',copper:'#b78155',stone:'#c5c4b4',leaf:'#71986d',sand:'#e6cda0',water:'#73b9bc',deep:'#589ba9',foam:'#d5ebdf',dark:'#354b4c'};
// This private hash never reads or consumes service randomness.
function hash(text:string){let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;}
export function createRouteEnvironment(environment:RouteEnvironment,width:number,height:number,domain?:DomainId):DestinationController{
 const root=new T.Group();root.name=`destination-${environment}`;root.userData.inputPassthrough=true;
 let quality:RenderQuality='medium',time=0,disposed=false,eventName:string|null=null;let motions:Motion[]=[],fadeMeshes:T.Mesh[]=[];
 const center=new T.Vector3((width-1)/2,0,(height-1)/2),offset=(hash(environment)%19),back=-3.5;
 const paint=new T.MeshStandardMaterial({vertexColors:true,roughness:.79});
 function mesh(g:T.BufferGeometry,color:string,x:number,y:number,z:number,parent:T.Group){
  const rgb=new T.Color(color),values=new Float32Array(g.attributes.position.count*3);for(let i=0;i<values.length;i+=3){values[i]=rgb.r;values[i+1]=rgb.g;values[i+2]=rgb.b;}g.setAttribute('color',new T.BufferAttribute(values,3));const m=new T.Mesh(g,paint);m.position.set(x,y,z);parent.add(m);return m;
 }
 function box(p:T.Group,w:number,h:number,d:number,color:string,x=0,y=h/2,z=0){return mesh(new T.BoxGeometry(w,h,d),color,x,y,z,p);}
 function softBox(p:T.Group,w:number,h:number,d:number,color:string,x=0,y=h/2,z=0){return mesh(new RoundedBoxGeometry(w,h,d,1,Math.min(.07,w/5,h/5,d/5)),color,x,y,z,p);}
 function ball(p:T.Group,x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string){const m=mesh(new T.SphereGeometry(1,quality==='low'?8:12,quality==='low'?6:8),color,x,y,z,p);m.scale.set(sx,sy,sz);return m;}
 function cyl(p:T.Group,x:number,y:number,z:number,r:number,h:number,color:string,top=r,sides=12){return mesh(new T.CylinderGeometry(top,r,h,sides),color,x,y,z,p);}
 function tube(p:T.Group,points:T.Vector3[],r:number,color:string){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),16,r,5,false),color,0,0,0,p);}
 function group(){const g=new T.Group();root.add(g);return g;}
 function join(g:T.Group,fade=false){
  g.updateMatrixWorld(true);const parts:T.BufferGeometry[]=[];const remove:T.Object3D[]=[];
  for(const child of g.children)if(child instanceof T.Mesh&&!child.userData.keepSeparate){child.updateMatrix();const geometry=(child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone()).applyMatrix4(child.matrix);parts.push(geometry);child.geometry.dispose();remove.push(child);}
  g.remove(...remove);if(!parts.length)return;
  const geometry=mergeGeometries(parts);parts.forEach(v=>v.dispose());if(!geometry)throw Error('Incompatible scenery geometry');
  const material=fade?paint.clone():paint,m=new T.Mesh(geometry,material);m.receiveShadow=true;m.castShadow=fade;g.add(m);if(fade){m.userData.fadeSector=true;fadeMeshes.push(m);}return m;
 }
 function clear(){root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();if(o.material!==paint){(o.material as T.MeshStandardMaterial).map?.dispose();(o.material as T.Material).dispose();}}});root.clear();motions=[];fadeMeshes=[];}
 function tree(g:T.Group,x:number,z:number,s=1,palm=false){
  cyl(g,x,.75*s,z,.065*s,1.5*s,C.copper);if(palm){for(let i=0;i<6;i++){const a=i*Math.PI/3,m=ball(g,x+Math.cos(a)*.34*s,1.5*s,z+Math.sin(a)*.34*s,.49*s,.055*s,.14*s,C.jade);m.rotation.y=-a;}}
  else{ball(g,x,1.65*s,z,.48*s,.61*s,.45*s,C.leaf);ball(g,x+.25*s,1.58*s,z+.10*s,.30*s,.35*s,.35*s,'#8aa575');}
 }
 function umbrella(g:T.Group,x:number,z:number,color:string){cyl(g,x,.63,z,.025,1.35,C.copper);const cap=mesh(new T.ConeGeometry(.73,.30,12),color,x,1.4,z,g);cap.rotation.y=.16;for(let i=0;i<6;i++){const a=i*Math.PI/3,t=box(g,.035,.026,.70,C.cream,x+Math.sin(a)*.33,1.34,z+Math.cos(a)*.33);t.rotation.y=a;}box(g,.52,.025,.9,C.cream,x,.025,z+.3);}
 function cafeTable(g:T.Group,x:number,z:number){cyl(g,x,.68,z,.36,.065,C.cream);cyl(g,x,.32,z,.035,.64,C.copper);cyl(g,x,.04,z,.22,.04,C.dark);for(const side of [-1,1]){softBox(g,.34,.07,.34,C.jade,x+side*.54,.39,z);for(const dx of [-.12,.12])box(g,.03,.38,.03,C.copper,x+side*.54+dx,.18,z);softBox(g,.035,.35,.32,C.jade,x+side*.7,.56,z);}cyl(g,x,.77,z,.055,.13,C.red);}
 function planting(g:T.Group,x:number,z:number){for(let i=0;i<5;i++){const a=i*2.4;const blade=ball(g,x+Math.sin(a)*.09,.09,z+Math.cos(a)*.09,.035,.20,.035,i%2?C.jade:C.leaf);blade.rotation.z=Math.sin(a)*.45;}}
 function bench(g:T.Group,x:number,z:number,color=C.copper){for(let n=0;n<4;n++)box(g,1.25,.055,.085,color,x,.40,z-.16+n*.11);for(const side of [-1,1]){box(g,.065,.42,.36,C.dark,x+side*.47,.19,z);box(g,.065,.35,.065,C.dark,x+side*.47,.60,z-.20);}for(let n=0;n<2;n++)box(g,1.25,.12,.055,color,x,.61+n*.15,z-.20);}
 function paving(g:T.Group,x:number,z:number,w:number,d:number,night=false){for(let row=0;row<d;row++)for(let col=0;col<w;col++){const tone=(row*13+col*7)%5;box(g,.96,.016,.46,(night?['#536363','#5e6c69','#64726c','#526566','#697771']:['#c4c4b5','#d1cfbd','#bcbfac','#ded6c2','#c8cbb9'])[tone],x-w/2+col+(row%2)*.3,-.063,z-d/4+row*.5);}}
 function canopy(g:T.Group,x:number,z:number,color:string){
  for(const dx of [-1,1])for(const dz of [-.75,.75])cyl(g,x+dx,.82,z+dz,.025,1.8,C.copper);
  const roof=mesh(new T.ConeGeometry(1.6,.6,4),color,x,1.85,z,g);roof.rotation.y=Math.PI/4;roof.scale.z=.82;
  for(let i=0;i<8;i++){const flap=box(g,.25,.17,.05,i%2?C.cream:color,x-.88+i*.25,1.47,z+.82);flap.rotation.z=Math.sin(i)*.025;}
  box(g,2.05,.09,1.60,color,x,1.52,z);box(g,1.95,.67,.05,C.cream,x,.98,z-.75);softBox(g,1.82,.47,.60,C.copper,x,.23,z+.12);box(g,1.94,.075,.66,C.cream,x,.5,z+.12);
  for(let i=0;i<5;i++)cyl(g,x-.6+i*.30,.60,z+.20,.095,.1,i%2?C.red:C.jade);
 }
 function bearMarketSign(g:T.Group){
  const letters:Record<string,string[]>={B:['110','101','110','101','110'],E:['111','100','110','100','111'],A:['010','101','111','101','101'],R:['110','101','110','101','101'],M:['101','111','111','101','101'],K:['101','101','110','101','101'],T:['111','010','010','010','010']};
  softBox(g,1.3,.27,.06,C.cream,-3,.30,.22);for(const [i,c] of [...'BEAR MARKET'].entries())for(const [y,row] of (letters[c]??[]).entries())for(const [x,pixel] of [...row].entries())if(pixel==='1')box(g,.019,.026,.007,C.dark,-3.59+i*.112+x*.025,.36-y*.033,.258);
 }
 function person(g:T.Group,x:number,z:number,color:string,scale=.75){
  cyl(g,x,.36*scale,z,.115*scale,.36*scale,color,.10*scale);ball(g,x,.65*scale,z,.115*scale,.13*scale,.11*scale,'#cf9a76');ball(g,x,.72*scale,z-.014*scale,.119*scale,.073*scale,.106*scale,C.dark);
  for(const side of [-1,1])ball(g,x+side*.045*scale,.66*scale,z+.1*scale,.012*scale,.013*scale,.01*scale,C.dark);
  for(const side of [-1,1]){box(g,.05*scale,.20*scale,.065*scale,C.dark,x+side*.06*scale,.10*scale,z);box(g,.055*scale,.25*scale,.055*scale,color,x+side*.14*scale,.37*scale,z);}
 }
 function dog(color:string,s=.65){
  const g=group();ball(g,0,.30*s,0,.34*s,.16*s,.13*s,color);ball(g,.29*s,.44*s,0,.14*s,.15*s,.12*s,color);ball(g,.41*s,.40*s,0,.10*s,.07*s,.07*s,C.cream);ball(g,.49*s,.42*s,0,.032*s,.032*s,.035*s,C.dark);
  for(const z of [-.11,.11]){ball(g,.26*s,.52*s,z*s,.07*s,.12*s,.026*s,C.copper);ball(g,.32*s,.47*s,z*s,.018*s,.018*s,.018*s,C.dark);}
  const legs:T.Group[]=[];
  for(const x of [-.2,.2])for(const z of [-.07,.07]){const limb=new T.Group();g.add(limb);limb.position.set(x*s,.24*s,z*s);softBox(limb,.062*s,.23*s,.062*s,color,0,-.115*s,0);join(limb);legs.push(limb);}
  tube(g,[new T.Vector3(-.27*s,.34*s,0),new T.Vector3(-.43*s,.42*s,0),new T.Vector3(-.47*s,.53*s,0)],.032*s,color);join(g);return {root:g,stride:(distance:number)=>legs.forEach((leg,i)=>{leg.rotation.z=Math.sin(distance*13+(i===0||i===3?0:Math.PI))*.5;})};
 }
 // Five merged parts per actor: feet step with distance and planted dances stay put.
 function actor(color:string,scale=.95){
  const g=group(),body=new T.Group();g.add(body);g.scale.setScalar(scale);
  cyl(body,0,.44,0,.12,.30,color,.105);ball(body,0,.72,0,.135,.145,.125,'#cf9a76');ball(body,0,.81,-.012,.14,.07,.125,C.dark);
  for(const side of [-1,1])ball(body,side*.05,.735,.116,.013,.014,.011,C.dark);join(body);
  const limbs:T.Group[]=[];
  for(let i=0;i<4;i++){const limb=new T.Group(),leg=i<2,side=i%2?1:-1;limb.position.set(side*(leg?.067:.16),leg?.29:.53,0);g.add(limb);box(limb,leg?.074:.058,leg?.27:.25,.07,leg?C.dark:color,0,leg?-.135:-.125,0);if(leg)softBox(limb,.09,.055,.15,C.cream,0,-.27,.034);else ball(limb,0,-.26,0,.033,.042,.036,'#cf9a76');join(limb);limbs.push(limb);}
  return {root:g,step:(distance:number,dance=false)=>{const phase=distance*9;for(let i=0;i<4;i++)limbs[i].rotation.x=Math.sin(phase+(i%2?Math.PI:0))*(dance?(i<2?.055:.32):.42);body.rotation.z=dance?Math.sin(phase*.35)*.065:0;if(dance)for(let i=2;i<4;i++)limbs[i].rotation.z=(i%2?1:-1)*(.32+Math.sin(phase*.45)*.13);}};
 }
 function commuter(color:string,start:number,z:number,speed=.6){const a=actor(color),g=a.root;motions.push({root:g,step:t=>{g.position.set((t*speed+start)%(width+15)-6,.015,z);g.rotation.y=Math.PI/2;a.step(t*speed+start);}});return g;}
 function special(g:T.Group,name:string,step:(phase:number)=>void,number=0){
  g.visible=false;motions.push({root:g,prominent:true,step:t=>{const cycle=Math.floor((t+offset)/112),phase=(t+offset)%112;g.visible=phase>=12&&phase<24&&cycle% (environment==='boardwalk'?4:1)===number;if(g.visible){eventName=name;step((phase-12)/12);}}});
 }
 function build(){
  clear();const ground=group(),buildings=group(),glow=group(),detail=quality==='low'?1:quality==='medium'?2:3;
  if(domain==='smoothie'||domain==='wines'){
   buildSeasonalLandscape({domain,width,height,quality,root,group,box,softBox,ball,cyl,tube,mesh,join,tree,cafeTable,bench,actor,addMotion:motion=>motions.push(motion)});
  }else if(domain){
   const accent='#b82424',wood='#a47c50';
   // All scenery sits behind the truck or beyond its two playable side edges.
   paving(ground,center.x,-3,width+20,6);box(ground,width+32,.12,22,'#525453',center.x,-.22,-11);
   box(ground,width+18,.16,1.2,'#77655f',center.x,-.06,-2);
   function sign(p:T.Group,label:string,x:number,y:number,z:number,color:string){
    softBox(p,2.50,.65,.16,color,x,y,z);
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=144;const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.fillStyle=color;ctx.fillRect(0,0,512,144);ctx.fillStyle='#fff1ca';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 44px sans-serif';ctx.fillText(label,256,74,478);
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;const material=new T.MeshStandardMaterial({map:tex,roughness:.9}),m=new T.Mesh(new T.PlaneGeometry(2.48,.63),material);m.position.set(x,y,z+.09);p.add(m);m.userData.keepSeparate=true;
   }
   for(let i=0;i<detail+3;i++){
    const x=-5+i*4.05,z=-5.0,wall=['#ac342a','#443c38','#d37a49'][i%3];
    softBox(buildings,3.8,3.4,2.1,wall,x,1.70,z);
    box(buildings,3.95,.15,2.28,wood,x,3.45,z);
    for(const dx of [-1.22,0,1.22]){softBox(buildings,.8,1.1,.08,'#2a3734',x+dx,2.48,z+1.10);box(buildings,.9,.065,.15,'#ecd4a9',x+dx,1.90,z+1.14);box(buildings,.03,1.05,.025,'#e4c296',x+dx,2.48,z+1.16);}
    box(buildings,3.8,.18,.55,wood,x,1.52,z+1.2);softBox(buildings,3.1,.70,.73,accent,x,.35,z+1.48);box(buildings,3.3,.09,.86,'#eee1be',x,.74,z+1.5);
     for(let k=0;k<9;k++){const tile=cyl(buildings,x-1.76+k*.44,3.62,z,.11,2.36,'#373c37',.11,8);tile.rotation.x=Math.PI/2;}
     for(let k=0;k<5;k++){const jar=cyl(buildings,x-1.15+k*.54,.93,z+1.5,.15,.30,k%2?'#644a36':'#b93a24',.13,12);cyl(buildings,x-1.15+k*.54,1.10,z+1.5,.17,.045,'#342d29');}
     sign(buildings,['RAMYEON CLUB','FIREANT KITCHEN','MANDU HOUSE','SPICE STREET'][i%4],x,1.33,z+1.94,'#922b26');
   }
   for(const x of [-4,width+3]){
    planting(buildings,x,-1.8);bench(buildings,x,-1.4,accent);
   }
    for(let k=0;k<detail+5;k++){const lantern=group();cyl(lantern,0,0,0,.15,.36,k%2?'#c43a25':'#f1b94e',.15);cyl(lantern,0,-.23,0,.018,.14,'#ddaa53');join(lantern);lantern.position.set(-5+k*(width+10)/(detail+4),2.8,-2.8);motions.push({root:lantern,step:t=>lantern.rotation.z=Math.sin(t*.6+k)*.035});}
    const ant=group();for(const [y,r] of [[.30,.23],[.65,.20],[1.0,.30]])ball(ant,0,y,0,r,r,r,'#d95131');for(const dx of [-.13,.13]){ball(ant,dx,1.05,.25,.082,.11,.035,'#fff1d5');ball(ant,dx,1.05,.283,.034,.05,.022,C.dark);tube(ant,[new T.Vector3(dx,1.20,0),new T.Vector3(dx*1.5,1.43,.05),new T.Vector3(dx*1.8,1.45,.08)],.018,C.dark);}box(ant,.29,.32,.05,'#f4dfb2',0,.65,.17);for(const dx of [-.21,.21]){box(ant,.11,.24,.14,C.dark,dx,.12,.03);box(ant,.09,.28,.10,'#d95131',dx,.63,.03);}cyl(ant,0,1.32,0,.22,.10,'#f6e7cb');join(ant);ant.position.set(width+3,0,-1.8);
   for(let i=0;i<detail;i++)commuter([accent,'#b7ac77','#5b8175'][i%3],i*4,-2.8,.55);
   for(let i=0;i<detail+1;i++){const x=i%2?width+3.5:-4.5,z=-.3-i*.8;umbrella(buildings,x,z,'#ae4332');cyl(buildings,x,.53,z,.46,.07,'#e5d7b4');cyl(buildings,x,.25,z,.07,.48,wood);}
  }else if(environment==='boardwalk'){
   box(ground,width+32,.12,10,C.sand,center.x,-.23,-.5);box(ground,width+26,.10,5.1,C.stone,center.x,-.12,-.8);
   paving(ground,center.x,-1.6,width+20,8);
   box(ground,width+26,.08,.24,C.cream,center.x,-.02,-3.28);
   for(let x=-8;x<width+10;x+=3){cyl(ground,x,.39,-3.2,.045,.82,C.copper);tube(ground,[new T.Vector3(x,.63,-3.2),new T.Vector3(x+1.5,.54,-3.2),new T.Vector3(x+3,.63,-3.2)],.015,C.cream);}
   for(let i=0;i<detail+2;i++)umbrella(buildings,-5+i*3.9,-4.2-(i%2)*.5,[C.red,C.jade,'#d9af5e'][i%3]);
   for(let i=0;i<detail+3;i++){const x=-5+i*3.1;softBox(buildings,.44,.05,.76,i%2?C.red:C.jade,x,.035,-4.3);softBox(buildings,.44,.42,.06,C.cream,x,.22,-4.64);for(let k=0;k<4;k++)ball(ground,x+k*.19,-.12,-5.18,.035,.016,.028,C.cream);planting(buildings,x+1,-3.8);}
   for(const x of [-3.5,width+5]){tree(buildings,x,-2.3,.82,true);bench(buildings,x,-.8,C.jade);for(let k=0;k<3;k++)ball(ground,x+k*.45,-.16,-4.0,.42,.10,.24,'#d6bd91');}
   const shack=group();canopy(shack,width+7,-3,C.red);join(shack,true);
   const water=group();box(water,width+40,.04,26,C.water,center.x,-.25,-18.5);box(water,width+40,.015,17,C.deep,center.x,-.22,-23);join(water);
   for(let n=0;n<(quality==='low'?2:3);n++){const wave=group();for(let i=0;i<20;i++)ball(wave,-16+i*1.7,-.19,-10,1.2,.014,.06,C.foam);const surface=join(wave)!;surface.material=paint.clone();const material=surface.material as T.MeshStandardMaterial;material.transparent=true;material.depthWrite=false;motions.push({root:wave,step:t=>{const phase=((t*.22+n*1.3)%4)/4;wave.position.z=.3+phase*4;material.opacity=Math.sin(phase*Math.PI)*.75;wave.scale.z=1+.01*Math.sin(t*.3+n);}});}
   for(let i=0;i<detail;i++){const animal=dog(i%2?'#c89257':'#fbebcd'),d=animal.root;motions.push({root:d,step:t=>{const p=(t*.55+i*5)%(width+18);d.position.set(p-8,-.13+Math.abs(Math.sin(t*6+i))*.045,-4.5-i*.3);d.rotation.y=0;animal.stride(t*.55+i*5);}});}
   const birds=group();for(let i=0;i<detail+1;i++){const x=i*1.9;const a=box(birds,.21,.018,.04,C.cream,x,0,0),b=box(birds,.21,.018,.04,C.cream,x+.20,0,0);a.rotation.z=.24;b.rotation.z=-.24;}join(birds);motions.push({root:birds,step:t=>{birds.position.set((t*.18)%(width+19)-8,2.8+Math.sin(t*.35)*.08,-9);}});
   for(let i=0;i<2;i++){
    const animal=group(),s=i?2:1;ball(animal,0,0,0,.34*s,.13*s,.13*s,i?'#657b86':'#749599');const fin=mesh(new T.ConeGeometry(.12*s,.24*s,3),C.dark,0,.15*s,0,animal);fin.rotation.z=.25;ball(animal,.34*s,0,0,.16*s,.055*s,.065*s,C.deep);for(const side of [-1,1]){const tail=ball(animal,-.34*s,0,side*.10*s,.12*s,.025*s,.11*s,C.deep);tail.rotation.y=side*.4;}join(animal);
    if(i)special(animal,'distant-whale',p=>{animal.position.set(center.x-6+p*12,-.1+Math.sin(p*Math.PI)*.24,-16);},3);
    else {animal.visible=false;motions.push({root:animal,prominent:true,step:t=>{const cycle=Math.floor((t+offset)/112),phase=(t+offset)%112;animal.visible=phase>=12&&phase<24&&cycle%4!==3;if(animal.visible){eventName='dolphins';const p=(phase-12)/12;animal.position.set(center.x-4+p*8,Math.sin(p*Math.PI)*.7-.1,-12);animal.rotation.z=Math.cos(p*Math.PI)*.5;}}});}
   }
  }else if(environment==='street'){
   // Everything meets the same pavement datum. Facades have real recessed
   // shopfronts and raised thresholds; no fixed centre can bury a taller shop.
   const architecture=group();
   const front=-4.65,streetZ=-1.82,left=-9,right=width+9,span=right-left;
   box(ground,span,.12,9.1,'#b5b9a5',(left+right)/2,-.22,-4.9);
   box(ground,span,.12,2.45,'#798786',(left+right)/2,-.13,streetZ);
   box(ground,span,.15,2.08,'#d9cdb6',(left+right)/2,-.085,-3.98);
   box(ground,span,.19,.16,'#eee3cc',(left+right)/2,-.06,-2.91);
   for(let x=left;x<right;x+=.72){box(ground,.68,.018,1.86,(Math.round(x*10)%3)?'#d5c7af':'#e0d4bd',x,.002,-3.99);box(ground,.68,.035,.15,'#b7ad98',x,.014,-2.91);}
   for(let x=left;x<right;x+=2.3)box(ground,.86,.008,.048,'#e6d9b8',x,-.063,streetZ);
   // Short loading bay, a zebra crossing and drain grates give the street scale.
   for(let i=0;i<6;i++)box(ground,.24,.012,2.0,'#e7dfc8',width+4.7+i*.44,-.058,streetZ);
   for(const x of [-5,2,width+3]){box(ground,.43,.015,.21,'#566566',x,-.05,-2.72);for(let n=0;n<6;n++)box(ground,.023,.012,.16,'#a7aba0',x-.17+n*.066,-.04,-2.72);}
   const rod=(p:T.Group,a:T.Vector3,b:T.Vector3,r:number,color:string)=>{const delta=b.clone().sub(a),m=cyl(p,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,r,delta.length(),color,r,8);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;};
   const window=(x:number,y:number,w:number,h:number,z:number,shutters=false)=>{
    box(architecture,w+.15,h+.16,.13,'#f1dfbc',x,y,z);box(architecture,w,h,.045,'#4e7978',x,y,z+.084);
    box(architecture,w-.07,.055,.05,'#e9d5b1',x,y+.05,z+.122);box(architecture,.045,h,.05,'#e9d5b1',x,y,z+.125);
    box(architecture,w+.27,.075,.25,'#e5cfaa',x,y-h/2-.04,z+.07);
    // Reflected window light reads as glass without transparency sorting.
    const reflection=box(architecture,w*.27,h*.78,.012,'#95b6ad',x-w*.27,y+.015,z+.11);reflection.rotation.z=-.055;
    if(shutters)for(const side of [-1,1]){box(architecture,.22,h+.04,.10,C.jade,x+side*(w/2+.22),y,z+.025);for(let n=0;n<5;n++)box(architecture,.17,.022,.025,'#628b78',x+side*(w/2+.22),y-h*.36+n*h*.18,z+.085);}
   };
   const planter=(x:number,z:number,w=1.1)=>{softBox(buildings,w,.26,.36,'#966b4d',x,.18,z);box(buildings,w-.09,.03,.29,'#514f3d',x,.32,z);for(let n=0;n<4;n++){const px=x-w*.35+n*w*.23;ball(buildings,px,.43,z,.18,.14,.15,C.leaf);if(n%2===0)ball(buildings,px,.54,z+.04,.055,.045,.055,'#d89770');}};
   const awning=(x:number,w:number,color:string,y=1.57)=>{for(let n=0;n<Math.ceil(w/.28);n++){const px=x-w/2+.14+n*.28;const roof=box(architecture,.28,.075,.78,n%2?C.cream:color,px,y,front+.48);roof.rotation.x=.16;box(architecture,.28,.14,.06,n%2?C.cream:color,px,y-.14,front+.86);}for(const side of [-1,1])rod(architecture,new T.Vector3(x+side*w*.44,y-.48,front+.10),new T.Vector3(x+side*w*.44,y-.05,front+.78),.019,C.dark);};
   const sign=(x:number,y:number,w:number,color:string,kind:number)=>{
    softBox(architecture,w,.40,.14,color,x,y,front+.12);softBox(architecture,w-.10,.30,.025,C.cream,x,y,front+.205);
    // Small bespoke shop emblems, legible as silhouettes from the game camera.
    if(kind===0){for(let n=0;n<3;n++){const loaf=ball(architecture,x+(n-1)*.17,y,front+.25,.09,.055,.035,'#b67b44');loaf.rotation.z=.35;}}
    else if(kind===1){const record=mesh(new T.CylinderGeometry(.12,.12,.025,20),C.dark,x,y,front+.244,architecture);record.rotation.x=Math.PI/2;const label=mesh(new T.CylinderGeometry(.038,.038,.029,12),C.red,x,y,front+.26,architecture);label.rotation.x=Math.PI/2;}
    else if(kind===2){for(let n=0;n<5;n++){const r=n*Math.PI*2/5;ball(architecture,x+Math.sin(r)*.085,y+Math.cos(r)*.085,front+.26,.053,.05,.025,'#c57970');}ball(architecture,x,y,front+.28,.04,.04,.02,'#d6ad5f');}
    else{box(architecture,.23,.17,.028,C.jade,x,y,front+.25);box(architecture,.27,.027,.038,C.jade,x,y-.10,front+.25);}
    for(const side of [-1,1]){box(architecture,w*.19,.018,.012,'#b59c77',x+side*w*.29,y+.045,front+.225);box(architecture,w*.14,.015,.012,'#b59c77',x+side*w*.29,y-.044,front+.225);}
   };
   const shops=[{x:-5.8,w:3.4,h:4.3,color:'#b86f57',trim:'#803f37',kind:0},{x:-2.45,w:3.1,h:3.65,color:'#789b8f',trim:'#355e59',kind:1},{x:1.1,w:3.75,h:4.8,color:'#d2af73',trim:'#9a774e',kind:2},{x:4.7,w:3.2,h:3.95,color:'#a8796d',trim:'#5e4e49',kind:3}];
   for(const shop of shops){const {x,w,h,color,trim,kind}=shop,depth=2.15+kind%2*.5;
    box(architecture,w,h,depth,color,x,.07+h/2,front-depth/2);
    box(architecture,w+.10,.22,depth+.12,'#847360',x,.05,front-depth/2);
    box(architecture,w+.16,.12,depth+.18,C.cream,x,h+.07,front-depth/2);
    box(architecture,w-.18,.035,depth-.16,'#75685b',x,h+.14,front-depth/2);
    box(architecture,w+.08,.14,.19,trim,x,1.98,front+.065);
    // Three-sided roof parapet and a modest chimney, instead of plain boxes.
    for(const dx of [-w/2+.04,w/2-.04])box(architecture,.11,.23,depth,color,x+dx,h+.23,front-depth/2);
    box(architecture,w,.23,.11,color,x,h+.23,front-depth+.04);
    box(architecture,.36,.57,.40,trim,x+w*.26,h+.36,front-depth+.48);box(architecture,.46,.08,.49,C.cream,x+w*.26,h+.68,front-depth+.48);
    for(const dx of [-w/2+.09,w/2-.09])box(architecture,.13,h,.15,trim,x+dx,.07+h/2,front+.03);
    // Ground floor is actual shop glazing, door, sill and visible merchandise.
    const doorX=x+w*.29;window(x-w*.16,.84,w*.51,1.15,front+.035);
    box(architecture,.66,1.54,.12,trim,doorX,.84,front+.04);box(architecture,.47,1.04,.035,'#6d9591',doorX,1.01,front+.115);box(architecture,.51,.27,.05,color,doorX,.33,front+.13);box(architecture,.032,.14,.04,'#d7b46e',doorX-.17,.79,front+.16);
    box(architecture,.85,.055,.31,C.cream,doorX,.084,front+.19);
    sign(x-.23,1.78,w*.64,trim,kind);awning(x-.30,w*.69,kind===0?'#b9634d':kind===1?'#446e65':kind===2?'#c89959':'#725950');
    for(let n=0;n<4;n++){const sx=x-w*.38+n*w*.14;
     if(kind===0)ball(architecture,sx,.48,front+.19,.11,.07,.045,'#dcb276');
     else if(kind===1){box(architecture,.20,.23,.04,['#cd8e61','#477974','#d2b26d','#7d645c'][n],sx,.48,front+.19);}
     else if(kind===2){cyl(architecture,sx,.44,front+.23,.07,.13,C.copper);for(let k=0;k<3;k++)ball(architecture,sx+(k-1)*.047,.58+k%2*.035,front+.22,.056,.055,.035,k%2?'#cf9279':'#b8b66c');}
     else cyl(architecture,sx,.45,front+.18,.065,.14,C.cream);
    }
    for(const dx of [-w*.25,w*.25]){window(x+dx,h-.97,.72,1.03,front+.025,kind===1||kind===3);if(kind===0||kind===2)planter(x+dx,front+.19,.88);}
    // Brickwork only on the solid piers and upper band; never across glass.
    for(let row=0;row<Math.floor(h/.22);row++)for(const edge of [-1,1]){const xx=x+edge*(w/2-.29);box(architecture,.23,.017,.011,'#956b56',xx,.25+row*.22,front+.083);}
    if(quality!=='low')for(let n=0;n<9;n++)box(architecture,.25,.015,.014,'#b79171',x-w*.42+n*w*.104,2.12,front+.083);
   }
   join(architecture,true);
   // A planted pocket park and side courtyard close the block naturally.
   for(const x of [-8.1,7.2,width+6]){softBox(buildings,1.28,.24,.85,'#b4a990',x,.12,-3.71);tree(buildings,x,-3.71,1.22);for(let k=0;k<5;k++)ball(buildings,x-.41+k*.20,.29,-3.50,.18,.12,.14,'#618266');}
   bench(buildings,7.5,-4.42);cafeTable(buildings,5.85,-3.57);planter(-4.2,-3.15,.65);planter(.05,-3.13,.65);
   // A neighbourhood green frames the service pad rather than leaving a
   // detached restaurant floating beside an oversized, empty intersection.
   box(ground,width+18,.10,height+10,'#d5cbb7',center.x,-.25,(height+3)/2);
   for(const side of [-1,1]){
    const px=side<0?-4.65:width+4.25,pz=height+1.7;
    softBox(ground,4.5,.12,5.3,'#b8bea0',px,-.10,pz);softBox(ground,4.2,.035,5.0,'#91a57b',px,-.025,pz);
    box(ground,1.45,.035,5.2,'#d8cbb0',px,.0,pz);
    for(let row=0;row<7;row++)for(let col=0;col<2;col++)box(ground,.65,.018,.66,(row+col)%2?'#e1d3b6':'#d1c3a8',px-.35+col*.70,.025,pz-2.1+row*.7);
    for(const dz of [-1.7,1.75]){softBox(buildings,1.12,.32,.82,'#b6a486',px+side*1.32,.11,pz+dz);tree(buildings,px+side*1.32,pz+dz,dz<0?1.3:1.0);for(let k=0;k<3;k++)ball(buildings,px+side*1.32+(k-1)*.24,.34,pz+dz+.20,.18,.16,.15,C.leaf);}
    const seat=group();bench(seat,0,0);seat.position.set(px-side*1.20,.025,pz);seat.rotation.y=side*Math.PI/2;join(seat);
    for(let k=0;k<6;k++){const fx=px+side*1.2+(k%2)*.36,fz=pz-.64+Math.floor(k/2)*.48;planting(buildings,fx,fz);ball(buildings,fx,.26,fz,.055,.042,.055,k%2?'#dbac6c':'#bb7a67');}
   }
   for(const x of [-7.55,-.6,6.45]){cyl(buildings,x,1.23,-3.02,.04,2.5,C.dark);cyl(buildings,x,.16,-3.02,.095,.25,C.dark);softBox(buildings,.28,.38,.28,'#f4d996',x,2.37,-3.02);box(buildings,.36,.065,.36,C.dark,x,2.59,-3.02);for(const dx of [-.12,.12])for(const dz of [-.12,.12])box(buildings,.026,.36,.026,C.dark,x+dx,2.36,-3.02+dz);}
   // Shop chalkboard and stacked produce stay on the sidewalk.
   const board=box(buildings,.45,.55,.08,C.dark,-3.48,.39,-3.31);board.rotation.x=-.13;for(const x of [-3.73,-3.23])box(buildings,.045,.77,.07,C.copper,x,.39,-3.35);for(let n=0;n<3;n++)box(buildings,.27-n*.05,.021,.012,C.cream,-3.48,.51-n*.095,-3.218);
   softBox(buildings,.47,.35,.48,'#b78255',1.83,.20,-3.41);for(let k=0;k<5;k++)ball(buildings,1.67+k%3*.13,.41+k%2*.05,-3.38+Math.floor(k/3)*.1,.08,.07,.07,k%2?'#af674c':'#bea755');
   const laundry=group();const laundryX=-2.45;for(let i=0;i<4;i++){const cloth=box(laundry,.29,.39,.025,i%2?C.cream:'#cc9976',laundryX-.60+i*.39,3.02,front+.30);cloth.rotation.z=(i-1)*.04;}join(laundry,true);motions.push({root:laundry,step:t=>laundry.position.z=Math.sin(t*.65)*.025});
   tube(buildings,[new T.Vector3(laundryX-.86,3.27,front+.3),new T.Vector3(laundryX,3.15,front+.3),new T.Vector3(laundryX+.86,3.27,front+.3)],.012,C.dark);
   const cat=group();ball(cat,0,.12,0,.18,.14,.10,'#d7b382');ball(cat,.12,.28,0,.10,.11,.09,'#d7b382');for(const x of [.06,.17])mesh(new T.ConeGeometry(.055,.11,3),'#d7b382',x,.38,0,cat);tube(cat,[new T.Vector3(-.13,.1,0),new T.Vector3(-.30,.13,0),new T.Vector3(-.28,.28,0)],.025,'#d7b382');join(cat,true);cat.position.set(-5.05,4.50,front-.40);
   // Bicycle wheels stand in XY, with axles along Z. Rider and frame face +X.
   const cyclist=group();cyclist.name='downtown-cyclist';const frame=new T.Group();cyclist.add(frame);
   const rear=new T.Vector3(-.40,.28,0),hub=new T.Vector3(.01,.30,0),seat=new T.Vector3(-.12,.68,0),head=new T.Vector3(.32,.68,0),frontHub=new T.Vector3(.44,.28,0);
   for(const [a,b] of [[rear,hub],[rear,seat],[hub,seat],[seat,head],[head,hub],[head,frontHub]])rod(frame,a,b,.024,'#b3604d');
   rod(frame,seat,new T.Vector3(-.12,.77,0),.024,C.dark);softBox(frame,.23,.055,.16,'#463e36',-.14,.78,0);
   rod(frame,head,new T.Vector3(.37,.84,0),.02,C.dark);rod(frame,new T.Vector3(.37,.84,-.18),new T.Vector3(.37,.84,.18),.023,C.dark);
   softBox(frame,.24,.17,.29,'#b28b57',.50,.71,0);box(frame,.21,.025,.26,'#dec49a',.50,.81,0);
   // Pelvis rests on saddle; a forward-leaning torso and bent arms reach bars.
   ball(frame,-.11,.84,0,.13,.085,.12,'#42565a');const torso=ball(frame,-.02,1.05,0,.125,.23,.13,C.jade);torso.rotation.z=-.25;
   ball(frame,.05,1.32,0,.135,.15,.13,'#d6aa82');ball(frame,.028,1.425,0,.147,.077,.14,'#dbb979');ball(frame,.167,1.335,-.075,.012,.017,.011,C.dark);
   for(const side of [-1,1]){rod(frame,new T.Vector3(.04,1.16,side*.11),new T.Vector3(.20,.99,side*.15),.047,C.jade);rod(frame,new T.Vector3(.20,.99,side*.15),new T.Vector3(.37,.85,side*.16),.035,'#d6aa82');}
   join(frame);
   const wheels:T.Group[]=[];for(const x of [-.40,.44]){const wheel=new T.Group();wheel.name='upright-wheel';cyclist.add(wheel);wheel.position.set(x,.28,0);mesh(new T.TorusGeometry(.26,.031,6,20),C.dark,0,0,0,wheel);mesh(new T.TorusGeometry(.215,.012,4,20),'#bbccc3',0,0,0,wheel);for(let n=0;n<6;n++){const angle=n*Math.PI/3;rod(wheel,new T.Vector3(),new T.Vector3(Math.cos(angle)*.22,Math.sin(angle)*.22,0),.007,'#becbc1');}join(wheel);wheels.push(wheel);}
   // Knees and ankles follow a crank, so pedalling never looks like sliding.
   const legs=new T.Group();cyclist.add(legs);const legParts=[-1,1].map(side=>({side,thigh:cyl(legs,0,0,0,.047,1,'#42565a',.047,8),shin:cyl(legs,0,0,0,.040,1,'#42565a',.040,8),shoe:softBox(legs,.16,.062,.10,'#e2d4ba',0,0,0)}));
   const connect=(part:T.Mesh,a:T.Vector3,b:T.Vector3)=>{const d=b.clone().sub(a);part.position.copy(a).add(b).multiplyScalar(.5);part.scale.y=d.length();part.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());};
   motions.push({root:cyclist,step:t=>{const speed=.85;cyclist.position.set(left-2+(t*speed)%(span+4),-.055,streetZ-.37);for(const wheel of wheels)wheel.rotation.z=-t*speed/.26;for(const leg of legParts){const phase=t*4.0+(leg.side>0?Math.PI:0),hip=new T.Vector3(-.12,.84,leg.side*.10),ankle=new T.Vector3(.01+Math.cos(phase)*.13,.30+Math.sin(phase)*.13,leg.side*.13),knee=hip.clone().lerp(ankle,.52).add(new T.Vector3(.24,.04,0));connect(leg.thigh,hip,knee);connect(leg.shin,knee,ankle);leg.shoe.position.copy(ankle).add(new T.Vector3(.03,-.015,0));}}});
   const robot=group();softBox(robot,.43,.34,.37,C.cream,0,.28,0);box(robot,.3,.05,.04,C.jade,0,.39,.20);for(const x of [-.2,.2])ball(robot,x,.09,0,.07,.08,.10,C.dark);join(robot);special(robot,'wrong-way-delivery',p=>{robot.position.set(center.x-3+Math.sin(p*Math.PI)*5,.025,-3.10);robot.rotation.y=p<.5?Math.PI/2:-Math.PI/2;});
  }else if(environment==='festival'){
   box(ground,width+35,.10,29,'#8ca974',center.x,-.18,-6);box(ground,width+5,.04,height+7,'#c6bca1',center.x,-.11,(height-1)/2);
   // Walkways link the stage approach, food lane and picnic gardens.
   paving(ground,center.x,-1.7,width+7,4);for(const px of [-3.1,width+2.9]){box(ground,1.7,.03,height+8,'#cabd9a',px,-.105,1);for(let row=0;row<3;row++){const z=2+row*2.65;cafeTable(buildings,px+(px<0?-1.5:1.5),z);umbrella(buildings,px+(px<0?-1.5:1.5),z,row%2?C.red:C.jade);planting(buildings,px+(px<0?-2.3:2.3),z+.7);}}
   for(const px of [-6.5,width+6]){tree(buildings,px,4,1.4);tree(buildings,px,8,1.05);canopy(buildings,px,0,'#c68b57');}
   const x=center.x,z=-6.8;box(buildings,8,.40,3.2,C.dark,x,.1,z);box(buildings,7,2.6,.10,'#43545e',x,1.75,z-1.4);
   for(const side of [-1,1]){const roof=box(buildings,4.5,.11,3.5,side<0?C.jade:'#234b50',x+side*2.1,3.33,z);roof.rotation.z=-side*.10;}box(buildings,8.7,.16,.16,C.copper,x,3.12,z+1.75);
   for(let i=0;i<9;i++){const a=i*Math.PI/8;const pillar=box(buildings,.18,1.1+Math.sin(a)*.6,.04,['#b66b6d','#c79266','#73a49a'][i%3],x-2.3+i*.58,1.68,z-1.31);pillar.rotation.z=(i-4)*.10;}
   for(let i=0;i<7;i++)ball(glow,x-3+i,2.84,z+1.42,.055,.055,.055,'#ffc97d');
   for(const side of [-1,1]){box(buildings,.7,.18,1.0,C.dark,x+side*3.7,.30,z+1.9);box(buildings,.7,.16,.60,C.dark,x+side*3.7,.10,z+2.16);}
   for(const side of [-1,1]){box(buildings,.14,3.3,.14,C.copper,x+side*3.9,1.6,z+1.3);box(buildings,.8,1.9,.7,C.dark,x+side*3,1.0,z+1);for(const y of [.7,1.4])ball(buildings,x+side*3,y,z+1.4,.24,.24,.03,'#647574');}
   for(let i=0;i<7;i++){const brace=box(buildings,.065,.9,.065,C.cream,x-3.1+i,2.75,z+1.3);brace.rotation.z=i%2?.65:-.65;}
   cyl(buildings,x,.65,z,.38,.55,C.red);for(const side of [-1,1]){cyl(buildings,x+side*.58,.97,z,.27,.035,C.copper);box(buildings,.026,.85,.026,C.copper,x+side*.58,.53,z);person(buildings,x+side*1.7,z+.2,side<0?C.red:C.jade,.98);}person(buildings,x,z-.4,C.cream,.98);
   for(let i=0;i<4;i++){const tx=i%2?-4:width+4,tz=-1.6-Math.floor(i/2)*3.8;canopy(buildings,tx,tz,i%2?C.red:C.jade);}
   for(const side of [-1,1]){const px=side<0?-2.4:width+2.4;bench(buildings,px,2.2);box(buildings,.80,.26,.80,C.copper,px,.05,3.6);tree(buildings,px,3.6,.82);cyl(buildings,px,1.38,-.8,.025,2.8,C.copper);}
   tube(buildings,[new T.Vector3(-2.4,2.75,-.8),new T.Vector3(center.x,2.43,-.8),new T.Vector3(width+2.4,2.75,-.8)],.013,C.copper);
   const bunting=group();for(let i=0;i<14;i++){const a=i*(width+4)/13;const flag=mesh(new T.ConeGeometry(.12,.27,3),[C.red,C.cream,'#dcb46d'][i%3],-2+a,2.53-Math.sin(i/13*Math.PI)*.22,-.8,bunting);flag.rotation.z=Math.PI;flag.scale.z=.1;}join(bunting);motions.push({root:bunting,step:t=>bunting.rotation.z=Math.sin(t*.8)*.012});
   for(let i=0;i<detail*8;i++){const gx=-6+(i*2.73)%(width+14),gz=-3.6-(i*1.37)%6;planting(buildings,gx,gz);}
   // A quiet standing crowd fills the stage apron; animated dancers stay planted in front.
   for(let i=0;i<6+detail*2;i++){const gx=center.x-2.8+(i%5)*1.25,gz=-4.4-Math.floor(i/5)*.62;person(buildings,gx,gz,[C.jade,'#ba7da7','#d6a04d',C.red][i%4],.94+(i%3)*.045);}
   for(let i=0;i<detail+1;i++){const a=actor([C.red,'#9983ae','#d9b077',C.jade][i%4],.92);a.root.position.set(-1+i*1.55,.025,-3.25-i%2*.65);a.root.rotation.y=Math.PI+.2*(i%3-1);motions.push({root:a.root,step:t=>a.step(t*.34+i,true)});}
   const stageLights=group();for(let i=0;i<5;i++)ball(stageLights,center.x-2+i,2.5,-8.08,.16,.31,.03,['#d7ac8e','#88c6bc','#c4aac9'][i%3]);join(stageLights);motions.push({root:stageLights,step:t=>stageLights.position.x=Math.sin(t*.22)*.25});
   const mascot=actor(C.red,1.1);ball(mascot.root,0,.49,0,.30,.21,.22,'#d7ac61');box(mascot.root,.49,.06,.35,C.jade,0,.36,0);join(mascot.root);special(mascot.root,'burger-festival-goer',p=>{mascot.root.position.set(center.x-5+p*10,0,-2);mascot.root.rotation.y=Math.PI/2;mascot.step(p*10);});
  }else if(environment==='business'){
   box(ground,width+32,.10,25,'#bfc8c3',center.x,-.18,-5);
   for(let x=-7;x<width+12;x+=1.5)box(ground,.022,.012,24,'#a3b1ab',x,-.12,-4);
   for(let i=0;i<4;i++){const x=-5+i*4.2,h=4.1+i%2*1.2;box(buildings,3.8,h,2.2,'#b4c1ba',x,h/2-.1,-6);box(buildings,3.65,h-.3,.04,'#6c9196',x,h/2,-4.87);for(let j=0;j<5;j++)box(buildings,3.7,.065,.07,C.cream,x,.42+j*.92,-4.82);for(const dx of [-1.2,0,1.2])box(buildings,.06,h-.2,.07,C.cream,x+dx,h/2,-4.81);}
   for(const x of [-3,width+3]){box(buildings,1.7,.45,1.1,'#9aa69b',x,.14,-1.5);tree(buildings,x,-1.5,.9);box(buildings,1.8,.12,.55,C.copper,x,.41,-.45);}
   cafeTable(buildings,-5,-2.4);cafeTable(buildings,width+6,-1.2);umbrella(buildings,width+6,-1.2,C.jade);
   const fx=width+4,fz=-3.5;cyl(buildings,fx,.20,fz,1.1,.40,C.stone);cyl(buildings,fx,.42,fz,.99,.025,C.water);cyl(buildings,fx,.67,fz,.24,.53,C.stone);cyl(buildings,fx,.96,fz,.62,.14,C.cream);
   const spray=group();for(let i=0;i<6;i++){const a=i*Math.PI/3;tube(spray,[new T.Vector3(fx,.95,fz),new T.Vector3(fx+Math.cos(a)*.43,1.13,fz+Math.sin(a)*.43),new T.Vector3(fx+Math.cos(a)*.81,.45,fz+Math.sin(a)*.81)],.012,C.foam);}join(spray);motions.push({root:spray,step:t=>spray.position.y=Math.sin(t*.8)*.014});
   for(let i=0;i<detail;i++)commuter(i%2?C.jade:C.copper,i*3.2,-2.8-i%2*.55,.66);
   // The tiny teddy display is an original visual joke, not a gameplay offer.
   box(buildings,.8,.50,.6,C.dark,-3,.15,-.15);ball(buildings,-3,.73,-.15,.21,.27,.16,C.copper);ball(buildings,-3,1.02,-.15,.18,.17,.14,C.copper);for(const x of [-3.15,-2.85])ball(buildings,x,1.15,-.15,.07,.07,.045,C.copper);
   bearMarketSign(buildings);
   const executive=actor(C.dark),chase=executive.root;for(let i=0;i<4;i++){const paper=box(chase,.17,.012,.22,C.cream,.5+i*.22,.23+i*.1,.03);paper.rotation.z=i*.4;}join(chase);special(chase,'escaped-paperwork',p=>{chase.position.set(-5+p*(width+14),.02,-1.4);chase.rotation.y=Math.PI/2;executive.step(p*(width+14));});
  }else{
   box(ground,width+32,.10,25,'#465657',center.x,-.18,-5);paving(ground,center.x,-1,width+24,12,true);box(ground,width+32,.035,4.4,'#254d5a',center.x,-.12,-7.4);box(ground,width+32,.12,.24,'#7e9187',center.x,-.01,-5.1);
   for(let i=0;i<5;i++){const x=-5+i*3.9;box(buildings,3.5,3.2+(i%2)*.5,1.5,'#34535b',x,1.45,-10.3);for(const dx of [-1,0,1])for(let j=0;j<2;j++)box(glow,.44,.55,.03,j===i%2?'#dcb773':'#70847e',x+dx,1+j*1.25,-9.53);box(buildings,3.7,.15,1.7,C.dark,x,3.1+(i%2)*.5,-10.3);}
   for(let i=0;i<4;i++){const x=-4+i*3.7,color=i%2?C.jade:C.red;
    softBox(buildings,2.45,.62,1.2,'#805d48',x,.20,-3.3);box(buildings,2.65,.12,1.35,'#c89964',x,.56,-3.3);
    for(let k=0;k<9;k++)box(buildings,.07,.50,.025,'#b2865b',x-1.1+k*.28,.23,-2.69);
    for(const side of [-1,1]){cyl(buildings,x+side*1.22,.92,-2.65,.045,1.95,C.copper);const roof=box(buildings,3,.11,1.02,color,x,1.94,-3.3+side*.47);roof.rotation.x=side*.19;}
    box(buildings,3.03,.1,.1,C.copper,x,2.07,-3.3);for(let k=0;k<7;k++){box(buildings,.34,.30,.04,k%2?C.cream:color,x-1.12+k*.37,1.64,-2.47);cyl(buildings,x-.8+k*.27,.68,-2.91,.10,.08,C.cream);ball(buildings,x-.8+k*.27,.75,-2.91,.07,.04,.07,k%2?'#daa851':C.leaf);}
    person(buildings,x,-3.35,C.cream,1.5);softBox(buildings,.65,.35,.07,C.dark,x,1.38,-2.5);box(glow,.48,.035,.02,'#ffd293',x,1.40,-2.45);box(glow,.34,.025,.02,'#ffd293',x,1.29,-2.45);
   }
   tube(buildings,[new T.Vector3(-5,2.8,-2.55),new T.Vector3(center.x,2.35,-2.55),new T.Vector3(width+8,2.8,-2.55)],.015,C.dark);
   for(let i=0;i<detail*3+3;i++){const lantern=group();ball(lantern,0,0,0,.16,.23,.16,i%2?'#e4b169':'#c97752');cyl(lantern,0,.23,0,.07,.04,C.dark);cyl(lantern,0,-.26,0,.01,.12,C.copper);for(let rib=0;rib<5;rib++){const ring=mesh(new T.TorusGeometry(.155*Math.sqrt(1-Math.pow((rib-2)/3,2)),.007,3,12),C.copper,0,(rib-2)*.067,0,lantern);ring.rotation.x=Math.PI/2;}const lamp=join(lantern)!;const material=paint.clone();material.emissive.set('#eb9849');material.emissiveIntensity=.28;lamp.material=material;lantern.position.set(-4+i*(width+10)/(detail*3+2),2.54,-2.55);motions.push({root:lantern,step:t=>lantern.rotation.z=Math.sin(t*.65+i)*.05});}
   for(let i=0;i<detail*7;i++)box(glow,.17+(i%3)*.13,.003,.034,'#aa8e66',-6+i*1.1,-.095,-6.15+(i%4)*.62);
   const vapour=group();for(let i=0;i<4;i++)ball(vapour,-3+i*3.7,1.08,-3,.05,.10,.05,'#c5cfc0');join(vapour);motions.push({root:vapour,step:t=>vapour.position.y=Math.sin(t*.6)*.08});
   const boat=group();ball(boat,0,.05,0,.7,.13,.24,C.copper);box(boat,.7,.32,.41,C.jade,0,.24,0);ball(boat,.08,.56,0,.13,.16,.13,'#e6bd7c');join(boat);motions.push({root:boat,step:t=>{boat.position.set((t*.14)%(width+25)-10,-.06,-7.3);boat.rotation.z=Math.sin(t*.6)*.018;}});
   const courier=dog(C.copper,.53),cat=courier.root;for(const x of [.11,.18])mesh(new T.ConeGeometry(.04,.12,3),C.copper,x,.36,0,cat);box(cat,.21,.20,.19,C.red,-.07,.36,0);join(cat);special(cat,'delivery-cat',p=>{cat.position.set(-5+p*(width+14),.015,-1.8);courier.stride(p*(width+14));});
  }
  join(ground);const scenery=join(buildings,environment!=='street');if(scenery&&environment==='street')scenery.castShadow=true;const lit=join(glow);if(lit){const material=paint.clone();material.emissive.set(environment==='night_market'?'#ffd39a':'#ffba63');material.emissiveIntensity=environment==='night_market'?.65:.32;lit.material=material;}root.updateMatrixWorld(true);
 }
 function update(delta:number,camera:T.Camera,reduced=false,paused=false){
  if(disposed)return;if(!paused&&!reduced)time+=Math.max(0,Math.min(delta,.10));eventName=null;
  for(const motion of motions){if(motion.prominent&&(reduced||paused)){motion.root.visible=false;continue;}motion.step(time);}
  const direction=camera.position.clone().sub(center).setY(0).normalize();
  for(const m of fadeMeshes){
   // Fully clear the sightline from behind the block. Leaving every merged
   // wall at 14% compounded layers into an apparent pile of half-built walls.
   const opacity=1-T.MathUtils.smoothstep(-direction.z,.10,.38),mat=m.material as T.MeshStandardMaterial;
   m.visible=opacity>.01;m.castShadow=opacity>.9;mat.transparent=opacity<1;mat.opacity=opacity;mat.depthWrite=opacity===1;
  }
 }
 function stats(){let draws=0,triangles=0;root.traverse(o=>{if(o instanceof T.Mesh){draws++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {draws,triangles,event:eventName,time};}
 build();return {root,update,stats,setQuality(value){if(disposed||value===quality)return;quality=value;build();},dispose(){if(disposed)return;disposed=true;clear();paint.dispose();root.removeFromParent();}};
}
