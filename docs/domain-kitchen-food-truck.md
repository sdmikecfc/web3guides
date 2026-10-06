# Domain Kitchen: restaurant and food truck implementation

## Playable build

Open `/chef/opening-preview` during local development, then choose **Cook**. The preview keeps its own guest save and does not connect an account. The normal `/chef` entrance uses the same game; connected authority requires the existing server feature configuration and migrations below.

- The restaurant remains home, with **Cook, Decorate, Friends** as its primary controls. The cookbook is accessible through the serving counter and recipe goals.
- The manual truck has physical pantry/fridge ingredients, pasta and sauce, salad, fries, drinks, one carried item, staging, dishwashing, customer patience, and explicit pause/resume. Leaving the browser pauses service.
- Eight services and four stops form the first ladder. The deterministic full-route test took 40.3 minutes of service, plus untimed preparation. First-clear machine receipts are permanent; repeat services still earn ordinary coins. Practice pays no rewards and does not change the route.
- Three truck sizes, three helper assignments, shared technology upgrades, equipment placement/storage/rotation, paint and signs are implemented. Truck postcards export locally without account or balance data.
- First fryer/drinks discoveries grant one stored home machine and a separate truck copy. A confirmed discovery can take the player directly into restaurant placement. Installed, reachable, working machines determine the home menu, live and offline. Removing or breaking the last compatible machine stops that product's new orders.
- Individual home machine condition survives storage and reload. Offline production stops at the precise break and attributes plates to the machines that actually produced them. Selling a stored machine removes its old identity; a separately purchased replacement starts fresh.
- Public restaurant visits expose only placed machine conditions and the operating menu. Stored equipment, pantry, balances, and truck progress remain private.

This is a private playable implementation, not approval to launch funded events. Production event verification, durable event finalization, and payout adapters remain unfinished; their required inputs and release checks are listed below.

The permanent restaurant and normal food truck share kitchen coins and earned equipment. The truck is active, resumable play; the home restaurant remains the source of bounded passive service. Kitchen coins are game currency. They are not verified Discord points, Frontier points, or a token entitlement.

## Normal truck contract

The shared deterministic engine lives in `_engine/truck.ts`. Connected play sends `KitchenCommand` values through the existing authenticated `/api/chef/command` route:

- `truck`: one `action`.
- `truckBatch`: an ordered `actions` tape, at most 128 actions and 100 ticks per command.
- `truckEvent`: an event ID and `enter`, `restart`, or `play` action. `play` contains an ordered action tape.

Every command retains its UUID and expected wallet revision. The existing SQL transaction stores the resulting save, authority ledger, and command receipt together. Retrying the same UUID with the same command cannot grant its rewards twice; changing its contents under the same UUID is rejected. Different devices cannot overwrite a newer revision.

The server stores normal truck progress in `authority.truck`, then mirrors it into `save.truck` for display. Missing authority data starts a fresh truck. Legacy or guest `save.truck` data never establishes server progress, equipment unlocks, a running service, or a competitive record. Existing home possessions and balances remain subject to the established save migration policy.

`truck-authority.ts` credits elapsed **server** time at 20 ticks per second. It replays the submitted actions and ticks in order; it does not insert ticks before each input. Credit is capped at five seconds, and a tape cannot spend more than that credit. An over-budget tape receives `429 / truck_time_credit` and `retryAfterMs`; retry the **same** envelope after that delay. No part of a rejected tape is committed. Pause/resume, finishing, and starting a new service clear leftover credit. A connection gap or accumulated unplayed credit longer than five seconds commits an automatic pause and discards the stale tape; the canonical response must replace client prediction before resuming. The client submits approximately one-second batches, isolates lifecycle inputs into their own receipts, and retains uncertain commands until their receipt is resolved. Returning home or placing a truck reward waits for the in-flight command, canonical inventory, and pause receipt.

Only the shared reducer's `coinDelta`, `homeGrants`, and `stockGrants` can change a connected player's resources. Client actions cannot contain saved state, time stamps, reward quantities, or loadouts. First-clear receipts live in the server truck progress. A truck technology upgrade changes the same canonical technology state used by home operations. Stable home-machine identities and condition survive storage/replacement; layout submission must not create a fresh identity to repair an owned machine.

## Save migration and rollback prerequisites

Apply **both** `supabase/migrations/20260913_domain_kitchen_authority.sql` and `supabase/migrations/20260919_domain_kitchen_truck_snapshot.sql`, in that order, before deploying the v8 application. The first installs authority columns, command receipts, and transaction functions; the second depends on those columns and captures the exact prior save, authority ledger, revision, and public counters on the first update to v8. Do not enable `NEXT_PUBLIC_DK_AUTHORITY_ENABLED=true` before the authority migration is installed and staging checks pass. The snapshot trigger must already exist when the first v8 update occurs; applying it afterward cannot recover an overwritten v7 save.

`domain_kitchen_version_snapshots` keeps the first pre-v8 row per game and wallet. It has row-level security and grants the service role only `SELECT`; the database-owned trigger performs the insert within the same transaction as the save update. Failed transactions must leave neither a snapshot nor a partial new save. Repeated v8 writes must not replace the backup. Fresh accounts have no earlier row to capture. Guest browser migration separately retains its original local save under `${SAVE_KEY}:before-truck-v8`; that key is a local backup, not a verified server progression source.

