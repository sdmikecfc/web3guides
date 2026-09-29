# Model Kombat launch — simple handoff

**The competition is not open. No start date has been set.** The first reward is conditional: 1,000 USDC unlocks at $5,000 verified community volume. All nine zones together were initially valued at approximately $4,000.

## What you do

1. **Run the whole `D:\Temp\modelkombat-launch-guide\01-workshop-setup.sql` in your database SQL editor.** One paste, one Run. The last result should show four `true` values, `draft`, and empty dates. Existing active records are preserved. If there is an error, stop and send it; do not run fragments.
2. **Keep the existing secret.** Do not create another internal-AI key. Use your existing `MK_MCP_INGEST_TOKEN`. The new routes use it too. Enable `MK_WALLET_TRACKING_ENABLED=1`, `BOTS_TOKEN_ZONES=1` and `NEXT_PUBLIC_BOTS_TOKEN_ZONES=1` for this release. Keep the existing workshop/journey settings.
3. **Give the internal AI the instruction below, on its four-hour schedule.** Its source database access stays read-only. Our game receives the verified results.
4. **Publish yourself with `vercel --prod` after the reviewed commit is pushed.** Run it from `D:\Temp\modelkombat-release-token-zones-20260929\candidate`. This clean copy uses your existing Vercel project and excludes unfinished Domain Kitchen changes. The command stays the same. A Git push does not publish. Deployment does not open the competition.
5. **Before opening:** provide the public reward-holding wallet address, reconcile its nine token balances/contracts and liquid pairs, and check two scheduled tracking runs against real trades. Choose a start time only after those checks are green.

## One instruction for the internal AI

Every four hours, update Model Kombat tracking at https://www.modelkombat.xyz using the existing Model Kombat ingestion secret from your secure configuration. Read GET /api/bots/tracking/zones first and follow its instructions and batchContract. Use the same Bearer credential for all tracking endpoints. Read GET /api/bots/tracking/wallets?scope=pending, follow every nextCursor, and resolve each registered wallet through the authoritative Doma account to its embedded wallet. POST the verified association to /api/bots/tracking/wallets using the existing schema and expectedRevision. Do not guess ownership or overwrite conflicts. Read scope=monitor and reconcile enrolled participants' linked execution wallets. Count eligible domain-token/USDC or domain-token/ETH economic fills once, preserving Strategy versus linked-agent-wallet attribution, evidence, corrections and coverage. Never equate a linked wallet with proof of an individual MCP command. POST reconciled batches to /api/bots/tracking/zones only while the campaign accepts scoring. While draft, make no scoring submissions: report read-only attribution checks and missing setup. Report failures and incomplete coverage explicitly. Never trade, approve, transfer, open the competition, modify Reporter, or expose the secret. Do not infer zero activity from missing data.

The wallet-association POST uses: schemaVersion 1, a retry-stable requestId UUID, wallet, mcpWallet, domaUserId, privyDid (or null), status linked/not_found, checkedAt (UTC ISO with milliseconds), expectedRevision from the list. For not_found, mcpWallet, domaUserId and privyDid are all null. Confirm account ownership from Doma records; wallet addresses may differ.

## Launch checklist

- PASS: isolated reward math covers nine thresholds, ties, vacant places, separate volume groups, exact token units and qualification boundaries.
- PASS: isolated PostgreSQL covers corrections, conflicting retries, immutable rewards, atomic finalization and linked-account attribution.
- PASS: real local PostgreSQL verifies simultaneous last-slot reservation across linked wallets and the existing daily game-coin cap across garages.
- PASS: clean D-drive production build with the existing site's settings. Optional WalletConnect logging dependency produces a warning; it did not fail the build.
- PASS: local browser starter → training loss (+75, no repairs) → house win (+75) → 50-coin purchase → plan with one owned spare and 200 coins remaining. Final balance: 100. Keyboard navigation worked through the complete loop.
- PASS: desktop, portrait and short-landscape review at 1280×720, 390×844 and 844×390, with no horizontal overflow. [Evidence and limitations](model-kombat-token-zone-review.md).
- NOT VERIFIED: reward-holding address, funded token quantities, exact USDC representation and live liquid pairs.
- NOT VERIFIED: two real scheduled source reconciliations, production migration, wallet signatures and cross-device restoration against production.
- NOT TESTED: physical-phone performance. Browser sizing is not physical-device testing.

These red items block opening the cash competition. They do not require inventing another reward system or granting prelaunch points.

The three generated arena clips used **180 of the approved 240 Higgsfield credits**. The shared retake allowance remains unused. All three include 1080p, 720p and static fallback files.

## After the 28 days

Close scoring at the configured ending time. Allow at least 48 hours for corrections. Incomplete coverage or unresolved disputes keep awards provisional. The operator dry-run tool `scripts/bots/finalize-token-zones.cjs` uses the same integer allocator as estimates. Its explicit freeze mode atomically checks the source snapshot and records immutable awards; it never transfers tokens. Do not run freeze until reconciliation is approved.
