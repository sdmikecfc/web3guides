/**
 * DEV-ONLY: serve raw asset-pack files (FBX/GLB) out of art-src/ to the bake
 * rig at /dev/bake.
 *
 * art-src/ sits OUTSIDE public/ on purpose — multi-megabyte CC0 source packs
 * must never ship to players; only baked WebP strips do. But the bake rig runs
 * in the BROWSER (it needs WebGL), so something has to hand it the models.
 * This route is that seam, and it is closed everywhere that matters:
 *
 *   - production: hard 404 before touching the filesystem. The route exists
 *     in the build but is inert.
 *   - traversal: the resolved path must stay inside art-src/ or 404. A "..%2f"
 *     in the URL cannot escape the pack folder.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const ROOT = path.resolve(process.cwd(), "art-src");

const TYPES: Record<string, string> = {
  ".fbx": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".obj": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

export async function GET(
  _req: Request,
  { params }: { params: { p: string[] } },
) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not-available" }, { status: 404 });
  }
  const rel = (params.p ?? []).join("/");
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep)) {
    return NextResponse.json({ error: "bad-path" }, { status: 404 });
  }
  try {
    const buf = await fs.readFile(abs);
    const type = TYPES[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
    return new NextResponse(buf, { headers: { "content-type": type } });
  } catch {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
}
