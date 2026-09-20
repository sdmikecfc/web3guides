# Street Eats preview: persistence and release gates

This is a fresh, separate preview. Its browser key is `street_eats_preview_v1`, its APIs are under `/api/chef/diner`, and its database tables begin `diner_preview_`. It does not import, migrate, overwrite, or grant credit from existing Domain Kitchen saves. Production migration policy remains undecided. Token rewards are disabled and are not part of this preview.

## Deploying the browser preview

Set `DINER_PREVIEW_ENABLED=true` for the production build and runtime to expose `/chef/diner-preview`. The production page otherwise returns 404; setting only a runtime variable after the page has been prerendered is insufficient. On the existing Kitchen hostname, use `/diner-preview`. The root restaurant route remains the older game. The art bench stays development-only.

For a browser-only preview, explicitly keep `DINER_PREVIEW_SERVER_ENABLED=false`. This does not require the new database migrations and leaves progress on each browser. Enable online features only after the separate provisioning and transaction checks below. Build/deploy a clean checkout of the intended commit: a Vercel CLI deployment from a dirty workspace can include unrelated uncommitted files.

## Current authority model

The browser predicts the shared reducer and sends ordered intentions. The server replays them against its stored state, with a command UUID, expected revision, and a bounded server-time budget. A transaction commits canonical state, a replay receipt, accepted inputs, and a checkpoint together. Repeating a UUID returns its receipt; different inputs cannot reuse it. A stale revision does not overwrite a newer device.

The cooking clock runs at the content engine's 20 Hz. One request permits at most 128 actions and 100 elapsed ticks. An accumulated gap above five seconds pauses the active simulation and discards the stale predicted tape. Pause/resume does not preserve unused time credit. A recent server-observed request interval of at most 30 seconds settles the home at its online rate; longer absences use 60%. No submitted presence flag is accepted.

The headless home model and visible home model share `homeSimulationConfig`. Layout, reachable stations, staff, selected dishes, mastery, charm, buzz and the daily staff meal determine measured output. Offline capacity starts at eight hours. No maintenance penalty is imposed on this new home; optional incidents have fixed daily coin receipts.

The ingredient allowance is seven units per UTC day: crate 2, market 1, garden 1, regular/visit kindness 1, and qualified truck runs 2. Regular friendship uses measured output of a favourite dish and one daily visit receipt. Practice does not pay haul, grant trip collections, consume a trip number, or issue the tutorial home fryer. That introductory home fryer is issued once; later home equipment copies cost banked coins.

## Social and account boundaries

Publishing a canonical preview diner is opt-in. A public response includes its name, room layout, cosmetics, placed equipment tiers, selected recipe levels, visible collections, stickers, and the matching visual simulation config. It excludes pantry contents, balances, till, account UUID, seed, run state and private receipts. Blocking prevents authenticated interactions; it cannot make an already-published public URL private. Unpublish to remove the public room.

Friend requests require acceptance. Fixed stickers have sender/day and pair/day limits and grant no ingredients. A friendship parcel consumes the same recipient-wide allowance as the regular's daily kindness. Additional friends cannot raise that daily ingredient allowance.

Trades exchange exactly one ingredient for one ingredient; neither coins nor arbitrary quantities can be sent. Both parties must be level 8 and below five completed trades that UTC day. The offer removes the sender's ingredient into escrow; the recipient explicitly accepts the saved terms. Pair transactions lock both players in stable UUID order and compare both revisions, so normal commands, competing trades and rewards cannot spend the same stock. Each diner may have three pending offers. Either participant can cancel/decline and refund escrow even after a block. Expired offers refund on cancellation or attempted acceptance; there is no background expiration worker yet. Trades currently permit different rarities, as the bible's one-for-one rule does; test its effect on rare concentration before public launch. Accounts and daily caps are not proof of distinct people.

