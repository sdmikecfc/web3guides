/**
 * BATTLE BOTS PORTRAIT: one square picture of one robot, painted.
 *
 *   GET /api/bots/portrait?b=<botId>&s=<64|120|300|432>[&v=<updated_at>]
 *   GET /api/bots/portrait?f=<fightId>&w=<0|1>&s=<size>
 *   GET /api/bots/portrait?h=<shapeId>&t=<size 5..100>&s=<size>
 *
 * THE ONE COMPOSITOR. Everything that shows a small robot points here: the
 * fights list, the board, the knockout card. Before it, each of those drew
 * its own thing, and all three were wrong in the same way, showing a grey
 * clay dummy or one flat colour for a robot that is normally FOUR colours.
 * One route means one answer, and a robot that changes changes everywhere.
 *
 * THE SERVER IS THE TRUTH, and this is why the query carries a robot's ID
 * and never its look. What a robot wears is derived from rows here
 * (_server/bots.ts lookOf and earnedOf), so a caller cannot ask for a crown
 * it did not win by putting one in a URL. `v` is a cache buster, nothing
 * more: it is never read as data.
 *
 * IT NEVER FAILS HARD. A portrait is an <img> in a list; a 500 there is a
 * broken box on a page that was otherwise fine. An unknown id, an incomplete
 * robot, a database that is down and a missing art folder all end in the
 * same place: a plain unpainted robot, drawn from the starter kit, 200 OK.
 * The one thing that is refused is a private fight (a practice bout), which
 * falls back the same way rather than telling anyone it exists.
 *
 * NODE RUNTIME, deliberately, and the opposite call from the knockout card
 * next door. That card runs on the edge because next/og's node build reads a
 * font through an import.meta.url join that a Windows dev box turns into an
 * invalid file URL. This route uses no next/og at all: it composites raw
 * pixels and needs node:zlib for the PNG, which the edge runtime has not
 * got.
 */
import { NextResponse } from "next/server";
import { STARTER_KIT } from "@/lib/bots/fixtures";
import { NO_LOOK, NO_MARKS, earnedMarks, type BotLook, type LookMarks } from "@/lib/bots/look";
import type { Build, Part, Slot } from "@/app/bots/_engine/parts";
import { houseBuild } from "@/app/bots/_engine/catalog";
import { nearestPortraitSize } from "@/app/bots/_view/pieces";
import { botsDb } from "@/app/bots/_server/db";
import {
  earnedOf,
  engineBuildOf,
  loadBot,
  loadCrownBotIds,
  loadHats,
  loadPartsOfBot,
  lookOf,
} from "@/app/bots/_server/bots";
import { canonicalBuild, loadBattle } from "@/app/bots/_server/fight-read";
import { fnv1a } from "@/app/bots/_engine/rng";
import { renderPortrait, type ArtCache, type LoadArt } from "./render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** the eighty part files, decoded once per warm process (see ArtCache) */
const ART: ArtCache = new Map();
/** the raw bytes, so a cold cache after a redeploy is one fetch per file */
const BYTES = new Map<string, Uint8Array | null>();

function loaderFor(origin: string): LoadArt {
  return async (path) => {
    const hit = BYTES.get(path);
    if (hit !== undefined) return hit;
    let out: Uint8Array | null = null;
    try {
      const r = await fetch(origin + path, { cache: "force-cache" });
      if (r.ok) out = new Uint8Array(await r.arrayBuffer());
    } catch {
      out = null;
    }
    BYTES.set(path, out);
    return out;
  };
}

/**
 * The robot every failure draws: the starter kit, unpainted, no look, no
 * marks. It is a real legal build, so the compositor takes the same path it
 * takes for a champion and there is no second rendering path to rot.
 */
function starterBuild(): Build {
  const of = (slot: Slot): Part => {
    const c = STARTER_KIT.find((k) => k.slot === slot) ?? STARTER_KIT[0];
    return { id: c.id, s: [c.s[0], c.s[1], c.s[2]] };
  };
  return { legs: of("legs"), arms: of("arms"), torso: of("torso"), head: of("head"), weapon: of("weapon") };
}

interface Subject {
  build: Build;
  look: BotLook;
  marks: LookMarks;
  /** what makes the picture different, for the ETag */
  key: string;
}

const FALLBACK: () => Subject = () => ({
  build: starterBuild(),
  look: NO_LOOK,
  marks: NO_MARKS,
  key: "starter",
});

/** A bay robot: its build, its look and its marks, all off its own rows. */
async function subjectOfBot(id: number): Promise<Subject | null> {
  const db = botsDb();
  const row = await loadBot(db, id);
  if (!row) return null;
  const parts = await loadPartsOfBot(db, row.id);
  const build = engineBuildOf(row, parts);
  if (!build) return null; // an unfinished robot has no picture yet
  const [hats, crowns] = await Promise.all([
    loadHats(db, row.wallet).catch(() => []),
    loadCrownBotIds(db, row.wallet).catch(() => new Set<number>()),
  ]);
  const crown = crowns.has(row.id);
  const earned = earnedOf(row, parts, hats, crown);
  return {
    build,
    look: lookOf(row, parts, hats, crown),
    marks: earnedMarks(earned),
    // WHAT MAKES THE PICTURE DIFFERENT, and nothing else: the parts it is
    // wearing and the look it chose (both in the build JSON), plus the four
    // numbers the earned marks are walked from. The row has no updated_at in
    // the columns this module selects, and adding one to the select for a
    // cache key would be a wider read on every list page.
    key: `b${row.id}:${fnv1a(`${JSON.stringify(row.build)}|${row.wins}|${row.losses}|${row.level}|${crown}|${hats.join(",")}`).toString(36)}`,
  };
}

