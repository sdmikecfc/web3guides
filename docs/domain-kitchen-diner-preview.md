# Domain Kitchen diner preview: implementation handoff

The approved diner build is playable at **[http://localhost:3010/chef/diner-preview](http://localhost:3010/chef/diner-preview)**. It combines a persistent restaurant with manual food-truck expeditions, using original Three.js models and a shared deterministic simulation. This is a local implementation preview, not a production economy or deployment sign-off.

Read this alongside [persistence, account and social release gates](street-eats-preview-server.md) and the [3D art specification](street-eats-art-spec.md). The earlier Domain Kitchen redesign and truck documents describe earlier implementations; the files under `src/lib/chef/diner` and this preview are the current diner implementation.

## Version two: visuals and direct interaction (20 September 2026)

Staff still cook and serve automatically. Player upkeep happens on the scene: move a cloth back and forth over the remaining spill, or remove delivery tape and open two flaps. The earlier hold-to-clean card has been removed. Selecting a furnishing exposes its own movement/improvement controls; selecting a job never pays a reward. Trips require explicit opening actions, and dismissing a paused/choice surface cannot advance a run.

The home has one supported foundation, an entrance terrace, paneled walls, arched café windows, crockery shelving and a striped entrance. Context props and regulars stand on the terrace. Shared models use deeper teal, coral, porcelain and wood, with upholstered chairs, enamel equipment and larger cartoon faces. Regulars face the street and occasionally wave. The compact interface keeps three illustrated controls. Portrait play uses a closer pan/zoom view; editing retains that scale and reveals the placement grid.

The follow-up presentation pass adds connected pavement edging, two planted beds, wall lamps, restrained foliage movement and independent character blinks/idle motion. Cooking, washing and eating use attached tools; home staff and truck helpers derive their tool/facing from the actual task station and recipe. Tools disappear while moving or carrying, and carried food remains simulation-owned. Burger and fries silhouettes are more legible. Reduced-motion preferences disable foliage and reward motion.

Daily ingredient parcels now use the same direct tape/two-flap interaction as deliveries. Partial opening persists across refreshes and switching chores; the final flap grants the existing two ingredients once, removes the parcel, and names the ingredients received. Existing claimed/unclaimed saves migrate without changing ingredient caps. The pantry panel returns players to the parcel rather than offering another claim button. Small labels follow actual projected object positions, hide in the editor/panels, and successful work celebrates at the object. Picking now respects the nearest visible physical surface, including opaque scenery, and ignores hidden descendants, faded wall faces and visual-only progress/halo meshes.

Upkeep has two bounded daily jobs and a maximum of 60 coins. Cleaning accepts measured strokes through the shrinking spill; stationary holding, off-target movement and impossible jumps earn no new work. The clock consumes at most 150 ms of residual movement credit. Delivery steps are ordered. Work pauses across release, reload, editing, trips, hidden tabs and connection gaps. Stroke samples use the existing 750 ms checkpoint; start, release and parcel actions persist immediately. Home/offline income is unchanged; this is not a claim that long-term upkeep depth or balance is finished.

Guest saves and furnishings remain in the existing namespace; new gesture fields migrate paused. Browser review used a separate loopback origin for fresh-spill testing without resetting the user's diner. Physical drags completed a spill once (+30); three scene targets opened a delivery (+30); a direct fryer click selected the fryer and its editor returned through Done. Truck practice stayed manual, and Escape did not resume a paused shift. Reviewed at 390×844 portrait and 1280×720 desktop. These are viewport/input checks, not physical-phone certification or owner approval of the art direction.

Follow-up browser review at 1100×850 and 390×844 confirmed a daily parcel's tape progress survived refresh, its two flaps completed through direct clicks, the claimed parcel disappeared and Beef/Bun each reached 1 in the recipe binder. A phone-viewport delivery completed through three physical clicks and showed the in-world +30 reward once. Added checks cover nine daily-parcel/adapter groups, eight real Three.js raycast groups and 11,520 sampled animation frames. The existing 340-case art and 1,200-state floor-support checks still pass; repository-wide TypeScript also passed. These checks do not certify balance, launch readiness or subjective visual approval.

## Open the preview

Use the existing server on port 3010 if it is running. To start an isolated development server from the repository root:

```powershell
$env:DK_PREVIEW_DIST = '.dk-preview/diner-next'
node --preserve-symlinks --preserve-symlinks-main node_modules/next/dist/bin/next dev -p 3010
```

The route is available in development. Outside development it returns not found unless `DINER_PREVIEW_ENABLED=true`. Its metadata prevents indexing. Enabling the page does not enable online saves: those require the separate server gate and provisioning described in the server document.

## Save and ownership boundaries

- Guest progress uses `street_eats_preview_v1`. Online sessions, pending gameplay inputs and pending social actions have their own `diner_preview_*` browser keys.
- Nothing reads, imports, converts or overwrites the old Domain Kitchen saves. Existing player wealth, old truck progress and legacy wallet state are not moved into this preview. A public migration policy has not been decided.
- Guest checkpoints resume active cooking and challenges paused. Invalid guest checkpoints are retained as recovery backups where browser storage permits; they are not silently treated as earned online progress.
- Online diners start from fresh server state. The browser sends intentions with an idempotency UUID and expected revision, never a replacement balance, reward total or service result. The server replays cooking, roadside challenges and rally ticks against bounded server-time credit.
- A lost response retries the same saved UUID. Revision conflicts, interrupted clocks and storage failures stop speculative play or reconcile to the saved state. A read-only cached canonical state can be shown during a failed connection; it is not uploaded as progress.
- Token rewards, wallet claims and financial payouts are absent. The weekly rally awards a cosmetic record only.

## Implemented play

| Area | Current behavior |
| --- | --- |
| Opening trip | First two service days teach actual burger/fries preparation without patience loss. Orders alternate burger and fries. The third service supplies the scripted setback. The introductory home fryer is granted once. |
| Manual cooking | One held item; ingredient pickup; explicit recipe steps; manual holds and unattended timed work; burn risk; cooling; targeted table/seat delivery. Cold food earns base price without tips or combo. Dirty plates retain exact meal IDs. |
| Outdoor service | Starter interior is literally 4×3 with a connected ramp and 7×4 pavement. Singles use independent seats at a two-seat table. Families of three or four reserve a complete four-seat table. Clearing a plate leaves the seat unavailable until that same plate is washed. |
| Failure and practice | Three accumulated strikes end an ordinary trip; cosy mode allows five and reduces patience pressure and earnings. Closing stops arrivals and drains the remaining guests. Practice uses owned tools and grants no trip rewards or tutorial gift. |
| Truck growth | Tiers are 4×3, 5×3, 6×3 and 7×4, supporting 1/2/3/5 outdoor tables and 0/1/1/2 helpers. Route completion plus recipe discovery opens larger trucks. Setup changes, station working sides, table rotations, menu and cosmetics persist. |
| Helpers | Assigned crew keep a fixed washer, runner or prep role. Tier four supports two different crew members. Helpers walk the real grid, carry existing objects and perform bounded jobs; they do not create dishes or award money. |
| Routes | Downtown, Boardwalk and Night Market each generate twelve-row branching maps. Ordinary paths contain seven service rows and five other stops. A chosen rain detour can intentionally skip a stop without rewards. Existing preview maps retain their stored generation version. |
| Roadside events | Festival changes the next service to busy with double tips; rain offers a detour or impatient service; inspection requires three timed cleaning holds; tyre repair uses a timing challenge or haul payment; a rival offers a harder service and recipe scrap; a film crew brings influencers; a lost tourist introduces a named recruit. |
| Road rewards | Customer payments enter carried haul once. Purchases and discoveries survive failure; half of unbanked haul is lost. Qualified trips receive the bounded daily ingredient even if their roadside gift choices were coins. |
| Weekly rally | A separate fixed-seed service gives everyone the same tier-two truck, three dishes at level zero, equipment and no helpers. Normal ownership does not change its loadout. The server-derived best weekly score and completion badge persist; its service earnings do not enter the player's purse. |
| Home restaurant | Real chefs, waiters, customers, stations, table seats, food and dirty plates run through shared navigation. The visible world and authoritative rate measurement use the same home simulation/configuration. Missing or unreachable recipe stations and missing staff reduce or prevent output. |
| Home progression | Dishes have stable ownership and levels 0–10. Course slots, staffing, equipment tiers and room expansion unlock with restaurant levels. Home equipment copies cost banked coins after discovery; the tutorial fryer is the sole free introductory copy. |
| Daily play | Seven ingredient units per UTC day across the crate, market, garden, kindness and qualified trips. Optional home jobs have fixed receipts. A daily staff meal speeds real staff work/movement by 10%. Regular friendship requires measured production of a favourite dish. |
| Personal expression | Furniture arrangement, independent finishes, decorative collections, uniforms, truck wraps/horns, equipment skins, three saved home layouts, regular keepsakes and a postcard surface are present. |
| Social implementation | Opt-in public diners, accepted friendships, blocking, bounded stickers and shared-budget friendship parcels are implemented. The approved diner rules also include consent-based one-for-one ingredient escrow trades at level eight. These server-backed flows still need live staging validation. |

The content catalogue contains 22 diner recipes and 28 ingredients, plus 14 decoration definitions. The art library covers 19 equipment definitions, including reserved future content. `TRUCK_EQUIPMENT` and `HOME_EQUIPMENT` expose only equipment with implemented behavior in the relevant mode. Serving trays, queue benches, jukeboxes, neon signs and tip jars are deferred from new purchases and upgrades. A heat-lamp pass is usable in manual truck service, not sold as a working home fixture. Existing owned IDs remain preserved.

Dottie's discoverable requirement is a **placed daisy pot and ice-cream sundae on the menu**, followed by actual sundae output for friendship. It does not depend on the deferred queue bench. Ordinary two-seat tables are owned from the start and additional home copies can be bought.

## Implementation map

| Source | Responsibility |
| --- | --- |
| `src/lib/chef/diner/content.ts`, `types.ts`, `geometry.ts` | Versioned content, serializable contracts, rotated footprints/fronts, unified truck/pavement paths and setup validation |
| `src/lib/chef/diner/service.ts` | Deterministic 20 Hz manual service, helpers, meals, dirty dishes, patience, cooking and checkpoint validation |
| `src/lib/chef/diner/home-simulation.ts` | Visible automatic restaurant and headless measurement of the same physical service loop |
| `src/lib/chef/diner/progression.ts`, `collections.ts` | Fresh namespace, maps, ownership, menus, daily receipts, home progression, regulars and cosmetics |
| `src/lib/chef/diner/events.ts`, `rally.ts` | Distinct roadside events, timed challenges and isolated weekly equal-loadout service |
| `src/lib/chef/diner/authority.ts`, `server.ts`, `social.ts`, `social-server.ts` | Server replay, clock credit, canonical persistence and social transactions |
| `src/app/chef/diner-preview` | UI, input, original 3D models, scene adapters, guest checkpoints and durable client writers |
| `src/app/api/chef/diner` | Separate status, account, state, command, public-room and social endpoints |

Keep balance changes in the shared content/progression configuration and test both guest prediction and server replay. Do not add payouts through UI-only handlers. The physics/render layer must consume actual simulated actors and items rather than inventing activity for appearance.

## Evidence and reproducible checks

The focused suites cover 18 service groups, 8 home groups, 22 progression groups, 10 event/rally groups, 10 authority groups, 14 gameplay-sync groups, 9 social groups, 5 social-writer groups, 12 direct-home-work groups and 6 grounding groups. These are deterministic local checks, not a live database or device certification. The check runner transpiles TypeScript; a separate type/build check is still necessary.

Notable measured evidence:

- A bot using actual cooking inputs completed the untouched eight-customer burger/fries service deterministically: eight paid meals, seven washed plates, 215 haul coins and 160.6 simulated seconds.
- All 22 recipes execute their real ordered station chains. Rotated working sides and tables survive setup/reload. Two assigned helpers physically deliver and wash a tracked meal without duplicate work.
- An automated returning-player fixture completed every route through legal connected map choices and actual cooking/washing: Downtown 108 meals/100 washes/23.6 minutes; Boardwalk 104/96/22.9; Night Market 110/102/24.0. Each traversed seven services and five stops. Fixtures used tier-two tools, a deliberately compact legal table arrangement, one-dish menus and preceding-route ownership; service results were not injected. This establishes completion, not first-time-player pacing.
- A serial unupgraded bot reached Downtown's finale but failed there. Layout and preparation decisions matter; this observation is not a claim that the current difficulty curve is ready for novices.
- A real rally service completed with the fixed loadout and no permanent monetary reward. Its clock and event timing reject unearned elapsed ticks and pause after a connection gap.
- Save/protocol checks cover duplicate/lost responses, the same UUID through retry, second-device conflicts, storage failure, session expiry, canonical fallback and event/rally clock boundaries. Social tests exercise escrow and shared caps with fake I/O and the real reducer, plus static SQL checks.
- The art check builds actual Three.js geometry without WebGL and verifies distinct plated food, intermediate states, bounds, contact/rotation assumptions, poses and resource-cache stability. Its current gate covers 340 geometry/pose cases. See the art specification for the exact visual/device limits.

From the repository root, run all focused behavior checks:

```powershell
$dinerChecks = @(
  'scripts/dk-diner-service-check.mts',
  'scripts/dk-diner-home-check.mts',
  'scripts/dk-diner-home-task-check.mts',
  'scripts/dk-diner-parcel-check.mts',
  'scripts/dk-diner-progression-check.mts',
  'scripts/dk-diner-events-check.mts',
  'scripts/dk-diner-authority-check.mts',
  'scripts/dk-diner-sync-check.mts',
  'scripts/dk-diner-social-check.mts',
  'scripts/dk-diner-social-sync-check.mts'
)
foreach ($dinerCheck in $dinerChecks) {
  node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs $dinerCheck
  if ($LASTEXITCODE -ne 0) { throw "Failed: $dinerCheck" }
}
node scripts/dk-diner-art-check.mjs
node scripts/dk-diner-home-ground-check.mjs
node scripts/dk-diner-acting-check.mjs
node scripts/dk-diner-picking-check.mjs
node --preserve-symlinks --preserve-symlinks-main scripts/dk-check-runner.cjs scripts/dk-diner-balance.mts
```

Repository-wide type and production-build gates are separate from those local suites:

The local production build completed successfully on 19 September 2026 before version two. Version two passed repository-wide TypeScript and its focused runtime/geometry checks on 20 September; a new production build has not been run for this pass. Existing WalletConnect `pino-pretty` and Browserslist warnings were nonfatal; unrelated dynamic-route static-generation notices also appeared. The earlier legacy restaurant harness, save check and art check passed.

Browser review covered the 390×844 portrait layout, fully framed catalog objects, actual crate → grill → prep → outdoor-table delivery, failure return, introduction-fryer placement, automatic home fries availability, editor Done, and paused service restoration. The tested burger reached a customer as cold food and correctly earned base price. This was an interaction check, not a novice-speed evaluation. The complete washing cycle is covered by the deterministic service tests; the timed browser practice ended before that wash finished. One starter desktop observation reached 60 FPS; expanded-room and physical-phone performance remain unmeasured.

```powershell
node --preserve-symlinks --preserve-symlinks-main node_modules/typescript/lib/tsc.js --noEmit --incremental false
$env:DK_PREVIEW_DIST = '.dk-preview/diner-build'
node --preserve-symlinks --preserve-symlinks-main node_modules/next/dist/bin/next build
```

Run builds separately from the development output directory. A successful build does not provision the database, enable the preview in production or deploy a domain.

## Current balance: measured, not final

`dk-diner-balance.mts` measures explicit burger-room fixtures. The starter has one two-seat table, one chef, one waiter, tier-one stations and a level-zero burger. It receives 60 customers/hour and measures **60 paid plates, 1,500 coins and 120 reputation per online hour**. An eight-hour offline till uses 60% output: **7,200 coins and 576 reputation**. Two fully collected tills yield 14,400 coins before truck haul or optional jobs. These are capacity/configuration samples, not guaranteed earnings for every layout.

| Sample | Burger level | Tables / chefs / waiters | Coins/hour | Reputation/hour | One full offline till |
| --- | ---: | --- | ---: | ---: | ---: |
| Restaurant level 1 | 0 | 1 / 1 / 1 | 1,500 | 120 | 7,200 |
| Restaurant level 5 | 1 | 2 / 2 / 2 | 1,960 | 140 | 9,408 |
| Restaurant level 10 | 3 | 2 / 2 / 2 | 2,805 | 170 | 13,464 |
| Restaurant level 20 | 6 | 3 / 3 / 3 | 4,620 | 231 | 22,176 |

Reputation thresholds were multiplied by twelve after increasing the visible baseline to 60 arrivals/hour. Cumulative thresholds begin **0, 240, 720, 1,680, 3,120** for restaurant levels 1–5; level 12 is 35,040 and level 20 is 148,800. The first expansion requires level five and 25,000 coins; later expansions require levels 12/20 and 60,000/150,000 coins. At the unchanged starter rate, level two represents two credited online hours or three hours twenty minutes offline; rates subsequently change with progression.

Ingredient progression has a separate pace: all dishes at level ten require **630 ingredient units**. At seven or five units/day that is a theoretical minimum of 90 or 126 days, before recipe discovery, uneven pantry stock and missed sources. Trading redistributes existing stock and does not mint more; its effect on rare concentration needs playtesting.

Practical tuning questions for the next private playtest:

1. Test a novice's first serve, first complete learning day and recovery after the scripted setback. Target a clear first cooking success within roughly three minutes of active instruction and a meaningful home placement in the first session; do not count idle reading as failure pressure.
2. Compare full expeditions with the intended 40–60-minute session range. The optimized one-dish fixtures finish in roughly 23–24 minutes; a novice/mixed menu will differ. Measure before raising quotas globally.
3. Resolve the cash target explicitly. The current two-till starter sample is 14,400/day, materially above the bible's initial 2,000/day illustration. Decide the intended active/offline income ratio and price progression together. Do not obscure the difference with hidden home dish prices.
4. Track time to a second table, first paid machine copy, first expansion and each route unlock over real seven-day play. For reference, current starter-tier home copies are 960 coins for a two-seat table, 1,920 for a fryer and 2,160 for a grill. Compare cash gates against the reputation gates rather than tuning one in isolation.
5. Track ingredient surplus/starvation, daily source completion and mastery over several weeks. The intended four-to-five-month collection horizon is unproven; the arithmetic minimum alone cannot establish it.

## Remaining public-release work

- **Staging persistence and identity:** the new database/auth/social migrations have not been applied during implementation. Review and apply `20260920_diner_preview.sql` and `20260921_diner_preview_social.sql` in staging, configure anonymous sign-in and verified email upgrades, and test real transactional concurrency, permissions, recovery and delivery. See the server document for exact gates.
- **Connected social verification:** run actual two-account requests, accept/remove/block, public visits, stickers, parcels and trades against the staged database. Exercise uncertain responses and both participants' revisions. Consent, privacy, abuse controls, moderation/reporting, deletion and checkpoint retention need operational review.
- **Novice and physical-phone validation:** local browser review and responsive viewport checks do not replace first-time-player testing or a midrange physical phone. Record populated maximum-room/truck performance, input accuracy, memory/GPU behavior, long-session context loss, accessibility and portrait/landscape use. Target smooth 60 FPS desktop and sustained 30 FPS on the chosen phone; do not mark these targets achieved from one starter-scene frame counter.
- **Live balance and telemetry:** instrument tutorial completion, abandoned services, dish selection, helpers, progression, daily source use, save conflicts, command latency and repeated failures. The measured economy above remains provisional.
- **Content expansion:** the first release is the complete diner cuisine across three routes. Second cuisines, seasonal collections/events, additional working equipment and long-term event rotation follow tested demand. Reserved asset definitions are not shipped gameplay promises.
- **Release ownership:** domain setup/deployment for `domainkitchen.xyz`, backups/rollback, public account policy and any future legacy migration require a separate release decision. Fractionalized domain-token rewards remain parked and would require a distinct design and authority review.

Preserve the current preview namespace and its original checkpoints while iterating. Approve a live release only after its staged account flows, device evidence and balance targets are concrete and reviewable.

## Catalogue, cookbook and pantry pass (20 September 2026)

The furnishing catalogue now has large, fully framed equipment/decor previews, owned/storage counts, direct buy-and-place, and floor/wall swatches. Cancelling placement keeps the purchased copy in storage. The modal keyboard loop includes the equipment-discovery disclosure. These are presentations of existing ownership and commands; prices and progression have not changed in this pass.

The cookbook concentrates on one owned dish at a time, with current earnings, the exact next-level earnings, ingredient quantities, and the upgrade action together. The pantry uses 28 original ingredient illustrations, readable daily offers and explicit unavailable states. The ingredient parcel remains a physical object to unpack at home. Market and garden controls respect the existing shared daily ingredient limit.

Selected truck equipment and tables have a compact read-only contents card. Its food art, processing time, burn warning, patience and plate cleanup states come from the live service state. It does not perform actions or add another menu. Thumbnail framing uses projected model bounds and keys food stage, temperature, equipment tier and colour independently.

Live browser review covered 390×844 portrait and 1280×720 desktop: illustrated pantry and ingredient names, initial cookbook upgrade visibility, equipment/table status without covering camera buttons, and furniture purchase → cancel → stored copy → placement. An isolated guest save unpacked its parcel and upgraded the burger from level zero to one: beef and bun each changed from one to zero, serving price changed from 25 to 28, and another upgrade became unavailable. Choosing the mint wall swatch changed the rendered room. The original user's save was not used for these purchase/upgrade tests. Scoped diner TypeScript and the 340-case art integrity gate passed. This is viewport and interaction evidence, not a physical-phone performance certification or a new production build.

## Playable scene polish (20 September 2026)

The home camera now fits actual room/terrace bounds rather than applying the former portrait crop. Transient actors, chores and parcel changes cannot shift its framing. Portrait and desktop use distinct starting angles to show the interior; the truck retains its cab-aware view. Faces, greetings, chairs and table finishes were revised while preserving character contacts and actual picking surfaces.

Recipe mastery now changes served food as well as earnings: level three adds signature plating, and level ten adds golden house plating. The same art appears in the cookbook, on worktops, in carried orders and at customer seats. Service rendering uses the active run's recipe levels, including fixed event levels. Processing feedback is driven by the actual food/job state, including steam, bubbles, readiness and burnt-food smoke. No new rewards, save resets, prices or simulation timing were introduced in this pass.

The focused camera, cooking-effect and mastery-art suites passed, alongside scoped diner TypeScript and existing art/acting/picking/grounding checks. Phone review confirmed direct selection of the cookbook object at its visible position and the upgrade action remaining in view. The development-only `/chef/diner-preview/art` route provides a model comparison bench. Production build/deployment and populated physical-device performance remain separate release checks.

## Preview push preparation (20 September 2026)

The standalone diner release contains the new diner UI, engine, APIs, checks and review migrations. Older Kitchen iterations and unrelated Model Kombat working files remain outside this commit. Thumbnail loading prioritizes the selected dish, yields between GPU readbacks and keeps matching earlier plating visible during a mastery change. Nine thumbnail lifecycle checks pass; phone review confirmed the main burger preview appearing while smaller previews continue loading, then switching cleanly to fries.

All twenty focused diner scripts passed. The isolated build caught a dependency on an uncommitted legacy sound module, so the diner now owns its audio module and its sound toggle silences both music and effects. Five additional audio regression groups cover muting, recovery and cleanup. The production candidate is built from the staged source snapshot, with `DINER_PREVIEW_ENABLED=true` and `DINER_PREVIEW_SERVER_ENABLED=false`. The guest browser-save route is `/chef/diner-preview`; enabling database accounts remains a separate operational step described in `street-eats-preview-server.md`.

The isolated production build completed with exit code zero, including lint/type validation and page generation. A local production server rendered the diner, opened the catalog and editor, and returned home through Done with no browser console warnings/errors observed. Its status endpoint reported online accounts and token rewards disabled, and the development art bench was generated as 404. Existing WalletConnect `pino-pretty` and Browserslist warnings remained nonfatal. This verifies the deployable guest preview, not database provisioning or a physical-phone performance target.
