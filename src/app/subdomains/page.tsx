import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get a Subdomain — Web3Guides",
  description: "Own your corner of the crypto education space. Step-by-step guide to claiming your web3guides.com subdomain on Doma.",
};

const STEPS = [
  {
    number: "01",
    title: "Connect your wallet on Doma",
    description: "Head to app.doma.xyz and connect your Web3 wallet (MetaMask, Rabby, WalletConnect, etc.).",
    link: { label: "Go to app.doma.xyz →", href: "https://app.doma.xyz" },
    color: "#7c6aff",
  },
  {
    number: "02",
    title: "Bridge to Doma Chain",
    description: "You'll need DOMA tokens to buy a subdomain. Use Relay to bridge from any major chain — it takes about 30 seconds.",
    link: { label: "Bridge via relay.link →", href: "https://relay.link/bridge/doma?toCurrency=0x31eef89d5215c305304a2fa5376a1f1b6c5dc477" },
    color: "#3b9eff",
  },
  {
    number: "03",
    title: "Buy web3guides.com tokens",
    description: "Subdomains are priced in web3guides.com tokens. Premium subdomains (like btc, eth, defi) range from 50–60 tokens. Browse what's still available.",
    link: { label: "View web3guides.com on Doma →", href: "https://app.doma.xyz/domain/web3guides.com" },
    color: "#00e5a0",
  },
  {
    number: "04",
    title: "Claim your subdomain",
    description: "Go to the subdomain claim page, search for the name you want (e.g. \"nfts\", \"gaming\", \"trading\"), and mint it to your wallet.",
    link: { label: "Claim your subdomain →", href: "https://app.doma.xyz/subdomain-claim/web3guides.com" },
    color: "#ff7c35",
  },
  {
    number: "05",
    title: "Set your DNS record",
    description: "Go to your subdomain's settings page on Doma → DNS Records tab. Add an A record pointing @ to 76.76.21.21 (Vercel's IP). This connects your subdomain to the Web3Guides platform.",
    link: { label: "Open Doma DNS settings →", href: "https://app.doma.xyz" },
    color: "#ffe135",
    code: {
      type: "A",
      name: "@",
      value: "76.76.21.21",
      ttl: "5m",
    },
  },
  {
    number: "06",
    title: "Message Mike on Discord",
    description: "Once your DNS is set, message sdmikecfc on Discord so he can enable your subdomain on the platform, add your content feed, and get you live.",
    link: { label: "Find sdmikecfc on Discord →", href: "https://discord.com" },
    color: "#ff5fa3",
  },
];

const AVAILABLE = [
  { key: "nfts",     emoji: "🎨", desc: "NFT guides, drops, and market analysis" },
  { key: "trading",  emoji: "📈", desc: "Technical analysis and trading strategies" },
  { key: "gaming",   emoji: "🎮", desc: "Web3 gaming, play-to-earn, and metaverse" },
  { key: "dao",      emoji: "🏛",  desc: "DAO governance, voting, and tooling" },
  { key: "zk",       emoji: "🔐", desc: "Zero-knowledge proofs and privacy tech" },
  { key: "mev",      emoji: "⚡", desc: "MEV, flashbots, and block building" },
  { key: "yield",    emoji: "💰", desc: "Yield farming and DeFi strategies" },
  { key: "wallets",  emoji: "👛", desc: "Wallet reviews, setup guides, and tools" },
];

