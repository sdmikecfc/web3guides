import { NextRequest, NextResponse } from "next/server";

/** Public practice only. The existing game, accounts and rewards keep their own routes. */
export function GET(request: NextRequest) {
  const target = request.nextUrl.clone();
  target.pathname = "/bots-playtest/index.html";
  if (!target.searchParams.has("view")) target.searchParams.set("view", "practice");
  return NextResponse.redirect(target);
}
