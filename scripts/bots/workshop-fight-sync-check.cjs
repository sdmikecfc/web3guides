// Offline service/hook regression: no real network, database or player changes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),load=Module._load,resolve=Module._resolveFilename,extension=Module._extensions['.ts'];
let db,simulate,react;
class Refusal extends Error{constructor(status,message){super(message);this.status=status;}}
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(root,'src',name.slice(2)):name,parent,...rest);};
Module._extensions['.ts']=function(module,file){module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);};
Module._load=function(name,parent,...rest){
 if(name==='server-only')return{};
 if(name==='react'&&parent?.filename.endsWith('useJourneyGarage.ts'))return react;
 if(parent?.filename.endsWith('workshop-journey.ts')){
  if(name==='./db')return{botsDb:()=>db,sessionSecret:()=>'',Refusal};
  if(name==='./session')return{sessionFromRequest:()=>({wallet:'0x'+'1'.repeat(40)})};
  if(name==='./workshop-competition')return{competitionEnabled:()=>false};
  if(name==='./workshop8-simulation')return{WORKSHOP_RULES:{},simulateWorkshopFight:(...args)=>simulate(...args)};
 }
 return load.call(this,name,parent,...rest);
};
const {freshWorkshop}=require('../../src/lib/bots/workshop8/state'),{preset,defaultAppearance}=require('../../src/lib/bots/workshop8/catalogue');
const original={fetch:global.fetch,document:global.document,sessionStorage:global.sessionStorage,setInterval:global.setInterval,clearInterval:global.clearInterval,now:Date.now,zones:process.env.BOTS_TOKEN_ZONES};
const delay=()=>new Promise(r=>setTimeout(r,15));
async function serverChecks(){
 process.env.BOTS_TOKEN_ZONES='0';let now=100000;Date.now=()=>now;
 let stored=freshWorkshop(),commits=0,specials=0,finished=false;const requests=new Set(),owner='owner',garage='11111111-1111-1111-1111-111111111111';
 stored.active={id:'fight-1',robotId:null,name:'Fixture',choices:preset('tank'),appearance:defaultAppearance(),rival:preset('speed'),seed:75,arena:'colosseum',mode:'house',startedAt:98000,waiting:false,inputs:[{id:'earlier-special',who:0,tick:20}],server:true};
 db={from(table){const filters={};const q={select(){return q},eq(key,value){filters[key]=value;return q},order(){return Promise.resolve({data:[{id:garage,name:'Fixture',state:structuredClone(stored),revision:stored.revision}],error:null})},maybeSingle(){return Promise.resolve({data:table==='mk8_journey_requests'?(requests.has(filters.request_id)?{request_id:filters.request_id}:null):{active_garage:garage},error:null})},then(yes,no){assert.equal(table,'mk8_player_days');return Promise.resolve({data:[],error:null}).then(yes,no)}};return q},async rpc(name,args){if(name==='mk8_wallet_player')return{data:owner,error:null};assert.equal(name,'mk8_journey_commit');assert.equal(args.p_player,owner);if(requests.has(args.p_request))return{data:structuredClone(stored),error:null};assert.equal(args.p_revision,stored.revision);assert.equal(args.p_state.revision,stored.revision+1);stored=structuredClone(args.p_state);requests.add(args.p_request);commits++;return{data:structuredClone(stored),error:null}}};
 simulate=async(fight,tick)=>({tick,done:finished,events:[],actors:[{initial:{torso:100}},{initial:{torso:100}}],special(who,id){specials++;assert.equal(who,0);assert.equal(id,'accepted-special');return true},snapshot(){return{tick,winner:0,inputs:[...(fight.inputs??[]).filter(i=>i.tick<=tick),{id:'auto-rival',who:1,tick:50}]}}});
 const {journeyPost,journeyGet}=require('../../src/app/bots/_server/workshop-journey');
 const req=new Request('http://127.0.0.1/api/bots/workshop',{headers:{origin:'http://127.0.0.1'}}),body={garageId:garage,revision:stored.revision,requestId:'accepted-special',action:{kind:'special',fightId:'fight-1'}};
 const first=await journeyPost(req,body);
 assert.equal(first.state.active.ticks,120,'Special ACK must publish the computed server horizon, not zero');
 assert.deepEqual(first.state.active.inputs,[{id:'earlier-special',who:0,tick:20},{id:'auto-rival',who:1,tick:50},{id:'accepted-special',who:0,tick:121}]);
 assert.equal(stored.active.inputs.filter(i=>i.id==='accepted-special').length,1);assert.equal(commits,1);assert.equal(first.state.coins,250);
 await journeyPost(req,body);assert.equal(commits,1);assert.equal(specials,1,'Repeated request cannot spend or enqueue Special twice');
 const sameTick=await journeyGet(req);assert.equal(sameTick.state.active.ticks,120);assert.equal(sameTick.state.active.inputs.filter(i=>i.id==='accepted-special').length,1,'GET on the accepting tick must retain the future command');
 now+=100;const later=await journeyGet(req);assert.equal(later.state.active.ticks,126);assert.equal(later.state.active.inputs.filter(i=>i.id==='accepted-special').length,1,'Executed command is not duplicated');assert.equal(commits,1);assert.equal(stored.coins,250);
 finished=true;const settled=await journeyGet(req);assert.equal(settled.state.active,null);assert.equal(settled.state.coins,325);assert.equal(commits,2);
 const retryAfterSettlement=await journeyPost(req,body);assert.equal(retryAfterSettlement.state.active,null);assert.equal(retryAfterSettlement.state.coins,325);assert.equal(commits,2);assert.equal(specials,1,'Lost Special ACK retried after settlement cannot grant another reward or Special');
 Date.now=original.now;
 console.log('PASS truthful Special horizon, queued next-tick input, automatic opponent input, GET settlement and lost-ACK retry without duplicate reward');
}
async function hookChecks(){
 const states=[],effects=[],intervals=[],storage=new Map(),calls=[];let postMode='success',readMode='success',releasePost,settled=false,finishedCallbacks=0,clock=Date.now();Date.now=()=>clock;
 react={useRef:value=>({current:value}),useCallback:fn=>fn,useEffect:fn=>effects.push(fn),useState:value=>{const index=states.push(value)-1;return[value,next=>{states[index]=typeof next==='function'?next(states[index]):next}]}};
 const packet=()=>({ok:true,journey:true,serverNow:Date.now(),garageId:'garage-1',garages:[],days:{},session:{kind:'guest'},state:{...freshWorkshop(),revision:settled?2:1,coins:settled?325:250,history:settled?[{id:'fight-1',coins:75}]:[],active:settled?null:{id:'fight-1',inputs:[],ticks:120}}});
 global.document={hidden:false,addEventListener(){},removeEventListener(){}};global.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 global.setInterval=fn=>{intervals.push(fn);return intervals.length};global.clearInterval=()=>{};
 global.fetch=async(url,options={})=>{const method=options.method??'GET';calls.push({url,method,body:options.body?JSON.parse(options.body):null});if(url.endsWith('/session'))return{ok:true,json:async()=>({ok:true,enabled:true,guestGarageIds:[]})};if(method==='POST'){if(postMode==='wait')await new Promise(r=>{releasePost=r});if(postMode==='500')return{ok:false,status:500,json:async()=>({ok:false,error:'Synthetic interrupted save'})};return{ok:true,status:200,json:async()=>packet()}}if(readMode==='fail')throw Error('Synthetic GET failure');return{ok:true,json:async()=>packet()}};
 const useGarage=require('../../src/app/bots/_game/useJourneyGarage').default,hook=useGarage(true,()=>{},()=>{finishedCallbacks++}),cleanup=effects.map(fn=>fn());await hook.ensure();calls.length=0;
 const action={kind:'special',fightId:'fight-1'};postMode='wait';const mutation=hook.mutate(action,'first-special');await delay();intervals[0]();assert.equal(calls.filter(c=>c.method==='GET').length,0,'Polling remains serialized while a mutation is pending');postMode='success';releasePost();await mutation;await delay();assert.equal(calls.filter(c=>c.method==='GET').length,1,'A successful Special resumes polling once without waiting 2.5s');assert.equal(calls.filter(c=>c.method==='POST').length,1);assert.equal(storage.has('mk8.journey.pending.1'),false);
 calls.length=0;readMode='fail';await hook.mutate(action,'saved-but-read-fails');await delay();assert.equal(calls.filter(c=>c.method==='GET').length,1);assert.equal(storage.has('mk8.journey.pending.1'),false,'A failed follow-up read cannot turn an acknowledged save into a pending mutation');assert.match(states[2],/Special was saved/);readMode='success';await hook.retry();assert.equal(calls.filter(c=>c.method==='POST').length,1,'Retry after GET failure is a read, not a second Special');
 calls.length=0;postMode='500';await assert.rejects(()=>hook.mutate(action,'uncertain-special'),/interrupted/);await delay();clock+=3000;intervals[0]();await delay();assert.equal(calls.filter(c=>c.method==='GET').length,1,'Uncertain Special cannot freeze authoritative reads');assert.equal(JSON.parse(storage.get('mk8.journey.pending.1')).requestId,'uncertain-special');assert.match(states[2],/last change needs a retry/);await assert.rejects(()=>hook.mutate({kind:'buy',item:'irrelevant'},'blocked-purchase'),/Retry/);
 settled=true;clock+=3000;intervals[0]();await delay();assert.equal(finishedCallbacks,1);assert.equal(JSON.parse(storage.get('mk8.journey.pending.1')).requestId,'uncertain-special');postMode='success';await hook.retry();await delay();assert.deepEqual(calls.filter(c=>c.method==='POST').map(c=>c.body.requestId),['uncertain-special','uncertain-special']);assert.equal(calls.filter(c=>c.method==='GET').length,2);assert.equal(storage.has('mk8.journey.pending.1'),false);assert.equal(finishedCallbacks,1);
 calls.length=0;postMode='500';await assert.rejects(()=>hook.mutate({kind:'buy',item:'fixture'},'uncertain-purchase'),/interrupted/);clock+=30000;intervals[0]();await delay();assert.equal(calls.filter(c=>c.method==='GET').length,0,'Failed purchase still blocks periodic reads');assert.equal(JSON.parse(storage.get('mk8.journey.pending.1')).requestId,'uncertain-purchase');
 cleanup.forEach(fn=>fn?.());Date.now=original.now;console.log('PASS one post-ACK refresh, serialized saves, read failure preserves ACK, pending Special reads through settlement with same-ID retry, purchase gate unchanged');
}
async function main(){try{global.fetch=async()=>{throw Error('Real network forbidden')};await serverChecks();await hookChecks();console.log('Offline checks only; no database, network, rewards or renderer rules changed.')}finally{global.fetch=original.fetch;global.document=original.document;global.sessionStorage=original.sessionStorage;global.setInterval=original.setInterval;global.clearInterval=original.clearInterval;Date.now=original.now;if(original.zones===undefined)delete process.env.BOTS_TOKEN_ZONES;else process.env.BOTS_TOKEN_ZONES=original.zones;Module._load=load;Module._resolveFilename=resolve;Module._extensions['.ts']=extension;}}
main().catch(error=>{console.error(error);process.exitCode=1});
