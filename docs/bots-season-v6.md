# Seasonal backend — review candidate, 12 September 2026

This lane changes only Model Kombat's new `mk6_*` namespace. It does not import old coins, items, rank, match rewards, or active cash-prize standings. No migration has been applied to a hosted database. No Reporter source/configuration, shared accounting definition, credential, service, or trading process was accessed or changed.

## Install order and flags

1. Review `scripts/sql/bots-season-v1.sql`, then `bots-season-v1-catalog.sql`. The first creates only new tables, indexes and private RPCs. The second installs the exact 134-card v6 catalogue. Neither inserts an active season or changes an existing season.
2. Apply them only after separate live-migration authorization. Create a new season row with an explicit ID, name, UTC start/end, `rules_version='mk-season-1'`, and `enabled=false`. The intended duration is fourteen days, with rollover at UTC midnight so a calendar day's allowance is not split across two seasons. Review dates and catalogue before enabling that new row.
3. Set `BOTS_SEASON_V1=1`, `NEXT_PUBLIC_BOTS_SEASON_V1=1`, and `BOTS_SEASON_ID` to that new ID only for the intended preview/release. Production also needs the existing game's `BB_FIGHT_SALT` and a new `BOTS_SEASON_QUOTE_SECRET` of at least 24 characters. Missing configuration refuses the new season; it never creates the old starter as a fallback.
4. The v6 engine, art, catalogue and collision versions must pass their own acceptance review before a public league is enabled. Current engine balance and authored-art acceptance are separate work; these backend tests do not approve them.

All new tables use RLS and revoke anonymous/authenticated access. New RPCs execute only through the service role after existing signed-wallet authentication and strict field validation. The fixture tests use an in-memory PGlite, never that service client.

## Public API

All paths start `/api/bots/season`. Authenticated game routes use the existing signed Bots session in `Authorization: Bearer …`; none accepts a wallet address, GP, result, seed, stats, client frame, defender command, or claimed trade as authority. Their errors are `{ok:false,error:{code,message}}`.

`POST /auth` is the separate sign-in-only exception. It accepts `{address,message,signature}`, verifies the real wallet signature and consumes the nonce from the signed message, then returns `{ok:true,token,joined:false}`. It uses the existing game nonce issue route; it does not call the old enlist route or grant a robot, coins or seasonal enrollment. The season UI's `seasonOnly` wallet hook selects this endpoint. Errors retain the existing wallet hook's `{ok:false,error:string,code?,retryable?}` contract. The preview flag and signing-secret configuration must be ready before sign-in. Local regression uses synthetic signing keys and an isolated nonce adapter; real-provider wallet UX still needs manual verification.

| Method/path | Body | Success |
|---|---|---|
| GET `/` | — | `SeasonStateResponse`; read-only, no enrollment or bonus grants |
| POST `/enroll` | `{requestId}` | State; exactly one 250-coin grant per wallet/season |
| POST `/draft` | `{requestId,revision,name,parts,defensePlan}` | `{ok:true,draft}` with next revision |
| POST `/bots/finish` | `{requestId,revision}` | `{ok:true,bot}`; exact saved draft bought and locked atomically |
| POST `/bots/[id]/defense` | `{requestId,defensePlan}` | Updated saved bot; current fights retain their recorded plan |
| POST `/bots/[id]/repair` | `{requestId,quoteId}` | `{ok:true,repair:{botId,coins,readyAt}}` |
| POST `/trade-sync` | `{requestId}` | Fresh state after source reconciliation |
| POST `/collection/[seasonId]/buy` | `{requestId,cardId}` | Fresh state after buying a reusable collection design with that expired season's coins |
| POST `/collection/[seasonId]/build` | `{requestId,name,parts}` | Fresh state after assembling a collection-only robot; existing archived designs are free to reuse |
| POST `/matches/start` | `{requestId,mode,botId?,targetBotId?}` | `SeasonMatchResponse` |
| GET `/matches/[id]` | — | Authoritative resume/catchup/settlement; older owned season replays remain readable |
| POST `/matches/[id]/input` | `{inputId,kind:'special'}` | Session and immutable input receipt |

