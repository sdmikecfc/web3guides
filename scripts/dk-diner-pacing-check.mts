import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,type DinerCommand,type DinerState} from '../src/lib/chef/diner/progression';
import {buildServiceLoadout,makeTable} from '../src/lib/chef/diner/geometry';
import {createService,dispatchService,normalizeServiceAdditions,sanitizeService,stepService} from '../src/lib/chef/diner/service';
import {earlyServicePacing} from '../src/lib/chef/diner/service-pacing';
import type {NextServiceEffect} from '../src/lib/chef/diner/events';
import {ingredientSupply} from '../src/lib/chef/diner/content';
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
class Kitchen{
  maxQueue=0;decisions=0;
  constructor(public s:ServiceState,readonly decisionTicks=20){}
  tick(ticks=1){for(let i=0;i<ticks;i++){stepService(this.s);this.maxQueue=Math.max(this.maxQueue,this.s.customers.filter(c=>c.phase==='queue').length);}}
  send(action:ServiceAction){if(['interact','hold','move'].includes(action.type)){this.tick(this.decisionTicks);this.decisions++;}this.s=dispatchService(this.s,action);}
  until(done:()=>boolean,max=6000){let ticks=0;while(!done()&&ticks++<max&&['preparing','playing','closing'].includes(this.s.phase))this.tick();assert(done(),`Timed out at ${this.s.tick}: ${this.s.notice}`);}
  touch(targetId:string,ingredientId?:string,recipeId?:string,seatId?:string){this.send({type:'interact',targetId,ingredientId,recipeId,seatId});this.until(()=>!this.s.chef.path.length);}
  ingredient(id:string){this.touch(ingredientSupply(id),id,'classic_burger');}
  burger(){this.ingredient('beef');this.touch('grill');this.until(()=>!!this.s.stations.find(st=>st.kind==='grill')!.slots[0].job?.ready);this.touch('grill');this.touch('prep');this.ingredient('bun');this.touch('prep');this.send({type:'hold',active:true});this.until(()=>!!this.s.stations.find(st=>st.kind==='prep')!.slots[0].job?.ready);this.send({type:'hold',active:false});this.touch('plates');this.touch('prep');assert.equal(this.s.chef.held?.kind,'dish');}
  wash(){this.touch('sink');this.send({type:'hold',active:true});this.until(()=>this.s.stations.find(st=>st.kind==='sink')!.slots.every(slot=>!slot.item));this.send({type:'hold',active:false});}
  lunch(){
    this.send({type:'prepare'});this.send({type:'open'});let decisions=0;
    while(['playing','closing'].includes(this.s.phase)&&decisions++<100){
      const dirty=this.s.tables.flatMap(table=>table.seats.filter(seat=>seat.item?.kind==='dirty').map(seat=>({table,seat})))[0];
      if(dirty){this.touch(dirty.table.id,undefined,undefined,dirty.seat.id);assert.equal(this.s.chef.held?.kind,'dirty');this.wash();continue;}
      const guest=this.s.customers.find(c=>c.phase==='seated');
      if(guest){this.burger();this.touch(guest.tableId!,undefined,undefined,guest.seatId!);assert.equal(this.s.customers.find(c=>c.id===guest.id)!.phase,'eating',this.s.notice);continue;}
      this.until(()=>!['playing','closing'].includes(this.s.phase)||this.s.customers.some(c=>c.phase==='seated')||this.s.tables.some(t=>t.seats.some(seat=>seat.item?.kind==='dirty')));
    }
    assert.equal(this.s.phase,'complete',this.s.notice);
  }
}

test('actual third tutorial node creates eight guests with a 32-second gap and one waiting place',()=>{
  const service=tutorialThird();assert.equal(service.config.customers,8);assert.equal(service.config.arrivalTicks,640);assert.equal(service.config.maxWaitingCustomers,1);assert.equal(service.config.tutorialLearning,false);assert.equal(service.config.tutorialFailure,false);assert.deepEqual(service.config.menu,['classic_burger']);assert.equal(service.tables.reduce((n,t)=>n+t.capacity,0),1);assert.equal(service.helpers.length,0);assert(service.stations.every(st=>st.tier===1));
});
test('one chair and base equipment finish the first rush with real burgers, manual washing and one-second decisions',()=>{
  const k=new Kitchen(tutorialThird());k.lunch();assert.equal(k.s.served,8);assert.equal(k.s.paid,8);assert.equal(k.s.strikes,0);assert.equal(k.s.missed,0);assert.equal(k.s.burnt,0);assert(k.s.washed>=7);assert(k.maxQueue<=1);assert.equal(k.s.spawned,8);assert(k.decisions>=100);
  console.log(`  First rush: ${(k.s.tick/1200).toFixed(2)} minutes, ${k.s.served} served, ${k.s.washed} washed, ${k.s.strikes} strikes, max queue ${k.maxQueue}, ${k.decisions} one-second decisions.`);
});
test('later opening-trip and repeat-route services increase pressure without reusing the opening rush profile',()=>{
  const third=earlyServicePacing({routeId:'downtown',serviceDays:2,tutorial:true,kind:'busy'}),repeat=earlyServicePacing({routeId:'downtown',serviceDays:2,tutorial:false,kind:'busy'}),fourth=earlyServicePacing({routeId:'downtown',serviceDays:3,tutorial:true,kind:'busy'});
  assert(repeat.customers!>third.customers!);assert(repeat.arrivalTicks!<third.arrivalTicks!);assert(fourth.customers!>repeat.customers!);assert(fourth.arrivalTicks!<repeat.arrivalTicks!);assert.equal(repeat.maxWaitingCustomers,2);assert.equal(fourth.maxWaitingCustomers,2);
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
console.log(`Passed ${groups} service pacing checks.`);
