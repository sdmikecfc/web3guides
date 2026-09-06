/**
 * BATTLE BOTS FIGHTS: the server half of engine doc section 7. The server
 * loads BOTH builds from the database (never from the request), makes the
 * fight id, derives seed = fnv1a(fightId + "|" + FIGHT_SALT), runs
 * resolveFight once, stores the row and applies every consequence in one
 * pass. The client replays from the same seed and compares hashes.
 *
 * THE FIGHT ID is the battle row's own id: the row is inserted OPEN first
 * (that is where the id comes from), resolved, then flipped open ->
 * resolved WHERE status = 'open' (the conditional flip the schema
 * describes in battle_bots_001_init.sql section 13), and only the request
 * that wins the flip applies rewards. Every grant carries a reason unique
 * per fight id and role, so a rerun pays nothing twice.
 *
 * ORDER OF CHECKS (each a plain-words refusal): the bot is yours and
 * complete; not in the shop; PvP: the defender is listed, whole, not in the
 * shop, not yours, not already challenged by you today, under five defences
 * today, and the stake is 25..500 and inside your coins; THEN THE DAILY COIN
 * CEILING, on the most this fight could pay, while nothing has yet been
 * claimed, held or written; then the attack is claimed (2 a day, sparring
 * spends none), the defence is claimed, the row is opened, the stake is held
 * (a negative grant BEFORE the bell, refused by bb_grant on an overdraft),
 * and the fight runs. Anything that fails after the open row lands is
 * compensated: counters released, the hold refunded, the row marked declined.
 *
 * THE CEILING IS CHECKED BEFORE THE MONEY MOVES (fixed 2026-09-04). It used
 * to run after the stake was taken and after the row was flipped to
 * resolved, and the compensating catch only fires while the row is still
 * open, so a tripped ceiling ate the challenger's stake, paid nothing, and
 * left a battle row claiming coins nobody received.
 *
 * THE DEFENDER IS NEVER BROKEN AND NEVER CHARGED. Repair (24 h) lands on
 * the attacker's bot only when the attacker lost. Sparring is private,
 * free, and pays nothing.
 */
import "server-only";
import { CARD_BY_ID } from "@/lib/bots/fixtures";
import { hatWonFor, marksOf, type HatWon } from "@/lib/bots/look";
import { STRINGS } from "@/lib/bots/strings";
import { HOUSE_ROSTER, PARTS, SHAPE_INDEX, houseBuild, houseTarget, type Difficulty } from "../_engine/catalog";
import { chainSummary } from "../_engine/commentary";
import { NO_ORDERS, PIECE, PIECE_NAMES, botTier, buildTotal, type Build, type FightEvent, type Orders, type Shape, type Tier } from "../_engine/parts";
import { fnv1a, rngFork } from "../_engine/rng";
import { resolveFight } from "../_engine/resolve";
import {
  DIFFICULTIES,
  REPAIR_MS,
  REPEAT_WINDOW_DAYS,
  assertBattleCoinsDay,
  assertStake,
  attackerCoinsPaid,
  fightRewards,
  maxAttackerCoins,
  weightClassIndex,
} from "../_engine/rewards";
import { ENGINE_VERSION } from "../_engine/version";
import {
  claimAttack,
  claimDefence,
  engineBuildOf,
  inShop,
  insertHat,
  loadBot,
  loadBots,
  loadCrownBotIds,
  loadHats,
  loadParts,
  loadPartsOfBot,
  lookOf,
  nameTextOf,
  paintOf,
  recordFight,
  releaseAttack,
  releaseDefence,
  socketPaintsOf,
  totalOf,
  type BotRow,
  type PartRow,
} from "./bots";
import { mintFirstWinCard, type CardPayload } from "./cards";
import { type BotsDb, dayKey, dayNumber, fightSalt, isProduction, nowIso, refuse } from "./db";
import { battleCoinsToday, grant } from "./grants";
import { coinsOf, displayName, loadPlayer } from "./players";
import type { BotsSession } from "./session";
import type { FightIdentityView, FightRewardsView, LookView } from "./types";

