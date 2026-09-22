import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { STYLE_BEGINNER_OFFERS, BEGINNER_OFFERS, BEGINNER_ORDER } from "../src/lib/bots/beginner-catalog";
import { EQUIPMENT_KIND } from "../src/lib/bots/equipment";
import { createFightV5, stepFightV5, presetV5, cardV5, RULES_V5, resultV5, hashV5, MAX_FRAMES_V5 } from "../src/lib/bots/v5";
import { advanceLiveSnapshot, liveTargetFrame, resumeLiveHouse, startLiveHouse, houseGearTier, type LiveHouseRow } from "../src/app/bots/_server/live-house";
import { startFight } from "../src/app/bots/_server/fights";
import { mintSession } from "../src/app/bots/_server/session";
import { POST as startRoute } from "../src/app/api/bots/fight/live/start/route";
import { POST as inputRoute } from "../src/app/api/bots/fight/live/[id]/input/route";
const { PGlite } = require(process.env.BOTS_PGLITE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const root = process.env.BOTS_REPO_ROOT || process.cwd();
const stage = process.env.BOTS_SERVER_STAGE || root;
const read = (file: string, staged=false) => fs.readFileSync(path.join(staged ? stage : root, file),"utf8");
const sql = (query: string, parameters: unknown[] = []) => db.query(query, parameters);
const one = async (query: string, parameters: unknown[] = []) => (await sql(query,parameters)).rows[0];
const name={first:"Tiny",second:"Biscuit",num:7};
const stringify=JSON.stringify;
const snapshot = async (wallet: string) => ({
  player: await one("SELECT * FROM battle_bots_players WHERE wallet=$1",[wallet]),
  bots:(await sql("SELECT * FROM battle_bots_bots WHERE wallet=$1 ORDER BY id",[wallet])).rows,
  parts:(await sql("SELECT * FROM battle_bots_part_instances WHERE wallet=$1 ORDER BY id",[wallet])).rows,
  ledger:(await sql("SELECT * FROM battle_bots_ledger WHERE wallet=$1 ORDER BY id",[wallet])).rows,
  progress: await one("SELECT * FROM battle_bots_onboarding WHERE wallet=$1",[wallet]),
});
const provision = (wallet:string) => one("SELECT bb_onboarding_styles_provision($1,'Test Robot',$2,true) AS value",[wallet,stringify(name)]).then(x=>x.value);
const offer = (socket:typeof BEGINNER_ORDER[number],n=0) => STYLE_BEGINNER_OFFERS.filter(o=>o.part.slot===EQUIPMENT_KIND[socket])[n];
const choose = (wallet:string,revision:number,socket:typeof BEGINNER_ORDER[number],n=0) => one("SELECT bb_onboarding_styles_edit($1,$2,'choose',$3,$4) AS value",[wallet,revision,socket,offer(socket,n).id]);
const finish = (wallet:string,revision:number) => one("SELECT bb_onboarding_styles_finish($1,$2) AS value",[wallet,revision]).then(x=>x.value);
const start = async (wallet:string,id:string,request:string,state:any,rewards:any,difficulty='easy') => {
  const bot=await one("SELECT * FROM battle_bots_bots WHERE wallet=$1 AND slot=1",[wallet]);
  return one("SELECT bb_live_house_v5_start($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'[]',$11) AS value",[wallet,id,request,bot.id,bot.updated_at,difficulty,'2026-09-11','2026-09-11T00:00:00Z',stringify(state),stringify(rewards),stringify(RULES_V5)]).then(x=>x.value);
};
const cas=(wallet:string,id:string,revision:number,state:unknown,receipts:unknown[]=[]) => one("SELECT bb_live_house_v5_cas($1,$2,$3,$4,$5) AS value",[wallet,id,revision,stringify(state),stringify(receipts)]).then(x=>x.value);
const settle=(wallet:string,id:string,result:unknown) => one("SELECT bb_live_house_v5_settle($1,$2,$3) AS value",[wallet,id,stringify(result)]).then(x=>x.value);
// Minimal PostgREST adapter backed by the local fixture, not a network client.
const fixtureDb = {
  from(table:string) {
    assert(['battle_bots_live_house_v5','battle_bots_bots','battle_bots_part_instances','battle_bots_hats','battle_bots_cards','battle_bots_players','battle_bots_onboarding'].includes(table));
    const filters: [string,unknown][]=[];
    const allowed=['id','wallet','request_id','bot_id','kind','recycled_at'];
    async function rows(){const where=filters.map(([key],i)=>`${key} IS NOT DISTINCT FROM $${i+1}`).join(' AND ');return (await sql(`SELECT to_jsonb(t) AS value FROM ${table} t${where?' WHERE '+where:''}`,filters.map(([,v])=>v))).rows.map((r:any)=>r.value);}
    const q={select(){return q;},eq(key:string,value:unknown){assert(allowed.includes(key));filters.push([key,value]);return q;},is(key:string,value:unknown){return q.eq(key,value);},order(){return q;},limit(){return q;},async maybeSingle(){
      return {data:(await rows())[0]??null,error:null};
    },then(resolve:any,reject:any){return rows().then(data=>({data,error:null})).then(resolve,reject);
    }};return q;
  },
  async rpc(name:string,args:Record<string,unknown>){
    assert(['bb_live_house_v5_start','bb_live_house_v5_cas','bb_live_house_v5_settle'].includes(name));
    const entries=Object.entries(args);entries.forEach(([key])=>assert(/^p_[a-z_]+$/.test(key)));
    try{const row=await one(`SELECT ${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) AS value`,entries.map(([,value])=>value&&typeof value==='object'?stringify(value):value));return{data:row?.value,error:null};}
    catch(e){return{data:null,error:{code:(e as any).code,message:(e as Error).message}};}
  }
} as any;
let checks=0;
const pass=(label:string)=>{checks++;console.log(`PASS ${label}`);};

async function main(){
  // Exercise the real route handlers with a local signed test session. Invalid
  // client data must be rejected before even constructing the service client.
  const dbModule=require('../src/app/bots/_server/db');const originalDb=dbModule.botsDb;let dbCalls=0;
  dbModule.botsDb=()=>{dbCalls++;throw new Error('API-boundary test cannot use a service database');};
  const token=mintSession('0x'+'a'.repeat(40),true);
  const request=(body:unknown,authorized=true)=>new Request('http://localhost/api/bots/fight/live/test',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:`Bearer ${token}`}:{})},body:stringify(body)});
  for(const field of ['tick','frame','winner','state','builds','body','who','seed']) {
    const response=await startRoute(request({botId:1,difficulty:'easy',requestId:'request-boundary-001',[field]:100}));
    assert.equal(response.status,400);const value=await response.json();assert.equal(value.ok,false);assert.equal(typeof value.error,'string');
    const response2=await inputRoute(request({inputId:'input-boundary-001',kind:'special',[field]:100}),{params:{id:'00000000-0000-4000-8000-000000000005'}});
    assert.equal(response2.status,400);assert.equal(typeof (await response2.json()).error,'string');
  }
  assert.equal((await inputRoute(request({inputId:'short',kind:'special'}),{params:{id:'anything'}})).status,400);
  assert.equal((await startRoute(request({botId:1,difficulty:'easy',requestId:'request-boundary-001'},false))).status,401);
  assert.equal(dbCalls,0);dbModule.botsDb=originalDb;
  pass('real authenticated API handlers reject extra client ticks/winners/builds/side/seed and malformed inputs before service access');
  await db.exec(read("scripts/sql/fixtures/onboarding-schema.sql"));
  await db.exec("CREATE TABLE battle_bots_hats(id bigserial, wallet text,kind text,color text); CREATE TABLE battle_bots_cards(id bigserial,wallet text,kind text,bot_id bigint);");
  await db.exec(read("scripts/sql/bots-onboarding-v1.sql"));
  await db.exec(read("scripts/sql/bots-onboarding-v2.sql"));
  await one("SELECT bb_onboarding_v2_provision('old','Old Robot',$1,true)",[stringify(name)]);
  const old=await snapshot('old');
  const moneyBefore=await one("SELECT pg_get_functiondef(oid) AS body FROM pg_proc WHERE proname='bb_grant'");
  await db.exec(read("scripts/sql/bots-styles-starter-v1.sql",true));
  await db.exec(read("scripts/sql/bots-live-house-v5.sql",true));
  assert.deepEqual((await snapshot('old')).parts,old.parts);assert.deepEqual((await snapshot('old')).ledger,old.ledger);
  assert.equal((await snapshot('old')).progress.catalogue_version,1);
  assert.equal((await provision('old')).joined,false);
  assert.deepEqual(await one("SELECT pg_get_functiondef(oid) AS body FROM pg_proc WHERE proname='bb_grant'"),moneyBefore);
  const seeded=(await sql("SELECT part_key,stats FROM battle_bots_styles_offers ORDER BY ordinal")).rows;
  assert.equal(seeded.length,STYLE_BEGINNER_OFFERS.length);
  for(const o of STYLE_BEGINNER_OFFERS) assert.deepEqual(seeded.find((r:any)=>r.part_key===o.id).stats,o.part.s);
  pass('additive migrations preserve old inventory/grants and install exact equal-budget styled stats');

  assert.equal((await provision('new')).joined,true);
  const fresh=await snapshot('new');
  assert.equal(fresh.bots.length,1);assert.equal(fresh.parts.length,0);assert.equal(Number(fresh.player.coins),250);assert.equal(fresh.progress.catalogue_version,2);
  await Promise.all([provision('new'),provision('new')]);assert.deepEqual(await snapshot('new'),fresh);
  await assert.rejects(()=>finish('new',0),/seven parts/);assert.deepEqual(await snapshot('new'),fresh);
  let rev=0;for(const s of BEGINNER_ORDER) await choose('new',rev++,s,s==='armR'?1:0);
  await assert.rejects(()=>choose('new',0,'head',1),/another window/);
  await assert.rejects(()=>one("SELECT bb_onboarding_styles_edit('new',$1,'choose','head',$2)",[rev,BEGINNER_OFFERS.find(o=>o.part.slot==='head')!.id]),/beginner/);
  const pending=await snapshot('new');
  await db.exec("CREATE FUNCTION fail_styled_part() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.wallet='new' AND NEW.slot_kind='weapon' THEN RAISE EXCEPTION 'injected part failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_styled_part BEFORE INSERT ON battle_bots_part_instances FOR EACH ROW EXECUTE FUNCTION fail_styled_part();");
  await assert.rejects(()=>finish('new',rev),/injected/);assert.deepEqual(await snapshot('new'),pending);
  await db.exec("DROP TRIGGER fail_styled_part ON battle_bots_part_instances; DROP FUNCTION fail_styled_part();");
  await Promise.all([finish('new',rev),finish('new',rev)]);
  const done=await snapshot('new');
  assert.equal(done.parts.length,7);assert.equal(done.ledger.length,2);assert.equal(Number(done.player.coins),0);
  assert.equal(done.bots[0].id,fresh.bots[0].id);assert.equal(done.bots[0].build.engineVersion,5);assert.equal(done.bots[0].build.assemblyLocked,true);
  for(const part of done.parts) assert.deepEqual(part.stats.s,STYLE_BEGINNER_OFFERS.find(o=>o.id===part.part_key)!.part.s);
  assert.equal(done.progress.draft_offers.armR,offer('armR',1).id);
  assert.equal((await finish('new',rev)).duplicate,true);assert.deepEqual(await snapshot('new'),done);
  await assert.rejects(()=>choose('new',rev,'head'),/finished/);
  pass('single starter, independent choices, stale revision and late failure rollback; duplicate Finish cannot spend twice');

  await provision('transfer');
  const offers=Object.fromEntries(BEGINNER_ORDER.map(s=>[s,offer(s,1).id]));
  const transfer=()=>one("SELECT bb_onboarding_styles_handoff('transfer',$1,$2,'{}','{}',true,$3) AS value",[stringify(offers),stringify(name),'a'.repeat(64)]);
  assert.equal((await transfer()).value.applied,true);const transferred=await snapshot('transfer');await transfer();assert.deepEqual(await snapshot('transfer'),transferred);
  const conflict=await one("SELECT bb_onboarding_styles_handoff('transfer',$1,$2,'{}','{}',true,$3) AS value",[stringify(offers),stringify(name),'b'.repeat(64)]);
  assert.equal(conflict.value.applied,false);assert.deepEqual(await snapshot('transfer'),transferred);
  pass('completed browser handoff is atomic/idempotent and conflicting garage remains intact');

  const transferredBot=transferred.bots[0];const runAt=Date.now();
  process.env.BOTS_STYLES_V1='0';
  await assert.rejects(()=>startLiveHouse({} as any,'transfer',{botId:transferredBot.id,difficulty:'easy',requestId:'full-start-001'},runAt),/not open/);
  process.env.BOTS_STYLES_V1='1';
  await assert.rejects(()=>startLiveHouse({from:()=>({select(){return this;},eq(){return this;},async maybeSingle(){return{data:null,error:{code:'42P01',message:'missing local fixture migration'}};}})} as any,'transfer',{botId:transferredBot.id,difficulty:'easy',requestId:'full-start-001'},runAt),/being set up/);
  await assert.rejects(()=>startLiveHouse(fixtureDb,'old',{botId:old.bots[0].id,difficulty:'easy',requestId:'legacy-start-001'},runAt),/styled robot/);
  const detached=transferred.parts[0];
  await db.exec("ALTER TABLE battle_bots_part_instances DISABLE TRIGGER battle_bots_styles_attached_part_guard;");
  await sql("UPDATE battle_bots_part_instances SET bot_id=NULL WHERE id=$1",[detached.id]);
  await db.exec("ALTER TABLE battle_bots_part_instances ENABLE TRIGGER battle_bots_styles_attached_part_guard;");
  await assert.rejects(()=>startLiveHouse(fixtureDb,'transfer',{botId:transferredBot.id,difficulty:'easy',requestId:'full-start-001'},runAt),/not all on this robot/);
  await assert.rejects(()=>start('transfer','00000000-0000-4000-8000-000000000015','detached-start-001',createFightV5(75,presetV5('speed'),presetV5('tank')),{win:{coins:1},loss:{coins:1}}),/not all on this robot/);
  assert.equal((await snapshot('transfer')).bots[0].attacks_today,0);
  await sql("UPDATE battle_bots_part_instances SET bot_id=$1 WHERE id=$2",[transferredBot.id,detached.id]);
  const fullStart=await startLiveHouse(fixtureDb,'transfer',{botId:transferredBot.id,difficulty:'easy',requestId:'full-start-001'},runAt);
  assert.equal(fullStart.session.status,'running');assert.equal(fullStart.session.identities.length,2);
  for(const socket of BEGINNER_ORDER) assert.equal(fullStart.session.builds[0].parts[socket].id,offers[socket]);
  assert.equal((await startLiveHouse(fixtureDb,'transfer',{botId:transferredBot.id,difficulty:'easy',requestId:'full-start-001'},runAt)).session.id,fullStart.session.id);
  await assert.rejects(()=>startLiveHouse(fixtureDb,'transfer',{botId:transferredBot.id,difficulty:'hard',requestId:'full-start-001'},runAt),/another fight/);
  for(const mode of ['spar','pve','pvp'] as const) await assert.rejects(()=>startFight(fixtureDb,{wallet:'transfer',isTest:true} as any,{mode,botId:transferredBot.id} as any),/new house arena/);
  process.env.BOTS_STYLES_V1='0';
  const fullResult=await resumeLiveHouse(fixtureDb,'transfer',fullStart.session.id,undefined,runAt+100000);
  assert.equal(fullResult.session.status,'complete');assert.equal(fullResult.session.state.done,true);assert(fullResult.session.settlement);
  assert.equal((await snapshot('transfer')).ledger.filter((r:any)=>r.reason.startsWith('battle:live5:')).length,1);
  assert.equal((await snapshot('transfer')).bots[0].attacks_today,1);
  assert.equal((await resumeLiveHouse(fixtureDb,'transfer',fullStart.session.id,undefined,runAt+110000)).session.result!.hash,fullResult.session.result!.hash);
  process.env.BOTS_STYLES_V1='1';
  pass('real start→resume→settle pipeline uses exact owned snapshots; flag/missing-migration/old-bot/detached-part guards preserve attacks, legacy arena refuses all new-bot fight modes, flag-off resumes settle once');

  // New mixed builds are valid, but the same physical parts cannot be claimed
  // twice by overlapping requests to different garage bays.
  const mixedSockets:Record<string,number>={};
  for(const socket of BEGINNER_ORDER) {
    const source=transferred.parts.find((p:any)=>p.id===transferredBot.build.sockets[socket]);
    const legacy=socket==='head'?BEGINNER_OFFERS.find(o=>o.part.slot==='head'):null;
    const higher=socket==='torso'?cardV5('mk5.t3.tank.torso'):null;
    const clone=await one("INSERT INTO battle_bots_part_instances(wallet,part_key,slot_kind,tier,stats,bot_id,source,list_price,is_test,color) VALUES('transfer',$1,$2,$3,$4,NULL,'shop',$5,true,$6) RETURNING id",[higher?.id??legacy?.id??source.part_key,source.slot_kind,higher?.tier??legacy?.part.tier??source.tier,stringify(higher?{...source.stats,s:higher.s}:legacy?{s:legacy.part.s,equipmentVersion:2,paint:legacy.color}:source.stats),source.list_price,legacy?.color??source.color]);
    mixedSockets[socket]=Number(clone.id);
  }
  const mixedBuild={engineVersion:5,catalogueVersion:2,equipmentVersion:2,assemblyLocked:true,sockets:mixedSockets,parts:{head:mixedSockets.head,torso:mixedSockets.torso,arms:mixedSockets.armL,legs:mixedSockets.legL,weapon:mixedSockets.weapon},name};
  const saveAssembly=(bay:number,botId:number|null=null,expected:unknown=null,build:unknown=mixedBuild)=>one("SELECT bb_styles_save_assembly('transfer',$1,$2,$3,'Tiny Biscuit',$4,24,3,'light') AS value",[botId,expected,bay,stringify(build)]).then(x=>x.value);
  const beforeAssembly=await snapshot('transfer');
  await db.exec("CREATE FUNCTION fail_styled_bind() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.wallet='transfer' AND OLD.bot_id IS NULL AND NEW.bot_id IS NOT NULL AND NEW.slot_kind='weapon' THEN RAISE EXCEPTION 'injected assembly binding failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_styled_bind AFTER UPDATE ON battle_bots_part_instances FOR EACH ROW EXECUTE FUNCTION fail_styled_bind();");
  await assert.rejects(()=>saveAssembly(2),/injected assembly/);assert.deepEqual(await snapshot('transfer'),beforeAssembly);
  await db.exec("DROP TRIGGER fail_styled_bind ON battle_bots_part_instances; DROP FUNCTION fail_styled_bind();");
  const assemblyRace=await Promise.allSettled([saveAssembly(2),saveAssembly(3)]);
  assert.equal(assemblyRace.filter(r=>r.status==='fulfilled').length,1);assert.equal(assemblyRace.filter(r=>r.status==='rejected').length,1);
  const saved=(await snapshot('transfer')).bots.find((b:any)=>b.slot===2||b.slot===3);
  assert(saved);assert.equal((await snapshot('transfer')).bots.length,2);
  for(const id of Object.values(mixedSockets)) assert.equal((await one("SELECT bot_id FROM battle_bots_part_instances WHERE id=$1",[id])).bot_id,saved.id);
  assert.equal((await saveAssembly(saved.slot,null,null)).duplicate,true);
  await assert.rejects(()=>sql("UPDATE battle_bots_part_instances SET bot_id=$1 WHERE id=$2",[transferredBot.id,mixedSockets.head]),/keeps its parts/);
  const swapped={...mixedBuild,sockets:{...mixedSockets,armL:mixedSockets.armR,armR:mixedSockets.armL}};
  await assert.rejects(()=>saveAssembly(saved.slot,saved.id,saved.updated_at,swapped),/keeps its parts/);
  const cosmetic={...mixedBuild,name:{...name,num:8}};
  await assert.rejects(()=>saveAssembly(saved.slot,saved.id,'2000-01-01',cosmetic),/another window/);
  await saveAssembly(saved.slot,saved.id,saved.updated_at,cosmetic);
  const mixedLive=await startLiveHouse(fixtureDb,'transfer',{botId:saved.id,difficulty:'easy',requestId:'mixed-live-start-001'},runAt);
  assert.equal(mixedLive.session.builds[0].parts.head.id,BEGINNER_OFFERS.find(o=>o.part.slot==='head')!.id);
  assert.deepEqual(mixedLive.session.builds[0].parts.head.s,[1,1,1]);
  assert.equal(mixedLive.session.builds[0].tier,3);assert.equal(houseGearTier(mixedLive.session.builds[0]),1);
  assert.equal(mixedLive.session.builds[1].tier,1,'a tier3 body with otherwise starter gear faces a tier1 easy house robot');
  for(const tier of [1,2,3,4] as const) assert.equal(houseGearTier(presetV5('tank',tier)),tier);
  pass('mixed legacy/styled owned parts form a new robot; late save failure rolls back, concurrent bays cannot claim the same parts, retries preserve one assembly and completed parts stay permanent');
  let oldRevision=0;
  for(const socket of BEGINNER_ORDER) await one("SELECT bb_onboarding_v2_edit('old',$1,'choose',$2,$3)",[oldRevision++,socket,BEGINNER_OFFERS.find(o=>o.part.slot===EQUIPMENT_KIND[socket])!.id]);
  await one("SELECT bb_onboarding_v2_finish('old',$1)",[oldRevision]);
  const finishedOld=await snapshot('old');const oldBot=finishedOld.bots[0];
  assert.equal(oldBot.build.engineVersion,undefined);
  await assert.rejects(()=>one("SELECT bb_styles_save_assembly('old',$1,$2,1,'Tiny Biscuit',$3,24,3,'light')",[oldBot.id,oldBot.updated_at,stringify(mixedBuild)]),/keeps its parts/);
  await assert.rejects(()=>startFight(fixtureDb,{wallet:'old',isTest:true} as any,{mode:'pvp',botId:oldBot.id,defenderBotId:saved.id,stake:25} as any),/new house arena/);
  assert.deepEqual(await snapshot('old'),finishedOld);
  pass('finished earlier robots cannot gain v5 metadata and legacy challengers cannot target styled defenders; both inventories and counters remain unchanged');

  const state=createFightV5(75,presetV5('tank',1),presetV5('speed',1),{autoSpecial:[false,true]});
  const drop=offer('head').part;
  const rewards={win:{coins:10,points:1,xp:3,repairMs:0,drop:{partKey:drop.id,slot:drop.slot,tier:drop.tier,s:drop.s,price:drop.price,paint:null}},loss:{coins:3,points:0,xp:1,repairMs:86400000,drop:null}};
  const id='00000000-0000-4000-8000-000000000005';
  const opened=await start('new',id,'request-new-001',state,rewards);
  assert.equal(opened.revision,0);assert.equal((await start('new',id,'request-new-001',state,rewards)).id,id);
  const alternate=await start('new','00000000-0000-4000-8000-000000000006','request-new-002',state,rewards);
  assert.equal(alternate.id,id);assert.equal((await snapshot('new')).bots[0].attacks_today,1);
  const beforeRecycle=await snapshot('new');await assert.rejects(()=>one("SELECT bb_styles_recycle('new',$1)",[done.bots[0].id]),/Wait for this fight/);assert.deepEqual(await snapshot('new'),beforeRecycle);
  pass('duplicate/racing starts share one session/attack and an active robot cannot recycle for coins');

  const row=opened as LiveHouseRow;
  assert.equal(liveTargetFrame(row.started_at,Date.parse(row.started_at)-1000,0),0);
  assert.equal(liveTargetFrame(row.started_at,Date.parse(row.started_at)+1e9,0),MAX_FRAMES_V5);
  const at=Date.parse(row.started_at)+1500;
  const moved=advanceLiveSnapshot(row,at,{inputId:'special-request-001',kind:'special'});
  assert.equal(moved.state.frame,90);assert.equal(moved.receipts.length,1);assert.equal(moved.receipt!.accepted,false);
  const results=await Promise.all([cas('new',id,0,moved.state,moved.receipts),cas('new',id,0,moved.state,moved.receipts)]);
  assert.equal(results.filter(Boolean).length,1);
  const current=results.find(Boolean) as LiveHouseRow;
  const retry=advanceLiveSnapshot(current,at+100,{inputId:'special-request-001',kind:'special'});
  assert.deepEqual(retry.receipt,moved.receipt);assert.equal(retry.receipts.length,1);
  assert.equal(await cas('other',id,current.revision,retry.state,retry.receipts),null);
  const forged=structuredClone(current.state);forged.seed++;
  await assert.rejects(()=>cas('new',id,current.revision,forged,current.input_receipts),/snapshot/);
  await assert.rejects(()=>cas('new',id,current.revision,current.state,[{...current.input_receipts[0],accepted:true}]),/history/);
  pass('authoritative elapsed ticks, refused input idempotency, cross-wallet isolation and CAS races');

  const manual=createFightV5(97,presetV5('tank',4),presetV5('tank',4),{autoSpecial:[false,false]});
  while(!manual.done && (manual.fighters[0].meter<100 || manual.fighters[0].stunnedUntil>manual.frame || manual.fighters[0].downUntil>manual.frame)) stepFightV5(manual);
  assert.equal(manual.done,false,'a real match reaches manual special readiness');
  const manualRow={...current,state:manual,input_receipts:[]} as LiveHouseRow;
  const manualNow=Date.parse(manualRow.started_at)+manual.frame*1000/60+0.1;
  const activated=advanceLiveSnapshot(manualRow,manualNow,{inputId:'actual-special-001',kind:'special'});
  assert.equal(activated.receipt!.accepted,true);assert.equal(activated.state.commands.length,1);assert.equal(activated.state.commands[0].who,0);
  const afterActivation={...manualRow,state:activated.state,input_receipts:activated.receipts};
  const repeated=advanceLiveSnapshot(afterActivation,manualNow+100,{inputId:'actual-special-001',kind:'special'});
  assert.deepEqual(repeated.receipt,activated.receipt);assert.equal(repeated.state.commands.length,1);
  const early=advanceLiveSnapshot(afterActivation,manualNow+100,{inputId:'actual-special-002',kind:'special'});
  assert.equal(early.receipt!.accepted,false);assert.equal(early.state.commands.length,1);
  pass('a genuinely charged manual special activates once; duplicate IDs keep the accepted frame and another press cannot bypass readiness');

  const lost=advanceLiveSnapshot(current,Date.parse(current.started_at)+100000);
  const resumed=advanceLiveSnapshot(current,Date.parse(current.started_at)+100000);
  assert.equal(lost.state.done,true);assert.equal(hashV5(lost.state),hashV5(resumed.state));
  assert.deepEqual(lost.state.commands.filter(c=>c.who===0),current.state.commands.filter(c=>c.who===0));
  const pendingRow=await cas('new',id,current.revision,lost.state,lost.receipts);
  assert.equal(pendingRow.status,'settlement-pending');
  const engineResult=resultV5(lost.state);
  const unsettled=await snapshot('new');
  await assert.rejects(()=>settle('new',id,{...engineResult,winner:engineResult.winner===0?1:0}),/does not match/);
  await db.exec("CREATE FUNCTION fail_live_reward() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason LIKE 'battle:live5:%' THEN RAISE EXCEPTION 'injected reward failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_live_reward AFTER INSERT ON battle_bots_ledger FOR EACH ROW EXECUTE FUNCTION fail_live_reward();");
  await assert.rejects(()=>settle('new',id,engineResult),/injected/);assert.deepEqual(await snapshot('new'),unsettled);
  const temporarilySilent=console.error;let reportedFailure=false;console.error=()=>{reportedFailure=true;};
  const pendingResponse=await resumeLiveHouse(fixtureDb,'new',id,undefined,Date.parse(current.started_at)+100000);
  console.error=temporarilySilent;
  assert.equal(reportedFailure,true);assert.equal(pendingResponse.session.status,'settlement-pending');assert(pendingResponse.session.result);
  assert.equal((await one("SELECT status FROM battle_bots_live_house_v5 WHERE id=$1",[id])).status,'settlement-pending');
  await db.exec("DROP TRIGGER fail_live_reward ON battle_bots_ledger; DROP FUNCTION fail_live_reward();");
  await db.exec("CREATE FUNCTION fail_live_finalize() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='complete' THEN RAISE EXCEPTION 'injected final status failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_live_finalize BEFORE UPDATE ON battle_bots_live_house_v5 FOR EACH ROW EXECUTE FUNCTION fail_live_finalize();");
  await assert.rejects(()=>settle('new',id,engineResult),/injected final/);assert.deepEqual(await snapshot('new'),unsettled);
  await db.exec("DROP TRIGGER fail_live_finalize ON battle_bots_live_house_v5; DROP FUNCTION fail_live_finalize();");
  await Promise.all([resumeLiveHouse(fixtureDb,'new',id,undefined,Date.parse(current.started_at)+100000),settle('new',id,engineResult)]);
  const rewarded=await snapshot('new');
  assert.equal(rewarded.ledger.filter((r:any)=>r.reason.startsWith('battle:live5:')).length,1);
  assert.equal(rewarded.bots[0].wins+rewarded.bots[0].losses,1);
  const receipt=await settle('new',id,engineResult);assert.equal(receipt.status,'complete');assert.deepEqual(await snapshot('new'),rewarded);
  pass('disconnection ends deterministically without invented manual moves; failed settlement rolls back and retry pays/records once');

  await one("SELECT bb_styles_recycle('new',$1)",[done.bots[0].id]);
  assert.equal((await snapshot('new')).bots.length,0);assert.equal((await one("SELECT status FROM battle_bots_live_house_v5 WHERE id=$1",[id])).status,'complete');
  await one("SELECT bb_styles_recycle('new',$1)",[done.bots[0].id]);
  assert.equal((await snapshot('new')).ledger.filter((r:any)=>r.reason.startsWith('recycle:')).length,1);
  await db.exec(read("scripts/sql/bots-styles-starter-v1.sql",true));await db.exec(read("scripts/sql/bots-live-house-v5.sql",true));
  const roles=await one("SELECT has_function_privilege('anon','bb_live_house_v5_cas(text,uuid,int,jsonb,jsonb)','EXECUTE') AS anon,has_function_privilege('authenticated','bb_onboarding_styles_finish(text,int)','EXECUTE') AS authenticated");
  assert.equal(roles.anon,false);assert.equal(roles.authenticated,false);
  pass('settled snapshots survive atomic recycling, migration reruns preserve saves, public roles cannot invoke privileged RPCs');
  console.log(`${checks} styled server groups passed.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
