/**
 * X / Twitter card for /s5: the same image as the OpenGraph one.
 *
 * Same reason as the board's (see ./board/twitter-image.tsx): the root layout
 * defines `twitter.images`, so a segment opengraph-image alone leaves X showing
 * the site-wide card. The season's own front door is the most-pasted link in
 * the game, so it is worth the four lines.
 */
export { default, size, contentType } from "./opengraph-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Launch Wars Season 5: Iron Siege";
