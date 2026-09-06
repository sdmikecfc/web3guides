import { NextResponse } from "next/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DEV-ONLY canvas capture sink (the established hidden-pane verification
 * method: a hidden browser pane cannot screenshot, so the page POSTs its
 * canvas.toDataURL here instead — never transcribe base64 through chat).
 * Returns 404 in production builds; writes to <repo>/.dev-captures/.
 */

export async function POST(req: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  try {
    const { name, dataUrl } = (await req.json()) as { name?: string; dataUrl?: string };
    if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) {
      return NextResponse.json({ error: "bad dataUrl" }, { status: 400 });
    }
    const safe = String(name || "capture").replace(/[^a-z0-9_-]/gi, "").slice(0, 60) || "capture";
    const dir = join(process.cwd(), ".dev-captures");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${safe}.png`);
    writeFileSync(file, Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64"));
    return NextResponse.json({ ok: true, file });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
