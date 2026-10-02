import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { miniatureMaterial, type MiniatureSurface } from './material-library';

/** Original miniature cast. Metres, floor at zero, forward -Z. Shared art is
 * immutable; skeletons, expression controls and inventory anchors are per actor. */
export interface CharacterRig {
  body:THREE.Group; chest:THREE.Group; head:THREE.Group; eyes:THREE.Group[];
  brows:THREE.Group[]; smile:THREE.Group; openMouth:THREE.Group;
  arms:THREE.Group[]; elbows:THREE.Group[]; legs:THREE.Group[]; knees:THREE.Group[];
  held:THREE.Group; props:{cook:THREE.Group;spoon:THREE.Group;knife:THREE.Group;wash:THREE.Group;eat:THREE.Group};
  phase:number; blinkPeriod:number; isChef:boolean;
}
export interface CharacterWork {stationKind?:string;recipeId?:string;seatHeight?:number}
export interface CharacterFrame {delta?:number;speed?:number;reducedMotion?:boolean}

const C={cream:'#f8f0dc',ink:'#303b34',sage:'#375e4e',red:'#b95743',gold:'#d0a15c',sole:'#66523b'};
const geometries=new Map<string,THREE.BufferGeometry>();
function geometry(key:string,make:()=>THREE.BufferGeometry){
  let result=geometries.get(key);
  if(!result){result=make();result.userData.sharedKitResource=true;geometries.set(key,result);}
  return result;
}
function mesh(g:THREE.BufferGeometry,color:string,surface:MiniatureSurface='fabric',x=0,y=0,z=0){
  const m=new THREE.Mesh(g,miniatureMaterial(color,surface));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;
}
function sphere(r:number,color:string,x=0,y=0,z=0,surface:MiniatureSurface='fabric'){
  return mesh(geometry(`sphere:${r}`,()=>new THREE.SphereGeometry(r,24,16)),color,surface,x,y,z);
}
function box(w:number,h:number,d:number,color:string,x=0,y=0,z=0,r=.015,surface:MiniatureSurface='fabric'){
  return mesh(geometry(`box:${w}:${h}:${d}:${r}`,()=>new RoundedBoxGeometry(w,h,d,3,Math.min(r,w/2.01,h/2.01,d/2.01))),color,surface,x,y,z);
}
function cylinder(top:number,bottom:number,h:number,color:string,x=0,y=0,z=0,surface:MiniatureSurface='fabric'){
  return mesh(geometry(`cylinder:${top}:${bottom}:${h}`,()=>new THREE.CylinderGeometry(top,bottom,h,32)),color,surface,x,y,z);
}
function group(...parts:THREE.Object3D[]){const g=new THREE.Group();if(parts.length)g.add(...parts);return g;}

/** Bake only fixed direct children, preserving skin/fabric response as well as
 * colour. Articulated and expression groups retain their own draw transforms. */
function batch(g:THREE.Group,key:string){
  const bins=new Map<THREE.Material,THREE.Mesh[]>();
  for(const child of g.children)if(child instanceof THREE.Mesh&&!Array.isArray(child.material)){
    const bin=bins.get(child.material)??[];bin.push(child);bins.set(child.material,bin);
  }
  for(const [material,parts] of bins){
    if(parts.length<2)continue;
    const merged=geometry(`batch:${key}:${material.name}`,()=>{
      const positions:number[]=[],normals:number[]=[],p=new THREE.Vector3(),n=new THREE.Vector3(),nm=new THREE.Matrix3();
      for(const part of parts){
        part.updateMatrix();nm.getNormalMatrix(part.matrix);
        const pos=part.geometry.getAttribute('position'),normal=part.geometry.getAttribute('normal'),index=part.geometry.index;
        for(let i=0;i<(index?.count??pos.count);i++){
          const v=index?index.getX(i):i;p.fromBufferAttribute(pos,v).applyMatrix4(part.matrix);n.fromBufferAttribute(normal,v).applyMatrix3(nm).normalize();
          positions.push(p.x,p.y,p.z);normals.push(n.x,n.y,n.z);
        }
      }
      const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return result;
    });
    const m=new THREE.Mesh(merged,material);m.castShadow=true;m.receiveShadow=true;g.remove(...parts);g.add(m);
  }
  return g;
}

