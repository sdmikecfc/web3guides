import assert from 'node:assert/strict';
import { createDinerEvent, dispatchDinerEvent, EVENT_DEFINITIONS, EVENT_RULES, eventServiceOptions, sanitizeDinerEvent, type DinerEvent, type EventAction, type EventKind } from '../src/lib/chef/diner/events';
import { activeDinerMode, createDiner, dinerTickCommand, dispatchDiner, generateDinerMap, sanitizeDinerSave, type DinerCommand, type DinerState } from '../src/lib/chef/diner/progression';
import { createDinerRecord, DinerAuthorityError, replayDiner, type DinerRecord } from '../src/lib/chef/diner/authority';
import { createRally, finishRally, rallyScore, rallyWeek, RALLY_RULES, startRally } from '../src/lib/chef/diner/rally';
import { RECIPE_BY_ID, ROUTES, ingredientSupply } from '../src/lib/chef/diner/content';
import { serviceMissingIngredients,serviceRecipeSteps } from '../src/lib/chef/diner/service';
import {recipeVessel,vesselSupplyStation} from '../src/lib/chef/diner/batch';
import { buildServiceLoadout, serviceGeometry } from '../src/lib/chef/diner/geometry';
import type { ServiceAction, ServiceState } from '../src/lib/chef/diner/types';

