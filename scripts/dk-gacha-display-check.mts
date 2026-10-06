import assert from 'node:assert/strict';
import { DOMAIN_COLLECTIBLES } from '../src/lib/chef/diner/domain-worlds';
import { COLLECTION_DISPLAY_SPOTS, displaySpotKind } from '../src/lib/chef/diner/collection-display-spots';
import { createDiner, dispatchDiner, parseDinerSave, homeSimulationConfig } from '../src/lib/chef/diner/progression';
import { charmOf, decorResaleValue } from '../src/lib/chef/diner/collections';
import { createPlacementDraft, previewPlacement, homeMountCandidates } from '../src/app/chef/diner-preview/placement-preview';
import { equipmentDestinationError, equipmentRoomKey, equipmentSkinOverlays, parseEquipmentAssignment, parseEquipmentInventory, type EquipmentDestination, type EquipmentInventory } from '../src/lib/chef/gacha/equipment-ownership';
import { compileRestaurantPlan } from '../src/lib/chef/diner/room-plan-v2';
import { roomMountAnchors } from '../src/lib/chef/diner/room-plan';
const now=1800000000000, initial=createDiner(now,'collectible-display-test');
const done=new Set<string>();
for(const item of DOMAIN_COLLECTIBLES){
  const kind=displaySpotKind(item);assert(kind,`An envelope for ${item.id}`);
  const previewState={...initial,decorOwned:{...initial.decorOwned,[kind]:1}};
  const draft=createPlacementDraft(previewState,'home',kind,'display-proof');
  const preview=previewPlacement(previewState,draft);
  if(preview.error){
    // Wide counter art needs two adjacent free counter spots. A small starter is
    // allowed to have none; it must explain the problem rather than overlap.
    assert(draft.mount,preview.error);continue;
  }
  assert.equal(preview.command.type,'homeLayout');if(preview.command.type!=='homeLayout')throw Error();
  const placement=preview.command.layout.find(p=>p.id===draft.id)!;
  const result=dispatchDiner(initial,{type:'placeCollectionDisplay',placement},{now});assert.equal(result.error,undefined,item.id);
  const state=result.state;assert.equal(state.coins,initial.coins);assert.deepEqual(state.equipment,initial.equipment);assert.deepEqual(state.home.menu,initial.home.menu);assert.equal(charmOf(state).score,charmOf(initial).score);
  assert.equal(state.decorOwned[item.id],undefined,'NFT ownership never becomes a beta entitlement');
  assert.equal(decorResaleValue(kind),null);assert(parseDinerSave(JSON.stringify(state),now));
  assert.equal(dispatchDiner(state,{type:'placeCollectionDisplay',placement},{now}).state.decorOwned[kind],1,'Repeated placement cannot mint support copies');
  const target:EquipmentDestination={room:equipmentRoomKey(state),location:'home',id:placement.id,kind,display:true};
  const inventory:EquipmentInventory={domain:item.domain,revision:'0',ready:true,checkpoint:{block:'1',hash:`0x${'1'.repeat(64)}`,timestamp:now},items:[{tokenId:'1',itemId:item.id,catalogueVersion:3,destination:target}]};
  assert.equal(equipmentDestinationError(state,item.id,target),null);
  assert.equal(parseEquipmentInventory(inventory,item.domain).items[0].destination?.display,true);
  const snapshot=JSON.stringify(state), config=homeSimulationConfig(state);
  assert.equal(equipmentSkinOverlays(state,inventory,'home')[target.id],item.id);
  assert.deepEqual(equipmentSkinOverlays(state,{...inventory,items:[]},'home'),{});
  assert.equal(JSON.stringify(state),snapshot);assert.deepEqual(homeSimulationConfig(state),config,'Disconnect/transfer never changes routes or cooking inputs');
  const stored=dispatchDiner(state,{type:'homeLayout',layout:state.home.layout.filter(p=>p.id!==target.id)},{now});assert.equal(stored.error,undefined);
  assert(equipmentDestinationError(stored.state,item.id,target));assert.deepEqual(equipmentSkinOverlays(stored.state,inventory,'home'),{});
  assert.equal(stored.state.decorOwned[kind],1,'Storing a support conserves it');
  done.add(item.mount);
}
assert.deepEqual([...done].sort(),['ceiling','counter','floor','wall']);
console.log('PASS all 72 collectible envelopes; real floor/wall/counter/ceiling placement, no NFT grants or charm, reload/storage/transfer');
for(const spot of COLLECTION_DISPLAY_SPOTS){
  const candidate={...initial,decorOwned:{...initial.decorOwned,[spot.id]:1}};
  const draft=createPlacementDraft(candidate,'home',spot.id,'support');
  if(draft.mount){assert.equal(roomMountAnchors({...draft},initial.home.roomPlan).length,spot.footprint[0]);}
  const invalid=dispatchDiner(initial,{type:'placeCollectionDisplay',placement:{id:'bad',equipmentId:spot.id,x:-20,y:0,rotation:0}},{now});assert(invalid.error);assert.deepEqual(invalid.state,initial);
}
const fake=dispatchDiner(initial,{type:'placeCollectionDisplay',placement:{id:'fake-machine',equipmentId:'grill',x:4,y:4,rotation:0}},{now});assert(fake.error);assert.deepEqual(fake.state,initial);
const floor=COLLECTION_DISPLAY_SPOTS.find(s=>s.displaySlot==='floor'&&s.footprint[0]===1)!;
const floorState={...initial,decorOwned:{...initial.decorOwned,[floor.id]:1}};
const d=createPlacementDraft(floorState,'home',floor.id,'collision'), p=previewPlacement(floorState,d);assert.equal(p.error,null);
const committed=dispatchDiner(initial,{type:'placeCollectionDisplay',placement:{id:d.id,equipmentId:d.equipmentId,x:d.x,y:d.y,rotation:d.rotation}},{now}).state;
const compiled=compileRestaurantPlan(committed.home.roomPlan!,committed.home.layout);
assert(compiled.solid.has(`${d.x},${d.y}`));assert.equal(compiled.walkable({x:d.x,y:d.y}),false,'The support blocks actual restaurant navigation');
const collision=dispatchDiner(committed,{type:'placeCollectionDisplay',placement:{id:'overlap',equipmentId:floor.id,x:d.x,y:d.y,rotation:d.rotation}},{now});assert(collision.error);
const request={requestId:'00000000-0000-4000-8000-000000000001',revision:'0',tokenId:'1',destination:{room:equipmentRoomKey(initial),location:'truck',id:'test',kind:floor.id,display:true}};
assert.throws(()=>parseEquipmentAssignment(request),'Displays cannot become truck production stations');
assert.throws(()=>parseEquipmentAssignment({...request,destination:{...request.destination,location:'home',display:false}}));
console.log('PASS forged machine grants, overlapping supports, wrong surface/truck destinations and extra request fields rejected');
