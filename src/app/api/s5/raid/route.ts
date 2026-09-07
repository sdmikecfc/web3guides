/**
 * S5 RAID status feed (public, cached 60s like /api/s5/contracts):
 *
 *   GET /api/s5/raid -> { ok, date, resolveHourUtc, count, boss, oddsPct }
 *
 * Reads the bot's s5_battle_roster config row (JSON {date, wallets:[]}) and
 * counts it ONLY when its date matches the NEXT resolve date (join-first rule:
 * today before 14:00 UTC, else tomorrow), plus the s5_season window so the
 * schedule can place the tutorial and finale bosses. The boss schedule + odds
 * live in the client-safe lib/s5/raid.ts mirror.
 *
 * PUBLIC-SAFE: a count and an estimate, never a wallet, never a dollar.
 * FAILS SOFT: missing env/table/config all resolve to count 0 so the strip
 * still rallies.
 */
import { NextResponse } from "next/server";
import { s5Db } from "@/lib/s5/server";
import { getSprint } from "@/lib/s5/data";
import {
  RESOLVE_HOUR_UTC,
  bossForDate,
  effectiveDifficulty,
  oddsPct,
  resolveDateUtc,
  rosterCountForDate,
  type SeasonWindowLike,
} from "@/lib/s5/raid";

export const revalidate = 60;

async function readRaidConfig(): Promise<{ rosterRaw: string | null; season: SeasonWindowLike }> {
  const empty = { rosterRaw: null, season: { launchAt: null, endAt: null } };
  try {
    const db = s5Db();
    const { data, error } = await db
      .from("launch_wars_boss_config")
      .select("key, value")
      .in("key", ["s5_battle_roster", "s5_season"]);
    if (error || !data) return empty;
    const map = new Map((data || []).map((r) => [String(r.key), r.value]));
    const rosterRaw = typeof map.get("s5_battle_roster") === "string" ? (map.get("s5_battle_roster") as string) : null;
    let season: SeasonWindowLike = { launchAt: null, endAt: null };
    const seasonRaw = map.get("s5_season");
    if (typeof seasonRaw === "string") {
      try {
        const o = JSON.parse(seasonRaw) as { launchAt?: unknown; endAt?: unknown };
        season = {
          launchAt: typeof o?.launchAt === "string" ? o.launchAt : null,
          endAt: typeof o?.endAt === "string" ? o.endAt : null,
        };
      } catch {
        // junk config: keep the empty window
      }
    }
    return { rosterRaw, season };
  } catch {
    return empty;
  }
}

// The latest RESOLVED raid (won/lost), for the strip's result + share layer
// (growth plan B10). Only surfaced while fresh (within 2 days), and fails
// soft to null like every read here.
async function readLastResult(): Promise<{ name: string; won: boolean; dayKey: string } | null> {
  try {
    const db = s5Db();
    const { data } = await db
      .from("launch_wars_s5_raid_bosses")
      .select("name, status, day_key")
      .eq("is_test", false)
      .in("status", ["won", "lost"])
      .order("day_key", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data || typeof data.name !== "string") return null;
    const dayKey = String(data.day_key).slice(0, 10);
    const ageMs = Date.now() - Date.parse(`${dayKey}T00:00:00Z`);
    if (!Number.isFinite(ageMs) || ageMs > 2 * 86400000) return null;
    return { name: data.name, won: data.status === "won", dayKey };
  } catch {
    return null;
  }
}

export async function GET() {
  const date = resolveDateUtc(Date.now());
  const { rosterRaw, season } = await readRaidConfig();
  const count = rosterCountForDate(rosterRaw, date);
  const boss = bossForDate(date, season);
  const last = await readLastResult();
  // THE FRONT REACTS: a siege sprint diverts the enemy to hold the wall, so
  // the bot weakens today's boss. The public estimate must reflect the fight
  // that will actually be run, otherwise the strip understates the best day to
  // join. Fails soft to "no sprint" like every other read here.
  const sprint = await getSprint().catch(() => ({ active: false }));
  const difficulty = effectiveDifficulty(boss.difficulty, sprint.active);
  return NextResponse.json({
    ok: true,
    date,
    resolveHourUtc: RESOLVE_HOUR_UTC,
    count,
    sprint: sprint.active,
    boss: { key: boss.key, name: boss.name, difficulty },
    oddsPct: oddsPct(count, difficulty),
    last,
  });
}
