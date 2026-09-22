"use client";

/**
 * MAKING IT YOURS: the face, the sticker, where the sticker goes, the colour
 * it wears, and the number on the plate.
 *
 * Mike, 2026-09-05: "Can someone look at it and think 'aww that's so cute, I
 * want to upgrade this guy' and feel ownership over how cute it is?" A robot
 * whose every choice was made for it by a shop is not a robot anybody owns.
 * This is the row where the player makes it theirs, and it takes nothing:
 * no coin, no sheet, no second step (the joint law).
 *
 * FIVE LAWS THIS FILE CARRIES.
 *
 *  1. NOTHING HERE IS FOR SALE (ADR-0141). A colour arrives with a part and
 *     stays for life, so the colour row offers only the colours the robot is
 *     ALREADY WEARING and there is no eighth swatch to buy. A face is free or
 *     it is earned. A hat drops from a fight and never appears on a shelf.
 *
 *  2. THE SERVER IS THE TRUTH. Every button is drawn from a LookEarned the
 *     caller derived from rows, and every press goes back out as a raw claim
 *     for the caller to put through look.ts parseLook. This file decides
 *     nothing about what may be worn: it asks faceAllowed() rather than
 *     restating the rule, so a face this row offers is a face the save route
 *     accepts, and one place changes when a rule changes.
 *
 *  3. A LOCKED THING IS SHOWN, NOT HIDDEN. A face nobody has earned yet sits
 *     in the row, dimmed, and pressing it says how it is got in the one
 *     sentence that lives on its own row (look.ts FACES). A player cannot
 *     want a thing they have never seen.
 *
 *  4. EVERY TARGET IS 44 PIXELS, on a phone and on a desktop alike, and every
 *     one of them is a real <button> with an aria-pressed state, so the row
 *     works from a keyboard and reads correctly aloud.
 *
 *  5. NOTHING HERE READS A CANVAS. The glyphs are small SVGs drawn from the
 *     same idea as the rig's shapes, never screenshots of it, so the panel
 *     renders with public/bots-art deleted (the house law) and costs no
 *     texture.
 */

import { useState } from "react";
import {
  FACES,
  FACE_INDEX,
  SPOTS,
  STICKERS,
  STICKER_INDEX,
  faceAllowed,
  sameHat,
  type BotLook,
  type FaceId,
  type HatId,
  type HatWon,
  type LookEarned,
  type StickerId,
  type StickerSpot,
} from "@/lib/bots/look";
import { hatName } from "@/lib/bots/shelf";
import { STRINGS, fill } from "@/lib/bots/strings";
import { uiCss } from "../_ui/primitives";
import { FONT_BODY, K, M, PAINTS, R, TAP, type PaintId } from "../_ui/tokens";

const t = STRINGS.en;

/** What a press asks for. The caller checks it and stores what comes back. */
export interface LookChange {
  face?: FaceId;
  sticker?: StickerId | null;
  spot?: StickerSpot;
  stickerPaint?: PaintId | null;
  /** the hat to put on, or null for none. Only ever one of earned.hats: the
   *  row is drawn FROM that list, so this can carry nothing else. */
  hat?: HatWon | null;
}

/* ── the glyphs ─────────────────────────────────────────────────────────── */

/**
 * A FACE, AT BUTTON SIZE. The four drawings are the rig's own dials read
 * back as a picture: a calm face has open lenses and a level mouth, a happy
 * one squints and grins, a wink has one lid down, and the star face wears a
 * star over each lens. There is no sleepy face: it read as the happy one at
 * ring size and was cut (look.ts FaceId says how that was measured).
 *
 * The mouth is drawn HEAVIER than the rig draws it, on purpose. At 28 pixels
 * a hairline curve disappears and calm and happy become the same button, and
 * a row of four identical buttons is a row a player learns nothing from.
 */
