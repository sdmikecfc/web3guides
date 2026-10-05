/**
 * DOMAIN KITCHEN CHROME ICONS (M11).
 *
 * WHY NOT EMOJI. Every chrome icon in the game was an emoji, and a run of
 * mixed emoji in a button bar is a large part of why the game read as a text
 * document rather than a game. This codebase has already been bitten once:
 * Chrome.tsx's CodeBadge exists purely because flag emoji do not render on
 * Windows, and M7 lost a 🫓 to the same problem. An emoji is a font glyph the
 * player's OS chooses; an icon should be art we control.
 *
 * These are deliberately CHUNKY — thick strokes, round caps, generous radii —
 * to sit next to Baloo 2 and read at dock size on a phone. Everything is
 * `currentColor`, so a button tints its icon by setting `color`.
 *
 * SCOPE: chrome only. CONTENT emoji stay exactly as they are (ingredient
 * icons, hearts in the guest book, the ● / ○ selling glyphs, dish stars) —
 * those are the game's voice, not its furniture.
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

/** The currency. Filled centre so it reads as a solid coin at 16px. */
export const IconCoin = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="12" r="8.5" fill="currentColor" opacity={0.22} />
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v8.4M9.9 9.8h3.3a1.9 1.9 0 0 1 0 3.8H9.9h3.4a1.9 1.9 0 0 1 0 3.8" />
    </>,
    p
  );

/** Shop. */
export const IconCart = (p: IconProps) =>
  svg(
    <>
      <path d="M3 4h2.2l2.3 10.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.5L20.5 8H6.2" />
      <circle cx="10" cy="20" r="1.6" fill="currentColor" />
      <circle cx="17.5" cy="20" r="1.6" fill="currentColor" />
    </>,
    p
  );

/** Money / the wallet sheet. */
export const IconMoney = (p: IconProps) =>
  svg(
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2.6" />
      <circle cx="12" cy="12" r="2.9" fill="currentColor" opacity={0.3} />
      <circle cx="12" cy="12" r="2.9" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>,
    p
  );

/** Tonight's menu. A cloche. */
export const IconCloche = (p: IconProps) =>
  svg(
    <>
      <path d="M3.5 17.5h17" />
      <path d="M5 17.5a7 7 0 0 1 14 0" fill="currentColor" opacity={0.22} />
      <path d="M5 17.5a7 7 0 0 1 14 0" />
      <path d="M12 10.5V8" />
      <circle cx="12" cy="6.6" r="1.4" fill="currentColor" />
    </>,
    p
  );

/** The guest book. */
export const IconBook = (p: IconProps) =>
  svg(
    <>
      <path d="M4 4.5h11a3 3 0 0 1 3 3v12a2.4 2.4 0 0 0-2.4-2.4H4z" fill="currentColor" opacity={0.2} />
      <path d="M4 4.5h11a3 3 0 0 1 3 3v12a2.4 2.4 0 0 0-2.4-2.4H4z" />
      <path d="M4 4.5v12.6" />
    </>,
    p
  );

/** Learn / the academy. */
export const IconCap = (p: IconProps) =>
  svg(
    <>
      <path d="M12 4.5 22 9l-10 4.5L2 9z" fill="currentColor" opacity={0.24} />
      <path d="M12 4.5 22 9l-10 4.5L2 9z" />
      <path d="M6.5 11v4.6c0 1.6 2.5 2.9 5.5 2.9s5.5-1.3 5.5-2.9V11" />
    </>,
    p
  );

/** More. */
export const IconMore = (p: IconProps) =>
  svg(
    <>
      <circle cx="6" cy="12" r="1.9" fill="currentColor" />
      <circle cx="12" cy="12" r="1.9" fill="currentColor" />
      <circle cx="18" cy="12" r="1.9" fill="currentColor" />
    </>,
    p
  );

/** Arrange / edit the layout. */
export const IconWrench = (p: IconProps) =>
  svg(
    <>
      <path d="M15.4 3.6a5.2 5.2 0 0 0-6.1 6.9l-6 6a2 2 0 0 0 2.8 2.8l6-6a5.2 5.2 0 0 0 6.9-6.1l-3.1 3.1-2.9-.7-.7-2.9z" />
    </>,
    p
  );

