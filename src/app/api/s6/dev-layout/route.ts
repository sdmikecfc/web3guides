/**
 * DEV-ONLY: the front editor's SAVE button. POST { items, milestones } and
 * this rewrites src/app/s6/front/setdressing.ts on disk, so Mike's editor
 * pass lands without a copy-paste step. Hard 403 outside development -
 * production filesystems are read-only anyway, and this must never become a
 * remote write hole.
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

  const file = `/**
 * THE FRONT set dressing, AUTHORED BY MIKE in /s6/front/editor (the seed
 * never designs; the editor's SAVE writes this file via /api/s6/dev-layout).
 * Items render y-sorted into the world; \`bld-*\` keys are CLICKABLE and
 * navigate to their route. Coordinates are sim px (2600x1080).
 */
export interface LayoutItem {
  key: string; // art key under /s6-art/front/set/<key>.png
  x: number;
  y: number; // ground contact
  s: number; // scale, 1 = 100% of the baked sprite
  flip?: boolean;
}

export const BUILDING_ROUTES: Record<string, string> = {
  "bld-base": "/s6/hq",
  "bld-board": "/s6/board",
  "bld-ironjaw": "/s6/games/ironjaw",
  "bld-strain": "/s6/games/strain",
  "bld-stopclock": "/s6/games/stopclock",
  "bld-arcade": "/s6/play",
  "bld-challenges": "/s6/board",
  "bld-kitchen": "", // SOON - not clickable yet
  "bld-riot": "/s6/games/riot",
};

/** Where the 10 domain mainframes STAND (index = sort_order rank). Mike
 * authors these in the editor; the ladder math sorts by x, so keep the
 * west-to-east reading order when moving them. */
export const MILESTONE_SPOTS: Array<{ x: number; y: number }> = [
${spotRows}
];

export const FRONT_LAYOUT: LayoutItem[] = [
${rows}
];
`;

  const target = path.join(process.cwd(), "src", "app", "s6", "front", "setdressing.ts");
  await fs.writeFile(target, file, "utf8");
  return NextResponse.json({ ok: true, items: items.length });
}
