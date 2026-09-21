/** Geometry integrity for the actual Three.js kit; no browser or WebGL required. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const threeUrl=pathToFileURL(resolve(root,'node_modules/three/build/three.module.js')).href;
const THREE=await import(threeUrl);
async function sourceModule(relative){
  let source=await readFile(resolve(root,relative),'utf8');
  source=source.replaceAll("from 'three'",`from '${threeUrl}'`).replaceAll("from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'",`from '${pathToFileURL(resolve(root,'node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js')).href}'`);
  const result=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},fileName:relative});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString('base64')}`);
}
const kit=await sourceModule('src/app/chef/diner-preview/models.ts');
const {RECIPES,EQUIPMENT,INGREDIENTS}=await sourceModule('src/lib/chef/diner/content.ts');
const {DECOR,charmOf}=await sourceModule('src/lib/chef/diner/collections.ts');
let models=0,triangles=0;
function inspect(model,label,{minY=-.04,maxY=2.1,maxWidth=2.1,maxDepth=2.1}={}){
  assert.equal(model.userData.unsupportedModel,undefined,`${label}: generic model fallback`);
  assert.equal(model.userData.unsupportedRecipe,undefined,`${label}: generic recipe fallback`);
  assert.equal(model.userData.unsupportedIngredient,undefined,`${label}: generic ingredient fallback`);
  model.updateMatrixWorld(true);let meshCount=0,triangleCount=0;
  model.traverse(object=>{
    if(!object.isMesh)return;meshCount++;
    const position=object.geometry.getAttribute('position');assert.ok(position?.count>=3,`${label}: empty mesh`);
    for(const attribute of [position,object.geometry.getAttribute('normal')])if(attribute)for(const value of attribute.array)assert.ok(Number.isFinite(value),`${label}: nonfinite vertex/normal`);
    const count=object.geometry.index?.count??position.count;assert.equal(count%3,0,`${label}: incomplete triangle`);triangleCount+=count/3;
    for(const value of object.matrixWorld.elements)assert.ok(Number.isFinite(value),`${label}: nonfinite transform`);
    const materials=Array.isArray(object.material)?object.material:[object.material];
    for(const material of materials)assert.ok(material.isMeshToonMaterial,`${label}: material escaped shared toon specification`);
  });
  assert.ok(meshCount>0&&triangleCount>0,`${label}: empty model`);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  assert.ok(bounds.min.y>=minY,`${label}: below anchor (${bounds.min.y.toFixed(3)})`);
  assert.ok(bounds.max.y<=maxY,`${label}: exceeds height (${bounds.max.y.toFixed(3)})`);
  assert.ok(size.x<=maxWidth&&size.z<=maxDepth,`${label}: exceeds footprint ${size.x.toFixed(3)}×${size.z.toFixed(3)}`);
  assert.ok(size.x>.01&&size.y>.005&&size.z>.01,`${label}: degenerate bounds`);
  assert.ok(triangleCount<45000,`${label}: geometry budget exceeded (${triangleCount})`);
  models++;triangles+=triangleCount;return bounds;
}
function fingerprint(model){
  model.updateMatrixWorld(true);const hash=createHash('sha256');
  model.traverse(object=>{if(!object.isMesh)return;object.geometry.computeBoundingBox();const material=Array.isArray(object.material)?object.material[0]:object.material;
    hash.update(JSON.stringify([object.geometry.type,object.geometry.getAttribute('position').count,object.geometry.boundingBox,object.matrixWorld.elements.map(n=>Number(n.toFixed(6))),material.color.toArray()]));});
  return hash.digest('hex');
}
const dishFingerprints=new Map();
const ingredientFingerprints=new Map();
for(const ingredient of INGREDIENTS){
  const food={recipeId:'classic_burger',kind:'ingredient',ingredientId:ingredient.id,stage:`raw_${ingredient.id}`};
  const model=kit.createFoodModel(food),hash=fingerprint(model);
  inspect(model,`ingredient/${ingredient.id}`,{maxY:.7,maxWidth:.75,maxDepth:.75});
  assert.ok(!ingredientFingerprints.has(hash),`${ingredient.id}: visually identical to ${ingredientFingerprints.get(hash)}`);
  ingredientFingerprints.set(hash,ingredient.id);
  assert.equal(fingerprint(kit.createFoodModel({...food,mastery:10})),hash,`${ingredient.id}: mastery decorated a loose supply`);
  assert.ok(!model.getObjectByName('food-plate'),`${ingredient.id}: supply arrived on an unearned plate`);
}
const emptyPlate=kit.createFoodModel({recipeId:'classic_burger',kind:'plate'});
inspect(emptyPlate,'clean supply plate',{maxY:.1,maxWidth:.65,maxDepth:.65});
assert.notEqual(fingerprint(emptyPlate),fingerprint(kit.createPlate(true)),'clean and dirty plates are indistinguishable');
assert.equal(fingerprint(emptyPlate),fingerprint(kit.createFoodModel({recipeId:'classic_burger',kind:'plate',mastery:10})),'mastery alters clean supply plates');
emptyPlate.traverse(object=>{if(object.isMesh){const color=object.material.color;assert.ok(Math.max(color.r,color.g,color.b)-Math.min(color.r,color.g,color.b)<.18,'clean plate has a coloured earned rim');}});
for(const stock of [0,1,2,4,6,12]){
  const rack=kit.createModel('plates',{stock});inspect(rack,`plates/stock${stock}`,{maxWidth:.81,maxDepth:.81});
  assert.equal(rack.userData.stock,stock);assert.equal(rack.children.filter(child=>/^clean-plate-\d+$/.test(child.name)).length,stock,'rack stock does not match visible plate count');
  assert.ok(new THREE.Box3().setFromObject(rack).min.y<.02,'plate rack does not stand on the floor');
}
for(const stock of [0,1,2,3,4]){
  const stand=kit.createModel('cups',{stock});inspect(stand,`cups/stock${stock}`,{maxWidth:.81,maxDepth:.81});
  assert.equal(stand.userData.stock,stock);assert.equal(stand.children.filter(child=>/^clean-cup-\d+$/.test(child.name)).length,stock,'cup stand stock does not match visible vessels');
}
for(const vesselKind of ['cup','fry_box']){
  const clean=kit.createFoodModel({recipeId:vesselKind==='cup'?'coffee':'fries',kind:'plate',vesselKind});
  const dirty=kit.createFoodModel({recipeId:vesselKind==='cup'?'coffee':'fries',kind:'dirty',vesselKind});
  inspect(clean,`clean/${vesselKind}`,{maxY:.7,maxWidth:.75,maxDepth:.75});inspect(dirty,`dirty/${vesselKind}`,{maxY:.7,maxWidth:.75,maxDepth:.75});
  assert.notEqual(fingerprint(clean),fingerprint(dirty),`${vesselKind}: dirty vessel indistinguishable`);
  assert.notEqual(fingerprint(clean),fingerprint(emptyPlate),`${vesselKind}: generic plate substituted`);
  assert(!clean.getObjectByName('food-plate'),'non-plate vessel incorrectly includes a plate');
  for(const mastery of [0,3,10]){const served=kit.createFoodModel({recipeId:vesselKind==='cup'?'coffee':'fries',kind:'dish',vesselKind,mastery});inspect(served,`served/${vesselKind}/mastery${mastery}`,{maxY:.7,maxWidth:.75,maxDepth:.75});assert(!served.getObjectByName('food-plate'),'serving or mastery conjures a plate');}
}
const fryer=kit.createModel('fryer'),basket=fryer.getObjectByName('fryer-basket');
assert(basket,'fryer has no physical movable basket');const restingBasket=new THREE.Box3().setFromObject(basket),warmBasketKit=kit.modelKitStats();
basket.position.y=basket.userData.raisedY;const raisedBasket=new THREE.Box3().setFromObject(basket);
assert(Math.abs(raisedBasket.min.y-restingBasket.min.y-.22)<1e-5&&raisedBasket.min.y>1.1,'raised basket does not clear the oil');
assert.deepEqual(kit.modelKitStats(),warmBasketKit,'raising the real basket allocates replacement geometry');
const fridge=kit.createModel('fridge');fridge.updateMatrixWorld(true);
assert.equal(fridge.userData.coldCompartment,true,'fridge lacks its explicit open-cold-storage model');
// The visible cold compartment contains physical patty surfaces before the back wall.
for(const shelfY of [.315,.820]){const hits=new THREE.Raycaster(new THREE.Vector3(-.15,shelfY,-2),new THREE.Vector3(0,0,1)).intersectObject(fridge,true);assert.ok(hits.length>0,'empty fridge stock ray');assert.equal(hits[0].object.material.color.getHexString(),'b65c53','cold stock is occluded by an opaque cabinet front');}
for(const recipe of RECIPES){
  const dish=kit.createFoodModel({recipeId:recipe.id,kind:'dish'}),dishHash=fingerprint(dish);
  inspect(dish,`${recipe.id}/dish`,{maxY:.7,maxWidth:.75,maxDepth:.75});
  assert.ok(!dishFingerprints.has(dishHash),`${recipe.id}: identical plated presentation to ${dishFingerprints.get(dishHash)}`);dishFingerprints.set(dishHash,recipe.id);
  for(const kind of ['raw','burnt','dirty']){
    const model=kit.createFoodModel({recipeId:recipe.id,kind});inspect(model,`${recipe.id}/${kind}`,{maxY:.7,maxWidth:.75,maxDepth:.75});
    assert.notEqual(fingerprint(model),dishHash,`${recipe.id}/${kind}: indistinguishable geometry from served dish`);
  }
  for(const step of recipe.steps.slice(0,-1)){const model=kit.createFoodModel({recipeId:recipe.id,kind:'processed',stage:step.output});inspect(model,`${recipe.id}/${step.output}`,{maxY:.7,maxWidth:.75,maxDepth:.75});assert.notEqual(fingerprint(model),dishHash,`${recipe.id}/${step.output}: unfinished ingredient renders as completed dish`);}
  const prepared=kit.createFoodModel({recipeId:recipe.id,kind:'processed',stage:`prepared_${recipe.id}`});
  inspect(prepared,`${recipe.id}/needs-plate`,{maxY:.7,maxWidth:.75,maxDepth:.75});
  assert.equal(prepared.userData.unplated,true);assert.ok(!prepared.getObjectByName('food-plate'),`${recipe.id}: a plate appeared before plating`);
  assert.notEqual(fingerprint(prepared),dishHash,`${recipe.id}: unplated food looks served`);
}
const cookedPatty=kit.createFoodModel({recipeId:'classic_burger',kind:'processed',ingredientId:'beef',stage:'cooked_patty'});
assert.notEqual(fingerprint(cookedPatty),fingerprint(kit.createIngredientModel('beef')),'raw and grilled patties are indistinguishable');
for(const item of EQUIPMENT)for(const tier of item.tiers){
  const model=kit.createModel(item.id,{tier:tier.tier});
  // A booth owns two fixed seat cells as well as its 1 x 2 tabletop. Test its
  // actual reserved-cell union; unrelated equipment keeps the original bounds.
  inspect(model,`${item.id}/tier${tier.tier}`,{maxWidth:item.id==='booth_2'?3:item.footprint[0]+.12,maxDepth:item.footprint[1]+.12});
  if(item.id==='booth_2'){
    assert.deepEqual(item.footprint,[1,2]);assert.equal(model.userData.integratedSeats,true,'booth lost its integral benches');
    const occupied=[{x:0,z:-.5},{x:0,z:.5},{x:-1,z:-.5},{x:1,z:-.5}];
    for(const rotation of [0,1,2,3]){
      model.rotation.y=-rotation*Math.PI/2;model.updateMatrixWorld(true);const turn=new THREE.Matrix4().makeRotationY(model.rotation.y),cells=occupied.map(p=>new THREE.Vector3(p.x,0,p.z).applyMatrix4(turn));
      model.traverse(part=>{if(!part.isMesh)return;const vertices=part.geometry.getAttribute('position');for(let i=0;i<vertices.count;i++){const p=new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(part.matrixWorld);assert(cells.some(c=>Math.abs(c.x-p.x)<=.502&&Math.abs(c.z-p.z)<=.502),`booth rotation ${rotation} escapes a reserved table/bench cell`);}});
    }
    model.rotation.y=0;model.updateMatrixWorld(true);
    for(const x of [-1,1]){const hits=new THREE.Raycaster(new THREE.Vector3(x,.6,-.5),new THREE.Vector3(0,-1,0)).intersectObject(model,true);assert(hits[0]&&Math.abs(hits[0].point.y-.5)<.002,'booth cushion misses the simulated seated hip');}
  }
  const before=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());model.rotation.y=Math.PI/2;
  const after=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());assert.ok(Math.abs(before.x-after.z)<1e-5&&Math.abs(before.z-after.x)<1e-5,`${item.id}: rotation changes footprint size`);
}
for(const decor of DECOR)inspect(kit.createModel(decor.id),decor.id,{maxWidth:1.12,maxDepth:1.12,...(decor.id==='chandelier'?{minY:1.93,maxY:2.71}:{})});
const stageDecor=['diner_clock','bear_statue','deer_trophy','pie_display','coffee_sign','jukebox','wine_rack','deco_mirror','brass_planter','chandelier','brass_sconce','velvet_rope','runner_menu'],stageHashes=new Set();
for(const id of stageDecor){
  const definition=DECOR.find(item=>item.id===id);assert(definition,`${id}: art is absent from the shop catalog`);assert.deepEqual(definition.footprint,[1,1]);
  const model=kit.createModel(id),hash=fingerprint(model),bounds=new THREE.Box3().setFromObject(model);assert(!stageHashes.has(hash),`${id}: reused a generic ornament`);stageHashes.add(hash);
  assert(bounds.max.x<=.505&&bounds.min.x>=-.505&&bounds.max.z<=.505&&bounds.min.z>=-.505,`${id}: ornament escapes its own floor or support cell`);
  if(definition.wall){
    assert.equal(model.userData.wallMountPlane,.49,`${id}: missing authored wall support plane`);
    for(let rotation=0;rotation<4;rotation++){
      const mounted=kit.createModel(id);mounted.rotation.y=Math.PI-rotation*Math.PI/2;kit.configureRoomMount(mounted,{kind:id,rotation,mount:{kind:'wall',targetId:'test-wall',surfaceHeight:1.5}});mounted.updateMatrixWorld(true);
      const inverse=new THREE.Matrix4().makeRotationY(-mounted.rotation.y),local=new THREE.Box3();mounted.traverse(part=>{if(!part.isMesh)return;const p=part.geometry.getAttribute('position');for(let i=0;i<p.count;i++)local.expandByPoint(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(part.matrixWorld).applyMatrix4(inverse));});
      assert(local.max.z<=-.049&&local.max.z>=-.060,`${id}/${rotation}: decoration intersects or floats away from its supporting wall`);
    }
  }else if(definition.ceiling){
    assert.equal(id,'chandelier','an unreviewed ceiling model bypassed the floor checks');assert.equal(model.userData.ceilingMountHeight,2.7);assert(model.userData.inputPassthrough,'overhead model blocks pointer targets');
    assert(bounds.min.y>=model.userData.clearanceHeight,'claimed head clearance exceeds the actual suspended geometry');assert(Math.abs(bounds.max.y-model.userData.ceilingMountHeight)<.002,'ceiling cap does not reach its anchor');
    const chef=kit.createModel('chef'),chefTop=new THREE.Box3().setFromObject(chef).max.y;assert(bounds.min.y+2.8-model.userData.ceilingMountHeight>chefTop+.10,'chandelier hangs into the chef hat');
  }else{
    assert(bounds.min.y>=-.001&&bounds.min.y<.025,`${id}: free-standing prop misses its floor or counter support`);
    if(definition.counter){kit.configureRoomMount(model,{kind:id,mount:{kind:'counter',targetId:'test-counter',surfaceHeight:1.11}});const mounted=new THREE.Box3().setFromObject(model);assert(mounted.max.x<=.27&&mounted.min.x>=-.27&&mounted.max.z<=.27&&mounted.min.z>=-.27,`${id}: counter miniature exceeds its clear display spot`);}
  }
}
const extraDecor={coffee_print:250,burger_print:250,leafy_plant:450,herb_planter:300};
const extraPrints=new Set(['coffee_print','burger_print']),extraHashes=new Set();
for(const [id,price]of Object.entries(extraDecor)){
  const definition=DECOR.find(item=>item.id===id);assert(definition);assert.equal(definition.price,price);assert.equal(definition.setId,'extras');assert.deepEqual(definition.footprint,[1,1]);assert.equal(!!definition.wall,extraPrints.has(id));
  const model=kit.createModel(id),hash=fingerprint(model);assert(!extraHashes.has(hash),'new furnishings share a generic model');extraHashes.add(hash);
  if(!extraPrints.has(id)){const bounds=new THREE.Box3().setFromObject(model);assert(bounds.min.y>=-.001&&bounds.min.y<.02,`${id}: plant does not meet the floor`);assert(bounds.max.x<=.5&&bounds.min.x>=-.5&&bounds.max.z<=.5&&bounds.min.z>=-.5,`${id}: plant escapes one tile`);assert(id==='leafy_plant'?bounds.max.y>1.5:bounds.max.y<.8,`${id}: distinct plant silhouette lost`);}
}
const legacyDecor=DECOR.filter(item=>['fifties','garden'].includes(item.setId)).map(item=>({equipmentId:item.id}));assert.equal(legacyDecor.length,6,'new decor silently changed legacy collection requirements');
assert.deepEqual(charmOf({home:{layout:legacyDecor}}),{score:32,sets:['fifties','garden']});
assert.deepEqual(charmOf({home:{layout:[...legacyDecor,...Object.keys(extraDecor).map(equipmentId=>({equipmentId}))]}}),{score:40,sets:['fifties','garden']},'extras altered set bonuses instead of just unique-item charm');
for(const id of ['chair','plant','parcel','delivery','book','till','trophy','spill','jam'])inspect(kit.createModel(id),id);
for(const role of ['chef','waiter','customer'])for(let look=0;look<8;look++){
  const actor=kit.createModel(role,{look}),rig=actor.userData.rig;
  const anchor=inspect(actor,`${role}/${look}`);assert.ok(Math.abs(anchor.min.y)<.025,`${role}: feet do not meet floor anchor`);assert.equal(rig.arms.length,2);assert.equal(rig.legs.length,2);assert.equal(rig.knees.length,2);
  assert.ok(rig.held.position.z<0,`${role}: carried item is behind character`);
  for(const pose of ['walk','carry','cook','wash','sit','eat']){kit.animateCharacter(actor,.2,pose,pose==='carry',pose==='walk');inspect(actor,`${role}/${look}/${pose}`,{minY:-.09});}
  kit.animateCharacter(actor,0,'sit',false,false);const hip=new THREE.Vector3();rig.legs[0].getWorldPosition(hip);assert.ok(hip.y>.43&&hip.y<.56,`${role}: seated hip misses chair cushion`);
}
// Removing temporary previews must preserve shared world resources, while
// unique canvas/card materials and selection geometry are actually disposed.
const shared=kit.createModel('prep');let sharedDisposed=false;shared.children[0].geometry.addEventListener('dispose',()=>{sharedDisposed=true;});kit.disposeObject(shared);assert.equal(sharedDisposed,false,'catalogue disposal invalidates live shared geometry');
const unique=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshToonMaterial();let geometryDisposed=false,materialDisposed=false;
geometry.addEventListener('dispose',()=>{geometryDisposed=true;});material.addEventListener('dispose',()=>{materialDisposed=true;});unique.add(new THREE.Mesh(geometry,material));kit.disposeObject(unique);assert.ok(geometryDisposed&&materialDisposed,'unique resources leak on disposal');
const warmStats=kit.modelKitStats();
for(let cycle=0;cycle<10;cycle++){
  for(const recipe of RECIPES)kit.disposeObject(kit.createFoodModel({recipeId:recipe.id,kind:'dish'}));
  for(const item of EQUIPMENT)kit.disposeObject(kit.createModel(item.id));
  for(const decor of DECOR)kit.disposeObject(kit.createModel(decor.id));
}
assert.deepEqual(kit.modelKitStats(),warmStats,'rebuilding the same catalog grows the retained geometry/material cache');
console.log(`Diner art integrity PASS: ${RECIPES.length} distinct plated recipes; ${EQUIPMENT.length} equipment types; ${DECOR.length} decor types; ${models} geometry/pose cases; ${triangles.toLocaleString()} checked triangles. No WebGL or visual approval claimed.`);
