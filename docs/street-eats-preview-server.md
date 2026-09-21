# Street Eats preview: persistence and release gates

This is a fresh, separate preview. Its browser key is `street_eats_preview_v1`, its APIs are under `/api/chef/diner`, and its database tables begin `diner_preview_`. It does not import, migrate, overwrite, or grant credit from existing Domain Kitchen saves. Production migration policy remains undecided. Token rewards are disabled and are not part of this preview.

## Deploying wallet accounts

The browser preview is available by default. `domainkitchen.xyz` and `www.domainkitchen.xyz` open it at `/`, `/chef` and `/chef/`. `/diner-preview` and `/chef/diner-preview` remain direct aliases. Explicit `/game` and `/chef/game` retain the legacy game and its independent saves; the older `chef.web3guides.com` homepage also retains its existing behavior. The art bench stays development-only.

For an explicit rollback, set `DINER_PREVIEW_ENABLED=false` at build and runtime and redeploy. This restores the dedicated-domain homepage to the legacy game and makes the new diner page return 404.

Public diner play now requires a wallet account. With `DINER_PREVIEW_SERVER_ENABLED=false`, the opening screen stays closed and explains that wallet accounts are being prepared; it does not open a guest diner. The explicit local-development sandbox is available only in development builds on localhost/loopback, carries a visible label, and retains its independent browser save. A production build cannot enable it through a query string or hostname. Build/deploy a clean checkout of the intended commit: a Vercel CLI deployment from a dirty workspace can include unrelated uncommitted files.

The wallet signs a human-readable EIP-4361 sign-in message. There is no transaction, gas fee, chain switch, token approval or permission to spend assets in this flow. The challenge contains the approved origin, exact wallet, current chain identifier, a cryptographically random nonce, issue time and five-minute expiry. The server verifies the exact stored message and its signature, atomically consumes the nonce, asks Supabase Web3 Auth to issue a session, then registers the verified session ID against its account UUID and wallet. Every private diner API requires both a valid Supabase token and this server-owned registration. Anonymous, email-only and directly issued unregistered Supabase sessions cannot open an account. Refresh preserves the registered session ID; expired/revoked sessions require another sign-in. Account switching and disconnection unmount play, while pending input and social receipts are namespaced by wallet.

