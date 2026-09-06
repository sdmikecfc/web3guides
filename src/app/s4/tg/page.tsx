/**
 * /s4/tg — the Telegram Mini App entry (Phase 0, ADR-0030). This is the URL the
 * bot's Menu Button points at. Rendered inside Telegram's webview; the client
 * TgApp reads + verifies the Telegram session and routes into the reused game
 * surfaces (arcade / board / map). No PageShell chrome: the Mini App is its own
 * minimal surface.
 */
import { TgApp } from "./TgApp";

export const metadata = {
  title: "Launch Wars",
  description: "Play Launch Wars in Telegram.",
};

export default function S4TgPage() {
  return <TgApp />;
}
