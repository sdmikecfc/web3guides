import manifest from "./asset-catalogue.json";
import type { BuildV6, CardV6 } from "./types";
export const CATALOGUE_ASSET_ROOT_V6 = "/bots-art/3d/season-v6/catalogue-1/";
interface StoredAsset { model: string; node: string; ready: boolean; thumbnail?: string }
export interface CardAssetV6 { modelUrl: string; node: string; slot: string; thumbnailUrl?: string; ready: boolean }
const cards = manifest.cards as Record<string, StoredAsset>;
/** Admission comes from inspected exported files, never from rarity or a guessed URL. */
export function cardAssetV6(cardOrId: Pick<CardV6, "id"> | string | undefined): CardAssetV6 | undefined {
  const id = typeof cardOrId === "string" ? cardOrId : cardOrId?.id;
  const item = id ? cards[id] : undefined;
  return item ? { modelUrl: CATALOGUE_ASSET_ROOT_V6 + item.model, node: item.node, slot: item.node.replace(/^slot_/, ""), ready: item.ready, ...(item.thumbnail ? { thumbnailUrl: CATALOGUE_ASSET_ROOT_V6 + item.thumbnail } : {}) } : undefined;
}
export function buildAssetsReadyV6(build: BuildV6): boolean {
  return Object.values(build.parts).every(part => cardAssetV6(part)?.ready === true);
}