/**
 * A GAME ROBOT, built the way the fight itself builds one.
 *
 * The house's robots exist for the length of one fight and are in no table,
 * so the battles page's ladder had nothing to ask a picture for and kept a
 * drawn stand-in: six rounded rectangles beside eleven composited robots,
 * which read as a placeholder. This draws the real shape at the real size.
 *
 * IT ASKS NOTHING OF THE PLAYER'S SIDE. A shape id and a size are the two
 * values the ladder already publishes (PveLadderRow), houseBuild is the pure
 * engine function the fight route itself calls, and a game robot has no
 * owner, so no look, no marks, no hat and no paint: unpainted clay, which is
 * exactly what one looks like when it wins a fight and lands in the list.
 * There is nothing here a url could claim that has to be earned.
 */
function subjectOfHouse(shapeId: string, total: number): Subject | null {
  let build: Build;
  try {
    build = houseBuild(shapeId, total);
  } catch {
    return null; // an id the catalogue has never heard of
  }
  return { build, look: NO_LOOK, marks: NO_MARKS, key: `h${shapeId}:${total}` };
}

/**
 * One side of a finished fight. The BUILD is the one the fight was resolved
 * with, because a card of a fight must show the robot that fought it and not
 * the robot its owner has rebuilt since. The LOOK is the robot's today, and
 * best effort: a robot that has been recycled since still gets its parts
 * drawn, just with no face on it.
 */
async function subjectOfFight(id: string, side: 0 | 1): Promise<Subject | null> {
  const db = botsDb();
  const row = await loadBattle(db, id);
  // a practice bout is private: it gets the plain robot, like an unknown id
  if (!row || row.status !== "resolved" || !row.result || row.mode === "spar") return null;
  const build = canonicalBuild(side === 0 ? row.result.buildA : row.result.buildB);
  const botId = side === 0 ? row.challenger_bot_id : row.defender_bot_id;
  let look = NO_LOOK;
  let marks = NO_MARKS;
  if (botId) {
    try {
      const bot = await loadBot(db, botId);
      if (bot) {
        const parts = await loadPartsOfBot(db, bot.id);
        const [hats, crowns] = await Promise.all([
          loadHats(db, bot.wallet).catch(() => []),
          loadCrownBotIds(db, bot.wallet).catch(() => new Set<number>()),
        ]);
        const crown = crowns.has(bot.id);
        look = lookOf(bot, parts, hats, crown);
        marks = earnedMarks(earnedOf(bot, parts, hats, crown));
      }
    } catch {
      /* the parts are the picture; a look is a bonus */
    }
  }
  return { build, look, marks, key: `f${row.id}:${side}:${row.resolved_at ?? row.created_at}` };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const size = nearestPortraitSize(Number(url.searchParams.get("s")) || 300);
  const b = String(url.searchParams.get("b") || "").slice(0, 12);
  const f = String(url.searchParams.get("f") || "").slice(0, 12);
  const h = String(url.searchParams.get("h") || "").slice(0, 24);
  const w = url.searchParams.get("w") === "1" ? 1 : 0;
  // a game robot's size: the ladder's own number when it has one (it has
  // none until the player picks a robot), else the middle of the range
  const t = Math.max(5, Math.min(100, Math.round(Number(url.searchParams.get("t")) || 0) || 20));

  let subject: Subject | null = null;
  try {
    if (/^\d{1,10}$/.test(b)) subject = await subjectOfBot(Number(b));
    else if (/^\d{1,10}$/.test(f)) subject = await subjectOfFight(f, w as 0 | 1);
    else if (/^[a-z0-9_-]{1,24}$/.test(h)) subject = subjectOfHouse(h, t);
  } catch {
    subject = null; // a database that is down still draws a robot
  }
  const known = !!subject;
  const s = subject ?? FALLBACK();

  const etag = `"bb-portrait-${size}-${s.key}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  let png: Uint8Array;
  try {
    const out = await renderPortrait(
      { build: s.build, look: s.look, marks: s.marks },
      size,
      loaderFor(url.origin),
      ART,
    );
    png = out.png;
  } catch {
    // the compositor itself fell over: one more try with the plainest robot
    // there is, and if that fails too the caller gets an honest empty answer
    try {
      const bare = FALLBACK();
      const out = await renderPortrait({ build: bare.build, look: bare.look, marks: bare.marks }, size, async () => null);
      png = out.png;
    } catch {
      return new NextResponse("portrait unavailable", { status: 500 });
    }
  }

  // A url that carries a `v` names one version of one robot, so it can be
  // kept for a year. One without it is a robot that may change in the next
  // minute, so it is kept for five. A GAME robot is a pure function of its
  // shape and its size and has no owner to change it, so it is a year too.
  const versioned = known && (!!url.searchParams.get("v") || s.key.startsWith("h"));
  return new NextResponse(Buffer.from(png), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      "Cache-Control": versioned
        ? "public, max-age=31536000, immutable"
        : known
          ? "public, max-age=300, stale-while-revalidate=3600"
          : "public, max-age=60",
      ETag: etag,
    },
  });
}
