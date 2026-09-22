"use client";
/**
 * Season 4 BEACH MAP — the painted "state of the season" surface.
 *
 * Client component; the server page hands it the one season snapshot. Keeps
 * the S3 battlefield READABILITY grammar, beach-translated (ADR-0008):
 *
 *   LEFT   three TEAM CAMPS in fixed thirds (alpha / beta / gamma, top to
 *          bottom) under blurred radial accent glows that screen-blend.
 *          Fixed zones, never standings-ordered, so nothing reshuffles.
 *   CENTER the featured domains ring a luxury POOL as cabana plates with a
 *          live bond bar. One inflatable flamingo drifts in the pool.
 *   RIGHT  an events band, reserved (labeled) for future bosses.
 *
 * Art hooks: every sprite keys an asset under /public/s4-art/map/ with a
 * clean vector fallback, using the S3 hydration-safe onError pattern (a 404
 * that resolves before hydration never fires onError; a ref catches the
 * already-broken image at mount). The page ships on the fallbacks today and
 * upgrades automatically when the generated art lands.
 *
 * Copy: compile-time Beach Party strings + the snapshot theme words. Domains
 * are always celebrated, never mocked. No dollar math here beyond the shared
 * pool line computed in lib/s4/data.ts and passed in as text.
 */
import { useState } from "react";
import Link from "next/link";
import type { Snapshot, SeasonTarget } from "@/lib/s4/data";
import { statusLabel } from "@/lib/s4/theme";
import { STATUS_COLOR, UI } from "../_components/ui";
import { SeasonCountdown } from "../_components/SeasonCountdown";

const ART_BASE = "/s4-art/map";

