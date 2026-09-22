/**
 * X / Twitter card for /s5/board: the same image as the OpenGraph one.
 *
 * This file has to exist. The ROOT layout sets `twitter.images` to the generic
 * Web3Guides card (src/app/layout.tsx), and a segment's opengraph-image only
 * replaces `og:image` — so without this, pasting a board link into X showed the
 * site-wide crypto-education card while every other platform showed the board.
 * Re-exporting keeps one renderer and one set of numbers.
 */
export { default, size, contentType } from "./opengraph-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "Launch Wars Season 6 Uprising: the war board";
