/** Opening-trip exits use normal banking, without forcing a tutorial failure. */
import assert from 'node:assert/strict';
import {canCancelDinerRun,createDiner,dispatchDiner,generateDinerMap,sanitizeDinerSave,type DinerCommand,type DinerState} from '../src/lib/chef/diner/progression';
import {Cook} from './dk-diner-cook-fixture';
const now=Date.UTC(2026,8,22,8);let groups=0;
function check(name:string,run:()=>void){run();groups++;console.log(`PASS ${name}`);}
function act(state:DinerState,command:DinerCommand){const result=dispatchDiner(state,command,{now});assert.equal(result.error,undefined,result.error);return result.state;}
function started(){let state=createDiner(now,'opening-return');state=act(state,{type:'setupLayout',stations:[...state.truckConfig.stations,{id:'grill',kind:'grill',x:1,y:0,facing:0},{id:'prep',kind:'prep',x:2,y:0,facing:0}],tables:state.truckConfig.tables});return act(state,{type:'startRun'});}
check('an untouched opening route can return without earning its gift or skipping onboarding',()=>{
 let state=started();const bank=state.coins,id=state.run!.id;state=act(state,{type:'goHome'});assert.equal(state.run,null);assert.equal(state.runsStarted,0);assert.equal(state.lastRun,null);assert.equal(state.coins,bank);assert.equal(state.tutorial.finished,false);assert.equal(state.tutorial.fryerGifted,false);assert.equal(state.equipment.fryer.homeCopies,0);const restarted=act(state,{type:'startRun'});assert.equal(restarted.run!.tutorial,true);assert.equal(restarted.run!.id,id);
});
check('setup, food preparation and reloaded preparation cancel without consuming a run or changing history',()=>{
 for(const mode of ['map','setup','prepare','paused','reload'] as const){
  let state=act(started(),{type:'goHome'});state.tutorial.finished=true;state.runsStarted=3;state=act(state,{type:'startRun'});
  state.lastRun={id:'previous-earned-trip',reason:'home',banked:90,lost:0,serviceDays:1,recipes:['classic_burger'],equipment:['grill']};
  const before=structuredClone(state),id=state.run!.id,map=structuredClone(state.run!.map);
  if(mode!=='map')state=act(state,{type:'chooseNode',nodeId:state.run!.available[0]});
  if(['prepare','paused','reload'].includes(mode)){state=act(state,{type:'service',action:{type:'prepare'}});state=act(state,{type:'service',action:{type:'tick',ticks:20}});}
  if(mode==='paused')state=act(state,{type:'service',action:{type:'pause'}});
  if(mode==='reload'){state=sanitizeDinerSave(JSON.parse(JSON.stringify(state)))!;assert(state);assert.equal(state.run!.service!.pausedPhase,'preparing');}
  assert(canCancelDinerRun(state));state=act(state,{type:'goHome'});assert.equal(state.run,null);assert.equal(state.runsStarted,3);
  for(const key of ['coins','pantry','tutorial','equipment','career','collections','lastRun','truckConfig','daily'] as const)assert.deepEqual(state[key],before[key],`${mode}: ${key}`);
  const retry=dispatchDiner(state,{type:'goHome'},{now});assert.equal(retry.code,'between_stops');assert.deepEqual(retry.state,state);
  // Reopening the cancelled reservation cannot reroll the route.
  state=act(state,{type:'startRun'});assert.equal(state.run!.id,id);assert.deepEqual(state.run!.map,map);
 }
});
check('opening the doors commits the run even before a customer arrives',()=>{
 let state=started();state=act(state,{type:'chooseNode',nodeId:state.run!.available[0]});assert.equal(state.collections.stamps.length,0);state=act(state,{type:'service',action:{type:'open'}});assert.equal(state.run!.service!.phase,'playing');assert.equal(state.run!.service!.spawned,0);assert.equal(canCancelDinerRun(state),false);assert.equal(state.runsStarted,1);assert.equal(state.collections.stamps.length,1);
 state=act(state,{type:'service',action:{type:'pause'}});assert.equal(canCancelDinerRun(state),false);const result=dispatchDiner(state,{type:'goHome'},{now});assert.equal(result.code,'between_stops');assert.deepEqual(result.state,state);
});
check('a genuinely cooked opening service may bank fully and bring its discovery home',()=>{
 let state=started();state=act(state,{type:'chooseNode',nodeId:state.run!.available[0]});new Cook(()=>state.run!.service!,action=>{state=act(state,{type:'service',action});}).run();state=act(state,{type:'finishService'});
 const coins=state.coins,haul=state.run!.haul,career=structuredClone(state.career),layout=structuredClone(state.truckConfig),recipes=structuredClone(state.recipes);assert.equal(state.run!.serviceDays,1);assert(haul>0);
 state=act(state,{type:'goHome'});assert.equal(state.coins,coins+haul);assert.equal(state.lastRun!.lost,0);assert.equal(state.lastRun!.reason,'home');assert.equal(state.tutorial.finished,true);assert.equal(state.equipment.fryer.homeCopies,1);assert.deepEqual(state.career,career);assert.deepEqual(state.truckConfig,layout);assert.deepEqual(state.recipes,recipes);assert.equal(state.recipes.fries,undefined);
 const restored=sanitizeDinerSave(JSON.parse(JSON.stringify(state)))!;assert(restored);assert.deepEqual(restored.tutorial,state.tutorial);state=act(restored,{type:'startRun'});assert.equal(state.run!.tutorial,false);state=act(state,{type:'goHome'});assert.equal(state.coins,coins+haul);assert.equal(state.equipment.fryer.homeCopies,1);
});
check('existing two-service tutorial checkpoints can bank their 388 coins on every supported map version',()=>{
 for(const version of [1,2,3] as const){let state=started();const run=state.run!;run.mapVersion=version;run.map=generateDinerMap(run.seed,version);for(const node of run.map){if(node.row<2){node.kind='slow';if(version===3)node.name='A quiet lunch';}else if(node.row===2){node.kind='bonus';if(version===3)node.name='A little surprise';}else if(node.row===3){node.kind='busy';if(version===3)node.name='Lunch rush';}}
 const first=run.map.find(n=>n.row===0)!,second=run.map.find(n=>n.id===first.next[0])!;run.visited=[first.id,second.id];run.available=[...second.next];run.serviceDays=2;run.qualified=true;run.haul=388;state=sanitizeDinerSave(state)!;assert(state);const bank=state.coins;state=act(state,{type:'goHome'});assert.equal(state.coins,bank+388);assert.equal(state.lastRun!.serviceDays,2);assert.equal(state.equipment.fryer.homeCopies,1);assert.equal(state.daily.truckRuns.length,1);const retry=dispatchDiner(state,{type:'goHome'},{now});assert.equal(retry.code,'between_stops');assert.deepEqual(retry.state,state);}
});
check('active services and stops still require their normal exit, without losing progress',()=>{
 for(const kind of ['slow','shop','bonus','event'] as const){let state=started();const node=state.run!.map.find(n=>n.kind===kind);if(!node)continue;state.run!.available=[node.id];state=act(state,{type:'chooseNode',nodeId:node.id});if(state.run!.service)state=act(state,{type:'service',action:{type:'open'}});const result=dispatchDiner(state,{type:'goHome'},{now});assert.equal(result.code,'between_stops');assert.deepEqual(result.state,state);}
});
console.log(`PASS ${groups} opening-trip return groups`);
