'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {healthPayload}=require('./lib/worker-health.cjs');
const {PGlite}=require('./postgres-test-adapter.cjs');
async function main(){const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec("do $$begin if not exists(select from pg_roles where rolname='doma_ai_mk') then create role doma_ai_mk nologin;end if;end $$");
 const sql=fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-worker-health.sql'),'utf8');await db.exec(sql);
 const call=async p=>(await db.query('select mkz_worker_health($1) v',[p==null?null:JSON.stringify(p)])).rows[0].v;
 const now=new Date().toISOString(),status={workerVersion:'mk-public-worker-3-native-eth',phase:'AUDIT_COMPLETE',runStartedAt:now,updatedAt:now};
 const p=healthPayload(status,{status:'VOLUME_VERIFIED_FINANCIALS_PENDING',state:'draft',counts:{accounts:1,wallets:2,volumeUsd:'26.684083',privateWallet:'do not store'},problems:[{code:'SAFE_CODE',wallet:'do not store'}],wallet:'do not store',warnings:['do not store']});
 assert(!JSON.stringify(p).includes('do not store'));
 for(const role of ['anon','authenticated','doma_ai_mk']){await db.exec('set role '+role);await assert.rejects(()=>call(null),/permission denied/);await assert.rejects(()=>call(p),/permission denied/);await db.exec('reset role');}
 await db.exec('set role service_role');assert.equal((await call(null)).available,false);await call(p);
 let r=await call(null);assert.deepEqual(r.lastCompleted,p);assert.equal(r.current.counts.wallets,2);
 await call({...p,phase:'READING_REGISTRY',runStartedAt:new Date(Date.parse(now)+1).toISOString(),updatedAt:new Date(Date.parse(now)+1).toISOString()});r=await call(null);assert.equal(r.current.phase,'READING_REGISTRY');assert.deepEqual(r.lastCompleted,p);
 await assert.rejects(()=>call(p),/HEALTH_STALE/);
 await assert.rejects(()=>call({...p,wallet:'0x'+'a'.repeat(40)}),/HEALTH_INVALID/);
 await assert.rejects(()=>call({...p,problems:[{code:'SAFE_CODE',wallet:'private'}]}),/HEALTH_INVALID/);
 await assert.rejects(()=>call({...p,counts:{wallets:2,accountId:'private'}}),/HEALTH_INVALID/);
 await assert.rejects(()=>db.query('select * from mkz_worker_health_state'),/permission denied/);
 await db.exec('reset role');await db.exec(sql);assert.equal((await call(null)).lastCompleted.counts.volumeUsd,'26.684083');
 console.log('PASS private worker health: strict no-identity payload, service-only RPC, no public/AI access, stale-run rejection, preserved completed audit and repeat-safe migration.');
 }finally{await db.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
