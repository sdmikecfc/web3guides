/** Wallet identity and transactional onboarding. Older accounts and their original
 * ledger are preserved; new accounts use the v1 provisioning RPC. */
import { splitPairValue } from "@/lib/bots/equipment";
import "server-only";
import { BOT_FIRST_WORDS, BOT_SECOND_WORDS, OWNER_FIRST_WORDS, OWNER_SECOND_WORDS } from "@/lib/bots/naming";
import { STARTER_PARTS } from "../_engine/catalog";
import { STARTER_PRICE, type Stats } from "../_engine/parts";
import { starterColors } from "@/lib/bots/shipment";
import type { PaintId } from "../_engine/parts";
import { fnv1a } from "../_engine/rng";
import { type BotsDb } from "./db";
import type { PartRow, PartStatsJson } from "./bots";
import { onboardingEnabled, missingMigration } from "./rollout";
import { ensureLegacyStarter } from "./legacy-starter";

/** Historical constants used to interpret old starter grants. */
export const STARTER_COINS = 120;
export const STARTER_KIT_COST = STARTER_PARTS.length * STARTER_PRICE;
export const STARTER_PROVENANCE = "Starter part";

export interface PlayerRow {
  id: number;
  wallet: string;
  wallet_name: string | null;
  enlisted_at: string;
  coins: number | string;
  battle_points: number | string;
  is_operator: boolean;
  is_test: boolean;
  review_status: string;
}

/** "Brass Otter 41": AN OWNER IS A METAL AND AN ANIMAL. The old tables were
 * shared with the robot names and were full of machine words, so a wallet
 * and a robot could be called the same thing and a part name could be either
 * ("Sparky Kettle 7" reads like a part on a shelf, not like somebody's
 * robot). naming.ts owns the five name spaces and its check fails on any
 * overlap. */
export function walletNameFor(wallet: string): string {
  const h = fnv1a(wallet.toLowerCase());
  const first = OWNER_FIRST_WORDS[h % OWNER_FIRST_WORDS.length];
  const second = OWNER_SECOND_WORDS[Math.floor(h / 64) % OWNER_SECOND_WORDS.length];
  const num = 1 + (Math.floor(h / 4096) % 99);
  return `${first} ${second} ${num}`;
}

export function coinsOf(p: PlayerRow | null | undefined): number {
  return Math.round(Number(p?.coins) || 0);
}

export function pointsOf(p: PlayerRow | null | undefined): number {
  return Number(p?.battle_points) || 0;
}

export function displayName(p: PlayerRow): string {
  return p.wallet_name && !/^0x[0-9a-f]{40}$/i.test(p.wallet_name) ? p.wallet_name : walletNameFor(p.wallet);
}

export async function loadPlayer(db: BotsDb, wallet: string): Promise<PlayerRow | null> {
  const { data, error } = await db
    .from("battle_bots_players")
    .select("id, wallet, wallet_name, enlisted_at, coins, battle_points, is_operator, is_test, review_status")
    .eq("wallet", wallet.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`player read: ${error.message}`);
  return (data as PlayerRow | null) ?? null;
}

/** Wallet names for a set of wallets (the battles page, the paper). */
export async function walletNames(db: BotsDb, wallets: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const want = Array.from(new Set(wallets.map((w) => w.toLowerCase()))).filter(Boolean);
  if (!want.length) return out;
  const { data } = await db.from("battle_bots_players").select("wallet, wallet_name").in("wallet", want);
  for (const r of (data || []) as { wallet: string; wallet_name: string | null }[]) {
    out.set(r.wallet, r.wallet_name && !/^0x/i.test(r.wallet_name) ? r.wallet_name : walletNameFor(r.wallet));
  }
  for (const w of want) if (!out.has(w)) out.set(w, walletNameFor(w));
  return out;
}

/** Fields inserted before the database supplies the row ID and timestamps. */
export type StarterPartInsert = Omit<PartRow, "id" | "created_at" | "recycled_at" | "stats" | "bot_id" | "source"> & {
  stats: PartStatsJson & { equipmentVersion: 2; s: Stats; provenance: string };
  bot_id: null;
  source: "starter";
  color: PaintId | null;
};

/** Legacy provisioning and migration contract.
 * Seven old starter instances preserve the original pair price and resale. */
export function starterPartRows(wallet: string, isTest: boolean, colors = starterColors(wallet)): StarterPartInsert[] {
  return STARTER_PARTS.flatMap((c) => {
    const paint = c.slot === "weapon" ? null : colors[c.slot];
    if (c.slot !== "weapon" && !paint) throw new Error(`starter kit: no colour for the ${c.slot} card`);
    const row: StarterPartInsert = {
      wallet,
      part_key: c.id,
      slot_kind: c.slot,
      tier: c.tier,
      stats: { equipmentVersion: 2, s: [c.s[0], c.s[1], c.s[2]], provenance: STARTER_PROVENANCE, ...(paint ? { paint } : {}) },
      bot_id: null,
      source: "starter",
      list_price: STARTER_PRICE,
      is_test: isTest,
      color: paint,
    };
    return c.slot === "arms" || c.slot === "legs"
      ? splitPairValue(STARTER_PRICE).map(value => ({ ...row, list_price: value.price, stats: { ...row.stats, salvage: value.salvage } }))
      : [row];
  });
}

