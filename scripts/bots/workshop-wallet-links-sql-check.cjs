const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require('./postgres-test-adapter.cjs');
async function main(){const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test bool default false,is_operator bool default false);
 create table battle_bots_fills(id bigint primary key,tx_hash text,wallet text,occurred_at timestamptz,leg text,usd_value numeric,attribution text,chain_id int,role text,token_address text);`);
 for(const f of ['bots-workshop-v8.sql','bots-workshop-journey.sql','bots-workshop-wallet-links.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql',f),'utf8'));
 // Safe to rerun the additive migration.
 await db.exec(fs.readFileSync(path.join(__dirname,'../sql/bots-workshop-wallet-links.sql'),'utf8'));
 const w=n=>'0x'+n.toString(16).padStart(40,'0'),wallet=w(1),mcp=w(2),other=w(3),now=new Date().toISOString();
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 await q('select mk8_wallet_player($1)',[wallet]);await q('select mk8_wallet_player($1)',[other]);
 await q('insert into battle_bots_players values($1,now(),true,false)',[w(4)]);
 const pending=await q('select * from mk8_wallet_discovery');assert.equal(pending.length,2);assert.ok(pending.every(r=>r.revision===0));
 const payload={schemaVersion:1,requestId:randomUUID(),wallet,mcpWallet:mcp,domaUserId:'599861',privyDid:'did:privy:example',status:'linked',checkedAt:now,expectedRevision:0};
 const resolve=async p=>(await q('select mk8_resolve_wallet($1) r',[p]))[0].r;
 assert.equal((await resolve(payload)).revision,1);assert.equal((await resolve(payload)).replayed,true);
 await assert.rejects(()=>resolve({...payload,mcpWallet:w(6)}),/MK_LINK_CONFLICT/);
 await assert.rejects(()=>resolve({...payload,requestId:randomUUID(),wallet:other}),/MK_LINK_REVIEW_REQUIRED/);
 await assert.rejects(()=>resolve({...payload,requestId:randomUUID(),wallet:w(9)}),/MK_LINK_UNREGISTERED/);
 await assert.rejects(()=>resolve({...payload,requestId:randomUUID(),expectedRevision:1,mcpWallet:w(6)}),/MK_LINK_REVIEW_REQUIRED/);
 const nf={...payload,requestId:randomUUID(),wallet:other,mcpWallet:null,domaUserId:null,privyDid:null,status:'not_found'};
 await resolve(nf);await assert.rejects(()=>resolve({...nf,requestId:randomUUID()}),/MK_LINK_CONFLICT/);
 await resolve({...payload,requestId:randomUUID(),wallet:other,mcpWallet:other,domaUserId:'123',expectedRevision:1});
 assert.equal((await q('select * from mk8_tracking_wallets where player_wallet=$1',[other])).length,1,'same address watched once');
 assert.equal((await q('select * from mk8_tracking_wallets where player_wallet=$1',[wallet])).length,2);
 const token='0x68e359b4a6d25448daaff1745059f3e716e22cf8';
 for(const [id,who,chain,tok,role] of [[1,wallet,97477,token,'buyer'],[2,mcp,97477,token,'buyer'],[3,mcp,1,token,'buyer'],[4,mcp,97477,w(99),'buyer'],[5,other,97477,token,'buyer'],[6,mcp,97477,token,'seller']])await q('insert into battle_bots_fills values($1,$2,$3,now(),$4,5,$5,$6,$7,$8)',[id,'0x'+String(id).repeat(64),who,'buy','manual',chain,role,tok]);
 const activity=async()=>(await q('select mk8_linked_trade_activity($1) r',[wallet]))[0].r;
 const a=await activity();assert.equal(a.recentObservedTrades.length,2);assert.equal(a.coverage,'unverified');assert.equal(a.rewardsCalculated,false);assert.ok(!JSON.stringify(a).includes('did:privy'));
 await q('delete from battle_bots_fills where id=2');assert.equal((await activity()).recentObservedTrades.length,1,'source corrections visible');
 // A later registration of the monitored address must not produce duplicate owners.
 await q('select mk8_wallet_player($1)',[mcp]);assert.equal((await q('select * from mk8_tracking_wallets where trade_wallet=$1',[mcp])).length,0);
 await db.exec('set role anon');await assert.rejects(activity,/permission denied/);await assert.rejects(()=>resolve(payload),/permission denied/);await assert.rejects(()=>q('select * from mk8_wallet_links'),/permission denied/);
 await db.exec('reset role;set role service_role');await assert.rejects(()=>q('update mk8_wallet_links set revision=99'),/permission denied/);
 console.log('PASS PostgreSQL: registered-only discovery, duplicate/revision protection, shared identity conflicts, retrying missing wallets, same-wallet dedupe, dual-address Gochujang-only reads, corrections, private mapping protection, no rewards.');
 }finally{await db.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
