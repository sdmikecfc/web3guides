const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {PGlite}=require(process.env.BOTS_PGLITE_PATH||'@electric-sql/pglite');
const stage=process.env.BOTS_SEASON_STAGE||path.resolve(__dirname,'..'),root=process.env.BOTS_REPO_ROOT||path.resolve(__dirname,'..'),db=new PGlite();
const one=async(q,p=[])=>(await db.query(q,p)).rows[0],checks=[];
const pass=name=>{checks.push(name);console.log('PASS',name);};
const wallet=n=>'0x'+n.toString(16).padStart(40,'0'),tx=n=>'0x'+n.toString(16).padStart(64,'0');
const now=Date.now(),executedAt=new Date(now-600000).toISOString(),joinedAt=new Date(now-1200000).toISOString();
const oldClause="IF NOT EXISTS(SELECT 1 FROM public.mk_mcp_watchlist w WHERE w.wallet = t->>'wallet' AND w.enlisted_at <= executed)";
const newClause=oldClause+"\n        AND NOT EXISTS(SELECT 1 FROM public.mk6_mcp_watchlist w WHERE w.wallet = t->>'wallet' AND w.enlisted_at <= executed)";
function fill(n,w){return {networkId:'eip155:97477',txHash:tx(n),eventIndex:0,sourceFillId:'fixture-'+n,wallet:w,marketAddress:wallet(900),tokenIn:wallet(901),tokenOut:wallet(902),amountIn:'1000',amountOut:'900',executedAt,usdValue:'10.000000',valuationSource:'isolated fixture',source:'doma_mcp',tool:'tokens.swap.v1',executionId:'exec-'+n,orderId:null,strategyId:null,status:'finalized',revision:1,correctionReason:null};}
function batch(trades){return {schemaVersion:1,batchId:randomUUID(),windowStart:new Date(now-900000).toISOString(),windowEnd:new Date(now-300000).toISOString(),complete:true,trades};}
async function ingest(body){return (await one('SELECT mk_mcp_ingest($1,$2,$3::jsonb) AS result',[body.batchId,createHash('sha256').update(JSON.stringify(body)).digest('hex'),JSON.stringify(body)])).result;}
(async()=>{
 try{
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE doma_ai_ro; CREATE TABLE battle_bots_players(wallet text PRIMARY KEY,enlisted_at timestamptz,is_test boolean DEFAULT false,is_operator boolean DEFAULT false);');
  await db.exec(fs.readFileSync(path.join(root,'scripts/sql/bots-mcp-trades-v1.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(stage,'scripts/sql/bots-season-v1.sql'),'utf8'));
  await db.query("INSERT INTO mk6_seasons(id,name,starts_at,ends_at,enabled) VALUES('old-season','Old',now()-interval '15 days',now()-interval '1 day',false),('new-season','New',now()-interval '1 day',now()+interval '13 days',true)");
  await db.query('INSERT INTO battle_bots_players(wallet,enlisted_at,is_test,is_operator) VALUES($1,$4,false,false),($2,$4,true,false),($3,$4,false,true)',[wallet(1),wallet(4),wallet(5),joinedAt]);
  for(const w of[wallet(2),wallet(4),wallet(5)])await db.query("INSERT INTO mk6_players(season_id,wallet,joined_at) VALUES('new-season',$1,$2)",[w,joinedAt]);
  await db.query("INSERT INTO mk6_players(season_id,wallet,joined_at,archived_at) VALUES('old-season',$1,$2,now())",[wallet(2),new Date(now-1500000).toISOString()]);
  await db.query("INSERT INTO mk6_players(season_id,wallet,joined_at) VALUES('new-season',$1,now())",[wallet(6)]);
  await db.query("INSERT INTO mk_mcp_markets(network_id,market_address,token_a,token_b,enabled) VALUES('eip155:97477',$1,$2,$3,true)",[wallet(900),wallet(901),wallet(902)]);
  const before=(await one("SELECT pg_get_functiondef('mk_mcp_ingest(uuid,text,jsonb)'::regprocedure) AS body")).body;
  const beforeView=(await one("SELECT pg_get_viewdef('mk_mcp_watchlist'::regclass) AS body")).body;
  const privileges=(await one("SELECT proacl::text AS value FROM pg_proc WHERE oid='mk_mcp_ingest(uuid,text,jsonb)'::regprocedure")).value;
  const migration=fs.readFileSync(path.join(stage,'scripts/sql/bots-season-v1-mcp-watchlist.sql'),'utf8');
  await db.exec(migration);await db.exec(migration);
  const after=(await one("SELECT pg_get_functiondef('mk_mcp_ingest(uuid,text,jsonb)'::regprocedure) AS body")).body;
  assert.equal(after.replace(newClause,oldClause),before);
  assert.equal((await one("SELECT pg_get_viewdef('mk_mcp_watchlist'::regclass) AS body")).body,beforeView);
  assert.equal((await one("SELECT proacl::text AS value FROM pg_proc WHERE oid='mk_mcp_ingest(uuid,text,jsonb)'::regprocedure")).value,privileges);
  pass('migration changes only intake enrollment clause; all canonical validations, old watchlist and RPC grants preserved; rerun is idempotent');
  const list=(await db.query('SELECT wallet,enlisted_at FROM mk6_mcp_watchlist ORDER BY wallet')).rows;
  assert.deepEqual(list.map(r=>r.wallet),[wallet(2),wallet(6)]);
  assert(Math.abs(Date.parse(list[0].enlisted_at)-(now-1500000))<1000);
  assert.equal((await one("SELECT has_table_privilege('doma_ai_ro','mk6_mcp_watchlist','SELECT') AS allowed")).allowed,true);
  for(const role of['anon','authenticated'])assert.equal((await one("SELECT has_table_privilege($1,'mk6_mcp_watchlist','SELECT') AS allowed",[role])).allowed,false);
  assert.equal((await one("SELECT has_table_privilege('doma_ai_ro','mk6_players','SELECT') AS allowed")).allowed,false);
  pass('watchlist has exact read contract, deduplicates earliest enrollment including archive, excludes test/operator and grants no underlying-table access');
  assert.equal((await ingest(batch([fill(1,wallet(1))]))).inserted,1);
  const seasonal=batch([fill(2,wallet(2))]);assert.equal((await ingest(seasonal)).inserted,1);assert.equal((await ingest(seasonal)).replayed,true);
  for(const n of[3,4,5,6])await assert.rejects(()=>ingest(batch([fill(n,wallet(n))])),/not eligible/);
  pass('old and season-only wallets ingest through same signed-source RPC; unknown/test/operator and pre-enrollment executions fail closed; duplicate batch is one fill');
  const invalid=fill(20,wallet(2));invalid.tokenOut=wallet(903);await assert.rejects(()=>ingest(batch([invalid])),/allowlisted/);
  const duplicate=fill(2,wallet(2));duplicate.usdValue='11.000000';await assert.rejects(()=>ingest(batch([duplicate])),/correction/);
  const correction={...fill(2,wallet(2)),revision:2,status:'reverted',usdValue:'0.000000',correctionReason:'Source reversed fill'};
  await db.query("UPDATE mk6_players SET archived_at=now() WHERE wallet=$1",[wallet(2)]);
  assert.equal((await ingest(batch([correction]))).updated,1);
  assert.equal((await one('SELECT status FROM mk_mcp_fills WHERE wallet=$1',[wallet(2)])).status,'reverted');
  pass('market token allowlist, revision immutability and late archived-wallet corrections still use original validation');
  await db.exec('BEGIN; SET LOCAL ROLE service_role; SELECT network_id,tx_hash,event_index,wallet,executed_at,status,usd_value,revision,batch_id,payload FROM mk_mcp_fills; SELECT batch_id,complete,window_start,window_end,body,recorded_at FROM mk_mcp_batches; ROLLBACK;');
  for(const role of['anon','authenticated','doma_ai_ro'])assert.equal((await one("SELECT has_column_privilege($1,'mk_mcp_fills','payload','SELECT') AS allowed",[role])).allowed,false);
  for(const permission of['INSERT','UPDATE','DELETE'])assert.equal((await one("SELECT has_table_privilege('service_role','mk_mcp_fills',$1) AS allowed",[permission])).allowed,false);
  assert.equal((await one("SELECT has_column_privilege('service_role','mk_mcp_fills','source_fill_id','SELECT') AS allowed")).allowed,false);
  pass('actual server role reads adapter columns through RLS bypass while direct writes, extra columns and all public/AI-reader fill access remain denied');
  fs.writeFileSync(path.join(stage,'mcp-extension-verification.json'),JSON.stringify({checks,scope:'isolated PGlite; staged migration only; no external feed or live apply'},null,2));
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
