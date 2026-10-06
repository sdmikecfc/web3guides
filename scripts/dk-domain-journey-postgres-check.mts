import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDomainJourney,replayDomainJourney,journeyReachable} from '../src/lib/chef/diner/domain-journeys';
import {DOMAIN_SEASONS} from '../src/lib/chef/diner/domain-seasons';
async function main(){
const {PGlite}=createRequire('D:/Temp/dk-gacha-postgres-tests/package.json')('@electric-sql/pglite');
const db=new PGlite(),player=randomUUID(),other=randomUUID(),wallet='0x1111111111111111111111111111111111111111',now=1800000000000;
const q=async(sql:string,args:unknown[]=[])=> (await db.query(sql,args)).rows;
const rpc=async(name:string,args:unknown[])=> (await q(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args))[0].value;
try{
 await db.exec('create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls;');
 await q('insert into auth.users values($1),($2)',[player,other]);
 await db.exec(readFileSync('supabase/migrations/20261011_domain_kitchen_seasonal_journeys.sql','utf8'));
 const season={...DOMAIN_SEASONS[0],approved:true,startsAt:now-1000,endsAt:now+100000};
 const a=createDomainJourney(randomUUID(),wallet,season,now);
 assert.deepEqual(await rpc('diner_domain_journey_start',[player,wallet,a]),a);
 assert.deepEqual(await rpc('diner_domain_journey_start',[player,wallet,a]),a,'retry same start');
 assert.deepEqual(await rpc('diner_domain_journey_start',[player,wallet,createDomainJourney(randomUUID(),wallet,season,now)]),a,'one active attempt');
 await assert.rejects(rpc('diner_domain_journey_start',[other,wallet,a]),/identity mismatch/);
 for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(q('select * from diner_domain_journey_rewards'),/permission denied/);await assert.rejects(rpc('diner_domain_journey_start',[player,wallet,a]),/permission denied/);await db.exec('reset role');}
 const env={id:randomUUID(),attemptId:a.id,revision:0,commands:[{type:'choose' as const,nodeId:journeyReachable(a)[0].id}]},next=replayDomainJourney(a,env,now);
 const result=await rpc('diner_domain_journey_commit',[player,env.id,'fixture-fingerprint',0,next.attempt,next.accepted]);assert(result.ok);
 assert((await rpc('diner_domain_journey_commit',[player,env.id,'fixture-fingerprint',0,next.attempt,next.accepted])).duplicate);
 assert.equal((await rpc('diner_domain_journey_commit',[player,env.id,'other-fingerprint',0,next.attempt,next.accepted])).ok,false);
 assert.equal((await rpc('diner_domain_journey_commit',[player,randomUUID(),'stale',0,next.attempt,next.accepted])).ok,false);
 // Trusted replay result fixture tests SQL receipt conservation, not cooking evidence.
 const earned={...next.attempt,revision:2,completed:['r0c0','r1c0'],rewards:[{domain:a.domain,milestone:2,key:`journey:${a.domain}:2`,kind:'decor',earnedAt:now}]};
 assert((await rpc('diner_domain_journey_commit',[player,randomUUID(),'earned',1,earned,[]])).ok);
 const repeated={...earned,revision:3};assert((await rpc('diner_domain_journey_commit',[player,randomUUID(),'same-reward',2,repeated,[]])).ok);
 assert.equal((await q('select count(*) n from diner_domain_journey_rewards'))[0].n,1);
 const bad={...repeated,revision:4,rewards:[...repeated.rewards,{domain:'wines',milestone:4,key:'journey:wines:4',earnedAt:now}]};await assert.rejects(rpc('diner_domain_journey_commit',[player,randomUUID(),'bad-domain',3,bad,[]]),/invalid milestone/);
 assert.equal((await q('select revision from diner_domain_journey_attempts where id=$1',[a.id]))[0].revision,3,'failed receipt rolls back whole commit');
 console.log('PASS isolated PostgreSQL: migration, roles, one active attempt, duplicate/stale commands, atomic receipts and rollback.');
}finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
