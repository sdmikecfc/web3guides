/**
 * THE ASSEMBLY GATE: does every robot a player can build actually hold
 * together, at fixed scale, on the anchors the art director gave us?
 *
 *   npx tsx scripts/bots-assembly-check.ts
 *   npx tsx scripts/bots-assembly-check.ts --json <path>   also write samples
 *
 * WHY. The game is 7,776 robots, not six. The old catalogue never had to face
 * this because every part was the same dome on the same canvas; the six new
 * families have wildly different envelopes, and the whole risk of that is that
 * a Clamp claw ends up buried in a Pip belly. The art director's acceptance
 * rule is the one implemented here: assemble at fixed scale by the actual
 * anchors, never resize a part to fit its host, and fix the offending part's
 * envelope rather than the individual combination.
 *
 * IT IMPORTS THE SHIPPED MATH. src/lib/bots/assemble.ts does the placement and
 * this file only measures the result. A gate that reimplements the thing it
 * checks reproduces the author's assumptions and passes; that lesson cost
 * Domain Kitchen three money bugs.
 *
 * WHAT IT CANNOT TELL YOU. Every number it reads comes from drawing targets
 * for parts that have not been drawn (see the provenance note in
 * families.ts). Bounding boxes are not silhouettes, so "these two rectangles
 * overlap" is a suspicion, not a collision. This gate is here to catch an
 * envelope that is wrong before anyone spends a day drawing it.
 */

import { writeFileSync } from "node:fs";
import { FAMILIES, FAMILY_IDS, type FamilyId } from "../src/lib/bots/families";
import {
  assemble,
  collarClearance,
  overlapArea,
  rectOf,
  COLLAR,
  type Assembly,
  type Pick,
  type Placed,
} from "../src/lib/bots/assemble";

/* ── bars ────────────────────────────────────────────────────────────────
 * Set from the interface sizes, not from taste. A shoulder collar is 1 U
 * across, so the honest overlap of an arm with a torso is about the area of
 * that collar, pi/4 = 0.79 square U. Anything far beyond it is the limb
 * sitting inside the body rather than hanging off it. */
const COLLAR_AREA = (Math.PI / 4) * COLLAR.shoulderAndHipCollarDiameter ** 2;
const LIMB_INTO_BODY_MAX = COLLAR_AREA * 3; // 2.36 square U
/* A wide head on a narrow body is the house style, not a defect: the concept
 * art is head-led and Brick's head is 3.3 U across. Overhang is only a problem
 * when the head DESCENDS past the shoulder line and fouls the shoulder
 * hardware, which is the failure the handoff describes for Ding's bell. So
 * this measures how far the head's underside drops below the shoulder anchor,
 * not how far it sticks out sideways. */
const HEAD_BELOW_SHOULDER_MAX = 0.1; // U

let problems = 0;
const say = (s = "") => console.log(s);
const bad = (s: string) => {
  problems += 1;
  console.log("  [FAIL] " + s);
};

/* ── 1. per family: can each part cover its own collars? ─────────────────
 * This is intrinsic to a drawing and does not depend on what it is worn
 * with, so it is checked once per family rather than 7,776 times. */
/* INFORMATIONAL, NOT A VERDICT. A collar STRADDLES its joint: the body owns
 * the receiving half and the limb owns an inset connector that seats inside
 * it. So neither part contains a whole collar radius within its own bounds,
 * and every shoulder anchor sits near its part's edge on purpose. The handoff
 * gives collar diameters but not the inset connector diameter, so how much
 * art each side must own is NOT DERIVABLE from the data we have. Printed so
 * the shape of the problem is visible, and so the missing number gets asked
 * for. */
