import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { VALID_SUBDOMAINS, SUBDOMAINS } from "@/lib/subdomains";
import type { ArticleVisual } from "@/types";

// Only allow internal calls via a secret key
const GENERATE_SECRET = process.env.GENERATE_SECRET ?? "";

// Subdomains that represent difficulty levels, not content topics — skip during bulk generation
const DIFFICULTY_SUBDOMAINS = new Set(["easy", "beginner", "medium", "advanced", "bigmike"]);

// Subdomains that get articles generated
const CONTENT_SUBDOMAINS = VALID_SUBDOMAINS.filter((s) => !DIFFICULTY_SUBDOMAINS.has(s));

type Difficulty = "beginner" | "intermediate" | "advanced";

interface GeneratedArticle {
  title: string;
  summary: string;
  content: string;
  tags: string[];
  difficulty: Difficulty;
  read_time_minutes: number;
  visuals: ArticleVisual[];
}

const DIFFICULTY_DISTRIBUTION: Difficulty[] = ["beginner", "intermediate", "advanced"];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 80);
}

/** Subdomain-specific factual context injected into the generation prompt */
const SUBDOMAIN_CONTEXT: Partial<Record<string, string>> = {
  doma: `
CRITICAL CONTEXT — use these facts exactly. Do NOT invent details or contradict them.

Doma Protocol (built by D3 Global) is the world's first DNS-compliant blockchain for tokenizing traditional internet domains (.com, .ai, .xyz, etc.) as programmable real-world assets. It is an EVM-compatible Layer 2 built on the OP Stack.

KEY FACTS:
- Doma tokenizes TRADITIONAL INTERNET DOMAINS (like software.ai, yourname.com) — NOT crypto subdomains or web3 naming
- $25M Series A led by Paradigm (Jan 2025); also Coinbase Ventures, Sandeep Nailwal (Polygon)
- Mainnet launched: November 25, 2025
- Testnet: 35M+ transactions, 1.45M addresses (June–Nov 2025)
- Mainnet stats: $38M+ volume, 3.2M+ transactions, 107,000+ tokenized domains, 25,500+ wallets
- Base marketplace launched Dec 18, 2025: buy/sell domains with USDC or ETH, 40M+ domain inventory
- CEO Fred Hsu: 25+ years domain industry; co-founded Oversee.net, Manage.com (acquired by Criteo)
- Registrar partners: InterNetX (22M+ domains), NicNames, EnCirca, Rumahweb, ConnectReseller, Interstellar

THE DUAL-TOKEN SYSTEM (core innovation):
- DOTs (Domain Ownership Tokens): ERC-20 representing title and transfer rights — tradeable 24/7 on DEXs
- DSTs (Domain Service Tokens): ERC-20 controlling DNS records and nameservers — keeps domain functional
- Separation means: sell ownership while website/email keeps working; or lease DNS control while holding title

DNS COMPLIANCE (key differentiator):
- Unlike ENS, Handshake, or Unstoppable Domains, Doma domains work on the normal internet
- No special browser extensions or resolvers needed
- Full ICANN compliance; works with existing registrars
- Doma is infrastructure, not a registrar itself

DOMAINFI CAPABILITIES:
- Fractionalization: lock domain NFT → mint 10,000 fungible ERC-20 tokens → trade on DEXs
  (Example: software.ai fractionalized into $SOFTWARE tokens)
- DeFi: use domain tokens as loan collateral, earn yield in liquidity pools, stake for rewards
- Cross-chain via LayerZero: Ethereum, Base, Solana, Avalanche, ENS
- 24/7 instant settlement; no escrow, no broker fees (traditional brokers charge 10–20%)
- Buyback mechanism: accumulate 90–95% of fractional tokens to reconstitute full domain NFT

NEW TLDs IN DEVELOPMENT: .SOL (Solana), .AVAX (Avalanche), .ANIME (Animecoin), .APE

DOMA FORGE: $1M USDC developer grant program at doma.xyz/forge

CRITICAL — DO NOT INCLUDE:
- There is NO "$DOMA token" or protocol-native token. NEVER mention $DOMA.
- Do NOT write about "web3guides subdomains" or "staking $DOMA for featured placement"
- Doma is NOT a registrar, NOT an alternative DNS namespace, NOT NFT-only
- Do NOT suggest Doma competes with traditional registrars — it partners with them

Where relevant, mention users can explore Doma at: https://app.doma.xyz/join/4urmvv4ouvvsu
`,
};

