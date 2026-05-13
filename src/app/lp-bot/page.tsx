import type { Metadata } from "next";
import BotGuidePage from "@/components/BotGuidePage";

export const metadata: Metadata = {
  title: "Doma LP Bot — Automated Concentrated Liquidity On Doma V3 | Web3 Guides",
  description:
    "An open-source bot that mints, rebalances, and compounds a concentrated Uniswap V3-style liquidity position on Doma. Earn trading fees 24/7 with built-in adaptive ranging. Full setup guide + a live dashboard showing the bot running with real capital.",
};

export default function LpBotPage() {
  return (
    <BotGuidePage
      accent="#a855f7"            // purple — matches the LP·SOFTWARE.ai panel on the dashboard
      eyebrow="Open source · run it yourself"
      title="Doma LP Bot"
      tagline="An automated concentrated-liquidity provider for Doma V3 pools. The bot mints a tight position around the live price, watches the pool every two seconds, rebalances when price drifts, and compounds earned fees back in every six hours. You provide capital and a pool — the bot does the rest, 24/7."

      what="The bot mints a Uniswap V3-style concentrated liquidity position around the current price of a USDC.e-paired Doma pool, then babysits it. Every couple of seconds it reads price from the pool contract. When price drifts close to the edge of your range, it burns the position, swaps both sides into the right ratio for the new tick, and re-mints. Every six hours it harvests trading fees the position has earned, swaps them into balance, and adds them back as more liquidity. The result is a position that stays roughly centered on the live market and grows itself from its own yield. The economics depend entirely on the pool you pick — pool choice is the single most important decision, and the guide spends real time on how to evaluate one."

      githubUrl="https://github.com/sdmikecfc/doma-lp-bot"
      fullGuideUrl="https://github.com/sdmikecfc/doma-lp-bot/blob/main/GUIDE.md"
      dashboardUrl="/dashboard"

      stats={[
        { label: "Suggested capital",  value: "$500–$2k",  sub: "Start small, scale once you trust it" },
        { label: "Fee tier sweet spot", value: "0.05%",    sub: "Most active Doma launchpad tokens" },
        { label: "Rebalances",         value: "0–10/day",  sub: "Adaptive — tighter range, more rebalances" },
        { label: "Setup time",         value: "60–90 min", sub: "First time, end-to-end" },
      ]}

      mechanics={[
        {
          icon: "🎯",
          title: "Concentrated minting",
          body:  "The bot mints a V3 NFT position with a tight tick range around the current pool price. Tighter range = higher concentration multiplier = more fees per dollar deployed — as long as price stays inside the range.",
        },
        {
          icon: "🔄",
          title: "Adaptive rebalancing",
          body:  "Every 2 seconds it checks how close price is to your range edge. When price drifts past the configurable proximity threshold (default 50% to edge), it burns, rebalances both sides via swap, and re-mints around the new tick.",
        },
        {
          icon: "💰",
          title: "Auto-compounding",
          body:  "Every 6 hours the bot calls collect() on the position, swaps fees into the right token ratio, and adds them back via increaseLiquidity. Earnings compound into the position automatically — no manual harvesting needed.",
        },
      ]}

      steps={[
        {
          title: "Pick a pool worth LPing in",
          body:  "The most important step. Look for TVL > $20k, 24h volume > $10k, and a volume/TVL ratio > 0.5 on doma.xyz/explore. Avoid dead pools and ultra-new tokens — the guide has a full evaluation checklist.",
        },
        {
          title: "Get a Linux VPS",
          body:  "A $6/month Ubuntu droplet (DigitalOcean, Hetzner, Vultr) with 1 GB RAM is plenty. The bot polls the pool every 2 seconds, so a machine that's online 24/7 is non-negotiable.",
        },
        {
          title: "Generate a fresh, dedicated wallet",
          body:  "Never reuse your main wallet — the seed phrase will live on the server in plaintext. The guide shows you how to mint a brand-new mnemonic that has never touched any other application.",
        },
        {
          title: "Clone the repo + configure .env",
          body:  "git clone, pip install, then walk through the .env template field by field: wallet, RPC, pool address, fee tier, range tightness, compound interval, and the dashboard API toggle.",
        },
        {
          title: "Do the one-time Permit2 setup",
          body:  "The bot's swap and mint paths both need Permit2 approvals on USDC.e and your token. The repo includes a script that sets them up in two transactions — you only do this once per token.",
        },
        {
          title: "Fund and dry-run",
          body:  "Send your USDC.e + ETH for gas to the bot wallet. Run with DRY_RUN=true first to confirm everything connects, the pool reads correctly, and the proposed mint looks sane — no funds move.",
        },
        {
          title: "Mint the live position",
          body:  "Flip DRY_RUN=false, watch the first mint go through, verify the NFT position on-chain, then drop the supervisor config in place so the bot stays up across reboots and crashes.",
        },
      ]}

      risks={[
        {
          heading: "Impermanent loss is real",
          body:    "When the non-USDC.e token moves significantly, your position ends up holding more of the worse-performing side. The bot's compounded fee income offsets IL — sometimes fully, sometimes not. Big price moves can leave you net-down vs simply holding the two tokens.",
        },
        {
          heading: "Rebalance churn in volatile pools",
          body:    "Every rebalance costs swap fees + gas. In a violently moving pool, a tight range can rebalance every few minutes and bleed equity faster than fees come in. The adaptive range feature mitigates this but cannot eliminate it — picking a healthy pool matters more than any setting.",
        },
        {
          heading: "Pool can die",
          body:    "If volume dries up (token rugs, attention shifts, narrative dies), your bot keeps holding the position earning $0 while small gas costs slowly drain. The bot does not auto-exit a dead pool — you have to decide and run exit_position.py.",
        },
        {
          heading: "Custodial risk",
          body:    "Your mnemonic sits in a .env file on your server in plaintext. If anyone gains shell access, they get the wallet. Use a fresh mnemonic, SSH keys only, fail2ban, and don't store your main wallet seed anywhere near this machine.",
        },
        {
          heading: "Smart contract risk",
          body:    "Uniswap V3 contracts are battle-tested over many years and many billions of dollars. The Doma deployment of the Universal Router and NFT Position Manager is a fork of the same code. Risk is small but not zero — don't deploy life-changing capital.",
        },
      ]}

      overviewVideoTitle="Doma LP Bot — what it does in 60 seconds"
      setupVideoTitle="LP Bot setup — pool picking to first mint"
    />
  );
}
