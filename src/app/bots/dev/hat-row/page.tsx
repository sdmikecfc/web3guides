"use client";

/**
 * BATTLE BOTS DEV: the hat row on the look panel, in every state it has.
 *
 * WHY THIS PAGE EXISTS. A hat drops from beating the biggest robot, so the
 * only way to see the row on a real screen is to win one, and nobody can win
 * one until doma-reporter/sql/battle_bots_008_look.sql and 009 have been run.
 * That would leave the one NEW control in this lane shipped unlooked at, and
 * every defect worth finding in this game so far was found by looking
 * (a plate that read backwards in a mirrored ring, a whole desktop rail
 * rendering on a phone). So this page hands the SHIPPED component a
 * fabricated LookEarned and draws it.
 *
 * IT PROVES NOTHING ABOUT THE SERVER, on purpose. Every value here is made
 * up in the browser and no route is called, so nothing on this page can be
 * mistaken for a hat somebody won. What it shows is the drawing: the row's
 * three states, the tile colours, the tap targets and the sentence.
 *
 * Reached by URL only, nothing links here, and the guard is the same idiom
 * as dev/replay-check: notFound in production with one door, ?dev=1.
 */

import { notFound } from "next/navigation";
import { useState } from "react";
import { LookPicker, type LookChange } from "@/app/bots/_components/LookPicker";
import { NOTHING_EARNED, type BotLook, type HatWon, type LookEarned } from "@/lib/bots/look";
import { FONT_BODY, M, S, type PaintId } from "@/app/bots/_ui/tokens";

const COLOURS: PaintId[] = ["mint", "coral", "sky", "butter"];

/** the hats a wallet could plausibly have won: two of one kind in two
 *  colours, so the row has to be able to tell them apart. */
const WON: HatWon[] = [
  { kind: "bow", color: "coral" },
  { kind: "bow", color: "sky" },
  { kind: "propeller", color: "butter" },
  { kind: "spring", color: "moss" },
  // the two worst cases for the TILE, deliberately. The panel is nearly
  // black, so a black hat vanishes on it; the tile's chip is light clay, so a
  // white hat vanishes on that. Black can no longer DROP (look.ts HAT_PAINTS:
  // it disappears over a robot's head on every screen the game has), but a
  // hand granted row could still hold one and the row has to draw it.
  { kind: "bell", color: "ink" },
  { kind: "ears", color: "cream" },
  // a hat with no colour of its own: a row from before 009 was run
  { kind: "flag", color: null },
];

function earnedWith(hats: HatWon[]): LookEarned {
  return { ...NOTHING_EARNED, wins: 12, level: 6, repairs: 2, paints: COLOURS, plateNumber: 41, hats };
}

const START: BotLook = {
  face: "happy",
  sticker: "star",
  spot: "chest",
  stickerPaint: "coral",
  hat: WON[0],
  plateNumber: 41,
};

function Panel({ title, hats, firstHat }: { title: string; hats: HatWon[]; firstHat?: boolean }) {
  const [look, setLook] = useState<BotLook>({ ...START, hat: hats.length ? hats[0] : null });
  const onChange = (c: LookChange) =>
    setLook((l) => ({
      ...l,
      face: c.face ?? l.face,
      sticker: c.sticker !== undefined ? c.sticker : l.sticker,
      spot: c.spot ?? l.spot,
      stickerPaint: c.stickerPaint !== undefined ? c.stickerPaint : l.stickerPaint,
      hat: c.hat !== undefined ? c.hat : l.hat,
    }));
  return (
    <div style={{ flex: "1 1 320px", minWidth: 300, maxWidth: 420 }}>
      <p style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 700, color: M.muted, margin: "0 0 8px" }}>{title}</p>
      <div style={{ border: `1px solid ${M.border}`, borderRadius: 12, padding: S.md, background: M.surface }}>
        <LookPicker
          look={look}
          earned={earnedWith(hats)}
          colours={COLOURS}
          firstHat={firstHat}
          onChange={onChange}
          onPickForMe={() => undefined}
          onSurprise={() => undefined}
          onPlain={() => undefined}
        />
      </div>
      <pre style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: M.lore, whiteSpace: "pre-wrap" }}>
        {JSON.stringify(look.hat)}
      </pre>
    </div>
  );
}

export default function HatRowDev({ searchParams }: { searchParams?: Record<string, string | string[] | undefined> }) {
  // the same one line dev/replay-check uses, not a second idea of the guard
  if (process.env.NODE_ENV === "production" && searchParams?.dev !== "1") notFound();
  return (
    <main style={{ background: M.ground, color: M.text, minHeight: "100vh", padding: S.lg }}>
      <h1 style={{ fontFamily: FONT_BODY, fontSize: 16, margin: "0 0 4px" }}>the hat row, every state</h1>
      <p style={{ fontFamily: FONT_BODY, fontSize: 12, color: M.lore, margin: "0 0 20px", maxWidth: 720 }}>
        Made up in the browser. No route is called and nothing here was won.
      </p>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Panel title="7 hats won, the first time" hats={WON} firstHat />
        <Panel title="7 hats won, seen before" hats={WON} />
        <Panel title="no hat won: there is no row" hats={[]} />
      </div>
    </main>
  );
}
