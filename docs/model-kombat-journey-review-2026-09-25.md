# Workshop journey — implementation and release review

Date: 25 September 2026. Status: implemented behind `BOTS_WORKSHOP_JOURNEY=1`; local review, not a production release.

## What is implemented

| Journey | Implementation |
| --- | --- |
| Meet and build | Exact T1 examples; selected welcome style carries into a legal seven-part, 250-coin draft. All choices remain editable. Name, paint, build step and selected slot persist. Finish reveals the saved robot. |
| Clear actions | Existing shell and lower navigation retained. Paged shop/builder grids, expandable part numbers, bounded customization controls and visible save/finish actions. |
| Learn parts | Sequential examples use the actual engine, same opponent/seed and automatic Special policy. Overall comparisons use combat aggregation; no demonstration rewards. |
| First fight | Separately versioned training starts Special ready and delays the opponent's first preparation for five seconds. Actual simulation decides the result. First completion consumes a normal rewarded entry; repeats do not. No repairs or ordinary win/loss increments. |
| Garage | Shared renderer, five stands, small selection/return motions, safe cosmetic poses and stand-level model-load fallbacks. |
| Understand results | Recorded-event facts, replay seeks, one continuous 20-second highlight (full fight when shorter), suggestions and immutable public replay links. Event metadata adds attribution without changing ordinary damage calculations. |
| Next robot | Independent seven-part plan, individually allocated spare copies, remaining cost, shipment availability, unrewarded practice and copying into a draft without spending. |
| Personalization | Nine palettes, per-part paint, mirror, whole-robot application, undo/reset, name, lighting, earned emblems/titles, safe poses and locally stored cropped banners. |
| Career | Server-settled milestones and persistent robot summaries; referenced replay packets survive the 30-fight recent-history limit. Removable cosmetic marks are bounded to five. |
| Return and save | Server guest sessions, validated wallet claim, preserved separate garages, shared daily allowance, server-persisted garage preference, serialized mutations and request IDs retained across retries. Graphics and music preferences persist. |

No paid generation, new body shapes, ordinary combat rebalance, ranked changes, trading rewards, shared accounting changes, Doma Reporter changes or production deployment were performed.

## Storage and release prerequisites

1. Review and apply `scripts/sql/bots-workshop-v8.sql` if not already present.
2. Review and apply the additive `scripts/sql/bots-workshop-journey.sql`. The new code requires its `active_garage` column and `mk8_select_garage` function as well as its guest/claim/settlement functions.
3. Configure the existing game server credentials and wallet authentication. Enable `BOTS_WORKSHOP_JOURNEY=1` only after migration checks and the review gates below.
4. Include the generated `public/bots-playtest` runtime, its replay archives, `server-assets/bots8`, runtime modules under `src/lib/bots/workshop8`, and both music files. Next.js does not depend on the excluded `art-src` directory.
5. The user alone releases with `vercel --prod`. A Git push is not a live release. Neither a push nor a deployment was performed in this task.

Existing wallet inventories are copied lazily once under lock. Linking does not import unverifiable local balances or results. Earlier browser saves remain separate and downloadable; only validated T1 starter choices can be copied into an empty new garage. Missing storage/migrations surface an error rather than creating fallback progression.

## Checks performed

### Automated, isolated from live accounts

