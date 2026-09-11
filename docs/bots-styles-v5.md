# Model Kombat: meaningful builds and playable specials

Preview implementation and verification, 11 September 2026.

## Play the preview

Open `/bots/fight/styles?style=ranged&tier=3&seed=75`. Tank, Speed, Ranged, tiers, weapons, rivals and repeatable seeds can be changed in the practice room. Press **Special**, **Q** or **Space** when the meter is ready. **Replay my button presses** reproduces the accepted commands. Practice needs no wallet and awards no coins.

The main `/bots` builder and shop use `BOTS_STYLES_V1=1` and `NEXT_PUBLIC_BOTS_STYLES_V1=1` alongside the existing onboarding/workshop preview flags. Both styles flags are enabled in the local task's preview launcher. Nothing was deployed or applied to a hosted database.

## Builds, equipment and compatibility

- Tank, Speed and Ranged are guides. A new styled body chooses the special; head, independent limbs, paint and weapons remain mixable. Colour and matching sets add no hidden v5 bonuses.
- Catalogue 2 has fifteen starter offers with equal three-point budgets and distinct trade-offs. Seven editable choices cost exactly 250 coins. Body comes first, the special appears immediately, and choosing a guide does not overwrite choices. Old drafts retain their recorded catalogue.
- The shop has sixteen versioned daily listings, including a hammer, blade and rifle every day. Tier 2 introduces a paired-blade item; tier 3 bodies unlock endings; tier 4 adds equipment and visual details without another ending. The popup compares actual aggregates, independently selected limbs, range and special access.
- Original saved toy identities are used in combat. New rifles, paired blades, retractable pistols and body details attach to the existing toy rigs. Ordinary rifle fire needs 1,500 simulation units of separation. Crowding can interrupt aiming and trigger a shove, backdash or retreat. Arm-only shoves remain possible after leg loss; dashes require both legs.
- New starter Finish and styled spare-part assembly validate exact canonical stats and bind seven owned instances transactionally. Retries cannot spend twice or claim an item for two robots. Finished parts remain permanent; cosmetics remain editable. Browser handoff does not import local coins or results.
- Existing completed robots are never upgraded to v5. Engines 2–4 remain intact, and historical replays explicitly select their recorded engine. Styled robots are blocked as both challengers and targets in legacy player fights, with a warning before Finish.

## Released preview rules: `mk5-1`

The engine advances at 60 fixed ticks per second with seeded randomness, integer positions, bounded turning, action preparation/contact/recovery, swept projectiles, independent limb capabilities and recorded impact locations. Rendering cannot decide a hit or winner.

All specials last at most 300 ticks. The meter starts at zero, earns five points per second plus actual body damage as a percentage of starting armour, and caps that damage bonus at forty points per charge. Activation costs 100. Active specials, blocked damage, limb damage and overkill do not charge it.

| Special | Five-second effect | Tier 3+ ending in the final second |
| --- | --- | --- |
| Energy Shield | Absorbs 90% of damage, capped at 35% of starting body armour; ordinary blocking does not multiply it. | Interruptible contact charge can knock down once. Shield exhaustion cancels it. |
| Overdrive | Movement ×1.5, attack speed ×1.2, damage ×1.25, evasion +15 percentage points capped at 60%. | Actual flank and rear blade contact; a clean hit may remove a limb already below 25% durability. Healthy limbs receive ordinary damage. |
| Slow Field | Rival movement, turning and attack speed ×0.7 immediately; the game clock is unchanged. | Independent arm-mounted pistol bursts share a pre-defence damage cap of two rifle hits. |

Endings require their working limbs and valid positioning, can be interrupted, and end with the special window. Already emitted projectiles can finish their short flight. Stuns/knockdowns retain recovery protection. Current rules must be preserved for recorded `mk5-1` sessions; future balance changes require versioning rather than reinterpreting those records.

## Server-owned house fights

The client sends only a start request or a special press. The server controls time, eligibility, builds, accepted ticks and settlement:

| Endpoint | Request |
| --- | --- |
| `POST /api/bots/fight/live/start` | `{botId, difficulty, requestId}` |
| `GET /api/bots/fight/live/[id]` | Authenticated resume/state |
| `POST /api/bots/fight/live/[id]/input` | `{inputId, kind: "special"}` |

Existing BotsSession authentication identifies the wallet. No client tick, side, seed, build, winner or damage is accepted. Input receipts and revision checks handle retries and races. Private responses contain exact build/appearance/rules snapshots, accepted commands, state and settlement status. The browser displays confirmed simulation progress and ignores older revisions.

House difficulty uses the whole equipment budget, so one high-tier body among starter parts does not create a full high-tier matchup. Start consumes one existing daily attack. Settlement calls the existing reward policy and `bb_grant` once using a session-specific reason, in the same transaction as fight completion. It does not redefine shared accounting functions. Active/pending robots cannot be recycled; completed replay snapshots survive recycling.

The server advances elapsed time on requests. Disconnecting does not pause the simulation or invent special presses; the next request catches up and settles if needed. There is no new background worker. New session history is separate from the legacy feed; retain the session URL to reopen its replay.

