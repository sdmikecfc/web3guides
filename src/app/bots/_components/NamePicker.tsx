"use client";

/**
 * THE NAME PICKER: the one place a robot gets its name.
 *
 * Mike, 2026-09-05, asking the harder half of the loveable question: can a
 * player "feel ownership over how cute it is". Ownership is made of choices
 * that show and a name they picked, so the naming has to be the easiest,
 * warmest thing on the screen and it has to be the SAME thing everywhere.
 *
 * TWO LAWS, both learned off the shipped Build screen:
 *
 *  1. NEVER A TEXT BOX. The old sheet asked for the number through an
 *     <input inputMode="numeric">, which is a small piece of paperwork: a
 *     keyboard covers the robot on a phone, and a player has to invent a
 *     number before they can leave. The number is CHOSEN here, from chips
 *     that pick one for them, so naming a robot costs taps and never
 *     thought.
 *  2. ONE TAP CHANGES THE WHOLE NAME. "Pick for me" is the first thing in
 *     the picker and the widest target in it, because the fastest way to
 *     make a name yours is to reject three of them first.
 *
 * The word tables are the shipped ones (src/lib/bots/naming.ts, through
 * fixtures.ts), so nothing here can invent a word the naming check has not
 * seen. Every target is 44 px. The component owns no storage and no clock:
 * it takes a name and hands back a name, so the Build screen keeps saving
 * through garage-state and the first meeting keeps saving through its own
 * card.
 */

import { FIRST_WORDS, SECOND_WORDS, nameText, type BotName } from "@/lib/bots/fixtures";
import { STRINGS } from "@/lib/bots/strings";
import { Button, ChipTab } from "../_ui/primitives";
import { FONT_DISPLAY, M } from "../_ui/tokens";

const t = STRINGS.en;

/** Math.random() is fine here: the tables are fixed, this only picks. */
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollNumber(not: number | null): number {
  for (let i = 0; i < 8; i++) {
    const n = 1 + Math.floor(Math.random() * 99);
    if (n !== not) return n;
  }
  return not === 99 ? 1 : (not ?? 0) + 1;
}

/** A whole new name in one tap: both words and a number about half the time. */
export function shuffledName(): BotName {
  return {
    first: pick(FIRST_WORDS),
    second: pick(SECOND_WORDS),
    num: Math.random() < 0.5 ? null : rollNumber(null),
  };
}

export function NamePicker({
  name,
  onChange,
  /** the big plate over the words. The first meeting draws its own, larger. */
  showPlate = true,
}: {
  name: BotName;
  onChange: (n: BotName) => void;
  showPlate?: boolean;
}) {
  const columns = [
    { label: t.ui.firstWord, words: FIRST_WORDS, key: "first" as const },
    { label: t.ui.secondWord, words: SECOND_WORDS, key: "second" as const },
  ];

  return (
    <div>
      {showPlate ? (
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, fontWeight: 700, margin: "4px 0 12px" }}>
          {nameText(name)}
        </div>
      ) : null}

      {/* the widest, friendliest target in the picker, and it comes first */}
      <Button full variant="primary" onClick={() => onChange(shuffledName())} style={{ marginBottom: 14 }}>
        {t.build.shuffle}
      </Button>

      {/* the number, chosen and never typed. It sits ABOVE the sixty-four
          word chips because it is part of the name: below them it was a
          long scroll away, which is how a small choice turns into a chore. */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12.5, color: M.muted, marginBottom: 8 }}>{t.ui.number}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ChipTab active={name.num == null} onClick={() => onChange({ ...name, num: null })}>
            {t.ui.noNumber}
          </ChipTab>
          <ChipTab active={name.num != null} onClick={() => onChange({ ...name, num: rollNumber(name.num) })}>
            {name.num == null ? t.ui.numberAdd : t.ui.numberAnother}
          </ChipTab>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {columns.map((col) => (
          <div key={col.key}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 11, letterSpacing: "0.32em", color: M.muted, marginBottom: 8 }}>
              {col.label}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {col.words.map((w) => (
                <ChipTab
                  key={w}
                  active={name[col.key] === w}
                  onClick={() => onChange({ ...name, [col.key]: w })}
                >
                  {w}
                </ChipTab>
              ))}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
