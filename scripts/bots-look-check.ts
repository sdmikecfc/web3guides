/**
 * BATTLE BOTS LOOK CHECK - the merge gate for WHAT A ROBOT LOOKS LIKE and,
 * more to the point, for who is allowed to say so.
 *
 *   npx tsx scripts/bots-look-check.ts
 *
 * Shaped like scripts/bots-rewards-check.ts: a table of cases, report(),
 * ALL CHECKS GREEN or exit 1.
 *
 * THIS GATE IMPORTS THE SHIPPED MODULES rather than restating them (the
 * Domain Kitchen lesson: a gate that reimplements the logic it checks
 * reproduces the author's assumptions and passes). parseLook, findsOf,
 * earnedMarks, socketPaints and hatDrop come from src/lib/bots/look.ts;
 * earnedFor and lookOf come from src/app/bots/_server/bots.ts with real row
 * shapes; looksOf comes from src/app/bots/_server/fight-read.ts. Nothing
 * below is a private copy of a rule.
 *
 * SEVEN GATES:
 *  (a) THE LAW      no engine file imports the look, and the look imports no
 *                   engine file except parts and rng. Nothing in the look
 *                   enters the fight, proved by reading the source.
 *  (b) FOUND        a robot is four colours at once and the weapon rides the
 *                   arm; a colour only ever comes off a part row.
 *  (c) EARNED       the mark ladders at 0, 1, 5, 26 and 300 wins, and NOTHING
 *                   CAPS: past the last drawn step the count is still carried.
 *  (d) REFUSED      a face nobody earned, a sticker colour not on the robot
 *                   and a hat nobody won are each refused, in plain words.
 *  (e) KEPT         what WAS earned is kept, and the read path never throws.
 *  (f) OLD ROWS     a fight row stored before looks existed still reads, in
 *                   its own colours, with no marks.
 *  (g) WORDS        every earn line a player reads is plain: no em-dash, no
 *                   money, no jargon from the banned list.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import {
  BODY_CARD_ORDER,
  CUFF_LEVELS,
  FACES,
  FACE_IDS,
  HATS,
  HAT_EARN,
  HAT_IDS,
  LookRefused,
  MARK_EARN,
  NOTHING_EARNED,
  NO_LOOK,
  NO_MARKS,
  PATCHES_DRAWN,
  SPARKLE_LEVEL,
  SPOTS,
  STAR_STEPS,
  STICKERS,
  STICKER_IDS,
  bodyPaints,
  colourMatched,
  earnedMarks,
  findsOf,
  hatDrop,
  lookKey,
  markWords,
  marksOf,
  normalizeLook,
  ownColours,
  parseLook,
  socketPaints,
  twinWords,
  type BotLookRaw,
  dedupeHats,
  type HatId,
  type HatWon,
  type LookEarned,
} from "../src/lib/bots/look";
import { earnedFor, lookOf, socketPaintsOf, type BotRow, type PartRow } from "../src/app/bots/_server/bots";
import { looksOf } from "../src/app/bots/_server/fight-read";
// the RIG's own ladder, imported so the two are compared rather than one of
// them being restated here (the gates-must-import law)
import { GOLD_STAR_AT, marksOf as viewMarksOf } from "../src/app/bots/_view/look";
import type { ResultJson } from "../src/app/bots/_server/fight-read";
import type { CardSlot } from "../src/lib/bots/fixtures";
import type { PaintId } from "../src/app/bots/_engine/parts";

const ROOT = path.resolve(__dirname, "..");

let failures = 0;
function report(ok: boolean, tag: string, detail: string): void {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${tag}  ${detail}`);
}

/** A refusal is only a pass when it is a LookRefused carrying a sentence. */
function refuses(tag: string, detail: string, fn: () => unknown): void {
  try {
    fn();
    report(false, tag, `${detail}: it was ALLOWED`);
  } catch (e) {
    if (e instanceof LookRefused && e.message.length > 4) report(true, tag, `${detail}: "${e.message}"`);
    else report(false, tag, `${detail}: threw the wrong thing (${e instanceof Error ? e.message : String(e)})`);
  }
}

