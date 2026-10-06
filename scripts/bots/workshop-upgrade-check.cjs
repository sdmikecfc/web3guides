/* Offline upgrade checks: real state, action validation and wallet service;
 * an in-memory commit adapter models revision/idempotency, never a live DB. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'../..'),load=Module._load,resolve=Module._resolveFilename,extension=Module._extensions['.ts'];
Module._resolveFilename=function(name,parent,...rest){return resolve.call(this,name.startsWith('@/')?path.join(root,'src',name.slice(2)):name,parent,...rest);};
Module._extensions['.ts']=function(module,file){module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,file);};
Module._load=function(name,parent,...rest){if(name==='server-only')return{};if(name==='./workshop8-simulation')return{WORKSHOP_RULES:{},simulateWorkshopFight(){throw Error('Upgrade must not run or settle combat');}};return load.call(this,name,parent,...rest);};
const {freshWorkshop,blankDraft,changeWorkshop,readWorkshop}=require('../../src/lib/bots/workshop8/state');
const {SLOTS,ITEM_MAP,ENTRY_MAP,preset,itemId,aggregateEquipment}=require('../../src/lib/bots/workshop8/catalogue');
const {playerAction}=require('../../src/lib/bots/workshop8/server-contract');
const {freshJourney,careerOf}=require('../../src/lib/bots/workshop8/journey');
const now=Date.UTC(2026,9,6,12),robotId='finished-robot',oldFetch=global.fetch;
const envNames=['BOTS_WORKSHOP8_SERVER','BB_SESSION_SECRET'],savedEnv=envNames.map(k=>process.env[k]);
const priceOf=choices=>SLOTS.reduce((sum,slot)=>sum+ITEM_MAP.get(itemId(choices[slot],slot)).price,0);
const valueOf=s=>s.coins+s.robots.reduce((sum,r)=>sum+priceOf(r.choices),0)+s.spares.reduce((sum,p)=>sum+ITEM_MAP.get(p.item).price,0);
function fixture(style='tank'){let s=freshWorkshop();s=changeWorkshop(s,{kind:'draft',draft:{...blankDraft(),name:'My original',choices:preset(style)}},now);s=changeWorkshop(s,{kind:'finish',request:robotId},now);s.coins=1000;return s;}
function spare(s,slot='armL',tier=2,style='speed',uid='owned-spare'){s.spares.push({uid,item:itemId(preset(style,tier)[slot],slot)});return uid;}
const replace=(slot='armL',spareUid='owned-spare',request='upgrade-request',id=robotId)=>playerAction({kind:'replacePart',id,slot,spareUid},request);
function unchangedFailure(s,action,pattern){const before=structuredClone(s);assert.throws(()=>changeWorkshop(s,action,now),pattern);assert.deepEqual(s,before);}
function pass(message){console.log('PASS '+message);}
async function main(){try{
 global.fetch=async()=>{throw Error('Network forbidden in upgrade checks');};
 for(const slot of SLOTS){const s=fixture();spare(s,slot);const before=valueOf(s),otherArm=s.robots[0].choices[slot==='armL'?'armR':'armL'];const action=replace(slot);const next=changeWorkshop(s,action,now);
  assert.equal(next.coins,s.coins);assert.equal(next.spares.length,1);assert.equal(next.spares[0].item,itemId(s.robots[0].choices[slot],slot));assert.equal(next.robots[0].choices[slot],preset('speed',2)[slot]);assert.equal(next.robots[0].cost,priceOf(next.robots[0].choices));assert.equal(valueOf(next),before);assert.equal(next.robots[0].choices[slot==='armL'?'armR':'armL'],otherArm);assert.equal(next.revision,s.revision+1);assert.deepEqual(changeWorkshop(next,action,now),next);assert.ok(readWorkshop(JSON.stringify(next)));
 }
 pass('all seven independent slots consume one owned spare, return one part, conserve value and replay requests once');
 for(const style of ['tank','speed','ranged'])for(const item of ITEM_MAP.values())if(item.slot==='weapon'){
  const s=fixture(style);if(s.robots[0].choices.weapon===item.entry.id)continue;s.spares.push({uid:'owned-spare',item:item.id});const next=changeWorkshop(s,replace('weapon'),now);assert.equal(next.robots[0].choices.weapon,item.entry.id);assert.ok(readWorkshop(JSON.stringify(next)));assert.equal(valueOf(next),valueOf(s));
 }
 pass('every current weapon profile and tier remains legal across all three body styles');
 {
  let s=fixture();spare(s);s.robots[0].cost=999999;const baseline=valueOf(s);s=changeWorkshop(s,replace(),now);assert.equal(s.robots[0].cost,300);const returned=s.spares[0].uid;s=changeWorkshop(s,replace('armL',returned,'swap-back-request'),now);assert.equal(s.robots[0].cost,250);assert.equal(valueOf(s),baseline);const cash=s.coins;s=changeWorkshop(s,{kind:'recycle',id:robotId,request:'recycle-upgraded'},now);assert.equal(s.coins,cash+100);assert.equal(s.spares.length,1);assert.equal(s.spares[0].item,itemId(preset('speed',2).armL,'armL'));
 }
 pass('swap-back and recycling exclude returned parts and discard stale/cumulative recycling values');
 {
  const s=fixture();spare(s);unchangedFailure(s,replace('armL','foreign-spare'),/no longer/);unchangedFailure(s,replace('armR'),/different part slot/);unchangedFailure(s,replace('armL','owned-spare','unknown-robot-request','other-robot'),/saved robot/);
  const same=fixture();spare(same,'armL',1,'tank');unchangedFailure(same,replace(),/already has/);
  const invalid=fixture();spare(invalid);delete invalid.robots[0].choices.armR;unchangedFailure(invalid,replace(),/valid robot/);
  const historical=fixture();historical.spares.push({uid:'owned-spare',item:'old-specialised-weapon:weapon'});unchangedFailure(historical,replace('weapon'),/no longer/);
  const collision=fixture();spare(collision);collision.spares.push({uid:'returned:upgrade-request',item:itemId(preset('tank').head,'head')});unchangedFailure(collision,replace(),/Refresh/);
  assert.throws(()=>playerAction({kind:'replacePart',id:robotId,slot:'bothArms',spareUid:'owned-spare'},'bad-slot-request'),/valid part slot/);
 }
 pass('unowned/wrong-slot/same parts, missing arm, unsupported historical equipment and returned-ID collisions fail without mutation');
 {
  const s=fixture();spare(s);const r=s.robots[0],packet={id:'earlier-fight',robotId,name:r.name,choices:structuredClone(r.choices),appearance:structuredClone(r.appearance),rival:preset('ranged'),seed:75,arena:'spaceship',startedAt:now-10000,completedAt:now-1000,winner:0,coins:75};s.history=[packet];s.days={'2026-10-06':1};s.journey=freshJourney();s.journey.retained[packet.id]=structuredClone(packet);r.wins=4;r.losses=2;r.career={...careerOf(r),verified:true,pinnedReplay:packet.id,milestones:{first_victory:packet.id},marks:[{slot:'armL',node:'old-arm',local:[0,0,0],fightId:packet.id},{slot:'torso',node:'torso',local:[0,0,0],fightId:packet.id}]};s.draft={...blankDraft(),name:'Separate draft',choices:{head:preset('ranged').head}};
  const next=changeWorkshop(s,replace(),now);assert.deepEqual(next.history,s.history);assert.deepEqual(next.journey,s.journey);assert.deepEqual(next.days,s.days);assert.deepEqual(next.draft,s.draft);assert.equal(next.robots[0].id,r.id);assert.equal(next.robots[0].name,r.name);assert.deepEqual(next.robots[0].appearance,r.appearance);assert.equal(next.robots[0].wins,4);assert.equal(next.robots[0].losses,2);assert.deepEqual(next.robots[0].career,{...r.career,marks:r.career.marks.slice(1)});assert.notDeepEqual(aggregateEquipment(r.choices,ENTRY_MAP),aggregateEquipment(next.robots[0].choices,ENTRY_MAP));
  for(const waiting of [true,false]){const active=structuredClone(s);active.active={...packet,completedAt:undefined,waiting};unchangedFailure(active,replace(),/Finish this robot/);}
  const otherFight=structuredClone(s);otherFight.active={...packet,robotId:null,completedAt:undefined};assert.deepEqual(changeWorkshop(otherFight,replace(),now).active,otherFight.active);
  const repairing=structuredClone(s);repairing.robots[0].repairUntil=now+1;unchangedFailure(repairing,replace(),/repair/);repairing.robots[0].repairUntil=now;assert.doesNotThrow(()=>changeWorkshop(repairing,replace(),now));
 }
 pass('active/loading fights and repairs block upgrades; old replays, records, paint, plans and reward counters stay unchanged');
 // Exercise the existing authenticated service with its real action parser and
 // state code. The adapter below implements only commit CAS/idempotency, not SQL.
 process.env.BOTS_WORKSHOP8_SERVER='1';process.env.BB_SESSION_SECRET='offline-upgrade-fixture';
 const {mintSession}=require('../../src/app/bots/_server/session'),{workshopPost}=require('../../src/app/bots/_server/workshop8');
 const wallet='0x1234567890123456789012345678901234567890',token=mintSession(wallet,false),req=new Request('http://127.0.0.1/api/bots/workshop',{headers:{Authorization:'Bearer '+token}});
 let stored=fixture(),commits=0;spare(stored);const requests=new Set();
 const db={from(table){const filters={};const q={select(){return q;},eq(k,v){filters[k]=v;return q;},async maybeSingle(){assert.equal(filters.wallet,wallet);if(table==='mk8_workshops')return{data:{state:structuredClone(stored),revision:stored.revision},error:null};assert.equal(table,'mk8_requests');return{data:requests.has(filters.request_id)?{request_id:filters.request_id}:null,error:null};}};return q;},async rpc(name,args){assert.equal(name,'mk8_commit');assert.equal(args.p_wallet,wallet);assert.equal(args.p_public,null);if(requests.has(args.p_request))return{data:{state:structuredClone(stored)},error:null};if(args.p_revision!==stored.revision)return{data:null,error:{message:'REVISION_CONFLICT'}};assert.equal(args.p_state.revision,stored.revision+1);stored=structuredClone(args.p_state);requests.add(args.p_request);commits++;return{data:{state:structuredClone(stored)},error:null};}};
 const revision=stored.revision,body={requestId:'service-upgrade-request',revision,action:{kind:'replacePart',id:robotId,slot:'armL',spareUid:'owned-spare',coins:999999,cost:0,choices:preset('tank',4)}};
 const responses=await Promise.all([workshopPost(req,body,{db,now}),workshopPost(req,body,{db,now})]);assert.equal(commits,1);assert.deepEqual(responses[0].state,responses[1].state);assert.equal(stored.coins,1000);assert.equal(stored.robots[0].cost,300);assert.equal(stored.spares.length,1);
 stored=fixture();spare(stored);requests.clear();commits=0;const races=await Promise.allSettled(['concurrent-first','concurrent-second'].map(requestId=>workshopPost(req,{...body,requestId,revision:stored.revision},{db,now})));assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.find(r=>r.status==='rejected').reason.status,409);assert.equal(commits,1);assert.equal(stored.spares.length,1);
 await assert.rejects(()=>workshopPost(new Request(req.url),body,{db,now}),e=>e.status===401);
 pass('existing signed wallet service: repeated request commits once, competing installs conflict, client money fields ignored, anonymous mutation rejected');
 console.log('No SQL changes, database calls, progression awards or file writes performed.');
 }finally{global.fetch=oldFetch;envNames.forEach((key,i)=>savedEnv[i]===undefined?delete process.env[key]:process.env[key]=savedEnv[i]);Module._load=load;Module._resolveFilename=resolve;Module._extensions['.ts']=extension;}}
main().catch(error=>{console.error(error);process.exitCode=1});
