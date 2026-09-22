/**
 * THE OLD SEASON LANDING, kept at /s5/landing.
 *
 * /s5 is the WORLD MAP now. This page is no longer the front door but is
 * still whole and still routable, so the swap can be reversed by moving
 * this body back rather than by rebuilding it from git.
 */
import { getSeasonSnapshot, poolLine } from "@/lib/s5/data";
import { DEFAULT_THEME } from "@/lib/s5/theme";
import { HqScene } from "../hq/HqScene";
import { RaidStrip } from "../_components/RaidStrip";

export const revalidate = 60;

export const metadata = {
  title: "Launch Wars S5: Iron Siege | Your Personal HQ",
  description:
    "Every commander gets a bunker. Hold a featured domain from $5, earn Medals daily, and breach strongholds with The Iron Column.",
};

export default async function S5Home() {
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
    // L6: the s5_paid_ledger running total; the hero ticker and HUD chip
    // render it, $0 included (the honest launch state).
    paidOutUsd: snap.pool.paidOutUsd,
  };
  // Plain-JSON stronghold list for the funding wizard's buy links (client-safe
  // fields only: domain/name/status, never a wallet or a balance).
  const targets = snap.targets
    .filter((t) => t.status !== "failed")
    .map((t) => ({ domain: t.domain, name: t.name, status: t.status }));
  return (
    <>
      {/* The raid odds strip sits under the fixed 52px nav. The wrapper used to
          paint a FLAT #0b0d10 band across the full width above everything,
          which is the first 150px a desktop visitor sees and a real part of
          why the page read as "just black". It is transparent now, so the
          scene's own layered ground runs unbroken from the top of the page;
          the strip still reads as a strip because it carries its own ember
          gradient and rules. */}
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
