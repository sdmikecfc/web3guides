/**
 * S7 ARMORY VAULT, the daily deal registry (#221, ADR-0067).
 *
 * ONE deal a day, DETERMINISTIC: the UTC day number indexes a FIXED price list
 * of EXISTING cosmetics. No randomness at render, none at purchase, contents
 * and price always shown, Gold only, cosmetics only. The rotation reuses the
 * existing decal registry (lib/s7/ftue.ts DECAL_LABELS): the registries are
 * thin today, so the list simply repeats across the season rather than
 * inventing new art-dependent cosmetics (the L7 rule). Camos are NOT here on
 * purpose: every camo is already a free swap (/api/s7/hq), so there is
 * nothing to sell. first-colors is NOT here either: it is the FTUE chain's
 * earned moment and stays quest-only.
 *
 * The server route (/api/s7/vault-buy) computes today's deal from THIS list
 * and refuses anything else, so the client can never name its own item or
 * price. The client renders from the same pure functions, so what the panel
 * shows is byte-for-byte what the server will charge.
 *
 * Client-safe: pure constants + math, no IO, no secrets. Never throws.
 */

export type VaultItem = {
  /** The only cosmetic kind sold today; the type exists so a future rotation
   * entry states what it is instead of implying it. */
  kind: "decal";
  /** A key from the EXISTING decal registry (DECAL_LABELS / hq.decals). */
  key: string;
  /** Server price in Gold (play currency, never cash). */
  price: number;
};

/**
 * The FIXED rotation. Order is the schedule: day N sells
 * VAULT_ITEMS[N % length], everyone sees the same deal, and yesterday's
 * price can never be charged today. Prices sit inside the existing Gold
 * economy (crates pay 80..400, a Tier 2 tank costs 300).
 */
export const VAULT_ITEMS: VaultItem[] = [
  { kind: "decal", key: "convoy", price: 200 },
  { kind: "decal", key: "division-star", price: 350 },
  { kind: "decal", key: "iron-discipline", price: 500 },
];

const DAY_MS = 86_400_000;

/** UTC day number (days since epoch) for a timestamp. The one seed. */
export function vaultDayNumber(nowMs: number): number {
  const n = Math.floor((Number(nowMs) || 0) / DAY_MS);
  return n > 0 ? n : 0;
}

/** Today's deal for one UTC day number. Total function: junk input still
 * lands on a real entry, so no surface ever renders an empty vault. */
export function vaultDealForDay(dayNum: number): VaultItem {
  const n = VAULT_ITEMS.length;
  const i = ((Math.floor(Number(dayNum) || 0) % n) + n) % n;
  return VAULT_ITEMS[i];
}

/**
 * A keep's War Effort decal key. CLIENT-SAFE MIRROR of the server-only
 * warEffortDecal (lib/s7/warEffort.ts, itself mirroring the bot): the
 * collection board needs the key shape to list unearned breach decals, and a
 * client component cannot import a server-only module. Keep all three in step
 * by hand; the slug rule is stable (lowercase, non-alphanumerics collapse to
 * one hyphen, trimmed).
 */
export function breachDecalKey(domain: string): string {
  const slug = String(domain || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `breach-${slug}`;
}