say("COLLAR GEOMETRY  (informational: the inset connector diameter is not specified)");
for (const id of FAMILY_IDS) {
  const f = FAMILIES[id];
  const S = COLLAR.shoulderAndHipCollarDiameter;
  const N = COLLAR.neckCollarDiameter;
  // direction = where each part's own mass sits relative to the joint
  const checks: Array<[string, number]> = [
    ["head neck", collarClearance(f.head.size, f.head.neck, N, "up")],
    ["torso neck", collarClearance(f.torso.size, f.torso.neck, N, "down")],
    ["torso shoulderR", collarClearance(f.torso.size, f.torso.shoulderRight, S, "down")],
    ["torso hipR", collarClearance(f.torso.size, f.torso.hipRight, S, "up")],
    ["arm shoulder", collarClearance(f.arm.size, f.arm.shoulder, S, "down")],
    ["leg hip", collarClearance(f.leg.size, f.leg.hip, S, "down")],
  ];
  const worst = checks.reduce((a, b) => (b[1] < a[1] ? b : a));
  const line = `  ${f.name.padEnd(6)} worst ${worst[0].padEnd(15)} ${worst[1].toFixed(2)} U`;
  say(line + (worst[1] < 0 ? "  (collar protrudes past the part's own edge, as expected)" : ""));
}

/* ── 1b. the one thing that IS unambiguous: an anchor must lie on its part */
say();
say("ANCHORS INSIDE THEIR OWN PART");
for (const id of FAMILY_IDS) {
  const f = FAMILIES[id];
  const pts: Array<[string, readonly [number, number]]> = [
    ["head.neck", f.head.neck], ["torso.neck", f.torso.neck],
    ["torso.shoulderL", f.torso.shoulderLeft], ["torso.shoulderR", f.torso.shoulderRight],
    ["torso.hipL", f.torso.hipLeft], ["torso.hipR", f.torso.hipRight],
    ["torso.chestDecal", f.torso.chestDecal],
    ["arm.shoulder", f.arm.shoulder], ["arm.hand", f.arm.hand],
    ["leg.hip", f.leg.hip], ["leg.foot", f.leg.foot], ["weapon.grip", f.weapon.grip],
  ];
  const off = pts.filter(([, a]) => a[0] < 0 || a[0] > 1 || a[1] < 0 || a[1] > 1);
  if (off.length) bad(`${f.name}: ${off.map(([k]) => k).join(", ")} outside 0..1`);
}
if (!problems) say("  all 72 anchors on their parts");

/* ── 2. every combination ────────────────────────────────────────────── */
const armIntoBody: Array<{ pick: string; v: number }> = [];
const headOverShoulder: Array<{ pick: string; v: number }> = [];
const heights: Array<{ pick: string; v: number }> = [];

const key = (p: Pick) => `${p.head}/${p.torso}/${p.arms}/${p.legs}/${p.weapon}`;
const find = (a: Assembly, piece: string): Placed => a.pieces.find((p) => p.piece === piece)!;

let n = 0;
for (const head of FAMILY_IDS)
  for (const torso of FAMILY_IDS)
    for (const arms of FAMILY_IDS)
      for (const legs of FAMILY_IDS)
        for (const weapon of FAMILY_IDS) {
          const pick: Pick = { head, torso, arms, legs, weapon };
          const a = assemble(pick);
          n += 1;
          const k = key(pick);

          const body = find(a, "torso");
          armIntoBody.push({ pick: k, v: Math.max(overlapArea(find(a, "armR"), body), overlapArea(find(a, "armL"), body)) });

          // the head only fouls a shoulder if it BOTH reaches past it
          // sideways and hangs below the shoulder line
          const h = rectOf(find(a, "head"));
          const sideways = Math.max(a.joints.shoulderL.x - h.x0, h.x1 - a.joints.shoulderR.x);
          const below = h.y1 - Math.min(a.joints.shoulderL.y, a.joints.shoulderR.y);
          headOverShoulder.push({ pick: k, v: sideways > 0 ? below : -Infinity });

          heights.push({ pick: k, v: a.bounds.h });
        }

const worstOf = (xs: Array<{ pick: string; v: number }>) => [...xs].sort((p, q) => q.v - p.v);

say();
say(`ASSEMBLED ${n.toLocaleString()} ROBOTS`);
const hs = heights.map((x) => x.v).sort((a, b) => a - b);
say(`  height  min ${hs[0].toFixed(2)} U   median ${hs[hs.length >> 1].toFixed(2)} U   max ${hs[hs.length - 1].toFixed(2)} U`);
say(`  tallest ${worstOf(heights)[0].pick}`);

