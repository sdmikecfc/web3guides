"use client";
/**
 * S5 PUBLIC GARAGE, the client view. Read-only twin of the private HqScene
 * rigs (TankRig / TrophyShelf ideas re-implemented, never
 * imported, so the private scene stays untouched): tank art with the gradient
 * silhouette fallback, the 4 Top-Trumps rating bars (reused from panels.tsx),
 * commander card, camo + decal shelf, service record COUNTS, trophy shelf.
 *
 * The server page hands in plain JSON only. NO money data renders here, ever
 * (no held USD, no projected cuts). Copy rules: no em-dashes, never "win $X".
 * Mobile = one column; desktop (>=860px) = two columns via the style block.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PublicGarage } from "@/lib/s6/publicHq";
import { pilotByKey } from "@/lib/s6/tanks";
import { BONDS_TIER_MAX, decalLabel, isKnownDecal } from "@/lib/s6/ftue";
import { RatingsBars } from "../panels";
import type { TrophiesView } from "../HqScene";

const STEEL = "#9aa7b4";
const EMBER = "#e0662e";
const BORDER = "#232a32";
const TEXT = "#e9edf1";
const MUTED = "#aab4bd";
const FAINT = "#87919b";
const WARN = "#f0b340";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const CAMO_SWATCH: Record<string, string> = {
  olive: "linear-gradient(135deg, #5b6b3f 0%, #3c4a2a 100%)",
  desert: "linear-gradient(135deg, #c2a878 0%, #8f7a4e 100%)",
  winter: "linear-gradient(135deg, #d9e2e8 0%, #9fb0ba 100%)",
  night: "linear-gradient(135deg, #2a3140 0%, #14181f 100%)",
  urban: "linear-gradient(135deg, #7d8790 0%, #4a545d 100%)",
};

/** Hydration-safe art with a fallback (the S3-proven onError + mount check). */
function SafeArt({
  src,
  alt,
  style,
  onBroken,
}: {
  src: string;
  alt: string;
  style?: React.CSSProperties;
  onBroken?: () => void;
}) {
  const [ok, setOk] = useState(true);
  const ref = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) {
      setOk(false);
      onBroken?.();
    }
  }, [onBroken]);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      style={style}
      onError={() => {
        setOk(false);
        onBroken?.();
      }}
    />
  );
}

function card(style?: React.CSSProperties): React.CSSProperties {
  return {
    background: "rgba(18,22,27,0.72)",
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    padding: "16px 18px",
    ...style,
  };
}

const shelfLabel: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.5,
  letterSpacing: "0.22em",
  color: FAINT,
  textTransform: "uppercase",
  margin: "0 0 10px",
};

// ── The fielded tank (public twin of TankRig) ───────────────────────────────
function PublicTankRig({ tank }: { tank: PublicGarage["tank"] }) {
  const [artBroken, setArtBroken] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      {!artBroken ? (
        <SafeArt
          key={tank.art}
          src={tank.art}
          alt={tank.tankName}
          style={{ width: "min(70vw, 300px)", maxHeight: 170, objectFit: "contain" }}
          onBroken={() => setArtBroken(true)}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: "min(70vw, 280px)",
            height: 120,
            borderRadius: "18px 26px 10px 10px",
            background: "linear-gradient(160deg, #39434d 0%, #232a32 55%, #14181d 100%)",
            border: `1px solid ${STEEL}44`,
            boxShadow: `0 18px 40px rgba(0,0,0,0.5), inset 0 1px 0 ${STEEL}33`,
            position: "relative",
            marginTop: 20,
          }}
        >
          <div style={{ position: "absolute", top: -22, left: "32%", width: "36%", height: 34, borderRadius: 10, background: "linear-gradient(160deg, #434e59 0%, #232a32 80%)", border: `1px solid ${STEEL}33` }} />
          <div style={{ position: "absolute", top: -12, left: "62%", width: "44%", height: 7, borderRadius: 4, background: "#39434d" }} />
          <div style={{ position: "absolute", bottom: -12, left: "-3%", width: "106%", height: 26, borderRadius: 14, background: "linear-gradient(180deg, #1b2026 0%, #0e1114 100%)", border: "1px solid #2c343d" }} />
        </div>
      )}
      <div style={{ marginTop: 14, textAlign: "center" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.22em", color: FAINT, textTransform: "uppercase" }}>
          Tier {tank.tier} · {tank.hullName} class
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: TEXT }} data-testid="public-tank-name">
          {tank.tankName}
        </div>
        <div style={{ fontSize: 11.5, color: FAINT, textTransform: "capitalize" }}>{tank.camo} camo</div>
      </div>
      <div style={{ width: "100%", maxWidth: 340, marginTop: 8 }}>
        <RatingsBars ratings={tank.ratings} />
      </div>
    </div>
  );
}

