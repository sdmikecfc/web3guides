# Web3 Guides — Claude Context Guide

Everything a new session needs to understand this project and pick up without losing context.

---

## Project Overview

**Web3 Guides** is a multi-subdomain crypto education site at `web3guides.com`. Each subdomain is a dedicated knowledge hub (e.g. `eth.web3guides.com`, `defi.web3guides.com`). Built on Next.js 14 App Router with Supabase as the backend. Deployed on Vercel.

**Owner:** Big Mike — in crypto since 2016, full-time since 2018 (community management), former calculus teacher in California, now travelling the world while building in Web3.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 App Router |
| Backend / DB | Supabase (Postgres) |
| Hosting | Vercel |
| Image storage | Supabase Storage bucket: `guide-images` |
| Article generation | Claude claude-opus-4-6 (Anthropic API) |
| Image generation | gpt-image-1.5 → fallback gpt-image-1 (OpenAI) |
| Styling | Inline CSS (no Tailwind) |
| Fonts | Bungee (headings), DM Sans (body), Space Mono (code/tags) |

---

## File Structure (key files)

```
web3guides/
├── src/
│   ├── app/
│   │   ├── [subdomain]/
│   │   │   ├── page.tsx              # Subdomain hub landing page
│   │   │   └── guides/[slug]/
│   │   │       └── page.tsx          # Individual article page
│   │   ├── about/page.tsx            # About page with Big Mike bio
│   │   ├── dashboard/page.tsx        # Admin dashboard (password protected)
│   │   │   └── DashboardClient.tsx   # Client-side dashboard UI
│   │   ├── tools/
│   │   │   ├── tax-calculator/
│   │   │   └── staking-calculator/
│   │   └── page.tsx                  # Root homepage
│   ├── components/
│   │   ├── ArticleVisual.tsx         # Renders structured AI visuals (stats/comparison/steps/callout/checklist)
│   │   ├── ArticleClient.tsx         # Client wrapper for article page
│   │   ├── ArticleAffiliatePanel.tsx # Affiliate link sidebar
│   │   └── RelatedArticles.tsx
│   ├── lib/
│   │   ├── guides.ts                 # getGuide(), getGuidesBySubdomain(), getRelatedGuides()
│   │   ├── subdomains.ts             # getSubdomainConfig() — subdomain metadata + accent colours
│   │   ├── parseArticleSections.ts   # Splits markdown into intro + sections array
│   │   ├── extractToc.ts             # Builds table of contents from headings
│   │   ├── affiliates.ts             # AFFILIATE_LINKS constant
│   │   └── supabase/
│   │       ├── server.ts             # createClient() for server components
│   │       └── client.ts             # createBrowserClient() for client components
│   └── types/                        # ArticleVisual type definitions
├── public/
│   └── bigmike.jpg                   # Big Mike photo used on About page
└── .env.local                        # See env vars section below

Desktop/
├── generate_superpremium.py          # Main article generator (6-pass pipeline)
└── add_images_to_articles.py         # Add/replace images on existing articles
```

---

## Environment Variables (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...           # Public anon key
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...        # MUST be sb_secret_... (not sb_publishable_)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DASHBOARD_PASSWORD=...                         # Password for /dashboard
NEXT_PUBLIC_ROOT_DOMAIN=web3guides.com
```

**CRITICAL:** `SUPABASE_SERVICE_ROLE_KEY` must be the **service role** key starting with `sb_secret_`, NOT the anon/publishable key. Get it from: Supabase dashboard → Project Settings → API → Service Role Secret. The anon key cannot write to storage or bypass RLS.

Both Python scripts load `.env.local` from `web3guides/.env.local` automatically.

---

## Supabase Schema (key tables)

### `guides` table
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| subdomain | text | e.g. "eth", "tax" |
| slug | text | URL slug |
| title | text | |
| summary | text | 2-3 sentence description |
| content | text | Full markdown with injected `![](url)` images |
| key_points | jsonb | Array of strings |
| tags | jsonb | Array of strings |
| visuals | jsonb | Array of ArticleVisual objects |
| difficulty | text | "beginner" / "intermediate" / "advanced" |
| published_at | timestamptz | |
| premium | boolean | true = flagship article |

### `affiliate_clicks` table
Tracks affiliate link clicks: `slug`, `clicked_at`, `referrer_path`, `subdomain`

### `email_signups` table
Email capture from forms.

### `guide-images` bucket (Supabase Storage)
Public bucket. Images stored as: `{subdomain}/{slug}/{idx}.png`
URL format: `{SUPABASE_URL}/storage/v1/object/public/guide-images/{subdomain}/{slug}/{idx}.png`

---

## Article Visual System

Structured visual components embedded in articles alongside the markdown content.

### Types
```typescript
type ArticleVisual =
  | { type: "stats";      after_section: string; items: { label: string; value: string; note?: string }[] }
  | { type: "comparison"; after_section: string; left: { label: string; points: string[] }; right: { label: string; points: string[] } }
  | { type: "steps";      after_section: string; items: { title: string; detail: string }[] }
  | { type: "callout";    after_section: string; variant: "tip"|"warning"|"info"; heading: string; body: string }
  | { type: "checklist";  after_section: string; title: string; items: string[] }