export const HOUSE_WALLET_NAME = "House";
export const HOUSE_STRATEGY = "Game robot";
export const NO_STRATEGY = STRINGS.en.board.noStrategy;
const HOUSE_PAINT = "butter" as const;

// -- the looks the row remembers ---------------------------------------------
/**
 * A fight row stores BOTH ROBOTS AS THEY WERE AT THE BELL: the colour on
 * every socket, the face and sticker and hat they were wearing, and the
 * marks they had won by then. A replay watched a month later then shows the
 * robots that fought, not the robots their owners have since rebuilt, which
 * is the whole reason the snapshot is taken here and not read live.
 *
 * NONE OF THIS REACHES THE FIGHT. The looks are written into the stored
 * result AFTER resolveFight has run and are never passed to it: the engine
 * takes a Build and orders, and a Build carries ids, three numbers and the
 * part's own colour. The replay rollup in scripts/bots-harness.ts is what
 * holds that line.
 */
async function lookViewOf(db: BotsDb, b: BotRow, parts: readonly PartRow[]): Promise<LookView> {
  const [hats, crowns] = await Promise.all([loadHats(db, b.wallet), loadCrownBotIds(db, b.wallet)]);
  const crown = crowns.has(b.id);
  return {
    paints: socketPaintsOf(b, parts),
    look: lookOf(b, parts, hats, crown),
    marks: marksOf(b.wins, b.losses, b.level, crown),
    wins: b.wins,
  };
}

/**
 * The house robot has no parts, so it has no FOUND colours, and for a long
 * time that meant one flat paint over the whole frame. Each of the nine has
 * its own colours, face, sticker and (on three of them) hat now, from the
 * one drawing table every surface reads (lib/bots/house-look.ts): a game
 * robot is a character a player meets over and over, and a character has to
 * be recognisable in a list. Nothing it wears is EARNED: no stars, no
 * patches, no cuffs, no crown. Reading it is houseLookViewOf, re-exported
 * from ./fight-read so the replay of an old row draws the same character.
 */

// BattleRow, ResultJson, BATTLE_COLS, the canonical shapes and every READ
// (loadBattle, fightView, fightSummary, modeLabelOf) live in ./fight-read.ts
// (no node:crypto there, so the edge Knockout Card can import them) and are
// re-exported here so the routes keep one import.
export { canonicalBuild, canonicalOrders, fightSummary, fightView, houseLookView, loadBattle, looksFromBuild, looksOf, modeLabelOf, type BattleRow, type ResultJson } from "./fight-read";
import { houseLookView } from "./fight-read";
import type { ResultJson } from "./fight-read";

// ── the house ───────────────────────────────────────────────────────────────

/** The day's house shape for a difficulty: the roster rotates by day number
 * (the bossForDate idiom in src/lib/s7/raid.ts), offset per difficulty so
 * the three ladders do not turn in step. */
export function houseShapeFor(difficulty: Difficulty, day: string): Shape {
  const roster = HOUSE_ROSTER[difficulty];
  const offset = DIFFICULTIES.indexOf(difficulty);
  const n = dayNumber(day) + offset;
  const id = roster.shapes[((n % roster.shapes.length) + roster.shapes.length) % roster.shapes.length];
  const shape = SHAPE_INDEX[id];
  if (!shape) throw new Error(`house roster names an unknown shape ${id}`);
  return shape;
}

export function isDifficulty(v: unknown): v is Difficulty {
  return typeof v === "string" && (DIFFICULTIES as readonly string[]).includes(v);
}


/** "head off", "body cracked", "left leg off", or "time ran out". */
export function finisherOf(log: readonly FightEvent[]): string {
  let last = "";
  for (const e of log) {
    if (e.t === "break") {
      last = e.part === PIECE.HEAD ? "head off" : e.part === PIECE.BODY ? "body cracked" : `${PIECE_NAMES[e.part]} off`;
    } else if (e.t === "timeout") {
      return "time ran out";
    }
  }
  return last || "no part came off";
}

