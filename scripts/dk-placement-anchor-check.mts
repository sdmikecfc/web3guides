/** Registration checks for the actual placed/preview positioning helper.
 * node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-placement-anchor-check.mts [--review]
 * --review writes only a local image comparison; it never opens a player save.
 */
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { furnitureAnchor } from "../src/app/chef/game/_view/furniture-placement";
import { isoX, isoY, TILE_W, TILE_H } from "../src/app/chef/game/_engine/iso";
import { SHELL, SHELL_SIZES } from "../src/app/chef/game/_engine/rooms";
import { applyAction, createWorld, previewPlace, type Facing } from "../src/app/chef/game/_engine/world";
import { footprintCells } from "../src/app/chef/game/_engine/items";
import { layoutFromSave, sanitizeSave, serializeSave } from "../src/app/chef/game/_engine/save";

const facings: Facing[] = ["se", "sw", "nw", "ne"];
const center = (gx: number, gy: number) => ({ x: (gx - gy) * TILE_W / 2, y: (gx + gy + 1) * TILE_H / 2 });
let positions = 0;
for (const room of SHELL_SIZES) for (let gx = 0; gx < room.w; gx++) for (let gy = 0; gy < room.h; gy++) {
  for (const facing of facings) {
    assert.deepEqual(furnitureAnchor("doormat_basic", gx, gy, facing), center(gx, gy), "mat belongs at the highlighted diamond center");
    assert.deepEqual(footprintCells("doormat_basic", gx, gy, facing), [{ x: gx, y: gy }]);
    // A table's registered bottom is 16 logical pixels below the mat's center.
    assert.deepEqual(furnitureAnchor("table_basic", gx, gy, facing), { x: center(gx, gy).x, y: center(gx, gy).y + TILE_H / 2 });
    positions++;
  }
}
assert.deepEqual(furnitureAnchor("counter_basic", 5, 0, "se"), { x: 192, y: 128 });
assert.deepEqual(furnitureAnchor("counter_basic", 5, 0, "nw"), { x: 192, y: 128 });
assert.deepEqual(furnitureAnchor("counter_basic", 5, 0, "sw"), { x: 128, y: 128 });
assert.deepEqual(furnitureAnchor("counter_basic", 5, 0, "ne"), { x: 128, y: 128 });
console.log(`ok ${positions} tile/facing registrations across all room sizes; standing and rotated counter anchors preserved`);

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
const matPath = "public/chef-art/room/trattoria/doormat.png";
assert.deepEqual(pngSize(matPath), { width: TILE_W * 2, height: TILE_H * 2 });
assert.deepEqual(pngSize("public/chef-art/room/trattoria/rug.png"), { width: TILE_W * 4, height: TILE_H * 4 });
for (const facing of facings) {
  const fourCenters = [center(3, 4), center(4, 4), center(3, 5), center(4, 5)];
  assert.deepEqual(furnitureAnchor("rug_basic", 3, 4, facing), {
    x: fourCenters.reduce((sum, p) => sum + p.x, 0) / 4,
    y: fourCenters.reduce((sum, p) => sum + p.y, 0) / 4,
  }, "the larger rug retains the center of its existing 2×2 visual span");
}
console.log("ok actual mat and rug PNG dimensions match their distinct 1×1 and 2×2 visual registrations");

for (const facing of facings) {
  const world = createWorld("mat-anchor-reload", SHELL);
  assert.ok(applyAction(world, SHELL, { type: "edit", on: true }));
  const mat = world.layout.find((p) => p.itemId === "doormat_basic")!;
  const gx = 1, gy = 6;
  assert.equal(previewPlace(world, SHELL, mat.itemId, gx, gy, mat.uid, facing), "");
  const previewPosition = furnitureAnchor(mat.itemId, gx, gy, facing);
  assert.ok(applyAction(world, SHELL, { type: "move", uid: mat.uid, gx, gy, facing }));
  const round = sanitizeSave(serializeSave(world, "trattoria"));
  assert.deepEqual(round.layout.find((p) => p.itemId === mat.itemId), { uid:mat.uid, itemId: mat.itemId, gx, gy, facing });
  const reloaded = createWorld("mat-anchor-reload", SHELL, { layout: layoutFromSave(round), inventory: round.inventory, design: round.design });
  const restored = reloaded.layout.find((p) => p.itemId === mat.itemId)!;
  assert.deepEqual(furnitureAnchor(restored.itemId, restored.gx, restored.gy, restored.facing), previewPosition, "confirmation and reload cannot move the mat's visual position");
}
console.log("ok preview, confirmed placement, and save/reload agree for all four doormat facings");

if (process.argv.includes("--review")) {
  const { Resvg } = require("@resvg/resvg-js");
  const mat = readFileSync(matPath).toString("base64");
  const label = (x: number, y: number, text: string, size = 14) => `<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#465443">${text}</text>`;
  let body = `<rect width="840" height="390" fill="#f5efdf"/>`;
  body += label(24, 32, "DOORMAT PLACEMENT · ACTUAL ART AT PLAYING SIZE", 19);
  const panels = [
    { x: 30, title: "Correct · shared preview and placement", fixed: true },
    { x: 430, title: "Previous preview · centered on the vertex", fixed: false },
  ];
  for (const panel of panels) {
    body += `<rect x="${panel.x}" y="58" width="380" height="304" rx="16" fill="#fffaf0" stroke="#d4dac7"/>`;
    body += label(panel.x + 16, 87, panel.title);
    body += `<g transform="translate(${panel.x + 190} 124)">`;
    for (let gx = 0; gx < 4; gx++) for (let gy = 0; gy < 4; gy++) {
      const x = isoX(gx, gy), y = isoY(gx, gy), selected = gx === 1 && gy === 1;
      body += `<polygon points="${x},${y} ${x + 32},${y + 16} ${x},${y + 32} ${x - 32},${y + 16}" fill="${selected ? "#a9d7b6" : (gx + gy) % 2 ? "#e8e4d5" : "#f0ebdc"}" stroke="${selected ? "#44805a" : "#c6c8b5"}" stroke-width="${selected ? 2 : 1}"/>`;
    }
    const position = panel.fixed ? furnitureAnchor("doormat_basic", 1, 1, "se") : { x: isoX(1, 1), y: isoY(1, 1) + TILE_H };
    body += `<image x="${position.x - 32}" y="${position.y - 16}" width="64" height="32" opacity=".8" href="data:image/png;base64,${mat}"/>`;
    body += `</g>`;
    body += label(panel.x + 16, 293, "Highlighted cell: (1,1) · artwork: 64 × 32 px", 12);
    body += label(panel.x + 16, 317, panel.fixed ? "Mat sits inside the selected diamond." : "Old ghost sat 16 logical pixels too low.", 12);
    body += label(panel.x + 16, 341, "Same stored grid coordinates in both examples.", 12);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="390">${body}</svg>`;
  const directory = resolve(".dk-preview");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "placement-anchor-review.png");
  writeFileSync(path, new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: "Arial" } }).render().asPng());
  console.log(`Review image: ${path}`);
}
console.log("Domain Kitchen placement-anchor checks passed.");
