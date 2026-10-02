# Model Kombat launch — simple handoff

**The competition is not open. No start date has been set.** The first reward is conditional: 1,000 USDC unlocks at $5,000 verified community volume. All nine zones together were initially valued at approximately $4,000.

## What you do

1. **Your SQL setup is installed.** The updated single setup file also removes the old upfront-funding requirement. Run the complete file once in Supabase SQL Editor; it preserves existing data and leaves the competition draft with empty dates.
2. **Publish the prepared fix yourself with `vercel --prod`.** Use `D:\Temp\modelkombat-release-reactor-pit-20260930\candidate` after its build passes. This clean copy targets the existing project and excludes unrelated working changes. Git push is not deployment. Deployment does not open the competition.
3. **Copy the complete [internal-AI instruction](model-kombat-internal-ai-instruction.txt) into your internal AI.** It reuses the existing job and secret, finds associated wallets, and checks real trade samples without recording prelaunch scores. Its source access stays read-only; our API writes game-only Supabase tables. It needs no Supabase admin key.
4. **Send back its first report.** Reconcile two feed runs against real source trades, then choose the competition start time. Rewards can be funded at the end; no reward-holding wallet or upfront token balance is required to launch.

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
- PAYOUT-TIME TASK: fund the final earned token allocations and check balances before making transfers. This does not block development, reward estimates or competition opening.
- PASS (October 2): registered all nine reward contracts and exact quantities in the live draft, after checking their decimals and active official-factory pools at Doma finalized block 16,478,330. The stablecoin is **Bridged USDC (Stargate), USDC.e**, contract `0x31eef89d5215c305304a2fa5376a1f1b6c5dc477`.
- PASS (October 2): registered 239 Doma domain tokens against recognized USDC.e/WETH quotes (478 allowed combinations, including routed trades). These are eligible asset combinations, not a claim that 478 direct pools exist. Set the existing FIFO profit/opening-plus-inbound-capital ROI method as `mk-fifo-realized-capital-1`. No trade, wallet balance or campaign date was changed.
- PASS (October 2): installed token-zone database is readable; campaign is draft with null dates. The credential-name mismatch is fixed in source; new rehearsal and contract tests pass. Real PostgreSQL confirms starter grants, one training reward, linked-garage coin caps and concurrent settlement protection.
- NOT VERIFIED: two real scheduled source reconciliations, the new deployment's authenticated feed, wallet signatures and cross-device restoration against production. The registry is now configured, but the live check still found no feed batches and an unmatched wallet. The internal AI must run its supplied instruction with actual source access; source tests do not prove live ingestion.
- NOT TESTED: physical-phone performance. Browser sizing is not physical-device testing.

Live tracking and attribution must work before scoring opens. Upfront funding is not a launch gate. Phone testing and wallet-flow checks remain release-quality checks, separately from trade-source reconciliation.

The three generated arena clips used **180 of the approved 240 Higgsfield credits**. The shared retake allowance remains unused. All three include 1080p, 720p and static fallback files.

## After the 28 days

Close scoring at the configured ending time. Allow at least 48 hours for corrections. Incomplete coverage or unresolved disputes keep awards provisional. The operator dry-run tool `scripts/bots/finalize-token-zones.cjs` uses the same integer allocator as estimates. Its explicit freeze mode atomically checks the source snapshot and records immutable awards; it never transfers tokens. Do not run freeze until reconciliation is approved. Arrange funding and verify the actual payout wallet balances at this stage, before transfers; funding timing does not change anyone's earned entitlement.
