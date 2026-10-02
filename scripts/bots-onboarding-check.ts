import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BEGINNER_ALLOWANCE, BEGINNER_OFFERS, BEGINNER_ORDER, BEGINNER_PRICE, gameCard } from "../src/lib/bots/beginner-catalog";
import { EQUIPMENT_KIND } from "../src/lib/bots/equipment";
import { modularSet, assertModularBuild, combatPart } from "../src/lib/bots/combat-model";
import { engineBuildOf, totalOf, partView } from "../src/app/bots/_server/bots";
import { canonicalBuild } from "../src/app/bots/_server/fight-read";
import { WELCOME_REWARDS, coinBalance } from "../src/app/bots/_server/onboarding";
import { resolveFight } from "../src/lib/bots/combat";
import { readPracticeRobot } from "../src/lib/bots/demo-replay";
const { PGlite } = require(process.env.BOTS_PGLITE_PATH || "@electric-sql/pglite");

const db = new PGlite();
const sql = (s: string, p: unknown[] = []) => db.query(s, p);
const one = async (s: string, p: unknown[] = []) => (await sql(s, p)).rows[0];
const migration = fs.readFileSync(path.join(process.cwd(), "scripts/sql/bots-onboarding-v1.sql"), "utf8");
const name = { first: "Tiny", second: "Biscuit", num: 7 };
const provision = (wallet: string) => one("SELECT bb_onboarding_provision($1,'Brass Otter 7',$2,$2,true) AS value", [wallet, JSON.stringify(name)]);
const offer = (socket: typeof BEGINNER_ORDER[number], index = 0) => BEGINNER_OFFERS.filter(o => o.part.slot === EQUIPMENT_KIND[socket])[index];
const buy = (wallet: string, socket: typeof BEGINNER_ORDER[number], index = 0) => one("SELECT bb_onboarding_buy($1,$2,$3) AS value", [wallet, socket, offer(socket, index).id]);
const grant = (wallet: string, amount: number, reason: string) => one("SELECT * FROM bb_grant($1,'Brass Otter 7',$2,0,$3,null,true)", [wallet, amount, reason]);
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