function FaceGlyph({ id, size = 26 }: { id: FaceId; size?: number }) {
  const c = "currentColor";
  const common = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true as const };
  const openEye = (x: number) => <circle cx={x} cy="13" r="3.4" fill={c} />;
  const shutEye = (x: number) => (
    <path d={`M${x - 4.2} 13.4h8.4`} stroke={c} strokeWidth="2.6" strokeLinecap="round" fill="none" />
  );
  const starEye = (x: number) => (
    <path
      d={`M${x} 8.6l1.4 3 3.2.4-2.4 2.2.7 3.2-2.9-1.6-2.9 1.6.7-3.2-2.4-2.2 3.2-.4z`}
      fill={c}
    />
  );
  const mouth = (d: string) => <path d={d} stroke={c} strokeWidth="2.4" strokeLinecap="round" fill="none" />;
  switch (id) {
    case "calm":
      return (
        <svg {...common}>
          {openEye(11)}
          {openEye(21)}
          {mouth("M11.5 22h9")}
        </svg>
      );
    case "happy":
      return (
        <svg {...common}>
          {/* the happy squint: the lower lid comes UP, which is the rig's
              `rise`, so the eye is an arch and not a dot */}
          <path d="M7.4 14.4a3.8 3.8 0 0 1 7.2 0" stroke={c} strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M17.4 14.4a3.8 3.8 0 0 1 7.2 0" stroke={c} strokeWidth="2.6" strokeLinecap="round" fill="none" />
          {mouth("M10 20.4q6 6.4 12 0")}
        </svg>
      );
    case "wink":
      return (
        <svg {...common}>
          {shutEye(11)}
          {openEye(21)}
          {mouth("M10 20.6q6 5.6 12 0")}
        </svg>
      );
    case "stars":
      return (
        <svg {...common}>
          {starEye(11)}
          {starEye(21)}
          {mouth("M10 21q6 5.6 12 0")}
        </svg>
      );
  }
}

/** The six stickers, the same six shapes look.ts draws on the robot. */
function StickerGlyph({ id, size = 24 }: { id: StickerId; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const };
  const c = "currentColor";
  switch (id) {
    case "plate":
      return (
        <svg {...common} fill="none" stroke={c} strokeWidth={2}>
          <rect x="3" y="7.5" width="18" height="9" rx="2" />
          <circle cx="8" cy="12" r="1.2" fill={c} />
          <circle cx="16" cy="12" r="1.2" fill={c} />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common} fill={c}>
          <path d="M11 2 5 13h5l-1 9 8-12h-5z" />
        </svg>
      );
    case "star":
      return (
        <svg {...common} fill={c}>
          <path d="M12 2.5l2.8 6 6.5.7-4.9 4.5 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.5 6.5-.7z" />
        </svg>
      );
    case "stripes":
      return (
        <svg {...common} fill={c}>
          <rect x="3" y="5" width="18" height="3" rx="1.5" />
          <rect x="3" y="10.5" width="18" height="3" rx="1.5" />
          <rect x="3" y="16" width="18" height="3" rx="1.5" />
        </svg>
      );
    case "wrenches":
      return (
        <svg {...common} fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round">
          <path d="M5 19 17 7M19 19 7 7" />
          <circle cx="18" cy="6" r="2.4" />
          <circle cx="6" cy="6" r="2.4" />
        </svg>
      );
    case "heart":
      return (
        <svg {...common} fill={c}>
          <path d="M12 20.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 8.1a4.2 4.2 0 0 1 7.5 2.4c0 5.4-7.5 10-7.5 10z" />
        </svg>
      );
  }
}

/**
 * WHERE IT GOES, drawn as the robot rather than named as a word. A body with
 * the spot marked is understood before it is read, which is the whole point
 * on a screen a seven year old is using.
 */
function SpotGlyph({ id, size = 26 }: { id: StickerSpot; size?: number }) {
  const c = "currentColor";
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true as const };
  const body = (
    <g stroke={c} strokeWidth="1.5" fill="none" opacity="0.5">
      <rect x="8" y="2.5" width="8" height="6" rx="2" />
      <rect x="6.5" y="10" width="11" height="8" rx="2" />
      <path d="M9.5 18v3.5M14.5 18v3.5" strokeLinecap="round" />
    </g>
  );
  const dot = (x: number, y: number, r = 2.2) => <circle cx={x} cy={y} r={r} fill={c} />;
  switch (id) {
    case "chest":
      return (
        <svg {...common}>
          {body}
          {dot(12, 13.6, 2.6)}
        </svg>
      );
    case "cheek":
      return (
        <svg {...common}>
          {body}
          {dot(14.4, 6.6, 1.7)}
        </svg>
      );
    case "boot":
      return (
        <svg {...common}>
          {body}
          <path d="M8.3 20.6h2.4M13.3 20.6h2.4" stroke={c} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
  }
}

