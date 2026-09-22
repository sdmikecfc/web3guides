# Welcome garage accounting, version 1

The migration is local and has not been applied to any live database. New signed-in accounts require it and `BOTS_ONBOARDING_V1=1` before `/api/bots/enlist` can provision their welcome garage in production. The signed-out demonstration remains local browser data. The independent presentation and rollback switches are documented in [rollout-flags.md](rollout-flags.md).

Apply to the existing game database, using its service role, in this order:

1. Existing reporter schema `battle_bots_001_init.sql` through `battle_bots_009_hat_colour.sql`.
2. `bots-independent-limbs-prelaunch.sql` for any old pair inventory. Its separate runbook explains the preserved IDs and split resale.
3. `bots-onboarding-v1.sql` in one execution. It contains its own transaction. Pause game writes during schema/application deployment so old and new starter producers cannot overlap.
4. Deploy the matching web application. Run a fresh test-wallet walkthrough before opening enlistment.

The reporter's campaign migration is separate. Campaign enrollment requests are nonblocking: absent/draft campaigns and pending/failed capital snapshots do not prevent a player from receiving a robot. Automated trading credit must wait for the reporter's completed snapshot. Enlistment uses the same existing session/signature flow; no new public credentials or client-side database writes are introduced.

## Accounting and compatibility

- New players receive seven free, independently owned welcome pieces, an assembled robot in bay 1, an empty second robot in bay 2, and one ledger grant of 250 coins. Each piece has stats `[1,1,1]`; the complete robot total is 15 because left/right limb contributions are averaged by the existing seven-socket combat model. It starts at level 1, XP 0.
- The allowance is a reserve inside the player's total balance, not another balance or currency. The beginner shop releases and spends 50 for the head/body/weapon and 25 for each of four limbs, atomically. All seven cost exactly 250. Every other negative `bb_grant` preserves the remaining reserve under the same player-row lock.
- `bb_grant` retains its existing named arguments and return columns. `new_coins` is still the full balance. Duplicate reasons are checked before affordability, so a successful debit retried at zero balance returns its original success without another debit.
- An existing account with inventory, any robot row or a historical `starter...` ledger reason is left unchanged and receives no repeat starter or allowance. A reporter-created account with earned coins but no earlier kit receives the new onboarding while retaining its earned balance and identity flags.
- Only beginner part IDs live in the new catalogue. They borrow `art_key` geometry without inheriting the old part's tier, stats or family bonus. Instance colours remain immutable. The welcome robot deliberately has mixed colours; a player's later complete colour set follows existing combat rules.
- Claims have one permanent `(wallet, version, socket)` key. Retrying a claimed socket returns its original item, including if another offer is sent. They are durable receipts, so part/bot IDs are not cascading foreign keys: ordinary recycling after completion cannot erase the history.
- Until the welcome practice is acknowledged, the two onboarding robots cannot lose/change their parts, be recycled, enter normal fights or be listed. Their names and cosmetics can still change. Database triggers also reject stale builder saves that would overwrite a newly purchased socket.
- The first practice uses the player's second robot and their own welcome robot. Both builds and appearances are captured on a single private `spar` row; the result and onboarding link commit together. It changes no coins, points, XP, wins/losses, attack/defence counters, repair state, drops or cards. Retrying returns that same battle ID. Tutorial seeds are derived from the persistent wallet/version identity and the existing server fight salt before a battle ID exists; normal-fight seeding is unchanged.

## Client contract

`GET /api/bots/onboarding` uses the normal bearer session. `POST` accepts `{t?, action, socket?, offerId?}` where action is `welcome`, `buy`, `practice` or `complete`. Responses contain the current `OnboardingView`; practice also returns `fightId`. Refetch `/api/bots/me` after a purchase to receive the owned instances and saved build.

`MeView.player.coins` remains the total. `reservedCoins` and `spendableCoins` are explicit; the three values come from a single SQL read snapshot. `MeView.onboarding` is null for preserved older accounts. The catalogue exposes single-piece limb prices already, so clients must not halve them again.

## Local verification

`scripts/bots-onboarding-check.ts` executes the actual migration and RPCs in PGlite against the relevant original schema tables. It verifies all 40 catalogue entries, full and failed provisioning, historical-account preservation, exact spending/reservation, failed-purchase rollback, seven independent pieces, idempotent retries, protected inventory, canonical replay after JSONB storage, zero practice side effects, persistent completion, repeat migration and browser-role execution denial.

Set `BOTS_PGLITE_PATH` if PGlite is installed outside the repository. `scripts/bots-onboarding-catalog.ts` checks that the SQL offer seed matches the TypeScript catalogue; `--write` regenerates only its labelled seed block. Existing v1 offers are immutable (`ON CONFLICT DO NOTHING`); an economic change requires an explicit new migration/version.

This local test does not simulate multiple independent PostgreSQL network connections or verify a deployed Supabase role configuration. The row locks, unique keys and transactions are covered locally; production concurrency and signed-wallet HTTP smoke testing remain deployment checks. The frozen engine and rig-points files are not changed.
