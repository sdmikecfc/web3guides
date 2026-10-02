/** Headless lifecycle/state checks for the actual Three cooking effect pool. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),threeUrl=pathToFileURL(resolve(root,'node_modules/three/build/three.module.js')).href;
const THREE=await import(threeUrl),filename=resolve(root,'src/app/chef/diner-preview/cooking-effects.ts');
const source=(await readFile(filename,'utf8')).replace("from 'three'",`from '${threeUrl}'`);
const compiled=ts.transpileModule(source,{fileName:filename,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createCookingEffects}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
let groups=0;
function test(name,run){run();groups++;console.log(`PASS ${name}`);}
function food(kind='raw',cold=false){return {recipeId:'fries',kind,stage:kind==='processed'?'fried':'potatoes',cold};}
function station(kind='fryer',state='working',item=food(),progress=.2){return {id:'test-station',kind,x:2,y:3,slots:[{food:item,state,progress}]};}
function pool(effects,name){return effects.group.getObjectByName(name);}
function visible(effects,name){return effects.group.visible&&pool(effects,name).visible;}
function snapshot(effects){return effects.group.children.map(mesh=>Array.from(mesh.instanceMatrix.array));}
function transform(mesh,index){const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();mesh.getMatrixAt(index,matrix);matrix.decompose(position,rotation,scale);return {position,scale};}

test('idle, absent, dirty and cold food do not pretend to cook; hot working food does',()=>{
  const effects=createCookingEffects();
  for(const object of [station('fryer','idle'),station('fryer','working',null),station('grill','working',food('dish',true)),station('sink','working',food('dirty')),station('prep','working')]){
    effects.setState(object,1.14);effects.update(.05,false,false);assert.equal(effects.group.visible,false);
  }
  for(const kind of ['grill','fryer','oven','coffee','waffle']){
    effects.setState(station(kind),1.14);effects.update(.05,false,false);assert(visible(effects,'cooking-steam'));assert(!visible(effects,'burnt-smoke'));
  }
  effects.dispose();
});
test('ready food has a steady status glint; burnt food has distinct smoke and cold ready food has neither',()=>{
  const effects=createCookingEffects();effects.setState(station('fryer','ready',food('processed')),1.14);effects.update(0,false,false);
  assert(visible(effects,'ready-glint'));assert(!visible(effects,'cooking-steam'));assert(!visible(effects,'cooking-bubbles'));
  effects.setState(station('fryer','burning',food('burnt')),1.14);effects.update(0,false,false);
  assert(visible(effects,'burnt-smoke'));assert(!visible(effects,'ready-glint'));assert.notEqual(pool(effects,'burnt-smoke').material.color.getHex(),pool(effects,'cooking-steam').material.color.getHex());
  effects.setState(station('fryer','ready',food('dish',true)),1.14);effects.update(0,false,false);assert(!effects.group.visible);effects.dispose();
});
test('hand-operated blender bubbles require actual progress and stop when the player stops',()=>{
  const effects=createCookingEffects();effects.setState(station('blender','working',food(),.1),.96);effects.update(.05,false,false);assert(!effects.group.visible);
  effects.setState(station('blender','working',food(),.12),.96);effects.update(.05,false,false);assert(visible(effects,'cooking-bubbles'));assert(!visible(effects,'cooking-steam'));
  for(let i=0;i<5;i++){effects.setState(station('blender','working',food(),.12),.96);effects.update(.05,false,false);}
  assert(!effects.group.visible,'unfinished untouched bowl must stop fizzing');effects.dispose();
});
test('effects use supplied worktop height and exactly follow the food slot grid in every rotation',()=>{
  const effects=createCookingEffects();const parent=new THREE.Group();parent.position.set(4,.4,2);parent.add(effects.group);
  for(let rotation=0;rotation<4;rotation++){
    const object={...station('coffee','ready',food('dish')),rotation,slots:Array.from({length:5},()=>({food:food('dish'),state:'ready'}))};
    effects.setState(object,1.39);effects.update(0,false,true);parent.updateMatrixWorld(true);
    assert.equal(effects.group.rotation.y,Math.PI-rotation*Math.PI/2);
    for(let index=0;index<5;index++){
      const {position,scale}=transform(pool(effects,'ready-glint'),index);
      const slotX=(index%3-1)*.28,slotZ=(Math.floor(index/3)-.5)*.31;
      assert(Math.abs(position.x-slotX-.115)<1e-6);assert(Math.abs(position.z-slotZ+.06)<1e-6);assert(Math.abs(position.y-1.58)<1e-6);assert(scale.x>0);
      const actual=position.clone().applyMatrix4(effects.group.matrixWorld),expected=new THREE.Vector3(slotX+.115,1.58,slotZ-.06).applyAxisAngle(new THREE.Vector3(0,1,0),Math.PI-rotation*Math.PI/2).add(parent.position);
      assert(actual.distanceTo(expected)<1e-6);
    }
  }
  effects.dispose();
});
test('paused and reduced-motion states freeze poses without wall-clock catch-up',()=>{
  const effects=createCookingEffects();effects.setState(station(),1.14);effects.update(.05,false,false);const initial=snapshot(effects);
  effects.update(.05,false,false);assert.notDeepEqual(snapshot(effects),initial);const moving=snapshot(effects);
  for(let i=0;i<120;i++)effects.update(100,true,false);assert.deepEqual(snapshot(effects),moving);
  effects.update(.05,false,true);const quiet=snapshot(effects);for(let i=0;i<120;i++)effects.update(.05,false,true);assert.deepEqual(snapshot(effects),quiet);
  effects.update(.05,false,false);assert.notDeepEqual(snapshot(effects),quiet);effects.dispose();
});
test('pooled geometry stays bounded, effects never intercept input, and all private resources dispose once',()=>{
  const effects=createCookingEffects(),parent=new THREE.Group();parent.add(effects.group);const meshes=[...effects.group.children],resources=new Set();
  for(const mesh of meshes){resources.add(mesh);resources.add(mesh.geometry);resources.add(mesh.material);assert.equal(mesh.count,mesh.name==='ready-glint'?6:18);assert(!mesh.isLight);}
  assert.equal(effects.group.userData.inputPassthrough,true);assert.equal(meshes.length,4);
  const buffers=meshes.map(mesh=>mesh.instanceMatrix.array);effects.setState(station(),1.14);for(let i=0;i<600;i++)effects.update(.016,false,false);
  assert.deepEqual(effects.group.children,meshes);for(let i=0;i<meshes.length;i++)assert.equal(meshes[i].instanceMatrix.array,buffers[i]);
  const counts=new Map();for(const resource of resources)resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)??0)+1));
  effects.dispose();effects.dispose();assert.equal(parent.children.length,0);for(const resource of resources)assert.equal(counts.get(resource),1);
  effects.setState(station(),1.14);effects.update(.05,false,false);assert.equal(effects.group.children.length,0);
});
console.log(`${groups} cooking effect groups passed.`);
