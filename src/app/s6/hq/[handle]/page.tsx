/**
 * S5 PUBLIC GARAGE (/s5/hq/[handle]): anyone can visit a commander's garage by
 * display-name slug or unique wallet prefix. Server component, ISR 60.
 *
 * PUBLIC-SAFE: callsign, rank, tank, commander, camo/decals, service-record
 * COUNTS and past-season trophies only. Never a dollar figure, never a wallet
 * (the resolver's wallet stays server-side for the trophy lookup). Unknown
 * handles render the themed not-found panel. og:image is the /api/s6/hq-card
 * route so a shared garage unfurls as a card.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { resolvePublicHq } from "@/lib/s6/publicHq";
import { getTrophies } from "@/lib/s6/trophies";
import { DEFAULT_THEME } from "@/lib/s6/theme";
import { Eyebrow, PageShell, Panel, UI } from "../../_components/ui";
import { PublicGarageView } from "./garage";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { handle: string };
}): Promise<Metadata> {
  const res = await resolvePublicHq(params.handle);
  const title = res ? `${res.view.callsign}'s HQ | Uprising` : `Uprising | ${DEFAULT_THEME.seasonName}`;
  const description = res
    ? `${res.view.callsign} fields the ${res.view.tank.tankName}. Visit the garage, then build your own HQ. Enlist free.`
    : "Every pilot gets a hangar. Build your own HQ. Enlist free.";
  const img = `/api/s6/hq-card?h=${encodeURIComponent(res ? res.view.handle : String(params.handle || "").slice(0, 80))}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: img, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [img] },
  };
}

export default async function PublicHqPage({ params }: { params: { handle: string } }) {
  const res = await resolvePublicHq(params.handle);

  if (!res) {
    // The themed 404 panel: dead air on this frequency.
    return (
      <PageShell>
        <header style={{ textAlign: "center", marginBottom: 26 }}>
          <Eyebrow>{DEFAULT_THEME.seasonName}</Eyebrow>
        </header>
        <Panel style={{ textAlign: "center", padding: "40px 24px", maxWidth: 560, margin: "0 auto" }}>
          <div style={{ fontFamily: UI.mono, fontSize: 11, letterSpacing: "0.24em", color: UI.faint, textTransform: "uppercase", marginBottom: 10 }}>
            Signal lost
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: UI.text, marginBottom: 10 }} data-testid="hq-not-found">
            No pilot answers at this address.
          </div>
          <p style={{ fontSize: 13.5, color: UI.muted, lineHeight: 1.6, margin: "0 0 18px" }}>
            The callsign may have changed, or this bunker was never dug. Check the War Board for the roster.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/s6/board"
              style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${UI.steel}55`, background: `${UI.steel}1f`, color: UI.text, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
            >
              The War Board
            </Link>
            <Link
              href="/s6"
              style={{ padding: "10px 18px", borderRadius: 8, border: `1px solid ${UI.ember}66`, background: `${UI.ember}1f`, color: UI.text, fontSize: 13, fontWeight: 700, textDecoration: "none" }}
            >
              Build your own HQ. Enlist free.
            </Link>
          </div>
        </Panel>
      </PageShell>
    );
  }

  const trophies = await getTrophies(res.wallet);

  return (
    <PageShell>
      <header style={{ textAlign: "center", marginBottom: 24 }}>
        <Eyebrow>{DEFAULT_THEME.seasonName} · Public garage</Eyebrow>
        <h1
          style={{ fontSize: "clamp(26px, 5.5vw, 40px)", fontWeight: 800, margin: "0 0 8px", color: UI.text }}
          data-testid="public-callsign"
        >
          {res.view.callsign}
        </h1>
        <span
          data-testid="public-rank"
          style={{
            display: "inline-block",
            fontFamily: UI.mono,
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: UI.steel,
            border: `1px solid ${UI.steel}55`,
            borderRadius: 999,
            padding: "4px 12px",
          }}
        >
          {res.view.rank}
        </span>
      </header>
      <PublicGarageView view={res.view} trophies={trophies} />
    </PageShell>
  );
}