/**
 * THE SIX HATS, at button size, each one in the colour it turned up in.
 *
 * These are the same six SKYLINES look.ts HAT_SHAPES draws on the robot, not
 * a second idea of what a bow is: a bow is two triangles and a knot, a
 * propeller is a bar on a post, ears are two rounds, a flag is a mast and a
 * pennant, a bell is a round on a stalk, a spring is a zigzag with a ball on
 * top. A tile a player cannot match to the thing on their robot's head is a
 * tile they have to press to understand.
 *
 * The colour is the hat's own, so two bows in the row are two different bows
 * on sight, which is the whole reason a hat carries a colour.
 */
function HatGlyph({ id, color, size = 26 }: { id: HatId; color: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 32 32", "aria-hidden": true as const };
  const c = color;
  // THE EDGE. The chip under these is light clay, and one of the eight paints
  // is white (#f3e9d2 against clay #c7cdd6), so the white hats read as two
  // faint blobs with no edge: measured on the first render of this row. A thin
  // dark outline on every coloured shape is the rig's own rule for a mark on a
  // light ground (look.ts CONTRAST_INK), and it costs the dark hats nothing.
  const edge = { stroke: "rgba(20,24,34,0.38)", strokeWidth: 0.9, strokeLinejoin: "round" as const };
  switch (id) {
    case "bow":
      return (
        <svg {...common}>
          <path d="M4 8.5 14 16 4 23.5z" fill={c} {...edge} />
          <path d="M28 8.5 18 16l10 7.5z" fill={c} {...edge} />
          <circle cx="16" cy="16" r="3.6" fill={c} {...edge} />
        </svg>
      );
    case "propeller":
      return (
        <svg {...common}>
          <rect x="14.2" y="14" width="3.6" height="12" rx="1.8" fill={c} {...edge} />
          <rect x="3" y="9.5" width="26" height="4.6" rx="2.3" fill={c} {...edge} />
          <circle cx="16" cy="11.8" r="2.2" fill="currentColor" opacity="0.85" />
        </svg>
      );
    case "ears":
      return (
        <svg {...common}>
          <ellipse cx="9.5" cy="15" rx="5.4" ry="7" fill={c} {...edge} />
          <ellipse cx="22.5" cy="15" rx="5.4" ry="7" fill={c} {...edge} />
          <ellipse cx="9.5" cy="15.4" rx="2.4" ry="3.6" fill="currentColor" opacity="0.5" />
          <ellipse cx="22.5" cy="15.4" rx="2.4" ry="3.6" fill="currentColor" opacity="0.5" />
        </svg>
      );
    case "flag":
      return (
        <svg {...common}>
          <rect x="9.4" y="4" width="2.8" height="24" rx="1.4" fill="currentColor" opacity="0.85" />
          <path d="M12.4 5.4 26 9.4l-13.6 4.6z" fill={c} {...edge} />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <rect x="14.6" y="15" width="2.8" height="11" rx="1.4" fill="currentColor" opacity="0.85" />
          <circle cx="16" cy="11" r="6.4" fill={c} {...edge} />
          <circle cx="13.4" cy="8.6" r="1.9" fill="currentColor" opacity="0.55" />
        </svg>
      );
    case "spring":
      return (
        <svg {...common}>
          <path
            d="M16 27 10.6 22.6 21.4 18.2 10.6 13.8 19 10.2"
            stroke={c}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="21.5" cy="7.4" r="4.2" fill={c} {...edge} />
        </svg>
      );
  }
}

/** A small padlock, so a locked row reads without its words. */
function LockGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2.4}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── the pieces of the panel ────────────────────────────────────────────── */

const rowLabel: React.CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: 11.5,
  fontWeight: 700,
  letterSpacing: "0.06em",
  color: M.muted,
  margin: "0 0 6px",
};

