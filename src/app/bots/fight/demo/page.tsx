/**
 * /bots/fight/demo?seed=7&a=T2&b=T2 (or a=shape:Kettle@35): the dev page
 * that plays a fight locally between two catalog builds, so the viewer can
 * be judged before the server exists (week 3). Same fighter grammar as the
 * CLI printer (scripts/bots-fight.ts): T1..T4 are the reference fighters,
 * shape:<name>@<total> is a house shape scaled; the seed is a whole number
 * or any string hashed with fnv1a. The hash the page prints must equal the
 * one the CLI prints for the same arguments.
 */
import type { Metadata } from "next";
import FightClient, { type FightIdentity } from "../FightClient";
import { fnv1a } from "@/app/bots/_engine/rng";
import { NO_ORDERS, type Build, type CanonKey, type Orders } from "@/app/bots/_engine/parts";
import { CANON, CANON_NAMES, SHAPES, scaleShape } from "@/app/bots/_engine/catalog";
import { PageShell } from "@/app/bots/_components/PageShell";
import { FONT_MONO, M } from "@/app/bots/_ui/tokens";

export const metadata: Metadata = {
  title: "Fight demo | Battle Bots",
};

export const dynamic = "force-dynamic";

type Query = Record<string, string | string[] | undefined>;

const one = (q: Query, key: string, dflt: string): string => {
  const v = q[key];
  return (Array.isArray(v) ? v[0] : v) ?? dflt;
};

function parseSeed(raw: string): number {
  return /^\d+$/.test(raw) ? Number(raw) >>> 0 : fnv1a(raw);
}

function parseFighter(raw: string): { build: Build; name: string } | null {
  const canon = raw.toUpperCase();
  if (/^T[1-4]$/.test(canon)) {
    const key = canon as CanonKey;
    return { build: CANON[key], name: CANON_NAMES[key] };
  }
  const m = /^shape:([A-Za-z ]+)@(\d+)$/.exec(raw);
  if (m) {
    const want = m[1].toLowerCase().replace(/\s+/g, "");
    const shape = SHAPES.find((s) => s.id === want || s.name.toLowerCase().replace(/\s+/g, "") === want);
    if (!shape) return null;
    const total = Number(m[2]);
    if (total < 5 || total > 100) return null;
    return { build: scaleShape(shape, total), name: shape.name };
  }
  return null;
}

function order(q: Query, side: "A" | "B"): Orders {
  const st = Number(one(q, `stance${side}`, "0")) | 0;
  const fo = Number(one(q, `focus${side}`, "0")) | 0;
  return {
    ...NO_ORDERS,
    stance: (st >= 0 && st <= 2 ? st : 0) as Orders["stance"],
    focus: (fo >= 0 && fo <= 4 ? fo : 0) as Orders["focus"],
  };
}

export default function FightDemoPage({ searchParams }: { searchParams: Query }) {
  const seedRaw = one(searchParams, "seed", "7");
  const aRaw = one(searchParams, "a", "T2");
  const bRaw = one(searchParams, "b", "T2");
  const seed = parseSeed(seedRaw);
  const A = parseFighter(aRaw);
  const B = parseFighter(bRaw);
  if (!A || !B) {
    return (
      <PageShell wide>
        <p style={{ fontFamily: FONT_MONO, fontSize: 13, color: M.muted, marginTop: 24 }}>
          Bad fighter. Use T1, T2, T3, T4 or shape:Kettle@35. Shapes: {SHAPES.map((s) => s.name).join(", ")}.
        </p>
      </PageShell>
    );
  }
  // the CLI's rule: a mirror gets A and B suffixes so the commentary reads
  let nameA = A.name;
  let nameB = B.name;
  if (nameA === nameB) {
    nameA = `${nameA} A`;
    nameB = `${nameB} B`;
  }
  const ids: [FightIdentity, FightIdentity] = [
    { name: nameA, wallet: "Brass Otter 41", wins: 8, losses: 2, strategy: "Buy Low Sell High", paint: "mint" },
    { name: nameB, wallet: "Copper Hare 7", wins: 5, losses: 4, strategy: "Build a Position", paint: "coral" },
  ];
  const nextSeed = (seed + 1) >>> 0;
  return (
    <FightClient
      seed={seed}
      a={A.build}
      b={B.build}
      ids={ids}
      mode="spar"
      /* was "Spar . seed 7": the lone full stop used as a divider is banned
         (strings.ts), and "spar" is not a word a new player knows. The one
         word for a free fight is "practice". */
      modeLabel={`Practice fight, number ${seed}`}
      orders={[order(searchParams, "A"), order(searchParams, "B")]}
      replayUrl={`/bots/fight/demo?seed=${seed}&a=${encodeURIComponent(aRaw)}&b=${encodeURIComponent(bRaw)}`}
      watchAnotherHref={`/bots/fight/demo?seed=${nextSeed}&a=${encodeURIComponent(aRaw)}&b=${encodeURIComponent(bRaw)}`}
    />
  );
}
