# Model Kombat account-isolation update

A trade or accounting problem now holds back only its participant. Other accounts keep updating. ROI percentages are public; individual profit dollars and token holdings stay private.

## Apply the update

1. In the existing Supabase SQL editor, run the whole scripts/sql/bots-token-zone-account-isolation.sql file. Do not edit it.
2. From C:\Users\Mike\Desktop\web3guides, run: node scripts/bots/install-tracking-worker.cjs
3. From the same folder, publish the website yourself: vercel --prod

No new keys, internal-AI setup, wallet reconnection or Reporter changes.

## What changed

- Every participant has an independent checked trade window. Unsupported trades do not block another participant's volume, qualification or verified ROI.
- A rejected accounting ledger does not roll back other valid accounts. Failed accounts stay pending, never a fabricated zero.
- Routine discovery updates preserve unchanged completed evidence. Corrections and wallet-ownership changes still invalidate the affected account.
- The two real sponsored transaction formats rejected by worker 8 are now supported, with actual fees and wallet receipts checked.
- Affected signed-in players get a short message and a Discord link to contact @sdmike. Public pages show verified results so far, without exposing private errors.
- Final token awards still require complete reconciliation. The ROI/profit formula, prize rules and campaign dates have not changed.

## Verification

The current Strategy participant was reconstructed from public evidence through 2026-10-09 06:09:55 UTC in a read-only run. The five real smart-wallet receipt fixtures, including both previously rejected transactions, pass verification. Regression checks cover per-account failures, corrections, old cutoffs, stale private coverage, rejected-ledger retries and private result handling.

The migration is tested on isolated embedded PostgreSQL, including rollback and private permissions. Browser tests and the production build run on D:. Physical-phone testing is not part of this backend update.

Code checks do not publish the changes. After installation, inspect the completed mk-public-worker-9-account-isolation audit and the public leaderboard. Some individual accounts can still need review; they no longer suppress independently verified accounts.
