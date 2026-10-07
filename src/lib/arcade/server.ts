/**
 * LAUNCH WARS ARCADE - server helpers (service-role; never import in client
 * code).
 *
 * STORAGE DECISION: the arcade lives INSIDE the S7 session / nonce / score
 * tables under its own season_key ("arcade"). No migration: season_key is
 * plain TEXT with no CHECK, the unique key and the board index are
 * season_key-first, and every reader of those tables (the S7 web boards, the
 * S7 bot's arcade-prize query, its launch-day freshStart wipe) filters
 * season_key = 's7'. So an arcade row can never reach season money, never
 * shows on a season board, and is never wiped by a season launch.
 *
 * What the arcade deliberately does NOT do: no grants RPC, no players row, no
 * points, no play currency, no class XP, no attempts budget. A bank is one
 * best-of-day score row and nothing else.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { ARCADE_GAMES } from "./games";
import { ARCADE_SEASON_KEY } from "./mode";

export { verifyOwnership } from "@/lib/stars/server";
export { ARCADE_SEASON_KEY };

export const T_SESSIONS = "launch_wars_s7_game_sessions";
export const T_NONCES = "launch_wars_s7_run_nonces";
export const T_SCORES = "launch_wars_s7_scores";
export const BOARDS_TAG = "arcade-boards";

export function arcadeDb() {
  return createServiceClient();
}

/**
 * THE KILL SWITCH. Open by default: only the literal config value 'false'
 * closes it, and a failed read leaves it OPEN. That is the opposite of a
 * season's scoringOpen() on purpose: a season gate protects money and must
 * fail closed, this one protects nothing but a fun board, and a config hiccup
 * should not take sixteen games offline.
 */
export async function arcadeOpen(db: ReturnType<typeof arcadeDb>): Promise<boolean> {
  try {
    const { data, error } = await db
      .from("launch_wars_boss_config")
      .select("value")
      .eq("key", "arcade_enabled")
      .maybeSingle();
    if (error || !data) return true;
    return String(data.value) !== "false";
  } catch {
    return true;
  }
}

// ── Boards ───────────────────────────────────────────────────────────────────

export type ArcadeBoardRow = { rank: number; name: string; score: number };
export type ArcadeBoards = Record<string, ArcadeBoardRow[]>;

const BOARD_SIZE = 10;
/** A wallet holds one row per game PER DAY, so the top of the table can repeat
 * a wallet; read deep enough that ten distinct wallets survive the dedupe. */
const BOARD_READ_DEPTH = 120;
/** .in() puts the list in a PostgREST query string; keep each read bounded. */
const NAME_BATCH = 60;

const FULL_WALLET_RE = /^0x[0-9a-fA-F]{40}$/;
const shortWallet = (w: string) => (w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w);

/** A display_name that IS a raw wallet must never reach a public board. */
function publicName(raw: string, wallet: string): string {
  const s = raw.trim();
  if (!s || FULL_WALLET_RE.test(s)) return shortWallet(wallet);
  return s.slice(0, 40);
}

/** Names come from the season players tables, read-only, newest season first:
 * the arcade has no players table of its own and never writes one. */
const NAME_SOURCES: Array<{ table: string; seasonKey: string }> = [
  { table: "launch_wars_s7_players", seasonKey: "s7" },
  { table: "launch_wars_s6_players", seasonKey: "s6" },
  { table: "launch_wars_s5_players", seasonKey: "s5" },
  { table: "launch_wars_s4_players", seasonKey: "s4" },
];

async function resolveNames(db: ReturnType<typeof arcadeDb>, wallets: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const src of NAME_SOURCES) {
    const missing = wallets.filter((w) => !names.has(w));
    if (!missing.length) break;
    for (let i = 0; i < missing.length; i += NAME_BATCH) {
      const batch = missing.slice(i, i + NAME_BATCH);
      try {
        const { data } = await db
          .from(src.table)
          .select("wallet, display_name")
          .eq("season_key", src.seasonKey)
          .in("wallet", batch);
        for (const p of data || []) {
          const w = String(p.wallet || "").toLowerCase();
          const n = String(p.display_name || "").trim();
          if (w && n && !FULL_WALLET_RE.test(n) && !names.has(w)) names.set(w, n);
        }
      } catch {
        /* a missing table or a failed read: that season simply names nobody */
      }
    }
  }
  return names;
}

async function _readArcadeBoards(): Promise<ArcadeBoards> {
  const db = arcadeDb();
  const best = new Map<string, Array<{ wallet: string; score: number }>>();
  await Promise.all(
    ARCADE_GAMES.map(async (g) => {
      try {
        const { data } = await db
          .from(T_SCORES)
          .select("wallet, score")
          .eq("season_key", ARCADE_SEASON_KEY)
          .eq("game", g.key)
          .eq("is_test", false)
          .gt("score", 0)
          .order("score", { ascending: false })
          .order("created_at", { ascending: true }) // ties go to the earliest run
          .limit(BOARD_READ_DEPTH);
        const seen = new Set<string>();
        const rows: Array<{ wallet: string; score: number }> = [];
        for (const r of data || []) {
          const w = String(r.wallet || "").toLowerCase();
          if (!w || seen.has(w)) continue;
          seen.add(w);
          rows.push({ wallet: w, score: Math.round(Number(r.score) || 0) });
          if (rows.length >= BOARD_SIZE) break;
        }
        best.set(g.key, rows);
      } catch {
        best.set(g.key, []); // one dead board must not take the page down
      }
    }),
  );
  const wallets = Array.from(new Set(Array.from(best.values()).flatMap((rows) => rows.map((r) => r.wallet))));
  const names = wallets.length ? await resolveNames(db, wallets) : new Map<string, string>();
  const out: ArcadeBoards = {};
  for (const g of ARCADE_GAMES) {
    out[g.key] = (best.get(g.key) || []).map((r, i) => ({
      rank: i + 1,
      name: publicName(names.get(r.wallet) || "", r.wallet),
      score: r.score,
    }));
  }
  return out;
}

/** Cached 60s and tag-revalidated by /api/arcade/score on every improved bank,
 * so a new best shows on the next page view, not a minute later. */
export const readArcadeBoards = unstable_cache(_readArcadeBoards, ["arcade-boards-v1"], {
  revalidate: 60,
  tags: [BOARDS_TAG],
});