Supabase anonymous accounts require no wallet. Email linking uses the authenticated user update/verification flow, never an administrator's auto-confirm API. A request to send a verification email does not report the identity as verified. The account endpoint can verify an `email_change` OTP and returns any newly issued session. Provider confirmation, secure email change, manual identity linking, email delivery and callback settings require staging validation. Reference: [Supabase anonymous account upgrades](https://supabase.com/docs/guides/auth/auth-anonymous).

## Required before enabling online saves

- Review and apply `supabase/migrations/20260920_diner_preview.sql`, then `20260921_diner_preview_social.sql`, in an isolated staging project first. Neither migration was applied during implementation.
- Set `DINER_PREVIEW_SERVER_ENABLED=true` only after provisioning the new tables and RPCs. The default is disabled. Existing Supabase URL, anonymous key and service-role key are required. Keep the service role on the server.
- Enable Supabase anonymous sign-ins with CAPTCHA/rate limits. Configure secure confirmed email upgrades and a trusted `DINER_PREVIEW_APP_URL`; allow only the intended preview callback. Email templates should include the verification code if using the in-app OTP form.
- Test real RLS/role permissions: anonymous/authenticated clients must not read or write the tables or execute mutation RPCs; the server may read and use the reviewed functions. Never expose service credentials to the browser.
- Exercise two devices, simultaneous inverse-direction trades, an uncertain HTTP result retried with the same UUID, a failed second participant revision, duplicate claims, clock rollback, absent/expired auth, and a trade cancellation after blocking. Verify both balances and escrow totals from an independent read.
- Verify confirmed email recovery preserves the original account UUID. Complete guest → fresh online diner messaging and pending-command recovery tests; guest balances must never be adopted as server progress.
- Measure database storage and latency under real active-play input frequency. The review schema currently records a full canonical checkpoint for every accepted request and needs an explicit retention/archiving budget before public scale.
- Review public fields, moderation/reporting, deletion policy, abuse limits and operational telemetry before public discovery is enabled. No production release is implied by local checks.

## Observed local checks and open balance work

Local scripts cover pure service, home simulation, progression, authority, social, and predictive transport. `dk-diner-social-check.mts` passes nine groups covering private-field exclusion, consent, blocks/unblocks, shared kindness, sticker replay, escrow, recipient-only acceptance, refunds, expiry, both trade caps, forged payloads and static SQL lock/CAS structure. `dk-diner-social-sync-check.mts` passes five groups by running the real hook writer against fake I/O and the real reducer: uncertain responses retain the UUID, a different new click cannot masquerade as a retried action, conflict snapshots rebase, 401 refresh/429 retry preserve the original envelope, and failed local storage prevents sending an unrepeatable action. Focused server and new social/public-view TypeScript checks passed. These tests do not establish that a live database transaction or an email provider is configured correctly. No live database or email verification was exercised.

Social counterpart updates use the same canonical player row locks as normal commands, with both expected revisions checked before either state changes. Actor command receipts are unique by player/UUID. The audit stream is unique by player/revision; it intentionally allows a UUID to appear as both an observed pair event and a later local command reference without creating a false duplicate-key failure. Concurrent transaction behavior still requires the staging checks listed above.

Run the scripts through `scripts/dk-check-runner.cjs`; on this Windows workspace use Node's `--preserve-symlinks --preserve-symlinks-main` flags. `scripts/dk-diner-balance.mts` prints explicit sample rooms at levels 1, 5, 10, 20 and 30. At present a starter burger room measures 1,500 coins/hour: 7,200 for one full offline till, or 14,400 for two. That exceeds the bible's initial 2,000/day illustration and remains a private balance concern, not a finished economy claim. Dish prices are shown truthfully without a hidden home-price reduction. Reputation thresholds were increased twelvefold after measuring the livelier 60-arrivals/hour baseline. The content catalogue needs 630 ingredient units for every dish to reach level 10: 90–126 ideal days at 7–5 ingredients, before uneven stock and recipe discovery. Playtesting must establish whether real players land in the intended four-to-five-month range.
