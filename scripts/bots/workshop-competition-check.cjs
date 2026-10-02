const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require(process.env.BOTS_PGLITE_PATH||'D:/Temp/modelkombat-sql-check/node_modules/@electric-sql/pglite');
const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {strategyQualification,competitionPeriod,COMPETITION_POOL}=require('../../src/lib/bots/workshop8/competition.ts');
async function main(){
 assert.equal(COMPETITION_POOL,2000);
 const now=Date.now(),start=new Date(now-4*86400000).toISOString(),end=new Date(Date.parse(start)+14*86400000).toISOString();
 const fill=(id,d,revision=1,status='verified')=>({id,revision,status,executedAt:new Date(Date.parse(start)+d*86400000+1000).toISOString()});
 const evidence={schemaVersion:1,source:'doma_strategy',complete:true,confirmedThrough:new Date(now).toISOString(),fills:[fill('a',0),fill('b',1),fill('c',2),fill('a',0)]};
 assert.equal(strategyQualification(evidence,start,end,now)[0].status,'qualified');
 assert.equal(strategyQualification({...evidence,fills:[...evidence.fills,fill('c',2,2,'revoked')]},start,end,now)[0].days,2);
 assert.equal(strategyQualification({...evidence,complete:false},start,end,now)[0].days,null);
 assert.equal(strategyQualification({...evidence,confirmedThrough:new Date(now-3600000).toISOString()},start,end,now)[0].days,null);
 assert.equal(strategyQualification(evidence,start,end,now)[1].status,'upcoming');
 const both={...evidence,confirmedThrough:new Date(Date.parse(start)+14*86400000).toISOString(),fills:[...evidence.fills,fill('d',7),fill('e',8),fill('f',9)]};
 assert.ok(strategyQualification(both,start,end,Date.parse(end)).every(w=>w.status==='qualified'));
 assert.equal(competitionPeriod(start,Date.parse(start)+7*86400000-1),'week1');assert.equal(competitionPeriod(start,Date.parse(start)+7*86400000),'week2');
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls');
  for(const file of ['bots-workshop-v8.sql','bots-workshop-journey.sql','bots-workshop-competition.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql',file),'utf8'));
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const config=(await q('select * from mk8_competitions'))[0];assert.equal(config.state,'draft');assert.equal(config.starts_at,null);assert.equal(config.pool_cents,200000);
  const wallet='0x'+'a'.repeat(40),id='workshop-competition-1';
  await assert.rejects(()=>q('select mk8_competition_enter($1,$2,$3)',[id,wallet,'shared-campaign']),/COMPETITION_NOT_OPEN/);
  const owner=(await q('select mk8_wallet_player($1) id',[wallet]))[0].id;
  const fresh=()=>({version:1,revision:0,coins:250,robots:[],spares:[],history:[],active:null,days:{},receipts:[]});
  const garage=async()=>(await q('insert into mk8_garages(player_id,state) values($1,$2) returning id',[owner,JSON.stringify(fresh())]))[0].id;
  const g1=await garage(),g2=await garage();
  const read=async(g)=>(await q('select state from mk8_garages where id=$1',[g]))[0].state;
  const commit=async(g,s,key,next,day=null,auth=wallet,pub=null)=>(await q('select mk8_competition_commit($1,$2,$3,$4,$5,$6,$7,$8) s',[owner,g,s.revision,key,JSON.stringify(next),day,pub===null?null:JSON.stringify(pub),auth]))[0].s;
  async function ready(g,mode='house',robot='owned',auth=wallet){let s=await read(g);const fid=randomUUID();s=await commit(g,s,'start:'+fid,{...s,revision:s.revision+1,active:{id:fid,mode,robotId:robot,waiting:true,startedAt:0}});const before=s;s=await commit(g,s,'ready:'+fid,{...s,revision:s.revision+1,active:{...s.active,waiting:false,startedAt:1}},null,auth);assert.deepEqual(await commit(g,before,'ready:'+fid,{...before,revision:before.revision+1}),s);return s;}
  async function settle(g,s,winner=0,pub=null){const f={...s.active,completedAt:s.active.startedAt+10,winner,coins:999};return commit(g,s,'settle:'+f.id,{...s,revision:s.revision+1,active:null,history:[f,...s.history]},new Date(f.completedAt).toISOString().slice(0,10),wallet,pub);}
  let s=await ready(g1);assert.equal(s.active.competition.status,'not_scored');s=await settle(g1,s);assert.equal(s.history[0].competition.points,0);assert.equal(s.history[0].coins,75);
  await q("update mk8_competitions set state='active',campaign_id='shared-campaign',starts_at=now()-interval '1 day',ends_at=now()+interval '13 days'");
  // Reapplying setup does not overwrite an active campaign.
  await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-workshop-competition.sql'),'utf8'));assert.equal((await q('select state from mk8_competitions'))[0].state,'active');
  s=await ready(g1);assert.match(s.active.competition.reason,/Enter/);await settle(g1,s);
  await q('select mk8_competition_enter($1,$2,$3)',[id,wallet,'shared-campaign']);await q('select mk8_competition_enter($1,$2,$3)',[id,wallet,'shared-campaign']);
  for(const [mode,robot,auth] of [['training','owned',wallet],['house',null,wallet],['house','owned',null]]){s=await ready(g1,mode,robot,auth);assert.equal(s.active.competition.status,'not_scored');await settle(g1,s);}
  for(let i=0;i<12;i++){const g=i%2?g1:g2;s=await ready(g);assert.equal(s.active.competition.status,'reserved');const before=s;s=await settle(g,s,i%3===0?1:0);assert.equal(s.history[0].competition.points,i%3===0?0:1);const repeat=await settle(g,before);assert.deepEqual(repeat,s);}
  s=await ready(g2);assert.match(s.active.competition.reason,/12/);await settle(g2,s);
  const score=(await q('select mk8_competition_scores($1,$2,$3) s',[id,wallet,'final']))[0].s;assert.equal(score.points,8);assert.equal(score.remaining,0);
  assert.equal((await q('select count(*)::int n from mk8_competition_attempts'))[0].n,12);
  assert.equal((await q('select count(*)::int n from mk8_competition_entries'))[0].n,1);
  // Failed settlement rolls back points, coins and the saved result together.
  await q("update mk8_competition_attempts set start_day=start_day-1");s=await ready(g1);
  await assert.rejects(()=>settle(g1,s,0,{id:'bad-uuid',completedAt:s.active.startedAt+10}));
  assert.equal((await q('select completed_at from mk8_competition_attempts where fight_id=$1',[s.active.id]))[0].completed_at,null);
  assert.equal((await read(g1)).revision,s.revision);await settle(g1,s);
  // The UTC start day and completion week are independent; a late finish
  // cannot earn points after the closing time, even if it was reserved.
  await q("update mk8_competitions set starts_at=now()-interval '8 days',ends_at=now()+interval '6 days'");
  s=await ready(g2);s=await settle(g2,s);assert.equal(s.history[0].competition.period,'week2');
  s=await ready(g1);await q("update mk8_competitions set state='closed',starts_at=now()-interval '15 days',ends_at=now()-interval '1 day'");
  s=await settle(g1,s);assert.equal(s.history[0].competition.points,0);assert.match(s.history[0].competition.reason,/closed/);
  await db.exec('set role anon');await assert.rejects(()=>q('select * from mk8_competition_attempts'),/permission denied/);
  console.log('PASS: $2,000; null-date draft; no prelaunch enrollment/backfill; Strategy dedup/corrections/freshness; 12 starts across garages; excluded training/loaner/guest; idempotent entry/start/settlement; atomic rollback; RLS.');
 }finally{await db.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
