import assert from "node:assert/strict";
import { BEGINNER_OFFERS, BEGINNER_ORDER } from "../src/lib/bots/beginner-catalog";
import { EQUIPMENT_KIND } from "../src/lib/bots/equipment";
import { demoBuy, demoComplete, demoWelcome, freshGameDemo } from "../src/lib/bots/game-demo";
import { parsePracticeAppearance, practiceAppearanceOf } from "../src/lib/bots/practice-handoff";
import type { BotsDb } from "../src/app/bots/_server/db";

const marker = require.resolve("server-only");
require.cache[marker] = { id: marker, filename: marker, loaded: true, exports: {} } as NodeModule;
const dbPath = require.resolve("../src/app/bots/_server/db");
const databaseModule = require(dbPath) as typeof import("../src/app/bots/_server/db");
let activeDb: BotsDb;
require.cache[dbPath]!.exports = { ...databaseModule, botsDb: () => activeDb };
const { startFight } = require("../src/app/bots/_server/fights") as typeof import("../src/app/bots/_server/fights");
const { carryPracticeAppearance } = require("../src/app/bots/_server/practice-handoff") as typeof import("../src/app/bots/_server/practice-handoff");
const { starterPartRows } = require("../src/app/bots/_server/players") as typeof import("../src/app/bots/_server/players");
const { mintSession } = require("../src/app/bots/_server/session") as typeof import("../src/app/bots/_server/session");
const { POST: save } = require("../src/app/api/bots/bot/save/route") as typeof import("../src/app/api/bots/bot/save/route");
const { POST: recycle } = require("../src/app/api/bots/bot/recycle/route") as typeof import("../src/app/api/bots/bot/recycle/route");
const { recyclableParts } = require("../src/app/bots/_server/recycle") as typeof import("../src/app/bots/_server/recycle");
const wallet = "0x00000000000000000000000000000000000000ab";
const env = process.env as Record<string, string | undefined>;

/** In-memory service boundary: exercises actual resolver/route writes, with no network or player data. */
function fixture() {
  const rows: Record<string, any[]> = { battle_bots_players: [{ id: 1, wallet, wallet_name: "Brass Otter 41", coins: 45, battle_points: 0, is_test: true, review_status: "clear" }], battle_bots_bots: [], battle_bots_part_instances: [], battle_bots_battles: [], battle_bots_ledger: [], battle_bots_cards: [], battle_bots_hats: [] };
  const parts = starterPartRows(wallet, true).map((p, i) => ({ ...p, id: i + 1, bot_id: 1, recycled_at: null }));
  const remaining = [...parts];
  const sockets = Object.fromEntries(BEGINNER_ORDER.map(s => { const i = remaining.findIndex(p => p.slot_kind === EQUIPMENT_KIND[s]); return [s, remaining.splice(i, 1)[0].id]; }));
  const name = { first: "Rusty", second: "Pickle", num: null };
  const bot = { id: 1, wallet, slot: 1, name: "Rusty Pickle", build: { sockets, equipmentVersion: 2, name, parts: { head: sockets.head, torso: sockets.torso, arms: sockets.armL, legs: sockets.legL, weapon: sockets.weapon } }, total: 10, tier: 1, level: 1, xp: 0, wins: 0, losses: 0, broken_until: null, attacks_today: 0, defenses_today: 0, attacks_day_key: "2026-09-08", updated_at: "2026-09-08T00:00:00.000Z", recycled_at: null, listed: true, is_test: true };
  rows.battle_bots_bots.push(bot); rows.battle_bots_part_instances.push(...parts);
  let writes = 0;
  let failPartId: number | null = null;
  let failBotDelete = false;
  const db = {
    from(table: string) {
      let filters: ((r: any) => boolean)[] = [], patch: any, inserts: any, single = false, counted = false, deleting = false;
      const value = (r: any, key: string) => key.includes("->>") ? r[key.split("->>")[0]]?.[key.split("->>")[1]] : r[key];
      const q: any = {
        select: (_cols: string, o?: any) => { counted = !!o?.count; return q; },
        eq: (key: string, v: any) => { filters.push(r => value(r, key) === v); return q; },
        neq: (key: string, v: any) => { filters.push(r => value(r, key) !== v); return q; },
        is: (key: string, v: any) => { filters.push(r => (value(r, key) ?? null) === v); return q; },
        in: (key: string, v: any[]) => { filters.push(r => v.includes(value(r, key))); return q; },
        gte: () => q, or: () => q, order: () => q, limit: () => q,
        update: (v: any) => { patch = v; return q; }, insert: (v: any) => { inserts = Array.isArray(v) ? v : [v]; return q; },
        delete: () => { deleting = true; return q; },
        single: () => { single = true; return q; }, maybeSingle: () => { single = true; return q; },
        then: (resolve: (r: any) => void, reject: (e: any) => void) => Promise.resolve().then(() => {
          if (table === "battle_bots_onboarding") return { data: null, error: { code: "PGRST205", message: "Could not find the table in the schema cache" } };
          assert(table in rows, `Unexpected table ${table}`);
          let selected = rows[table].filter(r => filters.every(f => f(r)));
          if (patch && table === "battle_bots_part_instances" && selected.some(r => r.id === failPartId)) { failPartId = null; return { data: null, error: { message: "simulated interrupted part write" } }; }
          if (patch) { writes++; selected.forEach(r => Object.assign(r, structuredClone(patch))); }
          if (inserts) { writes++; selected = inserts.map((r: any) => ({ ...structuredClone(r), id: rows[table].length + 1, created_at: "2026-09-08T00:00:01.000Z" })); rows[table].push(...selected); }
          if (deleting && table === "battle_bots_bots" && failBotDelete) { failBotDelete = false; return { data: null, error: { message: "simulated interrupted bot delete" } }; }
          if (deleting) { writes++; rows[table] = rows[table].filter(r => !selected.includes(r)); }
          return { data: structuredClone(single ? selected[0] ?? null : selected), count: counted ? selected.length : undefined, error: null };
        }).then(resolve, reject),
      };
      return q;
    },
    async rpc(name: string, p: any) {
      if (name === "bb_coin_balance") return { data: null, error: { message: "function does not exist" } };
      assert.equal(name, "bb_grant"); writes++;
      const player = rows.battle_bots_players[0], duplicate = rows.battle_bots_ledger.some(r => r.reason === p.p_reason);
      if (!duplicate) { player.coins += p.p_coins; player.battle_points += p.p_battle_points; rows.battle_bots_ledger.push({ wallet, reason: p.p_reason, coins: p.p_coins, meta: structuredClone(p.p_meta) }); }
      return { error: null, data: { ok: true, duplicate, new_coins: player.coins, new_battle_points: player.battle_points } };
    },
  } as unknown as BotsDb;
  return { db, rows, bot, parts, writes: () => writes, failPart: (id: number) => { failPartId = id; }, failBotRemoval: () => { failBotDelete = true; } };
}