Modes are `ranked`, `direct`, `house`, `loaner`, `exhibition`. Ranked chooses its opponent on the server. Only direct/exhibition accept a target. Loaner forbids a bot or target and only works when at least one season robot is owned and all owned robots are repairing; it uses the house opponent and grants no owned rank. A new player builds their first robot before borrowing the loaner.

The draft contains independent `head`, `torso`, `armL`, `armR`, `legL`, `legR`, `weapon` canonical IDs. Missing/null choices are normalized to absent keys. All seven choices remain editable until Finish. Finish validates the current revision, canonical catalogue stats/GP and signature compatibility, spends the sum once, creates seven permanently attached owned-part rows, and clears only the next draft. Five active bots is the limit. There is no season spare-purchase claim: the shop selects parts for the next draft and the entire build is paid for at Finish. The old collection shop keeps its old behavior.

State also returns completed owner/defense history, a real revenge target when the owner lost a defense, current-season rated head-to-head totals, and the top50 current-season standings. House/exhibition outcomes do not inflate ranked rivalry totals. Standings sort rating, own PvP wins, losses and stable join order; each row includes that player's leading bot name/ID. Completed defense replays are readable by the actual defender with `viewerSide:1`, but that viewer can never submit Special. Unrelated wallets cannot read these private session routes.

Plans: `early`, `balanced`, `last-stand`. Attacker Special is manual; defender AI follows its frozen plan.

## Economy and timing

| Rule | Amount |
|---|---|
| New-season allowance | 250, once |
| Full T1/T2/T3/T4 build | 250 / 750 / 2,000 / 5,000 |
| Each head/body/weapon | 20% of that tier's full price |
| Each independent arm/leg | 10% of that tier's full price |
| First twelve completions per UTC day/wallet | 75 each |
| Sixth rewarded completion | 100 extra once |
| Ordinary daily play maximum | 1,000 |
| One completed verified-source trade of at least $10 | 50% of earned play coins, rounded down, at most 500 across both sources |

The twelve completions are shared across owned house, ranked, direct and Workshop loaner fights. No old two-attacks-per-bot rule or old XP shop gate applies. After twelve completions, starts become exhibitions: no coins, rank or repair penalty. Direct-limit or GP-mismatched challenges also become clearly labeled exhibitions. No result or unfinished match earns coins. A running disconnected match continues deterministically on resume with no invented manual commands, and then qualifies once it actually completes.

At GP100→500, repair duration is linear from 3,600→10,800 seconds; full rush price is linear from 50→150 coins. Both clamp outside that range. Current price is `ceil(fullPrice × remainingSeconds / fullDuration)`. Only the final payable amount is rounded. Repair age starts at `started_at + final_frame/60`, even if settlement happens later. Quotes are signed, tied to wallet/season/bot/repair end, and expire after thirty seconds. The transaction recalculates the current lower/equal amount and charges once; repair never changes daily counters.

## Match selection and rank

The start transaction serializes on the new season row, locks the owner and robot, selects a target, and freezes both builds, seed, rule snapshot, plans and displayed identities before returning the opponent. It permits one unfinished owner session per wallet and avoids simultaneous rated attacks on the same defender. This conservative season-wide start/settle lock is suitable for preview correctness; measure contention before large-scale rollout.

Ranked first uses a GP band within 10% of the attacker's GP; only if necessary does it widen to 15%. Within the band, score is `abs(rating difference) + 12 × min(10, abs(current-season PvP win difference))`, then GP distance and a seeded stable tie-break. Style is never a selection preference. No candidate becomes an explicitly labeled house fight with no rank effects.

Rank starts at 1,000, with floor100. Expected score is conventional Elo: `1 / (1 + 10^((defenderRating-attackerRating)/400))`. Owner-initiated rated change is `round(24 × (actualScore-expectedScore))`; defensive change is `round(8 × (expectedScore-actualScore))`, capped so gross defensive losses never exceed20 per wallet/UTC day. Ties use0.5. Own PvP wins/losses are separate from house/bot/defense totals. Defensive gains do not reset the day's gross-loss cap. Rating is deliberately not zero-sum because passive defense matters less than playing.

