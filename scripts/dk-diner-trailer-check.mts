/** Real setup/ownership/cooking regressions; no browser, credentials, or database. */
import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,sanitizeDinerSave,truckStorage,truckSetupError,TRUCK_TABLE_PRICES,type DinerCommand,type DinerState} from '../src/lib/chef/diner/progression';
import {buildServiceLoadout,makeTable,serviceGeometry,servicePath,tableFootprint,validateServiceLayout} from '../src/lib/chef/diner/geometry';
import {dispatchService,sanitizeService,serviceReadyError,stepService} from '../src/lib/chef/diner/service';
import {createDinerRecord,replayDiner} from '../src/lib/chef/diner/authority';
import type {ServiceAction,ServiceState} from '../src/lib/chef/diner/types';
const now=Date.UTC(2026,8,20,8),fresh=()=>createDiner(now,'trailer-check');
let groups=0;function check(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
function act(s:DinerState,command:DinerCommand){const result=dispatchDiner(s,command,{now});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
function reject(s:DinerState,command:DinerCommand,code:string){const result=dispatchDiner(s,command,{now});assert.equal(result.code,code,result.error);assert.deepEqual(result.state,s);}
function install(s:DinerState){return act(s,{type:'setupLayout',stations:[...s.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:s.truckConfig.tables});}
check('fresh trailer has exactly one owned seat and portable tools; home remains unchanged',()=>{
  const s=fresh();assert.equal(s.truckConfig.tables.length,1);assert.equal(s.truckConfig.tables[0].capacity,1);assert.deepEqual(s.truckConfig.tableCopies,{table_1:1,table_2:0,table_4:0});
  assert.deepEqual(truckStorage(s).filter(p=>p.available).map(p=>p.equipmentId).sort(),['grill','prep']);assert.equal(s.home.layout.find(p=>p.id==='table-1')!.equipmentId,'table_2');
  assert.match(truckSetupError(s)!,/grill/);assert.equal(truckSetupError(install(s)),null);assert.deepEqual(s.truckConfig.stations.map(p=>p.kind),['crate','sink','bin','fridge','plates']);
});
check('one chair rotates around its one-cell table and remains reachable after reload',()=>{
  for(const rotation of [0,1,2,3] as const){let s=install(fresh());s=act(s,{type:'setupLayout',stations:s.truckConfig.stations,tables:s.truckConfig.tables.map(p=>({...p,rotation}))});s=act(s,{type:'startPractice'});
    const service=s.run!.service!,table=service.tables[0];assert.equal(tableFootprint(table).length,1);assert.equal(table.seats.length,1);assert.equal(Math.abs(table.seats[0].x-table.x)+Math.abs(table.seats[0].y-table.y),1);
    assert(servicePath(1,service.stations,service.tables,serviceGeometry(1).door,table.seats[0]));assert.deepEqual(sanitizeDinerSave(s)!.run!.service!.tables,service.tables);
  }
});
check('untimed empty setup reloads, cannot open, and restores owned items without duplication',()=>{
  let s=act(fresh(),{type:'startPractice'});s=act(s,{type:'setupLayout',stations:[],tables:[]});
  assert.equal(s.run!.service!.tick,0);assert.equal(s.run!.service!.customers.length,0);assert(sanitizeDinerSave(s));assert(sanitizeService(s.run!.service));
  s=act(s,{type:'service',action:{type:'open'}});assert.equal(s.run!.service!.phase,'setup');assert.match(s.run!.service!.notice,/table/i);
  const bare=fresh();s=act(s,{type:'setupLayout',stations:bare.truckConfig.stations,tables:bare.truckConfig.tables});s=install(s);assert.equal(serviceReadyError(s.run!.service!),null);
  const before=structuredClone(s.truckConfig);s=act(s,{type:'setupLayout',stations:s.truckConfig.stations.filter(p=>p.kind!=='grill'),tables:s.truckConfig.tables});assert.equal(truckStorage(s).find(p=>p.equipmentId==='grill')!.available,1);
  s=act(s,{type:'setupLayout',stations:before.stations,tables:before.tables});assert.deepEqual(s.truckConfig,before);assert.equal(truckStorage(s).find(p=>p.equipmentId==='grill')!.available,0);
  reject(s,{type:'setupLayout',stations:[...s.truckConfig.stations,{id:'grill_copy',kind:'grill',x:3,y:0,facing:0}],tables:s.truckConfig.tables},'equipment_unavailable');
});
check('each required station and reachable work side is checked again before opening',()=>{
  const complete=install(fresh());
  for(const kind of ['crate','sink','bin','fridge','plates','grill','prep']){let s=act(complete,{type:'startPractice'});s=act(s,{type:'setupLayout',stations:s.truckConfig.stations.filter(p=>p.kind!==kind),tables:s.truckConfig.tables});assert(sanitizeDinerSave(s));s=act(s,{type:'service',action:{type:'open'}});assert.equal(s.run!.service!.phase,'setup');assert(serviceReadyError(s.run!.service!),kind);}
  reject(complete,{type:'setupLayout',stations:complete.truckConfig.stations.map(p=>p.kind==='grill'?{...p,facing:2}:p),tables:complete.truckConfig.tables},'invalid_layout');
  const bare=act(complete,{type:'setupLayout',stations:[],tables:[]});assert.equal(validateServiceLayout(1,[],[],{allowIncomplete:true}),null);assert.equal(bare.truckConfig.tables.length,0);assert(truckSetupError(bare));
});
check('seating requires a real purchase, tracks stored quantities, and cannot be forged',()=>{
  let s=fresh();const table2={id:'two',x:3,y:5,capacity:2 as const,rotation:0 as const};
  reject(s,{type:'setupLayout',stations:s.truckConfig.stations,tables:[table2]},'equipment_unavailable');
  s=act(s,{type:'buyTruckTable',capacity:2});assert.equal(s.coins,200-TRUCK_TABLE_PRICES[2]);assert.equal(s.truckConfig.tableCopies.table_2,1);
  s=act(s,{type:'setupLayout',stations:s.truckConfig.stations,tables:[table2]});assert.equal(truckStorage(s).find(p=>p.equipmentId==='table_1')!.available,1);
  s.truckTier=2;s=act(s,{type:'startPractice'});reject(s,{type:'setupLayout',stations:s.truckConfig.stations,tables:[table2,{...table2,id:'duplicate',x:5,y:7}]},'equipment_unavailable');
  const saved=sanitizeDinerSave(s)!;assert(saved);assert.deepEqual(saved.truckConfig.tableCopies,s.truckConfig.tableCopies);
  for(const capacity of [0,3,NaN,'2'])reject(s,{type:'buyTruckTable',capacity} as any,'invalid_table');
  reject(s,{type:'buyTruckTable',capacity:1,price:0} as any,'invalid_command');
  const poor=fresh();poor.coins=0;reject(poor,{type:'buyTruckTable',capacity:1},'not_enough_coins');
});
check('a bought second table fits the starter pavement without replacing the first',()=>{
  let s=install(fresh());s=act(s,{type:'buyTruckTable',capacity:1});assert.equal(s.coins,140);
  s=act(s,{type:'setupLayout',stations:s.truckConfig.stations,tables:[...s.truckConfig.tables,{id:'second_single',capacity:1,x:5,y:5,rotation:0}]});
  s=act(s,{type:'startPractice'});assert.equal(s.run!.service!.tables.length,2);assert.equal(s.run!.service!.tables.reduce((sum,table)=>sum+table.seats.length,0),2);assert.equal(serviceReadyError(s.run!.service!),null);
  const customers=s.run!.service!.config.customers;s=act(s,{type:'service',action:{type:'open'}});s=act(s,{type:'service',action:{type:'tick',ticks:40}});s=sanitizeDinerSave(s)!;assert.equal(s.run!.service!.phase,'paused');assert.equal(s.run!.service!.tables.length,2);s=act(s,{type:'service',action:{type:'resume'}});assert.equal(s.run!.service!.phase,'playing');assert.equal(s.run!.service!.config.customers,customers);
  const overlap=install(fresh());assert(validateServiceLayout(1,buildServiceLoadout(1,['classic_burger']).stations,[makeTable('a',3,5,1),makeTable('b',3,7,1,1,2)]),'chairs cannot occupy the same floor cell');
  reject(overlap,{type:'setupLayout',stations:overlap.truckConfig.stations,tables:Array.from({length:13},(_,i)=>({id:`table_${i}`,capacity:1,x:0,y:4,rotation:0}))},'invalid_layout');
});
check('truck growth preserves equipment and shifts only the pavement; it never grants seating',()=>{
  let s=install(fresh());const counts=structuredClone(s.truckConfig.tableCopies);const stations=structuredClone(s.truckConfig.stations);
  for(const tier of [2,3,4] as const){s.truckTier=tier;s=act(s,{type:'startPractice'});assert.deepEqual(s.truckConfig.tableCopies,counts);assert.equal(s.run!.service!.tables.length,1);assert.equal(s.run!.service!.tables[0].capacity,1);assert.equal(s.run!.service!.tables[0].y,serviceGeometry(tier).pavement.y+1);assert.deepEqual(s.truckConfig.stations,stations.map(p=>p.kind==='plates'?{...p,y:p.y+serviceGeometry(tier).truck.h-3}:p));assert.equal(serviceReadyError(s.run!.service!),null);s=act(s,{type:'endPractice'});}
});
check('legacy purchased/multiple tables and active checkpoint survive additive migration',()=>{
  let s=fresh();s.equipment.boxes={tier:1,truckOwned:true,homeCopies:0};s.recipes.fries={level:0};s.equipment.fryer.truckOwned=true;s.truckTier=3;const layout=buildServiceLoadout(3,['classic_burger','fries']);
  s.truckConfig={...s.truckConfig,layoutTier:3,menu:['classic_burger','fries'],stations:layout.stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing})),tables:layout.tables.map(({id,x,y,capacity,rotation})=>({id,x,y,capacity,rotation}))};
  delete (s.truckConfig as any).tableCopies;delete s.equipment.table_1;s.equipment.table_4={tier:1,truckOwned:true,homeCopies:0};const original=structuredClone(s);
  const restored=sanitizeDinerSave(s)!;assert(restored);assert.deepEqual(s,original);assert.deepEqual(restored.truckConfig.tables,s.truckConfig.tables);assert.equal(restored.truckConfig.tableCopies.table_2,3);assert.equal(restored.truckConfig.tableCopies.table_4,1);assert.equal(restored.truckConfig.tableCopies.table_1,0);
  const started=act(restored,{type:'startPractice'});assert.equal(started.run!.service!.tables.length,3);assert.equal(started.run!.service!.tables.reduce((n,t)=>n+t.capacity,0),6);assert(sanitizeDinerSave(started));
});
check('opening lesson requires actual cooking and its exact plate wash before second arrival',()=>{
  let state=install(fresh());state=act(state,{type:'startRun'});state=act(state,{type:'chooseNode',nodeId:state.run!.available[0]});assert.deepEqual(state.run!.service!.config.menu,['classic_burger']);
  reject(state,{type:'setTruckMenu',recipeIds:['fries']},'invalid_menu');
  let s=dispatchService(state.run!.service!,{type:'open'});const input=(a:ServiceAction)=>{s=dispatchService(s,a);};const until=(predicate:()=>boolean)=>{let n=0;while(!predicate()&&n++<12000)stepService(s,1);assert(predicate(),s.notice);};
  const use=(id:string,recipeId?:string,seatId?:string)=>{input({type:'interact',targetId:id,recipeId,seatId});until(()=>s.chef.path.length===0);};
  stepService(s,10000);assert.equal(s.spawned,1);assert.equal(s.strikes,0);assert.equal(s.customers[0].recipeId,'classic_burger');assert.equal(s.customers[0].phase,'seated');
  use('fridge','classic_burger');use('grill');until(()=>!!s.stations.find(p=>p.kind==='grill')!.slots[0].job?.ready);use('grill');use('prep');use('crate','classic_burger');use('prep');input({type:'hold',active:true});until(()=>!!s.stations.find(p=>p.kind==='prep')!.slots[0].job?.ready);input({type:'hold',active:false});use('plates');use('prep');assert.equal(s.chef.held?.kind,'dish');
  const customer=s.customers[0];use(customer.tableId!,undefined,customer.seatId!);until(()=>s.tables[0].seats[0].status==='dirty');assert.equal(s.served,1);stepService(s,2000);assert.equal(s.spawned,1);
  use(customer.tableId!,undefined,customer.seatId!);assert.equal(s.chef.held?.kind,'dirty');use('sink');stepService(s,1000);assert.equal(s.spawned,1);assert.equal(s.washed,0);
  input({type:'hold',active:true});until(()=>s.washed===1);input({type:'hold',active:false});until(()=>s.spawned===2);assert.equal(s.tables[0].seats[0].status==='clean'||s.tables[0].seats[0].status==='reserved',true);assert.equal(s.strikes,0);
});
check('authority replays preparation and purchase; absence cannot run an unopened truck',()=>{
  let record=createDinerRecord(now,'trailer-authority');record=replayDiner(record,[{type:'startPractice'}],now).record;
  record=replayDiner(record,[{type:'buyTruckTable',capacity:2}],now+60000).record;assert.equal(record.state.coins,120);assert.equal(record.state.run!.service!.tick,0);assert.equal(record.state.run!.service!.phase,'setup');assert.equal(record.clock.creditMs,0);
  const prior=structuredClone(record);assert.throws(()=>replayDiner(record,[{type:'setupLayout',stations:[...record.state.truckConfig.stations,{id:'forged',kind:'coffee',x:1,y:0,facing:0}],tables:record.state.truckConfig.tables}],now+61000));assert.deepEqual(record,prior);
  const installed=install(record.state);record=replayDiner(record,[{type:'setupLayout',stations:installed.truckConfig.stations,tables:installed.truckConfig.tables},{type:'service',action:{type:'open'}}],now+61000).record;assert.equal(record.state.run!.service!.phase,'playing');assert.equal(record.clock.creditMs,0);
});
console.log(`PASS ${groups} trailer and seating groups`);
