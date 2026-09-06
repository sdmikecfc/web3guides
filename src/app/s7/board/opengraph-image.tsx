/**
 * /s7/board OpenGraph image: the war board as a CARD.
 *
 * Mike, 2026-08-01, on the board: "needs to be sharable quality". Pasting the
 * link anywhere used to show the season card from /s7/opengraph-image, which
 * says nothing about who is winning. This one carries what a person actually
 * wants to show off or argue with: the top five commanders with their Medals,
 * the war effort, and the season's whole purse. Since 2026-08-16 that purse is
 * ONE pot, so the line names the envelope and what has been earned against it
 * rather than reconciling two amounts.
 *
 * Same two structural rules as the season card, both learned the hard way:
 * `headers()` fires BEFORE next/og is imported (the dynamic-API bail-out has to
 * happen first, or the build prerenders this with frozen data AND trips
 * @vercel/og's node bundle on Windows), and the snapshot never throws, so this
 * renders pre-season without a special case.
 */
import { headers } from "next/headers";
import { getSeasonSnapshot } from "@/lib/s7/data";
import { POOL_FULL_USD } from "@/lib/s7/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Launch Wars Season 7 Realmfall: the war board";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Vega's portrait. Its own "/..." const so the preflight vocab gate's path
 * mask (the PATH LAW: a path is a filesystem fact, not copy) recognizes it. */
const VEGA_ART = "/s7-art/pilot/vega.png";

export default async function BoardOpengraphImage() {
  headers();
  const { ImageResponse } = await import("next/og");
  const snap = await getSeasonSnapshot();
  const t = snap.theme;
  const top = snap.topAdventurers.slice(0, 5);

  // HER PICTURE, FETCHED BY US, NOT BY SATORI. Handing next/og a URL means an
  // asset that 404s or hangs takes the whole card down with it, and a card that
  // 500s is strictly worse than a card with no portrait. Fetching it here lets
  // a failure degrade to type-only, which still looks deliberate.
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "launchwars.xyz";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  let vega: string | null = null;
  try {
    const res = await fetch(`${proto}://${host}${VEGA_ART}`, { cache: "no-store" });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      vega = `data:image/png;base64,${buf.toString("base64")}`;
    }
  } catch {
    // type-only card
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(115deg, #12161b 0%, #0b0d10 62%, #14181d 100%)",
          color: "#e9edf1",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {vega ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vega}
            alt=""
            width={259}
            height={470}
            style={{ position: "absolute", right: 64, bottom: 0, opacity: 0.94 }}
          />
        ) : null}
        {/* The scrim keeps the type readable over her without hiding her. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "linear-gradient(90deg, rgba(11,13,16,0.97) 46%, rgba(11,13,16,0.55) 72%, rgba(11,13,16,0.2) 100%)",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column", padding: "48px 54px", width: 760, position: "relative" }}>
          <div style={{ fontSize: 20, letterSpacing: 8, textTransform: "uppercase", color: "#87919b" }}>
            {t.seasonName}
          </div>
          <div style={{ fontSize: 62, fontWeight: 800, margin: "10px 0 4px" }}>War Board</div>
          {/* ONE envelope since 2026-08-16: bounties are deleted, so there is
              no second amount to name and "season pool" can only ever mean the
              one constant. The second half is what the season has EARNED so
              far, straight off the snapshot, and it is omitted entirely while
              that is still zero: a shared card reading "$0 earned" is the S3
              dead-number lesson, and these bars only ever go up. */}
          <div style={{ fontSize: 25, color: "#34d399", marginBottom: 26, display: "flex" }}>
            {snap.pool.secured > 0
              ? `${usd(POOL_FULL_USD)} season pool · ${usd(snap.pool.secured)} earned so far`
              : `${usd(POOL_FULL_USD)} season pool · a slice for every keep, split by difficulty`}
          </div>

          {top.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {top.map((c) => (
                <div
                  key={`${c.rank}-${c.name}`}
                  style={{ display: "flex", alignItems: "baseline", gap: 16, fontSize: 27 }}
                >
                  <span style={{ color: "#5d6771", width: 40 }}>{String(c.rank)}</span>
                  <span style={{ fontWeight: 700, flexGrow: 1 }}>{c.name}</span>
                  <span style={{ color: "#e8a33d", fontWeight: 700 }}>{c.points.toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 27, color: "#aab4bd" }}>
              The board opens with the season. Hold a keep from $5 to be on it.
            </div>
          )}

          <div style={{ fontSize: 22, color: "#87919b", marginTop: "auto", display: "flex" }}>
            {snap.empty
              ? "launchwars.xyz"
              : `${snap.totals.bonded} of ${snap.totals.total} ${t.target.plural} ${t.bondedWord} · ${snap.totals.players} adventurers`}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
