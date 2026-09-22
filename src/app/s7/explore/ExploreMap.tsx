"use client";
/**
 * THE MUSTER — every commander's camp on the same world.
 *
 * The SAME engine and the SAME board as /s7/world, with a second camera and a
 * different cast: instead of nav objects and game places, it draws the other
 * commanders, each standing at the stronghold they hold most of. That reuse is
 * the point — "explore other players" cost a descriptor filter and a placement
 * function, not another map.
 *
 * PLACEMENT is the phyllotaxis spiral lifted from the S3 sector map
 * (src/app/stars/map/SectorMap.tsx:403-408): golden-angle steps with a radius
 * growing as sqrt(i/n). Two properties earn it: no two camps ever land on the
 * same coordinate, and the ring GROWS with the crowd instead of overflowing.
 * S3 adopted it precisely because S2's naive layout buried ships in an
 * unclickable pile, so this is a solved problem being re-used, not re-solved.
 *
 * Client-safe: RosterRow arrives as plain JSON and is imported as a TYPE only.
 * lib/s7/roster.ts is server-only, so importing a value from it here would pass
 * tsc and break next build.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { S7_WORLD } from "@/lib/s7/world";
import { targetArtFor, targetPos, type Vec2 } from "@/lib/world/types";
import type { RosterRow } from "@/lib/s7/roster";
import { STAT_LABELS } from "@/lib/s7/games";
import { WorldViewport, type PlaceChip } from "@/app/_world/WorldViewport";
import { WorldSprite } from "@/app/_world/WorldSprite";
import { MapPopup } from "@/app/_world/MapPopup";

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Where commanders with no holding gather. Near the painted muster field. */
const STAGING: Vec2 = { x: 0.90, y: 0.80 };

export type ExploreMapProps = {
  bases: RosterRow[];
  /** domain -> its listing index, so a camp can find its stronghold's slot. */
  domainIndex: Record<string, number>;
  totalCommanders: number;
};

/**
 * Fan `n` camps around a centre. Golden-angle placement: each step turns by
 * ~137.5deg and steps out by sqrt, which is why sunflowers pack evenly and why
 * this never collides.
 */
function spiral(centre: Vec2, i: number, n: number): Vec2 {
  const radial = 0.46 + 0.54 * Math.sqrt((i + 0.5) / Math.max(1, n));
  const a = i * GOLDEN;
  // rx > ry because the world box is wide; a circular ring in normalized units
  // would read as a tall ellipse on screen.
  return {
    x: centre.x + Math.cos(a) * radial * 0.072,
    y: centre.y + Math.sin(a) * radial * 0.052,
  };
}

