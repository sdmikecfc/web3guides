/**
 * STARFALL — sector map data.
 *
 *   GET /api/stars/map
 *
 * The same snapshot the /stars/map page renders server-side, exposed for any
 * other surface (bot embeds, status checks). Public-safe: per-star bond state +
 * crew sizes only, never a wallet or a dollar holding. Service-role read via
 * getSectorSnapshot (RLS-bypassing; the s3_* tables are anon-locked).
 */
import { NextResponse } from "next/server";
import { getSectorSnapshot } from "@/lib/stars/map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  try {
    const sector = await getSectorSnapshot();
    return NextResponse.json(sector, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sector read failed" },
      { status: 500 },
    );
  }
}
