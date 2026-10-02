const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('./postgres-test-adapter.cjs');
async function main(){const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table battle_bots_campaign_snapshots(campaign_id text,period_key text,payload jsonb,as_of timestamptz);
 create table battle_bots_campaign_enrollments(campaign_id text,wallet text,snapshot_status text,eligibility_status text,is_test boolean,credit_from_at timestamptz);
 create table battle_bots_fills(id bigint,wallet text,role text,chain_id int,occurred_at timestamptz,origin text,tx_hash text);
 create table battle_bots_campaign_fills(fill_id bigint,campaign_id text,wallet text,automation_source text);
 create table battle_bots_keepers(origin text,status text);
 create table battle_bots_execution_receipt_fills(fill_id bigint,receipt_id bigint);
 create table battle_bots_execution_receipts(id bigint,status text,wallet text,tx_hash text);`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-workshop-reporter-read.sql'),'utf8'));
 const w='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40),p={campaign:{startsAt:'2026-09-01',endsAt:'2026-09-15'},players:{[w]:{test:'own'},[other]:{secret:'not allowed'}},provenance:{confirmedThrough:'2026-09-10'}};
 await db.query("insert into battle_bots_campaign_snapshots values('c','final',$1,now())",[p]);
 await db.query("insert into battle_bots_campaign_enrollments values('c',$1,'ready','eligible',false,'2026-09-01')",[w]);
 await db.query("insert into battle_bots_fills values(1,$1,'buyer',97477,'2026-09-02','keeper','tx1'),(2,$1,'buyer',97477,'2026-09-03',$1,'tx2')",[w]);
 await db.query("insert into battle_bots_campaign_fills values(1,'c',$1,'keeper'),(2,'c',$1,'doma_mcp')",[w]);
 await db.exec("insert into battle_bots_keepers values('keeper','confirmed');insert into battle_bots_execution_receipt_fills values(2,3)");
 await db.query("insert into battle_bots_execution_receipts values(3,'verified',$1,'tx2')",[w]);
 const read=async()=> (await db.query('select mk8_reporter_evidence($1,$2) e',['c',w])).rows[0].e;
 const a=await read();assert.equal(a.fills.length,2);assert.ok(a.fills.every(f=>f.verified));assert.equal(a.snapshot.players[other],undefined);assert.ok(a.fills[0].executedAt.startsWith('2026-09-02'));
 await db.exec("update battle_bots_keepers set status='rejected';update battle_bots_execution_receipts set status='rejected'");
 assert.ok((await read()).fills.every(f=>!f.verified),'changed attribution invalidates previously credited fills');
 await db.exec('set role anon');await assert.rejects(read,/permission denied/);
 console.log('PASS real PostgreSQL: read adapter executes, uses fill time, restricts private player data, observes rejected keeper/receipt corrections, refuses anonymous calls.');
 }finally{await db.close()}}
main().catch(e=>{console.error(e.message);process.exitCode=1});
