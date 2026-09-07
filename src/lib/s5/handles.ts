/**
 * S5 PUBLIC GARAGE handles, pure client-safe logic (no IO, no secrets, no
 * imports). A handle is what appears after /s5/hq/ in a public garage URL:
 *
 *   - a wallet PREFIX: 0x + at least 6 hex chars ("0x1a2b3c4d") which resolves
 *     only when exactly ONE enlisted wallet starts with it, or
 *   - a display-name SLUG: lowercase, spaces to hyphens ("big-mike"), first
 *     match by Medals descending.
 *
 * The matching itself lives here as pure functions so it can be unit-tested
 * with plain node (the server helper in publicHq.ts only adds the DB reads).
 * Never expose a full wallet: handleForPlayer emits at most 0x + 8 hex.
 */

/** A wallet-prefix handle: 0x + 6..40 hex chars (40 = a full address). */
export const WALLET_PREFIX_RE = /^0x[a-f0-9]{6,40}$/i;

const FULL_WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

/** The display-name slug rule (spec: lowercase, spaces to hyphens). */
export function slugify(name: unknown): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/** True when a handle should resolve as a wallet prefix, not a name slug. */
export function isWalletPrefixHandle(handle: unknown): boolean {
  return typeof handle === "string" && WALLET_PREFIX_RE.test(handle.trim());
}

/** The minimal row shape the matchers need (a players-table projection). */
export type HandleRow = {
  wallet: string;
  display_name?: unknown;
  points?: unknown;
};

/**
 * Wallet-prefix match: exactly one row's wallet may start with the prefix
 * (case-insensitive). Zero matches or an ambiguous prefix both resolve to null.
 */
export function pickByWalletPrefix<T extends HandleRow>(handle: string, rows: T[]): T | null {
  const prefix = String(handle || "").trim().toLowerCase();
  if (!WALLET_PREFIX_RE.test(prefix)) return null;
  const hits = rows.filter((r) => String(r.wallet || "").toLowerCase().startsWith(prefix));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Slug match: the first row (by points descending) whose slugified
 * display_name equals the slugified handle. Junk-tolerant; null when nothing
 * matches.
 */
export function pickBySlug<T extends HandleRow>(handle: string, rows: T[]): T | null {
  const want = slugify(handle);
  if (!want) return null;
  const sorted = [...rows].sort((a, b) => (Number(b.points) || 0) - (Number(a.points) || 0));
  for (const r of sorted) {
    if (typeof r.display_name === "string" && slugify(r.display_name) === want) return r;
  }
  return null;
}

/**
 * The canonical share handle for one player: the display-name slug when it is
 * usable, else 0x + the first 8 hex chars of the wallet. A slug that LOOKS
 * like a wallet prefix (a hex-shaped name) falls back to the wallet short so
 * the resolver never misroutes it. Never returns a full wallet.
 */
export function handleForPlayer(displayName: unknown, wallet: unknown): string {
  const w = String(wallet || "").toLowerCase();
  const short = /^0x[a-f0-9]{8,}$/.test(w) ? w.slice(0, 10) : "";
  const s = slugify(displayName);
  if (!s || WALLET_PREFIX_RE.test(s)) return short;
  return s;
}

/**
 * Display-safe callsign (the public-board publicName rule + a length cap for
 * card rendering): blank or non-string becomes "Commander", a raw wallet
 * display_name shortens to the truncated 0x form, everything else caps at 40.
 */
export function publicCallsign(raw: unknown): string {
  if (typeof raw !== "string") return "Commander";
  const s = raw.trim();
  if (!s) return "Commander";
  if (FULL_WALLET_RE.test(s)) return `${s.slice(0, 6)}…${s.slice(-4)}`;
  return s.slice(0, 40);
}

// ── Rank ladder (display only, from the bot-written War Bonds tier 0..20) ───
export const RANKS: Array<{ min: number; name: string }> = [
  { min: 0, name: "Recruit" },
  { min: 1, name: "Private" },
  { min: 3, name: "Corporal" },
  { min: 5, name: "Sergeant" },
  { min: 8, name: "Lieutenant" },
  { min: 11, name: "Captain" },
  { min: 14, name: "Major" },
  { min: 17, name: "Colonel" },
  { min: 20, name: "Field Marshal" },
];

/** Rank name for a War Bonds tier (clamped 0..20; junk reads as Recruit). */
export function rankName(bondsTier: unknown): string {
  const t = Math.max(0, Math.min(20, Math.floor(Number(bondsTier) || 0)));
  let name = RANKS[0].name;
  for (const r of RANKS) if (t >= r.min) name = r.name;
  return name;
}
