import { NextResponse } from "next/server";
import { truckEventStatus } from "@/lib/chef/authority-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Read-only discovery. Authenticated entry/play uses /api/chef/command and its
 * command-ID/CAS transaction; no claim or token-transfer endpoint exists. */
export function GET() { return NextResponse.json({ ok: true, ...truckEventStatus() }, { headers: { "Cache-Control": "no-store" } }); }
