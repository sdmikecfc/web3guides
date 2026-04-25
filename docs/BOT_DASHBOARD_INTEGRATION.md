# Web3 Guides Bot ↔ Dashboard Integration

**Audience:** A developer (or AI agent) building a new bot that wants to surface its data on the Web3 Guides public dashboard at `web3guides.com/dashboard`.

**Purpose:** Document exactly how the existing **auto-sniper bot** integrates so any new bot (LP bot, arb bot, whatever) can mirror the pattern cleanly. Read this end-to-end before writing any code — the conventions are tight on purpose so multiple bots can coexist on one dashboard without fighting.

---

## 1. Architecture Overview

```
┌──────────────────────┐       ┌─────────────────────┐       ┌──────────────────────┐
│  Bot droplet         │       │  Next.js (Vercel)   │       │  Browser             │
│  DigitalOcean        │       │  web3guides.com     │       │  /dashboard          │
│  143.110.183.157     │       │                     │       │                      │
│                      │       │                     │       │                      │
│  FastAPI (api.py)    │◄──────┤  /api/bot           │◄──────┤  fetch("/api/bot")   │
│  port 5001           │  HTTP │  /api/bot-logs      │  HTTP │  every 30s           │
│  X-API-Key auth      │       │  (server proxies)   │       │  cache: "no-store"   │
└──────────────────────┘       └─────────────────────┘       └──────────────────────┘
```

**Why a proxy layer?**
- Hides the API key from the browser (key lives only in Vercel env vars)
- Avoids CORS configuration on the droplet
- Lets us add `Cache-Control: no-store` to defeat Vercel edge caching
- Lets us swap the upstream bot's host/port without touching the frontend

**Bot is responsible for:**
- Running the actual bot logic
- Persisting its own state (JSON file, SQLite, whatever)
- Exposing read-only HTTP endpoints with API-key auth
- Returning JSON in the agreed shape

**Dashboard is responsible for:**
- Polling the proxy endpoints
- Rendering the UI
- Computing derived metrics (P&L %, APY, equity curves) client-side
- Refreshing on a timer

The bot **never** writes to a Supabase table, calls Vercel, or pushes data anywhere. It's a pure read-only HTTP server.

---

## 2. Auth Pattern

**Single header, single key per environment.**

```
X-API-Key: <secret>
```

The key lives in `.env.local` on the Next.js side as `BOT_API_KEY`. The bot reads its own copy from environment / `.env`. They must match.