Current signature verification supports ordinary Ethereum externally owned accounts. Contract-wallet/EIP-1271 sign-in has not been implemented or verified and may fail; it must not be presented as tested support. No real wallet signature, provider login or live database transaction was exercised during implementation. Reference: [Supabase Web3 authentication](https://supabase.com/docs/guides/auth/auth-web3).

## Current authority model

The browser predicts the shared reducer and sends ordered intentions. The server replays them against its stored state, with a command UUID, expected revision, and a bounded server-time budget. A transaction commits canonical state, a replay receipt, accepted inputs, and a checkpoint together. Repeating a UUID returns its receipt; different inputs cannot reuse it. A stale revision does not overwrite a newer device.

The cooking clock runs at the content engine's 20 Hz. One request permits at most 128 actions and 100 elapsed ticks. An accumulated gap above five seconds pauses the active simulation and discards the stale predicted tape. Pause/resume does not preserve unused time credit. A recent server-observed request interval of at most 30 seconds settles the home at its online rate; longer absences use 60%. No submitted presence flag is accepted.

The headless home model and visible home model share `homeSimulationConfig`. Layout, reachable stations, staff, selected dishes, mastery, charm, buzz and the daily staff meal determine measured output. Offline capacity starts at eight hours. No maintenance penalty is imposed on this new home; optional incidents have fixed daily coin receipts.

The ingredient allowance is seven units per UTC day: crate 2, market 1, garden 1, regular/visit kindness 1, and qualified truck runs 2. Regular friendship uses measured output of a favourite dish and one daily visit receipt. Practice does not pay haul, grant trip collections, consume a trip number, or issue the tutorial home fryer. That introductory home fryer is issued once; later home equipment copies cost banked coins.

## Social and account boundaries

Publishing a canonical preview diner is opt-in. A public response includes its name, room layout, cosmetics, placed equipment tiers, selected recipe levels, visible collections, stickers, and the matching visual simulation config. It excludes pantry contents, balances, till, account UUID, seed, run state and private receipts. Blocking prevents authenticated interactions; it cannot make an already-published public URL private. Unpublish to remove the public room.

Friend requests require acceptance. Fixed stickers have sender/day and pair/day limits and grant no ingredients. A friendship parcel consumes the same recipient-wide allowance as the regular's daily kindness. Additional friends cannot raise that daily ingredient allowance.

Trades exchange exactly one ingredient for one ingredient; neither coins nor arbitrary quantities can be sent. Both parties must be level 8 and below five completed trades that UTC day. The offer removes the sender's ingredient into escrow; the recipient explicitly accepts the saved terms. Pair transactions lock both players in stable UUID order and compare both revisions, so normal commands, competing trades and rewards cannot spend the same stock. Each diner may have three pending offers. Either participant can cancel/decline and refund escrow even after a block. Expired offers refund on cancellation or attempted acceptance; there is no background expiration worker yet. Trades currently permit different rarities, as the bible's one-for-one rule does; test its effect on rare concentration before public launch. Accounts and daily caps are not proof of distinct people.

The account surface identifies the signed wallet. “Sign out this device” revokes that server session before clearing its local credentials, while retaining unresolved command IDs for the same wallet's next sign-in. An uncertain sign-out is reported as a failure, not treated as a confirmed revocation. A failed refresh returns an explicit reconnect attempt to the signature screen. The former anonymous-session creation and email linking/recovery endpoints are closed; the original browser and anonymous-account checkpoints are not deleted or converted into wallet progress. Reconnect the same wallet to return to its canonical diner. An account recovery or legacy import policy requires a separate decision.

## Required before enabling online saves

### Why this preview asks for a Web3 provider

This is a choice of the current diner implementation, not a requirement for connecting or verifying an Ethereum wallet. Launch Wars issues its own expiring session after signature verification; Doma Reporter verifies a signature to link an address to a Discord account. The earlier Domain Kitchen also used custom sessions. This diner instead exchanges its verified wallet proof through `auth.signInWithWeb3`, validates the resulting Supabase session on private requests, and keys player records to `auth.users`. That is why the provider must be enabled for the current code.

A custom signed-session design could remove the provider dependency while preserving the same signature-only player experience. It requires a deliberate replacement of identity/session issuance, refresh, revocation and foreign-key ownership while retaining existing player IDs and saves. Removing the provider check or merely accepting a connected address would not implement that replacement. The closed-account banner below checks environment configuration only; it does not diagnose database migrations or provider settings.

If the wallet address is visible but the page says **“Wallet accounts are being prepared”**, connection succeeded but game sign-in has not started. Check `/api/chef/diner/status`: `enabled=false` means the deployment's account-service flag or required environment values are missing. Applying SQL alone does not enable that flag. The three migrations below are required; older `domain_kitchen_*` migrations do not create these diner tables. Production is released only by the owner running `vercel --prod`; a Git push does not update the live site.

Follow this order against a separate staging Supabase project, then repeat the reviewed configuration for the selected production project. Keep the public server flag off until the staged wallet and save checks pass. No command below has been applied by this implementation.

1. Back up the selected project and verify its identity. In its SQL editor, review and run the **complete contents** of these three files in order: `supabase/migrations/20260920_diner_preview.sql`, `supabase/migrations/20260921_diner_preview_social.sql`, `supabase/migrations/20260923_diner_preview_wallet_auth.sql`. Each file contains its own transaction. Do not run every pending migration in this working tree: the older `domain_kitchen_*` migrations belong to a different game namespace.
2. In **Authentication → Providers**, enable **Web3 Wallet / Ethereum** and keep email/anonymous creation out of the diner flow. Add the exact sign-in URI `https://domainkitchen.xyz/chef/diner-preview` and its trailing-slash variant `https://domainkitchen.xyz/chef/diner-preview/` to the redirect allowlist. Add the corresponding `www` URLs only if used. Give staging its own exact HTTPS origin and URI; do not broadly allow arbitrary preview domains. The signed message uses the URI without the trailing slash; the provider's current [official setup instructions](https://supabase.com/docs/guides/auth/auth-web3) explicitly call out slash matching.
3. Set the following values in the correct Vercel environment. The two public Supabase values must identify the **same project** as the private service-role key. Public build variables require a rebuild; changing a dashboard value alone does not change an existing deployment.

| Variable | Required value / scope |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Selected Supabase project's HTTPS URL; public build and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | That project's public anonymous key; public build and server |
| `SUPABASE_SERVICE_ROLE_KEY` | That project's service-role key; server secret only |
| `DINER_PREVIEW_ENABLED` | `true` for the new entry; `false` is the existing legacy rollback |
| `DINER_PREVIEW_SERVER_ENABLED` | Start with `false`; set `true` only after staged acceptance |
| `DINER_PREVIEW_APP_URL` | `https://domainkitchen.xyz` in production; staging's exact HTTPS origin in staging |
| `DINER_WALLET_ORIGINS` | Optional exact additional origins, comma-separated; e.g. `https://www.domainkitchen.xyz` |
| `DINER_WALLET_RATE_SECRET` | Private, cryptographically random secret of at least 32 characters; never put it in source or public build variables |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Real wallet-connection project ID for QR/deep-link support, with the intended hosts allowed by that project |
| `VERCEL` | Vercel's platform-provided `1`; do not spoof this on a host that does not supply trusted Vercel request headers |

4. Check schema and privileges with these **read-only** queries. The first must return all nine names, all with `rowsecurity=true`. The second must return the eight expected functions with `prosecdef=true`, `anon_execute=false`, `authenticated_execute=false`, and `server_execute=true`. These metadata checks do not replace live concurrency tests.

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'diner_preview_players', 'diner_preview_commands', 'diner_preview_run_inputs',
    'diner_preview_profiles', 'diner_preview_friendships', 'diner_preview_trades',
    'diner_preview_wallet_challenges', 'diner_preview_wallet_limits',
    'diner_preview_wallet_sessions'
  )
