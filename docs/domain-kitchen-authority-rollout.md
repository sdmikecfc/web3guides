# Domain Kitchen command authority

The visual redesign can ship independently. Connected progression is enabled only
after the database migration is installed and `NEXT_PUBLIC_DK_AUTHORITY_ENABLED=true`
is set for the server and rebuilt client. The default is disabled; an unavailable
authority service must never fall back to accepting client balances.

## Interfaces

- `POST /api/chef/command {t}` loads the authenticated player's restaurant. It
  initializes a server starter for a new account, or snapshots and migrates a
  preexisting stored save. A client cannot supply migration progress.
- Mutations use `{t,id,revision,command}`. `id` is a UUID retained across uncertain
  retries. The discriminated `KitchenCommand` type in `src/lib/chef/authority.ts`
  is the command contract. A reused ID with changed content is rejected.
- Every successful response returns `save`, `revision`, public `authority`,
  `neighbors`, daily `featured` furniture, `ingredientOffers`, and `serverTime`.
  Revision conflicts include the latest restaurant; review it before issuing a
  new command. A timeout may mean the command committed: retry the same ID.
- `POST /api/chef/social {t}` adds `discover` to the same response. Relationships,
  fixed parcels, and helping use the command endpoint and public shortened handles.
- Public visits allow only visual room state, crew looks, condition, selected
  dishes and their mastery, and available interaction categories. Private pantry
  quantities, balances, full wallet addresses, and typed chef names stay private.

## Persistence and progression

Apply `supabase/migrations/20260913_domain_kitchen_authority.sql` to a staging
database first. The migration requires the existing Domain Kitchen player/session
schema. The two RPCs are executable only by the service role. All table policies
remain private. Command receipts, CAS revision checks, and both participants in a
social action commit together. Ordered row locks prevent mutual-gift deadlocks.

Legacy snapshots are immutable to app clients and retain original state and best
quality. Furniture, recipes, and currency already stored are grandfathered;
verified score and plate counters start at zero. Migrated rows cannot be written
through the obsolete raw-save endpoint even if an old client remains open. The
verified leaderboard and campaign roster exclude unconverted rows after rollout.

Rules in `src/lib/chef/rules.ts` are versioned gameplay defaults. Settlement uses
server time, reachable seats, stoves, staff, pass-to-table walking distance, active
dish mastery, and recoverable condition. It caps an absence at 24 hours and consumes
the remaining elapsed time so the cap cannot be collected repeatedly. Financial
dials never multiply command rewards. Starter and previously unlocked recipes are
preserved. New token-gated collection eligibility requires a server-issued grant;
this release does not reinterpret client LP dials as proof or introduce token payouts.

Social ingredients share one recipient-wide six-per-UTC-day budget across gifts
and discovery, plus a per-pair/per-action daily limit. Gift senders do not transfer
their own pantry. Help restores condition once per neighbor daily. No trading API
exists. Daily offers are selected using server date and each ingredient offer may
be purchased once per day. A daily service achievement awards one rare ingredient
at the configured plate threshold.
The service achievement also requires the configured current-quality threshold;
neglected restaurants cannot collect it simply by waiting. Selected-dish serves
are counted from server-settled plates.

## Release checks

1. Run `node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-authority-check.mts`.
2. Run the existing engine, save, building, and art checks and the TypeScript check.
   Run `scripts/dk-command-client-check.mts` through the same local runner for
   uncertain-network retries, stale-layout conflicts, and sign-out races.
3. In disposable **local** Supabase, run `scripts/dk-authority-db-check.mts` using
   `DK_TEST_DATABASE_URL` and `DK_TEST_SERVICE_KEY`. The script rejects remote
   hosts and never reads production `.env.local`. It checks duplicate concurrent
   commands, stale revisions, raw-save rejection, snapshots, and atomic friendships.
4. In staging, sign in on two devices; test concurrent purchases, offline return,
   a mid-request disconnection/retry, daily rollover, visits/help, and migration
   from representative large legacy restaurants.
5. Enable the flag for a staged client build. Watch 409 conflicts, 503 failures,
   replay/id-reuse counts, settlement latency, and tutorial completion in existing
   deployment logs/analytics. No new third-party telemetry destination is introduced.

Local pure tests are automated; database integration and production migration
must be exercised in an available staging/local database. This repository change
does not deploy the migration or enable the production flag.

## Rollback

Keep the migration and command endpoint online for already converted accounts.
Turning off the flag alone does **not** reauthorize raw writes: the database guard
continues protecting migrated restaurants. A visual-only rollback can retain the
new command client. A full progression rollback needs an explicit reviewed database
operation restoring selected snapshots and dealing with post-migration commands;
do not automatically overwrite newer restaurants with their legacy snapshots.
