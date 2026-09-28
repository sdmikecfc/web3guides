# Model Kombat release review — 28 September 2026

## Release boundary

Model Kombat only. Git updates source; Mike alone publishes with `vercel --prod`.
No production deployment, live migration, competition opening, Reporter modification,
or trading-balance transfer is performed by this release preparation.

## New front door

The Model Kombat apex opens `/bots/start`. Explicit existing `?view=` links retain
their workshop destinations. The landing has four steps: connect wallet, choose
Strategies/MCP, check `/bots/leaderboard`, play. Play enters the existing garage
without showing the trading introduction again. Connecting signs a free login
message; it is not spending authorization or competition enrollment.

Official sources reviewed on 28 September:
- https://gochujang.com/ — reference for short numbered steps, not copied reward claims.
- https://app.doma.xyz/auto-trading — current ready-made Strategy selection.
- https://app.doma.xyz/help/strategies-custom-trading-through-mcp
- https://docs.doma.xyz/agentic-commerce/mcp-server/connect
- https://docs.doma.xyz/agentic-commerce/mcp-server/authorization
- https://docs.doma.xyz/agentic-commerce/mcp-server/tools

MCP reads need no API key. Execution requires Doma authorization and a chosen
spending budget; limit orders use a separate router allowance. The landing links
to the current controls, does not recommend a trade, promise profits, or imply a
wallet connection qualifies for prizes. Legal compliance still depends on the
operator's applicable jurisdictions and official competition terms.

**Economy distinction:** Reporter trading coins and workshop coins remain separate.
The current implementation cannot truthfully promise that trading buys parts in
the new workshop. That statement must wait for an explicitly approved, verified
transfer mechanism; this release does not merge balances or mint new rewards.

## Tracking adapter

`mk8_reporter_evidence` is a service-role-only, read-only game RPC. It joins existing
campaign fill attribution to actual `battle_bots_fills.occurred_at`, current keeper
status and verified execution receipts in one PostgreSQL statement snapshot.
It neither calls Reporter jobs nor changes shared tables/functions. Its private
response limits player evidence to the authenticated wallet; public UI still uses
the existing allowlist and never exposes those evidence packets.

The adapter requires a fresh ready full-campaign snapshot, matching dates and
enrollment, no pending accounting/fills, and reconciled fill counts, dates and last
execution time. Missing, stale, truncated or corrected-but-unreconciled data stays
unknown. Strategy days count `keeper` attribution; MCP-only fills are counted
separately and cannot silently satisfy Strategy-day eligibility. A new reconciled
source read removes corrected days. This relies on Reporter's current canonical
source and completeness assertions; it is not an independent chain-reorg auditor.

`battleAwardReview` provides an operator review calculation from server-owned new
workshop totals and verified qualification. It preserves occupied-slot tie splits
and deterministic remainder handling. It does not freeze awards or transfer funds.
Actual final review must use a complete server-ledger export, not client wins or
the classic battle ledger. ROI/profit formulas remain unchanged.

## Verification

- PASS: isolated native PostgreSQL 17 migration rehearsal, draft defaults and
  preservation on rerun, atomic rollback and service-role restrictions.
- PASS: concurrent final scored attempt across garages; concurrent final coin
  entry; duplicate settlement cannot reward twice.
- PASS: guest idempotency, shared daily cap, training reward once, atomic wallet
  claim/retry, separate inventories, old guest revocation and legacy migration.
- PASS: strict workshop/server compile without art authoring sources; canonical
  browser/server contact results agree at 30/60/120 presentation batches; no rebalance.
- PASS: Reporter adapter SQL, attribution changes, MCP separation, both weeks,
  duplicates, incomplete/stale evidence, privacy and unauthenticated denial.
- PASS: $2,000 payout schedule; weekly/final eligibility and tied-slot awards;
  unchanged legacy campaign API/privacy contract.
- PASS: audio gesture start, both packaged tracks, mute/volume, recovery and disposal.
- PASS: clean Model Kombat-only candidate production build on D:.
- PASS: production-server HTTP checks against the isolated fixture: guest saves,
  concurrent retries, cross-origin denial, wallet claim and garage selection.
- PASS: landing and leaderboard browser review at 1280×720, 390×844 and
  844×390; no horizontal overflow, animated hero playback, keyboard dialog
  dismissal and direct Play handoff into the returning garage.
- UNTESTED: physical phone, real wallet signatures and cross-device restoration
  against production. Local fixtures do not establish live tracking readiness.

The final build initially hit Windows memory exhaustion during type checking;
retrying with a bounded Node heap completed successfully. Existing dependency
warnings include WalletConnect's optional `pino-pretty` and stale Browserslist data.

Native PostgreSQL is a disposable localhost server on port 55487, stored under
`D:/Temp/modelkombat-postgres`. No Windows service is installed.

## Live preflight — blocks opening

Read-only check at 09:34 UTC, 28 September, using the project's configured database:
- `mk8_players`, `mk8_garages`, `mk8_competitions`, `mk8_competition_attempts`:
  absent from the REST schema (404 / PGRST205).
- Existing Reporter campaign `mk-2026-09`: draft, null start and end.
- Campaign snapshots: 0. Credited campaign fills: 0.
- MCP batch intake table: absent. Execution receipts exist, but the sampled rows
  were rejected; this is not proof of a functioning verified MCP feed.
- Local environment lacks the workshop flags and BB secrets. Production settings
  are not inferred from local absence and still need confirmation.

This supports a code push, **not a claim that authoritative production play or
the cash competition is ready**. No synthetic data may be inserted into live
competition records to make these checks pass.

## Database and deployment handoff

Review/apply these additive game migrations to the intended database in order:
1. `scripts/sql/bots-workshop-v8.sql`
2. `scripts/sql/bots-workshop-journey.sql`
3. `scripts/sql/bots-workshop-competition.sql`
4. `scripts/sql/bots-workshop-reporter-read.sql`

The read adapter needs Reporter's existing campaign-v1 tables. Setup must retain
draft/null dates. Do not change an active/frozen campaign or shared accounting.
Review the competition's `campaign_id` mapping to the existing draft; mapping is
not authorization to open it.

Before production release, confirm server settings `BOTS_WORKSHOP_JOURNEY=1`,
`BOTS_WORKSHOP_COMPETITION=1`, public `NEXT_PUBLIC_BOTS_WORKSHOP_V1=1`, existing
Supabase settings, a strong `BB_SESSION_SECRET` and `BB_FIGHT_SALT`. Keep secrets
in deployment settings, never in Git or chat. Enable paths only after schema checks.

Then Mike runs `vercel --prod`; verify deployed routes, video/audio assets and
read-only status responses. Complete real-wallet signature/rejection/reconnect,
cross-device restoration and physical-phone checks. Reconcile a real confirmed
Strategy source sample before opening. Choose a start time separately; neither
Git nor deployment should change draft state.
