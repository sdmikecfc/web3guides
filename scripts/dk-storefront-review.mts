/** Static review of the SAME geometry used by Pixi; not a browser capture.
 * node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-storefront-review.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { AWNINGS } from "../src/app/chef/game/_engine/building";
import { storefrontGeometry, type FacadeShape } from "../src/app/chef/game/_view/storefront";

const out = join(process.cwd(), ".dk-preview", "art-fixes");
mkdirSync(out, { recursive: true });
const color = (hex: number) => `#${hex.toString(16).padStart(6, "0")}`;
const points = (value: number[][]) => value.map((p) => p.join(",")).join(" ");
const esc = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
function shapeSVG(shape: FacadeShape): string {
  if (shape.kind === "polygon") return `<polygon points="${points(shape.points)}" fill="${color(shape.fill)}" stroke="${shape.stroke === undefined ? "none" : color(shape.stroke)}" stroke-width="1" stroke-opacity=".65"/>`;
  if (shape.kind === "ellipse") return `<ellipse cx="${shape.center[0]}" cy="${shape.center[1]}" rx="${shape.rx}" ry="${shape.ry}" fill="${color(shape.fill)}"/>`;
  return `<polyline points="${points(shape.points)}" fill="none" stroke="${color(shape.stroke)}" stroke-width="${shape.width}"/>`;
}
function facade(awning: string, label: string, x: number, y: number, scale: number) {
  const geometry = storefrontGeometry({ w: 10, h: 8, door: { x: 4, y: 7 } }, awning);
  const [lx, ly] = geometry.label;
  // The renderer uses this same affine wall plane: x stays horizontal, y += x/2.
  const text = `<text transform="matrix(1 .5 0 1 ${lx} ${ly})" x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="Georgia" font-size="10.5" font-weight="600" fill="#fff3da">${esc(label)}</text>`;
  return `<g transform="translate(${x} ${y}) scale(${scale}) translate(${-lx} ${-ly})">${geometry.shapes.map(shapeSVG).join("")}${text}</g>`;
}
let body = `<rect width="1100" height="850" fill="#f4eddf"/><text x="48" y="50" fill="#43594b" font-size="25" font-family="Georgia">A doorway with a mounted café nameboard</text><text x="48" y="80" fill="#746956" font-size="15" font-family="Arial">Shared in-game geometry · enlarged details and game-scale comparison · static art review</text>`;
body += facade("terracotta", "Little Olive", 295, 218, 2.5);
body += `<text x="140" y="525" fill="#746956" font-size="14" font-family="Arial">2.5× construction review</text>`;
body += facade("terracotta", "Little Olive", 795, 238, 1);
body += `<text x="691" y="380" fill="#746956" font-size="14" font-family="Arial">1× at normal world scale</text>`;
for (let i = 0; i < AWNINGS.length; i++) {
  const x = 160 + i * 257;
  body += facade(AWNINGS[i].id, "Little Olive", x, 640, 1.15);
  body += `<text x="${x}" y="800" text-anchor="middle" fill="#746956" font-size="14" font-family="Arial">${esc(AWNINGS[i].label)}</text>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="850" viewBox="0 0 1100 850">${body}</svg>`;
writeFileSync(join(out, "storefront.svg"), svg);
writeFileSync(join(out, "storefront.png"), new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng());
process.stdout.write(`Storefront construction review: ${join(out, "storefront.png")}\n`);