const FACE_R=.335;
function faceWidth(y:number){return 1.01+.083*Math.exp(-(((y+.085)/.14)**2));}
function faceZ(x:number,y:number){return -.88*Math.sqrt(Math.max(.00001,FACE_R*FACE_R-y*y-(x/faceWidth(y))**2));}
function faceGeometry(){return geometry('pear-face-v1',()=>{
  const g=new THREE.SphereGeometry(FACE_R,40,28),p=g.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)*faceWidth(p.getY(i)),p.getY(i),p.getZ(i)*.88);
  g.computeVertexNormals();return g;
});}
function hairGeometry(){return geometry('tailored-hair-v1',()=>{
  const cols=40,rows=18,g=new THREE.SphereGeometry(1,cols,rows,0,Math.PI*2,0,Math.PI/2),p=g.getAttribute('position');
  for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
    const a=col/cols*Math.PI*2,front=Math.max(0,-Math.sin(a));
    const line=-.067+.242*front**3,theta=row/rows*Math.acos(line/FACE_R),y=FACE_R*Math.cos(theta),radius=FACE_R*Math.sin(theta);
    p.setXYZ(row*(cols+1)+col,-Math.cos(a)*radius*faceWidth(y)*1.019,y*1.019,Math.sin(a)*radius*.899);
  }
  g.computeVertexNormals();return g;
});}
function pigment(side:number,color:string){
  return mesh(geometry(`fitted-cheek:${side}`,()=>{
    const points:number[]=[],cx=side*.211,cy=-.071;
    for(let i=0;i<32;i++)for(const a of [null,(i+1)/32*Math.PI*2,i/32*Math.PI*2]){
      const x=cx+(a===null?0:Math.cos(a)*.052),y=cy+(a===null?0:Math.sin(a)*.026);points.push(x,y,faceZ(x,y)-.0018);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.computeVertexNormals();return g;
  }),color,'skin');
}
function fittedLine(key:string,points:THREE.Vector3[],r:number,color:string){
  return mesh(geometry(key,()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),20,r,6,false)),color,'skin');
}