(async () => {
  await db.exec(fs.readFileSync(path.join(process.cwd(), "scripts/sql/fixtures/onboarding-schema.sql"), "utf8"));
  await db.exec(migration);
  const dbOffers = (await sql("SELECT * FROM battle_bots_beginner_offers ORDER BY ordinal")).rows;
  assert.equal(dbOffers.length, BEGINNER_OFFERS.length);
  for (const [i, o] of Array.from(BEGINNER_OFFERS.entries())) {
    assert.deepEqual(o.part.s, [1, 1, 1]); assert.equal(o.part.tier, 1); assert.equal(o.part.family, undefined);
    assert.equal(dbOffers[i].part_key, o.id); assert.equal(dbOffers[i].price, o.price); assert.equal(dbOffers[i].color, o.color);
    assert.equal(gameCard(o.id)?.id, o.id);
  }
  assert.equal(BEGINNER_ORDER.reduce((n, s) => n + BEGINNER_PRICE[s], 0), BEGINNER_ALLOWANCE);
  pass("40 neutral offers agree with SQL; exactly seven purchases cost 250");

  const first = await provision("new");
  assert.equal(first.value.joined, true);
  const initial = await snapshot("new");
  assert.equal(initial.bots.length, 2); assert.equal(initial.parts.length, 7);
  assert.equal(new Set(Object.values(initial.bots[0].build.sockets)).size, 7);
  assert(initial.parts.every((p: any) => p.list_price === 0 && p.stats.salvage === 0));
  assert.deepEqual(await balance("new"), { total: 250, reserved: 250, spendable: 0 });
  assert.equal(initial.bots[0].level, 1); assert.equal(initial.bots[0].total, 15);
  const welcome = engineBuildOf(initial.bots[0], initial.parts)!;
  assertModularBuild(welcome, "welcome");
  assert.equal(modularSet(welcome).perStat, 0);
  assert.equal(totalOf(initial.bots[0], initial.parts), 15);
  assert.equal(partView(initial.parts[0]).name, offer("head").part.name);
  pass("free complete welcome robot and protected allowance provision atomically");
  assert.equal((await provision("new")).value.joined, false);
  assert.deepEqual(await snapshot("new"), initial);
  pass("re-enlist keeps IDs, coins, test flag, inventory and timestamps unchanged");

  await db.exec("CREATE FUNCTION test_refuse_starter() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.wallet='provision-failure' AND NEW.slot_kind='arms' THEN RAISE EXCEPTION 'test starter failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_refuse_starter BEFORE INSERT ON battle_bots_part_instances FOR EACH ROW EXECUTE FUNCTION test_refuse_starter();");
  await assert.rejects(() => provision("provision-failure"));
  const failedProvision = await snapshot("provision-failure");
  assert.equal(failedProvision.player, undefined); assert.equal(failedProvision.bots.length, 0);
  assert.equal(failedProvision.parts.length, 0); assert.equal(failedProvision.ledger.length, 0);
  await db.exec("DROP TRIGGER test_refuse_starter ON battle_bots_part_instances;");
  pass("a halfway starter failure leaves no player, orphan parts, robot or grant behind");

  await grant("old", 120, "starter:old"); await grant("old", -75, "starter-kit:old");
  const old = await snapshot("old");
  assert.equal((await provision("old")).value.onboarding, null);
  assert.deepEqual(await snapshot("old"), old);
  await grant("reporter", 31, "fill:existing"); await provision("reporter");
  assert.deepEqual(await balance("reporter"), { total: 281, reserved: 250, spendable: 31 });
  pass("old starter accounts unchanged; reporter-only accounts retain earned coins");

  assert.equal((await grant("new", -1, "normal-shop")).ok, false);
  assert.equal((await grant("new", -25, "stake")).ok, false);
  await grant("new", 80, "earned-trade"); assert.equal((await grant("new", -80, "normal-shop")).ok, true);
  const sameSpend = await grant("new", -80, "normal-shop"); assert.equal(sameSpend.ok, true); assert.equal(sameSpend.duplicate, true);
  assert.deepEqual(await balance("new"), { total: 250, reserved: 250, spendable: 0 });
  pass("normal shop/stakes cannot spend reserve; repeat debit succeeds at zero spendable balance");

  const beforeWrong = await snapshot("new");
  await assert.rejects(() => one("SELECT bb_onboarding_buy('new','armL',$1)", [offer("head").id]));
  assert.deepEqual(await snapshot("new"), beforeWrong);
  await db.exec("CREATE FUNCTION test_refuse_part() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.wallet='new' AND NEW.source='beginner' THEN RAISE EXCEPTION 'test insert failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_refuse_part BEFORE INSERT ON battle_bots_part_instances FOR EACH ROW EXECUTE FUNCTION test_refuse_part();");
  await assert.rejects(() => buy("new", "head"));
  assert.deepEqual(await snapshot("new"), beforeWrong);
  await db.exec("DROP TRIGGER test_refuse_part ON battle_bots_part_instances;");
  pass("wrong-slot and failed insert roll back reserve, ledger, inventory and build together");

  for (const socket of BEGINNER_ORDER) {
    const purchased = await buy("new", socket, socket === "armR" || socket === "legR" ? 1 : 0);
    const state = await snapshot("new");
    const draft = state.bots.find((b: any) => b.id === state.progress.draft_bot_id);
    assert.equal(totalOf(draft, state.parts), draft.total);
    const again = await buy("new", socket, 2);
    assert.deepEqual(again.value, purchased.value, "An already claimed socket returns its original item, even for a different offer");
    assert.deepEqual(await snapshot("new"), state);
  }
  const assembled = await snapshot("new");
  assert.equal(assembled.parts.length, 14); assert.equal(assembled.claims.length, 7);
  assert.deepEqual(await balance("new"), { total: 0, reserved: 0, spendable: 0 });
  const draft = assembled.bots.find((b: any) => b.id === assembled.progress.draft_bot_id);
  assert.equal(draft.total, 15); assert.equal(draft.level, 1); assert.equal(draft.xp, 0);
  const build = engineBuildOf(draft, assembled.parts)!;
  assertModularBuild(build, "first build");
  assert.notEqual(combatPart(build, "armL").id, combatPart(build, "armR").id);
  assert.notEqual(combatPart(build, "legL").id, combatPart(build, "legR").id);
  assert.equal(modularSet(build).familyMatch, false);
  pass("all seven independent claims conserve cost, snapshots and identity, including final zero-coin retry");

  await assert.rejects(() => sql("DELETE FROM battle_bots_part_instances WHERE id=$1", [assembled.parts[0].id]));
  await assert.rejects(() => sql("DELETE FROM battle_bots_bots WHERE id=$1", [draft.id]));
  await assert.rejects(() => sql("UPDATE battle_bots_bots SET build=jsonb_set(build,'{sockets,armR}','null') WHERE id=$1", [draft.id]));
  await sql("UPDATE battle_bots_bots SET build=jsonb_set(build,'{look}','{\"face\":\"calm\"}') WHERE id=$1", [draft.id]);
  pass("unfinished tutorial cannot recycle/lose its parts; appearance edits still work");

  const replay = readPracticeRobot(JSON.stringify({ name: "Tiny Biscuit 7", pieces: BEGINNER_ORDER.map(s => [combatPart(build, s).id, combatPart(build, s).paint ?? null]) }));
  assert(replay); assert.deepEqual(replay.build, build);
  const result = resolveFight(123, build, welcome);
  assert.equal(result.engineVersion, 3);
  assert.equal(resolveFight(123, replay.build, welcome).hash, result.hash);
  pass("neutral beginner identities survive public practice whitelist without acquiring original family stats");

  const payload = { v: 3, seed: 123, mode: "spar", hash: result.hash, buildA: build, buildB: welcome, rewards: WELCOME_REWARDS };
  const beforePractice = await snapshot("new");
  await assert.rejects(() => one("SELECT bb_onboarding_practice('new',$1,'2026-09-07')", [JSON.stringify({ ...payload, rewards: { ...WELCOME_REWARDS, attackerCoins: 1 } })]));
  const fought = await one("SELECT bb_onboarding_practice('new',$1,'2026-09-07') AS id", [JSON.stringify(payload)]);
  const again = await one("SELECT bb_onboarding_practice('new',$1,'2026-09-07') AS id", [JSON.stringify(payload)]);
  assert.equal(again.id, fought.id);
  const afterPractice = await snapshot("new");
  for (const key of ["player", "bots", "parts", "ledger", "claims"] as const) assert.deepEqual(afterPractice[key], beforePractice[key]);
  const saved = await one("SELECT * FROM battle_bots_battles WHERE id=$1", [fought.id]);
  assert.equal(saved.stake, 0); assert.equal(saved.coins_paid, 0); assert.equal(Number(saved.points_paid), 0);
  assert.equal(resolveFight(saved.result.seed, canonicalBuild(saved.result.buildA), canonicalBuild(saved.result.buildB)).hash, result.hash);
  pass("private welcome spar persists once, replays after JSONB, and changes no coins, XP, record, counters or repairs");

  await sql("SELECT bb_onboarding_ack('new','complete')"); const finished = await snapshot("new");
  await sql("SELECT bb_onboarding_ack('new','complete')"); assert.deepEqual(await snapshot("new"), finished);
  await sql("UPDATE battle_bots_bots SET listed=true WHERE id=$1", [draft.id]);
  assert.equal(coinBalance({ coins: 15 }, null).spendable, 15);
  await assert.rejects(() => sql("SELECT bb_onboarding_ack('reporter','complete')"));
  pass("completion persists, retries safely and unlocks normal play only after the practice exists");

  const beforeMigrationRepeat = await snapshot("new"); await db.exec(migration);
  assert.deepEqual(await snapshot("new"), beforeMigrationRepeat);
  const access = await one("SELECT has_function_privilege('anon','bb_onboarding_buy(text,text,text)','EXECUTE') AS anon,has_function_privilege('authenticated','bb_grant(text,text,numeric,numeric,text,jsonb,boolean)','EXECUTE') AS auth");
  assert.equal(access.anon, false); assert.equal(access.auth, false);
  pass("migration is idempotent and anonymous/authenticated browser roles cannot call money RPCs");
  console.log(`${checks} onboarding checks passed.`);
})().catch((e: unknown) => { console.error(e); process.exitCode = 1; }).finally(() => db.close());