### Before enabling wallet house fights

Review `scripts/sql/bots-styles-starter-v1.sql` and `scripts/sql/bots-live-house-v5.sql` against the deployed game schema. They depend on the existing onboarding and independent-limb migrations. Older migration prerequisites need their own review; do not blindly apply shared-function replacements from earlier work.

Deploy matching catalogue, engine and API code with enrollment flags disabled; apply the two reviewed game migrations through the authorized migration process, then enable both styles flags in preview. Missing schema returns a setup error rather than silently granting an old starter. Turning off new starts still permits existing sessions to resume and settle.

**No live SQL, real-wallet enrollment, hosted house fight, production deployment or reward write was performed in this task.** Doma Reporter, other bots, MCP intake, shared accounting function definitions and paid asset generation were outside this work.

## Verification

The portable local fixture runner is `node --preserve-symlinks --preserve-symlinks-main scripts/bots-styles-check.cjs`. The SQL fixture needs `BOTS_PGLITE_PATH` pointing to an installed `@electric-sql/pglite`; it does not load environment files or connect to the hosted database.

- **12 mechanics groups:** meter/shield/slow/ending rules, limb dependencies, recovery protection, range and escape behavior, input retries and replay. Includes 352 mixed/tier fixtures and 40,235 checked trajectory ticks.
- **2,304 balance matches:** 64 seeds per ordered pair across four equal-budget tiers. Zero timeouts; every rifle fired at least twice. Pair win rates 36.7–63.3%; overall style rates 43.2–58.3%. Side-zero win rates by tier were 49.8%, 52.3%, 47.7% and 52.8%, within the five-point side-bias threshold. Mean matchup lengths were 17.1–39.6 seconds.
- **200 historical baseline hashes unchanged**, plus explicit v2/v3 replay routing and exact saved-build preview tests.
- **7 onboarding/shop groups:** starter accounting, exact Finish/preview stats, mixed choices, old drafts, handoff, 105 shipment days, side-aware comparison and permanent assemblies. Existing 183 legacy comparisons and eight earlier onboarding SQL groups also pass.
- **12 API/PGlite groups:** real route validation, transactional Finish/assembly, wallet isolation, duplicate and racing requests, accepted ticks, reconnect, rollback/reward retry, recycling and RPC privileges. These use local signed test sessions and fixture SQL.
- **7 isolated live-client checks:** older same-frame revision rejection, lost input response reconciled by polling, new input IDs afterward, completion stops polling, reload resumes one session, difficulty-specific start keys, and replay/keyboard input cannot start or reward another fight. No real wallet/API was used.
- **Actual-model geometry checks:** three GLB builds, 54 impacts and four manual commands reconstruct identical dents at 1-, 4- and 7-tick render cadence. Other clones and protected mechanisms remain unchanged; detached weapons/pistols remain attached to the lost arm. All 146 tracked damage resources dispose once. Added armour vertices stay below the 28,000 budget. Sampled folded rifle has approximately 0.255 m clearance at legal firing distance.

The balance figures are a bounded benchmark, not proof of every mixed build or optimal manual timing. Collision is planar with body circles and weighted limb contacts, not a full rigid-body mesh simulation. Damage uses bounded, normalized part-local deformation; lenses, joints and weapon mechanisms are protected.

Full integrated TypeScript (`tsc --noEmit --incremental false`) and scoped whitespace checks pass. Fresh browser tests confirm all sixteen item images load and tiles fit at 1280×720, with nine complete tiles at 390×844. Actual manual-special playback, restart on the same canvas, reduced-motion camera disabling and phone layout complete without page errors or horizontal overflow. The recorded manual fight and its replay both finish with 29 dents and 10,774 changed vertices.

### Rendering measurement

On the development laptop (Intel Core i5-11300H; installed Intel Iris Xe and NVIDIA GTX 1650, active GPU not identified), a 1440×900 in-app-browser replay produced twenty-five one-second active-fight samples: one at 57 FPS and twenty-four at 60 FPS. Sampled JavaScript draw work was 2.8–5.1 ms; this is not a GPU timing measurement. The damaged final scene had 221 draw calls and 217,350 triangles, with the crowd video playing. Pixel ratio is capped and only the visible scene advances.

Earlier simultaneous compilation/headless checks caused substantial frame-rate dips. The quiet replay sample meets the desktop target, but is not a long performance soak. Isolated headless Chromium rendered at 1–2 FPS and was used for functional/layout checks only. No physical phone was available, so the 30 FPS device target is unverified.

Local task artifacts are under `C:/Users/Mike/Documents/Codex/2026-09-07/i-b/outputs/`: `styles-ui-review`, `styles-fight-review` (including `app-browser-performance.json`), `live-client-qa`, and `v5`. Companion onboarding/shop notes are in `docs/bots-styles-ui-v1.md`.

Physical-mobile FPS, deployed PostgREST calls, multi-process hosted database contention and an optimized production build remain rollout checks.
