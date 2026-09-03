/**
 * /bots/fight/[id]: the replay page, which is the share page (engine doc 7:
 * the replay URL is the share URL). Week 2 shape: an id that starts with
 * "demo-" plays a fight from the local mock table below; any other id shows
 * "Fight not found yet", because the server row (seed, both build
 * snapshots, orders, mode, engine version, hash) lands in week 3. When it
 * does, this page fetches the row and hands the same props to FightClient;
 * the hash comparison already lives in the client.
 */
import type { Metadata } from "next";
import Link from "next/link";
import FightClient, { type FightIdentity } from "../FightClient";
import { PageShell } from "@/app/bots/_components/PageShell";
import { FONT_DISPLAY, FONT_MONO, M, R, TAP } from "@/app/bots/_ui/tokens";
import { fnv1a } from "@/app/bots/_engine/rng";
import { type Build, type Mode } from "@/app/bots/_engine/parts";
import { CANON, houseBuild, houseTarget, type Difficulty } from "@/app/bots/_engine/catalog";
import { resolveFight } from "@/app/bots/_engine/resolve";
import { STRINGS } from "@/lib/bots/strings";

export const metadata: Metadata = {
  title: "Fight | Battle Bots",
};

/** A replay is a stored row read per request (week 3), never a prerender. */
export const dynamic = "force-dynamic";

interface MockFight {
  seed: number;
  a: Build;
  b: Build;
  ids: [FightIdentity, FightIdentity];
  mode: Mode;
  modeLabel: string;
}

/** The local mock: what a week 3 row will carry, minus the storage. The
 * seed is derived the way the server will derive it, fnv1a(id + "|" + a
 * salt), with a dev salt here. */
const DEV_SALT = "dev";

function mockFor(id: string): MockFight | null {
  const seed = fnv1a(`${id}|${DEV_SALT}`);
  if (id === "demo-spar") {
    return {
      seed,
      a: CANON.T2,
      b: CANON.T2,
      ids: [
        { name: "Rusty Piston", wallet: "Brass Otter 41", wins: 8, losses: 2, strategy: "Buy Low Sell High", paint: "mint" },
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
    const title = { easy: "Scrapper", medium: "Foreman", hard: "Big Rig" }[difficulty];
    return {
      seed,
      a: player,
      b: houseBuild(shape, houseTarget(difficulty, 35)),
      ids: [
        { name: "Rusty Piston", wallet: "Brass Otter 41", wins: 8, losses: 2, strategy: "Buy Low Sell High", paint: "mint" },
        { name: title, wallet: "House", wins: 0, losses: 0, strategy: "House bot", paint: "butter" },
      ],
      mode: "pve",
      modeLabel: `PvE . ${title}`,
    };
  }
  if (id === "demo-pvp") {
    return {
      seed,
      a: CANON.T3,
      b: CANON.T2,
      ids: [
        { name: "Piston Hawk", wallet: "Iron Fox 12", wins: 11, losses: 3, strategy: "Limit orders", paint: "sky" },
        { name: "Rusty Piston", wallet: "Brass Otter 41", wins: 8, losses: 2, strategy: "Buy Low Sell High", paint: "mint" },
      ],
      mode: "pvp",
      modeLabel: "PvP . ghost",
    };
  }
  return null;
}

export default function FightPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const mock = id.startsWith("demo-") ? mockFor(id) : null;
  if (!mock) {
    const t = STRINGS.en;
    return (
      <PageShell>
        <p
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: M.muted,
            margin: "24px 0 10px",
          }}
        >
          {t.nav.wordmark}
        </p>
        <h1 style={{ fontFamily: FONT_DISPLAY, fontSize: 28, margin: "0 0 8px", color: M.text }}>Fight not found yet.</h1>
        <p style={{ fontSize: 15, color: M.lore, margin: "0 0 20px" }}>
          Fights are stored by the server, which lands next. Try the demo: /bots/fight/demo-spar.
        </p>
        <Link
          href="/bots/fight/demo-spar"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: TAP,
            padding: "10px 18px",
            borderRadius: R.inner,
            border: `1px solid ${M.border}`,
            background: M.surface2,
            color: M.text,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          {t.landing.watch}
        </Link>
      </PageShell>
    );
  }
  // the stored hash: what the server row will carry; the client compares
  const stored = resolveFight(mock.seed, mock.a, mock.b, undefined, undefined, mock.mode);
  return (
    <FightClient
      seed={mock.seed}
      a={mock.a}
      b={mock.b}
      ids={mock.ids}
      mode={mock.mode}
      modeLabel={mock.modeLabel}
      expectedHash={stored.hash}
      replayUrl={`/bots/fight/${id}`}
      watchAnotherHref={id === "demo-spar" ? "/bots/fight/demo-pve-medium" : "/bots/fight/demo-spar"}
    />
  );
}