function parseOrders(v: unknown): Orders {
  if (!v || typeof v !== "object") return NO_ORDERS;
  const o = v as { stance?: unknown; focus?: unknown };
  const st = typeof o.stance === "number" && Number.isInteger(o.stance) && o.stance >= 0 && o.stance <= 2 ? o.stance : 0;
  const fo = typeof o.focus === "number" && Number.isInteger(o.focus) && o.focus >= 0 && o.focus <= 4 ? o.focus : 0;
  return { stance: st as Orders["stance"], focus: fo as Orders["focus"] };
}

const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");

// ── starting a fight ────────────────────────────────────────────────────────

export interface StartFightInput {
  botId: unknown;
  mode: unknown;
  difficulty?: unknown;
  defenderBotId?: unknown;
  stake?: unknown;
  orders?: unknown;
  /**
   * DEV ONLY, AND TEST WALLETS ONLY. Pretend this wallet was already paid
   * this many battle coins today, so scripts/bots-api-smoke.ts can force the
   * daily ceiling to trip and prove the refusal moves no coins. Ignored when
   * NODE_ENV is production and ignored for any wallet that is not is_test,
   * so the breaker under test is the same one production runs.
   */
  testCoinsToday?: unknown;
}

/**
 * The pretend battle coins added to today's real total. Zero everywhere
 * except a dev server acting for a test wallet.
 */