/** "Speedy Otter 12": A ROBOT IS A FEELING WORD AND A CREATURE, from tables
 * that share not one word with the owner tables above, so a fight card can
 * never print the same name twice and leave a reader guessing which one is
 * the robot. */
export function starterBotName(wallet: string): { first: string; second: string; num: number } {
  const h = fnv1a(`bb:starter-bot:${wallet.toLowerCase()}`);
  return {
    first: BOT_FIRST_WORDS[h % BOT_FIRST_WORDS.length],
    second: BOT_SECOND_WORDS[Math.floor(h / 64) % BOT_SECOND_WORDS.length],
    num: 1 + (Math.floor(h / 4096) % 99),
  };
}

/**
 * Enlist a wallet: a returning wallet is returned as is (nothing granted);
 * a new wallet gets its row, its name and the starter. The is_test flag is
 * set ONLY at creation (a dev header can never flip a real player).
 *
 * NOTHING IS ASKED OF THE PLAYER HERE. A verified signature over a
 * server-issued nonce is the whole price of a seat (Mike, 2026-09-04: open
 * the site, connect the wallet, play). Splitting one person's trading across
 * many wallets is answered in the money rules instead, where a wallet is only
 * paid for a week it really traded, so it costs an honest player nothing at
 * the door.
 */
export async function enlistPlayer(
  db: BotsDb,
  walletIn: string,
  isTest: boolean,
): Promise<{ player: PlayerRow; joined: boolean }> {
  const wallet = walletIn.toLowerCase();
  const existing = await loadPlayer(db, wallet);
  const { data: progress, error: progressError } = await db.from("battle_bots_onboarding").select("version").eq("wallet", wallet).eq("version", 1).maybeSingle();
  if (progressError && !missingMigration(progressError)) throw new Error(`onboarding read: ${progressError.message}`);
  // Rollback never grants an old kit over an existing allowance or resets progress.
  if (progress && existing) return { player: existing, joined: false };
  const welcomeName = starterBotName(wallet);
  const draftName = starterBotName(`first-build:${wallet}`);
  if (onboardingEnabled()) {
    const { data, error } = await db.rpc("bb_onboarding_provision", {
      p_wallet: wallet, p_wallet_name: walletNameFor(wallet), p_welcome_name: welcomeName,
      p_draft_name: draftName, p_is_test: isTest,
    });
    if (!error) {
      const player = await loadPlayer(db, wallet);
      if (!player) throw new Error("The player row did not land.");
      return { player, joined: !!data?.joined };
    }
    // Only absent schema falls back. A failed transaction is never retried as
    // a different grant/economy, and ordinary database errors remain errors.
    if (!missingMigration(error)) throw new Error(`onboarding provision: ${error.message}`);
  }
  const { data: legacy, error: legacyError } = await db.rpc("bb_legacy_provision", {
    p_wallet: wallet, p_wallet_name: walletNameFor(wallet), p_name: welcomeName,
    p_parts: starterPartRows(wallet, existing?.is_test ?? isTest), p_is_test: isTest,
  });
  if (!legacyError) {
    const player = await loadPlayer(db, wallet);
    if (!player) throw new Error("The player row did not land.");
    return { player, joined: !!legacy?.joined };
  }
  if (!missingMigration(legacyError)) throw new Error(`legacy provision: ${legacyError.message}`);
  // Original-schema compatibility. Existing inventory, recycled history and
  // completed starter debits mean this player is already provisioned.
  const reads = await Promise.all([
    db.from("battle_bots_part_instances").select("id", { count: "exact", head: true }).eq("wallet", wallet),
    db.from("battle_bots_bots").select("id", { count: "exact", head: true }).eq("wallet", wallet),
    db.from("battle_bots_ledger").select("id", { count: "exact", head: true }).eq("wallet", wallet).eq("reason", `starter-kit:${wallet}`),
  ]);
  for (const read of reads) if (read.error) throw new Error(`legacy starter read: ${read.error.message}`);
  if (existing && reads.some(read => (read.count ?? 0) > 0)) return { player: existing, joined: false };
  if (!existing) {
    const { error } = await db.from("battle_bots_players").insert({ wallet, wallet_name: walletNameFor(wallet), is_test: isTest });
    if (error && error.code !== "23505") throw new Error(`enlist: ${error.message}`);
  }
  const ready = await loadPlayer(db, wallet);
  if (!ready) throw new Error("The player row did not land.");
  const joined = await ensureLegacyStarter(db, ready);
  const player = await loadPlayer(db, wallet);
  if (!player) throw new Error("The player row did not land.");
  return { player, joined };
}
