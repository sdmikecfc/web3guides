/**
 * Battle Bots: write scripts/bots-parts-manifest.json from the engine catalog
 * so the parts wave (scripts/bots-gen-parts.mjs) paints exactly the parts the
 * game sells, with each part's family motif and factory colour in the prompt.
 *
 *   npx tsx scripts/bots-parts-manifest.ts            # writes the manifest, prints a table
 *
 * Mapping to the baked placeholders: the bake wrote
 * public/bots-art/parts/<slot>/t<tier>-<design>.png with design 1 and 2 per
 * slot per tier. The catalog carries two designs per slot per tier too; the
 * design index here is the part's order within its (slot, tier) group, unless
 * the card carries an explicit `design` field, which wins. Family motifs come
 * from FAMILY_MOTIFS below (one line per family, authored, plain words); a
 * family without a motif falls back to its name.
 */
import fs from "node:fs";
import path from "node:path";
import { CATALOG } from "../src/app/bots/_engine/catalog";

type Card = {
  id: string; slot: string; tier: number; name: string; family?: string; color?: string; design?: number; lore?: string;
};

const FAMILY_MOTIFS: Record<string, string> = {
  kettle: "rounded kettle shapes, a spout-like ridge, a lid-rim seam",
  piston: "cylinder and piston shapes, banded rings, exposed bolt heads",
  lantern: "a lantern glass window, a small hanging ring, warm inner glow",
  anvil: "heavy flat-topped blocks, a horn-like edge, thick corners",
  sprocket: "gear-tooth edges, a hub with spokes, chain-link seams",
  hornet: "sleek tapered shapes, a fine stripe seam, small fin edges",
  bulldozer: "wide flat plates, a blade-like brow, tread-like grooves",
  peeper: "extra lens rings, a periscope nub, dial markings",
  tin: "thin pressed-tin panels, a crimped edge, a little dent",
  brass: "polished brass banding, a plaque, engraved rings",
};

function slotList(): Card[] {
  // CATALOG may be an object of tables per slot, or a flat array; accept both.
  const c: any = CATALOG;
  if (Array.isArray(c)) return c as Card[];
  const out: Card[] = [];
  for (const k of Object.keys(c)) if (Array.isArray(c[k])) out.push(...(c[k] as Card[]));
  return out;
}

const cards = slotList().filter((p) => p && p.slot && p.tier);
const groups = new Map<string, Card[]>();
for (const p of cards) {
  const key = `${p.slot}:${p.tier}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(p);
}

// The bake writes one sprite per PAIR slot under the rig's singular folder
// (arms -> arm, legs -> leg; the far limb is a mirror). Try the catalog's slot
// name first, then the singular, so either convention resolves.
function folderFor(slot: string): string {
  const base = path.join(__dirname, "..", "public", "bots-art", "parts");
  for (const cand of [slot, slot.replace(/s$/, "")]) if (fs.existsSync(path.join(base, cand))) return cand;
  return slot;
}

const manifest: any[] = [];
const skipped: string[] = [];
// forEach rather than for..of: the repo tsconfig has no target, so Map iteration needs downlevelIteration.
groups.forEach((list: Card[], _key: string) => {
  list.forEach((p: Card, i: number) => {
    const design = p.design ?? i + 1;
    if (design > 2) { skipped.push(`${p.id} (${p.name}: starter card, reuses design 1 art)`); return; }
    const fam = (p.family || "").toLowerCase();
    manifest.push({
      id: `${p.slot}-t${p.tier}-${design}`,
      catalogId: p.id,
      slot: p.slot,
      folder: folderFor(p.slot),
      tier: p.tier,
      design,
      name: p.name,
      family: p.family || null,
      motif: fam ? FAMILY_MOTIFS[fam] || p.family : null,
      color: p.color || null,
      quality: p.tier >= 3 ? "high" : "medium",
    });
  });
});
if (skipped.length) console.log("not painted separately:", skipped.join("; "));
manifest.sort((a, b) => a.slot.localeCompare(b.slot) || a.tier - b.tier || a.design - b.design);

const out = path.join(__dirname, "bots-parts-manifest.json");
fs.writeFileSync(out, JSON.stringify(manifest, null, 2));
for (const m of manifest) console.log(m.id.padEnd(14), (m.family || "-").padEnd(10), (m.color || "-").padEnd(8), m.name);
console.log(`${manifest.length} parts -> ${path.relative(process.cwd(), out)}`);
const missing = manifest.filter((m) => !fs.existsSync(path.join(__dirname, "..", "public", "bots-art", "parts", m.folder, `t${m.tier}-${m.design}.png`)));
if (missing.length) { console.error("placeholders missing for:", missing.map((m) => m.id).join(", ")); process.exit(1); }
