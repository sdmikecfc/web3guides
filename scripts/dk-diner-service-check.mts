import assert from 'node:assert/strict';
import { CONTENT_VERSION, EQUIPMENT_BY_ID, INGREDIENTS, RECIPES, RECIPE_BY_ID, ROUTES, SERVICE_RULES, TRUCK_TIERS, recipePrice } from '../src/lib/chef/diner/content';
import { buildServiceLoadout, isAtStationAccess, makeStation, makeTable, serviceGeometry, servicePath, starterStations, starterTables, stationFootprint, stationWorkingCell, tableFootprint, validateServiceLayout } from '../src/lib/chef/diner/geometry';
import { createService, dispatchService, sanitizeService, serviceReadyError, serviceResult, serviceRecipeSteps, serviceTargetIntent, stepService } from '../src/lib/chef/diner/service';
import type { CreateServiceOptions, ServiceAction, ServiceState } from '../src/lib/chef/diner/types';

let groups=0;
function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
class Driver {
  s:ServiceState;
  constructor(options:CreateServiceOptions={}){this.s=dispatchService(createService({physicalSupplies:false,stations:starterStations(options.tier??1).filter(st=>!['fridge','plates'].includes(st.kind)),...options}),{type:'open'});assert.equal(this.s.phase,'playing',this.s.notice);}
  act(action:ServiceAction){this.s=dispatchService(this.s,action);}
  tick(n=1){stepService(this.s,n);}
  until(done:()=>boolean,limit=12000){let n=0;while(!done()&&n++<limit&&['playing','closing'].includes(this.s.phase))this.tick();assert(done(),`Timed out at ${this.s.tick}: ${this.s.notice}`);}
  interact(targetId:string,recipeId?:string,seatId?:string){this.act({type:'interact',targetId,recipeId,seatId});this.until(()=>this.s.chef.path.length===0,1000);}
  cook(recipeId:string){
    this.interact('crate',recipeId);assert.equal(this.s.chef.held?.recipeId,recipeId);
    for(let i=0;i<serviceRecipeSteps(this.s,recipeId).length;i++){
      const definition=serviceRecipeSteps(this.s,recipeId)[i],station=this.s.stations.find(st=>st.kind===definition.station)!;
      assert(station,definition.station);this.interact(station.id);
      const itemId=station.id;this.act({type:'hold',active:true});
      this.until(()=>!!this.s.stations.find(st=>st.id===itemId)?.slots.some(slot=>slot.job?.ready),1000);
      this.act({type:'hold',active:false});if(definition.station==='boiler')this.interact(station.id);this.interact(station.id);
      assert.equal(this.s.chef.held?.step,i+1,`${recipeId} step ${i}`);
      assert.notEqual(this.s.chef.held?.kind,'burnt');
    }
    assert.equal(this.s.chef.held?.kind,'dish');
  }
  wash(tableId:string,seatId:string){
    this.interact(tableId,undefined,seatId);assert.equal(this.s.chef.held?.kind,'dirty');this.interact('sink');this.act({type:'hold',active:true});
    this.until(()=>this.s.stations.find(st=>st.kind==='sink')!.slots.every(slot=>!slot.item),1000);this.act({type:'hold',active:false});
  }
  serve(customerId:string){const customer=this.s.customers.find(c=>c.id===customerId)!;this.cook(customer.recipeId);this.interact(customer.tableId!,undefined,customer.seatId!);assert.equal(this.s.customers.find(c=>c.id===customerId)?.phase,'eating',this.s.notice);}
  run(){let decisions=0;while(['playing','closing'].includes(this.s.phase)&&decisions++<200){
    if(this.s.served+this.s.missed>=this.s.config.customers){this.tick(20);continue;}
    const seated=this.s.customers.filter(c=>c.phase==='seated').sort((a,b)=>a.patience-b.patience)[0];
    if(seated){const dirtySeat=this.s.tables.find(table=>table.id===seated.tableId)?.seats.find(seat=>seat.id===seated.seatId&&seat.item?.kind==='dirty');if(dirtySeat){this.wash(seated.tableId!,seated.seatId!);continue;}this.serve(seated.id);continue;}
    const dirty=this.s.tables.flatMap(t=>t.seats.filter(seat=>seat.item?.kind==='dirty').map(seat=>({tableId:t.id,seatId:seat.id})))[0];
    if(dirty){this.wash(dirty.tableId,dirty.seatId);continue;}
    this.tick(20);
  }assert.equal(this.s.phase,'complete',`Bot did not finish: ${this.s.notice}`);}
}