function allows(tag: string, detail: string, fn: () => unknown): void {
  try {
    fn();
    report(true, tag, detail);
  } catch (e) {
    report(false, tag, `${detail}: it was REFUSED (${e instanceof Error ? e.message : String(e)})`);
  }
}

// ---------------------------------------------------------------------------
// row builders: the real shapes, so the gate exercises the shipped readers
// ---------------------------------------------------------------------------

let nextPartId = 1;
function part(slot: CardSlot, partKey: string, tier: 1 | 2 | 3 | 4, paint?: PaintId): PartRow {
  return {
    id: nextPartId++,
    wallet: "0xtest",
    part_key: partKey,
    slot_kind: slot,
    tier,
    stats: { s: [tier, tier, tier], paint },
    bot_id: 1,
    source: "shop",
    list_price: 50,
    recycled_at: null,
    is_test: true,
    created_at: "2026-09-05T00:00:00.000Z",
  };
}

/** The part ids on a robot, READ OFF the rows. Hand written ids drifted the
 * moment a case was inserted above another one, and a silently empty build
 * makes every earned thing quietly false, which is a gate that passes by
 * accident. */
function idsOf(parts: readonly PartRow[]): Record<CardSlot, number | null> {
  const ids = { legs: null, arms: null, torso: null, head: null, weapon: null } as Record<CardSlot, number | null>;
  for (const p of parts) ids[p.slot_kind] = p.id;
  return ids;
}

function bot(o: Partial<BotRow> & { parts: PartRow[] }): BotRow {
  const ids = idsOf(o.parts);
  return {
    id: 1,
    wallet: "0xtest",
    slot: 1,
    name: "Speedy Otter 7",
    build: { parts: ids as never, name: { first: "Speedy", second: "Otter", num: 7 }, ...(o.build || {}) },
    total: 0,
    tier: 1,
    weight_class: "light",
    level: o.level ?? 1,
    xp: 0,
    wins: o.wins ?? 0,
    losses: o.losses ?? 0,
    broken_until: null,
    attacks_day_key: null,
    attacks_today: 0,
    defenses_today: 0,
    listed: true,
    recycled_at: null,
    is_test: true,
    created_at: "2026-09-05T00:00:00.000Z",
  };
}

/** A four colour robot: the normal one. Head mint, body coral, arms sky,
 * legs butter, and a weapon with no colour of its own. */
const FOUR_COLOUR = [
  part("head", "head.hornetScope", 2, "mint"),
  part("torso", "torso.kettleChest", 2, "coral"),
  part("arms", "arms.kettleGrips", 2, "sky"),
  part("legs", "legs.kettleShins", 2, "butter"),
  part("weapon", "weapon.steelSaw", 2),
];

/** A matched robot: all four body parts mint, which is what unlocks the wink. */
const ALL_MINT = [
  part("head", "head.hornetScope", 2, "mint"),
  part("torso", "torso.kettleChest", 2, "mint"),
  part("arms", "arms.kettleGrips", 2, "mint"),
  part("legs", "legs.kettleShins", 2, "mint"),
  part("weapon", "weapon.steelSaw", 2),
];

/** A robot wearing ONE four star part. bulldozer is the catalogue's four star
 * family, and the star count is read off the catalogue, never off the row a
 * test wrote, so this case cannot pass by inventing a four star part. */
const ONE_FOUR_STAR = [
  part("head", "head.bulldozerHelm", 4, "ink"),
  part("torso", "torso.hornetFrame", 3, "coral"),
  part("arms", "arms.kettleGrips", 2, "moss"),
  part("legs", "legs.kettleShins", 2, "sky"),
  part("weapon", "weapon.steelSaw", 2),
];