const now=Date.UTC(2026,8,21,8),context={haul:500,routeRecipeIds:['lemonade'],seed:'event-check'};
let groups=0;
function test(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function event(kind:EventKind){return createDinerEvent(`fixture:${kind}`,'event-check',kind);}
function eventAct(e:DinerEvent,a:EventAction){const result=dispatchDinerEvent(e,a,context);assert.equal(result.error,undefined,result.error);return result;}
function act(s:DinerState,c:DinerCommand){const r=dispatchDiner(s,c,{now});assert.equal(r.error,undefined,`${c.type}: ${r.error}`);return r.state;}
function eventState(kind:EventKind){let s=createDiner(now,'event-integration');s.tutorial.finished=true;s=act(s,{type:'startRun'});const n=s.run!.map.find(n=>n.kind==='event')!;assert(n);s.run!.available=[n.id];s=act(s,{type:'chooseNode',nodeId:n.id});s.run!.event=event(kind);return s;}

/** Runs only legal cooking inputs against the supplied real state machine. */
class Cook {
  constructor(readonly get:()=>ServiceState,readonly send:(action:ServiceAction)=>void){}
  tick(n=1){this.send({type:'tick',ticks:n});}
  until(predicate:()=>boolean,limit=2000){let ticks=0;while(!predicate()&&ticks++<limit&&['playing','closing'].includes(this.get().phase))this.tick();assert(predicate(),`Cooking timed out: ${this.get().notice}`);}
  touch(targetId:string,recipeId?:string,seatId?:string,ingredientId?:string){this.send({type:'interact',targetId,recipeId,seatId,ingredientId});this.until(()=>this.get().chef.path.length===0);}
  dish(recipeId:string){
    if(recipeId==='fries'&&this.get().config.batchVersion&&this.get().stations.some(st=>st.slots.some(slot=>slot.batch?.phase==='raised'))){this.touch('boxes');this.touch('fryer');return;}
    const physical=this.get().config.physicalSupplies,primary=RECIPE_BY_ID[recipeId].ingredients[0];this.touch(physical?ingredientSupply(primary):'crate',recipeId,undefined,physical?primary:undefined);assert.equal(this.get().chef.held?.recipeId,recipeId);
    for(const [index,step] of serviceRecipeSteps(this.get(),recipeId).entries()){
      const station=this.get().stations.find(s=>s.kind===step.station)!,missing=serviceMissingIngredients(this.get().chef.held!);this.touch(station.id);
      for(const ingredientId of missing){this.touch(ingredientSupply(ingredientId),recipeId,undefined,ingredientId);this.touch(station.id);}
      this.send({type:'hold',active:true});
      this.until(()=>this.get().stations.find(s=>s.id===station.id)!.slots.some(slot=>slot.job?.ready));
      this.send({type:'hold',active:false});if(physical&&index===serviceRecipeSteps(this.get(),recipeId).length-1){if(recipeId==='fries'&&this.get().config.batchVersion)this.touch(station.id);this.touch(this.get().config.batchVersion?vesselSupplyStation(recipeVessel(recipeId))!:'plates');}this.touch(station.id);assert.equal(this.get().chef.held?.step,index+1);
    }
  }
  wash(tableId:string,seatId:string){this.touch(tableId,undefined,seatId);if(!this.get().chef.held)return;assert.equal(this.get().chef.held?.kind,'dirty');this.touch('sink');this.send({type:'hold',active:true});this.until(()=>this.get().stations.find(s=>s.kind==='sink')!.slots.every(slot=>!slot.item));this.send({type:'hold',active:false});}
  run(allowMisses=false){this.send({type:'open'});let guard=0;
    while(['playing','closing'].includes(this.get().phase)&&guard++<1000){
      const s=this.get();if(s.served+s.missed>=s.config.customers){this.tick(20);continue;}
      const guest=s.customers.filter(c=>c.phase==='seated').sort((a,b)=>a.patience-b.patience)[0];
      if(guest&&s.tables.some(table=>table.seats.some(seat=>seat.customerId===guest.id&&seat.item?.kind==='dirty'))){this.wash(guest.tableId!,guest.seatId!);continue;}if(guest&&(!s.config.physicalSupplies||recipeVessel(guest.recipeId)==='fry_box'||(recipeVessel(guest.recipeId)==='cup'?s.cleanCups:s.cleanPlates)>0)){this.dish(guest.recipeId);this.touch(guest.tableId!,undefined,guest.seatId!);assert.equal(this.get().customers.find(c=>c.id===guest.id)?.phase,'eating',this.get().notice);continue;}
      const dirty=s.tables.flatMap(table=>table.seats.filter(seat=>seat.item?.kind==='dirty').map(seat=>({tableId:table.id,seatId:seat.id})))[0];
      if(dirty){this.wash(dirty.tableId,dirty.seatId);continue;}this.tick(10);
    }
    assert.equal(this.get().phase,'complete',this.get().notice);if(!allowMisses)assert.equal(this.get().missed,0);
  }
}

test('every new path has seven service rows and five nonservice rows; old maps remain reconstructible',()=>{
  const serviceRows=new Set([0,1,3,5,7,9,11]);
  for(let seed=0;seed<100;seed++)for(const node of generateDinerMap(`map-${seed}`)){
    assert.equal(['slow','medium','busy','special','finale'].includes(node.kind),serviceRows.has(node.row));
    for(const next of node.next)assert.equal(Number(next.match(/^r(\d+)/)![1]),node.row+1);
  }
  const legacy=generateDinerMap('legacy',1);assert(legacy.filter(n=>n.row===3).every(n=>n.kind==='shop'));
  let s=act(createDiner(now),{type:'startRun'});assert.equal(s.run!.mapVersion,2);assert(sanitizeDinerSave(s));
});
test('all seven roadside events have distinct valid outcomes and cannot replay their resolution',()=>{
  assert.equal(EVENT_DEFINITIONS.length,7);
  const festival=eventAct(event('street_festival'),{type:'choice',choiceId:'join'});assert.equal(eventServiceOptions(festival.outcome!.nextService).tipMultiplier,2);assert(eventServiceOptions(festival.outcome!.nextService).customers!>8);
  const rain=eventAct(event('rainstorm'),{type:'choice',choiceId:'serve'});assert.equal(eventServiceOptions(rain.outcome!.nextService).customers,6);
  assert.equal(eventAct(event('rainstorm'),{type:'choice',choiceId:'wait'}).outcome!.skipRows,1);
  assert.equal(eventAct(event('rival_truck'),{type:'choice',choiceId:'challenge'}).outcome!.nextService!.kind,'rival');
  assert.deepEqual(eventServiceOptions(eventAct(event('film_crew'),{type:'choice',choiceId:'film'}).outcome!.nextService).customerTypes,['influencer']);
  assert(['jo','bea','gus'].includes(eventAct(event('lost_tourist'),{type:'choice',choiceId:'directions'}).outcome!.recruitId!));
  assert.equal(eventAct(event('flat_tyre'),{type:'choice',choiceId:'pay'}).outcome!.haulDelta,-200);
  assert(dispatchDinerEvent(festival.event,{type:'choice',choiceId:'join'},context).error);
  assert(dispatchDinerEvent(event('flat_tyre'),{type:'choice',choiceId:'pay'},{...context,haul:199}).error);
});
test('inspection requires three actual timed holds, freezes on pause and rewards only once',()=>{
  let e=eventAct(event('health_inspector'),{type:'choice',choiceId:'clean'}).event;
  e=eventAct(e,{type:'clean',targetId:e.tasks[0].id,active:true}).event;e=eventAct(e,{type:'tick',ticks:30}).event;
  e=eventAct(e,{type:'pause'}).event;assert.equal(e.heldTarget,null);assert(dispatchDinerEvent(e,{type:'tick',ticks:30},context).error);
  e=eventAct(e,{type:'resume'}).event;e=eventAct(e,{type:'tick',ticks:20}).event;assert.equal(e.tasks[0].progress,30);
  let outcome;for(const task of e.tasks){e=eventAct(e,{type:'clean',targetId:task.id,active:true}).event;const result=eventAct(e,{type:'tick',ticks:task.required-task.progress});e=result.event;outcome=result.outcome??outcome;}
  assert.equal(e.phase,'resolved');assert.equal(outcome!.haulDelta,80);assert.equal(outcome!.strikes,0);assert(dispatchDinerEvent(e,{type:'tick',ticks:1},context).error);
  const active=eventAct(event('health_inspector'),{type:'choice',choiceId:'clean'}).event;assert.equal(sanitizeDinerEvent(active)!.phase,'paused');
  let timeout=active;for(let i=0;i<3;i++)timeout=eventAct(timeout,{type:'tick',ticks:100}).event;assert.equal(eventAct(timeout,{type:'tick',ticks:100}).outcome!.strikes,1);
});
test('tyre repair enforces green timing, one press per revolution, deadline and server clock',()=>{
  let e=eventAct(event('flat_tyre'),{type:'choice',choiceId:'repair'}).event;
  e=eventAct(e,{type:'tick',ticks:18}).event;e=eventAct(e,{type:'tap'}).event;assert.equal(e.hits,1);assert(dispatchDinerEvent(e,{type:'tap'},context).error);
  e=eventAct(e,{type:'tick',ticks:60}).event;e=eventAct(e,{type:'tap'}).event;e=eventAct(e,{type:'tick',ticks:60}).event;
  const done=eventAct(e,{type:'tap'});assert.equal(done.event.hits,3);assert.equal(done.outcome!.strikes,0);
  let missed=eventAct(event('flat_tyre'),{type:'choice',choiceId:'repair'}).event;missed=eventAct(missed,{type:'tap'}).event;missed=eventAct(missed,{type:'tick',ticks:60}).event;assert.equal(eventAct(missed,{type:'tap'}).outcome!.strikes,1);
  const record=createDinerRecord(now,'event-clock');record.state=eventState('flat_tyre');
  let started=replayDiner(record,[{type:'eventChoice',choiceId:'repair'}],now).record;
  assert.throws(()=>replayDiner(started,[{type:'eventInput',action:{type:'tick',ticks:18}}],now),e=>e instanceof DinerAuthorityError&&e.code==='time_credit');
  started=replayDiner(started,[{type:'eventInput',action:{type:'tick',ticks:18}},{type:'eventInput',action:{type:'tap'}}],now+900).record;assert.equal(started.state.run!.event!.hits,1);
  const paused=replayDiner(started,[{type:'eventInput',action:{type:'tick',ticks:1}}],now+10000);assert(paused.interrupted);assert.equal(paused.record.state.run!.event!.phase,'paused');
});
test('event progression applies service modifiers, recruits and skip choice without duplicate rewards',()=>{
  let s=eventState('street_festival');s=act(s,{type:'eventChoice',choiceId:'join'});assert.equal(s.run!.position,null);assert.equal(s.run!.nextService!.kind,'festival');
  s=act(s,{type:'chooseNode',nodeId:s.run!.available[0]});assert.equal(s.run!.service!.config.tipMultiplier,2);assert.equal(s.run!.nextService,null);
  const stranger=eventState('lost_tourist'),before=stranger.staffMembers.length;const friend=act(stranger,{type:'eventChoice',choiceId:'directions'});assert.equal(friend.staffMembers.length,before+1);assert(dispatchDiner(friend,{type:'eventChoice',choiceId:'directions'},{now}).error);
  let rain=eventState('rainstorm');const nextRow=rain.run!.map.find(n=>n.id===rain.run!.position)!.row+2;rain=act(rain,{type:'eventChoice',choiceId:'wait'});assert(rain.run!.available.every(id=>rain.run!.map.find(n=>n.id===id)!.row===nextRow));assert.equal(rain.run!.haul,0);
  assert(dispatchDiner(eventState('flat_tyre'),{type:'eventInput',action:{type:'tick',ticks:100,haul:99}} as any,{now}).error);
});
test('rally snapshot is fixed, separate from permanent progression and uses real input completion',()=>{
  let s=createDiner(now,'rally-one'),rich=createDiner(now,'rally-two');rich.coins=999999;rich.recipes.classic_burger.level=10;rich.equipment.grill.tier=3;rich.truckTier=4;
  s=act(s,{type:'startRally'});rich=act(rich,{type:'startRally'});assert.deepEqual(s.rally.service,rich.rally.service);assert.equal(s.rally.service!.config.practice,true);
  const before={coins:s.coins,pantry:structuredClone(s.pantry),runs:s.runsStarted};new Cook(()=>s.rally.service!,action=>{s=act(s,{type:'rallyService',action});}).run();
  const score=rallyScore(s.rally.service!);assert(score>500);s=act(s,{type:'finishRally'});assert.equal(s.rally.bestScore,score);assert.equal(s.coins,before.coins);assert.deepEqual(s.pantry,before.pantry);assert.equal(s.runsStarted,before.runs);assert.equal(s.collections.trophies.filter(id=>id.startsWith('rally:')).length,1);
  assert(dispatchDiner(s,{type:'finishRally'},{now}).error);s=act(s,{type:'startRally'});s=act(s,{type:'endRally'});assert.equal(s.rally.bestScore,score);assert.equal(s.rally.service,null);
  const next=startRally(s.rally,now+RALLY_RULES.weekMs);assert.notEqual(next.weekId,s.rally.weekId);assert.equal(next.bestScore,0);assert.notEqual(next.seed,s.rally.seed);
});
test('rally clock uses server elapsed and cannot borrow time from ordinary cooking',()=>{
  let r=createDinerRecord(now,'rally-clock');r=replayDiner(r,[{type:'startRally'},{type:'rallyService',action:{type:'open'}}],now).record;
  assert.equal(activeDinerMode(r.state),'rallyService');assert.equal(dinerTickCommand(r.state,1)!.type,'rallyService');
  assert.throws(()=>replayDiner(r,[{type:'service',action:{type:'tick',ticks:1}}],now+50),e=>e instanceof DinerAuthorityError&&e.code==='time_credit');
  r=replayDiner(r,[{type:'rallyService',action:{type:'tick',ticks:20}}],now+1000).record;assert.equal(r.state.rally.service!.tick,20);
  assert.equal(replayDiner(r,[{type:'rallyService',action:{type:'tick',ticks:1}}],now+10000).record.state.rally.service!.phase,'paused');
});
test('first tutorial waits patiently for the first burger and its dirty-plate wash',()=>{
  let s=createDiner(now,'patient-intro');s=act(s,{type:'setupLayout',stations:[...s.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:s.truckConfig.tables});s=act(s,{type:'startRun'});s=act(s,{type:'chooseNode',nodeId:s.run!.available[0]});s=act(s,{type:'service',action:{type:'open'}});
  for(let i=0;i<100;i++)s=act(s,{type:'service',action:{type:'tick',ticks:100}});
  assert.equal(s.run!.service!.strikes,0);assert.equal(s.run!.service!.missed,0);assert.deepEqual(s.run!.service!.customers.map(c=>c.recipeId),['classic_burger']);
  for(const customer of s.run!.service!.customers)assert.equal(customer.patience,customer.phase==='seated'?customer.maxPatience:customer.queuePatience);
  assert(sanitizeDinerSave(s));
});
test('qualified trip ingredients arrive even when every stop chose coins; cap remains two',()=>{
  let s=createDiner(now,'qualifying');s.tutorial.finished=true;
  for(let i=0;i<3;i++){s=act(s,{type:'startRun'});s.run!.qualified=true;s.run!.haul=100;s=act(s,{type:'goHome'});assert.equal(s.lastRun!.banked,100);}
  assert.equal(s.daily.truckRuns.length,2);assert.equal(s.daily.minted,2);assert.equal(Object.values(s.pantry).reduce((a,b)=>a+b,0),2);
});

test('all three cosy route finales complete through legal paths, physical boxed batches, clearing and stop choices',()=>{
  for(const route of ROUTES){
    // Returning-player fixtures own preceding routes and tier-two kitchen tools; never service results.
    let s=createDiner(now,`route-proof-${route.id}`);s=act(s,{type:'settings',cosy:true});s.tutorial.finished=true;s.truckTier=route.tier;s.restaurantLevel=5;s.recipes.fries={level:0};s.equipment.boxes={tier:1,truckOwned:true,homeCopies:0};for(const id of ['grill','prep','sink','fryer']){s.equipment[id].tier=2;s.equipment[id].truckOwned=true;}
    for(const earlier of ROUTES.filter(r=>r.tier<route.tier)){s.collections.routeWins.push(earlier.id);for(const id of earlier.recipeIds)s.recipes[id]={level:0};}
    s=act(s,{type:'buyTruckTable',capacity:2});s=act(s,{type:'setTruckMenu',recipeIds:['fries']});
    const compact=buildServiceLoadout(s.truckTier,['fries'],{fryer:2,sink:2});
    s=act(s,{type:'setupLayout',stations:compact.stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing})),tables:[{id:'table_1',x:0,y:serviceGeometry(s.truckTier).pavement.y+1,capacity:2,rotation:0}]});
    s=act(s,{type:'startRun',routeId:route.id});
    let serviced=0,stops=0,paid=0,washed=0,cleared=0,ticks=0;
    while(s.run){
      const nodes=s.run.map.filter(node=>s.run!.available.includes(node.id));
      const preference=['slow','medium','special','busy','finale','bonus','ingredients','shop','event'];
      const node=nodes.sort((a,b)=>preference.indexOf(a.kind)-preference.indexOf(b.kind)||a.id.localeCompare(b.id))[0];assert(node,'Route has a reachable next stop');
      s=act(s,{type:'chooseNode',nodeId:node.id});
      if(s.run!.service){
        const cook=new Cook(()=>{assert(s.run?.service,`${route.id}: run ended during service ${serviced}`);return s.run.service;},action=>{s=act(s,{type:'service',action});});cook.run(true);
        serviced++;cleared+=s.run!.service!.paid-s.run!.service!.tables.flatMap(table=>table.seats).filter(seat=>seat.status==='dirty').length;paid+=s.run!.service!.paid;washed+=s.run!.service!.washed;ticks+=s.run!.service!.tick;s=act(s,{type:'finishService'});
      }else if(node.kind==='shop'){
        const offer=s.run!.offers.find(o=>o.kind==='recipe'&&o.price<=s.run!.haul);if(offer)s=act(s,{type:'buyOffer',offerId:offer.id});s=act(s,{type:'leaveNode'});stops++;
      }else if(node.kind==='event'){
        const choices:Record<EventKind,string>={street_festival:'pass',rainstorm:'serve',health_inspector:'clean',flat_tyre:'repair',rival_truck:'avoid',film_crew:'decline',lost_tourist:'directions'};
        const kind=s.run!.event!.kind;s=act(s,{type:'eventChoice',choiceId:choices[kind]});
        if(kind==='health_inspector')for(const target of [...s.run!.event!.tasks]){s=act(s,{type:'eventInput',action:{type:'clean',targetId:target.id,active:true}});s=act(s,{type:'eventInput',action:{type:'tick',ticks:60}});}
        if(kind==='flat_tyre')for(let i=0;i<3;i++){s=act(s,{type:'eventInput',action:{type:'tick',ticks:i===0?18:60}});s=act(s,{type:'eventInput',action:{type:'tap'}});}
        stops++;
      }else {s=act(s,{type:'chooseGift',choice:'coins'});stops++;}
    }
    assert.equal(s.lastRun!.reason,'won',route.id);assert.equal(serviced,7);assert.equal(stops,5);assert(s.collections.routeWins.includes(route.id));assert(paid>70);assert.equal(washed,0);assert(cleared>50);
    console.log(`  ${route.name}: ${serviced} services, ${stops} stops, ${paid} real meals, ${cleared} cleared cartons, ${(ticks/1200).toFixed(1)} simulated minutes`);
  }
});

console.log(`PASS ${groups} diner event/rally groups`);
export { Cook };
