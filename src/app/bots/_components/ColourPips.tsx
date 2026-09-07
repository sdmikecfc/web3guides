"use client";

/**
 * THE COLOURS A PLAYER IS COLLECTING, SHOWN AS PROGRESS.
 *
 * Mike, 2026-09-05: a player has to "feel ownership over how cute it is".
 * A robot's colours are the loudest choice a player makes and the game
 * reported them as arithmetic: "Same colour: 3 of 4". A number is not a
 * collection. This is the same fact drawn as the thing itself, four
 * swatches in body-part order, so a player can see at a glance that three
 * of their robot's four parts are pink and the arms are letting the side
 * down.
 *
 *  - the swatch of a part that matches is filled and ringed;
 *  - the swatch of the odd one out is filled with ITS OWN colour and dimmed,
 *    never greyed away, because that part is not broken, it just does not
 *    match;
 *  - an empty socket is a dashed outline, the same shape the Build screen
 *    already uses for a socket with nothing in it.
 *
 * The line underneath NAMES the odd part, so the answer to "what do I buy"
 * is on the same row as the question. It appears only at three of four,
 * where a player is one card away and the sentence is worth its space.
 *
 * A colour word is always printed beside its swatch (the shipped law in
 * strings.ts paintName), so a reader who cannot name a colour still sees it.
 */

import { BODY_SLOTS, type CardSlot, type Socket } from "@/lib/bots/fixtures";
import { STRINGS, fill } from "@/lib/bots/strings";
import { M, PAINTS, R, type PaintId } from "../_ui/tokens";

import { EQUIPMENT_LABEL } from "@/lib/bots/equipment";
const t = STRINGS.en;
const slotLabel = (s: CardSlot | Socket) => EQUIPMENT_LABEL[s as Socket] ?? t.ui.card[s as CardSlot];

export interface SlotColour {
  slot: CardSlot | Socket;
  color: PaintId | null;
}

/** The colour the most body parts share, and how many share it. */
export function leadColour(colors: readonly SlotColour[]): { color: PaintId | null; count: number } {
  const tally = new Map<PaintId, number>();
  for (const c of colors) if (c.color) tally.set(c.color, (tally.get(c.color) ?? 0) + 1);
  let color: PaintId | null = null;
  let count = 0;
  tally.forEach((n, k) => {
    if (n > count) {
      color = k;
      count = n;
    }
  });
  return { color, count };
}

export function ColourPips({
  colors,
  size = 18,
  /** the naming line under the swatches. Off where there is no room for it. */
  line = true,
}: {
  colors: readonly SlotColour[];
  size?: number;
  line?: boolean;
}) {
  const lead = leadColour(colors);
  const odd = lead.count === colors.length - 1 ? colors.find((c) => c.color !== lead.color) ?? null : null;
  const all = lead.count === colors.length && lead.color !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }} role="img" aria-label={t.set.pipsAria}>
        {colors.map((c) => {
          const matches = c.color !== null && c.color === lead.color;
          return (
            <span
              key={c.slot}
              title={fill(t.set.slotColor, {
                slot: slotLabel(c.slot),
                color: c.color ? t.paintName[c.color] : t.set.empty,
              })}
              style={{
                width: size,
                height: size,
                borderRadius: R.pill,
                flex: "0 0 auto",
                background: c.color ? PAINTS[c.color] : "transparent",
                border: c.color ? "none" : `1px dashed ${M.border}`,
                boxShadow: matches ? `0 0 0 2px ${M.surface}, 0 0 0 3px ${M.good}` : "none",
                opacity: c.color && !matches ? 0.45 : 1,
              }}
            />
          );
        })}
      </div>
      {line && lead.color && (all || odd) ? (
        <div style={{ fontSize: 11.5, lineHeight: 1.45, color: all ? M.good : M.lore }}>
          {all
            ? fill(t.set.allMatch, { color: t.paintName[lead.color] })
            : fill(t.set.oneToGo, {
                color: t.paintName[lead.color],
                slot: slotLabel((odd as SlotColour).slot).toLowerCase(),
              })}
        </div>
      ) : null}
    </div>
  );
}
