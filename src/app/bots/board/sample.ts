/** Development-only display rows, made from the same named robots as the garage.
 * Negative IDs are local picture keys. They are never sent to a public bot API. */
import type { BoardRow } from "./BoardTable";
import { FIXTURE_BUILDS, OWNED_PARTS, RECORDS, botTier, botTotal, engineBuild, nameText } from "@/lib/bots/fixtures";
import { equipmentPaints, splitLegacyEquipment } from "@/lib/bots/equipment";
import { NO_LOOK, NO_MARKS } from "@/lib/bots/look";

const garage = splitLegacyEquipment({
  parts: OWNED_PARTS.map(part => ({ ...part })),
  builds: Object.fromEntries(Object.entries(FIXTURE_BUILDS).map(([bay, build]) => [bay, { ...build, cards: { ...build.cards } }])),
});

export const SAMPLE_ROWS: BoardRow[] = Object.entries(garage.builds).map(([bayKey, build], index) => {
  const bay = Number(bayKey);
  const record = RECORDS[bay] ?? { wins: 0, losses: 0 };
  const paints = equipmentPaints(build, garage.parts);
  return {
    rank: index + 1,
    name: nameText(build.name),
    bots: [{
      id: -bay,
      tier: botTier(botTotal(build, garage.parts)),
      art: {
        build: engineBuild(build, garage.parts),
        // Demo decoration matches the garage. Sample records grant no marks.
        look: {
          paints,
          look: build.look ?? { ...NO_LOOK, plateNumber: build.name.num },
          marks: NO_MARKS,
          wins: 0,
        },
        paint: paints.torso ?? paints.head ?? "cream",
      },
    }],
    battlePoints: record.wins,
    wins: record.wins,
    losses: record.losses,
  };
});
