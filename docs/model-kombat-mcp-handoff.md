# Model Kombat MCP trade feed v1

## What this delivers

An isolated intake API and additive SQL migration for source-reported MCP fills. The collector can read registered wallets and approved markets, then submit finalized economic fills with MCP attribution. Decimal values are preserved exactly; repeats cannot add volume twice; corrections retain revision history.

This increment records evidence. It does not award coins, edit battle results, change Strategies accounting, or declare a source assertion independently verified on chain. Existing MCP UI remains coming soon. Connecting this intake to the shared reward ledger requires a separate reviewed integration and Mike's explicit permission if Doma Reporter or its shared accounting is involved.

The migration is not automatically applied and these routes are disabled by default. No live records or credentials are included in this handoff.

## Message for the internal reporting AI

> We are using a dedicated Model Kombat API. Keep your Supabase credential read-only. Read `public.mk_mcp_watchlist` for registered wallets and their `enlisted_at` time, and `public.mk_mcp_markets` for explicitly enabled Gochujang markets. Alternatively, read the authenticated `/api/bots/trades/watchlist` endpoint and follow its `nextCursor` until null. Report only settled, finalized token-swap fills occurring after enrollment. Link each fill to its MCP audit execution; for MCP-created limit orders, link the original order and each later actual fill. Include a Strategy ID if the same fill is also tracked as a Strategy. Submit the v1 JSON contract to `/api/bots/trades/ingest` using a dedicated collector Bearer token. Send no coin totals or cumulative-volume updates. The API records fills only; coin awards are disabled. Before activation, provide the actual network, market contract and two token contracts for each Gochujang market so Mike can approve the allowlist.

## Database changes and boundaries

`scripts/sql/bots-mcp-trades-v1.sql` creates only new `mk_mcp_*` objects: approved markets, batch receipts, current fills, immutable revision history, a wallet watchlist view and the intake RPC. Its only existing gameplay-table dependency is a read of `battle_bots_players` for wallet enrollment. Test and operator wallets are excluded.

It does not alter existing tables, replace shared `bb_*` functions, create triggers on existing objects, access private keys, or change Reporter services/configuration. It grants no new rights on existing gameplay tables. If the existing `doma_ai_ro` role is present, the migration grants it SELECT only on the new watchlist and enabled market configuration. Application roles `anon` and `authenticated` cannot read or write the intake tables. These routes read the new watchlist/market objects and call only the new intake RPC. The game's existing service credential remains on the server; the collector never receives it.

Review the SQL before running it in the community-games database. Run it once through an authorized SQL connection. The migration intentionally requires the existing player table and Supabase roles; a missing prerequisite must fail rather than create an alternative player registry.

Add the confirmed Gochujang markets to `mk_mcp_markets` using their real contract addresses. The allowlist starts empty; incoming data cannot add its own markets. Its domain label must be `gochujang.com`. Enable a market only after reviewing its network, market address and unordered token pair. No addresses in the sample JSON are real configuration.

## API setup

Set these two server-side environment variables in the game deployment:

- `MK_MCP_INGEST_ENABLED=1`
- `MK_MCP_INGEST_TOKEN`: a newly generated random token, at least 32 characters, shared only with the collector through its credential store. Do not reuse a Supabase, wallet-session or cron credential.

No token is generated, logged or sent by this implementation. Before enabling, apply the migration and populate the approved-market list. Roll back access by setting the enabled flag to 0; preserve the records for review.

Intended production URLs after deployment:

- `GET https://modelkombat.xyz/api/bots/trades/watchlist`
- `POST https://modelkombat.xyz/api/bots/trades/ingest`

Both require `Authorization: Bearer <collector token>`. POST additionally requires `Content-Type: application/json`. Neither URL is claimed live by this document. No CORS browser access or player-session authentication is provided.

GET returns `{ok,schemaVersion,generatedAt,wallets:[{wallet,since}],nextCursor,markets:[{networkId,marketAddress,tokenA,tokenB,domain}],intakePath,maxTradesPerBatch,ready,rewardsEnabled:false}`. Add `?after=<nextCursor>` for the next 500 wallets. Refresh the full wallet list each run; wallets added behind an earlier alphabetical cursor appear on the next pass. Backfill their fills from their enrollment time. An empty market list returns `ready:false`. A failed read returns 503, never a fabricated empty successful dataset. Read configured markets only where `enabled=true` if using SQL directly.

## Submission contract

See `model-kombat-mcp-example.json`. All fields are required, including explicit nulls. Its addresses, hash and identifiers are illustrative only; it is not a real trade to submit.

