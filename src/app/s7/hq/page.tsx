/**
 * YOUR CAMP (/s7/hq) — the personal HQ scene.
 *
 * This is today's /s7 landing, given its own address ahead of the world-map
 * swap. Once the art lands and the map takes over /s7, this file is already
 * where it needs to be and nothing moves again.
 *
 * The body is deliberately IDENTICAL to src/app/s7/page.tsx: the same snapshot
 * read, the same pool line, the same props. HqScene.tsx already lives in this
 * directory, so not one import path changed in the move.
 *
 * Route note: a static segment beats a dynamic one, so /s7/hq resolves here
 * while /s7/hq/<handle> keeps resolving to the public garage. The two coexist
 * with no config.
 *
 * ISR: revalidate 60, never force-dynamic, and no cookie read — the same
 * discipline the rest of the season follows.
 */
import { getSeasonSnapshot, poolLine } from "@/lib/s7/data";
import { DEFAULT_THEME } from "@/lib/s7/theme";
import { HqScene } from "./HqScene";
import { RaidStrip } from "../_components/RaidStrip";

export const revalidate = 60;

export const metadata = {
  title: "Your Base | Launch Wars S7: Realmfall",
  description:
    "Your hero, your adventurer, your kit. Hold a featured keep from $5, earn Valor daily, and reclaim keeps with The Guild.",
};

export default async function S7HqPage() {
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
