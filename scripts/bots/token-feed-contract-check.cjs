const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),cache=new Map(),env={BOTS_TOKEN_ZONES:'1',MK_WALLET_RESOLVER_TOKEN:'test-only-existing-'+ 'x'.repeat(40)};
let db,authenticated=null;class Refusal extends Error{constructor(status,message){super(message);this.status=status;}}
function load(file){file=path.resolve(root,file);if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports:m.exports,module:m,require:n=>{
  if(n==='server-only')return {};if(n==='./db')return {Refusal,botsDb:()=>db};
  if(n==='./session')return {sessionFromRequest:()=>authenticated};if(n==='./workshop-journey')return {sameOrigin(){}};
  if(n.startsWith('@/'))return load('src/'+n.slice(2)+'.ts');if(n.startsWith('.'))return load(path.resolve(path.dirname(file),n+'.ts'));return require(n);
 },Buffer,Request,Response,Date,URL,process:{env},console});return m.exports;
}
const feed=load('src/app/bots/_server/token-zones.ts'),contract=load('src/app/bots/_server/token-zone-feed.ts'),credentials=load('src/app/bots/_server/tracking-credential.ts');
const addr=n=>'0x'+n.toString(16).padStart(40,'0'),stamp='2026-09-20T12:00:00.000Z',opening='2026-09-20T00:00:00.000Z';
const fill={chainId:97477,economicId:'order:fixture:fill:0',revision:1,wallet:addr(2),transactionHash:'0x'+'1'.repeat(64),domainToken:addr(3),quoteToken:addr(4),executedAt:stamp,volumeUsd:'0.500000',source:'agent_wallet',status:'verified',evidence:'Synthetic completed-order fixture; no real wallet or trade.'};
const payload=()=>({schemaVersion:1,requestId:'ac205ac0-cccc-4aaa-8bbb-abcdefabcdef',campaignId:'model-kombat-zones-1',rules:'mk-token-zones-1',coverageFrom:opening,confirmedThrough:stamp,complete:false,financialComplete:false,fills:[{...fill}],financials:[]});
function fixture(){const reads=[],tables={
 mkz_campaigns:[{id:'model-kombat-zones-1',rules:'mk-token-zones-1',state:'draft',starts_at:null,ends_at:null,confirmed_through:null,financial_method:null}],
 mkz_markets:[{chain_id:97477,domain_token:addr(3),quote_token:addr(4),domain_name:'fixture.test',quote_kind:'USDC'}],
 mkz_entries:[],mkz_all_links:[{wallet:addr(1),mcp_wallet:addr(2),doma_user_id:'123',status:'linked'}],
 };
 db={from(table){reads.push(table);const filters=[];let from=0,to=499,single=false;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},range(a,b){from=a;to=b;return q},maybeSingle(){single=true;return q},then(resolve){const rows=tables[table].filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:single?rows[0]:rows.slice(from,to+1),count:rows.length,error:null}).then(resolve)}};return q;},async rpc(name,{p_payload}){assert.equal(name,'mkz_collector_check','HTTP diagnostic may call only the read-only check RPC');return {data:await contract.checkZoneBatch(p_payload,db),error:null};}};
 return {reads,tables};
}
const request=(p=payload(),token=env.MK_WALLET_RESOLVER_TOKEN)=>new Request('http://local/api/bots/tracking/zones/check',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(p)});
const rejects=async(fn,status)=>{await assert.rejects(fn,e=>e.status===status);};
async function main(){
 assert.equal(credentials.trackingCredential(env),env.MK_WALLET_RESOLVER_TOKEN);
 for(const invalid of ['', 'short','x'.repeat(513),'x'.repeat(33)+'\n'])assert.equal(credentials.trackingCredential({...env,MK_MCP_INGEST_TOKEN:invalid}),null);
 let t=fixture();await rejects(()=>feed.zoneFeedCheck(request(payload(),'wrong')),401);assert.equal(t.reads.length,0);
 env.MK_MCP_INGEST_TOKEN='rotated-'+env.MK_WALLET_RESOLVER_TOKEN;await rejects(()=>feed.zoneFeedCheck(request()),401);delete env.MK_MCP_INGEST_TOKEN;
 env.BOTS_TOKEN_ZONES='0';await rejects(()=>feed.zoneFeedCheck(request()),503);env.BOTS_TOKEN_ZONES='1';
 const before=JSON.stringify(t.tables),r=await feed.zoneFeedCheck(request());assert.equal(r.ok,true);assert.equal(r.writesPerformed,0);assert.equal(r.ingestionOpen,false);assert.equal(r.checked.mappedFills,1);assert.equal(r.checked.currentlyEligibleFills,0);assert.equal(JSON.stringify(t.tables),before,'draft sample leaves all tables unchanged');
 for(const change of [p=>p.fills.push({...fill}),p=>p.fills[0].chainId=1,p=>p.fills[0].wallet=addr(0),p=>p.fills[0].volumeUsd='0',p=>p.fills[0].executedAt='2026-02-30T00:00:00.000Z',p=>p.coverageFrom='2027-01-01T00:00:00Z',p=>p.financials=[{participant:'123',roi:'0',profit:'0',evidence:'ignored'}],p=>p.financialComplete=true]){
  const p=payload();change(p);await rejects(()=>feed.zoneFeedCheck(request(p)),400);
 }
 await rejects(()=>feed.zoneFeedCheck(new Request('http://local',{method:'POST',headers:{Authorization:`Bearer ${env.MK_WALLET_RESOLVER_TOKEN}`,'Content-Type':'application/json'},body:'x'.repeat(2_000_001)})),413);
 const secondPrecision=payload();secondPrecision.coverageFrom='2026-09-20T00:00:00Z';assert.equal((await contract.readZoneBatch(request(secondPrecision))).coverageFrom,secondPrecision.coverageFrom);
 t.tables.mkz_markets=[];let report=await feed.zoneFeedCheck(request());assert.equal(report.ok,false);assert.equal(report.issues[0].code,'market_unverified');
 t=fixture();t.tables.mkz_all_links=[];report=await feed.zoneFeedCheck(request());assert.equal(report.ok,false);assert.ok(report.issues.some(i=>i.code==='wallet_unmapped'));
 t=fixture();const spoof=payload();spoof.fills[0].wallet=addr(1);report=await feed.zoneFeedCheck(request(spoof));assert.ok(report.issues.some(i=>i.code==='agent_wallet_unverified'));
 t=fixture();Object.assign(t.tables.mkz_campaigns[0],{state:'active',starts_at:opening,ends_at:'2026-10-18T00:00:00Z',financial_method:'existing-fixture-1'});
 report=await feed.zoneFeedCheck(request());assert.ok(report.issues.some(i=>i.code==='participant_not_enrolled'));
 t.tables.mkz_entries=[{campaign_id:'model-kombat-zones-1',participant:'123',wallet:addr(1),entered_at:opening}];report=await feed.zoneFeedCheck(request());assert.equal(report.ok,true);assert.equal(report.checked.currentlyEligibleFills,1);
 const f=payload();f.financialComplete=true;f.methodology='existing-fixture-1';f.financials=[{participant:'123',roi:null,profit:'0',evidence:'Fixture complete accounting; undefined ROI.'}];assert.equal((await feed.zoneFeedCheck(request(f))).ok,true);
 f.methodology='invented';assert.equal((await feed.zoneFeedCheck(request(f))).issues[0].code,'financial_method');
 t=fixture();t.tables.mkz_markets=Array.from({length:1201},(_,i)=>({...t.tables.mkz_markets[0],domain_token:addr(i+10)}));assert.equal((await contract.readFeedRegistry(db)).markets.length,1201,'registry pagination survives the default 1,000-row limit');
 // Complete trade coverage can show volume/qualification while financial history is pending.
 // Old financial rows may still exist in SQL; neither public nor personal views may expose them.
 env.BB_SESSION_SECRET='fixture-only-'+ 'x'.repeat(40);authenticated={wallet:addr(1)};
 const day=86400000,start=Date.now()-3*day,at=n=>new Date(start+n*day).toISOString();
 const view={campaign:{rules:'mk-token-zones-1',state:'active',starts_at:at(0),ends_at:at(28),confirmed_through:at(3),complete:true,financial_complete:false},assets:[],own:'123',volume:'80',days:[{day:0,volume:'20'},{day:1,volume:'30'},{day:2,volume:'30'}],participants:[{participant:'123',volume:'80',roi:'33.3',profit:'40',battles:'1',times:[at(0),at(1),at(2)],remaining:11,domains:1}]};
 let verifiedFinancials=null;
 db={async rpc(name){if(name==='mkz_verified_financials')return {data:verifiedFinancials,error:verifiedFinancials?null:{code:'PGRST202'}};assert.equal(name,'mkz_read');return {data:view,error:null}},from(){const q={select(){return q},eq(){return q},async maybeSingle(){return {data:{status:'linked'},error:null}}};return q}};
 const visible=await feed.readTokenZones(new Request('http://local'));
 assert.equal(visible.available,true);assert.equal(visible.volumeUsd,'80');assert.equal(visible.standings.volume[0].score,'80');
 assert.equal(visible.standings.roi.length,0);assert.equal(visible.standings.profit.length,0);
 assert.equal(visible.personal.qualified,true);assert.equal(visible.personal.scores.roi,null);assert.equal(visible.personal.scores.profit,null);
 assert.equal(visible.personal.ranks.roi,null);assert.equal(visible.personal.awards.length,0);
 assert.ok(visible.issues.some(i=>i.includes('awaiting complete accounting')));
 // Verified account results may be provisional while other accounts are pending.
 // Public responses contain percentages/ranks, never individual profit amounts.
 verifiedFinancials={schemaVersion:1,available:true,methodology:'mk-fifo-realized-capital-1',confirmedThrough:view.campaign.confirmed_through,rows:[{participant:'123',roi:'12.5',profit:'123456.789012'}]};
 authenticated=null;let performance=await feed.readTokenZones(new Request('http://local'));
 assert.equal(performance.standings.roi[0].score,'12.5');assert.equal(performance.standings.profit[0].rank,1);assert.equal(performance.standings.profit[0].score,null);
 assert.equal(performance.financials.verified,1);assert.equal(performance.financials.complete,false);
 assert.ok(!JSON.stringify(performance).includes('123456.789012'));assert.equal(performance.personal,null);
 verifiedFinancials.confirmedThrough=at(2);performance=await feed.readTokenZones(new Request('http://local'));assert.equal(performance.standings.roi.length,0,'stale snapshot cannot showcase a result');
 view.campaign.financial_complete=true;performance=await feed.readTokenZones(new Request('http://local'));assert.equal(performance.standings.profit[0].score,null,'even final public profit scores stay private');
 view.participants.push({participant:'456',volume:'0',roi:'999',profit:'888888',battles:'0',times:[],remaining:12,domains:0});
 performance=await feed.readTokenZones(new Request('http://local'));assert.equal(performance.financials.total,1);assert.equal(performance.financials.verified,1);assert.equal(performance.standings.roi.length,1,'a non-trader with an old stored score remains unranked');assert.ok(!JSON.stringify(performance).includes('888888'));
 view.participants[1].times=[at(4)];performance=await feed.readTokenZones(new Request('http://local'));assert.equal(performance.financials.total,1,'future activity is outside the verified cutoff');
 view.participants[1].times=[at(1)];view.campaign.financial_complete=false;verifiedFinancials.confirmedThrough=view.campaign.confirmed_through;
 performance=await feed.readTokenZones(new Request('http://local'));assert.equal(performance.financials.total,2);assert.equal(performance.financials.verified,1,'a new trader counts as pending until its own ledger is verified');
 Object.assign(verifiedFinancials,{financialScope:'eligible-traders-1',tradingAccounts:1,scopePending:0});
 performance=await feed.readTokenZones(new Request('http://local'));assert.equal(performance.financials.total,1,'exact SQL scope overrides raw historical activity counts');
 view.campaign.financial_complete=true;verifiedFinancials.rows=[];verifiedFinancials.tradingAccounts=0;
 performance=await feed.readTokenZones(new Request('http://local'));assert.equal(performance.financials.verified,0);assert.equal(performance.standings.roi.length,0,'current SQL scope removes an old financial score even after global completion');
 view.campaign.financial_complete=false;authenticated={wallet:addr(1)};
 view.campaign.complete=false;const incomplete=await feed.readTokenZones(new Request('http://local'));
 assert.equal(incomplete.volumeUsd,null);assert.equal(incomplete.personal.qualified,null);assert.equal(incomplete.standings.volume.length,0);
 authenticated=null;
 console.log('PASS independent coverage: verified volume/qualification visible, pending or old ROI/profit withheld, incomplete trade coverage never shown as zero.');
 console.log('PASS feed contract: legacy secret, rotation, malformed/duplicate/oversized input, draft read-only rehearsal, source-wallet checks, registered markets, enrollment, accounting and pagination.');
 const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile).config,options=ts.convertCompilerOptionsFromJson(config.compilerOptions,root).options;options.incremental=false;options.noEmit=true;
 const program=ts.createProgram(['next-env.d.ts','src/app/api/bots/tracking/zones/route.ts','src/app/api/bots/tracking/zones/check/route.ts'].map(f=>path.join(root,f)),options),errors=ts.getPreEmitDiagnostics(program);
 if(errors.length)throw Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
 console.log('PASS tracking route TypeScript; no build cache emitted.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