function cashierCap(){
  const cols=40,rows=20,radius=.36,hem=(angle:number)=>.115+.072*Math.max(0,-Math.sin(angle))**2;
  const crown=mesh(geometry('fitted-diner-cap-crown-v1',()=>{
    const g=new THREE.SphereGeometry(1,cols,rows,0,Math.PI*2,0,Math.PI/2),p=g.getAttribute('position');
    for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){
      const a=col/cols*Math.PI*2,theta=row/rows*Math.acos(hem(a)/radius),y=radius*Math.cos(theta),r=radius*Math.sin(theta);
      p.setXYZ(row*(cols+1)+col,-Math.cos(a)*r*faceWidth(y),y,Math.sin(a)*r*.895);
    }
    g.computeVertexNormals();return g;
  }),C.cream);
  crown.name='cashier-cap-crown';
  const band=mesh(geometry('fitted-diner-cap-band-v1',()=>{
    const positions:number[]=[],indices:number[]=[];
    for(let row=0;row<3;row++)for(let col=0;col<=cols;col++){
      const a=col/cols*Math.PI*2,y=hem(a)+row*.019,r=Math.sqrt(radius*radius-y*y)*1.006;
      positions.push(-Math.cos(a)*r*faceWidth(y),y,Math.sin(a)*r*.895);
      if(row<2&&col<cols){const v=row*(cols+1)+col;indices.push(v,v+1,v+cols+1,v+1,v+cols+2,v+cols+1);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }),C.red);
  const visor=mesh(geometry('curved-diner-cap-visor-v1',()=>{
    const columns=32,depthRows=4,count=(columns+1)*(depthRows+1),positions:number[]=[],indices:number[]=[];
    for(let layer=0;layer<2;layer++)for(let row=0;row<=depthRows;row++)for(let col=0;col<=columns;col++){
      const u=col/columns*2-1,v=row/depthRows,x=.282*u,y=.180-.033*u*u;
      const back=-Math.sqrt(radius*radius-y*y-(x/faceWidth(y))**2)*.895;
      positions.push(x,y-.016*v-.010*v*v-layer*.015,back-v*(.025+.110*(1-u*u)));
      if(row<depthRows&&col<columns){const a=layer*count+row*(columns+1)+col,b=a+1,c=a+columns+1,d=c+1;if(layer===0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);}
    }
    // Close every edge so the underside and side profile are real cloth, even
    // at an upward camera angle. The crown itself has a closed, shared pole.
    const edge=(a:number,b:number)=>indices.push(a,a+count,b,b,a+count,b+count);
    for(let col=0;col<columns;col++){edge(col+1,col);edge(depthRows*(columns+1)+col,depthRows*(columns+1)+col+1);}
    for(let row=0;row<depthRows;row++){edge(row*(columns+1),(row+1)*(columns+1));edge((row+1)*(columns+1)+columns,row*(columns+1)+columns);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
  }),C.red);
  const trim=batch(group(band,visor),'diner-cap-trim-v1');trim.name='cashier-cap-band-and-visor';
  const cap=group(crown,trim);cap.name='cashier-cap';return cap;
}

/** A single weighted surface crosses the joint. The sleeve/trouser cannot open
 * a gap when the elbow or knee bends; hands and shoes follow the distal bone. */
function limb(kind:'arm'|'leg',color:string){
  const arm=kind==='arm',joint=arm?.208:.275,length=arm?.345:.557;
  const g=geometry(`continuous-${kind}`,()=>{
    const rows=18,cols=16,positions:number[]=[],indices:number[]=[],weights:number[]=[],boneIndices:number[]=[],uv:number[]=[];
    for(let row=0;row<=rows;row++){
      const d=row/rows*length,t=row/rows;
      const radius=arm?(.085-.023*t+.008*Math.sin(t*Math.PI)):(.098-.019*t);
      // Slightly gathered shoulder and wrist, with enough joint topology for a
      // rounded bend; no separate elbow sphere or disconnected cylinders.
      const end=arm?(row===0?.78:row===rows?.91:1):1;
      const distal=THREE.MathUtils.smoothstep(d,joint-.065,joint+.065);
      for(let col=0;col<=cols;col++){
        const a=col/cols*Math.PI*2;positions.push(Math.cos(a)*radius*end,-d,Math.sin(a)*radius*(arm?.94:1));
        boneIndices.push(0,1,0,0);weights.push(1-distal,distal,0,0);uv.push(col/cols,t);
        if(row<rows&&col<cols){const v=row*(cols+1)+col;indices.push(v,v+1,v+cols+1,v+1,v+cols+2,v+cols+1);}
      }
    }
    const top=(rows+1)*(cols+1),bottom=top+1;
    positions.push(0,.016,0,0,-length,0);boneIndices.push(0,1,0,0,0,1,0,0);weights.push(1,0,0,0,0,1,0,0);uv.push(.5,0,.5,1);
    for(let col=0;col<cols;col++)indices.push(top,col+1,col,bottom,rows*(cols+1)+col,rows*(cols+1)+col+1);
    const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    result.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(boneIndices,4));result.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));result.setIndex(indices);result.computeVertexNormals();
    const normals=result.getAttribute('normal'),n=new THREE.Vector3();
    for(let row=0;row<=rows;row++){const a=row*(cols+1),b=a+cols;n.set(normals.getX(a)+normals.getX(b),normals.getY(a)+normals.getY(b),normals.getZ(a)+normals.getZ(b)).normalize();normals.setXYZ(a,n.x,n.y,n.z);normals.setXYZ(b,n.x,n.y,n.z);}
    return result;
  });
  const pivot=new THREE.Group(),bend=new THREE.Group(),upper=new THREE.Bone(),lower=new THREE.Bone();
  bend.position.y=-joint;upper.add(bend);bend.add(lower);pivot.add(upper);
  const skin=new THREE.SkinnedMesh(g,miniatureMaterial(color,'fabric'));skin.name=`continuous-${kind}`;skin.castShadow=true;skin.receiveShadow=true;
  // Binding while the limb is in its own rest coordinates makes the whole cast
  // independent of where the scene eventually places the actor.
  pivot.add(skin);pivot.updateMatrixWorld(true);skin.bind(new THREE.Skeleton([upper,lower]));
  // A conservative static bound covers every supported pose without recomputing
  // a deformed bound per actor/frame during renderer frustum culling.
  skin.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,-length/2,0),length+.12);
  return {pivot,bend,tip:lower};
}

