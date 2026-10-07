# Model Kombat tracking audit — 7 October 2026

This records read-only audits, the installed worker 5 repair and the prepared
worker 6 scan update. Worker 5 saved **16 fills / $199.904189** at **08:52 UTC**.
Its next scheduled run confirmed complete volume coverage at **09:14 UTC**;
the public API now returns that total. Worker 6 is prepared, not installed.
Local checks have not deployed the website, changed
production SQL, written production scores or altered Reporter.

## Latest installed result

The private completed audit at **08:52:48.080 UTC** reports
`mk-public-worker-5-proof-contract`, `scoreWrites: true`, 4 participants and 8
linked wallets, 16 agent-wallet fills, no Strategy fills and $199.904189 volume.
A separate database snapshot confirmed all 16 rows persisted. The campaign is
active from October 6, 14:00 UTC through November 3, 14:00 UTC.

The common cutoff was **October 7, 06:10:50.936 UTC**. The first run reported
`TRANSFER_INDEX_CHANGED` and the public API withheld the community total. Its
next scheduled run started at **09:07:48.733 UTC** and completed at
**09:14:48.275 UTC** with `complete: true`, `scoreWrites: true`, no trade problems
and `VOLUME_VERIFIED_FINANCIALS_PENDING`. A **09:15:32 UTC** read confirmed both
persisted totals and the public API's `volumeUsd: "199.904189"`, `complete: true`
and `fresh: true`. No further installation was required for this recovery.

ROI and profit remain pending: the historical ledger reached its three-minute
accounting budget. Two participants entered after the common cutoff, so their
later activity is not yet covered. This is not a claim that all tracking is ready.

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
swaps as additional trades. Worker 5 subsequently saved that complete total.

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

## Worker 4 failure and worker 5 repair

Version: `mk-public-worker-5-proof-contract`.

Worker 4's first score commit failed at **05:37:48 UTC** with `MKZ_BATCH_INVALID`:
three verified route proofs were 1,404 / 1,404 / 1,077 characters, exceeding the
existing SQL evidence limit of 1,000. The previous 13 fills and $165.915935 remained
saved. This was a serialization error, not evidence that those trades were invalid.

Worker 5 commits to the complete original proof with SHA-256, retains the critical
block, operation, runtime, attribution and exact amount identifiers, and fits
those proofs into 684 / 684 / 683 characters. Short existing proofs are unchanged.
No verification or SQL limit is relaxed. A read-only database preflight now checks
the actual packet before expensive accounting, and safe SQL machine codes remain
visible in private worker health instead of becoming a generic failure.

At **05:46:48 UTC**, the production read-only check accepted the exact corrected
16-fill packet: 16 mapped, 16 registered-market and 16 eligible fills, no issues,
`writesPerformed: 0`. An isolated local PostgreSQL test of that same packet proved
13-to-16 commit, duplicate retry, revision correction, rollback on a rejected
final coverage packet and preservation of prior financial snapshots. The old full
proofs failed the same test with `MKZ_BATCH_INVALID`, reproducing the live cause.

The following reviewed worker 4 changes remain in worker 5:

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

### Worker 6 fixed-window scan

Version: `mk-public-worker-6-stable-window`.

The old transfer scan compared the changing live first page before and after a
historical scan. A regression reproduces a false incomplete result when newer
transfers shift that page without changing the scoring window. Worker 6 compares
two complete scans of the requested historical window instead. It checks exact
ordered event identities, block hashes, token units and available decimals.
Duplicates, changed history, reorgs, cursor/order errors, page limits and failed
requests still reject the scan; cancellation returns no partial result.

Authorized live read-only checks finished at **09:08:16 UTC**: all eight wallet
windows passed through the same 06:10 cutoff. Four belong to participants who
entered after that cutoff and intentionally return an empty window without an
Explorer request. One agent wallet had 36 transfer events; the other checked
windows had none. These transfer events are not additional economic fills. One
HTTP 500 recovered through the existing bounded retry. No accounting or database
writes ran during these checks. Later live heads were stable, so the exact
trigger of the earlier production mismatch was not directly observed.

All eleven portable regression checks pass, including moving page boundaries,
historical corrections, duplicates, reorgs, source cancellation and the existing
receipt/accounting/proof contract cases. Explorer completeness still depends on
its source index and the existing coverage checks; two consistent scans cannot
prove data that the upstream source consistently omits.

**No immediate reinstall is needed for the confirmed volume recovery.** Worker
6 is a tested improvement for the next collector update, not a prerequisite for
the $199.90 now returned by the live API. It does not finish historical ROI.

**No new SQL, key or internal-AI instructions are required for this update.**
Keep internal-AI v4 on its existing four-hour wallet/reference discovery schedule.
The separate public collector waits 15 minutes between completed cycles.

From the source checkout, the existing user-run command remains:

```powershell
node scripts/bots/install-tracking-worker.cjs
```

The package is prepared only. The command must be run to update the separate
collector; `vercel --prod` does not update it. After installation, confirm the
worker-6 version and a newly completed audit before claiming coverage is complete.
The 16 saved fills above are confirmed; ROI is still pending until historical backfill and reconciliation
finish. Website production remains the user's own `vercel --prod` release.
