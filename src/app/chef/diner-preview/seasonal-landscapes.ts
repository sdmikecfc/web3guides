import * as T from 'three';
import type {RenderQuality} from './presentation';

/** Presentation only: neither landscape contains a navigation or cooking target. */
interface LandscapeKit {
 domain:'smoothie'|'wines';width:number;height:number;quality:RenderQuality;root:T.Group;
 group:()=>T.Group;
 box:(p:T.Group,w:number,h:number,d:number,c:string,x?:number,y?:number,z?:number)=>T.Mesh;
 softBox:LandscapeKit['box'];
 ball:(p:T.Group,x:number,y:number,z:number,sx:number,sy:number,sz:number,c:string)=>T.Mesh;
 cyl:(p:T.Group,x:number,y:number,z:number,r:number,h:number,c:string,top?:number,sides?:number)=>T.Mesh;
 tube:(p:T.Group,points:T.Vector3[],r:number,c:string)=>T.Mesh;
 mesh:(g:T.BufferGeometry,c:string,x:number,y:number,z:number,p:T.Group)=>T.Mesh;
 join:(g:T.Group,fade?:boolean)=>T.Mesh|undefined;
 tree:(p:T.Group,x:number,z:number,s?:number,palm?:boolean)=>void;
 cafeTable:(p:T.Group,x:number,z:number)=>void;
 bench:(p:T.Group,x:number,z:number,c?:string)=>void;
 actor:(c:string,s?:number)=>{root:T.Group;step:(distance:number,dance?:boolean)=>void};
 addMotion:(motion:{root:T.Group;step:(time:number)=>void})=>void;
}

