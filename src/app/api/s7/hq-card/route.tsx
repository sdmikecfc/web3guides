/**
 * S7 GARAGE CARD, the public-garage og:image.
 *
 *   GET /api/s7/hq-card?h=<handle>  ->  image/png 1200x630
 *
 * Dark gradient, big callsign, and the adventurer's CLASS: the armor-stage
 * cutout their level has earned, the class name, "Level N of 20" and the stage
 * name, plus decal-count + War Bonds chips, the REALMFALL wordmark and
 * launchwars.xyz. An unknown handle FAILS SOFT to a generic recruitment card
 * (og scrapers must always get an image). No money data of any kind, and a
 * level never buys a bigger share of anything.
 *
 * REALMFALL (ADR-0129/0133): this card used to draw the S6 tank plus four
 * Top-Trumps rating bars. Those are gone. The stage art is the same PNG the
 * private Class Hall wears, asked for through lib/s7/classes classStageArt so
 * the filename rule keeps one owner, and it is HEAD-checked before it goes
 * into the card: a missing render composes a clean text card instead of
 * failing the whole image, because a card that renders beats one that does not.
 *
 * next/og (Satori) renders. Fonts are fetched over HTTP from our own /public
 * (the proven s4/card sidestep for the Windows-dev @vercel/og default-font
 * bug); on any fetch failure we fall back to the system default, which works
 * on Vercel. Reading the request URL keeps this route dynamic, so the Windows
 * `next build` never tries to pre-render it.
 */
import { ImageResponse } from "next/og";
import { resolvePublicHq, type PublicGarage } from "@/lib/s7/publicHq";
import { ARMOR_STAGES, MAX_LEVEL, classStageArt, isClassId, type ArmorStage } from "@/lib/s7/classes";

export const runtime = "nodejs";

const W = 1200;
const H = 630;
const STEEL = "#9aa7b4";
const EMBER = "#e0662e";
const TEXT = "#e9edf1";
const MUTED = "#aab4bd";
const FAINT = "#87919b";
const BORDER = "#232a32";
const SITE = "launchwars.xyz";


/** "champion" -> "Champion". The hall's STAGE_META owns the label, but that
 * module is "use client" and a route cannot dot into a client module; every
 * stage key is one lowercase word whose capitalization is its label. */
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The stage key, validated against the shipped ladder. */
function safeStage(stage: string): ArmorStage {
  return (ARMOR_STAGES as readonly string[]).includes(stage) ? (stage as ArmorStage) : "novice";
}

/**
 * THE PLAYER'S CLASS, as a PNG Satori can render.
 *
 * DELEGATES to lib/s7/classes classStageArt() rather than re-deriving the
 * filename (the tank version of this file learned that lesson the hard way:
 * a second copy of a naming rule cannot know about the exceptions).
 *
 * HEAD-checks the file before handing it to Satori. Satori fetches <img> src
 * itself and a 404 there fails the whole render mid-stream, where the route's
 * try/catch can no longer help. Returning null instead lets the card compose
 * without the cutout.
 */
async function classCardArt(origin: string, classKey: string, stage: string): Promise<string | null> {
  if (!isClassId(classKey)) return null;
  const url = origin + classStageArt(classKey, safeStage(stage));
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok ? url : null;
  } catch {
    return null;
  }
}

type Fonts = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] | undefined;

async function loadFonts(origin: string): Promise<Fonts> {
  try {
    const [rg, bd] = await Promise.all([
      fetch(origin + "/s4-art/fonts/AktivGrotesk_Rg.ttf").then((r) => r.arrayBuffer()),
      fetch(origin + "/s4-art/fonts/AktivGrotesk_Bd.ttf").then((r) => r.arrayBuffer()),
    ]);
    return [
      { name: "Aktiv", data: rg, weight: 400, style: "normal" },
      { name: "Aktiv", data: bd, weight: 700, style: "normal" },
    ];
  } catch {
    return undefined; // system default (fine on Vercel)
  }
}

const shell: React.CSSProperties = {
  width: W,
  height: H,
  display: "flex",
  flexDirection: "column",
  // Was #1a212a -> #0b0d10: near-black to near-black, so the whole card sat
  // at one value and nothing had anywhere to look. Warmer at the top left,
  // deeper at the bottom right, so the type has a lit corner to sit in.
  background: "linear-gradient(145deg, #2a3340 0%, #171d25 42%, #0c1014 100%)",
  color: TEXT,
  padding: 56,
  fontFamily: "Aktiv, sans-serif",
  position: "relative",
};

function wordmark() {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 14, height: 14, background: EMBER, borderRadius: 3, display: "flex" }} />
        {/* The season this card is actually for. It read IRON SIEGE (S5) on
            every S7 share until now. */}
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 8, color: STEEL }}>REALMFALL</div>
      </div>
      <div style={{ fontSize: 22, color: FAINT, display: "flex" }}>{SITE}</div>
    </div>
  );
}