order by tablename;

select p.proname, p.prosecdef,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as server_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'diner_preview_initialize', 'diner_preview_commit',
  'diner_preview_social_initialize', 'diner_preview_social_commit',
  'diner_preview_wallet_issue', 'diner_preview_wallet_burn',
  'diner_preview_wallet_register', 'diner_preview_wallet_revoke'
)
order by p.proname;
```

5. On the staged deployment, verify disabled entry first. Then enable its server flag, redeploy, and sign in with a test wallet. Check rejection/cancellation, exact origin, nonce expiry/replay, same-wallet second-device continuity, other-wallet isolation, save/reload, a lost command response retried with the same UUID, session refresh, and “Sign out this device” followed by a refused old/refreshed token. Repeat on a real mobile wallet. `GET /api/chef/diner/status` reporting `enabled=true` only establishes the app's environment checks; it is **not** a database/provider health certificate.
6. Only after those results are reviewed, configure the production project and enable its server flag in a clean release deployment. If account setup fails, keep `DINER_PREVIEW_SERVER_ENABLED=false`; the new diner shows a closed wallet-account screen. Do not enable a production guest fallback. Setting `DINER_PREVIEW_ENABLED=false` is a separate rollback that exposes the preserved legacy game instead.

Detailed acceptance requirements:

- Configure provider and edge rate limits before opening public sign-in. Challenge issuance must use the trusted hosting requester identity and shared resource budgets, not a caller-selected wallet as a victim's quota. Do not assume different wallets or IP addresses identify different people.
- The current requester adapter supports Vercel's platform-owned `x-vercel-forwarded-for` only when `VERCEL=1`, plus one shared loopback-only development bucket. Other production hosts and missing trusted headers fail closed. Set a private `DINER_WALLET_RATE_SECRET` of at least 32 characters; the service-role key is a server-only fallback. HMAC hashes, not raw IP addresses, are stored. The database caps issuance at six challenges per requester per five minutes with ten-second spacing, 120 per approved origin and 300 globally per five minutes. Bounded expiry cleanup and 2,048-row ceilings limit temporary storage. These defaults still need real traffic, shared-network and edge-abuse testing; they are resource limits, not an availability guarantee.
- Test real RLS/role permissions: anonymous/authenticated clients must not read or write the tables or execute mutation RPCs; the server may read and use the reviewed functions. Never expose service credentials to the browser.
- Exercise two devices, simultaneous inverse-direction trades, an uncertain HTTP result retried with the same UUID, a failed second participant revision, duplicate claims, clock rollback, absent/expired auth, and a trade cancellation after blocking. Verify both balances and escrow totals from an independent read.
- Verify same-wallet sign-in on two devices preserves the same account UUID, reconnect refresh retains its registered session, and a different wallet cannot read or replay the first wallet's pending input. Test rejected signatures, tampered domains/messages, expired and concurrent replayed nonces, missing tables, provider failure and disabled-server production entry. Guest balances must never be adopted as server progress. A mobile wallet requires a configured WalletConnect project ID or a compatible in-app wallet browser; verify the existing connection chooser on actual target devices.
- Measure database storage and latency under real active-play input frequency. The review schema currently records a full canonical checkpoint for every accepted request and needs an explicit retention/archiving budget before public scale.
- Review public fields, moderation/reporting, deletion policy, abuse limits and operational telemetry before public discovery is enabled. No production release is implied by local checks.

## Observed local checks and open balance work

Local scripts cover pure service, home simulation, progression, authority, social, and predictive transport. `dk-diner-social-check.mts` passes nine groups covering private-field exclusion, consent, blocks/unblocks, shared kindness, sticker replay, escrow, recipient-only acceptance, refunds, expiry, both trade caps, forged payloads and static SQL lock/CAS structure. `dk-diner-social-sync-check.mts` passes five groups by running the real hook writer against fake I/O and the real reducer: uncertain responses retain the UUID, a different new click cannot masquerade as a retried action, conflict snapshots rebase, 401 refresh/429 retry preserve the original envelope, and failed local storage prevents sending an unrepeatable action. Focused server and new social/public-view TypeScript checks passed. These tests do not establish that live database transactions or wallet-provider authentication work. No live database write or real-wallet login was exercised.

Wallet-specific local checks pass fifteen generated-key signature/nonce/registry/requester-limit groups with fake provider/database I/O, eight client groups covering account isolation, fresh-signature recovery, confirmed/uncertain sign-out and persistent initial-load errors with successful retry, the eighteen existing predictive transport groups, and the five social-writer groups under wallet-scoped storage. Focused auth/UI TypeScript also passes. They establish local behavior, not deployed authentication, live row-lock semantics or an independent security certification. Review the migration and exercise the staged wallet flow before enabling production play.

A read-only readiness check on 20 September 2026 found Supabase URL/anon/service credentials in the local environment, but no local `DINER_PREVIEW_SERVER_ENABLED`, `DINER_PREVIEW_APP_URL` or WalletConnect project ID. All nine diner-table zero-row REST probes returned `404 PGRST205`, so the configured project's PostgREST schema did not expose the required tables. Public auth settings returned successfully and reported anonymous accounts disabled, but exposed no Ethereum/Web3 flag; provider enablement remains unverified. These observations concern the locally configured project, not Vercel's deployed environment. No records, schemas, auth settings or deployment variables were changed.

Social counterpart updates use the same canonical player row locks as normal commands, with both expected revisions checked before either state changes. Actor command receipts are unique by player/UUID. The audit stream is unique by player/revision; it intentionally allows a UUID to appear as both an observed pair event and a later local command reference without creating a false duplicate-key failure. Concurrent transaction behavior still requires the staging checks listed above.

Run the scripts through `scripts/dk-check-runner.cjs`; on this Windows workspace use Node's `--preserve-symlinks --preserve-symlinks-main` flags. `scripts/dk-diner-balance.mts` prints explicit sample rooms at levels 1, 5, 10, 20 and 30. At present a starter burger room measures 1,500 coins/hour: 7,200 for one full offline till, or 14,400 for two. That exceeds the bible's initial 2,000/day illustration and remains a private balance concern, not a finished economy claim. Dish prices are shown truthfully without a hidden home-price reduction. Reputation thresholds were increased twelvefold after measuring the livelier 60-arrivals/hour baseline. The content catalogue needs 630 ingredient units for every dish to reach level 10: 90–126 ideal days at 7–5 ingredients, before uneven stock and recipe discovery. Playtesting must establish whether real players land in the intended four-to-five-month range.
