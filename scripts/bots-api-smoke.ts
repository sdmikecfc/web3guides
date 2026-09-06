/**
 * BATTLE BOTS API SMOKE - the route chain end to end against a running dev
 * server, with two fresh is_test wallets it makes through the routes
 * themselves. Prints PASS / FAIL per step (the scripts/bots-harness.ts
 * report shape) and exits 1 on any FAIL. Clean-up is not required: every
 * row lands is_test through the dev-only `x-bots-test: 1` header, which
 * the routes honour only when NODE_ENV !== "production".
 *
 *   npx next dev            (in another shell)
 *   npx tsx scripts/bots-api-smoke.ts [--base http://localhost:3000]
 *
 * STEPS: THE IDENTITY GATE first (no Discord account joined to the wallet,
 * a Discord account under 3 days old, an invented nonce, a reused nonce, an
 * expired nonce, a second wallet on one Discord and a second Discord on one
 * wallet: all refused, and the 3 day boundary opens), then enlist twice (the
 * second returns the same player and grants
 * nothing new), save a bot, spar (free, private), a PvP challenge against
 * a second is_test bot with a 25 stake (both ledgers move by exactly the
 * stake plus the bonus rule; the defender is never broken), a repeat
 * challenge the same day is refused, fight easy PvE, fight medium PvE until
 * a loss (repair_until set, attacks decremented; later "days" arrive
 * through the dev-only `x-bots-day` header), a sixth bot is refused, the
 * fight is replayed client-side through the engine and its hash equals the
 * stored hash, a forced daily-coin-ceiling trip is refused in plain words
 * with no coin moved and nothing written, the battles shelves and the
 * Morning Paper answer, and the Knockout Card renders a PNG. (Paint left the
 * game on 2026-09-03: parts come in colors from the daily shipment, so there
 * is no paint step.)
 */

import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { resolveFight } from "../src/app/bots/_engine/resolve";
import type { Build, Orders, Mode, Slot } from "../src/app/bots/_engine/parts";

const arg = (flag: string, dflt: string): string => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const BASE = arg("--base", process.env.BOTS_BASE || "http://localhost:3000").replace(/\/$/, "");

let failures = 0;
function report(ok: boolean, step: string, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}  ${detail}`);
}

interface Resp<T> {
  status: number;
  body: T & { ok?: boolean; error?: string };
}

async function call<T = Record<string, unknown>>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<Resp<T>> {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", "x-bots-test": "1", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed: unknown = null;
  try {
    parsed = await r.json();
  } catch {
    parsed = {};
  }
  return { status: r.status, body: parsed as T & { ok?: boolean; error?: string } };
}

/** The EIP-4361 shape the s7 play session signs (src/lib/s7/games.ts
 * buildPlaySessionMessage), on an allow-listed domain (lib/stars/server).
 * The Nonce line is now the SERVER'S: it is issued by
 * POST /api/bots/enlist/nonce, it is bound to this wallet, and the enlist
 * spends it once (src/app/api/bots/enlist/nonce-store.ts). */
function enlistMessage(address: string, nonce: string): string {
  return (
    `web3guides.com wants you to sign in with your Ethereum account:\n` +
    `${address}\n\n` +
    `Open a Battle Bots play session. Signature only, no transaction, no gas, no approvals.\n\n` +
    `URI: https://web3guides.com/bots\n` +
    `Version: 1\n` +
    `Chain ID: 1\n` +
    `Nonce: ${nonce}\n` +
    `Issued At: ${new Date().toISOString()}`
  );
}

/**
 * THE IDENTITY HEADER. `x-bots-discord` is the dev-only stand-in for the
 * linked_wallets read (src/app/api/bots/enlist/identity.ts devDiscordId): it
 * is ignored when NODE_ENV is production, exactly like `x-bots-test` and
 * `x-bots-day`. It exists so this script can drive the age check and both
 * uniqueness rules with wallets it makes itself, WITHOUT writing a row into
 * linked_wallets, which is a community-wide table this game must not touch.
 * A header identity goes through the same checks as a real bind.
 */
