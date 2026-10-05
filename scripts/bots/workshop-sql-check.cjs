// In-memory PostgreSQL. Never reads deployment credentials or contacts Supabase.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.BOTS_PGLITE_PATH||'D:/Temp/modelkombat-sql-check/node_modules/@electric-sql/pglite');
async function main(){const db=new PGlite();try{
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-workshop-v8.sql'),'utf8'));
 const wallet='0x'+'1'.repeat(40),state={version:1,revision:0,welcomed:false,coins:250,draft:null,robots:[],selected:null,spares:[],history:[],active:null,days:{},receipts:[]};
 const commit=async(revision,id,next,publicFight=null)=>(await db.query('select public.mk8_commit($1,$2,$3,$4,$5) as value',[wallet,revision,id,JSON.stringify(next),publicFight&&JSON.stringify(publicFight)])).rows[0].value;
 await db.exec('set role service_role');
 await commit(-1,'enroll-first',state);await commit(-1,'enroll-retry',state);
 let row=(await db.query('select state from public.mk8_workshops where wallet=$1',[wallet])).rows[0];assert.equal(row.state.coins,250);
 const spent={...state,revision:1,coins:200,spares:[{uid:'purchase-1',item:'fixture-part'}]};
 await commit(0,'purchase-1',spent);await commit(0,'purchase-1',spent);
 row=(await db.query('select state from public.mk8_workshops where wallet=$1',[wallet])).rows[0];assert.equal(row.state.coins,200);assert.equal(row.state.spares.length,1);
 await assert.rejects(()=>commit(0,'purchase-stale',spent),/REVISION_CONFLICT/);
 const replay={id:'00000000-0000-4000-8000-000000000001',completedAt:10000,name:'Test',winner:0};
 const won={...spent,revision:2,coins:275};await commit(1,'settle-once',won,replay);await commit(1,'settle-once',won,replay);
 assert.equal((await db.query('select count(*)::int as n from public.mk8_public_fights')).rows[0].n,1);
 await assert.rejects(()=>commit(2,'bad-reward',{...won,revision:3}, {...replay,id:'not-a-uuid'}));
 assert.equal((await db.query('select revision from public.mk8_workshops')).rows[0].revision,2);
 assert.equal((await db.query('select count(*)::int as n from public.mk8_requests where request_id=$1',['bad-reward'])).rows[0].n,0);
 await db.exec('reset role; set role anon');await assert.rejects(()=>commit(2,'forged-state',{...won,revision:3,coins:999999}),/permission denied/);await assert.rejects(()=>db.query('select * from public.mk8_workshops'),/permission denied/);
 await db.exec('reset role; set role authenticated');await assert.rejects(()=>db.query('select * from public.mk8_workshops'),/permission denied/);
 console.log('PASS: one enrollment, idempotent purchase/reward, stale revision refusal, atomic public replay rollback, anonymous/authenticated denial.');
 }finally{await db.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
