/** Ownership compatibility for holding counters; no files or network writes. */
import assert from 'node:assert/strict';
import {createDiner,migrateDinerRestaurant,sanitizeDinerSave,dispatchDiner,shopOffers,truckEquipmentShop,truckStorage,type DinerState} from '../src/lib/chef/diner/progression';
const now=Date.UTC(2026,8,21,12);let groups=0;
function test(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
const fresh=()=>createDiner(now,'holding-counter');
test('old owned warming passes move to the warming tier once without losing possessions or layout',()=>{
 const old=fresh();delete old.counterVersion;old.equipment.pass={tier:1,truckOwned:true,homeCopies:0};const before=structuredClone(old),loaded=migrateDinerRestaurant(old);
 assert.equal(loaded.counterVersion,1);assert.deepEqual(loaded.equipment.pass,{tier:2,truckOwned:true,homeCopies:0});assert.equal(loaded.coins,old.coins);assert.deepEqual(loaded.truckConfig,old.truckConfig);assert.deepEqual(loaded.home,old.home);assert.deepEqual(loaded.recipes,old.recipes);assert.deepEqual(old,before);assert.deepEqual(migrateDinerRestaurant(loaded),loaded);assert.equal(sanitizeDinerSave(old)!.equipment.pass.tier,2);assert.equal(truckStorage(loaded).find(item=>item.equipmentId==='pass')!.tier,2);
});
test('new or unowned counters receive no free upgrade and existing advanced passes never change',()=>{
 const current=fresh();assert.equal(current.counterVersion,1);current.equipment.pass={tier:1,truckOwned:true,homeCopies:0};assert.equal(migrateDinerRestaurant(current).equipment.pass.tier,1);
 const unowned=fresh();delete unowned.counterVersion;unowned.equipment.pass={tier:1,truckOwned:false,homeCopies:0};assert.deepEqual(migrateDinerRestaurant(unowned).equipment.pass,unowned.equipment.pass);
 for(const tier of [2,3]){const old=fresh();delete old.counterVersion;old.equipment.pass={tier,truckOwned:true,homeCopies:0};assert.equal(migrateDinerRestaurant(old).equipment.pass.tier,tier);}
 const invalid=fresh();(invalid as any).counterVersion=999;assert.equal(sanitizeDinerSave(invalid),null);
});
test('counter item selection accepts only bounded item identifiers at the authoritative command boundary',()=>{
 for(const itemId of ['',null,2,{},'x'.repeat(65)])assert.equal(dispatchDiner(fresh(),{type:'service',action:{type:'interact',targetId:'pass',itemId}} as any,{now}).code,'invalid_service_action');
 assert.notEqual(dispatchDiner(fresh(),{type:'service',action:{type:'interact',targetId:'pass',itemId:'physical_plate_1'}} as any,{now}).code,'invalid_service_action');
});
test('counter discovery remains independent, truck-only and stored; upgrades preserve its single copy',()=>{
 let state=fresh();state.tutorial.finished=true;state=dispatchDiner(state,{type:'startRun'},{now}).state;const shop=state.run!.map.find(node=>node.kind==='shop')!;state.run!.available=[shop.id];state=dispatchDiner(state,{type:'chooseNode',nodeId:shop.id},{now}).state;state.run!.haul=10000;
 function find(target:string,kind:'equipment'|'upgrade'){for(let i=0;i<100;i++){const offers=shopOffers(state,`counter-${i}`);if(offers.some(offer=>offer.target===target&&offer.kind===kind)){state.run!.offers=offers;return offers.find(offer=>offer.target===target&&offer.kind===kind)!;}}throw new Error('Missing counter offer');}
 const before=structuredClone(state),offer=find('pass','equipment'),bought=dispatchDiner(state,{type:'buyOffer',offerId:offer.id},{now});assert.equal(bought.error,undefined);state=bought.state;assert.deepEqual(state.equipment.pass,{tier:1,truckOwned:true,homeCopies:0});assert.deepEqual(state.recipes,before.recipes);assert.deepEqual(state.truckConfig,before.truckConfig);assert.equal(truckStorage(state).find(item=>item.equipmentId==='pass')!.available,1);
 const lamp=find('pass','upgrade'),upgraded=dispatchDiner(state,{type:'buyOffer',offerId:lamp.id},{now});assert.equal(upgraded.error,undefined);assert.equal(upgraded.state.equipment.pass.tier,2);assert.equal(upgraded.state.equipment.pass.homeCopies,0);assert.equal(dispatchDiner(upgraded.state,{type:'buyOffer',offerId:lamp.id},{now}).code,'offer_unavailable');
 assert(!truckEquipmentShop(fresh()).some(offer=>offer.equipmentId==='pass'),'new discovery is not a universal preparation-shop purchase');
});
console.log(`PASS ${groups} counter ownership and progression groups`);
