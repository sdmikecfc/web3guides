"use client";

import { ToyDisplay } from "../_components/ToyDisplay";
import { rigLookOf } from "../_view/look-view";
import type { BoardBot } from "./BoardTable";

/** Renderer appearance is resolved on the client; server rows stay plain data. */
export function BoardToyPortrait({ art, label }: { art: NonNullable<BoardBot["art"]>; label: string }) {
  return <ToyDisplay build={art.build} look={rigLookOf(art.look, art.paint)} mode="static" ariaLabel={label} />;
}