async function main() {
  const names = ["NODE_ENV", "BB_SESSION_SECRET", "BB_FIGHT_SALT", "BB_CARD_SECRET"], before = names.map(n => env[n]);
  const log = console.error, network = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("No live network allowed in this regression"); };
    console.error = () => {};
    env.NODE_ENV = "production"; env.BB_SESSION_SECRET = "test-session-signing-key";
    delete env.BB_FIGHT_SALT; delete env.BB_CARD_SECRET;
    const f = fixture(); activeDb = f.db;
    const session = { wallet, isTest: true, exp: Date.now() + 60000 };
    await assert.rejects(() => startFight(f.db, session, { botId: 1, mode: "pve" }), e => e instanceof databaseModule.Refusal && e.status === 503);
    assert.equal(f.writes(), 0); assert.equal(f.bot.attacks_today, 0); assert.equal(f.rows.battle_bots_battles.length, 0);
    env.BB_FIGHT_SALT = "test-fight-signing-key";
    await assert.rejects(() => startFight(f.db, session, { botId: 1, mode: "pvp", defenderBotId: 2, stake: 25 }), e => e instanceof databaseModule.Refusal && e.status === 503);
    assert.equal(f.writes(), 0, "Missing PvP card key refuses before holds or rewards");
    env.BB_CARD_SECRET = "test-card-signing-key";

    let practice = demoWelcome(freshGameDemo());
    for (const socket of BEGINNER_ORDER) practice = demoBuy(practice, socket, BEGINNER_OFFERS.filter(o => o.part.slot === EQUIPMENT_KIND[socket])[socket.endsWith("R") ? 2 : 1].id);
    practice = demoComplete(practice);
    const appearance = practiceAppearanceOf(practice, practice.builds[1])!;
    assert(appearance); assert.equal(parsePracticeAppearance({ ...appearance, offers: { ...appearance.offers, armL: appearance.offers.head } }), null);
    const forgedPaints = { ...appearance, paints: Object.fromEntries(BEGINNER_ORDER.filter(s => s !== "weapon").map(s => [s, "mint"])) };
    assert.equal(parsePracticeAppearance(forgedPaints), null, "Forged matching paints cannot introduce a combat set bonus");
    await assert.rejects(() => carryPracticeAppearance(f.db, wallet, forgedPaints), e => e instanceof databaseModule.Refusal && e.status === 400);
    assert.equal(f.writes(), 0, "Forged colours are rejected before any bot or part write");
    const economy = f.parts.map(p => ({ id: p.id, stats: p.stats.s, price: p.list_price, salvage: p.stats.salvage }));
    const payload = { ...appearance, coins: 999999, stats: [999, 999, 999], look: { face: "happy", hat: "crown" } };
    const copied = await carryPracticeAppearance(f.db, wallet, payload);
    assert.equal(copied.applied, true); assert.equal(copied.bay, 1);
    for (const socket of BEGINNER_ORDER) assert.equal(f.parts.find(p => p.id === (f.bot.build.sockets as Record<string, number>)[socket])?.part_key, appearance.offers[socket]);
    assert.deepEqual(f.parts.map(p => ({ id: p.id, stats: p.stats.s, price: p.list_price, salvage: p.stats.salvage })), economy);
    assert.equal(f.rows.battle_bots_players[0].coins, 45); assert.equal(f.rows.battle_bots_ledger.length, 0);
    assert.notEqual((f.bot.build as any).look.hat, "crown");
    const writes = f.writes(); assert.equal((await carryPracticeAppearance(f.db, wallet, appearance)).applied, false); assert.equal((await carryPracticeAppearance(f.db, wallet, payload)).applied, true); assert.equal(f.writes(), writes);
    const established = fixture(); established.bot.wins = 1;
    assert.equal((await carryPracticeAppearance(established.db, wallet, appearance)).applied, false); assert.equal(established.writes(), 0);

    const token = mintSession(wallet, true);
    const saveRequest = (sockets: any) => new Request("http://localhost/api/bots/bot/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, bay: 1, name: appearance.name, sockets, look: { face: "happy" } }) });
    const interrupted = fixture(); activeDb = interrupted.db; interrupted.failPart(interrupted.parts[1].id);
    await assert.rejects(() => carryPracticeAppearance(interrupted.db, wallet, appearance));
    assert.equal((interrupted.bot.build as any).practiceHandoff.status, "pending");
    const pendingWrites = interrupted.writes();
    assert.equal((await save(saveRequest(interrupted.bot.build.sockets))).status, 409);
    assert.equal((await recycle(new Request("http://localhost/api/bots/bot/recycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, botId: 1 }) }))).status, 409);
    await assert.rejects(() => startFight(interrupted.db, session, { botId: 1, mode: "pve" }), e => e instanceof databaseModule.Refusal && e.status === 409);
    assert.equal(interrupted.writes(), pendingWrites, "Pending appearance blocks fight, save and recycle without writes");
    const otherHead = BEGINNER_OFFERS.find(o => o.part.slot === "head" && o.id !== appearance.offers.head)!;
    const changed = { ...appearance, offers: { ...appearance.offers, head: otherHead.id }, paints: { ...appearance.paints, head: otherHead.color ?? undefined } };
    assert.equal((await carryPracticeAppearance(interrupted.db, wallet, changed)).applied, false); assert.equal(interrupted.writes(), pendingWrites);
    assert.equal((await carryPracticeAppearance(interrupted.db, wallet, appearance)).applied, true);
    assert.equal((interrupted.bot.build as any).practiceHandoff.status, "complete");
    const concurrent = fixture();
    const results = await Promise.allSettled([carryPracticeAppearance(concurrent.db, wallet, appearance), carryPracticeAppearance(concurrent.db, wallet, changed)]);
    assert.equal(results.filter(r => r.status === "fulfilled" && r.value.applied).length, 1);
    const winner = results[0].status === "fulfilled" && results[0].value.applied ? appearance : changed;
    for (const socket of BEGINNER_ORDER) assert.equal(concurrent.parts.find(p => p.id === (concurrent.bot.build.sockets as Record<string, number>)[socket])?.part_key, winner.offers[socket]);
    const duplicate = fixture(); assert((await Promise.all([carryPracticeAppearance(duplicate.db, wallet, appearance), carryPracticeAppearance(duplicate.db, wallet, appearance)])).every(r => r.applied));
    const welcome = freshGameDemo(), welcomeAppearance = practiceAppearanceOf(welcome, welcome.builds[0])!, welcomeAccount = fixture();
    assert.equal((await carryPracticeAppearance(welcomeAccount.db, wallet, welcomeAppearance)).applied, true);
    for (const socket of BEGINNER_ORDER.filter(s => s !== "weapon")) {
      const part = welcomeAccount.parts.find(p => p.id === (welcomeAccount.bot.build.sockets as Record<string, number>)[socket])!;
      assert.equal(part.stats.paint, welcomeAppearance.paints?.[socket]); assert.equal(part.color, welcomeAppearance.paints?.[socket]);
    }
    const failedStart = fixture(); failedStart.rows.battle_bots_battles.push({ id: 77, status: "declined", challenger_bot_id: 1, result: { why: "BB_FIGHT_SALT is not set; refusing to run in production without it" } });
    assert.equal((await carryPracticeAppearance(failedStart.db, wallet, appearance)).applied, true, "A compensated configuration failure must not lock in the wrong starter");
    const openFight = fixture(); openFight.rows.battle_bots_battles.push({ id: 78, status: "open", challenger_bot_id: 1 });
    assert.equal((await carryPracticeAppearance(openFight.db, wallet, appearance)).applied, false); assert.equal(openFight.writes(), 0);
    activeDb = f.db;
    const removed = await save(saveRequest({ ...f.bot.build.sockets, head: null })); assert.equal(removed.status, 409); assert.equal(f.writes(), writes);
    const cosmetic = await save(saveRequest(f.bot.build.sockets)); assert.equal(cosmetic.status, 200); assert.equal((f.bot.build as any).practiceImported, true);
    const recoveredParts = recyclableParts(f.bot as any, f.parts as any, wallet); assert.equal(recoveredParts.length, 7);
    assert.throws(() => recyclableParts(f.bot as any, [{ ...f.parts[0], wallet: "another" }, ...f.parts.slice(1)] as any, wallet));
    assert.throws(() => recyclableParts(f.bot as any, f.parts.slice(1) as any, wallet));

    const cleanup = fixture(); activeDb = cleanup.db; cleanup.failBotRemoval();
    const recycleRequest = () => new Request("http://localhost/api/bots/bot/recycle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, botId: 1 }) });
    assert.equal((await recycle(recycleRequest())).status, 500, "The simulated bot delete fails after payment and part removal");
    assert.equal(cleanup.rows.battle_bots_part_instances.length, 0); assert.equal(cleanup.rows.battle_bots_bots.length, 1);
    const paidBalance = cleanup.rows.battle_bots_players[0].coins;
    assert(paidBalance > 45); assert.equal(cleanup.rows.battle_bots_ledger.length, 1);
    const retried = await recycle(recycleRequest()); assert.equal(retried.status, 200); assert.equal((await retried.json()).coins, 0);
    assert.equal(cleanup.rows.battle_bots_players[0].coins, paidBalance); assert.equal(cleanup.rows.battle_bots_ledger.length, 1); assert.equal(cleanup.rows.battle_bots_bots.length, 0);
    const receipt = cleanup.rows.battle_bots_ledger[0];
    assert.equal(recyclableParts(cleanup.bot as any, cleanup.parts.slice(0, 2) as any, wallet, receipt).length, 2, "Matching paid receipt permits a remaining owned subset");
    assert.throws(() => recyclableParts(cleanup.bot as any, [] as any, wallet, { ...receipt, meta: { parts: [999] } }));
    assert.throws(() => recyclableParts(cleanup.bot as any, [{ ...cleanup.parts[0], slot_kind: "weapon" }] as any, wallet, receipt));
    activeDb = f.db;

    const fight = await startFight(f.db, session, { botId: 1, mode: "pve", difficulty: "easy" }, "2026-09-08");
    assert(fight.fightId); assert.equal(f.bot.attacks_today, 1); assert.equal(f.rows.battle_bots_battles[0].status, "resolved");
    assert(f.rows.battle_bots_battles[0].result.hash >= 0); assert.equal(f.bot.wins + f.bot.losses, 1);
    console.log("Wallet/fight: missing signing config spends nothing; canonical appearance carries no economy; concurrent/retried/interrupted handoffs stay consistent; pending writes block fights/save/recycle; permanent parts and cosmetics; paid recycle cleanup retries without a second grant; real house resolver completes and records one fight.");
  } finally { console.error = log; globalThis.fetch = network; names.forEach((n, i) => { if (before[i] === undefined) delete env[n]; else env[n] = before[i]; }); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
