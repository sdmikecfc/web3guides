/**
 * /s5/board OpenGraph image: the war board as a CARD.
 *
 * Mike, 2026-08-01, on the board: "needs to be sharable quality". Pasting the
 * link anywhere used to show the season card from /s5/opengraph-image, which
 * says nothing about who is winning. This one carries what a person actually
 * wants to show off or argue with: the top five commanders with their Medals,
 * the war effort, and the season's whole purse stated honestly as its two
 * envelopes rather than the $700 pool alone.
 *
 * Same two structural rules as the season card, both learned the hard way:
 * `headers()` fires BEFORE next/og is imported (the dynamic-API bail-out has to
 * happen first, or the build prerenders this with frozen data AND trips
 * @vercel/og's node bundle on Windows), and the snapshot never throws, so this
 * renders pre-season without a special case.
 */
import { headers } from "next/headers";
import { getSeasonSnapshot } from "@/lib/s5/data";
import { BOUNTY_TOTAL_USD, POOL_FULL_USD, SEASON_MONEY_USD } from "@/lib/s5/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Launch Wars Season 5: the war board";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export default async function BoardOpengraphImage() {
  headers();
  const { ImageResponse } = await import("next/og");
  const snap = await getSeasonSnapshot();
  const t = snap.theme;
  const top = snap.topCommanders.slice(0, 5);

  // HER PICTURE, FETCHED BY US, NOT BY SATORI. Handing next/og a URL means an
  // asset that 404s or hangs takes the whole card down with it, and a card that
  // 500s is strictly worse than a card with no portrait. Fetching it here lets
  // a failure degrade to type-only, which still looks deliberate.
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "tanks.web3guides.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  let vega: string | null = null;
  try {
    const res = await fetch(`${proto}://${host}/s5-art/board/vega-og.png`, { cache: "no-store" });
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
          {/* TWO envelopes since ADR-0098. The honors line used to sit here and
              would now render "$0 honors", because the honors cash folded into
              the bounties and honors became the five finale titles. */}
          {/* DERIVED from the live per-wall bounties, like the board page, so a
              shared card can never advertise more than the season can actually
              pay. Falls back to the envelope constant only when no wall carries
              a bounty yet (pre-seed), which is the one case where the constant
              IS the best available truth. */}
          {(() => {
            const bountyLive = snap.targets.reduce((s, tg) => s + (tg.bountyUsd ?? 0), 0);
            const bounty = bountyLive > 0 ? bountyLive : BOUNTY_TOTAL_USD;
            const total = bountyLive > 0 ? POOL_FULL_USD + bountyLive : SEASON_MONEY_USD;
            return (
              <div style={{ fontSize: 25, color: "#34d399", marginBottom: 26, display: "flex" }}>
                {`${usd(total)} on the table · ${usd(POOL_FULL_USD)} season pool · ${usd(
                  bounty,
                )} breach bounties`}
              </div>
            );
          })()}

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
              The board opens with the season. Hold a stronghold from $5 to be on it.
            </div>
          )}

          <div style={{ fontSize: 22, color: "#87919b", marginTop: "auto", display: "flex" }}>
            {snap.empty
              ? "tanks.web3guides.com"
              : `${snap.totals.bonded} of ${snap.totals.total} ${t.target.plural} ${t.bondedWord} · ${snap.totals.players} commanders`}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