const idHeader = (discordId: string | null): Record<string, string> =>
  discordId ? { "x-bots-discord": discordId } : {};

/**
 * A Discord snowflake for an account created `daysAgo` days ago. Discord
 * packs the creation time into the top bits of every id, which is why the
 * age check costs no API call: (id >> 22) + 1420070400000 is the moment the
 * account was made. BigInt(22) rather than the 22n literal because this repo
 * compiles at ES5 (no `target` in tsconfig.json).
 */
const DISCORD_EPOCH_MS = 1420070400000;
let snowflakeSeq = 0;
function snowflake(daysAgo: number): string {
  const ms = Date.now() - Math.round(daysAgo * 86400000);
  snowflakeSeq += 1;
  return String((BigInt(ms - DISCORD_EPOCH_MS) << BigInt(22)) + BigInt(snowflakeSeq));
}

interface EnlistOut {
  token?: string;
  coins?: number;
  joined?: boolean;
  welcomeBack?: boolean;
  walletName?: string;
  needsDiscord?: boolean;
  identity?: string;
  nonce?: string;
}

/** Ask for a nonce, exactly the way the browser does. */
async function askNonce(
  acct: PrivateKeyAccount,
  discordId: string | null,
  extra: Record<string, string> = {},
): Promise<Resp<EnlistOut>> {
  return call<EnlistOut>("POST", "/api/bots/enlist/nonce", { address: acct.address }, { ...idHeader(discordId), ...extra });
}

/** Sign a message carrying `nonce` and post it. Returns the raw response so
 * a refusal case can read the status and the words. */
async function postEnlist(
  acct: PrivateKeyAccount,
  nonce: string,
  discordId: string | null,
): Promise<Resp<EnlistOut>> {
  const message = enlistMessage(acct.address, nonce);
  const signature = await acct.signMessage({ message });
  return call<EnlistOut>("POST", "/api/bots/enlist", { address: acct.address, message, signature }, idHeader(discordId));
}

/** The happy path in one call: nonce, sign, enlist. Throws on any refusal. */
async function enlist(acct: PrivateKeyAccount, discordId: string): Promise<EnlistOut> {
  const n = await askNonce(acct, discordId);
  if (!n.body.ok || !n.body.nonce) throw new Error(`nonce failed: ${n.status} ${n.body.error}`);
  const r = await postEnlist(acct, n.body.nonce, discordId);
  if (!r.body.ok) throw new Error(`enlist failed: ${r.status} ${r.body.error}`);
  return r.body;
}

interface BotV {
  id: number;
  bay: number;
  nameText: string;
  total: number;
  tier: number;
  complete: boolean;
  attacksLeft: number;
  inShop: boolean;
  repairUntil: string | null;
  wins: number;
  losses: number;
  listed: boolean;
}
interface PartV {
  id: number;
  slot: Slot;
  partKey: string;
  paint?: string;
}
interface MeV {
  player: { coins: number; battlePoints: number; walletName: string; level: number };
  bots: BotV[];
  parts: PartV[];
}

const auth = (t: string, day?: string): Record<string, string> => ({ Authorization: `Bearer ${t}`, ...(day ? { "x-bots-day": day } : {}) });

async function me(t: string, day?: string): Promise<MeV> {
  const r = await call<MeV>("GET", "/api/bots/me", undefined, auth(t, day));
  if (!r.body.ok) throw new Error(`me failed: ${r.status} ${r.body.error}`);
  return r.body;
}

