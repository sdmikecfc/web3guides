# Model Kombat tracking audit — 7 October 2026

This is a read-only audit and a prepared worker update. It has not installed a
collector, deployed the website, changed SQL, written scores or altered Reporter.

## Confirmed trading

At the common evidence cutoff **2026-10-07 02:10:53.838 UTC**, the two entered
participants have the following independently verified post-entry activity:

| Participant wallet | Entered (UTC) | Eligible economic fills | Volume | Source |
| --- | --- | ---: | ---: | --- |
| `0x2442…2b76` | Oct 6, 22:14:50 | 16 | $199.904189 | Linked agent wallet |
| `0xe231…c8c5` | Oct 7, 01:18:25 | 0 | $0.000000 | No eligible fills through cutoff |

All 16 observed eligible fills traded SOFTWARE.ai. No entered participant has
verified Strategy fills in this sample. Existing Strategy receipt tests pass,
but this is not a live positive Strategy-account test.

The installed worker previously saved 13 fills totaling $165.915935. Its five
unsupported-routing errors represented **three transactions**, including two
split routes. The prepared adapter independently verifies those receipts and
adds $33.988254 of domain-pool volume without counting intermediary USDC/WETH
swaps as additional trades. Candidate totals above have not been written live.

The owner's `0x8be1…17b9` wallet is registered and linked to its agent wallet but
was **not entered in this campaign** at the audit. Its historical rehearsal
trades do not count retroactively.

## ROI and realized profit remain pending

No ROI or profit value is being asserted. Full account-level FIFO requires
evidenced opening basis, both linked wallets, quote/native capital, transfers,
fees and final balance reconciliation. The first account reached the bounded
read-only audit limit while retrieving its external wallet's lifetime transfers.
The second account also reached its eight-minute audit limit during lifetime
transfer retrieval. The isolated audit finished at **04:59:01 UTC** with both
trade checks complete, both financial checks pending and no HTTP failures in
that retry. Neither is a confirmed zero ROI.

The official explorer's aggregate counters show 88,337 token transfers / 4,260
transactions on the first external wallet and 11,273 transfers / 5,732 transactions
on the second. Transfer counters include all types and are not exact ERC-20 page
counts. Repeated full-history scans are too expensive for the scoring loop.
Incremental, durable historical backfill remains necessary before these accounts'
financial calculations can be claimed complete. Unsupported basis or LP flows
must remain explicit if encountered; this update does not change that policy.

## Prepared update

Version: `mk-public-worker-4-smart-wallet`.

- Pins the historically verified EntryPoint, Simple7702Account delegation and
  UniversalRouter runtime code. Validates the exact signed UserOperation and its
  successful receipt event using the historical on-chain operation hash.
- Accepts only the reviewed single-account, exact-input V3 route. Checks every
  factory pool, swap event, token transfer, wallet amount and indexed domain leg.
- Produces one economic fill per complete route. Wallet accounting cost/proceeds
  remain separate from eligible domain-pool volume.
- Preserves a corroborated aggregate Strategy reference; ambiguous leg-only
  attribution remains pending rather than silently becoming agent activity.
- Gives financial reconstruction a **three-minute total cycle budget**. Real
  fetches and retry waits are cancelled, cached FIFO loops check the deadline,
  and no detached accounting task continues after the cycle. Verified volume
  can commit while ROI remains pending.
- Sends no partial ledger on timeout. Existing financial/accounting snapshots
  remain stored; current completeness becomes pending at the newer cutoff.
- Retries transient public read failures within the existing four-attempt limit.
- Includes the previously omitted native quote-router dependency and regression.

Offline verification includes actual public receipts, adversarial signature,
runtime, transfer, fee, amount and duplicate cases, Strategy attribution, FIFO
cost/volume separation, and real cancellation without orphan requests. Existing
OrderRouter, collector, native accounting and native purchase tests also pass.

## Installation handoff

**No new SQL, key or internal-AI instructions are required for this update.**
Keep internal-AI v4 on its existing four-hour wallet/reference discovery schedule.
The separate public collector retains its configured 15-minute polling interval.

From the source checkout, the existing user-run command remains:

```powershell
node scripts/bots/install-tracking-worker.cjs
```

The package is prepared only. The command must be run to update the separate
collector; `vercel --prod` does not update it. After installation, confirm the
worker-4 version and a newly completed audit before describing its candidate
volume as live. ROI is still pending until historical backfill and reconciliation
finish. Website production remains the user's own `vercel --prod` release.
