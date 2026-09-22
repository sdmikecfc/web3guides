"use client";
/**
 * STARFALL sector map — the painted "state of the season" surface.
 *
 * Client component. The painted blackhole.png is the centerpiece; the 5 planets
 * ring it in their live bond state (tap a planet for its status card). Each of the
 * 3 crews flies a flagship with a formation of pilot ships (the real hull art) in
 * its open lane — hover a ship to zoom in on it; tap a flagship or crew to open that
 * crew's leaderboard. North-star copy only: bond-to-win is stated, no $ figure, no
 * per-capita math; the leaderboard shows Starlight (the public score), never dollars.
 */
import { useState } from "react";
import Link from "next/link";
import type { Sector, SectorStar } from "@/lib/stars/map";
import { planetArt } from "@/lib/stars/stars";

const GOLD = "#f0b340";

const SIZE_PCT: Record<SectorStar["size"], number> = { giant: 15, mid: 10.5 };
const RENDER_CAP = 80; // most ships drawn per crew (flag-count still shows the true total)

// Per-crew formation: an elliptical swarm (center x/y + radii rx/ry) staged in the open gap
// its lane leaves clear (left + right lanes are tall/narrow, the bottom lane is wide), and
// which way the side-profile ships face (nose toward the singularity). Ships are placed by a
// phyllotaxis (golden-angle) spiral, so ANY pilot count fills the ellipse evenly and no two
// ships ever land on the same coordinate — every ship stays hoverable/clickable. (The old
// fixed grid clamped overflow ships into the border and stacked them, burying most of them.)
// BATTLEFIELD LAYOUT (Mike 2026-07-08): all three crews mass in the LEFT column (one third
// each, top->bottom: Vanguard / Nebula / Pulsar — fixed zones so ships don't reshuffle with
// standings), every nose pointed RIGHT at the singularity and the invasion beyond it.
const FLEETS: Record<string, { x: number; y: number; rx: number; ry: number; faceRight: boolean }> = {
  vanguard: { x: 0.115, y: 0.18, rx: 0.095, ry: 0.125, faceRight: true },
  nebula:   { x: 0.115, y: 0.50, rx: 0.095, ry: 0.125, faceRight: true },
  pulsar:   { x: 0.115, y: 0.82, rx: 0.095, ry: 0.125, faceRight: true },
};
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // golden angle — even, gap-free spiral fill
// ship draw size shrinks as the crew grows so a big roster still fits its lane without overlap
const shipSizePct = (n: number, rx: number, ry: number) =>
  clamp(1.7 * Math.sqrt((rx * ry) / Math.max(6, n)), 0.015, 0.04) * 100;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// hull rank 1..12 -> visual tier 1..6 (two ranks per tier); each tier is painted in the crew
// color, so a ship reads as BOTH its tier (grandeur) and its crew (color) at a glance.
const tierOf = (rank: number) => clamp(Math.ceil(clamp(rank || 1, 1, 12) / 2), 1, 6);
const hullArt = (crew: string, rank: number) => `/stars-art/hull-${crew}-t${tierOf(rank)}.png`;
// Legendary feat-hulls (earned by feats): when a pilot has one, their ship IS the legend
// sprite (gold-foil showpiece) instead of the crew/tier hull, plus a badge on the roster.
const LEGEND_KEYS = new Set(["sector-champion", "final-blow", "galaxy-mvp", "the-underdog", "star-lighter", "recruiter", "battle-champion"]);
const isLegend = (l?: string | null): l is string => !!l && LEGEND_KEYS.has(l);
const shipArt = (crew: string, rank: number, legendary?: string | null) =>
  isLegend(legendary) ? `/stars-art/legend-${legendary}.png` : hullArt(crew, rank);
// Rank 1..12 -> hull title (matches the bot's RANK_NAMES). Shown on the pilot card.
const RANK_NAMES = ["Recruit", "Cadet", "Ensign", "Pilot", "Lieutenant", "Wing Commander", "Squadron Leader", "Captain", "Commodore", "Vice Admiral", "Admiral", "Fleet Admiral"];
const rankName = (r: number) => RANK_NAMES[clamp(r || 1, 1, 12) - 1];
const LEGEND_NAMES: Record<string, string> = { "sector-champion": "Sector Champion", "final-blow": "Final Blow", "galaxy-mvp": "Galaxy MVP", "the-underdog": "The Underdog", "star-lighter": "Star-Lighter", "recruiter": "Recruiter", "battle-champion": "Battle Champion" };
// Season end (UTC), shown on the map + crew board. S3 is a two-week season launched 06-29 (Mike, confirmed).
const SEASON_END = "2026-07-13T17:00:00Z";
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

const STATUS: Record<
  SectorStar["status"],
  { label: string; fg: string; bg: string; glow: string }
