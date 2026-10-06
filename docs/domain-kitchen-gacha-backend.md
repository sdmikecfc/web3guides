# Domain Kitchen gacha backend foundation

Implemented locally on 2026-10-05, extended on 2026-10-06. No production deployment, live database migration,
contract transaction, vault allocation or payment activation was performed.

## What exists

- Exact Node HMAC/SHA-256 and Solidity ABI compatibility with the supplied synthetic
  Gochujang vectors. Both commitment hashing and draws sort by card number. Legacy
  message casing/prefix behaviour is retained; worker inputs are canonicalized.
- All three domain catalogues map to their own 24 collectible IDs. New rounds use
  the more generous independent odds already shown in the pack preview. Historical
  vector odds are test data, not launch configuration. There is no pity guarantee.
- Game/contract-scoped rounds, requests, event receipts, jobs, opening history and
  collection discoveries. The same pull nonce and pack prices can exist in different
  games. Prices must remain distinct within a game.
- Seasons are frozen into rounds and pulls, not tied to the lifetime of a contract.
  Opening boards partition by game, season and pack; equal counts share a rank.
- Private Supabase migration and a service-role repository. A single transaction
  records each processed event, changed pull, opening credit and settlement job.
  Round snapshots, including item mappings and box IDs, cannot be rewritten.
- Bounded, resumable block ingestion with a read-only viem adapter. It requires the
  RPC's finalized block tag and a finalized following block before drawing. A deep
  finalized-history conflict halts the game for reviewed recovery.
- Fulfillment/refund outbox leases and stable custody-operation IDs. An uncertain
  broadcast retries the same custody operation. Only matching finalized fulfillment
  evidence earns an opening. Refunds, samples and previews cannot earn credit.
- Unexpected amounts or payments outside configured rounds become refund-only
  requests. They never select a nearby-priced pack or block other valid requests.
  Refund submission observes the contract's strict `age > refundTimeoutBlocks` rule.
- Permissionless forged reveals are harmless recorded no-ops. A reveal must match
  the registered contract, round and committed secret hash, after the round ends.
  Both round and verification projections use the same secret-release gate.
- Historical collection discoveries survive redemption and transfer. A separate
  finalized ERC-721 index tracks the present holder and releases the token's saved
  visual assignment on transfer/burn, without deleting underlying game equipment.
- Restartable round rotation reserves a fixed future window before asking the
  secret provider to create a key. Concurrent calls and lost responses reuse that
  reservation. Late completion expires it instead of committing a past window.
- Reveal jobs wait for the round to end, indexing to pass its window, and every
  request in that window to settle. Only a finalized matching event publishes the
  secret. Retried submissions use the same custody operation ID.
- Stalled fulfillment can switch to a refund after the contract timeout, but only
  after custody permanently retires its original operation. Unknown/pending
  broadcasts keep waiting; a timeout alone is insufficient evidence.
  The supplied contract credits refunds to the player's in-contract payment-token
  balance; wallet withdrawal is a separate player action for the later purchase UI.
- Supabase Vault adapter creates one random secret per reserved round. Creation
  and the opaque reference commit atomically. Reads accept only committed gacha
  references, verify the stored hash, and cannot retrieve unrelated Vault secrets.
  Vault absence fails closed. No hosted extension was installed or tested here.
- Private transaction journal freezes calldata, nonce, gas and fees before signing,
  validates the signed transaction's sender and every allowed field, then persists
  its exact bytes before broadcasting. Lost replies reuse the same transaction.
  Nonces are allocated across all games sharing the dedicated chain/signer.
- Sign-only custody and actual viem RPC transport connect to the bounded worker
  through an explicit factory. No wallet key, provider URL, credential or default
  gas budget is bundled; constructing the factory does not perform network I/O.
- Versioned collection requirements contain each domain's exact 24 item IDs.
  Verified opening history creates one wallet/domain/version restaurant entitlement
  receipt, including pre-migration history. Duplicates add no discovery; transferred
  NFTs add no pack opening or discovery for the recipient. Redeeming an opened
  item cannot undo completion. Reviewed invalidation of noncanonical evidence can
  invalidate an unsupported receipt, and restores reuse its identity.

## Code boundaries

