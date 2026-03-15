# Web3Guides — Crypto Education Network

A network of **14 crypto education subdomains** all served from one Next.js 14 codebase, powered by Supabase.

```
eth.web3guides.com       — Ethereum
sol.web3guides.com       — Solana
btc.web3guides.com       — Bitcoin
defi.web3guides.com      — DeFi
staking.web3guides.com   — Staking
layer2.web3guides.com    — Layer 2
bridge.web3guides.com    — Bridges
rwa.web3guides.com       — Real-World Assets
legal.web3guides.com     — Crypto Legal
tax.web3guides.com       — Crypto Tax
security.web3guides.com  — Security
easy.web3guides.com      — Easy Mode
beginner.web3guides.com  — Beginner Hub
bigmike.web3guides.com   — Big Mike
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS v3 (dark theme) |
| Routing | Middleware wildcard subdomain rewriting |
| Deployment | Vercel |
| Language | TypeScript |

---

## Project Structure

```
web3guides/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout (apex domain)
│   │   ├── page.tsx                      # Apex homepage — subdomain directory
│   │   ├── not-found.tsx                 # Global 404
│   │   ├── sitemap.ts                    # Dynamic XML sitemap
│   │   ├── robots.ts
│   │   ├── globals.css
│   │   └── [subdomain]/
│   │       ├── layout.tsx                # Per-subdomain layout + CSS vars
│   │       ├── page.tsx                  # Guide feed (ISR, paginated)
│   │       ├── loading.tsx               # Suspense skeleton
│   │       ├── not-found.tsx
│   │       └── guides/
│   │           └── [slug]/
│   │               ├── page.tsx          # Guide detail page
│   │               └── loading.tsx
│   ├── components/
│   │   ├── GuideCard.tsx                 # Main card: title/summary/difficulty/tags/source
│   │   ├── DifficultyBadge.tsx
│   │   ├── HeroSection.tsx
│   │   ├── SubdomainHeader.tsx
│   │   ├── SubdomainFooter.tsx
│   │   ├── FilterBar.tsx                 # Client-side difficulty + tag filter
│   │   └── GuideFeedSkeleton.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                 # Browser client
│   │   │   └── server.ts                 # Server / RSC client
│   │   ├── guides.ts                     # Data-fetching helpers
│   │   ├── subdomains.ts                 # All 14 subdomain configs
│   │   └── utils.ts
│   ├── types/
│   │   └── index.ts
│   └── middleware.ts                     # Wildcard subdomain to path rewrite
├── supabase/
│   ├── schema.sql                        # Full table + RLS definition
│   └── seed.sql                          # Sample guides for all 14 subdomains
├── vercel.json
├── next.config.ts
├── tailwind.config.ts
└── .env.local.example
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/yourname/web3guides.git
cd web3guides
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. In the SQL Editor, run `supabase/schema.sql`
3. Optionally run `supabase/seed.sql` to populate sample data
4. Copy your project URL and anon key

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
NEXT_PUBLIC_ROOT_DOMAIN=web3guides.com
NEXT_PUBLIC_DEV_ROOT_DOMAIN=localhost:3000
```

### 4. Run locally

```bash
npm run dev
```

To test subdomain routing locally, add these lines to `/etc/hosts`:

```
127.0.0.1  eth.localhost
127.0.0.1  sol.localhost
127.0.0.1  btc.localhost
127.0.0.1  defi.localhost
127.0.0.1  staking.localhost
127.0.0.1  layer2.localhost
127.0.0.1  bridge.localhost
127.0.0.1  rwa.localhost
127.0.0.1  legal.localhost
127.0.0.1  tax.localhost
127.0.0.1  security.localhost
127.0.0.1  easy.localhost
127.0.0.1  beginner.localhost
127.0.0.1  bigmike.localhost
```

Then visit `http://eth.localhost:3000` in your browser.

---

## Deploying to Vercel

### 1. Push to GitHub

```bash
git init && git add . && git commit -m "initial commit"
git remote add origin https://github.com/yourname/web3guides.git
git push -u origin main
```

### 2. Import project on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the repo
2. Add environment variables in the Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_ROOT_DOMAIN` = `web3guides.com`

### 3. Configure wildcard domain

In your Vercel project under **Settings > Domains**, add:

```
web3guides.com
*.web3guides.com
```

In your DNS provider, point:

| Type  | Name | Value                  |
|-------|------|------------------------|
| A     | @    | 76.76.21.21            |
| CNAME | *    | cname.vercel-dns.com   |

Vercel provisions TLS automatically for all subdomains via the wildcard cert.

### 4. Set Vercel secrets (for vercel.json references)

```bash
vercel secrets add supabase_url "https://your-project-ref.supabase.co"
vercel secrets add supabase_anon_key "your-anon-key"
```

---

## Adding Content

Insert guides via Supabase dashboard or SQL:

```sql
insert into guides (subdomain, title, summary, difficulty, tags, source_url, slug, read_time_minutes, author)
values (
  'eth',
  'Your Guide Title',
  'A one-paragraph summary.',
  'intermediate',
  ARRAY['tag1', 'tag2'],
  'https://external-source.com/your-article',
  'your-guide-slug',
  15,
  'Author Name'
);
```

Valid `subdomain` values: `eth` `sol` `btc` `defi` `staking` `layer2` `bridge` `rwa` `legal` `tax` `security` `easy` `beginner` `bigmike`

Valid `difficulty` values: `beginner` `intermediate` `advanced`

---

## Adding a New Subdomain

1. Add the config entry in `src/lib/subdomains.ts`
2. Add the key to the `SubdomainKey` union in `src/types/index.ts`
3. Add DNS + Vercel domain entries for the new subdomain
4. Insert guides with the new subdomain key in Supabase

---

## ISR and Caching

- Subdomain homepages revalidate every **60 seconds** (`export const revalidate = 60`)
- Guide detail pages revalidate every **120 seconds**
- On-demand revalidation: add a `/api/revalidate` route handler that calls `revalidatePath()`

---

## License

MIT