async function saveBot(t: string, bay: number, parts: PartV[] | null, num: number | null): Promise<Resp<{ bot?: BotV }>> {
  const bySlot: Partial<Record<Slot, number>> = {};
  if (parts) for (const p of parts) if (!bySlot[p.slot]) bySlot[p.slot] = p.id;
  return call<{ bot?: BotV }>("POST", "/api/bots/bot/save", {
    t,
    bay,
    name: { first: "Rusty", second: "Piston", num },
    decal: "bolt",
    paint: "mint",
    parts: bySlot,
  });
}

interface FightV {
  id: string;
  seed: number;
  buildA: Build;
  buildB: Build;
  orders: [Orders, Orders];
  mode: Mode;
  hash: number;
  winner: 0 | 1;
  frames: number;
  end: string;
  chain: string;
  names: [string, string];
  walletNames: [string, string];
  rewards: { stakeHeld: number; stakePayout: number; houseBonus: number; attackerCoins: number; attackerPoints: number; attackerRepair: boolean; defenderCoins: number };
}

async function getFight(id: string, t?: string): Promise<Resp<FightV>> {
  return call<FightV>("GET", `/api/bots/fight/${id}`, undefined, t ? auth(t) : {});
}

function replayMatches(f: FightV): boolean {
  const r = resolveFight(f.seed, f.buildA, f.buildB, f.orders[0], f.orders[1], f.mode);
  return (r.hash >>> 0) === (f.hash >>> 0) && r.winner === f.winner && r.frames === f.frames;
}

