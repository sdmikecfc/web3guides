/** Booth ownership, real seat anchors and service regressions; no network. */
import assert from 'node:assert/strict';
import { createDiner, dispatchDiner, getRenovationPreview, homeEquipmentPurchaseError, homeSimulationConfig, migrateDinerRestaurant, sanitizeDinerSave, validateDinerHomePlacement, DINER_RULES, type DinerState, type DinerCommand, type HomePlacement } from '../src/lib/chef/diner/progression';
import { createRestaurantBlueprint, roomTableSeats, validateRoomPlan } from '../src/lib/chef/diner/room-plan';
import { createHomeWorld, homePath, stepHomeWorld } from '../src/lib/chef/diner/home-simulation';
import { EQUIPMENT_BY_ID, isHomeEquipmentAvailable, isTruckEquipmentAvailable } from '../src/lib/chef/diner/content';
import { fixtureInventoryFor, stageDefaultFinishes } from '../src/lib/chef/diner/renovation';

const now=Date.UTC(2026,8,21,9);let groups=0;
function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function act(state:DinerState,command:DinerCommand){const result=dispatchDiner(state,command,{now});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
function eligible(){const s=createDiner(now,'booth');s.coins=100000;s.career.services=100;s.career.byRoute={downtown:100};s.career.byDifficulty={medium:100};s.career.multiRecipe={two:100,three:0};s.collections.routeWins=['downtown'];for(const id of ['classic_burger','fries','lemonade'])s.recipes[id]={level:3};return s;}
function renovated(){const s=eligible();return act(s,{type:'renovateHome',stage:'diner',previewToken:getRenovationPreview(s)!.token});}

check('diner preview and confirmation include one booth with an idempotent ownership receipt',()=>{
 const initial=eligible(),before=structuredClone(initial),preview=getRenovationPreview(initial)!;
 assert.equal(preview.includedFurniture.booth_2,1);assert.equal(preview.layout.filter(p=>p.equipmentId==='booth_2').length,1);assert.deepEqual(initial,before);
 let s=act(initial,{type:'renovateHome',stage:'diner',previewToken:preview.token});assert.deepEqual(s.equipment.booth_2,{tier:1,truckOwned:false,homeCopies:1});assert.deepEqual(s.renovation.boothGrant,{version:1,granted:true});
 const repeated=dispatchDiner(s,{type:'renovateHome',stage:'diner',previewToken:preview.token},{now});assert(repeated.error);assert.deepEqual(repeated.state,s);
 s=act(s,{type:'restoreRenovation',backupId:s.renovation.backups[0].id});const again=getRenovationPreview(s)!;assert.equal(again.includedFurniture.booth_2,undefined);s=act(s,{type:'renovateHome',stage:'diner',previewToken:again.token});assert.equal(s.equipment.booth_2.homeCopies,1);assert(sanitizeDinerSave(s));
});
check('existing diner and full restaurant rooms receive the missing booth in storage without rearrangement',()=>{
 for(const stage of ['diner','restaurant'] as const){const s=createDiner(now,'legacy-booth'),b=createRestaurantBlueprint(stage);s.home={...s.home,w:b.roomPlan.w,h:b.roomPlan.h,roomPlan:b.roomPlan,fixtureInventory:fixtureInventoryFor(b.roomPlan),layout:b.layout.filter(p=>p.equipmentId!=='booth_2'),staff:b.staff};s.renovation.completed=['burger_shop','diner',...(stage==='restaurant'?['restaurant' as const]:[])];s.equipment.table_2.homeCopies=3;s.home.layout.find(p=>p.equipmentId==='prep')!.x=3;
  const before=structuredClone(s),migrated=migrateDinerRestaurant(s);assert.deepEqual(migrated.home,{...before.home,finishes:stage==='diner'?stageDefaultFinishes('diner'):before.home.finishes});assert.equal(migrated.equipment.booth_2.homeCopies,1);assert.equal(migrated.equipment.booth_2.truckOwned,false);assert.deepEqual(migrateDinerRestaurant(migrated),migrated);assert.deepEqual(s,before);assert(sanitizeDinerSave(migrated));
 }
 const forged=renovated();forged.renovation.boothGrant={version:1,granted:false} as any;assert.equal(sanitizeDinerSave(forged),null);
});
check('booths are sold only for diner and restaurant homes, never truck shops or starter kitchens',()=>{
 assert.equal(isHomeEquipmentAvailable('booth_2'),true);assert.equal(isTruckEquipmentAvailable('booth_2'),false);
 const starter=createDiner(now);starter.coins=10000;assert(homeEquipmentPurchaseError(starter,'booth_2'));const blocked=dispatchDiner(starter,{type:'buyHomeEquipment',equipmentId:'booth_2'},{now});assert(blocked.error);assert.deepEqual(blocked.state,starter);
 let s=renovated(),coins=s.coins;assert.equal(homeEquipmentPurchaseError(s,'booth_2'),null);s=act(s,{type:'buyHomeEquipment',equipmentId:'booth_2'});assert.equal(s.equipment.booth_2.homeCopies,2);assert.equal(s.coins,coins-EQUIPMENT_BY_ID.booth_2.tiers[0].price*DINER_RULES.homeEquipmentMultiplier);assert.equal(s.equipment.booth_2.truckOwned,false);
 assert(dispatchDiner(s,{type:'buyTruckEquipment',equipmentId:'booth_2'},{now}).error);
 const restaurant=createRestaurantBlueprint('restaurant');s.home={...s.home,w:restaurant.roomPlan.w,h:restaurant.roomPlan.h,roomPlan:restaurant.roomPlan,fixtureInventory:fixtureInventoryFor(restaurant.roomPlan),layout:restaurant.layout,staff:restaurant.staff};s.equipment.table_2.homeCopies=3;assert.equal(homeEquipmentPurchaseError(s,'booth_2'),null);s=act(s,{type:'buyHomeEquipment',equipmentId:'booth_2'});assert.equal(s.equipment.booth_2.homeCopies,3);
});
check('fixed benches rotate, cannot jump around an obstacle, and survive storage and reload',()=>{
 const original=renovated(),base=original.home.layout.filter(p=>p.equipmentId!=='booth_2');
 for(const rotation of [0,1,2,3] as const){const p:HomePlacement={id:'rotated-booth',equipmentId:'booth_2',x:8,y:7,rotation},layout=[...base,p];assert.equal(validateDinerHomePlacement(original,layout),null,'rotation '+rotation);const expected=roomTableSeats(p,()=>true);assert.equal(expected.length,2);const blocked=expected[0];assert.equal(roomTableSeats(p,q=>q.x!==blocked.x||q.y!==blocked.y).length,0);
  const state=act(original,{type:'homeLayout',layout}),restored=sanitizeDinerSave(state)!;assert(restored);assert.deepEqual(restored.home.layout,layout);const world=createHomeWorld(homeSimulationConfig(restored)),table=world.tables.find(t=>t.id===p.id)!;assert.equal(table.kind,'booth');assert.deepEqual(table.seats.map(({x,y})=>({x,y})),expected);for(const seat of table.seats)assert(homePath(world,world.door,seat,new Set(),'customer'));
  const occupied=[...layout,{id:'blocked-bench',equipmentId:'sink',x:blocked.x,y:blocked.y,rotation:0 as const}];assert(validateRoomPlan(state.home.roomPlan!,occupied));
  const stored=act(state,{type:'homeLayout',layout:base});assert.equal(stored.equipment.booth_2.homeCopies,1);assert.equal(stored.home.layout.some(p=>p.equipmentId==='booth_2'),false);assert.equal(act(stored,{type:'homeLayout',layout}).home.layout.length,layout.length);
 }
});
check('both booth guests can order, eat and have dishes cleared without losing deterministic reload',()=>{
 const config=homeSimulationConfig(renovated());config.arrivalRate=180;const world=createHomeWorld(config),booth=world.tables.find(t=>t.kind==='booth')!;assert(booth);const served=new Set<string>(),collected=new Set<string>();
 for(let tick=0;tick<18000;tick++){stepHomeWorld(world);for(const seat of booth.seats){if(seat.status==='eating')served.add(seat.id);if(seat.status==='awaitingWash')collected.add(seat.id);}for(const actor of world.actors)assert(!booth.seats.some(s=>Math.hypot(actor.x-s.x,actor.y-s.y)<.4),'staff never stand on the booth guest');}
 assert.equal(served.size,2);assert.equal(collected.size,2);assert(world.metrics.plates>20);assert(world.metrics.washed>20);const resumed=JSON.parse(JSON.stringify(world));stepHomeWorld(world,1600);stepHomeWorld(resumed,1600);assert.deepEqual(resumed,world);
});
check('coordinated diner finishes appear in the preview, are owned once and restore with the room',()=>{
 const s=eligible(),before=structuredClone(s),preview=getRenovationPreview(s)!;assert.deepEqual(preview.finishes,stageDefaultFinishes('diner'));assert.deepEqual(preview.includedPalette,{counter:['oak']});assert.deepEqual(s,before);
 const next=act(s,{type:'renovateHome',stage:'diner',previewToken:preview.token});assert.deepEqual(next.home.finishes,preview.finishes);assert.deepEqual(next.paletteOwned!.counter,['tomato','oak']);assert.deepEqual(next.paletteOwned!.upholstery,['cherry']);assert(sanitizeDinerSave(next));
 const restored=act(next,{type:'restoreRenovation',backupId:next.renovation.backups[0].id});assert.deepEqual(restored.home.finishes,s.home.finishes);assert.deepEqual(restored.paletteOwned,next.paletteOwned);const second=getRenovationPreview(restored)!;assert.deepEqual(second.includedPalette,{});assert.deepEqual(second.finishes,s.home.finishes,'switching back to an owned original color is intentional');
 const changed=act(s,{type:'buyRoomFinish',slot:'counter',id:'sage'});const stale=dispatchDiner(changed,{type:'renovateHome',stage:'diner',previewToken:preview.token},{now});assert.equal(stale.code,'renovation_changed');
});
check('renovating or migrating never replaces a purchased finish, even when original colors are selected',()=>{
 let s=eligible();s=act(s,{type:'buyRoomFinish',slot:'counter',id:'sage'});s=act(s,{type:'buyRoomFinish',slot:'upholstery',id:'mint'});s=act(s,{type:'setRoomFinish',slot:'counter',id:'tomato'});
 const chosen=structuredClone(s.home.finishes),preview=getRenovationPreview(s)!;assert.deepEqual(preview.finishes,chosen);s=act(s,{type:'renovateHome',stage:'diner',previewToken:preview.token});assert.deepEqual(s.home.finishes,chosen);assert(s.paletteOwned!.counter.includes('oak'));assert(!s.paletteOwned!.upholstery.includes('teal'));
 delete s.renovation.boothGrant;delete s.renovation.dinerPaletteGranted;s.paletteOwned!.counter=s.paletteOwned!.counter.filter(id=>id!=='oak');s.paletteOwned!.upholstery=s.paletteOwned!.upholstery.filter(id=>id!=='teal');const migrated=migrateDinerRestaurant(s);assert.deepEqual(migrated.home,s.home);assert.deepEqual(migrateDinerRestaurant(migrated),migrated);
});
console.log(`PASS ${groups} booth ownership and service groups`);
