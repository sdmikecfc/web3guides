/**
 * BATTLE BOTS CHROME ICONS (week 1).
 *
 * The wrapper is copied from src/app/chef/game/_ui/icons.tsx (the Domain
 * Kitchen icon file) per the reuse law; the glyph set is the screens doc 5.3
 * list. One stroke weight (2.4 at a 24 viewBox), round caps and joins,
 * `currentColor`, `aria-hidden`. No emoji anywhere in chrome: an emoji is a
 * font glyph the player's OS chooses, and flag emoji already failed on
 * Windows once in this codebase.
 *
 * Three families:
 *   stats   speed, strength, dodge, damage, block, health, luck, accuracy,
 *           attack speed (the nine readout rows and the part cards)
 *   slots   head, torso, arm, leg, weapon (the tray filter chips)
 *   chrome  coin, wrench, garage door, pin, pegboard, recycle, play, replay,
 *           share, live (the one filled glyph), lock, chevron, close,
 *           external, star, camera, plus pencil for the name edit
 */

import type { CSSProperties } from "react";

export interface IconProps {
  size?: number;
  style?: CSSProperties;
}

/** Shared wrapper: one viewBox, one stroke language, no per-icon drift. */
function svg(path: React.ReactNode, { size = 24, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", flex: "0 0 auto", ...style }}
    >
      {path}
    </svg>
  );
}

/* ── stats ──────────────────────────────────────────────────────────────── */

/** Speed: three motion streaks behind a small circle. */
export const IconSpeed = (p: IconProps) =>
  svg(
    <>
      <circle cx="15.5" cy="12" r="4.2" />
      <path d="M3 8h6M2.5 12h5.5M3 16h6" />
    </>,
    p,
  );

/** Strength: a plain dumbbell. */
export const IconStrength = (p: IconProps) =>
  svg(
    <>
      <path d="M6.5 7.5v9M17.5 7.5v9M3.5 10v4M20.5 10v4M6.5 12h11" />
    </>,
    p,
  );

/** Dodge: an arrow swerving around a dot. */
export const IconDodge = (p: IconProps) =>
  svg(
    <>
      <circle cx="10.5" cy="15.5" r="1.6" fill="currentColor" stroke="none" />
      <path d="M4 18.5c3.5 0 4.5-4 6-7.5s3.5-5.5 9-5.5" />
      <path d="M16 2.5l3 3-3 3" />
    </>,
    p,
  );

/** Damage: a six point burst. */
export const IconDamage = (p: IconProps) =>
  svg(
    <path d="M12 3l2.25 5.1 5.55-.6-3.3 4.5 3.3 4.5-5.55-.6L12 21l-2.25-5.1-5.55.6 3.3-4.5-3.3-4.5 5.55.6z" />,
    p,
  );

/** Block: a shield outline. */
export const IconBlock = (p: IconProps) =>
  svg(
    <path d="M12 3.5l7.5 3v5.5c0 4.5-3.2 7.6-7.5 9-4.3-1.4-7.5-4.5-7.5-9V6.5z" />,
    p,
  );

/** Health: a heart outline. */
export const IconHealth = (p: IconProps) =>
  svg(
    <path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.4c0 5.4-7.5 10-7.5 10z" />,
    p,
  );

/** Luck: a four leaf clover outline. */
export const IconLuck = (p: IconProps) =>
  svg(
    <>
      <path d="M12 11.5c-.5-4-3.5-5.5-5-3.5s0 4.5 5 3.5z" />
      <path d="M12 11.5c4-.5 5.5-3.5 3.5-5s-4.5 0-3.5 5z" />
      <path d="M12 11.5c.5 4 3.5 5.5 5 3.5s0-4.5-5-3.5z" />
      <path d="M12 11.5c-4 .5-5.5 3.5-3.5 5s4.5 0 3.5-5z" />
      <path d="M12 12.5l-1.5 8" />
    </>,
    p,
  );

/** Accuracy: a crosshair, three rings. */
export const IconAccuracy = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.4" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5" />
    </>,
    p,
  );

/** Attack speed: a double chevron. */
export const IconAttackSpeed = (p: IconProps) =>
  svg(<path d="M5.5 5.5 12 12l-6.5 6.5M12.5 5.5 19 12l-6.5 6.5" />, p);

/* ── slots ──────────────────────────────────────────────────────────────── */

/** Head: a rounded square with two dots. */
export const IconHead = (p: IconProps) =>
  svg(
    <>
      <rect x="4.5" y="5" width="15" height="14" rx="4" />
      <circle cx="9.3" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
    </>,
    p,
  );

/** Torso: a barrel with a rivet. */
export const IconTorso = (p: IconProps) =>
  svg(
    <>
      <path d="M6.5 5h11c.8 2.1 1.3 4.4 1.3 7s-.5 4.9-1.3 7h-11c-.8-2.1-1.3-4.4-1.3-7s.5-4.9 1.3-7z" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>,
    p,
  );

/** Arm: an L shape with a round joint. */
export const IconArm = (p: IconProps) =>
  svg(
    <>
      <path d="M7.5 4.5v8.5" />
      <circle cx="7.5" cy="15.5" r="2.4" />
      <path d="M10 15.5h8.5" />
    </>,
    p,
  );

