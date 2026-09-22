/**
 * S5 GARAGE CARD, the public-garage og:image.
 *
 *   GET /api/s5/hq-card?h=<handle>  ->  image/png 1200x630
 *
 * Dark bunker gradient, big callsign, tank name + tier class, the 4 ratings as
 * compact bars, decal-count + War Bonds chips, the IRON SIEGE wordmark and
 * tanks.web3guides.com. An unknown handle FAILS SOFT to a generic recruitment
 * card (og scrapers must always get an image). No money data of any kind.
 *
 * next/og (Satori) renders. Fonts are fetched over HTTP from our own /public
 * (the proven s4/card sidestep for the Windows-dev @vercel/og default-font
 * bug); on any fetch failure we fall back to the system default, which works
 * on Vercel. Reading the request URL keeps this route dynamic, so the Windows
 * `next build` never tries to pre-render it.
 */
import { ImageResponse } from "next/og";
import { resolvePublicHq, type PublicGarage } from "@/lib/s5/publicHq";
import { tankArt } from "@/lib/s5/model";
import type { CamoKey } from "@/lib/s5/model";

export const runtime = "nodejs";

const W = 1200;
const H = 630;
const STEEL = "#9aa7b4";
const EMBER = "#e0662e";
const TEXT = "#e9edf1";
const MUTED = "#aab4bd";
const FAINT = "#87919b";
const BORDER = "#232a32";
const SITE = "tanks.web3guides.com";


/**
 * THE PLAYER'S ACTUAL TANK, as a JPEG Satori can render.
 *
 * This card used to draw a hand-coded SVG tank: one generic top-down box,
 * recoloured per camo, identical in silhouette for all twenty machines. Mike:
 * "Its really bad. Needs to have their actual tank and look like the S4 ones."
 *
 * The real garage renders live at /s5-art/tank/<key>[-<camo>].webp, and Satori
 * does not render WebP (PNG, JPEG and SVG only). So `scripts` bakes a JPEG
 * sibling of every render into /s5-art/tank/card/ and this points at those.
 *
 * DELEGATES to lib/s5/model tankArt() rather than re-deriving the filename.
 * The first version of this re-implemented the rule and immediately got Sherman
 * wrong, because Sherman is the one tank with a HERO_TANK_ART override
 * (hero-sherman.webp, not sherman.webp) and a second copy of a naming rule
 * cannot know that. One rule, one owner: ask for the render, then point at its
 * baked JPEG sibling.
 *
 * Returns null if the tank has no render at all (tankArt falls through to a
 * .png silhouette path), so the caller can compose without the photo instead of
 * emitting a broken <img> into the card.
 */
