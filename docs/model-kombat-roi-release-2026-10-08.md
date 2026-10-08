# Model Kombat ROI update

Prepared for installation. This is not a production deployment or confirmation that every account has verified returns.

## Install in three steps

1. In the existing Model Kombat Supabase SQL editor, run **all of `scripts/sql/bots-token-zone-opening-basis.sql`** once. Do not edit it or rerun the original setup.
2. In PowerShell, from `C:\Users\Mike\Desktop\web3guides`, run **`node scripts/bots/install-tracking-worker.cjs`**. Use the usual SSH password. The installer tests the package and checks the database before replacing the service.
3. Publish the website with your usual **`vercel --prod`** from the source checkout. Only the project owner runs this command.

After installation, check a completed `mk-public-worker-7-resumable-accounting` audit and the public leaderboard. Installation passing is not the same as every financial account passing.

No new secret, internal-AI job, wallet setup or Reporter update is needed. The existing internal AI still supplies only wallet associations and Strategy execution references.

## What players see

- **Best realized ROI:** the verified percentage and trader label.
- **Realized-profit leader:** rank and trader label, with dollar scores withheld from the public response.
- Pending accounts remain pending. Verified subsets are explicitly provisional and show how many accounts are covered.
- Closed-trade returns are historical results, not a promise of future returns. The existing realized-profit / capital methodology is unchanged.

Public highlights do not display individual token holdings or profit amounts. Signed-in players retain their own existing private statistics. Community volume and the advertised reward basket remain visible.

## Accounting changes

- Reconstruct opening capital at the actual enrollment boundary, preserving sub-millisecond timestamps.
- Keep untouched holdings and direct token deposits with unknown acquisition costs identifiable. Never assume their cost is zero; consuming an unproven FIFO lot remains pending.
- Verify actual Strategy USDC-to-WETH-to-domain router settlements and count one economic fill, with fee-inclusive accounting and pool-only competition volume.
- Cache bounded, pinned public-chain evidence outside the release directory. Fresh history verification still detects changed pages, corrections and reorganizations.
- Process accounts fairly with cancellable source requests. A slow account cannot monopolize every cycle.
- Combine a fixed-cutoff verification sweep across runs only after each database commit succeeds. Markers contain evidence identity and revision, never a substitute ledger; they expire after one hour and invalidate on changed evidence, failed verification or a chain reorganization.
- Recalculate each published financial result against current eligible fills, wallet ownership and the exact coverage cutoff.

The additive SQL changes functions only. It does not alter campaign dates, token awards, inventory or existing stored snapshots. The service-role-only financial read cannot be called by an anonymous browser.

## Evidence and limits

The clean D-drive Next.js production build passed. Public financial privacy, pending-state rendering and API contracts passed. Browser checks passed at 1280×720, 390×844 and 844×390; these are emulated sizes, not physical-phone tests.

Isolated PostgreSQL checks cover FIFO, capital and fees, unknown-cost disposal rejection, exact enrollment, corrected fills, changed ownership, private RPC permissions and repeat migration safety. Live ledger reconstruction is validated against this same SQL without writing production scores.

Four real accounts enrolled before the saved **7 October, 10:10:46 UTC** cutoff were independently reconstructed and then validated together through the full PostgreSQL accounting path: **4 accepted, 0 rejected, 4 verified, 0 pending**. Three had no eligible completed sales and realized ROI of 0%. The fourth had 16 eligible sales and approximately −0.08% realized ROI. A fifth entrant joined after that cutoff and was correctly excluded from this historical check. These results establish working calculations, not a positive-return promotional claim or a current production score.

The measured final source reconstructions completed in approximately 123–173 seconds per tested account. Laptop-suspended attempts were discarded as performance measurements. Durable evidence caching improves repeated work; successful source reads and complete current coverage remain necessary.

At the latest read-only production check on **8 October, 03:05 UTC**, the installed version was worker 5. It had saved 37 economic fills: 32 linked-agent and 5 Strategy fills. Production contained no accounting snapshots yet. The internal-AI feed had recovered and the latest completed audit had fresh, complete trade coverage through **8 October, 02:11:01 UTC**, covering seven entrants and fourteen trade wallets. Financial checks still reported `ACCOUNTING_TIME_BUDGET_EXCEEDED` on that older worker.

No internal-AI action is currently needed. Keep its existing v4 wallet-link and Strategy-reference job, connection, keys and four-hour schedule. The four validated historical ledgers are not a claim that all seven current entrants have been financially verified.

The public worker waits 15 minutes after a completed cycle; the internal-AI discovery schedule is four hours. Current financial standings still depend on current, complete source evidence. Unsupported history is not silently omitted from ROI.

No production SQL, worker installation, website deployment, campaign change or production score write was performed during this local verification.
