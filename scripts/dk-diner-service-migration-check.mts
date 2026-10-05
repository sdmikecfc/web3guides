import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,sanitizeDinerSave,type DinerState} from '../src/lib/chef/diner/progression';
import {dispatchService,sanitizeService,stepService} from '../src/lib/chef/diner/service';
import type {ServiceAction,ServiceState} from '../src/lib/chef/diner/types';
const now=Date.UTC(2026,8,20,8);
let state=createDiner(now,'pre-batch-browser-save');
function command(input:Parameters<typeof dispatchDiner>[1]){const result=dispatchDiner(state,input,{now});assert.equal(result.error,undefined,result.error);state=result.state;}
command({type:'setupLayout',stations:[...state.truckConfig.stations.map(st=>st.kind==='fridge'?{...st,x:2,y:2,facing:2 as const}:st),{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:state.truckConfig.tables});
command({type:'startRun'});command({type:'chooseNode',nodeId:state.run!.available[0]});
state.coins=137;state.home.name='My saved diner';state.pantry={beef:3,bun:2};
let s=dispatchService(state.run!.service!,{type:'open'}),groups=0;
function until(predicate:()=>boolean){let n=0;while(!predicate()&&n++<12000)stepService(s);assert(predicate(),s.notice);}
function input(a:ServiceAction){s=dispatchService(s,a);}
function touch(targetId:string,ingredientId?:string,seatId?:string){input({type:'interact',targetId,ingredientId,seatId});until(()=>!s.chef.path.length);}
function preBatch(input:DinerState):DinerState{
 const old=structuredClone(input) as any,service=old.run.service;
 delete service.config.batchVersion;delete service.config.cupCount;delete service.cleanCups;delete service.cupStock;
 delete old.equipment.cups;delete old.equipment.boxes;
 for(const station of service.stations){if(station.kind==='sink')station.slots.length=1;for(const slot of station.slots){delete slot.batch;if(slot.item)delete slot.item.vesselKind;}}
 for(const actor of [service.chef,...service.helpers])if(actor.held)delete actor.held.vesselKind;
 for(const table of service.tables)for(const seat of table.seats)if(seat.item)delete seat.item.vesselKind;
 return old;
}
function checkpoint(label:string){
 state.run!.service=s;const raw=preBatch(state),original=structuredClone(raw),service=sanitizeService(raw.run!.service);assert(service,`${label}: service rejected`);
 const restored=sanitizeDinerSave(raw);assert(restored,`${label}: full save rejected`);assert.deepEqual(raw,original,'sanitization must not mutate original');
 assert.equal(restored.coins,137);assert.equal(restored.home.name,'My saved diner');assert.deepEqual(restored.pantry,{beef:3,bun:2});assert.equal(restored.run!.id,raw.run!.id);assert.equal(restored.run!.service!.tick,s.tick);assert.equal(restored.run!.service!.config.batchVersion,0);assert.equal(restored.run!.service!.config.cupCount,0);assert.equal(restored.run!.service!.config.physicalSupplies,true);assert.equal(restored.run!.service!.phase,'paused');assert.equal(restored.run!.service!.pausedPhase,s.phase);assert.deepEqual(restored.run!.service!.chef.held,raw.run!.service!.chef.held);
 const beforeSink=raw.run!.service!.stations.find(st=>st.kind==='sink')!,afterSink=restored.run!.service!.stations.find(st=>st.kind==='sink')!;assert.deepEqual(afterSink.slots[0],beforeSink.slots[0]);assert.deepEqual(afterSink.slots[1],{item:null,job:null});assert.deepEqual(restored.truckConfig,raw.truckConfig);assert.deepEqual(restored.run!.service!.plateStock,raw.run!.service!.plateStock);assert.equal(restored.run!.service!.cleanPlates,raw.run!.service!.cleanPlates);
 groups++;console.log(`PASS intermediate physical save: ${label}`);return restored;
}
checkpoint('newly opened with old fridge at 2,2');
touch('fridge','beef');checkpoint('carrying raw patty');
touch('grill');stepService(s,37);checkpoint('patty still grilling');
until(()=>!!s.stations.find(st=>st.kind==='grill')!.slots[0].job?.ready);touch('grill');touch('prep');checkpoint('cooked patty on prep waiting for bun');
touch('crate','bun');touch('prep');input({type:'hold',active:true});stepService(s,7);checkpoint('patty and bun partially assembled');
until(()=>!!s.stations.find(st=>st.kind==='prep')!.slots[0].job?.ready);checkpoint('prepared burger waiting for a plate');
touch('plates');checkpoint('carrying one of two clean plates');touch('prep');checkpoint('carrying plated burger');
until(()=>s.customers[0]?.phase==='seated');touch('table_1',undefined,s.customers[0].seatId!);checkpoint('guest eating physical burger');
until(()=>s.tables[0].seats[0].status==='dirty');checkpoint('same physical plate dirty on table');
touch('table_1',undefined,s.customers[0].seatId!);
// Before this release, picking up the plate kept its seat awaitingWash.
const oldGuest=s.customers[0],seat=s.tables[0].seats[0];seat.status='awaitingWash';seat.customerId=oldGuest.id;seat.mealId=oldGuest.mealId;
const cleared=checkpoint('old awaitingWash seat with plate in hand');assert.equal(cleared.run!.service!.tables[0].seats[0].status,'clean');
touch('sink');input({type:'hold',active:true});stepService(s,9);checkpoint('old one-slot sink with partial wash');
// Genuine aggregate cooking saves still omit the entire physical supply protocol.
const aggregate=preBatch(state) as any;aggregate.run.service=structuredClone(s);aggregate.run.service.config.physicalSupplies=false;aggregate.run.service.config.plateCount=0;aggregate.run.service.cleanPlates=0;aggregate.run.service.plateStock=[];delete aggregate.run.service.config.physicalSupplies;delete aggregate.run.service.config.plateCount;delete aggregate.run.service.cleanPlates;delete aggregate.run.service.plateStock;delete aggregate.run.service.config.batchVersion;delete aggregate.run.service.config.cupCount;delete aggregate.run.service.cleanCups;delete aggregate.run.service.cupStock;
for(const station of aggregate.run.service.stations)for(const slot of station.slots)if(slot.item){delete slot.item.physical;delete slot.item.vesselKind;delete slot.item.plateId;}
const legacy=sanitizeDinerSave(aggregate);assert(legacy,'aggregate full save rejected');assert.equal(legacy.coins,137);assert.equal(legacy.run!.service!.config.physicalSupplies,false);assert.equal(legacy.run!.service!.config.plateCount,0);assert.equal(legacy.run!.service!.stations.find(st=>st.kind==='sink')!.slots[0].job!.remaining,31);groups++;console.log('PASS pre-physical aggregate save preserves active wash and possessions');
console.log(`PASS ${groups} full-service save migration cases`);
