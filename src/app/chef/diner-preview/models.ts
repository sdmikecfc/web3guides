import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SceneFood,SceneObject } from './scene-types';

/** Align original floor-authored art with a real architectural support. */
export function configureRoomMount(model:THREE.Group,object:SceneObject){
  model.scale.setScalar(object.mount?.kind==='counter'?(object.kind==='herb_planter'?.32:object.kind==='daisy_pot'?.38:.52):1);model.position.set(0,0,0);
  if(object.mount?.kind==='wall'){const back=model.userData.wallMountPlane??(object.kind==='chrome_clock'?.435:.49),offset=-(back+.052),angle=Math.PI-(object.rotation??0)*Math.PI/2;model.position.set(Math.sin(angle)*offset,0,Math.cos(angle)*offset);}
}

/** Original toy-diner model kit. Metres, Y-up, floor-centred, front is -Z.
 * This source builds both world models and catalogue previews. No asset provider. */
export const PALETTE={cream:'#f7f2e6',porcelain:'#fff9ee',ink:'#293e39',sage:'#365f55',mint:'#94b9a2',tomato:'#bd654e',mustard:'#e3b454',wood:'#876647',oak:'#c59a6c',metal:'#bdcdc7',steel:'#647e77',dark:'#394b46',leaf:'#668b55',paving:'#deded3',bun:'#dfad62',skin:'#e4b38e'};
const geometries=new Map<string,THREE.BufferGeometry>(),materials=new Map<string,THREE.MeshToonMaterial>();
export function modelKitStats(){return {geometries:geometries.size,materials:materials.size};}
const gradient=new THREE.DataTexture(new Uint8Array([105,175,245]),3,1,THREE.RedFormat);
gradient.minFilter=THREE.NearestFilter;gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;
export function material(color:string){let result=materials.get(color);if(!result){result=new THREE.MeshToonMaterial({color,gradientMap:gradient});result.userData.sharedKitResource=true;materials.set(color,result);}return result;}
function geo(key:string,create:()=>THREE.BufferGeometry){let value=geometries.get(key);if(!value){value=create();value.userData.sharedKitResource=true;geometries.set(key,value);}return value;}
function mesh(geometry:THREE.BufferGeometry,color:string,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;}
export function box(w:number,h:number,d:number,color:string,x=0,y=h/2,z=0,r=.035){return mesh(geo(`b${w},${h},${d},${r}`,()=>r?new RoundedBoxGeometry(w,h,d,2,Math.min(r,w/3,h/3,d/3)):new THREE.BoxGeometry(w,h,d)),color,x,y,z);}
export function cylinder(top:number,bottom:number,h:number,color:string,x=0,y=h/2,z=0,sides=12){return mesh(geo(`c${top},${bottom},${h},${sides}`,()=>new THREE.CylinderGeometry(top,bottom,h,sides)),color,x,y,z);}
function ball(radius:number,color:string,x=0,y=0,z=0){return mesh(geo(`s${radius}`,()=>new THREE.SphereGeometry(radius,12,8)),color,x,y,z);}
function ring(radius:number,tube:number,color:string,x=0,y=0,z=0){const m=mesh(geo(`r${radius},${tube}`,()=>new THREE.TorusGeometry(radius,tube,5,16)),color,x,y,z);m.rotation.x=Math.PI/2;return m;}
function group(...parts:THREE.Object3D[]){const g=new THREE.Group();g.add(...parts);return g;}
/** Bake fixed pieces by paint colour; articulated joints stay separate groups.
 * This keeps expressive faces and constructed furniture cheap to draw on phones. */
function packMeshes(root:THREE.Group,key:string){
  const batches=new Map<string,THREE.Mesh[]>();
  for(const child of root.children)if(child instanceof THREE.Mesh&&!Array.isArray(child.material)){
    const paint=(child.material as THREE.MeshToonMaterial).color.getHexString(),batch=batches.get(paint)??[];batch.push(child);batches.set(paint,batch);
  }
  batches.forEach((parts,paint)=>{
    if(parts.length<2)return;
    const geometry=geo(`packed:${key}:${paint}`,()=>{
      const positions:number[]=[],normals:number[]=[],point=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
      for(const part of parts){part.updateMatrix();normalMatrix.getNormalMatrix(part.matrix);const p=part.geometry.getAttribute('position'),n=part.geometry.getAttribute('normal'),indices=part.geometry.index,count=indices?.count??p.count;
        for(let i=0;i<count;i++){const index=indices?indices.getX(i):i;point.fromBufferAttribute(p,index).applyMatrix4(part.matrix);normal.fromBufferAttribute(n,index).applyMatrix3(normalMatrix).normalize();positions.push(point.x,point.y,point.z);normals.push(normal.x,normal.y,normal.z);}
      }
      const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));return result;
    });
    root.remove(...parts);root.add(mesh(geometry,`#${paint}`));
  });
  return root;
}

function createPatty(cooked=false){
  const g=group(cylinder(.214,.225,.075,cooked?'#785039':'#b65c53',0,.043,0,24));
  if(cooked)for(let i=0;i<3;i++){const mark=box(.30,.009,.022,'#47372e',0,.084,-.105+i*.10,.004);mark.rotation.y=.32;g.add(mark);}
  else for(let i=0;i<7;i++){const a=i*2.4,r=.045+(i%3)*.056,fleck=box(.019,.005,.035,'#dfa28e',Math.cos(a)*r,.083,Math.sin(a)*r,.007);fleck.rotation.y=a;g.add(fleck);}
  return packMeshes(g,`supply-patty:${cooked}`);
}
function createBun(){
  const g=group(cylinder(.231,.220,.061,'#cc9450',0,.035,0,24),cylinder(.234,.234,.023,'#f2d099',0,.077,0,24));
  const dome=mesh(geo('supply-bun-dome',()=>new THREE.SphereGeometry(.238,20,10,0,Math.PI*2,0,Math.PI/2)),PALETTE.bun,0,.091);dome.scale.y=.62;g.add(dome);
  for(let i=0;i<7;i++){const a=i*2.4,r=.038+(i%3)*.045,seed=box(.021,.009,.034,'#fff0ca',Math.cos(a)*r,.091+Math.sqrt(.238**2-r*r)*.62,Math.sin(a)*r,.005);seed.rotation.y=a;g.add(seed);}
  return packMeshes(g,'supply-sesame-bun');
}
/** Loose supplies never inherit a complete recipe's plate or toppings. */
export function createIngredientModel(id:string){
  if(id==='beef')return createPatty();
  if(id==='bun')return createBun();
  const g=new THREE.Group();
  const ellipsoid=(r:number,color:string,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{const m=ball(r,color,x,y,z);m.scale.set(sx,sy,sz);g.add(m);return m;};
  const leaf=(x:number,y:number,z:number,color=PALETTE.leaf)=>ellipsoid(.12,color,x,y,z,.65,.18,1.15);
  if(id==='potato'){for(let i=0;i<2;i++){ellipsoid(.14,'#c8a073',i*.16-.08,.112,i*.065-.033,.82,.78,1.12);for(let p=0;p<2;p++)ellipsoid(.012,'#987448',i*.16-.11+p*.055,.216,i*.065-.02,.7,.3,1);}}
  else if(id==='cheese'){g.add(cylinder(.255,.255,.105,'#e6b852',0,.061,0,3));for(const [x,z,r] of [[0,.07,.026],[-.09,-.07,.020],[.08,-.10,.017]])g.add(cylinder(r,r,.004,'#c88d35',x,.116,z,16));}
  else if(id==='lettuce'){for(let i=0;i<6;i++){const a=i*2.4;ellipsoid(.15,i%2?'#88ad59':'#b4c777',Math.cos(a)*.11,.115+(i%2)*.025,Math.sin(a)*.10,.9,.68,.8);}ellipsoid(.14,'#c5d48c',0,.18,0,.8,.55,.8);}
  else if(id==='tomato'||id==='apple'){ellipsoid(.19,id==='tomato'?'#c45b47':'#c75f50',0,.166,0,1,.87,1);g.add(cylinder(.012,.015,.07,PALETTE.wood,0,.331,0,8));for(let i=0;i<(id==='tomato'?4:1);i++){const l=leaf(Math.sin(i*1.57)*.046,.316,Math.cos(i*1.57)*.046);l.scale.multiplyScalar(.58);l.rotation.y=i*1.57;}}
  else if(id==='onion'){ellipsoid(.17,'#bb94a5',0,.148,0,1,.87,1);g.add(cylinder(.022,.065,.095,'#d9b8c6',0,.31,0,16));for(const x of [-.025,0,.025])g.add(box(.008,.008,.063,'#aa875b',x,.013,.09,.003));}
  else if(id==='egg'){const egg=ellipsoid(.15,'#f4e5c9',0,.182,0,.83,1.20,.83);egg.rotation.z=.18;}
  else if(id==='milk'){g.add(box(.24,.34,.22,PALETTE.porcelain,0,.18,0,.016),box(.24,.105,.22,PALETTE.mint,0,.403,0,.021),box(.23,.11,.014,PALETTE.sage,0,.19,-.117,.010),cylinder(.034,.034,.027,PALETTE.porcelain,.054,.469,0,12));}
  else if(id==='flour'||id==='sugar'){const color=id==='flour'?'#ddc799':'#e7d4d1';g.add(box(.31,.32,.23,color,0,.17,0,.048),box(.29,.04,.14,PALETTE.porcelain,0,.34,0,.011),box(.20,.16,.014,PALETTE.porcelain,0,.19,-.123,.018));if(id==='flour')for(let i=0;i<3;i++){const stalk=box(.012,.115,.007,PALETTE.oak,(i-1)*.038,.19,-.136,.003);stalk.rotation.z=(i-1)*.2;g.add(stalk);}else for(const x of [-.043,.043])g.add(box(.062,.062,.013,'#dba6a1',x,.19,-.137,.008));}
  else if(id==='cooking_oil'||id==='maple_syrup'){const color=id==='cooking_oil'?'#d8b75d':'#a77444';g.add(box(.23,.29,.19,color,0,.157,0,.055),cylinder(.047,.066,.09,color,0,.347,0,16),cylinder(.061,.061,.033,PALETTE.sage,0,.409,0,16),box(.15,.13,.014,PALETTE.porcelain,0,.175,-.101,.018));if(id==='maple_syrup'){const h=ring(.07,.018,PALETTE.oak,.123,.269,0);h.rotation.x=0;g.add(h);}else g.add(box(.038,.081,.01,PALETTE.leaf,0,.177,-.116,.014));}
  else if(id==='bacon'){for(let i=0;i<2;i++){g.add(box(.095,.032,.38,'#bd7770',(i-.5)*.12,.026,0,.022),box(.025,.006,.35,'#eac3a6',(i-.5)*.12+.013,.045,0,.009));}}
  else if(id==='chicken'){ellipsoid(.20,'#e2b196',-.015,.082,0,1.08,.41,.78);ellipsoid(.10,'#ecc0a5',.14,.058,.035,1.1,.52,.63);}
  else if(id==='pickles'){for(let i=0;i<3;i++){g.add(cylinder(.102,.104,.025,'#5f8650',(i-1)*.10,.019+i*.012,0,20),cylinder(.078,.078,.005,'#a3b875',(i-1)*.10,.034+i*.012,0,20));}}
  else if(id==='bread'){g.add(box(.31,.085,.32,'#bd8b50',0,.049,0,.062),box(.265,.014,.27,'#f1d8a2',0,.099,0,.049));}
  else if(id==='butter'){g.add(box(.34,.014,.25,PALETTE.porcelain,0,.012,0,.014),box(.25,.09,.18,'#eed384',0,.064,0,.018),box(.15,.014,.20,'#e6ece1',.10,.083,0,.010));}
  else if(id==='ice_cream'){g.add(cylinder(.205,.165,.17,PALETTE.mint,0,.089,0,20),ring(.193,.014,PALETTE.porcelain,0,.182));for(let i=0;i<3;i++)ellipsoid(.102,'#f2e5c9',(i-1)*.081,.19+(i%2)*.037,0,1,.8,1);}
  else if(id==='coffee_beans'){for(let i=0;i<7;i++){const a=i*2.4;const bean=ellipsoid(.046,'#775540',Math.cos(a)*.11,.038+(i%2)*.02,Math.sin(a)*.10,.7,.6,1);bean.rotation.y=a;}}
  else if(id==='lemon'){const lemon=ellipsoid(.17,'#efc858',0,.13,0,1.15,.72,.77);lemon.rotation.y=.3;ellipsoid(.039,'#edce70',-.17,.13,.046,1,.65,.7);}
  else if(id==='sausage'){g.add(box(.41,.10,.115,'#c08b75',0,.058,0,.048));for(const x of [-.218,.218])g.add(box(.025,.047,.043,'#d4a18a',x,.058,0,.012));}
  else if(id==='corn'){ellipsoid(.20,'#e4bc57',0,.112,0,.55,.53,1.04);for(let i=0;i<5;i++)for(const x of [-.052,.025])ellipsoid(.033,'#f2d47c',x,.198,-.14+i*.068,.8,.40,.85);for(const x of [-.12,.12]){const l=leaf(x,.075,.04);l.scale.set(.63,.13,1.62);l.rotation.y=x*1.8;}}
  else if(id==='chocolate'){g.add(box(.33,.044,.26,'#69483a',0,.028,0,.013));for(let x=0;x<3;x++)for(let z=0;z<2;z++)g.add(box(.092,.02,.103,'#865e47',(x-1)*.10,.060,(z-.5)*.12,.014));}
  else if(id==='strawberry'){for(let i=0;i<2;i++){ellipsoid(.115,'#c85f55',(i-.5)*.17,.10,i*.07-.035,1,.87,1);for(let p=0;p<3;p++)ellipsoid(.010,'#f2d494',(i-.5)*.17+(p-1)*.038,.204,i*.07-.04,.65,.28,1);const l=leaf((i-.5)*.17,.205,i*.07-.035);l.scale.multiplyScalar(.42);}}
  else if(id==='avocado'){ellipsoid(.205,'#426b42',0,.101,0,.73,.49,1);ellipsoid(.185,'#a9bf70',0,.114,0,.73,.34,1);ellipsoid(.074,'#92704b',0,.163,.035,1,.53,1);}
  else if(id==='chili'){const curve=new THREE.CubicBezierCurve3(new THREE.Vector3(-.18,.052,.08),new THREE.Vector3(-.05,.073,.01),new THREE.Vector3(.13,.075,-.11),new THREE.Vector3(.16,.078,-.15));g.add(mesh(geo('supply-chili',()=>new THREE.TubeGeometry(curve,12,.038,9,false)),'#bd4e40'),box(.018,.031,.09,PALETTE.leaf,-.193,.064,.125,.008));}
  else {g.userData.unsupportedIngredient=id;g.add(box(.19,.12,.19,PALETTE.cream,0,.063,0,.035));}
  return packMeshes(g,`supply-ingredient:${id}`);
}
export function createCleanPlate(){
  const g=group(cylinder(.276,.249,.026,'#e4e8e1',0,.018,0,32),cylinder(.286,.272,.019,PALETTE.porcelain,0,.038,0,32),ring(.268,.010,'#fffdf6',0,.051));
  g.name='food-plate';return packMeshes(g,'supply-clean-plate');
}
export function createCup(dirty=false){
  // Hollow porcelain, including the inside wall and floor; an empty cup is not
  // a filled drinks cylinder with a different label.
  const profile=[[0,.012],[.081,.012],[.099,.028],[.135,.288],[.132,.309],[.117,.310],[.099,.053],[0,.053]].map(([x,y])=>new THREE.Vector2(x,y));
  const g=group(mesh(geo('supply-hollow-cup',()=>new THREE.LatheGeometry(profile,28)),PALETTE.porcelain));
  const handle=ring(.075,.020,PALETTE.porcelain,.143,.170);handle.rotation.x=0;g.add(handle);
  if(dirty){g.add(cylinder(.074,.074,.004,'#9b7351',0,.057,0,20));const smear=box(.065,.045,.009,'#bf9571',0,.272,-.129,.014);smear.rotation.x=-.15;g.add(smear);}
  g.name='food-vessel';g.userData.vesselKind='cup';return packMeshes(g,`supply-cup:${dirty}`);
}
export function createFryBox(dirty=false){
  const g=group(box(.29,.024,.21,'#edcf9d',0,.019,0,.009));
  // Four thin connected panels leave the opening visibly empty.
  g.add(box(.345,.151,.017,PALETTE.tomato,0,.103,-.116,.014),box(.35,.225,.017,PALETTE.tomato,0,.140,.116,.015));
  for(const side of [-1,1]){const wall=box(.018,.202,.229,PALETTE.tomato,side*.159,.130,0,.012);wall.rotation.z=-side*.08;g.add(wall);}
  const seal=cylinder(.042,.042,.010,PALETTE.porcelain,0,.102,-.131,20);seal.rotation.x=Math.PI/2;g.add(seal,box(.016,.042,.007,PALETTE.mustard,0,.102,-.140,.005));
  if(dirty)for(const x of [-.063,.052])g.add(cylinder(.032,.040,.004,'#ad895d',x,.034,.021,12));
  g.name='food-vessel';g.userData.vesselKind='fry_box';return packMeshes(g,`supply-fry-box:${dirty}`);
}
export function createPlate(dirty=false){
  const g=group(cylinder(.29,.26,.035,PALETTE.porcelain,0,.022),ring(.263,.010,PALETTE.sage,0,.045));
  g.name='food-plate';
  if(dirty){const stain=ball(.13,'#ad7954',0,.049);stain.scale.set(1,.06,.75);g.add(stain);for(let i=0;i<3;i++)g.add(ball(.025,i%2?PALETTE.leaf:PALETTE.tomato,-.14+i*.13,.058,.085-i*.02));}
  return g;
}
export function createFoodModel(food:SceneFood):THREE.Group{
  const dish=buildFoodModel(food),level=Math.max(0,Math.min(10,Math.floor(food.mastery??0)));
  // Plating is earned from the actual recipe level; raw, burnt and dirty objects
  // always retain their honest service appearance.
  if(food.kind!=='dish'||level<3)return dish;
  if(food.vesselKind==='cup'||food.vesselKind==='fry_box'){
    // A signature stamp belongs to the actual serving vessel. Do not conjure
    // a porcelain coaster/plate under a takeaway carton or a pooled clean cup.
    const carton=food.vesselKind==='fry_box',stamp=cylinder(.040,.040,.007,level===10?'#d5a547':'#4d8b76',0,carton?.102:.17,carton?-.148:-.140,level===10?5:20);
    stamp.rotation.x=Math.PI/2;dish.add(stamp);dish.userData.presentation=level===10?'masterpiece':'signature';return dish;
  }
  const drink=food.recipeId.includes('coffee')||food.recipeId.includes('lemonade')||food.recipeId.includes('shake');
  const radius=drink?.222:.291,trim=level===10?'#d5a547':'#4d8b76';
  if(drink)dish.add(cylinder(.242,.226,.021,PALETTE.porcelain,0,.012));
  dish.add(ring(radius,.012,trim,0,drink?.028:.045));
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,mark=ball(.012,trim,Math.sin(angle)*(radius-.025),drink?.028:.048,Math.cos(angle)*(radius-.025));mark.scale.y=.3;dish.add(mark);
  }
  if(level===10){
    dish.add(ring(radius-.020,.004,'#e7c678',0,drink?.028:.046));
    if(!drink)for(let i=0;i<2;i++){
      const leaf=ball(.042,i?'#93b864':'#518853',-.215+i*.026,.080+i*.009,-.15-i*.033);leaf.scale.set(.52,.22,1);leaf.rotation.y=i?.7:-.35;dish.add(leaf);
    }
    const seal=cylinder(.026,.026,.005,'#d5a547',0,drink?.031:.051,-radius+.031,5);seal.rotation.y=Math.PI;dish.add(seal);
  }
  dish.userData.presentation=level===10?'masterpiece':'signature';
  return dish;
}
function buildFoodModel(food:SceneFood):THREE.Group{
  const id=food.recipeId,g=new THREE.Group(),raw=food.kind==='raw',processed=food.kind==='processed';
  const vessel=food.vesselKind??(food.stage==='clean_cup'?'cup':food.stage==='empty_fry_box'?'fry_box':'plate');
  if(food.kind==='ingredient')return createIngredientModel(food.ingredientId??'');
  if(food.kind==='plate')return vessel==='cup'?createCup():vessel==='fry_box'?createFryBox():createCleanPlate();
  if(id==='fries'&&processed&&(food.stage==='cut_potatoes'||food.stage==='prepared_fries')){
    const cooked=food.stage==='prepared_fries';
    for(let i=0;i<9;i++){const fry=box(.041,.040,.31,cooked?(i%2?'#e8bb57':'#f3d174'):(i%2?'#f0dfb4':'#e6d5a8'),(i%5-2)*.062,.029+Math.floor(i/5)*.043,(i%2-.5)*.041,.009);fry.rotation.y=(i%3-1)*.22;g.add(fry);}
    g.userData.unplated=true;return packMeshes(g,`loose-fries:${cooked}`);
  }
  if(processed&&food.stage===`prepared_${id}`){
    const prepared=buildFoodModel({...food,kind:'dish'});
    for(const child of [...prepared.children])if(child.name==='food-plate'||child.name==='food-vessel')prepared.remove(child);
    const base=new THREE.Box3().setFromObject(prepared).min.y;
    if(Number.isFinite(base))for(const child of prepared.children)child.position.y-=base-.008;
    prepared.userData.unplated=true;return prepared;
  }
  if(food.kind==='dirty')return vessel==='cup'?createCup(true):vessel==='fry_box'?createFryBox(true):createPlate(true);
  if(food.kind==='burnt'){g.add(createPlate());const burnt=ball(.2,'#493f35',0,.09);burnt.scale.y=.34;g.add(burnt);for(let i=0;i<3;i++)g.add(ball(.028,'#6d5946',-.12+i*.11,.13,.04));return g;}
  const burger=id.includes('burger')||id.includes('sandwich');
  if(burger){
    const chicken=id==='fried_chicken_sandwich';
    if(raw||processed){const color=raw?(chicken?'#e3b397':'#c47566'):chicken?(food.stage==='coated'?'#e4ce9a':'#bd8a48'):'#77523c';g.add(cylinder(.21,.22,.07,color,0,.065));if(processed)for(let i=0;i<3;i++){const mark=box(.30,.008,.022,chicken?'#e6b765':'#4e4033',0,.105,-.11+i*.10,.003);mark.rotation.y=.32;g.add(mark);}if(food.stage==='cooked_patty_and_bacon')for(const x of [-.075,.075])g.add(box(.07,.018,.32,'#b37453',x,.127,0,.012));return g;}
    g.add(createPlate(),cylinder(.233,.222,.077,PALETTE.bun,0,.098),cylinder(.225,.228,.08,chicken?'#bd8a48':'#70462f',0,.176));
    if(id!=='classic_burger')for(let i=0;i<5;i++){const leaf=ball(.104,i%2?'#689c49':'#91b85e',Math.cos(i*1.26)*.14,.223,Math.sin(i*1.26)*.14);leaf.scale.set(1,.25,.70);g.add(leaf);}
    if(id!=='classic_burger'){const cheese=box(.38,.024,.38,PALETTE.mustard,0,.231,0,.009);cheese.rotation.y=.36;g.add(cheese);}
    if(id!=='classic_burger')g.add(cylinder(.201,.201,.030,'#c6533e',0,.264));
    if(id==='bacon_deluxe_burger')for(const x of [-.13,.13]){const bacon=box(.075,.023,.49,'#9e6246',x,.269,0,.02);bacon.rotation.y=.16;g.add(bacon,box(.021,.025,.46,'#db9e78',x,.27,0,.009));}
    if(id==='avocado_burger')for(let i=0;i<3;i++){const avocado=ball(.12,'#a8be6e',-.11+i*.105,.27,-.135);avocado.scale.set(.5,.25,1.1);avocado.rotation.y=-.35;g.add(avocado);}
    if(chicken)for(const z of [-.23,.23])g.add(cylinder(.08,.08,.025,'#789557',0,.254,z));
    const bunBase=id==='classic_burger'?.217:.281,dome=mesh(geo('hero-bun-dome',()=>new THREE.SphereGeometry(.247,20,10,0,Math.PI*2,0,Math.PI/2)),PALETTE.bun,0,bunBase);dome.scale.y=.68;g.add(dome);
    for(let i=0;i<6;i++){const angle=i*2.4,rad=.05+(i%3)*.048;const sesame=box(.023,.009,.039,'#fff3cb',Math.cos(angle)*rad,bunBase+Math.sqrt(.247**2-rad**2)*.68,Math.sin(angle)*rad,.005);sesame.rotation.y=angle;g.add(sesame);}return g;
  }
  if(id.includes('fries')||id==='onion_rings'||id==='mozzarella_sticks'){
    if(raw){if(id==='onion_rings'){for(let i=0;i<3;i++)g.add(ring(.1,.025,'#b790a5',-.10+i*.09,.035+i*.015,0));}else if(id==='mozzarella_sticks'){for(let i=0;i<3;i++)g.add(box(.09,.075,.35,'#f7e8bf',-.12+i*.12,.075,0,.023));}else for(let i=0;i<2;i++){const potato=ball(.13,'#c6a06d',i*.16-.08,.10,0);potato.scale.set(.8,.7,1.3);g.add(potato);}return g;}
    if(vessel!=='fry_box')g.add(createPlate());if(id==='onion_rings'){for(let i=0;i<5;i++)g.add(ring(.072,.023,processed?'#e9d2ab':'#e6b867',-.13+i%3*.12,.075+Math.floor(i/3)*.05,-.06+Math.floor(i/3)*.10));return g;}
    if(id==='mozzarella_sticks'){for(let i=0;i<4;i++){const stick=box(.075,.075,.29,processed?'#ead29d':'#dbae5f',-.16+i*.095,.088,0,.027);stick.rotation.y=.24;g.add(stick);}if(!processed)g.add(cylinder(.067,.075,.053,PALETTE.porcelain,.16,.077,.17),cylinder(.058,.058,.008,PALETTE.tomato,.16,.107,.17));return g;}
    if(id==='chili_cheese_fries'){for(let i=0;i<9;i++){const fry=box(.035,.037,.29,PALETTE.mustard,(i%5)*.073-.15,.07+Math.floor(i/5)*.04,Math.floor(i/5)*.04,.007);fry.rotation.y=(i%3-1)*.23;g.add(fry);}if(!processed){for(let i=0;i<7;i++){const chili=ball(.053,'#9b6546',Math.sin(i*2.4)*.16,.15,Math.cos(i*2.4)*.11);chili.scale.y=.4;g.add(chili);}for(let i=0;i<3;i++)g.add(box(.28,.012,.022,'#f0ce78',0,.16,-.085+i*.08,.004));}return g;}
    const carton=createFryBox();carton.position.y=vessel==='fry_box'?0:.055;g.add(carton);
    for(let i=0;i<7;i++){const fry=box(.050,.235+(i%3)*.034,.047,i%2?'#eabb56':'#f7d779',(i%4)*.078-.116,.309,Math.floor(i/4)*.085-.044,.009);fry.rotation.z=(i%4-1.5)*.10;g.add(fry);}
    return g;
  }
  if(id.includes('coffee')||id.includes('lemonade')||id.includes('shake')){
    const drink=id.includes('coffee')?'#886246':id.includes('strawberry')?'#df9e99':id.includes('shake')?'#f3debc':'#f1d68a';
    if(raw&&id==='coffee'){for(let i=0;i<8;i++){const bean=ball(.04,'#806246',Math.cos(i*2.4)*.13,.035+(i%2)*.025,Math.sin(i*2.4)*.12);bean.scale.set(.75,.6,1.1);g.add(bean);}return g;}
    g.add(cylinder(.135,.09,.30,id==='lemonade'?'#e8d596':PALETTE.porcelain,0,.17),cylinder(.113,.113,.012,raw?'#d8decb':drink,0,.325));
    if(id.includes('coffee')){const handle=ring(.083,.025,PALETTE.porcelain,.15,.2);handle.rotation.x=0;g.add(handle);}else{const straw=cylinder(.012,.012,.33,PALETTE.tomato,.055,.38);straw.rotation.z=.18;g.add(straw);const label=box(.13,.07,.012,id.includes('strawberry')?'#d9958e':PALETTE.mint,0,.18,-.105,.009);g.add(label);if(!raw&&id.includes('shake')){for(let i=0;i<3;i++)g.add(ball(.075,PALETTE.porcelain,(i-1)*.055,.35+(i%2)*.045,0));if(id==='strawberry_shake')g.add(ball(.03,PALETTE.tomato,0,.43,0));}if(id==='lemonade'){const lemon=cylinder(.074,.074,.018,'#f5d579',-.10,.30,-.07);lemon.rotation.x=Math.PI/2;g.add(lemon);}}return g;
  }
  if((raw&&['pancakes','strawberry_waffle','brownie','apple_pie'].includes(id))||(processed&&id==='brownie')){g.add(cylinder(.19,.11,.14,PALETTE.mint,0,.10),cylinder(.17,.17,.016,id==='brownie'?'#9d7559':'#ead9b6',0,.177));const spoon=box(.029,.02,.31,PALETTE.wood,.10,.21,.04,.01);spoon.rotation.x=-.24;g.add(spoon);return g;}
  if(raw&&id==='ice_cream_sundae'){g.add(cylinder(.20,.17,.19,PALETTE.mint,0,.12),cylinder(.181,.181,.025,PALETTE.porcelain,0,.225),ball(.10,'#efe1c7',0,.25,0));return g;}
  if((raw||processed)&&id==='hot_dog'){g.add(box(.36,.08,.085,raw?'#cf9276':'#a16b4e',0,.062,0,.035));return g;}
  g.add(createPlate());
  if(id==='side_salad'){for(let i=0;i<7;i++){const leaf=ball(.115,i%2?'#719555':'#a1b967',Math.cos(i*2.4)*.14,.10+Math.floor(i/4)*.04,Math.sin(i*2.4)*.12);leaf.scale.y=raw?.7:.4;g.add(leaf);}g.add(ball(.055,PALETTE.tomato,.12,.17,-.07),ball(.048,PALETTE.tomato,-.08,.15,.10));}
  else if(id==='hot_dog'){g.add(box(.40,.13,.21,PALETTE.bun,0,.115,0,.065),box(.42,.09,.085,'#ae7250',0,.18,0,.035));for(let i=0;i<5;i++){const mustard=box(.07,.012,.025,PALETTE.mustard,-.14+i*.07,.23,(i%2-.5)*.025,.009);mustard.rotation.y=i%2?.4:-.4;g.add(mustard);}}
  else if(id==='ice_cream_sundae'){g.add(cylinder(.20,.12,.13,'#a8c9bd',0,.12));for(let i=0;i<3;i++)g.add(ball(.11,['#eddec0','#c39575','#f0e8d4'][i],(i-1)*.105,.22+i%2*.07,0));g.add(ball(.032,PALETTE.tomato,0,.405,0));}
  else if(id==='pancakes'){for(let i=0;i<3;i++)g.add(cylinder(.22-i*.009,.22-i*.009,.052,'#d9af70',0,.09+i*.053));g.add(cylinder(.158,.175,.014,'#a67848',0,.231),box(.10,.035,.085,'#f0d98a',0,.253,-.025,.012));}
  else if(id==='strawberry_waffle'){g.add(box(.39,.075,.34,PALETTE.bun,0,.10,0,.018));for(let i=0;i<4;i++)for(let j=0;j<3;j++)g.add(box(.062,.009,.065,'#b98948',-.138+i*.091,.142,-.09+j*.09,.009));if(!processed){for(const x of [-.10,.10]){const berry=ball(.055,PALETTE.tomato,x,.19,-.075);berry.scale.y=1.2;g.add(berry);}g.add(ball(.065,PALETTE.porcelain,.02,.20,.075));}}
  else if(id==='apple_pie'){g.add(cylinder(.23,.205,.10,processed?'#ebce97':'#c99452',0,.104),cylinder(.203,.203,.018,'#a87843',0,.161));for(let i=0;i<4;i++){const offset=(i-1.5)*.085,len=Math.sqrt(.19*.19-offset*offset)*2;g.add(box(len,.025,.035,processed?'#f0d7a4':'#e7bd7b',0,.181,offset,.008),box(.035,.025,len,processed?'#f0d7a4':'#e7bd7b',offset,.191,0,.008));}if(!processed)g.add(ball(.075,PALETTE.porcelain,.17,.13,.14));}
  else if(id==='brownie'){g.add(box(.32,.12,.28,'#825941',0,.13,0,.017),box(.32,.023,.28,'#624638',0,.202,0,.014));for(let i=0;i<4;i++){const nut=ball(.027,'#c39c69',(i%2)*.13-.065,.225,Math.floor(i/2)*.11-.055);nut.scale.set(1,.4,.8);g.add(nut);}}
  else if(id==='grilled_cheese'){for(let i=0;i<2;i++){const sandwich=group(cylinder(.22,.22,.07,raw?'#eed3a0':'#d7a259',0,.095,0,3),cylinder(.211,.211,.025,PALETTE.mustard,0,.137,0,3),cylinder(.22,.22,.044,raw?'#f1d7a6':'#ddb375',0,.172,0,3));sandwich.position.set((i-.5)*.20,0,(i-.5)*.08);sandwich.rotation.y=i*Math.PI+.30;g.add(sandwich);}}
  else if(id==='loaded_nachos'){for(let i=0;i<7;i++){const chip=cylinder(.10,.10,.025,PALETTE.mustard,Math.sin(i*2.4)*.16,.08+(i%2)*.035,Math.cos(i*2.4)*.14,3);chip.rotation.y=i;g.add(chip);}if(!raw){for(let i=0;i<5;i++)g.add(box(.07,.014,.09,'#f0cf79',Math.sin(i*2.4)*.14,.145,Math.cos(i*2.4)*.11,.016));if(!processed)for(let i=0;i<4;i++)g.add(ball(.027,PALETTE.tomato,(i%2)*.19-.095,.17,Math.floor(i/2)*.14-.07));}}
  else{g.userData.unsupportedRecipe=id;}
  return g;
}