function actingProps(){
  const cook=group(cylinder(.021,.022,.192,C.red,0,-.027),box(.024,.155,.016,'#b8c5b7',0,-.192,0,.005,'metal'),box(.108,.130,.019,'#bbc6b7',0,-.317,0,.012,'metal'));
  for(const x of [-.028,0,.028])cook.add(box(.009,.075,.021,C.ink,x,-.317,0,.003,'metal'));
  const spoon=group(cylinder(.014,.016,.35,C.sole,0,-.115,0,'wood'));const bowl=sphere(.050,C.sole,0,-.300,0,'wood');bowl.scale.set(.70,1,.23);spoon.add(bowl);
  const knife=group(box(.030,.118,.027,C.ink,0,-.012),box(.060,.185,.014,'#bbc3ae',.017,-.164,0,.006,'metal'));
  const wash=group(box(.110,.039,.092,C.gold,0,-.045,-.035,.014),box(.110,.013,.092,C.sage,0,-.069,-.035,.006));
  const eat=group(box(.018,.155,.014,'#bbc3ae',0,-.046,0,.006,'metal'),box(.052,.019,.013,'#bbc3ae',0,-.124,0,.004,'metal'));
  for(const x of [-.02,0,.02])eat.add(box(.010,.040,.012,'#bbc3ae',x,-.148,0,.003,'metal'));
  for(const [name,prop] of Object.entries({cook,spoon,knife,wash,eat})){batch(prop,`tool:${name}`);prop.name=`acting-${name}`;prop.visible=false;}
  // Shafts pass through the palm origin. Wrist angles aim their working ends
  // down onto a station, rather than letting the forearm point tools skyward.
  cook.rotation.x=-1.10;spoon.rotation.x=-1.50;knife.rotation.x=-1.63;wash.rotation.x=-1.61;
  return {cook,spoon,knife,wash,eat};
}

