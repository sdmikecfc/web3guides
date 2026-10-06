# Domain Kitchen redesign: implementation and release checklist

This is the current implementation guide for the September 2026 restaurant
redesign. It supersedes older descriptions that tie automatic game-coin income
to wallet dials, describe the recipe book as four renamed tracks, or treat a
sanitized browser snapshot as proof of earned connected progress. Historical
ADRs and economic experiments remain historical records; token incentives and
domain eligibility policy are not decided by this redesign.

## Current design

Keep the existing deterministic Pixi restaurant simulation and routing. Its
presentation uses an original illustrated neighborhood, a named storefront,
consistent furniture and character rigs, and independent plated recipe art.
Restaurant, Decorate, Cookbook, Friends, and Shop are the main navigation.
The editable artwork specification is in
`public/chef-art/source-v2/README.md`; use its v2 bakers rather than overwriting
assets with historical scripts.

Decorating supports persistent Done/Cancel, undo/redo, storage, four-way facing,
rotated furniture footprints, partitions, finishes, individual tile painting,
and an awning. Chair/table service and crew access remain layout requirements.
Recipe IDs, mastery, and ownership survive changes to room style and selected
domain. Amenities have bounded category contributions; repeating one ornament
does not produce an unlimited comfort bonus.

Offline settlement uses room capacity, walking paths, staffing, active menu
mastery, and recoverable condition. Working crews spend some capacity on upkeep.
Cleaning and repairs recover current performance while owned content remains.
The numbers are versioned gameplay defaults, not promised financial returns.

## Practice and connected progression

| Mode | Persistence and rewards | Availability |
| --- | --- | --- |
| Practice | Browser-local restaurant and simulation rewards | Available without a wallet |
| Existing cloud mode | Legacy sanitized cloud snapshots | Retained while the authority flag is disabled |
| Command authority | Server-validated purchases, upgrades, menu, layout, daily/service rewards, repairs, and social actions | Requires the new SQL migration and enabled build flag |

`NEXT_PUBLIC_DK_AUTHORITY_ENABLED` defaults to false and must be the same on the
server and rebuilt browser client. Disabled authority is not a security upgrade
for existing legacy cloud saves: that path still accepts sanitized snapshots.
Never present legacy scores as newly verified progress. When authority is enabled,
the raw-write route rejects even an unmigrated client, and the database also
protects already converted accounts from obsolete clients.

New authoritative restaurants start from server-issued starter contents. Existing
stored restaurants are snapshotted and migrated, including currency, furnishings,
recipes, and cosmetics. Their verified service history starts at zero. A browser
practice save cannot be uploaded as proof of earned connected progress.

The connected neighborhood supports requests, acceptance, removal, blocking,
visits, fixed gifts, and helping. Gift and discovery ingredients share one daily
recipient budget and per-partner limits. Adding more wallets cannot exceed that
recipient budget. There is no pantry transfer or trading endpoint.

New token-gated furniture needs a server-issued eligibility grant. This code does
not interpret old LP dials as evidence or decide future eligibility economics.
The public beginner page at `src/app/domain-kitchen/page.tsx` now leads with
restaurant ownership and states the connected-feature rollout explicitly; it
does not promise that buying a token produces restaurant income or a cash return.

## Initial integration validation

- The local authority suite passed 17 groups: playable initialization, legacy
  retention without verified history, short/overnight/capped settlement, clock
  rollback and replay, invalid service layouts, path efficiency, active-menu
  mastery, ownership conservation, forged appearance payloads, daily offers,
  recipes, rare service rewards, lessons, repairs, friendships, and recipient caps.
- The command-client suite passed five scenarios against the real hook transport:
  a lost response reuses the command ID, a manual retry confirms a pending purchase,
  a stale layout stops for review, an uncertain editor save survives reload and
  confirms its original command before unlocking, and sign-out cancels queued writes.
- The full repository TypeScript check passed, followed by a successful Next.js
  production build covering all 225 generated pages. Existing wallet dependency
  warnings remain for optional MetaMask async storage and `pino-pretty`.
- The combined deterministic harness, v7 save checks, building/cookbook checks,
  authority suite, command-client suite, and art checks passed. The harness ran
  126,000 ticks; the art payload is 3.30 MB across seven collections and 29 atlases.
- Live browser review covered 390×844 and 503×920 portrait layouts plus a
  1280×800 desktop viewport. Verified furniture purchase, storage, explicit
  rotated placement, Done, reload retention, floor undo/redo/Cancel, cookbook
  ingredient spending, daily preparation, Escape/focus return, public visiting,
  camera controls, and return to the owned restaurant. No social messages or
  cheers were sent to real players.
- The desktop starter scene reported 60 FPS in the development preview. This
  is an instantaneous starter-scene observation, not an expanded-room or physical
  midrange-phone performance qualification.

The optional database integration suite has **not** run: no disposable local
Supabase/PostgreSQL instance was available. No production database mutation,
migration, deployment, or flag activation was performed. A successful pure test
does not establish deployed RPC behavior, production latency, or a phone FPS target.
Expanded-room review, authenticated two-device integration, and measured physical
device performance remain separate release gates.

## Structural art correction after player review

The initial interaction checks did not establish an acceptable art finish. Player
review caught detached chair backs, a mismatched storefront perspective, and an
inspection scene that did not expose restrooms clearly. Treat the original
production recommendation as premature.

- Chair, bench, table, and counter components now share projected dimensional
  geometry; seats, legs, rails, and backrests meet at their actual endpoints.