function chip(text: string, color: string) {
  return (
    <div
      style={{
        display: "flex",
        fontSize: 20,
        fontWeight: 700,
        color,
        border: `2px solid ${color}66`,
        borderRadius: 999,
        padding: "8px 22px",
      }}
    >
      {text}
    </div>
  );
}

/**
 * THE GARAGE CARD: the adventurer beside their name.
 *
 * The stage cutouts are portrait (288x512 keyed PNGs), so the S4 full-bleed
 * treatment the tank card used does not fit them: stretched to 1200x630 a
 * standing figure is either cropped at the knees or lost in the middle. A
 * two-column card suits a figure instead, the way a character sheet does: the
 * adventurer stands on a lit floor at the left, the identity stack reads down
 * the right. With no art the identity stack simply takes the whole card.
 *
 * `origin` is threaded in because Satori needs an absolute URL for <img>.
 */
async function garageCard(v: PublicGarage, fonts: Fonts, origin: string) {
  const ac = v.activeClass;
  const art = ac ? await classCardArt(origin, ac.classKey, ac.stage) : null;
  const stageName = ac ? titleCase(safeStage(ac.stage)) : "";
  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          position: "relative",
          background: "linear-gradient(145deg, #2a3340 0%, #171d25 42%, #0c1014 100%)",
          color: TEXT,
          fontFamily: "Aktiv, sans-serif",
        }}
      >
        {/* A LIT FLOOR under the figure, so the cutout stands on something
            instead of hovering in a flat field. Only when there IS a figure:
            a glow with nothing above it just looks like a smudge. */}
        {art ? (
          <div
            style={{
              position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex",
              background: "radial-gradient(ellipse 46% 60% at 24% 96%, rgba(224,102,46,0.22) 0%, transparent 72%)",
            }}
          />
        ) : null}

        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column", padding: 44 }}>
          {wordmark()}

          <div style={{ display: "flex", flexGrow: 1, alignItems: "center", gap: 40, marginTop: 8 }}>
            {art ? (
              <div style={{ display: "flex", width: 300, height: 400, alignItems: "flex-end", justifyContent: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={art} width={225} height={400} style={{ objectFit: "contain" }} />
              </div>
            ) : null}

            {/* IDENTITY. Left aligned beside the figure so the two read as one
                object; a centred stack would fight the cutout for the middle. */}
            <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
              <div style={{ fontSize: 19, letterSpacing: 6, color: FAINT, display: "flex" }}>ADVENTURER&apos;S CAMP</div>
              <div style={{ fontSize: art ? 72 : 78, fontWeight: 700, color: "#ffffff", lineHeight: 1.02, marginTop: 6, display: "flex" }}>
                {v.callsign}
              </div>
              <div style={{ fontSize: 25, color: EMBER, fontWeight: 700, letterSpacing: 4, marginTop: 8, display: "flex" }}>
                {v.rank.toUpperCase()}
              </div>

              {ac ? (
                <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
                  <div style={{ fontSize: 40, fontWeight: 700, color: TEXT, display: "flex" }}>{ac.className}</div>
                  <div style={{ fontSize: 24, color: MUTED, marginTop: 6, display: "flex" }}>
                    Level {ac.level} of {MAX_LEVEL} · {stageName} armor
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 24, color: MUTED, marginTop: 20, display: "flex" }}>No class picked yet.</div>
              )}

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                {chip(`${v.tank.decals.length} banner${v.tank.decals.length === 1 ? "" : "s"}`, STEEL)}
                {chip(`War Bonds tier ${v.bondsTier}`, EMBER)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
            <div style={{ fontSize: 20, color: MUTED, display: "flex" }}>Build your own HQ. Enlist free.</div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts },
  );
}

function recruitCard(fonts: Fonts) {
  return new ImageResponse(
    (
      <div style={shell}>
        {wordmark()}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ fontSize: 26, letterSpacing: 6, color: FAINT, display: "flex" }}>LAUNCH WARS S7</div>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, marginTop: 10, display: "flex" }}>
            Every adventurer gets a camp.
          </div>
          <div style={{ fontSize: 30, color: MUTED, marginTop: 26, display: "flex" }}>
            Pick a class. Play free.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {/* Was "15 real tanks": the season has classes, and this card is the
              one a scraper gets for an unknown handle. */}
          {chip("Six classes", STEEL)}
          {chip("The Guild", EMBER)}
        </div>
      </div>
    ),
    { width: W, height: H, fonts },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const handle = String(url.searchParams.get("h") || "").slice(0, 80);
  const fonts = await loadFonts(url.origin);

  let view: PublicGarage | null = null;
  try {
    const res = handle ? await resolvePublicHq(handle) : null;
    view = res?.view ?? null;
  } catch {
    view = null; // fail soft: the recruitment card below
  }

  try {
    return view ? await garageCard(view, fonts, url.origin) : recruitCard(fonts);
  } catch {
    // Satori itself failed (e.g. the Windows default-font bug with no fonts
    // fetched): a plain 500 beats a hung scrape.
    return new Response("card unavailable", { status: 500 });
  }
}
