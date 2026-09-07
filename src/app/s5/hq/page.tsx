/**
 * YOUR CAMP (/s5/hq) — the personal HQ scene.
 *
 * This is today's /s5 landing, given its own address ahead of the world-map
 * swap. Once the art lands and the map takes over /s5, this file is already
 * where it needs to be and nothing moves again.
 *
 * The body is deliberately IDENTICAL to src/app/s5/page.tsx: the same snapshot
 * read, the same pool line, the same props. HqScene.tsx already lives in this
 * directory, so not one import path changed in the move.
 *
 * Route note: a static segment beats a dynamic one, so /s5/hq resolves here
 * while /s5/hq/<handle> keeps resolving to the public garage. The two coexist
 * with no config.
 *
 * ISR: revalidate 60, never force-dynamic, and no cookie read — the same
 * discipline the rest of the season follows.
 */
import { getSeasonSnapshot, poolLine } from "@/lib/s5/data";
import { DEFAULT_THEME } from "@/lib/s5/theme";
import { HqScene } from "./HqScene";
import { RaidStrip } from "../_components/RaidStrip";

export const revalidate = 60;

export const metadata = {
  title: "Your Camp | Launch Wars S5: Iron Siege",
  description:
    "Your tank, your commander, your kit. Hold a featured stronghold from $5, earn Medals daily, and breach with The Iron Column.",
};

export default async function S5HqPage() {
  const snap = await getSeasonSnapshot();
  // The English pool line renders on the server (ISR-safe: this page must
  // never read cookies); the raw numbers ride along so HqScene can re-render
  // the line from the ko/zh dict after it reads the locale cookie on mount.
  const line = snap.empty
    ? `${DEFAULT_THEME.seasonName} is being prepared. The front opens soon.`
    : poolLine(snap);
  const pool = {
    empty: snap.empty,
    unlockedUsd: snap.pool.unlocked,
    fullUsd: snap.pool.full,
    allBonded: snap.totals.total > 0 && snap.totals.bonded >= snap.totals.total,
    paidOutUsd: snap.pool.paidOutUsd,
  };
  const targets = snap.targets
    .filter((t) => t.status !== "failed")
    .map((t) => ({ domain: t.domain, name: t.name, status: t.status }));
  return (
    <>
      <div style={{ paddingTop: 52 }}>
        <RaidStrip />
      </div>
      <HqScene
        poolLineText={line}
        pool={pool}
        sprint={{ active: snap.sprint.active, domains: snap.sprint.domains }}
        trophies={null}
        targets={targets}
      />
    </>
  );
}
