# Model Kombat onboarding and room-read verification

Verified on 2026-09-10 in the local game checkout. This report covers onboarding/domain/API and isolated wallet/room-read boundaries. It does not approve room Form, asset export, production enrollment, deployment, or trailer references.

## Database and service boundary

**The SQL is staged only and was not applied to any live or shared database.** SQL checks ran in isolated, in-memory PGlite. No real wallet enrollment, grants, database writes, or external services were exercised by browser checks.

Doma Reporter remains outside the implementation scope. No Reporter files, configuration, services, or database operations were changed. Trading, LP, and arbitrage bots remain untouched. Read-only dependency inspection found no direct Reporter call to `bb_coin_balance`, but Reporter calls shared `bb_grant` and uses shared player/ledger tables. Therefore the staged migration and its v1 prerequisite still require an explicit user-approved, object-by-object review before any live/shared application. The exact staged objects and rollout requirements are in [onboarding-v2-migration.md](onboarding-v2-migration.md).

## Completed checks

| Check | Result |
| --- | --- |
| `bots-onboarding-v2-check.ts` | Eight groups passed: one protected 250-coin grant, editable canonical choices/revision, exact identity at explicit Finish, idempotent retries, rollback after late injected failure, partial/complete/conflicting handoff, mixed v1/v2/legacy grants, migration replay and public-role denial. Includes local saves and v1 preservation. |
| `bots-onboarding-check.ts` | Existing 13 SQL regression groups passed. |
| `bots-game-state-check.ts` | Existing local-state regression passed. |
| `bots-rollout-check.ts` | Existing rollout checks and v2 service fixtures passed, including missing-schema refusal, stored-version resume after flag rollback, draft-to-owned identity and appearance-only wallet transfer. |
| `bots-wallet-fight-check.ts` | Existing wallet/fight regression passed. |
| `bots-community-feed-check.ts` | Optional opponent lookup failure preserves the public feed. Empty and failed states stay distinct. Displayed build snapshots equal replay builds. Private wallet addresses are excluded. |
| `bots-look-check.ts` | Saved and legacy replay identity, independent limb snapshots and clone isolation passed alongside existing look regressions. |
| `bots-view-fetch-check.ts` | Seven mocked requests passed: response/error cleanup, deadline/retry, parent cancellation, already-cancelled request suppression, and stale body rejection. Focused strict TypeScript compilation passed. |

Previously passing SQL/service checks were not needlessly rerun after the room-read-only changes. The added room-read checks were run against the final helper implementation.

## Isolated browser checks

Playwright checks used a fresh 1280×720 browser context, intercepted every `/api/*` request before navigation, and blocked non-local origins. The session token was intentionally fake and only matched the client-side format. All wallet/server state came from test fixtures; no real wallet signature or live API call occurred.

- A three-part browser draft transferred once and retained its exact parts; its browser save stayed byte-for-byte unchanged while using the mocked wallet.
- Selecting all seven parts and naming the robot, then failing Finish with a 503, preserved choices, name and 250 coins. Retry produced exactly one completed robot, seven parts and zero starter allowance. Reload retained the robot.
- An existing wallet conflict preserved both garages. Choosing browser practice signed out and restored the three-part browser draft.
- Draft names persisted through Look around → Continue my build → Name & finish.
- A failed transfer showed “Your browser robot is safe.” Retry sent the same validated appearance and resumed the wallet draft. Keep practicing restored the local draft.
- Signing out with Escape while a retry was delayed prevented the late response from restoring wallet UI or changing browser state.
- A successful handoff followed by a failed garage refresh retained pending data. A later retry recovered without another grant.
- No page errors occurred in these scenarios. Token, mounted-state and refresh-epoch guards were reviewed. Visibility events perform optional public reads, not enrollment mutations.

Browser evidence and task-local scripts are archived at `C:\Users\Mike\Documents\Codex\2026-09-07\i-b\outputs\wallet-boundary\AUDIT.md` and the task directory (`verify-wallet-boundary.ts`, `verify-draft-name.ts`, `verify-transfer-recovery.ts`).

## Limits and remaining approvals

PGlite queues queries in one process. SQL row-lock ordering and transaction rollback were inspected/tested, but this is not a physical multi-connection concurrency load test. Mocked browser tests are not live wallet or production-database verification. This subtask makes no physical-mobile FPS claim. Room Form review remains pending with the root workflow; no final asset export or trailer-reference approval is implied by this report.
