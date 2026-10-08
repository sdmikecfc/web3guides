# Model Kombat ROI update

Worker 7 installed successfully. Its live audit verified trading volume but did **not** finish ROI. Worker 8 is the follow-up prepared here; it is not installed automatically.

## What to do

1. Open the existing Model Kombat Supabase SQL editor. Run **the whole `scripts/sql/bots-token-zone-financial-scope.sql` file**. Nothing needs editing. The opening-basis SQL from worker 7 must already be installed; this file checks that first.
2. In PowerShell, from `C:\Users\Mike\Desktop\web3guides`, run **`node scripts/bots/install-tracking-worker.cjs`**. Use your normal SSH password. Tests and a database check run before the service is replaced.
3. Publish the website with **`vercel --prod`** from that same folder. Only the project owner publishes production.

No new keys, internal-AI instructions, wallet setup or Reporter changes are needed. Installation success is not a verified financial result: check the completed `mk-public-worker-8-eligible-accounting` audit afterward.

## What changed

- Accounts proven to have no eligible competition trades stay **unranked**, with null ROI/profit. They no longer require reconstruction of unrelated personal trading or liquidity positions. Complete trade coverage and SQL verification are required; a new or corrected eligible trade immediately requires accounting.
- Actual traders retain the same full FIFO cost-basis, capital, fee and balance checks. Unknown costs are never assumed to be zero. Unsupported activity affecting a trader's accounting still leaves that account pending.
- Fixed the Explorer's token-filtered pagination cursor. A changed or unrelated token filter is rejected.
- Added narrowly verified direct UniversalRouter ERC20 settlements for accounting. Exact runtime, pool, fee and transfer conservation are checked. This does **not** make external manual trades eligible for prizes.
- Added the specific ETH-funded, two-hop exact-input purchase found in the remaining trader's history. The verifier checks the actual wrapped amount, both pool exchanges, proportional output fee and final sweep. This supplies accounting evidence; it does not turn a manual purchase into a qualifying competition trade.
- Bounded evidence caching preserves reconstruction work between attempts. Accounts take turns. Accounting permits up to 20 minutes per account and 30 minutes per cycle; measured fresh-history reads exceeded the old five-minute limit even with cached receipts. Exact-cutoff verification markers expire after four hours and invalidate on changed evidence, ownership, revision or chain anchor. They contain no substitute financial scores.

## What players see

**Best realized ROI** shows the verified percentage and trader label. **Realized-profit leader** shows rank and trader label; public responses contain no individual profit dollars or token holdings. Signed-in players retain their own private statistics.

Only trading accounts appear in the verification count. Pending results are never shown as confirmed zero. Standings remain provisional until complete reconciliation. Past results do not guarantee future returns.

## Verified evidence and remaining limits

The first worker-7 audit completed on **8 October at 06:07:59 UTC**. It saved complete trade coverage through **02:11:01 UTC**, with **37 eligible fills: 32 linked-agent and 5 Strategy fills**. It did not save verified financial snapshots.

At that cutoff, eight entrants comprise **two accounts with eligible trades, five with none, and one enrolled after the cutoff**. One current Strategy account was independently reconstructed and accepted through the actual SQL accounting path in isolated PostgreSQL. The other trader's audit checked 870 historical receipts and reached one unsupported ETH-funded purchase. Its narrow settlement adapter is included in this update. That account still needs a completed full financial audit; passing the transaction proof does not verify its entire ROI ledger. These local checks do not publish production scores.

Regression checks cover corrections, new trades, exact enrollment timestamps, incomplete coverage, null-score non-traders, transaction rollback, private permissions, real router receipts and public profit privacy. Generated builds and private audit evidence stay on D:.

The worker waits 15 minutes after a completed cycle. Internal-AI wallet discovery and Strategy-reference coverage still run every four hours. New enrollment after the current coverage cutoff remains pending until coverage advances.

Campaign dates, reward allocations, inventories, historical records, Reporter and shared accounting are unchanged. No production SQL, service installation or website deployment is performed by these local checks.
