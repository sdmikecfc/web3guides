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

// Per-crew formation: the swarm/flagship center, grid columns (left+right lanes are
// tall/narrow, the bottom lane is wide), and which way the side-profile ships face
// (nose toward the singularity). Tuned to sit in the gaps the planets leave clear.
const FLEETS: Record<string, { x: number; y: number; cols: number; faceRight: boolean }> = {
  nebula: { x: 0.115, y: 0.5, cols: 4, faceRight: true },
  pulsar: { x: 0.885, y: 0.54, cols: 4, faceRight: false },
  vanguard: { x: 0.5, y: 0.85, cols: 11, faceRight: false },
};
const SHIP_DX = 0.04;
const SHIP_DY = 0.052;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hullArt = (rank: number) => `/stars-art/hull-${String(clamp(rank || 1, 1, 12)).padStart(2, "0")}.png`;
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

const STATUS: Record<
  SectorStar["status"],
  { label: string; fg: string; bg: string; glow: string }
> = {
  pending: { label: "Standby", fg: "#aab8e0", bg: "rgba(124,160,255,0.14)", glow: "rgba(124,160,255,0.22)" },
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

export function SectorMap({ sector }: { sector: Sector }) {
  const { stars, crews, totals, nowMs } = sector;
  const [open, setOpen] = useState<string | null>(null); // planet domain
  const [panel, setPanel] = useState<string | null>(null); // crew leaderboard

  // Crew standings: sort by Starlight (then size) for the rank shown on every surface.
  const ranked = [...crews].sort((a, b) => b.starlight - a.starlight || b.pilots - a.pilots);
  const rankOf = new Map(ranked.map((c, i) => [c.key, i + 1]));
  const panelCrew = panel ? crews.find((c) => c.key === panel) : null;

  // Global TOP CAPTAINS leaderboard (individual pilots by Starlight, across all crews) for the
  // left rail — like the seas map, so a player can track their personal rank. Built from the
  // per-crew rosters already in the snapshot (names only, never wallets/dollars). Top 20.
  const captains = crews
    .flatMap((c) => c.roster.map((p) => ({ name: p.name, rank: p.rank, starlight: p.starlight, crew: c.key, accent: c.accent })))
    .sort((a, b) => b.starlight - a.starlight)
    .slice(0, 20);

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

        <div className="sf-stage">
          <aside className="sf-rail" aria-label="Top captains">
            <div className="sf-rail-head">
              <span className="sf-rail-title">Top Captains</span>
              <span className="sf-rail-sub">by Starlight</span>
            </div>
            {captains.length === 0 ? (
              <p className="sf-rail-empty">No pilots yet. Be the first to fly.</p>
            ) : (
              <ol className="sf-rail-list">
                {captains.map((c, i) => (
                  <li key={i}>
                    <button type="button" className="sf-rail-row" onClick={() => setPanel(c.crew)} title={`${c.name} — ${c.starlight} Starlight`}>
                      <span className="sf-rail-pos">{i + 1}</span>
                      <span className="sf-rail-flag" style={{ background: c.accent, color: c.accent }} />
                      <span className="sf-rail-name">{c.name}</span>
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
                  <img src={planetArt(s.domain, s.status)} alt="" className="sf-planet-img" />
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

          {/* The 3 crew fleets: a flagship + a non-overlapping formation of the real
              hull sprites (one per pilot, sized by rank). Hover a ship to zoom in;
              tap a ship or the flagship to open that crew's leaderboard. */}
          {crews.map((c) => {
            const f = FLEETS[c.key];
            if (!f) return null;
            const ships = c.roster.slice(0, RENDER_CAP);
            const rows = Math.max(1, Math.ceil(ships.length / f.cols));
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
                  const col = i % f.cols;
                  const row = Math.floor(i / f.cols);
                  const px = clamp(f.x + (col - (f.cols - 1) / 2) * SHIP_DX, 0.035, 0.965);
                  const py = clamp(f.y + (row - (rows - 1) / 2) * SHIP_DY, 0.05, 0.96);
                  return (
                    <button
                      key={i}
                      type="button"
                      className="sf-pship"
                      style={{ left: `${px * 100}%`, top: `${py * 100}%` }}
                      aria-label={`${p.name} — rank ${p.rank}, ${p.starlight} Starlight`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPanel(c.key);
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={hullArt(p.rank)}
                        alt=""
                        className={`sf-pship-img${f.faceRight ? " flip" : ""}`}
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
                  <img src={`/stars-art/flagship-${c.key}.png`} alt="" className="sf-flag-img" />
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
                <img src={planetArt(s.domain, s.status)} alt="" className="sf-srow-img" />
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
                  <li key={i} className="sf-board-row">
                    <span className="sf-board-pos">{i + 1}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={hullArt(p.rank)} alt="" className="sf-board-ship" />
                    <span className="sf-board-pname">{p.name}</span>
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
.sf-pship{position:absolute;width:3.4%;min-width:18px;transform:translate(-50%,-50%);padding:0;border:0;
  background:none;cursor:pointer;pointer-events:auto;z-index:3;-webkit-tap-highlight-color:transparent;}
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
.sf-flag:hover .sf-flag-img{transform:scale(1.08);}
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
.sf-board-sl{font-size:13px;font-weight:700;color:${GOLD};flex:0 0 auto;min-width:58px;text-align:right;}
.sf-board-foot{margin:14px 0 0;font-size:11.5px;color:#7a849c;line-height:1.5;text-align:center;}

@keyframes sf-bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
@keyframes sf-pop{from{opacity:0;transform:translateX(-50%) scale(.92);}to{opacity:1;transform:translateX(-50%) scale(1);}}
@keyframes sf-fade{from{opacity:0;}to{opacity:1;}}
@keyframes sf-rise{from{opacity:0;transform:translateY(14px);}to{opacity:1;transform:translateY(0);}}
@media (prefers-reduced-motion: reduce){
  .sf-planet-img,.sf-flag-img{animation:none !important;}
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
