/**
 * DEV-ONLY: the front editor's SAVE button. POST { items, milestones } and
 * this rewrites src/app/s7/front/setdressing.ts on disk, so Mike's editor
 * pass lands without a copy-paste step. Hard 403 outside development -
 * production filesystems are read-only anyway, and this must never become a
 * remote write hole.
 *
 * SURGICAL REPLACE, NOT A TEMPLATE (2026-08-30). The first version of this
 * route regenerated the whole file from a string baked in here, and that
 * string had already drifted: its BUILDING_ROUTES still pointed at the dead
 * S6 game paths (/s7/games/ironjaw, strain, stopclock, riot), so one SAVE
 * would have silently 404ed all four game buildings on the live map and
 * thrown away the file's law comments. Now only the two array bodies the
 * editor actually owns (MILESTONE_SPOTS, FRONT_LAYOUT) are replaced in the
 * file as it exists on disk; everything else - BUILDING_ROUTES, the header,
 * the keep-stand clamp laws - passes through untouched.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

interface Item {
  key: string;
  x: number;
  y: number;
  s: number;
  flip?: boolean;
}

/** Replace the body of `export const <name>...= [` ... `];` in src, keeping
 * everything outside the brackets byte-identical. Returns null when the
 * anchor is not found (caller refuses the save rather than guessing). */
function replaceArrayBody(src: string, name: string, body: string): string | null {
  const open = src.indexOf(`export const ${name}`);
  if (open < 0) return null;
  // anchor on "= [" - the declared TYPE can carry its own brackets
  // (`LayoutItem[]`), so the first "[" after the name is not the array
  const eq = src.indexOf("= [", open);
  if (eq < 0) return null;
  const bracket = eq + 2;
  const close = src.indexOf("\n];", bracket);
  if (close < 0) return null;
  return src.slice(0, bracket + 1) + "\n" + body + src.slice(close);
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, error: "dev only" }, { status: 403 });
  }
  let body: { items?: Item[]; milestones?: Array<{ x: number; y: number }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const items = (body.items ?? []).filter(
    (it) => typeof it?.key === "string" && /^[a-z0-9-]+$/.test(it.key) && Number.isFinite(it.x) && Number.isFinite(it.y),
  );
  const spots = (body.milestones ?? []).filter((m) => Number.isFinite(m?.x) && Number.isFinite(m?.y));
  if (spots.length !== 10) {
    return NextResponse.json({ ok: false, error: "need 10 milestone spots" }, { status: 400 });
  }

  const rows = items
    .map(
      (it) =>
        `  { key: "${it.key}", x: ${Math.round(it.x)}, y: ${Math.round(it.y)}, s: ${Number(it.s.toFixed(2))}${it.flip ? ", flip: true" : ""} },`,
    )
    .join("\n");
  const spotRows = spots.map((m) => `  { x: ${Math.round(m.x)}, y: ${Math.round(m.y)} },`).join("\n");

  const target = path.join(process.cwd(), "src", "app", "s7", "front", "setdressing.ts");
  const current = await fs.readFile(target, "utf8");
  const withSpots = replaceArrayBody(current, "MILESTONE_SPOTS", spotRows);
  const withBoth = withSpots ? replaceArrayBody(withSpots, "FRONT_LAYOUT", rows) : null;
  if (!withBoth) {
    return NextResponse.json(
      { ok: false, error: "setdressing.ts anchors not found - file shape changed, refusing to write" },
      { status: 500 },
    );
  }
  await fs.writeFile(target, withBoth, "utf8");
  return NextResponse.json({ ok: true, items: items.length });
}
