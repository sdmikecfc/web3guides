/**
 * BATTLE BOTS FIGHT READS: the stored fight row and the views built from it
 * (the replay page, the shelves, the Knockout Card).
 *
 * Split out of fights.ts so a route that only READS a fight pulls in no
 * node:crypto (cards.ts signs the collectible and session.ts the play
 * session with createHmac). The Knockout Card route runs on the EDGE
 * runtime: next/og's node build reads its fallback font at module top level
 * through `join(import.meta.url, ...)`, which a Windows dev box turns into
 * an invalid file URL, so every ImageResponse there answers 500 (Next
 * 14.2.3; src/app/api/s7/hq-card/route.tsx shows the same), while the edge
 * build carries its fonts and wasm as bundled assets and renders on every
 * box. fights.ts re-exports everything here, so its callers are unchanged.
 */
import "server-only";
import { NO_LOOK, NO_MARKS, socketPaints } from "@/lib/bots/look";
import { HOUSE_MARKS, houseBotLook, houseShapeIdOfBuild, houseSocketPaints } from "@/lib/bots/house-look";
import { HOUSE_ROSTER, type Difficulty } from "../_engine/catalog";
import type { Build, Mode, Orders, Part } from "../_engine/parts";
import { type BotsDb, refuse } from "./db";
// type-only: erased at compile time, so session.ts (node:crypto) never loads here
import type { BotsSession } from "./session";
import type { FightIdentityView, FightRewardsView, FightSummary, FightView, LookView } from "./types";

export interface BattleRow {
  id: number;
  mode: Mode;
  difficulty: string | null;
  challenger_wallet: string;
  challenger_bot_id: number;
  defender_wallet: string | null;
  defender_bot_id: number | null;
  stake: number;
  class_gap: number;
  seed: string | null;
  status: string;
  winner_wallet: string | null;
  result: ResultJson | null;
  result_hash: string | null;
  coins_paid: number;
  points_paid: number | string;
  day_key: string;
  is_test: boolean;
  created_at: string;
  resolved_at: string | null;
}

/** What the row stores: everything the client needs to replay, plus the
 * identities as they stood at the bell (names never change under a card). */
export interface ResultJson {
  v: number;
  seed: number;
  mode: Mode;
  difficulty: Difficulty | null;
  buildA: Build;
  buildB: Build;
  orders: [Orders, Orders];
  winner: 0 | 1;
  frames: number;
  end: "ko" | "timeout";
  hash: number;
  chain: string;
  finisher: string;
  names: [string, string];
  walletNames: [string, string];
  ids: [FightIdentityView, FightIdentityView];
  houseShape: string | null;
  rewards: FightRewardsView;
  totalA: number;
  totalB: number;
  /** BOTH ROBOTS AS THEY WERE AT THE BELL. Written at resolve time so a
   * replay always shows the robots the way they looked that day. Absent on
   * every row stored before looks existed; looksOf() reads those back off
   * the saved build. */
  looks?: [LookView, LookView];
}

export const BATTLE_COLS =
  "id, mode, difficulty, challenger_wallet, challenger_bot_id, defender_wallet, defender_bot_id, stake, class_gap, seed, status, winner_wallet, result, result_hash, coins_paid, points_paid, day_key, is_test, created_at, resolved_at";

export function modeLabelOf(mode: Mode, difficulty: Difficulty | null): string {
  if (mode === "pvp") return "Player fight, saved copy";
  const title = difficulty ? HOUSE_ROSTER[difficulty].title : "";
  return mode === "spar" ? `Practice, ${title}`.trim() : `Game robot, ${title}`.trim();
}

// ── canonical shapes ────────────────────────────────────────────────────────
// The engine hashes fnv1a(JSON.stringify(state)), so KEY ORDER is part of
// the hash. Postgres JSONB stores object keys sorted (shorter first, then
// alphabetical), so a build read back from the row has its keys reordered
// ("arms" before "legs", "s" before "id") and a replay of it hashes
// differently even though every number is the same (found by the smoke,
// 2026-09-03: winner and frames equal, hash not). Every build and orders
// object leaving the server is rebuilt in the engine's own key order.

function canonicalPart(p: Part): Part {
  const out: Part = { id: p.id, s: [p.s[0], p.s[1], p.s[2]] };
  if (p.paint !== undefined) out.paint = p.paint;
  return out;
}

export function canonicalBuild(b: Build): Build {
  return { legs: canonicalPart(b.legs), arms: canonicalPart(b.arms), torso: canonicalPart(b.torso), head: canonicalPart(b.head), weapon: canonicalPart(b.weapon) };
}

export function canonicalOrders(o: Orders | undefined | null): Orders {
  const st = o && typeof o.stance === "number" ? o.stance : 0;
  const fo = o && typeof o.focus === "number" ? o.focus : 0;
  return { stance: st as Orders["stance"], focus: fo as Orders["focus"] };
}

// -- the looks on a stored fight ---------------------------------------------

/** The number a robot's name ends in, which its plate prints. The name text
 * is all an old row kept, and "Speedy Otter 7" still knows it is a 7. */
function plateFromName(name: string | undefined): number | null {
  const m = /\s(\d{1,2})$/.exec(name || "");
  return m ? Number(m[1]) : null;
}