```

### How visuals get into articles
1. Generator embeds `[VISUAL:type:data]` markers in the markdown draft
2. `parse_visuals_from_content()` strips them out and builds the `visuals[]` JSON array
3. Both are saved to Supabase: `content` (clean markdown) and `visuals` (JSON array)
4. Article page renders visuals after each matching `## heading` via `ArticleVisualBlock`

### `ArticleVisual.tsx` — known crash fix
`ComparisonCard` was crashing with `TypeError: Cannot read properties of undefined (reading 'label')` when `left` was undefined in a malformed DB record.
**Fix already applied (line ~104):** `if (!left || !right) return null;`

---

## Article Generation Pipeline

### Script: `generate_superpremium.py`
Location: `C:\Users\Mike\Desktop\generate_superpremium.py`

**Usage:**
```powershell
# All flagship subdomains
python generate_superpremium.py

# Specific subdomains
python generate_superpremium.py eth btc sol
```

**6-Pass Pipeline:**
1. **Research** (claude-opus-4-6, extended thinking, ~10k tokens) — deep outline, facts, misconceptions
2. **Draft** (16k tokens) — pure markdown, no JSON, long-form prose. Embeds `[VISUAL:...]` markers for structured components
3. **Metadata** (2k tokens) — separate lightweight call to extract summary, key_points, tags
4. **Review** (3k tokens) — scores 1-10 on accuracy, depth, logic, UK relevance. If parse fails → score=0, forces revision
5. **Revise** (16k tokens) — only runs if score < 8 or review unparseable
6. **Images** (3-step, see below) — gpt-image-1.5 concept illustrations

**Flagship topics** (one per subdomain):
```python
FLAGSHIP_TOPICS = {
    "eth":      "How Ethereum Actually Works: EVM, Execution, Consensus and State Explained",
    "btc":      "Bitcoin: The Complete Technical and Economic Reference for 2026",
    "sol":      "Solana Deep Dive: Proof of History, Turbine, Gulf Stream and Why It's Fast",
    "defi":     "DeFi Explained: The Definitive Guide to Decentralised Finance Protocols and Risks",
    "layer2":   "Layer 2 Scaling: Rollups, Fraud Proofs, ZK Proofs and the Sequencer Problem",
    "security": "Crypto Security: The Complete Practical Guide to Protecting Your Assets in 2026",
    "rwa":      "Real World Assets on Blockchain: Tokenisation, Mechanics and the Regulatory Frontier",
    "bridge":   "Cross-Chain Bridges: How They Work, Why They Get Hacked and How to Stay Safe",
    "legal":    "Crypto Regulation 2026: The Complete UK and Global Legal Landscape",
    "tax":      "UK Crypto Tax 2025/26: The Definitive HMRC Guide Every Investor Needs",
    "staking":  "Crypto Staking: Validators, Liquid Staking, Real Yields and What the Numbers Mean",
    "doma":     "Doma Protocol: The Complete Guide to Tokenising Internet Domains as On-Chain Assets",
    "jobs":     "Web3 Jobs in 2026: Roles, Skills, Salaries and How to Break In Without a CS Degree",
}
```

**`doma` subdomain has hardcoded factual context** (critical — do not hallucinate Doma facts):
- Doma Protocol by D3 Global — DNS-compliant blockchain for tokenising traditional domains (.com, .ai, etc.)
- EVM-compatible L2 on OP Stack
- $25M Series A (Paradigm, Coinbase Ventures, Sandeep Nailwal)
- Mainnet: Nov 25 2025 | CEO: Fred Hsu
- Dual-token: DOTs (ownership/transfer) + DSTs (DNS control)
- Unlike ENS/Handshake — works on the normal internet, ICANN compliant

