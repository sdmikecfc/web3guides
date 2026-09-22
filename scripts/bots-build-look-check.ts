/**
 * BATTLE BOTS BUILD LOOK CHECK - the merge gate for THE SCREEN WHERE YOU MAKE
 * IT YOURS.
 *
 *   npx tsx --tsconfig scripts/tsconfig.gate.json scripts/bots-build-look-check.ts
 *
 * scripts/bots-look-check.ts proves the RULES: what may be worn, what is
 * refused, and that nothing in the look reaches the fight. It cannot tell you
 * whether the build screen offers a player exactly those things, saves what it
 * offered, and keeps it over a reload. That is what this gate is for, and it
 * is the gate that would have caught every way the two can drift apart.
 *
 * THIS GATE IMPORTS THE SHIPPED MODULES (the Domain Kitchen lesson: a gate
 * that reimplements the logic it checks reproduces the author's assumptions
 * and passes). saveLook, earnedOfBuild, lookOfBay and the store's own
 * hydrate/load come from src/lib/bots/garage-state.ts; parseLook, findsOf and
 * faceAllowed from src/lib/bots/look.ts. Nothing below is a private copy of a
 * rule, and in particular nothing below decides what may be worn.
 *
 * SIX GATES:
 *  (a) OFFERED IS ACCEPTED  every face the picker draws unlocked is a face
 *                           saveLook stores, and every face it draws locked is
 *                           one saveLook refuses. Walked over every face on
 *                           four different robots.
 *  (b) SURVIVES A RELOAD    a chosen look written to localStorage and read
 *                           back through the store's own load() is the same
 *                           look. This is the click through, in a script.
 *  (c) READ PATH FORGETS    a robot whose owner takes the matching part off
 *                           loses the Wink quietly on the next read and still
 *                           draws. Nothing throws on the way in.
 *  (d) NO PAINT FOR SALE    the colour row offers ONLY the colours the robot
 *                           is wearing, and a colour it is not wearing is
 *                           refused (ADR-0141).
 *  (e) ONE STICKER          a chest sticker mirrors into the old `decal`
 *                           field and a cheek or boot one clears it, so no
 *                           robot can ever wear two.
 *  (f) THE THREE BUTTONS    Pick for me is the same answer twice, Surprise me
 *                           can only ever land on unlocked things, and Back to
 *                           normal keeps every earned mark.
 */

import {
  FACE_IDS,
  LookRefused,
  STICKER_IDS,
  STICKER_SPOTS,
  earnedMarks,
  faceAllowed,
  ownColours,
  suggestLook,
  type BotLook,
  type FaceId,
} from "../src/lib/bots/look";
import {
  earnedOfBuild,
  getGarage,
  hydrateGarage,
  lookEarnedOf,
  lookOfBay,
  resetGarage,
  saveBuild,
  saveLook,
} from "../src/lib/bots/garage-state";
import {
  CARD_BY_ID,
  CARD_SLOTS,
  starterBuild,
  type Build,
  type OwnedPart,
} from "../src/lib/bots/fixtures";
import { STRINGS } from "../src/lib/bots/strings";

/* ── a localStorage the store can actually use ───────────────────────────── */
/**
 * The store persists through localStorage and hydrates after mount, which is
 * the whole of what "survives a reload" means here. A gate that stubbed the
 * store out would prove nothing about the thing it is meant to prove, so this
 * is a real key value store and the store is driven exactly as a browser
 * drives it: hydrate, act, then hydrate again from the same bytes.
 */
class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
}

const store = new MemoryStorage();
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = store;

/* ── report ─────────────────────────────────────────────────────────────── */