/** Rounded enamel housings share a recessed toe kick, framed door and worktop. */
function cabinet(color=PALETTE.mint,w=.85){
  const g=new THREE.Group(),panel=color===PALETTE.mint?PALETTE.sage:color;
  g.add(box(w-.09,.13,.68,PALETTE.dark,0,.105,0,.025),box(w,.60,.80,color,0,.465,0,.065));
  for(const x of [-w*.36,w*.36])for(const z of [-.28,.28])g.add(cylinder(.025,.032,.13,PALETTE.steel,x,.065,z,8));
  g.add(box(w-.08,.50,.026,PALETTE.steel,0,.44,-.403,.037),box(w-.12,.46,.026,panel,0,.445,-.420,.035));
  // A real chrome lip and projecting handle remain readable from the game camera.
  g.add(box(w+.055,.043,.865,PALETTE.metal,0,.784,0,.023),box(w+.055,.070,.865,PALETTE.porcelain,0,.828,0,.033));
  for(const x of [-.09,.09])g.add(box(.026,.035,.055,PALETTE.steel,x,.613,-.449,.009));
  g.add(box(.235,.035,.043,PALETTE.metal,0,.613,-.479,.016));
  const badge=cylinder(.047,.047,.012,PALETTE.porcelain,-w*.28,.32,-.443,16);badge.rotation.x=Math.PI/2;g.add(badge);
  for(const x of [-.013,.013])g.add(box(.013,.030,.009,PALETTE.tomato,-w*.28+x,.32,-.452,.004));
  return packMeshes(g,`cabinet:${color}:${w}`);
}
function createChair(color:string){
  const g=new THREE.Group();
  // The rear uprights run continuously from the floor into the upholstered back.
  for(const x of [-.19,.19]){
    g.add(cylinder(.034,.043,.43,PALETTE.wood,x,.225,-.18,12),box(.058,.93,.062,PALETTE.wood,x,.475,.19,.022));
    g.add(box(.035,.037,.36,PALETTE.wood,x,.23,0,.011));
  }
  g.add(box(.51,.06,.48,PALETTE.wood,0,.431,0,.041),box(.56,.11,.53,color,0,.493,-.008,.078));
  const backShape=(w:number,bottom:number,top:number)=>{const s=new THREE.Shape(),half=w/2;s.moveTo(-half,bottom);s.lineTo(half,bottom);s.lineTo(half,top-.13);s.quadraticCurveTo(half,top,half-.14,top);s.quadraticCurveTo(0,top+.015,-half+.14,top);s.quadraticCurveTo(-half,top,-half,top-.13);s.closePath();return s;};
  g.add(mesh(geo('cafe-chair-arched-frame',()=>new THREE.ExtrudeGeometry(backShape(.55,.686,.988),{depth:.075,bevelEnabled:true,bevelSize:.011,bevelThickness:.009,bevelSegments:2,curveSegments:10,steps:1})),PALETTE.wood,0,0,.154));
  g.add(mesh(geo('cafe-chair-arched-pad',()=>new THREE.ExtrudeGeometry(backShape(.475,.722,.954),{depth:.048,bevelEnabled:true,bevelSize:.012,bevelThickness:.010,bevelSegments:2,curveSegments:10,steps:1})),color,0,0,.106));
  // Cream piping follows the seat, while one generous tuft keeps the little back readable.
  g.add(box(.47,.015,.028,PALETTE.porcelain,0,.526,-.249,.010));
  const tuft=ball(.023,PALETTE.porcelain,0,.846,.091);tuft.scale.z=.42;g.add(tuft);
  return packMeshes(g,`cafe-chair:${color}`);
}
/** Table dressing stays under the engine's .85 m dish surface. The two-place
 * setting leaves the serving positions at (+/-.235, -.325) unobstructed. */
