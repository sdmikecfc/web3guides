# Doma account → MCP wallet lookup

The agreed flow is wallet-based discovery. CLI use is accepted for this increment;
we are not waiting for a private-key-export investigation. The internal AI resolves
the embedded wallet on the same Doma account as the connected game wallet. It does
not create a wallet, execute a trade, hold keys or change Doma Reporter.

## Mike: setup

1. Run **scripts/sql/bots-workshop-wallet-links.sql** in the same Supabase SQL
   editor as the workshop setup. Run the entire file together. It requires the
   existing workshop/journey and Reporter source tables. Do not run the older
   `bots-mcp-trades-v1.sql` for this mapping flow.
2. Keep the **existing `MK_MCP_INGEST_TOKEN`** already shared with the Doma AI.
   The wallet lookup uses that same credential; do not create or share another
   secret. Set `MK_WALLET_TRACKING_ENABLED=1` after applying the SQL (this is an
   on/off setting, not a key). `MK_WALLET_RESOLVER_TOKEN` is no longer used.
3. Release the code using your normal `vercel --prod` workflow.
4. Have the internal AI run the job below every four hours. This repository does
   not install a scheduler in the internal AI or alter Reporter's schedule.
5. Check one real registered wallet: pending → matched → linked addresses shown
   in Trading. Compare a known completed Gochujang fill against Doma's record.

The competition remains draft. This setup neither opens it nor grants coins.

## Internal AI: the complete job

Run every four hours, starting each run with the first page:

`GET https://www.modelkombat.xyz/api/bots/tracking/wallets?scope=pending`

Use `Authorization: Bearer <existing Doma AI trade-feed token>`. Follow `nextCursor` with
`&after=<nextCursor>` until it is null. Existing `doma_ai_ro` database readers can
also SELECT `public.mk8_wallet_discovery`; writes go through the endpoint below.

For each returned `wallet`, resolve its Doma account using authoritative linked
wallet records, then find the Privy embedded wallet attached to that same account.
Do not infer a relationship from transfers, timing, names, or equal balances.
An allowance is useful confirmation of agent setup, not proof of a completed trade.
The connected address may itself be the embedded wallet; that is valid.

Write one result with:

`POST https://www.modelkombat.xyz/api/bots/tracking/wallets`

Headers: the same bearer token and `Content-Type: application/json`.

```json
{
  "schemaVersion": 1,
  "requestId": "<new UUID; reuse on network retries>",
  "wallet": "<connected game wallet>",
  "mcpWallet": "<embedded wallet on the same Doma account>",
  "domaUserId": "<Doma user ID as a string>",
  "privyDid": null,
  "status": "linked",
  "checkedAt": "<actual current UTC time, YYYY-MM-DDTHH:mm:ss.sssZ>",
  "expectedRevision": 0
}
```

Use the exact `expectedRevision` returned by GET. Supply `privyDid` when available;
null is allowed because the Doma user ID is the mapping key. Do not paste credentials
or private keys into the result.

If a successful lookup finds no embedded wallet, submit `status: "not_found"`
with `mcpWallet`, `domaUserId` and `privyDid` all null. It remains in the next run's
pending list. A failed/unavailable lookup is **not** `not_found`: leave the row
untouched and retry next run. Never overwrite an existing linked wallet silently.

Retry exactly the same payload and request ID after network failures. A 409 means
refresh the record; changed links or one identity appearing under several game
accounts require review. A 422 means the wallet is not registered. Stop on 401/503
and report configuration/source failure; do not invent a result.

## Game trade checking

- `GET /api/bots/tracking/wallets?scope=monitor` returns the connected and attached
  wallet for each player. It is resolver-authenticated and paginated. A repeated
  address appears once per player; overlapping ownership is withheld for review.
- `GET /api/bots/tracking/activity` uses the existing signed game wallet session,
  never a wallet supplied by the browser. It reads existing Reporter fill records
  for both addresses, on chain 97477 and Gochujang token
  `0x68e359b4a6d25448daaff1745059f3e716e22cf8`. It returns at most 20 recent observations.
- These reads do not write to Reporter or change its collection configuration.
  The existing `buyer` row is used as the source's trader/owner record; `leg`
  records buy/sell direction. It does not query operator addresses as owners.
- The personal read labels coverage **unverified**. No records is not proof of
  no trading. It does not invent volume, ROI, profit, Strategy days or coin awards.
- Mapping a wallet does not make a missing upstream fill appear. If the known
  completed trade is absent from `battle_bots_fills`, the game's separate collector
  must consume the monitor list and fetch actual completed fills from the Doma
  source. **That live collector coverage is still a release check, not solved by
  this migration.** Do not modify Reporter to implement it without authorization.
- Keep source/canonical fill identity when importing trades so observing one fill
  through both addresses cannot count twice. Approvals and order creation are not
  fills. Existing Strategy-only qualification and Gochujang-only scope still apply.

## Verification

Local tests: `scripts/bots/workshop-wallet-links-sql-check.cjs` runs the migration
twice and checks idempotency, ownership conflicts, pending retries, same-address
deduplication, dual-wallet reads, Gochujang filtering, source corrections and permissions
on isolated PostgreSQL. `scripts/bots/workshop-wallet-tracking-check.cjs` checks
the API boundary and type-checks the routes and trading screen without emitting caches.

Not yet done: live SQL apply, verification of the existing trade-feed credential, internal AI schedule,
a real saved account mapping, end-to-end fill coverage, production deployment.