Chosen rated/direct attacks allow two per wallet/day and one per directional wallet pair over24h. A reverse/revenge attack is a separate direction. After a rated defensive loss, that robot has two hours of protection; the owner may still play it. Offline defense never spends coins, removes gear, causes repairs or awards coins.

## Trade-source allowlist and correction semantics

The MCP adapter reads **only** `mk_mcp_fills` and `mk_mcp_batches`, the game-owned source-reporting intake defined in `scripts/sql/bots-mcp-trades-v1.sql`. It does not read Reporter, dashboard ledger estimates, wallet-supplied trades or external services. `BOTS_SEASON_MCP_READY=1` must be an explicit deployment decision after the source has been reviewed and its reporting operation is ready; default is unavailable.

The separately staged `scripts/sql/bots-season-v1-mcp-watchlist.sql` must follow both the original game MCP intake and seasonal migration. It creates `mk6_mcp_watchlist(wallet, enlisted_at)` with one row per seasonal wallet and its earliest enrollment, including archived seasons so late corrections remain discoverable. Existing test/operator wallets are excluded. The known `doma_ai_ro` reader receives SELECT on this view only if that role already exists; anonymous/authenticated clients receive none, and no read access to underlying seasonal tables is granted. The internal source reader should read this view **alongside** `mk_mcp_watchlist`, deduplicate wallets, and use the earliest enrollment across them. No external source message or configuration change has been performed.

The same extension changes precisely one eligibility clause in the existing **game-only** `mk_mcp_ingest(uuid,text,jsonb)` RPC: a new fill can belong to an eligible wallet in either watchlist, with enrollment no later than its execution. This is necessary because the original intake checks the old watchlist itself. It preserves all market/token checks, canonical identity, source/tool fields, numeric validation, batch replay protection, revision corrections, security-definer settings, owner and RPC grants. The migration reads its installed definition and replaces only the exact reviewed clause; it aborts if that clause is absent/ambiguous and is idempotent when already extended. It does not change the original watchlist, Reporter, any shared money function, or webhook/HMAC contract. The original webhook continues using the same RPC after reviewed deployment. PGlite tests compare the entire before/after definition after normalizing this one clause, and exercise old/new/unregistered/pre-enrollment/test/operator wallets and archived corrections. This contract remains source-reported finality and does not enable the readiness flag by itself.

The original intake also revokes raw-table SELECT from `service_role`; its RPC alone can write. Since `botsDb()` uses that existing server-only Supabase role, the extension grants it SELECT only on the exact fill/batch columns needed by the seasonal adapter, including the ordering fields. No direct write privilege, other fill columns, AI-reader fill/batch access or browser access is added. PGlite executes these reads under a service-role fixture with the same RLS-bypass property and verifies forbidden columns/writes remain denied. This is a reviewed game-intake read grant, not a change to any shared accounting table or function.

A fact needs canonical `(network_id, tx_hash, event_index)`, the authenticated wallet, a source status of `finalized` or its later `reverted` correction, an exact six-decimal USD value, increasing revision, and a complete intake window covering execution. If an initial partial batch is followed by an identical complete report, the adapter verifies matching canonical execution/revision/amount/status in the later report. Missing coverage, invalid values, missing tables, query errors or excessive scan size return unavailable and grant nothing. A source outage is not invented evidence of a reversal.

The row's stored payload must match its canonical identity, wallet, execution time, revision, amount and status, with `source:'doma_mcp'` and a recognized execution tool. `tokens.swap.v1` and `agent.execute.v1` can establish source-reported completion behind the readiness gate. The intake also permits `defi.limitOrder.create.v1`; that tool's finalized creation transaction alone does **not** establish an actual fill, so it cannot unlock a bonus. Its revision/correction record is retained with `completed:false` until a separately reviewed completed-fill contract exists.

These MCP tables are **source-reported finality**, not independent on-chain verification. No claim of independent chain confirmation is made. The root task explicitly approved this adapter with the readiness gate. Strategies remains unavailable because its current dashboard ledger is not completed-trade proof; the typed `ConfirmedTradeSource` contract is ready for a reviewed execution source. There is no public trade-fact ingestion route.