export function createCharacter(role='chef',look=0,uniform?:string){
  const style=Math.abs(Math.floor(Number.isFinite(look)?look:0))%20,staff=role!=='customer';
  const skin=['#e5b18b','#bf865f','#855c42','#f0c4a0'][style%4],hair=['#66452e','#333229','#ad763f','#705e43'][style%4];
  const shirt=role==='chef'||role==='waiter'?C.cream:role==='cashier'?C.red:['#b85e49','#648b91','#cca35a','#5d8268','#947386'][style%5];
  const defaultServerUniform=role==='waiter'&&(!uniform||['#365f55',C.sage].includes(uniform.toLowerCase()));
  const apron=defaultServerUniform?C.red:uniform??C.sage,trousers=role==='customer'?['#4d584a','#514b43','#52655a'][style%3]:'#344c3e';
  const root=new THREE.Group(),body=new THREE.Group(),chest=new THREE.Group(),head=new THREE.Group();
  root.name=`miniature-${role}`;root.add(body);body.add(chest,head);head.position.y=1.36;
  const torso=mesh(geometry('tailored-torso-v1',()=>{
    const g=new THREE.SphereGeometry(1,32,24),p=g.getAttribute('position');
    for(let i=0;i<p.count;i++){const y=p.getY(i),full=1-.09*y+.08*Math.exp(-(((y+.45)/.5)**2));p.setXYZ(i,p.getX(i)*.254*full,.87+y*.255,p.getZ(i)*.170);}
    g.computeVertexNormals();return g;
  }),shirt);
  chest.add(torso,box(.40,.115,.275,trousers,0,.687,0,.051),cylinder(.084,.090,.115,skin,0,1.116,0,'skin'));
  for(const side of [-1,1]){const collar=box(.093,.091,.030,C.cream,side*.058,1.073,-.123,.020);collar.rotation.z=side*.38;chest.add(collar);}
  if(staff){
    // Front cloth is gently bowed over the belly, with a rounded hem and a
    // stitched pocket. The muted palette lets meals carry the brightest colour.
    const panel=box(.362,.363,.038,apron,0,.788,-.162,.045);panel.rotation.x=-.09;
    chest.add(panel,box(.227,.19,.034,apron,0,.994,-.150,.034));
    for(const x of [-.102,.102])chest.add(box(.026,.185,.026,apron,x,1.058,-.115,.010));
    chest.add(box(.196,.099,.021,C.cream,0,.790,-.197,.018),box(.175,.007,.007,C.gold,0,.824,-.211,.003));
    for(const x of [-.099,.099])chest.add(sphere(.012,C.gold,x,1.055,-.158,'metal'));
    const tie=box(.070,.065,.028,role==='chef'?C.red:apron,0,1.091,-.157,.017);tie.rotation.z=Math.PI/4;chest.add(tie);
    if(role==='waiter'){
      const towel=group(),cloth=box(.117,.233,.034,C.cream,.221,.701,-.050,.015);cloth.rotation.z=-.08;towel.name='server-towel';
      towel.add(cloth,box(.081,.012,.037,apron,.228,.615,-.052,.004));chest.add(towel);
      const badge=group(box(.091,.040,.015,C.gold,-.037,.992,-.174,.013,'metal'));badge.name='server-badge';chest.add(badge);
    }
  }else{
    chest.add(box(.077,.080,.020,C.cream,.102,.961,-.157,.016));
    for(const y of [.995,.932,.870])chest.add(sphere(.010,C.ink,-.032,y,-.170));
    if(style%3===0)for(const y of [.774,.819])chest.add(box(.395,.018,.018,C.cream,0,y,-.160,.006));
  }
  batch(chest,`torso:${role}:${style}:${apron}`);
  const face=mesh(faceGeometry(),skin,'skin');face.name='face-surface';head.add(face);
  const features=new THREE.Group();head.add(features);features.add(mesh(hairGeometry(),hair));
  const blush=batch(group(pigment(-1,style%4===2?'#a87258':'#d99178'),pigment(1,style%4===2?'#a87258':'#d99178')),`blush:${style%4}`);
  blush.name='face-pigment';blush.traverse(part=>{part.castShadow=false;part.receiveShadow=false;});head.add(blush);
  for(const side of [-1,1]){
    const ear=sphere(.053,skin,side*.333,-.012,.014,'skin');ear.scale.set(.76,1,.72);features.add(ear);
    const inner=sphere(.022,style%4===2?'#a87258':'#ce9276',side*.355,-.007,-.012,'skin');inner.scale.set(.45,.82,.45);features.add(inner);
  }
  const nose=sphere(.028,skin,0,-.042,faceZ(0,-.042)-.006,'skin');nose.scale.set(1.02,.86,.70);features.add(nose);
  const eyes:THREE.Group[]=[],brows:THREE.Group[]=[];
  for(const side of [-1,1]){
    const eye=group();eye.position.set(side*.117,.015,faceZ(side*.117,.015)-.006);eye.rotation.y=-side*.30;
    const pupil=sphere(.034,C.ink,0,0,0,'skin');pupil.scale.set(.82,1.08,.39);
    eye.add(pupil,sphere(.007,C.cream,-.008,.014,-.012,'ceramic'));head.add(eye);eyes.push(eye);
    const brow=group();brow.position.set(side*.118,.095,faceZ(side*.118,.095)-.006);brow.rotation.y=-side*.28;
    const points=Array.from({length:9},(_,i)=>new THREE.Vector3(-.040+i*.010,Math.sin(i/8*Math.PI)*.009,0));
    brow.add(fittedLine('soft-eyebrow',points,.008,hair));head.add(brow);brows.push(brow);
  }
  const smile=group(),openMouth=group();smile.position.y=-.088;openMouth.position.set(0,-.099,faceZ(0,-.099)-.005);
  smile.add(fittedLine('fitted-smile-v1',Array.from({length:17},(_,i)=>{const x=-.049+i/16*.098,y=-.026*Math.sin(i/16*Math.PI);return new THREE.Vector3(x,y,faceZ(x,y-.088)-.002);}),.0065,'#80563d'));
  const inside=sphere(.032,'#744634',0,0,0,'skin');inside.scale.set(1,.74,.17);openMouth.add(inside);
  const tongue=sphere(.020,'#d4967d',0,-.012,-.004,'skin');tongue.scale.set(1,.36,.12);openMouth.add(tongue);openMouth.visible=false;head.add(smile,openMouth);
  if(role==='chef'){
    features.add(cylinder(.250,.264,.098,C.cream,0,.291),cylinder(.265,.266,.022,apron,0,.251));
    // One fluted crown gives the toque a soft continuous silhouette, rather
    // than an assembly of visible balls. It remains under the 2.1 m envelope.
    features.add(mesh(geometry('chef-toque-v1',()=>{
      const g=new THREE.SphereGeometry(1,48,24),p=g.getAttribute('position');
      for(let i=0;i<p.count;i++){
        const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(z,x),r=1+.055*Math.cos(a*6)*(1-y*y);
        p.setXYZ(i,x*.285*r,.405+y*.164,z*.244*r);
      }
      g.computeVertexNormals();return g;
    }),C.cream));
  }else{
    // A swept lock intersects only its own fitted cap, leaving the face clean.
    if(role!=='cashier'){
      const lock=sphere(.121,hair,-.103,.238,-.132);lock.scale.set(1.33,.50,.77);lock.rotation.z=.24;features.add(lock);
      if(style%3===1)for(const side of [-1,1]){const tuft=sphere(.092,hair,side*.260,.063,.106);tuft.scale.set(.55,1.4,1);features.add(tuft);}
      if(style%4===2)for(const side of [-1,1]){const bun=sphere(.098,hair,side*.224,.197,.201);bun.scale.y=.88;features.add(bun);}
    }
    if(style%4===1){
      for(const side of [-1,1]){
        const lens=mesh(geometry('glasses-rim',()=>new THREE.TorusGeometry(.052,.006,6,28)),C.ink,'paint',side*.118,.015,faceZ(side*.118,.015)-.022);lens.rotation.y=-side*.30;features.add(lens);
      }
      features.add(box(.076,.009,.010,C.ink,0,.025,-.307,.004,'paint'));
    }
    if(role==='cashier')head.add(cashierCap());
  }
  batch(features,`head:${role}:${style}:${apron}`);
  const arms:THREE.Group[]=[],elbows:THREE.Group[]=[],legs:THREE.Group[]=[],knees:THREE.Group[]=[],props=actingProps();
  for(const side of [-1,1]){
    const arm=limb('arm',shirt);arm.pivot.position.set(side*.247,1.031,.010);arm.pivot.name=`${side<0?'left':'right'}-arm`;
    const hand=group(),palm=sphere(.066,skin,0,-.161,0,'skin');hand.name=`${side<0?'left':'right'}-hand`;palm.scale.set(.88,1.04,.78);hand.add(palm);
    hand.add(sphere(.027,skin,-side*.045,-.152,-.033,'skin'),cylinder(.063,.061,.035,C.cream,0,-.126));batch(hand,`hand:${style%4}:${side}`);arm.tip.add(hand);
    if(side===-1){const grip=group(props.cook,props.spoon,props.knife,props.wash,props.eat);grip.name='left-hand-grip';grip.position.y=-.161;arm.tip.add(grip);}
    body.add(arm.pivot);arms.push(arm.pivot);elbows.push(arm.bend);
    const leg=limb('leg',trousers);leg.pivot.position.set(side*.111,.62,0);
    const shoes=group(box(.185,.093,.272,C.ink,0,-.292,-.051,.043,'paint'),box(.189,.020,.277,C.sole,0,-.335,-.051,.009,'wood'));
    // A small toe highlight is actual leather geometry, not a painted glow.
    shoes.add(box(.114,.017,.094,'#455348',0,-.256,-.115,.008,'paint'));batch(shoes,`shoes:${role}`);leg.tip.add(shoes);
    body.add(leg.pivot);legs.push(leg.pivot);knees.push(leg.bend);
  }
  const held=group();held.name='authoritative-held-item';held.position.set(0,.90,-.39);body.add(held);
  root.userData.rig={body,chest,head,eyes,brows,smile,openMouth,arms,elbows,legs,knees,held,props,phase:(style*1.618+(role==='waiter'?2.4:role==='customer'?.9:0))%7.2,blinkPeriod:4.6+(style%5)*.37,isChef:role==='chef'} satisfies CharacterRig;
  root.userData.characterKit='continuous-cast-v1';root.updateMatrixWorld(true);return root;
}

