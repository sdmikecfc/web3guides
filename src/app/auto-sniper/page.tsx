import type { Metadata } from "next";
import BotGuidePage from "@/components/BotGuidePage";

export const metadata: Metadata = {
  title: "Doma Auto-Sniper — Tier-Sized Launchpad Buys With An Auto Take-Profit Ladder | Web3 Guides",
  description:
    "An open-source, headless Python bot that snipes Doma launchpad tokens with tier-based sizing, fires the moment a launch goes live, and manages each position on a 5-rung take-profit ladder. Full setup guide + a live dashboard showing the bot running with real capital.",
};

export default function AutoSniperPage() {
  return (
    <BotGuidePage
      accent="#10b981"            // green — matches the dashboard's auto-sniper panel
      eyebrow="Open source · run it yourself"
      title="Doma Auto-Sniper"
      tagline="A headless bot that watches the Doma launch schedule, sizes each buy by tier, fires the moment a launchpad goes live, then manages every position on a 5-rung take-profit ladder with hard exits for dead launches and a Day-6 stop. It's the best-performing of my three public bots — and the most opinionated."

      what="The auto-sniper reads the public Doma launch schedule from a Google Sheet every six hours, classifies upcoming launches into tiers (Micro → Mega), and pre-calculates the buy size from your wallet balance. In the last five minutes before a launch goes live it tight-polls the Doma API once per second; the moment status flips to active, it fires a buy — but only if it can confirm it's the first buyer (or close enough to it on larger tiers). Once a position is open, the bot manages it on a five-rung take-profit ladder (1.15× / 1.30× / 1.50× / 2× / 3×), exits dead launches that don't move, walks away from churning bonding curves, and hard-stops anything still on the curve by Day-6. Every state change is recorded to SQLite so you can audit and reconcile."

      githubUrl="https://github.com/sdmikecfc/doma-auto-sniper"
      fullGuideUrl="https://github.com/sdmikecfc/doma-auto-sniper/blob/main/GUIDE.md"
      dashboardUrl="/dashboard"

      stats={[
        { label: "Capital sweet spot",   value: "$500–$2k",  sub: "Floor $200 · scales to $5k+ with tuning" },
        { label: "Snipes per day",       value: "2–6",        sub: "Varies with launch density" },
        { label: "Take-profit ladder",   value: "1.15× → 3×", sub: "5 rungs · partial sells at each" },
        { label: "VPS",                  value: "$6 / mo",    sub: "1 GB RAM Linux droplet" },
      ]}

      mechanics={[
        {
          icon: "📊",
          title: "Tier-based sizing",
          body:  "Every launch on the schedule is classified Micro → Tiny → Small → Medium → Large → XL → Mega and the buy size is calculated from your USDC.e balance times the tier multiplier. Most launches are Small or Tiny so the slippage cap usually dominates and you get clipped to $5–$15 — by design.",
        },
        {
          icon: "🎯",
          title: "5-rung take-profit ladder",
          body:  "Once a position opens, the bot sells 25% at 1.15×, then 25% at 1.30×, 20% at 1.50×, 15% at 2.0×, and the last 15% at 3.0×. The 1.15× rung exists because the data says that's where most launches actually top — you cap the rare 10× to harvest the common 1.15×. Real winners that graduate to a V3 pool are held and sold manually.",
        },
        {
          icon: "🛡️",
          title: "First-buyer protection + dead exits",
          body:  "Before firing, the bot reads the launchpad's USDC.e balance — if it's not first in on a Small tier, it skips entirely. After buying, it watches every position for stalled price action: dead at T+6h, slow-drain at T+3h, churn at T+24h, hard stop at Day-6. ~20–30% of snipes exit at a small loss; the winners pay for the losers.",
        },
      ]}

      steps={[
        {
          title: "Get a $6 Linux VPS",
          body:  "Ubuntu 22.04 LTS or 24.04 on DigitalOcean, Hetzner, Vultr, or Linode. 1 vCPU / 1 GB RAM is plenty. SSH key auth only.",
        },
        {
          title: "Generate a fresh, dedicated wallet",
          body:  "Never reuse your main wallet — the mnemonic lives in plaintext on the VPS. The guide includes a Python one-liner that mints a brand-new mnemonic + address in 5 seconds.",
        },
        {
          title: "Fund $200–$500 USDC.e + 0.005 ETH on Doma",
          body:  "USDC.e at 0x31EE…c477, ETH for gas. The bot's address must match the wallet you generated. Bridge or send from another wallet you control.",
        },
        {
          title: "Clone the repo and run the installer",
          body:  "git clone, create a venv, pip install, copy .env.example to .env and fill in the mnemonic + dashboard key. chmod 600 the .env. Takes 5–10 minutes total.",
        },
        {
          title: "Run the pre-live verification checks",
          body:  "balance check, schedule fetch, tier classifier dry-run, DB init, supervisor config — every check has a one-line command and an expected output. If any output drifts, stop and investigate before going live.",
        },
        {
          title: "Flip DRY_RUN=false and start supervisor",
          body:  "Three processes run under supervisor: scheduler, monitor, and (optionally) the FastAPI dashboard server. After it starts, tail the logs and wait for the first cycle — the bot will idle until the next scheduled launch.",
        },
        {
          title: "Monitor + reconcile",
          body:  "Open positions, daily P&L, and exit reasons all log to SQLite + supervisor logs. Run reconcile_balance.py weekly. Sell any V3-graduated tokens manually on doma.xyz — auto-sell on graduation is disabled by design.",
        },
      ]}

      risks={[
        {
          heading: "Capital floor of $200, sweet spot $500–$2k",
          body:    "Below $200 the slippage cap clips every Small-tier buy to $8–$12 and gas overhead eats most of the upside. The bot is built for $500–$2k where 2–6 daily snipes have enough headroom to find a winner. Below the floor it's burning capital, not earning it.",
        },
        {
          heading: "20–30% of snipes will exit dead",
          body:    "This is normal. The bot harvests the typical 1.05–1.20× post-launch pump on the majority of snipes and accepts small losses on the rest. A week with 5 dead exits and no winners is unpleasant but within expected variance — the 2× / 3× tail allocation drives most upside.",
        },
        {
          heading: "V3 graduation is NOT auto-handled",
          body:    "When a token graduates from the bonding curve to a V3 pool, the bot logs it and holds — the auto-sell flow is disabled because false-positive graduations from the Doma API have historically stranded tokens on the router. You sell those manually on doma.xyz.",
        },
        {
          heading: "The 1.15× rung caps your moonshot upside",
          body:    "On a real 10× runner you'll sell 25% of your position at 1.15× and miss the rest at the higher rungs. The data says this is positive EV across the full sample — but it will sting on the rare 10× you watch from the sidelines after the first sell.",
        },
        {
          heading: "No emergency exit button",
          body:    "Once DRY_RUN=false, the bot just trades. bash stop.sh halts new buys and the sell loop, but it doesn't close any open positions — those sit in the DB at whatever state they're in. Plan capital allocation accordingly.",
        },
      ]}

      // gpt-image-2 infographics — generated by generate_auto_sniper_images.py
      // and saved to /public. The image slots fall through to these when no
      // iframe / video is set.
      overviewImageUrl="/auto-sniper-overview.png"
      overviewImageCaption="The full lifecycle — schedule read → tier sizing → first-buyer fire → 5-rung ladder → dead/churn/Day-6 exits"
      setupImageUrl="/auto-sniper-setup.png"
      setupImageCaption="Setup workflow — VPS → fresh wallet → fund → install → verify → live"
      overviewVideoTitle="How the Auto-Sniper works"
      setupVideoTitle="Setup at a glance"
    />
  );
}
