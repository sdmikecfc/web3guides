/**
 * Season 4 /s4/payout — the PRIZE page (Mike 2026-07-15 nav): the $500 pool and
 * how it splits, in plain words. PUBLIC + server-rendered (no wallet): reads the
 * same season snapshot as the board (ISR, revalidate 60). The ONLY dollars shown
 * are the shared pool math (guide rule); never a personal payout figure.
 */
import { getSeasonSnapshot, poolLine, type Snapshot } from "@/lib/s4/data";
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { Eyebrow, PageShell, Panel, PoolBanner, UI } from "../_components/ui";

export const revalidate = 60;

export const metadata = {
  title: `Payout · ${DEFAULT_THEME.seasonName}`,
  description: "The $500 pool and exactly how it splits. Only closed contracts pay.",
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default async function S4PayoutPage() {
  let snap: Snapshot | null = null;
  try {
    snap = await getSeasonSnapshot();
  } catch {
    snap = null;
  }
  const t = DEFAULT_THEME;
  const pool = snap?.pool ?? { unlocked: 0, full: 500, perBond: 0 };
  const closed = snap?.totals?.bonded ?? 0;
  const total = snap?.totals?.total ?? 0;

  const steps: { n: string; title: string; body: string }[] = [
    {
      n: "1",
      title: "Closing a contract unlocks the pool",
      body: `Every featured ${t.target.singular} that gets ${t.bondedWord.toLowerCase()} unlocks a slice of the ${usd(pool.full)}. Bigger ${t.target.plural} unlock a bigger slice, so the pricey ones are worth the most. Nothing is unlocked until one closes.`,
    },
    {
      n: "2",
      title: "The top teams split what's unlocked",
      body: `At season end, the top ${t.team.plural} by ${t.points} split the unlocked pool. Only ${t.bondedWord} ${t.target.plural} pay, so a ${t.team.singular} that never closes one wins nothing.`,
    },
    {
      n: "3",
      title: "Your cut is your share of your team",
      body: `Inside a winning ${t.team.singular}, the money splits by ${t.points} among the members holding a featured ${t.target.singular} at $5 or more. More ${t.points} = a bigger cut. A crowded ${t.team.singular} pays each member less.`,
    },
  ];

  return (
    <PageShell>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <Eyebrow>{t.seasonName}</Eyebrow>
      </div>
      <h1 style={{ textAlign: "center", fontSize: "clamp(30px, 7vw, 48px)", fontWeight: 800, margin: "0 0 6px", color: UI.text }}>
        The Payout
      </h1>
      <p style={{ textAlign: "center", color: UI.muted, fontSize: 15, margin: "0 0 22px", lineHeight: 1.6, maxWidth: 640, marginLeft: "auto", marginRight: "auto" }}>
        The whole prize is <b style={{ color: UI.text }}>{usd(pool.full)}</b>. Here is exactly how it unlocks and splits.
        No personal numbers, no promises: only {t.bondedWord} {t.target.plural} pay.
      </p>

      {snap ? <PoolBanner line={poolLine(snap)} /> : null}

      {/* The pool state at a glance */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, margin: "18px 0 8px" }}>
        <Metric label="Unlocked so far" value={usd(pool.unlocked)} accent={UI.good} />
        <Metric label="Full pool" value={usd(pool.full)} accent={UI.warn} />
        <Metric label={`${t.target.plural} ${t.bondedWord.toLowerCase()}`} value={`${closed} of ${total}`} accent={UI.text} />
      </div>

      {/* How it splits */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
        {steps.map((s) => (
          <Panel key={s.n} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div
              style={{
                flexShrink: 0,
                width: 40,
                height: 40,
                borderRadius: 10,
                background: `${UI.warn}18`,
                border: `1px solid ${UI.warn}55`,
                color: UI.warn,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 18,
              }}
            >
              {s.n}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: UI.text, marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 14, color: UI.muted, lineHeight: 1.6 }}>{s.body}</div>
            </div>
          </Panel>
        ))}
      </div>

      {/* Per-contract unlock table */}
      {snap && snap.targets.length ? (
        <div style={{ marginTop: 22 }}>
          <Eyebrow>What each {t.target.singular} unlocks</Eyebrow>
          <Panel style={{ padding: "6px 8px" }}>
            {snap.targets
              .slice()
              .sort((a, b) => b.poolShare - a.poolShare)
              .map((tg) => (
                <div
                  key={tg.domain}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderBottom: `1px solid ${UI.border}`,
                  }}
                >
                  <span style={{ fontSize: 14, color: UI.text }}>
                    {tg.name}
                    {tg.status === "bonded" ? (
                      <span style={{ color: UI.good, fontSize: 12, marginLeft: 8, fontWeight: 700 }}>
                        {t.bondedWord}
                      </span>
                    ) : null}
                  </span>
                  <span style={{ fontFamily: UI.mono, fontSize: 14, color: tg.status === "bonded" ? UI.good : UI.warn }}>
                    {usd(tg.poolShare)}
                  </span>
                </div>
              ))}
          </Panel>
          <p style={{ fontSize: 12.5, color: UI.faint, margin: "10px 4px 0", lineHeight: 1.6 }}>
            {t.playCurrency} you earn in the arcade is for fun and cosmetics only. It never turns into cash. The prize is
            paid in crypto to the wallets of the winning {t.team.plural} after the season ends.
          </p>
        </div>
      ) : null}
    </PageShell>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: UI.panel, border: `1px solid ${UI.border}`, borderRadius: 12, padding: "14px 16px", textAlign: "center" }}>
      <div style={{ fontSize: 12, color: UI.faint, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent }}>{value}</div>
    </div>
  );
}
