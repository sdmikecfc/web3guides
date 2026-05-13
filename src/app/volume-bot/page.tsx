import type { Metadata } from "next";
import BotGuidePage from "@/components/BotGuidePage";

export const metadata: Metadata = {
  title: "Doma Volume Bot — Generate Trading Volume On Your Token | Web3 Guides",
  description:
    "An open-source, automated buy/sell bot that generates organic-looking trading volume on your Doma domain token's V3 pool. Full setup guide, honest cost math, and a live dashboard showing the bot running with real money.",
};

export default function VolumeBotPage() {
  return (
    <BotGuidePage
      accent="#10b981"            // green — same as auto-sniper accent on the dashboard
      eyebrow="Open source · run it yourself"
      title="Doma Volume Bot"
      tagline="An automated buy/sell bot that generates steady, organic-looking trading volume on your Doma domain token's V3 pool. You're not earning — you're paying for volume. This page explains exactly what it costs, exactly what it does, and exactly how to run it yourself in 30–60 minutes."

      what="The bot alternates small randomized buys and sells between USDC.e and your domain token on the same Uniswap V3 pool. Each swap is randomized in size and timing so the activity looks natural rather than mechanical. The result is a steady stream of real on-chain volume on your token — useful for leaderboards, perception, and getting picked up by DEX aggregators that prefer pools with consistent activity. Every swap costs the pool fee plus a tiny amount of slippage, so the bot's job is to produce that volume as efficiently and safely as possible — never to make money."

      githubUrl="https://github.com/sdmikecfc/doma-volume-bot"
      fullGuideUrl="https://github.com/sdmikecfc/doma-volume-bot/blob/main/GUIDE.md"
      dashboardUrl="/dashboard"

      stats={[
        { label: "Cost per $100 volume", value: "~$0.10",  sub: "On a 0.05% pool — most Doma tokens" },
        { label: "Daily target",         value: "$1k–$10k", sub: "Volume — tune to your budget" },
        { label: "VPS to run it",        value: "$4–$6/mo", sub: "1 GB RAM Linux droplet" },
        { label: "Setup time",           value: "30–60 min", sub: "First time, end-to-end" },
      ]}

      mechanics={[
        {
          icon: "🔁",
          title: "Alternating swaps",
          body:  "The bot picks a random USD amount in your configured range (e.g. $5–$25) and alternates between buying your token with USDC.e and selling it back. Direction flips each cycle so the wallet stays roughly balanced.",
        },
        {
          icon: "⏱️",
          title: "Randomized timing",
          body:  "Sleeps a random number of seconds (default 60–300) between swaps so the on-chain footprint doesn't look mechanical. Over a day this produces roughly 290–1,440 swaps depending on how the random ranges land.",
        },
        {
          icon: "🛡️",
          title: "Safety guards",
          body:  "Hard daily loss cap, minimum pool TVL check, max swap size as a percentage of pool TVL, and price-impact ceiling. The bot halts cleanly when any one of these trips, then resumes on the next UTC day.",
        },
      ]}

      steps={[
        {
          title: "Get a cheap Linux VPS",
          body:  "A $4–$6/month droplet from Hetzner, DigitalOcean, or Vultr is plenty. Any Linux VPS with 1 GB RAM will do. (Your own laptop works too if it stays awake 24/7.)",
        },
        {
          title: "Generate a fresh, dedicated wallet",
          body:  "Never reuse your main wallet. Generate a brand new mnemonic — the guide walks you through doing this in MetaMask or via a tiny Python script — and fund it with only what the bot needs.",
        },
        {
          title: "Find your pool info on doma.xyz",
          body:  "You'll need the pool address, token address, fee tier, and token decimals from your token's pool page. The guide has a checklist so you don't miss anything.",
        },
        {
          title: "Clone the repo and configure .env",
          body:  "git clone, pip install, copy .env.example to .env, fill in your wallet + pool info, and chmod 600 the file. The repo includes the full template with comments on every field.",
        },
        {
          title: "Fund the wallet",
          body:  "Send $50–$200 in USDC.e, the same in your domain token, and ~0.001 ETH for gas to the bot wallet on Doma chain. The guide includes one-line balance check commands.",
        },
        {
          title: "Dry run first — always",
          body:  "Run with DRY_RUN=true to confirm the bot connects, reads the pool correctly, picks swap sizes, and runs every safety check — without sending real transactions. This catches every config mistake before any money moves.",
        },
        {
          title: "Switch to live + add supervisor",
          body:  "Flip DRY_RUN=false, do one live swap and verify on-chain, then drop the included supervisor config into /etc/supervisor/conf.d/ so the bot stays up across reboots and crashes.",
        },
      ]}

      risks={[
        {
          heading: "The bot loses money by design",
          body:    "Every swap costs the pool fee (about $0.10 per $100 of round-trip volume on a 0.05% pool). You are buying volume, not earning it. The DAILY_LOSS_BUDGET_USD cap is your safety net — set it intentionally.",
        },
        {
          heading: "Use a fresh wallet — always",
          body:    "The seed phrase has to live in plaintext on the server in a .env file. If the server is ever compromised, that wallet is gone. Treat it as a hot wallet that only ever holds the small amount the bot needs.",
        },
        {
          heading: "Wash trading on your own token",
          body:    "Some community members will see steady on-chain volume as a sign of organic interest. Be honest about running a volume bot if asked. Don't let manufactured volume mislead anyone making real decisions.",
        },
        {
          heading: "Don't LP and volume-bot the same pool",
          body:    "You'd be paying fees to your own LP position, which is just churn — and your LP rebalances would partly offset the volume you're trying to generate. Pick one or the other.",
        },
        {
          heading: "Bad config can drain fast",
          body:    "A wrong fee tier or decimals value will fail every swap. A too-loose daily budget plus too-large swap sizes will burn through your USDC quickly. Read the guide end-to-end before going live and start with the conservative defaults.",
        },
      ]}

      overviewVideoTitle="Doma Volume Bot — what it does in 60 seconds"
      setupVideoTitle="Volume Bot setup — wallet to first swap"
    />
  );
}
