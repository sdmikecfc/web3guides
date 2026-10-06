import assert from 'node:assert/strict';
import {rehearseHome,rehearseTruck} from '../src/lib/chef/diner/layout-rehearsal';
import {createDiner,homeSimulationConfig} from '../src/lib/chef/diner/progression';
import {buildServiceLoadout} from '../src/lib/chef/diner/geometry';
import {createRestaurantBlueprint} from '../src/lib/chef/diner/room-plan';
for(const tier of [1,2,3,4] as const){const options={...buildServiceLoadout(tier,['classic_burger']),tier,menu:['classic_burger']},before=JSON.stringify(options),result=rehearseTruck(options);assert.equal(JSON.stringify(options),before);assert(result.frames.length>0);assert.equal(result.served,3,JSON.stringify(result.issues));assert.equal(result.unfinished,0);assert(result.walkingSeconds>0);assert(result.seconds<=120);assert.deepEqual({...result,frames:[]},rehearseTruck(options,false));console.log(`PASS isolated tier ${tier} truck: ${result.served} served, ${result.washed} washed, ${result.seconds}s`);}
for(const stage of ['burger_shop','diner','restaurant'] as const){const state=createDiner(1900000000000,'rehearsal'),blueprint=createRestaurantBlueprint(stage);Object.assign(state.home,blueprint,{w:blueprint.roomPlan.w,h:blueprint.roomPlan.h});const config=homeSimulationConfig(state),before=JSON.stringify(state);const result=rehearseHome(config);assert.equal(JSON.stringify(state),before);assert(result.seconds<=120);assert(result.frames.length);assert(result.served>0,JSON.stringify(result.issues));assert.equal(result.frames.at(-1)!.home!.metrics.arrivals,3);console.log(`PASS isolated ${stage}: ${result.served} served, ${result.washed} washed, traffic delay ${Math.round(result.congestionSeconds)}s`);}
{
 const layout=buildServiceLoadout(1,['classic_burger']);layout.stations.find(s=>s.kind==='grill')!.x=layout.stations.find(s=>s.kind==='prep')!.x;const result=rehearseTruck({...layout,menu:['classic_burger']});assert.equal(result.served,0);assert(result.issues.length);assert.equal(result.frames.length,0);console.log('PASS blocked layout reports authoritative placement error without running');
}
{
 const state=createDiner(1900000000000,'no-sink'),config=homeSimulationConfig(state);config.layout=config.layout.filter(p=>p.equipmentId!=='sink');const result=rehearseHome(config);assert(result.unfinished>0);assert(result.issues.length);console.log('PASS incomplete kitchen reports unfinished orders rather than invented throughput');
}
