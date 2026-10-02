const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),cache=new Map(),env={BOTS_TOKEN_ZONES:'1',MK_WALLET_RESOLVER_TOKEN:'test-only-existing-'+ 'x'.repeat(40)};
let db;class Refusal extends Error{constructor(status,message){super(message);this.status=status;}}
function load(file){file=path.resolve(root,file);if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports:m.exports,module:m,require:n=>{
  if(n==='server-only')return {};if(n==='./db')return {Refusal,botsDb:()=>db};
  if(n==='./session')return {sessionFromRequest:()=>null};if(n==='./workshop-journey')return {sameOrigin(){}};
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
 db={from(table){reads.push(table);const filters=[];let from=0,to=499,single=false;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},range(a,b){from=a;to=b;return q},maybeSingle(){single=true;return q},then(resolve){const rows=tables[table].filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:single?rows[0]:rows.slice(from,to+1),count:rows.length,error:null}).then(resolve)}};return q;},rpc(){throw Error('Diagnostic must never invoke a database procedure.');}};
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
 console.log('PASS feed contract: legacy secret, rotation, malformed/duplicate/oversized input, draft read-only rehearsal, source-wallet checks, registered markets, enrollment, accounting and pagination.');
 const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile).config,options=ts.convertCompilerOptionsFromJson(config.compilerOptions,root).options;options.incremental=false;options.noEmit=true;
 const program=ts.createProgram(['next-env.d.ts','src/app/api/bots/tracking/zones/route.ts','src/app/api/bots/tracking/zones/check/route.ts'].map(f=>path.join(root,f)),options),errors=ts.getPreEmitDiagnostics(program);
 if(errors.length)throw Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
 console.log('PASS tracking route TypeScript; no build cache emitted.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
