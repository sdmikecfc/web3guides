/** Settlement skips empty intervals while retaining clock and expiry bookkeeping. */
import assert from 'node:assert/strict';
import * as homeSimulation from '../src/lib/chef/diner/home-simulation';
import { createDiner, dispatchDiner, DINER_RULES, type DinerState } from '../src/lib/chef/diner/progression';
const now=Date.UTC(2026,8,25,12),hour=DINER_RULES.hourMs;let calls=0,groups=0;
const descriptor=Object.getOwnPropertyDescriptor(homeSimulation,'measureHomeRates')!;
const measured:homeSimulation.HomeRates={coins:200,reputation:10,plates:8,platesByRecipe:{classic_burger:8},bottleneck:'arrivals',rates:{arrivals:8,seats:20,kitchen:20,waiters:20},menu:['classic_burger']};
// Count dependency calls, not wall-clock time. The source rate is fixed so this
// regression remains independent of staff-routing and economy tuning.
Object.defineProperty(homeSimulation,'measureHomeRates',{...descriptor,value:()=>{calls++;return structuredClone(measured);}});
function check(name:string,run:()=>void){calls=0;run();groups++;console.log(`PASS ${name}`);}
function settle(state:DinerState,at:number,online=false){const result=dispatchDiner(state,{type:'settle'},{now:at,online});assert.equal(result.error,undefined);return result.state;}
try {
  check('same-time and backwards settlement never measure rates or alter saved earnings',()=>{
    const state=createDiner(now,'zero-settlement');state.home.till.coins=17.25;state.home.till.reputation=2.5;state.buzz=[now-DINER_RULES.buzzHours*hour,now-1];
    const next=settle(state,now);assert.equal(calls,0);assert.equal(next.home.till.lastAt,now);assert.equal(next.home.till.filledMs,0);assert.equal(next.home.till.coins,17.25);assert.equal(next.home.till.reputation,2.5);assert.deepEqual(next.buzz,[now-1]);assert.equal(state.buzz.length,2);
    const backwards=settle(next,now-hour);assert.equal(calls,0);assert.deepEqual(backwards.home.till,next.home.till);assert.deepEqual(backwards.buzz,next.buzz);
  });
  check('a full till still advances its timestamp and expires buzz without sampling',()=>{
    const state=createDiner(now,'full-settlement');state.home.till.filledMs=DINER_RULES.tillHours*hour;state.home.till.coins=500;state.buzz=[now-DINER_RULES.buzzHours*hour+hour/2];
    const next=settle(state,now+hour);assert.equal(calls,0);assert.equal(next.home.till.lastAt,now+hour);assert.equal(next.home.till.filledMs,state.home.till.filledMs);assert.equal(next.home.till.coins,500);assert.deepEqual(next.buzz,[]);
  });
  check('positive time still uses the measured online and offline rates exactly',()=>{
    const state=createDiner(now,'positive-settlement'),offline=settle(state,now+hour/2);assert.equal(calls,1);assert.equal(offline.home.till.coins,60);assert.equal(offline.home.till.reputation,3);assert.equal(offline.home.till.filledMs,hour/2);assert.equal(offline.home.till.lastAt,now+hour/2);
    const online=settle(state,now+hour/2,true);assert.equal(calls,2);assert.equal(online.home.till.coins,100);assert.equal(online.home.till.reputation,5);
  });
  check('positive intervals on both sides of a buzz expiry are each measured once',()=>{
    const state=createDiner(now,'boundary-settlement');state.buzz=[now-DINER_RULES.buzzHours*hour+hour/2];const next=settle(state,now+hour,true);assert.equal(calls,2);assert.equal(next.home.till.coins,200);assert.equal(next.home.till.reputation,10);assert.equal(next.home.till.filledMs,hour);assert.deepEqual(next.buzz,[]);
  });
} finally {Object.defineProperty(homeSimulation,'measureHomeRates',descriptor);}
console.log(`PASS ${groups} diner settlement groups`);
