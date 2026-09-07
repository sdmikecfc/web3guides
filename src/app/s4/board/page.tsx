/**
 * Launch Wars Season 4 — STATUS BOARD (web3guides.com/s4/board).
 *
 * The neutral stand-in for the themed map: a data-first table of targets
 * (status, bond progress, launch date) + team standings + the pool line, all
 * from the one season snapshot. The theme's map REPLACES this visually later
 * but reads the SAME snapshot; nothing here needs a logic change on theme day.
 */
import Link from "next/link";
import { getSeasonSnapshot, poolLine, type Snapshot } from "@/lib/s4/data";
import { DEFAULT_THEME } from "@/lib/s4/theme";
import { Leaderboard } from "../_components/Leaderboard";
import { SeasonCountdown } from "../_components/SeasonCountdown";
import {
  Eyebrow,
  PageShell,
  Panel,
  PoolBanner,
  ProgressBar,
  StatusChip,
  STATUS_COLOR,
  UI,
} from "../_components/ui";

// ISR (see /s4/page.tsx): cached + prefetchable, refreshed every 60s. The 60s
// snapshot cache in lib/s4/data keeps the board live enough (source is hourly).
export const revalidate = 60;

export const metadata = {
  title: `Status Board · ${DEFAULT_THEME.seasonName}`,
  description: "Live bond status, team standings, and the prize pool.",
};

function launchDateLabel(launchAt: string | null): string {
  if (!launchAt) return "TBA";
  const ms = new Date(launchAt).getTime();
  if (!Number.isFinite(ms)) return "TBA";
  return new Date(ms).toISOString().slice(0, 10);
}

function TargetsTable({ snap }: { snap: Snapshot }) {
  const t = snap.theme;
  const cols = "minmax(140px, 1.5fr) minmax(90px, 0.9fr) minmax(160px, 1.7fr) minmax(90px, 0.9fr)";
  const headStyle: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: UI.faint,
    fontWeight: 700,
  };
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 560 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: cols,
            gap: 12,
            padding: "0 16px 10px",
          }}
        >
          <span style={headStyle}>{t.target.singular}</span>
          <span style={headStyle}>Status</span>
          <span style={headStyle}>Bond progress</span>
          <span style={{ ...headStyle, textAlign: "right" }}>Launch</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {snap.targets.map((target) => (
            <Panel
              key={target.domain}
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                gap: 12,
                alignItems: "center",
                padding: "13px 16px",
              }}
            >
              <span style={{ fontSize: 14.5, fontWeight: 700, color: UI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {target.name}
              </span>
              <span>
                <StatusChip theme={t} status={target.status} />
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1 }}>
                  <ProgressBar value={target.progress} color={STATUS_COLOR[target.status]} />
                </span>
                <span style={{ fontSize: 12.5, color: UI.muted, fontVariantNumeric: "tabular-nums", minWidth: 38, textAlign: "right" }}>
                  {Math.round(target.progress * 100)}%
                </span>
              </span>
              <span style={{ fontSize: 13, color: UI.muted, textAlign: "right", fontVariantNumeric: "tabular-nums", fontFamily: UI.mono }}>
                {launchDateLabel(target.launchAt)}
              </span>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}

