import fs from "node:fs";
import path from "node:path";
const WORDS = ["look","looks","face","faces","sticker","stickers","decal","decals","topper","toppers","hat","hats","mark","marks"];
const re = new RegExp(String.raw`\b(${WORDS.join("|")})\b`, "i");
const dir = path.join(process.cwd(), "src/app/bots/_engine");
function blank(src) {
  // replace every comment and string literal with spaces, keeping line breaks
  let out = "";
  let i = 0;
  const n = src.length;
  const keepNl = (s) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "*") { const j = src.indexOf("*/", i + 2); const end = j < 0 ? n : j + 2; out += keepNl(src.slice(i, end)); i = end; continue; }
    if (c === "/" && d === "/") { const j = src.indexOf("\n", i); const end = j < 0 ? n : j; out += keepNl(src.slice(i, end)); i = end; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) { if (src[j] === "\\") { j += 2; continue; } if (src[j] === c) { j++; break; } j++; }
      out += c + keepNl(src.slice(i + 1, j - 1)) + (src[j - 1] === c ? c : ""); i = j; continue;
    }
    out += c; i++;
  }
  return out;
}
let hits = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith(".ts")) continue;
  blank(fs.readFileSync(path.join(dir, f), "utf8")).split("\n").forEach((line, k) => {
    const m = line.match(re);
    if (m) { hits++; console.log(`HIT ${f}:${k + 1} [${m[1]}]  ${line.trim().slice(0, 120)}`); }
  });
}
console.log(hits === 0 ? "SOURCE GATE CLEAN" : `${hits} hits`);