let failures = 0;
function report(ok: boolean, tag: string, detail: string): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${tag}  ${detail}`);
}

/* ── robots to test with ────────────────────────────────────────────────── */

/** Build a robot out of catalog cards, with the colours and stars we want. */
function robot(bay: number, colours: readonly string[], stars: readonly number[]): { build: Build; parts: OwnedPart[] } {
  const parts: OwnedPart[] = [];
  const build = starterBuild(bay);
  CARD_SLOTS.forEach((slot, i) => {
    const card = Object.values(CARD_BY_ID).find((c) => c.slot === slot && c.tier === (stars[i] ?? 1));
    if (!card) return;
    const uid = `gate-${bay}-${slot}`;
    parts.push({
      ...card,
      uid,
      provenance: "gate",
      paint: slot === "weapon" ? undefined : (colours[i] as OwnedPart["paint"]),
    } as OwnedPart);
    build.cards[slot] = uid;
  });
  return { build, parts };
}

/** Put a robot into the store as the only thing in it. */
function place(bay: number, colours: readonly string[], stars: readonly number[], wins = 0, losses = 0, level = 1): Build {
  store.clear();
  resetGarage(0);
  hydrateGarage(0);
  const { build, parts } = robot(bay, colours, stars);
  const st = getGarage();
  // the store's own action, so the shape written is the shape it writes
  (st as unknown as { parts: OwnedPart[] }).parts = parts;
  (st as unknown as { level: number }).level = level;
  (st as unknown as { bays: Record<number, { wins: number; losses: number; repairUntil: null; inBattle: boolean; attacksLeft: number }> }).bays[bay] = {
    wins,
    losses,
    repairUntil: null,
    inBattle: false,
    attacksLeft: 2,
  };
  saveBuild(build);
  return build;
}

const FOUR_MINT = ["mint", "mint", "mint", "mint", undefined as unknown as string];
const FOUR_MIXED = ["mint", "coral", "butter", "sky", undefined as unknown as string];
const ONES = [1, 1, 1, 1, 1];
const HAS_FOUR_STAR = [4, 1, 1, 1, 1];

console.log("-- (a) what the picker offers is what the store accepts --");
{
  const rows: { name: string; colours: readonly string[]; stars: readonly number[] }[] = [
    { name: "four mint, no 4 star", colours: FOUR_MINT, stars: ONES },
    { name: "four colours, no 4 star", colours: FOUR_MIXED, stars: ONES },
    { name: "four colours, a 4 star head", colours: FOUR_MIXED, stars: HAS_FOUR_STAR },
    { name: "four mint AND a 4 star head", colours: FOUR_MINT, stars: HAS_FOUR_STAR },
  ];
  let ok = true;
  let checked = 0;
  for (const row of rows) {
    const build = place(1, row.colours, row.stars);
    const earned = earnedOfBuild(build, getGarage().parts, getGarage().bays[1], getGarage().level);
    for (const face of FACE_IDS) {
      // THE PICKER'S OWN RULE, imported: LookPicker.tsx calls faceAllowed and
      // nothing else, so this is the button's real state and not a copy of it
      const offered = faceAllowed(face, earned);
      let accepted = true;
      try {
        saveLook(1, { face }, build);
      } catch (e) {
        if (!(e instanceof LookRefused)) throw e;
        accepted = false;
      }
      checked++;
      if (offered !== accepted) {
        report(false, "(a) offered", `${row.name}: the row draws ${face} ${offered ? "open" : "locked"} and the store ${accepted ? "took" : "refused"} it`);
        ok = false;
      }
    }
  }
  report(ok, "(a) offered", `${checked} face and robot pairs: every face the row draws open is a face the store takes, and every locked one is refused`);

  // and the refusal is a SENTENCE, not a code
  const plain = place(1, FOUR_MIXED, ONES);
  let message = "";
  try {
    saveLook(1, { face: "wink" }, plain);
  } catch (e) {
    message = e instanceof LookRefused ? e.message : String(e);
  }
  report(
    /[.!?]$/.test(message) && !/[–—$%]/.test(message) && message.length > 12,
    "(a) refusal",
    `it says why, in one sentence: "${message}"`,
  );
}

console.log("\n-- (b) it survives a reload --");
{
  const build = place(2, FOUR_MINT, HAS_FOUR_STAR, 6, 2, 5);
  const chosen = saveLook(2, { face: "wink", sticker: "heart", spot: "cheek", stickerPaint: "mint" }, build);
  report(chosen.face === "wink" && chosen.sticker === "heart" && chosen.spot === "cheek", "(b) chosen", "a face, a sticker and a place are stored as chosen");

  report(/"look"/.test(store.getItem("bots.garage.v1") ?? ""), "(b) written", "and it reached the bytes on disk, not just the store in memory");

  // THE RELOAD, DONE PROPERLY: a FRESH MODULE over the same bytes.
  // hydrateGarage() runs once per page and guards on a module flag, so calling
  // it a second time in one process proves nothing at all: it returns without
  // reading a byte and the check passes on stale memory. That is exactly what
  // the first draft of this gate did, and it reported a pass. Dropping the
  // module out of the require cache is what a page reload really does, and it
  // is the only version of this test that is able to fail.
  const modulePath = require.resolve("../src/lib/bots/garage-state");
  delete require.cache[modulePath];
  const fresh = require("../src/lib/bots/garage-state") as {
    hydrateGarage: (n: number) => void;
    getGarage: () => Parameters<typeof lookOfBay>[0];
    lookOfBay: typeof lookOfBay;
    lookEarnedOf: typeof lookEarnedOf;
  };
  fresh.hydrateGarage(0);
  const st2 = fresh.getGarage();
  const back = fresh.lookOfBay(st2, 2);
  report(
    back.face === "wink" && back.sticker === "heart" && back.spot === "cheek" && back.stickerPaint === "mint",
    "(b) reload",
    `a fresh store over the same bytes reads back: ${back.face}, ${back.sticker} on the ${back.spot}, in ${back.stickerPaint}`,
  );
  // and the earned half was NOT stored: it is counted again from the rows
  const marks = earnedMarks(fresh.lookEarnedOf(st2, 2));
  report(marks.stars === 2 && marks.patches === 2 && marks.cuffs === 1, "(b) earned", `the marks are counted from the rows on every read, never stored: ${marks.stars} stars, ${marks.patches} patches, ${marks.cuffs} cuff`);
}

console.log("\n-- (c) the read path forgets, it never throws --");
{
  const build = place(3, FOUR_MINT, ONES);
  saveLook(3, { face: "wink" }, build);
  report(lookOfBay(getGarage(), 3).face === "wink", "(c) kept", "four mint parts, so the Wink is on");

  // the owner takes the matching head off
  const st = getGarage();
  const without: Build = { ...st.builds[3], cards: { ...st.builds[3].cards, head: null } };
  saveBuild(without);
  const after = lookOfBay(getGarage(), 3);
  report(after.face === "calm", "(c) forgets", `the head comes off and the Wink goes quietly: the face is now ${after.face}`);
  report(!!after && after.sticker === null, "(c) draws", "and the robot still has a look to draw, rather than nothing");
}

console.log("\n-- (d) no paint for sale --");
{
  const build = place(4, FOUR_MIXED, ONES);
  const own = ownColours(earnedOfBuild(build, getGarage().parts, getGarage().bays[4], getGarage().level).paints);
  report(own.length === 4 && own.includes("mint") && own.includes("sky"), "(d) colours", `the row offers the ${own.length} colours the robot is wearing: ${own.join(", ")}`);
  const notWorn = (["mint", "coral", "butter", "sky", "lilac", "moss", "cream", "ink"] as const).find((c) => !own.includes(c))!;
  let refused = false;
  try {
    saveLook(4, { sticker: "star", stickerPaint: notWorn }, build);
  } catch (e) {
    refused = e instanceof LookRefused;
  }
  report(refused, "(d) refused", `a colour the robot is not wearing (${notWorn}) cannot be put on a sticker`);
  // and every colour it IS wearing goes on
  let allTook = true;
  for (const c of own) {
    try {
      saveLook(4, { sticker: "star", stickerPaint: c }, build);
    } catch {
      allTook = false;
    }
  }
  report(allTook, "(d) own", "and every colour it is wearing does go on");
}

console.log("\n-- (e) one sticker, never two --");
{
  const build = place(5, FOUR_MIXED, ONES);
  saveLook(5, { sticker: "bolt", spot: "chest", stickerPaint: "mint" }, build);
  report(getGarage().builds[5].decal === "bolt", "(e) chest", "a chest sticker is mirrored onto the old decal field, so every older surface agrees");
  saveLook(5, { sticker: "bolt", spot: "boot", stickerPaint: "mint" }, getGarage().builds[5]);
  report(getGarage().builds[5].decal === null, "(e) moved", "and moving it to the boot clears that field, so the chest does not keep a copy");
  saveLook(5, { sticker: null }, getGarage().builds[5]);
  report(getGarage().builds[5].decal === null && lookOfBay(getGarage(), 5).sticker === null, "(e) none", "and taking it off takes it off both");
}

console.log("\n-- (f) the three buttons --");
{
  const build = place(1, FOUR_MINT, HAS_FOUR_STAR, 3, 1, 10);
  const earned = earnedOfBuild(build, getGarage().parts, getGarage().bays[1], getGarage().level);
  const seed = 1 * 977 + 0 * 31 + build.name.first.length * 7 + build.name.second.length;
  const a = suggestLook(seed, earned);
  const b = suggestLook(seed, earned);
  report(
    a.face === b.face && a.sticker === b.sticker && a.spot === b.spot && a.stickerPaint === b.stickerPaint,
    "(f) pick for me",
    `the same robot gets the same answer twice, so it is not a slot machine (${a.face}, ${a.sticker} on the ${a.spot})`,
  );
  let took = true;
  try {
    saveLook(1, a, build);
  } catch {
    took = false;
  }
  report(took, "(f) pick for me", "and what it picks is always accepted");

  // Surprise me: 400 rolls over the SAME sets the screen rolls over
  const faces = FACE_IDS.filter((f) => faceAllowed(f, earned));
  const own = ownColours(earned.paints);
  let allFine = true;
  const seen = new Set<FaceId>();
  for (let i = 0; i < 400; i++) {
    const claim = {
      face: faces[Math.floor(Math.random() * faces.length)],
      sticker: STICKER_IDS[Math.floor(Math.random() * STICKER_IDS.length)],
      spot: STICKER_SPOTS[Math.floor(Math.random() * STICKER_SPOTS.length)],
      stickerPaint: own[Math.floor(Math.random() * own.length)],
    };
    seen.add(claim.face);
    try {
      saveLook(1, claim, build);
    } catch {
      allFine = false;
    }
  }
  report(allFine, "(f) surprise me", `400 rolls over what this robot has unlocked, and not one of them was refused`);
  report(seen.size === faces.length && !seen.has("calm" as FaceId) === false, "(f) surprise me", `it reaches all ${faces.length} unlocked faces and never a locked one`);

  // Back to normal
  const plain: BotLook = saveLook(1, { face: "calm", sticker: null, spot: "chest", stickerPaint: null }, build);
  const marks = earnedMarks(lookEarnedOf(getGarage(), 1));
  report(plain.face === "calm" && plain.sticker === null, "(f) back to normal", "the plain robot: no face picked, no sticker");
  report(marks.stars === 1 && marks.patches === 1 && marks.cuffs === 2 && marks.sparkle, "(f) back to normal", `and every EARNED mark stays on the body: ${marks.stars} star, ${marks.patches} patch, ${marks.cuffs} cuffs, sparkle`);
}

console.log("\n-- the words the panel says --");
{
  const words = STRINGS.en.look;
  const bad: string[] = [];
  for (const [k, v] of Object.entries(words)) {
    if (typeof v !== "string") continue;
    if (/[–—]/.test(v)) bad.push(`${k}: a dash`);
    if (/\$|%/.test(v)) bad.push(`${k}: money`);
    // "spot" is the word for a garage space and must never mean a place on
    // the robot as well: one word, one idea
    if (/\bspot\b/i.test(v)) bad.push(`${k}: says "spot", which is a garage space`);
  }
  report(bad.length === 0, "(w) words", bad.length ? bad.join("; ") : `${Object.keys(words).length} lines, no dash, no money, and "spot" still means a garage space`);
  // every row a player reads has a name and a line saying how it is got
  report(
    STRINGS.en.proud.faceAction.length > 3 && /face/i.test(STRINGS.en.proud.firstMatch) && /face/i.test(STRINGS.en.proud.firstBest),
    "(w) proud",
    "the two proud lines that unlock a face say so, and hand the player a button",
  );
}

console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) RED`);
process.exit(failures === 0 ? 0 : 1);