/**
 * A ROW STORED BEFORE LOOKS EXISTED, read back honestly.
 *
 * The colours are real and always were: every Part in a saved build carries
 * the colour it arrived in, so a four colour robot from a month ago replays
 * in its four colours the moment a surface stops flattening it. Everything
 * else is left plain, because it was never written down: the calm face, no
 * sticker, no hat, and NO MARKS. Guessing marks from the win count on the
 * card would put stars on a robot that never wore them.
 *
 * A SOCKET THAT NEVER RECORDED A COLOUR takes the identity's own paint, which
 * is the ONE colour every surface painted the whole robot before looks
 * existed. That is not a guess, it is the picture that row has always drawn:
 * the house robot has no parts and so no found colours at all, and its rows
 * would otherwise turn from butter to plain cream the day this shipped.
 */
export function looksFromBuild(build: Build, id: FightIdentityView | undefined): LookView {
  const paints = socketPaints((slot) => build?.[slot]?.paint ?? id?.paint);
  return {
    paints,
    look: { ...NO_LOOK, plateNumber: plateFromName(id?.name) },
    marks: NO_MARKS,
    wins: id?.wins ?? 0,
  };
}

/**
 * One of the nine game robots, drawn from the one table every surface reads
 * (lib/bots/house-look.ts). It has won nothing, so it wears nothing it has
 * won, and its record is not its own: the house has no wins column.
 */
export function houseLookView(shapeId: string): LookView {
  return { paints: houseSocketPaints(shapeId), look: houseBotLook(shapeId), marks: HOUSE_MARKS, wins: 0 };
}

/**
 * Both robots as they looked at the bell: the snapshot when the row has one,
 * the saved build when it does not.
 *
 * A GAME ROBOT IS THE ONE EXCEPTION, and it is not a robot that was ever
 * "as it was": it has no owner, no parts and nothing it chose, so there is
 * nothing personal in a snapshot of one to preserve. Every row ever written
 * stored the house side as ONE flat colour over the whole frame, which is
 * why Wobble was butter in the ring and grey clay in the list beside it.
 * Its look is read from lib/bots/house-look.ts instead, so the nine are the
 * same nine characters on every surface and every row, old and new, gets
 * them. A PLAYER's side is never touched by this.
 */
export function looksOf(r: ResultJson): [LookView, LookView] {
  const stored = r.looks;
  const side = (i: 0 | 1, build: Build): LookView => {
    const shape = houseShapeIdOfBuild(build);
    if (shape) return houseLookView(shape);
    return stored?.[i] ?? looksFromBuild(build, r.ids?.[i]);
  };
  return [side(0, r.buildA), side(1, r.buildB)];
}

// ── reading a fight ─────────────────────────────────────────────────────────

export async function loadBattle(db: BotsDb, id: string): Promise<BattleRow | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  const { data, error } = await db.from("battle_bots_battles").select(BATTLE_COLS).eq("id", Number(id)).maybeSingle();
  if (error) throw new Error(`battle read: ${error.message}`);
  return (data as BattleRow | null) ?? null;
}

/** The view the replay page and the card read. Sparring is private: only
 * the owner may see it; anyone may see a pve or pvp replay. */
export function fightView(row: BattleRow, sess: BotsSession | null): FightView {
  if (row.status !== "resolved" || !row.result) return refuse(404, "That fight is not finished.");
  const r = row.result;
  const mine = !!sess && sess.wallet === row.challenger_wallet;
  if (row.mode === "spar" && !mine) return refuse(403, "Only you can watch your own practice fights.");
  return {
    ok: true,
    id: String(row.id),
    seed: r.seed,
    buildA: canonicalBuild(r.buildA),
    buildB: canonicalBuild(r.buildB),
    orders: [canonicalOrders(r.orders?.[0]), canonicalOrders(r.orders?.[1])],
    mode: r.mode,
    difficulty: r.difficulty ?? null,
    engineVersion: r.v,
    hash: r.hash,
    winner: r.winner,
    frames: r.frames,
    end: r.end,
    chain: r.chain,
    finisher: r.finisher,
    names: r.names,
    walletNames: r.walletNames,
    ids: r.ids,
    looks: looksOf(r),
    stake: row.stake,
    classGap: row.class_gap,
    rewards: r.rewards,
    createdAt: row.created_at,
    modeLabel: modeLabelOf(r.mode, r.difficulty ?? null),
    houseShape: r.houseShape,
    mine,
  };
}

/** One row of a shelf on the battles page. */
export function fightSummary(row: BattleRow): FightSummary | null {
  const r = row.result;
  if (row.status !== "resolved" || !r || row.mode === "spar") return null;
  const w = r.winner;
  const l = w === 0 ? 1 : 0;
  const totals = [r.totalA, r.totalB];
  return {
    id: String(row.id),
    mode: row.mode as "pve" | "pvp",
    difficulty: r.difficulty ?? null,
    createdAt: row.created_at,
    frames: r.frames,
    seconds: Math.floor(r.frames / 60),
    end: r.end,
    winner: w,
    names: [r.names[0], r.names[1]],
    walletNames: [r.walletNames[0], r.walletNames[1]],
    paints: [r.ids[0].paint, r.ids[1].paint],
    looks: looksOf(r),
    winnerName: r.names[w],
    loserName: r.names[l],
    winnerWallet: r.walletNames[w],
    loserWallet: r.walletNames[l],
    winnerTier: r.ids[w].tier,
    loserTier: r.ids[l].tier,
    finisher: r.finisher,
    chain: r.chain,
    upset: Math.max(0, totals[l] - totals[w]),
  };
}
