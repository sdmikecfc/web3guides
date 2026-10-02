/**
 * BATTLE BOTS CARDS: phase 1 of the win NFT (the guide "The prize"): a
 * signed collectible row in battle_bots_cards, minted on a bot's FIRST PvP
 * win. The payload is signed with HMAC-SHA256 under BB_CARD_SECRET (db.ts
 * cardSecret) so a public verify URL can check it later without a
 * transaction. UNIQUE (wallet, kind, window_key, bot_id) makes the mint
 * idempotent: a second win inserts nothing.
 */
import "server-only";
import { createHmac } from "node:crypto";
import { type BotsDb, cardSecret } from "./db";

export const CARD_FIRST_WIN = "champion-first-win";

export interface CardPayload {
  kind: string;
  fightId: string;
  botId: number;
  botName: string;
  walletName: string;
  beat: string;
  beatWallet: string;
  at: string;
  hash: string;
  engineVersion: number;
}

/** Canonical JSON (sorted keys) so the signature does not depend on key order. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}

export function signCard(payload: CardPayload): string {
  return createHmac("sha256", cardSecret()).update(canonicalJson(payload)).digest("hex");
}

export function verifyCard(payload: CardPayload, signature: string): boolean {
  return signCard(payload) === signature;
}

export interface CardRow {
  id: number;
  wallet: string;
  bot_id: number | null;
  kind: string;
  window_key: string;
  payload: CardPayload | null;
  signature: string | null;
  claimed_at: string | null;
  is_test: boolean;
  created_at: string;
}

const CARD_COLS = "id, wallet, bot_id, kind, window_key, payload, signature, claimed_at, is_test, created_at";

/**
 * THE CARDS THIS WALLET HAS WON, newest first, WITH THE SIGNATURE CHECKED.
 *
 * These rows have been written since the first PvP win landed and read by
 * nobody, which is the same as not existing: a keepsake nobody can look at is
 * not a keepsake. This is the first reader.
 *
 * IT CHECKS THE SIGNATURE, and that is the whole point of having signed them.
 * The payload is what a public verify URL will one day be handed, so a row
 * whose HMAC does not match its payload is a row that was edited after it was
 * made, and showing it to the player would launder the edit. Such a row is
 * dropped and logged loudly rather than shown or thrown on: one bad card must
 * never take the garage down with it.
 */
export async function loadCards(db: BotsDb, wallet: string): Promise<CardRow[]> {
  const { data, error } = await db
    .from("battle_bots_cards")
    .select(CARD_COLS)
    .eq("wallet", wallet.toLowerCase())
    .order("id", { ascending: false })
    .limit(100);
  if (error) throw new Error(`cards read: ${error.message}`);
  const out: CardRow[] = [];
  for (const r of (data || []) as CardRow[]) {
    if (!r.payload || !r.signature) continue;
    if (!verifyCard(r.payload, r.signature)) {
      // eslint-disable-next-line no-console
      console.error("[bots cards] card", r.id, "does not match its own signature; not shown");
      continue;
    }
    out.push(r);
  }
  return out;
}

/** Mint the first-PvP-win card for a bot; a duplicate is silently a no-op. */
export async function mintFirstWinCard(db: BotsDb, wallet: string, payload: CardPayload, isTest: boolean): Promise<boolean> {
  const { error } = await db.from("battle_bots_cards").insert({
    wallet: wallet.toLowerCase(),
    bot_id: payload.botId,
    kind: CARD_FIRST_WIN,
    window_key: "",
    payload,
    signature: signCard(payload),
    is_test: isTest,
  });
  if (!error) return true;
  if (/duplicate|unique/i.test(error.message || "")) return false;
  throw new Error(`card mint: ${error.message}`);
}
