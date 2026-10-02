/**
 * THE CLASS TRACKS (ADR-0129, Mike's spec verbatim: "if they change from
 * level 3 warrior to mage they are a level 1 mage and can switch back to
 * warrior") - per-(wallet, class) progression, one active class at a time.
 *
 * SHAPE: rows in launch_wars_s7_classes (SQL 049), one per (wallet, class),
 * NEVER deleted - preservation-by-construction is what makes switching back
 * lossless. players.active_class points at the class currently playing the
 * games and earning the XP.
 *
 * LAWS:
 *  - XP lands on the ACTIVE class only, from game runs + the daily quest.
 *    No XP from holding (Mike, 2026-08-23: "the play loop is pure").
 *  - Levels/gear buy stats inside the game envelope, armor stages, titles.
 *    NEVER cash, never a payout multiplier (ADR-0126 untouched).
 *  - The curve tops at level 20 to match rules-core derive()'s clamp.
 */
import type { ClassId } from "@/app/s7/games/_shared/rules/core";
import { CLASS_IDS } from "@/app/s7/games/_shared/rules/core";

export const MAX_LEVEL = 20;

// ── THE GEAR STORE (ADR-0129: Gold buys per-class gear in three slots) ──────
export const GEAR_SLOTS = ["weapon", "armor", "trinket"] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
export const GEAR_MAX_TIER = 3;
/** Price of tier N (1-indexed): the same ladder for every slot, tuned so a
 * full 9-buy kit (~2,550 Gold) is a committed-fortnight purchase against the
 * 15-Gold-per-banked-run faucet plus bot sources. Display names live in the
 * theme/strings; the sims read tiers through derive() only. */
export const GEAR_PRICES = [100, 250, 500] as const;
/** ARMOR STAGES (the ADR-0014 glamour ladder): levels visibly upgrade the
 * look, never the numbers beyond what derive() already grants. Art lives at
 * /s7-art/class/stage/<class>-<stage>.png (keyed cutouts). */
export const ARMOR_STAGES = ["novice", "veteran", "champion", "mythic"] as const;
export type ArmorStage = (typeof ARMOR_STAGES)[number];
export function stageForLevel(level: number): ArmorStage {
  const l = Math.max(1, level | 0);
  if (l >= 15) return "mythic";
  if (l >= 8) return "champion";
  if (l >= 4) return "veteran";
  return "novice";
}
export const classStageArt = (classId: string, stage: ArmorStage) =>
  `/s7-art/class/stage/${classId}-${stage}.png`;

export function gearNextPrice(tier: number): number | null {
  const t = Math.max(0, Math.min(GEAR_MAX_TIER, tier | 0));
  return t >= GEAR_MAX_TIER ? null : GEAR_PRICES[t];
}

/**
 * XP to REACH each level (cumulative), a gentle quadratic: early levels land
 * in a session or two, the teens are a season commitment. Level N costs
 * 50*N*(N-1) total XP: L2=100, L3=300, L5=1,000, L10=4,500, L20=19,000.
 * A typical run banks 300-1,500 xp-equivalent, so the pacing reads as
 * "a few runs per early level" without any per-run tuning knob.
 */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, level | 0));
  return 50 * n * (n - 1);
}

/** Level implied by a lifetime XP total (inverse of xpForLevel, clamped). */
export function levelForXp(xp: number): number {
  const x = Math.max(0, xp | 0);
  let lvl = 1;
  while (lvl < MAX_LEVEL && x >= xpForLevel(lvl + 1)) lvl++;
  return lvl;
}

export interface ClassTrack {
  classKey: ClassId;
  level: number;
  xp: number;
  gear: { weapon: number; armor: number; trinket: number };
}

export const isClassId = (v: unknown): v is ClassId =>
  typeof v === "string" && (CLASS_IDS as readonly string[]).includes(v);

const EMPTY_GEAR = { weapon: 0, armor: 0, trinket: 0 };

/** Supabase-shaped client subset (matches the s6 lib idiom: the callers hand
 * in the service client; this module never creates one). */
type Db = {
  from: (table: string) => any;
};

const T_CLASSES = "launch_wars_s7_classes";
const T_PLAYERS = "launch_wars_s7_players";
const SEASON = "s7";

function rowToTrack(r: any): ClassTrack {
  const g = r?.gear && typeof r.gear === "object" ? r.gear : EMPTY_GEAR;
  return {
    classKey: r.class_key,
    level: Math.max(1, Math.min(MAX_LEVEL, Number(r.level) || 1)),
    xp: Math.max(0, Number(r.xp) || 0),
    gear: {
      weapon: Math.max(0, Math.min(3, Number(g.weapon) || 0)),
      armor: Math.max(0, Math.min(3, Number(g.armor) || 0)),
      trinket: Math.max(0, Math.min(3, Number(g.trinket) || 0)),
    },
  };
}