function restaurantTablecloth(w:number,d:number){
  const geometry=geo(`restaurant-linen:${w}:${d}`,()=>{
    const xs=[-w/2-.065,-w/2-.045,-w/2+.035,0,w/2-.035,w/2+.045,w/2+.065];
    const zs=[-d/2-.065,-d/2-.045,-d/2+.035,-d/4,0,d/4,d/2-.035,d/2+.045,d/2+.065];
    const vertices:number[]=[],indices:number[]=[];
    for(let z=0;z<zs.length;z++)for(let x=0;x<xs.length;x++){
      const drop=Math.max(Math.max(0,Math.abs(xs[x])-w/2+.035)/.10,Math.max(0,Math.abs(zs[z])-d/2+.035)/.10);
      vertices.push(xs[x],.847-.15*drop+(drop>0?.006*Math.sin(x*1.9+z*1.7):0),zs[z]);
    }
    for(let z=0;z<zs.length-1;z++)for(let x=0;x<xs.length-1;x++){const a=z*xs.length+x,b=a+1,c=a+xs.length,e=c+1;indices.push(a,c,b,b,c,e);}
    const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));result.setIndex(indices);result.computeVertexNormals();return result;
  });
  return mesh(geometry,'#f5eddd');
}
function tableFlowers(g:THREE.Group,x:number,z:number,large=false){
  g.add(cylinder(.038,.061,.115,'#7c9f86',x,.909,z),cylinder(.030,.035,.052,'#c6d4bc',x,.990,z));
  for(let i=0;i<(large?5:3);i++){
    const angle=i*2.4,dx=Math.sin(angle)*.054,dz=Math.cos(angle)*.043,y=1.109+(i%2)*.046;
    const stem=cylinder(.005,.006,.145,PALETTE.leaf,x+dx*.5,y-.071,z+dz*.5,6);stem.rotation.z=-dx*2;g.add(stem);
    const leaf=ball(.039,'#7f9d69',x+dx+.019,y-.076,z+dz);leaf.scale.set(1.1,.36,.45);g.add(leaf);
    for(let p=0;p<5;p++){const petal=ball(.025,i%2?'#e5a189':'#fff6dc',x+dx+Math.cos(p*Math.PI*2/5)*.021,y+Math.sin(p*Math.PI*2/5)*.021,z+dz);petal.scale.z=.48;g.add(petal);}
    g.add(ball(.012,'#c9a34f',x+dx,y,z+dz-.015));
  }
}
export function createDiningTable(capacity:1|2|4=2,style:'cafe'|'restaurant'='cafe',placeSettings?:ModelOptions['placeSettings']){
  const g=new THREE.Group(),w=capacity===4?1.72:.88,d=capacity===1?.88:1.72;
  if(style==='restaurant'){
    // An honest little linen-covered dining table: warm timber, curved linen
    // edges and a couple of prepared settings, with space for actual food.
    for(const x of [-w/2+.12,w/2-.12])for(const z of [-d/2+.15,d/2-.15]){
      g.add(box(.067,.68,.067,'#6d5540',x,.352,z,.018),box(.080,.073,.080,'#b5aa87',x,.068,z,.017));
    }
    g.add(box(w-.10,.080,d-.10,'#876447',0,.744,0,.035),box(w,.050,d,'#ba986b',0,.806,0,.055),restaurantTablecloth(w,d));
    const defaults=capacity===1?[[0,-.08]]:capacity===2?[[-.235,-.325],[.235,-.325]]:[[-.44,-.39],[.44,-.39],[-.44,.39],[.44,.39]];
    const settings=placeSettings?.length?placeSettings:defaults.map(([x,z])=>({x,z,rotation:0}));
    const used:Array<{x:number;z:number}>=[],corners=[-1,1].flatMap(sx=>[-1,1].flatMap(sz=>[.20,.39,.60].filter(v=>v<d/2-.08).map(v=>({x:sx*(w/2-.15),z:sz*v}))));
    for(const {x,z,rotation}of settings){
      const turned=Math.abs(Math.sin(rotation))>.5,maxX=Math.max(.14,2*(w/2+.005-Math.abs(x))),maxZ=Math.max(.14,2*(d/2+.005-Math.abs(z))),matW=Math.min(capacity===2?.38:.49,turned?maxZ:maxX),matD=Math.min(.53,turned?maxX:maxZ);
      const mat=group(box(matW,.006,matD,'#cbb895',0,.850,0,.029),box(matW-.03,.003,matD-.03,'#ded0b3',0,.855,0,.023));mat.position.set(x,0,z);mat.rotation.y=rotation;g.add(mat);
      // Seat order depends on reachable sides of a placed table. Keep dressing
      // out of those actual plate circles, including a guest at an end seat.
      const spot=corners.filter(p=>settings.every(s=>Math.hypot(p.x-s.x,p.z-s.z)>.33)&&used.every(s=>Math.hypot(p.x-s.x,p.z-s.z)>.19)).sort((a,b)=>Math.hypot(a.x-x,a.z-z)-Math.hypot(b.x-x,b.z-z))[0];
      if(!spot)continue;used.push(spot);
      const napkin=box(.133,.026,.17,'#fffaf0',spot.x,.868,spot.z,.009);napkin.rotation.y=spot.x<0?-.20:.20;g.add(napkin);
      const fold=box(.014,.029,.149,'#d8e0cd',spot.x,.870,spot.z,.004);fold.rotation.y=napkin.rotation.y;g.add(fold);
      const utensilX=spot.x+(spot.x<0?.105:-.105);
      g.add(box(.015,.011,.153,'#adbcb4',utensilX,.863,spot.z,.004),box(.037,.009,.035,'#c8d4c9',utensilX,.863,spot.z-.087,.009));
    }
    const vaseCandidates=[{x:0,z:capacity===2?.58:0},{x:0,z:0},{x:0,z:-.58},{x:.24,z:.25},{x:-.24,z:.25}].filter(p=>Math.abs(p.x)<w/2-.06&&Math.abs(p.z)<d/2-.07);
    const vase=vaseCandidates.sort((a,b)=>Math.min(...settings.map(s=>Math.hypot(b.x-s.x,b.z-s.z)))-Math.min(...settings.map(s=>Math.hypot(a.x-s.x,a.z-s.z))))[0];
    tableFlowers(g,vase.x,vase.z,true);
    g.userData.surfaceHeight=.85;return packMeshes(g,`restaurant-table-v1:${capacity}:${JSON.stringify(settings)}`);
  }
  // A proper cafe pedestal gives knees room and a quieter, recognisable silhouette.
  for(const z of capacity===1?[0]:[-.44,.44]){
    g.add(box(w*.68,.065,.30,PALETTE.dark,0,.046,z,.08),cylinder(.080,.108,.64,PALETTE.sage,0,.393,z));
    g.add(cylinder(.091,.102,.075,PALETTE.metal,0,.117,z),cylinder(.098,.080,.06,PALETTE.metal,0,.661,z));
  }
  g.add(box(w-.10,.075,d-.10,PALETTE.wood,0,.711,0,.085),box(w,.09,d,PALETTE.tomato,0,.772,0,.11),box(w-.055,.027,d-.055,PALETTE.porcelain,0,.827,0,.095));
  // An enamel pinstripe gives the tabletop a cafe identity without a busy surface texture.
  g.add(box(w-.145,.007,d-.145,PALETTE.mint,0,.843,0,.080),box(w-.183,.009,d-.183,PALETTE.porcelain,0,.846,0,.071));
  // One small bud vase makes a set table feel cared for without hiding the food.
  const vaseX=capacity===1?.24:.13,vaseZ=capacity===1?-.26:-.12;
  g.add(cylinder(.044,.065,.14,PALETTE.sage,vaseX,.922,vaseZ),cylinder(.031,.044,.045,PALETTE.sage,vaseX,1.014,vaseZ));
  for(let i=0;i<3;i++){const stem=cylinder(.007,.008,.14,PALETTE.leaf,vaseX+(i-1)*.018,1.087,vaseZ);stem.rotation.z=(i-1)*.20;g.add(stem);const flower=ball(.039,[PALETTE.mustard,PALETTE.tomato,PALETTE.porcelain][i],vaseX+(i-1)*.035,1.151+(i%2)*.025,vaseZ);flower.scale.y=.62;g.add(flower);}
  return packMeshes(g,`cafe-table:${capacity}`);
}
/** One owned booth includes both banquettes. Positions are the fixed engine
 * seat anchors relative to the centre of the table's 1 x 2 tile footprint. */
function createBoothTable(colors?:ModelOptions['roomColors']){
  const g=new THREE.Group(),upholstery=colors?.upholstery??'#47756b',wood='#78553b',trim='#bba779';
  for(const z of [-.45,.45])g.add(box(.57,.06,.33,'#35433d',0,.047,z,.035),box(.083,.68,.083,wood,0,.390,z,.019),box(.089,.075,.089,trim,0,.145,z,.018));
  g.add(box(.90,.085,1.75,wood,0,.784,0,.085),box(.855,.027,1.705,colors?.worktop??'#f3e8d1',0,.830,0,.071));
  // A single inset border is readable as laminate/stone at playing scale.
  g.add(box(.79,.004,1.64,'#c6bc9e',0,.846,0,.058),box(.765,.004,1.615,colors?.worktop??'#f3e8d1',0,.849,0,.055));
  for(const side of [-1,1]){
    const bench=new THREE.Group();bench.position.set(side,0,-.5);bench.rotation.y=side<0?-Math.PI/2:Math.PI/2;
    bench.add(box(.87,.055,.64,'#443e32',0,.050,.02,.024),box(.94,.33,.64,wood,0,.235,.015,.048),box(.94,.055,.68,trim,0,.404,-.012,.018),box(.92,.135,.67,upholstery,0,.4325,-.019,.059));
    // The top of the cushion is the exact .5 m seated-body contact surface.
    bench.add(box(.96,.81,.16,wood,0,.774,.270,.064),box(.88,.59,.112,upholstery,0,.832,.169,.058),box(.90,.023,.030,'#b9c7ac',0,1.122,.121,.010));
    for(const x of [-.29,0,.29])bench.add(box(.013,.52,.010,'#31564d',x,.832,.108,.006));
    for(const x of [-.46,.46])bench.add(box(.056,.63,.17,wood,x,.73,.245,.017));
    packMeshes(bench,`booth-bench-v1:${upholstery}`);g.add(bench);
  }
  tableFlowers(g,0,.55);
  g.name='two-seat-booth';g.userData.surfaceHeight=.85;g.userData.integratedSeats=true;
  return packMeshes(g,`booth-table-v1:${JSON.stringify(colors??{})}`);
}
function plant(){const g=group(cylinder(.20,.15,.33,PALETTE.tomato,0,.18),cylinder(.18,.18,.04,'#866448',0,.35));for(let i=0;i<7;i++){const angle=i*2.4,leaf=ball(.18,i%2?PALETTE.leaf:'#89a971',Math.sin(angle)*.16,.58+Math.cos(i)*.1,Math.cos(angle)*.16);leaf.scale.set(.55,1.3,.6);leaf.rotation.z=Math.sin(angle)*.5;g.add(leaf);}return g;}

export interface CharacterRig {
  body:THREE.Group;chest:THREE.Group;head:THREE.Group;eyes:THREE.Group[];
  brows:THREE.Group[];smile:THREE.Group;openMouth:THREE.Group;
  arms:THREE.Group[];elbows:THREE.Group[];legs:THREE.Group[];knees:THREE.Group[];
  held:THREE.Group;props:{cook:THREE.Group;spoon:THREE.Group;knife:THREE.Group;wash:THREE.Group;eat:THREE.Group};
  phase:number;blinkPeriod:number;isChef:boolean;
}
function actingProps(){
  // Tools carry no simulated food or dishes. The real held-item group remains
  // exclusively owned by the scene's authoritative inventory rendering.
  const cook=group(cylinder(.018,.020,.22,PALETTE.tomato,0,-.045),box(.098,.11,.021,PALETTE.dark,0,-.205,0,.019));
  cook.name='acting-spatula';for(const x of [-.027,0,.027])cook.add(box(.010,.063,.023,PALETTE.metal,x,-.208,0,.003));packMeshes(cook,'acting-spatula');
  const spoon=group(cylinder(.014,.018,.23,PALETTE.wood,0,-.047));const bowl=ball(.048,PALETTE.wood,0,-.202,0);bowl.scale.set(.72,1,.22);spoon.add(bowl);spoon.name='acting-spoon';packMeshes(spoon,'acting-spoon');
  const knife=group(box(.027,.10,.022,PALETTE.dark,0,.009,0,.010),box(.046,.14,.010,PALETTE.metal,.010,-.112,0,.008));knife.name='acting-knife';
  const wash=group(box(.105,.048,.085,PALETTE.mustard,0,-.021,-.015,.018),box(.104,.019,.085,PALETTE.sage,0,-.050,-.015,.009));wash.name='acting-sponge';
  const eat=group(box(.024,.143,.017,PALETTE.steel,0,-.030,0,.007),box(.065,.029,.017,PALETTE.steel,0,-.112,0,.005));
  eat.name='acting-fork';for(const x of [-.026,0,.026])eat.add(box(.014,.043,.014,PALETTE.steel,x,-.143,0,.004));packMeshes(eat,'acting-fork');
  for(const prop of [cook,spoon,knife,wash,eat])prop.visible=false;
  return {cook,spoon,knife,wash,eat};
}
const headWidthAt=(y:number)=>1.055+.042*Math.exp(-(((y+.065)/.10)**2));
const headFrontAt=(x:number,y:number)=>-.95*Math.sqrt(Math.max(0,.26**2-y*y-(x/headWidthAt(y))**2));
function continuousHeadGeometry(){
  return geo('character-continuous-head',()=>{
    const geometry=new THREE.SphereGeometry(.26,32,24),p=geometry.getAttribute('position');
    for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)*headWidthAt(p.getY(i)),p.getY(i),p.getZ(i)*.95);
    geometry.computeVertexNormals();return geometry;
  });
}
function fittedHairGeometry(){
  return geo('character-fitted-hair',()=>{
    const columns=32,rows=16,geometry=new THREE.SphereGeometry(1,columns,rows,0,Math.PI*2,0,Math.PI/2),p=geometry.getAttribute('position');
    for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
      const phi=col/columns*Math.PI*2,front=Math.max(0,-Math.sin(phi));
      const hairline=.01+.125*front*front,theta=row/rows*Math.acos(hairline/.26),y=.26*Math.cos(theta),radius=.26*Math.sin(theta);
      p.setXYZ(row*(columns+1)+col,-Math.cos(phi)*radius*headWidthAt(y)*1.035,y*1.035,Math.sin(phi)*radius*.95*1.035);
    }
    geometry.computeVertexNormals();return geometry;
  });
}
/** Pigment follows the skin surface; an overlapping flattened sphere would
 * intersect it and produce the jagged second-face patches seen at close zoom. */
