import assert from 'node:assert/strict';
import {createDiner,dispatchDiner,sanitizeDinerSave,needsFirstShiftChoice,runUsesCosy,runStrikeLimit,type DinerState,type DinerCommand} from '../src/lib/chef/diner/progression';
import {Kitchen} from './dk-diner-reference-kitchen';
const now=1800000000000;
const act=(s:DinerState,c:DinerCommand)=>{const r=dispatchDiner(s,c,{now});assert.equal(r.error,undefined,r.error);return r.state;};
for(const choice of ['cosy','regular'] as const){
 let s=createDiner(now,`first-choice-${choice}`);assert(needsFirstShiftChoice(s));
 s=act(s,{type:'startRun',routeId:'downtown',assistance:choice});
 assert.equal(s.settings.firstShiftChoice,choice);assert.equal(s.run!.assistance,choice);assert.equal(runUsesCosy(s),choice==='cosy');assert.equal(runStrikeLimit(s),choice==='cosy'?5:3);
 assert(!needsFirstShiftChoice(s));s=sanitizeDinerSave(s)!;assert(s);assert.equal(s.run!.assistance,choice);
 s=act(s,{type:'chooseNode',nodeId:s.run!.available[0]});s=act(s,{type:'starterLayout'});
 assert.equal(s.run!.service!.config.cosy,choice==='cosy');assert.equal(s.run!.service!.config.tutorialLearning,true);
 assert(dispatchDiner(s,{type:'settings',cosy:choice!=='cosy'},{now}).error);
 // Replay actual supplies, cooking, serving and washing through the lesson and first three services.
 for(let day=0;day<3;day++){
  if(day>0)s=act(s,{type:'chooseNode',nodeId:s.run!.available[0]});
  const kitchen=new Kitchen(s.run!.service!,20);kitchen.lunch(false);s.run!.service=kitchen.s;
  s=act(s,{type:'service',action:{type:'pause'}});s=act(s,{type:'finishService'});
 }
 assert(s.onboarding!.completed);assert(s.run!.haul>=300,`${choice} must afford the first fries setup: ${s.run!.haul}`);
 console.log(`PASS ${choice}: first three lunches completed with ${s.run!.haul} carried coins; lesson, fixed mode and reload preserved.`);
}
for(const route of ['festival','business_center','boardwalk','night_market']){
 let s=createDiner(now,route);s.tutorial.finished=true;s.collections.routeWins=['downtown','festival','business_center','boardwalk'];s.settings.cosy=true;
 assert.equal(dispatchDiner(s,{type:'startRun',routeId:route,assistance:'cosy'},{now}).code,'cosy_unavailable');
 s=act(s,{type:'startRun',routeId:route});assert.equal(s.run!.assistance,'regular');assert.equal(runStrikeLimit(s),3);
 s=act(s,{type:'chooseNode',nodeId:s.run!.available[0]});assert.equal(s.run!.service!.config.cosy,false);assert(sanitizeDinerSave(s));
 // An already-saved legacy trip continues its original rule; no service is rewritten.
 delete s.run!.assistance;s.run!.service!.config.cosy=true;const legacy=sanitizeDinerSave(s)!;
 assert(legacy);assert.equal(runUsesCosy(legacy),true);assert.equal(legacy.run!.service!.config.cosy,true);
}
let cancelled=createDiner(now,'cancel');cancelled=act(cancelled,{type:'startRun',assistance:'cosy'});cancelled=act(cancelled,{type:'goHome'});
assert.equal(cancelled.runsStarted,0);assert(!needsFirstShiftChoice(cancelled));assert.equal(cancelled.settings.firstShiftChoice,'cosy');
const invalid=structuredClone(cancelled);(invalid.settings as any).firstShiftChoice='impossible';assert.equal(sanitizeDinerSave(invalid),null);
console.log('PASS all four later routes require Regular; old active trips retain their rules; cancellation preserves choice without counting a run.');

