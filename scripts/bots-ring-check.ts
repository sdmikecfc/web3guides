/**
 * BATTLE BOTS RING CHECK - the merge gate for THE RING SHOWS THE OWNER'S
 * ROBOT (lane S1).
 *
 *   npx tsx --tsconfig scripts/tsconfig.gate.json scripts/bots-ring-check.ts
 *
 * Shaped like scripts/bots-look-check.ts: a table of cases, report(), ALL
 * CHECKS GREEN or exit 1.
 *
 * THIS GATE IMPORTS THE SHIPPED MODULES rather than restating them (the
 * Domain Kitchen lesson: a gate that reimplements the logic it checks
 * reproduces the author's assumptions and passes). The two ladders it
 * compares are the real ones - src/lib/bots/look.ts marksOf on the server
 * side and src/app/bots/_view/look.ts marksOf on the drawing side - and the
 * fallback it checks is the server's own looksFromBuild, not a copy of it.
 *
 * EIGHT GATES:
 *  (a) THE LAW      no engine file imports a view module or the look, so
 *                   nothing in the look can enter the fight. Read, not assumed.
 *  (b) THE LADDER   the drawing side walks to exactly the same marks the
 *                   server already walked to, over every win count, loss count
 *                   and level that can change the picture. This is the one
 *                   thing that could silently put a star on the wrong robot.
 *  (c) FOUR COLOURS a robot is four colours at once in the ring: every socket
 *                   gets its own real paint and the weapon rides the arm.
 *  (d) CHOSEN       the hat takes the head's colour, the sticker takes the one
 *                   the robot chose (the torso's when it chose none), and the
 *                   plate carries the name's number.
 *  (e) NOTHING CAPS past the last drawn star the count keeps going, at 25, at
 *                   40 and at 400.
 *  (f) OLD ROWS     a row with no stored look draws its build's own colours,
 *                   falls back to the colour the ring used to paint the whole
 *                   robot where the build has none, wears no marks and does
 *                   not throw.
 *  (g) NEVER THROWS a half a row, an empty row and a row from a version that
 *                   knows one more face all still draw.
 *  (h) NO FLATTENING the pit and the viewer no longer paint a robot one
 *                   colour: read the source of the two files that did.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  NO_LOOK,
  NO_MARKS,
  PAINT_HEX,
  emptyPaints,
  marksOf as serverMarksOf,
  paintHex,
  socketPaints,
  type LookMarks,
} from "../src/lib/bots/look";
import { looksFromBuild } from "../src/app/bots/_server/fight-read";
import type { FightIdentityView, LookView } from "../src/app/bots/_server/types";
import { marksOf as rigMarksOf, type BotLook } from "../src/app/bots/_view/look";
import { bodyTintOf, earnedFromMarks, rigLookFromBuild, rigLookOf } from "../src/app/bots/_view/look-view";
import { CANON } from "../src/app/bots/_engine/catalog";
import type { Build, PaintId, Slot } from "../src/app/bots/_engine/parts";
import { SOCKETS, type Socket } from "../src/lib/bots/fixtures";

const ROOT = path.resolve(__dirname, "..");

let failures = 0;
function report(ok: boolean, tag: string, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${tag}  ${detail}`);
}

function allows(tag: string, detail: string, fn: () => unknown): void {
  try {
    fn();
    report(true, tag, detail);
  } catch (e) {
    report(false, tag, `${detail}: it THREW (${e instanceof Error ? e.message : String(e)})`);
  }
}

/** every capture group 1 a global regex finds in a source file, in order */
function all(src: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// the fixtures: real shapes, so the gate exercises the shipped readers
// ---------------------------------------------------------------------------

function painted(b: Build, head: PaintId, torso: PaintId, arms: PaintId, legs: PaintId): Build {
  return {
    legs: { ...b.legs, paint: legs },
    arms: { ...b.arms, paint: arms },
    torso: { ...b.torso, paint: torso },
    head: { ...b.head, paint: head },
    weapon: { ...b.weapon },
  };
}

const FOUR = painted(CANON.T3, "sky", "coral", "butter", "moss");
const PLAIN: Build = CANON.T3;

function idView(name: string, paint: PaintId, wins = 0, losses = 0): FightIdentityView {
  return { name, wallet: "Brass Otter 41", wins, losses, strategy: "Buy low, sell high", paint, tier: 3, total: 60 };
}

function lookView(over: Partial<LookView>): LookView {
  return { paints: socketPaints((slot: Slot) => FOUR[slot]?.paint), look: { ...NO_LOOK }, marks: { ...NO_MARKS }, wins: 0, ...over };
}

// ---------------------------------------------------------------------------
// (a) THE LAW: nothing in the look enters the fight
// ---------------------------------------------------------------------------

{
  const engine = walk(path.join(ROOT, "src/app/bots/_engine"));
  const bad: string[] = [];
  for (const f of engine) {
    const src = fs.readFileSync(f, "utf8");
    for (const spec of all(src, /^\s*(?:import|export)[^;]*?from\s+["']([^"']+)["']/gm)) {
      if (/_view\//.test(spec) || /(^|\/)look(-view)?$/.test(spec) || /lib\/bots\/look/.test(spec)) {
        bad.push(`${path.relative(ROOT, f)} -> ${spec}`);
      }
    }
  }
  report(bad.length === 0, "(a) THE LAW", bad.length === 0
    ? `${engine.length} engine files, none imports a view module or the look`
    : `engine imports a look: ${bad.join(", ")}`);

  // and the arrow the other way is types only: the ring's translator may know
  // the engine's SHAPES but must never pull its code into the drawing layer
  const bridge = fs.readFileSync(path.join(ROOT, "src/app/bots/_view/look-view.ts"), "utf8");
  const engineValueImport = all(bridge, /^\s*import\s+(?!type\s)([^;]*?)from\s+["'][^"']*_engine[^"']*["']/gm);
  report(engineValueImport.length === 0, "(a) THE LAW", engineValueImport.length === 0
    ? "look-view.ts imports the engine for TYPES only"
    : `look-view.ts imports engine values: ${engineValueImport.map((s) => s.trim()).join(" ")}`);
}

// ---------------------------------------------------------------------------
// (b) THE LADDER: the drawing walks to the marks the server already walked to
// ---------------------------------------------------------------------------
//
// The server stores the MARKS on a fight row, not the numbers behind them, and
// the rig walks the ladder itself from `earned`. earnedFromMarks is the hinge
// between the two, and a disagreement here is a star on a robot that never won
// it. So walk both, over every input that can move the picture, and compare
// every field. Nothing below restates a ladder.

{
  let cases = 0;
  const wrong: string[] = [];
  const winCounts = [0, 1, 2, 4, 5, 6, 9, 10, 11, 14, 15, 16, 19, 20, 21, 24, 25, 26, 30, 40, 99, 400];
  for (const wins of winCounts) {
    for (const losses of [0, 1, 2, 3, 4, 7, 12]) {
      for (const level of [1, 2, 4, 5, 6, 9, 10, 11, 20]) {
        for (const crown of [false, true]) {
          const server: LookMarks = serverMarksOf(wins, losses, level, crown);
          const drawn = rigMarksOf(earnedFromMarks(server, wins));
          cases += 1;
          const why: string[] = [];
          if (drawn.stars !== server.stars) why.push(`stars ${drawn.stars} vs ${server.stars}`);
          if (drawn.gold !== server.goldStar) why.push(`gold ${drawn.gold} vs ${server.goldStar}`);
          if (drawn.patches !== server.patches) why.push(`patches ${drawn.patches} vs ${server.patches}`);
          if (drawn.repairs !== server.patches + server.patchesBeyond) why.push(`repairs ${drawn.repairs} vs ${server.patches + server.patchesBeyond}`);
          if (drawn.cuffs !== server.cuffs) why.push(`cuffs ${drawn.cuffs} vs ${server.cuffs}`);
          if (drawn.sparkle !== server.sparkle) why.push(`sparkle ${drawn.sparkle} vs ${server.sparkle}`);
          if (drawn.crown !== server.crown) why.push(`crown ${drawn.crown} vs ${server.crown}`);
          // the plate carries the count from the gold star on, and only then
          if ((drawn.count != null) !== server.goldStar) why.push(`count ${drawn.count} with goldStar ${server.goldStar}`);
          if (drawn.count != null && drawn.count !== wins) why.push(`count ${drawn.count} is not the ${wins} wins`);
          if (why.length) wrong.push(`w${wins} l${losses} lv${level}${crown ? " crown" : ""}: ${why.join(", ")}`);
        }
      }
    }
  }
  report(wrong.length === 0, "(b) THE LADDER", wrong.length === 0
    ? `${cases} robots: the ring draws exactly the marks the server stored`
    : `${wrong.length} of ${cases} disagree, first: ${wrong[0]}`);

  // AND THE MARKS DECIDE, NOT THE COUNT THEY ARRIVE WITH. This is the case the
  // first cut of the gate missed and the first ring render caught: an old fight
  // row carries a real win count and NO MARKS, because the robot in that replay
  // never wore a star. Re-deriving the picture from the count put all six stars
  // back on it. So hand the ladder marks that DISAGREE with their count and
  // insist the marks win every time.
  const stubborn: string[] = [];
  for (const wins of [0, 1, 7, 24, 25, 40, 400]) {
    for (const marks of [NO_MARKS, serverMarksOf(3, 0, 1, false), serverMarksOf(25, 2, 10, true)]) {
      const drawn = rigMarksOf(earnedFromMarks(marks, wins));
      if (drawn.stars !== marks.stars) stubborn.push(`${wins} wins beside ${marks.stars} stored stars drew ${drawn.stars}`);
      if (drawn.gold !== marks.goldStar) stubborn.push(`${wins} wins beside goldStar ${marks.goldStar} drew ${drawn.gold}`);
      if (drawn.patches !== marks.patches) stubborn.push(`${wins} wins drew ${drawn.patches} patches, stored ${marks.patches}`);
      if (drawn.cuffs !== marks.cuffs) stubborn.push(`${wins} wins drew ${drawn.cuffs} cuffs, stored ${marks.cuffs}`);
      if (drawn.crown !== marks.crown) stubborn.push(`${wins} wins drew crown ${drawn.crown}, stored ${marks.crown}`);
    }
  }
  // and the one thing the count IS still allowed to say: the number on the
  // plate, once the row has reached the gold star and the drawing has run out
  const late = rigMarksOf(earnedFromMarks(serverMarksOf(25, 0, 1, false), 400));
  if (late.count !== 400) stubborn.push(`a robot on 400 wins prints ${late.count}`);
  const early = rigMarksOf(earnedFromMarks(NO_MARKS, 400));
  if (early.count != null) stubborn.push(`a row with no marks at all still printed ${early.count}`);
  report(stubborn.length === 0, "(b) THE LADDER", stubborn.length === 0
    ? "and a win count that disagrees with the stored marks never puts a star back on: the row decides"
    : stubborn.slice(0, 3).join("; "));
}

// ---------------------------------------------------------------------------
// (c) FOUR COLOURS: the thing this lane exists for
// ---------------------------------------------------------------------------

{
  const l = rigLookOf(lookView({}), "cream");
  const tints = SOCKETS.map((s: Socket) => l.paint?.[s]);
  const missing = SOCKETS.filter((s: Socket) => l.paint?.[s] == null);
  const real = Object.values(PAINT_HEX) as number[];
  const unreal = tints.filter((t) => t == null || !real.includes(t));
  const body = new Set([l.paint?.head, l.paint?.torso, l.paint?.armL, l.paint?.legL]);
  report(missing.length === 0 && unreal.length === 0 && body.size === 4, "(c) FOUR COLOURS",
    missing.length || unreal.length
      ? `sockets without a real paint: ${[...missing, ...unreal].join(", ")}`
      : `all ${SOCKETS.length} sockets painted, ${body.size} colours on the body (sky head, coral chest, butter arms, moss legs)`);

  const pairs = l.paint?.armL === l.paint?.armR && l.paint?.legL === l.paint?.legR;
  report(pairs && l.paint?.weapon === l.paint?.armR, "(c) FOUR COLOURS",
    pairs && l.paint?.weapon === l.paint?.armR
      ? "a pair card colours both its sockets and the weapon rides the arm"
      : `pairs ${pairs}, weapon ${l.paint?.weapon?.toString(16)} vs arm ${l.paint?.armR?.toString(16)}`);

  report(bodyTintOf(l) === paintHex("coral"), "(c) FOUR COLOURS",
    bodyTintOf(l) === paintHex("coral")
      ? "the chip a lost limb leaves is the TORSO's colour"
      : `body tint ${bodyTintOf(l).toString(16)} is not the torso's coral`);
}

// ---------------------------------------------------------------------------
// (d) CHOSEN: hat, sticker, plate
// ---------------------------------------------------------------------------

{
  // A HAT WEARS THE COLOUR IT TURNED UP IN. The head here is sky, so a moss
  // hat proves the hat's own colour is used and not the head's.
  const ownHat = rigLookOf(lookView({ look: { ...NO_LOOK, hat: { kind: "propeller", color: "moss" }, plateNumber: 7 } }), "cream");
  report(ownHat.hat?.kind === "propeller" && ownHat.hat?.color === paintHex("moss"), "(d) CHOSEN",
    ownHat.hat?.color === paintHex("moss")
      ? "the hat wears the colour it turned up in, not the head's"
      : `hat colour ${ownHat.hat?.color?.toString(16)} is not its own moss`);

  // and a hat row written before colours were recorded still draws: its true
  // answer is the head's, which is the picture every surface drew before this
  const withHat = rigLookOf(lookView({ look: { ...NO_LOOK, hat: { kind: "propeller", color: null }, plateNumber: 7 } }), "cream");
  report(withHat.hat?.kind === "propeller" && withHat.hat?.color === paintHex("sky"), "(d) CHOSEN",
    withHat.hat?.color === paintHex("sky")
      ? "a hat with no colour of its own falls back to the HEAD's, the same rule the portrait uses"
      : `hat colour ${withHat.hat?.color?.toString(16)} is not the head's sky`);
  report(withHat.plate === 7, "(d) CHOSEN", `the plate carries the name's number (${withHat.plate})`);

  const chose = rigLookOf(lookView({ look: { ...NO_LOOK, sticker: "star", spot: "boot", stickerPaint: "butter" } }), "cream");
  report(chose.sticker?.id === "star" && chose.sticker?.spot === "boot" && chose.sticker?.color === paintHex("butter"),
    "(d) CHOSEN", `the sticker keeps the colour it was given (${chose.sticker?.spot}, ${chose.sticker?.color?.toString(16)})`);

  const noColour = rigLookOf(lookView({ look: { ...NO_LOOK, sticker: "heart", spot: "cheek", stickerPaint: null } }), "cream");
  report(noColour.sticker?.color === paintHex("coral"), "(d) CHOSEN",
    noColour.sticker?.color === paintHex("coral")
      ? "a sticker with no colour of its own stands on the TORSO's"
      : `fallback sticker colour ${noColour.sticker?.color?.toString(16)} is not the torso's coral`);

  const bare = rigLookOf(lookView({}), "cream");
  report(bare.hat === null && bare.sticker === null && bare.face === "calm", "(d) CHOSEN",
    "a robot that chose nothing wears the calm face, no sticker and no hat");
}

// ---------------------------------------------------------------------------
// (e) NOTHING CAPS
// ---------------------------------------------------------------------------

{
  const bad: string[] = [];
  for (const wins of [25, 26, 40, 400, 4000]) {
    const m = rigMarksOf(earnedFromMarks(serverMarksOf(wins, 0, 1, false), wins));
    if (!m.gold) bad.push(`${wins} wins has no gold star`);
    if (m.count !== wins) bad.push(`${wins} wins prints ${m.count}`);
  }
  const under = rigMarksOf(earnedFromMarks(serverMarksOf(24, 0, 1, false), 24));
  if (under.gold || under.count != null) bad.push("24 wins already carries the gold star");
  report(bad.length === 0, "(e) NOTHING CAPS", bad.length === 0
    ? "5 cream stars, then a gold one at 25, then the plate prints 26, 40, 400, 4000"
    : bad.join("; "));

  const patched = rigMarksOf(earnedFromMarks(serverMarksOf(0, 11, 1, false), 0));
  report(patched.patches === 3 && patched.repairs === 11, "(e) NOTHING CAPS",
    patched.repairs === 11
      ? "3 patches are drawn and the true count of 11 rides along for the words"
      : `patches ${patched.patches}, repairs ${patched.repairs} (wanted 3 and 11)`);
}

// ---------------------------------------------------------------------------
// (f) OLD ROWS: a row stored before looks existed
// ---------------------------------------------------------------------------

{
  const id = idView("Speedy Otter 7", "butter", 27, 5);

  const fromPainted = looksFromBuild(FOUR, id);
  const okPainted =
    fromPainted.paints.head === "sky" && fromPainted.paints.torso === "coral" &&
    fromPainted.paints.armR === "butter" && fromPainted.paints.legL === "moss" &&
    fromPainted.paints.weapon === "butter";
  report(okPainted, "(f) OLD ROWS", okPainted
    ? "a saved build's own colours come back: sky head, coral chest, butter arms, moss legs"
    : `read back ${JSON.stringify(fromPainted.paints)}`);

  const fromPlain = looksFromBuild(PLAIN, id);
  const allButter = SOCKETS.every((s: Socket) => fromPlain.paints[s] === "butter");
  report(allButter, "(f) OLD ROWS", allButter
    ? "a build with no colours at all keeps the one colour the ring always painted it"
    : `read back ${JSON.stringify(fromPlain.paints)}`);

  const noMarks = JSON.stringify(fromPainted.marks) === JSON.stringify(NO_MARKS);
  report(noMarks && fromPainted.look.face === "calm" && fromPainted.look.hat === null && fromPainted.look.sticker === null,
    "(f) OLD ROWS", noMarks
      ? "and it wears NO marks: a row that never wrote a star does not get one from its win count"
      : `marks came back ${JSON.stringify(fromPainted.marks)}`);

  report(fromPainted.look.plateNumber === 7, "(f) OLD ROWS",
    `the plate number is recovered from the name text (${fromPainted.look.plateNumber})`);

  // the same picture whether the client falls back or the server does
  const clientSide = rigLookFromBuild(FOUR, "butter");
  const serverSide = rigLookOf(looksFromBuild(FOUR, idView("Nameless", "butter")), "butter");
  const samePaint = SOCKETS.every((s: Socket) => clientSide.paint?.[s] === serverSide.paint?.[s]);
  const sameRest =
    clientSide.face === serverSide.face && clientSide.hat === serverSide.hat &&
    clientSide.sticker === serverSide.sticker &&
    JSON.stringify(rigMarksOf(clientSide.earned)) === JSON.stringify(rigMarksOf(serverSide.earned));
  report(samePaint && sameRest, "(f) OLD ROWS", samePaint && sameRest
    ? "the demo pit's own fallback draws the same robot the server's fallback does"
    : `paint ${samePaint}, rest ${sameRest}`);
}

// ---------------------------------------------------------------------------
// (g) NEVER THROWS: the pit is allowed to be plain, never to go black
// ---------------------------------------------------------------------------

{
  allows("(g) NEVER THROWS", "a row with no paints at all", () => rigLookOf({ paints: emptyPaints(), look: { ...NO_LOOK }, marks: { ...NO_MARKS }, wins: 0 }, "mint"));
  allows("(g) NEVER THROWS", "half a row (no look, no marks)", () => rigLookOf({ wins: 3 } as unknown as LookView, "mint"));
  allows("(g) NEVER THROWS", "no row at all", () => rigLookOf(undefined as unknown as LookView, "mint"));
  allows("(g) NEVER THROWS", "a face and a hat from a newer version", () =>
    rigLookOf(lookView({ look: { ...NO_LOOK, face: "grumpy" as never, hat: "sombrero" as never } }), "mint"));
  allows("(g) NEVER THROWS", "a negative win count and a broken build", () => {
    rigLookOf(lookView({ wins: -4 }), "mint");
    rigLookFromBuild(undefined as unknown as Build, "mint");
  });

  const empty = rigLookOf({ paints: emptyPaints(), look: { ...NO_LOOK }, marks: { ...NO_MARKS }, wins: 0 }, "lilac");
  const allFallback = SOCKETS.every((s: Socket) => empty.paint?.[s] === paintHex("lilac"));
  report(allFallback, "(g) NEVER THROWS", allFallback
    ? "and an empty row still draws a whole robot, in the colour the caller named"
    : `it came back ${JSON.stringify(empty.paint)}`);
}

// ---------------------------------------------------------------------------
// (h) NO FLATTENING LEFT in the two files that used to do it
// ---------------------------------------------------------------------------

{
  const scene = fs.readFileSync(path.join(ROOT, "src/app/bots/_view/scene.ts"), "utf8");
  const client = fs.readFileSync(path.join(ROOT, "src/app/bots/fight/FightClient.tsx"), "utf8");
  const bad: string[] = [];
  if (/setBuilds[^\n]*paints:\s*readonly\s*\[number, number\]/.test(scene)) bad.push("scene.setBuilds still takes two numbers");
  if (/paintOf\[[^\]]+\]\s*=[^=]/.test(scene) && !/paintOf\[i\]\[socket\]/.test(scene)) bad.push("scene paints a whole bot one colour");
  if (/setBuilds\([^)]*PAINTS\[/.test(client)) bad.push("FightClient still flattens a robot to its plate colour");
  if (!/setLook\(/.test(scene)) bad.push("scene never dresses a rig");
  report(bad.length === 0, "(h) NO FLATTENING", bad.length === 0
    ? "the pit takes a look per robot and every piece that flies off keeps its own colour"
    : bad.join("; "));

  // ── (i) THE NUMBER FACES THE READER ──────────────────────────────────────
  // The pit draws bot B in a mirror, and the plate is the one thing on a robot
  // that is TEXT. This was caught by reading the render, not by reasoning: the
  // first ring shot had a robot wearing "SI" where its number should be. Three
  // things have to stay true or it comes back.
  const rig = fs.readFileSync(path.join(ROOT, "src/app/bots/_view/rig.ts"), "utf8");
  const why: string[] = [];
  if (!/drawPlate\(chestPlate/.test(rig)) why.push("the plate is not drawn into its own node any more");
  if (!/chestPlate\.scale\.x/.test(rig)) why.push("nothing turns the plate back round");
  if (!/setMirrored\(/.test(scene)) why.push("the pit never tells a flipped rig that it is flipped");
  if (/drawPlate\(chestMarks/.test(rig)) why.push("the plate is back inside the marks node, which the mirror flips");
  report(why.length === 0, "(i) THE NUMBER FACES THE READER", why.length === 0
    ? "the plate is its own node, the mirrored rig turns it back, and the count still reads left to right"
    : why.join("; "));
}

console.log("");
if (failures) {
  console.log(`${failures} CHECK${failures === 1 ? "" : "S"} FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS GREEN");
