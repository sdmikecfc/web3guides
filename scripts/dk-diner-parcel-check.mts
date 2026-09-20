/** Physical daily parcel: shared server clock, persistent parts, existing ingredient receipts. */
import assert from 'node:assert/strict';
import { createDiner, dailyIngredientParcel, dinerDay, DINER_RULES, dispatchDiner, homeIncidents, sanitizeDinerSave, type DinerCommand, type DinerState } from '../src/lib/chef/diner/progression';
import { createDinerRecord, DinerAuthorityError, replayDiner } from '../src/lib/chef/diner/authority';
import { homeGestureCommands, type ParcelPart } from '../src/lib/chef/diner/home-gesture';
import { homeScene } from '../src/app/chef/diner-preview/home-scene';
import { createHomeWorld, stepHomeWorld } from '../src/lib/chef/diner/home-simulation';
import { homeSimulationConfig } from '../src/lib/chef/diner/progression';

const now=Date.UTC(2026,8,24,12),tick=(ticks:number):DinerCommand=>({type:'homeTaskInput',action:{type:'tick',ticks}});
let groups=0;
function test(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
function act(state:DinerState,command:DinerCommand,at=now){const next=dispatchDiner(state,command,{now:at});assert.equal(next.error,undefined,`${command.type}: ${next.error}`);return next.state;}
function rejected(state:DinerState,command:DinerCommand,code:string,at=now){const next=dispatchDiner(state,command,{now:at});assert.equal(next.code,code);assert.deepEqual(next.state,state);}
function choosePart(state:DinerState,part:ParcelPart,at=now){return homeGestureCommands(state,{type:'parcel',incidentId:'home-parcel',part}).reduce((s,c)=>act(s,c,at),state);}
function opened(state=createDiner(now),at=now){for(const part of ['tape','leftFlap','rightFlap'] as const)state=act(choosePart(state,part,at),tick(30),at);return state;}

test('three deliberate parts deliver the exact opening ingredients only after the final flap',()=>{
  let state=createDiner(now,'parcel');const pantry=structuredClone(state.pantry),coins=state.coins;
  state=choosePart(state,'tape');assert.equal(state.homeTask!.incidentId,`crate:${dinerDay(now)}`);assert.deepEqual(state.pantry,pantry);
  state=act(state,tick(30));assert.equal(state.daily.crateProgressTicks,27);assert.equal(state.homeTask!.phase,'ready');assert.deepEqual(state.pantry,pantry);
  state=act(choosePart(state,'leftFlap'),tick(30));assert.equal(state.daily.crateProgressTicks,54);assert.deepEqual(state.pantry,pantry);
  state=choosePart(state,'rightFlap');state=act(state,tick(25));assert.equal(state.daily.crateProgressTicks,79);assert.equal(state.daily.minted,0);
  state=act(state,tick(1));assert.equal(state.daily.crateProgressTicks,80);assert.equal(state.daily.crate,true);assert.equal(state.tutorial.crateClaimed,true);assert.equal(state.homeTask,null);
  assert.equal(state.pantry.beef,(pantry.beef??0)+1);assert.equal(state.pantry.bun,(pantry.bun??0)+1);assert.equal(state.daily.minted,2);assert.equal(state.coins,coins);assert.deepEqual(state.daily.incidentClaims,[]);
});
test('partial tape survives reload, switching chores, and home layout changes without auto-opening',()=>{
  let state=act(choosePart(createDiner(now),'tape'),tick(10));const loaded=sanitizeDinerSave(state)!;assert(loaded);assert.equal(loaded.homeTask!.phase,'paused');assert.equal(loaded.homeTask!.gesture!.creditTicks,0);assert.equal(loaded.daily.crateProgressTicks,10);
  const spill=homeIncidents(loaded)[0];state=act(loaded,{type:'beginHomeTask',incidentId:spill.id});assert.equal(state.daily.crateProgressTicks,10);
  state=choosePart(state,'tape');assert.equal(state.homeTask!.progressTicks,10);assert.equal(state.homeTask!.gesture!.creditTicks,17);
  state=act(state,{type:'homeLayout',layout:state.home.layout});assert.equal(state.homeTask!.phase,'paused');assert.equal(state.daily.crateProgressTicks,10);
  state=act(choosePart(state,'tape'),tick(30));assert.equal(state.daily.crateProgressTicks,27);assert.equal(state.daily.minted,0);
  state=act(choosePart(state,'leftFlap'),tick(30));state=act(choosePart(state,'rightFlap'),tick(30));assert.equal(state.daily.minted,2);
});
test('older unclaimed and claimed saves preserve reward receipts during parcel migration',()=>{
  const old=createDiner(now);delete (old.daily as Partial<typeof old.daily>).crateProgressTicks;
  assert.equal(sanitizeDinerSave(old)!.daily.crateProgressTicks,0);assert.equal(sanitizeDinerSave(old)!.daily.crate,false);
  const claimed=act(createDiner(now),{type:'claimCrate'}),pantry=structuredClone(claimed.pantry);delete (claimed.daily as Partial<typeof claimed.daily>).crateProgressTicks;
  const restored=sanitizeDinerSave(claimed)!;assert.equal(restored.daily.crateProgressTicks,80);assert.equal(restored.daily.crate,true);assert.deepEqual(restored.pantry,pantry);
  assert.deepEqual(homeGestureCommands(restored,{type:'parcel',incidentId:'home-parcel',part:'tape'}),[]);
  const forged=createDiner(now);forged.daily.crateProgressTicks=80;assert.equal(sanitizeDinerSave(forged),null);
});
test('part skipping, repeat clicks, forged progress and reward fields cannot claim a parcel',()=>{
  let state=createDiner(now);const id=dailyIngredientParcel(state).id;
  rejected(state,{type:'beginHomeTask',incidentId:`crate:${dinerDay(now)+1}`},'incident_unavailable');state=act(state,{type:'beginHomeTask',incidentId:id});
  rejected(state,{type:'homeTaskInput',action:{type:'parcel',part:'rightFlap'}},'parcel_part_required');
  rejected(state,{type:'homeTaskInput',action:{type:'parcel',part:'tape',progressTicks:80}} as any,'invalid_home_task_input');
  state=choosePart(state,'tape');rejected(state,{type:'homeTaskInput',action:{type:'parcel',part:'tape'}},'parcel_part_required');
  state=act(state,tick(100));assert.equal(state.daily.crateProgressTicks,27);assert.equal(state.daily.minted,0);rejected(state,tick(1),'home_task_paused');
  state=act(choosePart(state,'leftFlap'),tick(30));state=act(choosePart(state,'rightFlap'),tick(30));
  rejected(state,{type:'beginHomeTask',incidentId:id},'incident_unavailable');rejected(state,{type:'claimCrate'},'already_claimed');assert.equal(state.daily.minted,2);
});
test('compatibility claims and scene opening share one receipt and the existing seven-source cap',()=>{
  let state=act(choosePart(createDiner(now),'tape'),tick(10));state=act(state,{type:'claimCrate'});assert.equal(state.homeTask,null);assert.equal(state.daily.crateProgressTicks,80);assert.equal(state.daily.minted,2);rejected(state,{type:'claimCrate'},'already_claimed');
  const budget=createDiner(now);budget.daily.minted=5;const exact=opened(budget);assert.equal(exact.daily.minted,7);assert.equal(exact.daily.incidentClaims.length,0);
  let capped=createDiner(now);capped.daily.minted=6;capped=act(choosePart(capped,'tape'),tick(30));capped=act(choosePart(capped,'leftFlap'),tick(30));capped=choosePart(capped,'rightFlap');
  rejected(capped,tick(30),'daily_limit');assert.equal(capped.daily.crate,false);assert.equal(capped.daily.crateProgressTicks,54);
});
test('every parcel part needs fresh server elapsed time and cannot spend idle credit',()=>{
  let record=createDinerRecord(now,'parcel-clock'),at=now;
  for(const part of ['tape','leftFlap','rightFlap'] as const){
    const commands=homeGestureCommands(record.state,{type:'parcel',incidentId:'home-parcel',part});record=replayDiner(record,commands,at).record;
    assert.throws(()=>replayDiner(record,[tick(1)],at),error=>error instanceof DinerAuthorityError&&error.code==='time_credit');
    const count=part==='rightFlap'?26:27;at+=count*50;record=replayDiner(record,[tick(count)],at).record;
    assert.equal(record.clock.creditMs,0);at+=12000;
  }
  assert.equal(record.state.daily.minted,2);assert.equal(record.state.daily.crate,true);assert.equal(record.state.coins,DINER_RULES.starterCoins);
});
test('midnight expires partial opening and old timed chunks cannot mint a new day parcel',()=>{
  const midnight=Date.UTC(2026,8,25),start=midnight-100;let record=createDinerRecord(start,'parcel-midnight');
  const commands=homeGestureCommands(record.state,{type:'parcel',incidentId:'home-parcel',part:'tape'});record=replayDiner(record,commands,start).record;const oldId=record.state.homeTask!.incidentId;
  const result=replayDiner(record,[tick(2),tick(2)],midnight+100);assert(result.interrupted);assert.equal(result.record.state.homeTask,null);assert.equal(result.record.state.daily.crateProgressTicks,0);assert.equal(result.record.state.daily.minted,0);
  rejected(result.record.state,{type:'beginHomeTask',incidentId:oldId},'incident_unavailable',midnight+100);
  const fresh=dailyIngredientParcel(result.record.state);assert.notEqual(fresh.id,oldId);assert.equal(fresh.claimed,false);
});
test('scene reflects unclaimed progress on the terrace and removes only the claimed ingredient parcel',()=>{
  let state=createDiner(now);const target=dailyIngredientParcel(state),scene=()=>homeScene(state,null,'home-parcel','sage'),find=()=>scene().objects.find(o=>o.id==='home-parcel');
  assert.equal(find()!.state,'ready');assert.equal(find()!.progress,0);assert.equal(find()!.x,target.x);assert.equal(find()!.y,state.home.h+2);
  state=choosePart(state,'tape');assert.equal(find()!.state,'working');state=act(state,tick(30));assert.equal(find()!.progress,27/80);assert.equal(find()!.state,'ready');
  state=act(choosePart(state,'leftFlap'),tick(30));state=act(choosePart(state,'rightFlap'),tick(30));assert.equal(find(),undefined);assert(scene().objects.some(o=>o.id.startsWith('incident:')));assert(scene().objects.some(o=>o.id==='home-till'));
});
test('home scene work props and facing come from actual cooking and washing tasks',()=>{
  const state=createDiner(now),world=createHomeWorld(homeSimulationConfig(state)),seen=new Set<string>();
  for(let i=0;i<3000;i++){
    stepHomeWorld(world,1);
    for(const actor of world.actors){
      if(actor.pose!=='cook'&&actor.pose!=='wash')continue;
      const person=homeScene(state,world,null,'sage').people.find(p=>p.id===actor.id)!,station=world.stations.find(s=>s.id===actor.task!.stationId)!;
      assert.equal(person.work!.stationKind,station.kind);assert.equal(person.work!.recipeId,'classic_burger');
      if(!actor.path.length)assert.deepEqual(person.target,{x:station.x,y:station.y});seen.add(station.kind);
    }
  }
  assert(seen.has('grill'));assert(seen.has('prep'));assert(seen.has('sink'));
});
console.log(`PASS ${groups} diner daily-parcel and scene groups`);
