const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require('./postgres-test-adapter.cjs'),{Client}=require(process.env.MK_PG_CLIENT||'D:/Temp/modelkombat-postgres/client/node_modules/pg');
async function main(){const db=new PGlite(),clients=[];try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls');
 for(const name of ['bots-workshop-v8.sql','bots-workshop-journey.sql','bots-workshop-competition.sql','bots-workshop-reporter-read.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql',name),'utf8'));
 const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const wallet='0x'+'a'.repeat(40),owner=(await q('select mk8_wallet_player($1) id',[wallet]))[0].id,day=new Date().toISOString().slice(0,10);
 await q("update mk8_competitions set state='active',campaign_id='race-fixture',starts_at=now()-interval '1 day',ends_at=now()+interval '13 days'");
 await q("select mk8_competition_enter('workshop-competition-1',$1,'race-fixture')",[wallet]);
 const fresh=()=>({version:1,revision:0,coins:250,robots:[],spares:[],history:[],active:null,days:{},receipts:[]});
 const garages=[];
 for(let i=0;i<2;i++){
  const f={id:randomUUID(),mode:'house',robotId:'owned',waiting:true,startedAt:0},s={...fresh(),active:f};
  garages.push({id:(await q('insert into mk8_garages(player_id,state) values($1,$2) returning id',[owner,s]))[0].id,state:s});
  const c=new Client({host:'127.0.0.1',port:55487,user:'mk_test',database:db.database});await c.connect();clients.push(c);
 }
 for(let i=1;i<=11;i++)await q("insert into mk8_competition_attempts(fight_id,competition_id,wallet,garage_id,rules,started_at,start_day,ordinal) values($1,'workshop-competition-1',$2,$3,'workshop-house-1',now(),$4,$5)",[randomUUID(),wallet,garages[0].id,day,i]);
 const starts=await Promise.allSettled(garages.map((g,i)=>clients[i].query('select mk8_competition_commit($1,$2,0,$3,$4,null,null,$5)',[owner,g.id,'ready:'+g.state.active.id,{...g.state,revision:1,active:{...g.state.active,waiting:false,startedAt:1}},wallet])));
 assert.ok(starts.some(r=>r.status==='fulfilled'));assert.equal((await q('select count(*)::int n from mk8_competition_attempts'))[0].n,12,'only one final scored slot');
 // Two settlements race for the twelfth rewarded completion across garages.
 await q('insert into mk8_player_days(player_id,day,completed,bonus_paid) values($1,$2,11,true)',[owner,day]);
 for(const g of garages){g.state={...fresh(),active:{id:randomUUID(),mode:'house',robotId:'owned'}};await q('update mk8_garages set revision=0,state=$2 where id=$1',[g.id,g.state]);}
 const settles=await Promise.all(garages.map((g,i)=>clients[i].query('select mk8_journey_commit($1,$2,0,$3,$4,$5,null) s',[owner,g.id,'settle:'+g.state.active.id,{...g.state,revision:1,active:null,history:[{...g.state.active,coins:9999,winner:0}]},day])));
 assert.equal(settles.reduce((n,r)=>n+r.rows[0].s.coins-250,0),75,'only one final coin reward');
 assert.equal((await q('select completed from mk8_player_days where player_id=$1',[owner]))[0].completed,13,'both completions recorded, only the twelfth paid');
 const before=(await q('select sum((state->>\'coins\')::int)::int n from mk8_garages'))[0].n;
 await Promise.all(garages.map((g,i)=>clients[i].query('select mk8_journey_commit($1,$2,0,$3,$4,$5,null)',[owner,g.id,'settle:'+g.state.active.id,{...g.state,revision:1,coins:9999},day])));
 assert.equal((await q('select sum((state->>\'coins\')::int)::int n from mk8_garages'))[0].n,before);
 console.log('PASS real PostgreSQL: migration rehearsal; concurrent final competition slot; concurrent daily coin cap across garages; duplicate settlement cannot pay twice.');
 }finally{await Promise.all(clients.map(c=>c.end()));await db.close()}}
main().catch(e=>{console.error(e.message);process.exitCode=1});
