const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.BOTS_PGLITE_PATH||'D:/Temp/modelkombat-sql-check/node_modules/@electric-sql/pglite');
async function main(){const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls');
 for(const name of ['bots-workshop-v8.sql','bots-workshop-journey.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql',name),'utf8'));
 await db.exec('set role service_role');
 const fresh=()=>({version:1,revision:0,coins:250,welcomed:false,robots:[],spares:[],history:[],draft:null,selected:null,active:null,days:{},receipts:[]});
 const query=async(sql,args=[])=>(await db.query(sql,args)).rows;
 const enroll=async(hash,bucket)=>(await query('select mk8_guest_enroll($1,$2,$3) as id',[hash,bucket,JSON.stringify(fresh())]))[0].id;
 const a=await enroll('1'.repeat(64),'first'),again=await enroll('1'.repeat(64),'first');assert.equal(a,again);
 const g=(await query('select * from mk8_garages where player_id=$1',[a]))[0];assert.equal(g.state.coins,250);
 const commit=async(owner,garage,old,id,next,day=null)=>(await query('select mk8_journey_commit($1,$2,$3,$4,$5,$6,null) as state',[owner,garage,old,id,JSON.stringify(next),day]))[0].state;
 let state=await commit(a,g.id,0,'buy-test-001',{...fresh(),revision:1,coins:200});
 assert.equal((await commit(a,g.id,0,'buy-test-001',{...fresh(),revision:1,coins:200})).coins,200);
 await assert.rejects(()=>commit(a,g.id,0,'buy-stale-01',{...fresh(),revision:1}),/REVISION_CONFLICT/);
 async function settle(owner,garage,s,mode,id){
  const active={id,mode};s=await commit(owner,garage,s.revision,`start:${id}`,{...s,revision:s.revision+1,active});
  const fight={...active,coins:9999};return commit(owner,garage,s.revision,`settle:${id}`,{...s,revision:s.revision+1,coins:9999,active:null,history:[fight,...s.history],journey:{version:1,trainingCompleted:mode==='training'||!!s.journey?.trainingCompleted,retained:{}}},'2026-09-24');
 }
 state=await settle(a,g.id,state,'training','training-one');assert.equal(state.coins,275);
 state=await settle(a,g.id,state,'training','training-two');assert.equal(state.coins,275,'Training replay must not earn again');
 for(let n=0;n<5;n++)state=await settle(a,g.id,state,'house',`house-a-${n}`);
 assert.equal(state.coins,750,'Six eligible finishes: 6x75+100, minus the earlier purchase');
 const b=await enroll('2'.repeat(64),'second'),g2=(await query('select * from mk8_garages where player_id=$1',[b]))[0];
 let s2=await settle(b,g2.id,fresh(),'house','house-b-1');
 const wallet='0x'+'a'.repeat(40);
 const claim=async(h)=>(await query('select mk8_claim_guest($1,$2) as id',[wallet,h]))[0].id;
 const linked=await claim('1'.repeat(64));assert.equal(await claim('1'.repeat(64)),linked);
 await claim('2'.repeat(64));
 const all=await query('select * from mk8_garages where player_id=$1',[linked]);assert.equal(all.length,2);assert.equal(all.find(x=>x.id===g.id).state.coins,750);assert.equal(all.find(x=>x.id===g2.id).state.coins,325);
 const day=(await query('select * from mk8_player_days where player_id=$1',[linked]))[0];assert.equal(day.completed,7);assert.equal(day.bonus_paid,true);
 for(let n=0;n<6;n++)s2=await settle(linked,g2.id,s2,'house',`shared-${n}`);
 assert.equal(s2.coins,700,'Only five entries remain across the two garages; no repeated sixth-fight bonus');
 assert.equal((await query('select revoked from mk8_guest_sessions')).every(x=>x.revoked),true);
 await assert.rejects(()=>commit(a,g.id,state.revision,'old-owner-001',{...state,revision:state.revision+1}),/GARAGE_NOT_FOUND/);
 await assert.rejects(()=>query('select mk8_claim_guest($1,$2)',['0x'+'b'.repeat(40),'1'.repeat(64)]),/SESSION_EXPIRED/);
 const used=(await query('select count(*)::int as n from mk8_players'))[0].n;
 for(let n=0;n<10;n++)await enroll((100+n).toString(16).padStart(64,'0'),'rate');
 await assert.rejects(()=>enroll('f'.repeat(64),'rate'),/ENROLLMENT_LIMIT/);
 assert.equal((await query('select count(*)::int as n from mk8_players'))[0].n,used+10);

 // Existing wallet data migrates once, with its exact balance and inventory.
 const oldWallet='0x'+'c'.repeat(40),oldState={...fresh(),revision:4,coins:1234,spares:[{uid:'kept',item:'kept'}],days:{'2026-09-24':4}};
 await query('insert into mk8_workshops(wallet,state,revision) values($1,$2,4)',[oldWallet,JSON.stringify(oldState)]);
 const migrated=(await query('select mk8_wallet_player($1) as id',[oldWallet]))[0].id;
 await query('select mk8_wallet_player($1)',[oldWallet]);
 assert.deepEqual((await query('select state from mk8_garages where player_id=$1',[migrated]))[0].state,oldState);
 assert.equal((await query('select completed from mk8_player_days where player_id=$1',[migrated]))[0].completed,4);
 // A failed public-replay insert rolls the entire settlement back.
 const failureOwner=await enroll('9'.repeat(64),'rollback'),failureGarage=(await query('select * from mk8_garages where player_id=$1',[failureOwner]))[0];
 const active={id:'rollback-fight',mode:'house'};await commit(failureOwner,failureGarage.id,0,'start:rollback-fight',{...fresh(),revision:1,active});
 await assert.rejects(()=>query('select mk8_journey_commit($1,$2,1,$3,$4,$5,$6)',[failureOwner,failureGarage.id,'settle:rollback-fight',JSON.stringify({...fresh(),revision:2,active:null,history:[active]}),'2026-09-24',JSON.stringify({id:'invalid-uuid',completedAt:1})]));
 assert.equal((await query('select revision from mk8_garages where id=$1',[failureGarage.id]))[0].revision,1);
 assert.equal((await query('select count(*)::int as n from mk8_player_days where player_id=$1',[failureOwner]))[0].n,0);

 await db.exec('reset role;set role anon');await assert.rejects(()=>query('select * from mk8_garages'),/permission denied/);await assert.rejects(()=>enroll('a'.repeat(64),'anon'),/permission denied/);
 console.log('PASS: guest idempotency, stale writes, one training reward, shared daily cap, atomic claim/retry, independent inventories, revoked guest access, enrollment limits and RLS.');
}finally{await db.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