> = {
  pending: { label: "Standby", fg: "#aab8e0", bg: "rgba(124,160,255,0.14)", glow: "rgba(150,160,185,0.13)" },
  live: { label: "Terraforming", fg: "#f0b340", bg: "rgba(240,179,64,0.18)", glow: "rgba(240,179,64,0.42)" },
  bonded: { label: "Terraformed", fg: "#86f0c4", bg: "rgba(94,234,212,0.16)", glow: "rgba(120,240,190,0.6)" },
  failed: { label: "Lost", fg: "#ff8a8a", bg: "rgba(255,90,90,0.13)", glow: "rgba(255,90,90,0.16)" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtLaunch(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} · ${hh}:${mm} UTC`;
}
function relLaunch(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "listing now";
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.floor(diff / 3600000));
  return `in ${hours} hour${hours === 1 ? "" : "s"}`;
}
// Season end label for the header + board (e.g. "Season ends Jul 13 · 4d 6h left").
function fmtSeasonEnd(iso: string, now: number): string {
  const d = new Date(iso);
  const date = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const diff = d.getTime() - now;
  if (diff <= 0) return `Season ended ${date}`;
  const days = Math.floor(diff / 86400000), hours = Math.floor((diff % 86400000) / 3600000);
  return `Season ends ${date} · ${days >= 1 ? `${days}d ${hours}h` : `${Math.max(1, hours)}h`} left`;
}

type ShipCard = { name: string; rank: number; starlight: number; legendary?: string | null; crewKey: string; crewName: string; accent: string };

export function SectorMap({ sector }: { sector: Sector }) {
  const { stars, crews, totals, nowMs } = sector;
  const aliens = sector.aliens ?? []; // W2 invasion (tolerate a stale cached snapshot without the field)
  const [alienArtFail, setAlienArtFail] = useState<Record<string, boolean>>({}); // vector fallback until plates land
  // Bond-to-win pool: the $1,000 prize UNLOCKS as stars bond (each bonded star adds a share).
  // Shown loud so "stars that don't bond = a smaller prize for everyone" is obvious, not buried.
  const prizePerStar = Math.round(1000 / (totals.total || 5));
  const prizeUnlocked = prizePerStar * totals.lit;
  const [open, setOpen] = useState<string | null>(null); // planet domain
  const [panel, setPanel] = useState<string | null>(null); // crew leaderboard
  const [ship, setShip] = useState<ShipCard | null>(null); // tapped pilot's shareable card
  const [shared, setShared] = useState(false);

  const shareShip = async (s: ShipCard) => {
    const base = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "https://stars.web3guides.com/map";
    const hull = isLegend(s.legendary) ? `the ${LEGEND_NAMES[s.legendary!]} legendary hull` : `a ${rankName(s.rank)}`;
    const text = `${s.name} is flying ${hull} for ${s.crewName} with ${s.starlight.toLocaleString()} Starlight in Launch Wars: Starfall. ${base}`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) { await navigator.share({ title: "Starfall Sector Map", text, url: base }); return; }
    } catch { /* share sheet dismissed */ }
    try { await navigator.clipboard.writeText(text); setShared(true); setTimeout(() => setShared(false), 1800); } catch { /* clipboard blocked */ }
  };

  // Crew standings: sort by Starlight (then size) for the rank shown on every surface.
  const ranked = [...crews].sort((a, b) => b.starlight - a.starlight || b.pilots - a.pilots);
  const rankOf = new Map(ranked.map((c, i) => [c.key, i + 1]));
  const panelCrew = panel ? crews.find((c) => c.key === panel) : null;

  // Global TOP CAPTAINS leaderboard (individual pilots by Starlight, across all crews) for the
  // left rail — like the seas map, so a player can track their personal rank. Built from the
  // per-crew rosters already in the snapshot (names only, never wallets/dollars). Top 20.
  const captains = crews
    .flatMap((c) => c.roster.map((p) => ({ name: p.name, rank: p.rank, starlight: p.starlight, crew: c.key, crewName: c.name, accent: c.accent, legendary: p.legendary })))
    .sort((a, b) => b.starlight - a.starlight)
    .slice(0, 20);

  // Live "current holder" title — moves with the standings, locks at settlement (distinct from the
  // permanent ✦ legendary hulls). Top Starlight pilot = current Galaxy MVP. Sector Champion and The
  // Underdog are now MINTED rotating legendary hulls the bot awards (most mini-game points / most
  // Starlight per dollar), so they show as the SHIP itself, not a client-side badge. (Auto-balanced
  // crews made a "smallest crew" underdog meaningless.) Top recruiter needs referral data not here.
  const mvpName = captains[0]?.name || null;
  const liveTitle = (name?: string | null): { icon: string; label: string } | null => {
    if (name && name === mvpName) return { icon: "👑", label: "Galaxy MVP" };
    return null;
  };
  const renderTitle = (name?: string | null) => {
    const t = liveTitle(name);
    return t ? <span className="sf-title" title={`${t.label} (current)`}>{t.icon}</span> : null;
  };

  return (
    <main className="sf-map">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sf-bg" />
      <div className="sf-veil" />

      <div className="sf-shell">
        <header className="sf-head">
          <Link href="/" className="sf-back">
            ‹ Starfall
          </Link>
          <div className="sf-title">
            <p className="sf-eyebrow">Launch Wars · Season 3</p>
            <h1>Sector Map</h1>
          </div>
          <div className="sf-tally">
            <span className="sf-tally-num">
              {totals.lit}
              <span className="sf-tally-slash">/{totals.total}</span>
            </span>
            <span className="sf-tally-lbl">planets terraformed</span>
          </div>
        </header>

        <div className="sf-season">{fmtSeasonEnd(SEASON_END, nowMs)}</div>
        <div className="sf-season" style={{ marginTop: 3 }}>
          Prize pool: <b style={{ color: "#f0b340" }}>${prizeUnlocked.toLocaleString()}</b> of $1,000 unlocked
          {totals.lit < totals.total ? <> · each star that bonds adds ${prizePerStar} for everyone</> : <> · all {totals.total} lit, full prize in play</>}
        </div>

        <div className="sf-stage">
          <aside className="sf-rail" aria-label="Top captains">
            <div className="sf-rail-head">
              <span className="sf-rail-title">Top Captains</span>
              <span className="sf-rail-sub">by Starlight</span>
            </div>
            <div className="sf-rail-season">{fmtSeasonEnd(SEASON_END, nowMs)}</div>
            {captains.length === 0 ? (
              <p className="sf-rail-empty">No pilots yet. Be the first to fly.</p>
            ) : (
              <ol className="sf-rail-list">
                {captains.map((c, i) => (
                  <li key={i}>
                    <button type="button" className="sf-rail-row" onClick={() => setShip({ name: c.name, rank: c.rank, starlight: c.starlight, legendary: c.legendary, crewKey: c.crew, crewName: c.crewName, accent: c.accent })} title={`${c.name} — ${c.starlight} Starlight`}>
                      <span className="sf-rail-pos">{i + 1}</span>
                      <span className="sf-rail-flag" style={{ background: c.accent, color: c.accent }} />
                      <span className="sf-rail-name">{c.name}{isLegend(c.legendary) ? <span className="sf-legend" title="Legendary">✦</span> : null}{renderTitle(c.name)}</span>
                      <span className="sf-rail-sl">{c.starlight.toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <p className="sf-rail-foot">Hold and post to climb. Your Starlight is your rank.</p>
          </aside>

          <section className="sf-sector" aria-label="The sector" onClick={() => setOpen(null)}>
          <div className="sf-sector-bg" />

          {/* Battlefield glow zones: ONE continuous formation aura down the whole left column
              (the three crew colors intertwine INSIDE the single glow — one army, not three
              blobs); the right column smolders crimson under the invasion. */}
          <div className="sf-zones" aria-hidden>
            <span className="sf-zone sf-zone--fleet" />
            <span className="sf-zone sf-zone--alien" />
          </div>

          {stars.map((s) => {
            const st = STATUS[s.status];
            const above = s.card === "above";
            const pct = Math.round(s.progress * 100);
            const isOpen = open === s.domain;
            return (
              <div
                key={s.domain}
                className="sf-planet"
                style={{ left: `${s.pos.x * 100}%`, top: `${s.pos.y * 100}%`, width: `${SIZE_PCT[s.size]}%` }}
              >
                <button
                  type="button"
                  className={`sf-planet-btn${isOpen ? " is-open" : ""}`}
                  aria-label={`${s.name} — ${st.label}`}
                  aria-expanded={isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(isOpen ? null : s.domain);
                  }}
                >
                  <span className="sf-glow" style={{ background: `radial-gradient(circle, ${st.glow} 0%, transparent 68%)` }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={planetArt(s.domain, s.status, s.progress)} alt="" className="sf-planet-img" />
                </button>

                {!isOpen && (
                  <span className="sf-pname">
                    {s.domain}
                    <span className="sf-pdot" style={{ background: st.fg }} />
                  </span>
                )}

                {isOpen && (
                  <div className={`sf-card${above ? " sf-card--above" : ""}`} onClick={(e) => e.stopPropagation()}>
                    <div className="sf-card-top">
                      <span className="sf-name">{s.name}</span>
                      {s.tag ? <span className="sf-tag">{s.tag}</span> : null}
                    </div>
                    <span className="sf-domain">{s.domain}</span>
                    <span className="sf-pill" style={{ color: st.fg, background: st.bg }}>
                      <span className="sf-dot" style={{ background: st.fg }} />
                      {st.label}
                    </span>
                    {s.status === "live" || s.status === "bonded" ? (
                      <>
                        <span className="sf-track">
                          <span
                            className="sf-fill"
                            style={{
                              width: `${s.status === "bonded" ? 100 : Math.max(3, pct)}%`,
                              background: s.status === "bonded" ? "#86f0c4" : GOLD,
                            }}
                          />
                        </span>
                        <span className="sf-sub">{s.status === "bonded" ? "Terraformed ✦" : `${pct}% terraformed`}</span>
                      </>
                    ) : s.status === "failed" ? (
                      <span className="sf-sub">Did not bond</span>
                    ) : (
                      <>
                        <span className="sf-sub">Lists {fmtLaunch(s.launchAt)}</span>
                        <span className="sf-sub sf-sub--dim">{relLaunch(s.launchAt, nowMs)}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* W2 ALIEN INVASION: enemy ships between the planets (the Mothership rides the
              black hole itself). Shields fall as the crowd buys; killed aliens linger as
              faded wrecks for the week's story. Art alien-<key>.png, vector orb fallback. */}
          {aliens.filter((a) => !a.expired).map((a) => {
            const isOpen = open === a.domain;
            const live = a.arrived && !a.killed && a.hpPct != null;
            const incoming = !a.arrived;
            const label = a.killed ? "DESTROYED" : incoming ? `incoming ${relLaunch(a.launchAt, nowMs)}` : a.hpPct != null ? `shields ${a.hpPct}%` : "approaching";
            return (
              <div
                key={a.domain}
                className={`sf-alien${a.killed ? " is-dead" : ""}${incoming ? " is-incoming" : ""}`}
                style={{ left: `${a.pos.x * 100}%`, top: `${a.pos.y * 100}%`, width: `${10.5 * a.size}%` }}
              >
                <button
                  type="button"
                  className={`sf-planet-btn${isOpen ? " is-open" : ""}`}
                  aria-label={`${a.name} — ${label}`}
                  aria-expanded={isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(isOpen ? null : a.domain);
                  }}
                >
                  <span className="sf-glow" style={{ background: "radial-gradient(circle, rgba(255,64,64,0.38) 0%, transparent 68%)" }} />
                  {alienArtFail[a.key] ? (
                    <span className="sf-alien-orb" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/stars-art/alien-${a.key}.png`}
                      alt=""
                      className="sf-alien-img"
                      // A 404 that resolves BEFORE hydration never fires onError (the event is
                      // gone by the time React attaches it) — the ref catches an already-broken
                      // image at mount so the orb fallback still kicks in.
                      ref={(el) => {
                        if (el && el.complete && el.naturalWidth === 0 && !alienArtFail[a.key]) {
                          setAlienArtFail((m) => (m[a.key] ? m : { ...m, [a.key]: true }));
                        }
                      }}
                      onError={() => setAlienArtFail((m) => (m[a.key] ? m : { ...m, [a.key]: true }))}
                    />
                  )}
                </button>

                {!isOpen && (
                  <span className="sf-pname sf-aname">
                    {a.name} · ${a.bounty}
                    {live ? (
                      <span className="sf-atrack"><span className="sf-afill" style={{ width: `${Math.max(3, a.hpPct ?? 0)}%` }} /></span>
                    ) : (
                      <span className="sf-asub">{label}</span>
                    )}
                  </span>
                )}

                {isOpen && (
                  <div className="sf-card" onClick={(e) => e.stopPropagation()}>
                    <div className="sf-card-top">
                      <span className="sf-name">{a.name}</span>
                      <span className="sf-tag sf-tag--alien">${a.bounty} bounty</span>
                    </div>
                    <span className="sf-domain">{a.domain}</span>
                    {a.killed ? (
                      <span className="sf-sub">
                        {a.preBonded
                          ? "Arrived already bonded. No fight, bounty not paid."
                          : a.attackers > 0
                            ? `Destroyed. $${a.bounty} split among ${a.attackers} attackers by damage.`
                            : "Destroyed. Bounty unclaimed (no $5+ attackers at the kill)."}
                      </span>
                    ) : incoming ? (
                      <span className="sf-sub">Enemy ship incoming {relLaunch(a.launchAt, nowMs)}.</span>
                    ) : (
                      <>
                        {a.hpPct != null ? (
                          <>
                            <span className="sf-track"><span className="sf-fill" style={{ width: `${Math.max(3, a.hpPct)}%`, background: "#ff5252" }} /></span>
                            <span className="sf-sub">Shields at {a.hpPct}%. Every dollar held burns them down.</span>
                          </>
                        ) : (
                          <span className="sf-sub">Approaching. Not listed yet.</span>
                        )}
                        <span className="sf-sub sf-sub--dim">
                          Buy and hold ${"5"}+ of {a.domain} to deal damage. When it bonds, the ${a.bounty} bounty splits by damage dealt. Your crew race and Starlight do not change.
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* The 3 crew fleets: a flagship + a non-overlapping formation of the real
              hull sprites (one per pilot, sized by rank). Hover a ship to zoom in;
              tap a ship or the flagship to open that crew's leaderboard. */}
          {crews.map((c) => {
            const f = FLEETS[c.key];
            if (!f) return null;
            const ships = c.roster.slice(0, RENDER_CAP);
            const n = ships.length;
            const sw = shipSizePct(n, f.rx, f.ry);
            const maxSl = Math.max(40, ships[0]?.starlight || 1); // roster is sorted desc by Starlight
            const sizeMul = (sl: number) => 0.8 + 0.55 * Math.sqrt(Math.min(1, (sl || 0) / maxSl)); // bigger ship = more Starlight
            return (
              <div key={c.key} className="sf-fleet">
                <span
                  className="sf-fleet-zone"
                  style={{
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    background: `radial-gradient(ellipse 60% 50% at center, ${c.accent}22 0%, transparent 72%)`,
                  }}
                />
                {ships.map((p, i) => {
                  // phyllotaxis: ring out from the flagship (inner 0.46 keeps the flagship sprite
                  // clear so its clicks never steal a ship's tap), golden-angle spiral, no clones.
                  const radial = 0.46 + 0.54 * Math.sqrt((i + 0.5) / n);
                  const ang = i * GOLDEN;
                  const px = clamp(f.x + Math.cos(ang) * radial * f.rx, 0.03, 0.97);
                  const py = clamp(f.y + Math.sin(ang) * radial * f.ry, 0.04, 0.97);
                  return (
                    <button
                      key={i}
                      type="button"
                      className="sf-pship"
                      style={{ left: `${px * 100}%`, top: `${py * 100}%`, width: `${(sw * sizeMul(p.starlight)).toFixed(2)}%` }}
                      aria-label={`${p.name} — ${rankName(p.rank)}, ${p.starlight} Starlight`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShip({ name: p.name, rank: p.rank, starlight: p.starlight, legendary: p.legendary, crewKey: c.key, crewName: c.name, accent: c.accent });
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shipArt(c.key, p.rank, p.legendary)}
                        alt=""
                        className={`sf-pship-img${f.faceRight ? " flip" : ""}`}
                        style={{ filter: `drop-shadow(0 0 ${isLegend(p.legendary) ? 6 : 3}px ${isLegend(p.legendary) ? "#ffd680" : c.accent}) drop-shadow(0 2px 5px rgba(0,0,0,0.6))` }}
                      />
                      <span className="sf-pship-tip">
                        <b>{p.name}</b>
                        <span>
                          Rank {p.rank} · {p.starlight} ✦
                        </span>
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="sf-flag"
                  style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%` }}
                  aria-label={`${c.name} fleet standings`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPanel(c.key);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {/* Flagship art noses LEFT by default; flip it with its fleet so the whole
                      formation faces the singularity + the invasion (attack posture). */}
                  <img src={`/stars-art/flagship-${c.key}.png`} alt="" className={`sf-flag-img${FLEETS[c.key]?.faceRight ? " flip" : ""}`} />
                  <span className="sf-flag-label" style={{ color: c.accent }}>
                    {c.name} <span className="sf-flag-n">{c.pilots}</span>
                  </span>
                </button>
              </div>
            );
          })}

          <span className="sf-hint">Tap a planet for status · a fleet for standings</span>
          </section>
        </div>

        {/* Mobile-only legend: the floating cards can't fit a narrow viewport, so
            the sector stays a clean visual up top and the details stack here. */}
        <ul className="sf-starlist" aria-label="Stars">
          {stars.map((s) => {
            const st = STATUS[s.status];
            const pct = Math.round(s.progress * 100);
            return (
              <li key={s.domain} className="sf-srow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={planetArt(s.domain, s.status, s.progress)} alt="" className="sf-srow-img" />
                <div className="sf-srow-body">
                  <span className="sf-srow-top">
                    <span className="sf-srow-name">{s.name}</span>
                    {s.tag ? <span className="sf-tag">{s.tag}</span> : null}
                  </span>
                  <span className="sf-srow-sub">
                    {s.status === "live"
                      ? `${pct}% terraformed`
                      : s.status === "bonded"
                        ? "Terraformed ✦"
                        : s.status === "failed"
                          ? "Did not bond"
                          : `Lists ${fmtLaunch(s.launchAt)}`}
                  </span>
                </div>
                <span className="sf-pill" style={{ color: st.fg, background: st.bg }}>
                  <span className="sf-dot" style={{ background: st.fg }} />
                  {st.label}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Crew standings — sorted by Starlight; tap a crew for its full roster. */}
        <section className="sf-crews" aria-label="Crew standings">
          {ranked.map((c) => (
            <button
              key={c.key}
              type="button"
              className="sf-crew"
              style={{ borderColor: `${c.accent}40` }}
              onClick={() => setPanel(c.key)}
            >
              <span className="sf-crew-rank">{rankOf.get(c.key)}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/stars-art/crest-${c.key}.png`} alt="" className="sf-crew-crest" />
              <div className="sf-crew-body">
                <span className="sf-crew-name" style={{ color: c.accent }}>
                  {c.name}
                  {rankOf.get(c.key) === 1 ? <span className="sf-title" title="Sector Champion (current)">👑</span> : null}
                </span>
                <span className="sf-crew-count">
                  {c.pilots} {c.pilots === 1 ? "pilot" : "pilots"}
                </span>
              </div>
              <div className="sf-crew-sl">
                <span className="sf-crew-sl-n">{c.starlight}</span>
                <span className="sf-crew-sl-l">Starlight</span>
              </div>
              <span className="sf-crew-bar" style={{ background: c.accent }} />
            </button>
          ))}
        </section>
        <p className="sf-balance">Tap a crew for its roster. New pilots auto-join the smallest crew, so every crew has a fair shot.</p>

        <footer className="sf-foot">
          <p className="sf-foot-copy">
            Buy and hold a star from $5 to fuel your crew. Only stars that bond pay out, split across the top
            crews. The more you fuel, the bigger your share.
          </p>
          <div className="sf-cta">
            <Link href="/join" className="sf-btn sf-btn--gold">
              Join the Game
            </Link>
            <Link href="/games" className="sf-btn">
              Arcade
            </Link>
            <Link href="/" className="sf-btn">
              Back to Starfall
            </Link>
          </div>
        </footer>
      </div>

      {/* Crew leaderboard panel — opens from a flagship, a ship, or a crew card. */}
      {panelCrew && (
        <div className="sf-modal" onClick={() => setPanel(null)}>
          <div
            className="sf-board"
            onClick={(e) => e.stopPropagation()}
            style={{ borderColor: `${panelCrew.accent}55` }}
          >
            <button className="sf-board-x" onClick={() => setPanel(null)} aria-label="Close">
              ×
            </button>
            <div className="sf-board-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/stars-art/crest-${panelCrew.key}.png`} alt="" className="sf-board-crest" />
              <div>
                <div className="sf-board-name" style={{ color: panelCrew.accent }}>
                  {panelCrew.name}
                </div>
                <div className="sf-board-sub">
                  {ordinal(rankOf.get(panelCrew.key) || 0)} of {crews.length} · {panelCrew.starlight} Starlight ·{" "}
                  {panelCrew.pilots} {panelCrew.pilots === 1 ? "pilot" : "pilots"}
                </div>
              </div>
            </div>
            {panelCrew.roster.length === 0 ? (
              <p className="sf-board-empty">No pilots yet. Be the first to fly with {panelCrew.name}.</p>
            ) : (
              <ol className="sf-board-list">
                {panelCrew.roster.map((p, i) => (
                  <li key={i} className="sf-board-row sf-board-row--tap" onClick={() => setShip({ name: p.name, rank: p.rank, starlight: p.starlight, legendary: p.legendary, crewKey: panelCrew.key, crewName: panelCrew.name, accent: panelCrew.accent })}>
                    <span className="sf-board-pos">{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={shipArt(panelCrew.key, p.rank, p.legendary)} alt="" className="sf-board-ship" />
                    <span className="sf-board-pname">
                      {p.name}
                      {isLegend(p.legendary) ? <span className="sf-legend" title="Legendary hull">✦</span> : null}
                      {renderTitle(p.name)}
                    </span>
                    <span className="sf-board-prank">R{p.rank}</span>
                    <span className="sf-board-sl">{p.starlight} ✦</span>
                  </li>
                ))}
              </ol>
            )}
            <p className="sf-board-foot">
              Starlight comes from holding the star tokens and playing. It sets your share if your crew’s stars
              bond.
            </p>
          </div>
        </div>
      )}

      {/* Tapped-pilot card — the ship + their Starlight + hull title, shareable (S2 parity). */}
      {ship && (
        <div className="sf-modal" onClick={() => setShip(null)}>
          <div className="sf-shipcard" onClick={(e) => e.stopPropagation()} style={{ borderColor: `${ship.accent}66` }}>
            <button className="sf-board-x" onClick={() => setShip(null)} aria-label="Close">×</button>
            <div className="sf-sc-art" style={{ background: `radial-gradient(circle at 50% 42%, ${ship.accent}33 0%, transparent 70%)` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={shipArt(ship.crewKey, ship.rank, ship.legendary)} alt="" className="sf-sc-ship" />
            </div>
            <div className="sf-sc-name">
              {ship.name}
              {isLegend(ship.legendary) ? <span className="sf-legend" title="Legendary hull">✦</span> : null}
              {renderTitle(ship.name)}
            </div>
            <div className="sf-sc-crew" style={{ color: ship.accent }}>{ship.crewName} crew</div>
            <div className="sf-sc-stats">
              <div className="sf-sc-stat">
                <span className="sf-sc-v">{ship.starlight.toLocaleString()}</span>
                <span className="sf-sc-l">Starlight</span>
              </div>
              <div className="sf-sc-stat">
                <span className="sf-sc-v" style={isLegend(ship.legendary) ? { color: "#ffd680" } : undefined}>
                  {isLegend(ship.legendary) ? LEGEND_NAMES[ship.legendary!] : rankName(ship.rank)}
                </span>
                <span className="sf-sc-l">{isLegend(ship.legendary) ? "Legendary hull" : `Rank ${ship.rank} hull`}</span>
              </div>
            </div>
            <button className="sf-sc-share" onClick={() => shareShip(ship)}>{shared ? "Copied to clipboard ✓" : "Share this pilot"}</button>
          </div>
        </div>
      )}
    </main>
  );
}

const CSS = `
.sf-map{position:relative;min-height:100vh;overflow:hidden;background:#05070f;color:#e8ecf5;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
.sf-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 26%, #0b1126 0%, #05070f 55%, #03040a 100%);}
.sf-veil{position:absolute;inset:0;
  background:radial-gradient(120% 80% at 50% 42%, transparent 0%, rgba(3,4,10,0.30) 70%, rgba(3,4,10,0.80) 100%);}
.sf-shell{position:relative;z-index:2;max-width:1200px;margin:0 auto;padding:30px 24px 64px;}

.sf-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;}
.sf-back{color:#cdd4e4;text-decoration:none;font-size:14px;font-weight:600;opacity:.85;flex:0 0 auto;}
.sf-back:hover{opacity:1;}
.sf-title{text-align:center;flex:1 1 auto;}
.sf-eyebrow{margin:0;letter-spacing:.32em;font-size:11px;text-transform:uppercase;color:${GOLD};}
.sf-title h1{margin:2px 0 0;font-size:clamp(26px,5vw,40px);font-weight:800;
  background:linear-gradient(180deg,#fff 0%,${GOLD} 150%);-webkit-background-clip:text;background-clip:text;color:transparent;}
.sf-tally{flex:0 0 auto;text-align:right;line-height:1;}
.sf-tally-num{font-size:30px;font-weight:800;color:#fff;}
.sf-tally-slash{color:#6b7690;font-weight:700;font-size:20px;}
.sf-tally-lbl{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8b95ad;margin-top:3px;}
.sf-season{text-align:center;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${GOLD};margin:0 0 12px;}
.sf-rail-season{font-size:10.5px;font-weight:700;letter-spacing:.03em;color:${GOLD};text-align:center;padding:5px 0 1px;opacity:.92;}

/* Stage = the left TOP CAPTAINS rail + the sector, side by side (like the seas map). */
.sf-stage{display:grid;grid-template-columns:236px 1fr;gap:18px;align-items:start;margin:6px 0 18px;}
.sf-rail{background:rgba(9,12,22,0.66);backdrop-filter:blur(7px);border:1px solid rgba(240,179,64,0.16);
  border-radius:16px;padding:14px 12px;display:flex;flex-direction:column;gap:8px;}
.sf-rail-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;
  padding:0 4px 8px;border-bottom:1px solid rgba(255,255,255,0.06);}
.sf-rail-title{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${GOLD};}
.sf-rail-sub{font-size:10px;color:#8b95ad;letter-spacing:.04em;}
.sf-rail-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px;overflow:auto;}
.sf-rail-row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;cursor:pointer;
  padding:6px;border:0;background:none;border-radius:8px;transition:background .12s;}
.sf-rail-row:hover{background:rgba(255,255,255,0.05);}
.sf-rail-pos{width:18px;text-align:right;font-size:12px;font-weight:800;color:#8b95ad;flex:0 0 auto;}
.sf-rail-flag{width:9px;height:9px;border-radius:2px;flex:0 0 auto;box-shadow:0 0 7px currentColor;}
.sf-rail-name{flex:1 1 auto;min-width:0;font-size:13px;font-weight:600;color:#e8ecf5;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sf-rail-sl{flex:0 0 auto;font-size:12.5px;font-weight:700;color:#fff;}
.sf-rail-foot{font-size:10.5px;color:#7a849c;text-align:center;margin:2px 0 0;padding-top:8px;
  border-top:1px solid rgba(255,255,255,0.06);line-height:1.4;}
.sf-rail-empty{font-size:12px;color:#aeb6c8;text-align:center;padding:18px 6px;}
.sf-sector{position:relative;width:100%;aspect-ratio:7/6;margin:0;cursor:default;}
.sf-sector-bg{position:absolute;inset:0;z-index:0;border-radius:22px;
  background:#05070f url('/stars-art/blackhole.png') 50% 50%/cover no-repeat;
  -webkit-mask:radial-gradient(125% 105% at 50% 46%, #000 58%, transparent 100%);
  mask:radial-gradient(125% 105% at 50% 46%, #000 58%, transparent 100%);}
.sf-hint{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:1;
  font-size:11px;letter-spacing:.06em;color:#7a849c;opacity:.8;pointer-events:none;}

.sf-planet{position:absolute;transform:translate(-50%,-50%);z-index:2;}
.sf-planet-btn{position:relative;display:block;width:100%;padding:0;border:0;background:none;cursor:pointer;
  -webkit-tap-highlight-color:transparent;}
.sf-glow{position:absolute;left:50%;top:50%;width:170%;height:170%;transform:translate(-50%,-50%);
  z-index:0;pointer-events:none;opacity:.85;transition:opacity .2s,transform .2s;}
.sf-planet-img{position:relative;z-index:1;width:100%;height:auto;display:block;animation:sf-bob 7s ease-in-out infinite;
  transition:transform .2s;filter:drop-shadow(0 6px 18px rgba(0,0,0,0.5));}
.sf-planet-btn:hover .sf-planet-img{transform:scale(1.05);}
.sf-planet-btn:hover .sf-glow{opacity:1;transform:translate(-50%,-50%) scale(1.12);}
.sf-planet-btn.is-open .sf-glow{opacity:1;transform:translate(-50%,-50%) scale(1.18);}

.sf-pname{position:absolute;left:50%;top:calc(100% + 5px);transform:translateX(-50%);z-index:2;
  display:inline-flex;align-items:center;gap:6px;white-space:nowrap;pointer-events:none;
  font-size:12px;font-weight:600;color:#dfe5f2;text-shadow:0 1px 6px rgba(0,0,0,0.9);}
.sf-pdot{width:6px;height:6px;border-radius:50%;box-shadow:0 0 8px currentColor;}

/* ── Battlefield glow zones: crew smoke on the left, menace on the right ── */
.sf-zones{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;border-radius:22px;}
.sf-zone{position:absolute;display:block;filter:blur(34px);mix-blend-mode:screen;}
/* One element, four stacked gradients: gold / violet / teal blend continuously inside a
   single aura (the faint pale backbone ties them into one army formation, not three blobs). */
.sf-zone--fleet{left:-8%;top:-4%;width:34%;height:108%;
  background:
    radial-gradient(ellipse 75% 30% at 42% 15%, rgba(240,179,64,0.32), transparent 72%),
    radial-gradient(ellipse 80% 34% at 30% 50%, rgba(124,106,255,0.30), transparent 72%),
    radial-gradient(ellipse 75% 30% at 42% 85%, rgba(94,234,212,0.32), transparent 72%),
    radial-gradient(ellipse 52% 92% at 22% 50%, rgba(210,200,255,0.12), transparent 82%);
  animation:sf-smoke 12s ease-in-out infinite;}
.sf-zone--alien{right:-9%;top:-4%;width:30%;height:108%;
  background:radial-gradient(ellipse 60% 55% at 62% 50%, rgba(255,64,64,0.26), rgba(255,64,64,0.08) 55%, transparent 78%);
  animation:sf-smoke 13s ease-in-out infinite reverse;}
@keyframes sf-smoke{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(2.5%,-2%) scale(1.12);}}

/* ── W2 alien invasion (crimson: the one color the sector map never uses,
      so hostiles read instantly against the navy/gold/teal — Mike 2026-07-08) ── */
.sf-alien{position:absolute;transform:translate(-50%,-50%);z-index:2;}
/* Visibility (Mike 2026-07-08): a WHITE-HOT rim hugging the creature's silhouette + a wide
   crimson bloom (layered drop-shadows track the sprite alpha = a true outline glow), and the
   halo behind it breathes. Nothing else on the map glows white+red, so hostiles pop. */
.sf-alien-img{position:relative;z-index:1;width:100%;height:auto;display:block;
  animation:sf-alien-drift 9s ease-in-out infinite;
  filter:drop-shadow(0 0 5px rgba(255,255,255,0.85)) drop-shadow(0 0 16px rgba(255,64,64,0.8)) drop-shadow(0 0 34px rgba(255,48,48,0.45));}
.sf-alien .sf-glow{opacity:1;animation:sf-alien-pulse 3.2s ease-in-out infinite;}
.sf-alien.is-dead .sf-alien-img,.sf-alien.is-dead .sf-alien-orb{filter:grayscale(1) brightness(0.5) drop-shadow(0 0 8px rgba(255,255,255,0.25));opacity:.55;animation:none;}
.sf-alien.is-dead .sf-glow{animation:none;opacity:.25;}
.sf-alien.is-incoming .sf-alien-img,.sf-alien.is-incoming .sf-alien-orb{opacity:.6;
  filter:brightness(0.7) saturate(0.7) drop-shadow(0 0 6px rgba(255,255,255,0.5)) drop-shadow(0 0 14px rgba(255,64,64,0.4));}
@keyframes sf-alien-pulse{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.65;}50%{transform:translate(-50%,-50%) scale(1.3);opacity:1;}}
.sf-alien-orb{position:relative;z-index:1;display:block;width:100%;aspect-ratio:1;border-radius:50%;
  background:radial-gradient(circle at 38% 34%, rgba(255,120,110,0.9), rgba(150,26,26,0.92) 55%, rgba(30,6,8,0.95) 100%);
  box-shadow:0 0 24px rgba(255,64,64,0.45), inset 0 0 18px rgba(0,0,0,0.6);
  animation:sf-alien-drift 9s ease-in-out infinite;}
/* Two-line plate (Mike 2026-07-08): "Name · $bounty" on top, the shields bar or the
   status word (DESTROYED / incoming) UNDERNEATH, so the plate never runs long. */
.sf-aname{color:#ffb0a8;flex-direction:column;gap:3px;}
.sf-atrack{display:block;width:74px;height:5px;border-radius:999px;background:rgba(255,82,82,0.18);overflow:hidden;}
.sf-afill{display:block;height:100%;border-radius:999px;background:#ff5252;box-shadow:0 0 8px rgba(255,82,82,0.75);}
.sf-asub{font-size:10px;font-weight:600;color:#e09a93;}
.sf-tag--alien{color:#ff6b6b;background:rgba(255,82,82,0.12);border-color:rgba(255,82,82,0.32);}
@keyframes sf-alien-drift{0%,100%{transform:translateY(0) rotate(-1.5deg);}50%{transform:translateY(-6px) rotate(1.5deg);}}

.sf-card{position:absolute;left:50%;top:calc(100% + 8px);transform:translateX(-50%);
  width:max-content;max-width:200px;display:flex;flex-direction:column;align-items:center;gap:4px;
  padding:9px 13px;border-radius:12px;background:rgba(9,12,22,0.86);backdrop-filter:blur(8px);
  border:1px solid rgba(240,179,64,0.22);box-shadow:0 12px 32px rgba(0,0,0,0.55);z-index:6;text-align:center;
  animation:sf-pop .16s ease-out;}
.sf-card--above{top:auto;bottom:calc(100% + 8px);}
.sf-card-top{display:flex;align-items:center;gap:6px;}
.sf-name{font-weight:700;font-size:15px;color:#fff;}
.sf-tag{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:${GOLD};
  background:rgba(240,179,64,0.14);border:1px solid rgba(240,179,64,0.28);padding:2px 6px;border-radius:999px;}
.sf-domain{font-size:11px;color:#8b95ad;}
.sf-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;
  padding:3px 10px;border-radius:999px;letter-spacing:.02em;}
.sf-dot{width:6px;height:6px;border-radius:50%;display:inline-block;box-shadow:0 0 8px currentColor;}
.sf-track{width:128px;max-width:60vw;height:5px;border-radius:999px;background:rgba(255,255,255,0.10);overflow:hidden;}
.sf-fill{display:block;height:100%;border-radius:999px;box-shadow:0 0 10px rgba(240,179,64,0.5);}
.sf-sub{font-size:11px;color:#aeb6c8;}
.sf-sub--dim{color:#6f7990;font-size:10px;margin-top:-2px;}

/* Fleets — the container passes clicks through; only ships + flagships are interactive */
.sf-fleet{position:absolute;inset:0;pointer-events:none;z-index:1;}
.sf-fleet-zone{position:absolute;width:28%;height:34%;transform:translate(-50%,-50%);border-radius:50%;}
.sf-pship{position:absolute;width:3.4%;min-width:12px;transform:translate(-50%,-50%);padding:0;border:0;
  background:none;cursor:pointer;pointer-events:auto;z-index:3;-webkit-tap-highlight-color:transparent;}
.sf-pship::before{content:"";position:absolute;inset:-28%;border-radius:50%;}/* roomier tap/hover target */
.sf-pship-img{width:100%;height:auto;display:block;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.65));
  transition:transform .15s ease-out;}
.sf-pship-img.flip{transform:scaleX(-1);}            /* nose toward the singularity */
.sf-pship:hover{z-index:60;}
.sf-pship:hover .sf-pship-img{transform:scale(3.4);}
.sf-pship:hover .sf-pship-img.flip{transform:scaleX(-1) scale(3.4);}  /* compose flip + zoom */
.sf-pship-tip{position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);
  display:none;flex-direction:column;align-items:center;white-space:nowrap;z-index:61;pointer-events:none;
  padding:5px 10px;border-radius:8px;background:rgba(6,9,18,0.96);border:1px solid rgba(240,179,64,0.3);
  box-shadow:0 8px 22px rgba(0,0,0,0.6);}
.sf-pship:hover .sf-pship-tip{display:flex;}
.sf-pship-tip b{font-size:12px;color:#fff;}
.sf-pship-tip span{font-size:10px;color:#aeb6c8;}
.sf-flag{position:absolute;transform:translate(-50%,-50%);width:8%;min-width:54px;padding:0;border:0;background:none;
  cursor:pointer;pointer-events:auto;display:flex;flex-direction:column;align-items:center;z-index:4;
  -webkit-tap-highlight-color:transparent;}
.sf-flag-img{width:100%;height:auto;display:block;filter:drop-shadow(0 4px 12px rgba(0,0,0,0.6));
  animation:sf-bob 6s ease-in-out infinite;transition:transform .2s;}
/* The bob ANIMATION owns the transform, so a plain scaleX(-1) on the class gets stomped;
   flipped flagships need their own keyframes with the mirror baked into every frame. */
.sf-flag-img.flip{transform:scaleX(-1);animation-name:sf-bob-flip;}
.sf-flag:hover .sf-flag-img{transform:scale(1.08);animation:none;}
.sf-flag:hover .sf-flag-img.flip{transform:scaleX(-1) scale(1.08);animation:none;}
.sf-flag-label{margin-top:3px;display:inline-flex;align-items:center;gap:5px;
  font-size:11px;font-weight:700;white-space:nowrap;text-shadow:0 1px 6px rgba(0,0,0,0.95);}
.sf-flag-n{padding:0 6px;border-radius:999px;background:rgba(255,255,255,0.16);
  font-size:10px;font-weight:700;color:#fff;}

/* Crew standings strip (a leaderboard at a glance) */
.sf-crews{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:6px;}
.sf-crew{position:relative;display:flex;align-items:center;gap:12px;overflow:hidden;text-align:left;cursor:pointer;
  padding:14px 16px;border-radius:16px;background:rgba(9,12,22,0.66);backdrop-filter:blur(7px);
  border:1px solid rgba(240,179,64,0.16);transition:transform .15s,background .15s;}
.sf-crew:hover{transform:translateY(-2px);background:rgba(14,18,32,0.8);}
.sf-crew-rank{font-size:13px;font-weight:800;color:#8b95ad;width:18px;flex:0 0 auto;}
.sf-crew-crest{width:44px;height:44px;object-fit:contain;flex:0 0 auto;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));}
.sf-crew-body{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0;}
.sf-crew-name{font-weight:800;font-size:17px;letter-spacing:.01em;}
.sf-crew-count{font-size:13px;color:#aeb6c8;}
.sf-crew-sl{display:flex;flex-direction:column;align-items:flex-end;flex:0 0 auto;line-height:1.1;}
.sf-crew-sl-n{font-size:18px;font-weight:800;color:#fff;}
.sf-crew-sl-l{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#8b95ad;}
.sf-crew-bar{position:absolute;left:0;bottom:0;height:3px;width:100%;opacity:.85;}
.sf-balance{text-align:center;color:#8b95ad;font-size:12.5px;margin:14px 0 0;}

.sf-starlist{display:none;list-style:none;padding:0;margin:0;}
.sf-srow{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:13px;
  background:rgba(9,12,22,0.7);border:1px solid rgba(240,179,64,0.15);}
.sf-srow-img{width:38px;height:38px;object-fit:contain;flex:0 0 auto;}
.sf-srow-body{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0;}
.sf-srow-top{display:flex;align-items:center;gap:6px;}
.sf-srow-name{font-weight:700;font-size:14px;color:#fff;}
.sf-srow-sub{font-size:11px;color:#aeb6c8;}

.sf-foot{margin-top:30px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:18px;}
.sf-foot-copy{max-width:580px;margin:0;color:#cdd4e4;font-size:14.5px;line-height:1.6;}
.sf-cta{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}
.sf-btn{padding:13px 26px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;
  background:rgba(13,17,32,0.7);color:#e8ecf5;border:1px solid #1c2236;}
.sf-btn--gold{background:${GOLD};color:#1a1205;font-weight:700;border:none;}
.sf-btn:hover{filter:brightness(1.06);}

/* Crew leaderboard modal */
.sf-modal{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;
  background:rgba(3,4,10,0.74);backdrop-filter:blur(4px);animation:sf-fade .15s ease-out;}
.sf-board{position:relative;width:min(460px,100%);max-height:84vh;overflow:auto;
  background:rgba(10,13,24,0.96);border:1px solid rgba(240,179,64,0.4);border-radius:18px;
  padding:22px;box-shadow:0 24px 60px rgba(0,0,0,0.6);animation:sf-rise .18s ease-out;}
.sf-board-x{position:absolute;top:12px;right:14px;width:30px;height:30px;border-radius:50%;border:0;cursor:pointer;
  background:rgba(255,255,255,0.08);color:#cdd4e4;font-size:20px;line-height:1;}
.sf-board-x:hover{background:rgba(255,255,255,0.16);color:#fff;}
.sf-board-head{display:flex;align-items:center;gap:14px;margin-bottom:16px;}
.sf-board-crest{width:54px;height:54px;object-fit:contain;flex:0 0 auto;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));}
.sf-board-name{font-size:22px;font-weight:800;}
.sf-board-sub{font-size:12.5px;color:#aeb6c8;margin-top:2px;}
.sf-board-empty{color:#aeb6c8;font-size:14px;text-align:center;padding:24px 0;}
.sf-board-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;}
.sf-board-row{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:11px;
  background:rgba(255,255,255,0.035);}
.sf-board-pos{width:20px;text-align:center;font-weight:800;font-size:13px;color:#8b95ad;flex:0 0 auto;}
.sf-board-ship{width:46px;height:30px;object-fit:contain;flex:0 0 auto;}
.sf-board-pname{flex:1 1 auto;min-width:0;font-weight:600;font-size:14px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sf-board-prank{font-size:11px;color:#8b95ad;flex:0 0 auto;}
.sf-legend{color:#ffd680;font-size:11px;margin-left:4px;text-shadow:0 0 6px rgba(255,214,128,0.85);}
.sf-title{margin-left:4px;font-size:11px;line-height:1;filter:drop-shadow(0 0 4px rgba(240,179,64,0.6));}
.sf-board-sl{font-size:13px;font-weight:700;color:${GOLD};flex:0 0 auto;min-width:58px;text-align:right;}
.sf-board-foot{margin:14px 0 0;font-size:11.5px;color:#7a849c;line-height:1.5;text-align:center;}
.sf-board-row--tap{cursor:pointer;transition:background .12s;}
.sf-board-row--tap:hover{background:rgba(255,255,255,0.09);}
.sf-shipcard{position:relative;width:min(360px,100%);background:rgba(10,13,24,0.97);
  border:1px solid rgba(240,179,64,0.4);border-radius:20px;padding:22px;text-align:center;
  box-shadow:0 24px 60px rgba(0,0,0,0.6);animation:sf-rise .18s ease-out;}
.sf-sc-art{display:flex;align-items:center;justify-content:center;height:150px;margin:6px 0 6px;border-radius:14px;}
.sf-sc-ship{max-width:94%;max-height:140px;object-fit:contain;filter:drop-shadow(0 6px 18px rgba(0,0,0,0.6));}
.sf-sc-name{font-size:20px;font-weight:800;color:#fff;display:inline-flex;align-items:center;justify-content:center;gap:2px;}
.sf-sc-crew{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-top:2px;}
.sf-sc-stats{display:flex;gap:12px;margin:16px 0 2px;}
.sf-sc-stat{flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);
  border-radius:12px;padding:11px 8px;display:flex;flex-direction:column;gap:3px;}
.sf-sc-v{font-size:17px;font-weight:800;color:#fff;line-height:1.15;}
.sf-sc-l{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#8b95ad;}
.sf-sc-share{margin-top:14px;width:100%;padding:12px;border:0;border-radius:12px;cursor:pointer;
  background:${GOLD};color:#1a1205;font-weight:700;font-size:14px;}
.sf-sc-share:hover{filter:brightness(1.06);}

@keyframes sf-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
@keyframes sf-bob-flip{0%,100%{transform:scaleX(-1) translateY(0);}50%{transform:scaleX(-1) translateY(-6px);}}
@keyframes sf-pop{from{opacity:0;transform:translateX(-50%) scale(.92);}to{opacity:1;transform:translateX(-50%) scale(1);}}
@keyframes sf-fade{from{opacity:0;}to{opacity:1;}}
@keyframes sf-rise{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
@media (prefers-reduced-motion: reduce){
  .sf-planet-img,.sf-flag-img,.sf-alien-img,.sf-alien-orb,.sf-alien .sf-glow,.sf-zone{animation:none !important;}
  .sf-card,.sf-modal,.sf-board{animation:none !important;}
}
@media (max-width:680px){
  .sf-shell{padding:24px 16px 52px;}
  .sf-stage{grid-template-columns:1fr;gap:12px;}
  .sf-sector{order:1;aspect-ratio:1/1;margin:4px 0 4px;}
  .sf-rail{order:2;}
  .sf-rail-list{max-height:320px;}
  .sf-card,.sf-pname,.sf-hint,.sf-flag-label{display:none;}
  .sf-flag{width:13%;min-width:0;}
  .sf-pship{width:5%;}
  .sf-starlist{display:flex;flex-direction:column;gap:9px;margin:2px 0 18px;}
  .sf-crews{grid-template-columns:1fr;}
  .sf-head{flex-wrap:wrap;}
}
`;