function plusDays(day: string, n: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) + n * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  console.log(`bots api smoke against ${BASE}`);
  // four wallets so every scenario starts on a fresh, whole bot: A attacks
  // (spar, the PvP challenge), B only ever defends (so it stays listed),
  // C fights easy PvE, D fights medium PvE until it loses
  const A = privateKeyToAccount(generatePrivateKey());
  const B = privateKeyToAccount(generatePrivateKey());
  const C = privateKeyToAccount(generatePrivateKey());
  const D = privateKeyToAccount(generatePrivateKey());
  // one Discord account per wallet, each old enough to pass the 3 day rule
  const idA = snowflake(400);
  const idB = snowflake(400);
  const idC = snowflake(400);
  const idD = snowflake(400);
  console.log(`  wallets: ${[A, B, C, D].map((x) => x.address).join(" ")}`);

  // ── 0. THE IDENTITY GATE (src/app/api/bots/enlist/identity.ts) ─────────
  // Every case here must REFUSE. A seat used to cost one free signature,
  // which is why splitting one player's trading over five wallets paid about
  // 2.5 times what one wallet earned and why three separate money rules
  // written to close that all cut honest players first.
  {
    // (a) no Discord account joined to this wallet. No dev header, so this
    //     runs the REAL linked_wallets lookup against a wallet nobody has
    //     ever linked, which is the production path.
    const G = privateKeyToAccount(generatePrivateKey());
    const n = await askNonce(G, null);
    report(
      n.status === 403 && !n.body.ok && n.body.needsDiscord === true && n.body.identity === "no_discord" && !n.body.nonce,
      "identity: no Discord",
      `${n.status} needsDiscord=${n.body.needsDiscord} "${n.body.error}"`,
    );
    // AND THE ENLIST ITSELF REFUSES, not only the courtesy check on the
    // nonce route. The gate that matters is the one at the seat, so this
    // case gets a REAL nonce (issued while a Discord account is presented)
    // and then posts the enlist with no Discord at all: the nonce burns
    // cleanly and the identity gate is what stops it. Without this the two
    // checks could drift and only the polite one would be tested.
    const n2 = await askNonce(G, snowflake(400));
    const direct = await postEnlist(G, n2.body.nonce!, null);
    report(
      direct.status === 403 && !direct.body.ok && !direct.body.token && direct.body.identity === "no_discord",
      "identity: the enlist gate fires on its own, after a valid nonce",
      `${direct.status} "${direct.body.error}"`,
    );
  }
  {
    // (b) the Discord account is under 3 days old (the doc's number)
    const F = privateKeyToAccount(generatePrivateKey());
    const n = await askNonce(F, snowflake(2));
    report(n.status === 403 && !n.body.ok && n.body.identity === "too_new" && !n.body.nonce, "identity: Discord too young", `${n.status} "${n.body.error}"`);
    // 3 days and a bit IS old enough: the boundary opens, it does not just close
    const n2 = await askNonce(F, snowflake(3.5));
    report(n2.status === 200 && !!n2.body.ok && !!n2.body.nonce, "identity: 3 days old is enough", `${n2.status} nonce issued`);
  }
  {
    // (c) an invented nonce is refused. This is the replay fix: before it the
    //     Nonce line was made up by the browser and read by nobody, so one
    //     captured message and signature could be posted again.
    const H = privateKeyToAccount(generatePrivateKey());
    const r = await postEnlist(H, "notanonceissuedbythisserverxxxxx", snowflake(400));
    report(r.status === 401 && !r.body.ok && !r.body.token, "nonce: invented nonce refused", `${r.status} "${r.body.error}"`);
  }
  {
    // (d) a nonce is good ONCE
    const H = privateKeyToAccount(generatePrivateKey());
    const id = snowflake(400);
    const n = await askNonce(H, id);
    const first = await postEnlist(H, n.body.nonce!, id);
    const second = await postEnlist(H, n.body.nonce!, id);
    report(
      !!first.body.ok && !!first.body.token && second.status === 401 && !second.body.ok && !second.body.token,
      "nonce: single use",
      `first ${first.status}, replay ${second.status} "${second.body.error}"`,
    );
  }
  {
    // (e) a nonce runs out. The dev-only `x-bots-nonce-ttl` header shortens
    //     the five minutes to milliseconds; it is ignored in production.
    const I = privateKeyToAccount(generatePrivateKey());
    const id = snowflake(400);
    const n = await askNonce(I, id, { "x-bots-nonce-ttl": "1" });
    await new Promise((r) => setTimeout(r, 60));
    const r = await postEnlist(I, n.body.nonce!, id);
    report(r.status === 401 && !r.body.ok && !r.body.token, "nonce: expired", `${r.status} "${r.body.error}"`);
  }

  // ── 1. enlist twice ───────────────────────────────────────────────────
  const e1 = await enlist(A, idA);
  report(!!e1.token && e1.joined === true && typeof e1.coins === "number", "enlist A", `joined ${e1.joined}, coins ${e1.coins}, name ${e1.walletName}`);
  const tA = e1.token!;
  const me1 = await me(tA);
  report(me1.parts.length === 5 && me1.bots.length === 0, "starter kit", `${me1.parts.length} parts, ${me1.bots.length} bots, coins ${me1.player.coins}`);
  const e2 = await enlist(A, idA);
  const me2 = await me(tA);
  report(e2.joined === false && e2.welcomeBack === true && me2.parts.length === 5 && me2.player.coins === me1.player.coins, "enlist A again", `joined ${e2.joined}, welcomeBack ${e2.welcomeBack}, parts ${me2.parts.length}, coins ${me2.player.coins}`);
  const noName = !/0x[0-9a-fA-F]{40}/.test(JSON.stringify(e1)) && !/0x[0-9a-fA-F]{40}/.test(JSON.stringify(me1)) && !/\$/.test(JSON.stringify(me1));
  report(noName, "no address, no dollar", "enlist and me responses carry neither");

  // ── 1b. one Discord account joins one wallet ──────────────────────────
  // A now holds idA. A second wallet carrying the same Discord account is
  // the whole splitting attack in one request, and it is refused. The other
  // direction (this wallet already holds a different Discord) is the same
  // check read the other way round.
  {
    const twin = privateKeyToAccount(generatePrivateKey());
    const n = await askNonce(twin, idA);
    report(
      n.status === 409 && !n.body.ok && n.body.identity === "discord_taken" && !n.body.nonce,
      "identity: second wallet on one Discord",
      `${n.status} "${n.body.error}"`,
    );
    const n2 = await askNonce(A, idB);
    report(
      n2.status === 409 && !n2.body.ok && n2.body.identity === "wallet_taken" && !n2.body.nonce,
      "identity: second Discord on one wallet",
      `${n2.status} "${n2.body.error}"`,
    );
  }

  // ── 2. save a bot each ────────────────────────────────────────────────
  const sA = await saveBot(tA, 1, me1.parts, 7);
  report(!!sA.body.ok && !!sA.body.bot?.complete && sA.body.bot.attacksLeft === 2, "save bot A1", `${sA.body.bot?.nameText}, total ${sA.body.bot?.total}, complete ${sA.body.bot?.complete}, attacks ${sA.body.bot?.attacksLeft} (${sA.status} ${sA.body.error || ""})`);
  const A1 = sA.body.bot!;
  const eB = await enlist(B, idB);
  const tB = eB.token!;
  const meB = await me(tB);
  const sB = await saveBot(tB, 1, meB.parts, 9);
  report(!!sB.body.ok && !!sB.body.bot?.complete && sB.body.bot.listed, "save bot B1", `${sB.body.bot?.nameText}, listed ${sB.body.bot?.listed} (${sB.status} ${sB.body.error || ""})`);
  const B1 = sB.body.bot!;

  // ── 3. spar: free, private, replays ───────────────────────────────────
  const spar = await call<{ fightId?: string }>("POST", "/api/bots/fight", { t: tA, botId: A1.id, mode: "spar", difficulty: "easy" });
  report(!!spar.body.ok && !!spar.body.fightId, "spar", `fight ${spar.body.fightId} (${spar.status} ${spar.body.error || ""})`);
  if (spar.body.fightId) {
    const priv = await getFight(spar.body.fightId);
    const own = await getFight(spar.body.fightId, tA);
    report(priv.status === 403 && own.status === 200 && !!own.body.ok, "spar is private", `anonymous ${priv.status}, owner ${own.status}`);
    if (own.body.ok) report(replayMatches(own.body), "spar replay hash", `hash ${(own.body.hash >>> 0).toString(16)}, winner ${own.body.winner}, ${own.body.frames} frames`);
    const after = await me(tA);
    const a1 = after.bots.find((b) => b.id === A1.id)!;
    report(a1.attacksLeft === 2 && after.player.coins === me1.player.coins, "spar costs nothing", `attacks ${a1.attacksLeft}, coins ${after.player.coins}`);
  }

  // ── 4. pvp: A1 challenges B1 with a 25 stake ──────────────────────────
  const coinsA0 = (await me(tA)).player.coins;
  const coinsB0 = (await me(tB)).player.coins;
  const pvp = await call<{ fightId?: string }>("POST", "/api/bots/fight", { t: tA, botId: A1.id, mode: "pvp", defenderBotId: B1.id, stake: 25 });
  report(!!pvp.body.ok && !!pvp.body.fightId, "pvp challenge", `fight ${pvp.body.fightId} (${pvp.status} ${pvp.body.error || ""})`);
  let pvpFight: FightV | null = null;
  if (pvp.body.fightId) {
    const f = await getFight(pvp.body.fightId);
    pvpFight = f.body.ok ? f.body : null;
    report(!!pvpFight, "pvp is public", `anonymous GET ${f.status}`);
    if (pvpFight) {
      report(replayMatches(pvpFight), "pvp replay hash", `hash ${(pvpFight.hash >>> 0).toString(16)}, ${pvpFight.names[pvpFight.winner]} wins in ${pvpFight.frames} frames`);
      const coinsA1 = (await me(tA)).player.coins;
      const coinsB1 = (await me(tB)).player.coins;
      const won = pvpFight.winner === 0;
      const bonus = pvpFight.rewards.houseBonus;
      const wantA = won ? 25 + bonus : -25;
      const wantB = won ? 0 : 25 + 3;
      report(coinsA1 - coinsA0 === wantA && coinsB1 - coinsB0 === wantB, "pvp ledgers", `A ${coinsA0} -> ${coinsA1} (want ${wantA >= 0 ? "+" : ""}${wantA}), B ${coinsB0} -> ${coinsB1} (want +${wantB}), bonus ${bonus}, ${won ? "challenger won" : "ghost won"}`);
      const mA = await me(tA);
      const mB = await me(tB);
      const a1 = mA.bots.find((b) => b.id === A1.id)!;
      const b1 = mB.bots.find((b) => b.id === B1.id)!;
      report(!b1.inShop && b1.attacksLeft === 2 && b1.repairUntil === null, "defender never broken", `B1 inShop ${b1.inShop}, attacks ${b1.attacksLeft}, repair ${b1.repairUntil}`);
      report(a1.attacksLeft === 1 && a1.inShop === !won, "attacker counters", `A1 attacks ${a1.attacksLeft}, inShop ${a1.inShop} (${won ? "won" : "lost"})`);
      report(mA.player.battlePoints > 0, "pvp points", `A has ${mA.player.battlePoints} battle points`);
    }
  }
  const repeat = await call("POST", "/api/bots/fight", { t: tA, botId: A1.id, mode: "pvp", defenderBotId: B1.id, stake: 25 });
  report(!repeat.body.ok && repeat.status >= 400 && repeat.status < 500, "repeat challenge refused", `${repeat.status} ${repeat.body.error}`);

  // ── 5. pve easy with a fresh bot (C1) ────────────────────────────────
  const eC = await enlist(C, idC);
  const tC = eC.token!;
  const meC = await me(tC);
  const sC = await saveBot(tC, 1, meC.parts, 3);
  const C1 = sC.body.bot!;
  const cC = (await me(tC)).player.coins;
  const easy = await call<{ fightId?: string }>("POST", "/api/bots/fight", { t: tC, botId: C1.id, mode: "pve", difficulty: "easy" });
  report(!!easy.body.ok && !!easy.body.fightId, "pve easy", `fight ${easy.body.fightId} (${easy.status} ${easy.body.error || ""})`);
  if (easy.body.fightId) {
    const f = await getFight(easy.body.fightId);
    const m = await me(tC);
    const c1 = m.bots.find((b) => b.id === C1.id)!;
    const won = f.body.ok && f.body.winner === 0;
    const want = won ? 10 : 3;
    report(f.body.ok === true && m.player.coins - cC === want && c1.attacksLeft === 1 && c1.inShop === !won, "pve easy reward", `${won ? "won" : "lost"}: coins ${cC} -> ${m.player.coins} (want +${want}), attacks ${c1.attacksLeft}, inShop ${c1.inShop}`);
    if (f.body.ok) report(replayMatches(f.body), "pve replay hash", `hash ${(f.body.hash >>> 0).toString(16)}`);
  }

  // ── 6. pve medium until a loss (D1; later days through x-bots-day) ────
  {
    const eD = await enlist(D, idD);
    const tD = eD.token!;
    const meD = await me(tD);
    const sD = await saveBot(tD, 1, meD.parts, 4);
    const D1 = sD.body.bot!;
    let lost = false;
    let tries = 0;
    let day = new Date().toISOString().slice(0, 10);
    let attacksBefore = (await me(tD, day)).bots.find((b) => b.id === D1.id)!.attacksLeft;
    for (let i = 0; i < 14 && !lost; i++) {
      if (attacksBefore <= 0) {
        day = plusDays(day, 1);
        attacksBefore = (await me(tD, day)).bots.find((b) => b.id === D1.id)!.attacksLeft;
        continue;
      }
      const r = await call<{ fightId?: string }>("POST", "/api/bots/fight", { t: tD, botId: D1.id, mode: "pve", difficulty: "medium" }, auth(tD, day));
      tries += 1;
      if (!r.body.ok || !r.body.fightId) {
        report(false, "pve medium", `${r.status} ${r.body.error}`);
        break;
      }
      const f = await getFight(r.body.fightId);
      const m = await me(tD, day);
      const d1 = m.bots.find((b) => b.id === D1.id)!;
      const attacksAfter = d1.attacksLeft;
      const decremented = attacksAfter === attacksBefore - 1;
      attacksBefore = attacksAfter;
      if (f.body.ok && f.body.winner === 1) {
        lost = true;
        report(d1.inShop && !!d1.repairUntil && decremented, "pve medium loss", `try ${tries} day ${day}: repairUntil ${d1.repairUntil}, inShop ${d1.inShop}, attacks ${attacksAfter}`);
        const hours = (Date.parse(d1.repairUntil || "") - Date.now()) / 3600000;
        report(hours > 23.5 && hours <= 24.05, "repair is 24 h", `${hours.toFixed(2)} h left`);
        report(m.player.coins - (meD.player.coins) >= 5, "pve medium loss coins", `coins ${meD.player.coins} -> ${m.player.coins} over ${tries} fights (a loss pays 5)`);
      } else {
        report(decremented && !d1.inShop, `pve medium win ${tries}`, `day ${day}: attacks ${attacksAfter}, coins ${m.player.coins}`);
      }
    }
    if (!lost) report(false, "pve medium loss", `no loss in ${tries} fights`);
  }

  // ── 6b. the daily coin ceiling trips BEFORE anything moves ────────────
  // The bug this covers (found and fixed 2026-09-04): the ceiling ran AFTER
  // the stake was taken and AFTER the row was flipped to resolved, while the
  // compensating catch only fires on a row that is still open. A trip
  // therefore ate the challenger's stake, paid nothing, and left a battle row
  // claiming coins nobody received. `testCoinsToday` is honoured only on a
  // dev server and only for an is_test wallet: it pretends the wallet was
  // already paid that many battle coins today, which is the one condition
  // that trips the real breaker, unchanged.
  {
    const E = privateKeyToAccount(generatePrivateKey());
    const F = privateKeyToAccount(generatePrivateKey());
    const tE = (await enlist(E, snowflake(400))).token!;
    const tF = (await enlist(F, snowflake(400))).token!;
    const E1 = (await saveBot(tE, 1, (await me(tE)).parts, 5)).body.bot!;
    const F1 = (await saveBot(tF, 1, (await me(tF)).parts, 6)).body.bot!;
    const before = await me(tE);
    const beforeF = await me(tF);
    const e1before = before.bots.find((b) => b.id === E1.id)!;

    // the stake is the smallest legal one, so this wallet's starter coins
    // cover it and the refusal under test is the CEILING, not the balance
    const STAKE = 25;
    const tripped = await call("POST", "/api/bots/fight", {
      t: tE,
      botId: E1.id,
      mode: "pvp",
      defenderBotId: F1.id,
      stake: STAKE,
      testCoinsToday: 20000,
    });
    report(!tripped.body.ok && tripped.status === 409, "ceiling refuses the fight", `${tripped.status} ${tripped.body.error}`);
    const msg = String(tripped.body.error || "");
    // plain words: a real message, no dollar figure, no address, and neither
    // dash (built from code points so this file carries no dash of its own)
    const dashes = [0x2013, 0x2014].map((c) => String.fromCharCode(c));
    report(
      msg.length > 0 && !msg.includes("$") && !/0x[0-9a-fA-F]{40}/.test(msg) && !dashes.some((d) => msg.includes(d)),
      "ceiling refusal is plain words",
      msg,
    );

    const after = await me(tE);
    const afterF = await me(tF);
    const e1after = after.bots.find((b) => b.id === E1.id)!;
    report(
      after.player.coins === before.player.coins &&
        after.player.battlePoints === before.player.battlePoints &&
        afterF.player.coins === beforeF.player.coins &&
        e1after.attacksLeft === e1before.attacksLeft &&
        !e1after.inShop,
      "ceiling moves no coins",
      `challenger ${before.player.coins} -> ${after.player.coins}, defender ${beforeF.player.coins} -> ${afterF.player.coins}, ` +
        `attacks ${e1before.attacksLeft} -> ${e1after.attacksLeft}, inShop ${e1after.inShop}`,
    );

    // nothing was claimed and no row was written, so the SAME challenge is
    // still allowed today: the refusal cost the player nothing at all
    const okFight = await call<{ fightId?: string }>("POST", "/api/bots/fight", { t: tE, botId: E1.id, mode: "pvp", defenderBotId: F1.id, stake: STAKE });
    report(!!okFight.body.ok && !!okFight.body.fightId, "same challenge still allowed", `fight ${okFight.body.fightId} (${okFight.status} ${okFight.body.error || ""})`);
    if (okFight.body.fightId) {
      const f = await getFight(okFight.body.fightId);
      const fv = f.body.ok ? f.body : null;
      const paid = (await me(tE)).player.coins - after.player.coins;
      const want = fv && fv.winner === 0 ? STAKE + fv.rewards.houseBonus : -STAKE;
      report(!!fv && paid === want, "the stake moves only on a real fight", `coins ${after.player.coins} -> ${after.player.coins + paid} (want ${want >= 0 ? "+" : ""}${want})`);
    }
  }

  // ── 7. a sixth bot is refused ─────────────────────────────────────────
  for (let bay = 2; bay <= 5; bay++) {
    const r = await saveBot(tA, bay, null, bay);
    if (!r.body.ok) report(false, `save empty bot bay ${bay}`, `${r.status} ${r.body.error}`);
  }
  const sixth = await saveBot(tA, 6, null, 6);
  const botsNow = (await me(tA)).bots.length;
  report(!sixth.body.ok && sixth.status === 400 && botsNow === 5, "sixth bot refused", `${sixth.status} ${sixth.body.error}; ${botsNow} bots`);

  // ── 8. the shelves, the paper, the card ───────────────────────────────
  const shelves = await call<{ me?: { bots: BotV[] }; defenders?: { botId: number }[]; recent?: { id: string }[]; live?: unknown[] }>("GET", "/api/bots/battles", undefined, auth(tA));
  report(!!shelves.body.ok && !!shelves.body.me && (shelves.body.defenders || []).some((d) => d.botId === B1.id) && (shelves.body.recent || []).length > 0, "battles shelves", `${shelves.body.defenders?.length ?? 0} defenders, ${shelves.body.recent?.length ?? 0} recent, ${shelves.body.live?.length ?? 0} live`);
  const paper = await call<{ lines?: { text: string }[]; date?: string }>("GET", "/api/bots/paper", undefined, auth(tB));
  report(!!paper.body.ok && (paper.body.lines || []).length > 0 && !/[\u2013\u2014$]/.test(JSON.stringify(paper.body)), "morning paper", `${paper.body.date}: ${(paper.body.lines || []).map((l) => l.text).join(" | ").slice(0, 160)}`);
  if (pvpFight) {
    const card = await fetch(`${BASE}/api/bots/card/ko?f=${pvpFight.id}`);
    const type = card.headers.get("content-type") || "";
    report(card.status === 200 && type.startsWith("image/png"), "knockout card", `${card.status} ${type}`);
    const generic = await fetch(`${BASE}/api/bots/card/ko?f=999999999`);
    report(generic.status === 200 && (generic.headers.get("content-type") || "").startsWith("image/png"), "generic card", `${generic.status} ${generic.headers.get("content-type")}`);
  }

  console.log(failures === 0 ? "\nALL STEPS PASS" : `\n${failures} STEP(S) FAIL`);
  if (pvpFight) console.log(`replay: ${BASE}/bots/fight/${pvpFight.id}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
