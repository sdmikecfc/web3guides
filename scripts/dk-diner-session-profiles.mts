/** Explicit balance fixture: owned mixed menu, real actions, one-second decisions.
 * Measures cooking and ingredient/coin gates. Random recipe discovery and human
 * shopping decisions remain separate playtesting variables. No player save I/O. */
import assert from 'node:assert/strict';
import {Cook} from './dk-diner-cook-fixture';
import {createService,dispatchService,stepService} from '../src/lib/chef/diner/service';
import {buildServiceLoadout} from '../src/lib/chef/diner/geometry';
import {DIFFICULTIES,RECIPE_BY_ID} from '../src/lib/chef/diner/content';
import {CAREER_RULES} from '../src/lib/chef/diner/career';
import {RENOVATION_RULES} from '../src/lib/chef/diner/renovation';
import {earlyServicePacing} from '../src/lib/chef/diner/service-pacing';
import {createDiner,dispatchDiner} from '../src/lib/chef/diner/progression';
const menu=['classic_burger','fries','lemonade'],loadout=buildServiceLoadout(2,menu);
const samples:Array<{seconds:number;coins:number;kind:string;missed:number;cleared:boolean}>=[];
for(const kind of ['slow','medium','busy'] as const){
  // Match Downtown's actual service factory, rather than later-route defaults.
  let s=createService({...DIFFICULTIES[kind],...earlyServicePacing({routeId:'downtown',serviceDays:4,tutorial:false,kind}),...loadout,tier:2,menu,seed:`session-profile-${kind}`,lessonVersion:0});
  try{new Cook(()=>s,a=>{if(a.type!=='tick'&&a.type!=='open')stepService(s,20);s=dispatchService(s,a);}).run(true);}
  catch(error){console.log('REFERENCE LIMIT '+kind+': '+(error as Error).message);}
  if(s.phase!=='complete'){for(let i=0;i<20000&&['playing','closing'].includes(s.phase);i++)stepService(s);}
  samples.push({seconds:s.tick/20,coins:s.phase==='complete'?s.coins:Math.floor(s.coins*.5),kind,missed:s.missed,cleared:s.phase==='complete'});
  console.log('MEASURED '+JSON.stringify({...samples.at(-1),served:s.served,phase:s.phase}));
}
// Partition exactly the same measured stream into visit lengths. Partial
// services carry over a break; time away is excluded rather than invented.
const totals:Array<{attempts:number;services:number;coins:number;earnedSets:number}>=[];
// Bound the starter home's contribution with the real offline settlement rules
// (including fixture wear). No overnight/day gap is added to the active clock.
const homeCoins=[0,3].map(level=>{const now=1900000000000,state=createDiner(now,'session-home-income');state.recipes.classic_burger.level=level;const settled=dispatchDiner(state,{type:'collectTill'},{now:now+420*60000});assert(!settled.error);return settled.state.coins-state.coins;});
for(const sessions of [Array(14).fill(30),Array(7).fill(60),[420]]){
  let seconds=0,services=0,attempts=0,coins=0,next=0,remaining=samples[0].seconds,spent=0;
  const checkpoints=[];
  for(const minutes of sessions){let available=minutes*60;
    while(available>=remaining){available-=remaining;seconds+=remaining;attempts++;if(samples[next].cleared)services++;coins+=samples[next].coins;
      // An explicit discretionary allowance, not a required fee.
      if(attempts%5===0){spent+=200;coins-=200;}
      next=attempts%samples.length;remaining=samples[next].seconds;
    }
    seconds+=available;remaining-=available;checkpoints.push(services);
  }
  const earnedSets=CAREER_RULES.bundles.filter(b=>b.services<=services).reduce((n,b)=>n+b.sets,0),neededSets=3*3;
  const missingIngredients=earnedSets>=neededSets?{}:Object.fromEntries([...new Set(menu.flatMap(id=>RECIPE_BY_ID[id].ingredients))].map(id=>[id,neededSets-earnedSets]));
  console.log('PROFILE '+JSON.stringify({visits:sessions.length,minutes:sessions[0],activeMinutes:seconds/60,attempts,services,truckCoins:coins,withStarterHomeRange:homeCoins.map(home=>home+coins),optionalPurchaseAllowance:spent,completeIngredientSets:earnedSets,missingIngredients,lastBlockingRequirement:services<RENOVATION_RULES.diner.services?'verified services':coins+homeCoins[0]<RENOVATION_RULES.diner.cost?'coin contribution depends on mastery timing; route/discovery unmodelled':'route/discovery not modelled',checkpoints}));
  assert(Math.abs(seconds-420*60)<.001);
  totals.push({attempts,services,coins,earnedSets});
}
assert.deepEqual(totals[0],totals[1]);assert.deepEqual(totals[0],totals[2]);
console.log('CALIBRATION '+JSON.stringify({meanServiceMinutes:samples.reduce((n,s)=>n+s.seconds,0)/samples.length/60,serviceGateHoursAtMeasuredSuccess:samples.reduce((n,s)=>n+s.seconds,0)/samples.filter(s=>s.cleared).length*RENOVATION_RULES.diner.services/3600,assumptions:'Downtown day-five pressure, reactive cook with one-second decisions. Home range assumes burger level 0/3 for the full period, not a simulated mastery timeline. No extra offline time, ingredient market or first-lunch bundle credited. Three recipes/equipment already owned. Repeated measured stream; not a full randomized campaign or novice observation.'}));