`src/lib/chef/gacha/protocol.ts` contains compatibility primitives.
`catalogue.ts` admits approved season configuration and builds committed snapshots.
`settlement.ts` processes canonical evidence without I/O.
`worker.ts` coordinates durable ingestion and bounded settlement jobs.
`viem-reader.ts` reads registered contracts only.
`supabase-store.ts` writes through private Supabase storage/RPCs.
`operations.ts` handles round reservations, reveal jobs and stalled-pull recovery.
`maintenance.ts` exposes one bounded worker invocation, without registering cron.
`contract-calls.ts` builds unsigned fulfillment/refund/reveal calldata against the
verified ABI. It neither signs nor broadcasts.
`vault-secrets.ts` connects round creation/reads to the scoped Supabase Vault RPCs.
`custody.ts` validates and journals transactions around an injected sign-only wallet.
`supabase-custody.ts` persists the journal through private database procedures.
`viem-transactions.ts` implements RPC estimation, broadcast and finalized receipts.
`private-worker.ts` assembles these adapters for an explicitly configured host.
`ownership.ts` reads finalized ERC-721 transfers and commits each complete block
after settlement has indexed it. It uses the standard [ERC-721 Transfer event](https://eips.ethereum.org/EIPS/eip-721).
The new ownership migration also stores private visual assignments, immutable
collection requirements and once-only restaurant entitlement receipts.

The ABI subset comes from the previously reviewed explorer source. Its provenance
address is **not** a configured Domain Kitchen contract.

The read endpoint is `/api/chef/gacha/[game]`:

| Query | Result |
|---|---|
| `view=leaderboard&season=...&pack=regular` | Leading entries and signed-in wallet's rank |
| `view=collection` | Historical discoveries, 24-item progress and restaurant entitlement receipt |
| `view=assets` | Current wallet's owned tokens, backing amounts and saved assignments at the indexed checkpoint |
| `view=round&id=...` | Committed snapshot; secret withheld until a valid ended reveal |
| `view=pull&id=...` | Own request status; item/backing shown only after fulfillment |
| `view=verification&id=...` | Own fulfilled draw's reproducible proof after reveal |

Production returns 404 while the existing settlement release gate is closed.
Development review additionally requires `DINER_GACHA_REVIEW_ENABLED=true`, existing
online diner configuration and the existing signed-wallet session. No read request
imports a restaurant save. No browser write endpoint accepts events, draw outcomes,
scores, secrets or claimed opening totals.

## Custody and operations still required before testnet/live integration

The application does not have an approved fulfiller wallet or Domain Kitchen
deployment configuration. The Vault and RPC adapters are implemented; their hosted
configuration and the sign-only managed-wallet integration still require verification.

1. Supply the three approved contracts, chain/RPC finality behaviour, deployment
   blocks, domain/payment token information, fees, budgets, dates and pool funding.
   `gameFromSeason` rejects incomplete season configuration.
2. Verify the existing project's [Supabase Vault](https://supabase.com/docs/guides/database/vault)
   installation and restricted access in an isolated integration project. The new
   adapter uses its documented `create_secret` and `decrypted_secrets` interfaces.
   Round rows retain only opaque references. Keep round secrets for later verification.
3. Connect an approved HSM/managed-wallet implementation of `SignOnlyCustody.sign`.
   It must sign **without broadcasting or independently releasing the bytes**.
   `JournaledGachaSigner` then owns validation, persistence and broadcast. Give it
   reviewed maximum gas, fee-per-gas and total transaction fee limits. Use a dedicated
   address that no other application or manual wallet tool uses on that chain.
   Only EIP-1559 transactions with zero native value and no access list are supported.
   Test the actual provider's signature encoding and chain support before activation.
4. Apply the foundation, `20261006_domain_kitchen_gacha_operations.sql`,
   `20261007_domain_kitchen_gacha_custody.sql` and
   `20261008_domain_kitchen_gacha_ownership.sql` migrations in order in an isolated
   integration project first. The worker supplies a
   canonical timestamp with each index checkpoint; old timestamp-free calls fail
   closed. Register games with reviewed configuration, then run the bounded worker
   from an approved scheduler. New games are halted by default. Do not use an anon
   key or expose worker RPCs through a client route.
5. Connect the implemented round/reveal/recovery operations to the approved host
   scheduler and add reserve monitoring. No schedule is registered by these files.
   `runGachaMaintenance` processes at most 32 blocks per invocation (default 8),
   one recovery, one settlement and one reveal; unfinished work resumes later.
   The assembled private worker additionally indexes up to that same bounded
   number of ownership blocks, never ahead of its completed settlement checkpoint.
   Provider failures return a short stage code without provider messages or secrets.
6. Finish transaction-level testnet coverage, token metadata, authenticated editor
   integration, local-beta entitlement attachment, manual redemption UI and custody
   recovery before enabling paid flows. The ownership index and room receipts now
   exist, but no new public placement/claim API or live local-save import was added.
   Auto-pull/reinvest sessions are not implemented in this increment.

### Ownership and restaurant integration boundary

- Ownership starts at the approved deployment block and follows the settlement
  cursor. A mint is accepted only for its finalized matching opening, transaction,
  opener and token ID. This handles mint-before-fulfillment order and mint/burn in
  the same block. All transfers and the ownership checkpoint commit atomically.
- Reads return token IDs and backing amounts as decimal strings. The inventory
  endpoint returns `ready:false` and no usable items if the game is halted or its
  ownership index is behind settlement. Its checkpoint is indexed finalized data,
  not a promise of instantaneous chain freshness.
- One NFT may have one saved display/skin assignment across home and truck. A
  target may have only one NFT. The private assignment RPC requires the current
  owner and exact synchronized checkpoint. It does not accept client ownership
  assertions or grant an equipment tier, inventory item, income or opening credit.
- The later editor command must authenticate the wallet and use existing placement
  and machine-compatibility validation before calling that RPC. The current read
  API deliberately does not expose a write command. Existing beta samples, local
  `decorOwned` balances and player saves are untouched by this backend work.
- A room receipt represents verified completion; applying the room and granting
  its missing kit quantities still use the existing `grantDomainRoomKit` flow.
  This increment does not copy a cloud restaurant over a local beta save.

### Custody retry and recovery limits

- An operation never allocated a nonce can be retired atomically. Its persistent
  tombstone blocks future attempts, including stale workers.
- Once signing begins, timeout or a missing receipt cannot retire the operation.
  A reserved operation holds its lane until the same transaction is signed and
  stored. This prevents later nonces from creating a gap after a signing failure.
- A canonical finalized revert consumes the nonce and permits retirement. A
  successful finalized transaction is reported as confirmed and waits for ingestion.
  The RPC must support finalized blocks; there is no fallback to latest.
- There is no automatic gas bump, transaction replacement, nonce cancellation or
  abandoned-reservation reset. Persistent fee/nonce/provider problems require
  reviewed operational recovery. This deliberately sacrifices availability rather
  than assuming that a signed transaction can no longer execute.
- Ordinary tables contain no wallet private key or live round secret. The private
  transaction journal does contain signed bytes, including the ended secret in a
  reveal transaction, only after reveal eligibility checks. Protect its access and
  logs along with the worker; it is not a public transaction history endpoint.

Operator trust and the supplied contract's swap mechanics remain as agreed. The
legacy configuration hash excludes box IDs, so application snapshots preserve and
validate those mappings separately. No on-chain commitment registry or new HMAC
protocol was silently introduced. Redemption returns actual domain-token backing;
this work introduces no fixed USDC return promise or prize-budget commitment.

## Local verification

- `scripts/dk-gacha-check.mts`: pinned vectors, all 20,000 legacy tickets, canonical
  ordering, six new domain pools, scope/payment checks, reveal timing, redemption.
- `scripts/dk-gacha-postgres-check.mts`: executes all four migrations in an isolated
  PostgreSQL engine; checks role denial, immutable rounds, atomic retry, game
  isolation, expired leases, unknown broadcasts, fake reveals, refunds and rollover.
- `scripts/dk-gacha-api-check.mts`: production closure and safe missing configuration.
- `scripts/dk-gacha-operations-check.mts`: concurrent rotations, lost vault and
  database responses, expiration, custody retirement, reveal retries and a full
  request/fulfillment/refund/reveal/proof flow using the actual SQL procedures.
- `scripts/dk-gacha-custody-check.mts`: scoped Vault access, lost responses, nonce
  allocation across games, signed-byte validation, stale leases, retirement fences,
  finalized receipt checks and private worker construction. Uses real PostgreSQL
  procedures and actual signatures from explicitly synthetic test keys. PGlite
  cannot load hosted Supabase Vault: its SQL interface is doubled, so these tests
  do not verify encryption at rest, hosted permissions or a real managed wallet.
- `scripts/dk-gacha-ownership-check.mts`: all three full collection receipts,
  transfer/burn behavior, mint/fulfillment ordering, cross-contract token isolation,
  assignment conservation, atomic lost-response retries, invalidation and finality.
- Existing domain-world, domain-discovery, pack-experience and pack/decorating checks.

Run TypeScript checks through the existing `scripts/dk-check-runner.cjs`. PostgreSQL
  tests load `@electric-sql/pglite` from `DK_PGLITE_ROOT`, defaulting to
`D:/Temp/dk-gacha-postgres-tests`. It is test tooling outside the project dependency
manifest. The test database is in memory; generated logs/build output stay on D:.

Physical-device/participant testing and production protocol integration remain
separate acceptance gates. Only the user releases with their own `vercel --prod`.

### Results recorded for this increment

- 10 protocol/settlement groups passed, including the supplied exact vectors and
  full ticket distributions.
- 15 isolated PostgreSQL/worker groups passed, including actual table/RPC access
  checks, all six SQL boards, tied ranks, refund timeouts and season rollover.
- 13 additional operational groups passed. Chain reads, secret custody and signing
  remain synthetic in these tests; no real transaction was broadcast.
- 15 custody groups passed using all four migrations and real signed transactions
  with synthetic keys. Broadcasts, managed signing and the Vault extension remain
  local test doubles. No real wallet or provider was accessed.
- 13 ownership groups passed against all four real SQL migrations with synthetic
  finalized events. Tests validate all 72 required IDs against the game catalogue.
- Private API gate check passed.
- The four existing domain/collection/pack regression scripts passed.
- Source type checking, including all six gacha TypeScript check scripts, passed.
- Isolated Next.js 14.2.35 production build passed on D:. Log:
  `D:/Temp/dk-gacha-ownership-build-20261006.log`. Existing optional WalletConnect
  dependency warnings and dynamic-route fallback messages remain in that build.
- Built-app smoke passed: all six gacha read views return 404 in production even
  with review/release environment flags set; the diner page renders successfully.
  The temporary localhost server was stopped afterward.

These checks do not claim live-chain settlement, deployed upstream fixes, real
signer custody, production Supabase migration, or financial/contract audit coverage.

## Collection restaurant handoff (2026-10-06)

- Added private `POST /api/chef/gacha/[game]/room`. It accepts only `{}` (64-byte
  streamed limit) and uses the signed session's wallet, the registered game domain
  and the existing PostgreSQL completion receipt. Browser counts, histories,
  wallet overrides and restaurant snapshots are rejected. Retries re-deliver the
  same entitlement, without creating a second reward or loading a cloud diner.
- The beta bridge extends the connected wallet's current local save only after
  the authenticated response. It reads the latest state after the request, aborts
  on wallet changes/disconnect/unmount, and persists before reporting success.
  It does not adopt the authentication session as a cloud-save session. The typed
  receipt is a validated response, not a signature or acceptable browser-supplied
  evidence for server progression.
- A claim adds the current-size kit to storage without rearranging the restaurant,
  changing its menu, restoring sold pieces, downgrading equipment or changing a
  saved trip. Existing journey entitlements remain valid. Applying the preview
  uses the existing validated `applyDomainRoom` command, backup and order-draining
  transition; the normal editor handles individual pieces.
- Development entry: `/chef/collection-review?domain=gochujang` requires the
  existing `DINER_GACHA_REVIEW_ENABLED=true`, configured authenticated backend and
  seeded/verified database records. The private pack preview links to this entry
  only when that gate is on. Production still returns 404.
- `/chef/collection-review?domain=wines&fixture=1` is an explicitly labelled,
  development-only, memory-only room fixture. It grants no real entitlement and
  does not read or write any player save. All three room previews can be switched
  inside it. Once a real kit is attached, Decorate → Storage has a Collection
  restaurants entry; unearned collections do not appear in normal home navigation.
  Use the pieces opens the normal editor directly to Storage. Opening the theme
  picker from that editor preserves its unfinished draft first.
- Room models finish loading before layout confirmation becomes available. The
  two actions stay in the modal footer at phone sizes. Browser review covered
  actual CSS viewports 360x640, 390x843, 843x390 and 1400x900, plus applying and
  restoring a sample room. This is layout emulation, not device performance QA.
  Review capture: `D:/Temp/dk-collection-room-desktop-20261006.jpg`.
- `scripts/dk-gacha-room-reward-check.mts` passes claim validation, incomplete and
  invalid receipts, repeat grants, all three kits, wallet switches, aborted/late
  replies, intervening play and failed local writes. Existing nine-layout tests
  also passed real staff serving/clearing and layout restoration. Protocol,
  PostgreSQL, operations, custody, ownership, API and discovery regressions passed.
  The nine existing connected-wallet beta checks and four room-editor checks passed.
- Final isolated Next.js 14.2.35 build passed, including type validation:
  `D:/Temp/dk-gacha-room-reward-build-20261006-final.log`. An initial concurrent
  preview/build exhausted system memory; stopping the preview and using one build
  worker resolved it. Final source hashes match the D: workspace. Source and D:
  dependencies remain present; no cache/dependency links were placed in output.
- Built production smoke passed with release/review flags set: all six gacha read
  views, the new room claim, and both ordinary/fixture collection review pages stay
  closed; the normal restaurant page renders. The temporary servers were stopped.

This increment does not yet connect individual NFT assignments to the player
editor. That requires the ownership-backed display/skin overlay and authoritative
placement validation already called out above. Hosted end-to-end authentication,
real settlement, managed signing, physical devices and participant review remain
outstanding. Packs and payments remain closed; no production action was performed.

## Owned equipment appearance handoff (2026-10-06)

The next increment connects equipment skins to the private restaurant/truck
review. This supersedes the equipment-skin part of the outstanding item above;
independent floor/wall/counter/ceiling display placement remains unfinished.

- Added private authenticated `GET/POST /api/chef/gacha/[game]/equipment`. The
  server resolves wallet, game, catalogue item and current ownership itself. It
  accepts only a bounded cosmetic target, token ID, revision and retry ID. No
  browser item grants, recipe changes, balance changes or cloud diner loads.
- Migration `20261009_domain_kitchen_equipment_assignments.sql` adds a cosmetic
  target binding, per-wallet edit revision and durable request deduplication.
  The existing locked ownership checkpoint is checked again at commit. One NFT
  still occupies one home/truck target. Conflicting edits fail; replaying an old
  successful request never restores a later removed appearance. Binding records
  cascade away when the assignment is deleted by transfer or redemption.
- Local beta targets are explicitly presentation manifests, not server evidence
  that equipment was purchased. The server checks NFT ownership and catalogue
  compatibility; the client independently requires that the matching machine is
  actually installed and locally owned. Both use a save-specific target key.
  Nothing in this interface can grant equipment or affect verified competition.
- The renderer overlays appearances on existing objects. Tier, slots, held food,
  working positions and the simulation state are preserved. Standardized rally
  and practice appearances are excluded. Storing/replacing a machine immediately
  removes its visual overlay and queues release of its saved binding.
- Ownership is memory-only in the client, refreshed every 20 seconds while the
  page is visible and on return. Failed reads hide skins; snapshots expire after
  60 seconds. A chain cursor over five minutes old also fails closed. This is
  finalized/indexed ownership, not an instant mempool transfer detector. A new
  page needs a fresh wallet message signature; no bearer token is persisted by
  this controller and beta progress is never imported/replaced.
- The private collection restaurant panel has **Owned equipment appearances**.
  Truck layout tools expose the same control in private review. It previews the
  current location, groups duplicate copies, keeps the machine choice visible,
  and waits for the actual asset before enabling Apply. A failed save offers
  Retry with the same request ID. Remove restores the original machine.
- Four designs require unimplemented specialized machines: steamer, griddle,
  juicer and wine station. They remain inspectable, but cannot be assigned to an
  unrelated machine. Fourteen skins are compatible with current equipment.
  Displaying these NFTs without equipment is still a separate outstanding step.
- Development-only, memory-only visual fixture:
  `/chef/collection-review?domain=gochujang&fixture=1&equipment=1` (also smoothie
  and wines). Its sample inventory and transfer button never call ownership
  endpoints, sign a wallet message or write player storage. The regular private
  entry requires the configured backend and the new migration.
- Local checks: equipment endpoint/client regression, all 18 definitions,
  current-machine compatibility, loss of ownership, duplicate/retried requests,
  wrong save, missing equipment, delayed response/disconnect, storage release and
  unchanged local saves pass. PostgreSQL ownership suite passes 14 groups with
  the new migration; collection-room claims still pass all four groups.
- Browser review covered all three domains, applying/removing sample skins,
  a sample transfer, desktop and CSS viewports 360x640, 390x844 and 844x390.
  Controls meet 44px minimums and no horizontal page overflow was observed.
  Capture: `D:/Temp/dk-owned-equipment-desktop-20261006.jpg`.
- Isolated Next.js 14.2.35 production build and type validation passed:
  `D:/Temp/dk-gacha-equipment-build-20261006.log`. All twelve changed application
  files match the D: build source. The built-app smoke confirms production 404s
  for equipment GET/POST, all six read views, room claims and all three review
  entry variants, even with release/review flags set. The ordinary diner renders.
  Temporary servers/tabs were stopped, viewport override reset, and both source
  and D: dependency directories remain intact. No generated output went to C:.

No hosted migration or live wallet/chain test was performed. Independent display
placement, actual specialized-machine workflows, hosted end-to-end integration,
physical devices and participant testing remain outstanding. Public packs and
payments are still closed. Production remains the user's own `vercel --prod`.

## Collectible display placement (2026-10-06)

The private collection flow now supports floor, countertop, wall and hanging
displays as well as equipment appearances. Machine NFTs can be shown as clearly
nonfunctional decoration without owning their machine.

- Eight free neutral display supports cover the existing one/two-tile envelopes.
  These are ordinary physical furniture, never NFT entitlements. Floor supports
  block the shared routing grid; mounted supports reserve actual surface slots.
  They have no resale value, charm, production effect or project decoration credit.
- Preview, confirmation, subsequent movement/storage and saved arrangements use
  the existing layout validator and accepted-order transition. Canceling a draft
  changes nothing. Multi-slot pieces reserve every mount, including sign/window
  exclusions. Other furniture and possessions are never replaced automatically.
- Ownership stays in memory. Only the neutral support persists in the beta save.
  Transfer, redemption, stale reads or disconnect hide the NFT but leave its
  support, routes and accepted work intact. Supports can be stored normally.
- Assignment uses the existing authenticated, revisioned endpoint. Migration
  20261010_domain_kitchen_collectible_displays.sql extends the binding mode to
  display. An NFT still has exactly one display or skin assignment. Retrying an
  older display request cannot restore it after a newer skin/removal/transfer.
- Placing the free support and binding the NFT are explicitly separate operations:
  a failed ownership request leaves an empty support, with recovery guidance.
  No payment occurs. The client cannot turn a display into production equipment.
- The room remains interactive beside the panel. The piece uses its real colors,
  outline and exact mounting height; animation is presentation-only and respects
  reduced motion. Existing machine skins still follow actual machine activity.
- Unbuilt designs are identified as art in progress and cannot be placed. This
  work does not claim the full 72-item art collection or four specialized cooking
  machines are complete. Those remain release prerequisites alongside live
  settlement integration and actual-device/participant tests.

Local verification includes placement/save tests for the catalogue envelopes,
forged destination rejection, PostgreSQL display/skin switching and idempotency,
room-reward checks, wall mounting, room drafts, free-room service/routing and all
nine room kits. Browser review covers desktop, 360x640, 390x844 and 844x390, including
scene tapping and phone confirmation. These are layout checks, not device FPS.

No hosted migration, wallet transaction, production deployment or public pack
activation was performed. Production remains the user's own vercel --prod.

Final local release check for this increment: isolated Next.js 14.2.35 build and
type validation passed (D:/Temp/dk-gacha-display-build-20261006.log). All 18 changed
application files match the isolated workspace. Built-app smoke passed: all six
read projections, room claim, equipment GET/POST and three collection-review
variants return production 404 even with review/release flags set; the ordinary
diner renders. Existing optional pino-pretty/Browserslist warnings remain.
Preview capture: D:/Temp/dk-collectible-display-20261006.jpg. Temporary browser tab
and servers were closed, and viewport sizing was restored. No build output was
written to the source checkout; D: dependencies remain outside Next output.