const noteLine: React.CSSProperties = {
  margin: "6px 0 0",
  fontFamily: FONT_BODY,
  fontSize: 11.5,
  lineHeight: 1.45,
  color: M.lore,
  minHeight: 17,
};

function tile(on: boolean, locked: boolean): React.CSSProperties {
  return {
    width: TAP,
    height: TAP,
    flex: "0 0 auto",
    borderRadius: R.inner,
    border: `1px solid ${on ? M.accent : M.border}`,
    background: on ? M.surface2 : "transparent",
    color: locked ? M.muted : on ? M.text : M.lore,
    opacity: locked ? 0.55 : 1,
    display: "grid",
    placeItems: "center",
    position: "relative",
    cursor: "pointer",
  };
}

/** One row of tiles. Every row on this panel is this shape, so a player who
 *  learns the first row has learned all four. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label ? <p style={rowLabel}>{label}</p> : null}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

/* ── the panel ──────────────────────────────────────────────────────────── */

export interface LookPickerProps {
  /** the look the robot is wearing now, already checked against its rows */
  look: BotLook;
  /** what the server says this robot has earned; the rows are drawn from it */
  earned: LookEarned;
  /** the colours the robot is actually wearing, in body order, no repeats */
  colours: readonly PaintId[];
  /** ask for a change. The caller validates and stores; nothing is assumed. */
  onChange: (change: LookChange) => void;
  /** the three buttons. Left out on the first meeting, where one face is the
   *  whole job and three more buttons would be three more decisions. */
  onPickForMe?: () => void;
  onSurprise?: () => void;
  onPlain?: () => void;
  /** open the name sheet, because the plate's number IS the name's number */
  onEditNumber?: () => void;
  /** the face row alone (the first meeting) */
  faceOnly?: boolean;
  /** tighter on a phone sheet */
  compact?: boolean;
  /** the very first time this player has ever had a hat to put on. The one
   *  sentence that says where hats come from is printed above the row then,
   *  and never again: the caller remembers, the way every other once-only
   *  line in this game is remembered (the coach law). */
  firstHat?: boolean;
}