function testCoinsToday(raw: unknown, isTest: boolean): number {
  if (isProduction() || !isTest) return 0;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export async function startFight(db: BotsDb, sess: BotsSession, input: StartFightInput, dayOverride?: string): Promise<{ fightId: string }> {
  const now = Date.now();
  const day = dayOverride ?? dayKey(now);
  const wallet = sess.wallet;
  const mode = input.mode;
  if (mode !== "spar" && mode !== "pve" && mode !== "pvp") return refuse(400, "Something went wrong. Try again.");
  const botId = typeof input.botId === "number" ? input.botId : Number(input.botId);
  if (!Number.isInteger(botId) || botId <= 0) return refuse(400, "Pick your robot first.");

  const player = await loadPlayer(db, wallet);
  if (!player) return refuse(401, "Sign in first.");
  const isTest = !!player.is_test;
  const myName = displayName(player);

  const bots = await loadBots(db, wallet);
  const bot = bots.find((b) => b.id === botId);
  if (!bot) return refuse(404, "That robot is not in your garage.");
  const parts = await loadParts(db, wallet);
  const buildA = engineBuildOf(bot, parts);
  if (!buildA) return refuse(400, `${nameTextOf(bot)} needs more parts. Put on all five.`);
  const totalA = buildTotal(buildA);
  if (mode !== "spar" && inShop(bot, now)) return refuse(409, `${nameTextOf(bot)} is being fixed. Ready in ${leftWords(bot.broken_until, now)}.`);
  const oa = parseOrders(input.orders);
  const ob = NO_ORDERS;

  // ── the other side ────────────────────────────────────────────────────
  let buildB: Build;
  let difficulty: Difficulty | null = null;
  let shape: Shape | null = null;
  let defender: BotRow | null = null;
  let defenderName = "";
  let defenderWalletName = "";
  let stake = 0;
  let classGap = 0;
  let priorVsOpponent = 0;
  let idB: FightIdentityView;

  if (mode === "pvp") {
    const defId = typeof input.defenderBotId === "number" ? input.defenderBotId : Number(input.defenderBotId);
    if (!Number.isInteger(defId) || defId <= 0) return refuse(400, "Pick a robot to challenge.");
    defender = await loadBot(db, defId);
    if (!defender) return refuse(404, "That robot is not there any more.");
    if (defender.wallet === wallet) return refuse(400, "You cannot challenge your own robot.");
    if (!defender.listed) return refuse(409, "That robot is not taking challenges.");
    if (inShop(defender, now)) return refuse(409, "That robot is being fixed. Pick another one.");
    const defParts = await loadPartsOfBot(db, defender.id);
    const b = engineBuildOf(defender, defParts);
    if (!b) return refuse(409, "That robot is missing parts. Pick another one.");
    buildB = b;
    const stakeIn = typeof input.stake === "number" ? input.stake : Number(input.stake);
    try {
      assertStake(stakeIn);
    } catch {
      return refuse(400, "You can put in 25 to 500 coins.");
    }
    stake = stakeIn;
    const coins = coinsOf(player);
    if (coins < stake) return refuse(400, `You need ${stake - coins} more coins.`);
    const totalB = buildTotal(buildB);
    classGap = weightClassIndex(totalB) - weightClassIndex(totalA);
    // one challenge per attacker per defender per UTC day
    const { count: pairCount } = await db
      .from("battle_bots_battles")
      .select("id", { count: "exact", head: true })
      .eq("mode", "pvp")
      .eq("challenger_wallet", wallet)
      .eq("defender_bot_id", defender.id)
      .eq("day_key", day)
      .neq("status", "declined");
    if ((pairCount || 0) > 0) return refuse(409, "You already fought that robot today. Try again tomorrow.");
    if (defender.attacks_day_key === day && defender.defenses_today >= 5) return refuse(409, "That robot has had 5 fights today. Try another one.");
    // repeat-opponent decay: pvp fights between these two wallets this week
    const since = new Date(now - REPEAT_WINDOW_DAYS * 86400000).toISOString();
    const them = defender.wallet;
    const { count: prior } = await db
      .from("battle_bots_battles")
      .select("id", { count: "exact", head: true })
      .eq("mode", "pvp")
      .eq("status", "resolved")
      .gte("created_at", since)
      .or(`and(challenger_wallet.eq.${wallet},defender_wallet.eq.${them}),and(challenger_wallet.eq.${them},defender_wallet.eq.${wallet})`);
    priorVsOpponent = prior || 0;
    const defPlayer = await loadPlayer(db, defender.wallet);
    defenderName = nameTextOf(defender);
    defenderWalletName = defPlayer ? displayName(defPlayer) : "A player";
    idB = {
      name: defenderName,
      wallet: defenderWalletName,
      wins: defender.wins,
      losses: defender.losses,
      strategy: NO_STRATEGY,
      paint: paintOf(defender),
      tier: botTier(totalB),
      total: totalB,
    };
  } else {
    difficulty = isDifficulty(input.difficulty) ? input.difficulty : "medium";
    shape = houseShapeFor(difficulty, day);
    buildB = houseBuild(shape.id, houseTarget(difficulty, totalA));
    const totalB = buildTotal(buildB);
    defenderName = shape.name;
    defenderWalletName = HOUSE_WALLET_NAME;
    idB = { name: shape.name, wallet: HOUSE_WALLET_NAME, wins: 0, losses: 0, strategy: HOUSE_STRATEGY, paint: HOUSE_PAINT, tier: botTier(totalB), total: totalB };
  }
  const totalB = buildTotal(buildB);
  const idA: FightIdentityView = {
    name: nameTextOf(bot),
    wallet: myName,
    wins: bot.wins,
    losses: bot.losses,
    strategy: NO_STRATEGY,
    paint: paintOf(bot),
    tier: botTier(totalA),
    total: totalA,
  };

  // ── THE DAILY COIN CEILING, BEFORE ANYTHING IS TAKEN OR WRITTEN ───────
  // It used to run AFTER the stake was held and AFTER the row was flipped to
  // resolved, while the compensating catch only fires on a row that is still
  // open. A tripped ceiling therefore ate the challenger's stake, paid
  // nothing, and left a battle row claiming coins nobody received. Here,
  // nothing has been claimed, held or written yet, so the refusal is clean.
  //
  // The winner is not known this early, so the check uses the MOST this
  // fight could pay whichever way it goes (rewards.ts maxAttackerCoins).
  // The exact amount is checked again once the fight has resolved, before
  // the flip, where the compensation path still works.
  let coinsSoFar = 0;
  if (mode !== "spar") {
    coinsSoFar = (await battleCoinsToday(db, wallet, day)) + testCoinsToday(input.testCoinsToday, isTest);
    const most = maxAttackerCoins({
      mode,
      difficulty: difficulty ?? undefined,
      classGap,
      stake,
      priorVsOpponent,
      attackerTier: botTier(totalA),
    });
    try {
      assertBattleCoinsDay(coinsSoFar, most);
    } catch (e) {
      // a breaker stays loud in the log; the player gets plain words and
      // keeps every coin
      // eslint-disable-next-line no-console
      console.error("[bots ceiling]", myName, day, `soFar ${coinsSoFar}`, `most ${most}`, e instanceof Error ? e.message : e);
      return refuse(409, "You have won all the coins you can win today. Come back tomorrow.");
    }
  }

  // ── the claims (sparring spends nothing) ──────────────────────────────
  let attackClaimed = false;
  let defenceClaimed = false;
  if (mode !== "spar") {
    attackClaimed = await claimAttack(db, bot, day);
    if (!attackClaimed) return refuse(409, `${nameTextOf(bot)} has no attacks left today.`);
  }
  if (mode === "pvp" && defender) {
    defenceClaimed = await claimDefence(db, defender, day);
    if (!defenceClaimed) {
      await releaseAttack(db, bot, day);
      return refuse(409, "That robot has had 5 fights today. Try another one.");
    }
  }

  // ── the open row: where the fight id comes from ───────────────────────
  const { data: opened, error: openErr } = await db
    .from("battle_bots_battles")
    .insert({
      mode,
      difficulty,
      challenger_wallet: wallet,
      challenger_bot_id: bot.id,
      defender_wallet: defender ? defender.wallet : null,
      defender_bot_id: defender ? defender.id : null,
      stake,
      class_gap: classGap,
      status: "open",
      day_key: day,
      is_test: isTest,
    })
    .select("id, created_at")
    .single();
  if (openErr || !opened) {
    if (attackClaimed) await releaseAttack(db, bot, day);
    if (defenceClaimed && defender) await releaseDefence(db, defender, day);
    throw new Error(`open fight: ${openErr?.message || "no row"}`);
  }
  const fightId = String(opened.id);
  const createdAt = String(opened.created_at || nowIso());

  const compensate = async (why: string, refundHold: boolean): Promise<void> => {
    try {
      if (attackClaimed) await releaseAttack(db, bot, day);
      if (defenceClaimed && defender) await releaseDefence(db, defender, day);
      if (refundHold) {
        await grant(db, { wallet, walletName: myName, coins: stake, reason: `stake:${fightId}:refund`, meta: { why }, isTest });
      }
      await db.from("battle_bots_battles").update({ status: "declined", result: { why } }).eq("id", opened.id).eq("status", "open");
    } catch {
      /* best effort: the row stays open for the tick job to expire */
    }
  };

  // ── the stake hold: before the bell, refused on an overdraft ──────────
  let held = false;
  if (mode === "pvp") {
    const hold = await grant(db, {
      wallet,
      walletName: myName,
      coins: -stake,
      reason: `stake:${fightId}:hold`,
      meta: { fightId, defenderBotId: defender?.id, stake },
      isTest,
    });
    if (!hold.ok) {
      await compensate("coins hold refused", false);
      return refuse(400, `You need ${Math.max(1, stake - hold.coins)} more coins.`);
    }
    held = true;
  }

  try {
    // ── resolve ─────────────────────────────────────────────────────────
    const seed = fnv1a(`${fightId}|${fightSalt()}`);
    const result = resolveFight(seed, buildA, buildB, oa, ob, mode);
    const attackerWon = result.winner === 0;
    const dropRoll = Math.floor(rngFork(seed, "A", "drop")() * 100);
    const rewards = fightRewards({
      mode,
      difficulty: difficulty ?? undefined,
      attackerWon,
      classGap,
      stake,
      priorVsOpponent,
      attackerTier: botTier(totalA),
      dropRoll,
    });
    let dropCard: { tier: Tier; partKey: string; name: string } | null = null;
    if (rewards.drop) {
      const pool = PARTS.filter((p) => p.tier === rewards.drop);
      if (pool.length) {
        const pick = pool[Math.floor(rngFork(seed, "A", "dropPick")() * pool.length)];
        dropCard = { tier: pick.tier, partKey: pick.id, name: pick.name };
      }
    }
    // THE HAT, from a bigger robot only, ON THE EXISTING DROP ROLL. A hat is
    // won when a player beats the HARDEST house robot and that fight already
    // dropped a part: no second roll, because a second roll is a second rule
    // and the two would drift. Which hat is a pure function of the fight id
    // (look.ts hatWonFor), so this line and the insert below can never disagree
    // and a replayed write hands out the same hat. A hat is never on the
    // shelf and is never bought (ADR-0141 carried to the look), and it turns
    // up in a colour the same way a part does: the seed picks from the eight
    // paints the game already has, so a hat never invents a ninth colour.
    // the condition itself lives in look.ts, so scripts/bots-hat-check.ts runs
    // THIS line over a thousand fights rather than a copy of it
    const hatWon: HatWon | null = hatWonFor(fightId, { mode, difficulty, attackerWon, droppedPart: !!rewards.drop });
    const rewardsView: FightRewardsView = {
      attackerCoins: rewards.attacker.coins,
      attackerPoints: rewards.attacker.points,
      attackerXp: rewards.attacker.xp,
      defenderCoins: rewards.defender.coins,
      stakeHeld: rewards.stakeHeld,
      stakePayout: rewards.stakePayout,
      houseBonus: rewards.houseBonus,
      drop: dropCard,
      hat: hatWon,
      attackerRepair: rewards.attackerRepair,
    };
    const names: [string, string] = [idA.name, idB.name];
    // both robots as they were at the bell, read from their rows BEFORE
    // recordFight moves the wins, so a replay shows the record they carried
    // into the fight and not the one they left with
    const looks: [LookView, LookView] = [
      await lookViewOf(db, bot, parts),
      defender ? await lookViewOf(db, defender, await loadPartsOfBot(db, defender.id)) : houseLookView(shape ? shape.id : ""),
    ];
    const stored: ResultJson = {
      v: ENGINE_VERSION,
      seed,
      mode,
      difficulty,
      buildA,
      buildB,
      orders: [oa, ob],
      winner: result.winner,
      frames: result.frames,
      end: result.end,
      hash: result.hash,
      chain: chainSummary(result.log, names),
      finisher: finisherOf(result.log),
      names,
      walletNames: [idA.wallet, idB.wallet],
      ids: [idA, idB],
      houseShape: shape ? shape.id : null,
      rewards: rewardsView,
      totalA,
      totalB,
      looks,
    };
    const winnerWallet = attackerWon ? wallet : defender ? defender.wallet : null;
    const attackerCoinsTotal = attackerCoinsPaid(rewards, attackerWon);

    // the exact amount, still a breaker, checked BEFORE the flip: a throw
    // here lands in the catch with the row still open, so compensate()
    // releases the counters and refunds the hold. Reachable only if a
    // resolved fight pays more than maxAttackerCoins said it could, which is
    // exactly the reward-table bug worth stopping the route for.
    if (mode !== "spar") assertBattleCoinsDay(coinsSoFar, attackerCoinsTotal);

    // ── the flip: whoever wins it applies the consequences ──────────────
    const { data: flipped, error: flipErr } = await db
      .from("battle_bots_battles")
      .update({
        status: "resolved",
        seed: String(seed),
        winner_wallet: winnerWallet,
        result: stored,
        result_hash: hex(result.hash),
        coins_paid: attackerCoinsTotal,
        points_paid: rewards.attacker.points,
        resolved_at: nowIso(),
      })
      .eq("id", opened.id)
      .eq("status", "open")
      .select("id");
    if (flipErr) throw new Error(`resolve flip: ${flipErr.message}`);
    if (!flipped || flipped.length !== 1) return { fightId };
    if (mode === "spar") return { fightId };

    // ── apply, one pass, every step idempotent by reason ────────────────
    // (the ceiling was checked twice already: on the worst case before
    // anything moved, and on the exact amount before the flip)
    const meta = { fightId, mode, difficulty, won: attackerWon, day };
    if (rewards.attacker.coins > 0 || rewards.attacker.points > 0) {
      await grant(db, {
        wallet,
        walletName: myName,
        coins: rewards.attacker.coins,
        points: rewards.attacker.points,
        reason: `battle:${fightId}:attacker`,
        meta,
        isTest,
      });
    }
    if (mode === "pvp" && defender) {
      if (attackerWon) {
        await grant(db, {
          wallet,
          walletName: myName,
          coins: rewards.stakePayout,
          reason: `stake:${fightId}:win`,
          meta: { ...meta, stake, houseBonus: rewards.houseBonus },
          isTest,
        });
      } else {
        await grant(db, {
          wallet: defender.wallet,
          walletName: defenderWalletName,
          coins: rewards.stakePayout,
          reason: `stake:${fightId}:win`,
          meta: { ...meta, stake, role: "defender" },
          isTest,
        });
        if (rewards.defender.coins > 0) {
          await grant(db, {
            wallet: defender.wallet,
            walletName: defenderWalletName,
            coins: rewards.defender.coins,
            reason: `battle:${fightId}:defender`,
            meta: { ...meta, role: "defender" },
            isTest,
          });
        }
      }
    }
    if (dropCard) {
      const card = CARD_BY_ID[dropCard.partKey];
      const { data: already } = await db.from("battle_bots_part_instances").select("id").eq("wallet", wallet).eq("stats->>fightId", fightId).limit(1);
      if (card && !(already && already.length)) {
        await db.from("battle_bots_part_instances").insert({
          wallet,
          part_key: card.id,
          slot_kind: card.slot,
          tier: card.tier,
          stats: { s: [card.s[0], card.s[1], card.s[2]], provenance: `Won from ${defenderName}`, fightId },
          bot_id: null,
          source: "drop",
          list_price: card.price,
          is_test: isTest,
        });
      }
    }
    if (hatWon) {
      // idempotent by fight id the way every grant is idempotent by reason:
      // a rerun of this block gives out nothing a second time
      await insertHat(db, wallet, hatWon, fightId, isTest);
    }
    if (rewards.attackerRepair) {
      await db.from("battle_bots_bots").update({ broken_until: new Date(now + REPAIR_MS).toISOString(), updated_at: nowIso() }).eq("id", bot.id);
    }
    await recordFight(db, bot, attackerWon, rewards.attacker.xp);
    if (defender) await recordFight(db, defender, !attackerWon, 0);
    if (mode === "pvp" && attackerWon) {
      const payload: CardPayload = {
        kind: "champion-first-win",
        fightId,
        botId: bot.id,
        botName: idA.name,
        walletName: myName,
        beat: idB.name,
        beatWallet: idB.wallet,
        at: createdAt,
        hash: hex(result.hash),
        engineVersion: ENGINE_VERSION,
      };
      await mintFirstWinCard(db, wallet, payload, isTest);
    }
    return { fightId };
  } catch (e) {
    // a fight that could not be resolved or stored: undo what the bell cost
    const { data: state } = await db.from("battle_bots_battles").select("status").eq("id", opened.id).maybeSingle();
    if (state && state.status === "open") await compensate(e instanceof Error ? e.message : String(e), held);
    throw e;
  }
}

function leftWords(until: string | null, nowMs: number): string {
  const t = until ? Date.parse(until) : 0;
  const mins = Math.max(0, Math.ceil((t - nowMs) / 60000));
  const h = Math.floor(mins / 60);
  // "17 h 4 min" used two short forms for two units nobody ever spelled out
  if (h > 0) return `${h} ${h === 1 ? "hour" : "hours"}`;
  return `${mins} ${mins === 1 ? "minute" : "minutes"}`;
}