---

## Image Generation Pipeline (3-Step)

Both scripts (`generate_superpremium.py` AND `add_images_to_articles.py`) use the same 3-step system:

**Step 1 — `pick_image_spots()`**
Claude reads full section text (up to 800 chars per section) and selects the 8 sections that most benefit from a visual. Returns: heading, visual_goal, format type.

**Step 2 — `write_image_prompts()`**
Claude writes a full, detailed (150-250 word) image generation prompt for each spot. Style: rich dark backgrounds (deep navy/charcoal), vivid accent colours (electric blue, coral, amber, teal), editorial illustration style like Bloomberg or The Economist infographics. NOT white/bland corporate look.

**Step 3 — `generate_image()`**
Tries `gpt-image-1.5` first, falls back to `gpt-image-1` if model not available.
- Size: `1536x1024`
- Quality: `high`
- Returns base64 decoded bytes

**Image injection:** After generation, `inject_images()` inserts `![alt](url)` into the markdown content after the matching `## heading`. Matching is case-insensitive and whitespace-normalised so it doesn't silently fail.

### Script: `add_images_to_articles.py`
Location: `C:\Users\Mike\Desktop\add_images_to_articles.py`

Adds/replaces images on **existing** articles without regenerating the article text.

**Usage:**
```powershell
# All flagship subdomains except tax (already done)
python add_images_to_articles.py eth btc sol defi layer2 security rwa bridge legal staking doma jobs

# Specific subdomains
python add_images_to_articles.py eth btc

# Single article by slug
python add_images_to_articles.py --slug uk-crypto-tax-guide-2025
```

**Cost:** ~$0.64/article (8 images × ~$0.08 each via gpt-image-1.5)
**Skips:** Headings that already have an image injected

---

## Dashboard (`/dashboard`)

Password-protected admin page. Login via HTML form → Server Action sets `dash_auth=1` cookie (7 days, httpOnly).

**Password:** Set via `DASHBOARD_PASSWORD` env var. Default: `web3guides-admin`.

**Shows:**
- Affiliate click totals (total / last 7 days / last 30 days) per affiliate slug
- Top 10 referring paths
- Daily click sparkline (last 14 days)
- Total email signups
- Total guide count

**Bug history:** Dashboard login was previously broken — the form was submitting via GET, making the password visible in the URL. Fixed by using a Next.js Server Action (`action={loginAction}`) which POSTs properly and sets the cookie server-side.

---

## About Page (`/about`)

Shows Big Mike's bio with photo from `/public/bigmike.jpg`.

**Bio summary:**
- In crypto since 2016
- Full-time in crypto since 2018 — community management and helping people
- Former calculus teacher in California
- Travelling the world for the last 5 years while building in Web3
- Links to `bigmike.web3guides.com`

---

## Article Page Rendering

### `parseArticleSections.ts`
Splits markdown into:
- `intro`: everything before the first `## heading`
- `sections[]`: each `{ heading, body }` block

### `sectionToHtml()` (inside article page)
Custom markdown renderer (no external library). Handles:
- `# ## ###` headings
- `**bold**` `*italic*` `` `code` ``
- `[text](url)` links
- `![alt](url)` images
- ` ``` ` code blocks
- `> blockquotes`
- `- ` bullet lists
- Paragraph wrapping for plain text

**Safe link regex** (no backtracking): `\[([^\]]+)\]\(([^)]+)\)`

### Visual rendering
After each section renders, the page checks `guide.visuals` for any visual with `after_section` matching the section heading (case-insensitive) and renders `<ArticleVisualBlock>` below it.

---

## Known Issues / History

| Issue | Status | Fix |
|---|---|---|
| ComparisonCard crash (`left` undefined) | Fixed | `if (!left \|\| !right) return null` in ArticleVisual.tsx:104 |
| Dashboard password in URL | Fixed | Server Action replaces GET form |
| Silent review auto-approval on parse fail | Fixed | Parse fail → score=0, forces revision |
| Silent image injection miss (exact string match) | Fixed | Case-insensitive, whitespace-normalised match |
| Callout visual parser bug | Fixed | Split `after` on `\|` for variant, use `data` for heading\|body |
| Checklist visual parser bug | Fixed | Use `data.split("\|", 1)` not `rest` |
| Steps parser comma conflict | Fixed | Changed separator from `,` to `~` |
| Supabase service role key wrong type | Fixed | Must be `sb_secret_...` not `sb_publishable_...` |
| `gpt-image-1` model string typo | Fixed | `replace_all` turned it into `gpt-image-1.5.5` — corrected |
| JSON parse failure (max_tokens too small) | Fixed | 4000→6000 tokens for image prompt call |
| JSON parse failure (brittle regex) | Fixed | Brace-counting parser (not regex) in `extract_json()` |
| White/bland infographic images | Fixed | 3-step image pipeline with rich dark-style prompts |
| Generic images (headings only sent to planner) | Fixed | Full section body (800 chars) sent to both pick and prompt steps |

---

## Content Status (as of March 2026)

| Subdomain | Article generated | Images added |
|---|---|---|
| tax | Yes | Yes (first run — may need re-run with new 3-step prompts) |
| eth | No | — |
| btc | No | — |
| sol | No | — |
| defi | No | — |
| layer2 | No | — |
| security | No | — |
| rwa | No | — |
| bridge | No | — |
| legal | No | — |
| staking | No | — |
| doma | No | — |
| jobs | No | — |

---

## Common Commands

```powershell
# Run dev server
cd C:\Users\Mike\Desktop\web3guides
npm run dev

