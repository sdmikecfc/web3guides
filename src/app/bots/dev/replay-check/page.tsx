"use client";

/**
 * BATTLE BOTS DEV: the browser half of harness gate (i), "node vs browser".
 * Replays the frozen baseline (src/app/bots/_engine/baseline.ts) IN THE
 * BROWSER and prints every hash beside the frozen one, a rollup per
 * pairing, and a final MATCH / MISMATCH line. `npx tsx scripts/bots-harness.ts`
 * prints the same rollups (add --table for every row) so a human compares
 * the two by eye.
 *
 * Reached by URL only, nothing links here. Same guard idiom as
 * src/app/dev/s7h/page.tsx (notFound in production) with one door for a
 * production spot check: ?dev=1. A client page on purpose: the replay must
 * run where the players' replays run, in the browser, never on the server.
 * Numbers live in the DOM in mono on the money layer (tokens.ts M); there
 * is no canvas here, so no diorama.
 */

import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import { fnv1a } from "@/app/bots/_engine/rng";
import type { CanonKey } from "@/app/bots/_engine/parts";
import { CANON } from "@/app/bots/_engine/catalog";
import { BASELINE } from "@/app/bots/_engine/baseline";
import { fightHash, runFight } from "@/app/bots/_engine/resolve";
import { ENGINE_VERSION } from "@/app/bots/_engine/version";
import { FONT_MONO, M } from "@/app/bots/_ui/tokens";
import { BOTS_DOCK_HEIGHT, BOTS_NAV_HEIGHT } from "@/app/bots/_components/PageShell";

interface Row {
  pairing: string;
  seed: number;
  winner: number;
  frames: number;
  frozen: number;
  live: number;
  ok: boolean;
}

interface Check {
  rows: Row[];
  rollups: { pairing: string; live: string }[];
  all: string;
  mismatches: number;
}

const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");

/** The seed contract from scripts/bots-harness.ts, copied so the page and
 * the harness cannot drift apart silently: a drift shows as MISMATCH. */
const seedAt = (i: number): number => fnv1a(`bots-baseline-${i}`);

/** The rollup the harness prints: fnv1a of the hex hashes joined by commas,
 * seed order inside a pairing, pairing order over the whole table. */
const rollup = (hashes: number[]): string => hex(fnv1a(hashes.map(hex).join(",")));

function replayBaseline(): Check {
  const rows: Row[] = [];
  const rollups: Check["rollups"] = [];
  const allHashes: number[] = [];
  let mismatches = 0;
  BASELINE.pairings.forEach((pairing, p) => {
    const [ka, kb] = pairing.split("v") as [CanonKey, CanonKey];
    const hashes: number[] = [];
    for (const row of BASELINE.rows) {
      if (row[0] !== p) continue;
      const st = runFight(seedAt(row[1]), CANON[ka], CANON[kb]).st;
      const live = fightHash(st);
      const ok = live === row[5] && st.winner === row[2] && st.frame === row[3] && st.end === row[4];
      if (!ok) mismatches += 1;
      hashes.push(live);
      allHashes.push(live);
      rows.push({ pairing, seed: row[1], winner: st.winner, frames: st.frame, frozen: row[5], live, ok });
    }
    rollups.push({ pairing, live: rollup(hashes) });
  });
  return { rows, rollups, all: rollup(allHashes), mismatches };
}

export default function ReplayCheckPage({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  if (process.env.NODE_ENV === "production" && searchParams?.dev !== "1") notFound();
  const [check, setCheck] = useState<Check | null>(null);
  useEffect(() => {
    // after mount, so this runs in the browser and never in the server render
    setCheck(replayBaseline());
  }, []);

  const versionOk = BASELINE.engineVersion === ENGINE_VERSION;
  const verdict = check === null ? "REPLAYING" : check.mismatches === 0 && versionOk ? "MATCH" : "MISMATCH";
  const verdictColor = verdict === "MATCH" ? M.good : verdict === "MISMATCH" ? M.bad : M.muted;

  return (
    <main
      // the /bots layout paints a FIXED 52 px nav over every page; this page has
      // no PageShell, so it clears the nav (and the phone dock) itself
      style={{ background: M.ground, color: M.text, fontFamily: FONT_MONO, fontSize: 13, padding: `${BOTS_NAV_HEIGHT + 20}px 16px ${BOTS_DOCK_HEIGHT + 32}px`, minHeight: "100vh" }}
    >
      <h1 style={{ fontSize: 15, margin: "0 0 8px" }}>bots replay check (gate i, browser side)</h1>
      <p style={{ color: M.muted, margin: "0 0 12px" }}>
        engine v{ENGINE_VERSION}, baseline frozen under v{BASELINE.engineVersion} ({BASELINE.rows.length} fights, {BASELINE.pairings.join(" ")}).
        Compare with the [OK] bots (i) line from npx tsx scripts/bots-harness.ts.
      </p>
      <p style={{ margin: "0 0 12px", fontWeight: 700, color: verdictColor }}>
        {verdict}
        {check ? ` (${check.rows.length - check.mismatches} of ${check.rows.length} rows equal${versionOk ? "" : ", engine version differs"})` : ""}
      </p>
      {check && (
        <p style={{ margin: "0 0 12px" }}>
          browser table rollup: {check.rollups.map((r) => `${r.pairing} ${r.live}`).join("  ")}  all {check.all}
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", minWidth: 520 }}>
          <thead>
            <tr style={{ color: M.muted, textAlign: "left" }}>
              <th style={{ padding: "2px 10px 2px 0" }}>pairing</th>
              <th style={{ padding: "2px 10px 2px 0" }}>seed</th>
              <th style={{ padding: "2px 10px 2px 0" }}>winner</th>
              <th style={{ padding: "2px 10px 2px 0" }}>frames</th>
              <th style={{ padding: "2px 10px 2px 0" }}>browser</th>
              <th style={{ padding: "2px 10px 2px 0" }}>frozen</th>
              <th style={{ padding: "2px 0" }}>ok</th>
            </tr>
          </thead>
          <tbody>
            {(check ? check.rows : []).map((r) => (
              <tr key={`${r.pairing}-${r.seed}`} style={{ color: r.ok ? M.text : M.bad, borderTop: `1px solid ${M.border}` }}>
                <td style={{ padding: "2px 10px 2px 0" }}>{r.pairing}</td>
                <td style={{ padding: "2px 10px 2px 0" }}>{r.seed}</td>
                <td style={{ padding: "2px 10px 2px 0" }}>{r.winner}</td>
                <td style={{ padding: "2px 10px 2px 0" }}>{r.frames}</td>
                <td style={{ padding: "2px 10px 2px 0" }}>{hex(r.live)}</td>
                <td style={{ padding: "2px 10px 2px 0" }}>{hex(r.frozen)}</td>
                <td style={{ padding: "2px 0" }}>{r.ok ? "yes" : "NO"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "12px 0 0", fontWeight: 700, color: verdictColor }}>{verdict}</p>
    </main>
  );
}
