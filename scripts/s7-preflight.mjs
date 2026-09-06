#!/usr/bin/env node
/**
 * S7 REALMFALL PREFLIGHT - the launch gate, run before arming the season.
 * Evolves scripts/s6-preflight.mjs with the lessons that became law this week
 * (ADR-0129 kit carve, ADR-0134):
 *
 *   node scripts/s7-preflight.mjs                              # files + registry + vocab + money + dates + DB
 *   node scripts/s7-preflight.mjs --base http://localhost:3000 # + live routes
 *
 * Read-only everywhere. Exit 0 = all gates green, 1 = something drifted.
 * DB creds from .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY);
 * DB gates soft-skip when the 049 migration has not run yet.
 *
 * WHAT CHANGED SINCE THE S6 GATE, AND WHY:
 *  - BANNED VOCAB IS DERIVED, NOT HARDCODED (the panel law): the list is
 *    parsed out of src/seasons/s7/season.config.ts bannedVocab PLUS the S6
 *    fixture's own theme tokens, so a config edit updates the gate for free.
 *  - THE PATH LAW: quoted strings that start with "/" are masked before the
 *    vocab scan - "/s7-art/pilot/hero.png" is a filesystem fact, not copy.
 *  - ECONOMY AGREEMENT: bot ECONOMY vs web games.ts vs season config, three
 *    surfaces, one set of numbers, FAIL on any drift.
 *  - DATES: config window vs SQL 050 handover vs strings.ts seasonEnd - the
 *    exact inherited-date bug strings.ts's own comment documents.
 *  - NO MACHINE PATHS: the sibling repo (doma-reporter) is located RELATIVE
 *    to this repo (../trading-bot/doma-reporter) and every gate that needs it
 *    soft-skips with a warning when it is absent. The S6 gate's hardcoded C:/
 *    path was flagged as a defect; do not bring it back.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// The sibling bot repo, RELATIVE (never a machine-specific absolute path).
const BOT_ROOT = path.resolve(ROOT, "..", "trading-bot", "doma-reporter");
const BOT_PRESENT = existsSync(BOT_ROOT);
const baseArg = process.argv.indexOf("--base");
const BASE = baseArg > -1 ? process.argv[baseArg + 1] : null;

let pass = 0;
let fail = 0;
let warned = 0;
const ok = (name) => {
  pass++;
  console.log(`  ok   ${name}`);
};
const bad = (name, why) => {
  fail++;
  console.log(`  FAIL ${name}${why ? ` - ${why}` : ""}`);
};
const skip = (name, why) => console.log(`  skip ${name} - ${why}`);
const warn = (name, why) => {
  warned++;
  console.log(`  WARN ${name}${why ? ` - ${why}` : ""}`);
};

function env() {
  const p = path.join(ROOT, ".env.local");
  const out = {};
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const num = (s) => Number(String(s).replace(/_/g, ""));

// ── The config file is the vocabulary/window/roster authority. Parsed as
// TEXT (no TS runtime in an .mjs gate); every regex targets the literal shape
// the file actually has today, and a parse miss is a FAIL, never a guess. ────
const S7_CONFIG_PATH = "src/seasons/s7/season.config.ts";
const S6_CONFIG_PATH = "src/seasons/s6/season.config.ts";
const s7cfg = read(S7_CONFIG_PATH);
const s6cfg = existsSync(path.join(ROOT, S6_CONFIG_PATH)) ? read(S6_CONFIG_PATH) : "";

const strList = (block) => [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const arrayOf = (src, key) => {
  const m = src.match(new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`));
  return m ? strList(m[1]) : null;
};
const GAME_KEYS = arrayOf(s7cfg, "gameKeys") || [];
const ROSTER_KEYS = arrayOf(s7cfg, "rosterKeys") || [];
const WINDOW = {
  launchAt: (s7cfg.match(/launchAt:\s*"([^"]+)"/) || [])[1] || null,
  endAt: (s7cfg.match(/endAt:\s*"([^"]+)"/) || [])[1] || null,
};

// ── GATE 1: files on disk ────────────────────────────────────────────────
console.log("\nGATE 1 - files");
const MUST_EXIST = [
  S7_CONFIG_PATH,
  S6_CONFIG_PATH, // the shadow fixture: the derived vocab gate reads it
  "src/lib/s7/games.ts",
  "src/lib/s7/classes.ts",
  "src/lib/s7/strings.ts",
  "src/lib/s7/data.ts",
  "src/app/s7/page.tsx",
  "src/app/s7/games/_shared/rules/core.ts",
  ...["gauntlet", "horde", "crypt"].flatMap((g) => [
    `src/app/s7/games/${g}/sim.ts`,
    `src/app/s7/games/${g}/tape.ts`,
    `src/app/s7/games/${g}/shell.tsx`,
    `src/app/s7/games/${g}/page.tsx`,
  ]),
  "scripts/s7-harness.ts",
  "public/s7-art/crypt/walls/meta.json",
];
for (const f of MUST_EXIST) {
  existsSync(path.join(ROOT, f)) ? ok(f) : bad(f, "missing");
}
// Art directories that must exist AND hold real files (underscore-prefixed
// _raw/_contact scratch does not count as coverage).
const nonEmptyDir = (rel) => {
  const p = path.join(ROOT, rel);
  if (!existsSync(p) || !statSync(p).isDirectory()) return false;
  return readdirSync(p).some((f) => !f.startsWith("_"));
};
for (const d of [
  "public/s7-art/class/hero",
  "public/s7-art/class/stage",
  "public/s7-art/class/anim",
  "public/s7-art/legion/front",
  "public/s7-art/legion/side",
]) {
  nonEmptyDir(d) ? ok(`${d}/ non-empty`) : bad(d, "missing or empty");
}
// SQL staged in the SIBLING repo (located relatively; see header).
if (!BOT_PRESENT) {
  skip("sql staged", `sibling repo absent (${path.relative(ROOT, BOT_ROOT)}) - clone doma-reporter beside this repo`);
} else {
  for (const f of [
    // 049 = the S7 schema + config seeds (s7_enabled/s7_launched born false)
    "sql/launch_wars_049_s7_init.sql",
    // 050 = the zero-gap handover switches (kill S6 14:00Z, arm window 16:00Z)
    "sql/launch_wars_050_s6_s7_handover.sql",
    // the theme row overlaying the code default (kit section-7 rule)
    "sql/s7_theme_realmfall.sql",
  ]) {
    existsSync(path.join(BOT_ROOT, f)) ? ok(`doma-reporter/${f}`) : bad(`doma-reporter/${f}`, "missing");
  }
}

// ── GATE 2: registry sanity (keys derived from the config, not retyped) ──
console.log("\nGATE 2 - game registry");
const gamesSrc = read("src/lib/s7/games.ts");
if (!GAME_KEYS.length) bad("config gameKeys", `could not parse from ${S7_CONFIG_PATH}`);
for (const key of GAME_KEYS) {
  const m = gamesSrc.match(new RegExp(`key: "${key}"[^}]+`));
  if (!m) {
    bad(`registry ${key}`, "not found in GAMES");
    continue;
  }
  const row = m[0];
  const missing = ["maxScore", "ratePerSec", "burst", "floorMs", "fastWinScore", "attempts"].filter(
    (f) => !new RegExp(`${f}:\\s*[\\d_]+`).test(row),
  );
  if (missing.length) {
    bad(`registry ${key}`, `fields missing: ${missing.join(", ")}`);
    continue;
  }
  const floorMs = num((row.match(/floorMs:\s*([\d_]+)/) || [])[1]);
  if (!(floorMs > 0)) {
    bad(`registry ${key}`, `floorMs must be > 0 (got ${floorMs})`);
    continue;
  }
  if (/comingSoon:\s*true/.test(row)) warn(`registry ${key}`, "still comingSoon (run-start rejects it)");
  else ok(`registry ${key} live + enveloped`);
  // The baseline tape must be a real recording, not the scaffold.
  const tapePath = `src/app/s7/games/${key}/tape.ts`;
  if (!existsSync(path.join(ROOT, tapePath))) {
    bad(`tape ${key}`, "tape.ts missing");
  } else {
    const tape = read(tapePath);
    const base = tape.match(/export const BASELINE[\s\S]{0,2000}/);
    base && /recorded:\s*true/.test(base[0])
      ? ok(`tape ${key} BASELINE.recorded`)
      : bad(`tape ${key}`, "BASELINE.recorded !== true (scaffold tape)");
  }
}

// ── GATE 3: banned vocabulary, DERIVED (the panel law) ───────────────────
// Two lists, zero retyping:
//  a. the S7 config's own bannedVocab array (the season declares its poison),
//  b. the S6 fixture's theme tokens (last season's nouns, derived so a fixture
//     edit updates this gate automatically).
// THE PATH LAW: quoted strings starting with "/" are masked first - art and
// route paths legitimately carry old nouns ("/s7-art/pilot/...") and a path is
// not player copy. Masking preserves length so file:line stays true.
console.log("\nGATE 3 - banned vocabulary (derived)");
{
  const banned = new Set(arrayOf(s7cfg, "bannedVocab") || []);
  if (!banned.size) bad("config bannedVocab", `could not parse from ${S7_CONFIG_PATH}`);

  // Derive last season's nouns from the S6 fixture theme. team.* is EXCLUDED
  // on purpose: S6's team noun is "column", a CSS/layout keyword that appears
  // in every flexbox style and grid draw loop; the S7 bannedVocab list covers
  // the team identity as the phrase "Iron Column" instead.
  const derived = new Set();
  const addWord = (w) => {
    if (!w) return;
    derived.add(w);
    derived.add(w[0].toUpperCase() + w.slice(1)); // sentence-start variant
  };
  if (s6cfg) {
    for (const k of ["target", "player"]) {
      const m = s6cfg.match(new RegExp(`${k}:\\s*\\{\\s*singular:\\s*"([^"]+)",\\s*plural:\\s*"([^"]+)"`));
      if (m) {
        addWord(m[1]);
        addWord(m[2]);
      }
    }
    for (const k of ["points", "playCurrency", "bondedWord", "title"]) {
      const m = s6cfg.match(new RegExp(`${k}:\\s*"([^"]+)"`));
      if (m) addWord(m[1]);
    }
    const sw = s6cfg.match(/statusWord:\s*\{([^}]*)\}/);
    if (sw) for (const w of strList(sw[1])) addWord(w);
  } else {
    warn("derived vocab", `${S6_CONFIG_PATH} missing - only the declared bannedVocab is enforced`);
  }
  for (const w of banned) derived.delete(w); // report each word under one list

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const mkRe = (words) =>
    words.length ? new RegExp(`\\b(${[...words].map(esc).join("|")})\\b`, "g") : null;
  const reBanned = mkRe([...banned]);
  const reDerived = mkRe([...derived]);

  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ["src/app/s7", "src/lib/s7"]) {
    const p = path.join(ROOT, d);
    if (existsSync(p)) walk(p);
  }

  const maskPaths = (line) => line.replace(/(["'`])\/[^"'`\n]*?\1/g, (m) => " ".repeat(m.length));
  const scan = (re, label) => {
    if (!re) return;
    const hits = [];
    for (const f of files) {
      const lines = readFileSync(f, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const masked = maskPaths(lines[i]);
        re.lastIndex = 0;
        let m;
        const found = new Set();
        while ((m = re.exec(masked))) found.add(m[1]);
        for (const w of found) hits.push(`${path.relative(ROOT, f)}:${i + 1} "${w}"`);
      }
    }
    if (hits.length) {
      bad(label, `${hits.length} hit(s)`);
      for (const h of hits.slice(0, 20)) console.log(`         ${h}`);
      if (hits.length > 20) console.log(`         ... and ${hits.length - 20} more`);
    } else ok(label);
  };
  scan(reBanned, `no declared bannedVocab in s7 surfaces (${banned.size} words)`);
  scan(reDerived, `no derived S6 theme tokens in s7 surfaces (${derived.size} words)`);

  // 3c. STALE SEASON NUMBERS IN PLAYER STRINGS. Found live 2026-08-25: the
  // OpenGraph alt text said "Launch Wars Season 5: Realmfall" and the empty
  // state said "Season 5 is being prepared" - inherited S5 -> S6 -> S7 through
  // two copies because a season NUMBER is not theme vocabulary, so no vocab
  // gate could ever see it. Every share of the season URL carried it.
  // Only STRING LITERALS count (comments carry old-season history by design).
  {
    const reSeason = /\bSeason\s+([1-6])\b/g;
    const hits = [];
    for (const f of files) {
      const lines = readFileSync(f, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*(\*|\/\/)/.test(line)) continue; // comment line
        // The trophy shelf names past seasons ON PURPOSE (it displays what a
        // player earned in them), so trophy* keys are exempt by design.
        if (/\btrophy/i.test(line)) continue;
        for (const m of line.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
          reSeason.lastIndex = 0;
          const hit = reSeason.exec(m[2]);
          // "Back from Season 6?" style veteran callbacks are legitimate: they
          // name the PREVIOUS season deliberately. Only 1..(current-2) is stale.
          if (hit && Number(hit[1]) <= 5) {
            hits.push(`${path.relative(ROOT, f)}:${i + 1} "${hit[0]}"`);
          }
        }
      }
    }
    if (hits.length) {
      bad("no stale season numbers in s7 strings", `${hits.length} hit(s)`);
      for (const h of hits.slice(0, 20)) console.log(`         ${h}`);
    } else ok("no stale season numbers in s7 strings (Season 1-5)");
  }

  // COPY-ONLY EXTENDED LIST (2026-08-31 audit). These words are legitimate as
  // identifiers, props and filenames but poison as PLAYER COPY, so they scan
  // ONLY inside quoted string literals (paths masked first), case-insensitive
  // with word boundaries. WARN, not FAIL: the deferred dead S5 arcade dict and
  // WWII tankBlurbs (delete after season end) legitimately carry dozens of
  // hits until then - this line is the pressure gauge that keeps them visible.
  {
    const COPY_ONLY =
      /\b(liberation|liberate|liberated|uprising|garage|camo|decal|decals|tank|tanks|hull|sortie|gunner|gunners|mainframe|hangar)\b/gi;
    const hits = [];
    for (const f of files) {
      const lines = readFileSync(f, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*(\*|\/\/)/.test(lines[i])) continue;
        const masked = maskPaths(lines[i]);
        for (const m of masked.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
          COPY_ONLY.lastIndex = 0;
          const hit = COPY_ONLY.exec(m[2]);
          if (hit) hits.push(`${path.relative(ROOT, f)}:${i + 1} "${hit[0]}"`);
        }
      }
    }
    hits.length
      ? warn("copy-only vocab", `${hits.length} string-literal hit(s) of retired nouns (dead-dict hits expected until the Sep 17 deletion)`)
      : ok("copy-only vocab clean (liberation/garage/camo/tank/... in string literals)");
    for (const h of hits.slice(0, 12)) console.log(`         ${h}`);
    if (hits.length > 12) console.log(`         ... and ${hits.length - 12} more`);
  }

  // "column"/"Column" as PLAYER COPY (2026-08-31 audit: theme.ts still said
  // team "column" and it rendered on /s7/link). CSS uses the word in every
  // flex style, so this scan is scoped HARD: only the copy-owning libs, only
  // string values, and FAIL because zero legitimate uses exist there.
  {
    const COPY_LIBS = ["src/lib/s7/strings.ts", "src/lib/s7/theme.ts", "src/lib/s7/help.ts", "src/lib/s7/hq.ts", "src/lib/s7/raid.ts"];
    const hits = [];
    for (const rel of COPY_LIBS) {
      if (!existsSync(path.join(ROOT, rel))) continue;
      const lines = read(rel).split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*(\*|\/\/)/.test(lines[i])) continue;
        for (const m of lines[i].matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
          if (/\bcolumns?\b/i.test(m[2])) hits.push(`${rel}:${i + 1}`);
        }
      }
    }
    hits.length
      ? bad("no 'column' in copy libs", `${hits.length} hit(s): ${hits.slice(0, 6).join(", ")}`)
      : ok("no 'column' in copy libs (strings/theme/help/hq/raid)");
  }
}

// ── GATE 4: economy agreement (bot vs web vs config, one set of numbers) ─
console.log("\nGATE 4 - economy agreement");
{
  const webPool = num((gamesSrc.match(/POOL_FULL_USD\s*=\s*([\d_]+)/) || [])[1]);
  const webMin = num((gamesSrc.match(/SLICE_MIN_USD\s*=\s*([\d_]+)/) || [])[1]);
  const webMax = num((gamesSrc.match(/SLICE_MAX_USD\s*=\s*([\d_]+)/) || [])[1]);
  const cfgPool = num((s7cfg.match(/poolFullUsd:\s*([\d_]+)/) || [])[1]);
  const cfgMin = num((s7cfg.match(/sliceMinUsd:\s*([\d_]+)/) || [])[1]);
  const cfgMax = num((s7cfg.match(/sliceMaxUsd:\s*([\d_]+)/) || [])[1]);
  [webPool, webMin, webMax].every(Number.isFinite)
    ? ok(`web games.ts money parsed (${webPool}/${webMin}/${webMax})`)
    : bad("web games.ts money", "POOL_FULL_USD / SLICE_MIN_USD / SLICE_MAX_USD not all parseable");
  const agree = (a, b, what) => (a === b ? ok(what) : bad(what, `${a} != ${b}`));
  agree(cfgPool, webPool, `config poolFullUsd == web POOL_FULL_USD ($${webPool})`);
  agree(cfgMin, webMin, `config sliceMinUsd == web SLICE_MIN_USD ($${webMin})`);
  agree(cfgMax, webMax, `config sliceMaxUsd == web SLICE_MAX_USD ($${webMax})`);

  const botModule = path.join(BOT_ROOT, "modules", "season7", "index.js");
  if (!BOT_PRESENT || !existsSync(botModule)) {
    skip("bot economy mirror", BOT_PRESENT ? "modules/season7/index.js missing" : "sibling repo absent - the bot mirror is UNVERIFIED, do not arm on this run alone");
  } else {
    const bot = readFileSync(botModule, "utf8");
    const botPool = num((bot.match(/PRIZE_POOL_USD:\s*([\d_]+)/) || [])[1]);
    const botMin = num((bot.match(/SLICE_MIN_USD:\s*([\d_]+)/) || [])[1]);
    const botMax = num((bot.match(/SLICE_MAX_USD:\s*([\d_]+)/) || [])[1]);
    agree(botPool, webPool, `bot PRIZE_POOL_USD == web POOL_FULL_USD ($${webPool})`);
    agree(botMin, webMin, `bot SLICE_MIN_USD == web SLICE_MIN_USD ($${webMin})`);
    agree(botMax, webMax, `bot SLICE_MAX_USD == web SLICE_MAX_USD ($${webMax})`);
  }
}

// ── GATE 5: dates (config window vs SQL 050 vs strings.ts) ───────────────
// strings.ts's own comment records the failure mode: S6 launched telling
// players they would be paid on the day the season STARTED, because the
// seasonEnd label was inherited from the previous season's port. This gate
// makes that a red light instead of a comment.
console.log("\nGATE 5 - dates");
{
  WINDOW.launchAt && WINDOW.endAt
    ? ok(`config window ${WINDOW.launchAt} -> ${WINDOW.endAt}`)
    : bad("config window", `could not parse launchAt/endAt from ${S7_CONFIG_PATH}`);

  // The WINDOW's SQL of record moved from 050 to 052 on 2026-08-31: the
  // launch slipped past the zero-gap date, 050's window is history, and 052
  // is the re-arm file Mike runs when the slate lands. s6_kill_at still
  // lives in (and is checked against) 050.
  const sql050 = path.join(BOT_ROOT, "sql", "launch_wars_050_s6_s7_handover.sql");
  const sql052 = path.join(BOT_ROOT, "sql", "launch_wars_052_s7_delayed_window.sql");
  if (!BOT_PRESENT || !existsSync(sql052)) {
    skip("sql 052 window", "delayed-window SQL not reachable (sibling repo absent)");
  } else {
    const sql = readFileSync(sql052, "utf8");
    const season = sql.match(/'s7_season',\s*'(\{[^']+\})'/);
    let sqlWin = null;
    try {
      sqlWin = season ? JSON.parse(season[1]) : null;
    } catch {
      /* fall through to the FAIL below */
    }
    if (!sqlWin) bad("sql 052 s7_season", "could not parse the seeded JSON");
    else {
      sqlWin.launchAt === WINDOW.launchAt
        ? ok(`sql 052 launchAt == config (${WINDOW.launchAt})`)
        : bad("sql 052 launchAt", `${sqlWin.launchAt} != config ${WINDOW.launchAt}`);
      sqlWin.endAt === WINDOW.endAt
        ? ok(`sql 052 endAt == config (${WINDOW.endAt})`)
        : bad("sql 052 endAt", `${sqlWin.endAt} != config ${WINDOW.endAt}`);
    }
  }
  if (BOT_PRESENT && existsSync(sql050)) {
    /'s6_kill_at',\s*'[^']+'/.test(readFileSync(sql050, "utf8"))
      ? ok("sql 050 seeds s6_kill_at")
      : bad("sql 050 s6_kill_at", "seed missing (S6 would keep posting into S7)");
  }

  // strings.ts date literals. Scan QUOTED STRINGS only (comments narrate
  // history and may legally name old dates); expected renderings per locale
  // are derived from the config window, never retyped.
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmt = (iso) => {
    const d = new Date(iso);
    return {
      en: `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`,
      ko: `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`,
      zh: `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`,
    };
  };
  if (WINDOW.launchAt && WINDOW.endAt) {
    const endF = fmt(WINDOW.endAt);
    const launchF = fmt(WINDOW.launchAt);
    const windowDates = new Set([...Object.values(endF), ...Object.values(launchF)]);
    const endDates = new Set(Object.values(endF));
    const stringsSrc = read("src/lib/s7/strings.ts");
    const lines = stringsSrc.split(/\r?\n/);

    // (a) the seasonEnd label(s) must be the END date in some locale
    let seasonEnds = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/seasonEnd:\s*"([^"]+)"/);
      if (!m) continue;
      seasonEnds++;
      endDates.has(m[1])
        ? ok(`strings seasonEnd "${m[1]}" (line ${i + 1})`)
        : bad(`strings seasonEnd (line ${i + 1})`, `"${m[1]}" != season end ${[...endDates].join(" / ")}`);
    }
    if (!seasonEnds) warn("strings seasonEnd", "no seasonEnd key found in strings.ts");

    // (b) every other date literal inside a string must be a window date
    const dateRe = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b|\d{1,2}월 \d{1,2}일|\d{1,2}月\d{1,2}日/g;
    const stray = [];
    for (let i = 0; i < lines.length; i++) {
      if (/seasonEnd:/.test(lines[i])) continue; // checked above
      if (/^\s*(\/\/|\/?\*)/.test(lines[i])) continue; // comments narrate history, legally naming old dates
      for (const lit of lines[i].match(/"[^"]*"|'[^']*'|`[^`]*`/g) || []) {
        for (const d of lit.slice(1, -1).match(dateRe) || []) {
          if (!windowDates.has(d)) stray.push(`line ${i + 1} "${d}"`);
        }
      }
    }
    stray.length
      ? bad("strings date literals", `outside the season window: ${stray.slice(0, 8).join(", ")}${stray.length > 8 ? ` +${stray.length - 8}` : ""}`)
      : ok("strings date literals all inside the season window");
  } else {
    skip("strings dates", "config window unparsed");
  }
}