// Each action has contact, anticipation, action and recovery keys. Smoothstep
// interpolation holds a readable pose instead of endlessly waving every joint.
type Key=readonly [number,number];
function track(phase:number,keys:readonly Key[]){
  const t=((phase%1)+1)%1;
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const a=keys[i-1],b=keys[i],u=THREE.MathUtils.smoothstep(t,a[0],b[0]);return THREE.MathUtils.lerp(a[1],b[1],u);}
  return keys[keys.length-1][1];
}
function shoeContactY(hip:number,knee:number,side:number,roll:number){
  const a=hip+knee,localY=.62-.275*Math.cos(hip)-.335*Math.cos(a)+.051*Math.sin(a)-.010*Math.abs(Math.cos(a))-.1385*Math.abs(Math.sin(a));
  return localY*Math.cos(roll)+side*.111*Math.sin(roll)-.0945*Math.abs(Math.sin(roll));
}
interface Motion {key:string;seated:boolean;time:number;clock:number;blend:number;from:Float32Array;current:Float32Array;target:Float32Array}
const POSE_SIZE=27;
// Indices: body y/yaw/roll; head xyz; left/right shoulder xyz; elbow xz;
// left/right hip x; knee x; chest pitch; expression greeting/savor/focus.
function makePose(rig:CharacterRig,time:number,clock:number,key:string,seated:boolean,work:CharacterWork|undefined,reduced:boolean,out:Float32Array){
  out.fill(0);const breath=Math.sin((time+rig.phase)*1.6),idle=(time+rig.phase)/8;
  out[0]=seated?(work?.seatHeight??.48)-.63:0;out[3]=breath*.007;out[4]=track(idle,[[0,-.045],[.14,-.045],[.30,.060],[.65,.060],[.82,-.045],[1,-.045]]);
  out[8]=-.035;out[11]=.035;out[12]=.11;out[14]=.11;
  if(seated){out[16]=out[17]=Math.PI/2;out[18]=out[19]=-Math.PI/2;out[6]=out[9]=.72;out[12]=out[14]=.56;}
  if(key.startsWith('walk')){
    const p=clock/.78,swing=track(p,[[0,.39],[.12,.32],[.50,-.39],[.63,-.30],[1,.39]]),bend=track(p,[[0,0],[.45,0],[.72,-.57],[.92,-.12],[1,0]]);
    out[16]=swing;out[17]=-swing;out[18]=bend;out[19]=track(p+.5,[[0,0],[.45,0],[.72,-.57],[.92,-.12],[1,0]]);
    out[0]=reduced?0:track(p*2,[[0,.008],[.30,.020],[.62,0],[1,.008]]);out[1]=swing*.052;out[2]=-swing*.024;
    out[6]=-swing*.67;out[9]=swing*.67;out[12]=out[14]=.20;out[5]=swing*.023;
  }
  if(key.includes('carry')){out[6]=out[9]=1.0;out[8]=.20;out[11]=-.20;out[12]=out[14]=.10;out[4]*=.4;}
  if(key==='cook'||key==='stir'||key==='chop'){
    out[3]=.09;out[4]=-.04;out[20]=.012;out[24]=1;out[25]=-.18;out[6]=1.46;out[9]=1.50;out[12]=.94;out[14]=.30;
    if(key==='chop'){
      const cut=track(clock/1.1,[[0,0],[.16,0],[.38,1],[.46,.1],[.57,0],[.70,.60],[.76,0],[1,0]]);
      out[6]=1.66-cut*.025;out[12]=.76+cut*.32;out[25]=-.24;out[3]+=cut*.020;
    }else if(key==='stir'){
      const p=clock/1.7;out[6]=1.60;out[12]=1.08;out[25]=-.20;
      out[7]=track(p,[[0,-.10],[.25,0],[.5,.10],[.75,0],[1,-.10]]);
      out[8]=track(p,[[0,0],[.25,.085],[.5,0],[.75,-.085],[1,0]]);
      out[12]+=track(p,[[0,.02],[.25,-.04],[.5,.02],[.75,.06],[1,.02]]);
    }else{
      const turn=track(clock/2.6,[[0,0],[.24,0],[.40,.8],[.51,1],[.61,.28],[.80,0],[1,0]]);
      out[12]+=turn*.25;out[7]=turn*.075;out[13]=turn*.12;
    }
  }else if(key==='wash'){
    const scrub=track(clock/1.2,[[0,-1],[.20,1],[.39,-1],[.60,1],[.80,-1],[1,-1]]);
    out[3]=.09;out[24]=1;out[25]=-.30;out[6]=1.52;out[8]=scrub*.065;out[12]=.09;out[9]=1.50;out[14]=.18;
  }else if(key==='eat'){
    const bite=track(clock/3.8,[[0,0],[.16,0],[.38,1],[.52,1],[.71,0],[1,0]]);
    out[6]=.84+bite*.30;out[8]=.08+bite*.10;out[12]=.88+bite*.50;out[13]=bite*.14;out[9]=.69;out[14]=.69;
    out[3]=.07-bite*.04;out[4]=-.025;out[23]=track(clock/3.8,[[0,0],[.46,0],[.56,1],[.73,1],[.89,0],[1,0]]);
  }else if(key==='takeOrder'){
    const nod=track(clock/4.1,[[0,0],[.22,0],[.30,1],[.41,0],[.70,0],[.78,.65],[.88,0],[1,0]]);
    out[6]=.79;out[8]=-.12;out[12]=.85;out[9]=.60;out[11]=.11;out[14]=.70;out[3]=.015+nod*.09;out[4]=.025;
  }else if(key==='cheer'){
    const wave=track(clock/6,[[0,0],[.055,1],[.26,1],[.34,0],[1,0]]),flutter=track(clock/.45,[[0,-.12],[.5,.12],[1,-.12]]);
    out[8]=-wave*(1.98+flutter);out[6]=wave*.16;out[12]=.17+wave*.08;out[5]=-wave*.055;out[22]=wave;
  }
  if(reduced){out[0]=seated?out[0]:0;out[1]=out[2]=out[5]=0;out[3]*=.6;}
}

