import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DOMAIN_IDS} from '../src/lib/chef/diner/domain-worlds';
import {DOMAIN_SEASONS} from '../src/lib/chef/diner/domain-seasons';
import {createDomainJourney,journeyReachable,journeyServiceIndex,applyJourneyCommand,replayDomainJourney,validateJourneyEnvelope,domainService,arrangeDomainService,type JourneyCommand} from '../src/lib/chef/diner/domain-journeys';
import {Cook} from './dk-diner-cook-fixture';
import {dispatchService,sanitizeService} from '../src/lib/chef/diner/service';
const now=1800000000000,wallet='0x1111111111111111111111111111111111111111';
for(const domain of DOMAIN_IDS){
 const season={...DOMAIN_SEASONS.find(s=>s.domain===domain)!,approved:true,startsAt:now-1000,endsAt:now+7*86400000};
 let a=createDomainJourney(randomUUID(),wallet,season,now),clock=now;
 const send=(c:JourneyCommand)=>{if(c.type==='service'&&c.action.type==='tick')clock+=c.action.ticks*50;const result=replayDomainJourney(a,{id:randomUUID(),attemptId:a.id,revision:a.revision,commands:[c]},clock);assert(!result.interrupted);a=result.attempt;};
 assert.throws(()=>send({type:'finish'}));assert.throws(()=>send({type:'choose',nodeId:'r99c0'}));
 while(a.status==='active'){
  if(a.phase==='map'){const node=journeyReachable(a)[0];if(['slow','medium','busy','special','finale'].includes(node.kind))assert.equal(journeyServiceIndex(a.nodes,node),a.completed.length,'Map forecast uses the actual service depth');send({type:'choose',nodeId:node.id});continue;}
  if(a.phase==='encounter'){send({type:'encounter',choice:'equipment'});continue;}
  assert.throws(()=>arrangeDomainService(a,{stations:a.service.stations.map(s=>({...s,facing:9})),tables:a.service.tables} as any));
  send({type:'helper',enabled:true});send({type:'service',action:{type:'prepare'}});
  assert.throws(()=>replayDomainJourney(a,{id:randomUUID(),attemptId:a.id,revision:a.revision,commands:[{type:'service',action:{type:'tick',ticks:100}}]},clock),/Wait/);
  const restored=structuredClone(a);restored.service=sanitizeService(restored.service)!;assert(restored.service); // Server snapshots remain authoritative; browser reload cannot replace them.
  const cook=new Cook(()=>a.service,action=>send({type:'service',action}),20);cook.run(true);
  assert.equal(a.service.phase,'complete');send({type:'finish'});
  console.log(`PASS ${domain} service ${a.completed.length}: legal cooking, time credit, ${a.service.served}/${a.service.config.customers} served`);
 }
 assert.equal(a.outcome,'won');assert.deepEqual(a.rewards.map(r=>r.milestone),[2,4,6,8]);assert.equal(new Set(a.rewards.map(r=>r.key)).size,4);
 assert.throws(()=>send({type:'finish'}));
 const fresh=createDomainJourney(randomUUID(),wallet,season,now);applyJourneyCommand(fresh,{type:'choose',nodeId:journeyReachable(fresh)[0].id},now);applyJourneyCommand(fresh,{type:'service',action:{type:'prepare'}},now);
 const paused=replayDomainJourney(fresh,{id:randomUUID(),attemptId:fresh.id,revision:0,commands:[{type:'service',action:{type:'tick',ticks:20}}]},now+6000);assert(paused.interrupted);assert.equal(paused.attempt.service.phase,'paused');assert.equal(paused.attempt.service.tick,0);
 const expired=replayDomainJourney(fresh,{id:randomUUID(),attemptId:fresh.id,revision:0,commands:[{type:'abandon'}]},season.endsAt+86400000);assert.equal(expired.attempt.outcome,'expired');
 const practice=createDomainJourney(randomUUID(),wallet,season,now,true);applyJourneyCommand(practice,{type:'choose',nodeId:journeyReachable(practice)[0].id},now);assert.equal(practice.service.config.menu.length,3);const p=new Cook(()=>practice.service,action=>{practice.service=dispatchService(practice.service,action);},20);p.run(true);applyJourneyCommand(practice,{type:'finish'},now);assert.deepEqual(practice.rewards,[]);
}
assert.throws(()=>validateJourneyEnvelope({id:randomUUID(),attemptId:randomUUID(),revision:0,commands:[{type:'reward',amount:5000}]}));
console.log('PASS three full journeys, reward milestones, replay protection, interruption, expiry and reward-free practice.');