export function LookPicker({
  look,
  earned,
  colours,
  onChange,
  onPickForMe,
  onSurprise,
  onPlain,
  onEditNumber,
  faceOnly,
  compact,
  firstHat,
}: LookPickerProps) {
  /** the last thing pressed, so the panel can say what it is in words. A
   *  choice you can say out loud is a choice you own. */
  const [said, setSaid] = useState<string | null>(null);

  const say = (text: string) => setSaid(text);

  // on the first meeting the card says "Give it a face" above this row, so the
  // row's own word would be the same instruction twice in two lines
  const faceRow = (
    <Row label={faceOnly ? "" : t.look.face}>
      {FACES.map((f) => {
        const open = faceAllowed(f.id, earned);
        const on = look.face === f.id;
        return (
          <button
            key={f.id}
            type="button"
            className={uiCss.press}
            aria-pressed={on}
            aria-label={open ? f.name : `${f.name}. ${t.look.locked}. ${f.earn}`}
            title={open ? f.name : f.earn}
            onClick={() => {
              // a locked face never sends a claim the route would refuse: it
              // says how it is earned and leaves the robot alone
              if (!open) {
                say(`${f.name}. ${t.look.locked}. ${f.earn}`);
                return;
              }
              say(f.name);
              onChange({ face: f.id });
            }}
            style={tile(on, !open)}
          >
            <FaceGlyph id={f.id} />
            {open ? null : (
              <span
                aria-hidden
                style={{ position: "absolute", right: 3, bottom: 3, color: M.muted, lineHeight: 0 }}
              >
                <LockGlyph />
              </span>
            )}
          </button>
        );
      })}
    </Row>
  );

  if (faceOnly) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {faceRow}
        <p style={noteLine}>{said ?? FACE_INDEX[look.face].name}</p>
      </div>
    );
  }

  const stickerRow = (
    <Row label={t.look.sticker}>
      {/* "no sticker" is a tile of its own rather than a second press on the
          chosen one, because a toggle that looks like a choice is the one
          control a child gets wrong every time */}
      <button
        type="button"
        className={uiCss.press}
        aria-pressed={look.sticker === null}
        aria-label={t.look.none}
        title={t.look.none}
        onClick={() => {
          say(t.look.none);
          onChange({ sticker: null });
        }}
        style={tile(look.sticker === null, false)}
      >
        <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M6.4 17.6 17.6 6.4" strokeLinecap="round" />
        </svg>
      </button>
      {STICKERS.map((s) => {
        const on = look.sticker === s.id;
        return (
          <button
            key={s.id}
            type="button"
            className={uiCss.press}
            aria-pressed={on}
            aria-label={s.name}
            title={s.name}
            onClick={() => {
              say(s.name);
              onChange({ sticker: s.id });
            }}
            style={tile(on, false)}
          >
            <StickerGlyph id={s.id} />
          </button>
        );
      })}
    </Row>
  );

  const spotRow = (
    <Row label={t.look.place}>
      {SPOTS.map((s) => {
        const on = look.spot === s.id;
        return (
          <button
            key={s.id}
            type="button"
            className={uiCss.press}
            aria-pressed={on}
            aria-label={`${s.name}. ${s.earn}`}
            title={s.earn}
            disabled={!look.sticker}
            onClick={() => {
              say(s.earn);
              onChange({ spot: s.id });
            }}
            style={{ ...tile(on, false), opacity: look.sticker ? 1 : 0.4, cursor: look.sticker ? "pointer" : "default" }}
          >
            <SpotGlyph id={s.id} />
          </button>
        );
      })}
    </Row>
  );

  const colourRow = (
    <Row label={t.look.stickerColor}>
      {colours.map((p) => {
        const on = look.stickerPaint === p;
        return (
          <button
            key={p}
            type="button"
            className={uiCss.press}
            aria-pressed={on}
            aria-label={t.paintName[p]}
            title={t.paintName[p]}
            disabled={!look.sticker}
            onClick={() => {
              say(t.paintName[p]);
              onChange({ stickerPaint: p });
            }}
            style={{ ...tile(on, false), opacity: look.sticker ? 1 : 0.4, cursor: look.sticker ? "pointer" : "default" }}
          >
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: R.pill,
                background: PAINTS[p],
                border: `1px solid ${M.border}`,
              }}
            />
          </button>
        );
      })}
    </Row>
  );

  /**
   * THE HAT ROW, AND WHY IT IS NOT ALWAYS THERE.
   *
   * Every other row on this panel is a row of things any robot may wear.
   * A hat is the one thing that cannot be reached from this screen at all:
   * it turns up when a robot beats the biggest robot in the yard, and there
   * is no shop, no coin and no shelf that will ever produce one. So a player
   * with no hat is shown no hat row. Six padlocks that no amount of shopping
   * can open would teach the opposite of the rule they are meant to carry,
   * and the game says the rule in a sentence instead, once, the first time a
   * hat is actually there.
   *
   * Every tile is a hat this wallet has a row for, in the colour it turned
   * up in, so nothing here can ask for a hat the save route would refuse.
   */
  const hats = earned.hats;
  const hatRow = hats.length ? (
    <div>
      {/* THE ONE SENTENCE GOES UNDER THE ROW'S OWN WORD, not above it. Read
          the other way round it floats between the colour swatches and the
          Hat label and belongs to neither, which is what the first render of
          this row showed. Label, then why, then the tiles. */}
      <p style={{ ...rowLabel, margin: firstHat ? "0 0 2px" : "0 0 6px" }}>{t.look.hat}</p>
      {firstHat ? <p style={{ ...noteLine, margin: "0 0 8px", color: M.text }}>{t.look.foundHat}</p> : null}
      <Row label="">
        <button
          type="button"
          className={uiCss.press}
          aria-pressed={look.hat === null}
          aria-label={t.look.noHat}
          title={t.look.noHat}
          onClick={() => {
            say(t.look.noHat);
            onChange({ hat: null });
          }}
          style={tile(look.hat === null, false)}
        >
          <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M6.4 17.6 17.6 6.4" strokeLinecap="round" />
          </svg>
        </button>
        {hats.map((h) => {
          const on = sameHat(look.hat, h);
          const name = hatName(h);
          return (
            <button
              key={`${h.kind}:${h.color ?? "-"}`}
              type="button"
              className={uiCss.press}
              aria-pressed={on}
              aria-label={name}
              title={name}
              onClick={() => {
                say(fill(t.look.hatOn, { hat: name }));
                onChange({ hat: h });
              }}
              style={tile(on, false)}
            >
              {/* A HAT SITS ON A CLAY HEAD, and it has to sit on one here too.
                  The panel's ground is nearly black and the black paint is
                  #2b2f3a, so the first render of this row showed a black hat
                  as an empty tile: the one hat a player could not see was the
                  one they had won. The chip is the same unpainted clay every
                  part ships in (tokens.ts K.clay), which is the ground the hat
                  really has on the robot, so all eight colours read on it. */}
              <span
                aria-hidden
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: K.clay,
                  display: "grid",
                  placeItems: "center",
                  color: M.border,
                }}
              >
                {/* the hat's OWN colour, so two bows in this row are two
                    different bows before anybody reads a word */}
                <HatGlyph id={h.kind} color={h.color ? PAINTS[h.color] : M.border} size={24} />
              </span>
            </button>
          );
        })}
      </Row>
    </div>
  ) : null;

  const plateRow = (
    <div>
      <p style={rowLabel}>{t.look.plate}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span
          aria-hidden
          style={{
            display: "inline-grid",
            placeItems: "center",
            minWidth: 46,
            height: 30,
            padding: "0 10px",
            borderRadius: 6,
            border: `1px solid ${M.border}`,
            background: M.surface2,
            fontFamily: "var(--font-bots-toy, ui-rounded), system-ui, sans-serif",
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: "0.04em",
            color: look.plateNumber ? M.text : M.muted,
          }}
        >
          {look.plateNumber ?? "--"}
        </span>
        {/* the sentence sits BESIDE the plate, not between it and the button:
            given the whole 760 pixel column to grow into it pushed the button
            to the far edge and the row read as two unrelated controls */}
        <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: M.lore, maxWidth: 260 }}>
          {look.plateNumber ? fill(t.look.plateOn, { n: String(look.plateNumber) }) : t.look.plateNone}
        </span>
        {onEditNumber ? (
          <button
            type="button"
            className={uiCss.press}
            onClick={onEditNumber}
            style={{
              minHeight: TAP,
              padding: "0 14px",
              borderRadius: R.inner,
              border: `1px solid ${M.border}`,
              background: "transparent",
              color: M.text,
              fontFamily: FONT_BODY,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t.look.plateEdit}
          </button>
        ) : null}
      </div>
    </div>
  );

  const bigButton = (label: string, onClick: () => void, primary = false): React.ReactNode => (
    <button
      key={label}
      type="button"
      className={uiCss.press}
      onClick={() => {
        say(t.look.done);
        onClick();
      }}
      style={{
        flex: "1 1 auto",
        minWidth: 108,
        minHeight: TAP,
        padding: "0 12px",
        borderRadius: R.inner,
        border: `1px solid ${primary ? M.accent : M.border}`,
        background: primary ? M.surface2 : "transparent",
        color: primary ? M.text : M.lore,
        fontFamily: FONT_BODY,
        fontSize: 12.5,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 12 }}>
      {faceRow}
      {stickerRow}
      {/* where it goes and what colour it is only mean anything once there IS
          a sticker, so both rows stand down until there is one rather than
          disappearing, which would move every row under them */}
      {spotRow}
      {colourRow}
      {/* the hat goes UNDER the sticker rows and OVER the plate: it is the
          only row that is not always there, and a row that appears has to
          appear in one place, not shove the plate up the panel */}
      {hatRow}
      {plateRow}
      <p style={noteLine}>{said ?? t.look.note}</p>
      {onPickForMe || onSurprise || onPlain ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {onPickForMe ? bigButton(t.look.pickForMe, onPickForMe, true) : null}
          {onSurprise ? bigButton(t.look.surprise, onSurprise) : null}
          {onPlain ? bigButton(t.look.plain, onPlain) : null}
        </div>
      ) : null}
    </div>
  );
}
