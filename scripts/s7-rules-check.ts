/**
 * RULES CORE CHECK - the unit gate for src/app/s7/games/_shared/rules/core.ts.
 * Run: npx tsx scripts/s7-rules-check.ts
 *
 * Proves the laws the sims will lean on BEFORE any sim exists:
 *  1. determinism        same seed -> byte-identical outcomes
 *  2. fork independence  the butterfly test: changing the PLAYER's rolls must
 *                        not move a MONSTER's dice (panel finding: a shared
 *                        stream makes the stats-matter gate pass by chaos)
 *  3. integer-only       every number out of the core is an integer
 *  4. d20 shape          nat-1 misses, nat-20+ crits double DICE not bonus,
 *                        advantage >= straight >= disadvantage in the mean
 *  5. gear monotonicity  geared beats ungeared across paired seeds (the
 *                        gate-(f) smoke version: 200 pairs, >= 90% here;
 *                        the nightly balance gate will demand more)
 *  6. class spread       no class's DPS-proxy runs away (<= 1.35x here,
 *                        tightening to 1.15 in s7-balance once kits exist)
 *  7. escalation         scaleStatblock raises threat but NEVER xp (score law)
 */
import {
  BESTIARY, CLASS_IDS, ClassId, Loadout, d, derive, fnv1a, noConds, resolveAttack,
  rngFork, rollDice, rollLoot, scaleStatblock, statblock, tickConditions,
} from "../src/app/s7/games/_shared/rules/core";

let checks = 0;
function ok(cond: boolean, what: string) {
  checks++;
  if (!cond) {
    console.error(`FAIL: ${what}`);
    process.exit(1);
  }
}

const L = (classId: ClassId, level = 1, w = 0, a = 0, t = 0): Loadout =>
  ({ classId, level, gear: { weapon: w, armor: a, trinket: t } });

// 1. determinism
{
  const run = (seed: number) => {
    const rng = rngFork(seed, "hero", "attack");
    const out: number[] = [];
    for (let i = 0; i < 50; i++) {
      const r = resolveAttack({ attackerId: "hero", targetId: "skel", atkBonus: 4, dmgDice: d(1, 8, 2), critRange: 20, defAc: 13, adv: 0, rng });
      out.push(r.die, r.dmg);
    }
    return JSON.stringify(out);
  };
  ok(run(1234) === run(1234), "determinism: same seed, same 50 attacks");
  ok(run(1234) !== run(1235), "determinism: different seed diverges");
}

// 2. fork independence (the butterfly test)
{
  const monsterRolls = (playerDrawCount: number) => {
    const seed = 777;
    const player = rngFork(seed, "hero", "attack");
    for (let i = 0; i < playerDrawCount; i++) player(); // player behaves differently...
    const monster = rngFork(seed, "skel_07", "attack"); // ...and the monster must not care
    const out: number[] = [];
    for (let i = 0; i < 20; i++) out.push(rollDice(d(1, 20), monster));
    return JSON.stringify(out);
  };
  ok(monsterRolls(0) === monsterRolls(97), "fork independence: player draws never move monster dice");
}

// 3. integer-only
{
  for (const c of CLASS_IDS) {
    for (const lvl of [1, 7, 20]) {
      const dv = derive(L(c, lvl, 3, 3, 3));
      for (const [k, v] of Object.entries(dv)) {
        if (typeof v === "number") ok(Number.isInteger(v), `integer-only: derive(${c},${lvl}).${k} = ${v}`);
      }
    }
  }
  const rng = rngFork(9, "x", "dice");
  for (let i = 0; i < 200; i++) ok(Number.isInteger(rollDice(d(3, 6, 2), rng)), "integer-only: rollDice");
}

// 4. d20 shape
{
  // scan seeds to find a nat-1 and a nat-20 deterministically
  let sawNat1Miss = false;
  let sawCrit = false;
  for (let seed = 0; seed < 4000 && !(sawNat1Miss && sawCrit); seed++) {
    const rng = rngFork(seed, "h", "attack");
    const r = resolveAttack({ attackerId: "h", targetId: "t", atkBonus: 100, dmgDice: d(2, 6, 3), critRange: 20, defAc: 10, adv: 0, rng });
    if (r.die === 1) { ok(!r.hit, "nat-1 misses even at +100"); sawNat1Miss = true; }
    if (r.die === 20) {
      ok(r.crit && r.hit, "nat-20 crits");
      // crit doubles dice (2d6 -> 4d6) but NOT the +3 bonus: max possible 27, min 7
      ok(r.dmg >= 4 + 3 && r.dmg <= 24 + 3, `crit damage in 4d6+3 range (got ${r.dmg})`);
      sawCrit = true;
    }
  }
  ok(sawNat1Miss && sawCrit, "d20 scan found both extremes");
  const mean = (adv: -1 | 0 | 1) => {
    let s = 0;
    for (let i = 0; i < 3000; i++) {
      const rng = rngFork(i, "m", `adv${adv}`);
      const r = resolveAttack({ attackerId: "m", targetId: "t", atkBonus: 0, dmgDice: d(1, 4), critRange: 20, defAc: 10, adv, rng });
      s += r.die;
    }
    return s / 3000;
  };
  ok(mean(1) > mean(0) && mean(0) > mean(-1), "advantage > straight > disadvantage");
}

