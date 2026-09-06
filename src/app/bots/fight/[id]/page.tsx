/**
 * /bots/fight/[id]: the replay page, which is the share page (engine doc 7:
 * the replay URL is the share URL).
 *
 *  - A real id (the battle row's number) renders ServerFight
 *    (../FightClient.tsx), which fetches GET /api/bots/fight/[id] with the
 *    play session when there is one (sparring is private) and hands the
 *    stored seed, both build snapshots, the orders, the mode and the hash to
 *    FightClient. The client replays and compares hashes.
 *  - An id that starts with "demo-" plays a fight from the local mock table
 *    below, so the viewer can be judged with no server row (the week 2
 *    shape, kept).
 *
 * generateMetadata reads the row on the server for the link preview: the
 * title names the winner, the description is the chain sentence, and the
 * og:image is the Knockout Card (/api/bots/card/ko). Sparring, an unknown
 * id and any read error fall back to the plain title; the card route falls
 * back to its generic card on its own. Never an address, never a dollar.
 */
import type { Metadata } from "next";
import FightClient, { ServerFight, type FightIdentity } from "../FightClient";
import { fnv1a } from "@/app/bots/_engine/rng";
import { botTier, buildTotal, type Build, type Mode, type PaintId } from "@/app/bots/_engine/parts";
import { CANON, SHAPE_INDEX, houseBuild, houseTarget, type Difficulty } from "@/app/bots/_engine/catalog";
import { HOUSE_NAME, HOUSE_TIER_INDEX } from "@/lib/bots/naming";
import { marksOf, socketPaints } from "@/lib/bots/look";
import { resolveFight } from "@/app/bots/_engine/resolve";
import { botsDb } from "@/app/bots/_server/db";
import { fightSummary, loadBattle, looksFromBuild } from "@/app/bots/_server/fights";
import type { FightIdentityView, LookView } from "@/app/bots/_server/types";

/** A replay is a stored row read per request, never a prerender. */
export const dynamic = "force-dynamic";

const TITLE = "Fight | Battle Bots";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const id = String(params.id || "");
  if (!id || id.startsWith("demo-")) return { title: TITLE };
  const image = `/api/bots/card/ko?f=${encodeURIComponent(id)}`;
  try {
    const row = await loadBattle(botsDb(), id);
    const s = row && row.mode !== "spar" ? fightSummary(row) : null;
    if (s) {
      const title = `${s.winnerName} beat ${s.loserName} | Battle Bots`;
      return {
        title,
        description: s.chain,
        openGraph: { title, description: s.chain, images: [{ url: image, width: 1200, height: 630 }] },
        twitter: { card: "summary_large_image", title, description: s.chain, images: [image] },
      };
    }
  } catch {
    /* fail soft: the plain title below */
  }
  return { title: TITLE, openGraph: { title: TITLE, images: [{ url: image, width: 1200, height: 630 }] } };
}

interface MockFight {
  seed: number;
  a: Build;
  b: Build;
  ids: [FightIdentity, FightIdentity];
  mode: Mode;
  modeLabel: string;
  /** both robots as they were at the bell, when the mock stands in for a row
   * that stored them; absent = a fight with no stored look at all */
  looks?: [LookView, LookView];
}

/** The local mock: what a stored row carries, minus the storage. The seed
 * is derived the way the server derives it, fnv1a(id + "|" + a salt), with
 * the dev salt here. */
const DEV_SALT = "dev";

// ── the look demo pair ──────────────────────────────────────────────────────
/**
 * ONE FIGHT, TWO ROWS. `demo-look` is a row resolved today: it carries the
 * snapshot of both robots as they stood at the bell. `demo-old` is a row
 * stored before looks existed, read back through the server's own fallback
 * (looksFromBuild), which recovers the colours off the saved build and leaves
 * everything that was never written down plain.
 *
 * The seed, the builds, the orders and the two owners are IDENTICAL, so the
 * two pages are the same fight frame for frame and the only thing that can
 * differ between them is the dressing. That is what makes them a proof and
 * not two pictures.
 */
const LOOK_DEMO_SEED = fnv1a(`demo-look|${DEV_SALT}`);

/** the colour each part arrived in, which it keeps for life (ADR-0141) */
function painted(b: Build, head: PaintId, torso: PaintId, arms: PaintId, legs: PaintId): Build {
  return {
    legs: { ...b.legs, paint: legs },
    arms: { ...b.arms, paint: arms },
    torso: { ...b.torso, paint: torso },
    head: { ...b.head, paint: head },
    weapon: { ...b.weapon },
  };
}

const LOOK_DEMO_A = painted(CANON.T3, "sky", "coral", "butter", "moss");
const LOOK_DEMO_B = painted(CANON.T3, "lilac", "ink", "mint", "cream");

const LOOK_DEMO_IDS: [FightIdentity, FightIdentity] = [
  { name: "Speedy Otter 7", wallet: "Brass Otter 41", wins: 27, losses: 5, strategy: "Buy low, sell high", paint: "coral" },
  { name: "Mighty Walnut 12", wallet: "Cobalt Falcon 12", wins: 3, losses: 1, strategy: "Buy at my price", paint: "ink" },
];

