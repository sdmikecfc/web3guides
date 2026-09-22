#!/usr/bin/env node
/**
 * FORT DAMAGE LADDERS — sieged, breaching and breached, as EDITS of the intact
 * render rather than fresh generations.
 *
 * WHY EDITS AND NOT NEW PROMPTS. A stronghold's picture changes as its wall
 * falls, and the player has to read that as the SAME building taking damage.
 * Three independent generations of "a damaged keep" produce three different
 * keeps, and the map then looks like the fort was swapped rather than shelled.
 * Editing the intact render keeps the silhouette, palette, camera and framing
 * fixed, so a wall always falls apart into ITSELF.
 *
 *   node gen-fort-damage.js            # all nine
 *   node gen-fort-damage.js keep       # one archetype's three states
 *
 * Reads  public/s5-art/world/_raw/forts/<archetype>.png
 * Writes public/s5-art/world/_raw/forts/<archetype>-<state>.png
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DIR = path.join(ROOT, "public", "s5-art", "world", "_raw", "forts");

function apiKey() {
  const txt = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
  const m = txt.match(/OPENAI_API_KEY\s*=\s*(.+)/);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

// Repeated verbatim on every edit. Without pinning all of these the model
// re-frames or re-colours the building and the ladder stops reading as one
// structure over time.
const KEEP_IDENTITY = `
KEEP IT THE SAME BUILDING. Same silhouette, same footprint, same colours, same
bold ink-outlined hand-illustrated style, same low oblique three-quarter camera
about 35 degrees above the ground, same sun from the upper left, same size and
same position in the frame, same plain flat white background with nothing
behind it. Do not move it, do not rotate it, do not zoom, do not restyle it,
do not replace it with a different building. CHANGE ONLY THE DAMAGE.
No text, letters, numbers, icons or frame.`;

const STATES = {
  sieged: `This fort is UNDER SIEGE but still holding. Add: scorch marks up the
walls, a few crenellations knocked off the top, cracks running through the
stonework, one small fire burning with a thin plume of dark smoke, fresh
sandbag barricades and barbed wire at the base, a couple of impact craters in
front of it. The structure is intact and defended.${KEEP_IDENTITY}`,

  breaching: `This fort is BREAKING. Add: a large ragged hole punched clean
through the front wall with rubble spilling out of it, a section of the roof
or upper works collapsed inward, heavy cracking across the remaining walls,
several fires burning, thick black smoke rising, its banner torn and hanging.
Badly damaged but still standing and still recognisably this same fort.${KEEP_IDENTITY}`,

  breached: `This fort has FALLEN. Reduce it to a burnt-out ruin: walls
collapsed to jagged stumps, roof completely gone, interior open to the sky,
blackened and scorched throughout, a big spill of rubble and broken stone
around the base, charred timbers, the banner pole snapped and bare, only thin
smoke still drifting from cold ashes. The RUIN MUST STILL BE RECOGNISABLE as
what is left of this exact fort - same footprint, same stone colour, the same
distinctive shape readable in what remains.${KEEP_IDENTITY}`,
};

const ARCHETYPES = ["keep", "bastion", "tower"];

async function one(arch, state, key) {
  const t0 = Date.now();
  const src = path.join(DIR, `${arch}.png`);
  if (!fs.existsSync(src)) {
    console.error(`x ${arch}-${state}: no ${arch}.png - run gen-forts.js first`);
    return false;
  }
  try {
    const fd = new FormData();
    fd.append("model", "gpt-image-2");
    fd.append("prompt", STATES[state]);
    fd.append("size", "1024x1024");
    fd.append("quality", "high");
    fd.append("image", new Blob([fs.readFileSync(src)], { type: "image/png" }),
      `${arch}.png`);
    const resp = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    if (!resp.ok) {
      console.error(`x ${arch}-${state}: HTTP ${resp.status} ${(await resp.text().catch(() => "")).slice(0, 200)}`);
      return false;
    }
    const j = await resp.json();
    const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) return console.error(`x ${arch}-${state}: no b64_json`), false;
    fs.writeFileSync(path.join(DIR, `${arch}-${state}.png`), Buffer.from(b64, "base64"));
    console.log(`ok ${arch}-${state} (${Math.round((Date.now() - t0) / 1000)}s)`);
    return true;
  } catch (e) {
    console.error(`x ${arch}-${state}: ${e && e.message}`);
    return false;
  }
}

if (require.main === module) {
  const named = process.argv.slice(2).filter((a) => ARCHETYPES.includes(a));
  const arches = named.length ? named : ARCHETYPES;
  const key = apiKey();
  const jobs = arches.flatMap((a) => Object.keys(STATES).map((s) => [a, s]));
  console.log(`gpt-image-2 edits, ${jobs.length} state(s)`);
  Promise.all(jobs.map(([a, s]) => one(a, s, key))).then((r) =>
    console.log(`${r.filter(Boolean).length}/${jobs.length} -> ${DIR}`));
}
