/**
 * THE POSTCARD (CUTE+VIRAL push): one tap turns the live room into a framed
 * 1200x675 image sized for a Discord or X post. This is the shareable
 * artifact the whole art repass was building toward — a player showing off
 * their named room IS the marketing.
 *
 * Laws it keeps:
 * - Canvas only. The Pixi stage is extracted directly, so no HUD, no sheets,
 *   no toasts and no coins can ever leak onto the card (ADR-0042: never a
 *   dollar figure; the leak scans cover pages, this covers pixels).
 * - The name comes through the same sanitizer as the save, and an unnamed
 *   room says the game's name rather than shaming the player with "Unnamed".
 * - navigator.share on phones (the native sheet people actually post from),
 *   a plain download everywhere else. No new dependencies, no server.
 */

import type { Application, Container } from "pixi.js";

const W = 1200;
const H = 675;

export interface PostcardInfo {
  /** the player's sanitized room name; "" falls back to the game's own name */
  name: string;
  /** the public service-record tier label, e.g. "Finding its feet" */
  tier: string;
}

export async function makePostcard(
  app: Application,
  stage: Container,
  info: PostcardInfo
): Promise<Blob> {
  // Pixi's extractor renders the stage exactly as drawn, HUD-free. The stage
  // is small at fit scale (~360px wide), so ask for the resolution that makes
  // the room fill the card sharply instead of upscaling a thumbnail.
  const bounds = stage.getLocalBounds();
  const need = Math.max(2, Math.min(6, (W - 48) / Math.max(1, bounds.width)));
  const shot = app.renderer.extract.canvas({
    target: stage,
    resolution: need,
  }) as HTMLCanvasElement;

  const card = document.createElement("canvas");
  card.width = W;
  card.height = H;
  const g = card.getContext("2d")!;

  // warm card ground, a hair lighter than the page so the room pops
  g.fillStyle = "#241812";
  g.fillRect(0, 0, W, H);

  // the room, fitted with a margin band for the caption
  const pad = 24;
  const capH = 96;
  const availW = W - pad * 2;
  const availH = H - pad * 2 - capH;
  const scale = Math.min(availW / shot.width, availH / shot.height);
  const dw = shot.width * scale;
  const dh = shot.height * scale;
  g.imageSmoothingQuality = "high";
  g.drawImage(shot, (W - dw) / 2, pad + (availH - dh) / 2, dw, dh);

  // caption band
  const name = (info.name || "").trim() || "Domain Kitchen";
  const fontStack = "'Baloo 2', 'Segoe UI', system-ui, sans-serif";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = "#f3e9d2";
  g.font = `800 40px ${fontStack}`;
  g.fillText(name.toUpperCase(), pad + 8, H - capH / 2 - 14, W * 0.6);
  g.fillStyle = "#c9b79a";
  g.font = `700 22px ${fontStack}`;
  g.fillText(info.tier, pad + 8, H - capH / 2 + 22, W * 0.5);

  g.textAlign = "right";
  g.fillStyle = "#e8a13d";
  g.font = `800 26px ${fontStack}`;
  g.fillText("chef.web3guides.com", W - pad - 8, H - capH / 2 + 4);

  return new Promise<Blob>((resolve, reject) => {
    card.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

/** Share on platforms with a native sheet, download everywhere else. */
export async function sharePostcard(blob: Blob, name: string): Promise<"shared" | "saved"> {
  const file = new File([blob], "my-kitchen.png", { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean;
    share?: (d: { files: File[]; title?: string; text?: string }) => Promise<void>;
  };
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: name || "Domain Kitchen",
        text: "My restaurant runs on a real domain. chef.web3guides.com",
      });
      return "shared";
    } catch {
      // the player closed the sheet; fall through to a quiet download
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "my-kitchen.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "saved";
}