say();
say(`ARM INSIDE BODY  (a shoulder collar is ${COLLAR_AREA.toFixed(2)} sq U; the bar is ${LIMB_INTO_BODY_MAX.toFixed(2)})`);
const armWorst = worstOf(armIntoBody);
for (const w of armWorst.slice(0, 5)) say(`  ${w.v.toFixed(2)} sq U   ${w.pick}`);
{
  /* RANKED, NOT FAILED. These are bounding boxes, and a crescent claw or a
   * pear belly fills perhaps half of its own box, so the overlap here is an
   * upper bound on the real thing. It cannot condemn a part; it can only say
   * where to look first, and where it points is exactly where the art
   * director already predicted trouble. Once real silhouettes exist this
   * becomes a pixel test and a real gate. */
  const over = armWorst.filter((w) => w.v > LIMB_INTO_BODY_MAX);
  const armFams = new Set(over.map((w) => w.pick.split("/")[2]));
  const torsoFams = new Set(over.map((w) => w.pick.split("/")[1]));
  say(`  ${over.length} of ${n} builds are above the bar`);
  say(`  arm families involved:   ${Array.from(armFams).join(", ")}`);
  say(`  torso families involved: ${Array.from(torsoFams).join(", ")}`);
  say("  READ THIS AS A RANKING, not a verdict: bounding boxes overstate a crescent or a pear.");
}

say();
say(`HEAD FOULING A SHOULDER  (bar ${HEAD_BELOW_SHOULDER_MAX} U below the shoulder line, while also reaching past it)`);
const headWorst = worstOf(headOverShoulder);
for (const w of headWorst.slice(0, 5)) say(`  ${Number.isFinite(w.v) ? w.v.toFixed(2) : "clear"} U   ${w.pick}`);
if (headWorst[0].v > HEAD_BELOW_SHOULDER_MAX) {  // this one IS geometric
  const families = new Set(headWorst.filter((w) => w.v > HEAD_BELOW_SHOULDER_MAX).map((w) => w.pick.split("/")[0]));
  bad(`heads reach past the shoulder on ${headWorst.filter((w) => w.v > HEAD_BELOW_SHOULDER_MAX).length} builds; the head families at fault: ${Array.from(families).join(", ")}`);
}

/* ── 3. samples for the eye ──────────────────────────────────────────── */
const jsonAt = process.argv.indexOf("--json");
if (jsonAt > 0 && process.argv[jsonAt + 1]) {
  const picks: Pick[] = [];
  // the six pure families, then the mixes the art director flagged as risky
  for (const id of FAMILY_IDS) picks.push({ head: id, torso: id, arms: id, legs: id, weapon: id });
  const risky: Array<[FamilyId, FamilyId, FamilyId, FamilyId, FamilyId]> = [
    ["pip", "pip", "clamp", "peek", "pip"],
    ["ding", "clamp", "clamp", "scoot", "brick"],
    ["clamp", "pip", "brick", "peek", "ding"],
    ["peek", "brick", "clamp", "pip", "scoot"],
    ["brick", "peek", "scoot", "clamp", "pip"],
    ["scoot", "ding", "pip", "brick", "peek"],
  ];
  for (const [h, t, a, l, w] of risky) picks.push({ head: h, torso: t, arms: a, legs: l, weapon: w });
  const out = picks.map((p) => assemble(p));
  writeFileSync(process.argv[jsonAt + 1], JSON.stringify({ pxPerU: 100, assemblies: out }, null, 1));
  say(`\nwrote ${out.length} sample assemblies to ${process.argv[jsonAt + 1]}`);
}

say();
say("WHAT THIS RUN CANNOT PROVE: the parts do not exist. Every number above comes");
say("from drawing targets, and bounding boxes are not silhouettes. When real art");
say("lands, the overlap tests become pixel tests and this becomes a real gate.");
say();
if (problems) {
  say(`ASSEMBLY CHECK: ${problems} problem${problems === 1 ? "" : "s"}. These are envelope bugs, so fix the part, not the build.`);
  process.exit(1);
}
say("ASSEMBLY CHECK PASSED  (geometry consistent; silhouette proof still owed)");