/** Leg: an inverted L with a foot. */
export const IconLeg = (p: IconProps) =>
  svg(
    <>
      <path d="M9.5 4.5v9" />
      <circle cx="9.5" cy="15.5" r="2" />
      <path d="M9.5 17.5v2h9" />
    </>,
    p,
  );

/** Weapon: a hammer outline. */
export const IconWeapon = (p: IconProps) =>
  svg(
    <>
      <rect x="12.8" y="3.2" width="6" height="9" rx="1.5" transform="rotate(45 15.8 7.7)" />
      <path d="M11.5 12.5 4.5 19.5" />
    </>,
    p,
  );

/* ── chrome ─────────────────────────────────────────────────────────────── */

/** The currency. Filled centre so it reads as a solid coin at 16px (DK). */
export const IconCoin = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" opacity={0.22} />
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v8.4M9.9 9.8h3.3a1.9 1.9 0 0 1 0 3.8H9.9h3.4a1.9 1.9 0 0 1 0 3.8" />
    </>,
    p,
  );

/** Wrench (DK). */
export const IconWrench = (p: IconProps) =>
  svg(
    <path d="M15.4 3.6a5.2 5.2 0 0 0-6.1 6.9l-6 6a2 2 0 0 0 2.8 2.8l6-6a5.2 5.2 0 0 0 6.9-6.1l-3.1 3.1-2.9-.7-.7-2.9z" />,
    p,
  );

/** Garage door: an arch with three lines. */
export const IconGarage = (p: IconProps) =>
  svg(
    <>
      <path d="M3.5 20.5V11a8.5 8.5 0 0 1 17 0v9.5" />
      <path d="M7.5 20.5v-8h9v8M7.5 15.5h9M7.5 18h9" />
    </>,
    p,
  );

/** Pin: the corkboard pushpin. */
export const IconPin = (p: IconProps) =>
  svg(
    <>
      <path d="M9 3.5h6l-.8 5.5 3.3 3.5v1.5H6.5V12.5l3.3-3.5z" />
      <path d="M12 14v6.5" />
    </>,
    p,
  );

/** Pegboard: a grid of four dots. */
export const IconPegboard = (p: IconProps) =>
  svg(
    <>
      <circle cx="8" cy="8" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.9" fill="currentColor" stroke="none" />
    </>,
    p,
  );

/** Recycle: two curved arrows. */
export const IconRecycle = (p: IconProps) =>
  svg(
    <>
      <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3" />
      <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3" />
      <path d="M17 3.5l.3 3.2-3.2.3M7 20.5l-.3-3.2 3.2-.3" />
    </>,
    p,
  );

export const IconPlay = (p: IconProps) => svg(<path d="M8 5.5v13l10-6.5z" />, p);

/** Replay: a loop arrow. */
export const IconReplay = (p: IconProps) =>
  svg(
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4 4v4h4" />
    </>,
    p,
  );

/** Share: an arrow leaving a box. */
export const IconShare = (p: IconProps) =>
  svg(
    <>
      <path d="M12 14V3.5" />
      <path d="M8.5 7 12 3.5 15.5 7" />
      <path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-6.5a1.5 1.5 0 0 0-1.5-1.5H17" />
    </>,
    p,
  );

/** Live: a filled dot, the one filled glyph. */
export const IconLive = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="8.5" opacity={0.45} />
    </>,
    p,
  );

export const IconLock = (p: IconProps) =>
  svg(
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>,
    p,
  );

/** Row chevron, and the link-out arrow for anything that leaves the game (DK). */
export const IconChevron = (p: IconProps) => svg(<path d="M9.5 5.5 16 12l-6.5 6.5" />, p);
export const IconClose = (p: IconProps) => svg(<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" />, p);
export const IconExternal = (p: IconProps) =>
  svg(
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18.5 14.2v4.3a1.9 1.9 0 0 1-1.9 1.9H5.5a1.9 1.9 0 0 1-1.9-1.9V7.4a1.9 1.9 0 0 1 1.9-1.9h4.3" />
    </>,
    p,
  );

export const IconStar = (p: IconProps) =>
  svg(
    <path d="M12 3.8l2.6 5.2 5.8.85-4.2 4.1 1 5.75L12 17l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />,
    p,
  );

export const IconCamera = (p: IconProps) =>
  svg(
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7l1.6-2.6h3.8L15.5 7" />
      <circle cx="12" cy="13.2" r="3.6" />
    </>,
    p,
  );

/** Pencil: the name edit affordance on the readout. */
export const IconPencil = (p: IconProps) =>
  svg(
    <>
      <path d="M4 20l4.2-1 10-10a2 2 0 0 0-3.2-3.2l-10 10z" />
      <path d="M13.5 7.5l3 3" />
    </>,
    p,
  );

/** The nine stat glyphs keyed by readout stat, so a row can look its icon up. */
export const STAT_ICON = {
  speed: IconSpeed,
  strength: IconStrength,
  dodge: IconDodge,
  damage: IconDamage,
  block: IconBlock,
  health: IconHealth,
  luck: IconLuck,
  accuracy: IconAccuracy,
  attackSpeed: IconAttackSpeed,
} as const;

/** The five card-slot glyphs keyed by card slot. */
export const SLOT_ICON = {
  head: IconHead,
  torso: IconTorso,
  arms: IconArm,
  legs: IconLeg,
  weapon: IconWeapon,
} as const;