function cheekPatch(side:number,color:string){
  const geometry=geo(`character-cheek-pigment:${side}`,()=>{
    const positions:number[]=[],cx=side*.17,cy=-.064;
    for(let i=0;i<24;i++){
      for(const [x,y] of [[cx,cy],[cx+Math.cos(i/24*Math.PI*2)*.044,cy+Math.sin(i/24*Math.PI*2)*.021],[cx+Math.cos((i+1)/24*Math.PI*2)*.044,cy+Math.sin((i+1)/24*Math.PI*2)*.021]])positions.push(x,y,headFrontAt(x,y)-.003);
    }
    // Front faces point toward -Z.
    for(let i=0;i<positions.length;i+=9)for(let axis=0;axis<3;axis++){const value=positions[i+3+axis];positions[i+3+axis]=positions[i+6+axis];positions[i+6+axis]=value;}
    const result=new THREE.BufferGeometry();result.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));result.computeVertexNormals();return result;
  });
  return mesh(geometry,color);
}
export function createCharacter(role='chef',look=0,uniform?:string){
  const root=new THREE.Group(),body=new THREE.Group(),head=new THREE.Group(),eyes:THREE.Group[]=[],brows:THREE.Group[]=[];root.add(body);body.add(head);
  const style=Math.abs(Math.floor(look))%20,skin=['#e6ad83','#bf815b','#855337','#f0c29b'][style%4],hair=['#654330','#302d2b','#b87535','#7b6554'][style%4];
  const shirt=role==='chef'||role==='waiter'?PALETTE.porcelain:role==='cashier'?'#b94f43':['#b8594b','#548b98','#c99a43','#527c64','#937093'][style%5];
  const jacket=ball(.29,shirt,0,.807,0);jacket.scale.set(.95,.95,.63);
  body.add(jacket,box(.39,.13,.29,PALETTE.dark,0,.608,0,.064),cylinder(.076,.080,.12,skin,0,1.096));
  // Collar and sleeves meet the torso; a generous apron pocket reads at room scale.
  for(const side of [-1,1]){const collar=box(.10,.095,.030,role==='customer'?PALETTE.porcelain:shirt,side*.061,1.020,-.151,.019);collar.rotation.z=side*.38;body.add(collar);}
  if(role!=='customer'){
    // The default crew share a palette, but the server needs a distinct silhouette
    // and apron at playing size. Purchased uniform colours still carry through.
    const apron=role==='waiter'&&(!uniform||uniform===PALETTE.sage)?'#b94f43':uniform??(role==='chef'?PALETTE.sage:PALETTE.tomato);
    body.add(box(.35,.36,.027,apron,0,.738,-.169,.049),box(.23,.20,.029,apron,0,.956,-.163,.035));
    for(const x of [-.104,.104])body.add(box(.036,.22,.030,apron,x,1.007,-.155,.012));
    body.add(box(.19,.115,.035,PALETTE.porcelain,0,.755,-.190,.021),box(.13,.018,.012,apron,0,.790,-.213,.006));
    for(const x of [-.105,.105])body.add(ball(.016,PALETTE.mustard,x,1.009,-.180));
    const neckerchief=box(.083,.08,.028,role==='chef'?PALETTE.tomato:PALETTE.sage,0,1.048,-.181,.020);neckerchief.rotation.z=Math.PI/4;body.add(neckerchief);
    if(role==='waiter'){
      const towel=group(box(.135,.245,.028,PALETTE.porcelain,.210,.665,-.102,.013),box(.022,.212,.005,apron,.184,.660,-.120,.004),box(.10,.012,.005,PALETTE.mustard,.211,.557,-.120,.003));
      towel.name='server-towel';towel.rotation.z=-.10;body.add(towel);
      const badge=group(box(.113,.055,.019,PALETTE.mustard,-.054,.956,-.189,.018),box(.052,.010,.009,PALETTE.porcelain,-.054,.956,-.203,.004));badge.name='server-badge';body.add(badge);
    }
  }else{
    body.add(box(.095,.08,.022,PALETTE.porcelain,.107,.915,-.156,.017));
    for(const y of [.954,.885,.815])body.add(ball(.013,PALETTE.ink,-.023,y,-.159));
    if(style%3===0)for(const y of [.733,.803])body.add(box(.40,.024,.019,PALETTE.porcelain,0,y,-.164,.006));
    if(style%3===2)body.add(box(.030,.32,.020,PALETTE.porcelain,-.018,.81,-.165,.006));
  }
  // A generous chibi head and simple dark eyes carry expression at phone size.
  head.position.y=1.274;head.scale.setScalar(1.38);
  // One continuous shaped surface supplies the skull, chin and cheeks. Keep it
  // identifiable outside the static material batch for topology regression checks.
  const faceSurface=group(mesh(continuousHeadGeometry(),skin));faceSurface.name='face-surface';head.add(faceSurface);
  const haircap=mesh(fittedHairGeometry(),hair);head.add(haircap);
  const blush=group(cheekPatch(-1,style%4===2?'#a66850':'#d98970'),cheekPatch(1,style%4===2?'#a66850':'#d98970'));
  blush.name='face-pigment';packMeshes(blush,`face-pigment:${style%4}`);blush.traverse(part=>{part.castShadow=false;});head.add(blush);
  for(const side of [-1,1]){
    head.add(ball(.050,skin,side*.261,-.014,.001));
    const innerEar=ball(.025,'#c78068',side*.282,-.009,-.025);innerEar.scale.z=.4;head.add(innerEar);
    const eyeGroup=new THREE.Group();eyeGroup.position.set(side*.096,.018,headFrontAt(side*.096,.018)-.010);
    const eye=ball(.036,PALETTE.ink);eye.scale.set(.91,1.13,.44);eyeGroup.add(eye,ball(.008,PALETTE.porcelain,-.009,.016,-.016));head.add(eyeGroup);eyes.push(eyeGroup);
    const brow=new THREE.Group();brow.position.set(side*.096,.098,headFrontAt(side*.096,.098)-.010);brow.add(box(.072,.016,.030,hair,0,0,0,.008));brow.rotation.z=-side*.10;head.add(brow);brows.push(brow);
    if(role!=='chef'&&style%3===1){const curl=ball(.084,hair,side*.214,.048,.025);curl.scale.set(.54,1.70,1.05);head.add(curl);}
  }
  head.add(ball(.035,skin,0,-.034,headFrontAt(0,-.034)-.008));
  const smile=new THREE.Group(),openMouth=new THREE.Group();smile.position.set(0,-.078,-.247);openMouth.position.copy(smile.position);
  smile.add(mesh(geo('diner-fitted-smile',()=>{
    const points=[];for(let i=0;i<=12;i++){const t=i/12,x=-.045+.09*t,y=-.037*2*t*(1-t);points.push(new THREE.Vector3(x,y,headFrontAt(x,y-.078)+.247-.003));}
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),12,.0085,5,false);
  }),'#814935'));
  const mouthInside=ball(.031,'#814935',0,-.012,-.001);mouthInside.scale.set(1.16,.86,.25);const tongue=ball(.020,'#df967f',0,-.026,-.008);tongue.scale.set(1,.40,.19);openMouth.add(mouthInside,tongue);openMouth.visible=false;head.add(smile,openMouth);
  if(role!=='chef'){
    for(let i=0;i<3;i++){const fringe=ball(.072,hair,-.115+i*.087,.178-(i===0?.015:0),-.128);fringe.scale.set(1.10,.55,.75);fringe.rotation.z=-.20;head.add(fringe);}
    if(style%4===1){
      for(const x of [-.096,.096]){const lens=ring(.056,.009,PALETTE.ink,x,.018,-.278);lens.rotation.x=0;head.add(lens);}
      head.add(box(.079,.010,.012,PALETTE.ink,0,.027,-.282,.005));
    }
    if(style%4===2)for(const x of [-.16,.16]){const bun=ball(.085,hair,x,.18,.15);bun.scale.set(1,.85,.9);head.add(bun);}
    if(style%4===3){const sweep=ball(.095,hair,-.105,.205,-.10);sweep.scale.set(1.2,.55,.75);sweep.rotation.z=.35;head.add(sweep);}
    if(role==='cashier'){head.add(box(.45,.076,.31,PALETTE.porcelain,0,.236,-.022,.035),box(.43,.035,.17,'#b94f43',0,.204,-.210,.025));}
  }else{
    head.add(cylinder(.217,.229,.095,PALETTE.porcelain,0,.242),cylinder(.231,.231,.023,PALETTE.sage,0,.218));
    for(const [x,y,z,r] of [[-.13,.325,0,.112],[0,.363,.012,.138],[.13,.325,0,.112],[0,.325,-.09,.115]]){const puff=ball(r,PALETTE.porcelain,x,y,z);puff.scale.y=.83;head.add(puff);}
  }
  packMeshes(head,`head:${role}:${style}`);packMeshes(body,`body:${role}:${style}:${uniform??''}`);
  const chest=new THREE.Group();for(const part of [...body.children])if(part instanceof THREE.Mesh)chest.add(part);body.add(chest);
  const arms:THREE.Group[]=[],elbows:THREE.Group[]=[],legs:THREE.Group[]=[],knees:THREE.Group[]=[],props=actingProps();
  for(const side of [-1,1]){
    const arm=new THREE.Group(),elbow=new THREE.Group();arm.position.set(side*.255,1.00,0);elbow.position.y=-.207;
    arm.add(ball(.089,shirt,0,-.029,0),cylinder(.088,.077,.21,shirt,0,-.11),cylinder(.079,.079,.037,PALETTE.porcelain,0,-.208));packMeshes(arm,`upper-arm:${shirt}`);
    elbow.add(cylinder(.069,.063,.165,skin,0,-.073),ball(.089,skin,0,-.164),ball(.036,skin,-side*.059,-.141,-.044));packMeshes(elbow,`forearm:${skin}:${side}`);
    if(side===-1){const grip=new THREE.Group();grip.position.y=-.164;grip.add(props.cook,props.spoon,props.knife,props.wash,props.eat);elbow.add(grip);}
    arm.add(elbow);body.add(arm);arms.push(arm);elbows.push(elbow);
    const leg=new THREE.Group(),knee=new THREE.Group();leg.position.set(side*.11,.62,0);leg.add(cylinder(.095,.083,.28,PALETTE.dark,0,-.135));knee.position.y=-.27;
    knee.add(cylinder(.084,.073,.32,PALETTE.dark,0,-.16),box(.207,.096,.298,PALETTE.ink,0,-.300,-.066,.046),box(.210,.019,.299,PALETTE.wood,0,-.340,-.066,.009));
    packMeshes(knee,'character-knee');leg.add(knee);body.add(leg);legs.push(leg);knees.push(knee);
  }
  const held=new THREE.Group();held.position.set(0,.90,-.39);body.add(held);
  root.userData.rig={body,chest,head,eyes,brows,smile,openMouth,arms,elbows,legs,knees,held,props,phase:(style*1.618+(role==='waiter'?2.4:role==='customer'?.9:0))%7.2,blinkPeriod:4.6+(style%5)*.37,isChef:role==='chef'} satisfies CharacterRig;
  return root;
}
export interface CharacterWork {stationKind?:string;recipeId?:string;seatHeight?:number}
export function animateCharacter(model:THREE.Group,time:number,pose:string,carrying:boolean,moving:boolean,work?:CharacterWork){
  const rig=model.userData.rig as CharacterRig;if(!rig)return;
  const t=time+rig.phase,seated=pose==='sit'||pose==='eat',cooking=pose==='cook'&&!carrying&&!moving,washing=pose==='wash'&&!carrying&&!moving,eating=pose==='eat'&&!carrying&&!moving;
  const stride=moving?Math.sin(t*9.5)*.43:0,breath=Math.sin(t*1.8);
  const stirring=cooking&&(!!work?.stationKind&&['drinks','coffee','blender'].includes(work.stationKind)||(work?.stationKind==='prep'&&!!work.recipeId&&['pancakes','strawberry_waffle','brownie'].includes(work.recipeId)));
  const chopping=cooking&&work?.stationKind==='prep'&&!stirring;
  rig.props.cook.visible=cooking&&!stirring&&!chopping;rig.props.spoon.visible=stirring;rig.props.knife.visible=chopping;rig.props.wash.visible=washing;rig.props.eat.visible=eating;
  // Regulars greet briefly, then relax. A held two-arm salute reads as a T-pose.
  const greetingPhase=((t%7.2)+7.2)%7.2;
  const greeting=pose==='cheer'&&!carrying&&!moving?Math.max(0,Math.min(1,greetingPhase/.25,(1.8-greetingPhase)/.35)):0;
  rig.body.position.y=seated?(work?.seatHeight??.48)-.63:moving?Math.abs(Math.sin(t*9.5))*.022:0;
  rig.body.position.x=0;rig.body.rotation.y=moving?Math.sin(t*9.5)*.026:0;
  rig.chest.scale.set(1+breath*.006,1+breath*.003,1+breath*.013);
  for(let i=0;i<2;i++){
    rig.legs[i].rotation.x=seated?Math.PI/2:(i===0?stride:-stride);rig.knees[i].rotation.x=seated?-Math.PI/2:Math.max(0,i===0?-stride:stride)*.3;
    rig.arms[i].rotation.set(carrying?.90:seated?.62:(i===0?-stride:stride)*.70,0,moving?0:(i===0?-1:1)*.028);
    rig.elbows[i].rotation.set(carrying?.85:seated?.46:moving?.14:.06,0,0);
    if(!moving&&!seated&&!carrying)rig.arms[i].rotation.x=breath*.018;
  }
  if(cooking){
    const cycle=t*(stirring?4.2:chopping?7.8:3.8);
    rig.arms[0].rotation.set(stirring?.95:chopping?.92:.86+Math.sin(cycle)*.055,stirring?Math.cos(cycle)*.09:0,stirring?Math.sin(cycle)*.095:-.035);
    rig.elbows[0].rotation.x=stirring?.83+Math.sin(cycle)*.035:chopping?.78+Math.sin(cycle)*.17:.77+Math.sin(cycle)*.13;
    rig.arms[1].rotation.x=.62;rig.elbows[1].rotation.x=.68;
  }else if(washing){
    rig.arms[0].rotation.set(.95+Math.sin(t*6.2)*.045,0,Math.sin(t*6.2)*.14);
    rig.elbows[0].rotation.x=.83-Math.sin(t*6.2)*.07;
    rig.arms[1].rotation.x=.70;rig.elbows[1].rotation.x=.73;
  }else if(eating){
    const lift=(1-Math.cos(t*2.65))*.5;
    rig.arms[0].rotation.set(.90+lift*.25,0,.12+lift*.10);rig.elbows[0].rotation.set(1+lift*.35,0,.04+lift*.17);
    rig.arms[1].rotation.x=.78;rig.elbows[1].rotation.x=.70;
  }else if(pose==='takeOrder'&&!moving&&!carrying){
    rig.arms[0].rotation.set(.78,0,-.10);rig.elbows[0].rotation.x=.85;
    rig.arms[1].rotation.set(.58+Math.sin(t*3)*.08,0,.10);rig.elbows[1].rotation.x=.65;
    rig.head.rotation.x=.04+Math.sin(t*3)*.025;
  }else if(greeting>0){
    rig.arms[0].rotation.x=greeting*(.12+Math.sin(t*13+.6)*.12);
    rig.arms[0].rotation.z=greeting*(-1.93+Math.sin(t*13)*.17);rig.elbows[0].rotation.x=.16*greeting;
  }
  rig.head.rotation.x=cooking||washing?.10+Math.sin(t*2.4)*.018:eating?.045+Math.sin(t*2.65)*.055:pose==='takeOrder'?.04+Math.sin(t*3)*.025:breath*.012;
  rig.head.rotation.y=cooking||washing?Math.sin(t*2)*.018:eating?-.04:Math.sin(t*.58)*.085;
  rig.head.rotation.z=-greeting*.065+(moving?Math.sin(t*4.75)*.018:0);
  // Expressions follow real work and meals. Keep the idle face welcoming and
  // readable; a brief soft squint makes a customer's bite feel enjoyed.
  const focused=cooking||washing,savor=eating?Math.pow(Math.max(0,Math.sin(t*2.65-.7)),4):0;
  for(let i=0;i<2;i++){
    const side=i===0?-1:1;
    rig.brows[i].position.y=.098+greeting*.014-(focused?.006:0)+savor*.005;
    rig.brows[i].rotation.z=side*(focused?-.12:.10+greeting*.14+savor*.08);
  }
  rig.smile.scale.set(1+greeting*.16+savor*.05,1+greeting*.10,1);
  rig.openMouth.visible=greeting>.35;
  rig.openMouth.scale.setScalar(1+greeting*.07);
  rig.smile.visible=!rig.openMouth.visible;
  const blinkCycle=((t%rig.blinkPeriod)+rig.blinkPeriod)%rig.blinkPeriod,blink=blinkCycle<.16?1-Math.sin(blinkCycle/.16*Math.PI)*.92:1;
  for(const eye of rig.eyes){eye.scale.y=blink*(1-savor*.44);eye.children[1].visible=eye.scale.y>.45;}
}

function createFridge(color=PALETTE.sage){
  // An actual open cold compartment: separate insulated walls, recessed back,
  // supported shelves and a low threshold. Nothing is placed inside a solid box.
  const g=group(box(.87,.15,.78,color,0,.115,0,.055),box(.91,.15,.81,color,0,1.325,0,.065),box(.075,1.12,.78,color,-.402,.752,0,.028),box(.075,1.12,.78,color,.402,.752,0,.028),box(.74,1.12,.075,color,0,.752,.352,.025),box(.70,1.03,.018,'#557c78',0,.749,.306,.012));
  for(const x of [-.322,.322])for(const z of [-.28,.28])g.add(cylinder(.032,.037,.07,PALETTE.dark,x,.035,z,10));
  for(const x of [-.356,.356])g.add(box(.042,1.06,.037,PALETTE.porcelain,x,.744,-.388,.015));
  for(const y of [.24,.745]){
    g.add(box(.71,.045,.65,PALETTE.porcelain,0,y,-.03,.018),box(.72,.045,.032,PALETTE.metal,0,y,-.365,.010));
    // Shallow white food trays visibly support the chilled patties.
    g.add(box(.60,.026,.39,'#e9f0e6',0,y+.036,-.083,.033));
    for(const x of [-.15,.15]){const patty=createPatty();patty.scale.setScalar(.56);patty.position.set(x,y+.051,-.088);g.add(patty);}
  }
  // One quiet snowflake badge and a warm metal handle communicate refrigeration.
  const badge=cylinder(.064,.064,.012,PALETTE.porcelain,-.275,1.326,-.411,24);badge.rotation.x=Math.PI/2;g.add(badge);
  for(let i=0;i<3;i++){const stroke=box(.009,.080,.006,PALETTE.sage,-.275,1.326,-.421,.003);stroke.rotation.z=i*Math.PI/3;g.add(stroke);}
  g.add(box(.036,.255,.041,PALETTE.metal,.398,.866,-.418,.015),box(.25,.023,.018,PALETTE.mint,.051,1.326,-.415,.009));
  for(const x of [-.18,-.09,0,.09,.18])g.add(box(.036,.055,.016,PALETTE.dark,x,.116,-.396,.007));
  g.userData.surfaceHeight=.79;g.userData.coldCompartment=true;
  return packMeshes(g,`supply-fridge:${color}`);
}
function createPlateRack(stock=2){
  const count=Math.max(0,Math.min(12,Number.isFinite(stock)?Math.floor(stock):2));
  const g=group(box(.76,.06,.68,PALETTE.oak,0,.617,0,.033),box(.69,.025,.60,PALETTE.porcelain,0,.660,0,.019),box(.73,.055,.59,PALETTE.oak,0,.159,0,.026));
  for(const x of [-.323,.323])for(const z of [-.274,.274])g.add(cylinder(.026,.034,.64,PALETTE.sage,x,.325,z,12));
  for(const x of [-.358,.358])g.add(box(.045,.08,.65,PALETTE.sage,x,.676,0,.016));
  g.add(box(.73,.08,.035,PALETTE.sage,0,.676,.321,.013),box(.34,.105,.020,PALETTE.sage,0,.546,-.334,.019));
  const badge=cylinder(.036,.036,.010,PALETTE.porcelain,0,.548,-.350,24);badge.rotation.x=Math.PI/2;g.add(badge);
  // This is finite inventory. No decorative spare plates appear on the lower shelf.
  for(let i=0;i<count;i++){const plate=createCleanPlate();plate.position.y=.674+i*.035;plate.name=`clean-plate-${i}`;g.add(plate);}
  g.userData.stock=count;g.userData.surfaceHeight=.674+Math.max(0,count-1)*.035+.061;
  return packMeshes(g,'supply-plate-rack');
}
function createCupStand(stock=2){
  const count=Math.max(0,Math.min(4,Number.isFinite(stock)?Math.floor(stock):2));
  const g=group(box(.76,.060,.68,PALETTE.oak,0,.617,0,.033),box(.69,.025,.60,PALETTE.porcelain,0,.660,0,.019),box(.73,.055,.59,PALETTE.oak,0,.159,0,.026));
  for(const x of [-.323,.323])for(const z of [-.274,.274])g.add(cylinder(.026,.034,.64,PALETTE.sage,x,.325,z,12));
  for(const x of [-.358,.358])g.add(box(.045,.08,.65,PALETTE.mint,x,.676,0,.016));
  g.add(box(.73,.08,.035,PALETTE.mint,0,.676,.321,.013),box(.34,.105,.020,PALETTE.sage,0,.546,-.334,.019));
  g.add(box(.054,.050,.008,PALETTE.porcelain,-.008,.550,-.351,.013));const handle=ring(.021,.008,PALETTE.porcelain,.029,.55,-.352);handle.rotation.x=0;g.add(handle);
  for(let i=0;i<count;i++){const cup=createCup();cup.scale.setScalar(.72);cup.position.set((i%2-.5)*.32,.674,(Math.floor(i/2)-.5)*.32);cup.name=`clean-cup-${i}`;g.add(cup);}
  g.userData.stock=count;g.userData.surfaceHeight=.905;return packMeshes(g,'supply-cup-stand');
}
function createBoxStand(){
  const g=group(box(.74,.055,.62,PALETTE.oak,0,.620,0,.033),box(.67,.032,.55,PALETTE.porcelain,0,.663,0,.018),box(.70,.055,.54,PALETTE.oak,0,.170,0,.025));
  for(const x of [-.309,.309])for(const z of [-.24,.24])g.add(cylinder(.026,.034,.64,PALETTE.tomato,x,.325,z,12));
  for(const x of [-.32,.32])g.add(box(.045,.075,.57,PALETTE.tomato,x,.7,0,.015));
  g.add(box(.68,.075,.035,PALETTE.tomato,0,.7,.271,.015));
  for(let i=0;i<3;i++){const carton=createFryBox();carton.position.set(0,.686+i*.050,0);g.add(carton);}
  g.userData.surfaceHeight=1.065;return packMeshes(g,'supply-box-stand');
}
const FRAMED_PRINTS=['milkshake_sign','garden_poster','coffee_print','burger_print','pete_postcard','marge_badge','dottie_portrait','rex_plate','lin_note','kiki_deck','family_photo','bell_review'];
/** Paper artwork is authored in the frame's XY plane, never a rotated food or
 * character model. All paint stays recessed inside the frame, facing local -Z.
 * The back meets a one-tile wall's inner face at +.49 in local coordinates. */
