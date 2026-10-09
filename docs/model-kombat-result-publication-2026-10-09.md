# Model Kombat: results that stay visible

Delayed updates now retain each participant's last verified results with their own timestamp. Actual corrections or wallet changes invalidate only the affected proof. Verified trade results save before accounting starts; each completed ROI ledger saves immediately.

## Apply once

1. From `C:\Users\Mike\Desktop\web3guides`, run your normal `vercel --prod` and wait for deployment to finish. The new website supports both the old and new database response.
2. In Supabase, run the whole `scripts/sql/bots-token-zone-result-publication.sql` file. No edits. The account-isolation SQL must already be installed.
3. From the same web3guides folder, run `node scripts/bots/install-tracking-worker.cjs`.

No new key, internal-AI job or wallet reconnection. The installer checks the patch before replacing the service.

## What to expect

The private report identifies `mk-public-worker-10-progressive-results`. Trade results are saved before the accounting phase; each completed account then appears independently. A failed or interrupted later account cannot undo an earlier successful publication. An expired discovery heartbeat means updates are delayed, not that previously verified history became false. Newer activity waits for complete source coverage.

Last verified figures show their actual data timestamps. Mixed-date rankings are provisional, and retained results cannot authorize final awards. Unsupported accounting remains an individual issue. This does not simplify or change the agreed ROI formula, prize rules, dates, inventories or Reporter.

The first verified publication still requires a successful public-trade scan. This release does not promise instant first-time history reconstruction. The four-hour internal-AI schedule remains necessary for discovering wallets and new Strategy references.

## Checks

Regression coverage includes delayed/missing coverage, sequential publication before later failures, source changes between commits, exact retry fingerprints, old versus corrected evidence, retained per-account timestamps, hidden private profit amounts, and unchanged final-award gates. Tests use an isolated database and actual previously verified Strategy evidence. Browser dimensions cover desktop, portrait and short landscape; physical phones are not tested in this backend pass.

Git updates and worker installation do not deploy the website. Production remains your own `vercel --prod`.
