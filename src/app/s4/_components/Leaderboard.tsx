/**
 * Season 4 TOP AGENTS leaderboard (server component).
 *
 * The top 20 players by Bounty, each with their character card: rank, the
 * player's portrait (graceful team-silhouette fallback via AgentPortrait), the
 * name, a team chip in the team accent, and their Bounty. Renders straight from
 * snapshot.topPlayers (built in lib/s4/data.ts, which rides the 60s snapshot
 * cache), so no query or client hooks live here.
 *
 * PUBLIC-safe by construction: name, team, and Bounty only. There is NO dollar
 * figure anywhere on this surface. A player's real payout is private and lives
 * behind /assassin me in Discord. Every player-visible WORD comes from the
 * theme (t.points, t.player), never hardcoded.
 */
import type { Snapshot, TopPlayer } from "@/lib/s4/data";
import { AgentPortrait } from "./AgentPortrait";
import { Panel, UI } from "./ui";

// Theme team names carry a leading era emoji (the map strips it too, rendering
// its own emblem). Here the accent dot already carries team color, so drop the
// emoji for a clean chip. UTF-16-unit match (project tsc targets ES3): strips
// astral-plane emoji surrogate pairs cleanly.
const teamLabel = (name: string) => name.replace(/^[^A-Za-z0-9]+/, "").trim() || name;

function LeaderRow({ p, pointsWord }: { p: TopPlayer; pointsWord: string }) {
  const topThree = p.rank <= 3;
  const rankColor = p.rank === 1 ? UI.warn : topThree ? UI.text : UI.faint;
  return (
    <Panel
      style={{
        display: "grid",
        gridTemplateColumns: "26px auto minmax(0, 1fr) auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 14px",
        borderColor: `${p.accent}33`,
      }}
    >
      <span
        style={{
          fontSize: topThree ? 16 : 14,
          fontWeight: 800,
          color: rankColor,
          textAlign: "center",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {p.rank}
      </span>

      <AgentPortrait art={p.art} teamKey={p.teamKey} accent={p.accent} />

      <span style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span
          style={{
            fontSize: 14.5,
            fontWeight: 700,
            color: UI.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {p.name}
        </span>
        {p.teamName ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
              maxWidth: "100%",
              padding: "2px 8px",
              borderRadius: 999,
              border: `1px solid ${p.accent}55`,
              background: `${p.accent}14`,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: p.accent,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: p.accent,
                letterSpacing: "0.02em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {teamLabel(p.teamName)}
            </span>
          </span>
        ) : null}
      </span>

      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          justifyContent: "flex-end",
          whiteSpace: "nowrap",
        }}
        aria-label={`${p.points.toLocaleString("en-US")} ${pointsWord}`}
      >
        <span aria-hidden="true" style={{ fontSize: 13 }}>
          💰
        </span>
        <span
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: UI.text,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {p.points.toLocaleString("en-US")}
        </span>
      </span>
    </Panel>
  );
}

export function Leaderboard({ snap }: { snap: Snapshot }) {
  const t = snap.theme;
  // snap.topPlayers now carries up to 60 (the map renders the whole swarm); the
  // board leaderboard stays a top-20 list.
  const players = snap.topPlayers.slice(0, 20);

  if (!players.length) {
    return (
      <Panel style={{ textAlign: "center", padding: "28px 22px" }}>
        <p style={{ fontSize: 14, color: UI.muted, margin: 0, lineHeight: 1.6 }}>
          The leaderboard fills as {t.player.plural} earn {t.points}.
        </p>
      </Panel>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {players.map((p) => (
        <LeaderRow key={p.rank} p={p} pointsWord={t.points} />
      ))}
    </div>
  );
}
