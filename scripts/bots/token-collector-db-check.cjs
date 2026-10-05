// Runs only against the disposable loopback PostgreSQL adapter. No production URL.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require('./postgres-test-adapter.cjs');
async function main(){const db=new PGlite();try{
 const q=async(s,a=[])=>(await db.query(s,a)).rows;
 const call=async(n,p)=>(await q(`select ${n}($1::jsonb) v`,[JSON.stringify(p)]))[0].v;
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create table battle_bots_players(wallet text primary key,enlisted_at timestamptz,is_test boolean default false,is_operator boolean default false)");
 await db.exec("do $$begin if not exists(select from pg_roles where rolname='doma_ai_mk') then create role doma_ai_mk nologin;end if;end $$");
 for(const f of ['bots-workshop-v8','bots-workshop-journey','bots-workshop-competition','bots-workshop-wallet-links','bots-token-zones','bots-token-zone-wallets','bots-token-zone-payout-policy','bots-token-zone-collector'])await db.exec(fs.readFileSync(path.join(__dirname,'../sql',f+'.sql'),'utf8'));
 const collectorSql=fs.readFileSync(path.join(__dirname,'../sql/bots-token-zone-collector.sql'),'utf8');
 await db.exec(collectorSql); // Repeat grants/setup must preserve all existing records.
 const wallet='0x'+'a'.repeat(40),mcp='0x'+'b'.repeat(40),domain='0x'+'c'.repeat(40),quote='0x'+'d'.repeat(40);
 await q('select mkz_register_wallet($1)',[wallet]);
 await q('insert into mkz_markets values(97477,$1,$2,$3,$4,$5,now())',[domain,quote,'fixture.example','USDC','isolated registry fixture']);
 await q('set role doma_ai_mk');
 assert.equal((await q('select mkz_collector_manifest() v'))[0].v.campaign.state,'draft');
 assert.deepEqual((await q("select mkz_collector_wallets('pending',null) v"))[0].v.wallets.map(x=>x.wallet),[wallet]);
 for(const sql of ['select * from mkz_wallet_links','select * from mk8_garages',"update mkz_campaigns set state='active'",'select mkz_read(null)',`select mkz_enter('${wallet}')`,`select mkz_register_wallet('${mcp}')`,"select mkz_finalize('{}','[]')"]){await assert.rejects(()=>q(sql),/permission denied/)}
 const link={schemaVersion:1,requestId:randomUUID(),wallet,mcpWallet:mcp,domaUserId:'12345',privyDid:null,status:'linked',checkedAt:new Date().toISOString(),expectedRevision:0};
 assert.equal((await call('mkz_collector_resolve',link)).ok,true);
 assert.equal((await call('mkz_collector_resolve',link)).replayed,true);
 await assert.rejects(()=>call('mkz_collector_resolve',{...link,domaUserId:'999'}),/CONFLICT/);
 assert.equal((await q("select mkz_collector_wallets('pending',null) v"))[0].v.wallets.length,0);
 assert.deepEqual((await q("select mkz_collector_wallets('monitor',null) v"))[0].v.wallets[0].tradeWallets,[wallet,mcp]);
 const cutoff=new Date().toISOString(),from=new Date(Date.now()-86400000).toISOString();
 const fill={chainId:97477,economicId:'settlement:fixture:0',revision:1,wallet:mcp,transactionHash:'0x'+'1'.repeat(64),domainToken:domain,quoteToken:quote,executedAt:from,volumeUsd:'25.123456',source:'agent_wallet',status:'verified',evidence:'Isolated settled order fixture'};
 const packet={schemaVersion:1,rules:'mk-token-zones-1',campaignId:'model-kombat-zones-1',requestId:randomUUID(),coverageFrom:from,confirmedThrough:cutoff,complete:false,financialComplete:false,financials:[],fills:[fill]};
 const check=await call('mkz_collector_check',packet);assert.equal(check.ok,true);assert.equal(check.writesPerformed,0);assert.equal(check.checked.mappedFills,1);assert.equal(check.checked.registeredMarketFills,1);assert.equal(check.ingestionOpen,false);
 await assert.rejects(()=>call('mkz_collector_ingest',packet),/CAMPAIGN_NOT_ACCEPTING/);
 for(const bad of [null,[],{...packet,schemaVersion:2},{...packet,complete:'true'},{...packet,confirmedThrough:'2026-02-30T00:00:00Z'}, {...packet,fills:[fill,fill]}, {...packet,fills:[{...fill,revision:1.5}]}, {...packet,fills:[{...fill,revision:'1'}]}, {...packet,fills:[{...fill,volumeUsd:'0'}]}, {...packet,fills:[{...fill,volumeUsd:'NaN'}]}, {...packet,fills:[{...fill,volumeUsd:'0.0000001'}]}, {...packet,fills:[{...fill,economicId:'x'+' '.repeat(160)}]}, {...packet,fills:[{...fill,evidence:' '.repeat(1001)}]}, {...packet,financials:[{participant:'12345',roi:'1',profit:'1',evidence:'fixture'}]}, {...packet,fills:Array(2001).fill(fill)}, {...packet,unexpected:'x'.repeat(2000000)}])await assert.rejects(()=>call('mkz_collector_check',bad),/MKZ_BATCH_INVALID/);
 assert.equal((await call('mkz_collector_check',{...packet,fills:[{...fill,wallet,source:'agent_wallet'}]})).issues[0].code,'agent_wallet_unverified');
 assert.equal((await call('mkz_collector_check',{...packet,fills:[{...fill,wallet:'0x'+'f'.repeat(40)}]})).issues[0].code,'wallet_unmapped');
 assert.equal((await call('mkz_collector_check',{...packet,fills:[{...fill,domainToken:quote,quoteToken:domain}]})).issues[0].code,'market_unverified');
 await q('reset role');
 for(const table of ['mkz_batches','mkz_fills','mkz_entries','mkz_financials','mkz_awards','mk8_garages'])assert.equal((await q(`select count(*)::int n from ${table}`))[0].n,0);
 // More than one Supabase-default page: collector must see every wallet.
 await q("insert into mkz_registered_wallets(wallet) select '0x'||lpad(to_hex(i),40,'0') from generate_series(1,501) i");
 await q('set role doma_ai_mk');let cursor=null,found=[];do{const page=(await q("select mkz_collector_wallets('all',$1) v",[cursor]))[0].v;found.push(...page.wallets.map(x=>x.wallet));cursor=page.nextCursor;}while(cursor);
 assert.equal(found.length,502);assert.equal(new Set(found).size,502);
 await q('reset role');
 const assets=[['USDC','1000',5000],['DEPIN.ai','3304.58',25000],['ALERT.ai','968.60',50000],['BRAG.com','3440.80',100000],['INVESTORS.xyz','13966.48',175000],['RIDES.com','3543.22',250000],['BONER.com','2261.22',400000],['GOCHUJANG.com','619.06',550000],['SOFTWARE.ai','2437.97',750000]];
 for(let i=0;i<assets.length;i++){const [symbol,quantity,threshold]=assets[i];await q('insert into mkz_reward_assets(symbol,chain_id,address,decimals,funded_units,required_quantity,threshold,liquid_pair,verified_at) values($1,97477,$2,6,0,$3,$4,$5,now())',[symbol,'0x'+String(i+1).padStart(40,'0'),quantity,threshold,'0x'+'e'.repeat(40)]);}
 await q("update mkz_campaigns set state='active',financial_method='fixture-reviewed',starts_at=date_trunc('day',now())-interval '2 days',ends_at=date_trunc('day',now())+interval '26 days'");
 await q('select mkz_enter($1)',[wallet]);await q("update mkz_entries set entered_at=(select starts_at from mkz_campaigns)");
 const start=new Date((await q('select starts_at from mkz_campaigns'))[0].starts_at).toISOString();
 const live={...packet,coverageFrom:start,complete:true,financialComplete:true,methodology:'fixture-reviewed',financials:[{participant:'12345',roi:'2.000000000000000001',profit:'10.001',evidence:'isolated FIFO fixture'}]};
 await q('set role doma_ai_mk');assert.equal((await call('mkz_collector_check',live)).ok,true);
 assert.equal((await call('mkz_collector_ingest',live)).ok,true);assert.equal((await call('mkz_collector_ingest',live)).replayed,true);
 await assert.rejects(()=>call('mkz_collector_ingest',{...live,complete:false}),/BATCH_CONFLICT/);
 await assert.rejects(()=>call('mkz_collector_ingest',{...live,requestId:randomUUID(),fills:[{...fill,volumeUsd:'99'}]}),/FILL_REVISION_CONFLICT/);
 await call('mkz_collector_ingest',{...live,requestId:randomUUID(),fills:[{...fill,revision:2,status:'revoked'}]});
 await q('reset role');assert.equal(Number((await q('select mkz_read(null) v'))[0].v.volume),0);
 const before=(await q('select * from mkz_campaigns'))[0];await db.exec(collectorSql);assert.deepEqual((await q('select * from mkz_campaigns'))[0],before);
 // A different database without the historical role must not acquire a new login.
 const absent='mk_absent_'+randomUUID().replaceAll('-','');
 await db.exec(collectorSql.replaceAll('doma_ai_mk',absent));
 assert.equal((await q('select exists(select from pg_roles where rolname=$1) present',[absent]))[0].present,false);
 for(const role of ['anon','authenticated']){await q('set role '+role);for(const sql of ['select mkz_collector_manifest()',"select mkz_collector_wallets('all',null)","select mkz_collector_resolve('{}')","select mkz_collector_check('{}')","select mkz_collector_ingest('{}')"])await assert.rejects(()=>q(sql),/permission denied/);await q('reset role');}
 console.log('PASS real PostgreSQL: original collector role, scoped permissions, 502-wallet pagination, mapping retries, read-only draft checks, invalid batches, active ingestion, corrections, no duplicate scores, no grants/coins/opening, repeat-safe upgrade.');
 }finally{await db.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
