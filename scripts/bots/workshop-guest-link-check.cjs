// Offline regression: actual hook and session handler, synthetic saves, no network or credentials.
require('./personal-native-path.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');
const SESSION='mk8.wallet-session.v1',ACTIVE='mk8.journey.active.1',PENDING='mk8.journey.pending.1',SCOPE='mk8.journey.scope.1';
const fresh=()=>({revision:0,robots:[],draft:null,active:null,history:[],coins:250});
const garage=(id,draft=null,active=null)=>({id,name:'Synthetic fixture',state:{...fresh(),draft,active}});
const reply=(data,status=200)=>({ok:status<400,status,json:async()=>structuredClone(data)});
function load(file,imports,globals={}){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected dependency: '+name)},console,Request,URL,AbortController,setTimeout,clearTimeout,...globals},{filename:file});
 return module.exports;
}
function hooks(){
 const slots=[],effects=[];let cursor=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
 return {begin(){cursor=0},flush(){for(const effect of effects.splice(0))effect()},api:{
  useRef(value){const i=cursor++;return slots[i]??(slots[i]={current:value})},
  useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},
  useCallback(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){slots[i]={deps};effects.push(fn)}}
 }};
}
function fixture({guest=true,wallet=true,storage,server}={}){
 const store=storage??new Map([[SESSION,JSON.stringify({token:'local-fixture-session',address:'fixture'})],[ACTIVE,'guest-garage']]);
 const db=server??{guest:guest?[garage('guest-garage',{name:'Unfinished fixture',choices:{torso:'fixture-part'}})]:[],wallet:wallet?[garage('wallet-garage')]:[],claimFailure:null,claimLostResponse:false};
 const calls=[],states=[],runner=hooks();
 function packet(kind,id){const list=db[kind],g=(id?list.find(x=>x.id===id):list[0])??null;if(id&&!g)return reply({ok:false,error:'Garage not found'},404);return reply({ok:true,garageId:g?.id??null,garages:list.map(x=>({id:x.id,name:x.name,robots:x.state.robots,activeFight:x.state.active?.id??null})),state:g?.state??null,days:{},session:{kind}})}
 async function fetch(url,options={}){
  const method=options.method??'GET',kind=options.headers?.Authorization?'wallet':'guest';calls.push({url,method,kind,body:options.body?JSON.parse(options.body):null});
  if(url==='/api/bots/workshop/session'){
   if(method==='POST'&&!db.guest.length)db.guest.push(garage('new-guest-garage'));
   return reply({ok:true,enabled:true,guestGarageIds:db.guest.map(g=>g.id)});
  }
  if(url.split('?')[0]==='/api/bots/workshop/claim'){
   if(db.claimFailure)return reply({ok:false,error:db.claimFailure},409);
   db.wallet.push(...db.guest);db.guest=[];
   if(db.claimLostResponse){db.claimLostResponse=false;throw Error('Simulated lost response')}
   return packet('wallet',new URL(url,'http://fixture.local').searchParams.get('garage'));
  }
  if(url==='/api/bots/workshop/select')return packet(kind,JSON.parse(options.body).garageId);
  if(method==='POST'){
   const job=JSON.parse(options.body),g=db[kind].find(x=>x.id===job.garageId);
   assert.ok(g,'Mutation must stay within the chosen owner');
   if(job.action.kind==='start'&&db[kind].some(x=>x.id!==g.id&&x.state.active))return reply({ok:false,error:'Finish the fight in your other garage first.'},409);
   g.state.revision++;return packet(kind,g.id);
  }
  return packet(kind,new URL(url,'http://fixture.local').searchParams.get('garage'));
 }
 const useHook=load('src/app/bots/_game/useJourneyGarage.ts',{react:runner.api,'@/lib/bots/workshop8/state':{freshWorkshop:fresh}},{fetch,sessionStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},document:{hidden:false,addEventListener(){},removeEventListener(){}},setInterval:()=>0,clearInterval(){},crypto:{randomUUID:()=> 'fixture-request'}}).default;
 function render(){runner.begin();const value=useHook(true,s=>states.push(structuredClone(s)),()=>{});runner.flush();return value}
 return {store,db,calls,render,async ready(){render();await new Promise(resolve=>setImmediate(resolve));return render()}};
}
async function sessionMetadata(){
 let guest={player_id:'fixture-player',expires_at:new Date(Date.now()+60000).toISOString(),revoked:false},saved=[{id:'fixture-garage'}];const calls=[];
 const db={from(table){const call={table};calls.push(call);const builder={select(fields){call.fields=fields;return builder},eq(){return builder},limit:async()=>({error:null}),maybeSingle:async()=>({data:guest,error:null}),order:async()=>({data:saved,error:null})};return builder},rpc(){throw Error('Read-only metadata must never call an RPC')}};
 const server=load('src/app/bots/_server/workshop-journey.ts',{
  'server-only':{},'node:crypto':require('node:crypto'),'next/server':{NextResponse:{json:data=>({data,cookies:{set(){}}})}},
  './db':{botsDb:()=>db,Refusal:class extends Error{},sessionSecret:()=>{throw Error('No secret needed for GET')}},'./session':{},
  '@/lib/bots/workshop8/state':{},'@/lib/bots/workshop8/catalogue':{},'@/lib/bots/workshop8/journey':{},'./workshop-competition':{},'@/lib/bots/workshop8/training':{},'@/lib/bots/workshop8/server-contract':{},'./workshop8-simulation':{}
 },{process:{env:{BOTS_WORKSHOP_JOURNEY:'1'}}});
 const req=new Request('http://fixture.local/api/bots/workshop/session',{headers:{Cookie:'mk8_guest='+'a'.repeat(64)}});
 assert.deepEqual(Array.from((await server.journeySession(req)).data.guestGarageIds),['fixture-garage']);
 assert.equal(calls.find(c=>c.table==='mk8_garages').fields,'id','Bootstrap never reads balances, robot names, or fight state');
 guest.revoked=true;assert.equal((await server.journeySession(req)).data.guestGarageIds.length,0);
 guest.revoked=false;guest.expires_at=new Date(0).toISOString();assert.equal((await server.journeySession(req)).data.guestGarageIds.length,0);
 guest=null;assert.equal((await server.journeySession(req)).data.guestGarageIds.length,0);
 guest={player_id:'fixture-player',expires_at:new Date(Date.now()+60000).toISOString(),revoked:false};saved=[];
 assert.equal((await server.journeySession(req)).data.guestGarageIds.length,0);
}
async function main(){
 await sessionMetadata();
 for(const wallet of [false,true]){
  const f=fixture({wallet}),h=await f.ready();assert.equal(h.hasUnlinkedGuest,true);assert.equal(f.calls.some(c=>c.method==='POST'),false,'Restoring a homepage token is read-only');
  await assert.rejects(()=>h.ensure(),/Choose whether/);assert.equal(f.calls.some(c=>c.method==='POST'),false,'First mutation must not silently claim');
  const before=JSON.stringify(f.db),linked=await h.claimBrowser();assert.equal(f.db.guest.length,0);assert.equal(linked.garages.length,wallet?2:1);assert.ok(before.includes('Unfinished fixture'));assert.equal(f.db.wallet.find(g=>g.id==='guest-garage').state.draft.name,'Unfinished fixture');assert.equal(f.render().hasUnlinkedGuest,false);
 }
 const kept=fixture();let h=await kept.ready();await h.keepBrowser();assert.equal(kept.store.get(SCOPE),'guest');await kept.render().mutate({kind:'welcome'},'keep-request');assert.equal(kept.calls.some(c=>c.url.endsWith('/claim')),false);assert.equal(kept.db.wallet[0].state.revision,0);assert.equal(kept.db.guest[0].state.revision,1);
 const restored=fixture({storage:kept.store,server:kept.db});h=await restored.ready();assert.equal(h.packet.session.kind,'guest');assert.equal(h.hasWalletSession,true);assert.equal(h.hasUnlinkedGuest,false);assert.equal(h.packet.state.draft.name,'Unfinished fixture');await h.claimBrowser();assert.equal(restored.db.wallet.length,2);assert.equal(restored.store.has(SCOPE),false);
 const failed=fixture();h=await failed.ready();failed.db.claimFailure='Storage temporarily unavailable';const beforeFailure=JSON.stringify(failed.db);await assert.rejects(()=>h.claimBrowser(),/temporarily unavailable/);assert.equal(JSON.stringify(failed.db),beforeFailure);assert.equal(failed.render().hasUnlinkedGuest,true);failed.db.claimFailure=null;await failed.render().claimBrowser();assert.equal(failed.db.wallet.length,2);
 const lost=fixture();h=await lost.ready();lost.db.claimLostResponse=true;await h.claimBrowser();assert.equal(lost.db.wallet.length,2);assert.equal(lost.render().hasUnlinkedGuest,false,'Lost successful response is recovered without duplicate linking');
 for(const wallet of [false,true]){const empty=fixture({guest:false,wallet});empty.store.delete(ACTIVE);h=await empty.ready();assert.equal(h.hasUnlinkedGuest,false);await h.mutate({kind:'welcome'},'empty-request');assert.equal(empty.db.wallet.length,1);assert.equal(empty.calls.filter(c=>c.url.endsWith('/claim')).length,wallet?0:1,'New empty wallet may create its first garage normally')}
 const pending=fixture();pending.store.set(PENDING,JSON.stringify({requestId:'original-pending-request',action:{kind:'welcome'},garageId:'guest-garage'}));h=await pending.ready();await h.claimBrowser();assert.equal(pending.render().packet.garageId,'guest-garage');assert.match(pending.render().error,/needs a retry/);await pending.render().retry();const write=pending.calls.find(c=>c.url==='/api/bots/workshop'&&c.method==='POST');assert.equal(write.body.garageId,'guest-garage');assert.equal(write.body.requestId,'original-pending-request');assert.equal(pending.db.wallet.find(g=>g.id==='wallet-garage').state.revision,0);
 const conflict=fixture();conflict.db.wallet[0].state.active={id:'other-active-fight'};h=await conflict.ready();await h.claimBrowser();await conflict.render().select('guest-garage');await assert.rejects(()=>conflict.render().mutate({kind:'start'},'start-fixture'),/other garage/);assert.equal(conflict.db.wallet.length,2);assert.equal(conflict.db.wallet.find(g=>g.id==='guest-garage').state.draft.name,'Unfinished fixture');assert.equal(conflict.db.wallet.find(g=>g.id==='wallet-garage').state.active.id,'other-active-fight');
 const walletPending=fixture();walletPending.store.set(PENDING,JSON.stringify({requestId:'pending-wallet-request',action:{kind:'welcome'},garageId:'wallet-garage'}));h=await walletPending.ready();await assert.rejects(()=>h.keepBrowser(),/pending wallet save/);await walletPending.render().retry();assert.equal(walletPending.db.wallet[0].state.revision,1);await walletPending.render().keepBrowser();assert.equal(walletPending.render().packet.session.kind,'guest');assert.equal(walletPending.calls.some(c=>c.url.startsWith('/api/bots/workshop/claim')),false);
 console.log('PASS: read-only saved-guest detection; homepage session with empty/existing wallet; explicit choice before mutation; keep-browser and reload; saved-session linking; claim failure/retry and lost-response recovery; no-save startup; original pending request/garage; active-fight refusal and draft preservation. No network or credentials used.');
 if(process.argv.includes('--strict')){
  const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile).config,options=ts.convertCompilerOptionsFromJson(config.compilerOptions,root).options;options.incremental=false;
  const entry=['next-env.d.ts','src/app/bots/_game/useJourneyGarage.ts','src/app/bots/_game/ConnectedWorkshop.tsx','src/app/bots/_server/workshop-journey.ts'].map(p=>path.join(root,p));
  const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(entry,options));if(diagnostics.length)throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));
  console.log('PASS: strict TypeScript for the three changed runtime files and their imports.');
 }
}
main().catch(error=>{console.error(error);process.exitCode=1});
