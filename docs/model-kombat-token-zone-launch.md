# Model Kombat launch — simple handoff

**Announced launch: Thursday, October 8, 2026 at 14:00 UTC, ending November 5 at 14:00 UTC.** The database remains draft until live tracking is verified and opening is applied separately. The first reward is conditional: 1,000 USDC unlocks at $5,000 verified community volume. All nine zones together were initially valued at approximately $4,000. The eight domain-token quantities and 1,000 USDC are unchanged.

## What you do

1. **Run the updated `D:/Temp/modelkombat-launch-guide/01-workshop-setup.sql` once, in full, in the same Supabase project's SQL Editor.** It adds the existing collector's access to the new game functions. All five readiness columns, including `collector_access_ready`, should say **true**. It preserves data, does not change passwords, and does not open the competition. If collector access is false, send that result back; do not create another key.
2. **Publish the prepared fix yourself with `vercel --prod`.** Use `D:\Temp\modelkombat-release-reactor-pit-20260930\candidate` after its build passes. This clean copy targets the existing project and excludes unrelated working changes. Git push is not deployment. Deployment does not open the competition.
3. **Copy the complete [corrected internal-AI instruction](model-kombat-internal-ai-instruction.txt) into your internal AI.** It keeps job `f2w7gt5t55`, pauses duplicate `ssi32kxm4n` after preflight, and uses the existing approved Supabase connection. It checks the real settlement transaction, saves verified wallet associations and rehearses real samples without prelaunch scoring.
4. **Send back its first report.** Reconcile two feed runs against real source trades before opening at the announced time. Rewards can be funded at the end; no reward-holding wallet or upfront token balance is required to launch.

**Correction:** the original setup grants `doma_ai_mk` access to `bb_campaign_store_receipt`; the collector reports using `BB_SUPABASE_URL`. It does not have the website's `MK_WALLET_RESOLVER_TOKEN`. This update reuses its Supabase connection; no website host approval or copied website secret is needed for this route. If its actual login differs, the collector must report the role for an explicit admin grant. No replacement login is created. The website's non-secret switches remain `BOTS_TOKEN_ZONES=1` and `NEXT_PUBLIC_BOTS_TOKEN_ZONES=1`; they do not open scoring.

## One instruction for the internal AI

Use the linked text file above, rather than an older collector prompt. It includes the existing connection, exact database function names and payloads, draft rehearsal, Order Router settlement lookup, source attribution, corrections and first-run report. A rehearsal receipt is not a stored trade or proof of complete coverage. The internal AI's private source lookup and schedule cannot be changed from this repository; its returned execution report is required.

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
- PASS (October 2): installed token-zone database is readable; campaign is draft with null dates. HTTP rehearsal and contract tests pass. This did not verify the internal AI's credentials or transport. Real PostgreSQL confirms starter grants, one training reward, linked-garage coin caps and concurrent settlement protection.
- PASS (October 5, isolated PostgreSQL): the original collector role can use the five new scoped functions; direct game-table changes, enrollment, campaign opening, coin and award operations remain denied. Tests cover 502-wallet pagination, read-only draft samples, malformed batches, retries and corrected active fills. The full setup runs twice safely.
- NOT VERIFIED: updated collector SQL installed in production; two real scheduled source reconciliations; wallet signatures and cross-device restoration against production. The October 5 live check found no new feed batches and one unmatched wallet. The internal AI reported its old lookup misses delayed Order Router settlements. The corrected instruction must actually run with private source access; source tests do not prove live ingestion.
- NOT TESTED: physical-phone performance. Browser sizing is not physical-device testing.

Live tracking and attribution must work before scoring opens. Upfront funding is not a launch gate. Phone testing and wallet-flow checks remain release-quality checks, separately from trade-source reconciliation.

The three generated arena clips used **180 of the approved 240 Higgsfield credits**. The shared retake allowance remains unused. All three include 1080p, 720p and static fallback files.

## After the 28 days

Close scoring at the configured ending time. Allow at least 48 hours for corrections. Incomplete coverage or unresolved disputes keep awards provisional. The operator dry-run tool `scripts/bots/finalize-token-zones.cjs` uses the same integer allocator as estimates. Its explicit freeze mode atomically checks the source snapshot and records immutable awards; it never transfers tokens. Do not run freeze until reconciliation is approved. Arrange funding and verify the actual payout wallet balances at this stage, before transfers; funding timing does not change anyone's earned entitlement.