**FastAPI reference implementation** (extract from the auto-sniper's `api.py`):

```python
from fastapi import FastAPI, Header, HTTPException, Security
from fastapi.security import APIKeyHeader
import os

API_KEY        = os.environ["API_KEY"]
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

def require_key(key: str = Security(api_key_header)):
    if key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return key

app = FastAPI()

@app.get("/api/lp/state")
def lp_state(key: str = Security(require_key)):
    ...
```

**Important gotchas the auto-sniper hit during setup:**
1. Use `Security(require_key)` — *not* a manual `verify_key()` call. Saves a NameError.
2. Import `Header` from `fastapi` if you reference it anywhere — easy to miss.
3. Don't call `verify_key()` directly inside endpoints — let `Security()` handle it.

---

## 3. Existing Bot Endpoints (auto-sniper) — for reference

These are live on the droplet right now. **Confirm shape parity before deviating.**

### `GET /api/bot/summary`

```json
{
  "state": {
    "usdc_balance": 36.02,
    "total_deployed": 72.50,
    "total_value": 108.52,
    "total_pnl": 8.03,
    "updated_at": "2026-04-25T17:00:00Z"
  },
  "positions": [
    {
      "symbol": "yentoken.com",
      "side": "long",
      "usdc_spent": 30.00,
      "entry_price": 0.007618,
      "mark_price": 0.007564,
      "unrealized_pnl": -0.21
    }
  ],
  "trades": [
    {
      "symbol": "olivecapital.xyz",
      "side": "sell",
      "executed_at": "2026-04-25T09:02:00Z",
      "usdc_amount": 2.53,
      "price": 0.001533,
      "pnl": 0.03
    }
  ]
}
```

### `GET /api/bot/logs/{process}?lines=100`

`process` is `scheduler` or `monitor` (the two systemd services). Returns:

```json
{
  "process": "scheduler",
  "lines": [
    "2026-04-25 17:00:00 INFO  [stablebanx.com] BUY recorded — $2.50 spent",
    "2026-04-25 17:00:01 INFO  [stablebanx.com] BUY launchpad confirmed in block 9573922",
    "..."
  ]
}
```

Lines are returned **oldest-first**. The frontend reverses them for newest-first display.

---

## 4. Frontend Proxy Layer

Each bot endpoint gets a Next.js API route that forwards the request and adds the auth header server-side.

**`src/app/api/bot/route.ts`** (the auto-sniper's summary proxy — full file):

```typescript
import { NextResponse } from "next/server";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

const BOT_BASE = "http://143.110.183.157:5001";

export async function GET() {
  const key = process.env.BOT_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "BOT_API_KEY not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${BOT_BASE}/api/bot/summary`, {
      headers: { "X-API-Key": key },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Bot returned ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch {
    return NextResponse.json({ error: "Bot unreachable" }, { status: 503 });
  }
}
```

**Pattern rules — copy these verbatim for new bot proxies:**

1. `export const dynamic = "force-dynamic"` and `revalidate = 0` — kills static optimisation
2. `cache: "no-store"` on the upstream fetch — defeats Next's data cache
3. `Cache-Control: no-store, no-cache, must-revalidate` on the response — defeats Vercel edge cache
4. Three error states with distinct status codes:
   - `500` if the env var is missing (config error, our fault)
   - `502` if the bot returned non-2xx (bad gateway, bot's fault)
   - `503` on connection failure (unreachable, droplet down)
5. Never throw — always return a JSON `{ error }` shape

**Logs proxy follows the same shape but accepts query params** — see `src/app/api/bot-logs/route.ts`. Note: name your local variable `proc` not `process` — the latter clashes with Node's global and Vercel will fail the build with a cryptic error.

---

## 5. Frontend Fetch Pattern

Inside the dashboard client component:

```typescript
async function fetchBot() {
  setRefreshing(true);
  try {
    const res  = await fetch("/api/bot", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? `Error ${res.status}`); return; }
    setData(json);
    setError(null);
    setLastUpdated(new Date());
  } catch { setError("Bot unreachable"); }
  finally  { setLoading(false); setRefreshing(false); }
}

useEffect(() => {
  fetchBot();
  const t = setInterval(fetchBot, 30_000);   // 30s for state, 15s for logs
  return () => clearInterval(t);
}, []);
```

**Refresh cadence convention:**
- State summaries: **30 seconds**
- Logs: **15 seconds**
- Anything that changes infrequently (config, schemas): on-mount only, no polling

**Loading / error / empty states** are mandatory. The dashboard UX assumes every panel can be:
- `loading` (no data yet, spinner / skeleton)
- `error` (the panel shows a soft red error pill, not an exception)
- `empty` (data fetched, but zero rows — show an empty state, not a broken table)
- `data` (happy path)

---

## 6. TypeScript Shapes (auto-sniper's actual types)

From `src/app/dashboard/DashboardClient.tsx`:

```typescript
interface BotState {
  usdc_balance?:    number;
  total_deployed?:  number;
  total_value?:     number;
  total_pnl?:       number;
  updated_at?:      string;       // ISO 8601
  [k: string]: unknown;
}

interface BotPosition {
  symbol?:         string;
  side?:           string;        // "long" | "short" | etc.
  usdc_spent?:     number;
  entry_price?:    number;
  mark_price?:     number;
  unrealized_pnl?: number;
  [k: string]: unknown;
}

interface BotTrade {
  symbol?:       string;
  side?:         string;          // "buy" | "sell"
  executed_at?:  string;          // ISO 8601
  usdc_amount?:  number;          // notional spent on this trade
  price?:        number;
  pnl?:          number;          // realised P&L on closing trades, omitted on opening trades
  [k: string]: unknown;
}

interface BotSummary {
  state?:     BotState;
  positions?: BotPosition[];
  trades?:    BotTrade[];
  [k: string]: unknown;
}
```

**Naming conventions to match:**
- `snake_case` field names in JSON (FastAPI default, what the existing bot uses)
- All amounts in **USDC.e** unless explicitly suffixed (`*_eth`, `*_usd`, etc.)
- All timestamps in **ISO 8601 UTC** (`2026-04-25T17:00:00Z`)
- All prices as **decimal numbers**, not strings — frontend formats them
- All percentages as **decimals** (0.0852 = 8.52%), or as already-multiplied (8.52). Pick one and document it on the field. Auto-sniper uses already-multiplied (`pnl: 0.03` means $0.03 not 3%).
- `[k: string]: unknown` on every interface — extra fields don't break the frontend

---

## 7. File Map

```
web3guides/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── bot/route.ts          ← summary proxy (auto-sniper)
│   │   │   └── bot-logs/route.ts     ← logs proxy (auto-sniper)
│   │   │   ★ NEW: lp/route.ts        ← your LP state proxy
│   │   │   ★ NEW: lp-logs/route.ts   ← your LP logs proxy (if you have logs)
│   │   │
│   │   └── dashboard/
│   │       ├── page.tsx              ← server component (Supabase fetches only)
│   │       └── DashboardClient.tsx   ← client component (1,200+ lines)
│   │
│   └── components/
│       └── (shared bits — VideoEmbed, GuideCard, etc.)
│
├── docs/
│   └── BOT_DASHBOARD_INTEGRATION.md  ← this file
│
└── .env.local                        ← BOT_API_KEY=...
                                        ★ NEW: LP_BOT_API_KEY=...
```

**Where to add the new LP UI section:**

`DashboardClient.tsx` is structured as standalone `<section>` blocks composed in the main return. Each bot gets its own section. Look for the comment `{/* ── Sections ─── */}` near the bottom of the main `DashboardClient` export — that's the composition point.

```typescript
<BotPanel />        {/* auto-sniper */}
<BotLogs />         {/* auto-sniper logs */}
<LPPanel />         {/* ★ your new section, mirrors BotPanel structure */}
<SupportCard />
<SiteSnapshot />
```

**Read `BotPanel` end-to-end before writing `LPPanel`.** It demonstrates:
- Polling pattern with `useEffect` + `setInterval`
- Live/offline pulse indicator
- Hero card with big number + animated SVG background (orbs + grid)
- Stat grid with `MiniStat` cells
- The `EquityChart` SVG component
- A position table (CoinGecko-inspired, full-width, hover highlight)
- A trades feed (grouped by Today / Yesterday / Date)

Reuse `MiniStat`, `DataCard`, `PanelHead`, `Empty`, `SideBadge`, `Tag`, `Pulse`, `EquityChart` — they're already in that file and styled to match.

---

## 8. Recommended LP Bot Endpoints (proposed)

Mirror the auto-sniper's grouping: one summary endpoint that returns *everything* the dashboard needs in a single round-trip. Sub-endpoints are useful for debugging but the dashboard should hit one URL per refresh cycle.

### `GET /api/lp/summary`

```json
{
  "state": {
    "total_value":         512.40,
    "deployed_in_lp":      480.00,
    "idle_balance":         32.40,
    "total_fees_earned":    14.62,
    "total_il":             -3.20,
    "total_pnl":            11.42,
    "active_positions":     3,
    "rebalance_count":      8,
    "updated_at":           "2026-04-26T12:00:00Z",
    "first_deployed_at":    "2026-04-08T04:00:00Z"
  },
  "positions": [
    {
      "id":              "pos_a3f2",
      "pool":            "USDC/ETH",
      "protocol":        "Uniswap V3",
      "chain":           "base",
      "fee_tier":        0.0005,
      "range_low":       1900.00,
      "range_high":      2100.00,
      "current_price":   1985.42,
      "in_range":        true,
      "liquidity_usd":   180.00,
      "fees_earned_usd":   4.21,
      "impermanent_loss":-1.10,
      "net_pnl":          3.11,
      "opened_at":       "2026-04-22T10:00:00Z"
    }
  ],
  "rebalances": [
    {
      "executed_at":  "2026-04-25T14:00:00Z",
      "pool":         "USDC/ETH",
      "from_range":   [1850, 2050],
      "to_range":     [1900, 2100],
      "reason":       "price_drift",
      "gas_usd":      0.42,
      "fees_collected": 1.85
    }
  ]
}
```

### `GET /api/lp/logs/{process}?lines=100`

Same shape as auto-sniper logs. `process` enum is whatever services you run.

**Field-level notes:**
- Booleans are real booleans (`true`/`false`), never `"true"` strings
- IDs prefixed by type (`pos_`, `tx_`, `rb_`) — makes log-grepping easier later
- Always include `updated_at` on the top-level state — the dashboard uses it for the "Bot wrote: 30s ago" indicator
- Always include `first_deployed_at` if you want the "Time Running" + "APY" cards to work — the auto-sniper uses a hard-coded `FIRST_LAUNCH` constant in the frontend, but exposing it on `state` is cleaner

---

## 9. Error & Edge Cases the Auto-Sniper Handled (so you can avoid them)

| Issue | Fix |
|---|---|
| Vercel edge caching stale data for 60s+ | `force-dynamic` + `revalidate = 0` + `Cache-Control: no-store` on the proxy |
| `process` variable name clashed with Node's global | Renamed to `proc` in `bot-logs/route.ts` |
| `useEffect` polling kept running after navigation | `return () => clearInterval(t)` in cleanup |
| Bot crash dumped 503 to dashboard, broke entire page | Soft error state — render an inline pill, never throw |
| Dashboard showed "0s ago" forever after first fetch | Separate `setInterval` for the age counter, ticked every 1s independently |
| Trade list returned only ~12 items, equity curve was flat | Either return all trades from the API, or hard-code historical backfill in the frontend constants |
| `state.updated_at` rendered as `Object` due to TS coercion | Wrap in `!!state.updated_at` to coerce to boolean |
| FastAPI auth threw `NameError: verify_key` | Use `Security(require_key)`, not a function call |
| Missing `Header` import on FastAPI | `from fastapi import Header, ...` if you use it anywhere |

---

## 10. What to Deliver Back

When you're ready to wire the LP bot in, send back:

1. **Confirmed endpoint URLs** with the chosen base path (`/api/lp/...` recommended). Include sample responses for each endpoint with realistic values.
2. **Final TypeScript interfaces** for `LPState`, `LPPosition`, `LPRebalance`, etc. Match the `[k: string]: unknown` extensibility pattern.
3. **API key** — generate a new one specifically for the LP bot. Don't reuse the auto-sniper's. We'll add it to Vercel env as `LP_BOT_API_KEY`.
4. **Droplet host:port** — same droplet on a different port is fine, or a new droplet, your call. If same droplet, document the systemd service name so logs can be tailed.
5. **Mocked sample response** for the summary endpoint with at least 2 positions and 3 rebalances so we can build the UI before pointing at the real bot.
6. **A short note on which UI elements you want featured** — e.g., "we want a big 'Total Fees Earned' number in the hero, an in-range/out-of-range visual on each position, and a rebalance history timeline."

Once we have those, the integration is ~3 hours of frontend work:
- Mirror the proxy routes
- Build `LPPanel` component using existing primitives
- Add it to the section composition

---

## 11. Visual Style Conventions (so the new section feels native)

The dashboard is dark-mode editorial. Match these or it'll stick out:

- **Fonts:** Bungee for big numbers and section titles, DM Sans for body, Space Mono for everything technical (timestamps, hex addresses, raw values, labels)
- **Colour tokens:** `C.green` for profit, `C.red` for loss, `C.indigo`/`C.purple` for primary accents, `C.cyan` for highlights, `C.yellow` for warnings, `C.text3`/`C.text4` for muted text. Pulled from the `C` const at the top of `DashboardClient.tsx` — reuse it.
- **Card backgrounds:** `C.surface` (`#0a0e1c`), 1px border in `C.border` (`rgba(148,163,184,0.07)`), 16px border-radius
- **Hero cards:** subtle radial gradient corners (indigo top-left, pink bottom-right), `C.borderHi` (`rgba(99,102,241,0.20)`) border, 20px border-radius, animated SVG orbs floating in the background
- **Entrance animation:** wrap multi-card grids in `className="dash-stagger"` for the 60ms cascade
- **Hover:** apply `className="dash-card"` for the lift + glow effect

The animation keyframes and helper classes are all defined in the `GLOBAL_CSS` constant inside `DashboardClient.tsx`. Don't re-define them — just reuse the classes.

---

## TL;DR

```
1. Build a FastAPI service with X-API-Key auth, JSON responses,
   snake_case fields, ISO 8601 timestamps, USDC.e amounts.
2. One summary endpoint returning everything the dashboard needs.
3. Send us the endpoint URLs, sample responses, TS types, and an API key.
4. We'll mirror the proxy + UI in ~3 hours.
```

Welcome to the dashboard. Build cool shit.
