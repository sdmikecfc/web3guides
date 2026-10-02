# Token-zone release review — 30 September 2026

**Game candidate: locally verified. Cash competition: not ready to open.** No production deployment or competition opening was performed.

## Verified

- All nine fixed reward quantities and volume thresholds; 60/15/15/10 category allocation; separate volume podium/remainder groups; exact ties, vacant places, deterministic integer rounding and unawarded empty categories. ROI/profit source precision is retained rather than rounded for rankings.
- Real isolated PostgreSQL: corrected/revoked fills, retry conflicts, shared participant identity across wallets, simultaneous attempts for the last available daily slot, excluded fight modes, repeated settlement, immutable active rules, atomic finalization and source-snapshot race rejection.
- Verified sign-ins register for discovery even without creating a robot or garage. Registration is retry-safe, requires a verified server session, does not mint coins or enter a draft competition, and ignores a different wallet supplied in the request body.
- The exact combined setup SQL ran twice successfully, with four true checks, draft state and no dates. Existing game migrations remain additive.
- Game transactions: 250-coin starter, duplicate Finish/purchase handling, separate owned limb copies, training reward once, daily 1,000-coin limit, repair quotes, corrupt-save handling, guest linking and garage isolation.
- Actual local HTTP routes: secure cookie attributes, cross-origin denial, concurrent duplicate requests, stale revisions, client result rejection, atomic guest claims and persisted garage selection. Dummy signed test sessions only; this is not a real wallet-signature check.
- Actual browser journey: Tier 1 Tank preset, name, final review, Finish reveal; training loss awarded 75 coins with no repair; normal house victory awarded another 75; purchase spent 50; next-robot plan showed one owned part and 200 remaining cost. Header balance was 100 and both fights awarded zero prelaunch competition points. Keyboard activation worked through the loop. Browser pointer automation was unreliable during part of the review; this did not establish a game-button defect.
- Leaderboard reviewed at measured CSS viewports 1280×720, 390×844 and 844×390; no horizontal overflow. The full chart fits the desktop opening viewport. Images: `D:/Temp/modelkombat-release-review/`.
- Clean isolated production build on D:, both music recordings included, and 87 server collision assets present in the workshop route's deployment trace. Optional WalletConnect `pino-pretty` warning did not fail the build.
- Manual preview checks cover twelve kits, jump contacts, both-hand grip samples, surviving-arm fallback, combos and deterministic recorded commands. Ordinary fight contacts agreed at 30/60/120 presentation batches. Manual preview remains unrewarded.

## Animated arenas and performance

Three Higgsfield Seedance 2.5 jobs completed: alien ship, colosseum and underground arena. Cost: 180 credits; approved ceiling: 240; retakes used: zero. Each has silent H.264 1080p and 720p variants plus a WebP fallback and hashed provenance. All three were observed playing in the actual renderer. Low graphics selected the still fallback during the workshop walkthrough.

The colosseum desktop sample covered 600 frames: median 16.7 ms, p95 16.9 ms, approximately 60 FPS. Host: Intel Core i5-11300H, Intel Iris Xe and NVIDIA GTX 1650 installed; the browser's active GPU was not independently identified. This is a bounded local sample, not a guarantee across all scenes or devices.

## Still required before cash opening

1. Public treasury address; verified chain/contracts/decimals, funded fixed quantities, exact USDC representation and liquid pairs.
2. Two real scheduled discovery/feed runs reconciled against completed source trades, corrections, ownership and coverage. Source ROI/profit methodology must be confirmed rather than inferred by the feed.
3. Production migration checks and actual wallet signatures, returning-wallet and cross-device verification after the user's deployment.
4. User-authorized opening time, only after the above checks pass. No countdown or scoring before then.

Physical-phone performance and multi-touch were not tested. No five-person newcomer study was performed. Manual competitive balance is not approved: sampled attack-spam policies still win frequently, so these tests are not evidence for enabling paid/ranked manual combat. Repeated-session long-run memory and audio profiling was not completed in this release review.

## Release boundary

Only reviewed Model Kombat paths and its domain-entry middleware change belong to this commit. Domain Kitchen, Reporter, shared accounting and production deployment remain outside it. The user publishes from the clean D-drive candidate using their existing `vercel --prod` workflow. Pushing does not publish or open the competition.
