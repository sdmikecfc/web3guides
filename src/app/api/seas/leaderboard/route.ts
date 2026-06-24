/**
 * Conquer the Seas: public INDIVIDUAL leaderboard.
 *
 *   GET /api/seas/leaderboard
 *
 * The top captains by glory, for the DOM leaderboard overlay on the world map.
 * Public-safe by construction: only rank, a public id, name, faction (flag),
 * glory and a hull CLASS NAME ever leave this route. hull_usd is read solely to
 * derive the class label and is NEVER placed in the JSON response. No dollar
 * figure of any kind is exposed here.
 *
 * Test-world ships follow the SAME is_test gate the map route uses (config key
 * s2_test_world), so the board matches the map while the sandbox is active.
 */

import { NextResponse } from "next/server";
import { launchWarsDb } from "@/lib/launch-wars/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEASON_KEY = "s2";

// Same scenic faction anchors the map route uses, trimmed to the flag/color
// lookup the board needs.
const FACTIONS = [
  { domain: "realityapps.com", color: "#ff6b6b", flag: "🟥" },
  { domain: "recertify.ai", color: "#4ac6ff", flag: "🟦" },
  { domain: "warriors.xyz", color: "#3de3a4", flag: "🟩" },
  { domain: "bottoken.com", color: "#f0b45c", flag: "🟨" },
  { domain: "rackets.xyz", color: "#b69cff", flag: "🟪" },
];

// Identical to the map route's class helper. hull_usd in -> class NAME out.
function hullClassName(hull: number) {
  if (hull >= 100) return { cls: "Flagship", icon: "🚢" };
  if (hull >= 50) return { cls: "Galleon", icon: "⛵" };
  if (hull >= 25) return { cls: "Frigate", icon: "⛵" };
  if (hull >= 5) return { cls: "Sloop", icon: "🛶" };
  return { cls: "Dinghy", icon: "🛶" };
}

// FNV-1a, identical to the map route's hash32 (public id = hash32("s2:"+id)).
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export async function GET() {
  const db = launchWarsDb();

  // Same sandbox gate the map route uses.
  const { data: testCfg } = await db
    .from("launch_wars_boss_config")
    .select("value")
    .eq("key", "s2_test_world")
    .maybeSingle();
  const includeTest = testCfg?.value === "active";

  let shipQ = db
    .from("launch_wars_s2_ships")
    .select("discord_id, display_name, faction, glory, hull_usd, is_test")
    .eq("season_key", SEASON_KEY)
    .order("glory", { ascending: false })
    .limit(20);
  if (!includeTest) shipQ = shipQ.eq("is_test", false);
  const { data: shipRows } = await shipQ;

  const leaders = (shipRows || []).map((s, i) => {
    const hull = Number(s.hull_usd) || 0; // read ONLY to derive the class name
    const { cls } = hullClassName(hull);
    const f = FACTIONS.find((x) => x.domain === s.faction);
    return {
      rank: i + 1,
      id: hash32(`${SEASON_KEY}:${s.discord_id}`).toString(36), // public id, not the discord id
      name: s.display_name || "Captain",
      faction: s.faction,
      flag: f ? f.flag : "🏳️",
      glory: Math.round(Number(s.glory) || 0),
      cls,
    };
  });

  return NextResponse.json(
    { updatedAt: new Date().toISOString(), leaders },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60" } },
  );
}
