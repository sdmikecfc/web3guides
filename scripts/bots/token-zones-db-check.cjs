const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require(process.env.BOTS_PGLITE_PATH||'D:/Temp/modelkombat-sql-check/node_modules/@electric-sql/pglite');
async function main(){const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test boolean default false,is_operator boolean default false)");
 for(const f of ['bots-workshop-v8.sql','bots-workshop-journey.sql','bots-workshop-competition.sql','bots-workshop-wallet-links.sql','bots-token-zones.sql','bots-token-zone-wallets.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql',f),'utf8'));
 // Exercise the upgrade independently too; it changes functions, not campaign data.
 await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-payout-policy.sql'),'utf8'));
 const q=async(s,a=[])=>(await db.query(s,a)).rows,call=async(n,p)=>(await q(`select ${n}($1::jsonb) v`,[JSON.stringify(p)]))[0].v;
 let view=(await q('select mkz_read(null) v'))[0].v;assert.equal(view.campaign.state,'draft');assert.equal(view.campaign.starts_at,null);assert.equal(view.volume,'0');
 const wallet='0x'+'a'.repeat(40),mcp='0x'+'b'.repeat(40),domain='0x'+'c'.repeat(40),quote='0x'+'d'.repeat(40),cid='model-kombat-zones-1';
 // A trading-only player must be discoverable without visiting the game.
 await q('select mkz_register_wallet($1)',[wallet]);
 const registered=(await q('select registered_at from mkz_registered_wallets where wallet=$1',[wallet]))[0].registered_at;
 await q('select mkz_register_wallet($1)',[wallet]);
 assert.deepEqual((await q('select registered_at from mkz_registered_wallets where wallet=$1',[wallet]))[0].registered_at,registered);
 assert.equal((await q('select status from mkz_wallet_discovery where wallet=$1',[wallet]))[0].status,'pending');
 for(const table of ['mk8_players','mk8_garages','mk8_workshops','mkz_entries'])assert.equal((await q(`select count(*)::int n from ${table}`))[0].n,0);
 await q('set role anon');await assert.rejects(()=>q('select mkz_register_wallet($1)',[wallet]),/permission denied/);await assert.rejects(()=>q('select * from mkz_registered_wallets'),/permission denied/);await q('reset role');
 await call('mkz_resolve_wallet',{schemaVersion:1,requestId:randomUUID(),wallet,mcpWallet:mcp,domaUserId:'12345',privyDid:null,status:'linked',checkedAt:new Date().toISOString(),expectedRevision:0});
 assert.equal((await q('select count(*)::int n from mkz_tracking_wallets where player_wallet=$1',[wallet]))[0].n,2);
 console.log('PASS sign-in-only wallet discovery: stable retry, linked execution wallet, no garage/coins/entry and no public registration access.');
 await assert.rejects(()=>q('select mkz_enter($1)',[wallet]),/NOT_OPEN/);
 await assert.rejects(()=>q("update mkz_campaigns set state='active',financial_method='fixture-reviewed',starts_at=now()-interval '4 days',ends_at=now()+interval '24 days'"),/REWARDS_AND_MARKETS/);
 const fixtures=[['USDC',1000,5000],['DEPIN.ai',3304.58,25000],['ALERT.ai',968.60,50000],['BRAG.com',3440.80,100000],['INVESTORS.xyz',13966.48,175000],['RIDES.com',3543.22,250000],['BONER.com',2261.22,400000],['GOCHUJANG.com',619.06,550000],['SOFTWARE.ai',2437.97,750000]];
 for(let i=0;i<fixtures.length;i++){const [symbol,quantity,threshold]=fixtures[i];await q('insert into mkz_reward_assets(symbol,chain_id,address,decimals,funded_units,required_quantity,threshold,liquid_pair,verified_at) values($1,97477,$2,6,$3,$4,$5,$6,now())',[symbol,'0x'+String(i+1).padStart(40,'0'),0,quantity,threshold,'0x'+'e'.repeat(40)]);}
 await q('insert into mkz_markets values(97477,$1,$2,$3,$4,$5,now())',[domain,quote,'fixture.example','USDC','fixture registry']);
 await q("update mkz_campaigns set state='active',financial_method='fixture-reviewed',starts_at=date_trunc('day',now())-interval '4 days',ends_at=date_trunc('day',now())+interval '24 days'");
 await q('select mkz_enter($1)',[wallet]);await q('select mkz_enter($1)',[wallet]);assert.equal((await q('select count(*)::int n from mkz_entries'))[0].n,1);
 await q("update mkz_entries set entered_at=(select starts_at from mkz_campaigns)");
 const c=(await q('select starts_at from mkz_campaigns'))[0],start=new Date(c.starts_at).toISOString(),now=new Date().toISOString();
 const fill=(id,day,source='agent_wallet')=>({chainId:97477,economicId:id,revision:1,wallet:source==='strategy'?wallet:mcp,transactionHash:'0x'+id.padStart(64,'0'),domainToken:domain,quoteToken:quote,executedAt:new Date(Date.parse(start)+day*86400000+1000).toISOString(),volumeUsd:'2500.000000',source,status:'verified',evidence:'fixture completed economic fill'});
 const packet={schemaVersion:1,rules:'mk-token-zones-1',campaignId:cid,requestId:randomUUID(),coverageFrom:start,confirmedThrough:now,complete:true,financialComplete:true,methodology:'fixture-reviewed',financials:[{participant:'12345',roi:'2.5',profit:'12',evidence:'fixture opening capital and fills'}],fills:[fill('1',0),fill('2',1,'strategy'),fill('3',2)]};
 assert.equal((await call('mkz_ingest',packet)).ok,true);assert.equal((await call('mkz_ingest',packet)).replayed,true);
 view=(await q('select mkz_read($1) v',[wallet]))[0].v;assert.equal(Number(view.volume),7500);assert.equal(view.participants[0].times.length,3);
 await q("update mkz_financials set roi='2.500000000000000001'::numeric where participant='12345'");
 assert.equal((await q("select roi::text from mkz_financials where participant='12345'"))[0].roi,'2.500000000000000001');
 await assert.rejects(()=>call('mkz_ingest',{...packet,complete:false}),/BATCH_CONFLICT/);
 await assert.rejects(()=>call('mkz_ingest',{...packet,requestId:randomUUID(),fills:[{...packet.fills[0],volumeUsd:'999'}]}),/FILL_REVISION_CONFLICT/);
 await call('mkz_ingest',{...packet,requestId:randomUUID(),fills:[{...packet.fills[2],revision:2,status:'revoked'}]});
 view=(await q('select mkz_read($1) v',[wallet]))[0].v;assert.equal(Number(view.volume),5000);assert.equal(view.participants[0].times.length,2);
 await assert.rejects(()=>call('mkz_ingest',{...packet,requestId:randomUUID(),fills:[{...fill('4',3),quoteToken:domain}]}),/foreign key/);
 await assert.rejects(()=>call('mkz_ingest',{...packet,requestId:randomUUID(),fills:[{...fill('4',3),wallet}]}),/AGENT_WALLET/);
 await assert.rejects(()=>q("update mkz_campaigns set state='frozen'"),/INVALID_CAMPAIGN_TRANSITION/);
 await assert.rejects(()=>q("update mkz_campaigns set state='draft',starts_at=null,ends_at=null"),/INVALID_CAMPAIGN_TRANSITION/);
 await assert.rejects(()=>q("update mkz_reward_assets set required_quantity=999 where symbol='USDC'"),/REWARD_DEFINITION_LOCKED/);
 await assert.rejects(()=>q("update mkz_campaigns set financial_method='changed'"),/FROZEN_RULES/);
 await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zones.sql'),'utf8'));assert.equal((await q('select state from mkz_campaigns'))[0].state,'active');await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-wallets.sql'),'utf8'));
 const alias='0x'+'f'.repeat(40);await q('insert into battle_bots_players(wallet,enlisted_at) values($1,now())',[alias]);const link={schemaVersion:1,requestId:randomUUID(),wallet:alias,mcpWallet:mcp,domaUserId:'12345',privyDid:null,status:'linked',checkedAt:new Date().toISOString(),expectedRevision:0};await call('mkz_resolve_wallet',link);await q('select mkz_enter($1)',[alias]);assert.equal((await q('select count(*)::int n from mkz_entries'))[0].n,1);assert.equal((await q('select mkz_read($1) v',[alias]))[0].v.own,'12345');await assert.rejects(()=>call('mkz_resolve_wallet',{...link,requestId:randomUUID(),expectedRevision:1,domaUserId:'999'}),/REVIEW_REQUIRED/);
 const owner=(await q('select mk8_wallet_player($1) id',[wallet]))[0].id;
 const fresh=()=>({version:1,revision:0,coins:250,robots:[],spares:[],history:[],active:null,days:{},receipts:[]});
 const garages=[];for(let i=0;i<2;i++)garages.push((await q('insert into mk8_garages(player_id,state) values($1,$2) returning id',[owner,JSON.stringify(fresh())]))[0].id);
 const read=async(g)=>(await q('select state from mk8_garages where id=$1',[g]))[0].state;
 const commit=async(g,s,key,next,day=null,auth=wallet,pub=null)=>(await q('select mkz_commit($1,$2,$3,$4,$5,$6,$7,$8) s',[owner,g,s.revision,key,JSON.stringify(next),day,pub===null?null:JSON.stringify(pub),auth]))[0].s;
 async function ready(g,mode='house',robot='owned',auth=wallet){let s=await read(g);const fid=randomUUID();s=await commit(g,s,'start:'+fid,{...s,revision:s.revision+1,active:{id:fid,mode,robotId:robot,waiting:true,startedAt:0}});return commit(g,s,'ready:'+fid,{...s,revision:s.revision+1,active:{...s.active,waiting:false,startedAt:1}},null,auth)}
 async function settle(g,s,winner=0,pub=null){const f={...s.active,completedAt:s.active.startedAt+10,winner,coins:999};return commit(g,s,'settle:'+f.id,{...s,revision:s.revision+1,active:null,history:[f,...s.history]},new Date(f.completedAt).toISOString().slice(0,10),wallet,pub)}
 for(const [mode,robot,auth] of [['training','owned',wallet],['house',null,wallet],['house','owned',null]]){let s=await ready(garages[0],mode,robot,auth);assert.equal(s.active.competition.status,'not_scored');await settle(garages[0],s)}
 for(let i=0;i<12;i++){const g=garages[i%2];let s=await ready(g);assert.equal(s.active.competition.status,'reserved');const before=s;s=await settle(g,s);assert.equal(s.history[0].competition.points,1);assert.deepEqual(await settle(g,before),s)}
 let s=await ready(garages[0]);assert.match(s.active.competition.reason,/12/);await settle(garages[0],s);
 assert.equal((await q('select count(*)::int n from mkz_attempts'))[0].n,12);
 await q('update mkz_attempts set start_day=start_day-1');s=await ready(garages[0]);await assert.rejects(()=>settle(garages[0],s,0,{id:'bad-uuid',completedAt:s.active.startedAt+10}));assert.equal((await q('select completed_at from mkz_attempts where fight_id=$1',[s.active.id]))[0].completed_at,null);await settle(garages[0],s);
 if(db.database){
  const {Client}=require('D:/Temp/modelkombat-postgres/client/node_modules/pg');
  const aliasOwner=(await q('select mk8_wallet_player($1) id',[alias]))[0].id;
  const pair=[{owner,wallet,g:garages[0]},{owner:aliasOwner,wallet:alias,g:(await q('insert into mk8_garages(player_id,state) values($1,$2) returning id',[aliasOwner,JSON.stringify(fresh())]))[0].id}];
  await q('delete from mkz_attempts');
  for(let i=1;i<=11;i++)await q('insert into mkz_attempts(fight_id,campaign_id,participant,garage_id,started_at,start_day,ordinal) values($1,$2,$3,$4,now(),(now() at time zone \'UTC\')::date,$5)',[randomUUID(),cid,'12345',garages[0],i]);
  for(const r of pair){r.s={...fresh(),active:{id:randomUUID(),mode:'house',robotId:'owned',waiting:true,startedAt:0}};await q('update mk8_garages set revision=0,state=$2 where id=$1',[r.g,JSON.stringify(r.s)]);}
  const clients=pair.map(()=>new Client({host:'127.0.0.1',port:55487,user:'mk_test',database:db.database}));
  try{await Promise.all(clients.map(c=>c.connect()));const results=await Promise.all(pair.map((r,i)=>clients[i].query('select mkz_commit($1,$2,0,$3,$4,null,null,$5) s',[r.owner,r.g,'ready:'+r.s.active.id,JSON.stringify({...r.s,revision:1,active:{...r.s.active,waiting:false}}),r.wallet])));assert.equal(results.filter(r=>r.rows[0].s.active.competition.status==='reserved').length,1);assert.equal((await q('select count(*)::int n from mkz_attempts'))[0].n,12);}finally{await Promise.all(clients.map(c=>c.end()));}
  console.log('PASS real PostgreSQL: simultaneous starts by two linked wallets reserve only one remaining participant slot.');
 }
 await q("update mkz_campaigns set state='closed'");
 await assert.rejects(()=>q("select mkz_finalize(mkz_read(null),'[]')"),/RECONCILIATION/);
 // Only this isolated fixture advances its clock by shifting dated records.
 await q('alter table mkz_campaigns disable trigger mkz_campaign_guard');
 await q("update mkz_campaigns set starts_at=starts_at-interval '60 days',ends_at=ends_at-interval '60 days',confirmed_through=ends_at-interval '60 days',complete=true,financial_complete=true");
 await q('alter table mkz_campaigns enable trigger mkz_campaign_guard');
 await q("update mkz_entries set entered_at=entered_at-interval '60 days'");
 await q("update mkz_fills set executed_at=executed_at-interval '60 days'");
 await assert.rejects(()=>q("update mkz_campaigns set state='frozen'"),/FINAL_AWARDS_REQUIRED/);
 view=(await q('select mkz_read(null) v'))[0].v;
 await assert.rejects(()=>q('select mkz_finalize($1,$2)',[JSON.stringify({...view,volume:'9000'}),'[]']),/SOURCE_CHANGED/);
 await assert.rejects(()=>q('select mkz_finalize($1,$2)',[JSON.stringify(view),JSON.stringify([{id:'12345',symbol:'USDC',units:'1000000001'}])]),/AWARD_BUDGET/);
 assert.equal((await q('select count(*)::int n from mkz_awards'))[0].n,0);
 // Corrected third trading day qualifies the participant. Awards can be frozen
 // before the organizer funds the eventual transfer, without changing the budget.
 await q("update mkz_fills set status='verified' where economic_id='3'");
 view=(await q('select mkz_read(null) v'))[0].v;
 assert.equal((await q('select sum(funded_units)::text n from mkz_reward_assets'))[0].n,'0');
 const earned=JSON.stringify([{id:'12345',symbol:'USDC',units:'1000000000'}]);
 assert.equal((await q('select mkz_finalize($1,$2) v',[JSON.stringify(view),earned]))[0].v.ok,true);
 assert.equal((await q('select mkz_finalize($1,$2) v',[JSON.stringify(view),earned]))[0].v.replayed,true);
 assert.equal((await q('select sum(units)::text n from mkz_awards'))[0].n,'1000000000');
 await assert.rejects(()=>q("update mkz_fills set status='revoked'"),/FINAL_RESULTS_FROZEN/);
 await assert.rejects(()=>q("update mkz_campaigns set complete=false"),/FINAL_RESULTS_FROZEN/);
 console.log('PASS isolated PostgreSQL: migrations, draft/identity gates with zero prefunding, corrections, 12 starts across garages, exclusions, settlement retries, rollback, immutable rewards and atomic finalization.');
 }finally{await db.close()}}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