// ── Fixed stage geometry (fractions of the stage box; the S3 grammar) ──────
// Camps hold the left column in fixed thirds. The pool anchors the center;
// targets ring it clockwise from 12 o'clock by sortOrder index. The events
// band owns the right edge. Nothing moves with standings.
const CAMP_X = 0.125;
const CAMP_Y: Record<string, number> = { alpha: 0.3, beta: 0.56, gamma: 0.82 };
const POOL = { x: 0.52, y: 0.56 };
const RING = { rx: 0.19, ry: 0.27 };
const MAX_TOWELS = 8; // never render every player; the rest fold into a +N chip

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "TBA";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function relDays(iso: string, now: number): string | null {
  const diff = new Date(iso).getTime() - now;
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const days = Math.floor(diff / 86400000);
  if (days >= 1) return `in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.floor(diff / 3600000));
  return `in ${hours} hour${hours === 1 ? "" : "s"}`;
}

// ── Art with vector fallback (S3 hydration-safe pattern) ───────────────────
function ArtSprite({
  src,
  className,
  fallback,
}: {
  src: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={className}
      // A 404 that resolves BEFORE hydration never fires onError (the event
      // is gone by the time React attaches it); the ref catches an already
      // broken image at mount so the vector fallback still kicks in.
      ref={(el) => {
        if (el && el.complete && el.naturalWidth === 0) setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}

// Camp cluster: two umbrellas, towels on the sand, and the team flag, all in
// the team accent. Replaced wholesale by camp-<key>.png when the art lands.
function CampFallback({ accent, className }: { accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={className} aria-hidden="true">
      <path d="M10 42 A28 28 0 0 1 66 42 Z" fill={accent} />
      <path d="M10 42 A28 28 0 0 1 66 42 Z" fill="rgba(255,255,255,0.22)" transform="translate(14 0) scale(0.5 1)" />
      <rect x="37" y="42" width="2.4" height="32" rx="1.2" fill="#d8cbb6" />
      <path d="M58 54 A19 19 0 0 1 96 54 Z" fill={accent} opacity="0.85" />
      <rect x="76" y="54" width="2.2" height="24" rx="1.1" fill="#d8cbb6" />
      <rect x="16" y="77" width="19" height="7" rx="2.5" fill={accent} opacity="0.9" />
      <rect x="44" y="80" width="19" height="7" rx="2.5" fill="rgba(255,255,255,0.5)" />
      <rect x="70" y="78" width="19" height="7" rx="2.5" fill={accent} opacity="0.55" />
      <rect x="103" y="20" width="2.4" height="58" rx="1.2" fill="#d8cbb6" />
      <path d="M105 20 L120 26 L105 32 Z" fill={accent} />
    </svg>
  );
}

// Cabana icon for a target plate: scalloped awning over a small beach hut.
function CabanaFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 64" className={className} aria-hidden="true">
      <rect x="14" y="26" width="52" height="30" rx="4" fill="rgba(24,20,34,0.9)" stroke="rgba(255,255,255,0.18)" />
      <rect x="30" y="36" width="20" height="20" rx="2.5" fill="rgba(255,255,255,0.10)" />
      <rect x="8" y="14" width="64" height="13" rx="5" fill="#f0b340" />
      <circle cx="16" cy="27" r="5" fill="#f0b340" />
      <circle cx="28" cy="27" r="5" fill="#fdf3dd" />
      <circle cx="40" cy="27" r="5" fill="#f0b340" />
      <circle cx="52" cy="27" r="5" fill="#fdf3dd" />
      <circle cx="64" cy="27" r="5" fill="#f0b340" />
    </svg>
  );
}

// The luxury pool centerpiece: deck, water, and a soft highlight.
function PoolFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 130" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="bpPoolWater" cx="42%" cy="36%" r="80%">
          <stop offset="0%" stopColor="#6fd6ef" />
          <stop offset="55%" stopColor="#2f9cc4" />
          <stop offset="100%" stopColor="#155f84" />
        </radialGradient>
      </defs>
      <ellipse cx="110" cy="66" rx="106" ry="56" fill="rgba(244,233,214,0.20)" />
      <ellipse cx="110" cy="66" rx="94" ry="47" fill="url(#bpPoolWater)" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      <ellipse cx="84" cy="50" rx="34" ry="13" fill="rgba(255,255,255,0.20)" />
      <path d="M40 76 q14 -7 28 0 t28 0 t28 0 t28 0" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M56 90 q12 -6 24 0 t24 0 t24 0 t24 0" fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// One decorative inflatable flamingo, drifting in the pool.
function FlamingoFallback({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <circle cx="40" cy="50" r="20" fill="none" stroke="#ff8fc0" strokeWidth="13" />
      <circle cx="40" cy="50" r="20" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="4" strokeDasharray="9 14" />
      <path d="M56 44 C66 38 66 24 58 18 C52 13 44 15 42 22" fill="none" stroke="#ff8fc0" strokeWidth="9" strokeLinecap="round" />
      <circle cx="42" cy="20" r="8" fill="#ff8fc0" />
      <path d="M36 18 L26 21 L36 25 Z" fill="#2b2330" />
      <circle cx="43" cy="18" r="1.6" fill="#2b2330" />
    </svg>
  );
}

export function BeachMap({ snap, poolLineText }: { snap: Snapshot; poolLineText: string }) {
  const t = snap.theme;
  const [openTarget, setOpenTarget] = useState<string | null>(null);
  const [openCamp, setOpenCamp] = useState<string | null>(null);
  const closeAll = () => {
    setOpenTarget(null);
    setOpenCamp(null);
  };

  // Camps render in FIXED theme order (alpha/beta/gamma); standings only set
  // the small rank chip, never the position. snap.teams is standings-sorted.
  const rankOf = new Map(snap.teams.map((team, i) => [team.key, i + 1]));
  const camps = t.teams
    .filter((tt) => CAMP_Y[tt.key] !== undefined)
    .map((tt) => {
      const standing = snap.teams.find((x) => x.key === tt.key);
      return {
        key: tt.key,
        name: tt.name,
        accent: tt.accent,
        players: standing?.players ?? 0,
        points: standing?.points ?? 0,
        y: CAMP_Y[tt.key],
      };
    });

  // Cabana ring: fixed positions from the target's index (sortOrder already
  // applied server-side), clockwise from 12 o'clock. Never standings-ordered.
  const ringPos = (i: number, n: number) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    return { x: POOL.x + Math.cos(ang) * RING.rx, y: POOL.y + Math.sin(ang) * RING.ry };
  };

  const targetSub = (target: SeasonTarget): string => {
    const pct = Math.round(target.progress * 100);
    if (target.status === "bonded") return `${t.bondedWord} ✦`;
    if (target.status === "live") return `${pct}% bonded`;
    if (target.status === "failed") return "Closed for this season";
    if (target.launchAt) {
      const rel = relDays(target.launchAt, snap.nowMs);
      return rel ? `Opens ${fmtDate(target.launchAt)} · ${rel}` : `Opens ${fmtDate(target.launchAt)}`;
    }
    return "Opening date TBA";
  };

  return (
    <main className="bp-map">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="bp-bg" />

      <div className="bp-shell">
        <header className="bp-head">
          <Link href="/s4" className="bp-back">
            ‹ Season 4
          </Link>
          <div className="bp-title">
            <p className="bp-eyebrow">{t.seasonName}</p>
            <h1>Beach Map</h1>
          </div>
          <div className="bp-tally">
            <span className="bp-tally-num">
              {snap.totals.bonded}
              <span className="bp-tally-slash">/{snap.totals.total}</span>
            </span>
            <span className="bp-tally-lbl">
              {t.target.plural} {t.bondedWord.toLowerCase()}
            </span>
          </div>
        </header>

        {!snap.empty && <div className="bp-pool-line">{poolLineText}</div>}
        <SeasonCountdown
          launchAt={snap.season.launchAt}
          endAt={snap.season.endAt}
          serverNowMs={snap.nowMs}
        />

        <section className="bp-stage" aria-label="The beach" onClick={closeAll}>
          <div className="bp-scene" />
          {/* Painted resort backdrop: sits over the CSS-gradient scene (which
              stays as the no-art fallback) and under every interactive layer. */}
          <ArtSprite src={`${ART_BASE}/bg.png`} className="bp-bg-art" fallback={null} />
          <div className="bp-zones" aria-hidden>
            <span className="bp-zone bp-zone--camps" />
            <span className="bp-zone bp-zone--events" />
          </div>

          {/* LEFT: the three team camps, fixed thirds. */}
          {camps.map((camp) => {
            const isOpen = openCamp === camp.key;
            const towels = Math.min(MAX_TOWELS, camp.players);
            const overflow = camp.players - towels;
            const cardAbove = camp.y > 0.7;
            return (
              <div
                key={camp.key}
                className="bp-camp"
                style={{ left: `${CAMP_X * 100}%`, top: `${camp.y * 100}%` }}
              >
                <button
                  type="button"
                  className="bp-camp-btn"
                  aria-label={`${camp.name} camp standings`}
                  aria-expanded={isOpen}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenTarget(null);
                    setOpenCamp(isOpen ? null : camp.key);
                  }}
                >
                  <span
                    className="bp-camp-glow"
                    style={{ background: `radial-gradient(circle, ${camp.accent}55 0%, transparent 68%)` }}
                  />
                  <ArtSprite
                    src={`${ART_BASE}/camp-${camp.key}.png`}
                    className="bp-camp-art"
                    fallback={<CampFallback accent={camp.accent} className="bp-camp-art" />}
                  />
                  <span className="bp-camp-name" style={{ color: camp.accent }}>
                    {camp.name}
                  </span>
                  <span className="bp-towels" aria-hidden>
                    {Array.from({ length: towels }, (_, i) => (
                      <span
                        key={i}
                        className="bp-towel"
                        style={{
                          background: `linear-gradient(90deg, ${camp.accent} 0%, ${camp.accent} 62%, rgba(255,255,255,0.55) 62%)`,
                        }}
                      />
                    ))}
                    {overflow > 0 && <span className="bp-towel-more">+{overflow}</span>}
                    {camp.players === 0 && <span className="bp-towel-none">setting up camp</span>}
                  </span>
                </button>

                {isOpen && (
                  <div
                    className={`bp-card${cardAbove ? " bp-card--above" : ""}`}
                    style={{ borderColor: `${camp.accent}55` }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="bp-card-name" style={{ color: camp.accent }}>
                      {camp.name}
                    </span>
                    <span className="bp-card-sub">
                      {ordinal(rankOf.get(camp.key) || camps.length)} of {camps.length} ·{" "}
                      {camp.players} {camp.players === 1 ? t.player.singular : t.player.plural}
                    </span>
                    <span className="bp-card-big">
                      {camp.points.toLocaleString("en-US")} <em>{t.points}</em>
                    </span>
                    <span className="bp-card-foot">
                      {t.points} decide the {t.team.singular} shares at season end.
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {/* CENTER: the pool, the flamingo, and the cabana ring. */}
          <div className="bp-pool" style={{ left: `${POOL.x * 100}%`, top: `${POOL.y * 100}%` }}>
            <ArtSprite
              src={`${ART_BASE}/pool.png`}
              className="bp-pool-art"
              fallback={<PoolFallback className="bp-pool-art" />}
            />
            <span className="bp-pool-shine" aria-hidden />
            <span className="bp-flamingo" aria-hidden>
              <ArtSprite
                src={`${ART_BASE}/flamingo.png`}
                className="bp-flamingo-art"
                fallback={<FlamingoFallback className="bp-flamingo-art" />}
              />
            </span>
          </div>

          {snap.targets.length === 0 ? (
            <div className="bp-await" onClick={(e) => e.stopPropagation()}>
              <span className="bp-await-title">The pool is warming up</span>
              <span className="bp-await-sub">
                The featured {t.target.plural} arrive with the season. The camps are ready.
              </span>
            </div>
          ) : (
            snap.targets.map((target, i) => {
              const pos = ringPos(i, snap.targets.length);
              const pct = Math.round(target.progress * 100);
              const color = STATUS_COLOR[target.status];
              const isOpen = openTarget === target.domain;
              const cardAbove = pos.y > 0.62;
              return (
                <div
                  key={target.domain}
                  className="bp-plate"
                  style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                >
                  <button
                    type="button"
                    className={`bp-plate-btn${isOpen ? " is-open" : ""}`}
                    aria-label={`${target.name} · ${statusLabel(t, target.status)}`}
                    aria-expanded={isOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenCamp(null);
                      setOpenTarget(isOpen ? null : target.domain);
                    }}
                  >
                    <span className="bp-plate-top">
                      <ArtSprite
                        src={`${ART_BASE}/cabana.png`}
                        className="bp-plate-icon"
                        fallback={<CabanaFallback className="bp-plate-icon" />}
                      />
                      <span className="bp-plate-name">{target.name}</span>
                      <span className="bp-plate-dot" style={{ background: color }} />
                    </span>
                    <span className="bp-plate-track">
                      <span
                        className="bp-plate-fill"
                        style={{
                          width: `${target.status === "bonded" ? 100 : Math.max(3, pct)}%`,
                          background: color,
                        }}
                      />
                    </span>
                    <span className="bp-plate-sub" style={target.status === "bonded" ? { color } : undefined}>
                      {targetSub(target)}
                    </span>
                  </button>

                  {isOpen && (
                    <div
                      className={`bp-card${cardAbove ? " bp-card--above" : ""}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="bp-card-name">{target.name}</span>
                      <span className="bp-card-sub">{target.domain}</span>
                      <span className="bp-pill" style={{ color, background: `${color}1f`, borderColor: `${color}55` }}>
                        <span className="bp-pill-dot" style={{ background: color }} />
                        {statusLabel(t, target.status)}
                      </span>
                      <span className="bp-card-foot">{targetSub(target)}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* RIGHT: the events band, reserved for future bosses. */}
          <aside className="bp-events" aria-label="Beach events" onClick={(e) => e.stopPropagation()}>
            <span className="bp-events-title">Events</span>
            <span className="bp-events-copy">
              Nothing on the horizon yet. Big beach events dock here later in the season.
            </span>
          </aside>

          <span className="bp-hint">
            Tap a {t.target.singular} for status · a camp for standings
          </span>
        </section>

        {/* Mobile legend: the floating plates can not fit a narrow viewport, so
            the scene stays clean up top and the details stack here. */}
        <ul className="bp-list" aria-label={t.target.plural}>
          {snap.targets.length === 0 && (
            <li className="bp-row">
              <span className="bp-row-body">
                <span className="bp-row-name">The pool is warming up</span>
                <span className="bp-row-sub">
                  The featured {t.target.plural} arrive with the season.
                </span>
              </span>
            </li>
          )}
          {snap.targets.map((target) => {
            const color = STATUS_COLOR[target.status];
            return (
              <li key={target.domain} className="bp-row">
                <span className="bp-row-dot" style={{ background: color }} />
                <span className="bp-row-body">
                  <span className="bp-row-name">{target.name}</span>
                  <span className="bp-row-sub">{targetSub(target)}</span>
                </span>
                <span className="bp-pill" style={{ color, background: `${color}1f`, borderColor: `${color}55` }}>
                  {statusLabel(t, target.status)}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Camp strip below the scene: fixed theme order (positions never
            reshuffle); the rank chip is the only thing standings move. */}
        <section className="bp-camps-strip" aria-label={`${t.team.singular} standings`}>
          {camps.map((camp) => (
            <button
              key={camp.key}
              type="button"
              className="bp-camp-card"
              style={{ borderColor: `${camp.accent}44` }}
              onClick={() => {
                setOpenTarget(null);
                setOpenCamp(openCamp === camp.key ? null : camp.key);
              }}
            >
              <span className="bp-camp-card-rank">{ordinal(rankOf.get(camp.key) || camps.length)}</span>
              <span className="bp-camp-card-body">
                <span className="bp-camp-card-name" style={{ color: camp.accent }}>
                  {camp.name}
                </span>
                <span className="bp-camp-card-count">
                  {camp.players} {camp.players === 1 ? t.player.singular : t.player.plural}
                </span>
              </span>
              <span className="bp-camp-card-pts">
                <span className="bp-camp-card-pts-n">{camp.points.toLocaleString("en-US")}</span>
                <span className="bp-camp-card-pts-l">{t.points}</span>
              </span>
              <span className="bp-camp-card-bar" style={{ background: camp.accent }} />
            </button>
          ))}
        </section>

        <footer className="bp-foot">
          <p className="bp-foot-copy">{t.pitch}</p>
          <div className="bp-cta">
            <Link href="/s4/board" className="bp-btn bp-btn--gold">
              Status Board
            </Link>
            <Link href="/s4/play" className="bp-btn">
              Games
            </Link>
            <Link href="/s4" className="bp-btn">
              Season home
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

/* NO BACKTICKS anywhere inside this CSS string, comments included (the S3
   build-break lesson). */
const CSS = `
.bp-map{position:relative;min-height:100vh;overflow:hidden;background:${UI.bg};color:${UI.text};
  font-family:${UI.sans};}
.bp-bg{position:absolute;inset:0;background:${UI.bgGlow};}
.bp-shell{position:relative;z-index:2;max-width:1200px;margin:0 auto;padding:30px 24px 64px;}

.bp-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:10px;}
.bp-back{color:#cdd4e4;text-decoration:none;font-size:14px;font-weight:600;opacity:.85;flex:0 0 auto;}
.bp-back:hover{opacity:1;}
.bp-title{text-align:center;flex:1 1 auto;}
.bp-eyebrow{margin:0;letter-spacing:.24em;font-size:11px;text-transform:uppercase;color:#f0b340;}
.bp-title h1{margin:2px 0 0;font-size:clamp(26px,5vw,40px);font-weight:800;
  background:linear-gradient(180deg,#fff 0%,#ffd9a0 130%);-webkit-background-clip:text;background-clip:text;color:transparent;}
.bp-tally{flex:0 0 auto;text-align:right;line-height:1;}
.bp-tally-num{font-size:30px;font-weight:800;color:#fff;}
.bp-tally-slash{color:#6b7690;font-weight:700;font-size:20px;}
.bp-tally-lbl{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${UI.faint};margin-top:3px;}
.bp-pool-line{text-align:center;font-size:12.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:#f0b340;margin:0 0 2px;}

/* ── The stage: a dusk beach. Sky, sea, then sand owns the lower two thirds. ── */
.bp-stage{position:relative;width:100%;aspect-ratio:7/6;margin:14px 0 18px;cursor:default;}
/* Painted resort backdrop (map/bg.png). Above .bp-scene, below the zones and
   every interactive layer; slightly darkened so plates and glows stay readable. */
.bp-bg-art{position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:cover;
  border-radius:22px;pointer-events:none;filter:brightness(0.82) saturate(1.05);}
.bp-scene{position:absolute;inset:0;z-index:0;border-radius:22px;overflow:hidden;
  background:
    radial-gradient(38% 20% at 62% 26%, rgba(255,186,120,0.30), transparent 70%),
    linear-gradient(180deg,
      #0a0e20 0%, #1c1740 14%, #4b2c4e 21%, #7c4046 23.5%,
      #17415c 24%, #0e3049 33%, #0b2438 39.5%,
      #2e2531 40%, #292130 62%, #241d29 100%);}
.bp-scene::after{content:"";position:absolute;left:0;right:0;top:39.2%;height:2px;
  background:linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.30) 30%, rgba(255,255,255,0.14) 70%, transparent 100%);}
.bp-hint{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:1;
  font-size:11px;letter-spacing:.06em;color:#8d95a8;opacity:.85;pointer-events:none;}

/* Zone glows: three accent auras down the camp column, screen-blended into one
   party (the pale backbone ties them together); a faint warm haze reserves the
   events edge. */
.bp-zones{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;border-radius:22px;}
.bp-zone{position:absolute;display:block;filter:blur(34px);mix-blend-mode:screen;}
.bp-zone--camps{left:-8%;top:2%;width:36%;height:100%;
  background:
    radial-gradient(ellipse 72% 26% at 42% 28%, rgba(240,179,64,0.30), transparent 72%),
    radial-gradient(ellipse 76% 28% at 30% 54%, rgba(255,126,182,0.28), transparent 72%),
    radial-gradient(ellipse 72% 26% at 42% 80%, rgba(77,216,230,0.30), transparent 72%),
    radial-gradient(ellipse 50% 84% at 22% 55%, rgba(255,236,205,0.10), transparent 82%);
  animation:bp-breathe 12s ease-in-out infinite;}
.bp-zone--events{right:-9%;top:4%;width:28%;height:100%;
  background:radial-gradient(ellipse 58% 52% at 62% 50%, rgba(255,150,90,0.13), transparent 78%);
  animation:bp-breathe 14s ease-in-out infinite reverse;}
@keyframes bp-breathe{0%,100%{transform:translate(0,0) scale(1);}50%{transform:translate(2%,-1.5%) scale(1.1);}}

/* ── Camps (left thirds) ── */
.bp-camp{position:absolute;transform:translate(-50%,-50%);z-index:3;width:17%;}
.bp-camp-btn{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;width:100%;
  padding:0;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent;}
.bp-camp-glow{position:absolute;left:50%;top:42%;width:190%;height:150%;transform:translate(-50%,-50%);
  z-index:0;pointer-events:none;opacity:.8;transition:opacity .2s,transform .2s;}
.bp-camp-btn:hover .bp-camp-glow{opacity:1;transform:translate(-50%,-50%) scale(1.1);}
.bp-camp-art{position:relative;z-index:1;width:100%;height:auto;display:block;
  filter:drop-shadow(0 6px 16px rgba(0,0,0,0.5));transition:transform .2s;}
.bp-camp-btn:hover .bp-camp-art{transform:scale(1.05);}
.bp-camp-name{position:relative;z-index:1;font-size:12px;font-weight:800;white-space:nowrap;
  text-shadow:0 1px 6px rgba(0,0,0,0.9);max-width:180%;overflow:hidden;text-overflow:ellipsis;}
.bp-towels{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:4px;justify-content:center;
  max-width:110px;align-items:center;}
.bp-towel{display:block;width:14px;height:8px;border-radius:3px;box-shadow:0 1px 3px rgba(0,0,0,0.5);}
.bp-towel-more{font-size:9.5px;font-weight:800;color:#e8ecf5;background:rgba(255,255,255,0.14);
  border-radius:999px;padding:1px 6px;}
.bp-towel-none{font-size:9.5px;font-weight:600;color:#9aa2b5;letter-spacing:.04em;}

/* ── Pool centerpiece + flamingo ── */
.bp-pool{position:absolute;transform:translate(-50%,-50%);z-index:2;width:24%;pointer-events:none;}
.bp-pool-art{width:100%;height:auto;display:block;filter:drop-shadow(0 10px 26px rgba(0,0,0,0.45));}
.bp-pool-shine{position:absolute;left:30%;top:26%;width:36%;height:22%;border-radius:50%;
  background:radial-gradient(ellipse, rgba(255,255,255,0.30), transparent 70%);
  animation:bp-shine 6s ease-in-out infinite;}
@keyframes bp-shine{0%,100%{opacity:.5;}50%{opacity:1;}}
.bp-flamingo{position:absolute;left:56%;top:46%;width:26%;transform:translate(-50%,-50%);
  animation:bp-drift 16s ease-in-out infinite;}
.bp-flamingo-art{width:100%;height:auto;display:block;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.4));}
@keyframes bp-drift{
  0%{transform:translate(-50%,-50%) rotate(-5deg);}
  25%{transform:translate(-24%,-62%) rotate(3deg);}
  50%{transform:translate(-42%,-38%) rotate(7deg);}
  75%{transform:translate(-64%,-54%) rotate(-2deg);}
  100%{transform:translate(-50%,-50%) rotate(-5deg);}}

/* ── Cabana plates (the target ring) ── */
.bp-plate{position:absolute;transform:translate(-50%,-50%);z-index:4;width:15.5%;min-width:118px;}
.bp-plate-btn{display:flex;flex-direction:column;gap:6px;width:100%;padding:9px 11px;cursor:pointer;
  border-radius:13px;background:rgba(12,14,26,0.78);backdrop-filter:blur(7px);
  border:1px solid rgba(240,179,64,0.22);box-shadow:0 8px 22px rgba(0,0,0,0.45);
  transition:transform .15s,border-color .15s;-webkit-tap-highlight-color:transparent;text-align:left;}
.bp-plate-btn:hover{transform:translateY(-2px);border-color:rgba(240,179,64,0.45);}
.bp-plate-btn.is-open{border-color:rgba(240,179,64,0.6);}
.bp-plate-top{display:flex;align-items:center;gap:7px;min-width:0;}
.bp-plate-icon{width:24px;height:19px;object-fit:contain;flex:0 0 auto;}
.bp-plate-name{flex:1 1 auto;min-width:0;font-size:12.5px;font-weight:800;color:#fff;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bp-plate-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 8px currentColor;}
.bp-plate-track{display:block;width:100%;height:5px;border-radius:999px;background:rgba(255,255,255,0.10);overflow:hidden;}
.bp-plate-fill{display:block;height:100%;border-radius:999px;box-shadow:0 0 8px rgba(240,179,64,0.4);}
.bp-plate-sub{font-size:10.5px;color:${UI.muted};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

/* ── Tap cards (targets + camps) ── */
.bp-card{position:absolute;left:50%;top:calc(100% + 8px);transform:translateX(-50%);
  width:max-content;max-width:210px;display:flex;flex-direction:column;align-items:center;gap:5px;
  padding:11px 14px;border-radius:12px;background:rgba(10,12,24,0.92);backdrop-filter:blur(8px);
  border:1px solid rgba(240,179,64,0.28);box-shadow:0 12px 32px rgba(0,0,0,0.55);z-index:8;text-align:center;
  animation:bp-pop .16s ease-out;}
.bp-card--above{top:auto;bottom:calc(100% + 8px);}
.bp-card-name{font-weight:800;font-size:15px;color:#fff;}
.bp-card-sub{font-size:11px;color:${UI.faint};}
.bp-card-big{font-size:19px;font-weight:800;color:#fff;}
.bp-card-big em{font-style:normal;font-size:11px;font-weight:700;color:${UI.faint};
  letter-spacing:.08em;text-transform:uppercase;}
.bp-card-foot{font-size:10.5px;color:${UI.muted};line-height:1.45;max-width:190px;}
.bp-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;
  padding:3px 10px;border-radius:999px;letter-spacing:.04em;text-transform:uppercase;
  border:1px solid transparent;white-space:nowrap;}
.bp-pill-dot{width:6px;height:6px;border-radius:50%;display:inline-block;box-shadow:0 0 8px currentColor;}
@keyframes bp-pop{from{opacity:0;transform:translateX(-50%) scale(.92);}to{opacity:1;transform:translateX(-50%) scale(1);}}

/* ── Pre-season centerpiece copy ── */
.bp-await{position:absolute;left:52%;top:30%;transform:translate(-50%,-50%);z-index:4;
  display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;
  padding:13px 18px;border-radius:14px;background:rgba(10,12,24,0.82);backdrop-filter:blur(7px);
  border:1px solid rgba(240,179,64,0.22);max-width:250px;}
.bp-await-title{font-size:14px;font-weight:800;color:#fff;}
.bp-await-sub{font-size:11.5px;color:${UI.muted};line-height:1.5;}

/* ── Events band (right, reserved for bosses) ── */
.bp-events{position:absolute;right:2%;top:12%;bottom:8%;width:16.5%;z-index:2;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
  border:1.5px dashed rgba(255,255,255,0.14);border-radius:18px;padding:14px 10px;text-align:center;}
.bp-events-title{font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#e8b98a;}
.bp-events-copy{font-size:11px;color:#9aa2b5;line-height:1.55;max-width:150px;}

/* ── Mobile legend list ── */
.bp-list{display:none;list-style:none;padding:0;margin:0;}
.bp-row{display:flex;align-items:center;gap:11px;padding:10px 13px;border-radius:13px;
  background:${UI.panel};border:1px solid ${UI.border};}
.bp-row-dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto;box-shadow:0 0 8px currentColor;}
.bp-row-body{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0;}
.bp-row-name{font-weight:700;font-size:14px;color:#fff;}
.bp-row-sub{font-size:11px;color:${UI.muted};}

/* ── Camp standings strip (fixed order; only the rank chip moves) ── */
.bp-camps-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:6px;}
.bp-camp-card{position:relative;display:flex;align-items:center;gap:12px;overflow:hidden;text-align:left;cursor:pointer;
  padding:14px 16px;border-radius:16px;background:${UI.panel};backdrop-filter:blur(7px);
  border:1px solid ${UI.border};transition:transform .15s,background .15s;}
.bp-camp-card:hover{transform:translateY(-2px);background:rgba(16,21,38,0.85);}
.bp-camp-card-rank{font-size:12px;font-weight:800;color:${UI.faint};flex:0 0 auto;min-width:26px;}
.bp-camp-card-body{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0;}
.bp-camp-card-name{font-weight:800;font-size:15px;letter-spacing:.01em;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.bp-camp-card-count{font-size:12.5px;color:${UI.muted};}
.bp-camp-card-pts{display:flex;flex-direction:column;align-items:flex-end;flex:0 0 auto;line-height:1.1;}
.bp-camp-card-pts-n{font-size:17px;font-weight:800;color:#fff;}
.bp-camp-card-pts-l{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:${UI.faint};}
.bp-camp-card-bar{position:absolute;left:0;bottom:0;height:3px;width:100%;opacity:.85;}

.bp-foot{margin-top:30px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:18px;}
.bp-foot-copy{max-width:600px;margin:0;color:#cdd4e4;font-size:14.5px;line-height:1.65;}
.bp-cta{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}
.bp-btn{padding:13px 26px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;
  background:${UI.panel};color:${UI.text};border:1px solid ${UI.border};}
.bp-btn--gold{background:#f0b340;color:#1a1205;font-weight:700;border:none;}
.bp-btn:hover{filter:brightness(1.06);}

@media (prefers-reduced-motion: reduce){
  .bp-zone,.bp-flamingo,.bp-pool-shine,.bp-card{animation:none !important;}
  .bp-camp-art,.bp-plate-btn,.bp-camp-card,.bp-camp-glow{transition:none !important;}
}
@media (max-width:680px){
  .bp-shell{padding:24px 16px 52px;}
  .bp-stage{aspect-ratio:1/1;}
  .bp-plate,.bp-card,.bp-hint,.bp-events,.bp-await{display:none;}
  .bp-camp{width:24%;}
  .bp-list{display:flex;flex-direction:column;gap:9px;margin:2px 0 18px;}
  .bp-camps-strip{grid-template-columns:1fr;}
  .bp-head{flex-wrap:wrap;}
}
`;
