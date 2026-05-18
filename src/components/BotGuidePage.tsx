import VideoEmbed from "@/components/VideoEmbed";

/* ════════════════════════════════════════════════════════════════════════
   BotGuidePage — shared layout for /volume-bot and /lp-bot

   A welcoming, polished landing page that explains a bot to someone
   who may not have run one before. Sections (top to bottom):

   1. Sticky nav
   2. Hero — pill badge, big title, tagline, two big CTAs
   3. Stat strip — 4 at-a-glance numbers
   4. Overview video (60s)
   5. How it works — three "mechanics" cards
   6. Setup walkthrough video
   7. Quickstart — numbered steps with one-liner descriptions
   8. Honest risks callout
   9. Live dashboard CTA — "see it running with real money"
   10. Footer with GitHub / full guide / Discord links

   Every section is configurable via props. The videos render as
   placeholders until a real URL is dropped in; both slots are optional.
════════════════════════════════════════════════════════════════════════ */

export interface BotGuideStat {
  label: string;
  value: string;
  sub?:  string;
}

export interface BotGuideMechanic {
  icon:  string;       // emoji or short symbol
  title: string;
  body:  string;
}

export interface BotGuideStep {
  title: string;
  body:  string;
}

export interface BotGuideRisk {
  heading: string;
  body:    string;
}

export interface BotGuideProps {
  /** Tag colour for accent (matches the bot on the dashboard) */
  accent:        string;
  /** Pill text at top of hero (e.g. "Open Source · Run It Yourself") */
  eyebrow:       string;
  /** Big title — Bungee */
  title:         string;
  /** One-paragraph welcoming intro under the title */
  tagline:       string;
  /** "What does this bot DO?" — one paragraph */
  what:          string;
  /** GitHub repo URL */
  githubUrl:     string;
  /** Public GUIDE.md URL (typically the GitHub raw or blob URL) */
  fullGuideUrl:  string;
  /** Live dashboard URL (defaults to /dashboard but page-overridable) */
  dashboardUrl?: string;
  /** Discord or community link for help */
  communityUrl?: string;

  /** 4 at-a-glance stats */
  stats:         BotGuideStat[];
  /** 3 "how it works" cards */
  mechanics:     BotGuideMechanic[];
  /** Numbered quickstart steps */
  steps:         BotGuideStep[];
  /** Risks list — honest, amber-styled */
  risks:         BotGuideRisk[];

  /** Overview video URL (YouTube/Loom/MP4) — optional, shows placeholder if absent */
  overviewVideoUrl?:  string;
  overviewVideoTitle?: string;
  /** Setup walkthrough video URL */
  setupVideoUrl?:     string;
  setupVideoTitle?:    string;

  /** Optional iframe URL for the OVERVIEW slot. Takes precedence over video.
   *  Use for embedding interactive Claude Design exports / standalone HTML
   *  presentations stored in /public. */
  overviewIframeUrl?: string;
  /** Optional iframe URL for the SETUP slot. */
  setupIframeUrl?:    string;

  /** Static infographic for the OVERVIEW slot — used when iframe/video are
   *  not available. Render falls through iframe → video → image → null. */
  overviewImageUrl?:     string;
  overviewImageCaption?: string;
  /** Static infographic for the SETUP slot. */
  setupImageUrl?:        string;
  setupImageCaption?:    string;
}

/* ────────────────────────────────────────────────────────────────────── */

const C = {
  bg:       "#05070f",
  surface:  "#0a0e1c",
  surface2: "#10162a",
  border:   "rgba(148,163,184,0.10)",
  borderHi: "rgba(99,102,241,0.22)",
  text:     "#f1f5f9",
  text2:    "#cbd5e1",
  text3:    "#94a3b8",
  text4:    "#64748b",
  text5:    "#334155",
  amber:    "#f59e0b",
  amberBg:  "rgba(245,158,11,0.06)",
  green:    "#10b981",
  pink:     "#ec4899",
  orange:   "#ff6b35",
};

/* ────────────────────────────────────────────────────────────────────── */

/* MediaLauncher — poster card for standalone HTML presentations.
   Inline iframes are unreliable for Claude-Design's self-unpacking bundle
   format (text/babel + document.documentElement.replaceWith → silently
   fails in some iframe contexts). A click-to-launch card is more robust:
   nothing loads until the user clicks, and the design opens at full
   viewport size — which is what it was built for. */
