/** Actual shipped atlas/furniture contact sheet; no browser or saved restaurant.
 * node --preserve-symlinks --preserve-symlinks-main scripts/dk-seat-contact-review.mjs
 * Optional: --look=2 --theme=bistro. Output stays in .dk-preview/art-fixes.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const argument = (name, fallback) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;
const look = Math.max(0, Math.min(15, Number(argument("look", "0")) || 0));
const requestedTheme = argument("theme", "trattoria");
const theme = ["trattoria", "izakaya", "taqueria", "diner", "bistro"].includes(requestedTheme) ? requestedTheme : "trattoria";
const output = join(process.cwd(), ".dk-preview", "art-fixes");
mkdirSync(output, { recursive: true });
const atlas = JSON.parse(readFileSync(`public/chef-art/chars/guest${look}.json`, "utf8"));
const png = readFileSync(`public/chef-art/chars/guest${look}.png`).toString("base64");
// Same authored contract as dk-bake-cast-v2 and scene.ts: source art at 2×.
const foot = 116, hip = 96;
const seatTop = { chair: 56.2, bench: 55.1 };
const headings = ["se", "sw", "nw", "ne"];
const rows = [
  { label: "Dining chair · sitting", kind: "chair", anim: "sit", frame: 0 },
  { label: "Dining chair · eating / frame 1", kind: "chair", anim: "eat", frame: 0 },
  { label: "Dining chair · eating / frame 2", kind: "chair", anim: "eat", frame: 1 },
  { label: "Waiting bench · sitting", kind: "bench", anim: "sit", frame: 0 },
];
const width = 1080, height = 1445;
const label = (x, y, text, size = 16) => `<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#414c3d">${text}</text>`;
let body = `<rect width="${width}" height="${height}" fill="#f5efdf"/>`;
body += label(24, 32, `SEATED CONTACT · ${theme.toUpperCase()} · GUEST ${look} · 2× GAME SCALE`, 22);

function actor(x, footY, heading, anim, frame) {
  const rear = heading === "nw" || heading === "ne";
  const rectangle = atlas.frames[`${rear ? `z_${anim}_b` : anim}_${frame}`].frame;
  const flip = heading === "sw" || heading === "nw";
  return `<g transform="translate(${x} ${footY}) scale(${flip ? -1 : 1} 1)"><svg x="-64" y="-${foot}" width="128" height="128" viewBox="${rectangle.x} ${rectangle.y} 128 128" overflow="hidden"><image width="${atlas.meta.size.w}" height="${atlas.meta.size.h}" href="data:image/png;base64,${png}"/></svg></g>`;
}

rows.forEach((row, rowIndex) => {
  body += label(24, 67 + rowIndex * 292, row.label, 17);
  headings.forEach((heading, column) => {
    const rear = heading === "nw" || heading === "ne";
    const x = 138 + column * 260, floorY = 270 + rowIndex * 292;
    const furniture = readFileSync(`public/chef-art/room/${theme}/${row.kind}${rear ? "-back" : ""}.png`).toString("base64");
    const flip = heading === "sw" || heading === "ne";
    const piece = `<g transform="translate(${x} ${floorY}) scale(${flip ? -1 : 1} 1)"><image x="-96" y="-176" width="192" height="224" href="data:image/png;base64,${furniture}"/></g>`;
    const seatedLift = seatTop[row.kind] - (foot - hip);
    const person = actor(x, floorY - seatedLift, heading, row.anim, row.frame);
    body += `<rect x="${x - 110}" y="${floorY - 185}" width="220" height="238" rx="12" fill="#fffaf0" stroke="#d9ddca"/>`;
    body += rear ? person + piece : piece + person;
    body += `<line x1="${x - 78}" y1="${floorY - seatTop[row.kind]}" x2="${x + 78}" y2="${floorY - seatTop[row.kind]}" stroke="#6b9f9980" stroke-dasharray="4 5"/>`;
    body += label(x - 92, floorY + 41, `${heading.toUpperCase()} · hips on cushion`, 13);
  });
});

body += label(24, 1270, "Unoccluded seated anatomy · front / rear · sitting and both eating frames", 17);
for (let index = 0; index < 6; index++) {
  const rear = index >= 3, pose = index % 3;
  body += actor(110 + index * 172, 1414, rear ? "ne" : "se", pose === 0 ? "sit" : "eat", pose === 2 ? 1 : 0);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;
const stem = join(output, `seated-anatomy-${theme}-guest${look}`);
writeFileSync(`${stem}.svg`, svg);
writeFileSync(`${stem}.png`, new Resvg(svg).render().asPng());
console.log(resolve(`${stem}.png`));