// ── Commander card (the public commander rig) ───────────────────────────────
function PublicCommanderCard({ pilotKey }: { pilotKey: string }) {
  const c = pilotByKey(pilotKey);
  const [artBroken, setArtBroken] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }} data-testid="public-commander">
      {!artBroken ? (
        <SafeArt
          key={pilotKey}
          src={`/s6-art/pilot/${pilotKey}.png`}
          alt={c?.name || "Pilot"}
          style={{ width: 64, height: 96, objectFit: "contain" }}
          onBroken={() => setArtBroken(true)}
        />
      ) : (
        <div aria-hidden style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 64 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(160deg, #4a555f 0%, #232a32 90%)", border: `1px solid ${STEEL}44` }} />
          <div style={{ width: 44, height: 62, marginTop: -2, borderRadius: "12px 12px 8px 8px", background: "linear-gradient(180deg, #39434d 0%, #171c22 100%)", border: `1px solid ${STEEL}33` }} />
        </div>
      )}
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{c?.name || "Pilot"}</div>
        {c ? <div style={{ fontSize: 11.5, color: STEEL, fontWeight: 700 }}>{c.role}</div> : null}
        {c ? <div style={{ fontSize: 11.5, color: FAINT, lineHeight: 1.5, marginTop: 3 }}>{c.blurb}</div> : null}
      </div>
    </div>
  );
}

// ── Trophy shelf (public twin; neutral empty lines, earned never shamed) ────
/**
 * THE TROPHY SHELF, as a rack of collectible cards.
 *
 * It used to be three near-black boxes (a 3%-white fill on an almost-black page)
 * with a cutout floating in each at 56px. Mike: "These need a lighter background
 * because they don't look right. The S4 characters are cropped weird. I think
 * these buttons should be a miniature card ... and you can click on them to see
 * them full screen."
 *
 * Two things were wrong and they are related. The tiles had no surface of their
 * own, so nothing read as an object; and one fixed 56px box had to hold both a
 * standing figure (tall) and a ship (wide), so the figure shrank to nothing
 * while the ship filled the row. A card fixes both: it gives the art a lit stage
 * of a fixed portrait shape, and `contain` inside that stage means neither
 * silhouette is ever squeezed or cut.
 *
 * Each season keeps its own colour, so the rack reads as three trophies from
 * three different games rather than three copies of one tile.
 */
const TROPHY_SEASONS: Record<string, { name: string; accent: string; wash: string }> = {
  S4: { name: "The Hit List", accent: "#d8563f", wash: "rgba(216,86,63,0.20)" },
  S3: { name: "Starfall", accent: "#f0b340", wash: "rgba(240,179,64,0.18)" },
  S2: { name: "Conquer the Seas", accent: "#4aa3d8", wash: "rgba(74,163,216,0.20)" },
};