/** What the save route checks a claim against: the rows, and nothing else. */
function earnedForParts(parts: readonly PartRow[], o: Partial<{ wins: number; losses: number; level: number; crown: boolean; plateNumber: number | null; hats: (HatId | HatWon)[] }> = {}): LookEarned {
  return earnedFor(
    {
      wins: o.wins ?? 0,
      losses: o.losses ?? 0,
      level: o.level ?? 1,
      crown: o.crown ?? false,
      partIds: idsOf(parts),
      plateNumber: o.plateNumber ?? 7,
    },
    parts,
    // a bare kind is the pre-009 row: a hat with no colour recorded
    dedupeHats(o.hats ?? []),
  );
}

// ---------------------------------------------------------------------------
// (a) THE LAW: nothing in the look enters the fight
// ---------------------------------------------------------------------------

console.log("\n-- (a) nothing in the look enters the fight --");
{
  const engineDir = path.join(ROOT, "src/app/bots/_engine");
  const offenders: string[] = [];
  for (const f of fs.readdirSync(engineDir)) {
    if (!f.endsWith(".ts")) continue;
    const src = fs.readFileSync(path.join(engineDir, f), "utf8");
    if (/from\s+["'][^"']*\blook\b["']/.test(src) || /bots\/look/.test(src)) offenders.push(f);
  }
  report(offenders.length === 0, "(a) engine", offenders.length ? `imports the look: ${offenders.join(", ")}` : "no engine file imports src/lib/bots/look.ts");

  const lookSrc = fs.readFileSync(path.join(ROOT, "src/lib/bots/look.ts"), "utf8");
  const engineImports = Array.from(lookSrc.matchAll(/from\s+["']@\/app\/bots\/_engine\/([a-z-]+)["']/g)).map((m) => m[1]);
  const allowed = new Set(["parts", "rng"]);
  const extra = engineImports.filter((m) => !allowed.has(m));
  report(extra.length === 0, "(a) look", extra.length ? `reaches into the engine for ${extra.join(", ")}` : `reads only ${Array.from(new Set(engineImports)).sort().join(", ")} from the engine`);

  // the shapes the engine hands a fight carry no look field
  const partsSrc = fs.readFileSync(path.join(ROOT, "src/app/bots/_engine/parts.ts"), "utf8");
  // whole words only: "interface" is not a face, and a comment is not code
  const code = partsSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  const looky = ["face", "sticker", "hat", "crown", "mark", "marks"].filter((w) => new RegExp(`\\b${w}\\b`, "i").test(code));
  report(looky.length === 0, "(a) build", looky.length ? `the engine speaks of ${looky.join(", ")}` : "the engine's Part and Build carry no face, sticker, hat or mark");
}

// ---------------------------------------------------------------------------
// (b) FOUND: four colours at once, and only ever off a part row
// ---------------------------------------------------------------------------

console.log("\n-- (b) the colour arrives with the part --");
{
  const b = bot({ parts: FOUR_COLOUR });
  const paints = socketPaintsOf(b, FOUR_COLOUR);
  report(paints.head === "mint" && paints.torso === "coral" && paints.armL === "sky" && paints.legL === "butter", "(b) sockets", `head ${paints.head}, body ${paints.torso}, arms ${paints.armL}, legs ${paints.legL}`);
  report(paints.armL === paints.armR && paints.legL === paints.legR, "(b) pairs", "a pair card colours both of its sockets");
  report(paints.weapon === paints.armR, "(b) weapon", `the weapon rides the arm (${paints.weapon})`);
  report(ownColours(Object.values(paints)).length === 4, "(b) count", "a normal robot reads as four colours at once, not one");

  const bare = bot({ parts: [] });
  const none = socketPaintsOf(bare, []);
  report(Object.values(none).every((c) => c === null), "(b) empty", "a robot with no parts has no colours: a look cannot invent one");

  // a card with no colour written down stays colourless; nothing stands in
  const grey = [part("head", "head.hornetScope", 2), part("torso", "torso.kettleChest", 2, "coral")];
  const g = socketPaintsOf(bot({ parts: grey }), grey);
  report(g.head === null && g.torso === "coral", "(b) no fallback", "a card with no colour of its own reports none");

  const body = bodyPaints((slot) => (slot === "head" ? "mint" : slot === "torso" ? "mint" : slot === "arms" ? "mint" : "mint"));
  report(body.length === BODY_CARD_ORDER.length && colourMatched(body), "(b) match", "four body parts in one colour is the colour match");
  report(!colourMatched(["mint", "mint", "mint", "coral"] as PaintId[]), "(b) match", "three of four is not a match");
  report(!colourMatched(["mint", "mint", "mint"] as PaintId[]), "(b) match", "three parts on a robot is not a match either");
}

// ---------------------------------------------------------------------------
// (c) EARNED: the ladders, and nothing caps
// ---------------------------------------------------------------------------

console.log("\n-- (c) the ladders, and nothing caps --");
{
  const cases: [number, number, boolean, string][] = [
    // wins, stars drawn, gold, what a player should see
    [0, 0, false, "a new robot wears nothing"],
    [1, 1, false, "the first win is the first star"],
    [4, 1, false, "four wins is still one star"],
    [5, 2, false, "the second star at five"],
    [24, 5, false, "five stars just under the gold one"],
    [25, 5, true, "the sixth step is the gold star"],
    [26, 5, true, "past the gold star the drawing stops and the count does not"],
    [300, 5, true, "three hundred wins still has somewhere to go"],
  ];
  for (const [wins, stars, gold, why] of cases) {
    const m = marksOf(wins, 0, 1, false);
    const ok = m.stars === stars && m.goldStar === gold;
    report(ok, "(c) stars", `${wins} wins: ${m.stars} drawn${m.goldStar ? " plus gold" : ""}, ${why}`);
  }

  // THE CAP TEST. The drawn steps run out; the number must not.
  const at26 = marksOf(26, 0, 1, false);
  const at300 = marksOf(300, 0, 1, false);
  report(at300.starsBeyond > at26.starsBeyond, "(c) no cap", `26 wins carries ${at26.starsBeyond} past the drawing, 300 carries ${at300.starsBeyond}: the ladder keeps going`);
  const words26 = markWords(at26, 26);
  const words300 = markWords(at300, 300);
  report(words26[0] !== words300[0], "(c) no cap", `and it is SAID: "${words26[0]}" then "${words300[0]}"`);
  report(/300/.test(words300.join(" ")), "(c) no cap", `the bay sheet SAYS the real number: "${words300.join(" ")}"`);

  /**
   * AND THE PLATE CARRIES IT, which is a different claim from the sentence
   * above and used to be checked by the sentence. It was not true: LookMarks
   * had no count, so the compositor printed the robot's NAME number instead,
   * and 0 for a robot with no name number. A 103 win robot wore a plate
   * reading 0 on the fights list, the board and the knockout card while the
   * ring beside it read 103.
   *
   * The two ladders are asked the same question and have to give the same
   * answer: src/lib/bots/look.ts (the server's, which the compositor reads)
   * and src/app/bots/_view/look.ts (the rig's, which has always been right).
   */
  const ladderDrift: string[] = [];
  for (let wins = 0; wins <= 400; wins++) {
    const server = marksOf(wins, 0, 1, false).count;
    const rig = viewMarksOf({ wins, repairs: 0, level: 1, crown: false }).count;
    if (server !== rig) ladderDrift.push(`${wins} wins: server ${server} vs rig ${rig}`);
  }
  report(
    ladderDrift.length === 0,
    "(c) no cap",
    ladderDrift.length === 0
      ? `over 401 win counts the server ladder and the rig ladder print the same plate (null up to ${GOLD_STAR_AT - 1}, then the count itself)`
      : `the two ladders disagree, so a robot reads differently in the ring and on a list: ${ladderDrift.slice(0, 3).join("; ")}`,
  );
  report(
    marksOf(103, 0, 1, false).count === 103 && marksOf(24, 0, 1, false).count === null && NO_MARKS.count === null,
    "(c) no cap",
    `the count is null until the gold star and then the wins themselves: 24 -> ${marksOf(24, 0, 1, false).count}, 103 -> ${marksOf(103, 0, 1, false).count}`,
  );

  // patches: three drawn, the rest counted, never capped
  for (const [losses, drawn, beyond] of [[0, 0, 0], [1, 1, 0], [3, 3, 0], [4, 3, 1], [90, 3, 87]] as const) {
    const m = marksOf(0, losses, 1, false);
    report(m.patches === drawn && m.patchesBeyond === beyond, "(c) patches", `${losses} lost fights: ${m.patches} sewn on, ${m.patchesBeyond} counted`);
  }
  report(markWords(marksOf(0, 90, 1, false)).some((s) => /87/.test(s)), "(c) patches", "past the third patch the rest are said in words, not dropped");

  // cuffs and sparkle walk the level ladder
  for (const [level, cuffs, sparkle] of [[1, 0, false], [4, 0, false], [5, 1, false], [9, 1, false], [10, 2, true], [40, 2, true]] as const) {
    const m = marksOf(0, 0, level, false);
    report(m.cuffs === cuffs && m.sparkle === sparkle, "(c) level", `level ${level}: ${m.cuffs} cuff bands, sparkle ${m.sparkle ? "on" : "off"}`);
  }
  report(CUFF_LEVELS.length === 2 && SPARKLE_LEVEL === 10, "(c) level", `the ladder is the published one: ${CUFF_LEVELS.join(" and ")}, sparkle at ${SPARKLE_LEVEL}`);
  report(marksOf(0, 0, 1, true).crown && !marksOf(99, 99, 99, false).crown, "(c) crown", "the crown is the week's, and no number of wins buys one");
  report(STAR_STEPS.length === 6 && PATCHES_DRAWN === 3, "(c) tables", `${STAR_STEPS.length} star steps drawn, ${PATCHES_DRAWN} patches drawn`);

  // the same numbers through the row reader, not a private copy
  const b = bot({ parts: FOUR_COLOUR, wins: 26, losses: 4, level: 10 });
  const rowMarks = earnedMarks(earnedForParts(FOUR_COLOUR, { wins: b.wins, losses: b.losses, level: b.level }));
  const direct = marksOf(26, 4, 10, false);
  report(JSON.stringify(rowMarks) === JSON.stringify(direct), "(c) rows", "the row reader and the ladder agree exactly");
}

// ---------------------------------------------------------------------------
// (d) REFUSED: a claim to something nobody earned
// ---------------------------------------------------------------------------

console.log("\n-- (d) the server is the truth --");
{
  const plain = bot({ parts: FOUR_COLOUR });
  const earnedPlain = earnedForParts(FOUR_COLOUR);
  report(!earnedPlain.colourMatch && !earnedPlain.fourStar, "(d) setup", "a four colour robot with two star parts has earned neither the wink nor the stars");

  refuses("(d) face", "the wink on a robot with no colour match", () => parseLook({ face: "wink" }, earnedPlain));
  refuses("(d) face", "the stars face with no four star part", () => parseLook({ face: "stars" }, earnedPlain));
  refuses("(d) face", "a face that does not exist", () => parseLook({ face: "smug" } as BotLookRaw, earnedPlain));

  refuses("(d) sticker", "a colour the robot is not wearing", () => parseLook({ sticker: "star", stickerPaint: "lilac" }, earnedPlain));
  refuses("(d) sticker", "a colour that is not a colour", () => parseLook({ sticker: "star", stickerPaint: "gold" } as BotLookRaw, earnedPlain));
  refuses("(d) sticker", "a sticker shape nobody drew", () => parseLook({ sticker: "skull" } as BotLookRaw, earnedPlain));
  refuses("(d) sticker", "a place that is not a place", () => parseLook({ spot: "elbow" } as BotLookRaw, earnedPlain));

  refuses("(d) hat", "a hat this wallet never won", () => parseLook({ hat: "propeller" }, earnedPlain));
  refuses("(d) hat", "a hat that does not exist", () => parseLook({ hat: "sombrero" } as BotLookRaw, earnedPlain));

  // the derived half cannot be claimed at all
  const claimed = parseLook({ face: "calm", plateNumber: 99, marks: { crown: true, stars: 6 } } as BotLookRaw, earnedPlain);
  report(claimed.plateNumber === 7, "(d) derived", `a request asking for plate 99 got ${claimed.plateNumber}: the plate is the robot's own name`);
  report(!("marks" in claimed) && !("crown" in claimed), "(d) derived", "a request cannot carry a mark at all: marks are not part of what is stored");

  // and the words a player reads are words, not a code
  try {
    parseLook({ face: "wink" }, earnedPlain);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    report(/wear/i.test(msg) && !/[A-Z_]{4,}/.test(msg), "(d) words", `the refusal says what to do: "${msg}"`);
  }
}

// ---------------------------------------------------------------------------
// (e) KEPT: what WAS earned is kept, and the read path never throws
// ---------------------------------------------------------------------------

console.log("\n-- (e) what was earned is kept --");
{
  const matched = earnedForParts(ALL_MINT, { wins: 5, losses: 1, level: 5, hats: [{ kind: "bow", color: "coral" }] });
  report(matched.colourMatch, "(e) setup", "four mint body parts is the colour match");
  allows("(e) face", "the wink, once the four colours match", () => parseLook({ face: "wink" }, matched));
  allows("(e) sticker", "a sticker in a colour the robot wears", () => parseLook({ sticker: "heart", spot: "cheek", stickerPaint: "mint" }, matched));
  allows("(e) hat", "the hat this wallet won", () => parseLook({ hat: { kind: "bow", color: "coral" } }, matched));
  allows("(e) hat", "a row that named the kind alone still finds the hat it won", () => parseLook({ hat: "bow" }, matched));
  refuses("(e) hat", "a DIFFERENT hat, still not won", () => parseLook({ hat: { kind: "bell", color: "coral" } }, matched));
  refuses("(e) hat", "the RIGHT kind in a colour it never turned up in", () => parseLook({ hat: { kind: "bow", color: "moss" } }, matched));
  report(parseLook({ hat: { kind: "bow", color: "coral" } }, matched).hat?.color === "coral", "(e) hat", "the hat keeps the colour its row records");

  const four = earnedForParts(ONE_FOUR_STAR);
  report(four.fourStar, "(e) setup", "one four star part is enough for the stars face");
  allows("(e) face", "the stars face on a robot wearing a four star part", () => parseLook({ face: "stars" }, four));

  // THE READ PATH NEVER THROWS. A robot must still draw after its owner
  // takes the part out from under its sticker.
  const swapped = bot({ parts: FOUR_COLOUR, build: { look: { face: "wink", sticker: "star", spot: "chest", stickerPaint: "lilac", hat: "bow", plateNumber: 7 } } as never });
  let drew = true;
  let after;
  try {
    after = lookOf(swapped, FOUR_COLOUR, dedupeHats(["bow"]), false);
  } catch {
    drew = false;
  }
  report(drew, "(e) read", "a stored look with a colour the robot no longer wears still draws");
  report(!!after && after.stickerPaint !== "lilac" && ownColours(Object.values(socketPaintsOf(swapped, FOUR_COLOUR))).includes(after.stickerPaint!), "(e) read", `the sticker moved to a colour it is wearing (${after?.stickerPaint})`);
  report(!!after && after.hat?.kind === "bow", "(e) read", "a won hat is never taken away");

  // and a robot with no look at all is a legal robot
  const bare = lookOf(bot({ parts: [] }), []);
  report(bare.face === NO_LOOK.face && bare.sticker === null, "(e) read", "a robot that has chosen nothing draws the plain look");
  report(JSON.stringify(normalizeLook(null, NOTHING_EARNED)) === JSON.stringify(NO_LOOK), "(e) read", "nothing chosen and nothing earned is exactly NO_LOOK");
}

// ---------------------------------------------------------------------------
// (f) OLD ROWS: a fight stored before looks existed
// ---------------------------------------------------------------------------

console.log("\n-- (f) an old fight row still reads --");
{
  const build = {
    legs: { id: "legs.kettleShins", s: [2, 2, 2] as [number, number, number], paint: "butter" as PaintId },
    arms: { id: "arms.kettleGrips", s: [2, 2, 2] as [number, number, number], paint: "sky" as PaintId },
    torso: { id: "torso.kettleChest", s: [2, 2, 2] as [number, number, number], paint: "coral" as PaintId },
    head: { id: "head.hornetScope", s: [2, 2, 2] as [number, number, number], paint: "mint" as PaintId },
    weapon: { id: "weapon.steelSaw", s: [2, 2, 2] as [number, number, number] },
  };
  const id = (name: string, wins: number) => ({ name, wallet: "Copper Hare 7", wins, losses: 1, strategy: "", paint: "cream" as PaintId, tier: 2 as const, total: 30 });
  // the shape a row from before this feature actually has: no `looks` key
  const old = {
    v: 1, seed: 1, mode: "pve", difficulty: "hard", buildA: build, buildB: build,
    orders: [{ stance: 0, focus: 0 }, { stance: 0, focus: 0 }], winner: 0, frames: 600, end: "ko",
    hash: 1, chain: "", finisher: "head off", names: ["Speedy Otter 7", "Digger"],
    walletNames: ["Copper Hare 7", "House"], ids: [id("Speedy Otter 7", 12), id("Digger", 0)],
    houseShape: "bulldozer", rewards: {} as never, totalA: 30, totalB: 30,
  } as unknown as ResultJson;

  let read = true;
  let looks;
  try {
    looks = looksOf(old);
  } catch {
    read = false;
  }
  report(read, "(f) old row", "a stored fight with no look in it still reads");
  report(!!looks && looks[0].paints.head === "mint" && looks[0].paints.torso === "coral", "(f) old row", "and it reads back in its own four colours, off the build it saved");
  report(!!looks && looks[0].paints.weapon === looks[0].paints.armR, "(f) old row", "the weapon still rides the arm");
  report(!!looks && JSON.stringify(looks[0].marks) === JSON.stringify(NO_MARKS), "(f) old row", "with NO marks: a mark that was never written down is not guessed at");
  report(!!looks && looks[0].look.plateNumber === 7, "(f) old row", "the plate number comes back off the name it kept (Speedy Otter 7)");
  report(!!looks && looks[0].wins === 12, "(f) old row", "and the record it carried into that fight is the record shown");

  // a row WITH a snapshot is handed back untouched
  const snap = { ...old, looks: [{ paints: socketPaints(() => "ink" as PaintId), look: { ...NO_LOOK, face: "happy" as const }, marks: NO_MARKS, wins: 3 }, looksOf(old)[1]] } as unknown as ResultJson;
  report(looksOf(snap)[0].look.face === "happy", "(f) snapshot", "a row that DID store the look shows the robot as it was, not as it is now");
}

// ---------------------------------------------------------------------------
// (g) WORDS and the odds and ends
// ---------------------------------------------------------------------------

console.log("\n-- (g) the words a player reads --");
{
  const BANNED = ["tier", "decal", "equip", "bay", "recycle", "repair", "buy", "coins", "price", "cost", "unlock", "xp", "stat"];
  const lines: [string, string][] = [
    ...FACES.map((f) => [`face.${f.id}`, f.earn] as [string, string]),
    ...STICKERS.map((s) => [`sticker.${s.id}`, s.earn] as [string, string]),
    ...SPOTS.map((s) => [`spot.${s.id}`, s.earn] as [string, string]),
    ...HATS.map((h) => [`hat.${h.id}`, h.earn] as [string, string]),
    ...Object.entries(MARK_EARN),
    ["twin.none", twinWords(0)],
    ["twin.one", twinWords(1)],
    ["twin.many", twinWords(3)],
  ];
  let wordsOk = true;
  for (const [key, text] of lines) {
    if (/[–—]/.test(text)) {
      report(false, "(g) dash", `${key} carries a long dash: "${text}"`);
      wordsOk = false;
    }
    if (/[$%]/.test(text) || /0x[0-9a-f]{6,}/i.test(text)) {
      report(false, "(g) money", `${key} shows money or a wallet: "${text}"`);
      wordsOk = false;
    }
    const bad = BANNED.filter((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, "i").test(text));
    if (bad.length) {
      report(false, "(g) jargon", `${key} says ${bad.join(", ")}: "${text}"`);
      wordsOk = false;
    }
    if (!/[.!?]$/.test(text)) {
      report(false, "(g) sentence", `${key} is not a sentence: "${text}"`);
      wordsOk = false;
    }
  }
  report(wordsOk, "(g) lines", `${lines.length} earn lines read as plain sentences with no money and no jargon`);

  // every row carries its own line, and every id has a row
  report(FACES.length === FACE_IDS.length && STICKERS.length === STICKER_IDS.length && HATS.length === HAT_IDS.length, "(g) tables", "every face, sticker and hat has a row of its own");
  report(FACES.every((f) => f.earn.length > 8) && HATS.every((h) => h.earn === HAT_EARN), "(g) tables", "and every row says how it is got");
  report(/won/i.test(HAT_EARN) && !/(buy|shop|coin)/i.test(HAT_EARN), "(g) hats", `a hat has one way in: "${HAT_EARN}"`);

  console.log("\n-- the hat drop --");
  const a = hatDrop("1041");
  const b2 = hatDrop("1041");
  report(a === b2, "(g) hat drop", `the same fight gives the same hat every time (${a})`);
  const spread = new Set(Array.from({ length: 400 }, (_, i) => hatDrop(String(1000 + i))));
  report(spread.size === HAT_IDS.length, "(g) hat drop", `over 400 fights all ${HAT_IDS.length} hats come up`);
  report(HAT_IDS.includes(a), "(g) hat drop", "and it is always one of the six");

  console.log("\n-- how many robots look like this one --");
  const b3 = bot({ parts: FOUR_COLOUR });
  const k1 = lookKey(lookOf(b3, FOUR_COLOUR), socketPaintsOf(b3, FOUR_COLOUR));
  const k2 = lookKey(lookOf(bot({ parts: FOUR_COLOUR, wins: 40, losses: 9, level: 10 }), FOUR_COLOUR), socketPaintsOf(b3, FOUR_COLOUR));
  report(k1 === k2, "(g) twins", "two robots with the same parts and face look the same, whatever they have won");
  const mint = bot({ parts: ALL_MINT });
  report(lookKey(lookOf(mint, ALL_MINT), socketPaintsOf(mint, ALL_MINT)) !== k1, "(g) twins", "and a robot in different colours does not");
  report(twinWords(0) === "Only yours looks like this." && !/\d+ of \d+/.test(twinWords(9)), "(g) twins", `it is a count of robots and never a score: "${twinWords(9)}"`);

  // findsOf reads rows and nothing else
  const finds: LookEarned = findsOf({ wins: 3, losses: 2, level: 5, champion: true, bodyPaints: ["mint", "mint", "mint", "mint"], partStars: [4, 2, 2, 2, 2], hats: dedupeHats(["flag"]), plateNumber: 41 });
  report(finds.colourMatch && finds.fourStar && finds.champion && finds.hats[0]?.kind === "flag" && finds.repairs === 2, "(g) findsOf", "what a wallet has unlocked comes out of rows: colours, stars, a card and hat rows");
}

console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) RED`);
process.exit(failures === 0 ? 0 : 1);
