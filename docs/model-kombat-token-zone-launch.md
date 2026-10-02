# Model Kombat launch — simple handoff

**The competition is not open. No start date has been set.** The first reward is conditional: 1,000 USDC unlocks at $5,000 verified community volume. All nine zones together were initially valued at approximately $4,000.

## What you do

1. **Your SQL setup is installed. No new SQL is needed for the October 2 tracking fix.** The database remains draft with empty dates. The ordered setup file remains available for a fresh installation; do not rerun it just for this fix.
2. **Publish the prepared fix yourself with `vercel --prod`.** Use `D:\Temp\modelkombat-release-reactor-pit-20260930\candidate` after its build passes. This clean copy targets the existing project and excludes unrelated working changes. Git push is not deployment. Deployment does not open the competition.
3. **Copy the complete [internal-AI instruction](model-kombat-internal-ai-instruction.txt) into your internal AI.** It reuses the existing job and secret, finds associated wallets, and checks real trade samples without recording prelaunch scores. Its source access stays read-only; our API writes game-only Supabase tables. It needs no Supabase admin key.
4. **Send back its first report.** Before opening, verify registered trading pairs, the existing ROI/profit method, the public reward-holding address and nine funded token allocations, then reconcile two feed runs. Choose a start time only when those checks pass.

The existing production secret is named `MK_WALLET_RESOLVER_TOKEN`. The corrected code accepts it; no new key is needed. An explicitly configured `MK_MCP_INGEST_TOKEN` takes precedence for deliberate future rotation. The non-secret switches are `MK_WALLET_TRACKING_ENABLED=1`, `BOTS_TOKEN_ZONES=1`, and `NEXT_PUBLIC_BOTS_TOKEN_ZONES=1`; they do not open scoring.

## One instruction for the internal AI

Use the linked text file above, rather than an older collector prompt. It includes the exact URLs, returned contracts, draft rehearsal, source attribution, chunking, corrections, failure handling and first-run report. A rehearsal receipt is not a stored trade or proof of complete coverage.

## Launch checklist

- PASS: isolated reward math covers nine thresholds, ties, vacant places, separate volume groups, exact token units and qualification boundaries.
- PASS: isolated PostgreSQL covers corrections, conflicting retries, immutable rewards, atomic finalization and linked-account attribution.
- PASS: real local PostgreSQL verifies simultaneous last-slot reservation across linked wallets and the existing daily game-coin cap across garages.
- PASS: clean D-drive production build with the existing site's settings. Optional WalletConnect logging dependency produces a warning; it did not fail the build.
- PASS: local browser starter → training loss (+75, no repairs) → house win (+75) → 50-coin purchase → plan with one owned spare and 200 coins remaining. Final balance: 100. Keyboard navigation worked through the complete loop.
- PASS: desktop, portrait and short-landscape review at 1280×720, 390×844 and 844×390, with no horizontal overflow. [Evidence and limitations](model-kombat-token-zone-review.md).
- NOT VERIFIED: reward-holding address, funded token quantities, exact USDC representation and live liquid pairs.
- PASS (October 2): installed token-zone database is readable; campaign is draft with null dates. The credential-name mismatch is fixed in source; new rehearsal and contract tests pass. Real PostgreSQL confirms starter grants, one training reward, linked-garage coin caps and concurrent settlement protection.
- NOT VERIFIED: two real scheduled source reconciliations, the new deployment's authenticated feed, wallet signatures and cross-device restoration against production. The October 2 live check found no feed batches, no reward assets, and an unmatched wallet. Source tests do not prove live ingestion.
- NOT TESTED: physical-phone performance. Browser sizing is not physical-device testing.

These red items block opening the cash competition. They do not require inventing another reward system or granting prelaunch points.

The three generated arena clips used **180 of the approved 240 Higgsfield credits**. The shared retake allowance remains unused. All three include 1080p, 720p and static fallback files.

## After the 28 days

Close scoring at the configured ending time. Allow at least 48 hours for corrections. Incomplete coverage or unresolved disputes keep awards provisional. The operator dry-run tool `scripts/bots/finalize-token-zones.cjs` uses the same integer allocator as estimates. Its explicit freeze mode atomically checks the source snapshot and records immutable awards; it never transfers tokens. Do not run freeze until reconciliation is approved.