function PublicTrophyShelf({ trophies }: { trophies: TrophiesView | null }) {
  const t = trophies;
  const [open, setOpen] = useState<{ key: string; art: string; label: string } | null>(null);

  const slots: Array<{ key: string; art: string | null; label: string }> = [
    { key: "S4", art: t?.s4?.art ?? null, label: t?.s4?.label ?? "No S4 record" },
    { key: "S3", art: t?.s3?.art ?? null, label: t?.s3?.label ?? "No S3 record" },
    { key: "S2", art: t?.s2?.art ?? null, label: t?.s2?.label ?? "No S2 record" },
  ];

  // Escape closes the full-screen view, the same as tapping the backdrop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="s5tr-rack" data-testid="public-trophies">
        {slots.map((s) => {
          const season = TROPHY_SEASONS[s.key];
          const earned = Boolean(s.art);
          // The title carried the season number twice ("S4" chip above "S4 The
          // Hit List agent"). The chip says the season; the caption says what it is.
          const caption = s.label.replace(/^S\d\s+/, "");
          const body = (
            <>
              <div className="s5tr-chip" style={{ color: earned ? season.accent : FAINT, borderColor: earned ? `${season.accent}55` : BORDER }}>
                {s.key}
              </div>
              <div className="s5tr-stage" style={{ background: earned ? `radial-gradient(circle at 50% 62%, ${season.wash} 0%, rgba(0,0,0,0) 68%)` : "none" }}>
                {earned && s.art ? (
                  <SafeArt src={s.art} alt={s.label} />
                ) : (
                  <div className="s5tr-empty" aria-hidden>
                    ?
                  </div>
                )}
              </div>
              <div className="s5tr-cap" style={{ color: earned ? TEXT : FAINT }}>
                {earned ? caption : s.label}
              </div>
              {earned ? <div className="s5tr-sub">{season.name}</div> : null}
            </>
          );
          return earned && s.art ? (
            <button
              key={s.key}
              type="button"
              className="s5tr-card is-earned"
              style={{ ["--tr" as string]: season.accent }}
              onClick={() => setOpen({ key: s.key, art: s.art as string, label: s.label })}
              aria-label={`${s.label}. Open full screen.`}
              data-testid={`trophy-${s.key}`}
            >
              {body}
            </button>
          ) : (
            <div key={s.key} className="s5tr-card" style={{ ["--tr" as string]: STEEL }}>
              {body}
            </div>
          );
        })}
      </div>

      {open ? (
        <div
          className="s5tr-lb"
          role="dialog"
          aria-modal="true"
          aria-label={open.label}
          onClick={() => setOpen(null)}
          data-testid="trophy-lightbox"
        >
          <div className="s5tr-lb-card" style={{ ["--tr" as string]: TROPHY_SEASONS[open.key]?.accent || EMBER }} onClick={(e) => e.stopPropagation()}>
            <div className="s5tr-chip" style={{ color: TROPHY_SEASONS[open.key]?.accent, borderColor: `${TROPHY_SEASONS[open.key]?.accent}55` }}>
              {open.key}
            </div>
            <div className="s5tr-lb-stage" style={{ background: `radial-gradient(circle at 50% 60%, ${TROPHY_SEASONS[open.key]?.wash} 0%, rgba(0,0,0,0) 70%)` }}>
              <SafeArt src={open.art} alt={open.label} />
            </div>
            <div className="s5tr-lb-cap">{open.label.replace(/^S\d\s+/, "")}</div>
            <div className="s5tr-sub">{TROPHY_SEASONS[open.key]?.name}</div>
            <button type="button" className="s5tr-lb-x" onClick={() => setOpen(null)} aria-label="Close">
              &times;
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── The full read-only garage ───────────────────────────────────────────────
export function PublicGarageView({
  view,
  trophies,
}: {
  view: PublicGarage;
  trophies: TrophiesView | null;
}) {
  const [copied, setCopied] = useState(false);
  // Built in an effect, not at render: window does not exist on the server, and
  // reading it during render would desync the markup Next already sent.
  const [shareUrl, setShareUrl] = useState(`https://launchwars.xyz/s6/hq/${view.handle}`);
  useEffect(() => {
    setShareUrl(`${window.location.origin}/s6/hq/${view.handle}`);
  }, [view.handle]);

  const copyLink = useCallback(() => {
    // clipboard is absent on http:// origins and older browsers; the prompt
    // fallback still lets someone copy by hand rather than the button doing
    // nothing at all.
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl).then(done).catch(() => window.prompt("Copy this link", shareUrl));
    } else {
      window.prompt("Copy this link", shareUrl);
    }
  }, [shareUrl]);

  const records: Array<{ label: string; value: string }> = [
    { label: "War Bonds", value: `Tier ${view.bondsTier} of ${BONDS_TIER_MAX}` },
    { label: "Hold streak", value: `${view.streakDays} day${view.streakDays === 1 ? "" : "s"}` },
    { label: "Crates opened", value: `${view.cratesOpened}` },
  ];

  return (
    <div>
      <style
        dangerouslySetInnerHTML={{
          __html: `
.s5pg-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
@media (min-width: 860px) { .s5pg-grid { grid-template-columns: 1.05fr 0.95fr; align-items: start; } }
.s5pg-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.s5pg-share { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.s5pg-sbtn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border-radius: 9px;
  font-size: 12.5px; font-weight: 800; letter-spacing: 0.02em; text-decoration: none; cursor: pointer;
  border: 1px solid #ffffff26; background: #ffffff10; color: #e9edf1; font-family: inherit;
  transition: background 0.14s ease, border-color 0.14s ease, transform 0.14s ease; }
.s5pg-sbtn:hover { background: #ffffff1c; border-color: #ffffff3d; transform: translateY(-1px); }
.s5pg-sbtn.is-x { border-color: #e0662e66; background: #e0662e26; }
.s5pg-sbtn.is-x:hover { background: #e0662e38; border-color: #e0662ea0; }
.s5pg-sbtn:focus-visible { outline: 2px solid #e0662e; outline-offset: 2px; }
.s5pg-cardwrap { border: 1px solid #ffffff1a; border-radius: 11px; overflow: hidden; background: #0b0e11;
  box-shadow: 0 10px 30px #00000059; }
.s5pg-cardwrap img { display: block; width: 100%; height: auto; }

/* ── TROPHY RACK ──────────────────────────────────────────────────────────
   Portrait cards, so a standing figure and a ship both get a shape that suits
   them. The surface is deliberately lighter than the page: these are objects
   on a shelf, and the old 3%-white fill made them holes in it instead. */
.s5tr-rack { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.s5tr-card {
  position: relative; display: flex; flex-direction: column; align-items: center;
  gap: 7px; padding: 12px 10px 13px; border-radius: 13px; text-align: center;
  border: 1px solid rgba(255,255,255,0.10);
  background:
    radial-gradient(120% 70% at 50% 0%, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0) 60%),
    linear-gradient(180deg, rgba(255,255,255,0.075) 0%, rgba(255,255,255,0.028) 55%, rgba(255,255,255,0.05) 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.09), 0 6px 18px rgba(0,0,0,0.34);
  font: inherit; color: inherit;
}
.s5tr-card.is-earned { cursor: pointer; transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
.s5tr-card.is-earned:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--tr) 55%, transparent); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 12px 26px rgba(0,0,0,0.46); }
.s5tr-card.is-earned:focus-visible { outline: 2px solid var(--tr); outline-offset: 3px; }
.s5tr-chip {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5px;
  font-weight: 700; letter-spacing: 0.2em; padding: 3px 9px; border-radius: 999px;
  border: 1px solid; background: rgba(0,0,0,0.28);
}
/* A FIXED PORTRAIT STAGE is the fix for "the S4 characters are cropped weird":
   one aspect for every trophy, object-fit contain inside it, so a tall figure
   and a wide hull are both whole and neither is squeezed. */
.s5tr-stage { position: relative; width: 100%; aspect-ratio: 3 / 4; }
/* ABSOLUTE, so the art can never argue with the stage about its size. In
   normal flow a 190x503 cutout stretched the stage to 355px and the card
   came out 161x457. Now the shape is fixed and the art fits inside it. */
.s5tr-stage img { position: absolute; inset: 6px; width: calc(100% - 12px); height: calc(100% - 12px); object-fit: contain; }
.s5tr-empty { font-size: 30px; font-weight: 800; color: rgba(255,255,255,0.13); }
.s5tr-cap { font-size: 11.5px; font-weight: 700; line-height: 1.3; }
.s5tr-sub { font-size: 10px; color: #87919b; letter-spacing: 0.04em; }
@media (max-width: 520px) { .s5tr-rack { grid-template-columns: repeat(2, 1fr); } }

/* Full screen. The card grows, it does not become a different object. */
.s5tr-lb {
  position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center;
  padding: 22px; background: rgba(6,8,11,0.86); backdrop-filter: blur(3px);
  animation: s5tr-in .14s ease;
}
@keyframes s5tr-in { from { opacity: 0 } to { opacity: 1 } }
.s5tr-lb-card {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px;
  width: min(440px, 92vw); padding: 20px 20px 22px; border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--tr) 45%, transparent);
  background:
    radial-gradient(130% 70% at 50% 0%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 62%),
    linear-gradient(180deg, #1b222b 0%, #12171d 100%);
  box-shadow: 0 26px 70px rgba(0,0,0,0.62);
}
.s5tr-lb-stage { position: relative; width: 100%; aspect-ratio: 3 / 4; max-height: 62vh; }
.s5tr-lb-stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.s5tr-lb-cap { font-size: 17px; font-weight: 800; color: #e9edf1; text-align: center; }
.s5tr-lb-x {
  position: absolute; top: 9px; right: 11px; width: 30px; height: 30px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.16); background: rgba(0,0,0,0.32); color: #e9edf1;
  font-size: 19px; line-height: 1; cursor: pointer;
}
.s5tr-lb-x:hover { background: rgba(255,255,255,0.10); }
@media (prefers-reduced-motion: reduce) {
  .s5tr-card.is-earned, .s5tr-lb { transition: none; animation: none; }
  .s5tr-card.is-earned:hover { transform: none; }
}
`,
        }}
      />
      <div className="s5pg-grid">
        {/* LEFT: the fielded tank + the commander */}
        <div className="s5pg-col">
          <section style={card({ paddingTop: 22, paddingBottom: 20 })} aria-label="Fielded tank">
            <PublicTankRig tank={view.tank} />
          </section>
          <section style={card()} aria-label="Pilot">
            <div style={shelfLabel}>Pilot</div>
            <PublicCommanderCard pilotKey={view.pilotKey} />
          </section>
        </div>

        {/* RIGHT: shelves + the service record */}
        <div className="s5pg-col">
          <section style={card()} aria-label="Camo and decals">
            <div style={shelfLabel}>Camo and decals</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span
                aria-hidden
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  background: CAMO_SWATCH[view.tank.camo] || CAMO_SWATCH.olive,
                  border: `1px solid ${STEEL}33`,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: TEXT, textTransform: "capitalize" }}>
                {view.tank.camo} camo
              </span>
            </div>
            {view.tank.decals.length > 0 ? (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }} data-testid="public-decals">
                {view.tank.decals.map((d) => {
                  const known = isKnownDecal(d);
                  return (
                    <span
                      key={d}
                      style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: known ? WARN : MUTED,
                        border: `1px solid ${known ? `${WARN}55` : `${STEEL}33`}`,
                        borderRadius: 999,
                        padding: "5px 11px",
                      }}
                    >
                      {decalLabel(d)}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: FAINT, lineHeight: 1.55, margin: 0 }} data-testid="public-decals">
                Bare armor so far. Decals are earned in the field, never bought.
              </p>
            )}
          </section>

          <section style={card()} aria-label="Service record">
            <div style={shelfLabel}>Service record</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }} data-testid="public-record">
              {records.map((r) => (
                <div
                  key={r.label}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 10,
                    padding: "10px 8px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", color: FAINT, textTransform: "uppercase", marginBottom: 4 }}>
                    {r.label}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: TEXT }}>{r.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={card()} aria-label="Trophy shelf">
            <div style={shelfLabel}>Trophy shelf</div>
            <PublicTrophyShelf trophies={trophies} />
          </section>

          {view.enlistedBy ? (
            <p style={{ fontSize: 12.5, color: MUTED, margin: 0, textAlign: "center" }} data-testid="enlisted-by">
              Enlisted by <span style={{ fontWeight: 800, color: STEEL }}>{view.enlistedBy}</span>
            </p>
          ) : null}
        </div>
      </div>

      {/* SHARE. The card underneath has existed and been unreachable since
          launch -- every crawler got one, no player was ever handed the link. */}
      <section style={card({ marginTop: 18, paddingTop: 18, paddingBottom: 18 })} aria-label="Share this garage">
        <div style={{ ...shelfLabel, textAlign: "center", marginBottom: 12 }}>Share this garage</div>
        <div className="s5pg-cardwrap" style={{ maxWidth: 460, margin: "0 auto 14px" }}>
          {/* The real endpoint, at the real aspect. What you post is what you see.
              eslint-disable-next-line @next/next/no-img-element -- a dynamic OG
              route, not an optimizable static asset. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/s6/hq-card?h=${encodeURIComponent(view.handle)}`}
            alt={`Share card for ${view.callsign}: ${view.rank}, fielding the ${view.tank.tankName}.`}
            width={1200}
            height={630}
            loading="lazy"
          />
        </div>
        <div className="s5pg-share">
          <a
            className="s5pg-sbtn is-x"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
              `${view.callsign} · ${view.rank} · fielding the ${view.tank.tankName} in Launch Wars UPRISING. Free to play in your browser: ${shareUrl}`,
            )}`}
            target="_blank"
            rel="noreferrer"
            data-testid="garage-share-x"
          >
            Post on X
          </a>
          <button className="s5pg-sbtn" type="button" onClick={copyLink} data-testid="garage-share-copy">
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      </section>

      {/* The visit CTA footer */}
      <div style={{ textAlign: "center", marginTop: 28 }}>
        <Link
          href="/s6"
          data-testid="visit-cta"
          style={{
            display: "inline-block",
            padding: "12px 22px",
            borderRadius: 9,
            border: `1px solid ${EMBER}66`,
            background: `${EMBER}1f`,
            color: TEXT,
            fontSize: 13.5,
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          Build your own HQ. Enlist free.
        </Link>
      </div>
    </div>
  );
}