# Generate all flagship articles
python C:\Users\Mike\Desktop\generate_superpremium.py

# Generate specific subdomains
python C:\Users\Mike\Desktop\generate_superpremium.py eth btc

# Add images to existing articles (all except tax)
python C:\Users\Mike\Desktop\add_images_to_articles.py eth btc sol defi layer2 security rwa bridge legal staking doma jobs

# Add images to specific subdomain
python C:\Users\Mike\Desktop\add_images_to_articles.py eth

# Git workflow
git add -A
git commit -m "Your message"
git push
```

---

## `extract_json()` — Robust JSON Parser

Both Python scripts use a brace-counting parser (NOT regex) to extract JSON from Claude responses. This handles nested objects, special characters, and escaped strings correctly.

```python
def extract_json(text: str) -> dict:
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON found")
    depth = 0
    in_string = False
    escape = False
    end = start
    for i, ch in enumerate(text[start:], start):
        if escape:
            escape = False
            continue
        if ch == "\\" and in_string:
            escape = True
            continue
        if ch == '"' and not escape:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    raw = text[start:end + 1]
    raw = re.sub(r",\s*([\]}])", r"\1", raw)  # trailing comma cleanup
    raw = raw.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    return json.loads(raw)
```

Do NOT replace this with `re.search(r"\{[\s\S]*\}", ...)` — that approach silently fails on complex nested JSON.

---

## Visual Parser Markers (`generate_superpremium.py`)

The draft prompt asks Claude to embed visuals as `[VISUAL:type:data]` inline in the markdown.

**Separator rules (CRITICAL — do not change without updating both prompt and parser):**
- `stats`: items separated by `|`, each item `label:value:note`
- `comparison`: `leftLabel~leftPoints~rightLabel~rightPoints`, points separated by `|`
- `steps`: items separated by `|`, each item `title~detail` (tilde not comma — commas appear in detail text)
- `callout`: format `variant|heading|body`
- `checklist`: format `title|item1|item2|...`

---

## Doma Protocol Context (inject into any new doma article prompts)

Always use this verbatim context block — never let Claude hallucinate Doma facts:

- **What:** World's first DNS-compliant blockchain for tokenising traditional internet domains (.com, .ai, .xyz etc.) as programmable real-world assets
- **Chain:** EVM-compatible L2 on OP Stack
- **Funding:** $25M Series A — Paradigm (lead), Coinbase Ventures, Sandeep Nailwal (Polygon)
- **Mainnet:** November 25, 2025
- **CEO:** Fred Hsu — 25+ years domain industry, co-founded Oversee.net, Manage.com (acquired by Criteo)
- **Dual-token:** DOTs (ERC-20, ownership + transfer rights) + DSTs (ERC-20, DNS control). You can sell ownership while website stays live, or lease DNS while holding title.
- **Key differentiator vs ENS/Handshake:** Works on the NORMAL internet. Full ICANN compliance. No browser extensions needed.
- **Registrar partners:** InterNetX (22M+ domains), NicNames, EnCirca, Rumahweb, ConnectReseller, Interstellar
- **Testnet stats:** 35M+ transactions, 1.45M addresses
- **Mainnet stats:** $38M+ volume, 3.2M+ transactions, 107,000+ tokenized domains, 25,500+ wallets
