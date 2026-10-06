import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {THREE,sourceModule} from './dk-diner-source-loader.mjs';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const {COLLECTIBLES,ALL_COLLECTIBLES,LEGACY_COLLECTIBLES,packLeaderboard,packItems}=await sourceModule('src/lib/chef/diner/collectible-packs.ts');
const {createDiner,dispatchDiner,sanitizeDinerSave,validateDinerHomePlacement}=await sourceModule('src/lib/chef/diner/progression.ts');
const {assignedCopies,releaseMissingAppearances}=await sourceModule('src/lib/chef/diner/collectible-appearances.ts');
const {createPlacementDraft,previewPlacement}=await sourceModule('src/app/chef/diner-preview/placement-preview.ts');
const {createRestaurantBlueprint,alignRoomMounts,validateRoomMount,roomMountSlots,resolveDecorationMount}=await sourceModule('src/lib/chef/diner/room-plan.ts');
const {animateCollection,collectionAssetFolder}=await sourceModule('src/app/chef/diner-preview/collection-assets.ts');
const now=Date.UTC(2026,8,23,12),loader=new GLTFLoader();
assert.equal(ALL_COLLECTIBLES.length,48);assert.equal(COLLECTIBLES.filter(c=>c.equipmentKind).length,7);
for(const pack of ['regular','super'])assert.equal(packItems(pack).reduce((s,i)=>s+i.weight,0),10000);
for(const item of LEGACY_COLLECTIBLES){
 const receipt={openingId:item.id,wallet:'0x'+'a'.repeat(40),pack:item.pack,version:1,itemId:item.id,openedAt:now,chainId:1,contractAddress:'0x'+'b'.repeat(40),transactionHash:'0x'+'c'.repeat(64),logIndex:0,tokenId:'1',mode:'live'};
 assert.equal(packLeaderboard([receipt],item.pack).length,1);assert.equal(packLeaderboard([{...receipt,version:2}],item.pack).length,0);
}
assert.deepEqual(packLeaderboard([{itemId:'nonexistent'}],'regular'),[]);
for(const item of COLLECTIBLES.filter(c=>c.equipmentKind)){
 let state=createDiner(now,'appearance-check');state.decorOwned[item.id]=1;state.equipment[item.equipmentKind]={tier:3,homeCopies:1,truckOwned:true};
 let target=state.home.layout.find(p=>p.equipmentId===item.equipmentKind);
 if(!target){const p=previewPlacement(state,createPlacementDraft(state,'home',item.equipmentKind,'appearance-machine'));assert.equal(p.error,null,p.error);const r=dispatchDiner(state,p.command,{now});assert.equal(r.error,undefined);state=r.state;target=state.home.layout.find(p=>p.equipmentId===item.equipmentKind);}
 const command={type:'setCollectibleAppearance',location:'home',targetId:target.id,skinId:item.id};
 const before=JSON.stringify([state.equipment,state.coins,state.home.layout]);const r=dispatchDiner(state,command,{now});assert.equal(r.error,undefined,r.error);state=r.state;
 assert.equal(JSON.stringify([state.equipment,state.coins,state.home.layout]),before);assert.equal(assignedCopies(state,item.id),1);assert(sanitizeDinerSave(JSON.stringify(state)));
 assert.equal(dispatchDiner(state,command,{now}).error,undefined,'retry same assignment is harmless');
 const wrong=dispatchDiner(state,{...command,targetId:state.home.layout.find(p=>p.equipmentId==='sink').id},{now});assert(wrong.error);
 const forged=structuredClone(state);forged.decorOwned[item.id]=0;assert.equal(sanitizeDinerSave(JSON.stringify(forged)),null);
 assert(validateDinerHomePlacement(state,[...state.home.layout,{id:'not-floor-decor',equipmentId:item.id,x:8,y:6,rotation:0}]));
 const truckTarget=state.truckConfig.stations.find(p=>p.kind===item.equipmentKind);
 if(truckTarget)assert(dispatchDiner(state,{...command,location:'truck',targetId:truckTarget.id},{now}).error,'one copy cannot dress home and truck together');
 state.home.layout=state.home.layout.filter(p=>p.id!==target.id);releaseMissingAppearances(state);assert.equal(assignedCopies(state,item.id),0);assert.equal(state.decorOwned[item.id],1);
}
console.log('PASS both catalogues, legacy receipts, seven compatible skins, ownership, retries, loading saves and released copies');
for(const item of COLLECTIBLES.filter(c=>c.equipmentKind)){
 let state=createDiner(now,'truck-appearance-check');state.coins=100000;state.restaurantLevel=5;state.decorOwned[item.id]=1;state.equipment[item.equipmentKind]={tier:1,homeCopies:1,truckOwned:true};
 let r=dispatchDiner(state,{type:'startPractice',recipeIds:['classic_burger']},{now});assert.equal(r.error,undefined,r.error);state=r.state;
 let target=state.truckConfig.stations.find(p=>p.kind===item.equipmentKind);
 if(!target){const p=previewPlacement(state,createPlacementDraft(state,'truck',item.equipmentKind,'truck-machine'));assert.equal(p.error,null,p.error);r=dispatchDiner(state,p.command,{now});assert.equal(r.error,undefined,r.error);state=r.state;target=state.truckConfig.stations.find(p=>p.kind===item.equipmentKind);}
 const command={type:'setCollectibleAppearance',location:'truck',targetId:target.id,skinId:item.id};
 const service=JSON.stringify(state.run.service);r=dispatchDiner(state,command,{now});assert.equal(r.error,undefined,r.error);state=r.state;assert.equal(JSON.stringify(state.run.service),service,'appearance cannot change cooking');
 const saved=sanitizeDinerSave(JSON.stringify(state));assert(saved);assert.equal(saved.collectibleAppearances.truck[target.id],item.id);
 r=dispatchDiner(state,{type:'upgradeTruckEquipment',equipmentId:item.equipmentKind},{now});assert.equal(r.error,undefined,r.error);state=r.state;assert.equal(state.equipment[item.equipmentKind].tier,2);assert.equal(state.collectibleAppearances.truck[target.id],item.id,'upgrading keeps appearance');
 r=dispatchDiner(state,{...command,skinId:null},{now});assert.equal(r.error,undefined);assert.equal(assignedCopies(r.state,item.id),0);
 const stations=state.truckConfig.stations.filter(p=>p.id!==target.id);r=dispatchDiner(state,{type:'setupLayout',stations,tables:state.truckConfig.tables},{now});assert.equal(r.error,undefined,r.error);assert.equal(assignedCopies(r.state,item.id),0,'storing releases copy');assert.equal(r.state.decorOwned[item.id],1);
}
console.log('PASS seven truck skins: real setup, unchanged cooking, save reload, tier upgrades, removal and storage');
for(const item of COLLECTIBLES.filter(c=>!c.equipmentKind)){
 let state=createDiner(now,'decoration-lifecycle');state.decorOwned[item.id]=1;
 const draft=createPlacementDraft(state,'home',item.id,'collectible');const preview=previewPlacement(state,draft);assert.equal(preview.error,null,`${item.name}: ${preview.error}`);
 let r=dispatchDiner(state,preview.command,{now});assert.equal(r.error,undefined,r.error);state=r.state;assert(sanitizeDinerSave(JSON.stringify(state)),`${item.name}: reload`);
 r=dispatchDiner(state,{type:'homeLayout',layout:state.home.layout.filter(p=>p.id!=='collectible')},{now});assert.equal(r.error,undefined,r.error);assert.equal(r.state.decorOwned[item.id],1);
}
console.log('PASS all seventeen decorations: physical attachments, validated placement, reload and storage');
for(const rotation of [0,1,2,3]){
 const plan=createRestaurantBlueprint('restaurant').roomPlan;
 const support={id:'display',equipmentId:'display_counter_oak',x:7,y:7,rotation};
 let layout=alignRoomMounts([support,{id:'wide',equipmentId:'collect_sushi_parade',x:0,y:0,rotation,mount:{kind:'counter',targetId:'display',slot:0}}],plan);
 const wide=layout[1];assert.equal(validateRoomMount(plan,wide,layout),null);assert.equal(roomMountSlots(wide).length,2);
 assert(validateRoomMount(plan,{...wide,mount:{...wide.mount,slot:1}},layout));
 const small={...wide,id:'small',equipmentId:'collect_last_fry',mount:{...wide.mount,slot:1}};
 assert(validateRoomMount(plan,small,[...layout,small]),'second reserved spot cannot overlap');
 const center=resolveDecorationMount(plan,wide,layout);assert(center);assert.equal(center.x,7+(rotation%2?0:.5));assert.equal(center.y,7+(rotation%2?.5:0));
 const wall={...wide,mount:{kind:'wall',targetId:'outer-back',slot:plan.w-1},equipmentId:'collect_burger_belt'};assert(validateRoomMount(plan,wall,layout),'wide wall art cannot hang beyond the corner');
}
console.log('PASS two-slot attachments, all counter rotations, overlap rejection and wall boundaries');
let total=0;const results=[];
for(const item of COLLECTIBLES){
 const bytes=readFileSync(`public/chef/collectibles-v2/${collectionAssetFolder(item.shape)}/model.glb`),gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const bounds=new THREE.Box3().setFromObject(gltf.scene),size=bounds.getSize(new THREE.Vector3());let triangles=0,meshes=0,animated=0;
 gltf.scene.traverse(o=>{if(o.userData.dkMotion)animated++;if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 assert(size.x<=item.footprint[0]+.1,`${item.name} width ${size.x}`);assert(size.z<=item.footprint[1]+.1,`${item.name} depth ${size.z}`);assert(triangles<40000,`${item.name} triangles ${triangles}`);
 assert(animated||item.equipmentKind,`${item.name} missing signature animation`);total+=triangles;results.push({id:item.id,triangles,meshes,animated,width:size.x,depth:size.z});
 for(let t=0;t<120;t+=2){animateCollection(gltf.scene,t,true,false);const moving=new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());assert(moving.x<=item.footprint[0]+.1,`${item.name} animated width ${moving.x}`);assert(moving.z<=item.footprint[1]+.1,`${item.name} animated depth ${moving.z}`);}
 const lowBytes=readFileSync(`public/chef/collectibles-v2/${collectionAssetFolder(item.shape+'_low')}/model.glb`),low=await loader.parseAsync(lowBytes.buffer.slice(lowBytes.byteOffset,lowBytes.byteOffset+lowBytes.byteLength),'');let lowTriangles=0;
 low.scene.traverse(o=>{if(o.isMesh){lowTriangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert(o.geometry.attributes.color,`${item.name} mobile baked AO stream`);}});
 assert(lowTriangles<triangles*.45,`${item.name} mobile geometry reduction`);
 gltf.scene.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
}
console.log(`PASS ${results.length} loadable original GLBs; ${Math.round(total)} triangles across the complete collection`);console.table(results);
if(process.argv.includes('--migration')){
 const sql=`-- Collection v2. Preserves v1 receipt validation; does not enable paid sales.\nbegin;\ncreate table if not exists public.domain_kitchen_collection_items (\n collection_version integer not null, item_id text not null, pack text not null check(pack in ('regular','super')),\n primary key(collection_version,item_id,pack)\n);\nalter table public.domain_kitchen_collection_items enable row level security;\nrevoke all on public.domain_kitchen_collection_items from anon,authenticated;\ngrant select on public.domain_kitchen_collection_items to service_role;\ninsert into public.domain_kitchen_collection_items(collection_version,item_id,pack) values\n${ALL_COLLECTIBLES.map(i=>`(${i.version},'${i.id}','${i.pack}')`).join(',\n')}\non conflict do nothing;\nalter table public.domain_kitchen_pack_openings drop constraint if exists domain_kitchen_pack_openings_collection_version_check;\nalter table public.domain_kitchen_pack_openings drop constraint if exists domain_kitchen_pack_openings_check;\nalter table public.domain_kitchen_pack_openings add constraint domain_kitchen_pack_catalogue_fk foreign key(collection_version,item_id,pack) references public.domain_kitchen_collection_items(collection_version,item_id,pack);\ncommit;\n`;
 writeFileSync('supabase/migrations/20260924_domain_kitchen_collection_v2.sql',sql);
}
