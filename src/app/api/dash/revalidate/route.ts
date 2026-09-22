/**
 * PURGE THE AMBASSADOR DASHBOARD CACHES ON DEMAND.
 *
 * The /dash reads sit behind a 24h unstable_cache under a 24h ISR page — both
 * stale-while-revalidate, so without a purge a fresh snapshot could take up to
 * ~48h to surface (the s6 stale-under-stale lesson, compounded at this cadence).
 * The bot POSTs here after every successful nightly run, so the board is
 * truthful within seconds of the snapshot landing.
 *
 *   curl -X POST https://web3guides.com/api/dash/revalidate \
 *     -H "content-type: application/json" -d '{"key":"<AMB_REVALIDATE_KEY>"}'
 *
 * Key lives in AMB_REVALIDATE_KEY on Vercel. Unset = refuse everything —
 * purging must never default open.
 */
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { AMB_CACHE_TAG } from "@/lib/dash/data";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.AMB_REVALIDATE_KEY;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not-configured" }, { status: 503 });
  }

  let key: unknown = null;
  try {
    const body = (await req.json()) as { key?: unknown };
    key = body?.key ?? null;
  } catch {
    key = null;
  }
  const headerKey = req.headers.get("x-amb-revalidate-key");
  const given = typeof key === "string" && key ? key : headerKey;

  if (given !== secret) {
    return NextResponse.json({ ok: false, error: "bad-key" }, { status: 401 });
  }

  // Tag clears the data caches; the layout-scoped path purge clears the ISR
  // entries for the board AND every profile under it.
  revalidateTag(AMB_CACHE_TAG);
  revalidatePath("/dash", "layout");

  return NextResponse.json({ ok: true, purged: [AMB_CACHE_TAG, "/dash"], at: new Date().toISOString() });
}