function MediaLauncher({
  src, title, accent, duration,
}: {
  src: string; title: string; accent: string; duration?: string;
}) {
  return (
    <figure style={{ margin: "32px 0", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <a href={src} target="_blank" rel="noopener noreferrer"
        style={{
          display: "block", position: "relative" as const,
          width: "100%", aspectRatio: "16 / 9",
          background: `
            radial-gradient(circle at 30% 30%, ${accent}33 0%, transparent 55%),
            radial-gradient(circle at 70% 70%, rgba(236,72,153,0.12) 0%, transparent 50%),
            #000F16
          `,
          border: `1px solid ${accent}55`,
          borderRadius: 16,
          overflow: "hidden" as const,
          boxShadow: "0 12px 48px -16px rgba(0,0,0,0.6)",
          textDecoration: "none",
          color: "#fff",
        }}>
        {/* Decorative grid */}
        <div style={{
          position: "absolute" as const, inset: 0,
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 60% 80% at 50% 50%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 80% at 50% 50%, black 0%, transparent 75%)",
          pointerEvents: "none" as const,
        }} />

        {/* Centered content */}
        <div style={{
          position: "absolute" as const, inset: 0,
          display: "flex", flexDirection: "column" as const,
          alignItems: "center" as const, justifyContent: "center" as const,
          padding: "32px 24px",
          textAlign: "center" as const,
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: accent + "1a",
            border: `1px solid ${accent}55`,
            borderRadius: 50, padding: "5px 14px", marginBottom: 18,
            fontSize: 10, color: accent,
            fontFamily: "'Space Mono', monospace",
            letterSpacing: 1.3, fontWeight: 800,
            textTransform: "uppercase" as const,
          }}>
            ● Interactive · click to launch
          </div>

          <div style={{
            fontFamily: "'Bungee', cursive",
            fontSize: "clamp(20px, 3vw, 30px)",
            color: "#fff", lineHeight: 1.2, marginBottom: 12,
            maxWidth: "85%",
          }}>
            {title}
          </div>

          {duration && (
            <div style={{
              fontSize: 11, color: "rgba(255,255,255,0.55)",
              fontFamily: "'Space Mono', monospace", letterSpacing: 1.2,
              marginBottom: 22,
            }}>
              {duration}
            </div>
          )}

          {/* Big launch button */}
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            background: `linear-gradient(135deg, ${accent}, ${C.pink})`,
            color: "#fff",
            padding: "12px 22px", borderRadius: 12,
            fontFamily: "'Space Mono', monospace", fontSize: 12,
            fontWeight: 800, letterSpacing: 0.6,
            boxShadow: `0 10px 30px -10px ${accent}80`,
          }}>
            ▶ Launch full-screen
          </span>
        </div>
      </a>

      <figcaption style={{
        marginTop: 10,
        fontSize: 12, color: C.text4,
        fontFamily: "'Space Mono', monospace",
        letterSpacing: 0.5, textAlign: "center" as const,
      }}>
        Opens in a new tab · best viewed at full screen
      </figcaption>
    </figure>
  );
}

/* StaticInfographic — full-width 16:9 image card with a caption underneath.
   Used when a slot has neither an interactive embed nor a video — typical
   for AI-generated infographics that explain how the bot works. */
