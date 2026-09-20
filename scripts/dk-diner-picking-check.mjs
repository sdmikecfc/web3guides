/** Real Three.js raycasts through the shipped model kit; no mocked hit list or WebGL. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
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
const {createModel,createFoodModel,animateCharacter}=await sourceModule('src/app/chef/diner-preview/models.ts');
const {firstVisibleSceneSurface,setActorPicking}=await sourceModule('src/app/chef/diner-preview/scene-picking.ts');
const raycaster=new THREE.Raycaster();let groups=0;
function test(name,run){run();groups++;console.log(`PASS ${name}`);}
function cast(root,origin=[0,5,0],direction=[0,-1,0]){root.updateMatrixWorld(true);raycaster.set(new THREE.Vector3(...origin),new THREE.Vector3(...direction).normalize());return raycaster.intersectObject(root,true);}
function rootOf(...objects){const root=new THREE.Group();root.add(...objects);return root;}
function target(kind,id,seatId){const model=createModel(kind);model.userData.pick={id,...(seatId?{seatId}:{})};return model;}
function closest(root,origin,direction){return firstVisibleSceneSurface(cast(root,origin,direction));}
function plane(material,y=1){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);mesh.rotation.x=-Math.PI/2;mesh.position.y=y;return mesh;}
const opaque=()=>new THREE.MeshBasicMaterial({color:'#69422f',side:THREE.DoubleSide});
function ancestry(object,name){while(object){if(object.name===name)return true;object=object.parent;}return false;}
function targetAt(hit){let object=hit.object;while(object){if(object.userData.pick)return object.userData.pick;object=object.parent;}return null;}

test('a foreground chair owns its seat instead of selecting the table or floor spill behind it',()=>{
  const spill=target('spill','incident:spill'),table=target('table_2','table-1'),chair=target('chair','table-1','seat-near');
  // Real seats sit beside the table. The oblique ray intersects the nearer seat
  // before continuing through the dining area and spilled drink behind it.
  chair.position.z=1;table.position.z=-.05;spill.position.z=-.6;
  const root=rootOf(table,spill,chair),origin=[0,1.10,3],direction=[0,-.32,-1];
  const hits=cast(root,origin,direction);assert(hits.some(hit=>{let o=hit.object;while(o){if(o===chair)return true;o=o.parent;}return false;}),'ray misses actual chair');
  const picked=firstVisibleSceneSurface(hits);assert.deepEqual(picked.target,{id:'table-1',seatId:'seat-near'});
  // Also prove that both surfaces occur in the same ray, rather than merely
  // testing furniture with no intersected spill behind it.
  spill.position.z=0;table.position.z=0;const tableHits=cast(rootOf(table,spill));
  assert(tableHits.some(hit=>targetAt(hit)?.id==='incident:spill'));assert.equal(firstVisibleSceneSurface(tableHits).target.id,'table-1');
  spill.position.z=1;const chairHits=cast(rootOf(chair,spill),[0,4,1]);
  assert(chairHits.some(hit=>targetAt(hit)?.id==='incident:spill'));assert.deepEqual(firstVisibleSceneSurface(chairHits).target,{id:'table-1',seatId:'seat-near'});
  assert.equal(closest(rootOf(spill),[0,4,1],[0,-1,0]).target.id,'incident:spill');
});
test('a foreground chef physically blocks a spill and hidden actor parents do not',()=>{
  const spill=target('spill','incident:spill'),chef=target('chef','chef_1'),actors=rootOf(chef),root=rootOf(spill,actors);
  assert.equal(closest(root).target.id,'chef_1');actors.visible=false;
  assert(cast(root).some(hit=>hit.object.parent),'real ray list exists');assert.equal(closest(root).target.id,'incident:spill');
});

test('truck chef and helpers pass actual head, tool and carried-food hits to the station behind them',()=>{
  let blockedRays=0,carriedRays=0;
  for(const kind of ['grill','prep'])for(const role of ['chef','waiter'])for(const pose of ['idle','cook','carry']){
    const station=target(kind,kind),actor=createModel(role);actor.position.z=1;actor.name='truck-crew';
    animateCharacter(actor,.24,pose,pose==='carry',false,{stationKind:kind,recipeId:'classic_burger'});
    if(pose==='carry'){const held=createFoodModel({recipeId:'classic_burger',kind:'dish'});held.name='crew-carried-food';held.userData.pick={id:'not-an-independent-station'};actor.userData.rig.held.add(held);}
    const root=rootOf(station,actor),camera=new THREE.OrthographicCamera(-1.3,1.3,1.3,-1.3,.01,100);
    for(const angle of [-Math.PI/4,0,Math.PI/4]){
      camera.position.set(Math.sin(angle)*6,4.3,Math.cos(angle)*6);camera.lookAt(0,.7,.4);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();root.updateMatrixWorld(true);
      setActorPicking(actor,'truck',{id:role==='chef'?'player':'helper:washer',role});
      for(let x=0;x<29;x++)for(let y=0;y<29;y++){
        raycaster.setFromCamera(new THREE.Vector2((x/28-.5)*2,(y/28-.5)*2),camera);const hits=raycaster.intersectObject(root,true);
        if(!hits.length||!ancestry(hits[0].object,'truck-crew')||!hits.some(hit=>targetAt(hit)?.id===kind))continue;
        const picked=firstVisibleSceneSurface(hits);assert.equal(picked.target?.id,kind,`${role}/${pose} blocked ${kind}`);blockedRays++;
        if(hits.some(hit=>ancestry(hit.object,'crew-carried-food')))carriedRays++;
      }
    }
  }
  assert(blockedRays>100,'fixture did not exercise genuinely occluded stations');assert(carriedRays>0,'carried dishes were never hit');
  console.log(`  ${blockedRays} previously crew-blocked station rays; ${carriedRays} include actual carried dishes`);
});

test('truck crew passthrough preserves foreground chair occlusion and customer seat selection',()=>{
  const station=target('grill','grill'),chair=target('chair','table-1','seat-1'),chef=createModel('chef');chair.position.z=1;chef.position.z=2;chef.name='truck-crew';
  setActorPicking(chef,'truck',{id:'player',role:'chef'});
  const root=rootOf(station,chair,chef),origin=[0,2.5,4],direction=[0,-.55,-1],hits=cast(root,origin,direction);
  assert(hits.some(hit=>ancestry(hit.object,'truck-crew'))&&hits.some(hit=>targetAt(hit)?.id==='grill'),'ray must cross crew and station');
  assert.deepEqual(firstVisibleSceneSurface(hits).target,{id:'table-1',seatId:'seat-1'},'crew policy allowed picking through real furniture');
  const customer=createModel('customer');customer.position.z=1;setActorPicking(customer,'truck',{id:'guest',role:'customer',tableId:'table-1',seatId:'seat-1'});
  const guestHits=cast(rootOf(station,customer),[0,2.3,3],[0,-.48,-1]);
  assert.deepEqual(firstVisibleSceneSurface(guestHits).target,{id:'table-1',seatId:'seat-1'},'guest no longer selects their own seat');
});

test('home staff remain selectable and changing actor mode clears a previous passthrough flag',()=>{
  const station=target('prep','prep'),chef=createModel('chef');chef.position.z=1;
  const root=rootOf(station,chef),origin=[0,2.3,3],direction=[0,-.48,-1];
  setActorPicking(chef,'truck',{id:'chef_1',role:'chef'});assert.equal(closest(root,origin,direction).target.id,'prep');
  setActorPicking(chef,'home',{id:'chef_1',role:'chef'});assert.equal(closest(root,origin,direction).target.id,'chef_1');
  setActorPicking(chef,'truck',{id:'guest',role:'customer',tableId:'table-2',seatId:'seat-2'});assert.deepEqual(closest(root,origin,direction).target,{id:'table-2',seatId:'seat-2'});
});
test('removed parcel tape is ignored even when Three still reports intersections with it',()=>{
  const parcel=target('parcel','home-parcel'),root=rootOf(parcel),tape=parcel.getObjectByName('parcel-tape');assert(tape,'real parcel has removable tape');
  const hits=cast(root);assert(hits.some(hit=>ancestry(hit.object,'parcel-tape')),'ray must cross actual tape');
  const before=firstVisibleSceneSurface(hits);assert.equal(before.target.id,'home-parcel');
  tape.visible=false;const afterHits=cast(root);assert(afterHits.some(hit=>ancestry(hit.object,'parcel-tape')),'Three raycasting ignores ancestor visibility');
  const visibleHit=afterHits.find(hit=>!ancestry(hit.object,'parcel-tape'));
  const after=firstVisibleSceneSurface(afterHits);assert.equal(after.target.id,'home-parcel');assert(after.point.distanceTo(visibleHit.point)<1e-8);assert(after.point.y<before.point.y,'hidden bow/tape cannot retain its old top hit');
});
test('faded cutaway walls pass input while opaque scenery blocks without falling through to a target',()=>{
  const spill=target('spill','incident:spill'),wall=plane(new THREE.MeshBasicMaterial({transparent:true,opacity:.16,side:THREE.DoubleSide})),root=rootOf(spill,wall);
  assert.equal(closest(root).target.id,'incident:spill');wall.material.opacity=.25;assert.equal(closest(root).target,undefined);assert(Math.abs(closest(root).point.y-1)<1e-8);
  wall.material.opacity=1;wall.material.transparent=false;assert.equal(closest(root).target,undefined);wall.material.visible=false;assert.equal(closest(root).target.id,'incident:spill');
});
test('multi-material visibility uses the intersected face rather than unrelated opaque faces',()=>{
  const spill=target('spill','incident:spill'),materials=Array.from({length:6},opaque),wall=new THREE.Mesh(new THREE.BoxGeometry(2,.1,2),materials);wall.position.y=1;
  // +Y is material group2; -Y is3. Top and bottom are both faded so the ray
  // passes through the box, while four unrelated sides remain fully opaque.
  for(const index of [2,3]){materials[index].transparent=true;materials[index].opacity=.16;}
  const root=rootOf(spill,wall),hits=cast(root);assert(hits.some(hit=>hit.object===wall&&hit.face.materialIndex===2));
  assert.equal(closest(root).target.id,'incident:spill');materials[2].opacity=1;assert.equal(closest(root).target,undefined);
});
test('progress bars and halo descendants never steal input from a real physical target',()=>{
  const spill=target('spill','incident:spill'),feedback=rootOf(plane(opaque(),2),plane(opaque(),1));feedback.userData.inputPassthrough=true;feedback.userData.pick={id:'fake-feedback'};
  const root=rootOf(spill,feedback);assert(cast(root).length>cast(spill).length);assert.equal(closest(root).target.id,'incident:spill');
  spill.visible=false;assert.equal(closest(root),null);
});
test('supported floor instances map exact instance IDs to tiles without changing input data',()=>{
  const floor=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.1,1),opaque(),2);floor.userData.tiles=[{x:2,y:3},{x:4,y:5}];
  floor.setMatrixAt(0,new THREE.Matrix4().makeTranslation(2,0,3));floor.setMatrixAt(1,new THREE.Matrix4().makeTranslation(4,0,5));floor.instanceMatrix.needsUpdate=true;
  const root=rootOf(floor),hits=cast(root,[4,4,5]),before=hits.map(hit=>({distance:hit.distance,point:hit.point.clone()}));
  const picked=firstVisibleSceneSurface(hits);assert.deepEqual(picked.tile,{x:4,y:5});assert.equal(picked.target,undefined);assert.equal(hits[0].instanceId,1);
  hits.forEach((hit,index)=>{assert.equal(hit.distance,before[index].distance);assert(hit.point.equals(before[index].point));});
  const single=plane(opaque(),0);single.userData.tile={x:0,y:0};assert.deepEqual(closest(rootOf(single)).tile,{x:0,y:0});
});
test('nearest nested target keeps seat specificity while invisible and passthrough ancestors dominate',()=>{
  const chair=target('chair','table-id','seat-id'),parent=rootOf(chair);parent.userData.pick={id:'parent-table'};
  assert.deepEqual(closest(parent).target,{id:'table-id',seatId:'seat-id'});
  parent.visible=false;assert.equal(closest(parent),null);parent.visible=true;parent.userData.inputPassthrough=true;assert.equal(closest(parent),null);
});
console.log(`PASS ${groups} diner scene-picking groups (actual Three raycasts)`);
