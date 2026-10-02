"use client";

/**
 * WHAT LEVEL THIS ROBOT IS ON, AND WHAT GOING UP OPENS.
 *
 * WHY IT IS HERE. A robot's level and the fight total behind it have been
 * stored on every row since the game opened and no screen ever drew either
 * one, while the whole part ladder hangs off the level: the parts screen
 * refuses a 3 star part until one of the wallet's robots is level 5, and a
 * 4 star part until one is level 10. A player could read "You need level 5"
 * on a card in the shop and have nowhere in the game to find out what level
 * they were, or what makes a level go up. This is that answer, in the two
 * calm places a robot's own numbers already live: its page in the garage,
 * and the readout beside it on the build screen.
 *
 * IT DECIDES NOTHING. Every word and the length of the bar come from
 * src/lib/bots/levels.ts, which imports the ladder from the engine and the
 * two part gates from the shipped table. This file only draws them.
 *
 * NOTHING SITS FULL FOR EVER. Level 10 is the last one the ladder has, so at
 * the top the bar is gone and a sentence takes its place.
 */

import { levelNote } from "@/lib/bots/levels";
import { STRINGS, fill } from "@/lib/bots/strings";
import { FONT_BODY, FONT_DISPLAY, FONT_MONO, FONT_TOY, M, R } from "../_ui/tokens";

const t = STRINGS.en;

export function LevelBlock({
  level,
  /** the fight total stored beside the level; leave it out and no bar is
   *  drawn, which is what a garage with no server row behind it deserves */
  xp,
  /** a boxed version for a stack of its own, on the phone */
  boxed = false,
}: {
  level: number;
  xp?: number | null;
  boxed?: boolean;
}) {
  const n = levelNote(level, xp);
  return (
    <div
      style={
        boxed
          ? { padding: "10px 12px", borderRadius: R.inner, border: `1px solid ${M.border}`, background: M.surface }
          : undefined
      }
    >
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.32em", color: M.muted }}>{t.level.title}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
        <span style={{ fontFamily: FONT_TOY, fontSize: 18, fontWeight: 800, color: M.text }}>{n.now}</span>
        {n.next ? <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: M.muted }}>{n.next}</span> : null}
      </div>
      {n.fill == null ? null : (
        <div
          role="img"
          aria-label={fill(t.level.barAria, { n: n.level })}
          style={{ height: 8, borderRadius: R.pill, background: M.surface2, border: `1px solid ${M.border}`, overflow: "hidden", marginTop: 8 }}
        >
          <span
            aria-hidden
            style={{
              display: "block",
              height: "100%",
              // a robot that has just gone up sits at 0: a hairline of colour
              // says the bar is a bar, where a zero width one reads as broken
              width: `${Math.max(2, Math.round(n.fill * 100))}%`,
              background: M.accent,
            }}
          />
        </div>
      )}
      <p style={{ margin: "8px 0 0", fontFamily: FONT_BODY, fontSize: 12.5, color: M.muted, lineHeight: 1.45 }}>{n.note}</p>
      <p style={{ margin: "4px 0 0", fontFamily: FONT_BODY, fontSize: 12, color: M.lore, lineHeight: 1.45 }}>{n.unlock}</p>
    </div>
  );
}
