import assert from 'node:assert/strict';
import {createDiner,dispatchDiner} from '../src/lib/chef/diner/progression';
import {createService,dispatchService,sanitizeService,stepService} from '../src/lib/chef/diner/service';
import {protectedLesson,serviceSchedule} from '../src/lib/chef/diner/service-schedule';
import {buildServiceLoadout,makeTable} from '../src/lib/chef/diner/geometry';
import {earlyServicePacing} from '../src/lib/chef/diner/service-pacing';
import {Kitchen} from './dk-diner-reference-kitchen';

const layout=buildServiceLoadout(1,['classic_burger']);layout.tables=[makeTable('table_1',3,5,1)];
const k=new Kitchen(createService({...layout,menu:['classic_burger'],customers:4,tutorialLearning:true,...earlyServicePacing({routeId:'downtown',serviceDays:0,tutorial:true,kind:'slow'})}),0);
function reload(){const saved=sanitizeService(k.s);assert(saved,'valid lesson checkpoint');k.s=saved.phase==='paused'?dispatchService(saved,{type:'resume'}):saved;}
k.send({type:'open'});k.until(()=>k.s.customers[0]?.phase==='seated');reload();
assert.equal(k.s.customers[0].regularId,'old_pete');
const patience=k.s.customers[0].patience;k.tick(4000);assert.equal(k.s.customers[0].patience,patience);assert.equal(k.s.spawned,1);
k.ingredient('beef');reload();k.touch('grill');k.tick(3000);assert.equal(k.s.burnt,0);reload();
k.touch('grill');k.touch('prep');reload();k.ingredient('bun');k.touch('prep');k.send({type:'hold',active:true});k.until(()=>!!k.s.stations.find(s=>s.kind==='prep')!.slots[0].job?.ready);k.send({type:'hold',active:false});reload();
k.touch('plates');k.touch('prep');reload();const pete=k.s.customers[0];k.touch(pete.tableId!,undefined,undefined,pete.seatId!);reload();
k.until(()=>k.s.tables.some(t=>t.seats.some(s=>s.item?.kind==='dirty')));assert(protectedLesson(k.s));
k.touch(pete.tableId!,undefined,undefined,pete.seatId!);reload();assert(protectedLesson(k.s));k.wash();k.tick();reload();assert.equal(k.s.lessonStatus,'complete');
k.until(()=>k.s.spawned>1);const guest=k.s.customers[1];const before=guest.patience;k.tick(20);assert(k.s.customers[1].patience<before||k.s.customers[1].phase==='walking');
k.ingredient('beef');k.touch('grill');k.tick(1000);assert.equal(k.s.burnt,1,'burning resumes after lesson');
console.log('PASS protected order, physical serve/wash completion, reload at every step, then normal timers');

const now=Date.UTC(2026,8,23);let state=createDiner(now,'lesson-replay');let result=dispatchDiner(state,{type:'replayLesson'},{now});assert.equal(result.error,undefined);state=result.state;
const practice=new Kitchen(state.run!.service!,0);practice.send({type:'open'});practice.until(()=>practice.s.customers.some(c=>c.phase==='seated'));practice.burger();const g=practice.s.customers[0];practice.touch(g.tableId!,undefined,undefined,g.seatId!);practice.until(()=>practice.s.customers[0].phase==='gone');assert.notEqual(practice.s.phase,'complete','must wash after Pete leaves');practice.touch(g.tableId!,undefined,undefined,g.seatId!);practice.wash();practice.tick();assert.equal(practice.s.phase,'complete');
state.run!.service=practice.s;const ownership=JSON.stringify({coins:state.coins,pantry:state.pantry,career:state.career,onboarding:state.onboarding});result=dispatchDiner(state,{type:'finishService'},{now});assert.equal(result.error,undefined);state=result.state;assert.equal(JSON.stringify({coins:state.coins,pantry:state.pantry,career:state.career,onboarding:state.onboarding}),ownership);
const skipped=dispatchService(createService({...layout,tutorialLearning:true}),{type:'skipLesson'});assert.equal(skipped.lessonStatus,'skipped');assert(!protectedLesson(skipped));
console.log('PASS reward-free replay and explicit skip');

for(const day of [0,1,2]){
  let cleared=0,pressure=0,preparedCleared=0,reactiveWaiting=0,preparedWaiting=0;
  for(let seed=0;seed<100;seed++){
    const config={...layout,menu:['classic_burger'],seed:`first-shift-${day}-${seed}`,...earlyServicePacing({routeId:'downtown',serviceDays:day,tutorial:true,kind:'medium'})};
    const s=createService(config),schedule=serviceSchedule(s.config);assert.deepEqual(s.arrivalSchedule,schedule);
    const bot=new Kitchen(s,20);bot.lunch();if(bot.s.paid===s.config.customers&&!bot.s.missed)cleared++;pressure+=bot.maxQueue;reactiveWaiting+=bot.queueTicks;const prepped=new Kitchen(createService(config),20);prepped.lunch(true);if(prepped.s.paid===s.config.customers&&!prepped.s.missed)preparedCleared++;preparedWaiting+=prepped.queueTicks;
  }
  assert(preparedCleared>=95);assert(preparedWaiting<reactiveWaiting*.95,'Preparation must measurably reduce queue pressure');console.log(`  Prepared ${preparedCleared}/100, waiting reduced by ${(100*(1-preparedWaiting/reactiveWaiting)).toFixed(1)}%`);
  assert(cleared>=95,`day ${day+1}: only ${cleared}/100 clears`);console.log(`PASS service ${day+1}: ${cleared}/100 seeds cleared with one-second decisions, mean peak queue ${(pressure/100).toFixed(2)}`);
}
