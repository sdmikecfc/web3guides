/** Measured route/menu workloads and a repeatable session-length comparison.
 * This deliberately reports discovery/mastery as unmodelled instead of claiming
 * that a repeated cooking stream is a complete player's renovation campaign. */
import assert from 'node:assert/strict';
import {Cook} from './dk-diner-cook-fixture';
import {createService,dispatchService,stepService} from '../src/lib/chef/diner/service';
import {buildServiceLoadout} from '../src/lib/chef/diner/geometry';
import {destinationService} from '../src/lib/chef/diner/routes';
import {CAREER_RULES} from '../src/lib/chef/diner/career';
import {RENOVATION_RULES} from '../src/lib/chef/diner/renovation';
const samples:Array<{seconds:number;coins:number;cleared:boolean}>=[];
for(const route of ['festival','business_center'])for(const menu of [['classic_burger','fries'],['tomato_soup','mushroom_soup'],['pesto_pasta','vegetable_ramen','tomato_soup']]){
  const tier=3,loadout=buildServiceLoadout(tier,menu,{boiler:menu.length===3?3:2,grill:2,prep:2,sink:2});assert.equal(loadout.error,null);
  let service=createService({...loadout,...destinationService(route,2,false,menu.length),tier,menu,seed:`economy:${route}:${menu.join(',')}`,recipeLevels:Object.fromEntries(menu.map(id=>[id,3]))});
  let limit:string|undefined;
  try{new Cook(()=>service,action=>{if(action.type!=='tick'&&action.type!=='open')stepService(service,20);service=dispatchService(service,action);}).run(true);}catch(error){limit=(error as Error).message;}
  if(service.phase!=='complete')for(let i=0;i<24000&&['playing','closing'].includes(service.phase);i++)stepService(service);
  const sample={seconds:service.tick/20,coins:service.phase==='complete'?service.coins:Math.floor(service.coins*.5),cleared:service.phase==='complete'};samples.push(sample);
  console.log('MEASURED '+JSON.stringify({route,menu,minutes:sample.seconds/60,coins:sample.coins,served:service.served,missed:service.missed,phase:service.phase,limit}));
}
const totals=[];
for(const sessions of [Array(14).fill(30),Array(7).fill(60),[420]]){
  let seconds=0,next=0,remaining=samples[0].seconds,coins=0,services=0,attempts=0,optional=0;
  for(const minutes of sessions){let available=minutes*60;while(available>=remaining){available-=remaining;seconds+=remaining;attempts++;const sample=samples[next];coins+=sample.coins;if(sample.cleared)services++;if(attempts%5===0){coins-=200;optional+=200;}next=attempts%samples.length;remaining=samples[next].seconds;}seconds+=available;remaining-=available;}
  const sets=CAREER_RULES.bundles.filter(bundle=>bundle.services<=services).reduce((sum,bundle)=>sum+bundle.sets,0);
  const result={seconds:Math.round(seconds),attempts,services,coins,optional,sets};totals.push(result);
  console.log('PROFILE '+JSON.stringify({sessions:sessions.length,minutesPerSession:sessions[0],...result,ingredientSetShortage:{diner:Math.max(0,9-sets),restaurant:Math.max(0,22-sets)},dinerCoinShortage:Math.max(0,RENOVATION_RULES.diner.cost-coins),restaurantCoinShortage:Math.max(0,RENOVATION_RULES.restaurant.cost-coins),lastBlockingRequirement:services<RENOVATION_RULES.diner.services?'verified service count; discovery and mastery also unmodelled':'coin contribution, discovery and actual mastery timing need campaign playtesting'}));
}
assert.deepEqual(totals[0],totals[1]);assert.deepEqual(totals[0],totals[2]);
console.log('LIMITS: reactive cook with one-second decisions, tier-two equipment (advanced boiler for the three-batch menu) and level-three recipes already owned; no home earnings, market/gift bonuses or daily ingredients credited. Repeated measured stream, not a full campaign. Session length cannot accelerate credit. Real-device and novice gates remain open.');