async function generateArticle(
  client: Anthropic,
  subdomain: string,
  topic: string,
  difficulty: Difficulty
): Promise<GeneratedArticle> {
  const difficultyInstructions = {
    beginner: `
AUDIENCE: New to crypto, not new to thinking. They've tried to learn this before and got lost in jargon. Write the explanation that finally makes it click.
TONE: Direct and confident. No forced enthusiasm, no cheerleading. Just clear thinking explained clearly.
VOICE:
- Treat the reader as intelligent. The topic is unfamiliar, not the person.
- Define every technical term the first time it appears — not as a textbook gloss, but woven into the sentence naturally
- When something is widely misunderstood, say so plainly: "This is where most explanations go wrong..."
- Never patronise. Never over-explain what's obvious. Only explain what genuinely isn't.
FORMAT:
- Open by stating exactly what this article covers and why it matters — no preamble
- Each ## section: a tight explanatory paragraph, then 3-5 specific bullets, then one "What this means practically:" line
- Numbered steps for any process — each step includes what you do and the reason the order matters
- Close with a "Quick recap" section: 3-4 sharp bullets summarising the core points
- Target length: 900–1100 words`,

    intermediate: `
AUDIENCE: Has bought crypto, used a wallet, maybe tried DeFi. Knows the vocabulary but often misuses it. Missing the mechanics behind what they're doing.
TONE: Straight, specific, no filler. Skip the 101. Go directly to the layer most guides skip.
VOICE:
- Acknowledge what they likely already know, then go past it
- Call out the common assumption that's slightly wrong: "The standard explanation says X — what's actually happening is Y"
- Use real protocol names, real numbers, real on-chain behaviour — not hypotheticals
- Credibility comes from specificity, not from hedging everything
FORMAT:
- Open with the specific problem or gap this article closes
- Each ## section: the real explanation (2-3 paragraphs) → specific details with actual numbers/protocols → one "⚠ Common mistake:" callout
- Steps include the reasoning — what breaks if you skip or reorder them
- Include "How to check this yourself" references: Etherscan, DeFiLlama, protocol dashboards
- Close with "Next steps" — 3-4 concrete directions to go deeper
- Target length: 1000–1300 words`,

    advanced: `
AUDIENCE: Deep in the space. Has read the docs, understands the protocols, follows the research. Write for the reader who will notice if you get something wrong.
TONE: Precise and dense. No setup, no context they already have. Get to the substance.
VOICE:
- Lead with the non-obvious angle — the edge case, the design trade-off, the thing most people in the space have backwards
- Every claim should be defensible. If there's uncertainty, be specific about what's uncertain and why.
- Acknowledge protocol limitations and failure modes honestly — the advanced reader trusts you more when you do
- Bullets carry information density. Not "X is important" — but "X does Y because of Z, which means..."
FORMAT:
- Open with the thesis or the under-examined angle — not background context
- Each ## section: mechanism → trade-offs → real-world behaviour → edge cases or implications
- At minimum one section on failure modes, known risks, or attack vectors — with specifics
- Steps are complete and sequenced with the reasoning for the sequence made explicit
- Close with "Verify / Go Deeper" — actual on-chain references, dashboards, or primary docs
- Target length: 1100–1400 words`,
  }[difficulty];

  const extraContext = SUBDOMAIN_CONTEXT[subdomain] ? `\n${SUBDOMAIN_CONTEXT[subdomain]}\n` : "";

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 5000,
    messages: [
      {
        role: "user",
        content: `You are a writer for web3guides.com. The site publishes accurate, no-filler crypto education. The standard is high: every claim is correct, every explanation earns its word count, nothing is padded.

You never fabricate facts, invent numbers, or guess at protocol behaviour. If something is genuinely uncertain, say so precisely. Accuracy is the floor, not the goal — the goal is accuracy plus clarity.

Write a guide article about: "${topic}"
Category: ${subdomain}
${extraContext}
${difficultyInstructions}

GLOBAL FORMAT RULES:
- Use ## for main sections (4–7 per article). Each section should be self-contained and digestible on its own.
- Use ### only when a sub-concept genuinely requires its own block
- Bullet points use "- " prefix. Every bullet must carry real information — cut any that don't
- Bold the first use of key terms with **double asterisks**
- Never write: "In conclusion", "It's worth noting", "As we can see", "Remember that", "It's important to understand", "Simply put", "At the end of the day"
- No rhetorical questions used as filler. If you ask a question, answer it in the same breath.
- Write like an expert who can also explain things — not like someone performing expertise
- NO raw code blocks (no triple-backtick fenced code). Explain what code does in plain English — never paste it. If a specific value matters (e.g. a gas cost, a parameter), state it inline as a fact, not as code.

VISUALS — Required: include a "visuals" array in the JSON.
Choose 2–4 visuals for the article. Place each after an ## section that genuinely suits that visual type.
Pick the type that fits — do not force a type that doesn't fit. Use "after_section" with the EXACT ## heading text.

Available types:

"stats" — 4 meaningful numbers about the topic. Use when real data exists.
  after_section: exact ## heading | items: [{value, label}] × 4
  value = short ("2.1M", "~4%", "$38M", "12s"). label = 3–6 plain-English words.
  Never invent numbers. Use approximations only if well-established and note with "~".

"comparison" — Two things compared side by side (e.g. two protocols, two approaches).
  after_section: exact ## heading
  left: {label, points: string[]} | right: {label, points: string[]}
  3–5 points each side. Parallel structure. Short, specific — no padding.

"steps" — A process with a clear sequence. Use when order genuinely matters.
  after_section: exact ## heading | heading: short title | items: [{step, detail}] × 3–6
  step = short verb phrase ("Deposit ETH"). detail = one specific sentence with real info.

"callout" — One important point that deserves to stand alone (warning, non-obvious insight, actionable tip).
  after_section: exact ## heading | variant: "warning" | "insight" | "tip"
  heading: short (4–7 words) | body: 1–3 sentences, accurate and specific.
  Use "warning" for risks/gotchas. "insight" for non-obvious truths. "tip" for practical actions.

"checklist" — What to verify, check, or prepare. Use for pre/post action checklists.
  after_section: exact ## heading | heading: short title | items: string[] × 4–7
  Each item is a short, specific, actionable statement.

Return ONLY valid JSON (no markdown fences, no extra text outside the JSON):
{
  "title": "Specific title that states what the reader will understand after reading. Not generic, not clickbait.",
  "summary": "2 sentences. What this covers. Why it matters or what changes after reading it. Under 200 chars total.",
  "content": "Full markdown article per all rules above",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "difficulty": "${difficulty}",
  "read_time_minutes": <integer 5–10>,
  "visuals": []
}`,
      },
    ],
  });

  const message = await stream.finalMessage();

  // Extract text from content blocks
  let rawText = "";
  for (const block of message.content) {
    if (block.type === "text") {
      rawText = block.text;
      break;
    }
  }

  // Parse JSON — strip any accidental markdown wrappers
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  const parsed = JSON.parse(jsonMatch[0]) as GeneratedArticle;
  return parsed;
}

