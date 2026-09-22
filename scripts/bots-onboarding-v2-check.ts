import assert from "node:assert/strict";
import fs from "node:fs";
import { BEGINNER_OFFERS, BEGINNER_ORDER } from "../src/lib/bots/beginner-catalog";
import { EQUIPMENT_KIND, socketsOf } from "../src/lib/bots/equipment";
import { freshGameDemo, demoWelcome, demoBuy, demoFinish, demoSave, readGameDemo, demoComplete } from "../src/lib/bots/game-demo";
import { parsePracticeDraft, practiceDraftOf } from "../src/lib/bots/practice-handoff";
import { parseDraftOffers, emptyDraftOffers, draftPreview } from "../src/lib/bots/onboarding-draft";
import { engineBuildOf, totalOf } from "../src/app/bots/_server/bots";
import { coinBalance } from "../src/app/bots/_server/onboarding";
import { starterPartRows } from "../src/app/bots/_server/players";
const { PGlite } = require(process.env.BOTS_PGLITE_PATH || "@electric-sql/pglite");
const db = new PGlite();
const sql = (s: string, p: unknown[] = []) => db.query(s, p);
const one = async (s: string, p: unknown[] = []) => (await sql(s, p)).rows[0];
const name = { first: "Tiny", second: "Biscuit", num: 7 };
const offer = (socket: typeof BEGINNER_ORDER[number], index = 0) => BEGINNER_OFFERS.filter(o => o.part.slot === EQUIPMENT_KIND[socket])[index];
const provision = (wallet: string) => one("SELECT bb_onboarding_v2_provision($1,'Brass Otter 7',$2,true) AS value", [wallet, JSON.stringify(name)]);
const choose = (wallet: string, revision: number, socket: typeof BEGINNER_ORDER[number], index = 0) => one("SELECT bb_onboarding_v2_edit($1,$2,'choose',$3,$4) AS value", [wallet, revision, socket, offer(socket,index).id]);
const finish = (wallet: string, revision: number) => one("SELECT bb_onboarding_v2_finish($1,$2) AS value", [wallet, revision]);
const balance = (wallet: string) => one("SELECT bb_coin_balance($1) AS value", [wallet]).then(r => r.value);
const snapshot = async (wallet: string) => ({
  player: await one("SELECT * FROM battle_bots_players WHERE wallet=$1", [wallet]),
  bots: (await sql("SELECT * FROM battle_bots_bots WHERE wallet=$1 ORDER BY id", [wallet])).rows,
  parts: (await sql("SELECT * FROM battle_bots_part_instances WHERE wallet=$1 ORDER BY id", [wallet])).rows,
  ledger: (await sql("SELECT * FROM battle_bots_ledger WHERE wallet=$1 ORDER BY id", [wallet])).rows,
  progress: await one("SELECT * FROM battle_bots_onboarding WHERE wallet=$1", [wallet]),
  claims: (await sql("SELECT * FROM battle_bots_beginner_claims WHERE wallet=$1 ORDER BY socket", [wallet])).rows,
});
let checks = 0;
const pass = (s: string) => { checks++; console.log(`PASS ${s}`); };

