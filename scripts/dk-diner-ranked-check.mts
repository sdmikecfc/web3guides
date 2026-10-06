import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRankedAttempt,replayRanked,validateRankedEnvelope,rankedWeekEnd,arrangeRanked,type RankedCommand} from '../src/lib/chef/diner/ranked-rally';
import {rallyScore,rallyWeek} from '../src/lib/chef/diner/rally';
import {createDiner,dispatchDiner} from '../src/lib/chef/diner/progression';
import {Cook} from './dk-diner-cook-fixture';
import {RankedSync} from '../src/app/chef/diner-preview/ranked-sync';
import {publicPacksEnabled,privatePackFixtureEnabled} from '../src/lib/chef/diner/pack-release';
const now=1800000000000,wallet='0x1111111111111111111111111111111111111111';
let attempt=createRankedAttempt(randomUUID(),wallet,now),clock=now;
const envelope=(commands:RankedCommand[])=>({id:randomUUID(),attemptId:attempt.id,revision:attempt.revision,commands});
function send(command:RankedCommand){if(command.type==='service'&&command.action.type==='tick')clock+=command.action.ticks*50;attempt=replayRanked(attempt,envelope([command]),clock).attempt;}
assert.deepEqual(attempt.service.config,createRankedAttempt(randomUUID(),'0x2222222222222222222222222222222222222222',now+1000).service.config);
assert.throws(()=>validateRankedEnvelope({...envelope([{type:'finish'}]),score:999999}));
assert.throws(()=>validateRankedEnvelope(envelope([{type:'service',action:{type:'tick',ticks:101}}])));
assert.throws(()=>replayRanked(attempt,envelope([{type:'finish'}]),clock));
assert.throws(()=>validateRankedEnvelope(envelope([{type:'service',action:{type:'open',config:{cosy:true}}} as any])));
const layout={stations:attempt.service.stations.map(({id,kind,x,y,facing})=>({id,kind,x,y,facing})),tables:attempt.service.tables.map(({id,x,y,capacity,rotation})=>({id,x,y,capacity,rotation}))};
assert(arrangeRanked(attempt.service,layout));assert.throws(()=>arrangeRanked(attempt.service,{...layout,stations:[null] as any}));assert.throws(()=>arrangeRanked(attempt.service,{...layout,stations:[...layout.stations,{...layout.stations[0],id:'purchased-extra'}]}));
const original=structuredClone(attempt);send({type:'service',action:{type:'prepare'}});
assert.throws(()=>replayRanked(attempt,envelope([{type:'service',action:{type:'tick',ticks:20}}]),clock),{code:'time_credit'});
const saved=envelope([{type:'service',action:{type:'tick',ticks:20}}]);attempt=replayRanked(attempt,saved,clock+=1000).attempt;assert.throws(()=>replayRanked(attempt,saved,clock),{code:'rally_conflict'});
const interrupted=replayRanked(attempt,envelope([{type:'service',action:{type:'tick',ticks:1}}]),clock+=10000);assert(interrupted.interrupted);assert.equal(interrupted.attempt.service.tick,20);assert.equal(interrupted.attempt.service.phase,'paused');attempt=interrupted.attempt;
send({type:'service',action:{type:'resume'}});send({type:'abandon'});assert.equal(attempt.status,'abandoned');assert.equal(attempt.score,null);
console.log('PASS identical weekly loans; forged scores/configs/inventory rejected; clock, replay, pause and abandonment enforced.');
// Drive the complete canonical weekly kitchen using only legal inputs. No local save or score enters replay.
attempt=original;clock=now;new Cook(()=>attempt.service,action=>send({type:'service',action})).run(true);
const expected=rallyScore(attempt.service);send({type:'finish'});assert.equal(attempt.status,'complete');assert.equal(attempt.score,expected);assert(attempt.eligible);
const prior=structuredClone(attempt);prior.status='active';prior.revision++;prior.finishedAt=undefined;
const end=rankedWeekEnd(prior.weekId);assert.notEqual(rallyWeek(end),prior.weekId);
assert(replayRanked(prior,{...envelope([{type:'finish'}]),revision:prior.revision},end+1800000).attempt.eligible);
assert(!replayRanked(prior,{...envelope([{type:'finish'}]),revision:prior.revision},end+1800001).attempt.eligible);
const beta=createDiner(now,'unchanged-beta');const before=JSON.stringify(beta);assert(dispatchDiner(beta,{type:'claimRallyTrophy'},{now}).error);assert.equal(JSON.stringify(beta),before);
const awarded=dispatchDiner(beta,{type:'claimRallyTrophy'},{now,verifiedRallyTrophy:true});assert.equal(awarded.state.decorOwned.prestige_rally_trophy,1);const repeated=dispatchDiner(awarded.state,{type:'claimRallyTrophy'},{now,verifiedRallyTrophy:true});assert.equal(repeated.state.decorOwned.prestige_rally_trophy,1);
console.log(`PASS real weekly cooking -> ${expected} verified points; rollover grace and one-time trophy; beta ownership preserved.`);
async function syncChecks(){
 let server=createRankedAttempt(randomUUID(),wallet,now),ms=now,sent=0,failStorage=true;const data=new Map<string,string>();
 const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,v:string)=>{if(failStorage)throw new Error('full');data.set(key,v);},removeItem:(key:string)=>{data.delete(key);}};
 const sync=new RankedSync(server,storage,async(_path,body)=>{sent++;const r=replayRanked(server,body as any,ms);server=r.attempt;return r;},()=>{});
 assert(sync.send({type:'service',action:{type:'prepare'}}));assert(sync.blocked);await sync.flush();assert.equal(sent,0,'Unpersisted requests never leave the browser.');
 failStorage=false;await sync.flush();assert(!sync.blocked);assert.equal(server.service.phase,'preparing');
 ms+=1000;assert(sync.send({type:'service',action:{type:'tick',ticks:20}}));await sync.flush();assert.equal(server.service.tick,20);assert.equal(data.size,0);
 sync.stop();assert(!sync.send({type:'service',action:{type:'open'}}));
 console.log('PASS separate ranked clock handshake and durable retry after storage failure.');
}
for(const NODE_ENV of ['development','production','test'])for(const flag of [undefined,'false','true']){assert.equal(publicPacksEnabled({NODE_ENV,DINER_PACKS_RELEASE:flag}),false);assert.equal(privatePackFixtureEnabled({NODE_ENV,DINER_PACKS_FIXTURE:flag}),NODE_ENV==='development'&&flag==='true');}
void syncChecks().catch(error=>{console.error(error);process.exitCode=1;});