function Standings({ snap }: { snap: Snapshot }) {
  const t = snap.theme;
  const maxPoints = Math.max(1, ...snap.teams.map((x) => x.points));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {snap.teams.map((team, i) => (
        <Panel
          key={team.key}
          style={{
            display: "grid",
            gridTemplateColumns: "24px minmax(110px, 1.2fr) minmax(70px, 0.7fr) minmax(120px, 1.4fr) minmax(80px, 0.7fr)",
            gap: 12,
            alignItems: "center",
            padding: "13px 16px",
            borderColor: `${team.accent}44`,
          }}
        >
          <span style={{ fontSize: 13, color: UI.faint, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: team.accent,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: UI.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {team.name}
            </span>
          </span>
          <span style={{ fontSize: 13, color: UI.muted, fontVariantNumeric: "tabular-nums" }}>
            {team.players} {team.players === 1 ? t.player.singular : t.player.plural}
          </span>
          <span>
            <ProgressBar value={team.points / maxPoints} color={team.accent} />
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: UI.text, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {team.points.toLocaleString("en-US")}
          </span>
        </Panel>
      ))}
    </div>
  );
}

export default async function S4Board() {
  const snap = await getSeasonSnapshot();
  const t = snap.theme;

  return (
    <PageShell>
      <header style={{ textAlign: "center", marginBottom: 28 }}>
        <Eyebrow>{t.seasonName}</Eyebrow>
        <h1 style={{ fontSize: "clamp(28px, 6vw, 44px)", fontWeight: 800, margin: "0 0 8px", color: UI.text }}>
          Status Board
        </h1>
        <p style={{ fontSize: 14.5, color: UI.muted, margin: 0 }}>
          Live {t.target.singular} status, {t.team.singular} standings, and the pool.
        </p>
        <SeasonCountdown
          launchAt={snap.season.launchAt}
          endAt={snap.season.endAt}
          serverNowMs={snap.nowMs}
        />
      </header>

      {snap.empty ? (
        <Panel style={{ textAlign: "center", padding: "34px 24px" }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: UI.text, marginBottom: 8 }}>
            Season 4 is being prepared
          </div>
          <p style={{ fontSize: 14, color: UI.muted, margin: 0, lineHeight: 1.6 }}>
            The board goes live when the {t.target.plural} are announced.
          </p>
        </Panel>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <PoolBanner line={poolLine(snap)} />
          </div>
          <p style={{ textAlign: "center", fontSize: 13, color: UI.muted, margin: "0 0 30px", lineHeight: 1.6 }}>
            Your personal cut is private. Run{" "}
            <span style={{ color: UI.text, fontWeight: 700 }}>/assassin me</span> in Discord to see
            your projected payout as it stands.
          </p>

          <section style={{ marginBottom: 34 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: UI.text, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                The {t.target.plural}
              </h2>
              <span style={{ fontSize: 13, color: UI.faint, fontVariantNumeric: "tabular-nums" }}>
                {snap.totals.bonded} {t.bondedWord} · {snap.totals.live} {t.statusWord.live.toLowerCase()} · {snap.totals.total} total
              </span>
            </div>
            <TargetsTable snap={snap} />
          </section>

          <section>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: UI.text, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                {t.team.singular} standings
              </h2>
              <span style={{ fontSize: 13, color: UI.faint, fontVariantNumeric: "tabular-nums" }}>
                {snap.totals.players} {snap.totals.players === 1 ? t.player.singular : t.player.plural}
              </span>
            </div>
            <Standings snap={snap} />
            <p style={{ fontSize: 12.5, color: UI.faint, marginTop: 12, lineHeight: 1.6 }}>
              {t.points} decide the {t.team.singular} shares at season end. Only bonded {t.target.plural} pay.
            </p>
          </section>

          <section style={{ marginTop: 34 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: UI.text, margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Top {t.player.plural}
              </h2>
              <span style={{ fontSize: 13, color: UI.faint, fontVariantNumeric: "tabular-nums" }}>
                by {t.points}
              </span>
            </div>
            <Leaderboard snap={snap} />
            <p style={{ fontSize: 12.5, color: UI.faint, marginTop: 12, lineHeight: 1.6 }}>
              The top 20 {t.player.plural} by {t.points}. Your personal payout stays private in Discord.
            </p>
          </section>
        </>
      )}

      <p style={{ textAlign: "center", fontSize: 13, color: UI.faint, marginTop: 34 }}>
        <Link href="/s4" style={{ color: UI.muted }}>Season home</Link>
        {" · "}
        <Link href="/s4/map" style={{ color: UI.muted }}>The Map</Link>
        {" · "}
        <Link href="/s4/play" style={{ color: UI.muted }}>Games</Link>
      </p>
    </PageShell>
  );
}
