/**
 * PURGE THE SEASON'S CACHES ON DEMAND.
 *
 * Why this exists: every S7 read sits behind a 60s `unstable_cache` entry, and
 * the front door (/s7) is an ISR page with its own 60s window on top. Both are
 * stale-while-revalidate, so a database change the operator makes by hand — the
 * ten-domain swap, a theme edit, a bounty correction — can keep serving the old
 * board for minutes, per region, until traffic happens to walk both windows
 * forward. On 2026-08-01 that cost an evening: the SQL was correct and the map
 * kept showing the previous slate, which is indistinguishable from a failed
 * deploy.
 *
 * So: SQL day, then one POST, and the board is truthful in seconds.
 *
 *   curl -X POST https://tanks.web3guides.com/api/s7/revalidate \
 *     -H "content-type: application/json" \
 *     -d '{"key":"<S7_REVALIDATE_KEY>"}'
 *
 * The key lives in the S7_REVALIDATE_KEY env var on Vercel. Without it set,
 * this route refuses every request rather than defaulting to open: purging is
 * cheap for us and a free way for a stranger to make the site re-read the
 * database on every request.
 */
import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { S7_CACHE_TAG } from "@/lib/s7/data";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.S7_REVALIDATE_KEY;
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
  // Also accept a header, so it can be fired from a deploy script without a body.
  const headerKey = req.headers.get("x-s7-revalidate-key");
  const given = typeof key === "string" && key ? key : headerKey;

  if (given !== secret) {
    return NextResponse.json({ ok: false, error: "bad-key" }, { status: 401 });
  }

  // The tag clears the data caches (snapshot, sprint state, theme); the path
  // clears the ISR entry for the one page that renders statically. Everything
  // else in /s7 is dynamic and re-reads as soon as the data cache is empty.
  revalidateTag(S7_CACHE_TAG);
  revalidatePath("/s7");

  return NextResponse.json({ ok: true, purged: [S7_CACHE_TAG, "/s7"], at: new Date().toISOString() });
}
