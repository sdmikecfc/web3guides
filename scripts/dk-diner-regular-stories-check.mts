import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,homeSimulationConfig,sanitizeDinerSave,type DinerState} from '../src/lib/chef/diner/progression';
import {advanceRegularStories,newRegularStories,regularVisitWorld,REGULAR_STORIES} from '../src/lib/chef/diner/regular-stories';
import {REGULARS} from '../src/lib/chef/diner/collections';
import {RECIPE_BY_ID} from '../src/lib/chef/diner/content';
import {createDinerRecord,replayDiner} from '../src/lib/chef/diner/authority';
const now=1900000000000;
function observe(s:DinerState,ms=15000){const at=s.updatedAt+ms;advanceRegularStories(s,homeSimulationConfig(s),at,true);s.updatedAt=at;}
function ready(s:DinerState){for(let i=0;i<40&&!s.regularStories?.pending?.ready;i++)observe(s);assert(s.regularStories?.pending?.ready,'a real named meal must finish');}
{
  let record=createDinerRecord(now,'named-pete');record=replayDiner(record,[{type:'settle'}],now+15000).record;assert.equal(record.state.regularStories?.pending?.regularId,'old_pete');
  const visit=record.state.regularStories!.pending!;assert.throws(()=>replayDiner(record,[{type:'serveRegular',regularId:'old_pete',visitId:visit.id}],now+15000),/actual restaurant meal/);
  for(const config of [null,{...visit.config,w:100000},{...visit.config,layout:[null]},{...visit.config,namedVisit:{id:999,regularId:'old_pete',recipeId:'classic_burger'}}]){const malformed=structuredClone(record.state);malformed.regularStories!.pending!.config=config as never;assert.equal(sanitizeDinerSave(malformed),null,'malformed visit cannot reach the simulation');}
  const paused=dispatchDiner(record.state,{type:'settle'},{now:now+3600000}).state;assert.equal(paused.regularStories?.pending?.ticks,visit.ticks,'offline settlement cannot cook a named meal');assert(paused.home.till.coins>record.state.home.till.coins);
  let clock=now+15000;for(let i=0;i<30&&!record.state.regularStories?.pending?.ready;i++){clock+=15000;record=replayDiner(record,[{type:'settle'}],clock).record;}
  assert(record.state.regularStories?.pending?.ready);assert(sanitizeDinerSave(record.state));const frame=regularVisitWorld(record.state.regularStories.pending);assert(frame.metrics.namedMeals?.includes(visit.id));assert(frame.metrics.ordersTaken>=1);const greeting={type:'serveRegular' as const,regularId:'old_pete',visitId:visit.id};record=replayDiner(record,[greeting],clock).record;assert.equal(record.state.collections.regulars.old_pete,1);assert.throws(()=>replayDiner(record,[greeting],clock),/actual restaurant meal/);
  record=replayDiner(record,[{type:'settle'}],clock+1000).record;assert.equal(record.state.regularStories?.pending?.regularId,'old_pete');assert(record.state.regularStories.pending.id>visit.id);console.log('PASS authoritative named meal, same-day next visit, offline exclusion, reload and greeting retry');
}
for(const regular of REGULARS){
  let s=createDiner(now,`story-${regular.id}`);s.regularStories=newRegularStories();s.home.w=8;s.home.h=8;delete s.home.roomPlan;s.home.staff={chefs:1,waiters:1,cashiers:0};
  const recipeId=regular.favourite==='mastered'?'classic_burger':regular.favourite;s.recipes={[recipeId]:{level:regular.id==='mr_bell'?10:5}};s.home.menu={starter:[],main:[],dessert:[],drink:[]};s.home.menu[RECIPE_BY_ID[recipeId].course]=[recipeId];
  const machines=[...new Set([...RECIPE_BY_ID[recipeId].steps.map(step=>step.station),'sink'])];s.home.layout=machines.map((equipmentId,i)=>({id:equipmentId,equipmentId,x:i*2,y:0,rotation:0}));s.home.layout.push({id:'dining',equipmentId:regular.id==='hendersons'?'table_4':'table_2',x:2,y:3,rotation:0});if(regular.id==='dottie')s.home.layout.push({id:'daisy',equipmentId:'daisy_pot',x:7,y:0,rotation:0});
  for(const piece of s.home.layout)s.equipment[piece.equipmentId]={tier:1,homeCopies:1,truckOwned:true};s.cosmetics.horn='friendly';s.collections.stamps.push('boardwalk:0:slow');s.collections.regulars={};
  let guard=0;while((s.collections.regulars[regular.id]??0)<15&&guard++<40){ready(s);const visit=s.regularStories!.pending!,before=s.collections.regulars[visit.regularId]??0;const result=dispatchDiner(s,{type:'serveRegular',regularId:visit.regularId,visitId:visit.id},{now:s.updatedAt,online:true});assert.equal(result.error,undefined,result.error);s=result.state;assert.equal(s.collections.regulars[visit.regularId],before+1);}
  assert.equal(REGULAR_STORIES[regular.id].length,3);assert(s.collections.mementos.includes(regular.memento));assert.equal(s.decorOwned[regular.memento],1);console.log('PASS three chapters and one keepsake through 15 actual visits: '+regular.name);
}
{
  const s=createDiner(now,'retained-friendship');s.collections.regulars.old_pete=25;s.decorOwned.pete_postcard=1;delete s.regularStories;const loaded=sanitizeDinerSave(s)!;assert(loaded);assert.equal(loaded.collections.regulars.old_pete,25);assert.equal(loaded.decorOwned.pete_postcard,1);assert.equal(loaded.regularStories?.pending,null);console.log('PASS old friendship and keepsakes survive without inferred historical visits');
}
