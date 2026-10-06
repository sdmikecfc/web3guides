import type { Metadata } from "next";

const ORIGIN = "https://www.modelkombat.xyz";
const ART = {
  trading: {
    url: `${ORIGIN}/bots-art/social/model-kombat-trading-20261006-v1.png`,
    alt: "Model Kombat — Trade with bots. Climb the ranks. Shared token rewards and robot battles.",
  },
  games: {
    url: `${ORIGIN}/bots-art/social/model-kombat-games-20261006-v1.png`,
    alt: "Model Kombat — Build a robot. Play Arcade. Free browser games on desktop and mobile.",
  },
};

/** Override the parent education site's social card without changing other sites. */
export function modelKombatMetadata(
  path = "/",
  title = "Model Kombat — Trade with bots. Climb the ranks.",
  description = "Trade Doma domain tokens with Strategies or MCP to unlock shared token rewards. Build robots and play free browser mini-games. Eligibility and volume targets apply.",
  artwork: keyof typeof ART = "trading",
): Metadata {
  const image = ART[artwork];
  return {
    metadataBase: new URL(ORIGIN),
    title: { absolute: title },
    description,
    applicationName: "Model Kombat",
    authors: [{ name: "sdmike", url: "https://x.com/sdmikecm" }],
    creator: "sdmike",
    keywords: ["Model Kombat", "Doma", "robot fighting", "browser games", "trading competition"],
    alternates: { canonical: `${ORIGIN}${path}` },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: "Model Kombat",
      url: `${ORIGIN}${path}`,
      title,
      description,
      images: [{ ...image, width: 1672, height: 941, type: "image/png" }],
    },
    twitter: {
      card: "summary_large_image",
      creator: "@sdmikecm",
      title,
      description,
      images: [{ url: image.url, alt: image.alt }],
    },
  };
}
