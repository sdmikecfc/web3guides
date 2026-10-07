/**
 * LAUNCH WARS ARCADE, the guest claim that banks NOTHING.
 *
 *   POST /api/arcade/claim-guest  { t, scores }  -> { ok: false, already: true }
 *
 * The season shells call their claim-guest endpoint automatically the moment a
 * guest signs in, handing over the per-game bests parked in localStorage. In a
 * season that claim pays a few points. On an arcade BOARD it would be a forge:
 * a guest score never went through a nonce, a floor or a rate envelope, so
 * anyone could type a number into localStorage and take first place.
 *
 * So the arcade never banks a guest score, and the arcade copy says so ("Guest
 * scores are not saved"). `already: true` is the shells' own quiet path: it
 * clears the parked scores, shows no banner and never retries. The route exists
 * only so that call resolves instead of 404-ing on every mount.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ ok: false, already: true });
}