async function main() {
  let local = freshGameDemo(2);
  assert.equal(local.builds.length, 1); assert.equal(local.parts.length, 0); assert.equal(local.coins, 250);
  assert.equal(practiceDraftOf(local, local.builds[0])?.complete, false);
  local = demoWelcome(local);
  for (const socket of BEGINNER_ORDER) {
    local = demoBuy(local, socket, offer(socket).id);
    assert.equal(local.coins, 250);
    assert.deepEqual(readGameDemo(JSON.stringify(local), 2).parts, local.parts);
  }
  assert.equal(local.onboarding.step, "shop"); assert.equal(local.onboarding.milestones.assembled, false);
  const previousSockets = socketsOf(local.builds[0]);
  local = demoBuy(local, "head", offer("head",1).id);
  local = demoSave(local, { ...local.builds[0], name });
  assert.equal(local.parts.find(p => p.uid === previousSockets.head)?.id, offer("head",1).id);
  for (const s of BEGINNER_ORDER.filter(s => s !== "head")) assert.equal(socketsOf(local.builds[0])[s], previousSockets[s]);
  const chosen = local.parts.map(p => p.id);
  assert.equal(practiceDraftOf(local, local.builds[0])?.complete, false);
  local = demoFinish(local);
  assert.equal(local.coins, 0); assert.equal(local.onboarding.step, "complete"); assert.equal(local.onboarding.milestones.practiced, false);
  assert.deepEqual(local.parts.map(p => p.id), chosen); assert.equal(demoFinish(local), local);
  assert.equal(demoBuy(local, "head", offer("head").id), local);
  assert.deepEqual(readGameDemo(JSON.stringify(local),2), local);
  assert.equal(practiceDraftOf(local, local.builds[0])?.complete, true);
  const forged = JSON.parse(JSON.stringify(local)); forged.coins = 99999; forged.parts[0].s = [999,999,999];
  assert.equal(readGameDemo(JSON.stringify(forged),2).coins,0);
  assert(readGameDemo(JSON.stringify(forged),2).parts.every(p => p.s.every(n => n===1)));
  assert.equal(parseDraftOffers({ ...emptyDraftOffers(), head: offer("weapon").id }),null);
  assert.equal(parsePracticeDraft({ ...practiceDraftOf(local,local.builds[0]), offers: { head: offer("head").id }, complete: true }),null);
  const v1 = freshGameDemo(); assert.equal(readGameDemo(JSON.stringify(v1),2).version,1); assert.equal(readGameDemo(JSON.stringify(v1),2).parts.length,7);
  assert.equal(demoComplete(freshGameDemo(2)).onboarding.step,"welcome");
  assert.equal(draftPreview(freshGameDemo(2).onboarding).parts.length,0);
  pass("local v2 makes one editable draft, spends only on Finish, preserves identity/reload and keeps v1 saves");

  await db.exec(fs.readFileSync("scripts/sql/fixtures/onboarding-schema.sql","utf8"));
  await db.exec(fs.readFileSync("scripts/sql/bots-onboarding-v1.sql","utf8"));
  await one("SELECT bb_onboarding_provision('v1','Brass Otter 7',$1,$1,true)", [JSON.stringify(name)]);
  const old = await snapshot("v1");
  const migration = fs.readFileSync("scripts/sql/bots-onboarding-v2.sql","utf8");
  await db.exec(migration);
  assert.deepEqual((await snapshot("v1")).parts,old.parts);
  assert.equal((await provision("v1")).value.joined,false);
  assert.deepEqual((await snapshot("v1")).ledger,old.ledger);
  assert.deepEqual(await balance("v1"),{total:250,reserved:250,spendable:0});
  pass("additive migration and v2 enrollment preserve previous inventories, ledger and reserve");

  assert.equal((await provision("new")).value.joined,true);
  const initial = await snapshot("new");
  assert.equal(initial.bots.length,1); assert.equal(initial.parts.length,0); assert.equal(initial.progress.welcome_bot_id,null);
  assert.deepEqual(await balance("new"),{total:250,reserved:250,spendable:0});
  assert.deepEqual(coinBalance(initial.player,initial.progress),await balance("new"));
  assert.equal((await provision("new")).value.joined,false);
  assert.deepEqual(await snapshot("new"),initial);
  const deniedSpend = await one("SELECT * FROM bb_grant('new','Brass Otter 7',-1,0,'outside-spend',null,true)");
  assert.equal(deniedSpend.ok,false);
  await assert.rejects(()=>finish("new",0),/seven parts/);
  assert.deepEqual(await snapshot("new"),initial);
  pass("single empty robot and protected 250 are granted once; incomplete Finish rolls back");

  let rev=0;
  for(const socket of BEGINNER_ORDER) { await choose("new",rev++,socket); assert.deepEqual(await balance("new"),{total:250,reserved:250,spendable:0}); }
  let before=await snapshot("new"); assert.equal(before.parts.length,0); assert.equal(before.ledger.length,1);
  await assert.rejects(()=>choose("new",0,"head",1),/another window/);
  await assert.rejects(()=>one("SELECT bb_onboarding_v2_edit('new',$1,'choose','head',$2)",[rev,offer("weapon").id]));
  assert.deepEqual(await snapshot("new"),before);
  await choose("new",rev++,"head",1);
  const same=await choose("new",rev,"head",1); assert.equal(same.value.revision,rev);
  await one("SELECT bb_onboarding_v2_edit('new',$1,'name',null,null,$2)",[rev++,JSON.stringify({...name,num:8})]);
  before=await snapshot("new");
  assert.equal(before.progress.draft_offers.head,offer("head",1).id);
  await assert.rejects(()=>finish("new",rev-1),/another window/);
  const first=await finish("new",rev); assert.equal(first.value.duplicate,false);
  const done=await snapshot("new"); assert.equal(done.parts.length,7); assert.equal(done.claims.length,7); assert.equal(done.ledger.length,2);
  assert.equal(done.bots[0].id,initial.bots[0].id); assert.equal(done.bots[0].name,"Tiny Biscuit 8");
  assert.equal(done.progress.practice_fight_id,null); assert(done.progress.completed_at);
  assert.deepEqual(await balance("new"),{total:0,reserved:0,spendable:0});
  assert.equal(done.parts.find((p:any)=>p.slot_kind==='head').part_key,offer("head",1).id);
  assert(done.parts.every((p:any)=>p.stats.salvage===Math.floor(p.list_price*.4) && p.stats.s.every((n:number)=>n===1)));
  assert(engineBuildOf(done.bots[0],done.parts)); assert.equal(totalOf(done.bots[0],done.parts),15);
  assert.equal((await finish("new",rev)).value.duplicate,true); assert.deepEqual(await snapshot("new"),done);
  await assert.rejects(()=>choose("new",rev,"head"),/finished/);
  await assert.rejects(()=>finish("new",rev-1),/already finished/);
  pass("revisions reject stale choices; explicit atomic Finish creates seven canonical parts once on the same bot");

  await provision("failure"); let failRev=0;
  for(const socket of BEGINNER_ORDER) await choose("failure",failRev++,socket);
  const failedBefore=await snapshot("failure");
  await db.exec("CREATE FUNCTION fail_last_part() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.wallet='failure' AND NEW.slot_kind='weapon' THEN RAISE EXCEPTION 'injected storage failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_last_part BEFORE INSERT ON battle_bots_part_instances FOR EACH ROW EXECUTE FUNCTION fail_last_part();");
  await assert.rejects(()=>finish("failure",failRev),/injected/);
  assert.deepEqual(await snapshot("failure"),failedBefore);
  await db.exec("DROP TRIGGER fail_last_part ON battle_bots_part_instances; DROP FUNCTION fail_last_part();");
  await finish("failure",failRev);
  pass("late part failure rolls back coins, claims and attachment; retry succeeds without duplicate grants");

  const handoff = (wallet:string,offers:unknown,complete:boolean,hash:string) => one("SELECT bb_onboarding_v2_handoff($1,$2,$3,'{}','{}',$4,$5) AS value",[wallet,JSON.stringify(offers),JSON.stringify(name),complete,hash.repeat(64)]);
  await provision("partial");
  assert.equal((await handoff("partial",{head:offer("head",2).id},false,"a")).value.applied,true);
  const partial=await snapshot("partial"); assert.equal(partial.parts.length,0); assert.equal(partial.progress.revision,1);
  assert.equal((await handoff("partial",{head:offer("head",2).id},false,"a")).value.applied,true); assert.deepEqual(await snapshot("partial"),partial);
  assert.equal((await handoff("partial",{head:offer("head",1).id},false,"b")).value.applied,false); assert.deepEqual(await snapshot("partial"),partial);
  await provision("complete");
  const allOffers=Object.fromEntries(BEGINNER_ORDER.map(s=>[s,offer(s,1).id]));
  assert.equal((await handoff("complete",allOffers,true,"c")).value.complete,true);
  const handed=await snapshot("complete"); assert.equal(handed.parts.length,7); assert.equal(handed.bots.length,1); assert.equal(Number(handed.player.coins),0);
  assert.equal((await handoff("complete",allOffers,true,"c")).value.applied,true); assert.deepEqual(await snapshot("complete"),handed);
  await provision("conflict"); await choose("conflict",0,"head"); const conflict=await snapshot("conflict");
  assert.equal((await handoff("conflict",allOffers,true,"d")).value.applied,false); assert.deepEqual(await snapshot("conflict"),conflict);
  await provision("bad-transfer"); const bad=await snapshot("bad-transfer");
  await assert.rejects(()=>handoff("bad-transfer",{head:offer("head").id},true,"e")); assert.deepEqual(await snapshot("bad-transfer"),bad);
  pass("partial/complete handoff is atomic, idempotent and preserves conflicting wallet drafts without importing economy");

  // All supported deployment versions share the player lock. Exercise either
  // version winning first, plus queued mixed-version requests on the same wallet.
  for (const first of ["v1","v2","legacy"] as const) {
    const wallet=`mixed-${first}`;
    const starters={v1:()=>one("SELECT bb_onboarding_provision($1,'Brass Otter',$2,$2,true) AS value",[wallet,JSON.stringify(name)]),
      v2:()=>provision(wallet),legacy:()=>one("SELECT bb_legacy_provision($1,'Brass Otter',$2,$3,true) AS value",[wallet,JSON.stringify(name),JSON.stringify(starterPartRows(wallet,true))])};
    await starters[first](); const winner=await snapshot(wallet);
    await Promise.all([starters.v1(),starters.v2(),starters.legacy(),starters[first]()]);
    assert.deepEqual(await snapshot(wallet),winner,`mixed deployment cannot add a second ${first} starter or grant`);
  }
  await provision("handoff-failure"); const transferBefore=await snapshot("handoff-failure");
  await db.exec("CREATE FUNCTION fail_transfer_part() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN IF NEW.wallet='handoff-failure' AND NEW.slot_kind='weapon' THEN RAISE EXCEPTION 'injected transfer failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_transfer_part BEFORE INSERT ON battle_bots_part_instances FOR EACH ROW EXECUTE FUNCTION fail_transfer_part();");
  await assert.rejects(()=>handoff("handoff-failure",allOffers,true,"f"),/injected transfer failure/);
  assert.deepEqual(await snapshot("handoff-failure"),transferBefore,"failed full transfer cannot claim a fingerprint or partial draft");
  await db.exec("DROP TRIGGER fail_transfer_part ON battle_bots_part_instances; DROP FUNCTION fail_transfer_part();");
  assert.equal((await handoff("handoff-failure",allOffers,true,"f")).value.applied,true);
  pass("mixed v1/v2/legacy enrollment keeps one grant; a late complete-handoff failure releases its fingerprint for safe retry");

  await db.exec(migration); assert.deepEqual(await snapshot("complete"),handed);
  const roles=await one("SELECT has_function_privilege('anon','bb_onboarding_v2_finish(text,int)','EXECUTE') AS anon,has_function_privilege('authenticated','bb_onboarding_v2_handoff(text,jsonb,jsonb,jsonb,jsonb,boolean,text)','EXECUTE') AS auth");
  assert.equal(roles.anon,false); assert.equal(roles.auth,false);
  pass("repeat migration is safe and public browser roles cannot execute privileged starter operations");
  console.log(`${checks} onboarding v2 groups passed.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>db.close());