check('complete versioned diner catalog and reachable geometry at four truck sizes',()=>{
  assert.equal(CONTENT_VERSION,1);assert.equal(INGREDIENTS.length,33);assert.equal(RECIPES.length,24);assert.equal(ROUTES.length,3);
  assert.equal(new Set(RECIPES.map(r=>r.id)).size,24);
  for(const recipe of RECIPES){assert(recipe.ingredients.every(id=>INGREDIENTS.some(i=>i.id===id)));assert(recipe.steps.every(step=>EQUIPMENT_BY_ID[step.station]&&step.ticks>=0));assert(recipePrice(recipe.id,10)>recipe.basePrice);}
  for(const tier of [1,2,3,4] as const){const stations=starterStations(tier),tables=starterTables(tier),g=serviceGeometry(tier);assert.equal(validateServiceLayout(tier,stations,tables),null);assert(servicePath(tier,stations,tables,g.door,g.queue));assert.equal(tables.length,TRUCK_TIERS[tier].tables);}
  const same=starterStations();same.find(s=>s.kind==='grill')!.x=0;assert(validateServiceLayout(1,same,starterTables()));
  const doorBlocked=starterStations();doorBlocked.push(makeStation('extra','coffee',1,2));assert(validateServiceLayout(1,doorBlocked,starterTables()));
  assert.equal(buildServiceLoadout(1,['classic_burger','fries','lemonade','coffee']).error,null,'the wider shell accommodates saved larger menus; progression limits new menu selections');
});
check('actual input bot retains legacy eight-customer burger/fries service deterministically',()=>{
  const a=new Driver({seed:'full-service'});a.run();const b=new Driver({seed:'full-service'});b.run();
  assert.deepEqual(a.s,b.s);assert.equal(a.s.served,8);assert.equal(a.s.paid,8);assert.equal(a.s.strikes,0);assert(a.s.washed>=6);assert(a.s.coins>0);assert.equal(a.s.spawned,8);
  console.log(`  eight customers, ${a.s.coins} haul coins, ${(a.s.tick/20).toFixed(1)} seconds, ${a.s.washed} washed plates`);
});
check('keyboard interruption preserves physical movement, avoids backtracking, and centers before turns',()=>{
  const d=new Driver({seed:'keyboard',customers:1});Object.assign(d.s.stations.find(st=>st.kind==='bin')!,{x:3,y:2});d.act({type:'move',x:1,y:5});d.tick(3);
  assert(Math.abs(d.s.chef.y-2.48)<1e-9);const first={x:d.s.chef.x,y:d.s.chef.y};
  d.act({type:'move',x:1,y:3});assert.equal(d.s.chef.y,first.y,'input alone must not teleport');d.tick();assert(d.s.chef.y>first.y,'same-direction key must not briefly walk backwards');
  const beforeReverse=d.s.chef.y;d.act({type:'move',x:1,y:2});assert.equal(d.s.chef.y,beforeReverse);d.tick();assert(d.s.chef.y<beforeReverse,'opposite key reverses within the current clear corridor');
  d.act({type:'move',x:2,y:2});const beforeTurn={x:d.s.chef.x,y:d.s.chef.y};d.tick();assert.equal(d.s.chef.x,beforeTurn.x,'a turn centers on the corridor instead of cutting the corner');assert(d.s.chef.y<beforeTurn.y);
  let guard=0;while(d.s.chef.path.length&&guard++<100){const p={x:d.s.chef.x,y:d.s.chef.y};d.tick();assert(Math.hypot(d.s.chef.x-p.x,d.s.chef.y-p.y)<=SERVICE_RULES.chefSpeed/20+1e-8);assert(servicePath(1,d.s.stations,d.s.tables,d.s.chef,d.s.chef.path.at(-1)??{x:2,y:2}));}
  assert.deepEqual({x:d.s.chef.x,y:d.s.chef.y},{x:2,y:2});assert(sanitizeService(d.s));
  // UI initial-key cancellation is a normal move to the rounded current cell,
  // followed by the desired neighbor. A blocked neighbor cannot revive a click target.
  d.act({type:'interact',targetId:'crate',recipeId:'classic_burger'});d.tick();const rounded={x:Math.round(d.s.chef.x),y:Math.round(d.s.chef.y)};d.act({type:'move',...rounded});d.act({type:'move',x:3,y:2});
  assert.equal(d.s.chef.targetId,null);d.until(()=>d.s.chef.path.length===0);assert.deepEqual({x:d.s.chef.x,y:d.s.chef.y},rounded);assert.equal(d.s.chef.held,null);
});
check('all 24 recipes execute their real ordered station chains and yield one matching plated item',()=>{
  for(const recipe of RECIPES){const layout=buildServiceLoadout(1,[recipe.id]);assert.equal(layout.error,null,recipe.id);const d=new Driver({seed:recipe.id,menu:[recipe.id],customers:1,arrivalTicks:2000,queuePatienceTicks:12000,tablePatienceTicks:12000,...layout});d.cook(recipe.id);assert.equal(d.s.chef.held?.stage,`plated_${recipe.id}`);}
});
check('hold work stops on release, timed jobs keep cooking, pause/reload preserves exact state',()=>{
  const d=new Driver({seed:'hold',menu:['classic_burger'],customers:2});d.interact('crate','classic_burger');d.interact('grill');d.tick(120);d.interact('grill');d.interact('prep');
  const before=d.s.stations.find(st=>st.kind==='prep')!.slots[0].job!.remaining;d.tick(20);assert.equal(d.s.stations.find(st=>st.kind==='prep')!.slots[0].job!.remaining,before);
  d.act({type:'hold',active:true});d.tick(10);d.act({type:'hold',active:false});const stopped=d.s.stations.find(st=>st.kind==='prep')!.slots[0].job!.remaining;assert(stopped<before);d.tick(5);assert.equal(d.s.stations.find(st=>st.kind==='prep')!.slots[0].job!.remaining,stopped);
  d.act({type:'pause'});const paused=JSON.stringify(d.s);stepService(d.s,100);assert.equal(JSON.stringify(d.s),paused);
  const reload=JSON.parse(paused);let a=dispatchService(d.s,{type:'resume'}),b=dispatchService(reload,{type:'resume'});a=dispatchService(a,{type:'hold',active:true});b=dispatchService(b,{type:'hold',active:true});stepService(a,30);stepService(b,30);assert.deepEqual(a,b);
});
check('risk cooking burns unattended food and cold dishes earn base price without tips or combo',()=>{
  const burnt=new Driver({menu:['classic_burger'],customers:1,tablePatienceTicks:12000});burnt.interact('crate','classic_burger');burnt.interact('grill');burnt.tick(220);assert.equal(burnt.s.stations.find(st=>st.kind==='grill')!.slots[0].item?.kind,'burnt');burnt.interact('grill');assert.equal(burnt.s.chef.held?.kind,'burnt');burnt.act({type:'discard'});burnt.until(()=>!burnt.s.chef.path.length);assert.equal(burnt.s.chef.held,null);
  const cold=new Driver({menu:['fries'],customers:1,tablePatienceTicks:12000});cold.until(()=>cold.s.customers.some(c=>c.phase==='seated'));cold.cook('fries');cold.tick(SERVICE_RULES.coldTicks);assert.equal(cold.s.chef.held?.cold,true);const customer=cold.s.customers[0];cold.interact(customer.tableId!,undefined,customer.seatId!);const served=cold.s.customers[0];assert.equal(served.tip,0);assert.equal(served.payment,recipePrice('fries'));assert.equal(cold.s.combo,0);cold.until(()=>cold.s.phase==='complete');assert.equal(cold.s.coins,recipePrice('fries'));
});
check('independent seats admit guests before clearing and washing settles only the exact old meal',()=>{
  const d=new Driver({seed:'seat-identity',menu:['fries'],customers:3,arrivalTicks:20,queuePatienceTicks:12000,tablePatienceTicks:12000});d.until(()=>d.s.customers.filter(c=>c.phase==='seated').length===2);
  assert.equal(d.s.customers.filter(c=>c.phase==='queue').length,1);const first=d.s.customers[0];d.serve(first.id);d.until(()=>d.s.tables[0].seats.some(seat=>seat.status==='dirty'));
  const firstSeat=d.s.tables[0].seats.find(seat=>seat.id===first.seatId)!;const otherSeat=d.s.tables[0].seats.find(seat=>seat.id!==first.seatId)!;const otherMeal=otherSeat.mealId;d.until(()=>d.s.customers[2].phase==='seated');
  d.interact(first.tableId!,undefined,first.seatId!);const plate=JSON.parse(JSON.stringify(d.s.chef.held));assert.equal(plate.meal.mealId,first.mealId);assert.equal(d.s.tables[0].seats.find(seat=>seat.id===first.seatId)?.status,'occupied');d.tick(20);assert.equal(d.s.customers.filter(c=>c.phase==='queue').length,0);
  d.act({type:'discard'});d.until(()=>!d.s.chef.path.length);assert.equal(d.s.chef.held?.id,plate.id,'bin must not destroy the dirty meal receipt');
  d.interact('sink');d.act({type:'hold',active:true});d.until(()=>d.s.washed===1);assert.equal(d.s.tables[0].seats.find(seat=>seat.id===otherSeat.id)?.mealId,otherMeal);assert.equal(d.s.customers.filter(c=>c.phase==='queue').length,0);
  const after=d.s.tables[0].seats.find(seat=>seat.id===firstSeat.id)!;assert.notEqual(after.mealId,plate.meal.mealId);assert(['reserved','occupied'].includes(after.status));
  // A corrupt duplicate plate cannot release a newly seated meal or grant another wash.
  d.s.chef.held=plate;d.interact('sink');d.act({type:'hold',active:true});d.until(()=>d.s.stations.find(st=>st.kind==='sink')!.slots.every(slot=>!slot.item));assert.equal(d.s.washed,1);assert.notEqual(d.s.tables[0].seats.find(seat=>seat.id===firstSeat.id)?.status,'clean');
});
check('three-strike failure, cosy patience, and day closure drain without a clock-based loss',()=>{
  const failed=new Driver({customers:8,arrivalTicks:20,queuePatienceTicks:20,tablePatienceTicks:20});failed.until(()=>failed.s.phase==='failed');assert.equal(failed.s.strikes,3);const frozen=JSON.stringify(failed.s);stepService(failed.s,100);assert.equal(JSON.stringify(failed.s),frozen);
  const cosy=new Driver({cosy:true,customers:8,arrivalTicks:20,queuePatienceTicks:20,tablePatienceTicks:20});cosy.until(()=>cosy.s.phase==='failed');assert.equal(cosy.s.strikes,5);assert(cosy.s.tick>failed.s.tick);
  const closed=new Driver({customers:1,menu:['fries'],tablePatienceTicks:12000});closed.until(()=>closed.s.phase==='closing'&&closed.s.customers[0].phase==='seated');closed.tick(1000);assert.equal(closed.s.phase,'closing');closed.serve(closed.s.customers[0].id);closed.until(()=>closed.s.phase==='complete');assert.equal(closed.s.strikes,0);
});
check('families reserve one clean four-seat table atomically; singles can share two-seat tables',()=>{
  const layout=buildServiceLoadout(2,['fries']);layout.tables=[makeTable('family_table',3,5,4)];assert.equal(validateServiceLayout(2,layout.stations,layout.tables),null);
  const d=new Driver({tier:2,menu:['fries'],customers:4,customerTypes:['family'],arrivalTicks:20,tablePatienceTicks:12000,...layout});d.until(()=>d.s.customers.some(c=>c.phase==='seated'));const family=d.s.customers.filter(c=>c.groupId);assert(family.length>=3&&family.length<=4);assert.equal(new Set(family.map(c=>c.tableId)).size,1);assert.equal(new Set(family.map(c=>c.seatId)).size,family.length);
});
check('practice never exposes progression rewards; invalid commands cannot forge time, items or pay',()=>{
  const practice=new Driver({practice:true,menu:['fries'],customers:1});practice.run();assert(practice.s.coins>0);assert.equal(serviceResult(practice.s).coins,0);assert.equal(serviceResult(practice.s).reputation,0);
  const original=createService();const opened=dispatchService(original,{type:'open'});assert.equal(original.phase,'setup');
  for(const action of [{type:'tick',ticks:NaN},{type:'tick',ticks:10000},{type:'move',x:NaN,y:0},{type:'interact',targetId:'missing'},{type:'interact',targetId:'crate',recipeId:'forged'},{type:'award',coins:99999}] as unknown as ServiceAction[]){const next=dispatchService(opened,action);assert.equal(next.tick,opened.tick);assert.equal(next.coins,0);assert.equal(next.chef.held,null);assert.equal(next.spawned,0);}
  assert(serviceReadyError(createService({menu:['coffee']}))?.includes('Coffee'));
});
check('checkpoint validation preserves live meals and work, pauses reload, and rejects broken references',()=>{
  const d=new Driver({seed:'checkpoint',customers:3,tablePatienceTicks:12000});d.until(()=>d.s.customers.some(c=>c.phase==='seated'));d.serve(d.s.customers.find(c=>c.phase==='seated')!.id);
  const restored=sanitizeService(d.s);assert(restored);assert.equal(restored.phase,'paused');assert.deepEqual(restored.tables,d.s.tables);assert.deepEqual(restored.customers,d.s.customers);assert.deepEqual(restored.chef.held,d.s.chef.held);
  d.until(()=>d.s.tables.some(t=>t.seats.some(seat=>seat.status==='dirty')));const table=d.s.tables[0],seat=table.seats.find(seat=>seat.status==='dirty')!;d.interact(table.id,undefined,seat.id);assert(sanitizeService(d.s));
  const invalid=JSON.parse(JSON.stringify(d.s));invalid.chef.held.meal.mealId='wrong_meal';assert.equal(sanitizeService(invalid),null);invalid.chef.held=null;invalid.chef.path=[{x:999,y:999}];assert.equal(sanitizeService(invalid),null);
  assert.equal(sanitizeService({version:1}),null);
});
check('all four station facings keep their art orientation and use a reachable contact',()=>{
  for(const facing of [0,1,2,3] as const){const stations=starterStations(4),grill=stations.find(st=>st.kind==='grill')!;grill.x=4;grill.y=2;grill.facing=facing;const tables=starterTables(4);assert.equal(validateServiceLayout(4,stations,tables),null);
    const d=new Driver({tier:4,stations,tables,menu:['classic_burger'],customers:1,tablePatienceTicks:12000});d.interact('crate','classic_burger');d.interact('grill');assert(isAtStationAccess(4,d.s.stations,d.s.tables,d.s.chef,grill));assert(d.s.stations.find(st=>st.kind==='grill')!.slots[0].job);const loaded=sanitizeService(d.s);assert(loaded);assert.equal(loaded.stations.find(st=>st.kind==='grill')?.facing,facing);
  }
  const turned=starterStations();turned.find(st=>st.kind==='grill')!.facing=2;assert.equal(validateServiceLayout(1,turned,starterTables()),null,'turning the artwork does not disable other reachable sides');
  const a=makeStation('pass','pass',3,1,1,0),b=makeStation('pass','pass',3,1,1,1);assert.deepEqual(stationFootprint(a),[{x:3,y:1},{x:4,y:1}]);assert.deepEqual(stationFootprint(b),[{x:3,y:1},{x:3,y:2}]);assert.deepEqual(stationWorkingCell(a),{x:3,y:2});assert.deepEqual(stationWorkingCell(b),{x:2,y:1});
});
check('rotated table footprints and seats survive setup, full service and reload',()=>{
  for(const rotation of [0,1,2,3] as const){const table=makeTable('table_1',3,5,2,1,rotation),stations=starterStations();assert.equal(validateServiceLayout(1,stations,[table]),null);assert.equal(tableFootprint(table).length,2);
    assert.equal(new Set(table.seats.map(seat=>`${seat.x},${seat.y}`)).size,2);const d=new Driver({tables:[table],customers:3,menu:['fries'],arrivalTicks:100});d.until(()=>d.s.customers.some(c=>c.phase==='seated'));const saved=sanitizeService(d.s);assert(saved);assert.equal(saved.tables[0].rotation,rotation);assert.deepEqual(saved.tables[0].seats,d.s.tables[0].seats);d.run();assert.equal(d.s.paid,3);assert.equal(d.s.strikes,0);
  }
  const old=createService();delete (old.tables[0] as Partial<typeof old.tables[0]>).rotation;assert.equal(sanitizeService(old)?.tables[0].rotation,0);
});
check('accessible action labels distinguish taking, timed cooking, holding, serving and dirty cleanup',()=>{
  const d=new Driver({menu:['classic_burger'],customers:2,tablePatienceTicks:12000});assert.match(serviceTargetIntent(d.s,'crate').label,/Take.*ingredients/);d.interact('crate','classic_burger');assert.equal(serviceTargetIntent(d.s,'grill').label,'Grill');d.interact('grill');assert.equal(serviceTargetIntent(d.s,'grill').disabled,true);d.tick(120);assert.match(serviceTargetIntent(d.s,'grill').label,/Take/);d.interact('grill');d.interact('prep');const intent=serviceTargetIntent(d.s,'prep');assert.equal(intent.hold,true);assert.match(intent.label,/Hold/);assert.equal(intent.disabled,false);
});
check('washer physically clears a specific plate, carries it and returns its clean vessel',()=>{
  const d=new Driver({tier:2,menu:['fries'],customers:3,arrivalTicks:2400,tablePatienceTicks:12000,helpers:[{id:'jo',role:'washer',look:2}]});d.until(()=>d.s.customers.some(c=>c.phase==='seated'));d.serve(d.s.customers[0].id);let carried=false,travelled=false;
  for(let i=0;i<1000&&d.s.washed===0;i++){d.tick();carried ||= d.s.helpers[0].held?.kind==='dirty';travelled ||= d.s.helpers[0].path.length>0;}
  assert(carried&&travelled);assert.equal(d.s.washed,1);assert.equal(d.s.helpers[0].held,null);assert.equal(d.s.tables[0].seats[0].status,'clean');assert(sanitizeService(d.s));
});
check('runner delivers an existing dish and prep helper performs only an existing hold step',()=>{
  const runner=new Driver({tier:2,menu:['fries'],customers:3,arrivalTicks:2400,tablePatienceTicks:12000,helpers:[{id:'gus',role:'runner'}]});runner.until(()=>runner.s.customers.some(c=>c.phase==='seated'));runner.interact('crate','fries');runner.interact('fryer');runner.act({type:'move',x:1,y:1});runner.until(()=>runner.s.served===1,2000);assert.equal(runner.s.chef.held,null);assert.equal(runner.s.helpers[0].held,null);assert.equal(runner.s.customers[0].phase,'eating');
  const prep=new Driver({tier:2,menu:['classic_burger'],customers:3,arrivalTicks:2400,tablePatienceTicks:12000,helpers:[{id:'bea',role:'prep'}]});prep.interact('crate','classic_burger');prep.interact('grill');prep.tick(120);prep.interact('grill');prep.interact('prep');prep.act({type:'move',x:1,y:1});prep.until(()=>prep.s.stations.find(st=>st.kind==='prep')!.slots[0].item?.kind==='dish',1500);assert.equal(prep.s.served,0);assert.equal(prep.s.coins,0);assert(isAtStationAccess(2,prep.s.stations,prep.s.tables,prep.s.helpers[0],prep.s.stations.find(st=>st.kind==='prep')!));assert(sanitizeService(prep.s));
});
check('helper limits and short-staffed rule hold; pause and reload preserve in-flight work',()=>{
  // The service engine enforces physical capacity. Career eligibility is
  // enforced by progression before helpers are passed into a checkpoint.
  assert.equal(createService({helpers:[{id:'jo',role:'washer'},{id:'bea',role:'prep'}]}).helpers.length,1);assert.equal(createService({tier:2,helpers:[{id:'jo',role:'washer'},{id:'bea',role:'prep'}]}).helpers.length,1);assert.equal(createService({tier:4,spices:['short_staffed'],helpers:[{id:'jo',role:'washer'}]}).helpers.length,0);
  const d=new Driver({tier:2,menu:['fries'],customers:3,arrivalTicks:2400,tablePatienceTicks:12000,helpers:[{id:'jo',role:'washer'}]});d.until(()=>d.s.customers.some(c=>c.phase==='seated'));d.serve(d.s.customers[0].id);d.until(()=>d.s.helpers[0].held?.kind==='dirty');const reloaded=sanitizeService(d.s);assert(reloaded);assert.deepEqual(reloaded.helpers[0].held,d.s.helpers[0].held);assert.deepEqual(reloaded.helpers[0].path,d.s.helpers[0].path);const paused=JSON.stringify(reloaded);stepService(reloaded,100);assert.equal(JSON.stringify(reloaded),paused);const resumed=dispatchService(reloaded,{type:'resume'});stepService(resumed,600);assert.equal(resumed.washed,1);
});
check('prep assistance never steals another ready dish from a multi-slot counter',()=>{
  const layout=buildServiceLoadout(4,['classic_burger'],{prep:3});const d=new Driver({tier:4,...layout,menu:['classic_burger'],customers:3,arrivalTicks:2400,tablePatienceTicks:12000,helpers:[{id:'bea',role:'prep'}]});d.cook('classic_burger');const firstId=d.s.chef.held!.id;d.interact('prep');d.interact('crate','classic_burger');d.interact('grill');d.tick(120);d.interact('grill');d.interact('prep');d.act({type:'move',x:1,y:1});d.until(()=>d.s.stations.find(st=>st.kind==='prep')!.slots.filter(slot=>slot.item?.kind==='dish').length===2,1000);assert.equal(d.s.helpers[0].held,null);assert(d.s.stations.find(st=>st.kind==='prep')!.slots.some(slot=>slot.item?.id===firstId));
});
check('two fixed-role helpers physically serve and wash the same tracked meal without duplicate work',()=>{
  const d=new Driver({tier:4,menu:['fries'],customers:3,arrivalTicks:2400,tablePatienceTicks:12000,helpers:[{id:'gus',role:'runner'},{id:'jo',role:'washer'}]});
  d.until(()=>d.s.customers.some(c=>c.phase==='seated'));const mealId=d.s.customers[0].mealId;
  d.interact('crate','fries');d.interact('fryer');d.act({type:'move',x:1,y:1});
  let delivered=false,carried=false,runnerMoved=false,washerMoved=false;
  for(let i=0;i<2000&&d.s.washed===0;i++){
    d.tick();runnerMoved ||= d.s.helpers[0].path.length>0;washerMoved ||= d.s.helpers[1].path.length>0;
    delivered ||= d.s.helpers[0].held?.kind==='dish';carried ||= d.s.helpers[1].held?.meal?.mealId===mealId;
  }
  assert(runnerMoved&&washerMoved&&delivered&&carried);assert.equal(d.s.served,1);assert.equal(d.s.paid,1);assert.equal(d.s.washed,1);
  assert.deepEqual(d.s.helpers.map(h=>h.role),['runner','washer']);assert(sanitizeService(d.s));
  d.tick(100);assert.equal(d.s.washed,1);assert.equal(d.s.served,1);
});
console.log(`PASS ${groups} diner service groups`);
