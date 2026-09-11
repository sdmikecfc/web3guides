# Season integration review — 2026-09-12

Changes are prepared in the task workspace for integration into the game repository. Migrations remain review-only SQL files. No live migration, source configuration, Reporter change, shared-accounting change or external message was performed.

## Fight client

`src/app/bots/fight/season/SeasonFightClient.tsx` and `src/lib/bots/season/live-playback.ts` now bind a renderer to the actual live session, even when its build is identical to the practice preview. Visual simulation follows confirmed frames and saved commands only. Reconnect/input responses obey session identity, monotonic revision/frame and a synchronous request latch. A received receipt clears a lost POST's retry key; complete fights stop polling and clear stale attempts. Route changes cancel/invalidate old responses. Stalled input requests retain their ID for safe retry.

Replay uses the exact frozen initial builds/plans and recorded commands with no new input/start/reward operation. Defender replay uses `viewerSide` for win text, event descriptions and Special details, and never displays the attacker's payout. Break events correctly identify `who` as the damaged robot. Result moments are collapsed, and the payout shares the result heading to leave the damaged robots visible. Missing saved rules produce a recoverable error screen instead of a React crash. Special also requires a ready scene and initial state, including keyboard input.

## Game-only MCP intake extension

`scripts/sql/bots-season-v1-mcp-watchlist.sql` must follow the original game MCP intake and seasonal migration. It adds `mk6_mcp_watchlist(wallet,enlisted_at)` and the known reader's conditional SELECT grant. The source reader should union it with the old watchlist, deduplicate wallets and keep earliest enrollment. Archived enrollments remain available for later corrections; known test/operator wallets remain excluded.

It changes only the original game intake RPC's enrollment predicate to accept either watchlist. The whole installed function is otherwise preserved; missing/ambiguous expected clauses abort the migration. Existing market, amount, source, deduplication, correction and authorization checks remain intact. No original view changes. The server-only service role also receives SELECT on the exact adapter columns of the game-owned fill/batch tables, because the original intake deliberately revoked that privilege. No direct writes or extra AI-reader/public access are added.

## Verification artifacts

- `verification-summary.json`: 17 seasonal backend/PGlite groups; the final rerun uses the current repository v6 engine and also compares every staged SQL card's complete metadata with the canonical catalogue.
- `playback-verification.json`: five pure real-engine playback/revision/event/payout groups passed, including exact replay result/damage hash equality.
- `mcp-extension-verification.json`: five isolated PGlite groups passed, including execution under the actual service-role permission model, rejection of unknown/pre-enrollment/test/operator wallets and preserved original RPC definition/grants outside the one predicate.
- `client-qa/report.json`: ten actual Chromium client cases passed with zero page errors and zero unexpected API routes. Every API was locally intercepted; external requests were blocked. Screenshots: `complete-compact-result.png`, `defender-recorded-replay.png`.
- `client-qa/rules-error-report.json` is the separate follow-up for a poll arriving on the unavailable-rules screen, when present.
- `auth-verification.json`: five authentication groups passed using real signatures from synthetic local EOA keys, the actual season route/nonce/session logic, and an isolated nonce query adapter. Preview flags, malformed payloads, wrong signatures/address/domain, stale messages, missing/expired/wrong-wallet nonces, concurrent replay and missing production secret fail closed. Success returns a session only, with no old or new enrollment, starter, coins or inventory operation. This does not substitute for a real wallet-provider browser test.

The parent task owns the final repository-wide TypeScript/build check. V6 collision/schema work is still explicitly unfrozen; these fixture hashes are verification evidence for that source snapshot, not a release compatibility commitment. Canonical catalogue rows are checked separately from evolving runtime build/collision snapshots.

Portable repository checks: `node scripts/bots-season-server-check.cjs`, with `--playback`, `--mcp-extension` or `--auth` for the independent suites. Set `BOTS_PGLITE_PATH` if the package is not locally installed. Browser task harness: `node outputs/season-server/run-check.cjs --client`; add `--rules-only` for the final error-screen case. Windows runs use the already documented native-path preload and preserve-symlinks options.

Hosted migration review, configured source-reader union, explicit MCP readiness, final v6 version freeze and production launch remain pending. No physical-mobile performance claim is made by these headless correctness tests.