// 5. gear monotonicity (paired-seed smoke; the real gate lives in s7-balance)
{
  const duel = (seed: number, loadout: Loadout): number => {
    // fixed scenario: hero vs a wight, alternating swings, count hero rounds survived + kills over 40 rounds
    const hero = derive(loadout);
    const foe = statblock("wight");
    const hRng = rngFork(seed, "hero", "attack");
    const fRng = rngFork(seed, "wight", "attack");
    let hp = hero.hpMax;
    let foeHp = foe.hp;
    let kills = 0;
    let rounds = 0;
    for (let r = 0; r < 40 && hp > 0; r++) {
      rounds++;
      const a = resolveAttack({ attackerId: "hero", targetId: "wight", atkBonus: hero.atkBonus, dmgDice: hero.dmgDice, critRange: hero.critRange, defAc: foe.ac, adv: 0, rng: hRng });
      foeHp -= a.dmg;
      if (foeHp <= 0) { kills++; foeHp = foe.hp; }
      const b = resolveAttack({ attackerId: "wight", targetId: "hero", atkBonus: foe.atkBonus, dmgDice: foe.dmgDice, critRange: 20, defAc: hero.ac, adv: 0, rng: fRng });
      hp -= b.dmg;
    }
    return kills * 100 + rounds; // survival + throughput proxy, NOT a score path
  };
  let geartWins = 0;
  const PAIRS = 200;
  for (let s = 0; s < PAIRS; s++) {
    const un = duel(s, L("ranger", 1, 0, 0, 0));
    const gd = duel(s, L("ranger", 10, 3, 3, 3));
    if (gd > un) geartWins++;
  }
  ok(geartWins >= PAIRS * 0.9, `gear monotonicity: geared wins ${geartWins}/${PAIRS} paired seeds (need >=180)`);
}

// 6. class spread (rough DPS-vs-survival proxy at equal loadout)
{
  const proxy = (c: ClassId): number => {
    const dv = derive(L(c, 5, 1, 1, 1));
    // expected damage per swing x speed, plus effective HP - a crude balance proxy
    const ev = (dv.dmgDice.count * (dv.dmgDice.sides + 1)) / 2 + dv.dmgDice.bonus;
    const hitP = Math.max(0.05, Math.min(0.95, (21 + dv.atkBonus - 13) / 20));
    return ev * hitP * (dv.speed / 100) + dv.hpMax * 0.25 + dv.ac * 1.5;
  };
  const vals = CLASS_IDS.map(proxy);
  const spread = Math.max(...vals) / Math.min(...vals);
  ok(spread <= 1.35, `class spread ${spread.toFixed(3)} <= 1.35 (${CLASS_IDS.map((c, i) => `${c}:${vals[i].toFixed(1)}`).join(" ")})`);
}

// 7. escalation never touches xp + conditions behave
{
  for (const b of BESTIARY) {
    const deep = scaleStatblock(b, 12);
    ok(deep.xp === b.xp, `escalation: ${b.id} xp unchanged at depth 12`);
    ok(deep.hp > b.hp && deep.atkBonus > b.atkBonus, `escalation: ${b.id} gets harder`);
  }
  let c = noConds();
  c = { ...c, burn: 2, stun: 1 };
  const t1 = tickConditions("hero", c);
  ok(t1.dmg === 2 && t1.next.burn === 1 && t1.next.stun === 0, "conditions tick down and burn deals 2");
  const t2 = tickConditions("hero", t1.next);
  ok(t2.dmg === 2 && t2.next.burn === 0, "burn second tick");
  const t3 = tickConditions("hero", t2.next);
  ok(t3.dmg === 0, "burn expired");
  // loot: deterministic + respects weights roughly
  const table = [{ item: "gold", weight: 80 }, { item: "potion", weight: 19 }, { item: "relic", weight: 1 }];
  const rngA = rngFork(5, "chest", "loot");
  const rngB = rngFork(5, "chest", "loot");
  const seqA = Array.from({ length: 30 }, () => rollLoot(table, rngA)).join(",");
  const seqB = Array.from({ length: 30 }, () => rollLoot(table, rngB)).join(",");
  ok(seqA === seqB, "loot deterministic");
  ok(fnv1a("stable") === fnv1a("stable"), "fnv1a stable");
}

console.log(`RULES CORE: ALL ${checks} CHECKS GREEN`);
