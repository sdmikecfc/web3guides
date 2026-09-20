/** Actual model geometry: a print must stay flat, face into the room and meet its wall. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const threeURL=pathToFileURL(resolve('node_modules/three/build/three.module.js')).href;
const THREE=await import(threeURL);
let source=await readFile('src/app/chef/diner-preview/models.ts','utf8');
source=source.replaceAll("from 'three'",`from '${threeURL}'`).replaceAll("from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'",`from '${pathToFileURL(resolve('node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js')).href}'`);
const compiled=ts.transpileModule(source,{fileName:'models.ts',compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const kit=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const collectionSource=ts.transpileModule(await readFile('src/lib/chef/diner/collections.ts','utf8'),{fileName:'collections.ts',compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {DECOR}=await import(`data:text/javascript;base64,${Buffer.from(collectionSource).toString('base64')}`);
const ids=DECOR.filter(item=>item.wall&&item.id!=='chrome_clock').map(item=>item.id);
const close=(actual,expected,label)=>assert(Math.abs(actual-expected)<.00001,`${label}: ${actual} != ${expected}`);
let cases=0,vertices=0;
for(const id of ids){
  const model=kit.createModel(id),art=model.getObjectByName('print-artwork');
  assert(art,`${id}: no separate flat artwork`);
  const full=new THREE.Box3().setFromObject(model),paint=new THREE.Box3().setFromObject(art),size=full.getSize(new THREE.Vector3());
  close(size.x,.69,`${id} frame width`);close(size.y,.75,`${id} frame height`);
  assert(size.z<=.06501,`${id}: image protrudes from the frame`);
  close(full.max.z,.49,`${id}: wall mounting plane`);
  assert(paint.min.z>full.min.z&&paint.max.z<full.max.z,`${id}: illustration floats outside the frame slab`);
  assert(paint.max.z-paint.min.z<.009,`${id}: illustration is a 3D prop instead of ink`);
  assert(paint.min.x>=-.3001&&paint.max.x<=.3001&&paint.min.y>=1.159&&paint.max.y<=1.821,`${id}: print escapes its paper`);
  art.updateMatrixWorld(true);art.traverse(object=>{
    if(!object.isMesh)return;
    const p=object.geometry.getAttribute('position'),n=object.geometry.getAttribute('normal');
    for(let i=0;i<p.count;i++){vertices++;assert(Number.isFinite(p.getX(i))&&Number.isFinite(p.getY(i))&&Number.isFinite(p.getZ(i)),`${id}: invalid art vertex`);assert(n.getZ(i)<-.99,`${id}: artwork faces the back of the wall`);}
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),index=object.geometry.index;
    for(let i=0;i<(index?.count??p.count);i+=3){a.fromBufferAttribute(p,index?index.getX(i):i);b.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);assert(b.sub(a).cross(c.sub(a)).z<1e-10,`${id}: reversed triangle would be invisible from the room`);}
  });
  for(let facing=0;facing<4;facing++){
    model.rotation.y=Math.PI-facing*Math.PI/2;model.updateMatrixWorld(true);
    const intoRoom=new THREE.Vector3(0,0,-1).applyQuaternion(model.quaternion),towardWall=intoRoom.clone().negate(),center=new THREE.Vector3(0,1.49,0);
    const hit=new THREE.Raycaster(center.clone().addScaledVector(intoRoom,2),towardWall).intersectObject(model,true)[0];
    assert(hit,`${id}/${facing}: invisible from the room`);assert.equal(hit.object.parent,art,`${id}/${facing}: central illustration is hidden by frame backing`);
    const contact=model.localToWorld(new THREE.Vector3(0,1.49,.49));
    close(contact.dot(towardWall),.49,`${id}/${facing}: rotated back no longer meets the wall`);
    const rotated=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    assert((facing%2?rotated.x:rotated.z)<=.06501,`${id}/${facing}: print sticks sideways into the room`);cases++;
  }
  kit.disposeObject(model);
}
const warmed=kit.modelKitStats();for(let i=0;i<5;i++)for(const id of ids)kit.disposeObject(kit.createModel(id));
assert.deepEqual(kit.modelKitStats(),warmed,'repeated catalogue/world rebuilds grow the shared print cache');
console.log(`Wall art PASS: ${ids.length} framed illustrations, ${cases} wall orientations and raycasts, ${vertices} front-facing art vertices. No WebGL or visual approval claimed.`);