export default function SubdomainsPage() {
  return (
    <div className="page-content min-h-screen">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <a href="/" className="font-display font-bold text-white text-lg hover:text-[#7c6aff] transition-colors">W3G</a>
        <a
          href="https://app.doma.xyz/subdomain-claim/web3guides.com"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full px-4 py-1.5 text-xs font-mono font-semibold text-white transition hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #7c6aff, #3b9eff)" }}
        >
          Claim now →
        </a>
      </nav>

      {/* Hero */}
      <section className="text-center px-6 pt-20 pb-14">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div style={{ position: "absolute", top: "-20vh", left: "50%", transform: "translateX(-50%)", width: "80vw", height: "60vh", background: "radial-gradient(ellipse at center, rgba(124,106,255,0.2) 0%, transparent 70%)", filter: "blur(60px)" }} />
        </div>
        <div className="relative mx-auto max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-mono"
               style={{ background: "rgba(124,106,255,0.12)", border: "1px solid rgba(124,106,255,0.3)", color: "#7c6aff" }}>
            <span className="h-1.5 w-1.5 rounded-full bg-[#00e5a0] animate-pulse" />
            Powered by Doma · On-chain subdomains
          </div>
          <h1 className="font-display font-extrabold tracking-tight text-white mb-4"
              style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)", lineHeight: 1.05, textShadow: "0 0 80px rgba(124,106,255,0.4)" }}>
            Own your corner of<br />
            <span style={{ color: "#7c6aff" }}>Web3 education</span>
          </h1>
          <p className="max-w-xl mx-auto text-lg leading-relaxed mb-8" style={{ color: "#6272a0" }}>
            Claim a subdomain on web3guides.com and launch your own crypto education hub.
            Subdomains are NFTs on Doma Chain — you truly own them.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://app.doma.xyz/subdomain-claim/web3guides.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl px-7 py-3.5 text-sm font-bold text-white transition hover:opacity-90 hover:scale-105"
              style={{ background: "linear-gradient(135deg, #7c6aff, #3b9eff)", boxShadow: "0 0 40px rgba(124,106,255,0.35)" }}
            >
              🌐 Claim your subdomain
            </a>
            <a
              href="#how-it-works"
              className="rounded-xl px-7 py-3.5 text-sm font-semibold transition hover:text-white"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#a0aec0" }}
            >
              How it works ↓
            </a>
          </div>
        </div>
      </section>

      {/* Pricing callout */}
      <section className="mx-auto max-w-4xl px-6 pb-14">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Standard subdomain", price: "~50 tokens", color: "#7c6aff" },
            { label: "Premium subdomain", price: "~60 tokens", color: "#3b9eff" },
            { label: "Your content, your rules", price: "Forever yours", color: "#00e5a0" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl p-5 text-center"
                 style={{ background: "rgba(13,17,32,0.7)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(16px)" }}>
              <p className="font-display text-2xl font-bold mb-1" style={{ color: item.color }}>{item.price}</p>
              <p className="text-sm" style={{ color: "#6272a0" }}>{item.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Available subdomains */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <h2 className="font-display text-2xl font-bold text-white mb-2">Available subdomains</h2>
        <p className="text-sm mb-6" style={{ color: "#6272a0" }}>These are unclaimed — first come, first served.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {AVAILABLE.map((item) => (
            <a
              key={item.key}
              href="https://app.doma.xyz/subdomain-claim/web3guides.com"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-xl p-4 transition-all hover:-translate-y-1"
              style={{ background: "rgba(13,17,32,0.7)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(16px)" }}
            >
              <div className="text-2xl mb-2">{item.emoji}</div>
              <p className="font-mono text-sm font-semibold text-white group-hover:text-[#7c6aff] transition-colors">{item.key}.web3guides.com</p>
              <p className="text-xs mt-1 line-clamp-2" style={{ color: "#6272a0" }}>{item.desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Step by step */}
      <section id="how-it-works" className="mx-auto max-w-4xl px-6 pb-20">
        <h2 className="font-display text-3xl font-bold text-white mb-2">How to claim in 6 steps</h2>
        <p className="mb-10" style={{ color: "#6272a0" }}>From zero to live subdomain in under 10 minutes.</p>

        <div className="flex flex-col gap-6">
          {STEPS.map((step, i) => (
            <div key={i} className="relative flex gap-5 rounded-2xl p-6"
                 style={{ background: "rgba(13,17,32,0.70)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(16px)" }}>
              {/* Left connector line */}
              {i < STEPS.length - 1 && (
                <div className="absolute left-[2.85rem] top-full w-px h-6 z-10"
                     style={{ background: `linear-gradient(to bottom, ${step.color}60, transparent)` }} />
              )}

              {/* Step number */}
              <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl font-mono text-sm font-bold"
                   style={{ background: `${step.color}18`, border: `1px solid ${step.color}40`, color: step.color }}>
                {step.number}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-display text-lg font-bold text-white mb-1">{step.title}</h3>
                <p className="text-sm leading-relaxed mb-3" style={{ color: "#6272a0" }}>{step.description}</p>

                {/* DNS code block */}
                {step.code && (
                  <div className="mb-3 rounded-xl p-4 font-mono text-xs"
                       style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <p style={{ color: "#6272a0" }} className="mb-2">DNS Record to add:</p>
                    <div className="grid grid-cols-4 gap-2">
                      <div><span style={{ color: "#6272a0" }}>Type</span><br /><span className="text-white">{step.code.type}</span></div>
                      <div><span style={{ color: "#6272a0" }}>Name</span><br /><span className="text-white">{step.code.name}</span></div>
                      <div><span style={{ color: "#6272a0" }}>Value</span><br /><span style={{ color: "#00e5a0" }}>{step.code.value}</span></div>
                      <div><span style={{ color: "#6272a0" }}>TTL</span><br /><span className="text-white">{step.code.ttl}</span></div>
                    </div>
                  </div>
                )}

                <a
                  href={step.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold transition hover:opacity-80"
                  style={{ color: step.color }}
                >
                  {step.link.label}
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Final CTA */}
        <div className="mt-10 rounded-2xl p-8 text-center"
             style={{ background: "linear-gradient(135deg, rgba(124,106,255,0.15), rgba(59,158,255,0.10))", border: "1px solid rgba(124,106,255,0.25)" }}>
          <h3 className="font-display text-2xl font-bold text-white mb-2">Ready to claim?</h3>
          <p className="mb-6" style={{ color: "#6272a0" }}>Start at step 1 — it takes less than 10 minutes.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://app.doma.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl px-7 py-3.5 text-sm font-bold text-white transition hover:opacity-90 hover:scale-105"
              style={{ background: "linear-gradient(135deg, #7c6aff, #3b9eff)", boxShadow: "0 0 30px rgba(124,106,255,0.3)" }}
            >
              Go to app.doma.xyz →
            </a>
            <a
              href="https://relay.link/bridge/doma?toCurrency=0x31eef89d5215c305304a2fa5376a1f1b6c5dc477"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl px-7 py-3.5 text-sm font-semibold transition hover:text-white"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#a0aec0" }}
            >
              Bridge to Doma first →
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm"
              style={{ borderColor: "rgba(255,255,255,0.05)", color: "#6272a0" }}>
        © {new Date().getFullYear()} Web3Guides ·{" "}
        <a href="/" className="hover:text-white transition-colors">← Back to home</a>
      </footer>
    </div>
  );
}
