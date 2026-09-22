# Guided styles: onboarding and shop verification

## Scope and versioning

The styled first build starts with the body, then the head, left arm, right arm, left leg, right leg and weapon. Tank, Speed and Ranged guidance changes the order of suggestions only. It never changes a selected part. All seven starter pieces cost 250 coins; each starter item's three stats are a permutation of 2, 1 and 0. The body explains its current special and the Tier 3 upgrade. The final screen explains permanent parts before **Finish robot**.

Transactional onboarding stays version 2. Its separate `catalogueVersion: 2` identifies the styled starter cards; absent catalogue metadata means catalogue 1. Existing browser saves and older drafts retain their original choices and catalogue. The frozen version-1 shipment is unchanged. New client enrollment uses `NEXT_PUBLIC_BOTS_STYLES_V1=1`; server enrollment also requires `BOTS_STYLES_V1=1` and the reviewed additive migration. This UI work does not apply a live migration or enable production enrollment.

New assemblies can use a styled body with older owned parts. A draft without a body can be saved. A legacy body with styled limbs or weapons cannot be saved as a finished robot; the UI explains which body is needed. Finished assemblies keep their parts. Practice URLs contain the selected robot's actual canonical build and appearance, not a preset replacement. Signed-in styled robots use the dedicated house-fight session route. Player fights remain on the existing rules until a later update.

## Shop behavior

The version-2 daily shipment contains 16 real catalogue items: six Tier 1 body pieces (two per style), three Tier 1 weapons, one Tier 2 item per style, one Tier 3 item per style and one Tier 4 feature. The deterministic rotation includes all 63 regular style cards, including paired blades. Listing IDs use the separate `s2:` namespace.

The compact grid has part-type, colour, style and sort controls below the shelves; the legacy shop retains its maker filter. Each item opens a focus-managed native dialog with its art, price, stats, strength, weakness, special information and a real fight-preview link. The delivery calendar opens separately. Closing an item preserves shelf position and filters.

Comparison selects the robot and left/right limb independently. Valid styled builds use the version-5 combat aggregation, including fractional contributions from separate limbs and no colour or family bonuses. Legacy builds retain their existing combat aggregation. An incompatible legacy-body/styled-part comparison displays the body requirement instead of claiming valid projected fight totals. Finished-robot comparisons explain that they help plan another robot; buying adds a spare part.

## Verification results

- `scripts/bots-styles-ui-check.ts`: seven passing integration groups. Covers all 15 differentiated starters; the 250-coin allowance; all three styles; exact part stats; final-weapon choice preservation; Finish retry and permanent parts; partial wallet handoff metadata; old-save hydration; corrupted local coin/stat claims; 105 deterministic shipments; all 63 regular cards; matching fight aggregation; left/right comparisons; special upgrades; mixed older spares; and incompatible-assembly rejection without inventory or coin changes.
- `scripts/bots-shop-comparison-check.ts`: 183 existing comparison checks pass, including legacy family/colour bonuses, paired old builds and immutable inventories.
- Existing `scripts/bots-onboarding-v2-check.ts`: eight isolated PGlite groups passed during this implementation. No live database was used.
- Full repository TypeScript check passed with `tsc --noEmit --incremental false --pretty false` after integration.
- Isolated Chromium desktop at 1280×720 and phone viewport at 390×844: fresh splash, optional guidance, seven mixed selections, explicit Finish, saved exact robot, practice link, shop filter, popup and Escape return were exercised. All 16 desktop daily items and at least nine complete phone tiles fit. Every desktop item image reported ready. No horizontal phone overflow or page errors were reported in the completed run.

The repeatable local UI harness is `C:/Users/Mike/Documents/Codex/2026-09-07/i-b/verify-styles-ui.cjs`. Results and screenshots are in `C:/Users/Mike/Documents/Codex/2026-09-07/i-b/outputs/styles-ui-review/`: `checks.json`, `starter-desktop.png`, `starter-mobile.png`, `assembled-desktop.png`, `assembled-mobile.png`, `shop-desktop.png`, `shop-mobile.png` and `shop-inspector-mobile.png`. The harness uses a fresh isolated browser context and suppresses development hot-reload messages so unrelated concurrent source edits cannot reset the UI under test.

## Limits

These checks exercise the local preview and mocked or isolated data paths. They do not prove a live wallet purchase, deployed migration, real-device phone performance or 60/30 FPS. The phone builder keeps all guidance, stats and choices visible by giving the whole-robot preview a compact area; the individual-part popup is larger. The renderer and live fight checks are documented by their separate owners.