export function ExploreMap({ bases, domainIndex, totalCommanders }: ExploreMapProps) {
  const [open, setOpen] = useState<RosterRow | null>(null);

  /** Group by the stronghold each commander camps at, then fan each group. */
  const placed = useMemo(() => {
    const groups = new Map<string, RosterRow[]>();
    for (const b of bases) {
      const key = b.domain && domainIndex[b.domain] !== undefined ? b.domain : "__muster";
      const arr = groups.get(key);
      if (arr) arr.push(b);
      else groups.set(key, [b]);
    }
    const out: Array<{ row: RosterRow; pos: Vec2 }> = [];
    // Array.from, not spread: the repo's tsconfig target predates
    // downlevelIteration, so [...map.entries()] is a compile error.
    for (const [key, arr] of Array.from(groups.entries())) {
      const centre =
        key === "__muster" ? STAGING : targetPos(S7_WORLD, domainIndex[key]);
      arr.forEach((row: RosterRow, i: number) =>
        out.push({ row, pos: spiral(centre, i, arr.length) }),
      );
    }
    return out;
  }, [bases, domainIndex]);

  const places: PlaceChip[] = useMemo(
    () =>
      placed.slice(0, 12).map(({ row, pos }) => ({
        key: row.handle || row.name,
        label: row.name,
        pos,
        accent: "#b8845c",
        onOpen: () => setOpen(row),
      })),
    [placed],
  );

  return (
    <>
      <WorldViewport
        config={S7_WORLD}
        initial={S7_WORLD.openAt}
        places={places}
        ariaLabel="Other adventurers on the front"
      >
        {(pz) => (
          <>
            {/* The strongholds stay on the board as landmarks, unclickable —
                this view is about the people standing at them. */}
            {S7_WORLD.targetSlots.map((p, i) => (
              <WorldSprite
                key={`slot-${i}`}
                pos={p}
                size={S7_WORLD.targetSize * 0.82}
                art={`${S7_WORLD.artRoot}/${targetArtFor(S7_WORLD, i).intact}.webp`}
                glyph="keep"
                accent="#6f7d8c"
                label=""
                tier={3}
                dimmed
                ariaLabel=""
                onOpen={() => {}}
              />
            ))}

            {placed.map(({ row, pos }) => (
              <WorldSprite
                key={row.handle || `${row.name}-${row.rank}`}
                pos={pos}
                size={0.030}
                // Hull markers are a later art drop; the glyph carries it now.
                art={null}
                glyph="camp"
                accent="#e0b45c"
                label={row.name}
                tier={2}
                ariaLabel={`${row.name}, rank ${row.rank}. Opens their record.`}
                onFocus={() => pz.flyTo(pos.x, pos.y)}
                onOpen={() => {
                  if (pz.draggingRef.current) return;
                  setOpen(row);
                }}
              />
            ))}
          </>
        )}
      </WorldViewport>

      {open ? (
        <MapPopup
          title={open.name}
          ariaLabel="adventurer record"
          accent="#e0b45c"
          onClose={() => setOpen(null)}
          headerRight={<span className="wm-chip" style={{ color: "#e0b45c", borderColor: "#e0b45c" }}>#{open.rank}</span>}
        >
          <p className="wm-lead">
            {/* The class they fight as, never the legacy tank name. Class ids
                are one lowercase word whose capitalization is the label (the
                same rule api/s7/hq-card leans on); no class picked yet = the
                rank stands alone. */}
            {open.cls
              ? `${open.rankName} · ${open.cls.charAt(0).toUpperCase()}${open.cls.slice(1)}`
              : open.rankName}
          </p>
          <dl className="wm-facts">
            <div><dt>Valor</dt><dd>{open.points.toLocaleString("en-US")}</dd></div>
            <div><dt>Camped at</dt><dd>{open.domain ?? "Muster field"}</dd></div>
          </dl>

          <section className="wm-earn">
            <h3>Upgrades</h3>
            <ul className="wm-bars">
              {(
                [
                  ["armor", open.stats.armor],
                  ["engine", open.stats.engine],
                  ["smoke", open.stats.smoke],
                  ["caliber", open.stats.caliber],
                  ["optics", open.stats.optics],
                ] as const
              ).map(([key, lvl]) => (
                <li key={key}>
                  <span className="wm-bar-name">
                    {STAT_LABELS[key === "armor" ? "botox" : key === "engine" ? "drugs" : key === "smoke" ? "ozempic" : key === "caliber" ? "aura" : "optics"].name}
                  </span>
                  {/* Four, not five: STAT_MAX is 4 for every stat drawn here
                      (caliber is a 30-step stat and is not in this list). */}
                  <span className="wm-pips" aria-label={`${lvl} of 4`}>
                    {[1, 2, 3, 4].map((n) => (
                      <i key={n} className={n <= lvl ? "on" : undefined} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {open.handle ? (
            <Link className="wm-cta" href={`/s7/hq/${open.handle}`}>
              See their camp
            </Link>
          ) : null}
        </MapPopup>
      ) : null}

      <div className="wm-topbar">
        <p className="wm-poolline">
          {placed.length} of {totalCommanders} adventurers on the field
        </p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: EXPLORE_CSS }} />
    </>
  );
}

const EXPLORE_CSS = `
.wm-bars{list-style:none;margin:0;padding:0;display:grid;gap:7px;}
.wm-bars li{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.wm-bar-name{
  font-family:'Space Mono',ui-monospace,monospace;
  font-size:11.5px;letter-spacing:0.04em;color:#aab4bd;
}
.wm-pips{display:flex;gap:4px;}
.wm-pips i{
  width:16px;height:7px;border-radius:2px;
  background:#242c35;display:block;
}
.wm-pips i.on{background:#e0b45c;}
`;
