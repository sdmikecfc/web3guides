/**
 * SEASON 7: REALMFALL (ADR-0129 kit tenant #1, ADR-0133 naming).
 * THE one file. If a value about S7 is not here or in the theme SQL row that
 * overlays this, it does not exist. Games/theme/art vary; the engine does not.
 */
import type { SeasonConfig } from "@/season/config";

export const S7: SeasonConfig = {
  key: "s7",
  name: "Launch Wars S7: Realmfall",
  title: "REALMFALL",
  host: "launchwars.xyz",
  basePath: "/s7",
  window: {
    // LAUNCH DELAYED (Mike, 2026-08-31): the domain slate slipped, so the
    // zero-gap Aug 31 handover became S6-ends-Monday, S7-opens-midweek.
    // Sep 2 is the PLAN; the live s7_season config row is the authority and
    // it is DISARMED (no launchAt) until the domains land - re-arming it is
    // the launch action, this line just records intent.
    launchAt: "2026-09-02T16:00:00Z",
    // Full two-week season preserved (Mike's call): end shifted Sep 14 -> 16.
    endAt: "2026-09-16T14:00:00Z",
  },
  money: {
    poolFullUsd: 1000, // ADR-0126 carries unchanged; bot mirror gated at preflight
    sliceMinUsd: 75,
    sliceMaxUsd: 150,
  },
  theme: {
    seasonName: "Launch Wars S7: Realmfall",
    target: { singular: "keep", plural: "keeps" },
    team: { singular: "guild", plural: "guilds" },
    player: { singular: "adventurer", plural: "adventurers" },
    points: "Valor",
    playCurrency: "Gold",
    bondedWord: "reclaimed",
    statusWord: { pending: "SIGHTED", live: "UNDER SIEGE", failed: "CURSED" },
    teams: [{ key: "front", name: "The Guild", accent: "#c9a227" }],
    pitch:
      "Buy and hold any listed domain, from $5. Holding earns Valor every day. $1,000 is split across the keeps: each one is worth a slice and pays its holders whatever percent it reaches, so a keep that is reclaimed pays its slice in full and one that stalls at 60% pays 60% of it. The keep you back is the keep that pays you.",
    phrase: "The realm remembers.",
    emoji: { points: "⚔️", currency: "🪙", flash: "🏰" },
  },
  // The previous season's nouns: the derived banned-vocab gate. An S7 surface
  // saying any of these words is a failed build, not a copy note.
  bannedVocab: [
    "Uprising", "mainframe", "Mainframe", "mainframes",
    "pilot", "Pilot", "pilots", "Pilots",
    "Signal", "Scrap", "liberated", "LIBERATED",
    "Iron Column", "MACHINE-HELD", "mech", "Mech",
  ],
  artRoot: "/s7-art",
  // The plate carried since S5; declared, no longer a buried cross-season read.
  worldArtRoot: "/s5-art/world",
  gameKeys: ["gauntlet", "horde", "crypt", "ascent"], // all four at launch (Mike, 2026-08-28)
  rosterKeys: ["barbarian", "monk", "ranger", "bard", "wizard", "cleric"],
};

export default S7;
