/** The setup trailer uses actual equipment geometry and normal scene picking. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const threeUrl=pathToFileURL(resolve('node_modules/three/build/three.module.js')).href,THREE=await import(threeUrl);
async function sourceUrl(file,replacements=[]){
  let source=await readFile(file,'utf8');for(const [from,to] of replacements)source=source.replaceAll(`from '${from}'`,`from '${to}'`);
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
}
const modelsUrl=await sourceUrl('src/app/chef/diner-preview/models.ts',[['three',threeUrl],['three/examples/jsm/geometries/RoundedBoxGeometry.js',pathToFileURL(resolve('node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js')).href]]),kit=await import(modelsUrl);
const {createEquipmentTrailer}=await import(await sourceUrl('src/app/chef/diner-preview/trailer.ts',[['three',threeUrl],['./models',modelsUrl]]));
const {firstVisibleSceneSurface}=await import(await sourceUrl('src/app/chef/diner-preview/scene-picking.ts'));
const kinds=['grill','sink','fryer','prep','coffee','table_1'],slots=kinds.map((kind,i)=>({id:`stored_${i}`,kind,tier:1}));
let cases=0,pickChecks=0;
for(const [width,height] of [[4,3],[7,4]])for(const count of [0,1,2,4,6]){
  const input=slots.slice(0,count),snapshot=JSON.stringify(input),root=createEquipmentTrailer(input,width,height),layout=root.userData.layout;
  assert.equal(JSON.stringify(input),snapshot,'model building mutates the inventory input');assert.equal(layout.slots.length,count);
  const bounds=new THREE.Box3().setFromObject(root);assert(bounds.min.x>=width+1.9&&bounds.max.x<=width+4.4,'trailer leaves the supported road strip');assert(Math.abs(bounds.min.y+.009)<1e-5,'wheels/jack do not meet the road');
  assert.deepEqual(root.userData.bounds,{min:{x:bounds.min.x,y:bounds.min.y,z:bounds.min.z},max:{x:bounds.max.x,y:bounds.max.y,z:bounds.max.z}});
  for(const slot of layout.slots){
    const group=root.getObjectByName(`trailer-slot:${slot.id}`),box=new THREE.Box3().setFromObject(group),size=box.getSize(new THREE.Vector3());assert.equal(group.userData.pick.id,`trailer:${slot.id}`);
    assert(size.x<=.961&&size.z<=.991,'equipment overflows its storage slot');assert(box.min.y>=layout.deckHeight&&box.min.y<layout.deckHeight+.012,'equipment does not meet the loading mat');
    for(const other of layout.slots.filter(other=>other.id!==slot.id)){const second=new THREE.Box3().setFromObject(root.getObjectByName(`trailer-slot:${other.id}`));assert(!box.intersectsBox(second),'stored equipment overlaps another slot');}
  }
  // Check real visibility under every supported camera quarter-turn: each item
  // must have a rendered surface that the normal opaque-occlusion picker hits.
  if(count){
    const center=bounds.getCenter(new THREE.Vector3()),camera=new THREE.OrthographicCamera(-4,4,4,-4,.01,100),raycaster=new THREE.Raycaster();
    for(let turn=0;turn<4;turn++){
      const angle=-Math.PI/4+turn*Math.PI/2;camera.position.copy(center).add(new THREE.Vector3(Math.sin(angle)*12,Math.tan(35*Math.PI/180)*12,Math.cos(angle)*12));camera.lookAt(center);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
      for(const slot of layout.slots){
        const b=new THREE.Box3().setFromObject(root.getObjectByName(`trailer-slot:${slot.id}`)),points=[];
        for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new THREE.Vector3(x,y,z).project(camera));
        const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));let visible=0;
        for(let x=0;x<11;x++)for(let y=0;y<11;y++){raycaster.setFromCamera(new THREE.Vector2(minX+(maxX-minX)*(x+.5)/11,minY+(maxY-minY)*(y+.5)/11),camera);if(firstVisibleSceneSurface(raycaster.intersectObject(root,true))?.target?.id===`trailer:${slot.id}`)visible++;}
        assert(visible>=3,`stored ${slot.kind} has no usable visible target from camera turn ${turn}`);pickChecks++;
      }
    }
  }
  let privateDisposed=0,privateCount=0,sharedDisposed=0;const geometries=new Set();root.traverse(part=>{if(part.isMesh)geometries.add(part.geometry);});for(const geometry of geometries){if(geometry.userData.sharedKitResource)geometry.addEventListener('dispose',()=>sharedDisposed++);else{privateCount++;geometry.addEventListener('dispose',()=>privateDisposed++);}}
  kit.disposeObject(root);assert(privateCount>0&&privateDisposed===privateCount,'packed trailer geometry is not disposed');assert.equal(sharedDisposed,0,'trailer disposal invalidates shared live models');cases++;
}
const wide=createEquipmentTrailer(['pass','table_4','queue_bench','oven','blender','fryer'].map(id=>({id,kind:id,tier:1})),4,3);
for(const slot of wide.userData.layout.slots){const size=new THREE.Box3().setFromObject(wide.getObjectByName(`trailer-slot:${slot.id}`)).getSize(new THREE.Vector3());assert(size.x<=.961&&size.z<=.991,'wide equipment clips its slot');}
kit.disposeObject(wide);
console.log(`Diner trailer PASS: ${cases} grounded layouts, ${pickChecks} real visibility/picking checks, wide cargo fit, unchanged input and correct resource disposal.`);