- `workshop-journey-sql-check.cjs`: actual PostgreSQL-compatible migration execution using an ephemeral PGlite database; one enrollment, stale revisions, duplicate requests, single training reward, sixth-fight bonus/shared daily cap, independent garage inventories, atomic claim/retry, revoked access, enrollment limits and RLS.
- The SQL suite also checks exact legacy-wallet migration once and rollback of the entire settlement when public-replay insertion fails.
- `journey-http-check.cjs`: real local Next API requests, cookie attributes, cross-origin mutation denial, simultaneous duplicate requests, stale writes, rejection of client-supplied results, garage isolation, claim/cookie rotation cross-site cookie-bootstrap denial, and garage selection visible from another authenticated session. Test credentials are dummy local credentials.
- `workshop-authority-check.cjs`: TypeScript compilation without asset-authoring source; actual canonical-geometry simulation, accepted Special input, training opening, no training repairs/ordinary records, individual spare allocation, earned cosmetic validation, paint/replay isolation, retained career packets, invalid/oversized banner rejection and recorded milestone examples.
- Historical fixture unchanged: 795 ticks, winner 0, 37 events. Version-2 event metadata stripped from the new event stream matches the older event stream exactly.
- `workshop-music-check.cjs`: gesture playback, both tracks, no unnecessary restarts, mute/volume, hidden/resume, blocked and missing-file retries, disposal and asset presence.
- Full isolated Next.js production builds passed. The initial sandboxed attempt could not fetch Google Fonts; rerunning with network access succeeded. Existing optional `pino-pretty` warnings and dynamic-route static-render notices were non-fatal.
- Renderer rebuild performs strict TypeScript checks and verifies 436 source asset receipts. Historical renderer packages are archived rather than overwritten.

### Actual browser interaction

Used the Codex in-app browser against `http://127.0.0.1:3173`, backed by an empty local database, not production Supabase.

- Selected Speed in the welcome screen; the builder received its exact 250-coin preset.
- Named the robot **Indigo Rocket**, applied Hunter paint and reloaded. Name and assembly-review step returned correctly.
- Finished the robot once; balance became zero; the saved robot appeared in the reveal.
- Completed a live training loss after activating Special: 75 coins, Ring Ready, no repair, zero ordinary house wins/losses.
- Earlier local run verified repeated training awarded zero additional coins.
- Reviewed the continuous highlight, Community training ticket, career record, independent emblem selection and equipment-safe pose selection.
- Uploaded an existing game PNG locally, decoded/cropped it, saved the banner and saved the appearance. Public replay serialization excludes banner IDs/images.
- Actual item example: changing Speed's body to the selected Ranged body showed body health 142.8 → 170, speed 3.08 → 3.03 and plating 0.08 → 0.10, with the changed Special identified.
- Inspected desktop 1280×720, phone-sized 390×844 and short-landscape 844×390 layouts. This covers representative builder, shop, customization, training/result, garage, Community and progress states; it is not an exhaustive device matrix.

### Performance evidence and limits

Development host: Intel Core i5-11300H @ 3.10 GHz, Windows, desktop in-app browser. GPU identification was not captured.

During the phone-sized 390×844 training run, Auto selected Low graphics. The rolling 600-frame sample reported median 16.7 ms and p95 16.8 ms (approximately 60 FPS), 341 geometries and 59 textures. This is desktop hardware at a phone viewport, **not physical-phone performance**. A separate 1280×720 Standard-mode training run with the animated Starship arena reported median 16.7 ms and p95 16.8 ms over 600 frames, 362 geometries and 63 textures. Neither sample proves all-device targets or long-session stability.

## Gates still open before enabling production

- Human review of the complete first session and uninterrupted return visits. Interactive previews and screenshots exist; a complete recorded browser walkthrough has not been delivered. Do not describe this visual gate as passed.
- Five first-time testers and the four-of-five understanding criterion; timed first-rewarded-fight target.
- Physical-phone testing and measured 30 FPS target; broader desktop scenarios and repeated-session resource measurements.
- Real wallet signature/linking and cross-device restoration against the deployed environment. The isolated API test does not substitute for a real wallet test.
- Review/application of the game-only migration to the intended database. No live migration has been applied here.
- Exhaustive loss-of-network, session-expiry, partial asset failure, all paint/banner formats and keyboard/reduced-motion combinations across the requested layouts.

The local SQL fixture is deliberately ephemeral. Restarting it resets only its test garages; it does not touch real player saves. The preview and build workspace is `D:\Temp\modelkombat-launch-work`; dependency directories remain outside Next.js output/cache directories.