function createFramedPrint(kind:string){
  const centerY=1.49,back=.49,front=.425;
  const frame=group(box(.69,.75,.020,PALETTE.wood,0,centerY,back-.01,.016));
  for(const side of [-1,1])frame.add(box(.046,.75,back-front,PALETTE.oak,side*.322,centerY,(back+front)/2,.012),box(.605,.046,back-front,PALETTE.oak,0,centerY+side*.352,(back+front)/2,.012));
  frame.add(box(.606,.666,.009,PALETTE.porcelain,0,centerY,.453,.003));
  frame.name='print-frame';packMeshes(frame,'cafe-print-frame-v2');
  const art=new THREE.Group();art.name='print-artwork';let part=0;
  const ink=(shape:THREE.Shape,color:string,layer=1)=>{
    const geometry=geo(`wall-print-v2:${kind}:${part++}`,()=>{
      const geometry=new THREE.ShapeGeometry(shape,12),indices=geometry.index!;
      // ShapeGeometry faces +Z. Reverse triangle winding for the actual front.
      for(let i=0;i<indices.count;i+=3){const b=indices.getX(i+1);indices.setX(i+1,indices.getX(i+2));indices.setX(i+2,b);}
      // Ellipse closing points can be unused/degenerate; planar ink has one
      // constant normal, including those vertices, rather than a zero average.
      const normals=geometry.getAttribute('normal');for(let i=0;i<normals.count;i++)normals.setXYZ(i,0,0,-1);return geometry;
    });
    art.add(mesh(geometry,color,0,centerY,.446-layer*.0008));
  };
  const polygon=(points:number[][],color:string,layer=1)=>{const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();ink(shape,color,layer);};
  const oval=(x:number,y:number,rx:number,ry:number,color:string,layer=1,rotation=0)=>{const shape=new THREE.Shape();shape.absellipse(x,y,rx,ry,0,Math.PI*2,false,rotation);ink(shape,color,layer);};
  const rect=(x:number,y:number,w:number,h:number,color:string,layer=1)=>polygon([[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]],color,layer);
  const stroke=(x1:number,y1:number,x2:number,y2:number,width:number,color:string,layer=1)=>{const length=Math.hypot(x2-x1,y2-y1),dx=(y2-y1)/length*width/2,dy=-(x2-x1)/length*width/2;polygon([[x1-dx,y1-dy],[x2-dx,y2-dy],[x2+dx,y2+dy],[x1+dx,y1+dy]],color,layer);oval(x1,y1,width/2,width/2,color,layer);oval(x2,y2,width/2,width/2,color,layer);};
  const sparkle=(x:number,y:number,r:number,color:string,layer=2)=>polygon([[x,y+r],[x+r*.25,y+r*.25],[x+r,y],[x+r*.25,y-r*.25],[x,y-r],[x-r*.25,y-r*.25],[x-r,y],[x-r*.25,y+r*.25]],color,layer);
  const background=kind==='milkshake_sign'?'#f3d2c8':kind==='garden_poster'?'#e1e8cc':kind==='coffee_print'?'#d1dfd2':kind==='burger_print'?'#f2dcc0':kind==='dottie_portrait'?'#e7d4c3':kind==='family_photo'?'#d7e4d8':PALETTE.porcelain;
  rect(0,0,.594,.654,background,0);
  if(kind==='milkshake_sign'){
    oval(0,.024,.232,.257,'#fff1d8',1);
    // Bent paper straw, scalloped cream and a fluted sundae glass.
    stroke(.071,.077,.126,.269,.022,PALETTE.tomato,2);stroke(.126,.269,.175,.285,.022,PALETTE.tomato,2);
    for(let i=0;i<4;i++)stroke(.085+i*.010,.114+i*.037,.098+i*.010,.111+i*.037,.010,PALETTE.porcelain,3);
    polygon([[-.131,.039],[.131,.039],[.080,-.179],[.040,-.204],[-.040,-.204],[-.080,-.179]],'#bd7c79',2);
    polygon([[-.112,.026],[.110,.026],[.061,-.177],[.028,-.188],[-.037,-.188],[-.064,-.168]],'#dfa4a0',3);
    polygon([[-.102,.016],[-.047,.016],[-.021,-.176],[-.056,-.163]],'#f5c6b4',4);
    for(const x of [-.065,0,.065])stroke(x,.005,x*.48,-.155,.010,'#fff1d6',5);
    rect(0,-.218,.031,.042,'#bd7c79',3);oval(0,-.242,.073,.016,'#bd7c79',3);oval(-.005,-.236,.054,.008,'#fff3de',4);
    oval(0,.044,.138,.029,'#bd7c79',4);oval(0,.048,.126,.022,'#ebc5b1',5);
    const cream=new THREE.Shape();cream.moveTo(-.133,.055);cream.bezierCurveTo(-.175,.091,-.107,.140,-.077,.130);cream.bezierCurveTo(-.101,.181,-.026,.205,-.009,.218);cream.bezierCurveTo(.057,.213,.054,.173,.085,.160);cream.bezierCurveTo(.158,.138,.179,.072,.127,.055);cream.quadraticCurveTo(0,.034,-.133,.055);ink(cream,'#fff8e8',6);
    stroke(-.081,.101,.060,.110,.011,'#efd3b8',7);stroke(-.030,.156,.047,.157,.010,'#efd3b8',7);
    oval(.017,.216,.030,.028,PALETTE.tomato,8);oval(.008,.225,.008,.007,'#f2b798',9);stroke(.026,.237,.045,.261,.009,PALETTE.sage,7);
    sparkle(-.205,.184,.026,PALETTE.mustard);sparkle(.214,-.117,.030,PALETTE.tomato);oval(-.205,-.060,.013,.013,PALETTE.tomato,2);
    stroke(-.166,-.290,.166,-.290,.009,'#c99178',2);
  }else if(kind==='coffee_print'){
    oval(-.015,.02,.243,.26,'#f8efdc',1);
    oval(.135,-.034,.089,.096,PALETTE.sage,2);oval(.143,-.027,.054,.059,'#f8efdc',3);
    oval(-.014,-.181,.214,.045,PALETTE.sage,2);oval(-.014,-.173,.190,.027,PALETTE.porcelain,3);
    const cup=new THREE.Shape();cup.moveTo(-.158,.034);cup.lineTo(.136,.034);cup.lineTo(.116,-.075);cup.bezierCurveTo(.096,-.193,-.116,-.194,-.143,-.075);cup.closePath();ink(cup,PALETTE.sage,4);
    const glaze=new THREE.Shape();glaze.moveTo(-.137,.026);glaze.lineTo(.114,.026);glaze.lineTo(.092,-.073);glaze.bezierCurveTo(.078,-.158,-.105,-.168,-.125,-.066);glaze.closePath();ink(glaze,PALETTE.porcelain,5);
    oval(-.011,.035,.148,.039,PALETTE.sage,6);oval(-.011,.038,.127,.026,'#76513d',7);oval(-.036,.044,.083,.013,'#ac8055',8);oval(-.010,.042,.038,.010,'#e1bc84',9);
    stroke(-.114,-.019,-.093,-.088,.010,'#e3d1ae',6);
    for(const x of [-.075,.035]){const steam=new THREE.Shape();steam.moveTo(x,.092);steam.bezierCurveTo(x-.050,.140,x+.051,.180,x+.011,.232);steam.lineTo(x+.026,.235);steam.bezierCurveTo(x+.066,.180,x-.019,.140,x+.014,.092);steam.closePath();ink(steam,'#b58b66',3);}
    sparkle(-.200,.202,.026,PALETTE.mustard,2);sparkle(.202,.172,.023,PALETTE.tomato,2);stroke(-.112,-.269,.112,-.269,.010,PALETTE.sage,2);
  }else if(kind==='burger_print'){
    oval(0,.019,.251,.251,'#fbefcf',1);oval(0,-.192,.232,.033,PALETTE.tomato,2);oval(0,-.186,.204,.022,PALETTE.porcelain,3);
    const bottom=new THREE.Shape();bottom.moveTo(-.191,-.108);bottom.lineTo(.191,-.108);bottom.quadraticCurveTo(.192,-.173,.146,-.178);bottom.lineTo(-.142,-.178);bottom.quadraticCurveTo(-.192,-.171,-.191,-.108);bottom.closePath();ink(bottom,'#c88c46',3);
    stroke(-.145,-.141,.141,-.141,.028,'#e3af62',4);rect(0,-.084,.405,.063,'#744d37',4);oval(-.185,-.083,.025,.031,'#744d37',4);oval(.185,-.083,.025,.031,'#744d37',4);
    polygon([[-.213,-.029],[-.172,.004],[-.118,-.014],[-.055,.010],[.012,-.010],[.080,.013],[.143,-.009],[.204,.013],[.219,-.034],[.157,-.052],[.096,-.036],[.025,-.054],[-.044,-.038],[-.110,-.055],[-.173,-.039]],PALETTE.leaf,5);
    polygon([[-.186,.010],[.186,.010],[.159,-.026],[.076,-.010],[.016,-.063],[-.040,-.016],[-.167,-.021]],PALETTE.mustard,6);stroke(-.175,.028,.179,.028,.037,PALETTE.tomato,6);
    const bun=new THREE.Shape();bun.moveTo(-.213,.054);bun.bezierCurveTo(-.198,.252,.188,.252,.213,.054);bun.quadraticCurveTo(0,.027,-.213,.054);bun.closePath();ink(bun,'#dca258',7);
    const sheen=new THREE.Shape();sheen.moveTo(-.162,.099);sheen.bezierCurveTo(-.121,.211,.112,.208,.159,.108);sheen.bezierCurveTo(.080,.174,-.092,.177,-.162,.099);sheen.closePath();ink(sheen,'#efc581',8);
    for(const [x,y,a]of[[-.092,.139,-.4],[.006,.170,.35],[.098,.140,-.3],[-.033,.091,.25],[.140,.082,.5]])oval(x,y,.014,.006,PALETTE.porcelain,9,a);
    sparkle(-.222,.248,.022,PALETTE.tomato,2);sparkle(.219,-.250,.019,PALETTE.sage,2);stroke(-.100,-.272,.100,-.272,.010,PALETTE.tomato,2);
  }else if(kind==='garden_poster'){
    oval(0,.033,.245,.256,'#f6f1d8',1);
    for(let i=0;i<3;i++){const x=(i-1)*.155,top=.085+(i%2)*.11;stroke(x,-.151,x,top,.014,PALETTE.sage,2);for(const side of [-1,1])oval(x+side*.033,top-.075+side*.015,.063,.021,side<0?PALETTE.leaf:PALETTE.mint,3,side*.5);if(i!==1){for(let p=0;p<6;p++)oval(x+Math.cos(p*Math.PI/3)*.039,top+Math.sin(p*Math.PI/3)*.039,.030,.019,PALETTE.porcelain,4,p*Math.PI/3);oval(x,top,.024,.024,PALETTE.mustard,5);}else{oval(x,top,.038,.056,PALETTE.leaf,3);}}
    polygon([[-.247,-.143],[.247,-.143],[.200,-.242],[-.200,-.242]],PALETTE.tomato,4);rect(0,-.142,.516,.027,'#d99873',5);stroke(-.151,-.282,.151,-.282,.010,PALETTE.sage,2);
  }else if(kind==='pete_postcard'){
    rect(0,.017,.513,.488,'#c4dacf',1);oval(-.139,.170,.053,.053,PALETTE.mustard,2);
    polygon([[-.257,-.078],[-.098,.088],[.016,-.068],[.145,.128],[.257,-.060],[.257,-.226],[-.257,-.226]],PALETTE.leaf,2);
    polygon([[-.257,-.157],[-.081,-.071],[.128,-.135],[.257,-.051],[.257,-.226],[-.257,-.226]],PALETTE.sage,3);
    polygon([[-.048,-.226],[.077,-.226],[.008,-.090],[-.015,-.040],[-.040,-.040],[-.019,-.097]],'#f8e5bd',4);
    for(let i=0;i<3;i++)rect(-.100+i*.087,-.277,.058,.008,PALETTE.wood,3);
    rect(.201,.211,.090,.092,PALETTE.porcelain,4);sparkle(.201,.211,.029,PALETTE.tomato,5);
  }else if(kind==='marge_badge'){
    oval(0,.034,.221,.259,'#e4e8d3',1);
    polygon([[-.121,.022],[-.045,.052],[-.065,-.253],[-.111,-.213],[-.156,-.238]],PALETTE.tomato,2);polygon([[.121,.022],[.045,.052],[.065,-.253],[.111,-.213],[.156,-.238]],PALETTE.tomato,2);
    oval(0,.055,.172,.172,PALETTE.oak,3);oval(0,.058,.152,.152,PALETTE.mustard,4);oval(0,.058,.126,.126,PALETTE.porcelain,5);rect(0,.058,.052,.156,PALETTE.tomato,6);rect(0,.058,.156,.052,PALETTE.tomato,6);
  }else if(kind==='dottie_portrait'||kind==='family_photo'){
    rect(0,-.227,.523,.100,kind==='family_photo'?'#a7bfa1':'#d2b39a',1);
    const person=(x:number,y:number,color:string,scale=1)=>{
      oval(x,y-.121*scale,.094*scale,.121*scale,color,2);oval(x,y+.025*scale,.082*scale,.106*scale,'#87654e',3);oval(x,y,.068*scale,.081*scale,PALETTE.skin,4);oval(x-.024*scale,y+.006*scale,.007*scale,.011*scale,PALETTE.ink,5);oval(x+.024*scale,y+.006*scale,.007*scale,.011*scale,PALETTE.ink,5);stroke(x-.015*scale,y-.031*scale,x+.015*scale,y-.031*scale,.006*scale,'#a46a57',5);};
    if(kind==='family_photo'){person(-.157,.063,PALETTE.tomato,.88);person(.153,.069,PALETTE.sage,.9);person(.001,-.048,PALETTE.mustard,.69);sparkle(0,.242,.031,PALETTE.mustard,4);}
    else{person(-.127,.045,PALETTE.sage);for(const [x,y]of[[-.190,.091],[-.175,.138],[-.130,.159],[-.085,.139],[-.061,.087]])oval(x,y,.034,.035,'#dbd5bf',6);oval(.133,-.107,.067,.097,'#f9eed8',3);oval(.143,-.002,.064,.063,'#fff8e7',4);for(const side of [-1,1])oval(.143+side*.055,-.016,.025,.071,'#dfcbb4',5);oval(.143,-.016,.023,.017,PALETTE.ink,6);oval(.120,.016,.005,.008,PALETTE.ink,6);oval(.165,.016,.005,.008,PALETTE.ink,6);stroke(.100,-.071,.180,-.071,.019,PALETTE.tomato,6);}
    rect(0,-.284,.180,.011,PALETTE.wood,3);
  }else if(kind==='rex_plate'){
    oval(0,.031,.241,.241,PALETTE.sage,1);oval(0,.031,.222,.222,PALETTE.porcelain,2);oval(0,.031,.194,.194,'#d3dfd4',3);oval(0,.031,.179,.179,PALETTE.porcelain,4);
    polygon([[-.151,-.081],[-.088,-.019],[.003,-.060],[.088,.015],[.151,-.081]],PALETTE.leaf,5);polygon([[-.079,-.130],[.057,-.130],[.003,-.047],[-.015,-.047]],PALETTE.oak,6);sparkle(0,.108,.060,PALETTE.mustard,5);rect(0,-.267,.161,.012,PALETTE.tomato,2);
  }else if(kind==='kiki_deck'){
    oval(0,0,.237,.268,'#e1e9d3',1);const deck=new THREE.Shape();deck.moveTo(-.088,-.158);deck.bezierCurveTo(-.088,-.263,.088,-.263,.088,-.158);deck.lineTo(.088,.161);deck.bezierCurveTo(.088,.266,-.088,.266,-.088,.161);deck.closePath();ink(deck,PALETTE.tomato,3);
    for(const y of [-.130,.130]){rect(0,y,.235,.019,PALETTE.metal,2);for(const x of [-.120,.120])oval(x,y,.027,.036,PALETTE.ink,2);}polygon([[-.041,.149],[.045,.065],[.003,.018],[.043,-.086],[-.050,-.004],[-.010,.042]],PALETTE.mustard,4);sparkle(-.202,.191,.026,PALETTE.sage,2);
  }else{
    // Handwritten keepsakes use flat ink lines and a little hand-drawn emblem.
    if(kind==='lin_note'){oval(-.133,.164,.056,.044,'#d8bc89',2);polygon([[-.181,.169],[-.118,.218],[-.080,.159]],PALETTE.tomato,3);stroke(.006,.203,.195,.203,.016,PALETTE.sage,2);stroke(.004,.154,.154,.154,.011,PALETTE.wood,2);}
    else{for(let i=0;i<3;i++)sparkle((i-1)*.097,.206,.035,PALETTE.mustard,2);stroke(-.181,.129,.181,.129,.012,PALETTE.sage,2);}
    for(let i=0;i<4;i++)stroke(-.191,.063-i*.064,.182-(i%2)*.056,.063-i*.064,.009,'#aa9271',2);
    stroke(.075,-.227,.187,-.216,.013,PALETTE.tomato,3);stroke(.112,-.245,.181,-.240,.008,PALETTE.tomato,3);
  }
  packMeshes(art,`wall-print-v2:${kind}`);art.traverse(object=>{if(object instanceof THREE.Mesh)object.castShadow=false;});
  const result=group(frame,art);result.name=`framed-print:${kind}`;result.userData.wallMountPlane=back;return result;
}
export interface ModelOptions {tier?:number;color?:string;recipeId?:string;stage?:string;look?:number;stock?:number;tableStyle?:'cafe'|'restaurant';seatStyle?:'classic'|'diner';fixtureWidth?:number;placeSettings?:Array<{x:number;z:number;rotation:number}>;roomColors?:{counter:string;worktop:string;upholstery:string}}
/** Constructed restaurant fixtures share the floor-centred, front -Z contract. */
function roomFixture(kind:string,colors?:ModelOptions['roomColors'],seatStyle:ModelOptions['seatStyle']='classic',fixtureWidth?:number){
  const red=kind==='stool'?colors?.upholstery??'#b94f43':colors?.counter??'#b94f43',cream=['toilet','handwash_sink'].includes(kind)?PALETTE.porcelain:colors?.worktop??'#fff1d8',walnut='#745038',chrome='#b3c7bd',g=new THREE.Group();g.name=`room-fixture:${kind}`;const paletteKey=JSON.stringify(colors??{}),enamelHighlight='#'+new THREE.Color(red).lerp(new THREE.Color(PALETTE.porcelain),.16).getHexString();
  if(kind==='stool'){
    if(seatStyle==='diner'){
      // A supported upholstered back makes these feel like bar seats, not the
      // starter's little soda-fountain stools. Cushion contact remains .75 m.
      for(const x of [-.175,.175])for(const z of [-.165,.165]){const leg=cylinder(.024,.031,.65,chrome,x,.329,z,10);leg.rotation.z=-x*.16;g.add(leg);}
      g.add(ring(.22,.018,chrome,0,.295,0),box(.51,.042,.48,walnut,0,.670,0,.06),box(.52,.09,.48,red,0,.705,-.017,.085),box(.47,.013,.023,enamelHighlight,0,.742,-.233,.006));
      for(const x of [-.208,.208])g.add(cylinder(.018,.022,.38,chrome,x,.861,.161,10));
      g.add(box(.52,.29,.085,red,0,1.050,.174,.093),box(.465,.017,.014,enamelHighlight,0,1.163,.127,.007));
      for(const x of [-.14,0,.14]){const seam=box(.007,.18,.009,enamelHighlight,x,1.049,.128,.003);g.add(seam);}
      return packMeshes(g,`room-diner-stool-v1:${paletteKey}`);
    }
    for(const x of [-.165,.165])for(const z of [-.165,.165]){const leg=cylinder(.025,.032,.65,chrome,x,.33,z,10);leg.rotation.z=-x*.15;g.add(leg);}
    g.add(ring(.212,.018,chrome,0,.30,0),cylinder(.237,.23,.058,chrome,0,.657),cylinder(.244,.239,.080,red,0,.707,0,24),cylinder(.217,.218,.010,enamelHighlight,0,.751,0,24));
    return packMeshes(g,`room-stool-v1:${paletteKey}`);
  }
  if(kind==='toilet'){
    g.add(box(.32,.32,.39,PALETTE.porcelain,0,.175,.03,.12),box(.35,.055,.47,cream,0,.039,0,.055));
    const bowl=ball(.285,PALETTE.porcelain,0,.427,-.081);bowl.scale.set(1,.65,1.22);g.add(bowl);
    const hollow=cylinder(.222,.197,.020,'#638d91',0,.566,-.098,28);hollow.scale.z=1.31;g.add(hollow);
    const water=cylinder(.125,.133,.021,'#abd0ce',0,.579,-.10,24);water.scale.z=1.34;g.add(water);
    const seat=ring(.226,.039,cream,0,.589,-.098);seat.scale.z=1.31;g.add(seat);
    g.add(box(.46,.49,.185,PALETTE.porcelain,0,.750,.226,.065),box(.49,.065,.22,cream,0,1.026,.23,.028),box(.068,.018,.040,chrome,.133,1.066,.223,.009));
    g.userData.surfaceHeight=.61;return packMeshes(g,'room-toilet-v1');
  }
  if(kind==='handwash_sink'){
    g.add(box(.56,.69,.46,'#bb9570',0,.357,0,.035),box(.59,.052,.49,walnut,0,.062,0,.022),box(.62,.068,.51,cream,0,.744,0,.047));
    for(const x of [-.14,.14])g.add(box(.235,.51,.022,'#d4b187',x,.388,-.247,.019),cylinder(.013,.014,.13,walnut,x,.399,-.265,8));
    const basin=cylinder(.221,.192,.042,'#7eaaa7',0,.787,-.019,28);basin.scale.z=.72;g.add(basin);const rim=ring(.229,.028,PALETTE.porcelain,0,.811,-.019);rim.scale.z=.74;g.add(rim);
    const faucet=geo('handwash-swan-faucet',()=>new THREE.TubeGeometry(new THREE.CubicBezierCurve3(new THREE.Vector3(0,.792,.168),new THREE.Vector3(0,1.12,.168),new THREE.Vector3(0,1.11,-.025),new THREE.Vector3(0,.932,-.025)),14,.018,7,false));g.add(mesh(faucet,chrome),cylinder(.045,.045,.014,chrome,0,.80,.167));
    g.add(box(.053,.115,.061,red,-.194,.867,.135,.013),box(.046,.018,.034,chrome,-.194,.928,.128,.005));g.userData.surfaceHeight=.83;return packMeshes(g,'room-handwash-v1');
  }
  if(kind==='counter_till'){
    g.add(box(.38,.070,.32,walnut,0,.040,0,.022),box(.32,.19,.27,cream,0,.16,.015,.038),box(.23,.10,.022,'#314e47',0,.225,-.125,.012));
    for(let r=0;r<2;r++)for(let c=0;c<3;c++)g.add(box(.042,.015,.044,c===2?red:PALETTE.mustard,(c-1)*.065,.195,-.045+r*.06,.004));return packMeshes(g,'room-till-v1');
  }
  if(kind==='counter_book'){
    g.add(box(.49,.042,.35,red,0,.027,0,.022),box(.45,.026,.31,cream,0,.061,0,.016),box(.49,.021,.35,red,0,.084,0,.018),box(.037,.075,.35,walnut,-.226,.053,0,.013),box(.19,.009,.16,cream,.017,.100,-.025,.022));return packMeshes(g,'room-counter-book-v1');
  }
  if(kind==='lift_gate'){
    for(const x of [-.445,.445])g.add(box(.11,.97,.70,red,x,.492,0,.021),box(.11,.105,.84,walnut,x,1.03,0,.023),box(.11,.021,.79,cream,x,1.094,0,.015));
    const leaf=new THREE.Group();leaf.name='lift-gate-leaf';leaf.position.set(-.39,1.03,0);leaf.add(box(.78,.105,.84,walnut,.39,0,0,.023),box(.78,.021,.79,cream,.39,.064,0,.015));packMeshes(leaf,'room-gate-leaf-v2');g.add(leaf);return g;
  }
  if(kind==='staff_door'){
    // The door lies on the same cell edge as the engine's staff-only opening.
    // A real jamb carries the hinge; the leaf swings into the kitchen cell.
    const assembly=new THREE.Group();assembly.name='staff-door-assembly';assembly.position.z=-.50;
    for(const x of [-.447,.447])assembly.add(box(.114,2.42,.19,walnut,x,1.21,0,.016),box(.035,2.37,.025,cream,x,1.185,-.109,.006));
    assembly.add(box(1.01,.14,.21,walnut,0,2.42,0,.016));
    const leaf=new THREE.Group();leaf.name='staff-door-leaf';leaf.position.set(-.383,.025,0);
    leaf.add(box(.762,2.285,.073,red,.381,1.1425,0,.020),box(.670,1.38,.017,cream,.381,1.572,-.049,.025),box(.665,.050,.022,walnut,.381,.851,-.052,.010));
    const rim=ring(.169,.024,chrome,.381,1.662,-.073);rim.rotation.x=0;
    const glass=cylinder(.148,.148,.019,'#a9cecb',.381,1.662,-.074,24);glass.rotation.x=Math.PI/2;
    leaf.add(rim,glass,box(.062,.26,.025,chrome,.657,.948,-.063,.018),box(.034,.185,.014,cream,.657,.948,-.081,.009),box(.63,.19,.019,chrome,.381,.17,-.05,.017));
    packMeshes(leaf,'room-staff-door-leaf-v2:'+paletteKey);assembly.add(leaf);g.add(assembly);return g;
  }
  if(kind==='service_hatch'||kind==='internal_pass'){
    const w=kind==='service_hatch'?1:2;g.add(box(w-.08,.93,.58,red,0,.505,0,.025),box(w-.025,.085,.61,walnut,0,.064,0,.022),box(w,.10,.70,walnut,0,1.04,0,.042),box(w-.08,.023,.62,cream,0,1.10,0,.028));
    for(const x of [-w/2+.065,w/2-.065])g.add(box(.11,1.08,.17,walnut,x,1.60,.13,.017));g.add(box(w,.15,.22,red,0,2.10,.13,.025));
    if(kind==='service_hatch'){
      const panel=new THREE.Group();panel.name='hatch-window';
      for(const x of [-.205,.205]){const pane=box(.37,.79,.026,'#c4e0d8',x,1.63,x<0?.14:.18,.008);pane.material=material('#c4e0d8').clone();pane.material.userData.sharedKitResource=false;pane.material.transparent=true;pane.material.opacity=.20;pane.material.depthWrite=false;pane.userData.inputPassthrough=true;(x<0?panel:g).add(pane);}
      for(const x of [-.405,-.005])panel.add(box(.029,.87,.050,cream,x,1.62,.125,.008));for(const y of [1.195,2.045])panel.add(box(.426,.035,.051,cream,-.205,y,.125,.008));g.add(panel);
    }
    g.userData.surfaceHeight=1.13;return g;
  }
  if(kind==='chef_bar'){
    const face=colors?.counter??'#9b7650',faceHighlight='#'+new THREE.Color(face).lerp(new THREE.Color('#e4cca3'),.15).getHexString(),faceShadow='#'+new THREE.Color(face).multiplyScalar(.76).getHexString();
    g.add(box(5.94,.88,.67,faceShadow,0,.493,0,.025),box(5.96,.093,.70,walnut,0,.094,0,.026));
    // Closely spaced timber flutes read as one crafted bar front at play size.
    // Geometry is batched by paint so the detail does not add 60 draw calls.
    for(let i=0;i<60;i++)g.add(box(.069,.73,.032,i%3===0?faceHighlight:face,(i-29.5)*.098,.505,-.352,.014));
    for(const x of [-2.955,2.955])g.add(box(.077,.92,.73,walnut,x,.506,0,.022));
    g.add(box(6.04,.087,.89,walnut,0,1.027,0,.060),box(6.02,.020,.86,'#bdad87',0,1.078,0,.045),box(6.015,.027,.855,cream,0,1.0965,0,.048));
    g.add(box(5.95,.032,.029,'#ceb887',0,.987,-.402,.009));
    for(const x of [-2.56,0,2.56])g.add(cylinder(.021,.025,.19,chrome,x,.208,-.509,10));
    const rail=cylinder(.024,.024,5.40,chrome,0,.30,-.521,12);rail.rotation.z=Math.PI/2;g.add(rail);
    g.userData.surfaceHeight=1.11;return packMeshes(g,`room-chef-bar-v2:${paletteKey}`);
  }
  const length=kind==='display_counter'?Math.max(1,Math.min(8,fixtureWidth??3)):3,isConsole=kind==='console',top=1.03;
  if(isConsole){for(const x of [-length/2+.28,length/2-.28])g.add(box(.09,.99,.09,walnut,x,.503,.11,.018),box(.10,.09,.51,walnut,x,.926,-.015,.018));}
  else{
    g.add(box(length,.91,.69,red,0,.471,0,.024),box(length,.10,.72,walnut,0,.073,0,.022));
    for(let i=0;i<length;i++){const x=i-(length-1)/2;g.add(box(0.82,0.61,0.025,enamelHighlight,x,0.52,-0.361,0.023));}
  }
  g.add(box(length,.105,isConsole?.62:.84,walnut,0,top,0,.026),box(length,.021,isConsole?.575:.79,cream,0,top+.064,0,.018));
  if(!isConsole){g.add(box(length-.04,.050,.035,chrome,0,.94,-.414,.015));for(const x of [-length/2+.30,length/2-.30])g.add(cylinder(.025,.025,.21,chrome,x,.24,-.51));const rail=cylinder(.023,.023,length-.6,chrome,0,.28,-.52,10);rail.rotation.z=Math.PI/2;g.add(rail);}
  if(kind==='display_counter'){
    // Condiments and the receipt rail leave the centre handoff slots clear.
    const x=-1.12;g.add(box(.48,.033,.29,walnut,x,1.126,.16,.018));
    for(const [dx,paint]of [[-.12,'#b94f43'],[.05,'#e3b454']] as const){g.add(cylinder(.058,.068,.158,paint,x+dx,1.224,.16,16),cylinder(.019,.046,.063,cream,x+dx,1.334,.16,12),box(.060,.054,.012,cream,x+dx,1.223,.094,.010));}
    g.add(box(.13,.105,.12,chrome,x+.21,1.194,.16,.019),box(.11,.12,.036,cream,x+.21,1.222,.14,.008),box(1.08,.023,.030,chrome,.27,1.216,.343,.006));
    for(let i=0;i<3;i++){const paper=box(.14,.20,.010,cream,-.04+i*.27,1.110,.354,.003);paper.rotation.z=(i-1)*.035;g.add(paper,box(.082,.008,.011,walnut,-.04+i*.27,1.125,.346,.003));}
  }
  g.userData.surfaceHeight=1.11;g.userData.fixtureWidth=length;return packMeshes(g,`room-${kind}-v2:${paletteKey}:${length}`);
}
function createLeafyPlant(){
  const g=group(cylinder(.225,.164,.385,PALETTE.porcelain,0,.202,0,20),cylinder(.239,.231,.065,PALETTE.tomato,0,.401,0,20),cylinder(.205,.205,.025,'#766149',0,.434,0,20));
  for(let i=0;i<12;i++){const a=i*Math.PI/6,start=new THREE.Vector3(Math.sin(a)*.178,.084,Math.cos(a)*.178),end=new THREE.Vector3(Math.sin(a)*.217,.352,Math.cos(a)*.217),rib=cylinder(.009,.009,start.distanceTo(end),'#dbc9a5',0,0,0,5);rib.position.copy(start).add(end).multiplyScalar(.5);rib.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.clone().sub(start).normalize());g.add(rib);}
  const stem=(a:THREE.Vector3,b:THREE.Vector3,r:number)=>{const m=cylinder(r,r*1.14,a.distanceTo(b),PALETTE.sage);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());g.add(m);};
  stem(new THREE.Vector3(0,.44,0),new THREE.Vector3(.025,1.52,0),.021);
  for(let i=0;i<7;i++){
    const a=i*2.4,base=.69+i*.114,center=new THREE.Vector3(Math.sin(a)*.245,base+.115,Math.cos(a)*.245),joint=new THREE.Vector3(.02,base,0);stem(joint,center,.012);
    const leaf=ball(.215,i%2?'#70966c':'#426d51',center.x,center.y,center.z);leaf.scale.set(.62,1,.25);leaf.rotation.set(.2*Math.cos(a),a,Math.sin(a)*-.48);g.add(leaf);
    const vein=cylinder(.006,.009,.25,'#9eb687',center.x,center.y,center.z);vein.rotation.copy(leaf.rotation);vein.translateZ(-.053);g.add(vein);
  }
  const top=ball(.15,PALETTE.mint,.027,1.56,0);top.scale.set(.42,1,.27);top.rotation.z=-.20;g.add(top);return packMeshes(g,'decor-tall-rubber-plant');
}
function createHerbPlanter(){
  const g=group(box(.72,.25,.36,PALETTE.sage,0,.185,0,.042),box(.66,.030,.30,'#705b3c',0,.32,0,.012));
  for(const z of [-.18,.18])g.add(box(.77,.064,.055,PALETTE.porcelain,0,.331,z,.014));for(const x of [-.36,.36])g.add(box(.054,.064,.36,PALETTE.porcelain,x,.331,0,.014));
  for(const x of [-.265,.265])for(const z of [-.105,.105])g.add(box(.065,.11,.055,PALETTE.oak,x,.059,z,.014));
  for(let i=0;i<3;i++){
    const x=(i-1)*.223,h=.51+(i%2)*.135;g.add(cylinder(.011,.016,h-.33,PALETTE.leaf,x,(h+.33)/2,0,8));
    for(let j=0;j<5;j++){const a=j*2.4+i,y=.407+j*.036+(i%2)*.06,leaf=ball(.086,j%2?'#8ca66b':'#527d52',x+Math.sin(a)*.052,y,Math.cos(a)*.061);leaf.scale.set(.63,1.08,.31);leaf.rotation.set(Math.cos(a)*.6,a,Math.sin(a)*.65);g.add(leaf);}
    const sprout=ball(.068,PALETTE.mint,x,h,0);sprout.scale.set(.65,1,.38);g.add(sprout);
  }
  g.add(box(.20,.089,.010,'#eadabc',0,.201,-.186,.014));for(const x of [-.055,0,.055])g.add(box(.017,.012,.006,PALETTE.sage,x,.2,-.193,.003));return packMeshes(g,'decor-herb-planter');
}
function createDaisyPlanter(){
  // Floor version is a planted ceramic tub, not a tiny tabletop vase stranded
  // on a tile. Counter mounting scales this same owned object to .38.
  const g=group(cylinder(.31,.245,.43,'#e8c680',0,.236,0,24),cylinder(.324,.314,.055,'#d2a65b',0,.470,0,24),cylinder(.285,.285,.020,'#715840',0,.497,0,24),cylinder(.252,.247,.041,PALETTE.porcelain,0,.036,0,24));
  for(let i=0;i<9;i++){
    const a=i*2.4,r=.13+(i%3)*.035,leaf=ball(.19,i%2?'#75985b':'#4f7e50',Math.sin(a)*r,.55+(i%3)*.07,Math.cos(a)*r);leaf.scale.set(.72,.35,1.25);leaf.rotation.set(Math.cos(a)*.3,a,Math.sin(a)*.33);g.add(leaf);
  }
  for(let i=0;i<5;i++){
    const a=i*2.4,x=Math.sin(a)*.18,z=Math.cos(a)*.14,y=.91+(i%3)*.085;
    const stalk=cylinder(.010,.014,y-.49,PALETTE.leaf,x*.62,(y+.49)/2,z*.62,8);stalk.rotation.z=-x*.2;g.add(stalk);
    for(let p=0;p<7;p++){
      const angle=p*Math.PI*2/7,petal=ball(.048,PALETTE.porcelain,x+Math.cos(angle)*.075,y+Math.sin(angle)*.075,z-.015);petal.scale.set(.83,1,.31);petal.rotation.z=angle-Math.PI/2;g.add(petal);
    }
    const centre=ball(.037,'#dfb24f',x,y,z-.033);centre.scale.z=.46;g.add(centre);
  }
  return packMeshes(g,'decor-floor-daisy-v2');
}
/** These are miniature counter ornaments, authored at catalogue scale; the
 * common counter mount makes their real footprint about a third of a tile. */
