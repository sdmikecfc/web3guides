/** Real model geometry and scene adapters; no WebGL or simulation mutations by rendering. */
import assert from 'node:assert/strict';
import {readFile,readFileSync} from 'node:fs';
import {promisify} from 'node:util';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import ts from 'typescript';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),Module=require('node:module');
for(const extension of ['.ts','.mts'])require.extensions[extension]=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,filename);
const originalLoad=Module._load;Module._load=function(id,parent,isMain){return originalLoad.call(this,id.startsWith('@/')?resolve(root,'src',id.slice(2)):id,parent,isMain);};
const {RECIPES}=require('../src/lib/chef/diner/content.ts');
const {createService}=require('../src/lib/chef/diner/service.ts');
const {createDiner,homeSimulationConfig}=require('../src/lib/chef/diner/progression.ts');
const {createHomeWorld,stepHomeWorld}=require('../src/lib/chef/diner/home-simulation.ts');
const {createRally,startRally}=require('../src/lib/chef/diner/rally.ts');
const {serviceScene}=require('../src/app/chef/diner-preview/scene-adapter.ts');
const {homeScene}=require('../src/app/chef/diner-preview/home-scene.ts');
const threeUrl=pathToFileURL(resolve(root,'node_modules/three/build/three.module.js')).href,THREE=await import(threeUrl);
const modelPath=resolve(root,'src/app/chef/diner-preview/models.ts');
const source=(await promisify(readFile)(modelPath,'utf8')).replaceAll("from 'three'",`from '${threeUrl}'`).replaceAll("from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'",`from '${pathToFileURL(resolve(root,'node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js')).href}'`);
const compiled=ts.transpileModule(source,{fileName:modelPath,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const kit=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const now=Date.UTC(2026,8,20,12);let groups=0,geometryCases=0;
function test(name,run){run();groups++;console.log(`PASS ${name}`);}
function fingerprint(model){
  const hash=createHash('sha256');model.updateMatrixWorld(true);
  model.traverse(object=>{if(!object.isMesh)return;const positions=object.geometry.getAttribute('position').array,indices=object.geometry.index?.array;
    hash.update(Buffer.from(positions.buffer,positions.byteOffset,positions.byteLength));if(indices)hash.update(Buffer.from(indices.buffer,indices.byteOffset,indices.byteLength));
    const materials=Array.isArray(object.material)?object.material:[object.material];hash.update(JSON.stringify([object.matrixWorld.elements.map(n=>Number(n.toFixed(6))),materials.map(m=>m.color.toArray())]));
  });return hash.digest('hex');
}
function model(recipeId,kind,mastery,stage){return kit.createFoodModel({recipeId,kind,mastery,stage});}
function inspect(model,label){
  assert.equal(model.userData.unsupportedRecipe,undefined,label);model.updateMatrixWorld(true);let triangles=0;
  model.traverse(object=>{if(!object.isMesh)return;const position=object.geometry.getAttribute('position');for(const value of position.array)assert(Number.isFinite(value),label);for(const value of object.matrixWorld.elements)assert(Number.isFinite(value),label);triangles+=(object.geometry.index?.count??position.count)/3;});
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  assert(bounds.min.y>=-.04&&bounds.max.y<=.7,`${label}: plate anchor/height`);assert(size.x<=.75&&size.z<=.75,`${label}: serving footprint`);assert(triangles>0&&triangles<45000,`${label}: triangle budget`);geometryCases++;
}
function item(recipeId,id='dish',mastery=999){return {id,recipeId,kind:'dish',stage:'plated',step:RECIPES.find(r=>r.id===recipeId).steps.length,createdTick:0,cold:false,mastery};}
function allFood(scene){return [...scene.objects.flatMap(o=>[o.food,...(o.slots??[]).map(s=>s.food)]),...scene.people.map(p=>p.held),...scene.tables.flatMap(t=>t.seats.map(s=>s.item))].filter(Boolean);}
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}

test('all 24 plated recipes have distinct basic, signature and mastered geometry within serving bounds',()=>{
  assert.equal(RECIPES.length,24);
  for(const recipe of RECIPES){
    const stages=[0,3,10].map(level=>model(recipe.id,'dish',level)),hashes=stages.map(fingerprint);
    assert.equal(new Set(hashes).size,3,`${recipe.id}: mastery has no visible geometry/material change`);
    assert.equal(stages[0].userData.presentation,undefined);assert.equal(stages[1].userData.presentation,'signature');assert.equal(stages[2].userData.presentation,'masterpiece');
    stages.forEach((m,i)=>{inspect(m,`${recipe.id}/level${[0,3,10][i]}`);kit.disposeObject(m);});
    for(const [level,band] of [[2,0],[9,1],[11,2]]){const m=model(recipe.id,'dish',level);assert.equal(fingerprint(m),hashes[band],`${recipe.id}: incorrect mastery threshold`);kit.disposeObject(m);}
  }
});
test('mastery never decorates raw, processed, burnt or dirty objects, including every recipe intermediate',()=>{
  for(const recipe of RECIPES){
    const phases=[['raw',undefined],['burnt',undefined],['dirty',undefined],...recipe.steps.map(step=>['processed',step.output])];
    for(const [kind,stage] of phases){
      let baseline;for(const level of [0,3,10]){const m=model(recipe.id,kind,level,stage),hash=fingerprint(m);inspect(m,`${recipe.id}/${kind}/${stage??''}/${level}`);baseline??=hash;assert.equal(hash,baseline,`${recipe.id}/${kind}/${stage}: mastery disguised an unfinished/dirty object`);assert.equal(m.userData.presentation,undefined);kit.disposeObject(m);}
    }
  }
});
test('service station, held, helper and table food derive distinct configured levels without changing state',()=>{
  const service=createService({tier:2,recipeLevels:{classic_burger:3,fries:10},helpers:[{id:'runner-test',role:'runner'}]});
  service.chef.held=item('classic_burger','chef');service.helpers[0].held=item('fries','helper');service.stations[0].slots[0].item=item('classic_burger','station');service.tables[0].seats[0].item=item('fries','table');
  const before=JSON.stringify(service);freeze(service);const scene=serviceScene(service),foods=allFood(scene);
  assert.equal(JSON.stringify(service),before);assert(foods.length>=5);
  for(const food of foods)assert.equal(food.mastery,food.recipeId==='fries'?10:3);
  assert.notEqual(scene.people[0].held,service.chef.held);assert.notEqual(scene.tables[0].seats[0].item,service.tables[0].seats[0].item);
});
test('equal-loadout rally plating follows event levels even when the owner has mastered the recipe',()=>{
  const owned=createDiner(now);owned.recipes.classic_burger.level=10;owned.rally=startRally(createRally(now),now);const rally=owned.rally.service;
  rally.chef.held=item('classic_burger','rally-held',10);const before=JSON.stringify(owned);freeze(owned);const scene=serviceScene(rally);
  assert.equal(scene.people[0].held.mastery,0);assert.equal(JSON.stringify(owned),before);
  assert.equal(fingerprint(kit.createFoodModel(scene.people[0].held)),fingerprint(model('classic_burger','dish',0)));
});
test('real home service sends owned mastery to all food locations while preserving live simulation state',()=>{
  const owned=createDiner(now);owned.recipes.classic_burger.level=3;const config=homeSimulationConfig(owned),world=createHomeWorld(config),seen=new Set();
  // Deliberately stale visual-world recipe configuration must not replace the
  // current owned recipe record, nor may adapter metadata mutate live food.
  world.config.recipeLevels.classic_burger=0;const saved=JSON.stringify(owned);freeze(owned);
  for(let tick=0;tick<3000;tick++){
    stepHomeWorld(world,1);if(tick%5)continue;const before=JSON.stringify(world),scene=homeScene(owned,world,null,'sage');assert.equal(JSON.stringify(world),before);assert.equal(JSON.stringify(owned),saved);
    for(const food of allFood(scene)){assert.equal(food.mastery,3);assert.equal(food.recipeId,'classic_burger');}
    if(scene.objects.some(o=>o.food))seen.add('station');if(scene.objects.some(o=>o.slots?.some(s=>s.food)))seen.add('slot');if(scene.people.some(p=>p.held))seen.add('held');if(scene.tables.some(t=>t.seats.some(s=>s.item)))seen.add('table');
  }
  assert.deepEqual([...seen].sort(),['held','slot','station','table']);assert(world.metrics.plates>0);
});
test('rebuilding mastery variants does not grow retained kit resources after warmup',()=>{
  const before=kit.modelKitStats();for(let cycle=0;cycle<3;cycle++)for(const recipe of RECIPES)for(const level of [0,3,10])kit.disposeObject(model(recipe.id,'dish',level));assert.deepEqual(kit.modelKitStats(),before);
});
console.log(`${groups} mastery-art groups passed; ${geometryCases} real geometry cases, ${RECIPES.length} dishes. No raster/visual approval claimed.`);
