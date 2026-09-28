import { NextRequest, NextResponse } from "next/server";

/** Old links now open the connected browser workshop, including garage and shop. */
export function GET(request: NextRequest) {
  const target = request.nextUrl.clone();
  target.pathname = "/bots/workshop";
  if (target.searchParams.get("view") === "practice") target.searchParams.set("view", "fight");
  return NextResponse.redirect(target);
}
