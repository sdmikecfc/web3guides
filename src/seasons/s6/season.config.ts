/**
 * SEASON 6 AS CONFIG - THE SHADOW FIXTURE (ADR-0129).
 *
 * S6 stays FROZEN on its own code forever; this file never serves a player.
 * It exists so the engine's abstractions are proven against a REAL season
 * before S7 trusts them: a dev-only route renders THIS config through the
 * engine and the result is diffed against the live S6 pages (targets, money
 * lines, vocabulary, map). Green diff = the carve is honest; red = the engine
 * guessed. The Wednesday Aug 26 checkpoint reads this diff.
 *
 * Values are transcribed from the shipped S6 code, cited per field, and must
 * NEVER be "improved" - the fixture's only virtue is fidelity.
 */
import type { SeasonConfig } from "@/season/config";

export const S6_FIXTURE: SeasonConfig = {
  key: "s6",
  name: "Launch Wars S6: Uprising", // lib/s6/theme.ts DEFAULT_THEME.seasonName
  title: "UPRISING",
  host: "launchwars.xyz", // ADR-0116 canonical address
  basePath: "/s6",
  window: {
    launchAt: "2026-08-17T16:00:00Z", // SQL 047 handover (quiet launch)
    endAt: "2026-08-31T14:00:00Z",    // s6_season config endAt
  },
  money: {
    poolFullUsd: 1000, // lib/s6/games.ts POOL_FULL_USD == bot PRIZE_POOL_USD
    sliceMinUsd: 75,   // bot SLICE_MIN_USD
    sliceMaxUsd: 150,  // bot SLICE_MAX_USD
  },
  theme: {
    // lib/s6/theme.ts DEFAULT_THEME, verbatim
    seasonName: "Launch Wars S6: Uprising",
    target: { singular: "mainframe", plural: "mainframes" },
    team: { singular: "column", plural: "columns" },
    player: { singular: "pilot", plural: "pilots" },
    points: "Signal",
    playCurrency: "Scrap",
    bondedWord: "LIBERATED",
    statusWord: { pending: "DETECTED", live: "UNDER ASSAULT", failed: "MACHINE-HELD" },
    // SERVED value: the s6_theme DB row overrides the code default "The Iron
    // Column" with ADR-0117's name. Caught by the shadow diff's first run
    // 2026-08-24 - the exact shadow-token drift class the fixture exists for.
    teams: [{ key: "front", name: "The Resistance", accent: "#9aa7b4" }],
    pitch:
      "Buy and hold any listed domain, from $5. Holding earns Points every day. $1,000 is split across the domains: each one is worth a slice and pays its holders whatever percent it reaches, so a domain that bonds pays its slice in full and one that stalls at 60% pays 60% of it. The domain you back is the domain that pays you.",
    phrase: "The Uprising has begun.",
    emoji: { points: "📡", currency: "🔩", flash: "⚔️" },
  },
  // scripts/s6-preflight.mjs BANNED list (the hardcoded S5 vocabulary gate)
  bannedVocab: ["Iron Siege", "stronghold", "Stronghold", "commanders", "Commanders", "Medals"],
  artRoot: "/s6-art",
  worldArtRoot: "/s5-art/world", // app/s6/front/scene.ts:84 FORT_ART
  gameKeys: ["ironjaw", "strain", "stopclock", "riot"],
  // lib/s6/tanks.ts TANK_ROSTER - the 20 mechs (the trailing commander keys
  // wrench..bigmike in that array are the pilot register, not the roster)
  rosterKeys: [
    "scout", "hornet", "recon", "hound", "badger", "sentry", "viper", "howler",
    "lancer", "spectre", "ram", "champion", "brawler", "mortar", "anvil",
    "bulwark", "juggernaut", "atlas", "colossus", "paladin",
  ],
};

export default S6_FIXTURE;