export function buildSeasonalLandscape(k:LandscapeKit){
 const {domain,width,height,quality,root,group,box,softBox,ball,cyl,tube,mesh,join,tree,cafeTable,bench,actor,addMotion}=k;
 const cx=(width-1)/2,detail=quality==='low'?1:quality==='medium'?2:3;
 const named=(name:string)=>{const g=group();g.name=name;return g;};
 const v=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
 const rod=(p:T.Group,a:T.Vector3,b:T.Vector3,r:number,c:string)=>{
  const d=b.clone().sub(a),m=mesh(new T.CylinderGeometry(r,r,d.length(),6),c,0,0,0,p);
  m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(v(0,1,0),d.normalize());return m;
 };
 function surface(p:T.Group,points:[number,number][],y:number,color:string){
  const shape=new T.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  const m=mesh(new T.ShapeGeometry(shape),color,0,y,0,p);m.rotation.x=-Math.PI/2;return m;
 }
 function bottle(p:T.Group,x:number,y:number,z:number,color='#365448'){
  cyl(p,x,y+.15,z,.061,.30,color);cyl(p,x,y+.34,z,.027,.11,color);cyl(p,x,y+.395,z,.029,.035,'#a48d54');
  box(p,.082,.11,.012,'#edddb7',x,y+.15,z+.060);
 }
 function barrel(p:T.Group,x:number,y:number,z:number,s=1){
  const profile=[v(.27,0,0),v(.33,.15,0),v(.35,.40,0),v(.33,.68,0),v(.27,.80,0)].map(a=>new T.Vector2(a.x*s,a.y*s));
  mesh(new T.LatheGeometry(profile,12),'#946c42',x,y,z,p);cyl(p,x,y+.785*s,z,.27*s,.025*s,'#c49a61');
  for(const dy of [.12,.66]){const ring=mesh(new T.TorusGeometry(.325*s,.023*s,4,12),'#4a4b43',x,y+dy*s,z,p);ring.rotation.x=Math.PI/2;}
  for(let n=0;n<12;n++){const a=n*Math.PI/6;rod(p,v(x+Math.sin(a)*.325*s,y+.13*s,z+Math.cos(a)*.325*s),v(x+Math.sin(a)*.325*s,y+.66*s,z+Math.cos(a)*.325*s),.006*s,'#695235');}
 }
 function grapes(p:T.Group,x:number,y:number,z:number,s=.10){
  for(let n=0;n<(quality==='high'?6:3);n++)ball(p,x+(n%3-1)*s*.8,y-Math.floor(n/3)*s*.8,z+(n%2)*s*.4,s,s,s,n%2?'#655075':'#806180');
  ball(p,x,y-s*1.8,z,s*.85,s*.85,s*.85,'#645074');
 }
 function walking(a:ReturnType<LandscapeKit['actor']>,path:(time:number)=>T.Vector3){
  let distance=0,lastTime=0,started=false;const target=new T.Quaternion();
  addMotion({root:a.root,step:t=>{
   const next=path(t),direction=path(t+.01).sub(path(t-.01));
   target.setFromAxisAngle(v(0,1,0),Math.atan2(direction.x,direction.z));
   if(started){distance+=a.root.position.distanceTo(next);a.root.quaternion.rotateTowards(target,Math.max(0,t-lastTime)*5);}
   else{a.root.quaternion.copy(target);started=true;}
   a.root.position.copy(next);a.step(distance);lastTime=t;
  }});
 }
 // Both have open sightlines behind the truck; tall landmarks occupy the sides.
 if(domain==='smoothie'){
  root.userData.composition='waterfront-crescent';
  const shore=named('smoothie-crescent-promenade'),water=named('smoothie-lagoon'),market=named('smoothie-fruit-pavilion'),garden=named('smoothie-beach-garden');
  const sand='#e6cf9f',wood='#bf8e59',mint='#447f70',cream='#f8e6b5';
  box(shore,width+27,.16,height+14,sand,cx,-.26,(height-6)/2);
  box(water,width+48,.035,30,'#59aead',cx,-.30,-21);
  // A scalloped shore and a genuinely curved boardwalk replace the shop row.
  const arc=(a:number,r:number)=>[cx+Math.cos(a)*r,-2.8-Math.sin(a)*r*.43] as [number,number];
  const radius=width/2+7,segments=36;
  const band: [number,number][]=[];
  for(let i=0;i<=segments;i++)band.push(arc(i/segments*Math.PI,radius));
  for(let i=segments;i>=0;i--)band.push(arc(i/segments*Math.PI,radius-1.7));
  surface(shore,band,-.035,wood);
  const lagoon:[number,number][]=[[cx-radius-18,-35],[cx+radius+18,-35],[cx+radius+18,-2.8]];
  for(let i=0;i<=segments;i++)lagoon.push(arc(i/segments*Math.PI,radius+.22));
  lagoon.push([cx-radius-18,-2.8]);surface(water,lagoon,-.14,'#79c9bd');
  for(let i=0;i<=segments;i++){
   const a=i/segments*Math.PI,[x,z]=arc(a,radius),[ix,iz]=arc(a,radius-1.7);
   rod(shore,v(x,-.018,z),v(ix,-.018,iz),.009,'#967349');
   if(i%3===0){cyl(shore,x,.24,z,.045,.58,mint);cyl(shore,x,.57,z,.063,.07,cream);}
   if(i<segments){const [nx,nz]=arc((i+1)/segments*Math.PI,radius);rod(shore,v(x,.46,z),v(nx,.46,nz),.026,cream);}
  }
  // Open timber fruit bar with citrus-slice signage and sculpted leaf sails.
  const px=-4.6,pz=-2.6;softBox(market,3.45,.18,2.6,wood,px,.015,pz);
  for(const dx of [-1.35,1.35])for(const dz of [-.90,.90])cyl(market,px+dx,1.10,pz+dz,.065,2.2,wood);
  softBox(market,2.8,.74,.70,'#e39b56',px,.45,pz+.53);softBox(market,3.05,.12,.90,cream,px,.88,pz+.53);
  for(let n=0;n<12;n++)box(market,.06,.60,.025,'#b87240',px-1.30+n*.236,.45,pz+.895);
  for(let n=0;n<3;n++){
   const angle=(n-1)*.8,shape=new T.Shape();shape.moveTo(0,0);shape.bezierCurveTo(-1.12,.55,-.95,2.28,0,2.6);shape.bezierCurveTo(.95,2.28,1.12,.55,0,0);
   const leaf=mesh(new T.ExtrudeGeometry(shape,{depth:.045,bevelEnabled:false,curveSegments:8}),n%2?'#f5c471':'#478978',px,2.45,pz-.30,market);
   leaf.rotation.set(-Math.PI/2+.12,0,angle);leaf.scale.set(1.05,1.10,1);
   // A rib makes each sail read as a structured canopy, not floating foliage.
   rod(market,v(px,2.43,pz-.30),v(px+Math.sin(angle)*2.6,2.72,pz-.30-Math.cos(angle)*2.6),.035,cream);
  }
  for(let row=0;row<3;row++){
   const x=px-1+row;softBox(market,.78,.13,.53,wood,x,1.01,pz+.53);
   for(let n=0;n<5;n++)ball(market,x+(n%3-1)*.17,1.12+Math.floor(n/3)*.10,pz+.44+Math.floor(n/3)*.15,.11,.13,.105,['#f0b344','#d16b71','#a7bb59'][row]);
  }
  for(let n=0;n<3;n++){cyl(market,px-.75+n*.75,.99,pz-.57,.13,.14,cream);cyl(market,px-.75+n*.75,1.20,pz-.57,.115,.30,['#e2af50','#db8c99','#a5bc72'][n],.10);box(market,.14,.04,.14,mint,px-.75+n*.75,1.38,pz-.57);}
  // An orange cross section, readable without relying on a tiny sign texture.
  const sign=named('smoothie-citrus-sign');cyl(sign,0,0,0,.52,.08,'#e99c42',.52,24).rotation.x=Math.PI/2;
  for(let n=0;n<8;n++){const a=n*Math.PI/4;const wedge=new T.Shape();wedge.moveTo(0,0);wedge.absarc(0,0,.41,a+.05,a+Math.PI/4-.05,false);wedge.closePath();mesh(new T.ShapeGeometry(wedge),n%2?'#ffd579':'#f9bd52',0,0,.048,sign);}
  rod(sign,v(0,-.05,-.08),v(0,-.9,-.08),.04,wood);join(sign);sign.position.set(px+1.35,2.58,pz+.92);
  sign.rotation.y=-.55;
  // Tasting pockets on the right and palms frame the cooking pad, never cover it.
  for(const [x,z,s] of [[width+3.4,-2.2,1.65],[-7.6,.9,1.75],[width+6,-5.1,1.3],[-3.4,-7.3,1.35]])tree(garden,x,z,s,true);
  for(let n=0;n<detail+1;n++){
   const x=width+3.4+(n%2)*2.25,z=.4-Math.floor(n/2)*2.45;cafeTable(garden,x,z);
   cyl(garden,x-.55,1.05,z,.034,2.1,wood);mesh(new T.ConeGeometry(.85,.28,16),n%2?'#eca977':'#95c6b1',x-.55,2.12,z,garden);
   for(let f=0;f<3;f++)ball(garden,x-.1+f*.1,.81,z,.065,.07,.065,['#f4b04a','#bd5f71','#a7b761'][f]);
  }
  // The beach is composed into little gardens and picnic pockets at playing distance.
  for(const side of [-1,1]){
   const x=side<0?-4.5:width+3.8,z=height+1.5;
   softBox(garden,2.8,.10,3.3,'#d9bb87',x,-.10,z);
   softBox(garden,2.5,.045,1.50,side<0?'#d49673':'#82b09b',x,-.015,z+.35);
   for(let n=0;n<6;n++)box(garden,2.40,.01,.055,cream,x,.011,z-.25+n*.23);
   softBox(garden,1.10,.12,.64,wood,x,.22,z+.1);cyl(garden,x-.20,.36,z+.08,.068,.20,'#edb45e');cyl(garden,x+.20,.36,z+.08,.068,.20,'#d797a6');
   for(const dz of [-.54,.78])softBox(garden,.53,.09,.41,mint,x,.085,z+dz);
   tree(garden,x+side*.85,z-1.55,1.42,true);
   for(let n=0;n<4;n++){const gx=x+side*1.2,gz=z-.75+n*.5;cyl(garden,gx,.15,gz,.22,.32,'#d29665',.27);for(let j=0;j<4;j++){const a=j*Math.PI/2;const leaf=ball(garden,gx+Math.sin(a)*.14,.44,gz+Math.cos(a)*.14,.07,.28,.075,mint);leaf.rotation.z=Math.sin(a)*.55;}}
  }
  // A carved pineapple welcome marker gives the fruit market its own silhouette.
  const ax=-3.15,az=1.5;softBox(garden,.80,.12,.80,wood,ax,.025,az);ball(garden,ax,.68,az,.37,.55,.34,'#d8a94d');
  for(let row=0;row<5;row++)for(let n=0;n<8;n++){const a=n*Math.PI/4+(row%2)*.3;ball(garden,ax+Math.sin(a)*.33,.35+row*.15,az+Math.cos(a)*.30,.06,.04,.035,'#b88936');}
  for(let n=0;n<7;n++){const a=n*Math.PI*2/7;const leaf=ball(garden,ax+Math.sin(a)*.17,1.28,az+Math.cos(a)*.17,.07,.37,.07,mint);leaf.rotation.z=-Math.sin(a)*.58;leaf.rotation.x=Math.cos(a)*.58;}
  // A jetty and moored fruit boat make the waterfront usable as scenery.
  const jetty=named('smoothie-fruit-jetty'),jx=cx+2.5,jz=-9.1;
  for(let n=0;n<15;n++)box(jetty,1.15,.10,.23,n%2?'#c89761':'#b88754',jx,-.015,jz-n*.25);
  for(const dx of [-.63,.63])for(const z of [jz-.25,jz-3.5]){cyl(jetty,jx+dx,.20,z,.067,.9,wood);cyl(jetty,jx+dx,.69,z,.084,.06,cream);}
  const boat=named('smoothie-moored-fruit-boat');
  ball(boat,0,0,0,.62,.22,1.35,'#d98758');ball(boat,0,.12,0,.51,.08,1.08,cream);
  for(const z of [-.58,.15,.62])box(boat,1.0,.08,.19,wood,0,.21,z);
  for(let n=0;n<8;n++)ball(boat,(n%2-.5)*.3,.26+Math.floor(n/4)*.1,-.39+Math.floor(n/2)*.18,.12,.11,.12,n%2?'#e7b44d':'#94b46e');
  join(boat);boat.position.set(jx+1.3,-.08,jz-1.6);boat.rotation.y=.1;
  addMotion({root:boat,step:t=>{boat.position.y=-.08+Math.sin(t*.8)*.026;boat.rotation.z=Math.sin(t*.65)*.025;}});
  tube(jetty,[v(jx+.63,.38,jz-.25),v(jx+.95,.12,jz-.65),v(jx+1.24,.1,jz-.52)],.018,cream);
  const ripples=named('smoothie-lagoon-ripples');
  for(let n=0;n<12+detail*3;n++){const x=cx-14+(n*4.23)%29,z=-10-(n*2.67)%12;ball(ripples,x,-.108,z,.38+(n%3)*.25,.008,.035,'#b2ded0');}
  join(ripples);addMotion({root:ripples,step:t=>{ripples.position.x=Math.sin(t*.18)*.3;ripples.position.z=Math.sin(t*.22)*.22;}});
  const walker=actor('#f0b56e',1.06);walker.root.name='smoothie-promenade-walker';
  walking(walker,t=>{const angle=Math.PI*.5+Math.sin(t*.045)*.58,[x,z]=arc(angle,radius-1.02);return v(x,.035,z);});
  join(water);join(shore);join(market,true);join(garden,true);join(jetty);
 }else{
  root.userData.composition='terraced-vineyard-courtyard';
  const terrain=named('wines-terraced-vineyard'),cellar=named('wines-arched-cellar'),courtyard=named('wines-tasting-courtyard'),pergola=named('wines-vine-pergola');
  const stone='#d3bf99',trim='#e9d8b7',wood='#715237',green='#7a914e',wine='#774354';
  box(terrain,width+28,.20,height+21,'#a8ac7c',cx,-.29,(height-13)/2);
  box(courtyard,width+12,.10,height+8,'#b8a282',cx,-.13,(height-5)/2);
  // Small limestone paving follows a radial courtyard pattern around the truck.
  for(let row=0;row<5;row++)for(let col=0;col<width+13;col++)box(courtyard,.92,.022,.64,(row+col)%3?'#d7c7aa':'#c6b391',col-6+(row%2)*.30,-.062,-2.0-row*.69);
  for(const x of [-3.8,width+3.6])for(let n=0;n<6;n++)box(courtyard,1.2,.024,.86,n%2?trim:stone,x,-.053,1+n*.93);
  // Low stepped terraces preserve the vineyard view instead of hiding it behind shops.
  for(let row=0;row<3;row++){
   const z=-6.6-row*3.25,level=.18+row*.30;
   box(terrain,width+17,.31,3.15,'#969d64',cx,level-.20,z-1.3);
   box(terrain,width+17,.36,.26,stone,cx,level-.15,z+.23);
   for(let j=0;j<width+17;j++)box(terrain,.94,.07,.30,j%2?trim:stone,cx-(width+16)/2+j,level+.07,z+.23);
   const vines=quality==='low'?6:quality==='medium'?8:11;
   for(let n=0;n<vines;n++){
    const spacing=(width+11)/(vines-1),x=cx-(width+11)/2+n*spacing,vz=z-1.05;cyl(terrain,x,level+.54,vz,.04,1.18,wood);
    box(terrain,spacing+.02,.035,.035,wood,x,level+.87,vz);box(terrain,spacing+.02,.023,.025,'#76765a',x,level+.43,vz);
    for(let j=0;j<3;j++){ball(terrain,x+(j-1)*spacing/3,level+.80,vz,spacing*.20,.22,.28,(j+n)%2?green:'#94a55a');if(row<2&&j!==1)grapes(terrain,x+(j-1)*spacing/3,level+.59,vz+.21,.066);}
   }
  }
  // A central flight of steps and slender cypresses lead into the estate.
  for(let n=0;n<7;n++)box(courtyard,1.38,.13,1.0,trim,cx,.015+n*.105,-5.65-n*.94);
  for(const x of [-7.2,width+5.8])for(const z of [-7.3,-12.1]){cyl(terrain,x,.45,z,.09,.9,wood);ball(terrain,x,1.42,z,.38,1.22,.38,'#526a49');ball(terrain,x,2.31,z,.24,.55,.24,'#5e794e');}
  // One working winery building on the left: true open arches, thick voussoirs,
  // a barrel cellar and a pitched terracotta roof, rather than a shopfront strip.
  const bx=-5.1,bz=-3.1,bw=4.45;
  box(cellar,bw,.20,3.8,stone,bx,.015,bz);
  box(cellar,bw,2.55,.23,stone,bx,1.35,bz-1.72);
  for(const side of [-1,1])box(cellar,.25,2.55,3.6,stone,bx+side*(bw/2-.12),1.35,bz);
  const front=bz+1.78;
  for(const dx of [-1.47,0,1.47]){
   const ax=bx+dx,inner=.48,outer=.66,base=1.48;
   for(const side of [-1,1]){box(cellar,.18,1.38,.34,trim,ax+side*.57,.77,front);box(cellar,.28,.13,.42,trim,ax+side*.57,1.41,front);}
   const shape=new T.Shape();shape.absarc(0,0,outer,0,Math.PI,false);shape.lineTo(-inner,0);shape.absarc(0,0,inner,Math.PI,0,true);shape.closePath();
   mesh(new T.ExtrudeGeometry(shape,{depth:.35,bevelEnabled:false,curveSegments:12}),trim,ax,base,front-.17,cellar);
   for(let n=0;n<9;n++){const a=(n+.5)*Math.PI/9;const joint=box(cellar,.016,.16,.012,'#bba582',ax+Math.cos(a)*.575,base+Math.sin(a)*.575,front+.19);joint.rotation.z=a-Math.PI/2;}
   barrel(cellar,ax,.15,bz+.40,.92);bottle(cellar,ax,.91,bz+.40);
  }
  box(cellar,bw,.28,.35,stone,bx,2.28,front);box(cellar,bw+.25,.13,4.08,wood,bx,2.52,bz);
  for(const side of [-1,1]){const roof=box(cellar,bw+.50,.16,2.3,'#a66e50',bx,2.91,bz+side*.98);roof.rotation.x=side*.30;
   for(let n=0;n<19;n++){const r=cyl(cellar,bx-bw/2+n*bw/18,2.995,bz+side*.98,.055,2.33,n%2?'#bd8259':'#a9714f',.055,6);r.rotation.x=Math.PI/2+side*.30;}}
  cyl(cellar,bx,3.26,bz,.09,bw+.55,'#c48c64',.09,8).rotation.z=Math.PI/2;
  // Gable triangles fill the roof ends without blocking the open arcade.
  const gable=new T.Shape();gable.moveTo(-1.9,0);gable.lineTo(0,.62);gable.lineTo(1.9,0);gable.closePath();
  for(const side of [-1,1]){const end=mesh(new T.ExtrudeGeometry(gable,{depth:.12,bevelEnabled:false}),stone,bx+side*bw/2,2.52,bz,cellar);end.rotation.y=Math.PI/2;}
  // Bottle racks sit inside the visible cellar. They are actual bottle shapes.
  for(let row=0;row<(quality==='low'?2:3);row++){box(cellar,3.70,.07,.36,wood,bx,.5+row*.48,bz-1.44);const count=quality==='low'?7:11;for(let n=0;n<count;n++)bottle(cellar,bx-1.57+n*3.14/(count-1),.54+row*.48,bz-1.39,n%3?'#354d3c':'#796541');}
  // The other side is an open vine pergola, set diagonally around a tasting terrace.
  const tx=width+3.6,tz=-.6;
  softBox(pergola,4.5,.18,3.35,stone,tx,-.015,tz);
  for(const dx of [-1.9,1.9])for(const dz of [-1.34,1.34]){box(pergola,.17,2.2,.17,wood,tx+dx,1.14,tz+dz);box(pergola,.32,.17,.32,trim,tx+dx,.13,tz+dz);}
  for(const dz of [-1.34,1.34])box(pergola,4.5,.16,.16,wood,tx,2.26,tz+dz);
  for(let n=0;n<9;n++)box(pergola,.09,.12,3.55,wood,tx-1.96+n*.49,2.4,tz);
  for(let n=0;n<11+detail*2;n++){const x=tx-1.9+n%7*.61,z=tz-1.15+Math.floor(n/7)*2.30;ball(pergola,x,2.48,z,.40,.12,.35,n%2?green:'#9aab69');if(n%3===0)grapes(pergola,x,2.28,z,.085);}
  for(const dx of [-.90,.90]){cafeTable(pergola,tx+dx,tz);bottle(pergola,tx+dx,.72,tz);cyl(pergola,tx+dx+.18,.83,tz,.035,.17,trim);}
  // A barrel-top tasting corner and a real harvest cart close the near corners.
  for(const [x,z] of [[-4.2,1.1],[width+3.5,1.3]]){barrel(courtyard,x,0,z);cyl(courtyard,x,.86,z,.54,.075,wood);bottle(courtyard,x,.9,z);bench(courtyard,x,z+1.2,wood);}
  // Low garden walls, lavender and lanterns make the courtyard feel enclosed,
  // while preserving all front-facing kitchen and guest sightlines.
  for(const side of [-1,1]){
   const gx=side<0?-5.5:width+5.35,gz=height+1.25;
   softBox(courtyard,1.3,.28,3.55,stone,gx,.07,gz);box(courtyard,1.12,.035,3.31,'#817d52',gx,.23,gz);
   for(let n=0;n<5;n++){
    const z=gz-1.28+n*.64;ball(courtyard,gx,.44,z,.37,.26,.39,'#829660');
    for(let j=0;j<(quality==='low'?2:4);j++){const x=gx+(j-1.5)*.16;cyl(courtyard,x,.67,z,.026,.36,'#6f7960',.018,5);ball(courtyard,x,.86,z,.052,.15,.053,j%2?'#987da1':'#b39aa9');}
   }
   for(const dz of [-1.95,1.95]){
    const z=gz+dz;box(courtyard,.51,.64,.51,stone,gx,.25,z);box(courtyard,.63,.10,.63,trim,gx,.62,z);
    box(courtyard,.055,.44,.055,wood,gx,.88,z);softBox(courtyard,.25,.30,.25,'#f1d095',gx,1.12,z);box(courtyard,.34,.06,.34,wood,gx,1.31,z);
    for(const dx of [-.115,.115])for(const zz of [-.115,.115])box(courtyard,.02,.30,.02,wood,gx+dx,1.12,z+zz);
   }
   for(let n=0;n<5;n++)box(courtyard,1.48,.025,.78,n%2?stone:trim,gx-side*1.65,-.03,gz-1.70+n*.86);
  }
  const cart=named('wines-harvest-cart');
  softBox(cart,1.45,.17,.91,wood,0,.38,0);for(const side of [-1,1]){box(cart,.07,.42,1.02,wood,side*.71,.62,0);for(const z of [-.37,.37]){const wheel=cyl(cart,side*.8,.30,z,.27,.075,'#594b3a',.27,16);wheel.rotation.z=Math.PI/2;}}
  for(const z of [-.49,.49])box(cart,1.49,.38,.06,wood,0,.64,z);
  for(let n=0;n<8;n++)grapes(cart,(n%4-1.5)*.28,.82,-.18+Math.floor(n/4)*.34,.095);
  rod(cart,v(-.5,.42,.52),v(-.5,.74,1.5),.035,wood);rod(cart,v(.5,.42,.52),v(.5,.74,1.5),.035,wood);
  join(cart);cart.position.set(width+5.7,0,1.5);cart.rotation.y=-.28;
  // Subtle moving water in a stone basin. It does not compete with the kitchen.
  const fountain=named('wines-courtyard-fountain'),fx=cx+3.1,fz=-4.1;
  cyl(fountain,fx,.15,fz,.73,.31,stone,.79,20);cyl(fountain,fx,.32,fz,.65,.025,'#8bb0a2',.65,20);cyl(fountain,fx,.66,fz,.09,.68,trim);cyl(fountain,fx,.99,fz,.34,.12,trim);
  const stream=named('wines-fountain-water');for(let n=0;n<5;n++){const a=n*Math.PI*2/5;tube(stream,[v(fx+Math.sin(a)*.27,1.0,fz+Math.cos(a)*.27),v(fx+Math.sin(a)*.44,.86,fz+Math.cos(a)*.44),v(fx+Math.sin(a)*.49,.36,fz+Math.cos(a)*.49)],.012,'#c1d6bf');}
  join(stream);addMotion({root:stream,step:t=>stream.position.y=Math.sin(t*.9)*.007});
  const visitor=actor(wine,1.05);visitor.root.name='wines-cellar-visitor';
  walking(visitor,t=>v(cx+Math.sin(t*.095)*2.35,.025,-3+Math.cos(t*.095)*.48));
  join(terrain);join(courtyard);join(cellar,true);join(pergola,true);join(fountain);
 }
 root.updateMatrixWorld(true);
}