/** Every track a wallet owns + which is active. Wallets with no rows yet get
 * an empty list and a null active class (the join flow creates the first
 * track when they pick). */
export async function getTracks(
  db: Db,
  wallet: string,
): Promise<{ active: ClassId | null; tracks: ClassTrack[] }> {
  const w = wallet.toLowerCase();
  const { data: rows, error } = await db
    .from(T_CLASSES)
    .select("class_key, level, xp, gear")
    .eq("season_key", SEASON)
    .eq("wallet", w);
  if (error) throw new Error(`class tracks read: ${error.message}`);
  const { data: player, error: pErr } = await db
    .from(T_PLAYERS)
    .select("active_class")
    .eq("season_key", SEASON)
    .eq("wallet", w)
    .maybeSingle();
  if (pErr) throw new Error(`player read: ${pErr.message}`);
  const active = player && isClassId(player.active_class) ? player.active_class : null;
  return { active, tracks: (rows ?? []).filter((r: any) => isClassId(r.class_key)).map(rowToTrack) };
}

/**
 * Switch the active class. Free, instant, lossless: the old class's row is
 * untouched; a first-time pick of a class UPSERTS its level-1 row. Returns
 * the resulting track ("you are now a level N <class>").
 */
export async function switchClass(db: Db, wallet: string, classKey: ClassId): Promise<ClassTrack> {
  const w = wallet.toLowerCase();
  const { error: upErr } = await db.from(T_CLASSES).upsert(
    {
      season_key: SEASON,
      wallet: w,
      class_key: classKey,
      // level/xp/gear intentionally ABSENT: on conflict the existing row's
      // progress must win. Supabase upsert with ignoreDuplicates keeps the
      // old row verbatim; a fresh row gets the SQL defaults (level 1).
    },
    { onConflict: "season_key,wallet,class_key", ignoreDuplicates: true },
  );
  if (upErr) throw new Error(`class row upsert: ${upErr.message}`);
  const { error: setErr } = await db
    .from(T_PLAYERS)
    .update({ active_class: classKey })
    .eq("season_key", SEASON)
    .eq("wallet", w);
  if (setErr) throw new Error(`active_class set: ${setErr.message}`);
  const { data: row, error: rErr } = await db
    .from(T_CLASSES)
    .select("class_key, level, xp, gear")
    .eq("season_key", SEASON)
    .eq("wallet", w)
    .eq("class_key", classKey)
    .maybeSingle();
  if (rErr || !row) throw new Error(`class row readback: ${rErr?.message ?? "missing"}`);
  return rowToTrack(row);
}

/**
 * Grant XP to the wallet's ACTIVE class (the only class that ever earns).
 * Level derives from lifetime XP, so grants are idempotent-safe to retry at
 * the caller's dedupe granularity (the score route's run nonce; the daily
 * quest's ledger day-key). Returns the track + whether it leveled.
 */
export async function grantClassXp(
  db: Db,
  wallet: string,
  amount: number,
): Promise<{ track: ClassTrack; leveled: boolean } | null> {
  const w = wallet.toLowerCase();
  const add = Math.max(0, Math.floor(amount));
  if (add === 0) return null;
  const { data: player, error: pErr } = await db
    .from(T_PLAYERS)
    .select("active_class")
    .eq("season_key", SEASON)
    .eq("wallet", w)
    .maybeSingle();
  if (pErr) throw new Error(`player read: ${pErr.message}`);
  if (!player || !isClassId(player.active_class)) return null; // no class picked: XP has nowhere to land
  const cls = player.active_class as ClassId;
  const { data: row, error: rErr } = await db
    .from(T_CLASSES)
    .select("level, xp")
    .eq("season_key", SEASON)
    .eq("wallet", w)
    .eq("class_key", cls)
    .maybeSingle();
  if (rErr) throw new Error(`class row read: ${rErr.message}`);
  const oldXp = Math.max(0, Number(row?.xp) || 0);
  const newXp = oldXp + add;
  const newLevel = levelForXp(newXp);
  const oldLevel = Math.max(1, Number(row?.level) || 1);
  const { error: upErr } = await db.from(T_CLASSES).upsert(
    { season_key: SEASON, wallet: w, class_key: cls, xp: newXp, level: newLevel, updated_at: new Date().toISOString() },
    { onConflict: "season_key,wallet,class_key" },
  );
  if (upErr) throw new Error(`xp grant write: ${upErr.message}`);
  const { data: back, error: bErr } = await db
    .from(T_CLASSES)
    .select("class_key, level, xp, gear")
    .eq("season_key", SEASON)
    .eq("wallet", w)
    .eq("class_key", cls)
    .maybeSingle();
  if (bErr || !back) throw new Error(`xp grant readback: ${bErr?.message ?? "missing"}`);
  return { track: rowToTrack(back), leveled: newLevel > oldLevel };
}
