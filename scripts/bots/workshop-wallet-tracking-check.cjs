const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),mod={exports:{}},now=Date.now(),wallet='0x'+'a'.repeat(40),mcp='0x'+'b'.repeat(40),token='resolver-fixture-'+ 'x'.repeat(40);
const source=ts.transpileModule(fs.readFileSync(path.join(root,'src/app/bots/_server/wallet-tracking.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module:mod,exports:mod.exports,require:n=>n==='node:crypto'?require(n):{},Date,Response,Buffer,URL,Error,Number,Array,JSON,process:{env:{}}});
function fixture(){const calls=[],rows=[{wallet,since:new Date(now).toISOString(),status:'pending',mcp_wallet:null,revision:0,checked_at:null}];
 const db={from(table){calls.push(table);const filters=[];const q={select(){return q},order(){return q},limit(){return q},gt(k,v){filters.push(r=>r[k]>v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},in(){return q},then(resolve){return Promise.resolve({data:table==='mk8_tracking_wallets'?[{player_wallet:wallet,trade_wallet:wallet}]:rows.filter(r=>filters.every(f=>f(r))),error:null}).then(resolve)}};return q},async rpc(name,args){calls.push({name,args});return {data:name==='mk8_resolve_wallet'?{ok:true,wallet:args.p_payload.wallet,revision:1}:{wallets:[wallet,mcp],recentObservedTrades:[],coverage:'unverified'},error:null}}};
 const deps={db:()=>db,env:{MK_WALLET_TRACKING_ENABLED:'1',MK_MCP_INGEST_TOKEN:token},now:()=>now,session:()=>({wallet})};return {calls,deps,handlers:()=>mod.exports.createWalletTrackingHandlers(deps)};
}
const payload={schemaVersion:1,requestId:'e215f8a1-abcd-4abc-8abc-abcdefabcdef',wallet,mcpWallet:mcp,domaUserId:'599861',privyDid:null,status:'linked',expectedRevision:0,checkedAt:new Date(now).toISOString()};
const post=(body=payload,auth=token)=>new Request('http://local/api/bots/tracking/wallets',{method:'POST',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
const get=(s='',auth=token)=>new Request('http://local/api/bots/tracking/wallets'+s,{headers:{Authorization:`Bearer ${auth}`}});
async function main(){let t=fixture();assert.equal((await t.handlers().GET(get('','bad'))).status,401);assert.equal(t.calls.length,0);
 t.deps.env.MK_WALLET_TRACKING_ENABLED='0';assert.equal((await t.handlers().POST(post())).status,503);assert.equal(t.calls.length,0);
 t=fixture();assert.equal((await t.handlers().POST(post({...payload,winner:1}))).status,400);assert.equal((await t.handlers().POST(post({...payload,mcpWallet:'invalid'}))).status,400);assert.equal((await t.handlers().POST(post({...payload,status:'not_found'}))).status,400);assert.equal((await t.handlers().POST(post({...payload,checkedAt:new Date(now+120000).toISOString()}))).status,400);assert.equal(t.calls.length,0);
 assert.equal((await t.handlers().POST(post())).status,200);assert.equal(t.calls[0].name,'mk8_resolve_wallet');
 assert.equal((await t.handlers().GET(get('?scope=monitor'))).status,200);assert.equal((await t.handlers().GET(get('?scope=invalid'))).status,400);
 const r=await t.handlers().activity(new Request('http://local/api/bots/tracking/activity?wallet='+mcp));assert.equal(r.status,200);assert.equal(t.calls.at(-1).args.p_wallet,wallet,'personal status never accepts another URL wallet');assert.match(r.headers.get('cache-control'),/no-store/);
 t.deps.session=()=>null;assert.equal((await t.handlers().activity(get())).status,401);
 t=fixture();t.deps.db=()=>{throw Error('private database secret')};const failure=await t.handlers().POST(post());assert.equal(failure.status,503);assert.ok(!(await failure.text()).includes('private database secret'));
 console.log('PASS API: existing Doma AI credential authorizes mapping, disabled rollout, strict bounded writes, malformed reports rejected, personal session ownership, no-cache responses and sanitized errors.');
 const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile).config,options=ts.convertCompilerOptionsFromJson(config.compilerOptions,root).options;
 options.incremental=false;options.noEmit=true;
 const program=ts.createProgram(['next-env.d.ts','src/app/api/bots/tracking/wallets/route.ts','src/app/api/bots/tracking/activity/route.ts','src/app/bots/start/page.tsx','src/app/bots/workshop/page.tsx'].map(f=>path.join(root,f)),options);
 const errors=ts.getPreEmitDiagnostics(program);if(errors.length)throw Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
 console.log('PASS TypeScript: wallet mapping routes, personal activity route and trading screen. No build cache emitted.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