Before deployment, use a disposable staging database to verify the v7-to-v8 transition, an already-authoritative v7 account, ordinary v8 updates, fresh inserts, concurrent commands, transaction rollback, and denied snapshot writes from client/service roles. Confirm the snapshot matches the original JSON and ledger exactly. Restoring it requires an explicit maintenance procedure that reconciles command receipts and revisions along with the save; merely replacing `state` could revive already-spent rewards or invalidate pending commands. This change supplies backups, not an automatic rollback operation. Neither migration was applied to a live database during this implementation.

## Optional token pilot

**The runtime registry is closed.** `/api/chef/truck/event` returns `enabled: false` and gate status. There is no token-transfer or claim endpoint. A public feature flag or environment JSON cannot manufacture verified funding, rights, or eligibility. No production database or chain deployment is part of this change.

The prepared accounting model is:

- Eight service days with four intervening market/event stops. Market stops never increase reward depth.
- One equal event kit independent of a player's normal truck: common equipment access, fixed layout, no owned technology advantage, and no owned recipe mastery advantage.
- A separate event ledger, so entry/restart never replaces the permanent normal truck.
- Unlimited retries, with only the best verified service depth retained. Depths 3, 6, and 8 receive weights 100, 110, and 125. Extra hours, repeated orders, and repeated clears cannot accumulate weight.
- A finite **absolute** token pool in integer atomic units. No recurring percentage of token supply is a default commitment.
- A frozen, manually reviewed cohort of at most 500 wallets for the pilot. Wallet/account caps are not proof of unique people; the review process must address that limitation openly.
- After closing and review, exact bigint arithmetic allocates the pool pro rata with deterministic largest-remainder rounding. No qualifying players means the whole pool remains unallocated. Final allocations are hashed into an immutable manifest; live provisional payout estimates are not exposed.
- Reconciliation accepts exact, externally confirmed chain transfer receipts tied to that manifest. Repeated observation of the same receipt is idempotent. A second payout for a wallet, a reused transfer log, a wrong token/chain/amount, or a changed manifest fails verification.

`reward-events.ts` validates the **structure and consistency** of supplied funding, rights, and cohort evidence. It does not authenticate a document or query a chain. Calling those pure functions with made-up evidence in a test is not live funding verification. This distinction is why the runtime event registry remains closed.

## Gates before any real event opens

1. Approve the domain-control agreement for the actual domain and full event period, including what happens after a domain buyout or control transfer. Token ownership alone is not an agreement to run this program.
2. Name the chain, token, dedicated reserve/escrow, exact finite amount, dates, scoring version, and eligibility rules. Independently verify finalized funding into a reserve committed to this event; a balance shared with other commitments is insufficient.
3. Freeze the reviewed cohort, document reviewers and appeals, and snapshot the same event kit for all entrants. Do not equate multiple wallets with multiple people.
4. Implement an authenticated verification adapter and durable, append-only event registry. Store the verified evidence and rule digest before opening. Keep its administrative surface separate from player commands.
5. Add durable close/review/freeze transactions: a single manifest per event, compare-and-swap close, immutable evidence/score snapshots, and an auditable allocation artifact. The pure in-memory manifest's freeze/hash is not a substitute for database immutability.
6. Implement a separately reviewed payout adapter. Reconcile finalized on-chain receipts before retrying uncertain transfers; specify confirmation depth, reorg handling, operational roles, and incident recovery. This implementation does not send tokens.
7. Run staging integration checks against the actual SQL command transaction and event persistence: duplicate UUIDs, reused IDs with altered bodies, simultaneous devices, disconnect/reconnect, stale tapes, receipt loss, restart abuse, expired rights, unfunded pool, and finalization/payout races.
8. Load-test bounded batches and populated home/truck scenes on desktop and a representative phone. Confirm snapshot sizes, server latency, active-play timing, pause recovery, performance, and accessibility before rollout.

## Verification record

Renderer-free checks are provided in `scripts/dk-truck-authority-check.mts`, `scripts/dk-truck-client-check.mts`, and `scripts/dk-reward-events-check.mts`; run them with `scripts/dk-check-runner.cjs`. The client checks extract the actual shipped GameStage callbacks and exercise them with controlled transport responses. Existing authority, onboarding, launch, and command-client tests must also remain green. These checks exercise pure local state, real callback logic with local doubles, and static route wiring. They do not establish production database behavior, chain funding, legal/domain rights, identity uniqueness, live payout delivery, or device performance. Record actual run outcomes in the release review instead of treating the presence of test files as evidence that they passed.

Local verification on 2026-09-19:

- Production Next build and full TypeScript check passed. The build retained the existing optional WalletConnect `pino-pretty` warning and unrelated dynamic-route notices.
- Truck engine, authority, transport, pending-command recovery, equipment/offline attribution, migration, launch progression, and reward allocation/reconciliation checks passed. The restaurant deterministic harness passed 126,000 ticks in about 2 seconds; this is engine throughput, not a browser FPS measurement.
- All 11 dish illustrations have distinct regular/mastered art with safe phone framing. Furniture framing checks passed 287 catalog/theme combinations; sprite picking, placement registration, and editor hit-order regressions passed.
- In-browser checks at desktop and 390 × 844 CSS pixels: prepare pasta and separate sauce, combine, plate, serve, collect and wash the dirty plate; pause and reload with customers/timers preserved; lose one customer and return home with earned coins; enter/exit decorating; open friends; enter practice; export a truck postcard.
- No production database migration, authenticated multi-device browser session, real phone performance test, on-chain funding verification, or token transfer was performed. Those remain release checks.