/** Crew. */
export const IconChefHat = (p: IconProps) =>
  svg(
    <>
      <path d="M6.5 13.5a3.8 3.8 0 1 1 1.6-7.2 4 4 0 0 1 7.8 0 3.8 3.8 0 1 1 1.6 7.2z" fill="currentColor" opacity={0.22} />
      <path d="M6.5 13.5a3.8 3.8 0 1 1 1.6-7.2 4 4 0 0 1 7.8 0 3.8 3.8 0 1 1 1.6 7.2z" />
      <path d="M6.8 17.4h10.4v1.8a1.4 1.4 0 0 1-1.4 1.4H8.2a1.4 1.4 0 0 1-1.4-1.4z" />
    </>,
    p
  );

/** Style / the room's look. */
export const IconSwatch = (p: IconProps) =>
  svg(
    <>
      <path d="M4 18.5V6.2A2.2 2.2 0 0 1 6.2 4h4.3a2.2 2.2 0 0 1 2.2 2.2v12.3a2.7 2.7 0 0 1-5.4 0" />
      <path d="M12.7 8.9 15.8 5.8a2.2 2.2 0 0 1 3.1 0l1.3 1.3a2.2 2.2 0 0 1 0 3.1l-8.5 8.5" />
      <circle cx="8" cy="18" r="1.1" fill="currentColor" />
    </>,
    p
  );

/** The public board. */
export const IconMedal = (p: IconProps) =>
  svg(
    <>
      <circle cx="12" cy="14.5" r="5.5" fill="currentColor" opacity={0.22} />
      <circle cx="12" cy="14.5" r="5.5" />
      <path d="M8.6 9.3 6.4 3.5h11.2l-2.2 5.8" />
    </>,
    p
  );

export const IconSpeaker = (p: IconProps) =>
  svg(
    <>
      <path d="M4 9.5h3.4L12 5.6v12.8L7.4 14.5H4z" fill="currentColor" opacity={0.28} />
      <path d="M4 9.5h3.4L12 5.6v12.8L7.4 14.5H4z" />
      <path d="M15.6 9.4a3.7 3.7 0 0 1 0 5.2M18.3 6.7a7.5 7.5 0 0 1 0 10.6" />
    </>,
    p
  );

export const IconSpeakerOff = (p: IconProps) =>
  svg(
    <>
      <path d="M4 9.5h3.4L12 5.6v12.8L7.4 14.5H4z" fill="currentColor" opacity={0.28} />
      <path d="M4 9.5h3.4L12 5.6v12.8L7.4 14.5H4z" />
      <path d="M16 10l4 4M20 10l-4 4" />
    </>,
    p
  );

export const IconCamera = (p: IconProps) =>
  svg(
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8.5 7l1.6-2.6h3.8L15.5 7" />
      <circle cx="12" cy="13.2" r="3.6" />
    </>,
    p
  );

export const IconClose = (p: IconProps) => svg(<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" />, p);

/** Row chevron, and the link-out arrow for anything that leaves the game. */
export const IconChevron = (p: IconProps) => svg(<path d="M9.5 5.5 16 12l-6.5 6.5" />, p);
export const IconExternal = (p: IconProps) =>
  svg(
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18.5 14.2v4.3a1.9 1.9 0 0 1-1.9 1.9H5.5a1.9 1.9 0 0 1-1.9-1.9V7.4a1.9 1.9 0 0 1 1.9-1.9h4.3" />
    </>,
    p
  );

/** Service quality, shown on the always-visible status pill. */
export const IconStar = (p: IconProps) =>
  svg(
    <>
      <path
        d="M12 3.8l2.6 5.2 5.8.85-4.2 4.1 1 5.75L12 17l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z"
        fill="currentColor"
        opacity={0.28}
      />
      <path d="M12 3.8l2.6 5.2 5.8.85-4.2 4.1 1 5.75L12 17l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z" />
    </>,
    p
  );