// ── GATE 6: DB config (soft-skip pre-migration) ──────────────────────────
console.log("\nGATE 6 - database config");
const E = env();
let db = null;
if (!E.NEXT_PUBLIC_SUPABASE_URL || !E.SUPABASE_SERVICE_ROLE_KEY) {
  skip("db gates", "no creds in .env.local");
} else {
  db = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const KEYS = ["s7_enabled", "s7_launched", "s7_theme", "s7_season", "s6_kill_at", "s6_theme"];
    const { data: cfg, error } = await db.from("launch_wars_boss_config").select("key, value").in("key", KEYS);
    if (error) throw error;
    const byKey = new Map((cfg || []).map((r) => [r.key, r.value]));

    // s7_enabled: reported, not judged - arming it is deliberately the LAST
    // manual step, so both values are legitimate states for this gate.
    byKey.has("s7_enabled")
      ? ok(`config s7_enabled = ${byKey.get("s7_enabled")}`)
      : bad("config s7_enabled", "row missing (run 049)");

    // s7_launched must still be false before arming: the one-shot auto-launch
    // guard already spent means the bot thinks the season already announced.
    if (!byKey.has("s7_launched")) bad("config s7_launched", "row missing (run 049)");
    else if (byKey.get("s7_launched") === "false") ok("config s7_launched = false (auto-launch still armed)");
    else bad("config s7_launched", `= ${byKey.get("s7_launched")} - the one-shot launch guard is already spent`);

    // s7_theme: valid JSON whose KEY SET matches s6_theme's exactly (the kit
    // section-7 rule: the module reads these keys; a missing one falls back to
    // a code default silently and a stray one is a shadow token).
    if (!byKey.has("s7_theme")) bad("config s7_theme", "row missing (run s7_theme_realmfall.sql)");
    else {
      let theme = null;
      try {
        theme = JSON.parse(byKey.get("s7_theme"));
      } catch {
        bad("config s7_theme", "not valid JSON");
      }
      if (theme) {
        if (!byKey.has("s6_theme")) {
          warn("config s7_theme keys", `parses (${Object.keys(theme).length} keys) but s6_theme row is absent to compare against`);
        } else {
          try {
            const s6keys = new Set(Object.keys(JSON.parse(byKey.get("s6_theme"))));
            const s7keys = new Set(Object.keys(theme));
            const missing = [...s6keys].filter((k) => !s7keys.has(k));
            const extra = [...s7keys].filter((k) => !s6keys.has(k));
            !missing.length && !extra.length
              ? ok(`config s7_theme parses, key set matches s6_theme (${s7keys.size} keys)`)
              : bad("config s7_theme keys", `${missing.length ? `missing: ${missing.join(", ")}` : ""}${missing.length && extra.length ? "; " : ""}${extra.length ? `extra: ${extra.join(", ")}` : ""}`);
          } catch {
            warn("config s7_theme keys", "s6_theme is not valid JSON; key-set comparison skipped");
          }
        }
      }
    }

    // s7_season: endAt must equal the config file's. launchAt has TWO valid
    // states since the 2026-08-31 delay: ABSENT = deliberately disarmed (the
    // safe pre-launch posture - auto-launch cannot fire; arm via SQL 052
    // when the slate lands), or PRESENT and equal to the code window. A
    // present-but-different launchAt is the stale-date trap that nearly
    // launched S7 on Aug 31 with a placeholder slate.
    if (!byKey.has("s7_season")) bad("config s7_season", "row missing (run 050)");
    else {
      try {
        const w = JSON.parse(byKey.get("s7_season"));
        if (w.endAt !== WINDOW.endAt) {
          bad("config s7_season endAt", `db ${w.endAt} != code ${WINDOW.endAt}`);
        } else if (!w.launchAt) {
          ok(`config s7_season DISARMED (endAt ${w.endAt}; arm via SQL 052 when the slate lands)`);
        } else if (w.launchAt === WINDOW.launchAt) {
          ok(`config s7_season ARMED and matches the code window`);
        } else {
          bad("config s7_season launchAt", `db ${w.launchAt} != code ${WINDOW.launchAt} (stale-date trap)`);
        }
      } catch {
        bad("config s7_season", "not valid JSON");
      }
    }

    byKey.has("s6_kill_at")
      ? ok(`config s6_kill_at = ${byKey.get("s6_kill_at")}`)
      : bad("config s6_kill_at", "row missing (run 050 - S6 would keep posting into S7)");
  } catch (e) {
    skip("db config gates", `049 not run yet? (${String(e.message || e).slice(0, 80)})`);
  }
}