function createBurgerMascot(){
  const g=group(cylinder(.32,.34,.047,PALETTE.sage,0,.027,0,24),cylinder(.29,.31,.018,PALETTE.porcelain,0,.059,0,24));
  const spring=new THREE.CatmullRomCurve3(Array.from({length:41},(_,i)=>{const a=i/40*Math.PI*6;return new THREE.Vector3(Math.cos(a)*.057,.078+i/40*.105,Math.sin(a)*.057);}));
  g.add(mesh(geo('burger-bobble-spring',()=>new THREE.TubeGeometry(spring,40,.013,6,false)),PALETTE.steel));
  g.add(cylinder(.232,.219,.071,'#cf9854',0,.217,0,24),cylinder(.242,.242,.039,'#73513c',0,.277,0,24),cylinder(.238,.238,.025,PALETTE.tomato,0,.331,0,24));
  const cheese=box(.36,.012,.36,PALETTE.mustard,0,.305,0,.005);cheese.rotation.y=Math.PI/4;g.add(cheese);
  for(let i=0;i<8;i++){const a=i*Math.PI/4,leaf=ball(.087,i%2?'#9fb86e':'#749357',Math.cos(a)*.185,.353,Math.sin(a)*.185);leaf.scale.set(1,.21,.86);leaf.rotation.y=-a;g.add(leaf);}
  g.add(cylinder(.257,.254,.040,PALETTE.bun,0,.382,0,24));
  const bun=mesh(geo('burger-mascot-dome',()=>new THREE.SphereGeometry(.258,20,10,0,Math.PI*2,0,Math.PI/2)),PALETTE.bun,0,.401);bun.scale.y=.70;g.add(bun);
  for(let i=0;i<6;i++){const a=i*2.4,r=.050+(i%3)*.055,seed=box(.024,.010,.039,PALETTE.porcelain,Math.cos(a)*r,.401+Math.sqrt(.258**2-r*r)*.70,Math.sin(a)*r,.006);seed.rotation.y=a;g.add(seed);}
  for(const side of [-1,1]){const eye=ball(.019,PALETTE.ink,side*.070,.445,-.242);eye.scale.z=.45;g.add(eye);const cheek=ball(.025,PALETTE.tomato,side*.114,.420,-.236);cheek.scale.set(1,.40,.18);g.add(cheek);}
  const smile=new THREE.CatmullRomCurve3([new THREE.Vector3(-.032,.419,-.253),new THREE.Vector3(0,.405,-.255),new THREE.Vector3(.032,.419,-.253)]);g.add(mesh(geo('burger-mascot-smile',()=>new THREE.TubeGeometry(smile,8,.008,5,false)),PALETTE.ink));
  g.name='decor-burger-mascot';return packMeshes(g,'decor-burger-mascot');
}
function createRetroRadio(){
  const g=group(box(.68,.395,.29,PALETTE.porcelain,0,.238,0,.090),box(.625,.290,.019,'#b94f43',0,.244,-.147,.047));
  for(const x of [-.23,.23])g.add(box(.10,.038,.17,PALETTE.wood,x,.023,0,.014));
  const speaker=cylinder(.113,.113,.013,PALETTE.ink,-.146,.244,-.167,24);speaker.rotation.x=Math.PI/2;g.add(speaker);
  for(let row=-3;row<=3;row++)for(let col=-3;col<=3;col++)if(row*row+col*col<12)g.add(ball(.0057,PALETTE.metal,-.146+col*.030,.244+row*.030,-.177));
  g.add(box(.154,.034,.011,'#ddbe83',.155,.309,-.167,.011),box(.014,.027,.006,PALETTE.tomato,.177,.309,-.176,.004));
  const dial=cylinder(.066,.066,.034,PALETTE.porcelain,.150,.206,-.180,20);dial.rotation.x=Math.PI/2;g.add(dial,box(.009,.039,.006,PALETTE.sage,.150,.215,-.201,.003));
  for(const x of [-.095,.095])g.add(box(.020,.063,.037,PALETTE.wood,x,.453,.025,.007));g.add(box(.21,.027,.038,PALETTE.wood,0,.479,.025,.009));
  const antenna=group(cylinder(.012,.015,.31,PALETTE.metal,0,.155),ball(.022,PALETTE.metal,0,.316));antenna.position.set(-.23,.409,.08);antenna.rotation.z=.22;g.add(antenna);
  g.name='decor-retro-radio';return packMeshes(g,'decor-retro-radio');
}
function createCondimentCaddy(){
  const g=group(box(.67,.035,.38,PALETTE.oak,0,.023,0,.019));
  for(const x of [-.316,.316])g.add(box(.036,.147,.36,PALETTE.oak,x,.112,0,.013));
  for(const z of [-.177,.177])g.add(box(.65,.109,.026,PALETTE.wood,0,.092,z,.011));
  for(const [x,color]of [[-.188,'#b94f43'],[-.005,PALETTE.mustard]] as const){
    g.add(cylinder(.070,.078,.208,color,x,.161,0,16),cylinder(.036,.070,.061,color,x,.295,0,16),cylinder(.020,.032,.056,PALETTE.porcelain,x,.353,0,12),cylinder(.031,.032,.019,color,x,.321,0,12));
    g.add(box(.087,.093,.012,PALETTE.porcelain,x,.167,-.075,.021),box(.041,.014,.006,color,x,.169,-.084,.005));
  }
  g.add(box(.020,.162,.32,PALETTE.oak,.109,.119,0,.006));
  for(let i=0;i<4;i++){const napkin=box(.15,.218,.015,i%2?PALETTE.porcelain:'#eadfca',.216,.160+i*.012,-.047+i*.035,.007);napkin.rotation.z=-.10;g.add(napkin);}
  g.name='decor-condiment-caddy';return packMeshes(g,'decor-condiment-caddy');
}
function createWelcomeMat(){
  const g=group(box(.88,.018,.64,PALETTE.wood,0,.011,0,.014),box(.84,.007,.60,PALETTE.porcelain,0,.023,0,.010));
  for(let x=0;x<8;x++)for(let z=0;z<6;z++)g.add(box(.098,.003,.093,(x+z)%2?'#d9927c':'#efd2b8',-.35+x*.10,.028,-.235+z*.094,.001));
  g.add(box(.37,.003,.37,PALETTE.porcelain,0,.031,0,.090));
  // A sewn burger emblem, flat like ink on a rug rather than a loose meal.
  g.add(box(.245,.003,.089,PALETTE.bun,0,.034,-.071,.041),box(.259,.003,.018,PALETTE.leaf,0,.034,-.013,.006),box(.247,.003,.034,'#76513b',0,.034,.020,.011),box(.25,.003,.063,PALETTE.bun,0,.034,.071,.022));
  for(const x of [-.066,0,.066])g.add(box(.014,.003,.023,PALETTE.porcelain,x,.037,-.075,.004));
  for(const x of [-.387,.387])for(let z=0;z<7;z++)g.add(box(.010,.003,.040,PALETTE.porcelain,x,.032,-.24+z*.08,.003));
  g.name='decor-welcome-mat';return packMeshes(g,'decor-welcome-mat');
}
const STAGE_ORNAMENTS=['diner_clock','bear_statue','deer_trophy','pie_display','coffee_sign','jukebox','wine_rack','deco_mirror','brass_planter','chandelier','brass_sconce','velvet_rope','runner_menu'];
/** Quirky roadside keepsakes and restrained supper-club pieces. Wall art is
 * authored on the same +Z support plane as the existing prints; miniatures
 * are scaled only when mounted, and the chandelier really hangs overhead. */