export function animateCharacter(model:THREE.Group,time:number,pose:string,carrying:boolean,moving:boolean,work?:CharacterWork,frame?:CharacterFrame){
  const rig=model.userData.rig as CharacterRig|undefined;if(!rig)return;
  const seated=pose==='sit'||pose==='eat';
  const stirring=work?.stationKind==='drinks'||work?.stationKind==='coffee'||work?.stationKind==='blender'||(work?.stationKind==='prep'&&['pancakes','strawberry_waffle','brownie'].includes(work?.recipeId??''));
  const key=moving?(carrying?'walk-carry':'walk'):carrying?'carry':pose==='cook'?(stirring?'stir':work?.stationKind==='prep'?'chop':'cook'):pose;
  let motion=model.userData.characterMotion as Motion|undefined;
  if(!motion){motion={key,seated,time,clock:rig.phase,blend:1,from:new Float32Array(POSE_SIZE),current:new Float32Array(POSE_SIZE),target:new Float32Array(POSE_SIZE)};model.userData.characterMotion=motion;makePose(rig,time,motion.clock,key,seated,work,!!frame?.reducedMotion,motion.current);}
  const dt=THREE.MathUtils.clamp(frame?.delta??time-motion.time,0,.1);motion.time=time;
  const supportChanged=seated!==motion.seated;
  if(key!==motion.key||supportChanged){motion.key=key;motion.seated=seated;motion.clock=0;motion.blend=0;motion.from.set(motion.current);}
  motion.clock+=dt*(moving&&Number.isFinite(frame?.speed)?THREE.MathUtils.clamp(frame!.speed!/.95,.5,1.7):1);
  makePose(rig,time,motion.clock,key,seated,work,!!frame?.reducedMotion,motion.target);
  // The scene changes the support/hip height at the seating event. Apply the
  // corresponding leg pose in that same frame (also for a zero-delta update),
  // while the hands, head and expression retain their short action blend.
  if(supportChanged)for(const i of [0,1,2,16,17,18,19])motion.from[i]=motion.target[i];
  motion.blend=Math.min(1,motion.blend+dt/(frame?.reducedMotion?.10:.18));const blend=motion.blend*motion.blend*(3-2*motion.blend);
  for(let i=0;i<POSE_SIZE;i++)motion.current[i]=THREE.MathUtils.lerp(motion.from[i],motion.target[i],blend);
  const p=motion.current;
  // Seat and inventory support heights are engine contracts, not visual motion.
  // Solve the authored shoes against the floor during a stride and its blend
  // out, so foot roll reads as heel/toe contact rather than skating underground.
  const groundedY=(moving||Math.abs(p[16])+Math.abs(p[17])>.001)?-Math.min(shoeContactY(p[16],p[18],-1,p[2]),shoeContactY(p[17],p[19],1,p[2])):p[0];
  rig.body.position.set(0,seated?(work?.seatHeight??.48)-.63:groundedY,p[25]);rig.body.rotation.set(0,p[1],p[2]);rig.head.rotation.set(p[3],p[4],p[5]);
  rig.chest.rotation.x=p[20];rig.chest.scale.set(1,1,1+Math.sin((time+rig.phase)*1.6)*.004);
  for(let i=0;i<2;i++){
    const s=6+i*3,e=12+i*2;rig.arms[i].rotation.set(p[s],p[s+1],p[s+2]);rig.elbows[i].rotation.set(p[e],0,p[e+1]);
    rig.legs[i].rotation.set(p[16+i],0,0);rig.knees[i].rotation.set(p[18+i],0,0);
    rig.brows[i].position.y=.095+p[22]*.014-p[24]*.006+p[23]*.004;rig.brows[i].rotation.z=(i===0?-1:1)*(.075+p[22]*.08-p[24]*.08);
  }
  rig.props.cook.visible=key==='cook';rig.props.spoon.visible=key==='stir';rig.props.knife.visible=key==='chop';rig.props.wash.visible=key==='wash';rig.props.eat.visible=key==='eat';
  rig.openMouth.visible=p[22]>.5;rig.smile.visible=!rig.openMouth.visible;rig.smile.scale.set(1+p[22]*.13+p[23]*.06,1+p[22]*.06,1);
  const blinkTime=(time+rig.phase)%rig.blinkPeriod,blink=blinkTime<.15?track(blinkTime/.15,[[0,1],[.4,.08],[.62,.08],[1,1]]):1;
  for(const eye of rig.eyes){eye.scale.y=blink*(1-p[23]*.40);eye.children[1].visible=eye.scale.y>.45;}
}
