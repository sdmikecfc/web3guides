import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const prefix = "/api/bots/personal-preview/";

/** Development-only bridge to the reviewed art study. Never serves arbitrary paths.
 * Production packaging is a separate release gate; a public flag cannot enable it.
 */
export async function GET(_request: Request, context: { params: { file: string[] } }) {
  if (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_BOTS_PERSONAL_PREVIEW !== "1") return new NextResponse(null, { status: 404 });
  const pieces = context.params.file;
  if (!pieces.length || pieces.some(p => !/^[a-zA-Z0-9_.-]+$/.test(p) || p === "." || p === "..")) return new NextResponse(null, { status: 404 });
  const name = pieces.join("/");
  const root = path.resolve(process.cwd(), ".bots-preview/tank-bible-rebuild");
  let relative: string;
  if (name === "index.html" || name === "styles.css") relative = "viewer/" + name;
  else if (/^(viewer|chunk-[a-zA-Z0-9_-]+)\.js$/.test(name)) relative = "viewer/dist/" + name;
  else if (/^assets\/(catalogue-2|weapon-kits-1|arenas-1)\/[a-zA-Z0-9_./-]+\.(glb|json|png|mp4)$/.test(name)) relative = name;
  else if (/^assets\/[a-zA-Z0-9_-]+\.(glb|mp4|jpg|png|webp)$/.test(name)) relative = name;
  else return new NextResponse(null, { status: 404 });
  try {
    const [base, file] = await Promise.all([realpath(root), realpath(path.join(root, relative))]);
    if (!file.startsWith(base + path.sep)) return new NextResponse(null, { status: 404 });
    const bytes = await readFile(file), extension = path.extname(file);
    const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4" };
    let output: BodyInit = bytes;
    if ([".html", ".js", ".css", ".json"].includes(extension)) {
      output = bytes.toString("utf8").replaceAll("/assets/", prefix + "assets/").replaceAll('"/viewer.js"', '"' + prefix + 'viewer.js"').replaceAll('"/styles.css"', '"' + prefix + 'styles.css"').replaceAll('/?view=', prefix + 'index.html?embedded=1&view=');
      if (extension === ".js") output = output.replace(/(__webpack_require__\.p\s*=\s*)"\/"/g, '$1"' + prefix + '"');
    }
    return new NextResponse(output, { headers: { "Content-Type": mime[extension] ?? "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new NextResponse("The local practice assets are not built. Build the personal-kits preview first.", { status: 503 });
  }
}
