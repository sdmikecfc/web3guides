/** Rebuild only the labelled immutable seed section after editing beginner-catalog.ts. */
import fs from "node:fs";
import path from "node:path";
import { BEGINNER_OFFERS } from "../src/lib/bots/beginner-catalog";
const file = path.join(process.cwd(), "scripts/sql/bots-onboarding-v1.sql");
const quote = (s: string | null) => s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`;
const rows = BEGINNER_OFFERS.map((o, i) => `  (${quote(o.id)},${i},${quote(o.part.slot)},${quote(o.artKey)},${quote(o.part.name)},${quote(o.color)},${o.price})`);
const seed = `INSERT INTO public.battle_bots_beginner_offers(part_key,ordinal,slot_kind,art_key,name,color,price) VALUES\n${rows.join(",\n")}\nON CONFLICT(part_key) DO NOTHING;`;
const before = fs.readFileSync(file, "utf8");
const after = before.replace(/(-- BEGIN GENERATED OFFERS[^\n]*\n)[\s\S]*?(-- END GENERATED OFFERS)/, `$1${seed}\n$2`);
if (process.argv.includes("--write")) fs.writeFileSync(file, after);
else if (after !== before) throw new Error("Beginner SQL offers differ from the TypeScript catalogue; run this script with --write.");
console.log(`Beginner catalogue: ${rows.length} matching offers.`);