/** the same two identities in the shape the server's own fallback reads */
function lookDemoIdView(i: 0 | 1): FightIdentityView {
  const id = LOOK_DEMO_IDS[i];
  const build = i === 0 ? LOOK_DEMO_A : LOOK_DEMO_B;
  return { ...id, tier: botTier(buildTotal(build)), total: buildTotal(build) };
}

/** WHAT A ROW RESOLVED TODAY STORES. Side A has run the whole ladder (27 wins
 *  is past the last drawn star, so the plate carries the count and nothing
 *  caps), won a hat and this week's crown; side B has started. */
function lookDemoLooks(): [LookView, LookView] {
  return [
    {
      paints: socketPaints((slot) => LOOK_DEMO_A[slot]?.paint),
      look: { face: "stars", sticker: "star", spot: "chest", stickerPaint: "butter", hat: { kind: "propeller", color: "sky" }, plateNumber: 7 },
      marks: marksOf(27, 5, 10, true),
      wins: 27,
    },
    {
      paints: socketPaints((slot) => LOOK_DEMO_B[slot]?.paint),
      look: { face: "happy", sticker: "heart", spot: "cheek", stickerPaint: "mint", hat: null, plateNumber: 12 },
      marks: marksOf(3, 1, 5, false),
      wins: 3,
    },
  ];
}

function mockFor(id: string): MockFight | null {
  const seed = fnv1a(`${id}|${DEV_SALT}`);
  if (id === "demo-look" || id === "demo-old") {
    return {
      seed: LOOK_DEMO_SEED,
      a: LOOK_DEMO_A,
      b: LOOK_DEMO_B,
      ids: LOOK_DEMO_IDS,
      mode: "pvp",
      modeLabel: "Player fight, saved copy",
      // the new row carries its snapshot; the old row is read back through the
      // server's own fallback, which is the code a real old row goes through
      looks:
        id === "demo-look"
          ? lookDemoLooks()
          : [looksFromBuild(LOOK_DEMO_A, lookDemoIdView(0)), looksFromBuild(LOOK_DEMO_B, lookDemoIdView(1))],
    };
  }
  if (id === "demo-spar") {
    return {
      seed,
      a: CANON.T2,
      b: CANON.T2,
      ids: [
        { name: "Rusty Beetle", wallet: "Brass Otter 41", wins: 8, losses: 2, strategy: "Buy low, sell high", paint: "mint" },
        { name: "Big Bruiser", wallet: "Copper Hare 7", wins: 5, losses: 4, strategy: "Build a Position", paint: "coral" },
      ],
      mode: "spar",
      modeLabel: "Spar",
    };
  }
  const pve = /^demo-pve-(easy|medium|hard)$/.exec(id);
  if (pve) {
    const difficulty = pve[1] as Difficulty;
    const player = CANON.T2;
    const shape = { easy: "kettle", medium: "anvil", hard: "bulldozer" }[difficulty];
    // the opponent has a NAME (the nine nicknames) and its difficulty sits on
    // its own line above it. "Scrapper", "Foreman" and "Big Rig" were three job
    // words a player could not put in order, and two of them read as names.
    const title = HOUSE_NAME[shape] ?? SHAPE_INDEX[shape].name;
    const rank = HOUSE_TIER_INDEX[difficulty].label;
    return {
      seed,
      a: player,
      b: houseBuild(shape, houseTarget(difficulty, 35)),
      ids: [
        { name: "Rusty Beetle", wallet: "Brass Otter 41", wins: 8, losses: 2, strategy: "Buy low, sell high", paint: "mint" },
        { name: title, wallet: "The game", wins: 0, losses: 0, strategy: "Game robot", paint: "butter" },
      ],
      mode: "pve",
      modeLabel: `Game robot, ${rank}`,
    };
  }
  if (id === "demo-pvp") {
    return {
      seed,
      a: CANON.T3,
      b: CANON.T2,
      ids: [
        { name: "Mighty Walnut", wallet: "Cobalt Falcon 12", wins: 11, losses: 3, strategy: "Buy at my price", paint: "sky" },
        { name: "Rusty Beetle", wallet: "Brass Otter 41", wins: 8, losses: 2, strategy: "Buy low, sell high", paint: "mint" },
      ],
      mode: "pvp",
      modeLabel: "Player fight, saved copy",
    };
  }
  return null;
}

export default function FightPage({ params }: { params: { id: string } }) {
  const id = String(params.id || "");
  if (!id.startsWith("demo-")) return <ServerFight id={id} />;
  const mock = mockFor(id);
  if (!mock) return <ServerFight id={id} />;
  // the stored hash: what a server row carries; the client compares
  const stored = resolveFight(mock.seed, mock.a, mock.b, undefined, undefined, mock.mode);
  return (
    <FightClient
      seed={mock.seed}
      a={mock.a}
      b={mock.b}
      ids={mock.ids}
      looks={mock.looks}
      mode={mock.mode}
      modeLabel={mock.modeLabel}
      expectedHash={stored.hash}
      replayUrl={`/bots/fight/${id}`}
      watchAnotherHref={id === "demo-spar" ? "/bots/fight/demo-pve-medium" : "/bots/fight/demo-spar"}
    />
  );
}
