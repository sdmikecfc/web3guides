// Rehearse the exact one-paste launch file in an isolated local database.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.BOTS_PGLITE_PATH||'D:/Temp/modelkombat-sql-check/node_modules/@electric-sql/pglite');
async function main(){const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test boolean default false,is_operator boolean default false)');
 const sql=fs.readFileSync('D:/Temp/modelkombat-launch-guide/01-workshop-setup.sql','utf8');
 await db.exec(sql);
 const before=(await db.query('select * from mkz_campaigns')).rows;
 await db.exec(sql);
 assert.deepEqual((await db.query('select * from mkz_campaigns')).rows,before);
 const checks=(await db.query("select to_regprocedure('mkz_read(text)') is not null a,to_regprocedure('mkz_commit(uuid,uuid,bigint,text,jsonb,date,jsonb,text)') is not null b,to_regprocedure('mkz_resolve_wallet(jsonb)') is not null c,to_regprocedure('mkz_finalize(jsonb,jsonb)') is not null d")).rows[0];
 assert.deepEqual(Object.values(checks),[true,true,true,true]);
 const role=(await db.query("select exists(select from pg_roles where rolname='doma_ai_mk') present")).rows[0].present;
 const access=(await db.query(fs.readFileSync('D:/Temp/modelkombat-launch-guide/02-check-setup.sql','utf8'))).rows[0];
 assert.equal(access.collector_access_ready,role);
 assert.equal((await db.query("select to_regprocedure('mkz_register_wallet(text)') is not null ready")).rows[0].ready,true);
 assert.equal(before[0].state,'draft');assert.equal(before[0].starts_at,null);assert.equal(before[0].ends_at,null);
 assert.equal(fs.readFileSync('D:/Temp/modelkombat-launch-guide/model-kombat-internal-ai-instructions.txt','utf8'),fs.readFileSync('docs/model-kombat-internal-ai-instruction.txt','utf8'));
 console.log('PASS exact combined launch SQL: one paste, repeat-safe, game readiness and existing collector-role check, draft and no dates.');
}finally{await db.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
