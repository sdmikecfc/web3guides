/** Reproducible measured services and explicitly extrapolated session planning. */
import assert from 'node:assert/strict';
import {Cook} from './dk-diner-cook-fixture';
import {createService,dispatchService} from '../src/lib/chef/diner/service';
import {buildServiceLoadout} from '../src/lib/chef/diner/geometry';
import {DIFFICULTIES} from '../src/lib/chef/diner/content';
import {RENOVATION_RULES} from '../src/lib/chef/diner/renovation';
import {CAREER_RULES} from '../src/lib/chef/diner/career';
const menu=['classic_burger','fries','lemonade'],loadout=buildServiceLoadout(2,menu);assert.equal(loadout.error,null);
const measured=[];
for(const [kind,customers] of [['slow',8],['medium',14]] as const){let service=createService({...DIFFICULTIES[kind],seed:`career-pacing-${kind}`,tier:2,menu,customers,...loadout});new Cook(()=>service,a=>{service=dispatchService(service,a);}).run();assert.equal(service.phase,'complete');assert.equal(service.missed,0);const result={kind,customers,minutes:service.tick/20/60,served:service.served,missed:service.missed};measured.push(result);console.log('MEASURED '+JSON.stringify(result));}
assert.equal(RENOVATION_RULES.diner.services,100);assert.equal(RENOVATION_RULES.restaurant.services,100);
const medium=measured.find(m=>m.kind==='medium')!;console.log(`EXTRAPOLATED: 100 medium-equivalent services = ${(medium.minutes*100/60).toFixed(2)} hours of cooking, excluding travel, shops, setup, retries and mastery.`);
console.log('PLANNING SCENARIO: 420 minutes per stage = 14 x 30-minute visits, 7 x 60-minute visits, or 7 continuous hours. Sessions do not change server career credit. This is an approximation, not a completed campaign or a novice benchmark.');
console.log('LIMITATION: busy/finale mixed-menu driver samples were incomplete when a waiting customer left; they are not claimed as passed pacing samples.');
const setsBeforeRestaurant=CAREER_RULES.bundles.filter(b=>b.services<200).reduce((sum,b)=>sum+b.sets,0);assert(setsBeforeRestaurant>=22);console.log(`FINITE REWARDS: ${setsBeforeRestaurant} complete chosen-recipe sets available before 200 actual clears; six level-3 dishes including two level-5 need 22 sets from zero. Daily renewable allowance stays seven units.`);
