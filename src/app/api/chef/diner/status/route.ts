import { NextResponse } from "next/server";
import { dinerServerStatus } from "@/lib/chef/diner/server";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(dinerServerStatus(), { headers: { "Cache-Control": "no-store" } }); }
