#!/usr/bin/env node
/**
 * S6 UPRISING PREFLIGHT - the drift gates (task #46), runnable any day:
 *
 *   node scripts/s6-preflight.mjs                    # DB + files + registry
 *   node scripts/s6-preflight.mjs --base http://localhost:3000   # + routes
 *
 * Read-only everywhere. Exit 0 = all gates green, 1 = something drifted.
 * DB creds from .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY);
 * DB gates soft-skip when the 041 migration has not run yet.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseArg = process.argv.indexOf("--base");
const BASE = baseArg > -1 ? process.argv[baseArg + 1] : null;

let pass = 0;
let fail = 0;
const ok = (name) => {
  pass++;
  console.log(`  ok   ${name}`);
};
const bad = (name, why) => {
  fail++;
  console.log(`  FAIL ${name}${why ? ` - ${why}` : ""}`);
};
const skip = (name, why) => console.log(`  skip ${name} - ${why}`);

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

// ── GATE 1: files on disk ────────────────────────────────────────────────
console.log("\nGATE 1 - files");
const MUST_EXIST = [
  "src/app/s6/page.tsx",
  "src/app/s6/front/sim.ts",
  "src/app/s6/front/scene.ts",
  "src/app/s6/front/Battlefield.tsx",
  "src/app/api/s6/feed/route.ts",
  "src/app/s6/board/page.tsx",
  "src/app/s6/hq/page.tsx",
  "src/app/s6/opengraph-image.tsx",
  "public/s6-art/games/ironjaw/card.webp",
  "public/s6-art/games/strain/card.webp",
  "public/s6-art/games/stopclock/card.webp",
  "public/s6-art/games/riot/card.webp",
  "public/s6-art/front/set/bld-riot.png",
  "public/s6-art/front/fx/explosion1.png",
  "public/s6-art/tank/bt7.webp", // placeholder roster present (hero-/-stock split keys resolve via tankArt)
];
for (const f of MUST_EXIST) {
  existsSync(path.join(ROOT, f)) ? ok(f) : bad(f, "missing");
}

// ── GATE 2: registry sanity (parse games.ts source - no TS runtime here) ──
console.log("\nGATE 2 - game registry");
const gamesSrc = readFileSync(path.join(ROOT, "src/lib/s6/games.ts"), "utf8");
for (const key of ["ironjaw", "strain", "stopclock", "riot"]) {
  const m = gamesSrc.match(new RegExp(`key: "${key}"[^}]+`));
  if (!m) {
    bad(`registry ${key}`, "not found");
    continue;
  }
  const row = m[0];
  if (/comingSoon: true/.test(row)) bad(`registry ${key}`, "still comingSoon");
  else if (!/ratePerSec: \d+/.test(row) || !/burst: \d+/.test(row)) bad(`registry ${key}`, "rate envelope missing");
  else ok(`registry ${key} live + enveloped`);
}

// ── GATE 3: vocabulary drift (S5 words in S6 player strings) ─────────────
console.log("\nGATE 3 - vocabulary");
const strings = readFileSync(path.join(ROOT, "src/lib/s6/strings.ts"), "utf8");
const BANNED = ["Iron Siege", "stronghold", "Stronghold", "commanders", "Commanders", "Medals"];
const hits = BANNED.filter((w) => strings.includes(w));
hits.length ? bad("strings vocabulary", `found: ${hits.join(", ")}`) : ok("strings carry no S5 vocabulary");

// ── GATE 4: SQL files staged for Mike ─────────────────────────────────────
console.log("\nGATE 4 - SQL staged");
const SQLBASE = "C:/Users/Mike/Desktop/trading-bot/doma-reporter/sql";
for (const f of [
  "launch_wars_041_s6_init.sql",
  "s6_theme_uprising.sql",
  "launch_wars_042_s6_seed.sql",
  // 043 corrected the bounty envelope to $300. SUPERSEDED by 044 the same
  // week: ADR-0126 deletes bounties entirely, so 043's "must sum to $300"
  // check is now false by design and must NOT be run after 044. 043 stays on
  // disk as the record of the decision it encoded.
  "launch_wars_043_s6_bounty_envelope.sql",
  // 044 zeroes bounty_usd on the slate and BREAKS if any survives - the bot
  // gates the breach payout on the COLUMN, not the zeroed constant, so this
  // file is what actually turns bounties off. Never forget it on deploy night.
  "launch_wars_044_s6_bounties_deleted.sql",
  // 045 replaces the ten is_test placeholders with the REAL slate (Mike's
  // launch calendar, 2026-08-17). Run after 044, before arming s6_enabled.
  "launch_wars_045_s6_real_slate.sql",
  // 046 = the live-trades table the map feed prints from
  "launch_wars_046_s6_trades.sql",
  // 047 = the S5->S6 handover switches (kill S5 14:00Z, quiet-launch S6 16:00Z)
  "launch_wars_047_s5_s6_handover.sql",
  // 048 = trades identity key (tx+domain+wallet) + the feed index
  "launch_wars_048_s6_trades_identity.sql",
]) {
  existsSync(path.join(SQLBASE, f)) ? ok(f) : bad(f, "missing");
}

// ── GATE 5: DB config + targets (soft-skip pre-migration) ────────────────
console.log("\nGATE 5 - database");
const E = env();
if (!E.NEXT_PUBLIC_SUPABASE_URL || !E.SUPABASE_SERVICE_ROLE_KEY) {
  skip("db gates", "no creds in .env.local");
} else {
  const db = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const { data: cfg, error } = await db
      .from("launch_wars_boss_config")
      .select("key, value")
      .in("key", ["s6_theme", "s6_season", "s6_enabled"]);
    if (error) throw error;
    const byKey = new Map((cfg || []).map((r) => [r.key, r.value]));
    for (const k of ["s6_theme", "s6_season", "s6_enabled"]) {
      if (!byKey.has(k)) {
        bad(`config ${k}`, "row missing (run the staged SQL)");
        continue;
      }
      if (k !== "s6_enabled") {
        try {
          JSON.parse(byKey.get(k));
          ok(`config ${k} parses`);
        } catch {
          bad(`config ${k}`, "not valid JSON");
        }
      } else ok(`config s6_enabled = ${byKey.get(k)}`);
    }
    const { data: targets, error: tErr } = await db
      .from("launch_wars_s6_targets")
      .select("domain, sort_order, status, is_test")
      .eq("season_key", "s6");
    if (tErr) throw tErr;
    const rows = targets || [];
    if (!rows.length) bad("targets", "none seeded");
    else {
      const orders = rows.map((r) => r.sort_order);
      new Set(orders).size === orders.length
        ? ok(`targets seeded x${rows.length}, sort_order unique`)
        : bad("targets", "duplicate sort_order (breaks the milestone ladder)");
      const real = rows.filter((r) => !r.is_test).length;
      console.log(`       (${real} real, ${rows.length - real} placeholder)`);
    }
  } catch (e) {
    skip("db gates", `041 not run yet? (${String(e.message || e).slice(0, 80)})`);
  }
}

// ── GATE 6: INTERNAL LINKS RESOLVE (no --base needed) ────────────────────
// Born 2026-08-15. S5's world map lived at /s5/map; S6 replaced it with THE
// FRONT at /s6, the port renamed every href to /s6/map, and nobody built that
// route. Thirteen links 404'd - including the Map Table station ON the base
// and the primary button after enlisting - and not one existing gate noticed,
// because they all check data and files, never navigation. This walks every
// internal /s6 href in the tree and asserts a page actually serves it.
console.log("\nGATE 6 - internal links");
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
    for (const m of src.matchAll(/(?:href|push)\(?[=:]?\s*["'`](\/s6(?:\/[a-z0-9-]+)*)(?:[#?][^"'`]*)?["'`]/gi)) {
      if (!seen.has(m[1])) seen.set(m[1], path.relative(ROOT, f));
    }
  }
  let dead = 0;
  for (const [url, where] of [...seen].sort()) {
    if (url === "/s6") continue; // the season root always exists
    if (!routeExists(url)) {
      bad(`dead link ${url}`, `linked from ${where}`);
      dead++;
    }
  }
  if (dead === 0) ok(`${seen.size} internal /s6 link targets all resolve`);
}

// ── GATE 7: routes (only with --base) ─────────────────────────────────────
console.log("\nGATE 7 - routes");
if (!BASE) skip("routes", "pass --base http://localhost:3000");
else {
  for (const r of ["/s6", "/s6/play", "/s6/board", "/s6/hq", "/s6/rules", "/s6/how-to-play", "/api/s6/feed"]) {
    try {
      const res = await fetch(BASE + r, { redirect: "follow" });
      res.ok ? ok(`${r} ${res.status}`) : bad(r, `HTTP ${res.status}`);
    } catch (e) {
      bad(r, String(e.message || e).slice(0, 60));
    }
  }
  try {
    const res = await fetch(BASE + "/resist", { redirect: "manual" });
    res.status === 308 ? ok("/resist 308 -> /s6") : bad("/resist", `expected 308, got ${res.status}`);
  } catch (e) {
    bad("/resist", String(e.message || e).slice(0, 60));
  }
}

console.log(`\n${fail === 0 ? "ALL GREEN" : "DRIFT FOUND"}: ${pass} ok, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
