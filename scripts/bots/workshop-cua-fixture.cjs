// Local-only CUA fixture. No credentials, live DB, authoritative rewards or browser automation.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
require.extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {freshWorkshop,changeWorkshop}=require('../../src/lib/bots/workshop8/state.ts');
const {preset,defaultAppearance,itemId}=require('../../src/lib/bots/workshop8/catalogue.ts');
const {playerAction}=require('../../src/lib/bots/workshop8/server-contract.ts');
const {emptyCompetition}=require('../../src/lib/bots/workshop8/competition.ts');
const {emptyZoneView}=require('../../src/lib/bots/token-zones.ts');
let state=null;
function seed(mode){state=null;if(mode==='fresh')return;state=changeWorkshop(freshWorkshop(),{kind:'draft',draft:{name:'Fixture Robot',choices:preset('tank'),appearance:defaultAppearance('warden')}});state=changeWorkshop(state,{kind:'finish',request:'fixture-robot'});state.coins=750;if(mode==='owned'){state=changeWorkshop(state,{kind:'buy',item:itemId(preset('speed',2).armL,'armL'),request:'fixture-owned-arm'});state=changeWorkshop(state,{kind:'draft',draft:{name:'Do not change this draft',choices:preset('ranged'),appearance:defaultAppearance('tracker')}})}if(mode==='repair')state.robots[0].repairUntil=Date.now()+600000;if(mode==='active')state.active={id:'fixture-fight',robotId:state.robots[0].id,name:'Fixture Robot',choices:preset('tank'),appearance:defaultAppearance('warden'),rival:preset('speed'),seed:75,arena:'spaceship',startedAt:Date.now(),waiting:true,server:true};}
function packet(){return{ok:true,journey:true,session:state?{kind:'guest'}:null,garageId:state?'cua-local-fixture':null,garages:state?[{id:'cua-local-fixture',name:'Isolated UI fixture',robots:state.robots.map(r=>({id:r.id,name:r.name})),activeFight:state.active?.id??null}]:[],state,days:{},serverNow:Date.now()}}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{try{
 const u=new URL(req.url,'http://127.0.0.1:3196');
 if(u.pathname==='/_fixture'){
  const mode=u.searchParams.get('scenario');if(mode){if(!['fresh','shopping','owned','repair','active'].includes(mode))return json(res,400,{error:'Unknown fixture'});seed(mode)}
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});return res.end('<!doctype html><html><body style="font:20px system-ui;padding:30px;background:#213a33;color:#fff"><h1>Isolated Model Kombat UI fixture</h1><p>No real accounts, grants, database or rewards. Combat settlement is not simulated.</p><p>Scenario: '+(mode||'unchanged')+'</p><p><a style="color:#ffd694" href="/bots/workshop?view=build&entry=play">Open builder / garage</a></p><p><a style="color:#ffd694" href="/bots/workshop?view=garage">Open garage</a></p><p><a style="color:#ffd694" href="/_fixture/state">Read fixture state</a></p></body></html>');
 }
 if(u.pathname==='/_fixture/state')return json(res,200,{fixture:true,state});
 if(u.pathname==='/api/bots/workshop/session'){if(req.method==='POST')state??=freshWorkshop();return json(res,200,{ok:true,enabled:true})}
 if(u.pathname==='/api/bots/workshop'){
  if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)throw Error('Fixture input too large')}const b=JSON.parse(raw);if(['start','ready','special','complete'].includes(b.action?.kind))return json(res,400,{ok:false,error:'Combat settlement is outside this isolated UI fixture.'});state=changeWorkshop(state??freshWorkshop(),playerAction(b.action,b.requestId));}
  return json(res,200,packet());
 }
 if(u.pathname==='/api/bots/campaign')return json(res,200,{workshop:{...emptyCompetition(false,true),available:true,state:'draft'},standings:{roi:[],profit:[],battles:[]},zones:emptyZoneView()});
 if(u.pathname==='/api/bots/campaign/zones')return json(res,200,emptyZoneView());
 if(u.pathname.startsWith('/api/'))return json(res,503,{ok:false,error:'Not part of this isolated fixture'});
 // All app/asset requests go only to the isolated production preview.
 const upstream=http.request({hostname:'127.0.0.1',port:3195,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:3195'}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});
 upstream.on('error',()=>{if(!res.headersSent)json(res,503,{error:'Start the isolated preview on 3195 first'});else res.end()});req.pipe(upstream);
 }catch(error){json(res,400,{ok:false,error:error.message})}});
server.listen(3196,'127.0.0.1',()=>console.log('Local CUA fixture: http://127.0.0.1:3196/_fixture?scenario=fresh — only proxies 127.0.0.1:3195; all API mocked.'));