export async function POST(req: NextRequest) {
  // Auth check
  const authHeader = req.headers.get("authorization");
  if (GENERATE_SECRET && authHeader !== `Bearer ${GENERATE_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    subdomain: requestedSubdomain,
    topic: requestedTopic,
    difficulty: requestedDifficulty,
    count: requestedCount = 1,
    dry_run = false,
  } = body as {
    subdomain?: string;
    topic?: string;
    difficulty?: Difficulty;
    count?: number;
    dry_run?: boolean;
  };

  // Cap at 10 per call to avoid timeout
  const articlesPerSubdomain = Math.min(Math.max(1, requestedCount), 10);

  const supabase = await createClient();
  const client = new Anthropic({ apiKey });

  const results: Array<{ subdomain: string; slug: string; title: string; status: string }> = [];
  const errors: string[] = [];

  const targetSubdomains = requestedSubdomain
    ? [requestedSubdomain]
    : CONTENT_SUBDOMAINS;

  for (const subdomain of targetSubdomains) {
    if (!VALID_SUBDOMAINS.includes(subdomain as any)) continue;
    const cfg = SUBDOMAINS[subdomain as keyof typeof SUBDOMAINS];
    if (!cfg) continue;

    // Get current count once, increment locally as articles are added
    const { count: dbCount } = await supabase
      .from("guides")
      .select("*", { count: "exact", head: true })
      .eq("subdomain", subdomain);

    let articleIndex = dbCount ?? 0;

    for (let i = 0; i < articlesPerSubdomain; i++) {
      try {
        const difficulty: Difficulty = requestedDifficulty
          ?? DIFFICULTY_DISTRIBUTION[articleIndex % DIFFICULTY_DISTRIBUTION.length];

        const topic = requestedTopic ?? buildTopic(subdomain, cfg.label, difficulty, articleIndex);

        const article = await generateArticle(client, subdomain, topic, difficulty);
        const slug = slugify(article.title);

        if (dry_run) {
          results.push({ subdomain, slug, title: article.title, status: "dry_run" });
          articleIndex++;
          continue;
        }

        const { data: existing } = await supabase
          .from("guides")
          .select("id")
          .eq("subdomain", subdomain)
          .eq("slug", slug)
          .single();

        const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

        const { error: insertError } = await supabase.from("guides").insert({
          subdomain,
          title: article.title,
          summary: article.summary,
          content: article.content,
          tags: article.tags,
          difficulty: article.difficulty,
          read_time_minutes: article.read_time_minutes,
          slug: finalSlug,
          source_url: `https://${subdomain}.web3guides.com/guides/${finalSlug}`,
          author: "Web3Guides AI",
          published_at: new Date().toISOString(),
          visuals: article.visuals ?? [],
        });

        if (insertError) {
          errors.push(`${subdomain}[${i + 1}]: ${insertError.message}`);
        } else {
          results.push({ subdomain, slug: finalSlug, title: article.title, status: "created" });
          articleIndex++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${subdomain}[${i + 1}]: ${msg}`);
      }
    }
  }

  return NextResponse.json({ results, errors, count: results.length });
}

/** Build a topic for a subdomain based on current article count (variety via rotation) */
function buildTopic(subdomain: string, label: string, difficulty: Difficulty, articleIndex: number): string {
  const topicsBySubdomain: Record<string, string[]> = {
    eth: [
      "How Ethereum Proof of Stake works after The Merge",
      "Understanding EIP-4844 and proto-danksharding",
      "Building your first Solidity smart contract",
      "Ethereum gas optimization techniques for 2025",
      "How the Ethereum Virtual Machine executes code",
      "ERC-20 vs ERC-721 vs ERC-1155 token standards explained",
      "Ethereum rollups: Optimistic vs ZK compared",
      "How to run an Ethereum validator node",
      "Account abstraction (EIP-4337) explained",
      "Ethereum MEV: What it is and how it affects you",
    ],
    btc: [
      "Bitcoin Lightning Network: instant payments explained",
      "How Bitcoin mining works in 2025",
      "Bitcoin Ordinals and inscriptions guide",
      "Understanding Bitcoin halving and its effects",
      "Self-custody: Setting up a Bitcoin hardware wallet",
      "Bitcoin Script: the basics of Bitcoin's programming language",
      "Taproot upgrade: what changed for Bitcoin",
      "How Bitcoin UTXO model differs from account model",
      "Bitcoin multisig wallets explained",
      "Running a Bitcoin full node: why and how",
    ],
    sol: [
      "Solana architecture: why it's fast and how it achieves it",
      "Building your first Solana program with Anchor",
      "Solana compressed NFTs: what they are and why they matter",
      "Understanding Solana's proof of history consensus",
      "SPL tokens: creating fungible tokens on Solana",
      "Solana DeFi ecosystem overview 2025",
      "Helium and DePIN on Solana explained",
      "Solana Firedancer validator client explained",
      "How Solana's account model works",
      "Solana NFT marketplaces comparison guide",
    ],
    defi: [
      "How automated market makers (AMMs) work",
      "Yield farming strategies for 2025",
      "Understanding liquidity pools and impermanent loss",
      "DeFi lending protocols: Aave vs Compound vs Morpho",
      "Flash loans: what they are and how they work",
      "Curve Finance and stablecoin liquidity explained",
      "Uniswap v4 hooks explained",
      "Real yield vs token emissions in DeFi",
      "DeFi security: common attack vectors and how to avoid them",
      "How to analyze DeFi protocol health metrics",
    ],
    staking: [
      "Ethereum solo staking guide for 2025",
      "Liquid staking: how stETH, rETH, and cbETH work",
      "EigenLayer restaking explained",
      "Staking rewards: how APY is calculated",
      "Centralized vs decentralized staking compared",
      "Slashing risks in Proof of Stake networks",
      "How to stake ETH with less than 32 ETH",
      "Cosmos ecosystem staking guide",
      "Polkadot staking and nomination explained",
      "Understanding validator MEV rewards",
    ],
    layer2: [
      "Optimism vs Arbitrum: a detailed comparison",
      "How ZK rollups achieve security without fraud proofs",
      "Base network: Coinbase's L2 explained",
      "zkSync Era architecture deep dive",
      "Polygon zkEVM vs Polygon PoS: what's the difference",
      "Layer 2 token bridges: how they work and risks",
      "The modular blockchain thesis explained",
      "StarkNet and STARK proofs explained",
      "Blast L2: native yield explained",
      "How to find the best L2 for your use case",
    ],
    security: [
      "How to avoid crypto phishing scams in 2025",
      "Hardware wallets: Ledger vs Trezor vs Coldcard",
      "Smart contract audit: what to look for",
      "Reentrancy attacks explained with examples",
      "How to safely use DeFi protocols: risk checklist",
      "Seed phrase security best practices",
      "Common NFT scams and how to spot them",
      "Multisig wallets: when and why to use them",
      "How bridge hacks happen and how to stay safe",
      "Crypto tax security: keeping records safely",
    ],
    rwa: [
      "Real world asset tokenization explained",
      "Tokenized US Treasuries: BlackRock BUIDL and competitors",
      "How real estate tokenization works",
      "MakerDAO and real world assets in DeFi",
      "Regulatory landscape for RWA tokenization 2025",
      "Tokenized private credit: opportunities and risks",
      "Ondo Finance and institutional RWA platforms",
      "How RWA oracle networks provide pricing data",
      "Carbon credits on blockchain explained",
      "The future of tokenized securities",
    ],
    bridge: [
      "How blockchain bridges work: a technical overview",
      "Lock-and-mint vs liquidity pools bridge models",
      "LayerZero and omnichain messaging explained",
      "Wormhole bridge architecture explained",
      "How to compare bridge security models",
      "Cross-chain swaps vs traditional bridges",
      "Axelar network: cross-chain communication protocol",
      "Canonical bridges vs third-party bridges",
      "How to minimize bridge risk when moving assets",
      "The future of interoperability: IBC vs message passing",
    ],
    legal: [
      "Crypto tax basics: what you need to know",
      "SEC vs CFTC: who regulates crypto in the US",
      "MiCA regulation: what it means for crypto in Europe",
      "Are NFTs securities? Legal analysis",
      "DAO legal structures: LLC wrappers and alternatives",
      "KYC/AML in DeFi: current requirements",
      "Crypto estate planning: securing assets for heirs",
      "Token sales and securities law in 2025",
      "Privacy coins and regulatory pressure",
      "Smart contract legal enforceability",
    ],
    tax: [
      "Crypto tax guide for US taxpayers 2025",
      "DeFi tax treatment: staking, yield, liquidity pools",
      "NFT tax guide: what's taxable and what's not",
      "Cost basis methods for crypto: FIFO vs HIFO",
      "IRS crypto reporting requirements explained",
      "Crypto tax software comparison 2025",
      "Cross-border crypto taxation basics",
      "Tax loss harvesting with crypto",
      "Crypto gifts and donations: tax implications",
      "Business crypto taxes: mining, trading, payments",
    ],
    easy: [
      "What is blockchain? A beginner's guide",
      "How to buy your first cryptocurrency safely",
      "What is a crypto wallet and how does it work",
      "DeFi explained in simple terms",
      "NFTs: what they are and why people buy them",
      "Bitcoin vs Ethereum: key differences explained",
      "What is Web3 and why does it matter",
      "How to set up MetaMask wallet step by step",
      "Gas fees explained: what they are and how to minimize them",
      "Crypto scam red flags every beginner should know",
    ],
    bigmike: [
      "Top crypto portfolio strategies for 2025",
      "On-chain analytics: how to read whale movements",
      "Macro factors affecting crypto markets",
      "How to evaluate new DeFi protocols before investing",
      "Crypto market cycles: bull vs bear patterns",
      "Building a diversified Web3 portfolio",
      "NFT market analysis: floor prices and volume metrics",
      "How to use DeFiLlama for protocol research",
      "Airdrops in 2025: how to qualify legitimately",
      "The most important crypto metrics to track",
    ],
    doma: [
      "What is Doma Protocol? How internet domains become tradeable blockchain assets",
      "DOTs vs DSTs: Doma Protocol's dual-token system explained",
      "DomainFi explained: using premium domains as DeFi collateral and yield assets",
      "Fractional domain ownership on Doma: how software.ai became tradeable tokens",
      "How Doma Protocol differs from ENS, Handshake, and Unstoppable Domains",
      "Buying and trading domains on the Base Names Marketplace with USDC",
      "How to tokenize a domain on Doma Protocol: step-by-step guide",
      "Domain investing meets blockchain: the DomainFi opportunity explained",
      "Doma Forge: building DomainFi applications and the $1M developer grant program",
      "Cross-chain domain portability: how LayerZero powers Doma's multi-chain strategy",
    ],
  };

  const topics = topicsBySubdomain[subdomain] ?? [
    `${label} fundamentals for ${difficulty} users`,
    `Advanced ${label} techniques and strategies`,
    `Getting started with ${label}`,
    `${label} security best practices`,
    `${label} ecosystem overview 2025`,
    `${label} use cases explained`,
    `${label} protocols comparison`,
    `${label} development guide`,
    `${label} market dynamics`,
    `${label} future outlook`,
  ];

  return topics[articleIndex % topics.length];
}
