"use client";
import { useMemo } from "react";
import type { CardV6, SocketV6 } from "@/lib/bots/v6";
import { cardAssetV6 } from "@/lib/bots/v6/assets";
import { seasonPracticeBuild } from "@/lib/bots/season/practice";
import V6ToyDisplay from "../_components/V6ToyDisplay";
import V6ToyPicture from "../_components/V6ToyPicture";

export default function SeasonPartPicture({ card, socket, interactive = false, active = true }: { card: CardV6; socket?: SocketV6; interactive?: boolean; active?: boolean }) {
  const build = useMemo(() => seasonPracticeBuild({ part: card.id }).build, [card.id]);
  const slot = socket ?? (card.slot === "arms" ? "armL" : card.slot === "legs" ? "legL" : card.slot), asset = cardAssetV6(card);
  if (!asset?.ready) return <span role="status" style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 10 }}>Picture unavailable</span>;
  if (interactive) return <V6ToyDisplay build={build} slot={slot} active={active} title={card.name} />;
  if (asset.thumbnailUrl) return <img src={asset.thumbnailUrl} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />;
  return <V6ToyPicture build={build} slot={slot} active={active} title={card.name} />;
}
