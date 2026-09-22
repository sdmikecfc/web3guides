/**
 * DEV-ONLY: the bake rig's save hatch. The browser renders top-down frames of
 * the CC0 models (see /dev/bake) and POSTs them here as PNG data URLs; they
 * land under art-src/baked/ for review. Nothing written here is served to
 * players — promotion to public/s5-art/ is a deliberate, reviewed copy step,
 * the same way the nano+rembg pipeline works.
 *
 * Same two locks as bake-src: inert in production, and the write path cannot
 * leave art-src/baked/.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const ROOT = path.resolve(process.cwd(), "art-src", "baked");

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not-available" }, { status: 404 });
  }
  let body: { file?: unknown; dataUrl?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  const file = typeof body.file === "string" ? body.file : "";
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const json = typeof (body as { json?: unknown }).json === "string" ? (body as { json: string }).json : "";
  const m = /^data:image\/(png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  // Either an image or a manifest: the strip baker records what it baked
  // (frames, cell px, clip names, team hexes) beside the strips, because a
  // folder of PNGs whose provenance lives in someone's memory is how the last
  // asset generation drifted.
  if (!file || (!m && !json)) {
    return NextResponse.json({ error: "bad-payload" }, { status: 400 });
  }
  if (json && !file.endsWith(".json")) {
    return NextResponse.json({ error: "json-needs-json-ext" }, { status: 400 });
  }
  const abs = path.resolve(ROOT, file);
  if (!abs.startsWith(ROOT + path.sep)) {
    return NextResponse.json({ error: "bad-path" }, { status: 400 });
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, m ? Buffer.from(m[2], "base64") : json);
  return NextResponse.json({ ok: true, wrote: path.relative(process.cwd(), abs) });
}
