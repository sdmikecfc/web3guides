/** Direct home gestures, with actual authority clock and no external I/O. */
import assert from 'node:assert/strict';
import { activeDinerMode, createDiner, DINER_RULES, dinerClockBoundary, dinerPauseCommand, dinerRates, dinerTickCommand, dispatchDiner, homeIncidents, homeSimulationConfig, sanitizeDinerSave, type DinerCommand, type DinerState } from '../src/lib/chef/diner/progression';
import { createDinerRecord, DinerAuthorityError, replayDiner } from '../src/lib/chef/diner/authority';
import { HOME_GESTURE_RULES, emptyHomeGesture, addHomeStroke, spillStrokeLength, homeGestureCommands } from '../src/lib/chef/diner/home-gesture';
import { createHomeWorld, homePath } from '../src/lib/chef/diner/home-simulation';

const now=Date.UTC(2026,8,22,12),hold=(active:boolean):DinerCommand=>({type:'homeTaskInput',action:{type:'hold',active}}),tick=(ticks:number):DinerCommand=>({type:'homeTaskInput',action:{type:'tick',ticks}});
let groups=0;
function test(name:string,fn:()=>void){fn();groups++;console.log(`PASS ${name}`);}
function act(state:DinerState,command:DinerCommand,at=now){const result=dispatchDiner(state,command,{now:at});assert.equal(result.error,undefined,`${command.type}: ${result.error}`);return result.state;}
function rejected(state:DinerState,command:DinerCommand,code:string,at=now){const result=dispatchDiner(state,command,{now:at});assert.equal(result.code,code);assert.deepEqual(result.state,state);}
function started(at=now){let state=createDiner(at,'home-work');state=act(state,{type:'beginHomeTask',incidentId:homeIncidents(state)[0].id},at);return act(state,startStroke(state),at);}
function startStroke(state:DinerState):DinerCommand {const job=homeIncidents(state).find(j=>j.id===state.homeTask!.incidentId)!;return {type:'homeTaskInput',action:{type:'strokeStart',point:{x:job.x-.2,y:job.y}}};}
function stroke(state:DinerState):DinerCommand {const job=homeIncidents(state).find(j=>j.id===state.homeTask!.incidentId)!;return {type:'homeTaskInput',action:{type:'stroke',point:{x:job.x+((state.homeTask!.gesture?.point?.x??job.x)<=job.x ? .2 : -.2),y:job.y}}};}
function scrub(state:DinerState,ticks:number,at=now):DinerState {while(ticks>0){state=act(state,stroke(state),at);const count=Math.min(3,ticks);state=act(state,tick(count),at);ticks-=count;}return state;}
function unpack(state:DinerState,at:number):DinerState {for(const part of ['tape','leftFlap','rightFlap'] as const){state=act(state,{type:'homeTaskInput',action:{type:'parcel',part}},at);state=act(state,tick(30),at);}return state;}
function timeRejected(fn:()=>unknown){assert.throws(fn,error=>error instanceof DinerAuthorityError&&error.code==='time_credit');}