function StaticInfographic({
  src, title, caption, accent,
}: {
  src: string; title: string; caption?: string; accent: string;
}) {
  return (
    <figure style={{ margin: "32px 0", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{
        position: "relative" as const,
        width: "100%",
        aspectRatio: "3 / 2",
        background: "#000F16",
        border: `1px solid ${accent}33`,
        borderRadius: 16,
        overflow: "hidden" as const,
        boxShadow: "0 12px 48px -16px rgba(0,0,0,0.6)",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={title}
          loading="lazy"
          style={{
            width: "100%", height: "100%",
            objectFit: "cover" as const, display: "block",
          }}
        />
      </div>
      <figcaption style={{
        marginTop: 10, fontSize: 12, color: C.text3,
        fontFamily: "'Space Mono', monospace", letterSpacing: 0.5,
        textAlign: "center" as const,
      }}>
        {caption ?? title}
      </figcaption>
    </figure>
  );
}

function VideoPlaceholder({ title, accent }: { title: string; accent: string }) {
  return (
    <figure style={{ margin: "32px 0", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{
        position: "relative" as const,
        width: "100%",
        aspectRatio: "16 / 9",
        background: `
          radial-gradient(circle at 30% 20%, ${accent}22 0%, transparent 50%),
          radial-gradient(circle at 70% 80%, rgba(236,72,153,0.10) 0%, transparent 50%),
          #06060d
        `,
        border: `1px dashed ${accent}55`,
        borderRadius: 16,
        overflow: "hidden" as const,
        display: "flex",
        alignItems: "center" as const,
        justifyContent: "center" as const,
      }}>
        <div style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          position: "absolute" as const, inset: 0,
          maskImage: "radial-gradient(ellipse 60% 80% at 50% 50%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 80% at 50% 50%, black 0%, transparent 75%)",
        }} />
        <div style={{
          position: "relative" as const,
          textAlign: "center" as const,
          maxWidth: "80%",
          padding: "32px 24px",
        }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: accent + "1a",
            border: `1px solid ${accent}44`,
            borderRadius: 50,
            padding: "5px 14px",
            marginBottom: 18,
            fontSize: 11,
            color: accent,
            fontFamily: "'Space Mono', monospace",
            letterSpacing: 1.2,
            fontWeight: 800,
            textTransform: "uppercase" as const,
          }}>
            ▶ Video coming soon
          </div>
          <div style={{
            fontFamily: "'Bungee', cursive",
            fontSize: "clamp(18px, 2.4vw, 24px)",
            color: C.text,
            lineHeight: 1.25,
            marginBottom: 10,
          }}>
            {title}
          </div>
          <div style={{
            fontSize: 13,
            color: C.text3,
            lineHeight: 1.55,
          }}>
            A short walkthrough will live here. In the meantime, every step is documented in the full guide below.
          </div>
        </div>
      </div>
    </figure>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

export default function BotGuidePage(props: BotGuideProps) {
  const {
    accent,
    eyebrow,
    title,
    tagline,
    what,
    githubUrl,
    fullGuideUrl,
    dashboardUrl = "/dashboard",
    communityUrl,
    stats,
    mechanics,
    steps,
    risks,
    overviewVideoUrl,
    overviewVideoTitle = "Overview — what this bot does in 60 seconds",
    setupVideoUrl,
    setupVideoTitle = "Setup walkthrough — wallet to first swap",
    overviewIframeUrl,
    setupIframeUrl,
    overviewImageUrl,
    overviewImageCaption,
    setupImageUrl,
    setupImageCaption,
  } = props;

  return (
    <div style={{
      minHeight: "100vh",
      background: `
        radial-gradient(ellipse 80% 50% at 50% -10%, ${accent}12 0%, transparent 60%),
        radial-gradient(ellipse 60% 40% at 100% 100%, rgba(236,72,153,0.05) 0%, transparent 60%),
        ${C.bg}
      `,
      color: C.text,
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>

      {/* ── Sticky top nav ──────────────────────────────────────────── */}
      <nav style={{
        position: "sticky" as const, top: 0, zIndex: 50,
        background: "rgba(5,7,15,0.7)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{
          maxWidth: 1100, margin: "0 auto",
          padding: "0 24px", height: 60,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <a href="/" style={{
            fontFamily: "'Bungee', cursive", fontSize: 16,
            background: "linear-gradient(135deg,#ff6b35,#ec4899)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", textDecoration: "none",
            letterSpacing: 0.4,
          }}>
            Web3 Guides
          </a>
          <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
            <a href="/dashboard" style={{
              fontSize: 12, color: C.text3, textDecoration: "none",
              fontFamily: "'Space Mono', monospace", letterSpacing: 0.6,
            }}>Dashboard</a>
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 12, color: C.text3, textDecoration: "none",
              fontFamily: "'Space Mono', monospace", letterSpacing: 0.6,
            }}>GitHub ↗</a>
          </div>
        </div>
      </nav>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "40px 22px 100px" }}>

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <header style={{ marginBottom: 44 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            background: accent + "14",
            border: `1px solid ${accent}40`,
            borderRadius: 50, padding: "5px 14px",
            marginBottom: 22,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: accent, boxShadow: `0 0 10px ${accent}80`,
            }} />
            <span style={{
              fontFamily: "'Space Mono', monospace", fontSize: 11,
              color: accent, letterSpacing: 1.3, fontWeight: 800,
              textTransform: "uppercase" as const,
            }}>
              {eyebrow}
            </span>
          </div>

          <h1 style={{
            margin: "0 0 18px",
            fontFamily: "'Bungee', cursive",
            fontSize: "clamp(36px, 6.5vw, 64px)",
            lineHeight: 1.05,
            letterSpacing: -1.5,
            background: `linear-gradient(135deg, ${C.text} 0%, ${accent} 100%)`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            {title}
          </h1>

          <p style={{
            margin: 0, color: C.text2,
            fontSize: "clamp(15px, 1.6vw, 18px)",
            lineHeight: 1.65, maxWidth: 720,
          }}>
            {tagline}
          </p>

          {/* CTA buttons */}
          <div style={{
            display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" as const,
          }}>
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: `linear-gradient(135deg, ${accent}, ${C.pink})`,
              color: "#fff", textDecoration: "none",
              padding: "14px 22px", borderRadius: 12,
              fontFamily: "'Space Mono', monospace", fontSize: 13,
              fontWeight: 800, letterSpacing: 0.6,
              boxShadow: `0 10px 30px -10px ${accent}80`,
            }}>
              <span style={{ fontSize: 16 }}>★</span>
              View on GitHub
            </a>
            <a href={fullGuideUrl} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "transparent",
              color: C.text2, textDecoration: "none",
              padding: "14px 22px", borderRadius: 12,
              fontFamily: "'Space Mono', monospace", fontSize: 13,
              fontWeight: 800, letterSpacing: 0.6,
              border: `1px solid ${C.borderHi}`,
            }}>
              Read the full guide ↗
            </a>
          </div>
        </header>

        {/* ── At-a-glance stat strip ────────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14, marginBottom: 48,
        }}>
          {stats.map((s, i) => (
            <div key={i} style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "18px 18px",
              position: "relative" as const,
              overflow: "hidden" as const,
            }}>
              <span style={{
                position: "absolute" as const, top: 0, left: 0, right: 0, height: 2,
                background: accent, opacity: 0.5,
              }} />
              <div style={{
                fontSize: 10, color: C.text4,
                fontFamily: "'Space Mono', monospace",
                letterSpacing: 1.2, fontWeight: 800,
                textTransform: "uppercase" as const,
                marginBottom: 8,
              }}>
                {s.label}
              </div>
              <div style={{
                fontFamily: "'Bungee', cursive",
                fontSize: 22, letterSpacing: -0.5,
                color: C.text, lineHeight: 1.1,
              }}>
                {s.value}
              </div>
              {s.sub && (
                <div style={{
                  marginTop: 6, fontSize: 11, color: C.text3,
                  fontFamily: "'Space Mono', monospace",
                }}>
                  {s.sub}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── What is this section ──────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{
            fontFamily: "'Bungee', cursive",
            fontSize: 28, letterSpacing: -0.3,
            margin: "0 0 16px", color: C.text,
          }}>
            What this is
          </h2>
          <p style={{
            margin: 0, color: C.text2,
            fontSize: 16, lineHeight: 1.75, maxWidth: 760,
          }}>
            {what}
          </p>
        </section>

        {/* ── Overview media slot (hidden when nothing set) ─────────── */}
        {overviewIframeUrl ? (
          <MediaLauncher src={overviewIframeUrl} title={overviewVideoTitle} accent={accent} />
        ) : overviewVideoUrl ? (
          <VideoEmbed src={overviewVideoUrl} title={overviewVideoTitle} duration="0:60" accent={accent} />
        ) : overviewImageUrl ? (
          <StaticInfographic
            src={overviewImageUrl}
            title={overviewVideoTitle}
            caption={overviewImageCaption}
            accent={accent}
          />
        ) : null}

        {/* ── How it works (3 mechanics cards) ──────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{
            fontFamily: "'Bungee', cursive",
            fontSize: 28, letterSpacing: -0.3,
            margin: "0 0 20px", color: C.text,
          }}>
            How it works
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}>
            {mechanics.map((m, i) => (
              <div key={i} style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                padding: "22px 20px",
              }}>
                <div style={{
                  fontSize: 26, marginBottom: 12,
                  filter: "saturate(1.2)",
                }}>
                  {m.icon}
                </div>
                <h3 style={{
                  margin: "0 0 10px",
                  fontFamily: "'Bungee', cursive",
                  fontSize: 16, color: C.text, letterSpacing: 0.2,
                }}>
                  {m.title}
                </h3>
                <p style={{
                  margin: 0, color: C.text3,
                  fontSize: 13.5, lineHeight: 1.65,
                }}>
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Setup media slot (hidden when nothing set) ────────────── */}
        {setupIframeUrl ? (
          <MediaLauncher src={setupIframeUrl} title={setupVideoTitle} accent={accent} duration="7:50 interactive" />
        ) : setupVideoUrl ? (
          <VideoEmbed src={setupVideoUrl} title={setupVideoTitle} duration="0:60" accent={accent} />
        ) : setupImageUrl ? (
          <StaticInfographic
            src={setupImageUrl}
            title={setupVideoTitle}
            caption={setupImageCaption}
            accent={accent}
          />
        ) : null}

        {/* ── Quickstart steps ──────────────────────────────────────── */}
        <section style={{ marginBottom: 48 }}>
          <div style={{
            display: "flex", alignItems: "baseline" as const,
            justifyContent: "space-between" as const,
            gap: 16, flexWrap: "wrap" as const,
            marginBottom: 22,
          }}>
            <h2 style={{
              fontFamily: "'Bungee', cursive",
              fontSize: 28, letterSpacing: -0.3,
              margin: 0, color: C.text,
            }}>
              Quickstart
            </h2>
            <a href={fullGuideUrl} target="_blank" rel="noopener noreferrer" style={{
              fontSize: 12, color: accent, textDecoration: "none",
              fontFamily: "'Space Mono', monospace", letterSpacing: 0.6, fontWeight: 800,
            }}>
              Full step-by-step guide ↗
            </a>
          </div>
          <p style={{
            margin: "0 0 24px", color: C.text3, fontSize: 14,
            lineHeight: 1.65, maxWidth: 700,
          }}>
            High-level shape so you know what you&apos;re in for. Each step in the full guide has the exact commands to copy-paste.
          </p>

          <ol style={{
            margin: 0, padding: 0,
            listStyle: "none" as const,
            counterReset: "step",
          }}>
            {steps.map((s, i) => (
              <li key={i} style={{
                position: "relative" as const,
                paddingLeft: 60,
                paddingBottom: 22,
                borderLeft: i === steps.length - 1 ? "none" : `1px solid ${C.border}`,
                marginLeft: 24,
              }}>
                <span style={{
                  position: "absolute" as const,
                  left: -19, top: -2,
                  width: 38, height: 38, borderRadius: "50%",
                  background: C.surface,
                  border: `1px solid ${accent}55`,
                  color: accent,
                  fontFamily: "'Bungee', cursive", fontSize: 14,
                  display: "inline-flex",
                  alignItems: "center" as const,
                  justifyContent: "center" as const,
                  boxShadow: `0 0 0 4px ${C.bg}`,
                }}>
                  {i + 1}
                </span>
                <h3 style={{
                  margin: "0 0 6px",
                  fontFamily: "'Bungee', cursive",
                  fontSize: 16, color: C.text, letterSpacing: 0.2,
                }}>
                  {s.title}
                </h3>
                <p style={{
                  margin: 0, color: C.text3,
                  fontSize: 14, lineHeight: 1.65,
                }}>
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Risks callout ─────────────────────────────────────────── */}
        <section style={{
          marginBottom: 48,
          background: C.amberBg,
          border: `1px solid ${C.amber}33`,
          borderRadius: 16,
          padding: "26px 26px 22px",
        }}>
          <div style={{
            display: "flex", alignItems: "center" as const, gap: 10,
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <h2 style={{
              margin: 0,
              fontFamily: "'Bungee', cursive",
              fontSize: 22, letterSpacing: -0.2,
              color: C.amber,
            }}>
              Honest risks — read these first
            </h2>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" as const, display: "grid", gap: 14 }}>
            {risks.map((r, i) => (
              <li key={i} style={{
                display: "grid", gridTemplateColumns: "auto 1fr",
                gap: 14, alignItems: "start" as const,
              }}>
                <span style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11, color: C.amber, fontWeight: 800,
                  letterSpacing: 1, paddingTop: 3,
                }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <div style={{
                    fontFamily: "'Bungee', cursive", fontSize: 13,
                    color: C.text, letterSpacing: 0.2, marginBottom: 4,
                  }}>
                    {r.heading}
                  </div>
                  <div style={{ color: C.text3, fontSize: 14, lineHeight: 1.6 }}>
                    {r.body}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Live dashboard CTA ────────────────────────────────────── */}
        <section style={{
          marginBottom: 48,
          background: `linear-gradient(135deg, ${accent}1a, rgba(236,72,153,0.06) 70%, transparent), ${C.surface}`,
          border: `1px solid ${accent}44`,
          borderRadius: 16,
          padding: "30px 30px",
          display: "flex",
          alignItems: "center" as const,
          gap: 20, flexWrap: "wrap" as const,
        }}>
          <div style={{ flex: "1 1 320px" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(16,185,129,0.10)",
              border: "1px solid rgba(16,185,129,0.30)",
              borderRadius: 50, padding: "4px 12px", marginBottom: 14,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: C.green, boxShadow: `0 0 8px ${C.green}80`,
              }} />
              <span style={{
                fontFamily: "'Space Mono', monospace", fontSize: 10,
                color: C.green, letterSpacing: 1.3, fontWeight: 800,
                textTransform: "uppercase" as const,
              }}>
                Live · real money
              </span>
            </div>
            <h3 style={{
              margin: "0 0 8px",
              fontFamily: "'Bungee', cursive",
              fontSize: 22, color: C.text, letterSpacing: 0.2,
            }}>
              See it running on the public dashboard
            </h3>
            <p style={{
              margin: 0, color: C.text3, fontSize: 14, lineHeight: 1.6, maxWidth: 520,
            }}>
              I run this bot with real capital and publish every position, trade, and log line live. Click through to watch it tick.
            </p>
          </div>
          <a href={dashboardUrl} style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            background: C.text, color: C.bg, textDecoration: "none",
            padding: "14px 22px", borderRadius: 12,
            fontFamily: "'Space Mono', monospace", fontSize: 13,
            fontWeight: 800, letterSpacing: 0.6,
          }}>
            Open dashboard →
          </a>
        </section>

        {/* ── Bottom CTA strip ──────────────────────────────────────── */}
        <section style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 16, padding: "32px 28px",
          textAlign: "center" as const,
          marginBottom: 32,
        }}>
          <h3 style={{
            margin: "0 0 10px",
            fontFamily: "'Bungee', cursive",
            fontSize: 22, color: C.text, letterSpacing: 0.2,
          }}>
            Ready to try it?
          </h3>
          <p style={{
            margin: "0 0 22px", color: C.text3, fontSize: 14,
            lineHeight: 1.6, maxWidth: 520,
            marginLeft: "auto" as const, marginRight: "auto" as const,
          }}>
            Clone the repo, follow the guide, and start in dry-run mode. If you get stuck, the community is happy to help.
          </p>
          <div style={{
            display: "inline-flex", gap: 10, flexWrap: "wrap" as const,
            justifyContent: "center" as const,
          }}>
            <a href={githubUrl} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: `linear-gradient(135deg, ${accent}, ${C.pink})`,
              color: "#fff", textDecoration: "none",
              padding: "12px 20px", borderRadius: 10,
              fontFamily: "'Space Mono', monospace", fontSize: 12.5,
              fontWeight: 800, letterSpacing: 0.5,
            }}>
              ★ GitHub
            </a>
            <a href={fullGuideUrl} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "transparent",
              color: C.text2, textDecoration: "none",
              padding: "12px 20px", borderRadius: 10,
              fontFamily: "'Space Mono', monospace", fontSize: 12.5,
              fontWeight: 800, letterSpacing: 0.5,
              border: `1px solid ${C.borderHi}`,
            }}>
              Full guide
            </a>
            {communityUrl && (
              <a href={communityUrl} target="_blank" rel="noopener noreferrer" style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "transparent",
                color: C.text2, textDecoration: "none",
                padding: "12px 20px", borderRadius: 10,
                fontFamily: "'Space Mono', monospace", fontSize: 12.5,
                fontWeight: 800, letterSpacing: 0.5,
                border: `1px solid ${C.borderHi}`,
              }}>
                Community
              </a>
            )}
          </div>
        </section>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <footer style={{
          paddingTop: 24,
          borderTop: `1px solid ${C.border}`,
          fontSize: 11, color: C.text4,
          fontFamily: "'Space Mono', monospace",
          letterSpacing: 0.6,
          display: "flex", flexWrap: "wrap" as const,
          justifyContent: "space-between" as const, gap: 12,
        }}>
          <span>
            BUILT BY <a href="https://bigmike.web3guides.com" style={{ color: C.text3, textDecoration: "none", fontWeight: 700 }}>BIG MIKE</a> · OPEN SOURCE · MIT LICENSED
          </span>
          <span>
            <a href="/dashboard" style={{ color: C.text3, textDecoration: "none" }}>SEE IT LIVE →</a>
          </span>
        </footer>
      </main>
    </div>
  );
}