// ── GATE 7: targets ──────────────────────────────────────────────────────
console.log("\nGATE 7 - targets");
if (!db) skip("targets", "no creds in .env.local");
else {
  try {
    const { data: targets, error: tErr } = await db
      .from("launch_wars_s7_targets")
      .select("domain, sort_order, status, is_test")
      .eq("season_key", "s7");
    if (tErr) throw tErr;
    const rows = targets || [];
    if (!rows.length) warn("targets", "0 rows - slate not seeded yet (seed before arming)");
    else {
      const orders = rows.map((r) => r.sort_order);
      new Set(orders).size === orders.length
        ? ok(`targets seeded x${rows.length}, sort_order unique`)
        : bad("targets", "duplicate sort_order (breaks the ladder ordering)");
      const real = rows.filter((r) => !r.is_test).length;
      console.log(`       (${real} real, ${rows.length - real} placeholder)`);
    }
  } catch (e) {
    skip("targets", `049 not run yet? (${String(e.message || e).slice(0, 80)})`);
  }
}

// ── GATE 8: INTERNAL LINKS RESOLVE (ported whole from the S6 gate) ───────
// Born 2026-08-15: S6 shipped thirteen /s6/map links with no route behind
// them and no gate noticed, because every gate checked data and files, never
// navigation. Same walk here: every internal /s7 href must serve a page.
console.log("\nGATE 8 - internal links");
{
  const SRC = path.join(ROOT, "src");
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|mjs)$/.test(e.name)) files.push(p);
    }
  };
  walk(SRC);

  // a route exists when app/<segments>/page.tsx does, allowing one [dynamic]
  const routeExists = (url) => {
    const segs = url.split("/").filter(Boolean);
    let dir = path.join(SRC, "app");
    for (const seg of segs) {
      const exact = path.join(dir, seg);
      if (existsSync(exact)) {
        dir = exact;
        continue;
      }
      const dyn = existsSync(dir)
        ? readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory() && /^\[.+\]$/.test(e.name))
        : null;
      if (!dyn) return false;
      dir = path.join(dir, dyn.name);
    }
    return existsSync(path.join(dir, "page.tsx"));
  };

  const seen = new Map(); // url -> first file that links it
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:href|push)\(?[=:]?\s*["'`](\/s7(?:\/[a-z0-9-]+)*)(?:[#?][^"'`]*)?["'`]/gi)) {
      if (!seen.has(m[1])) seen.set(m[1], path.relative(ROOT, f));
    }
  }
  let dead = 0;
  for (const [url, where] of [...seen].sort()) {
    if (url === "/s7") continue; // the season root always exists
    if (!routeExists(url)) {
      bad(`dead link ${url}`, `linked from ${where}`);
      dead++;
    }
  }
  if (dead === 0) ok(`${seen.size} internal /s7 link targets all resolve`);
}

// ── GATE 9: art coverage (roster + bestiary derived from code, not retyped) ─
console.log("\nGATE 9 - art coverage");
{
  const STAGES = ["novice", "veteran", "champion", "mythic"];
  if (!ROSTER_KEYS.length) bad("config rosterKeys", `could not parse from ${S7_CONFIG_PATH}`);
  for (const cls of ROSTER_KEYS) {
    const missing = [
      `public/s7-art/class/hero/${cls}.png`,
      `public/s7-art/class/anim/${cls}.mp4`,
      ...STAGES.map((s) => `public/s7-art/class/stage/${cls}-${s}.png`),
    ].filter((f) => !existsSync(path.join(ROOT, f)));
    missing.length
      ? bad(`class art ${cls}`, `missing: ${missing.map((f) => path.basename(f)).join(", ")}`)
      : ok(`class art ${cls} (hero + anim + ${STAGES.length} stages)`);
  }
  // Bestiary ids come from the statblock table the sims actually fight.
  const core = read("src/app/s7/games/_shared/rules/core.ts");
  const block = core.match(/BESTIARY[\s\S]*?\]\s*as const/);
  const ids = block ? [...block[0].matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]) : [];
  if (!ids.length) bad("bestiary", "could not parse BESTIARY ids from rules/core.ts");
  else {
    const missing = ids.flatMap((id) =>
      ["front", "side"]
        .map((v) => `public/s7-art/legion/${v}/${id}.png`)
        .filter((f) => !existsSync(path.join(ROOT, f))),
    );
    missing.length
      ? bad("legion art", `missing: ${missing.map((f) => f.replace("public/s7-art/legion/", "")).join(", ")}`)
      : ok(`legion art complete (${ids.length} creatures x front+side)`);
  }
}

// ── GATE 9b: EVERY referenced art path resolves on disk ──────────────────
// Written after two rewrite bugs that no grep could see (2026-08-26):
//   - the mech->hero vocabulary pass renamed a set-dressing KEY but not its
//     asset FILE, so that prop silently vanished from the map;
//   - three how-to-play bands kept S6 GAME KEYS inside an s7-art path, so
//     they 404ed on the onboarding page.
// A grep proves the string changed. Only a resolve proves the file is there.
console.log("\nGATE 9b - referenced art resolves");
{
  const artRe = /["'`](\/s[4-7]-art\/[A-Za-z0-9_.\/-]+\.(?:png|webp|jpg|jpeg|mp4|json))["'`]/g;
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(rel);
    }
  };
  try {
    walk("src/app/s7");
    walk("src/lib/s7");
  } catch (e) {
    bad("art scan", String(e.message || e).slice(0, 60));
  }
  const refs = new Map(); // url -> first file that asks for it
  for (const f of files) {
    const t = read(f);
    for (const m of t.matchAll(artRe)) if (!refs.has(m[1])) refs.set(m[1], f);
  }
  const dead = [...refs].filter(([u]) => !existsSync(path.join(ROOT, "public", u.replace(/^\//, ""))));
  dead.length
    ? dead.forEach(([u, f]) => bad("art 404", `${u} (referenced by ${f})`))
    : ok(`every literal art path resolves (${refs.size} referenced)`);

  // LOOSE SHAPES (2026-08-31 audit): every real 404 the quoted-literal regex
  // missed was one of: url(/s7-art/...) inside a CSS template literal,
  // `${base}/s7-art/...` interpolation, an extensionless DIRECTORY constant
  // ("/s7-art/world"), or a dynamic-family prefix ("/s7-art/pilot/anim/").
  // Unanchored match; a path with an extension must exist as a FILE, a bare
  // dir must exist as a DIRECTORY, a trailing "-"/"/" prefix has its parent
  // directory checked (the family's members are covered by their own gates).
  {
    const looseRe = /\/s[4-7]-art\/[A-Za-z0-9_./-]+/g;
    const seen = new Set(refs.keys());
    const looseDead = [];
    for (const f of files) {
      const t = read(f);
      for (const m of t.matchAll(looseRe)) {
        const u = m[0].replace(/[.,;]+$/, "");
        if (seen.has(u)) continue;
        seen.add(u);
        const pub = (x) => path.join(ROOT, "public", x.replace(/^\//, ""));
        let okDisk;
        if (u.endsWith("-") || u.endsWith("/")) {
          okDisk = existsSync(path.dirname(pub(u + "x")));
        } else if (/\.[a-z0-9]{2,5}$/i.test(u)) {
          okDisk = existsSync(pub(u));
        } else {
          okDisk = existsSync(pub(u)); // directory constant
        }
        if (!okDisk) looseDead.push(`${u} (${f})`);
      }
    }
    looseDead.length
      ? looseDead.forEach((d) => bad("art 404 (loose shape)", d))
      : ok(`loose art shapes resolve (url()/template/dir, ${seen.size - refs.size} extra checked)`);
  }

  // Dynamic families the regex cannot see, resolved from the code's own data.
  const gameKeys = GAME_KEYS.length ? GAME_KEYS : [];
  const cardMissing = gameKeys.filter(
    (g) => !existsSync(path.join(ROOT, `public/s7-art/games/${g}/card.webp`)),
  );
  cardMissing.length
    ? bad("arcade cards", `no card.webp for: ${cardMissing.join(", ")}`)
    : ok(`arcade cards present for all ${gameKeys.length} games`);

  // Set dressing: the S7 file wins, the S6 plate is the documented fallback,
  // so a key is only dead when NEITHER exists.
  const sd = read("src/app/s7/front/setdressing.ts");
  const setKeys = [...new Set([...sd.matchAll(/key: "([a-z0-9-]+)"/g)].map((m) => m[1]))];
  const setDead = setKeys.filter(
    (k) =>
      !existsSync(path.join(ROOT, `public/s7-art/front/set/${k}.png`)) &&
      !existsSync(path.join(ROOT, `public/s6-art/front/set/${k}.png`)),
  );
  const setS6 = setKeys.filter((k) => !existsSync(path.join(ROOT, `public/s7-art/front/set/${k}.png`)));
  if (setDead.length) bad("set dressing", `no art at all for: ${setDead.join(", ")}`);
  else if (setS6.length) warn("set dressing", `${setS6.length} key(s) still fall back to S6 art: ${setS6.join(", ")}`);
  else ok(`set dressing complete (${setKeys.length} keys, all S7-native)`);
}

// ── GATE 10: routes (only with --base) ───────────────────────────────────
console.log("\nGATE 10 - live routes");
if (!BASE) skip("routes", "pass --base http://localhost:3000");
else {
  for (const r of ["/s7", "/s7/play", "/s7/board", "/s7/hq", "/s7/rules", "/s7/how-to-play", "/api/s7/feed"]) {
    try {
      const res = await fetch(BASE + r, { redirect: "follow" });
      res.ok ? ok(`${r} ${res.status}`) : bad(r, `HTTP ${res.status}`);
    } catch (e) {
      bad(r, String(e.message || e).slice(0, 60));
    }
  }
}

console.log(
  `\n${fail === 0 ? "ALL GREEN" : `${fail} FAILED`}: ${pass} ok${warned ? `, ${warned} warned` : ""}${fail ? `, ${fail} failed` : ""}\n`,
);
process.exit(fail === 0 ? 0 : 1);