function createStageOrnament(kind:string){
  const g=new THREE.Group(),walnut='#73513b',wood='#ac8053',honey='#c49c65',brass='#bfa36b',brassLight='#e4cfa0',teal='#426b61',cream='#fff2d5',ink='#344a44';g.name=`decor-${kind}`;
  const oval=(r:number,color:string,x:number,y:number,z:number,sx=1,sy=1,sz=1)=>{const m=ball(r,color,x,y,z);m.scale.set(sx,sy,sz);g.add(m);return m;};
  const rod=(a:[number,number,number],b:[number,number,number],r:number,color:string)=>{const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),m=cylinder(r,r,start.distanceTo(end),color);m.position.copy(start).add(end).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());g.add(m);return m;};
  const disk=(r:number,h:number,color:string,x:number,y:number,z:number)=>{const d=cylinder(r,r,h,color,x,y,z,32);d.rotation.x=Math.PI/2;g.add(d);return d;};
  const wall=['diner_clock','deer_trophy','coffee_sign','deco_mirror','brass_sconce'].includes(kind);if(wall)g.userData.wallMountPlane=.49;
  if(kind==='diner_clock'){
    // A little pendulum clock, given a roof and a brass sunburst dial.
    g.add(box(.65,.79,.18,walnut,0,1.405,.4,.065),box(.54,.64,.022,wood,0,1.418,.293,.041),box(.72,.075,.24,honey,0,1.024,.370,.025));
    const roof=box(.77,.12,.25,walnut,0,1.833,.365,.023);g.add(roof);
    disk(.253,.041,brass,0,1.519,.258);disk(.219,.044,cream,0,1.519,.246);
    for(let i=0;i<12;i++){const a=i*Math.PI/6,tick=box(.013,i%3===0?.041:.023,.010,ink,Math.sin(a)*.182,1.519+Math.cos(a)*.182,.217,.003);tick.rotation.z=-a;g.add(tick);}
    rod([0,1.519,.207],[-.089,1.612,.207],.010,ink);rod([0,1.519,.207],[.105,1.544,.207],.007,ink);disk(.021,.014,brass,0,1.519,.201);
    g.add(box(.183,.147,.019,ink,0,1.145,.266,.032),box(.015,.109,.019,brass,0,1.164,.244,.005));disk(.044,.020,brassLight,0,1.102,.235);
    for(const x of [-.25,.25])g.add(box(.044,.73,.025,honey,x,1.417,.276,.009));
  }else if(kind==='bear_statue'){
    // One friendly carved bear rather than a taxidermy animal: round muzzle,
    // visible wood seams, apron and a wooden salmon tucked under its arm.
    g.add(box(.82,.12,.68,walnut,0,.07,0,.056),box(.73,.034,.59,honey,0,.146,0,.043));
    for(const x of [-.18,.18]){oval(.205,walnut,x,.29,-.078,.85,.73,1.14);oval(.17,wood,x,.404,.035,.87,1.13,.84);}
    oval(.36,wood,0,.765,.022,.90,1.19,.69);oval(.29,honey,0,.784,-.147,.82,.97,.23);
    oval(.33,wood,0,1.258,-.010,1,.95,.84);for(const side of [-1,1]){oval(.115,walnut,side*.239,1.484,.005,1,1,.62);oval(.073,honey,side*.239,1.484,-.057,1,1,.32);oval(.020,ink,side*.097,1.302,-.270,1,1.14,.38);}
    oval(.147,honey,0,1.193,-.261,1.14,.78,.69);oval(.048,ink,0,1.243,-.356,1.12,.74,.55);rod([0,1.224,-.355],[0,1.171,-.368],.008,walnut);
    rod([0,1.169,-.368],[-.031,1.155,-.354],.007,walnut);rod([0,1.169,-.368],[.031,1.155,-.354],.007,walnut);
    g.add(box(.365,.43,.055,teal,0,.747,-.271,.066),box(.29,.026,.052,cream,0,.715,-.307,.007),box(.235,.13,.020,honey,0,.71,-.313,.019));
    for(const side of [-1,1]){const arm=oval(.16,wood,side*.292,.879,-.015,.82,1.50,.78);arm.rotation.z=-side*.31;rod([side*.115,1.061,-.19],[side*.135,.889,-.253],.020,teal);}
    const fish=new THREE.Group();fish.add(box(.38,.12,.095,'#97a291',0,0,0,.051));const tail=box(.10,.13,.036,'#6e8978',.217,0,0,.016);tail.rotation.z=Math.PI/4;fish.add(tail);fish.add(ball(.012,ink,-.13,.016,-.052));fish.position.set(-.295,.79,-.176);fish.rotation.z=-.26;g.add(fish);
    for(const x of [-.065,.04])g.add(box(.012,.22,.008,'#bf9360',x,1.38,-.270,.004));
    g.userData.floorOrnament=true;
  }else if(kind==='deer_trophy'){
    const plaque=disk(.30,.079,walnut,0,1.455,.446);plaque.scale.set(.90,1,1.32);const inner=disk(.267,.024,honey,0,1.455,.394);inner.scale.set(.90,1,1.32);
    oval(.205,wood,0,1.455,.267,.82,1.20,.79);oval(.126,honey,0,1.342,.132,.89,.84,.99);oval(.039,walnut,0,1.35,.015,.99,.73,.62);
    for(const side of [-1,1]){
      const ear=oval(.108,wood,side*.17,1.588,.273,1.21,.46,.33);ear.rotation.z=side*.40;oval(.068,honey,side*.188,1.592,.241,1.05,.34,.23);oval(.017,ink,side*.067,1.49,.110,.74,1.04,.4);
      rod([side*.083,1.624,.291],[side*.135,1.822,.308],.023,walnut);rod([side*.135,1.822,.308],[side*.278,1.946,.318],.019,honey);
      rod([side*.167,1.846,.311],[side*.161,2.00,.310],.015,honey);rod([side*.230,1.903,.314],[side*.329,1.912,.314],.013,honey);rod([side*.135,1.779,.304],[side*.283,1.787,.305],.018,honey);rod([side*.282,1.787,.305],[side*.316,1.870,.305],.012,honey);
    }
    g.userData.carvedKeepsake=true;
  }else if(kind==='pie_display'){
    g.add(cylinder(.33,.36,.045,brass,0,.030,0,32),cylinder(.29,.30,.030,cream,0,.071,0,32),cylinder(.271,.268,.10,'#b27744',0,.136,0,32),cylinder(.26,.264,.018,'#e5bc77',0,.195,0,32));
    for(let i=0;i<6;i++){const x=(i-2.5)*.074,w=2*Math.sqrt(.245**2-x*x);g.add(box(w,.014,.025,'#f0d194',0,.211,x,.009),box(.024,.014,w,'#f0d194',x,.225,0,.009));}
    for(let i=0;i<18;i++){const a=i*Math.PI/9;oval(.026,'#edc786',Math.sin(a)*.261,.206,Math.cos(a)*.261,1,.57,1);}
    // Clear cloche uses thin open ribs and a pale lip so it never hides the pie.
    g.add(ring(.334,.013,'#bfd7cb',0,.079),cylinder(.052,.057,.031,brass,0,.461,0,16),ball(.039,brassLight,0,.491,0));
    for(let i=0;i<4;i++){const a=i*Math.PI/2,curve=new THREE.CubicBezierCurve3(new THREE.Vector3(Math.sin(a)*.332,.085,Math.cos(a)*.332),new THREE.Vector3(Math.sin(a)*.345,.42,Math.cos(a)*.345),new THREE.Vector3(Math.sin(a)*.07,.458,Math.cos(a)*.07),new THREE.Vector3(0,.456,0));g.add(mesh(geo(`pie-cloche-rib:${i}`,()=>new THREE.TubeGeometry(curve,10,.008,5,false)),'#c9dcd0'));}
  }else if(kind==='coffee_sign'){
    g.add(box(.89,.69,.075,walnut,0,1.465,.451,.073),box(.822,.624,.014,cream,0,1.465,.402,.052),box(.74,.022,.011,'#af5c44',0,1.191,.391,.005));
    // Porcelain cup emblem and simple wood-cut lettering: COFFEE.
    g.add(box(.255,.137,.024,'#ac5f48',0,1.619,.378,.043),box(.306,.016,.024,'#ac5f48',0,1.532,.378,.006));const handle=ring(.066,.017,'#ac5f48',.147,1.618,.378);handle.rotation.x=0;g.add(handle);
    for(const x of [-.07,.035])rod([x,1.723,.377],[x+.028,1.783,.377],.008,honey);
    // The sign is viewed from -Z; local +X is the viewer's left. Mirror the
    // authoring coordinates, not the finished mount, so COFFEE reads properly.
    const glyphs=['C','O','F','F','E','E'];for(let i=0;i<glyphs.length;i++){const x=-(i-2.5)*.108,y=1.350,w=.07,h=.115,t=.013,c=glyphs[i];g.add(box(t,h,.012,teal,x+w/2,y,.379,.002),box(w,t,.012,teal,x,y+h/2,.379,.002));if(c!=='F')g.add(box(w,t,.012,teal,x,y-h/2,.379,.002));if(c==='O')g.add(box(t,h,.012,teal,x-w/2,y,.379,.002));if(c==='F'||c==='E')g.add(box(w*.85,t,.012,teal,x+.005,y,.379,.002));}
  }else if(kind==='jukebox'){
    g.add(box(.76,1.02,.52,walnut,0,.534,0,.08),box(.79,.10,.55,brass,0,.061,0,.044),box(.58,.64,.033,teal,0,.408,-.274,.085));
    const arch=new THREE.Shape();arch.moveTo(-.38,.82);arch.lineTo(-.38,1.01);arch.absarc(0,1.01,.38,Math.PI,0,true);arch.lineTo(.38,.82);arch.closePath();const cap=mesh(geo('roadside-jukebox-arched-cap',()=>new THREE.ExtrudeGeometry(arch,{depth:.50,bevelEnabled:false})),walnut,0,0,-.25);g.add(cap);
    const curve=new THREE.CatmullRomCurve3(Array.from({length:21},(_,i)=>{const a=Math.PI-i*Math.PI/20;return new THREE.Vector3(Math.cos(a)*.30,1.00+Math.sin(a)*.30,-.295);}));g.add(mesh(geo('roadside-jukebox-light-arch',()=>new THREE.TubeGeometry(curve,24,.036,8,false)),brassLight));
    for(const x of [-.30,.30])g.add(cylinder(.037,.037,.71,brassLight,x,.641,-.295,12),box(.076,.093,.055,'#b9604e',x,.961,-.322,.011));
    g.add(box(.48,.27,.029,'#bcd2be',0,.963,-.285,.054));for(let i=0;i<5;i++)g.add(box(.365,.013,.010,cream,0,1.054-i*.048,-.309,.005));
    for(let i=0;i<7;i++)g.add(box(.37,.018,.020,brass,0,.216+i*.055,-.304,.006));for(const x of [-.08,.08])disk(.029,.025,brassLight,x,.753,-.324);
    g.add(box(.30,.07,.023,cream,0,.653,-.312,.018),box(.095,.013,.011,walnut,0,.653,-.330,.003));
  }else if(kind==='wine_rack'){
    g.add(box(.85,.14,.58,walnut,0,.081,0,.026),box(.83,1.41,.055,walnut,0,.842,.259,.016));for(const x of [-.38,.38])g.add(box(.071,1.44,.53,walnut,x,.861,0,.019));
    for(const y of [.19,.50,.81,1.12,1.54])g.add(box(.85,.052,.57,wood,0,y,0,.018));for(const x of [-.13,.13])g.add(box(.042,.94,.50,wood,x,.662,0,.012));
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){
      const x=(col-1)*.255,y=.289+row*.308,z=-.07,body=cylinder(.078,.078,.33,(row+col)%3===0?'#62504b':'#42664e',x,y,z,12);body.rotation.x=Math.PI/2;g.add(body);const neck=cylinder(.028,.030,.117,'#486953',x,y,-.292,10);neck.rotation.x=Math.PI/2;g.add(neck);disk(.031,.031,'#ad6658',x,y,-.361);g.add(box(.112,.084,.011,cream,x,y,-.247,.009));
    }
    for(let i=0;i<3;i++){const glass=group(cylinder(.015,.015,.20,brassLight,0,.10,0,8),cylinder(.053,.027,.083,cream,0,.225,0,12),cylinder(.053,.053,.014,cream,0,.010,0,16));glass.position.set((i-1)*.195,1.165,-.012);g.add(glass);}g.add(box(.68,.025,.37,brass,0,1.580,0,.021));
  }else if(kind==='deco_mirror'){
    const outline=new THREE.Shape();outline.moveTo(-.369,1.025);outline.lineTo(-.369,1.672);outline.absarc(0,1.672,.369,Math.PI,0,true);outline.lineTo(.369,1.025);outline.closePath();g.add(mesh(geo('supper-deco-mirror-arch',()=>new THREE.ExtrudeGeometry(outline,{depth:.062,bevelEnabled:false})),brass,0,0,.428));
    g.add(box(.661,.665,.011,'#a7bfb4',0,1.39,.415,.011));const top=disk(.327,.012,'#a7bfb4',0,1.672,.415);top.scale.y=.91;
    g.add(box(.74,.071,.10,brass,0,1.034,.422,.017),box(.625,.010,.015,brassLight,0,1.063,.405,.003));
    for(let i=0;i<7;i++){const a=Math.PI/6+i*Math.PI/9;rod([0,1.06,.393],[Math.cos(a)*.31,1.66+Math.sin(a)*.29,.393],.007,brass);}
    for(const x of [-.324,.324])g.add(box(.025,.688,.018,brassLight,x,1.379,.403,.004));
  }else if(kind==='brass_planter'){
    g.add(cylinder(.276,.23,.41,brass,0,.282,0,24),cylinder(.288,.28,.030,brassLight,0,.497,0,24),cylinder(.25,.25,.023,walnut,0,.506,0,24));for(const x of [-.18,.18])for(const z of [-.16,.16])g.add(cylinder(.018,.023,.16,ink,x,.087,z,10));
    for(let i=0;i<11;i++){const a=i*2.4,y=.97+(i%4)*.12,x=Math.sin(a)*(.17+(i%3)*.037),z=Math.cos(a)*(.17+(i%3)*.037);rod([0,.52,0],[x,y-.10,z],.011,teal);const leaf=oval(.19,i%2?'#54755b':'#7f9461',x,y,z,.44,1.0,.18);leaf.rotation.set(Math.cos(a)*.43,a,Math.sin(a)*-.40);}
    for(let i=0;i<12;i++){const a=i*Math.PI/6;rod([Math.sin(a)*.236,.13,Math.cos(a)*.236],[Math.sin(a)*.271,.47,Math.cos(a)*.271],.006,brassLight);}
  }else if(kind==='chandelier'){
    g.userData.ceilingMountHeight=2.70;g.userData.clearanceHeight=1.93;g.userData.inputPassthrough=true;
    g.add(cylinder(.121,.095,.057,brass,0,2.672,0,20),cylinder(.015,.015,.36,brass,0,2.48,0,10),ring(.392,.022,brass,0,2.112),ring(.406,.016,brassLight,0,2.335),ring(.370,.016,brass,0,2.047));
    for(let i=0;i<16;i++){const a=i*Math.PI/8,x=Math.sin(a)*.394,z=Math.cos(a)*.394;g.add(cylinder(.024,.023,.254,i%2?'#ecdfb9':'#faf2d4',x,2.193,z,7));rod([x,2.32,z],[0,2.365,0],.008,brass);}
    for(let i=0;i<4;i++){const a=i*Math.PI/2;rod([Math.sin(a)*.34,2.328,Math.cos(a)*.34],[0,2.66,0],.009,brass);}
    g.add(cylinder(.32,.32,.017,'#f3e6c2',0,2.061,0,24),cylinder(.080,.061,.085,brass,0,2.018,0,16),ball(.025,brassLight,0,1.962,0));
  }else if(kind==='brass_sconce'){
    disk(.117,.05,brass,0,1.49,.465);disk(.08,.024,brassLight,0,1.49,.43);rod([0,1.49,.427],[0,1.49,.232],.019,brass);rod([0,1.49,.232],[0,1.735,.232],.019,brass);
    g.add(cylinder(.071,.090,.05,brass,0,1.694,.232,16),cylinder(.073,.161,.225,cream,0,1.827,.232,20),ring(.16,.010,brass,0,1.715,.232),ring(.072,.009,brassLight,0,1.941,.232));
    for(const side of [-1,1])rod([0,1.535,.245],[side*.145,1.555,.281],.008,brassLight);
  }else if(kind==='velvet_rope'){
    for(const x of [-.325,.325])g.add(cylinder(.122,.164,.049,brass, x,.029,0,24),cylinder(.067,.083,.032,brassLight,x,.069,0,20),cylinder(.024,.036,.658,brass,x,.411,0,12),cylinder(.047,.047,.044,brassLight,x,.734,0,16),ball(.052,brassLight,x,.801,0));
    const rope=new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.325,.727,0),new THREE.Vector3(0,.48,0),new THREE.Vector3(.325,.727,0));g.add(mesh(geo('supper-velvet-rope',()=>new THREE.TubeGeometry(rope,18,.038,8,false)),'#7d494a'));
    for(const x of [-.299,.299]){const link=ring(.028,.008,brassLight,x,.721,0);link.rotation.x=0;g.add(link);}
  }else if(kind==='runner_menu'){
    g.add(box(.52,.037,.32,brass,0,.027,0,.028),box(.375,.46,.048,teal,0,.284,.018,.028),box(.310,.385,.011,cream,0,.288,-.014,.016));
    for(let i=0;i<4;i++){g.add(box(.197-i%2*.05,.015,.008,walnut,-.025,.350-i*.063,-.024,.003),box(.025,.015,.008,walnut,.106,.350-i*.063,-.024,.003));}g.add(box(.209,.025,.008,brass,0,.447,-.024,.004),box(.238,.012,.008,brass,0,.094,-.024,.003));
  }
  return packMeshes(g,`stage-ornament-v1:${kind}`);
}
export function createModel(kind:string,options:ModelOptions={}):THREE.Group{
  if(STAGE_ORNAMENTS.includes(kind))return createStageOrnament(kind);
  if(['display_counter','console','chef_bar','lift_gate','staff_door','service_hatch','internal_pass','toilet','handwash_sink','stool','counter_till','counter_book'].includes(kind))return roomFixture(kind,options.roomColors,options.seatStyle,options.fixtureWidth);
  if(kind==='fridge')return createFridge(options.color??PALETTE.sage);
  if(kind==='plates')return createPlateRack(options.stock??2);
  if(kind==='cups')return createCupStand(options.stock??2);
  if(kind==='boxes')return createBoxStand();
  if(kind==='chef'||kind==='waiter'||kind==='customer'||kind==='cashier')return createCharacter(kind,options.look??0,options.color);
  if(kind==='chair')return createChair(options.color??PALETTE.tomato);
  if(kind==='table_1')return createDiningTable(1,options.tableStyle,options.placeSettings);
  if(kind==='table_2'||kind==='table')return createDiningTable(2,options.tableStyle,options.placeSettings);
  if(kind==='table_4')return createDiningTable(4,options.tableStyle,options.placeSettings);
  if(kind==='booth_2')return createBoothTable(options.roomColors);
  if(kind==='plant'||kind==='red_planter')return plant();
  if(kind==='leafy_plant')return createLeafyPlant();
  if(kind==='herb_planter')return createHerbPlanter();
  if(kind==='burger_mascot')return createBurgerMascot();
  if(kind==='retro_radio')return createRetroRadio();
  if(kind==='condiment_caddy')return createCondimentCaddy();
  if(kind==='welcome_mat')return createWelcomeMat();
  if(kind==='daisy_pot')return createDaisyPlanter();
  if(kind==='parcel'||kind==='delivery'){
    const g=group(box(.59,.045,.50,PALETTE.wood,0,.057,0,.020));
    for(const x of [-.277,.277])g.add(box(.035,.40,.50,PALETTE.oak,x,.267,0,.012));
    for(const z of [-.233,.233])g.add(box(.54,.40,.035,PALETTE.oak,0,.267,z,.012));
    g.add(box(.46,.07,.37,PALETTE.porcelain,0,.13,0,.030));
    for(const side of [-1,1]){const flap=new THREE.Group();flap.name=side<0?'parcel-left-flap':'parcel-right-flap';flap.position.set(side*.285,.477,0);flap.add(box(.285,.029,.50,PALETTE.oak,-side*.1425,0,0,.010));g.add(flap);}
    const tape=group(box(.065,.024,.51,PALETTE.mustard,0,.500,0,.009),box(.065,.44,.019,PALETTE.mustard,0,.274,-.257,.006));tape.name='parcel-tape';g.add(tape);
    g.add(box(.17,.13,.018,PALETTE.porcelain,.135,.33,-.264,.017));for(let i=0;i<2;i++)g.add(box(.10,.016,.009,PALETTE.sage,.135,.35-i*.044,-.278,.005));return g;
  }
  if(kind==='book'){const g=group(box(.55,.51,.41,PALETTE.oak,0,.265,0));const book=group(box(.57,.075,.45,PALETTE.sage,0,.54,0,.025),box(.52,.045,.40,PALETTE.porcelain,0,.554,0,.015),box(.57,.022,.45,PALETTE.sage,0,.589,0,.017));book.rotation.x=.18;book.position.y=.02;g.add(book,box(.20,.012,.14,PALETTE.mustard,0,.616,-.09,.018));return g;}
  if(kind==='till'){const g=cabinet(PALETTE.tomato,.68);g.add(box(.49,.24,.41,PALETTE.porcelain,0,.97,0,.07),box(.44,.10,.41,PALETTE.wood,0,.90,-.03,.017),box(.29,.14,.022,PALETTE.dark,0,1.04,-.204,.02));for(let row=0;row<2;row++)for(let col=0;col<3;col++)g.add(box(.047,.025,.047,col===2?PALETTE.tomato:PALETTE.mustard,(col-1)*.075,1.102,-.04+row*.063,.008));return g;}
  if(kind==='trophy'){const g=group(box(.48,.15,.42,PALETTE.oak,0,.08),cylinder(.14,.18,.065,PALETTE.mustard,0,.185),cylinder(.045,.07,.20,PALETTE.mustard,0,.30),cylinder(.22,.07,.28,PALETTE.mustard,0,.52));for(const x of [-.21,.21]){const handle=ring(.12,.035,PALETTE.mustard,x,.53,0);handle.rotation.x=0;g.add(handle);}g.add(box(.22,.08,.015,PALETTE.porcelain,0,.08,-.218,.008));return g;}
  if(kind==='spill'||kind==='jam'){const g=new THREE.Group();for(let i=0;i<5;i++){const puddle=ball(.22,i%2?'#d4a373':'#bc8055',Math.sin(i*1.8)*.18,.022,Math.cos(i*1.8)*.15);puddle.scale.set(1,.08,.7);g.add(puddle);}const cup=createFoodModel({recipeId:'coffee',kind:'dish'});cup.rotation.z=Math.PI/2;cup.position.set(.25,.105,.12);g.add(cup);return g;}
  if(kind==='checkered_shelf'){const g=group(box(.72,.81,.43,PALETTE.wood,0,.43),box(.62,.66,.045,PALETTE.sage,0,.46,.215));for(const y of [.19,.48,.81])g.add(box(.73,.05,.47,PALETTE.oak,0,y,0));const teacup=createFoodModel({recipeId:'coffee',kind:'dish'});teacup.position.set(-.16,.5,-.02);teacup.scale.setScalar(.55);g.add(teacup,box(.13,.21,.15,PALETTE.tomato,.18,.32,0,.016),box(.09,.19,.15,PALETTE.mustard,.05,.31,0,.016));return g;}
  if(kind==='chrome_clock'){const clock=cylinder(.33,.33,.07,PALETTE.metal,0,1.54,.40,32);clock.rotation.x=Math.PI/2;const face=cylinder(.286,.286,.08,PALETTE.porcelain,0,1.54,.389,32);face.rotation.x=Math.PI/2;const g=group(clock,face,box(.023,.19,.017,PALETTE.ink,0,1.61,.34,.004),box(.14,.023,.017,PALETTE.ink,.058,1.54,.34,.004));for(let i=0;i<12;i++)g.add(ball(.012,PALETTE.ink,Math.sin(i*Math.PI/6)*.24,1.54+Math.cos(i*Math.PI/6)*.24,.342));return g;}
  if(kind==='keepsake_shelf'){
    const g=group(box(.88,.74,.045,PALETTE.sage,0,1.49,.467,.025),box(.93,.080,.35,PALETTE.oak,0,1.16,.315,.022),box(.93,.065,.35,PALETTE.oak,0,1.875,.315,.022));
    for(const x of [-.437,.437])g.add(box(.055,.70,.35,PALETTE.oak,x,1.52,.315,.014));
    for(const [x,color]of [[-.28,PALETTE.tomato],[-.16,PALETTE.sage]] as const)g.add(box(.105,.28,.22,color,x,1.337,.28,.012),box(.070,.016,.012,PALETTE.porcelain,x,1.41,.162,.003));
    if((options.stock??0)>0){const trophy=createModel('trophy');trophy.scale.setScalar(.42);trophy.position.set(.16,1.203,.28);g.add(trophy);}else{g.add(box(.25,.21,.035,PALETTE.porcelain,.13,1.32,.29,.019),box(.20,.16,.008,PALETTE.mint,.13,1.32,.268,.012));}
    g.userData.wallMountPlane=.49;return packMeshes(g,'room-keepsake-shelf:'+((options.stock??0)>0));
  }
  if(FRAMED_PRINTS.includes(kind))return createFramedPrint(kind);
  if(kind==='tip_jar'){const g=group(cylinder(.18,.16,.31,'#b6d3c1',0,.18),cylinder(.19,.19,.035,PALETTE.porcelain,0,.35));for(let i=0;i<5;i++){const coin=cylinder(.052,.052,.014,PALETTE.mustard,(i%3-1)*.07,.11+(i%2)*.035,Math.floor(i/3)*.09-.045);g.add(coin);}return g;}
  if(kind==='neon_sign'){const g=group(box(.82,.42,.04,PALETTE.sage,0,1.3,.41,.07));for(const x of [-.25,-.08,.09,.26])g.add(box(.1,.20,.024,PALETTE.mustard,x,1.3,.379,.025));return g;}
  if(kind==='tray'){const g=group(box(.66,.045,.43,PALETTE.metal,0,.04,0,.06));for(const x of [-.30,.30])g.add(box(.03,.065,.43,PALETTE.steel,x,.075,0,.015));return g;}
  if(kind==='food'||kind.startsWith('recipe:'))return createFoodModel({recipeId:options.recipeId??kind.slice(7),kind:'dish',stage:options.stage});
  if(kind==='dirty_plate')return createPlate(true);
  if(kind==='bin'){const g=group(cylinder(.29,.245,.65,PALETTE.sage,0,.36),cylinder(.315,.315,.065,PALETTE.mint,0,.705),box(.13,.035,.17,PALETTE.steel,0,.075,-.27,.012));for(let i=0;i<8;i++){const angle=i*Math.PI/4;g.add(box(.017,.45,.017,'#769583',Math.cos(angle)*.259,.38,Math.sin(angle)*.259,.004));}g.userData.surfaceHeight=.76;return g;}
  if(kind==='queue_bench'){const g=group(box(1.7,.10,.52,PALETTE.oak,0,.50),box(1.7,.27,.09,PALETTE.oak,0,.81,.23));for(const x of [-.67,.67])g.add(box(.075,.53,.07,PALETTE.sage,x,.275,-.17),box(.075,.94,.07,PALETTE.sage,x,.48,.19));return g;}
  const enamel=kind==='prep'||kind==='pass'?PALETTE.tomato:kind==='grill'||kind==='oven'?PALETTE.sage:PALETTE.mint;
  const g=cabinet(options.color??enamel,kind==='pass'?1.85:.85);g.userData.surfaceHeight=.91;
  if(kind==='crate'){
    g.clear();g.add(box(.82,.24,.77,PALETTE.wood,0,.19),box(.76,.045,.70,'#956d47',0,.33));
    for(const z of [-.37,.37])for(const y of [.16,.31,.47])g.add(box(.85,.10,.065,PALETTE.oak,0,y,z,.01));
    for(const x of [-.39,.39])for(const z of [-.32,.32])g.add(box(.055,.52,.055,PALETTE.wood,x,.28,z));
    for(let i=0;i<4;i++){const bun=ball(.135,PALETTE.bun,(i%2)*.27-.14,.45,Math.floor(i/2)*.26-.13);bun.scale.y=.65;g.add(bun);}
    g.add(box(.31,.16,.022,PALETTE.porcelain,0,.32,-.410,.026));
    for(let i=0;i<3;i++)g.add(box(.033,.065,.012,PALETTE.tomato,(i-1)*.063,.32,-.428,.010));g.userData.surfaceHeight=.53;
  }else if(kind==='grill'){
    g.add(box(.78,.065,.68,PALETTE.metal,0,.887,0,.025),box(.69,.035,.59,PALETTE.dark,0,.927,0,.021),box(.78,.13,.065,PALETTE.steel,0,.979,.344,.025));
    for(let i=0;i<7;i++)g.add(box(.61,.018,.025,PALETTE.steel,0,.955,-.235+i*.078,.008));
    g.add(box(.76,.12,.030,PALETTE.dark,0,.715,-.420,.019));
    for(const x of [-.235,0,.235]){
      const surround=cylinder(.056,.056,.020,PALETTE.metal,x,.719,-.446,16),knob=cylinder(.042,.044,.037,PALETTE.tomato,x,.719,-.463,12);surround.rotation.x=knob.rotation.x=Math.PI/2;g.add(surround,knob,box(.011,.026,.008,PALETTE.porcelain,x,.732,-.486,.004));
    }g.userData.surfaceHeight=.97;
  }else if(kind==='prep'){
    g.add(box(.71,.050,.58,PALETTE.wood,0,.890,0,.036),box(.67,.016,.54,PALETTE.oak,0,.923,0,.028));
    for(const x of [-.23,.23])g.add(box(.019,.006,.48,'#a67a50',x,.935,0,.003));
    const knife=group(box(.22,.016,.070,PALETTE.metal,0,0,0,.006),box(.14,.027,.042,PALETTE.dark,.171,0,0,.014),box(.025,.024,.072,PALETTE.metal,.112,0,0,.007));knife.position.set(.08,.944,.17);knife.rotation.y=-.22;g.add(knife);g.userData.surfaceHeight=.96;
  }else if(kind==='fryer'){
    g.add(box(.71,.21,.64,PALETTE.metal,0,.970,0,.045),box(.56,.026,.46,'#987c48',0,1.083,0,.021));
    const basket=new THREE.Group();basket.name='fryer-basket';basket.userData.restY=0;basket.userData.raisedY=.22;
    for(const x of [-.247,.247])basket.add(box(.025,.13,.42,PALETTE.steel,x,1.078,0,.009));
    for(const z of [-.212,.212])basket.add(box(.52,.13,.024,PALETTE.steel,0,1.078,z,.009));
    basket.add(box(.045,.029,.29,PALETTE.metal,0,1.123,-.326,.010),box(.12,.065,.21,PALETTE.dark,0,1.123,-.477,.027));
    for(let i=0;i<5;i++)basket.add(box(.016,.019,.42,PALETTE.metal,-.20+i*.10,1.020,0,.003));
    for(let i=0;i<5;i++)basket.add(box(.48,.019,.015,PALETTE.metal,0,1.020,-.17+i*.085,.003));
    packMeshes(basket,'fryer-moving-basket');g.add(basket);
    g.add(box(.60,.125,.074,PALETTE.sage,0,1.088,.30,.028));for(const x of [-.14,.14]){const knob=cylinder(.035,.035,.025,PALETTE.mustard,x,1.084,.248);knob.rotation.x=Math.PI/2;g.add(knob);}g.userData.surfaceHeight=1.14;
  }else if(kind==='sink'){
    g.add(box(.70,.030,.57,PALETTE.steel,0,.878,0,.075),box(.53,.025,.40,'#729a97',0,.898,0,.075));
    for(const x of [-.325,.325])g.add(box(.055,.075,.54,PALETTE.metal,x,.925,0,.023));for(const z of [-.25,.25])g.add(box(.64,.07,.055,PALETTE.metal,0,.925,z,.023));
    g.add(cylinder(.054,.054,.012,PALETTE.steel,0,.919,.035,16));
    const arch=geo('diner-swan-faucet',()=>new THREE.TubeGeometry(new THREE.CubicBezierCurve3(new THREE.Vector3(-.17,.94,.23),new THREE.Vector3(-.17,1.39,.23),new THREE.Vector3(-.17,1.34,-.035),new THREE.Vector3(-.17,1.12,-.035)),12,.025,7,false));g.add(mesh(arch,PALETTE.metal));
    g.add(cylinder(.05,.05,.032,PALETTE.steel,-.17,.950,.23),cylinder(.034,.035,.080,PALETTE.metal,.15,.987,.25),box(.13,.030,.031,PALETTE.tomato,.15,1.035,.25,.011));g.userData.surfaceHeight=.965;
  }else if(kind==='drinks'||kind==='blender'||kind==='coffee'){
    g.add(box(.46,.07,.38,PALETTE.steel,0,.91),cylinder(.17,.155,.38,kind==='coffee'?'#ba9270':'#f0dba0',0,1.13),cylinder(.185,.185,.055,PALETTE.metal,0,1.345),box(.095,.12,.055,PALETTE.dark,0,1.08,-.18));
    const cup=createFoodModel({recipeId:kind==='coffee'?'coffee':'lemonade',kind:'raw'});cup.scale.setScalar(.48);cup.position.set(0,.9,-.27);g.add(cup);g.userData.surfaceHeight=1.39;
  }else if(kind==='oven'){
    g.add(box(.61,.39,.028,PALETTE.steel,0,.43,-.445),box(.46,.25,.029,'#566a62',0,.43,-.466),box(.42,.038,.05,PALETTE.metal,0,.65,-.475));
  }else if(kind==='waffle'){
    g.add(box(.55,.11,.43,PALETTE.mustard,0,.93),box(.45,.10,.34,PALETTE.steel,0,1.04),box(.25,.04,.08,PALETTE.dark,0,1.05,-.24));g.userData.surfaceHeight=1.10;
  }else if(kind==='pass'){
    for(const x of [-.75,.75])g.add(cylinder(.022,.024,.64,PALETTE.steel,x,1.15,.24));g.add(box(1.65,.10,.34,PALETTE.tomato,0,1.47,.10),box(1.46,.025,.24,'#f5ce75',0,1.41,.10));
  }else g.userData.unsupportedModel=kind;
  if((options.tier??1)>1){const badge=cylinder(.055,.055,.018,PALETTE.mustard,.30,.65,-.438);badge.rotation.x=Math.PI/2;g.add(badge);}
  return packMeshes(g,`machine:${kind}:${options.color??enamel}:${options.tier??1}`);
}

/** Dispose unique GPU resources when an owning preview renderer is removed. */
export function disposeObject(root:THREE.Object3D){
  const usedGeometry=new Set<THREE.BufferGeometry>(),usedMaterial=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
  root.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.Sprite||object instanceof THREE.Line){if(object instanceof THREE.Mesh||object instanceof THREE.Line)usedGeometry.add(object.geometry);const list=Array.isArray(object.material)?object.material:[object.material];for(const m of list){usedMaterial.add(m);const map=(m as THREE.MeshBasicMaterial).map;if(map)textures.add(map);}}});
  // The world and its catalogue deliberately share immutable kit resources.
  // Renderer.dispose releases its own GPU context; removing an icon must not
  // invalidate geometry currently used by the live diner.
  usedGeometry.forEach(g=>{if(!g.userData.sharedKitResource)g.dispose();});usedMaterial.forEach(m=>{if(!m.userData.sharedKitResource)m.dispose();});textures.forEach(t=>t.dispose());
}