function tankCardArt(origin: string, tankKey: string, camo: CamoKey): string | null {
  const art = tankArt(tankKey, camo);
  if (!art.endsWith(".webp")) return null;
  return origin + art.replace("/s5-art/tank/", "/s5-art/tank/card/").replace(/\.webp$/, ".jpg");
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
        <div style={{ display: "flex", fontSize: 26, fontWeight: 700, letterSpacing: 8, color: STEEL }}>IRON SIEGE</div>
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
 * THE GARAGE CARD, rebuilt on the S4 poster shape (Mike: "look like the S4
 * ones"). S4's card works because the ART IS THE CARD: the render is full-bleed
 * behind a two-stop scrim, and the type sits in the dark bands top and bottom.
 * The old S5 card instead put a small drawn tank in a column beside the text,
 * which is a layout that only works when the art is a logo.
 *
 * `origin` is threaded in because Satori needs an absolute URL for <img>.
 */
function garageCard(v: PublicGarage, fonts: Fonts, origin: string) {
  const bars: Array<{ label: string; val: number }> = [
    { label: "FIREPOWER", val: v.tank.ratings.fp },
    { label: "SPEED", val: v.tank.ratings.spd },
    { label: "MANEUVER", val: v.tank.ratings.man },
    { label: "ARMOR", val: v.tank.ratings.arm },
  ];
  const art = tankCardArt(origin, v.tank.tankKey, v.tank.camo);
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", background: "#0c1014", color: TEXT, fontFamily: "Aktiv, sans-serif" }}>
        {/* THE MACHINE, full bleed. The JPEG is baked at EXACTLY 1200x630 with
            the whole tank already framed and the studio plate already extended,
            so there is nothing to crop here. Cropping in Satori was tried and
            measured: the renders are 3:2 against a 1.9:1 card, and object-fit
            cover chopped the gun barrel off the left and the tracks off the
            bottom. Framing belongs at bake time, where a blur is available. */}
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art}
            width={W}
            height={H}
            style={{ position: "absolute", top: 0, left: 0, width: W, height: H }}
          />
        ) : (
          // No render for this tank: a lit ground beats a broken image box.
          <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", background: "linear-gradient(145deg, #2a3340 0%, #171d25 42%, #0c1014 100%)" }} />
        )}

        {/* THE SCRIM. Two dark bands with a clear middle, so the tank is fully
            visible across the waist of the card and the type still lands on
            near-solid ground at both ends. Ember at the very bottom ties the
            card to the season accent without tinting the machine. */}
        <div
          style={{
            position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex",
            background:
              "linear-gradient(180deg, rgba(8,11,16,0.92) 0%, rgba(8,11,16,0.55) 18%, rgba(8,11,16,0.05) 34%, rgba(8,11,16,0.08) 46%, rgba(8,11,16,0.78) 66%, rgba(8,11,16,0.97) 100%)",
          }}
        />

        <div style={{ position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column", padding: 44 }}>
          {wordmark()}

          <div style={{ display: "flex", flexGrow: 1 }} />

          {/* IDENTITY. Centred like S4: on a full-bleed card a left column
              fights the subject, a centred stack sits under it. */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: W - 88 }}>
            <div style={{ fontSize: 19, letterSpacing: 6, color: FAINT, display: "flex" }}>PUBLIC GARAGE</div>
            <div style={{ fontSize: 76, fontWeight: 700, color: "#ffffff", lineHeight: 1.02, marginTop: 6, display: "flex" }}>
              {v.callsign}
            </div>
            <div style={{ fontSize: 25, color: EMBER, fontWeight: 700, letterSpacing: 4, marginTop: 8, display: "flex" }}>
              {v.rank.toUpperCase()}
            </div>
            <div style={{ fontSize: 31, color: TEXT, marginTop: 16, display: "flex" }}>
              {v.tank.tankName}
            </div>
            <div style={{ fontSize: 19, color: MUTED, marginTop: 4, display: "flex" }}>
              Tier {v.tank.tier} · {v.tank.hullName} class · {v.tank.camo} camo
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              {chip(`${v.tank.decals.length} decal${v.tank.decals.length === 1 ? "" : "s"}`, STEEL)}
              {chip(`War Bonds tier ${v.bondsTier}`, EMBER)}
            </div>
          </div>

          {/* RATINGS as a spec strip along the base. */}
          <div style={{ display: "flex", gap: 22, marginTop: 24 }}>
            {bars.map((b) => (
              <div key={b.label} style={{ display: "flex", flexDirection: "column", flex: 1, gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div style={{ fontSize: 15, letterSpacing: 3, color: FAINT, display: "flex" }}>{b.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, display: "flex" }}>{b.val}</div>
                </div>
                <div style={{ display: "flex", width: "100%", height: 8, borderRadius: 4, background: "#1b222bcc" }}>
                  <div
                    style={{
                      display: "flex",
                      width: `${Math.max(0, Math.min(10, b.val)) * 10}%`,
                      height: 8,
                      borderRadius: 4,
                      background: EMBER,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
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
          <div style={{ fontSize: 26, letterSpacing: 6, color: FAINT, display: "flex" }}>LAUNCH WARS S5</div>
          <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, marginTop: 10, display: "flex" }}>
            Every commander gets a bunker.
          </div>
          <div style={{ fontSize: 30, color: MUTED, marginTop: 26, display: "flex" }}>
            Build your own HQ. Enlist free.
          </div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {chip("15 real tanks", STEEL)}
          {chip("The Iron Column", EMBER)}
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
    return view ? garageCard(view, fonts, url.origin) : recruitCard(fonts);
  } catch {
    // Satori itself failed (e.g. the Windows default-font bug with no fonts
    // fetched): a plain 500 beats a hung scrape.
    return new Response("card unavailable", { status: 500 });
  }
}