test('selection and old quick-help commands never pay; physical strokes pay one receipt only',()=>{
  let state=createDiner(now,'selection');const task=homeIncidents(state)[0],coins=state.coins;
  assert.equal(task.availableAt,now);assert.equal(task.requiredTicks,60);
  for(let i=0;i<20;i++)state=act(state,{type:i%2?'helpIncident':'beginHomeTask',incidentId:task.id});
  assert.equal(state.coins,coins);assert.equal(state.homeTask!.progressTicks,0);assert.equal(state.homeTask!.phase,'ready');
  rejected(state,tick(60),'home_task_paused');rejected(state,hold(true),'gesture_required');state=act(state,startStroke(state));state=scrub(state,59);assert.equal(state.coins,coins);
  state=scrub(state,1);assert.equal(state.coins,coins+30);assert.equal(state.homeTask,null);assert.deepEqual(state.daily.incidentClaims,[task.id]);
  state=act(state,hold(false));state=act(state,{type:'homeTaskInput',action:{type:'pause'}});assert.equal(state.coins,coins+30);
  rejected(state,{type:'helpIncident',incidentId:task.id},'incident_unavailable');rejected(state,{type:'beginHomeTask',incidentId:task.id},'incident_unavailable');
});
test('release, reselect and checkpoint reload preserve partial work without auto-resuming',()=>{
  let state=scrub(started(),25);const incidentId=state.homeTask!.incidentId;
  state=act(state,hold(false));assert.equal(activeDinerMode(state),null);assert.equal(dinerTickCommand(state,1),null);
  rejected(state,tick(1),'home_task_paused');state=act(state,{type:'beginHomeTask',incidentId});assert.equal(state.homeTask!.progressTicks,25);
  state=act(state,startStroke(state));assert.equal(activeDinerMode(state),'homeTaskInput');assert(dinerClockBoundary(startStroke(state)));assert(!dinerClockBoundary(hold(false)));
  assert.deepEqual(dinerPauseCommand(state),{type:'homeTaskInput',action:{type:'pause'}});
  const loaded=sanitizeDinerSave(JSON.stringify(state))!;assert(loaded);assert.equal(loaded.homeTask!.phase,'paused');assert.equal(loaded.homeTask!.progressTicks,25);
  rejected(loaded,tick(35),'home_task_paused');const done=scrub(act(loaded,startStroke(loaded)),35);assert.equal(done.coins,state.coins+30);
  const old=createDiner(now);delete (old as Partial<DinerState>).homeTask;assert.equal(sanitizeDinerSave(old)!.homeTask,null);
});
test('server elapsed gates each stroke and release/restart clears idle clock credit',()=>{
  let record=createDinerRecord(now,'server-work');const incident=homeIncidents(record.state)[0];
  record.state=act(record.state,{type:'beginHomeTask',incidentId:incident.id});record=replayDiner(record,[startStroke(record.state)],now).record;
  timeRejected(()=>replayDiner(record,[stroke(record.state),tick(3)],now));
  record=replayDiner(record,[stroke(record.state),tick(3)],now+150).record;assert.equal(record.state.homeTask!.progressTicks,3);
  record=replayDiner(record,[hold(false)],now+250).record;assert.equal(record.clock.creditMs,0);
  record=replayDiner(record,[startStroke(record.state)],now+20000).record;assert.equal(record.clock.creditMs,0);timeRejected(()=>replayDiner(record,[stroke(record.state),tick(3)],now+20000));
  let at=now+20000;for(let i=0;i<19;i++){at+=150;record=replayDiner(record,[stroke(record.state),tick(3)],at).record;}
  assert.equal(record.state.coins,DINER_RULES.starterCoins+30);assert.equal(record.state.homeTask,null);assert.equal(record.clock.creditMs,0);
  timeRejected(()=>replayDiner(record,[tick(1)],at+50));
});
test('a long connection gap pauses without earning work or accepting later reward actions',()=>{
  let record=createDinerRecord(now,'away');record.state=started();const result=replayDiner(record,[tick(60),{type:'claimCrate'}],now+6000);
  assert(result.interrupted);assert.equal(result.record.state.homeTask!.phase,'paused');assert.equal(result.record.state.homeTask!.progressTicks,0);assert.equal(result.record.state.coins,DINER_RULES.starterCoins);assert.equal(result.record.state.daily.crate,false);
  assert.deepEqual(result.accepted,[{type:'homeTaskInput',action:{type:'pause'}}]);
  record=replayDiner(result.record,[startStroke(result.record.state)],now+10000).record;timeRejected(()=>replayDiner(record,[tick(60)],now+10000));
});
test('switching jobs resets partial work; both daily jobs keep a fixed 60-coin ceiling',()=>{
  let state=started(),jobs=homeIncidents(state);rejected(state,{type:'beginHomeTask',incidentId:jobs[1].id},'incident_unavailable');
  state=scrub(state,30);state=act(state,{type:'beginHomeTask',incidentId:jobs[1].id},jobs[1].availableAt);assert.equal(state.homeTask!.progressTicks,0);
  state=unpack(state,jobs[1].availableAt);assert.equal(state.coins,DINER_RULES.starterCoins+30);
  state=act(state,{type:'beginHomeTask',incidentId:jobs[0].id},jobs[1].availableAt);assert.equal(state.homeTask!.progressTicks,0);state=act(state,startStroke(state),jobs[1].availableAt);state=scrub(state,60,jobs[1].availableAt);
  assert.equal(state.coins,DINER_RULES.starterCoins+60);assert.equal(homeIncidents(state).length,0);assert.equal(new Set(state.daily.incidentClaims).size,2);
});
test('midnight expires old work without a rejected-tick loop or a new-day reward',()=>{
  const midnight=Date.UTC(2026,8,23),start=midnight-100;let record=createDinerRecord(start,'midnight');record.state=started(start);const oldId=record.state.homeTask!.incidentId;
  const expired=replayDiner(record,[tick(2),tick(2)],midnight+100);assert(expired.interrupted);record=expired.record;assert.equal(record.state.homeTask,null);assert.equal(record.state.coins,DINER_RULES.starterCoins);assert.equal(record.state.daily.day,Math.floor(midnight/DINER_RULES.dayMs));assert.equal(record.clock.creditMs,0);
  rejected(record.state,{type:'beginHomeTask',incidentId:oldId},'incident_unavailable',midnight+100);
  const freshJob=homeIncidents(record.state)[0];assert.notEqual(freshJob.id,oldId);assert.equal(freshJob.availableAt,midnight);
  record.state=act(record.state,{type:'beginHomeTask',incidentId:freshJob.id},midnight+100);record=replayDiner(record,[startStroke(record.state)],midnight+100).record;timeRejected(()=>replayDiner(record,[tick(1)],midnight+100));
  // An old paused home job must not bypass a cooking session's absence pause.
  let trip=createDinerRecord(start,'midnight-trip');trip.state=started(start);trip.state=act(trip.state,{type:'startRun'},start);trip.state=act(trip.state,{type:'chooseNode',nodeId:trip.state.run!.available[0]},start);trip.state=act(trip.state,{type:'service',action:{type:'open'}},start);
  const away=replayDiner(trip,[{type:'service',action:{type:'tick',ticks:20}}],midnight+10000);assert(away.interrupted);assert.equal(away.record.state.run!.service!.phase,'paused');assert.equal(away.record.state.homeTask,null);
});
test('manual modes and editing pause home work and never resume it after returning',()=>{
  const base=scrub(started(),10);base.tutorial.finished=true;
  for(const [begin,end] of [[{type:'startRun'},{type:'goHome'}],[{type:'startPractice'},{type:'endPractice'}],[{type:'startRally'},{type:'endRally'}]] as [DinerCommand,DinerCommand][]){
    let state=act(base,begin);assert.equal(state.homeTask!.phase,'paused');rejected(state,{type:'beginHomeTask',incidentId:base.homeTask!.incidentId},'home_task_unavailable');rejected(state,hold(true),'home_task_unavailable');state=act(state,end);assert.equal(state.homeTask!.phase,'paused');assert.equal(state.homeTask!.progressTicks,10);assert.equal(activeDinerMode(state),null);
  }
  const edited=act(base,{type:'homeLayout',layout:base.home.layout});assert.equal(edited.homeTask!.phase,'paused');assert.deepEqual(dinerRates(edited),dinerRates(base));
});
test('targets remain reachable inside the room, off furniture/chairs, distinct and stable across reload',()=>{
  for(const size of [8,10,12,14]){
    const state=createDiner(now);state.home.w=state.home.h=size;state.home.expansion=(size-8)/2;
    const jobs=homeIncidents(state),world=createHomeWorld(homeSimulationConfig(state)),seatKeys=new Set(world.tables.flatMap(table=>table.seats).map(seat=>`${seat.x},${seat.y}`));
    assert.equal(jobs.length,2);assert.notDeepEqual({x:jobs[0].x,y:jobs[0].y},{x:jobs[1].x,y:jobs[1].y});assert.deepEqual(homeIncidents(sanitizeDinerSave(state)!),jobs);
    for(const job of jobs){assert(homePath(world,world.door,job));assert(!seatKeys.has(`${job.x},${job.y}`));assert(job.x>=0&&job.y>=0&&job.x<size&&job.y<size);}
  }
  let state=started();state=scrub(state,20);const before=homeIncidents(state)[0];state.decorOwned.daisy_pot=1;
  state=act(state,{type:'homeLayout',layout:[...state.home.layout,{id:'new-pot',equipmentId:'daisy_pot',x:before.x,y:before.y,rotation:0}]});const after=homeIncidents(state)[0];
  assert.equal(after.id,before.id);assert.notDeepEqual({x:after.x,y:after.y},{x:before.x,y:before.y});assert.equal(state.homeTask!.phase,'paused');assert.equal(state.homeTask!.progressTicks,20);assert(sanitizeDinerSave(state));
});
test('forged elapsed, reward and phase fields refuse atomically without changing home rates',()=>{
  const state=started(),rates=dinerRates(state);
  for(const ticks of [0,-1,1.5,NaN,Infinity,101])rejected(state,tick(ticks),'invalid_home_task_input');
  rejected(state,{type:'homeTaskInput',action:{type:'tick',ticks:60,coins:30}} as any,'invalid_home_task_input');
  rejected(state,{type:'beginHomeTask',incidentId:state.homeTask!.incidentId,progressTicks:60} as any,'invalid_command');
  rejected(state,{type:'homeTaskInput',action:{type:'hold',active:'true'}} as any,'invalid_home_task_input');
  rejected(state,{type:'homeTaskInput',action:{type:'resume'}} as any,'invalid_home_task_input');
  rejected(state,{type:'homeTaskInput',action:{type:'stroke',point:{x:NaN,y:0}}},'invalid_home_task_input');
  rejected(state,{type:'homeTaskInput',action:{type:'stroke',point:{x:1,y:1,creditTicks:60}}} as any,'invalid_home_task_input');
  const corrupt=structuredClone(state);corrupt.homeTask!.progressTicks=60;assert.equal(sanitizeDinerSave(corrupt),null);assert.deepEqual(dinerRates(state),rates);
});
test('stationary holds, off-spill movement and impossible jumps never clean',()=>{
  let state=started(),job=homeIncidents(state)[0];state=act(state,tick(60));assert.equal(state.homeTask!.progressTicks,0);
  const point=state.homeTask!.gesture!.point!;for(let i=0;i<10;i++){state=act(state,{type:'homeTaskInput',action:{type:'stroke',point}});state=act(state,tick(5));}assert.equal(state.homeTask!.progressTicks,0);
  assert.equal(spillStrokeLength({x:0,y:0},{x:1,y:0},{x:0,y:0}),0);
  assert.equal(spillStrokeLength({x:-.2,y:.8},{x:.2,y:.8},{x:0,y:0}),0);
  assert(spillStrokeLength({x:-.2,y:0},{x:.2,y:0},{x:0,y:0})>.39);
  assert(spillStrokeLength({x:-.2,y:.35},{x:.2,y:.35},{x:0,y:0},0)>0);
  assert.equal(spillStrokeLength({x:-.2,y:.35},{x:.2,y:.35},{x:0,y:0},.9),0,'the cleaned outer rim cannot keep earning progress');
  state=act(state,stroke(state));state=act(state,tick(60));assert.equal(state.homeTask!.progressTicks,HOME_GESTURE_RULES.maxCreditTicks);
  state=act(state,tick(60));assert.equal(state.homeTask!.progressTicks,3,'no unattended work after finite stroke credit');
  const out=addHomeStroke(emptyHomeGesture(),{x:job.x+50,y:job.y},job);assert.equal(out.point,null);assert.equal(out.creditTicks,0);
});
test('parcel requires tape then two distinct flaps; holds and repeat taps cannot skip parts',()=>{
  let state=createDiner(now),job=homeIncidents(state)[1];state=act(state,{type:'beginHomeTask',incidentId:job.id},job.availableAt);
  rejected(state,{type:'homeTaskInput',action:{type:'parcel',part:'rightFlap'}},'parcel_part_required',job.availableAt);
  state=act(state,{type:'homeTaskInput',action:{type:'parcel',part:'tape'}},job.availableAt);rejected(state,{type:'homeTaskInput',action:{type:'parcel',part:'tape'}},'parcel_part_required',job.availableAt);
  state=act(state,tick(80),job.availableAt);assert.equal(state.homeTask!.progressTicks,27);assert.equal(state.homeTask!.phase,'ready');assert.equal(state.coins,DINER_RULES.starterCoins);
  rejected(state,tick(80),'home_task_paused',job.availableAt);rejected(state,{type:'homeTaskInput',action:{type:'parcel',part:'tape'}},'parcel_part_required',job.availableAt);
  state=act(state,{type:'homeTaskInput',action:{type:'parcel',part:'leftFlap'}},job.availableAt);state=act(state,tick(80),job.availableAt);assert.equal(state.homeTask!.progressTicks,54);
  state=act(state,{type:'homeTaskInput',action:{type:'parcel',part:'rightFlap'}},job.availableAt);state=act(state,tick(80),job.availableAt);assert.equal(state.coins,DINER_RULES.starterCoins+30);
});
test('gesture UI mapping preserves selection and release is harmless after completion',()=>{
  const state=createDiner(now),job=homeIncidents(state)[0],commands=homeGestureCommands(state,{type:'begin',incidentId:job.id,point:{x:job.x-.2,y:job.y}});assert.equal(commands.length,2);
  let playing=commands.reduce((s,c)=>act(s,c),state);assert.equal(playing.homeTask!.phase,'working');assert.equal(homeGestureCommands(playing,{type:'stroke',incidentId:job.id,point:{x:job.x+.2,y:job.y}}).length,1);
  playing=scrub(playing,60);assert.equal(homeGestureCommands(playing,{type:'end',incidentId:job.id}).length,0);
});
console.log(`PASS ${groups} diner home-task groups`);
