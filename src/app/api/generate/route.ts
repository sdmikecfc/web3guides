import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { VALID_SUBDOMAINS, SUBDOMAINS } from "@/lib/subdomains";

// Only allow internal calls via a secret key
const GENERATE_SECRET = process.env.GENERATE_SECRET ?? "";

type Difficulty = "beginner" | "intermediate" | "advanced";

interface GeneratedArticle {
  title: string;
  summary: string;
  content: string;
  tags: string[];
  difficulty: Difficulty;
  read_time_minutes: number;
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

async function generateArticle(
  client: Anthropic,
  subdomain: string,
  topic: string,
  difficulty: Difficulty
): Promise<GeneratedArticle> {
  const difficultyDesc = {
    beginner: "beginner-friendly (no prior crypto knowledge required), use simple analogies and avoid jargon",
    intermediate: "intermediate level, assume basic crypto familiarity, explain technical concepts clearly",
    advanced: "advanced level, assume solid Web3 knowledge, cover technical depth and edge cases",
  }[difficulty];

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Write a comprehensive Web3 guide article about: "${topic}" for the ${subdomain} category.

The article must be ${difficultyDesc}.

Return ONLY valid JSON (no markdown, no code blocks) with these exact fields:
{
  "title": "Article title (engaging, SEO-friendly)",
  "summary": "2-3 sentence summary (under 200 chars)",
  "content": "Full markdown article (800-1200 words). Use ## headings, bullet points, and practical examples.",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "difficulty": "${difficulty}",
  "read_time_minutes": <number between 4 and 10>
}

Make the content accurate, educational, and up-to-date with current Web3 practices as of 2025.`,
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
    dry_run = false,
  } = body as {
    subdomain?: string;
    topic?: string;
    difficulty?: Difficulty;
    dry_run?: boolean;
  };

  const supabase = await createClient();
  const client = new Anthropic({ apiKey });

  const results: Array<{ subdomain: string; slug: string; title: string; status: string }> = [];
  const errors: string[] = [];

  // Determine which subdomains to target
  const targetSubdomains = requestedSubdomain
    ? [requestedSubdomain]
    : VALID_SUBDOMAINS;

  for (const subdomain of targetSubdomains) {
    if (!VALID_SUBDOMAINS.includes(subdomain as any)) continue;
    const cfg = SUBDOMAINS[subdomain as keyof typeof SUBDOMAINS];
    if (!cfg) continue;

    try {
      // Check article count for this subdomain
      const { count } = await supabase
        .from("guides")
        .select("*", { count: "exact", head: true })
        .eq("subdomain", subdomain);

      const currentCount = count ?? 0;

      // Pick difficulty — rotate through difficulties for balance
      const difficulty: Difficulty = requestedDifficulty
        ?? DIFFICULTY_DISTRIBUTION[currentCount % DIFFICULTY_DISTRIBUTION.length];

      // Pick topic
      const topic = requestedTopic ?? buildTopic(subdomain, cfg.label, difficulty, currentCount);

      // Generate article
      const article = await generateArticle(client, subdomain, topic, difficulty);

      const slug = slugify(article.title);

      if (dry_run) {
        results.push({ subdomain, slug, title: article.title, status: "dry_run" });
        continue;
      }

      // Check slug uniqueness
      const { data: existing } = await supabase
        .from("guides")
        .select("id")
        .eq("subdomain", subdomain)
        .eq("slug", slug)
        .single();

      const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

      // Insert into Supabase
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
      });

      if (insertError) {
        errors.push(`${subdomain}: ${insertError.message}`);
      } else {
        results.push({ subdomain, slug: finalSlug, title: article.title, status: "created" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${subdomain}: ${msg}`);
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
      "Top crypto portfolios strategies for 2025",
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
