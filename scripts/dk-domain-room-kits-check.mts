import assert from 'node:assert/strict';
import {DOMAIN_IDS} from '../src/lib/chef/diner/domain-worlds';
import {domainRoomBlueprint,grantDomainRoomKit,earnedDomainRoomDraft,validDomainRoomEntitlements} from '../src/lib/chef/diner/domain-room-kits';
import {createDiner,dispatchDiner,sanitizeDinerSave} from '../src/lib/chef/diner/progression';
import {validateRoomPlan,RESTAURANT_STAGES,validateRoomMount,resolveDecorationMount} from '../src/lib/chef/diner/room-plan';
import {drawRoomEdges,storeRoomPiece} from '../src/lib/chef/diner/room-construction';
import {freeRoomProblem} from '../src/lib/chef/diner/room-plan-v2';
import {roomDesignAssetError} from '../src/lib/chef/diner/room-building-draft';
import {createHomeWorld,stepHomeWorld} from '../src/lib/chef/diner/home-simulation';
import {collectionEvidence} from './dk-domain-collection-fixture';
const now=1800000000000;
for(const domain of DOMAIN_IDS)for(const stage of ['burger_shop','diner','restaurant'] as const){
 let s=createDiner(now,`kit-${domain}-${stage}`);const blueprint=domainRoomBlueprint(domain,stage);
 assert.equal(validateRoomPlan(blueprint.roomPlan,blueprint.layout),null,`${domain} ${stage}: ${JSON.stringify(freeRoomProblem(blueprint.roomPlan,blueprint.layout))}`);
 s.home.roomPlan!.stage=stage;s.home.w=s.home.roomPlan!.w=RESTAURANT_STAGES[stage].w;s.home.h=s.home.roomPlan!.h=RESTAURANT_STAGES[stage].h;
 s.equipment.grill.tier=3;const original=structuredClone(s),receipt=collectionEvidence(domain);
 s=grantDomainRoomKit(s,receipt);assert.deepEqual(original.home.menu,s.home.menu);assert.equal(s.equipment.grill.tier,3);assert.equal(s.coins,original.coins);
 assert.deepEqual(grantDomainRoomKit(s,receipt),s,'Repeated claim cannot top up sold or consumed pieces');
 const sold=structuredClone(s);sold.decorOwned[`domain_kit_${domain}_plant`]=0;assert.equal(grantDomainRoomKit(sold,receipt).decorOwned[`domain_kit_${domain}_plant`],0,'Selling a kit piece cannot be followed by a free duplicate claim');
 const draft=earnedDomainRoomDraft(s,domain);assert.equal(roomDesignAssetError(s,draft),null);assert.equal(validateRoomPlan(draft.roomPlan,draft.layout),null);
 const sign=draft.layout.find(p=>p.equipmentId===`domain_kit_${domain}_sign`)!;
 assert.equal(resolveDecorationMount(draft.roomPlan,sign,draft.layout)?.x,2.5,'Four-wall sign is centred on its real supports');
 const duplicate={...sign,id:'duplicate-sign'};assert.match(validateRoomMount(draft.roomPlan,duplicate,[...draft.layout,duplicate])!,/already holds/);
 const missingWall=drawRoomEdges(draft,{x:3,y:0},{x:4,y:0},'erase');assert.ok(!missingWall.layout.some(p=>p.id===sign.id),'Removing any sign support stores the whole sign');assert.equal(s.decorOwned[sign.equipmentId],1,'Storing a sign preserves ownership');
 const stored=storeRoomPiece(draft,sign.id);assert.equal(validateRoomPlan(stored.roomPlan,stored.layout),null,'A room does not require its decorative sign');
 let world=createHomeWorld({roomPlan:draft.roomPlan,w:draft.roomPlan.w,h:draft.roomPlan.h,layout:draft.layout,equipment:s.equipment,menu:['classic_burger'],recipeLevels:{classic_burger:0},chefs:1,waiters:1,cashiers:1,arrivalRate:35,arrivalLimit:6});
 for(let tick=0;tick<32000;tick++){stepHomeWorld(world);if(tick===1200)world=JSON.parse(JSON.stringify(world));if(world.metrics.plates===6&&!world.customers.length&&world.tables.every(t=>t.seats.every(seat=>seat.status==='clean')))break;}
 assert.equal(world.metrics.plates,6,`${domain}/${stage}: actual staff must finish six orders`);assert.ok(world.tables.every(t=>t.seats.every(seat=>seat.status==='clean')),`${domain}/${stage}: clear and wash`);
 assert.equal(roomDesignAssetError(original,draft)!==null,true,'Unowned theme is rejected');
 if(stage==='burger_shop'){
  const placed=dispatchDiner(s,{type:'applyDomainRoom',domain},{now});assert.equal(placed.error,undefined,placed.error);assert.deepEqual(placed.state.home.menu,s.home.menu);assert.deepEqual(placed.state.decorOwned,s.decorOwned);assert.ok(placed.state.domainRoomBackup);
  assert.ok(sanitizeDinerSave(placed.state),'Themed save reloads');
  const old=structuredClone(s);delete old.domainRooms!.earned[domain]!.kitchenVersion;const machine=domain==='gochujang'?'steamer':domain==='smoothie'?'juicer':'wine_station';delete old.equipment[machine];const migrated=grantDomainRoomKit(old,receipt);assert.equal(migrated.equipment[machine].homeCopies,1);assert.deepEqual(migrated.home,old.home);migrated.equipment[machine].homeCopies=0;assert.equal(grantDomainRoomKit(migrated,receipt).equipment[machine].homeCopies,0,'Kitchen migration cannot replenish sold equipment');
  const forged=structuredClone(placed.state);forged.home.roomPlan!.appearance!.floor='not-a-domain' as never;assert.equal(sanitizeDinerSave(forged),null,'Unknown room styles cannot enter a loaded save');
  const restored=dispatchDiner(placed.state,{type:'restoreDomainRoomBackup'},{now});assert.equal(restored.error,undefined,restored.error);assert.deepEqual(restored.state.home.layout,s.home.layout);assert.deepEqual(restored.state.home.menu,s.home.menu);
 }
 console.log(`PASS ${domain}/${stage}: routes, ownership, stage kit and receipt`);
}
assert.equal(validDomainRoomEntitlements({version:1,earned:{wines:{stages:['bad']}}}),false);
const locked=createDiner(now);assert.ok(dispatchDiner(locked,{type:'applyDomainRoom',domain:'wines'},{now}).error);
console.log('PASS private locked entry and malformed entitlement rejection');
