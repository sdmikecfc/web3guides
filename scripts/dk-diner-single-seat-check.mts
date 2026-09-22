import {createLegacyDinerFixture} from './dk-diner-legacy-fixture';
/** One-seat tables use distinct home/truck inventories. No network or old-save writes. */
import assert from 'node:assert/strict';
import { EQUIPMENT_BY_ID, HOME_EQUIPMENT, TRUCK_EQUIPMENT } from '../src/lib/chef/diner/content';
import { createDiner, dispatchDiner, DINER_RULES, homeIncidents, homeSimulationConfig, sanitizeDinerSave, validateDinerHome, type DinerCommand, type DinerState } from '../src/lib/chef/diner/progression';
import { createHomeWorld, stepHomeWorld } from '../src/lib/chef/diner/home-simulation';
const now=Date.UTC(2026,8,25,12);let groups=0;
const fresh=()=>createLegacyDinerFixture(now,'single-seat');
function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function act(state:DinerState,command:DinerCommand){const result=dispatchDiner(state,command,{now});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
function purchased(){const state=fresh();state.coins=2000;return act(state,{type:'buyHomeEquipment',equipmentId:'table_1'});}
check('both catalogs offer one chair without replacing the existing restaurant table',()=>{
  assert(HOME_EQUIPMENT.some(item=>item.id==='table_1'));assert(TRUCK_EQUIPMENT.some(item=>item.id==='table_1'));assert.deepEqual(EQUIPMENT_BY_ID.table_1.footprint,[1,1]);assert.equal(EQUIPMENT_BY_ID.table_1.tiers[0].capacity,1);
  const state=fresh();assert.equal(state.equipment.table_1.homeCopies,0);assert.equal(state.equipment.table_2.homeCopies,1);assert.equal(state.home.layout.find(p=>p.id==='table-1')!.equipmentId,'table_2');assert.equal(state.truckConfig.tables[0].capacity,1);
});
check('a paid home copy preserves the restaurant layout and all truck seating',()=>{
  const before=fresh();before.coins=2000;const state=act(before,{type:'buyHomeEquipment',equipmentId:'table_1'});
  assert.equal(state.coins,2000-EQUIPMENT_BY_ID.table_1.tiers[0].price*DINER_RULES.homeEquipmentMultiplier);assert.equal(state.equipment.table_1.homeCopies,1);assert.deepEqual(state.home.layout,before.home.layout);assert.deepEqual(state.truckConfig,before.truckConfig);assert.deepEqual(state.equipment.table_2,before.equipment.table_2);
  const poor=fresh(),failed=dispatchDiner(poor,{type:'buyHomeEquipment',equipmentId:'table_1'},{now});assert(failed.error);assert.deepEqual(failed.state,poor);
});
check('older diners discover the single-seat design without receiving free home or truck copies',()=>{
  const legacy=fresh();delete legacy.equipment.table_1;legacy.coins=1440;
  legacy.truckConfig.tables=[{id:'legacy-two',x:3,y:5,capacity:2,rotation:0}];legacy.truckConfig.tableCopies={table_1:0,table_2:1,table_4:0};
  const original=structuredClone(legacy),restored=sanitizeDinerSave(legacy)!;assert(restored);assert.deepEqual(legacy,original);
  assert.deepEqual(restored.equipment.table_1,{tier:1,truckOwned:true,homeCopies:0});assert.deepEqual(restored.home,original.home);assert.deepEqual(restored.truckConfig,original.truckConfig);assert.equal(restored.coins,1440);
  const paid=act(restored,{type:'buyHomeEquipment',equipmentId:'table_1'});assert.equal(paid.coins,720);assert.equal(paid.equipment.table_1.homeCopies,1);assert.equal(paid.truckConfig.tableCopies.table_1,0);
  let reloaded=paid;for(let n=0;n<3;n++)reloaded=sanitizeDinerSave(JSON.stringify(reloaded))!;
  assert.deepEqual(reloaded.equipment.table_1,paid.equipment.table_1);assert.equal(reloaded.coins,720);assert.deepEqual(reloaded.truckConfig,original.truckConfig);
  const serverPaid=act(legacy,{type:'buyHomeEquipment',equipmentId:'table_1'});assert.equal(serverPaid.coins,720);assert.equal(serverPaid.equipment.table_1.homeCopies,1,'command replay normalizes old canonical records too');
  const second=act(reloaded,{type:'buyHomeEquipment',equipmentId:'table_1'});assert.equal(second.coins,0);assert.equal(second.equipment.table_1.homeCopies,2,'each new physical copy still costs720');
  const existing=structuredClone(paid);existing.equipment.table_1={tier:2,truckOwned:true,homeCopies:3};assert.deepEqual(sanitizeDinerSave(existing)!.equipment.table_1,existing.equipment.table_1);
  const preCounts:any=structuredClone(legacy);delete preCounts.truckConfig.tableCopies;const inferred=sanitizeDinerSave(preCounts)!;assert(inferred);assert.deepEqual(inferred.truckConfig.tableCopies,{table_1:0,table_2:1,table_4:0});
});
check('placing, storing and reloading one home copy never duplicates it',()=>{
  let state=purchased();const old=structuredClone(state.home.layout),single={id:'solo-table',equipmentId:'table_1',x:5,y:4,rotation:0 as const};state=act(state,{type:'homeLayout',layout:[...old,single]});assert.equal(validateDinerHome(state,state.home.layout),null);
  const excessive=dispatchDiner(state,{type:'homeLayout',layout:[...state.home.layout,{...single,id:'not-owned',x:6,y:6}]},{now});assert.equal(excessive.code,'invalid_layout');assert.deepEqual(excessive.state,state);
  const saved=sanitizeDinerSave(state)!;assert(saved);assert.deepEqual(saved.home.layout,state.home.layout);assert.equal(saved.equipment.table_1.homeCopies,1);state=act(saved,{type:'homeLayout',layout:old});assert.equal(state.equipment.table_1.homeCopies,1);assert.deepEqual(state.home.layout,old);
});
check('a single chair follows all four rotations and supports actual automated service',()=>{
  const base=purchased(),expected=[{x:4,y:5},{x:3,y:4},{x:4,y:3},{x:5,y:4}];
  for(const rotation of [0,1,2,3] as const){const state=act(base,{type:'homeLayout',layout:[...base.home.layout.filter(p=>!p.equipmentId.startsWith('table_')),{id:'solo',equipmentId:'table_1',x:4,y:4,rotation}]});assert.equal(validateDinerHome(state,state.home.layout),null);
    const world=createHomeWorld(homeSimulationConfig(state));assert.equal(world.tables.length,1);assert.equal(world.tables[0].capacity,1);assert.equal(world.tables[0].seats.length,1);assert.deepEqual({x:world.tables[0].seats[0].x,y:world.tables[0].seats[0].y},expected[rotation]);assert(!world.stations.some(station=>station.id==='solo'));stepHomeWorld(world,6000);assert(world.metrics.plates>0,`one-seat rotation ${rotation} must serve actual meals: ${JSON.stringify({actors:world.actors,customers:world.customers,orders:world.orders,metrics:world.metrics})}`);
    assert.equal(sanitizeDinerSave(state)!.home.layout.at(-1)!.rotation,rotation);for(const incident of homeIncidents(state))assert.notDeepEqual({x:incident.x,y:incident.y},expected[rotation]);
    const blocked=structuredClone(state);blocked.decorOwned.red_planter=1;const result=dispatchDiner(blocked,{type:'homeLayout',layout:[...blocked.home.layout,{id:'blocked-chair',equipmentId:'red_planter',...expected[rotation],rotation:0}]},{now});assert.equal(result.code,'invalid_layout');assert.deepEqual(result.state,blocked);
  }
});
check('buying truck seating never grants or spends a restaurant copy',()=>{
  let state=purchased();const home=structuredClone(state.home),homeCopies=state.equipment.table_1.homeCopies,before=state.coins;
  state=act(state,{type:'buyTruckTable',capacity:1});assert.equal(state.coins,before-60);assert.equal(state.truckConfig.tableCopies.table_1,2);assert.equal(state.equipment.table_1.homeCopies,homeCopies);assert.deepEqual(state.home,home);
  state=act(state,{type:'setupLayout',stations:state.truckConfig.stations,tables:[...state.truckConfig.tables,{id:'extra-single',x:5,y:4,capacity:1,rotation:0}]});assert.equal(state.truckConfig.tables.length,2);assert(state.truckConfig.tables.every(table=>table.capacity===1));assert.deepEqual(sanitizeDinerSave(state)!.truckConfig.tables,state.truckConfig.tables);
});
check('new one-seat placements cannot share a chair, while older saved layouts remain loadable',()=>{
  const state=fresh();state.equipment.table_1.homeCopies=2;
  const machines=state.home.layout.filter(p=>!p.equipmentId.startsWith('table_'));
  const shared=[...machines,{id:'south-solo',equipmentId:'table_1',x:4,y:3,rotation:0 as const},{id:'north-solo',equipmentId:'table_1',x:4,y:5,rotation:2 as const}];
  assert.equal(validateDinerHome(state,shared),null,'legacy structural validation stays compatible');
  const chairs=createHomeWorld({...homeSimulationConfig(state),layout:shared}).tables.flatMap(t=>t.seats.map(s=>`${s.x},${s.y}`));assert.deepEqual(chairs,['4,4','4,4']);
  const result=dispatchDiner(state,{type:'homeLayout',layout:shared},{now});assert.equal(result.code,'invalid_layout');assert.match(result.error!,/chair space/);assert.deepEqual(result.state,state);
  const legacy=structuredClone(state);legacy.home.layout=shared;assert.deepEqual(sanitizeDinerSave(legacy)!.home.layout,shared,'loading does not discard an older room');
  for(const equipmentId of ['table_2','table_4']){
    const mixed=structuredClone(state);mixed.equipment[equipmentId]={tier:1,truckOwned:true,homeCopies:1};
    const layout=[...machines,{id:'large-table',equipmentId,x:4,y:3,rotation:0 as const},{id:'solo',equipmentId:'table_1',x:4,y:1,rotation:0 as const}];
    assert.equal(validateDinerHome(mixed,layout),null);const world=createHomeWorld({...homeSimulationConfig(mixed),layout});assert(world.tables.find(t=>t.id==='large-table')!.seats.some(s=>s.x===4&&s.y===2));
    for(const proposed of [layout,[...layout].reverse()]){const rejected=dispatchDiner(mixed,{type:'homeLayout',layout:proposed},{now});assert.equal(rejected.code,'invalid_layout',`one chair overlaps ${equipmentId}`);assert.deepEqual(rejected.state,mixed);}
  }
  assert.equal(dispatchDiner(state,{type:'homeLayout',layout:[...machines,{id:'south-solo',equipmentId:'table_1',x:4,y:3,rotation:0},{id:'other-solo',equipmentId:'table_1',x:6,y:5,rotation:2}]},{now}).error,undefined);
});
check('a staged burger shop can buy a single seat without replacing its included console',()=>{
 let state=createDiner(now,'staged-single');state.coins=2000;const original=structuredClone(state.home.roomPlan);assert.equal(state.equipment.table_2.homeCopies,0);state=act(state,{type:'buyHomeEquipment',equipmentId:'table_1'});state=act(state,{type:'homeLayout',layout:[...state.home.layout,{id:'extra-stool-table',equipmentId:'table_1',x:3,y:5,rotation:0}]});
 assert.deepEqual(state.home.roomPlan,original);const world=createHomeWorld(homeSimulationConfig(state));assert.equal(world.tables.reduce((sum,t)=>sum+t.capacity,0),4);assert(world.tables.some(t=>t.capacity===3));assert.equal(world.tables.find(t=>t.id==='extra-stool-table')!.capacity,1);assert(sanitizeDinerSave(state));
});
console.log(`PASS ${groups} diner single-seat groups`);
