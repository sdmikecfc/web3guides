/**
 * ARMOR CLASH movement probe. Dumps every unit's position each second so the
 * question "do the tanks move" gets a number instead of an opinion.
 *
 * Mike, after playing the deployed build: "tanks don't move at all in armor
 * clash". The harness cannot see this -- it scores outcomes, and a unit frozen
 * on its own bank still contributes zero either way. So: read the positions.
 */
import { createArmorclash, stepArmorclash, type AcState } from "../src/app/s5/games/armorclash/sim";

const s = createArmorclash(900, 560, "probe", false, {
  firepower: 5,
  speed: 5,
  maneuver: 5,
  armor: 5,
  optics: 5,
} as never) as AcState;

type U = { id: number; side: number; x: number; y: number; cross?: number; hp: number; kind?: string };
const seen = new Map<number, { x0: number; y0: number; born: number }>();

for (let f = 0; f <= 60 * 90; f++) {
  stepArmorclash(s, 1 / 60, {} as never);
  if (f % 300 !== 0) continue;
  const t = (f / 60).toFixed(0).padStart(3);
  const us = (s as unknown as { units: U[] }).units || [];
  const line = us
    .map((u) => {
      const p = seen.get(u.id);
      if (!p) seen.set(u.id, { x0: u.x, y0: u.y, born: f });
      const moved = p ? Math.hypot(u.x - p.x0, u.y - p.y0) : 0;
      return `${u.side === 0 ? "B" : "R"}${u.id}(${u.x.toFixed(0)},${u.y.toFixed(0)})c${u.cross ?? "-"}m${moved.toFixed(0)}`;
    })
    .join(" ");
  console.log(`t=${t}s n=${us.length} ${line}`);
}

// The verdict: how far did each unit get from where it spawned?
console.log("\n-- total displacement from spawn --");
const us = (s as unknown as { units: U[] }).units || [];
for (const u of us) {
  const p = seen.get(u.id);
  if (p) console.log(`  unit ${u.id} side ${u.side}: moved ${Math.hypot(u.x - p.x0, u.y - p.y0).toFixed(1)}px`);
}
const rec = s as unknown as { towers: { hp: number; side: number; max?: number }[] };
console.log("\ntowers:", rec.towers?.map((t) => `s${t.side}:${t.hp}`).join(" "));
