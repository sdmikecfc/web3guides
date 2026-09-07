# Living workshop pilot — implementation handoff

## Open locally

- `/bots` — persistent Garage / Parts / Build / Fight shell, with help, progress and campaign drawers.
- `/bots/fight/demo?seed=75&showcase=1` — the two original showcase builds; 32.4 seconds, with 31 attacks in the first 30 seconds.
- `/bots/fight/demo?seed=75&showcase=1&loadout=hammer` — the boot-and-hammer build; about 24.3 seconds, including kicks and off-hand punches.
- Append `&renderer=legacy` to a demo replay to compare the retained native fight renderer.

These are practice examples. Their results are not community wins or campaign awards. Practice garage state is isolated in this browser; connecting uses a separate authenticated inventory.

## Implemented

The Blender pilot supplies 21 designs, 29 independent side modules, 19 animation clips and a common 19-bone skeleton. The authored scene and rebuild script are in `art-src/bots/blender/`; runtime exports are in `public/bots-art/3d/pilot/`. Whole builds load before reveal. Unsupported catalogue moulds and historical cosmetics select the native model before playback. No paid asset provider was used.

The presentation director maps recorded hits, misses and blocks to movement, including weapon-family variations, off-hand attacks and eligible kicks. Contact correction aims the actual hand, foot or weapon surface at the recorded target. Wheels restrict kicks. Broken arms retain their held weapon as visible debris. A separate presentation clock finishes the knockout animation after the simulation stops. Simulation files, attachment coordinates, shipment and fixtures retain their original bytes.

The shell starts in a warm garage. New versioned onboarding atomically provisions a welcome robot, 250 reserved coins and durable progress. Seven independently owned beginner pieces use neutral identities and `[1,1,1]` base stats. Purchases resume and retry without another grant. Practice consumes no coins, daily fights, XP, prize points or repair time. Completed practice leads to a short earning explanation. Trading setup remains an explicit action; unavailable verification is reported honestly.

The reporter checkout at `C:/Users/Mike/Desktop/trading-bot/doma-reporter` contains the 30-day campaign ledger, realized FIFO profit and capital accounting, authenticated execution verification, tied-prize splits, reviewed/frozen exports, cumulative visit milestones and operator measurements. The four categories each allocate $500 across four weekly podiums and the monthly final: $2,000 over 60 scheduled award slots. No transfer runs automatically.

## Local verification

- The optimized Next.js production build, lint and TypeScript checks pass. The built server was then checked in the browser. Existing optional wallet-dependency/cache warnings and non-bots dynamic-route notices remain non-blocking.
- All 200 frozen fight baselines retain their original rollups: `fa0df511`, `98c10093`, `e750eafb`, `9e5392ed`; aggregate `9fd36ca7`.
- The asset check verifies 59 GLBs and all 20,480 pilot assemblies. Worst robot is 10,832 triangles and 23 main-pass draws including its plate; the optional happy-face overlay adds one draw. Room geometry and shadow passes are separate.
- Director, sound lifecycle, persisted demo state, actual onboarding SQL, rollout routes, native debris and terminal-contact recovery checks pass.
- Reporter accounting, receipt attribution, private campaign/progress views, actual in-memory PostgreSQL migrations and milestone measurements have dedicated passing checks.
- Browser review covered the 390×844 phone layout, independent purchases, reload/resume, embedded fighting, contact points, knockout, share-picture export and the truthful disconnected progress drawer.
- The production garage and replay reported no new browser console errors. The sound setting survived reload and was restored to silent after testing. The disposable demo was reset to its fresh 250-coin welcome for review.
- Development renderer CPU samples on this desktop were about 2.1–3.1 ms after warmup, with initial windows about 5–6 ms. This excludes GPU completion and is not a phone FPS measurement.

## Rollout and remaining acceptance gates

Public switches `NEXT_PUBLIC_BOTS_WORKSHOP_V1=1` and `NEXT_PUBLIC_BOTS_TOY_PILOT=1` opt into the shell and pilot at build time. `BOTS_ONBOARDING_V1=1` enables new versioned provisioning on the server. Production defaults are off; local development defaults are on. See `scripts/sql/rollout-flags.md` for independent rollback and the permanent resume door for existing onboarding.

Apply the reviewed additive SQL before enabling new provisioning. The web onboarding migration is `scripts/sql/bots-onboarding-v1.sql`; reporter campaign/progress migrations are 010 and 011 after their existing prerequisites. Follow `onboarding-v1-migration.md`, reporter `modules/battlebots/CAMPAIGN_V1.md` and reporter `PROGRESS_V1.md`. No remote migration, deployment, launch time or cash switch was changed here.

Doma still needs to provide the authenticated direct-MCP execution-record producer. Until then, those trades stay pending. The current verified-capital adapter covers USDC.e-quoted fills; unsupported quotes or ambiguous evidence remain pending. A signed-wallet deployment smoke test, configured launch date and operator review are required before cash accounting activates.

The ordinary saved-build cosmetic hook in `_server/bots.ts` and `api/bots/bot/save/route.ts` is staged but not installed: automatic approval review cited the original protected-backbone restriction. Its named-path permission question is pending. Onboarding-build, completed-fight and observed-day milestones work independently.

The live pilot still needs human watch-through acceptance and a representative midrange phone GPU measurement. Full-catalogue Blender conversion follows acceptance of this pilot. Optional marketing cinematics remain deferred.

## Full rooms inside the shell (7 September)

The daily cabinet and five-bay garage now live inside the persistent game shell. `/bots?view=parts` opens the original cabinet with its type, colour and family filters, desktop counter and mobile part inspector. `/bots` opens the robot collection once practice is complete. The bottom navigation and coin balance stay in place while room inventories scroll.

New players still start with the guided welcome and seven beginner purchases. “Look around the workshop” opens `/bots?tour=1` without completing onboarding or changing its allowance. The tour displays the original four sample robots, labelled as samples; “Back to my robots” returns to the saved collection. Returning practice players can open the same tour with “Meet the workshop robots.”

The cabinet uses the shell's authoritative server shipment and spendable balance for connected accounts. Expired shipments offer a refresh before purchase. The practice tour is browse-only: it does not grant trading coins or add catalogue parts. Completed practice collections support five persistent bays; creating an empty bay adds no funds or parts. Left and right parts remain independently owned, and duplicate attachment is rejected when saving.

`scripts/bots-workshop-rooms-check.ts` checks server listing preservation, sample isolation, five-bay reload and moving an independent arm without duplication. `scripts/bots-game-state-check.ts` continues to cover guided purchases, interruption/reload and forged claims. Mobile browser review includes cabinet filtering, the inspector-to-help transition and entering/leaving the sample tour without changing saved robots.

The room restoration also passed an optimized production build (lint and TypeScript included), followed by desktop and 390 × 844 browser review of the built server. The selected mobile bay is centered, the navigation stays visible, and production review reported no browser console errors. All 12 protected source files still match the pre-implementation SHA-256 snapshot. Saved local robots were preserved during this review; no practice reset, live purchase or account migration was performed.
