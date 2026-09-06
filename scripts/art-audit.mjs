/**
 * ART AUDIT — which manifest names have no file behind them?
 *
 * "You sure you don't need more images?" is not a question to answer from
 * memory. Every game's loadManifest() call is the authoritative list of what
 * the renderer will try to load; anything in it without a file on disk is
 * silently falling back to vectors forever, which is exactly the kind of gap
 * that reads as "the art didn't work" months later.
 *
 * Reads the manifests straight out of the Client.tsx sources so it cannot
 * drift from what the code actually asks for.
 *
 *   node scripts/art-audit.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GAMES = ["warpath", "warhawks", "armorclash", "vanguard"];

let missing = 0;
let present = 0;

for (const game of GAMES) {
  const src = readFileSync(join(ROOT, "src/app/s5/games", game, "Client.tsx"), "utf8");
  // Match the DECLARATION, not the first mention. Every one of these files
  // documents itself with a line like `ART: painted sprites via
  // loadManifest("warpath", ...)`, and a bare indexOf("loadManifest(") finds
  // that comment first -- which is how the initial run of this audit reported
  // Warpath as having one asset called "kind" and Warhawks as having none.
  const m0 = /const ART = loadManifest\(/.exec(src);
  if (!m0) {
    console.log(`${game}: no manifest`);
    continue;
  }
  const open = src.indexOf("[", m0.index);
  // Balance the bracket rather than taking the first "]": the array can contain
  // nested literals or a trailing `as const`.
  let depth = 0;
  let close = open;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  // Strip comments inside the array so a name mentioned in prose is not counted.
  const body = src
    .slice(open, close)
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
  const names = [...body.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);

  const gone = [];
  for (const n of names) {
    const ext = n.startsWith("bg-") ? "webp" : "png";
    if (existsSync(join(ROOT, "public/s5-art/games", game, `${n}.${ext}`))) present++;
    else {
      gone.push(`${n}.${ext}`);
      missing++;
    }
  }
  console.log(`${game}: ${names.length} names, ${gone.length} missing`);
  for (const g of gone) console.log(`    MISSING  ${g}`);
}

console.log(`\n${present} present, ${missing} missing across ${GAMES.length} games.`);
if (missing) console.log("Each missing name renders its vector fallback, silently, forever.");