- Restrooms now have porcelain tanks, connected bowls and pedestals, and separate
  front/rear artwork for normal and broken states. The renderer preserves the
  placed collection and facing while applying damage artwork.
- Seated characters have bent legs and shoes, hips registered to the actual
  cushion height, and appropriate overlap behind rear-facing chair backs. The
  sitting/eating atlas poses are reviewed together with their furniture.
- The storefront has supporting wall piers, an open doorway, a mounted nameboard,
  and a fabric awning. Structure and lettering use the same 2:1 projection as the
  restaurant. Sconces sit behind the canopy and cannot cast glow through it.
- The local development route `/chef/art-review` uses the real Pixi renderer,
  exposes all collections and room sizes, and keeps both restrooms visible. It
  has no save or authentication operations and returns 404 in production.
- Fixture validation covers 84 playable collection/size/direction combinations
  and 1,120 sprite selections, including normal/broken rear toilet views.
- Shared storefront geometry and the actual furniture PNGs were inspected in
  static review sheets at enlarged and normal game scales. These sheets are
  supplementary evidence, not browser captures.

The local game and inspection routes compile and respond with HTTP 200. The
Domain Kitchen TypeScript scope and art contract checks pass. The current full
repository TypeScript check stops on an unrelated `ArrayIterator` target error
in `src/app/bots/_view/v7-toy.ts`; that file is outside this repair.

Live visual inspection was initially blocked by browser kernel initialization.
During the next player-feedback pass, browser access recovered. The live Pixi
room was then reviewed on desktop and at 390×844, including both wall paintings,
front/rear restroom condition, and an expanded room. Broken toilets now have a
tipped cistern lid, a stream, a broad blue puddle, and a readable repair marker.
Paintings attach to their actual wall plane, including previews and corner
placement. The wall attachment/picking suite covers all 71 wall sections across
the three room sizes; input callback and UI checks cover automatic wall fitting.
The Domain Kitchen TypeScript scope and art gate pass (3.49 MB boot artwork).

This targeted review does not establish the remaining release gates below.
No deployment or database change was performed during the art repair.

## A furnished foundation

New restaurants now open with two tables, four chairs, a simple kitchen, and
two working restrooms in the back-right corner. Two joined, narrow partition
bays separate the bathrooms. Six sage floor tiles and three matching wall
sections define the nook; the rest stays neutral and open for decorating.
Partitions use the same slim geometry across all seven collections.

The shared `starterLayout` and `starterDesign` helpers serve fresh game and
authority bootstraps and the default art-review scene. Existing layouts,
including intentionally empty restaurants, keep their saved furniture and
finishes. Count-only legacy saves retain the original starter footprint.
Expanding an existing restaurant does not relocate its bathrooms or furniture.

`/chef/art-review` now opens with the composed starter and working bathrooms.
The separate Fixture inspection scene retains exposed furniture, all four
directions, and broken-state comparisons. The initial phone camera fits the
whole floor so the outer bathroom is visible. Live review covered the starter
on desktop and at 390×844, an expanded bistro, and switching back to the
diagnostic scene. `scripts/dk-starter-check.mts` covers all 21 collection/room
combinations, reachable bathroom interactions, service, independent defaults,
and preservation of customized legacy and authoritative saves.

The new default also exposed an old decorating edge case: furniture could be
committed onto a staff member, and departing guests could retain a route through
the edited furniture. Committed edits now move covered actors to reachable
floor and refresh exit routes. Interrupted routes return to their tile center
before turning. Editor repositioning does not advance walking animation; normal
simulation ticks retain their movement and collision checks.

## Release checklist

- [x] Run the deterministic harness, save, building, authority, command-client,
  and art suites with `scripts/dk-check-runner.cjs`; run the final TypeScript check.
- [ ] Review a starter and an expanded mixed-collection room on desktop and
  portrait layouts: navigation, cookware and food readability, touch placement,
  Done/Cancel, undo/redo, four rotations, visit, and repair feedback.
- [ ] Measure populated-room performance against 60 FPS desktop and 30 FPS on a
  representative midrange phone. Record the device and scenario, not just FPS.
- [ ] Apply `supabase/migrations/20260913_domain_kitchen_authority.sql` in a
  disposable database and run `scripts/dk-authority-db-check.mts`. It refuses
  remote hosts and never loads production credentials from `.env.local`.
- [ ] Use the similarly guarded `scripts/dk-board-check.mts` only with explicit
  local database credentials and a local app URL. Its configuration-refusal suite
  is `scripts/dk-db-test-guard-check.mts`; fixture collisions are refused, and
  cleanup is limited to fixture keys proved absent before the test started.
- [ ] In staging, verify atomic duplicate/revision checks, two-device purchases,
  bilateral gifts, recipient caps, daily rollover, token expiry, ambiguous public
  handles, uncertain network recovery, and read-only visitor privacy.
- [ ] Migrate representative legacy saves and compare furniture, recipes,
  cosmetics, and snapshots; confirm obsolete clients cannot overwrite them.
- [ ] Review campaign scoring and domain eligibility as their own economic
  workstream before using redesigned service scores in financial campaigns.
- [ ] Enable the authority flag for a staged build only after the migration;
  monitor command latency, 409/503 responses, replay attempts, and onboarding.
- [ ] Preserve legacy snapshots and a rollback-capable command client. Turning
  off the flag alone does not remove the migrated-row database write guard.

The API contract and operational rollback details are in
`docs/domain-kitchen-authority-rollout.md`. Recipe art, financial eligibility,
production migration, and measured device performance should each be signed off
on their actual evidence; none is implied by a passing TypeScript build.
