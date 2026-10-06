import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,type DinerCommand,type DinerState} from '../src/lib/chef/diner/progression';
import {buildServiceLoadout,makeTable} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,normalizeServiceAdditions,sanitizeService,stepService} from '../src/lib/chef/diner/service';
import {earlyServicePacing} from '../src/lib/chef/diner/service-pacing';
import type {NextServiceEffect} from '../src/lib/chef/diner/events';
import {DIFFICULTIES,ingredientSupply,SERVICE_RULES} from '../src/lib/chef/diner/content';
import type {ServiceAction,ServiceState} from '../src/lib/chef/diner/types';

const now=Date.UTC(2026,8,22,9);let groups=0;
function test(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function act(state:DinerState,command:DinerCommand){const result=dispatchDiner(state,command,{now});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
/** Only the already-completed trip history is a fixture. chooseNode itself
 * constructs the real service, with the untouched starter's owned equipment. */
function tutorialThird():ServiceState{
  let state=createDiner(now,'paced-opening');
  state=act(state,{type:'setupLayout',stations:[...state.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:state.truckConfig.tables});
  state=act(state,{type:'startRun'});state.run!.serviceDays=2;
  const third=state.run!.map.find(n=>n.row===2)!;assert.equal(third.kind,'medium');state.run!.available=[third.id];
  state=act(state,{type:'chooseNode',nodeId:third.id});return state.run!.service!;
}
/** A deliberately unhurried solo player. Every interaction/hold action costs
 * one second of thinking time, in addition to real walking and machine timers. */
import {Kitchen} from './dk-diner-reference-kitchen';

test('actual third tutorial node creates eight guests with paired arrivals and two waiting places',()=>{
  const service=tutorialThird();assert.equal(service.config.customers,8);assert.equal(service.config.arrivalTicks,560);assert.equal(service.config.maxWaitingCustomers,2);assert.equal(service.config.tutorialLearning,false);assert.equal(service.config.tutorialFailure,false);assert.deepEqual(service.config.menu,['classic_burger']);assert.equal(service.tables.reduce((n,t)=>n+t.capacity,0),1);assert.equal(service.helpers.length,0);assert(service.stations.every(st=>st.tier===1));
});
test('one chair and base equipment finish the first rush with real burgers, manual washing and one-second decisions',()=>{
  const k=new Kitchen(tutorialThird());k.lunch();assert.equal(k.s.served,8);assert.equal(k.s.paid,8);assert.equal(k.s.strikes,0);assert.equal(k.s.missed,0);assert.equal(k.s.burnt,0);assert(k.s.washed>=7);assert(k.maxQueue<=2);assert.equal(k.s.spawned,8);assert(k.decisions>=100);
  console.log(`  First rush: ${(k.s.tick/1200).toFixed(2)} minutes, ${k.s.served} served, ${k.s.washed} washed, ${k.s.strikes} strikes, max queue ${k.maxQueue}, ${k.decisions} one-second decisions.`);
});
test('later opening-trip and repeat-route services increase pressure without reusing the opening rush profile',()=>{
  const third=earlyServicePacing({routeId:'downtown',serviceDays:2,tutorial:true,kind:'busy'}),repeat=earlyServicePacing({routeId:'downtown',serviceDays:2,tutorial:false,kind:'busy'}),fourth=earlyServicePacing({routeId:'downtown',serviceDays:3,tutorial:true,kind:'busy'});
  assert(repeat.customers!>third.customers!);assert(repeat.arrivalTicks!<=third.arrivalTicks!);assert(fourth.customers!>repeat.customers!);assert(fourth.arrivalTicks!<repeat.arrivalTicks!);assert.equal(repeat.maxWaitingCustomers,2);assert.equal(fourth.maxWaitingCustomers,2);
  const fifth=earlyServicePacing({routeId:'downtown',serviceDays:4,tutorial:false,kind:'busy'}),seventh=earlyServicePacing({routeId:'downtown',serviceDays:6,tutorial:false,kind:'busy'}),finale=earlyServicePacing({routeId:'downtown',serviceDays:7,tutorial:false,kind:'finale'});
  assert.equal(fifth.arrivalTicks,24*20);assert.equal(fifth.customers,14);assert.equal(fifth.maxWaitingCustomers,3);assert.equal(seventh.arrivalTicks,20*20);assert.equal(seventh.customers,18);assert.equal(finale.arrivalTicks,18*20);assert.equal(finale.customers,22);
  assert.deepEqual(earlyServicePacing({routeId:'boardwalk',serviceDays:2,tutorial:false,kind:'busy'}),{});
});
test('Downtown event choices modify the paced service instead of disappearing or restoring the old rush',()=>{
  function next(effect?:NextServiceEffect){
    let state=createDiner(now,'paced-events');
    state=act(state,{type:'setupLayout',stations:[...state.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:state.truckConfig.tables});
    state=act(state,{type:'startRun'});state.run!.serviceDays=4;
    const node=state.run!.map.find(n=>n.row===6)!;state.run!.available=[node.id];state.run!.nextService=effect??null;
    return act(state,{type:'chooseNode',nodeId:node.id}).run!.service!.config;
  }
  const base=next(),rain=next({kind:'rain'}),festival=next({kind:'festival'}),rival=next({kind:'rival'}),film=next({kind:'film'});
  assert(rain.customers<base.customers);assert(rain.arrivalTicks>base.arrivalTicks);assert(rain.tablePatienceTicks<base.tablePatienceTicks);assert(rain.queuePatienceTicks<base.queuePatienceTicks);
  for(const harder of [festival,rival]){assert(harder.customers>base.customers);assert(harder.arrivalTicks<base.arrivalTicks);assert(harder.arrivalTicks>=18*20);assert.equal(harder.maxWaitingCustomers,base.maxWaitingCustomers);}
  assert.equal(festival.tipMultiplier,2);assert(rival.tablePatienceTicks<base.tablePatienceTicks);assert.deepEqual(film.customerTypes,['influencer']);assert.equal(film.customers,base.customers);
});
test('rapid arrival demand waits outside a full line without deleting any requested customers',()=>{
  const layout=buildServiceLoadout(1,['classic_burger']);layout.tables=[makeTable('solo',3,5,1)];const k=new Kitchen(createService({...layout,menu:['classic_burger'],customers:12,arrivalTicks:20,maxWaitingCustomers:2,queuePatienceTicks:12000,tablePatienceTicks:12000}),0);k.send({type:'open'});k.tick(1200);
  assert.equal(k.maxQueue,2);assert.equal(k.s.spawned,3);assert.equal(k.s.config.customers,12);assert.equal(k.s.missed,0);assert.equal(k.s.strikes,0);
  const guest=k.s.customers.find(c=>c.phase==='seated')!;k.burger();k.touch(guest.tableId!,undefined,undefined,guest.seatId!);k.until(()=>k.s.spawned===4);assert.equal(k.s.config.customers,12);assert(k.maxQueue<=2);
});
test('old configs gain the queue bound while paused resume preserves food, timers, customers and earnings',()=>{
  const k=new Kitchen(tutorialThird(),0);k.send({type:'open'});k.until(()=>k.s.customers.some(c=>c.phase==='seated'));const guest=k.s.customers.find(c=>c.phase==='seated')!;k.burger();k.touch(guest.tableId!,undefined,undefined,guest.seatId!);k.until(()=>k.s.paid===1);assert(k.s.coins>0);k.ingredient('beef');k.touch('grill');k.tick(7);const before=structuredClone(k.s);delete (k.s.config as Partial<typeof k.s.config>).maxWaitingCustomers;
  normalizeServiceAdditions(k.s);assert.equal(k.s.config.maxWaitingCustomers,4);const restored=sanitizeService(k.s);assert(restored);assert.equal(restored.phase,'paused');stepService(restored,100);const resumed=dispatchService(restored,{type:'resume'});
  for(const key of ['tick','customers','chef','stations','tables','coins','served','paid','washed','nextArrival','rng'] as const)assert.deepEqual(resumed[key],before[key],key);assert.equal(resumed.config.maxWaitingCustomers,4);
});
test('slow-day arrival clocks average thirty seconds without an opening stall or catch-up burst',()=>{
  const gaps:number[]=[];
  for(let seed=0;seed<128;seed++){
    const s=dispatchService(createService({...buildServiceLoadout(1,['classic_burger']),...DIFFICULTIES.slow,seed:`slow-clock-${seed}`,menu:['classic_burger']}),{type:'open'});
    stepService(s,20);assert.equal(s.spawned,1,'first guest arrives within one second of opening');
    const gap=s.nextArrival;assert(gap>=24*20&&gap<=36*20,`unexpected slow-day gap ${gap/20}`);gaps.push(gap);
    stepService(s,Math.ceil(gap)-1);assert.equal(s.spawned,1,'no arrival before the scheduled gap');
    stepService(s,1);assert.equal(s.spawned,2,'second guest arrives when due');
  }
  const mean=gaps.reduce((sum,gap)=>sum+gap,0)/gaps.length/20;
  assert(mean>29&&mean<31,`slow-day mean ${mean}`);assert(new Set(gaps).size>60,'arrivals should vary across seeds');
  console.log(`  128 slow days: mean ${mean.toFixed(2)}s, range ${(Math.min(...gaps)/20).toFixed(2)}–${(Math.max(...gaps)/20).toFixed(2)}s.`);
});
test('real solo burger and washing loops complete normal and cosy slow days across seeds',()=>{
  const gaps:number[]=[];
  for(const cosy of [false,true])for(let seed=0;seed<8;seed++){
    const layout=buildServiceLoadout(1,['classic_burger']);layout.tables=[makeTable('solo',3,5,1)];
    const k=new Kitchen(createService({...layout,...DIFFICULTIES.slow,customers:8,menu:['classic_burger'],seed:`slow-workflow-${seed}`,cosy}),10);
    k.lunch();assert.equal(k.s.paid,8);assert.equal(k.s.missed,0);assert.equal(k.s.strikes,0);assert(k.s.washed>=7);assert(k.maxQueue<=1);
    for(let i=1;i<k.arrivals.length;i++){const gap=(k.arrivals[i]-k.arrivals[i-1])/20;assert(gap>=24,`bunched arrivals ${gap}s`);assert(gap<=38,`unnecessary idle gap ${gap}s`);gaps.push(gap);}
    assert(k.s.customers.every(c=>!c.servedCold),'ordinary burger service stays hot');
  }
  console.log(`  16 played slow days: ${128} guests served, no misses, mean gap ${(gaps.reduce((a,b)=>a+b,0)/gaps.length).toFixed(2)}s, longest ${Math.max(...gaps).toFixed(2)}s.`);
});
test('one dish prepared ahead stays warm for the longest slow-day gap; food still eventually cools',()=>{
  const k=new Kitchen(createService({...buildServiceLoadout(1,['classic_burger']),menu:['classic_burger']}),0);k.send({type:'prepare'});k.burger();
  const finished=k.s.chef.held!.finishedTick!;k.tick(36*20);assert.equal(k.s.chef.held!.cold,false);
  k.tick(SERVICE_RULES.coldTicks-(k.s.tick-finished));assert.equal(k.s.chef.held!.cold,true);
});
test('new pacing resumes identically and legacy saves retain the old arrival and cooling rules',()=>{
  const k=new Kitchen(tutorialThird(),0);k.send({type:'open'});k.until(()=>k.s.spawned===1);
  const saved=sanitizeService(k.s);assert(saved);const resumed=dispatchService(saved,{type:'resume'});stepService(k.s,777);stepService(resumed,777);assert.deepEqual(resumed,k.s);
  const old=createService({...buildServiceLoadout(1,['classic_burger']),menu:['classic_burger'],arrivalTicks:36*20});delete (old.config as Partial<typeof old.config>).pacingVersion;delete old.config.pacingProfile;delete old.arrivalSchedule;delete old.arrivalCursor;
  const legacy=sanitizeService(old);assert(legacy);assert.equal(legacy.config.pacingVersion,0);const open=dispatchService(legacy,{type:'open'});stepService(open,20);assert.equal(open.nextArrival,54*20);
  const legacyKitchen=new Kitchen(createService({...buildServiceLoadout(1,['classic_burger']),menu:['classic_burger'],pacingVersion:0}),0);legacyKitchen.send({type:'prepare'});legacyKitchen.burger();legacyKitchen.tick(SERVICE_RULES.legacyColdTicks);assert.equal(legacyKitchen.s.chef.held!.cold,true);
});
console.log(`Passed ${groups} service pacing checks.`);