| Field | Meaning |
|---|---|
| schemaVersion | Exactly 1. |
| batchId | UUID retained for every retry of this exact batch. |
| windowStart, windowEnd | Original execution-time window, inclusive start and exclusive end. UTC ISO timestamps ending in Z; maximum 24 hours. |
| complete | Source attestation that all pages for this window have been delivered. False on partial pages. No independent completeness watermark is inferred from it. |
| trades | At most 500 records; total body at most 1 MiB. Empty windows are allowed. |
| networkId | EVM CAIP-2 ID, e.g. eip155:97477. The market allowlist decides which networks are accepted. |
| txHash, eventIndex | Settled transaction and receipt log index of the actual economic fill. Canonical duplicate key is network+transaction+eventIndex, without source in the key. |
| sourceFillId | Stable database fill ID. Also unique within a network, preventing reuse of the same source fill under another transaction. |
| wallet | Executing/trading wallet matching the registered Model Kombat wallet. Do not substitute a funding wallet or an MCP client ID. |
| marketAddress | Approved pool or bonding-curve contract, not a website name or arbitrary router. |
| tokenIn, tokenOut | Actual ERC-20 contracts for the settled fill, matching the approved pair in either direction. Use wrapped-native contracts where the swap event does. |
| amountIn, amountOut | Positive base-unit integer strings, at most uint256. Never floats or formatted token quantities. |
| executedAt | Original successful fill time, including for later corrections; must be inside the batch window and after enrollment. |
| usdValue | Positive executed trade notional as a decimal STRING, at most 6 decimal places. Store one side's economic value once, excluding gas, approvals, deposits, refunds and route duplication. Do not add both input and output values. |
| valuationSource | Auditable source/method for the execution-time USD conversion; no invented $1 peg or use of current prices for historical fills. |
| source | Exactly doma_mcp. |
| tool | tokens.swap.v1, agent.execute.v1 for an actual swap, or defi.limitOrder.create.v1 for a subsequent fill of an MCP-created order. The generic execution tool alone is not proof a swap occurred. |
| executionId | Stable MCP audit/execution record proving origin, joined to the actual fill. For a limit-order fill, identify the original MCP order-creation audit record. |
| orderId | Original MCP-created order ID for limit orders, otherwise null. |
| strategyId | Existing Strategy ID if the same fill appears in Strategy accounting, otherwise null. This is overlap evidence, not a second entitlement. |
| status | finalized for settled fills; reverted only as a correction to an already stored fill. Pending/broadcast/refused orders are not fills. |
| revision, correctionReason | Start at 1/null. Changes advance exactly one revision and include a reason; old/reordered/conflicting revisions fail. |

Report one record per economic fill. Partial fills with distinct settlement logs have distinct keys. For a routed swap, choose the single relevant Gochujang fill; do not also submit the router summary or every route hop as additional volume. The API cannot infer that two unrelated source IDs describe the same economics if the source supplies different on-chain log identities; this mapping must be fixed in the reviewed query.

MCP origin and execution success are separate facts. Linking an audit record authenticates the reporting service's assertion, not a cryptographic verification by this API. The source must reconcile successful receipts/finality, actual amounts and the actual wallet, rather than counting an MCP tool returning success.

## Retry, correction and backfill rules

POST returns a receipt with `ok`, `batchId`, `inserted`, `updated`, `duplicates`, `received`, `coinsAwarded:0` and recorded status. A repeated batch with identical normalized content returns its saved receipt. Reordering trade rows or harmless casing/decimal formatting does not change normalized identity.

- 401: fix the collector credential. Do not retry indefinitely.
- 400/413/415/422: fix the payload, batch size, enrollment or approved-market configuration. A rejected transaction saves none of the batch.
- 409: batch ID was reused with different content, source identity conflicts, or a revision is stale/out of order. Investigate; never blindly overwrite.
- 503 or network timeout: retry the identical batch and UUID with bounded backoff. A lost response may follow a successful commit.

Rescanning overlapping windows is supported. Give a newly constructed batch a new UUID; identical existing fills are no-ops. A correction must retain wallet, chain/transaction/event, sourceFillId, market/tokens, executedAt and all source attribution. Change only amounts, USD value/valuation source, status and revision/reason. Reverted fills remain in audit history. Attribution changes require manual review. Use the original execution window for old corrections, not today's execution time.

The collector's schedule is not installed here. An hourly run plus a rolling lookback for delayed fills is a reasonable initial setup; finality/reorg reconciliation and historical backfill need the source query's documented policy. Empty-window receipts preserve a successful zero separately from a failed query. Never send an empty complete window after a source read error.

## What the attached Doma documentation established

The supplied `llms-full (1).md` identifies mainnet 97477/testnet 97476 and documents `tokens.swap.v1`, append-only execution auditing and off-session limit-order fills. It says successful execution means broadcast, the spend budget is charged before broadcasting, and router approvals can incur a minimum charge. These are why the feed uses finalized fills instead of allowance spending. Relevant lines 3296, 3492, 3514–3520, 3531, 3565, 3582, 3651 and 3662–3677.

It does not publish the internal Metabase/audit schema, Gochujang market addresses, USD pricing policy or finality threshold. This contract is our requested format, not a claim that those exact field names exist upstream. Mike reports the internal AI can supply this format.

## Local verification and activation status

See `model-kombat-mcp-verification-2026-09-11.md` for the completed checks. The SQL migration, live market configuration, deployment environment and collector schedule have not been applied. There is no active MCP earning feed yet.

Activation order:

1. Review and apply `scripts/sql/bots-mcp-trades-v1.sql` through an authorized SQL connection to the same database used by the game's backend. This session has no connected SQL administrator tool. Do not use Reporter code or credentials to work around that.
2. Obtain and review the real Gochujang network, market and token contracts from the internal AI, then populate the new allowlist. The supplied documentation does not contain these addresses.
3. Deploy the game routes and configure the dedicated server-side token and enabled flag. Store that token in the collector's credential store.
4. Have the collector read the watchlist, submit one actual finalized fill and repeat the exact batch. Confirm one stored fill and the saved retry receipt before enabling its periodic runs.
5. Review reward integration separately. This intake returns `coinsAwarded: 0` and does not change the game's coin formula.