`mk6_confirm_trade` deduplicates a canonical execution and rejects wallet/source/day identity changes. Revisions correct completion or amount. Reconciliation changes only the new seasonal ledger. A correction can create negative seasonal balance if its bonus was already spent; UI shows spendable `max(0,balance)` and a correction amount. Future earnings clear that debt. Another still-valid qualifying trade keeps the single bonus unlocked, and more volume never adds more than500. Read-only state does not reconcile; the explicit check button and authoritative match completion do. Corrections include older league dates after rollover.

## Rollover and remaining release gates

New-season enrollment archives that wallet's expired league bots and keeps their exact owned parts, remaining old-season funds/debt and history under the old season ID. Nothing is converted into new competitive spending power. Old v2–v5 collection routes, prizes and balances are untouched.

Archived v6 funds are usable through the isolated collection store. Choose an expired season's purse; buying a new design charges only that purse. Designs already owned in any expired v6 collection can be reused freely without detaching or changing the original robot. Building a collection remix buys each missing design once, even when used on both sides, then records seven new parts on a permanently collection-only robot. This collection-design reuse is separate from the seven physical-part prices in the competitive league. Collection bots do not consume the five league stands and cannot be submitted to a new-season match. There is no silent legacy-ledger conversion, and the API refuses spending from an ongoing season through the archive path.

Archive purchases/builds have request receipts, a wallet-wide collection lock and atomic old-purse debits. They remain subject to old-purse correction debt; existing designs may still be reused at zero cost when that purse is negative. A late source correction updates the matching old day's bonus and its archived purse; the fresh season's250 coins stay unchanged. Tests cover duplicate purchases/builds, new-league exclusion and an already-spent archived bonus becoming debt.

Server simulation state, builds, rule/catalogue/collision versions and accepted commands are persisted; frame changes use CAS revisions. Completed results, owner rewards, daily objective, rank, defense protection and owner repair settle in one transaction. A failure leaves a durable pending result and retries; duplicate settlement has no second effect. Replays reuse the stored result and send no new start/reward operation.

The season fight client accepts only monotonic revisions/ticks for the current session. Its visual simulation never advances beyond a confirmed server frame; saved manual commands apply at their exact recorded ticks. An accepted receipt reconciles a lost Special response and clears its session-specific retry ID. Route changes invalidate old network replies; completing a match clears stale input attempts and stops polling. Replay runs locally from the frozen initial state and recorded inputs, with no start/input/reward call. Defender replay maps names/results to `viewerSide:1`, labels its recorded defense and never shows the attacker's coin payout. Negative trade corrections are explicitly signed instead of displaying an incorrect positive reward. Result moments stay collapsed so the final damaged robots remain visible.

PGlite verifies local transaction behavior and concurrent request idempotency. It is not a physical-mobile performance test, a multi-node PostgreSQL load/deadlock test, proof of deployed source readiness, or authorization to apply migrations. Hosted schema, verified-source readiness, final engine balance/contact/art review and production launch remain separately gated.

## Cannon catalogue compatibility

Shoulder cannon and shoulder battery kits require a Tier 3 or Tier 4 Ranged body. There is no active Tier 2 cannon. Other limbs and heads can still mix families. The 134 active cards keep the retained IDs, GP, stat tuples and prices; only the retired offer and cannon compatibility metadata changed before release.

The canonical seed inserts missing rows without overwriting existing rows. It compares the installed catalogue with all expected metadata inside the same transaction. `MK6_CATALOG_MISMATCH` means a prior preview catalogue differs; the operator must roll back and review that preview database before enabling enrollment. No automatic deletion, inventory rewrite or old-build reinterpretation is performed. Fresh and repeat seeds pass; an older 135-card preview and altered cannon metadata are rejected with the entire transaction rolled back.

Run the isolated cannon checks through `node scripts/bots-season-server-check.cjs --cannon`, supplying the local `BOTS_PGLITE_PATH` when needed. The captured SQL under `scripts/fixtures/bots-season-catalog-before-cannon.sql` is test data, never a rollout migration.
