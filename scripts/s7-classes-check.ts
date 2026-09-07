/**
 * CLASS TRACKS CHECK - proves Mike's switch law on src/lib/s7/classes.ts
 * against an in-memory mock of the two tables, so the semantics are pinned
 * before SQL 049 even runs in prod:
 *
 *   "if they change from level 3 warrior to mage they are a level 1 mage
 *    and can switch back to warrior"  -> switch away + back restores the
 *    EXACT level/xp/gear (the plan's switch-invariance gate).
 *
 * Run: npx tsx scripts/s7-classes-check.ts
 */
import { getTracks, grantClassXp, levelForXp, switchClass, xpForLevel, MAX_LEVEL } from "../src/lib/s7/classes";

let checks = 0;
function ok(cond: boolean, what: string): void {
  checks++;
  if (!cond) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
}

// ---- curve laws -----------------------------------------------------------
ok(xpForLevel(1) === 0, "level 1 costs 0");
ok(xpForLevel(2) === 100 && xpForLevel(3) === 300 && xpForLevel(10) === 4500 && xpForLevel(20) === 19000, "curve anchors");
for (let l = 1; l <= MAX_LEVEL; l++) {
  ok(levelForXp(xpForLevel(l)) === l, `inverse at exactly L${l}`);
  if (l < MAX_LEVEL) ok(levelForXp(xpForLevel(l + 1) - 1) === l, `inverse just under L${l + 1}`);
}
ok(levelForXp(10_000_000) === MAX_LEVEL, "xp beyond the top clamps to 20");

// ---- in-memory mock of the two tables -------------------------------------
type Row = Record<string, any>;
function mockDb() {
  const tables: Record<string, Row[]> = { launch_wars_s7_classes: [], launch_wars_s7_players: [] };
  const matches = (row: Row, filters: [string, any][]) => filters.every(([k, v]) => row[k] === v);
  return {
    _tables: tables,
    from(table: string) {
      const rows = tables[table];
      const filters: [string, any][] = [];
      const builder: any = {
        select() { return builder; },
        eq(k: string, v: any) { filters.push([k, v]); return builder; },
        maybeSingle() {
          const hit = rows.find((r) => matches(r, filters)) ?? null;
          return Promise.resolve({ data: hit ? { ...hit } : null, error: null });
        },
        update(patch: Row) {
          return {
            eq(k: string, v: any) {
              filters.push([k, v]);
              return {
                eq(k2: string, v2: any) {
                  filters.push([k2, v2]);
                  for (const r of rows) if (matches(r, filters)) Object.assign(r, patch);
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
        upsert(row: Row, opts: { onConflict: string; ignoreDuplicates?: boolean }) {
          const keys = opts.onConflict.split(",");
          const existing = rows.find((r) => keys.every((k) => r[k] === row[k]));
          if (existing) {
            if (!opts.ignoreDuplicates) Object.assign(existing, row);
          } else {
            rows.push({ level: 1, xp: 0, gear: { weapon: 0, armor: 0, trinket: 0 }, ...row });
          }
          return Promise.resolve({ error: null });
        },
        // thenable so `await db.from(t).select().eq()...` resolves the row list
        then(resolve: (v: any) => void) {
          resolve({ data: rows.filter((r) => matches(r, filters)).map((r) => ({ ...r })), error: null });
        },
      };
      return builder;
    },
  };
}

(async () => {
  const db = mockDb();
  const W = "0x00000000000000000000000000000000000000ab";
  db._tables.launch_wars_s7_players.push({ season_key: "s7", wallet: W, active_class: null });

  // pick barbarian, grind it to level 3
  const t1 = await switchClass(db as any, W, "barbarian");
  ok(t1.level === 1 && t1.xp === 0, "fresh class starts at level 1");
  const g1 = await grantClassXp(db as any, W, xpForLevel(3));
  ok(g1 !== null && g1.track.level === 3 && g1.leveled, "300 xp -> level 3 barbarian, leveled=true");

  // Mike's law: switch to wizard -> level 1 wizard
  const t2 = await switchClass(db as any, W, "wizard");
  ok(t2.classKey === "wizard" && t2.level === 1 && t2.xp === 0, "switching to a fresh class = level 1");

  // XP now lands on the wizard, never the barbarian
  const g2 = await grantClassXp(db as any, W, 100);
  ok(g2 !== null && g2.track.classKey === "wizard" && g2.track.level === 2, "xp lands on the ACTIVE class only");

  // switch back: the level-3 barbarian is EXACTLY as left
  const t3 = await switchClass(db as any, W, "barbarian");
  ok(t3.level === 3 && t3.xp === xpForLevel(3), "switch back restores the exact barbarian track");

  const all = await getTracks(db as any, W);
  ok(all.active === "barbarian" && all.tracks.length === 2, "two tracks exist, active = barbarian");
  const wiz = all.tracks.find((t) => t.classKey === "wizard")!;
  ok(wiz.level === 2 && wiz.xp === 100, "the wizard track kept its own progress too");

  // grants with no class picked land nowhere (never lost silently at level-derive)
  const W2 = "0x00000000000000000000000000000000000000cd";
  db._tables.launch_wars_s7_players.push({ season_key: "s7", wallet: W2, active_class: null });
  ok((await grantClassXp(db as any, W2, 500)) === null, "no active class -> grant returns null (caller decides)");

  // ---- gear survives the switch law -----------------------------------------
  // Write gear the way /api/s7/gear does (src/app/api/s7/gear/route.ts:109-119):
  // the whole gear JSONB replaced on the (season_key, wallet, class_key) row,
  // plus updated_at. The mock's update() chain stops at two .eq levels, so the
  // same write shape lands directly on the store row.
  const barb = db._tables.launch_wars_s7_classes.find(
    (r) => r.season_key === "s7" && r.wallet === W && r.class_key === "barbarian",
  );
  ok(!!barb, "the barbarian row exists to take the gear write");
  Object.assign(barb!, { gear: { weapon: 2, armor: 1, trinket: 0 }, updated_at: new Date().toISOString() });

  // switch away: the wizard track shows its OWN empty gear, never the barbarian's
  const t4 = await switchClass(db as any, W, "wizard");
  ok(
    t4.gear.weapon === 0 && t4.gear.armor === 0 && t4.gear.trinket === 0,
    "switching away shows the wizard's own empty gear default",
  );

  // switch back: gear is EXACTLY as bought
  const t5 = await switchClass(db as any, W, "barbarian");
  ok(
    t5.gear.weapon === 2 && t5.gear.armor === 1 && t5.gear.trinket === 0,
    "switch back restores the exact barbarian gear {weapon 2, armor 1, trinket 0}",
  );

  // an XP grant must not clobber gear (pins that grantClassXp's upsert payload
  // omits gear, so the merge leaves the JSONB untouched)
  const g3 = await grantClassXp(db as any, W, 50);
  ok(
    g3 !== null &&
      g3.track.classKey === "barbarian" &&
      g3.track.gear.weapon === 2 &&
      g3.track.gear.armor === 1 &&
      g3.track.gear.trinket === 0,
    "xp grant leaves gear intact (grant upsert omits gear)",
  );

  console.log(`CLASS TRACKS: ALL ${checks} CHECKS GREEN`);
})().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
